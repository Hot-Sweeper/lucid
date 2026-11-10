import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (name, exports) => {
  const src = (await readFile(new URL(`../src/office/${name}.ts`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  const code = (await transformWithOxc(src, `${name}.ts`)).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
  return new Function(`${code};return {${exports}}`)();
};
const { MonitorTasks, sharedPendingRequests } = await load('monitor-tasks', 'MonitorTasks,sharedPendingRequests');
const { hasOfficeDesk } = await load('room-policy', 'hasOfficeDesk');
let reads = 0, resolve;
const read = sharedPendingRequests(() => { reads++; return new Promise(r => resolve = r); });
const one = read('a'), two = read('a');
assert.equal(one, two); await Promise.resolve(); assert.equal(reads, 1); resolve([]); await one;
const three = read('a'); await Promise.resolve(); assert.equal(reads, 2); resolve([]); await three;
let failures = 0; const failing = sharedPendingRequests(async () => { failures++; throw Error('offline'); });
await assert.rejects(failing('a')); await assert.rejects(failing('a')); assert.equal(failures, 2);
const f = Object.create(MonitorTasks.prototype);
let reviewing = false, approved = new Set();
// This fixture isolates fresh-transition tracking; main.ts eligibility is covered by verify-session-continuity.
Object.assign(f, { previous: new Map(), holds: new Set(), fresh: new Set(), collecting: new Set(), world: { setCompletionHolds(ids) { this.holds = [...ids]; } },
  // Like main.ts collectible(): settled work is only collectible while its coins are still waiting.
  actions: { ready: (id, fresh) => current?.settled ? (current.coins ? { summary: '', coins: current.coins, state: 'settled' } : null) : reviewing ? (approved.has(id) ? { summary: 'ok', coins: null, state: 'done' } : null) : fresh ? { summary: '', coins: null, state: 'done' } : null } });
let current = null;
const prepare = f.prepare.bind(f); f.prepare = d => { current = d.threads[0] ?? null; return prepare(d); };
const data = (status, extra = {}) => ({ threads: [{ id: 'a', runStatus: status, updatedAt: 'now', settled: false, ...extra }], projects: [] });
f.prepare(data('completed')); assert.deepEqual(f.world.holds, [], 'Do not resurrect all old completed threads on startup');
f.prepare(data('running')); f.prepare(data('completed')); assert.deepEqual(f.world.holds, ['a'], 'New completion retains its physical monitor until dismissed');
assert(hasOfficeDesk({ id: 'a', runStatus: 'completed', completionPending: true }));
assert(!hasOfficeDesk({ id: 'a', runStatus: 'running', settled: true, completionPending: true }));
f.prepare(data('running')); assert.deepEqual(f.world.holds, []);
f.prepare(data('completed')); f.prepare(data('completed', { settled: true })); assert.deepEqual(f.world.holds, []);
f.prepare(data('running')); f.prepare(data('completed')); f.prepare({ ...data('completed'), environmentId: 'remote' }); assert.deepEqual(f.world.holds, [], 'Completion state never crosses environments');
f.prepare({ threads: [], projects: [] }); assert.equal(f.previous.size, 0);
// With reviews on, finished work waits for approval before its desk shows Collect.
reviewing = true;
f.prepare(data('running')); f.prepare(data('completed')); assert.deepEqual(f.world.holds, [], 'Completion under review shows nothing on the desk yet');
approved.add('a'); f.prepare(data('completed')); assert.deepEqual(f.world.holds, ['a'], 'Approval puts Collect on the desk');
f.prepare({ threads: [], projects: [] }); f.prepare(data('completed')); assert.deepEqual(f.world.holds, ['a'], 'Approved work is collectible after a restart too');
f.prepare(data('completed', { settled: true })); assert.deepEqual(f.world.holds, [], 'Collected (settled) work releases the desk');
f.prepare(data('completed', { settled: true, coins: '3.5' })); assert.deepEqual(f.world.holds, ['a'], 'Settled work whose coins wait keeps Collect on its desk');
assert(hasOfficeDesk({ id: 'a', runStatus: 'completed', reviewPending: true }), 'The desk waits while the worker is at review');
assert(hasOfficeDesk({ id: 'a', runStatus: 'completed', reviewPending: false }), 'finished unsettled sessions persist without a review hold');
console.log('Monitor tasks passed: coalesced pending reads, failed-read recovery, real completion transitions, desk retention, new work, settlement, removal, building isolation, approval-gated Collect and review desk retention.');
