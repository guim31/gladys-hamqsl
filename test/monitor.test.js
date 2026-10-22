// -----------------------------------------------------------------------------
// The monitor: the states of the device, the scene triggers and what fires
// them, the container's own timer (should_poll is false), the persistence of
// the trigger references under /data, and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gScale } from '../src/monitor.js';
import {
  STORM,
  create,
  createApi,
  createClock,
  createWorld,
  cycle,
  valueOf,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('the device is published without polling, its states at the creation', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.equal(device.name, 'Propagation HF (HamQSL)');
  assert.equal(w.fake.states.length, 0, 'nothing before the device exists');
  await create(w);
  assert.equal(valueOf(w, 'solar_flux'), 115);
  assert.equal(valueOf(w, 'sunspots'), 66);
  assert.equal(valueOf(w, 'k_index'), 2);
  assert.equal(valueOf(w, 'a_index'), 19);
  assert.equal(valueOf(w, 'xray'), 'B6.3');
  assert.equal(valueOf(w, 'solar_wind'), 515);
  assert.equal(valueOf(w, 'bz'), -3);
  assert.equal(valueOf(w, 'band_30m_20m_day'), 2);
  assert.equal(valueOf(w, 'band_80m_40m_day'), 1);
  assert.equal(valueOf(w, 'band_12m_10m_night'), 0);
  assert.equal(valueOf(w, 'signal_noise'), 'S1-S2');
  assert.equal(valueOf(w, 'geomag_field'), 'Calme');
  assert.equal(valueOf(w, 'vhf_aurora'), 0);
  assert.equal(valueOf(w, 'updated'), '22/10/2026 07:42');
  assert.equal(w.fake.states.length, 23, 'one state per feature');
  assert.ok(w.fake.widgetRefreshes.includes('bands'));
});

test('the storm feed: values clamped, "No Report" left out, open VHF', async (t) => {
  const w = await world(t, { api: createApi(STORM), config: { language: 'en' } });
  await create(w);
  assert.equal(valueOf(w, 'k_index'), 9);
  assert.equal(valueOf(w, 'a_index'), 207);
  assert.equal(valueOf(w, 'bz'), -45);
  assert.equal(valueOf(w, 'xray'), 'X1.2');
  assert.equal(valueOf(w, 'geomag_field'), 'Major storm');
  assert.equal(valueOf(w, 'signal_noise'), 'S9+');
  assert.equal(valueOf(w, 'vhf_aurora'), 1);
  assert.equal(valueOf(w, 'es_europe_6m'), 1);
  for (const key of ['solar_flux', 'sunspots', 'band_17m_15m_day', 'es_north_america_2m']) {
    assert.equal(valueOf(w, key), undefined, key);
  }
});

test('only the changes are published', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  await create(w);
  const before = w.fake.states.length;
  await cycle(w);
  assert.equal(w.fake.states.length, before, 'same feed, nothing sent');
  api.set('solarflux', '120');
  await cycle(w);
  assert.equal(w.fake.states.length, before + 1);
  assert.equal(valueOf(w, 'solar_flux'), 120);
});

test('the first reading fires nothing, a band becoming Good fires band_good', async (t) => {
  const api = createApi();
  api.band('17m-15m', 'day', 'Good');
  const w = await world(t, { api });
  assert.deepEqual(w.fake.sceneEvents, [], 'the starting point is not news');
  api.band('80m-40m', 'day', 'Good'); // Fair → Good
  api.band('12m-10m', 'day', 'Fair'); // Poor → Fair: not a trigger
  await cycle(w);
  assert.deepEqual(events(w, 'band_good'), [
    {
      key: 'band_good',
      data: {
        band: '80m_40m',
        period: 'day',
        band_name: '80-40 m',
        period_name: 'Jour',
        previous: 'fair',
        previous_name: 'Moyenne',
        solar_flux: 115,
        k_index: 2,
        summary: 'Bande 80-40 m bonne de jour (SFI 115, K 2, A 19)',
      },
    },
  ]);
  await cycle(w);
  assert.equal(events(w, 'band_good').length, 1, 'still Good: no new event');
});

test('a "No Report" band keeps its reference: back to Good, nothing fires', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  api.band('30m-20m', 'night', 'No Report');
  await cycle(w);
  api.band('30m-20m', 'night', 'Good');
  await cycle(w);
  assert.deepEqual(events(w, 'band_good'), []);
});

test('geomagnetic storm: fired at K 4 and above, once per new peak of the episode', async (t) => {
  const api = createApi();
  const w = await world(t, { api, config: { language: 'en' } });
  const k = async (value, a = 30) => {
    api.set('kindex', ` ${value}`);
    api.set('aindex', ` ${a}`);
    await cycle(w, 180);
  };
  await k(3);
  await k(5, 48);
  await k(7, 111);
  await k(6);
  await k(7); // same episode, not higher
  await k(2);
  await k(4);
  const storms = events(w, 'geomagnetic_storm').map((event) => event.data);
  assert.deepEqual(
    storms.map((data) => [data.k_index, data.g_scale]),
    [
      [5, 'G1'],
      [7, 'G3'],
      [4, 'G0'],
    ],
  );
  assert.deepEqual(storms[1], {
    k_index: 7,
    a_index: 111,
    g_scale: 'G3',
    geomag_field: 'Quiet',
    summary: 'Geomagnetic storm G3: K index 7 (A 111)',
  });
  assert.equal(storms[2].summary, 'Active geomagnetic field: K index 4 (A 30)');
  assert.deepEqual([3, 4, 5, 9, 12].map(gScale), ['G0', 'G0', 'G1', 'G5', 'G5']);
});

