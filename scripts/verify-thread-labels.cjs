const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createThreadLabels, parseLabels } = require('../electron/thread-labels.cjs');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-labels-'));
  const settingsFile = path.join(dir, 'settings.json'), file = path.join(dir, 'cache.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ textGenerationModelSelection: { instanceId: 'codex', model: 'gpt-6-luna', options: [] } }));
  let data = { projects: [{ id: 'p' }], threads: [{ id: 'a', projectId: 'p', title: 'Fix settings panel scroll position' }] };
  const helpers = new Set(), calls = [], dispatched = [];
  let reply = '{"a":"Settings scroll position"}', mutate = false, fail = false;
  const deps = { file, settingsFile, helpers, now: () => 1, wait: async () => {}, t3: {
    world: () => structuredClone(data), threadInfo: () => ({ run: { status: 'completed' } }),
    conversation: () => { if (mutate) data.threads[0].title = 'A changed topic'; return [{ role: 'assistant', text: reply }]; },
  }, server: { call: async (tag, payload) => { calls.push(payload); if (fail) throw Error('offline'); }, dispatch: async c => dispatched.push(c) } };
  const writer = createThreadLabels(deps);
  writer.decorate(structuredClone(data)); writer.decorate(structuredClone(data)); await writer.idle();
  assert.equal(calls.length, 1, 'single flight across refreshes');
  assert.equal(calls[0].modelSelection.model, 'gpt-6-luna');
  assert.equal(dispatched[0].type, 'thread.archive'); assert.equal(helpers.size, 0);
  let shown = writer.decorate(structuredClone(data), false);
  assert.equal(shown.threads[0].compactTitle, 'Settings scroll position');
  assert.equal(shown.threads[0].title, data.threads[0].title, 'real title unchanged');
  shown = createThreadLabels(deps).decorate(structuredClone(data), false);
  assert.equal(shown.threads[0].compactTitle, 'Settings scroll position', 'cache survives restart');
  data.threads[0].title = 'Updated title';
  assert.equal(writer.decorate(structuredClone(data), false).threads[0].compactTitle, undefined, 'stale label hidden');
  mutate = true;
  const stale = createThreadLabels({ ...deps, file: path.join(dir, 'stale.json') }); stale.decorate(structuredClone(data)); await stale.idle();
  assert.equal(stale.decorate(structuredClone(data), false).threads[0].compactTitle, undefined, 'late result cannot label a renamed thread');
  mutate = false; fail = true;
  const failed = createThreadLabels({ ...deps, file: path.join(dir, 'failed.json') }); failed.decorate(structuredClone(data)); await failed.idle();
  assert.equal(helpers.size, 0); assert.equal(failed.decorate(structuredClone(data), false).threads[0].compactTitle, undefined);
  fail = false;
  assert.deepEqual(parseLabels('{"a":"too many words in this label", "b":"Good topic"}', [{ id: 'a' }]), {});
  data.threads = [{ id: 'remote::a', title: 'Remote topic', projectId: 'p' }];
  const before = calls.length, remote = createThreadLabels(deps); remote.decorate(structuredClone(data)); await remote.idle(); assert.equal(calls.length, before);
  console.log('PASS: configured model, single flight, persistence, original titles, stale cache, validation and environment isolation');
  fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
