import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
let language = 'de', listener, resolve, calls = 0, shown = '';
const document = { hidden: false };
const code = (await transformWithOxc((await readFile('src/localization-speech.ts', 'utf8')).replace(/^import .*;\r?\n/gm, ''), 'localization-speech.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const create = new Function('getLocale', 'onLocaleChange', 'translateEntries', 'uiText', 'document', 'canonicalText', code + ';return flavorSpeech;')(
  () => language, fn => { listener = fn; return () => { listener = undefined; }; },
  entries => { calls++; return new Promise(done => { resolve = () => done(entries.map(e => ({ ...e, text: 'Deutsch: ' + e.text }))); }); },
  text => text, document, text => text,
);
const speech = create(text => { shown = text; });
speech.show('First line'); const first = resolve;
speech.show('Second line'); first(); await Promise.resolve();
assert.equal(shown, 'Second line', 'late translations cannot overwrite the current speaker line');
resolve(); await Promise.resolve(); assert.equal(shown, 'Deutsch: Second line');
speech.show('Expired'); const expired = resolve; speech.show(null); shown = ''; expired(); await Promise.resolve();
assert.equal(shown, '', 'expired speech is never resurrected');
speech.show('Switch language'); const oldLanguage = resolve; language = 'en'; listener(); oldLanguage(); await Promise.resolve();
assert.equal(shown, 'Switch language', 'language switch invalidates old model responses');
language = 'de'; document.hidden = true; const before = calls; speech.show('Hidden speech'); assert.equal(calls, before);
document.hidden = false; speech.show('Destroy'); const destroyed = resolve; speech.destroy(); shown = ''; destroyed(); await Promise.resolve();
assert.equal(shown, ''); assert.equal(listener, undefined);
console.log('Speech localization passed: current line, expiry, locale switch, hidden work and owner cleanup.');
