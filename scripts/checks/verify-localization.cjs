const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalization, createWriterTranslator, parseReply } = require('../../electron/localization.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-language-'));
  try {
    let calls = 0;
    const file = path.join(dir, 'cache.json');
    const service = createLocalization({ file, translate: async (_locale, entries) => {
      calls++; await new Promise(resolve => setTimeout(resolve, 5));
      return JSON.stringify({ entries: entries.map(e => ({ id: e.id, text: `Hallo ${e.text}` })) });
    } });
    const input = { locale: 'de', entries: [{ id: 'greeting', text: '{name}', context: 'Greeting' }] };
    const [a, b] = await Promise.all([service.localize(input), service.localize(input)]);
    assert.deepEqual(a, b); assert.equal(calls, 1); assert.equal(a.entries[0].text, 'Hallo {name}');
    await service.localize({ ...input, entries: [{ ...input.entries[0], id: 'another-render' }] });
    assert.equal(calls, 1, 'render IDs do not invalidate content cache');
    const persisted = createLocalization({ file, translate: () => { throw Error('must use cache'); } });
    assert.deepEqual(await persisted.localize(input), a);
    assert.equal((await service.localize({ ...input, locale: 'en' })).entries[0].text, '{name}');
    assert.equal((await service.localize({ locale: 'de', entries: [{ id: 'pun', text: 'Nice to bit you.' }] })).entries[0].text, 'Du bist ganz mein Datentyp.');
    await assert.rejects(service.localize({ ...input, locale: 'fr' }));
    await assert.rejects(service.localize({ ...input, entries: [input.entries[0], input.entries[0]] }));
    assert.throws(() => parseReply('{"entries":[{"id":"greeting","text":"Hallo"}]}', input.entries));
    assert.throws(() => parseReply('{"entries":[{"id":"wrong","text":"{name}"}]}', input.entries));
    const failed = createLocalization({ file: path.join(dir, 'failure.json'), translate: async () => 'invalid' });
    const fallback = await failed.localize(input);
    assert.equal(fallback.translated, false); assert.equal(fallback.entries[0].text, '{name}');
    const prompts = [];
    const translator = createWriterTranslator({ writer: { write: async (prompt, options) => { prompts.push({ prompt, options }); return '{"entries":[]}'; } } });
    assert.equal(await translator('de', input.entries), '{"entries":[]}');
    assert.ok(prompts[0].prompt.includes('Translate') && prompts[0].prompt.includes('"greeting"'), 'the batch goes to the headless writer');
    assert.ok(prompts[0].options.timeoutMs <= 90000, 'translation has a strict timeout');
    // A burst of screens must not accumulate unbounded model work.
    let unblock;
    const gate = new Promise(resolve => { unblock = resolve; });
    const bounded = createLocalization({ file: path.join(dir, 'bounded.json'), translate: async (_locale, entries) => {
      await gate; return JSON.stringify({ entries: entries.map(e => ({ id: e.id, text: `Hallo ${e.text}` })) });
    } });
    const batch = offset => ({ locale: 'de', entries: Array.from({ length: 80 }, (_, n) => ({ id: String(n), text: `Message ${offset + n}` })) });
    const first = bounded.localize(batch(0)), second = bounded.localize(batch(80));
    const overflow = await bounded.localize(batch(160));
    assert.equal(overflow.translated, false);
    assert.equal(overflow.entries[0].text, 'Message 160');
    unblock(); await Promise.all([first, second]);
    assert.equal((await bounded.localize(batch(160))).translated, true, 'queue recovers after draining');
    console.log('Localization checks passed.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
