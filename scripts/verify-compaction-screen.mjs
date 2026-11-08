import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const text = (await readFile('src/os/compaction.ts', 'utf8')).split('/** An OS update screen')[0].replace(/^import .*;\r?\n/gm, '');
const { code } = await transformWithOxc(text, 'compaction.ts');
const { CompactionState } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const info = (status = 'running', runId = 'run-a', id = 'local-thread') => ({id, run:{id:runId,status}});
const item = (status = 'running', extra = {}) => ({id:'compact-a',runId:'run-a',ordinal:3,type:'compaction',status,updatedAt:'2026-11-08T16:00:00Z',data:{parentItemId:null},...extra});

let state = new CompactionState();
assert.equal(state.observe([item()], null), null);
assert.equal(state.observe([item()], info()).id, 'compact-a', 'real start opens immediately');
assert.equal(state.observe([], info()).id, 'compact-a', 'unrelated metadata refresh retains a live operation');
assert.equal(state.observe([item('completed')], info()), null);
assert.equal(state.observe([item('running', {updatedAt:'2026-11-08T16:00:01Z'})], info()), null, 'late running snapshots cannot reopen a completed operation');
assert.equal(state.observe([item('running',{id:'compact-b',ordinal:4})], info()).id, 'compact-b');
assert.equal(state.observe([item()], info()).id, 'compact-b', 'older compactions cannot replace the current operation');
for (const terminal of ['completed','failed','interrupted','cancelled']) {
  state = new CompactionState(); state.observe([item()], info());
  assert.equal(state.observe([item(terminal)], info()), null, terminal);
}
for (const terminal of ['completed','failed','interrupted','cancelled','stopped']) {
  state = new CompactionState(); state.observe([item()], info());
  assert.equal(state.observe([], info(terminal)), null, 'turn termination closes the screen');
  assert.equal(state.observe([item()], info()), null, 'stale metadata cannot revive a terminated run');
}
state = new CompactionState();
assert.equal(state.observe([item('pending')], info()), null, 'queued work is not an active compaction');
assert(state.observe([item()], info()), 'pending may transition to running');
state.clear();
assert.equal(state.observe([item('completed')], info()), null, 'historical completion never replays a progress screen');
assert.equal(state.observe([item('running',{runId:'old-turn'})], info()), null);
assert.equal(state.observe([item('running',{data:{parentItemId:'child'}})], info()), null, 'a helper compaction does not take over its parent monitor');
assert.equal(state.observe([item('running',{type:'assistant_message',data:{text:'Compacting context'}})], info()), null, 'prose is not a compaction signal');
state.clear(); assert(state.observe([item()], info()));
assert.equal(state.observe([], info('running','run-b')), null, 'run handoff clears prior state');
assert.equal(state.observe([], info('running','run-b','ares::remote-thread')), null, 'environment handoff clears prior state');

console.log('PASS: real starts, finish/failure/stop, stale event ordering, initial history, pending transitions, helpers and environment isolation.');
