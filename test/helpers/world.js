// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake HamQSL serving the
// recorded feed of test/fixtures (editable per test), a manual clock, a
// temporary /data, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/hamqsl/${name}`, import.meta.url), 'utf8');

export const REAL = fixture('solar-2026-10-22.xml');
export const STORM = fixture('storm.xml');

// The real feed was updated on 22/10/2026 at 05:42 UTC.
export const START = Date.parse('2026-10-22T06:00:00Z');

/** Replace the text of a tag of the feed (the first one matching). */
export function setTag(xml, name, value) {
  return xml.replace(new RegExp(`(<${name}>)[^<]*(</${name}>)`), `$1${value}$2`);
}

/** Replace the condition of a band group ('80m-40m', 'day', 'Good'). */
export function setBand(xml, band, time, value) {
  return xml.replace(
    new RegExp(`(<band name="${band}" time="${time}">)[^<]*(</band>)`),
    `$1${value}$2`,
  );
}

/**
 * Fake HamQSL. `api.xml` is the served document; `api.down`: 'network'
 * (connection refused), a status (503) or false.
 */
export function createApi(xml = REAL) {
  const api = {
    xml,
    down: false,
    requests: [],
    set(name, value) {
      api.xml = setTag(api.xml, name, value);
    },
    band(band, time, value) {
      api.xml = setBand(api.xml, band, time, value);
    },
    async fetch(input, init = {}) {
      api.requests.push({ url: String(input), headers: init.headers ?? {} });
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      return { status: 200, text: async () => api.xml };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-hamqsl-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, { store, fetch: api.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** Create the device in Gladys, as the user would. */
export async function create(world) {
  const [device] = world.fake.discoveredDevices;
  await world.fake.deviceCreated(device);
  return device;
}

/** The last published value of a feature, by its key. */
export function valueOf(world, key) {
  const states = world.fake.states.filter((state) =>
    state.device_feature_external_id.endsWith(`:${key}`),
  );
  const last = states.at(-1);
  return last === undefined ? undefined : (last.text ?? last.state);
}

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 60) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
