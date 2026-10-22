// -----------------------------------------------------------------------------
// The monitor: reads the HamQSL feed every `refresh_interval` minutes (60 by
// default, as N0NBH asks), publishes the states of the device, fires the scene
// triggers and serves the widget and the actions.
//
// Triggers, compared with the previous reading (kept under /data):
//   - band_good          a band group becomes Good, by day or by night, from
//                        Poor or Fair (not from an unknown value);
//   - geomagnetic_storm  the K index reaches 4 or more and exceeds the peak of
//                        the current episode; the episode ends when K drops
//                        below 4. A storm climbing from K 5 to K 7 fires twice,
//                        K 6 → 5 → 6 once;
//   - solar_flare        the X-ray class rises to M or X (C → M, M → X).
// The first reading ever, or after the file is lost, is the starting point:
// it fires nothing.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours (the feed often keeps a value for hours).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { bandKey, buildDevice, deviceIds } from './device.js';
import { BANDS, CONDITIONS, PERIODS, VHF, XRAY_CLASSES, fetchFeed } from './hamqsl.js';
import {
  CONDITION_NAMES,
  PERIOD_NAMES,
  PHRASES,
  STATUS,
  formatDate,
  geomagName,
  indices,
  render,
} from './messages.js';

const logger = createLogger({ name: 'hamqsl' });

export const WIDGET_KEY = 'bands';
export const TRIGGERS = {
  BAND_GOOD: 'band_good',
  STORM: 'geomagnetic_storm',
  FLARE: 'solar_flare',
};

// K index from which the field is "active" (NOAA), and storms (G1 = K 5).
export const K_ACTIVE = 4;
export const K_STORM = 5;
const FLARE_RANK = XRAY_CLASSES.indexOf('M');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MIN_READ_GAP_MS = 30 * MINUTE;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // N0NBH updates hourly: a feed older than this is said in the status.
  staleAfterMs: 6 * HOUR,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** "G0" (active, K 4) to "G5" (K 9): the NOAA storm scale. */
