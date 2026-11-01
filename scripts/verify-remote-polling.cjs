const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteBuilding } = require('../electron/remote-building.cjs');

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function projection(text = 'initial', count = 1) {
  return {
    thread: { id: 't', title: 'Actual thread', providerInstanceId: 'codex', projectId: 'p', modelSelection: { model: 'example', options: [] } },
    runs: [{ id: 'r', status: 'running' }], runtimeRequests: [], messages: [],
    turnItems: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, runId: 'r', ordinal: i, updatedAt: 'unchanged-timestamp', type: 'assistant_message', status: 'running', text })),
  };
}
function fixture({ maxDetailEntries = 16 } = {}) {
  let clock = 1000, value = projection(), read = null;
  const calls = [], intervals = new Map(), timeouts = new Map();
  const client = {
    async fetch(environmentId, route) { calls.push({ environmentId, route }); return { projection: read ? await read() : structuredClone(value) }; },
    async rpc() { return { ok: true }; },
  };
  const building = createRemoteBuilding(client, {
    now: () => clock, maxDetailEntries,
    interval: fn => { const token = {}; intervals.set(token, fn); return token; }, cancel: token => intervals.delete(token),
    timeout: (fn, delay) => { const token = {}; timeouts.set(token, { fn, at: clock + delay }); return token; }, cancelTimeout: token => timeouts.delete(token),
  });
  return { building, calls, intervals, timeouts, get value() { return value; }, set read(fn) { read = fn; },
    async tick() { for (const fn of intervals.values()) void fn(); await flush(); },
    async advance(ms) { clock += ms; for (const [token, entry] of [...timeouts]) if (entry.at <= clock) { timeouts.delete(token); entry.fn(); } await flush(); },
  };
}

test('concurrent remote consumers share one read, stay environment-scoped and retry failures', async () => {
  const f = fixture(), gate = deferred(); f.read = () => gate.promise;
  const info = f.building.info('ares::t'), items = f.building.items('ares::t'), chat = f.building.conversation('ares::t');
  assert.equal(f.calls.length, 1);
  gate.resolve(projection()); await Promise.all([info, items, chat]);
  await f.building.info('other::t'); assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map(c => c.environmentId), ['ares', 'other']);
  await f.advance(1200);
  f.read = () => { throw Error('temporary failure'); };
  await assert.rejects(f.building.info('ares::t'), /temporary/);
  f.read = () => projection('retry');
  assert.equal((await f.building.items('ares::t'))[0].data.text, 'retry');
  assert.equal(f.calls.length, 4);
});

test('detail cache evicts old entries and releases its expiry timer after the reuse window', async () => {
  const f = fixture({ maxDetailEntries: 2 });
  for (const id of ['a', 'b', 'c']) await f.building.info(`ares::${id}`);
  assert.equal(f.timeouts.size, 1, 'one expiry timer for all cached detail');
  await f.building.info('ares::b'); assert.equal(f.calls.length, 3);
  await f.building.info('ares::a'); assert.equal(f.calls.length, 4, 'oldest entry was evicted');
  await f.advance(1200); assert.equal(f.timeouts.size, 0, 'idle cache expires without another read');
  await f.building.info('ares::a'); assert.equal(f.calls.length, 5);
});

test('watch sends only revised items and independently delivers run and title changes', async () => {
  const f = fixture(), batches = [], info = [];
  f.value.turnItems = projection('initial', 200).turnItems;
  const stop = f.building.watch('ares::t', (items, initial) => batches.push({ items, initial }), p => info.push(p));
  await flush(); assert.equal(batches[0].items.length, 200); assert.equal(batches[0].initial, true);
  await f.tick(); assert.equal(batches.length, 1); assert.equal(info.length, 1);
  f.value.turnItems[12].text = 'same timestamp revision';
  await f.tick(); assert.equal(batches.length, 2); assert.equal(batches[1].items.length, 1);
  assert.equal(batches[1].items[0].id, 'item-12'); assert.equal(batches[1].initial, false);
  f.value.runs[0].status = 'completed'; f.value.thread.title = 'Updated title';
  await f.tick(); assert.equal(batches.length, 2); assert.equal(info.at(-1).run.status, 'completed'); assert.equal(info.at(-1).title, 'Updated title');
  stop(); assert.equal(f.intervals.size, 0); assert.equal(f.timeouts.size, 0);
});

test('slow watches never overlap and stopping suppresses late events and retained detail', async () => {
  const f = fixture(), gate = deferred(), seen = [];
  f.read = () => gate.promise;
  const stop = f.building.watch('ares::t', p => seen.push(p), p => seen.push(p));
  await f.tick(); await f.tick(); assert.equal(f.calls.length, 1);
  stop(); gate.resolve(projection()); await flush();
  assert.equal(seen.length, 0); assert.equal(f.intervals.size, 0); assert.equal(f.timeouts.size, 0);
  await f.building.info('ares::t'); assert.equal(f.calls.length, 2, 'late stopped read did not repopulate cache');
});

test('successful actions invalidate old detail and a late pre-action read cannot overwrite it', async () => {
  const f = fixture(), old = deferred(); f.read = () => old.promise;
  const first = f.building.info('ares::t');
  await f.building.dispatch({ type: 'thread.rename', threadId: 'ares::t', title: 'New' });
  f.read = () => { const p = projection(); p.thread.title = 'New'; return p; };
  assert.equal((await f.building.info('ares::t')).title, 'New');
  old.resolve(projection()); await first;
  assert.equal((await f.building.info('ares::t')).title, 'New'); assert.equal(f.calls.length, 2);
});

test('repeated teardown cannot invalidate a replacement watch', async () => {
  const f = fixture(), stop = f.building.watch('ares::t', () => {}, () => {});
  await flush(); stop();
  const gate = deferred(); f.read = () => gate.promise;
  const replacement = f.building.watch('ares::t', () => {}, () => {});
  stop();
  const info = f.building.info('ares::t');
  assert.equal(f.calls.length, 2, 'replacement watch keeps ownership of its shared pending read');
  gate.resolve(projection()); await info; replacement();
  assert.equal(f.intervals.size, 0); assert.equal(f.timeouts.size, 0);
});
