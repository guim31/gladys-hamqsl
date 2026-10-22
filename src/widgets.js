// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `bands`, the band table.
//
// Four tiles (SFI, K, A, X-ray class), then one status row per band group and
// period, coloured by its condition (Good green, Fair orange, Poor red), the
// day first. The footer gives the source and the time of the N0NBH update
// (N0NBH asks to be cited), and a link to hamqsl.com.
// Budget: 4 tiles, 1 status (8 rows), 1 text, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { BANDS, PERIODS, SITE_URL } from './hamqsl.js';
import { CONDITION_NAMES, PERIOD_NAMES, formatDate } from './messages.js';
import { WIDGET_KEY } from './monitor.js';

export const TTL_SECONDS = 600;

export const CONDITION_COLORS = {
  good: WIDGET_COLORS.SUCCESS,
  fair: WIDGET_COLORS.WARNING,
  poor: WIDGET_COLORS.DANGER,
};

export const TEXT = {
  waiting: {
    en: 'Waiting for HamQSL…',
    fr: 'En attente de HamQSL…',
    de: 'Warte auf HamQSL…',
    es: 'Esperando a HamQSL…',
  },
  solarFlux: { en: 'Solar flux', fr: 'Flux solaire', de: 'Solarer Flux', es: 'Flujo solar' },
  kIndex: { en: 'K index', fr: 'Indice K', de: 'K-Index', es: 'Índice K' },
  aIndex: { en: 'A index', fr: 'Indice A', de: 'A-Index', es: 'Índice A' },
  xray: { en: 'X-ray', fr: 'Rayons X', de: 'Röntgen', es: 'Rayos X' },
  noReport: { en: 'No report', fr: 'Non publié', de: 'Keine Angabe', es: 'Sin datos' },
  source: {
    en: 'Data: N0NBH, hamqsl.com',
    fr: 'Données : N0NBH, hamqsl.com',
    de: 'Daten: N0NBH, hamqsl.com',
    es: 'Datos: N0NBH, hamqsl.com',
  },
  site: { en: 'HamQSL', fr: 'HamQSL', de: 'HamQSL', es: 'HamQSL' },
};

const t = (text, language) => text[language] ?? text.en;
const tile = (label, value, icon) => ({
  type: 'value',
  label,
  value: value === null || value === undefined ? '–' : value,
  icon,
});

/** The content of the widget for one language. */
export function content(monitor, language) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const feed = monitor.feed;
  const footer = [
    {
      type: 'text',
      variant: 'caption',
      text:
        feed === null
          ? t(TEXT.waiting, lang)
          : feed.updatedAt === null
            ? t(TEXT.source, lang)
            : `${t(TEXT.source, lang)} · ${formatDate(feed.updatedAt, lang)}`,
    },
    { type: 'button', label: t(TEXT.site, lang), icon: 'external-link', link: { url: SITE_URL } },
  ];
  if (feed === null) {
    return { ttl_seconds: 60, components: footer };
  }
  const items = PERIODS.flatMap((period) =>
    BANDS.map((band) => {
      const condition = feed.bands[band.key][period];
      return {
        label: `${band.name} · ${PERIOD_NAMES[lang][period]}`,
        value: condition === null ? t(TEXT.noReport, lang) : CONDITION_NAMES[lang][condition],
        color: condition === null ? WIDGET_COLORS.NEUTRAL : CONDITION_COLORS[condition],
        icon: period === 'day' ? 'sun' : 'moon',
      };
    }),
  );
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      tile(t(TEXT.solarFlux, lang), feed.solarFlux, 'sun'),
      tile(t(TEXT.kIndex, lang), feed.kIndex, 'activity'),
      tile(t(TEXT.aIndex, lang), feed.aIndex, 'bar-chart-2'),
      tile(t(TEXT.xray, lang), feed.xray?.text, 'zap'),
      { type: 'status', items },
      ...footer,
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { language = 'en' } = {}) {
      return content(monitor, language);
    },
  },
};
