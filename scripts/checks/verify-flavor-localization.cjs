const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

let locale = 'de', calls = 0;
const exportsObject = {};
const source = stripTypeScriptTypes(fs.readFileSync('src/content/localized.ts', 'utf8').replace(/^import[^;]+;/m, '').replace(/^export /gm, '')) + '; Object.assign(exports, { localizedFlavor, flavorSlots });';
vm.runInNewContext(source, {
  exports: exportsObject, structuredClone, Set, Map,
  getLocale: () => locale, localizeData: async (texts) => {
    calls++;
    return texts.map((text) => `DE:${text}`);
  },
});

(async () => {
  const scene = { channel: 'general', user: 'byte', topic: 'code', lines: [
    { by: 0, text: 'Setup', rx: [['laugh', 2]] },
    { by: 1, text: 'Punchline', gif: 'drake' },
  ] };
  const { localizedFlavor, flavorSlots } = exportsObject;
  assert.deepEqual(Array.from(flavorSlots(scene), (slot) => slot.text), ['Setup', 'Punchline']);
  assert.equal(localizedFlavor(scene, 'conversation'), scene);
  assert.equal(localizedFlavor(scene, 'conversation'), scene);
  assert.equal(calls, 1, 'concurrent warming is deduplicated');
  await new Promise((resolve) => setImmediate(resolve));
  const translated = localizedFlavor(scene, 'conversation');
  assert.equal(translated.lines[0].text, 'DE:Setup');
  assert.equal(translated.lines[1].text, 'DE:Punchline');
  assert.equal(translated.channel, scene.channel);
  assert.equal(translated.user, scene.user);
  assert.equal(translated.topic, scene.topic);
  assert.equal(translated.lines[1].gif, 'drake');
  assert.equal(translated.lines[0].rx[0][0], 'laugh');
  assert.equal(scene.lines[0].text, 'Setup', 'canonical source stays English');
  locale = 'en';
  assert.equal(localizedFlavor(scene, 'conversation'), scene);
  const jokes = {};
  const jokeCode = stripTypeScriptTypes(fs.readFileSync('src/world/jokes.ts', 'utf8')
    .replace(/^import[^;]+;/gm, '').replace(/^export /gm, ''));
  vm.runInNewContext(jokeCode + '; Object.assign(exports, { JOKES, GERMAN_JOKES, shuffled });', {
    exports: jokes, getLocale: () => locale, localizedFlavor: (item) => item, rememberTranslation() {},
  });
  assert.equal(jokes.JOKES.length, jokes.GERMAN_JOKES.length);
  locale = 'de';
  const nextJoke = jokes.shuffled(jokes.JOKES);
  const germanSet = new Set(jokes.GERMAN_JOKES.map((pair) => JSON.stringify(pair)));
  const dealt = Array.from({ length: jokes.JOKES.length }, () => nextJoke());
  assert.equal(new Set(dealt.map((pair) => JSON.stringify(pair))).size, jokes.JOKES.length);
  assert.ok(dealt.every((pair) => germanSet.has(JSON.stringify(pair))));
  locale = 'en';
  assert.ok(jokes.JOKES.includes(nextJoke()), 'switching languages preserves the existing shuffled deck');
  console.log('Flavor localization: protected IDs, coherent scene projection, deduplication and canonical fallback passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

