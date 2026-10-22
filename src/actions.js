// -----------------------------------------------------------------------------
// The scene action `read_bulletin` and the configuration action `check_now`.
// Both read the feed again when the last reading is older than one interval
// (never more often: N0NBH asks for 30 to 60 minutes at least).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { PHRASES, STATUS, bulletin, formatTime, goodBands, indices, render } from './messages.js';

const logger = createLogger({ name: 'hamqsl-actions' });

export const SCENE_ACTION = 'read_bulletin';
export const CONFIG_ACTION = 'check_now';

/** Scene action: the bulletin in one sentence, and the main values. */
export async function readBulletin(monitor) {
  const feed = await monitor.fresh();
  if (feed === null) {
    throw new Error(STATUS[monitor.config.language].noValue);
  }
  return {
    text: bulletin(feed, monitor.config.language),
    solar_flux: feed.solarFlux,
    sunspots: feed.sunspots,
    k_index: feed.kIndex,
    a_index: feed.aIndex,
    xray: feed.xray?.text ?? null,
  };
}

/** Configuration action: the main values and the good bands, in every language. */
export async function checkNow(monitor) {
  const feed = await monitor.fresh();
  const down = monitor.failing.has('feed');
  logger.info(`Check requested: ${down ? 'HamQSL feed unreachable' : 'feed read'}`);
  if (feed === null) {
    return render(STATUS, 'noValue');
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const time = formatTime(monitor.lastSuccessAt, language);
      const values = indices(feed, language) || '–';
      const good = goodBands(feed, language);
      // The last reading failed: said first, then the values of the last good one.
      return [
        language,
        down
          ? `${STATUS[language].stale_read({ time })} ${values}. ${good}.`
          : PHRASES[language].check({ indices: values, good, time }),
      ];
    }),
  );
}
