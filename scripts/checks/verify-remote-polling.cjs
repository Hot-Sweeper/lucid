const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteBuilding } = require('../../electron/remote-building.cjs');

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
  let clock = 1000, value = projection(), read = null, sequence = null;
  const calls = [], intervals = new Map(), timeouts = new Map();
  const client = {
    async fetch(environmentId, route) { calls.push({ environmentId, route }); return { projection: read ? await read(route) : structuredClone(value), ...(sequence === null ? {} : { snapshotSequence: sequence }) }; },
    async rpc() { return { ok: true }; },
  };
  const building = createRemoteBuilding(client, {
    now: () => clock, maxDetailEntries,
    interval: fn => { const token = {}; intervals.set(token, fn); return token; }, cancel: token => intervals.delete(token),
    timeout: (fn, delay) => { const token = {}; timeouts.set(token, { fn, at: clock + delay }); return token; }, cancelTimeout: token => timeouts.delete(token),
  });
  return { building, calls, intervals, timeouts, get value() { return value; }, set read(fn) { read = fn; }, set sequence(n) { sequence = n; },
    async tick() { for (const fn of intervals.values()) void fn(); await flush(); },
    async advance(ms) { clock += ms; for (const [token, entry] of [...timeouts]) if (entry.at <= clock) { timeouts.delete(token); entry.fn(); } await flush(); },
  };
}

test('concurrent remote consumers share one read per kind, stay environment-scoped and retry failures', async () => {
  const f = fixture(), gate = deferred(); f.read = () => gate.promise;
  const info = f.building.info('ares::t'), items = f.building.items('ares::t'), pending = f.building.pending('ares::t'), chat = f.building.conversation('ares::t');
  // Desk, status and questions share one bounded read; only the conversation reads the whole thread.
  assert.deepEqual(f.calls.map(c => c.route), ['/api/orchestration/threads/t/bounded', '/api/orchestration/threads/t']);
  gate.resolve(projection()); await Promise.all([info, items, pending, chat]);
  await f.building.info('other::t'); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls.map(c => c.environmentId), ['ares', 'ares', 'other']);
  await f.advance(1200);
  f.read = () => { throw Error('temporary failure'); };
  await assert.rejects(f.building.info('ares::t'), /temporary/);
  f.read = () => projection('retry');
  assert.equal((await f.building.items('ares::t'))[0].data.text, 'retry');
  assert.equal(f.calls.length, 5);
});

test('a computer without bounded snapshots is read in full from then on', async () => {
  const f = fixture();
  f.read = route => { if (route.endsWith('/bounded')) throw Object.assign(Error('not found'), { status: 404 }); return projection(); };
  await f.building.info('old::a'); await f.building.info('old::b');
  assert.deepEqual(f.calls.map(c => c.route), ['/api/orchestration/threads/a/bounded', '/api/orchestration/threads/a', '/api/orchestration/threads/b']);
  f.read = () => { throw Object.assign(Error('refused'), { status: 403 }); };
  await assert.rejects(f.building.info('ares::c'), /refused/); assert.equal(f.calls.length, 4, 'other failures are not retried in full');
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

test('watches skip unchanged threads and read finished ones every third beat', async () => {
  const f = fixture(), batches = [], info = [];
  f.sequence = 7;
  const stop = f.building.watch('ares::t', items => batches.push(items), p => info.push(p));
  await flush(); assert.equal(batches.length, 1); assert.equal(f.calls[0].route, '/api/orchestration/threads/t/bounded');
  // Running: read on every beat, but the same sequence means nothing changed and nothing is diffed.
  f.value.turnItems[0].text = 'not yet visible';
  await f.tick(); assert.equal(f.calls.length, 2); assert.equal(batches.length, 1);
  f.sequence = 8;
  await f.tick(); assert.equal(f.calls.length, 3); assert.equal(batches.length, 2); assert.equal(batches[1][0].data.text, 'not yet visible');
  // Finished with nothing waiting: two beats rest, the third reads.
  f.value.runs[0].status = 'completed'; f.sequence = 9;
  await f.tick(); assert.equal(f.calls.length, 4); assert.equal(info.at(-1).run.status, 'completed');
  await f.tick(); await f.tick(); assert.equal(f.calls.length, 4);
  await f.tick(); assert.equal(f.calls.length, 5);
  // A question keeps it on every beat.
  f.value.runtimeRequests = [{ id: 'q', status: 'pending', kind: 'user_input', questions: [] }]; f.sequence = 10;
  await f.tick(); await f.tick(); assert.equal(f.calls.length, 5);
  await f.tick(); assert.equal(f.calls.length, 6);
  await f.tick(); assert.equal(f.calls.length, 7, 'a waiting question is read on every beat');
  await f.tick(); assert.equal(f.calls.length, 8);
  stop(); assert.equal(f.intervals.size, 0);
});