export const gScale = (k) => `G${clamp(Math.floor(k) - K_STORM + 1, 0, 5)}`;

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = normalizeConfig({});
    // False until Gladys accepted the discovered device: tried again at every cycle.
    this.discovered = false;
    this.data = emptyData();
    // The feed of the last successful reading.
    this.feed = null;
    this.lastSuccessAt = null;
    this.lastCycleAt = -Infinity;
    this.statusKey = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.signature = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1) {
      this.data = { ...emptyData(), ...saved };
    }
    // The timer first: a Gladys refusing the discovery at its own start must
    // not leave the integration without readings.
    this.schedule();
    await this.publishDiscovered();
    logger.info(`Started: HamQSL feed read every ${config.refreshMinutes} min`);
    this.runCycle();
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    await this.publishDiscovered();
    this.statusKey = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    await this.running;
    const languageChanged = config.language !== this.config?.language;
    const intervalChanged = config.refreshMinutes !== this.config?.refreshMinutes;
    this.config = config;
    logger.info('Configuration saved');
    if (languageChanged) {
      // Names of features not created yet, and the texts of the states.
      await this.publishDiscovered();
      await this.publishStates();
      this.requestRefresh();
    }
    if (intervalChanged) {
      this.schedule();
    }
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  async publishDiscovered() {
    try {
      await this.gladys.publishDiscoveredDevices([buildDevice(this.gladys, this.config.language)]);
      this.discovered = true;
      this.recovered('discovery', 'The device is published again');
    } catch (err) {
      this.failed('discovery', 'warn', `Publishing the device failed: ${err.message}`);
    }
  }

  isCreated() {
    const id = deviceIds(this.gladys).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  // --- Cycles ------------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    if (!this.discovered) {
      await this.publishDiscovered();
    }
    let feed;
    try {
      feed = await fetchFeed(this.fetch);
      this.recovered('feed', 'The HamQSL feed answers again');
    } catch (err) {
      this.failed('feed', 'warn', `HamQSL feed unreachable: ${err.message}`);
      await this.updateConnectionStatus();
      return;
    }
    logger.debug(
      `Refresh cycle: feed of ${feed.updatedText ?? 'unknown date'}, SFI ${feed.solarFlux}, K ${feed.kIndex}`,
    );
    this.feed = feed;
    this.lastSuccessAt = this.now();
    await this.detectChanges(feed);
    this.recovered('cycle', 'Refresh cycles work again');
    await this.publishStates();
    await this.updateConnectionStatus();
    const signature = JSON.stringify(this.statesOf());
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  /** Compare with the previous reading, fire the scene triggers, remember. */
  async detectChanges(feed) {
    const data = this.data;
    const seed = !data.seeded;
    const fired = [];

    for (const band of BANDS) {
      for (const period of PERIODS) {
        const current = feed.bands[band.key][period];
        if (current === null) {
          continue; // "No Report": the previous value stays the reference
        }
        const previous = data.bands[band.key]?.[period] ?? null;
        if (current === 'good' && previous !== null && previous !== 'good') {
          fired.push({ key: TRIGGERS.BAND_GOOD, band, period, previous });
        }
        data.bands[band.key] = { ...data.bands[band.key], [period]: current };
      }
    }

    if (feed.kIndex !== null) {
      if (feed.kIndex < K_ACTIVE) {
        data.kPeak = 0;
      } else if (data.kPeak !== null && feed.kIndex > data.kPeak) {
        fired.push({ key: TRIGGERS.STORM });
        data.kPeak = feed.kIndex;
      } else if (data.kPeak === null) {
        data.kPeak = feed.kIndex;
      }
    }

    if (feed.xray) {
      const rank = XRAY_CLASSES.indexOf(feed.xray.class);
      if (rank >= FLARE_RANK && data.xrayRank !== null && rank > data.xrayRank) {
        fired.push({ key: TRIGGERS.FLARE });
      }
      data.xrayRank = rank;
    }

    data.seeded = true;
    this.store.save(data);
    if (seed) {
      logger.debug('First reading: taken as the starting point, no trigger fired');
      return;
    }
    for (const change of fired) {
      await this.fire(change, feed);
    }
  }

  async fire(change, feed) {
    const data = this.eventData(change, feed);
    if (change.key === TRIGGERS.BAND_GOOD) {
      logger.debug(`Band ${change.band.name} good by ${change.period}`);
    } else {
      // Rare, and what a ham wants to see in the logs.
      logger.info(
        change.key === TRIGGERS.STORM
          ? `Geomagnetic activity: K index ${feed.kIndex}`
          : `Solar flare: X-ray class ${feed.xray.text}`,
      );
    }
    try {
      await this.gladys.publishSceneEvent(change.key, data);
      this.recovered('scene', 'Scene triggers work again');
    } catch (err) {
      this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
    }
  }

  /** The flat data of a scene event (fields, then variables of the manifest). */
  eventData(change, feed) {
    const language = this.config.language;
    const phrases = PHRASES[language];
    if (change.key === TRIGGERS.BAND_GOOD) {
      const { band, period, previous } = change;
      return {
        band: band.key,
        period,
        band_name: band.name,
        period_name: PERIOD_NAMES[language][period],
        previous,
        previous_name: CONDITION_NAMES[language][previous],
        solar_flux: feed.solarFlux,
        k_index: feed.kIndex,
        summary: phrases.bandGood({
          band: band.name,
          night: period === 'night',
          indices: indices(feed, language, { xray: false }),
        }),
      };
    }
    if (change.key === TRIGGERS.STORM) {
      const a = feed.aIndex === null ? '' : ` (A ${feed.aIndex})`;
      const k = feed.kIndex;
      return {
        k_index: k,
        a_index: feed.aIndex,
        g_scale: gScale(k),
        geomag_field: geomagName(feed.geomagField, language),
        summary:
          k >= K_STORM ? phrases.storm({ scale: gScale(k), k, a }) : phrases.active({ k, a }),
      };
    }
    return {
      xray_class: feed.xray.class,
      xray: feed.xray.text,
      summary: phrases.flare({ xray: feed.xray.text }),
    };
  }

  // --- States ------------------------------------------------------------------

  /** The states of the last successful reading; a value N0NBH lacks is left out. */
  statesOf() {
    const feed = this.feed;
    if (feed === null) {
      return [];
    }
    const ids = deviceIds(this.gladys);
    const language = this.config.language;
    const states = [];
    const number = (key, value, min, max) => {
      if (value !== null) {
        states.push({
          device_feature_external_id: ids.feature(key),
          state: clamp(Math.round(value), min, max),
        });
      }
    };
    const text = (key, value) => {
      if (value) {
        states.push({ device_feature_external_id: ids.feature(key), text: value });
      }
    };
    number('solar_flux', feed.solarFlux, 0, 1000);
    number('sunspots', feed.sunspots, 0, 1000);
    number('k_index', feed.kIndex, 0, 9);
    number('a_index', feed.aIndex, 0, 400);
    text('xray', feed.xray?.text);
    number('solar_wind', feed.solarWind, 0, 3000);
    number('bz', feed.bz, -100, 100);
    for (const period of PERIODS) {
      for (const band of BANDS) {
        const condition = feed.bands[band.key][period];
        if (condition !== null) {
          states.push({
            device_feature_external_id: ids.feature(bandKey(band.key, period)),
            state: CONDITIONS.indexOf(condition),
          });
        }
      }
    }
    text('signal_noise', feed.signalNoise);
    text('geomag_field', geomagName(feed.geomagField, language));
    for (const entry of VHF) {
      const value = feed.vhf[entry.key];
      if (value !== null) {
        states.push({
          device_feature_external_id: ids.feature(entry.key),
          state: value.open ? 1 : 0,
        });
      }
    }
    text(
      'updated',
      feed.updatedAt === null ? feed.updatedText : formatDate(feed.updatedAt, language),
    );
    // -0 (a Bz of -0.4 rounded) is published as 0.
    return states.map((state) => (Object.is(state.state, -0) ? { ...state, state: 0 } : state));
  }

  async publishStates() {
    if (!this.isCreated()) {
      return;
    }
    const states = this.statesOf();
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    let message;
    if (this.failing.has('feed')) {
      message = render(STATUS, this.feed === null ? 'noValue' : 'feedDown');
    } else if (
      this.feed?.updatedAt != null &&
      this.now() - this.feed.updatedAt > this.timings.staleAfterMs
    ) {
      message = render(STATUS, 'stale', {
        hours: Math.floor((this.now() - this.feed.updatedAt) / HOUR),
      });
    }
    const connected = !this.failing.has('feed') && this.lastSuccessAt !== null;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusKey) {
      return;
    }
    this.statusKey = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  /** "Update" in the Discover tab: the SDK forgot the states, published again. */
  async onDeviceUpdated(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    await this.publishStates();
    this.requestRefresh();
  }

  async onDeviceCreated(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    if (this.lastSuccessAt === null) {
      await this.runCycle();
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    // Read again only if the last cycle is older than half the interval, and
    // never within the 30 minutes N0NBH asks for.
    const gap = Math.max((this.config.refreshMinutes * MINUTE) / 2, MIN_READ_GAP_MS);
    if (this.now() - this.lastCycleAt >= gap) {
      await this.runCycle();
    } else {
      await this.publishStates();
    }
  }

  /** The feed, read again if the last cycle is older than one interval. */
  async fresh() {
    if (this.now() - this.lastCycleAt >= this.config.refreshMinutes * MINUTE) {
      await this.runCycle();
    } else {
      await this.running;
    }
    return this.feed;
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

function emptyData() {
  return { version: 1, seeded: false, bands: {}, kPeak: null, xrayRank: null };
}
