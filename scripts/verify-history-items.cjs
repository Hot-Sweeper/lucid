const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createHistoryItemReader } = require('../electron/history-items.cjs');
function fixture(feed = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table orchestration_v2_projection_turn_items(turn_item_id text primary key,thread_id text,run_id text,ordinal integer,type text,status text,updated_at text,parent_item_id text,payload_json text);
    create index thread_items on orchestration_v2_projection_turn_items(thread_id,ordinal);`);
  if (feed) db.exec(`create table orchestration_events(sequence integer primary key,aggregate_kind text,stream_id text,event_type text,payload_json text);
    create index native_thread_sequence on orchestration_events(aggregate_kind,stream_id,sequence);`);
  const item = (id, thread = 't', type = 'compaction', status = 'running') => db.prepare('insert into orchestration_v2_projection_turn_items values(?,?,?,?,?,?,?,?,?)').run(id, thread, 'r', 1, type, status, 'fixed-time', null, '{}');
  const event = (id, type, eventType = 'turn-item.updated', thread = 't') => db.prepare('insert into orchestration_events(aggregate_kind,stream_id,event_type,payload_json) values(?,?,?,?)').run('thread', thread, eventType, JSON.stringify({ id, type, threadId: thread }));
  const queries = [];
  const connection = { prepare(sql) { queries.push(sql); return db.prepare(sql); } };
  const scans = () => queries.filter(sql => sql.includes("where thread_id=? and type in ('compaction'")).length;
  return { db, connection, item, event, scans, queries };
}
test('native indexed cache avoids repeated scans but keeps same-ordinal status/payload updates and deletion fresh', () => {
  const f = fixture(); f.item('c'); f.event('c', 'compaction');
  let clock = 0; const read = createHistoryItemReader({ now: () => clock, reconcileMs: 100 });
  assert.equal(read(f.connection, 't')[0].status, 'running');
  f.db.prepare("update orchestration_v2_projection_turn_items set status='completed',payload_json=? where turn_item_id='c'").run(JSON.stringify({ startedAt: 'new-time' }));
  const changed = read(f.connection, 't');
  assert.equal(changed[0].status, 'completed'); assert.equal(changed[0].at, 'new-time'); assert.equal(f.scans(), 1);
  f.event('reason', 'reasoning'); read(f.connection, 't'); assert.equal(f.scans(), 1, 'reasoning stream must not rescan context history');
  f.item('new'); f.event('new', 'compaction'); assert.equal(read(f.connection, 't').length, 2); assert.equal(f.scans(), 2);
  f.db.prepare("delete from orchestration_v2_projection_turn_items where turn_item_id='c'").run(); assert.equal(read(f.connection, 't').length, 1);
  f.item('direct'); clock = 101; assert.equal(read(f.connection, 't').length, 2, 'periodic reconciliation discovers direct edits without native events');
  assert.equal(f.db.prepare('pragma schema_version').get().schema_version, 4, 'runtime reader does not mutate schema');
  assert.ok(f.queries.some(q => q.includes('where turn_item_id=?')), 'warm path probes individual primary keys');
  f.db.close();
});
test('run/selection invalidation, rewind, LRU eviction and connection recreation preserve discovery', () => {
  const f = fixture(); const read = createHistoryItemReader({ maxThreads: 2 });
  for (const id of ['a', 'b', 'c']) { f.item(id, id); f.event(id, 'compaction', 'turn-item.updated', id); }
  read(f.connection, 'a'); read(f.connection, 'b'); read(f.connection, 'a'); read(f.connection, 'c'); read(f.connection, 'b'); assert.equal(f.scans(), 4);
  f.event('r', undefined, 'run.updated', 'b'); read(f.connection, 'b'); assert.equal(f.scans(), 5);
  f.db.exec('delete from orchestration_events'); f.event('b', 'compaction', 'turn-item.updated', 'b'); read(f.connection, 'b'); assert.equal(f.scans(), 6);
  const other = { prepare: sql => f.db.prepare(sql) }; assert.equal(read(other, 'a').length, 1);
  f.db.close();
});
test('legacy or unindexed feeds read fresh instead of relying on an unsafe watermark', () => {
  const f = fixture(false), read = createHistoryItemReader(); f.item('one'); assert.equal(read(f.connection, 't').length, 1);
  f.item('two'); assert.equal(read(f.connection, 't').length, 2); assert.equal(f.scans(), 2);
  f.db.exec('create table orchestration_events(sequence integer primary key,aggregate_kind text,stream_id text,event_type text,payload_json text)');
  f.event('two', 'compaction'); read(f.connection, 't'); f.item('three'); assert.equal(read(f.connection, 't').length, 3); assert.equal(f.scans(), 4);
  f.db.close();
});
