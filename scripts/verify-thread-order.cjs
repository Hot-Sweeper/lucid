const assert = require('node:assert/strict');
const { sortThreads, orderKeys, moveAssignments } = require('../electron/thread-order.cjs');
const make = (id, extra = {}) => ({ id, pinned: false, settled: false, createdAt: '2026-10-01', updatedAt: '2026-10-01', ...extra });
const rows = [make('old'), make('new', { createdAt: '2026-10-02' }), make('manual', { activeOrderKey: 'n' }), make('pin', { pinned: true }), make('settled', { settled: true })];
const ids = rows => sortThreads(rows).map(t => t.id);
assert.deepEqual(ids(rows), ['pin', 'new', 'old', 'manual', 'settled']);
assert.deepEqual(ids(rows.map(t => ({ ...t, updatedAt: t.id === 'old' ? '2026-11-01' : '2026-09-01', runStatus: 'running' }))), ids(rows), 'Streaming and run state must not shuffle rows');
const apply = (rows, assignments) => rows.map(t => {
  const a = assignments.find(a => a.threadId === t.id);
  return a ? { ...t, [a.pinned ? 'pinOrderKey' : 'activeOrderKey']: a.orderKey } : t;
});
let moved = apply(rows, moveAssignments(rows, 'old', 'new'));
assert.deepEqual(ids(moved), ['pin', 'old', 'new', 'manual', 'settled']);
moved = apply(moved, moveAssignments(moved, 'old', 'manual', true));
assert.deepEqual(ids(moved), ['pin', 'new', 'manual', 'old', 'settled']);
assert.deepEqual(ids(JSON.parse(JSON.stringify(moved))), ids(moved), 'Saved T3 keys survive reload');
assert.throws(() => moveAssignments(rows, 'new', 'pin'));
assert.throws(() => moveAssignments(rows, 'new', 'settled'));
assert.throws(() => moveAssignments(rows, 'missing', 'new'));
assert.deepEqual(moveAssignments(rows, 'new', 'new'), []);
assert.deepEqual(ids([make('p1', { pinned: true, pinOrderKey: 'z' }), make('p2', { pinned: true, pinOrderKey: 'b' })]), ['p2', 'p1']);
assert.deepEqual(ids([make('s1', { settled: true, settledAt: '2026-10-02', updatedAt: '2026-11-01' }), make('s2', { settled: true, settledAt: '2026-10-03' })]), ['s2', 's1']);
for (const count of [1, 10, 142, 1000]) {
  const keys = orderKeys(count);
  assert.equal(new Set(keys).size, count);
  assert.deepEqual([...keys].sort(), keys);
  assert(keys.every(k => /^[a-z]+$/.test(k) && !k.endsWith('a')));
}
console.log('Thread ordering: stable activity, T3 keys, moves, boundaries, reload and pagination sizes passed.');
