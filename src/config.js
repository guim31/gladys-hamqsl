// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two readings. N0NBH updates the feed about once an hour and
// asks not to read it more often than every 30 to 60 minutes.
export const REFRESH_INTERVALS = ['30', '60', '120', '180'];

export const DEFAULT_CONFIG = {
  refresh_interval: '60',
  language: 'fr',
};

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const interval = REFRESH_INTERVALS.includes(String(source.refresh_interval))
    ? source.refresh_interval
    : DEFAULT_CONFIG.refresh_interval;
  return {
    refreshMinutes: Number(interval),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
