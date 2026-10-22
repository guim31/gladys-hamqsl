// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action and
// scene messages, scene variables), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object. German
// says "du", Spanish "usted". Band names (80-40 m), indices (SFI, K, A) and the
// raw values of N0NBH (S1-S2) are not translated.
// -----------------------------------------------------------------------------

import { BANDS, CONDITIONS, PERIODS } from './hamqsl.js';

export const CONDITION_NAMES = {
  en: { poor: 'Poor', fair: 'Fair', good: 'Good' },
  fr: { poor: 'Mauvaise', fair: 'Moyenne', good: 'Bonne' },
  de: { poor: 'Schlecht', fair: 'Mittel', good: 'Gut' },
  es: { poor: 'Mala', fair: 'Regular', good: 'Buena' },
};

export const PERIOD_NAMES = {
  en: { day: 'Day', night: 'Night' },
  fr: { day: 'Jour', night: 'Nuit' },
  de: { day: 'Tag', night: 'Nacht' },
  es: { day: 'Día', night: 'Noche' },
};

// The geomagnetic field as N0NBH writes it (uppercase, abbreviated). A value
// missing here is shown as N0NBH wrote it.
export const GEOMAG_NAMES = {
  en: {
    'VR QUIET': 'Very quiet',
    QUIET: 'Quiet',
    UNSETTLD: 'Unsettled',
    ACTIVE: 'Active',
    'MIN STORM': 'Minor storm',
    'MAJ STORM': 'Major storm',
    'SEV STORM': 'Severe storm',
  },
  fr: {
    'VR QUIET': 'Très calme',
    QUIET: 'Calme',
    UNSETTLD: 'Agité',
    ACTIVE: 'Actif',
    'MIN STORM': 'Orage mineur',
    'MAJ STORM': 'Orage majeur',
    'SEV STORM': 'Orage sévère',
  },
  de: {
    'VR QUIET': 'Sehr ruhig',
    QUIET: 'Ruhig',
    UNSETTLD: 'Unruhig',
    ACTIVE: 'Aktiv',
    'MIN STORM': 'Leichter Sturm',
    'MAJ STORM': 'Starker Sturm',
    'SEV STORM': 'Schwerer Sturm',
  },
  es: {
    'VR QUIET': 'Muy tranquilo',
    QUIET: 'Tranquilo',
    UNSETTLD: 'Inestable',
    ACTIVE: 'Activo',
    'MIN STORM': 'Tormenta menor',
    'MAJ STORM': 'Tormenta mayor',
    'SEV STORM': 'Tormenta severa',
  },
};

const GEOMAG_ALIASES = { UNSETTLED: 'UNSETTLD', 'VERY QUIET': 'VR QUIET' };

/** The geomagnetic field in words, or as N0NBH wrote it. */
export function geomagName(text, language) {
  if (!text) {
    return null;
  }
  const key = text.trim().toUpperCase().replace(/\s+/g, ' ');
  return GEOMAG_NAMES[language][GEOMAG_ALIASES[key] ?? key] ?? text.trim();
}

