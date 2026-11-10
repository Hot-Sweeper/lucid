// Exercise the actual coordinator with deferred IPC, without a renderer or live T3.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('let watched = "";'), source.indexOf('// --- office and desk options'));
assert.ok(!block.includes('refreshTasks'), 'the removed to-do list no longer polls T3 for tasks');
const code = (await transformWithOxc(block, 'refresh.ts')).code;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness() {
  const updates = [], tasks = [], watches = [], observations = [], errors = [], frames = [], cameras = [];
  const data = { projects: [], threads: [], shipped: { total: 0, today: 0 } };
  const api = { world: async () => data, tasks: async () => [], watchSet: async ids => { watches.push(ids); return true; } };
  const world = { desks: new Map([['robot', {}]]), keptDesks: new Set(), get campusDesks() { return [...this.desks].map(([id,desk])=>({id,desk,x:0})); }, scene: {inert:false}, update(d) {this.lastData=d;updates.push(d);}, deskFor() { return null; }, overview() { cameras.push('overview'); } };
  const orch = { observe: async threads => observations.push(threads) };
  const document = {hidden:false}, window = {setTimeout:callback=>{frames.push(callback);return frames.length;}};
  const deps = { api, world, orch, delegate: { observe:async()=>{} }, coinRewards: null, monitorTasks: { prepare() {}, sync() {} }, projectTitles: new Map(),
    document,window,paintSelectedStatus(){},renderThreads(){},
    renderCompany() {}, settings: {}, chat: { threadId: null }, 
    $() {}, gsap: {}, pushStatus() {}, location: { search: '' }, URLSearchParams,
    requestAnimationFrame: callback => frames.push(callback), console: { error: (...args) => errors.push(args) } };
  const run = new Function(...Object.keys(deps), `${code}; return {refresh,
    switchTo(environment) { buildingEpoch++; currentEnvironment=environment; watched=''; },
    state() { return {refreshBusy,watched}; }};`)(...Object.values(deps));
  return { ...run, api, world, orch, document, updates, tasks, watches, observations, errors, frames, cameras, data };
}

// Slow supervision and watch acknowledgements must not block a world snapshot,
// initial camera framing or later refreshes. Their own coordinators own results.
{
  const h = harness(), observe = deferred(), watch=deferred();
  h.orch.observe = () => observe.promise;
  h.api.watchSet=ids=>{h.watches.push(ids);return watch.promise;};
  await h.refresh();await settle();
  assert.equal(h.updates.length,1);assert.equal(h.frames.length,1);assert.equal(h.watches.length,1);
  assert.equal(h.state().refreshBusy,false);
  await h.refresh();await settle();assert.equal(h.updates.length,2);assert.equal(h.watches.length,1,'watch writes remain single-flight');
  h.switchTo('remote');observe.resolve();watch.resolve(true);await settle();
  assert.equal(h.state().watched,'','late acknowledgements retain their building ownership');
}
// Several actions while fetching coalesce to one fresh request, with no overlap.
{
  const h = harness(), first = deferred(), second = deferred(); let calls = 0, active = 0, peak = 0;
  h.api.world = () => {
    peak = Math.max(peak, ++active);
    return (++calls === 1 ? first : second).promise.finally(() => active--);
  };
  const pending = h.refresh(); await h.refresh(); await h.refresh();
  assert.equal(calls, 1);
  h.switchTo('remote'); h.data.environmentId = 'remote';
  first.resolve({ projects: [], threads: [] }); await pending; await settle();
  assert.equal(calls, 2, 'Queued building refresh starts immediately');
  assert.equal(h.updates.length, 0, 'Old world never appears in the new building');
  second.resolve(h.data); await settle();
  assert.equal(h.updates.length, 1); assert.equal(peak, 1);
  assert.equal(h.state().refreshBusy, false);
}
// Hiding the desktop pauses cosmetics, not its authoritative work/supervision.
{
  const h=harness();h.document.hidden=true;
  await h.refresh();await settle();
  assert.equal(h.updates.length,1);assert.equal(h.observations.length,1);
  assert.deepEqual(h.watches,[['robot']]);
}
// Only acknowledged subscriptions are remembered; false and rejection both retry.
{
  const h = harness(); let attempts = 0;
  h.api.watchSet = async () => { if (++attempts === 1) return false; if (attempts === 2) throw Error('offline'); return true; };
  await h.refresh(); assert.equal(h.state().watched, '');
  await h.refresh(); assert.equal(h.state().watched, '');
  await h.refresh(); assert.equal(h.state().watched, 'robot');
  await h.refresh(); assert.equal(attempts, 3);
  assert.equal(h.errors.length, 1);
}
// A watch acknowledgement from an old building cannot suppress a new subscription.
{
  const h = harness(), watch = deferred(); h.api.watchSet = () => watch.promise;
  const pending = h.refresh(); await settle();
  h.switchTo('remote'); watch.resolve(true); await pending;
  assert.equal(h.state().watched, ''); assert.equal(h.frames.length, 1,'initial camera no longer waits for watch acknowledgement');
  h.frames[0]();assert.equal(h.cameras.length,0,'old camera callback cannot frame the next building');
}
// Initial framing is deferred to a display tick and belongs to its original building.
{
  const h = harness(); await h.refresh(); assert.equal(h.frames.length, 1);
  h.switchTo('remote'); h.frames[0](); assert.equal(h.cameras.length, 0);
}
console.log('PASS: nonblocking reports/watches, hidden desktop supervision, stale world and watch results, immediate coalesced refresh and subscription retries');
