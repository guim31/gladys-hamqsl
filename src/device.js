// -----------------------------------------------------------------------------
// The one Gladys device of the integration: the solar and propagation data of
// the HamQSL feed (N0NBH).
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - solar_flux, sunspots, k_index, a_index   counter-sensor/integer;
//   - solar_wind     speed-sensor/integer, km/s (no such unit in Gladys: the
//                    unit is in the name);
//   - bz             counter-sensor/integer, nT, signed, rounded (no decimal
//                    couple of the core means "magnetic field");
//   - band_<group>_<day|night>   signal/integer 0 Poor, 1 Fair, 2 Good: the
//                    front draws antenna bars from min/max (0, 3 and 5 bars);
//   - vhf_aurora, es_*           input/binary, 1 = open;
//   - xray, signal_noise, geomag_field, updated   text/text.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The platform id is fixed: one feed for everyone.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { BANDS, PERIODS, VHF } from './hamqsl.js';

export const DEVICE_TYPE = 'propagation';
export const PLATFORM_ID = 'n0nbh';

/** Feature key of a band group by day or by night. */
export const bandKey = (band, period) => `band_${band}_${period}`;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    device: 'HF propagation (HamQSL)',
    solar_flux: 'Solar flux (SFI)',
    sunspots: 'Sunspot number',
    k_index: 'K index',
    a_index: 'A index',
    xray: 'X-ray class',
    solar_wind: 'Solar wind (km/s)',
    bz: 'Bz (nT)',
    signal_noise: 'Signal noise',
    geomag_field: 'Geomagnetic field',
    updated: 'N0NBH update',
    day: 'day',
    night: 'night',
    vhf_aurora: 'VHF aurora',
    es_europe_6m: 'Es Europe 6 m',
    es_europe_4m: 'Es Europe 4 m',
    es_europe_2m: 'Es Europe 2 m',
    es_north_america_2m: 'Es North America 2 m',
  },
  fr: {
    device: 'Propagation HF (HamQSL)',
    solar_flux: 'Flux solaire (SFI)',
    sunspots: 'Nombre de taches solaires',
    k_index: 'Indice K',
    a_index: 'Indice A',
    xray: 'Classe des rayons X',
    solar_wind: 'Vent solaire (km/s)',
    bz: 'Bz (nT)',
    signal_noise: 'Bruit de fond',
    geomag_field: 'Champ géomagnétique',
    updated: 'Mise à jour N0NBH',
    day: 'jour',
    night: 'nuit',
    vhf_aurora: 'Aurore VHF',
    es_europe_6m: 'Es Europe 6 m',
    es_europe_4m: 'Es Europe 4 m',
    es_europe_2m: 'Es Europe 2 m',
    es_north_america_2m: 'Es Amérique du Nord 2 m',
  },
  de: {
    device: 'KW-Ausbreitung (HamQSL)',
    solar_flux: 'Solarflux (SFI)',
    sunspots: 'Sonnenfleckenzahl',
    k_index: 'K-Index',
    a_index: 'A-Index',
    xray: 'Röntgenklasse',
    solar_wind: 'Sonnenwind (km/s)',
    bz: 'Bz (nT)',
    signal_noise: 'Grundrauschen',
    geomag_field: 'Erdmagnetfeld',
    updated: 'N0NBH-Aktualisierung',
    day: 'Tag',
    night: 'Nacht',
    vhf_aurora: 'UKW-Aurora',
    es_europe_6m: 'Es Europa 6 m',
    es_europe_4m: 'Es Europa 4 m',
    es_europe_2m: 'Es Europa 2 m',
    es_north_america_2m: 'Es Nordamerika 2 m',
  },
  es: {
    device: 'Propagación HF (HamQSL)',
    solar_flux: 'Flujo solar (SFI)',
    sunspots: 'Número de manchas solares',
    k_index: 'Índice K',
    a_index: 'Índice A',
    xray: 'Clase de rayos X',
    solar_wind: 'Viento solar (km/s)',
    bz: 'Bz (nT)',
    signal_noise: 'Ruido de fondo',
    geomag_field: 'Campo geomagnético',
    updated: 'Actualización N0NBH',
    day: 'día',
    night: 'noche',
    vhf_aurora: 'Aurora VHF',
    es_europe_6m: 'Es Europa 6 m',
    es_europe_4m: 'Es Europa 4 m',
    es_europe_2m: 'Es Europa 2 m',
    es_north_america_2m: 'Es Norteamérica 2 m',
  },
};

/** External ids of the device, and of a feature by its key. */
export function deviceIds(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

/** The discovery payload of the device. */
export function buildDevice(gladys, language = 'fr') {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.fr;
  const counter = (key, min, max) =>
    sensor(names[key], ids.feature(key), CATEGORIES.COUNTER_SENSOR, TYPES.SENSOR.INTEGER, {
      min,
      max,
    });
  const text = (key) =>
    sensor(names[key], ids.feature(key), CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    });
  return {
    name: names.device,
    external_id: ids.device,
    model: 'HamQSL solar data (N0NBH)',
    should_poll: false,
    params: [],
    features: [
      counter('solar_flux', 0, 1000),
      counter('sunspots', 0, 1000),
      counter('k_index', 0, 9),
      counter('a_index', 0, 400),
      text('xray'),
      sensor(
        names.solar_wind,
        ids.feature('solar_wind'),
        CATEGORIES.SPEED_SENSOR,
        TYPES.SENSOR.INTEGER,
        { min: 0, max: 3000 },
      ),
      // Signed: symmetric bounds, so a gauge puts 0 in the middle.
      counter('bz', -100, 100),
      ...PERIODS.flatMap((period) =>
        BANDS.map((band) =>
          sensor(
            `${band.name} ${names[period]}`,
            ids.feature(bandKey(band.key, period)),
            CATEGORIES.SIGNAL,
            TYPES.SIGNAL.QUALITY,
            { min: 0, max: 2 },
          ),
        ),
      ),
      text('signal_noise'),
      text('geomag_field'),
      ...VHF.map((entry) =>
        sensor(names[entry.key], ids.feature(entry.key), CATEGORIES.INPUT, TYPES.INPUT.BINARY, {
          min: 0,
          max: 1,
        }),
      ),
      text('updated'),
    ],
  };
}
