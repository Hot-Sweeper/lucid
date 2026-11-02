import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/director.ts', import.meta.url), 'utf8')).replace(/^import\s[\s\S]*?;\r?\n/gm, '');
const code = (await transformWithOxc(source, 'director.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const Director = new Function(`${code}; return Director;`)();
const app = { setInfo() {}, update() {} };
function fixture() {
  return Object.assign(Object.create(Director.prototype), {
    info: null, pendingInitial: null, items: new Map(), queue: [], played: new Set(),
    chat: app, nativeMessages: app, codex: app, term: { setCwd() {} },
    idleLife: { isActive: false }, stage: { setPlan() {} },
    imageRefresh: { tracks: () => false }, helperOf: new Map(), lastEventAt: 0,
    noteQueue() {}, scheduleHistory() {}, pump() {},
  });
}
const item = (id, runId) => ({ id, runId, ordinal: 1, type: 'assistant_message', status: 'completed', updatedAt: '2026-01-01T00:00:00Z', data: { text: 'Old work' } });
for (const status of ['completed', 'cancelled', 'failed', 'queued', null]) {
  const d = fixture();
  d.push([item('old', 'old-run')], true);
  assert.equal(d.items.size, 0, 'Snapshot must wait for metadata');
  d.setInfo({ id: 'thread', run: status ? { id: 'old-run', status } : null });
  assert.deepEqual(d.queue, [], `${status}: historical work must not play`);
  assert.ok(d.played.has('old'));
  assert.ok(d.historyCut > Date.parse('2026-01-01'), 'Completed messages remain eligible for history');
}
const active = fixture();
active.push([item('old', 'old-run'), item('current', 'current-run')], true);
active.setInfo({ id: 'thread', run: { id: 'current-run', status: 'running' } });
assert.deepEqual(active.queue, ['current'], 'Only the authoritative running turn plays');
const live = fixture();
live.setInfo({ id: 'thread', run: { id: 'new-run', status: 'running' } });
live.push([item('new', 'new-run')], false);
assert.deepEqual(live.queue, ['new'], 'Fresh events still play normally');
console.log('Startup activity: inactive snapshots stay idle, active turns and fresh events play.');
