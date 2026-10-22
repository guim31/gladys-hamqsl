// -----------------------------------------------------------------------------
// HamQSL client: the solar and propagation feed of N0NBH (Paul Herrman),
// https://www.hamqsl.com/solarxml.php, public and keyless.
//
// The feed is one small flat XML document (about 2 KB), updated about once an
// hour. N0NBH asks to read it every 30 to 60 minutes at most: the integration
// reads it every hour by default, with a User-Agent that names it.
//
// A value N0NBH does not have reads "No Report", "NoRpt" or nothing at all:
// it becomes null, and no state is published for it (never a false 0).
// No XML library: the document has no nesting worth one, and the regular
// expressions below only read the tags they know.
// -----------------------------------------------------------------------------

export const FEED_URL = 'https://www.hamqsl.com/solarxml.php';
export const SITE_URL = 'https://www.hamqsl.com/solar.html';
export const USER_AGENT =
  'gladys-hamqsl (Gladys Assistant integration; +https://github.com/guim31/gladys-hamqsl)';

// The four HF band groups of the feed, lowest first. `key` is the stable id of
// the features and of the scene trigger field, `name` how hams write it.
export const BANDS = [
  { key: '80m_40m', feed: '80m-40m', name: '80-40 m' },
  { key: '30m_20m', feed: '30m-20m', name: '30-20 m' },
  { key: '17m_15m', feed: '17m-15m', name: '17-15 m' },
  { key: '12m_10m', feed: '12m-10m', name: '12-10 m' },
];
export const PERIODS = ['day', 'night'];

// Band conditions, and the value of their features (0 = Poor, the band is
// practically closed).
export const CONDITIONS = ['poor', 'fair', 'good'];

// VHF phenomena of the feed: `name` and `location` attributes. Sporadic E over
// Europe is given for 2 m (144 MHz, `europe`), 4 m and 6 m.
export const VHF = [
  { key: 'vhf_aurora', name: 'vhf-aurora', location: 'northern_hemi' },
  { key: 'es_europe_6m', name: 'E-Skip', location: 'europe_6m' },
  { key: 'es_europe_4m', name: 'E-Skip', location: 'europe_4m' },
  { key: 'es_europe_2m', name: 'E-Skip', location: 'europe' },
  { key: 'es_north_america_2m', name: 'E-Skip', location: 'north_america' },
];

// X-ray classes, weakest first: each one ten times the previous.
export const XRAY_CLASSES = ['A', 'B', 'C', 'M', 'X'];

export class FeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeedError';
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);

const NO_REPORT = /^(no ?report|no ?rpt|n\/a|-+)$/i;

/** The trimmed text of a tag, null when absent, empty or "No Report". */
function tag(xml, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`).exec(xml);
  if (!match) {
    return null;
  }
  const text = decode(match[1]).trim();
  return text === '' || NO_REPORT.test(text) ? null : text;
}

/** A number of the feed, null when it is not one. */
function number(xml, name) {
  const text = tag(xml, name);
  return text !== null && /^[+-]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** " 22 Oct 2026 0542 GMT" → epoch ms, null otherwise. */
export function parseUpdated(text) {
  const match = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}) (\d{2}):?(\d{2})\s*(?:GMT|UTC|Z)$/i.exec(
    String(text ?? '').trim(),
  );
  if (!match) {
    return null;
  }
  const month = MONTHS.indexOf(match[2].toLowerCase());
  const [day, year, hours, minutes] = [match[1], match[3], match[4], match[5]].map(Number);
  if (month < 0 || hours > 23 || minutes > 59) {
    return null;
  }
  return Date.UTC(year, month, day, hours, minutes);
}

/** "B6.3" → { text: 'B6.3', class: 'B' }; null when it is not an X-ray class. */
export function parseXray(text) {
  const match = /^([ABCMX])(\d+(?:\.\d+)?)$/i.exec(String(text ?? '').trim());
  if (!match) {
    return null;
  }
  const letter = match[1].toUpperCase();
  return { text: `${letter}${match[2]}`, class: letter };
}

const condition = (text) => {
  const value = String(text ?? '')
    .trim()
    .toLowerCase();
  return CONDITIONS.includes(value) ? value : null;
};

/**
 * The feed as a plain object. Throws a FeedError when the text is not the
 * HamQSL feed at all.
 * @param {string} xml
 */
export function parseFeed(xml) {
  const body = /<solardata>([\s\S]*)<\/solardata>/.exec(String(xml ?? ''))?.[1];
  if (body === undefined) {
    throw new FeedError('the answer is not the HamQSL feed');
  }
  const bands = Object.fromEntries(BANDS.map((band) => [band.key, { day: null, night: null }]));
  for (const match of body.matchAll(/<band\s+([^>]*)>([^<]*)<\/band>/g)) {
    const name = /name="([^"]*)"/.exec(match[1])?.[1];
    const time = /time="([^"]*)"/.exec(match[1])?.[1];
    const band = BANDS.find((entry) => entry.feed === name);
    if (band && PERIODS.includes(time)) {
      bands[band.key][time] = condition(match[2]);
    }
  }
  const vhf = Object.fromEntries(VHF.map((entry) => [entry.key, null]));
  for (const match of body.matchAll(/<phenomenon\s+([^>]*)>([^<]*)<\/phenomenon>/g)) {
    const name = /name="([^"]*)"/.exec(match[1])?.[1];
    const location = /location="([^"]*)"/.exec(match[1])?.[1];
    const entry = VHF.find((item) => item.name === name && item.location === location);
    const text = decode(match[2]).trim();
    if (entry && text !== '' && !NO_REPORT.test(text)) {
      // "Band Closed", or what is open: "50MHz ES", "High LAT AUR"…
      vhf[entry.key] = { open: !/closed/i.test(text), text };
    }
  }
  const updatedText = tag(body, 'updated');
  return {
    updatedAt: parseUpdated(updatedText),
    updatedText,
    solarFlux: number(body, 'solarflux'),
    sunspots: number(body, 'sunspots'),
    aIndex: number(body, 'aindex'),
    kIndex: number(body, 'kindex'),
    xray: parseXray(tag(body, 'xray')),
    solarWind: number(body, 'solarwind'),
    bz: number(body, 'magneticfield'),
    signalNoise: tag(body, 'signalnoise'),
    geomagField: tag(body, 'geomagfield'),
    bands,
    vhf,
  };
}

/**
 * GET the feed and parse it.
 * @param {Function} fetchImpl fetch
 */
export async function fetchFeed(fetchImpl, { timeoutMs = 30000 } = {}) {
  let response;
  try {
    response = await fetchImpl(FEED_URL, {
      headers: { Accept: 'application/xml, text/xml', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : err.message;
    throw new FeedError(`www.hamqsl.com: ${reason}`);
  }
  if (response.status !== 200) {
    throw new FeedError(`www.hamqsl.com: HTTP ${response.status}`);
  }
  try {
    return parseFeed(await response.text());
  } catch (err) {
    throw new FeedError(`www.hamqsl.com: ${err.message}`);
  }
}