test('solar flare: fired when the class rises to M or X', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  for (const xray of [
    'C2.0',
    'M1.4',
    'M8.0',
    'X2.1',
    'M3.0',
    'C1.0',
    'M1.1',
    'No Report',
    'X1.0',
  ]) {
    api.set('xray', xray);
    await cycle(w);
  }
  assert.deepEqual(
    events(w, 'solar_flare').map((event) => event.data),
    [
      { xray_class: 'M', xray: 'M1.4', summary: 'Éruption solaire : rayons X de classe M1.4' },
      { xray_class: 'X', xray: 'X2.1', summary: 'Éruption solaire : rayons X de classe X2.1' },
      { xray_class: 'M', xray: 'M1.1', summary: 'Éruption solaire : rayons X de classe M1.1' },
      { xray_class: 'X', xray: 'X1.0', summary: 'Éruption solaire : rayons X de classe X1.0' },
    ],
  );
});

test('the references survive a restart: what changed meanwhile fires, nothing else', async (t) => {
  const api = createApi();
  const first = await createWorld({ api });
  await first.app.stop();
  const saved = JSON.parse(await readFile(join(first.dataDir, 'hamqsl.json'), 'utf8'));
  assert.equal(saved.seeded, true);
  assert.equal(saved.bands['80m_40m'].day, 'fair');

  const again = await world(t, { api, dataDir: first.dataDir });
  assert.deepEqual(again.fake.sceneEvents, [], 'same feed after the restart');
  await again.app.stop();

  api.band('80m-40m', 'day', 'Good');
  const later = await world(t, { api, dataDir: first.dataDir });
  assert.deepEqual(
    later.fake.sceneEvents.map((event) => event.key),
    ['band_good'],
  );
});

test("the container's timer reads the feed every interval, without onPoll", async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const api = createApi();
  const clock = createClock();
  const w = await world(t, { api, clock, timers: true, config: { refresh_interval: '30' } });
  assert.equal(api.requests.length, 1);
  clock.advance(30 * 60 * 1000);
  t.mock.timers.tick(30 * 60 * 1000);
  await w.monitor.running;
  assert.equal(api.requests.length, 2);
  t.mock.timers.tick(29 * 60 * 1000);
  assert.equal(api.requests.length, 2);
});

test('onPoll fallback: read again only after half the interval', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const device = await create(w);
  const requests = api.requests.length;
  w.clock.advance(10 * 60 * 1000);
  await w.monitor.poll(device);
  assert.equal(api.requests.length, requests);
  w.clock.advance(25 * 60 * 1000);
  await w.monitor.poll(device);
  assert.equal(api.requests.length, requests + 1);
});

test('connection status: down, back, and a feed not updated for hours', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const status = () => w.fake.connectionStatus;
  assert.equal(status().connected, true);
  api.down = 503;
  await cycle(w);
  assert.equal(status().connected, false);
  assert.match(status().message.fr, /injoignable/);
  assert.equal(valueOf(w, 'solar_flux'), undefined);
  api.down = false;
  await cycle(w);
  assert.equal(status().connected, true);
  assert.equal(status().message, undefined);
  await cycle(w, 6 * 60);
  assert.equal(status().connected, true);
  assert.equal(status().message.en, 'The HamQSL feed has not been updated for 8 h.');
});

test('a new language republishes the device names and the translated texts', async (t) => {
  const w = await world(t);
  await create(w);
  await w.fake.configUpdated({ language: 'de' });
  assert.equal(w.fake.discoveredDevices.at(-1).name, 'KW-Ausbreitung (HamQSL)');
  assert.equal(valueOf(w, 'geomag_field'), 'Ruhig');
});

test('a discovery refused at the start is tried again, and the timer runs anyway', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const api = createApi();
  const clock = createClock();
  const w = await createWorld({ api, clock, timers: true, connect: false });
  t.after(() => w.app.stop());
  const publish = t.mock.method(w.gladys, 'publishDiscoveredDevices', async () => {
    throw new Error('HTTP 503');
  });
  await w.gladys.connect();
  await w.app.ready;
  await w.monitor.running;
  assert.equal(w.monitor.discovered, false);
  publish.mock.restore();
  clock.advance(60 * 60 * 1000);
  t.mock.timers.tick(60 * 60 * 1000);
  await w.monitor.running;
  assert.equal(api.requests.length, 2, 'the timer kept reading');
  assert.equal(w.monitor.discovered, true);
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('"Update" in the Discover tab publishes the states again', async (t) => {
  const w = await world(t);
  const device = await create(w);
  const before = w.fake.states.length;
  await w.fake.deviceUpdated(device);
  assert.equal(w.fake.states.length, before + 23);
});

test('the onPoll fallback never reads within 30 minutes, whatever the interval', async (t) => {
  const api = createApi();
  const w = await world(t, { api, config: { refresh_interval: '30' } });
  const device = await create(w);
  const requests = api.requests.length;
  w.clock.advance(20 * 60 * 1000);
  await w.monitor.poll(device);
  assert.equal(api.requests.length, requests);
});
