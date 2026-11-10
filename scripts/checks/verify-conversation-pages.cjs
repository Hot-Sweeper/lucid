const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { readConversation } = require('../../electron/conversation.cjs');
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table orchestration_v2_projection_messages(message_id text primary key,thread_id text,role text,created_at text,streaming integer,payload_json text);
    create table orchestration_v2_projection_runs(run_id text,thread_id text,status text,ordinal integer,payload_json text);
    create table orchestration_v2_projection_turn_items(turn_item_id text,thread_id text,run_id text,type text,status text,updated_at text,ordinal integer,parent_item_id text,payload_json text);`);
  const at = n => new Date(Date.UTC(2026, 9, 31, 12, 0, Math.floor(n / 3))).toISOString();
  const msg = (n, role = 'assistant', p = {}) => db.prepare('insert into orchestration_v2_projection_messages values (?,?,?,?,?,?)')
    .run(`m${n}`, 't', role, at(n), 0, JSON.stringify({ text: `Message ${n}`, ...p }));
  const run = (id, n, status, p) => db.prepare('insert into orchestration_v2_projection_runs values (?,?,?,?,?)').run(id, 't', status, n, JSON.stringify(p));
  return { db, at, msg, run };
}

test('memory housekeeping stays hidden without losing history or user content', () => {
  const { db, msg } = fixture();
  const batch = 'New messages the user wrote to robots. Learn lasting preferences from them and update memory.md:\n\n- [Robot] https://example.com';
  msg(0, 'user', { text: 'https://example.com' });
  msg(1, 'assistant', { text: batch });
  msg(2, 'user', { text: 'Please explain: ' + batch });
  msg(3, 'user', { text: batch });
  msg(4, 'user', { text: batch });
  const latest = readConversation(db, 't', { limit: 2 });
  assert.deepEqual(latest.messages, []);
  assert.equal(latest.hasMore, true);
  const older = readConversation(db, 't', { limit: 2, before: latest.cursor });
  const oldest = readConversation(db, 't', { limit: 2, before: older.cursor });
  assert.deepEqual([...oldest.messages, ...older.messages].map(m => m.id).sort(), ['m0', 'm1', 'm2']);
  assert.equal(db.prepare('select count(*) as n from orchestration_v2_projection_messages').get().n, 5);
  db.close();
});
test('205 real SQLite rows page without loss or duplicates across equal timestamps and new inserts', () => {
  const { db, msg } = fixture();
  for (let n = 0; n < 205; n++) msg(n);
  const initial = readConversation(db, 't');
  assert.equal(initial.messages.length, 80);
  assert.equal(initial.hasMore, true);
  assert.equal(initial.messages[0].id, 'm125');
  msg(205); // A new message cannot shift the older cursor like offset pagination would.
  const second = readConversation(db, 't', { before: initial.cursor });
  const third = readConversation(db, 't', { before: second.cursor });
  assert.deepEqual([second.messages.length, third.messages.length], [80, 45]);
  assert.equal(third.hasMore, false);
  assert.deepEqual([...third.messages, ...second.messages, ...initial.messages].map(m => m.id), Array.from({ length: 205 }, (_, n) => `m${n}`));
  assert.equal(readConversation(db, 'other').messages.length, 0);
  assert.equal(readConversation(db, 't', { limit: 100000 }).messages.length, 200);
  db.close();
});
test('old queued prompts stay pinned while each older page stays bounded', () => {
  const { db, msg, run } = fixture();
  for (let n = 0; n < 205; n++) msg(n, n === 0 ? 'user' : 'assistant');
  run('q', 999, 'queued', { userMessageId: 'm0', queuePosition: 1 });
  run('active', 998, 'running', { startedAt: '2026-10-31T12:02:00Z' });
  const page = readConversation(db, 't');
  assert.equal(page.messages.length, 81);
  const q = page.messages.find(m => m.id === 'm0');
  assert.equal(q.queueRunId, 'q'); assert.equal(q.steerTarget, 'active'); assert.equal(q.queue, 1);
  assert.equal(page.cursor.rowid, 126);
  assert.equal(readConversation(db, 't', { before: page.cursor }).messages.length, 80);
  db.close();
});
test('older pages retain persisted run chronology, attachments and context events before the first message', () => {
  const { db, at, msg, run } = fixture();
  for (let n = 0; n < 205; n++) msg(n, n === 0 ? 'user' : 'assistant', n === 0 ? { attachments: [{ type: 'image', name: 'real.png', mimeType: 'image/png', sizeBytes: 15 }] } : {});
  run('old', 0, 'completed', { userMessageId: 'm0', startedAt: at(5), modelSelection: { instanceId: 'codex', model: 'a' } });
  for (let n = 1; n <= 100; n++) run(`r${n}`, n, 'completed', { startedAt: at(n + 10), modelSelection: { instanceId: n < 40 ? 'codex' : 'claudeAgent', model: n < 20 ? 'a' : 'b' } });
  const item = db.prepare('insert into orchestration_v2_projection_turn_items values (?,?,?,?,?,?,?,?,?)');
  item.run('leading', 't', 'old', 'compaction', 'completed', '2026-10-31T11:59:00Z', 0, null, '{}');
  item.run('handoff', 't', 'r40', 'handoff', 'completed', at(50), 40, null, '{}');
  let cursor, all = [];
  do { const page = readConversation(db, 't', { before: cursor }, a => `C:/files/${a.name}`); all.push(...page.messages); cursor = page.hasMore ? page.cursor : null; } while (cursor);
  const old = all.find(m => m.id === 'm0');
  assert.equal(old.run, 'completed'); assert.equal(old.orderAt, at(5));
  assert.equal(old.attachments[0].path, 'C:/files/real.png');
  assert.ok(all.some(m => m.id === 'leading'));
  assert.equal(new Set(all.filter(m => m.event).map(m => m.event.kind)).size, 3);
  assert.equal(all.filter(m => m.id === 'selection:r40').length, 0, 'persisted handoff suppresses duplicate inferred harness event');
  db.close();
});
test('the work log: one summary per turn, only when asked, placed like T3 and never leaking tool output', () => {
  const { db, at, msg, run } = fixture();
  msg(0, 'user', { text: 'Fix it' });
  msg(3, 'assistant', { text: 'Looking' });
  msg(9, 'assistant', { text: 'Done' });
  msg(12, 'user', { text: 'Again' });
  msg(15, 'assistant', { text: 'On it' });
  run('r1', 1, 'completed', { userMessageId: 'm0', startedAt: at(0), completedAt: at(10) });
  run('r2', 2, 'running', { userMessageId: 'm12', startedAt: at(12) });
  const item = (id, runId, type, status, p) => db.prepare('insert into orchestration_v2_projection_turn_items values (?,?,?,?,?,?,?,?,?)')
    .run(id, 't', runId, type, status, at(5), Number(id.slice(1)), null, JSON.stringify(p));
  item('i1', 'r1', 'command_execution', 'completed', { input: '/bin/bash -lc "npm test"', output: 'x'.repeat(100000) });
  item('i2', 'r1', 'file_change', 'completed', { fileName: '/repo/src/a.ts' });
  item('i3', 'r1', 'file_change', 'completed', { fileName: '/repo/src/a.ts' });
  item('i4', 'r1', 'command_execution', 'failed', { input: 'make' });
  item('i5', 'r1', 'reasoning', 'completed', { text: 'thinking' });
  item('i6', 'r2', 'web_search', 'running', { patterns: ['lucid'] });
  assert.equal(readConversation(db, 't').messages.filter(m => m.role === 'work').length, 0, 'other readers never see work rows');
  const order = readConversation(db, 't', { work: true }).messages.map(m => m.id);
  assert.deepEqual(order, ['m0', 'm3', 'work:r1', 'm9', 'm12', 'm15', 'work:r2'], 'finished: above the final reply; live: at the bottom');
  const w = readConversation(db, 't', { work: true }).messages.find(m => m.id === 'work:r1').work;
  assert.deepEqual([w.commands, w.edits, w.failed, w.total], [2, 1, 1, 4]);
  assert.equal(w.lines[0].t, 'npm test', 'shell wrappers are removed');
  assert(JSON.stringify(w).length < 2000, 'tool output stays in SQLite');
  db.close();
});