export const PHRASES = {
  en: {
    xray: 'X-ray',
    and: 'and',
    on: ({ condition, bands }) => `${condition} on ${bands}`,
    period: ({ period, parts }) => `${period}: ${parts}`,
    bulletin: ({ source, body }) => `HF propagation (${source}): ${body}.`,
    noData: 'The HamQSL feed has no value at the moment.',
    bandGood: ({ band, night, indices }) =>
      `${band} band good by ${night ? 'night' : 'day'}${indices ? ` (${indices})` : ''}`,
    storm: ({ scale, k, a }) => `Geomagnetic storm ${scale}: K index ${k}${a}`,
    active: ({ k, a }) => `Active geomagnetic field: K index ${k}${a}`,
    flare: ({ xray }) => `Solar flare: X-ray class ${xray}`,
    goodBands: ({ list }) => `Good: ${list}`,
    noGood: 'No band is good',
    check: ({ indices, good, time }) => `Feed read (${time}): ${indices}. ${good}.`,
  },
  fr: {
    xray: 'rayons X',
    and: 'et',
    on: ({ condition, bands }) => `${condition} sur ${bands}`,
    period: ({ period, parts }) => `${period} : ${parts}`,
    bulletin: ({ source, body }) => `Propagation HF (${source}) : ${body}.`,
    noData: "Le flux HamQSL n'a aucune valeur pour le moment.",
    bandGood: ({ band, night, indices }) =>
      `Bande ${band} bonne de ${night ? 'nuit' : 'jour'}${indices ? ` (${indices})` : ''}`,
    storm: ({ scale, k, a }) => `Orage géomagnétique ${scale} : indice K ${k}${a}`,
    active: ({ k, a }) => `Champ géomagnétique actif : indice K ${k}${a}`,
    flare: ({ xray }) => `Éruption solaire : rayons X de classe ${xray}`,
    goodBands: ({ list }) => `Bonnes : ${list}`,
    noGood: "Aucune bande n'est bonne",
    check: ({ indices, good, time }) => `Flux lu (${time}) : ${indices}. ${good}.`,
  },
  de: {
    xray: 'Röntgen',
    and: 'und',
    on: ({ condition, bands }) => `${condition} auf ${bands}`,
    period: ({ period, parts }) => `${period}: ${parts}`,
    bulletin: ({ source, body }) => `KW-Ausbreitung (${source}): ${body}.`,
    noData: 'Der HamQSL-Feed hat gerade keine Werte.',
    bandGood: ({ band, night, indices }) =>
      `Band ${band} ${night ? 'nachts' : 'tagsüber'} gut${indices ? ` (${indices})` : ''}`,
    storm: ({ scale, k, a }) => `Geomagnetischer Sturm ${scale}: K-Index ${k}${a}`,
    active: ({ k, a }) => `Geomagnetisch aktiv: K-Index ${k}${a}`,
    flare: ({ xray }) => `Sonneneruption: Röntgenklasse ${xray}`,
    goodBands: ({ list }) => `Gut: ${list}`,
    noGood: 'Kein Band ist gut',
    check: ({ indices, good, time }) => `Feed gelesen (${time}): ${indices}. ${good}.`,
  },
  es: {
    xray: 'rayos X',
    and: 'y',
    on: ({ condition, bands }) => `${condition} en ${bands}`,
    period: ({ period, parts }) => `${period}: ${parts}`,
    bulletin: ({ source, body }) => `Propagación HF (${source}): ${body}.`,
    noData: 'El feed de HamQSL no tiene valores por el momento.',
    bandGood: ({ band, night, indices }) =>
      `Banda ${band} buena de ${night ? 'noche' : 'día'}${indices ? ` (${indices})` : ''}`,
    storm: ({ scale, k, a }) => `Tormenta geomagnética ${scale}: índice K ${k}${a}`,
    active: ({ k, a }) => `Campo geomagnético activo: índice K ${k}${a}`,
    flare: ({ xray }) => `Fulguración solar: rayos X de clase ${xray}`,
    goodBands: ({ list }) => `Buenas: ${list}`,
    noGood: 'Ninguna banda es buena',
    check: ({ indices, good, time }) => `Feed leído (${time}): ${indices}. ${good}.`,
  },
};

// Connection status of the Configuration screen, and errors of the actions.
export const STATUS = {
  en: {
    feedDown: 'HamQSL feed unreachable: the last values are kept.',
    stale_read: ({ time }) => `HamQSL feed unreachable: values of the reading of ${time}.`,
    stale: ({ hours }) => `The HamQSL feed has not been updated for ${hours} h.`,
    initFailed: 'Initialization failed: see the logs of the integration.',
    noValue: 'The HamQSL feed could not be read yet.',
  },
  fr: {
    feedDown: 'Flux HamQSL injoignable : les dernières valeurs sont gardées.',
    stale_read: ({ time }) => `Flux HamQSL injoignable : valeurs de la lecture de ${time}.`,
    stale: ({ hours }) => `Le flux HamQSL n'a pas été mis à jour depuis ${hours} h.`,
    initFailed: "Échec de l'initialisation : voir les journaux de l'intégration.",
    noValue: "Le flux HamQSL n'a pas encore pu être lu.",
  },
  de: {
    feedDown: 'HamQSL-Feed nicht erreichbar: die letzten Werte bleiben erhalten.',
    stale_read: ({ time }) => `HamQSL-Feed nicht erreichbar: Werte der Lesung von ${time}.`,
    stale: ({ hours }) => `Der HamQSL-Feed wurde seit ${hours} h nicht aktualisiert.`,
    initFailed: 'Initialisierung fehlgeschlagen: schau in die Protokolle der Integration.',
    noValue: 'Der HamQSL-Feed konnte noch nicht gelesen werden.',
  },
  es: {
    feedDown: 'Feed de HamQSL inaccesible: se conservan los últimos valores.',
    stale_read: ({ time }) => `Feed de HamQSL inaccesible: valores de la lectura de las ${time}.`,
    stale: ({ hours }) => `El feed de HamQSL no se ha actualizado desde hace ${hours} h.`,
    initFailed: 'Error de inicialización: consulte los registros de la integración.',
    noValue: 'El feed de HamQSL aún no se ha podido leer.',
  },
};

