// -----------------------------------------------------------------------------
// The HamQSL client: the recorded feed, the storm one with its "No Report"
// values and missing tags, the dates and X-ray classes, and the errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_URL,
  USER_AGENT,
  fetchFeed,
  parseFeed,
  parseUpdated,
  parseXray,
} from '../src/hamqsl.js';
import { REAL, STORM, createApi } from './helpers/world.js';

test('the recorded feed is read whole', () => {
  const feed = parseFeed(REAL);
  assert.equal(feed.updatedAt, Date.parse('2026-10-22T05:42:00Z'));
  assert.equal(feed.solarFlux, 115);
  assert.equal(feed.sunspots, 66);
  assert.equal(feed.aIndex, 19);
  assert.equal(feed.kIndex, 2);
  assert.deepEqual(feed.xray, { text: 'B6.3', class: 'B' });
  assert.equal(feed.solarWind, 514.8);
  assert.equal(feed.bz, -3.1);
  assert.equal(feed.signalNoise, 'S1-S2');
  assert.equal(feed.geomagField, 'QUIET');
  assert.deepEqual(feed.bands, {
    '80m_40m': { day: 'fair', night: 'good' },
    '30m_20m': { day: 'good', night: 'good' },
    '17m_15m': { day: 'fair', night: 'fair' },
    '12m_10m': { day: 'poor', night: 'poor' },
  });
  assert.deepEqual(
    Object.values(feed.vhf).map((value) => value.open),
    [false, false, false, false, false],
  );
});

test('the storm feed: K 9, X class, "No Report" and missing tags become null', () => {
  const feed = parseFeed(STORM);
  assert.equal(feed.kIndex, 9);
  assert.equal(feed.aIndex, 207);
  assert.deepEqual(feed.xray, { text: 'X1.2', class: 'X' });
  assert.equal(feed.solarFlux, null, 'No Report');
  assert.equal(feed.sunspots, null, 'missing tag');
  assert.equal(feed.bz, -44.6);
  assert.equal(feed.bands['17m_15m'].day, null);
  assert.deepEqual(feed.vhf.vhf_aurora, { open: true, text: 'High LAT AUR' });
  assert.deepEqual(feed.vhf.es_europe_6m, { open: true, text: '50MHz ES' });
  assert.equal(feed.vhf.es_north_america_2m, null);
});

test('a feed with no value at all is still a feed', () => {
  const feed = parseFeed('<solar><solardata><updated>soon</updated></solardata></solar>');
  assert.equal(feed.updatedAt, null);
  assert.equal(feed.updatedText, 'soon');
  assert.equal(feed.kIndex, null);
  assert.equal(feed.xray, null);
  assert.deepEqual(feed.bands['80m_40m'], { day: null, night: null });
});

test('the dates and X-ray classes of N0NBH', () => {
  assert.equal(parseUpdated(' 01 Jan 2027 0005 GMT'), Date.parse('2027-01-01T00:05:00Z'));
  assert.equal(parseUpdated('1 Mar 2027 2359 GMT'), Date.parse('2027-03-01T23:59:00Z'));
  assert.equal(parseUpdated('22 Foo 2026 0542 GMT'), null);
  assert.equal(parseUpdated('22 Oct 2026 2542 GMT'), null);
  assert.equal(parseUpdated(null), null);
  assert.deepEqual(parseXray('m2.1'), { text: 'M2.1', class: 'M' });
  assert.deepEqual(parseXray('X10'), { text: 'X10', class: 'X' });
  assert.equal(parseXray('No Report'), null);
  assert.equal(parseXray('Z1.0'), null);
});

test('the feed is asked with an identifiable User-Agent, without any secret', async () => {
  const api = createApi();
  await fetchFeed(api.fetch);
  assert.equal(api.requests[0].url, FEED_URL);
  assert.equal(api.requests[0].headers['User-Agent'], USER_AGENT);
  assert.match(USER_AGENT, /github\.com\/guim31\/gladys-hamqsl/);
});

test('errors: HTTP status, network, an answer that is not the feed', async () => {
  const api = createApi();
  api.down = 503;
  await assert.rejects(fetchFeed(api.fetch), /www\.hamqsl\.com: HTTP 503/);
  api.down = 'network';
  await assert.rejects(fetchFeed(api.fetch), /www\.hamqsl\.com: fetch failed/);
  api.down = false;
  api.xml = '<html>Maintenance</html>';
  await assert.rejects(fetchFeed(api.fetch), /not the HamQSL feed/);
  const timeout = async () => {
    throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
  };
  await assert.rejects(fetchFeed(timeout), /no answer in 30 s/);
});
