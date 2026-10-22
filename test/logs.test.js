// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, a storm or a flare, the feed lost and back, a user action),
// never one line per refresh cycle; a failure that repeats at every cycle is
// logged once, plus one line when it is over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLogs, create, createApi, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t);
  assert.deepEqual(lines.map(strip), ['[INFO] [hamqsl] Started: HamQSL feed read every 60 min']);
});

test('normal refresh cycles write nothing at info, a band becoming good included', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  await create(w);
  const lines = captureLogs(t, 'info');
  api.band('80m-40m', 'day', 'Good');
  for (let i = 0; i < 4; i += 1) {
    api.set('solarflux', String(115 + i));
    await cycle(w);
  }
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.deepEqual(lines, []);
});

test('a storm and a flare are one info line each', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const lines = captureLogs(t, 'info');
  api.set('kindex', ' 6');
  api.set('xray', 'M2.5');
  await cycle(w);
  await cycle(w);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [hamqsl] Geomagnetic activity: K index 6',
    '[INFO] [hamqsl] Solar flare: X-ray class M2.5',
  ]);
});

test('LOG_LEVEL=debug shows the cycles', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  await cycle(w);
  assert.ok(
    lines.some((line) =>
      /Refresh cycle: feed of 22 Oct 2026 0542 GMT, SFI 115, K 2/.test(line.text),
    ),
  );
});

test('the feed down at every cycle: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const lines = captureLogs(t, 'info');
  api.down = 503;
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[hamqsl] HamQSL feed unreachable: www.hamqsl.com: HTTP 503']],
  );
  api.down = false;
  await cycle(w);
  assert.deepEqual(lines.slice(1).map(strip), ['[INFO] [hamqsl] The HamQSL feed answers again']);
});

test('states refused at every cycle: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  await create(w);
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(w.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[hamqsl] Publishing the states failed: Gladys unreachable']],
  );
  publish.mock.restore();
  await cycle(w);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});