/** A STATUS entry in every language, as the multi-language object Gladys takes. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.entries(table).map(([language, entries]) => {
      const entry = entries[key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** "22/10/2026 07:42", in the time zone of Gladys (TZ). */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(LOCALES[language], {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(time));
}

/** "07:42", in the time zone of Gladys (TZ). */
export function formatTime(time, language) {
  return new Intl.DateTimeFormat(LOCALES[language], { timeStyle: 'short' }).format(new Date(time));
}

const formatNumber = (value, language) =>
  new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 1 }).format(value);

/** "a, b and c". */
export function list(items, language) {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} ${PHRASES[language].and} ${items.at(-1)}`;
}

/** "SFI 115, K 2, A 19, X-ray B6.3": the values present only. */
export function indices(data, language, { xray = true } = {}) {
  const parts = [];
  if (data.solarFlux !== null) {
    parts.push(`SFI ${formatNumber(data.solarFlux, language)}`);
  }
  if (data.kIndex !== null) {
    parts.push(`K ${formatNumber(data.kIndex, language)}`);
  }
  if (data.aIndex !== null) {
    parts.push(`A ${formatNumber(data.aIndex, language)}`);
  }
  if (xray && data.xray) {
    parts.push(`${PHRASES[language].xray} ${data.xray.text}`);
  }
  return parts.join(', ');
}

/** "Day: good on 30-20 m, fair on 80-40 m and 17-15 m, poor on 12-10 m", null without data. */
export function periodSentence(data, period, language) {
  const phrases = PHRASES[language];
  const parts = [...CONDITIONS]
    .reverse()
    .map((condition) => {
      const bands = BANDS.filter((band) => data.bands[band.key][period] === condition);
      return bands.length === 0
        ? null
        : phrases.on({
            condition: CONDITION_NAMES[language][condition].toLowerCase(),
            bands: list(
              bands.map((band) => band.name),
              language,
            ),
          });
    })
    .filter(Boolean);
  return parts.length === 0
    ? null
    : phrases.period({ period: PERIOD_NAMES[language][period], parts: parts.join(', ') });
}

/** The bulletin of the scene action: indices, then the bands by day and by night. */
export function bulletin(data, language) {
  const parts = [
    indices(data, language),
    ...PERIODS.map((period) => periodSentence(data, period, language)),
  ].filter(Boolean);
  if (parts.length === 0) {
    return PHRASES[language].noData;
  }
  const source =
    data.updatedAt === null ? 'N0NBH' : `N0NBH, ${formatTime(data.updatedAt, language)}`;
  return PHRASES[language].bulletin({ source, body: parts.join('. ') });
}

/** "30-20 m day, 80-40 m night": the bands that are good now. */
export function goodBands(data, language) {
  const items = [];
  for (const period of PERIODS) {
    for (const band of BANDS) {
      if (data.bands[band.key][period] === 'good') {
        // German nouns keep their capital: "30-20 m Tag".
        const name = PERIOD_NAMES[language][period];
        items.push(`${band.name} ${language === 'de' ? name : name.toLowerCase()}`);
      }
    }
  }
  return items.length === 0
    ? PHRASES[language].noGood
    : PHRASES[language].goodBands({ list: items.join(', ') });
}
