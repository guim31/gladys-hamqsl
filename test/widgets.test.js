// -----------------------------------------------------------------------------
// The `bands` widget and the two actions: contents within the core budget
// (validateWidgetContent: an empty array means rendered as sent), the texts of
// every language, and the bulletin of the scene action and of the
// configuration action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { STORM, createApi, createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const content = async (w, language) =>
  (await w.fake.widgetGet('bands', { settings: {}, language })).data.content;

test('the widget shows the indices and the eight bands, within the budget', async (t) => {
  const w = await world(t);
  for (const language of LANGUAGES) {
    const widget = await content(w, language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
    const status = widget.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 8);
  }
  const fr = await content(w, 'fr');
  assert.deepEqual(
    fr.components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Flux solaire', 115],
      ['Indice K', 2],
      ['Indice A', 19],
      ['Rayons X', 'B6.3'],
    ],
  );
  const status = fr.components.find((c) => c.type === 'status');
  assert.deepEqual(status.items[1], {
    label: '30-20 m · Jour',
    value: 'Bonne',
    color: 'success',
    icon: 'sun',
  });
  assert.deepEqual(
    status.items.map((item) => item.color),
    ['warning', 'success', 'warning', 'danger', 'success', 'success', 'warning', 'danger'],
  );
  assert.equal(
    fr.components.find((c) => c.type === 'text').text,
    'Données : N0NBH, hamqsl.com · 22/10/2026 07:42',
  );
});

test('the storm widget: missing values shown as such, still within the budget', async (t) => {
  const w = await world(t, { api: createApi(STORM) });
  const widget = await content(w, 'en');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.equal(widget.components[0].value, '–');
  const status = widget.components.find((c) => c.type === 'status');
  assert.deepEqual(status.items[2], {
    label: '17-15 m · Day',
    value: 'No report',
    color: 'neutral',
    icon: 'sun',
  });
});

test('before the first reading, the widget waits', async (t) => {
  const api = createApi();
  api.down = 503;
  const w = await world(t, { api });
  const widget = await content(w, 'de');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.equal(widget.components[0].text, 'Warte auf HamQSL…');
});

test('the scene action reads the bulletin, in the language of the configuration', async (t) => {
  const w = await world(t);
  const { data } = await w.fake.sceneAction('read_bulletin', {});
  assert.deepEqual(data.outputs, {
    text:
      'Propagation HF (N0NBH, 07:42) : SFI 115, K 2, A 19, rayons X B6.3. ' +
      'Jour : bonne sur 30-20 m, moyenne sur 80-40 m et 17-15 m, mauvaise sur 12-10 m. ' +
      'Nuit : bonne sur 80-40 m et 30-20 m, moyenne sur 17-15 m, mauvaise sur 12-10 m.',
    solar_flux: 115,
    sunspots: 66,
    k_index: 2,
    a_index: 19,
    xray: 'B6.3',
  });
  const en = await world(t, { config: { language: 'en' }, api: createApi(STORM) });
  const storm = (await en.fake.sceneAction('read_bulletin', {})).data.outputs;
  assert.equal(
    storm.text,
    'HF propagation (N0NBH, 03:03): K 9, A 207, X-ray X1.2. ' +
      'Day: poor on 80-40 m, 30-20 m and 12-10 m. ' +
      'Night: fair on 30-20 m, poor on 80-40 m, 17-15 m and 12-10 m.',
  );
  assert.equal(storm.solar_flux, null);
});

test('the scene action fails clearly when the feed was never read', async (t) => {
  const api = createApi();
  api.down = 'network';
  const w = await world(t, { api });
  const result = await w.fake.sceneAction('read_bulletin', {});
  assert.equal(result.success, false);
  assert.match(JSON.stringify(result), /pas encore pu être lu/);
});

test('the configuration action answers in the four languages, under 200 characters', async (t) => {
  const w = await world(t);
  const { data } = await w.fake.action('check_now', {});
  const message = data.message ?? data;
  assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort());
  assert.equal(
    message.en,
    'Feed read (08:00): SFI 115, K 2, A 19, X-ray B6.3. Good: 30-20 m day, 80-40 m night, 30-20 m night.',
  );
  for (const text of Object.values(message)) {
    assert.ok(text.length <= 200, text);
  }
});
