import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = (await transformWithOxc(await readFile(new URL('../src/office/room-policy.ts', import.meta.url), 'utf8'), 'room-policy.ts')).code;
const { snakeSeat, reserveRoomSeats, projectRoomSeats } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
// Every removal closes a continuous snake, including turns at both row ends.
for (const count of [1, 2, 3, 4, 5, 6, 7, 9, 12]) {
  const claims = Array.from({ length: count }, (_, i) => ({ id: `snake${i}`, runStatus: i % 2 ? 'running' : 'queued' }));
  for (let removed = 0; removed < count; removed++) {
    const before = claims.map(t => t.id), remaining = claims.filter((_, i) => i !== removed);
    const seats = reserveRoomSeats(before, remaining);
    assert.deepEqual(seats.filter(Boolean), remaining.map(t => t.id), 'removal preserves the order of every surviving session');
    assert.deepEqual(reserveRoomSeats(seats, [...remaining].reverse()), seats, 'poll ordering and reloads do not shuffle the snake');
    assert.equal(projectRoomSeats(seats, remaining, false, null).slots, Math.max(1, count - 1));
  }
}
assert.deepEqual(Array.from({ length: 9 }, (_, i) => snakeSeat(i, 3)), [
  { c: 0, row: 0 }, { c: 1, row: 0 }, { c: 2, row: 0 },
  { c: 2, row: 1 }, { c: 1, row: 1 }, { c: 0, row: 1 },
  { c: 0, row: 2 }, { c: 1, row: 2 }, { c: 2, row: 2 },
]);
for (const cols of [1, 2, 3]) for (let i = 1; i < 36; i++) {
  const a = snakeSeat(i - 1, cols), b = snakeSeat(i, cols);
  assert.equal(Math.abs(a.c - b.c) + Math.abs(a.row - b.row), 1, 'consecutive desks are adjacent, including row turns');
}
console.log('PASS: stable compaction after every desk removal, running sessions, reload order, partial rows and snake turns');
