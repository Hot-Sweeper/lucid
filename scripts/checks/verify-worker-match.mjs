// Workers are matched by harness and model, in the hire composer and in automatic
// assignment for threads started outside Lucid. Runs the real Roster through Vite.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;
globalThis.window.setTimeout = setTimeout; globalThis.window.clearTimeout = clearTimeout;

const server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { compatibleWorkers } = await server.ssrLoadModule('/src/office/worker-match.ts');
  const { Roster } = await server.ssrLoadModule('/src/robot/roster.ts');

  const w = (id, provider, model, jobs = 1, extra = {}) => ({ id, name: id, provider, lastModel: model, jobs, ...extra });
  const free = [w('opusA', 'claude', 'opus', 3), w('sonnet', 'claude', 'sonnet', 9), w('legacy', 'claude', null, 20), w('codex', 'codex', 'gpt', 50), w('gone', 'claude', 'opus', 99, { retired: true })];
  assert.deepEqual(compatibleWorkers(free, 'claude', 'opus').map(r => r.id), ['opusA', 'legacy'], 'exact model first; a worker with no recorded model may take it; other models, harnesses and retired robots never');
  assert.deepEqual(compatibleWorkers(free, 'claude', 'haiku').map(r => r.id), ['legacy']);
  assert.deepEqual(compatibleWorkers(free.filter(r => r.id !== 'legacy'), 'claude', 'haiku'), [], 'no compatible worker means a new hire');
  assert.deepEqual(compatibleWorkers(free, 'claude', null).map(r => r.id), ['legacy', 'sonnet', 'opusA'], 'unknown thread model: same harness only, unknown worker model first, then experience');
  assert.deepEqual(compatibleWorkers(free, 'grok', 'x'), []);

  // The real automatic assignment.
  const roster = new Roster();
  roster.robots = [];
  roster.assign([{ id: 't1', provider: 'claude', model: 'opus' }], new Set(), new Set(['t1']));
  const first = roster.byThread('t1');
  assert.ok(first && first.lastModel === 'opus', 'first job hires an opus worker');
  // t1 settles; a sonnet job must not take the free opus worker.
  roster.assign([{ id: 't2', provider: 'claude', model: 'sonnet' }], new Set(['t1']), new Set(['t1', 't2']));
  const second = roster.byThread('t2');
  assert.notEqual(second.id, first.id, 'different model on the same harness hires someone new');
  assert.equal(roster.robots.length, 2);
  // An opus job reuses the free opus worker with its identity intact.
  const look = JSON.stringify(first.look), name = first.name;
  roster.assign([{ id: 't3', provider: 'claude', model: 'opus' }], new Set(['t1', 't2']), new Set(['t1', 't2', 't3']));
  const third = roster.byThread('t3');
  assert.equal(third.id, first.id, 'same harness and model reuses the free worker');
  assert.equal(third.name, name); assert.equal(JSON.stringify(third.look), look, 'name and look are kept');
  assert.deepEqual(third.done, ['t1'], 'its history is kept');
  assert.equal(roster.robots.length, 2, 'no extra robot was hired');
  // Unknown model: a free same-harness worker takes it and records the model once reported.
  roster.assign([{ id: 't4', provider: 'claude', model: null }], new Set(['t1', 't2', 't3']), new Set(['t1', 't2', 't3', 't4']));
  const fourth = roster.byThread('t4');
  assert.equal(fourth.provider, 'claude'); assert.equal(roster.robots.length, 2, 'unknown model reuses a free worker of that harness');
  roster.assign([{ id: 't4', provider: 'claude', model: 'sonnet' }], new Set(['t1', 't2', 't3']), new Set(['t1', 't2', 't3', 't4']));
  assert.equal(roster.byThread('t4').lastModel, 'sonnet', 'the reported model is recorded on the worker');
  // A different harness never borrows a worker.
  roster.assign([{ id: 't5', provider: 'codex', model: 'gpt' }], new Set(['t1', 't2', 't3', 't4']), new Set(['t1', 't2', 't3', 't4', 't5']));
  assert.equal(roster.byThread('t5').provider, 'codex'); assert.equal(roster.robots.length, 3);
  // Retired workers are never assigned.
  for (const r of roster.robots) r.retired = true;
  roster.assign([{ id: 't6', provider: 'codex', model: 'gpt' }], new Set(['t1', 't2', 't3', 't4', 't5']), new Set(['t1', 't2', 't3', 't4', 't5', 't6']));
  assert.equal(roster.byThread('t6').retired, undefined, 'retired robots stay retired; a new worker is hired');
  assert.equal(roster.freeTeam(new Set(['t1', 't2', 't3', 't4', 't5'])).filter(r => r.retired).length, 0, 'retired robots are never offered in hiring');
  console.log('PASS: harness and model matching, unknown models, retained identity and history, retired workers.');
} finally { await server.close(); }
