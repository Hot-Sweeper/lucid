// A thread that moves to another harness gets a real worker of that harness: a free one by the
// shared matching rule, otherwise a new hire. The previous worker keeps the job in its record and is
// free, the assignment is saved, and the office shows a walking swap instead of a premade clone scene.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const store = new Map(), saved = [];
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
// Saves run at once here (the roster normally debounces them) and land in `saved`.
globalThis.window = { setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {},
  lucid: { rosterSave: (json) => { saved.push(json); return Promise.resolve(); }, rosterLoad: () => store.get('roster') ?? '[]' } };

const server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { Roster } = await server.ssrLoadModule('/src/robot/roster.ts');
  const roster = new Roster();
  roster.robots = [];
  // Juno starts the job on Codex.
  let swaps = roster.assign([{ id: 'job', provider: 'codex', model: 'gpt' }], new Set(), new Set(['job']));
  assert.deepEqual(swaps, [], 'a first assignment is no swap');
  const juno = roster.byThread('job');
  // A free Claude worker rests from a settled job; another Claude worker runs another model.
  roster.assign([{ id: 'old', provider: 'claudeAgent', model: 'opus' }, { id: 'busy', provider: 'claudeAgent', model: 'sonnet' }], new Set(), new Set(['job', 'old', 'busy']));
  const resting = roster.byThread('old'), busy = roster.byThread('busy');
  const robots = roster.robots.length;
  // The thread moves to Claude Opus while "old" is settled: the resting Opus worker takes over.
  swaps = roster.assign([{ id: 'job', provider: 'claudeAgent', model: 'opus' }, { id: 'busy', provider: 'claudeAgent', model: 'sonnet' }], new Set(['old']), new Set(['job', 'old', 'busy']));
  assert.equal(swaps.length, 1, 'one harness change, one swap');
  const [swap] = swaps;
  assert.equal(swap.from.id, juno.id); assert.equal(swap.to.id, resting.id, 'a free worker of the new harness and model is reused');
  assert.equal(swap.previous, 'old', 'the settled job it rested from is reported, so its room walks it over');
  assert.equal(roster.byThread('job').id, resting.id, 'the thread belongs to the new worker');
  assert.equal(roster.byThread('busy').id, busy.id, 'a busy worker is never taken');
  assert.equal(juno.threadId, null, 'the previous worker is free');
  assert.ok(juno.done.includes('job'), 'the previous worker keeps the job in its record');
  assert.equal(juno.provider, 'codex', 'the previous worker is not retrained');
  assert.equal(roster.robots.length, robots, 'reuse hires nobody');
  assert.deepEqual(roster.assign([{ id: 'job', provider: 'claudeAgent', model: 'opus' }], new Set(['old']), new Set(['job', 'old'])), [], 'the next refresh does not swap again');
  // Saved: a fresh roster from the saved file keeps the new assignment (survives refresh).
  store.set('roster', saved.at(-1));
  const reloaded = new Roster();
  assert.equal(reloaded.byThread('job').id, resting.id, 'the new assignment is saved');
  // Back to Codex: Juno is free again and is the compatible worker, with its identity intact.
  const look = JSON.stringify(juno.look);
  swaps = roster.assign([{ id: 'job', provider: 'codex', model: 'gpt' }], new Set(['old']), new Set(['job', 'old']));
  assert.equal(swaps[0].to.id, juno.id, 'switching back brings the same Codex worker back');
  assert.equal(JSON.stringify(roster.byThread('job').look), look);
  // A harness nobody free works on means the next new hire of that harness.
  swaps = roster.assign([{ id: 'job', provider: 'grok', model: 'grok-5' }], new Set(['old']), new Set(['job', 'old']));
  assert.equal(swaps[0].to.provider, 'grok'); assert.equal(swaps[0].previous, null);
  assert.ok(!roster.robots.slice(0, -1).includes(swaps[0].to), 'a new hire joins the roster');
  assert.equal(new Set(roster.robots.map(r => r.threadId).filter(Boolean)).size, roster.robots.filter(r => r.threadId).length, 'one worker per thread, no clones');
  // A model change on the same harness keeps the worker.
  assert.deepEqual(roster.assign([{ id: 'job', provider: 'grok', model: 'grok-6' }], new Set(['old']), new Set(['job', 'old'])), []);
  console.log('PASS: harness changes reuse a free worker or hire one, free the previous worker and are saved');
} finally { await server.close(); }

// The office shows it with real walkers and seats; the premade clone scene is gone.
const swapSource = await readFile('src/office/world/harness-swap.ts', 'utf8');
const desk = await readFile('src/office/desk.ts', 'utf8');
const handoff = await readFile('src/robot/walker/handoff.ts', 'utf8');
assert.ok(!/playHandoff/.test(desk) && !/new Walker/.test(handoff), 'no premade scene with generated robots');
assert.ok(/reducedMotion\(\)/.test(swapSource) && /finishSwap/.test(swapSource), 'reduced motion swaps at once');
assert.ok(/this\.spawn\(t,/.test(swapSource) && /this\.travel\(t, \{ walker: incoming \}/.test(swapSource) && /this\.walkOff\(/.test(swapSource), 'the new worker walks in and sits through the shared journey, the previous one walks off');
assert.ok(/swap\.from\.look/.test(swapSource), 'the previous worker leaves as itself');
const layout = await readFile('src/office/world/layout-pass.ts', 'utf8');
assert.ok(/const swaps = this\.roster\.assign\(/.test(layout) && /this\.swapWorker\(t, swap, first\)/.test(layout), 'the layout pass shows every roster swap, quietly on the first layout');
console.log('PASS: the swap uses the walker, seat and handoff systems with reduced motion');
