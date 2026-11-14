// Queued messages as the app reads and changes them: a message's own run decides whether it is
// waiting, delivered (also when promoted into the live turn) or removed; linked computers report
// the same facts; every queue action is the matching T3 command; and a linked computer's queue
// is changed on that computer with its own ids.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readConversation } = require('../../electron/conversation.cjs');
const { createRemoteBuilding } = require('../../electron/remote-building.cjs');
const { queuedText, withdrawn } = require('../../electron/queued.cjs');
const t3s = require('../../electron/t3server.cjs');

// --- the local reader -----------------------------------------------------------------------
const db = new DatabaseSync(':memory:');
db.exec(`create table orchestration_v2_projection_messages(message_id text primary key,thread_id text,role text,created_at text,streaming integer,payload_json text);
  create table orchestration_v2_projection_runs(run_id text primary key,thread_id text,status text,ordinal integer,payload_json text);
  create table orchestration_v2_projection_turn_items(turn_item_id text,thread_id text,run_id text,type text,status text,updated_at text,ordinal integer,parent_item_id text,payload_json text);`);
const at = (m) => `2026-11-14T10:${String(m).padStart(2, '0')}:00.000Z`;
const msg = (id, role, m, p) => db.prepare('insert into orchestration_v2_projection_messages values (?,?,?,?,?,?)').run(id, 't', role, at(m), 0, JSON.stringify(p));
const run = (id, n, status, p) => db.prepare('insert into orchestration_v2_projection_runs values (?,?,?,?,?)').run(id, 't', status, n, JSON.stringify(p));
run('r1', 1, 'running', { userMessageId: 'u1', startedAt: at(1) });
msg('u1', 'user', 1, { text: 'Start', runId: 'r1' });
msg('a1', 'assistant', 2, { text: 'Working on it', runId: 'r1' });
// waiting, in T3's delivery order (queuePosition beats ordinal)
run('r2', 2, 'queued', { userMessageId: 'q2', queuePosition: 2 }); msg('q2', 'user', 3, { text: 'Second', runId: 'r2' });
run('r3', 3, 'queued', { userMessageId: 'q3', queuePosition: 1 }); msg('q3', 'user', 4, { text: 'First', runId: 'r3' });
// removed from the queue: its run was cancelled before it started
run('r4', 4, 'cancelled', { userMessageId: 'gone', startedAt: null }); msg('gone', 'user', 5, { text: 'Never mind', runId: 'r4' });
// Send now: promoted into the live turn, so the message names r1 and its queued run ended cancelled
run('r5', 5, 'cancelled', { userMessageId: 'steered', startedAt: null }); msg('steered', 'user', 6, { text: 'Also this', runId: 'r1' });
let page = readConversation(db, 't');
let byId = new Map(page.messages.map((m) => [m.id, m]));
assert.deepEqual(page.messages.filter((m) => m.run === 'queued').sort((a, b) => a.queue - b.queue).map((m) => [m.id, m.queue, m.queueRunId, m.steerTarget]), [['q3', 1, 'r3', 'r1'], ['q2', 2, 'r2', 'r1']], 'the queue in delivery order, each with its run and the live turn to steer into');
assert.equal(byId.has('gone'), false, 'a message removed from the queue never reached the agent and is not in the conversation');
assert.equal(byId.get('steered').run, 'running', 'a message sent into the live turn is delivered, not removed');
assert.equal(byId.get('q2').queueHeld, false);
db.prepare("update orchestration_v2_projection_runs set payload_json = ? where run_id = 'r2'").run(JSON.stringify({ userMessageId: 'q2', queuePosition: 2, queueHeld: true }));
db.prepare("update orchestration_v2_projection_runs set status = 'interrupted' where run_id = 'r1'").run();
page = readConversation(db, 't'); byId = new Map(page.messages.map((m) => [m.id, m]));
assert.equal(byId.get('q2').queueHeld, true, 'a queue T3 holds after a stop is reported');
assert.equal(byId.get('q2').steerTarget, null, 'with nothing running, nothing can be steered into');
// delivered: the queued run started
db.prepare("update orchestration_v2_projection_runs set status = 'running', payload_json = ? where run_id = 'r3'").run(JSON.stringify({ userMessageId: 'q3', startedAt: at(9) }));
page = readConversation(db, 't'); byId = new Map(page.messages.map((m) => [m.id, m]));
assert.equal(byId.get('q3').run, 'running'); assert.equal(byId.get('q3').queueRunId, undefined);
assert.equal(byId.get('q2').queue, 1, 'the next message moves up');
db.close();

// --- to-do lines and shared rules -------------------------------------------------------------
assert.equal(queuedText({ text: 'Fix it\n\n<referenced_thread id="x" title="T" project="P">\nbody\n</referenced_thread>\n\nAttached:\n- image: /a.png\n- file: /b.md' }), 'Fix it (+ 2 attachments, thread)', 'files and threads become a short note, never raw blocks');
assert.equal(withdrawn({ status: 'cancelled', startedAt: null }), true);
assert.equal(withdrawn({ status: 'cancelled', startedAt: at(1) }), false, 'a run you stopped after it started did run');

(async () => {
  // --- linked computers report the same facts --------------------------------------------------
  const ENV = 'env-1', id = `${ENV}::t`;
  const projection = {
    thread: { id: 't', title: 'Remote', modelSelection: { instanceId: 'codex', model: 'gpt', options: [] } },
    runs: [{ id: 'R1', ordinal: 1, status: 'running', startedAt: at(1) }, { id: 'R2', ordinal: 2, status: 'queued', queuePosition: 2 }, { id: 'R3', ordinal: 3, status: 'queued', queuePosition: 1, queueHeld: false }, { id: 'R4', ordinal: 4, status: 'cancelled', startedAt: null }],
    messages: [{ id: 'u', role: 'user', text: 'Go', runId: 'R1', createdAt: at(1) }, { id: 'b', role: 'user', text: 'Later', runId: 'R2', createdAt: at(2) }, { id: 'c', role: 'user', text: 'Sooner', runId: 'R3', createdAt: at(3) }, { id: 'x', role: 'user', text: 'Removed', runId: 'R4', createdAt: at(4) }],
    turnItems: [], runtimeRequests: [],
  };
  const sent = [];
  const client = { fetch: async (env, url) => { assert.equal(env, ENV); return { projection }; }, rpc: async (environmentId, tag, payload) => { sent.push({ environmentId, tag, payload }); return { ok: true }; } };
  const building = createRemoteBuilding(client, { interval: () => 0, cancel: () => {} });
  const remote = await building.conversation(id);
  assert.deepEqual(remote.filter((m) => m.run === 'queued').sort((a, b) => a.queue - b.queue).map((m) => [m.id, m.queue, m.queueRunId, m.steerTarget]), [['c', 1, 'R3', 'R1'], ['b', 2, 'R2', 'R1']], "a linked computer's queue carries its own run ids, in delivery order");
  assert.equal(remote.some((m) => m.id === 'x'), false, 'removed messages stay out of a linked computer\'s conversation too');
  assert.deepEqual((await building.info(id)).queued.map((q) => q.id), ['R3', 'R2'], "the robot's to-do list follows T3's delivery order");

  // --- every queue action is the matching T3 command, on the computer that owns the thread ---
  t3s.setRemoteDispatch((command) => building.dispatch(command));
  await t3s.reorderQueued(id, 'R2', 'R3');
  await t3s.reorderQueued(id, 'R3', null);
  await t3s.editQueued(id, 'R2', 'New words');
  await t3s.cancelQueued(id, 'R2');
  await t3s.steerNow(id, 'R3', 'R1');
  await t3s.startQueued(id, 'R3');
  await t3s.startQueued(id, null);
  assert.deepEqual(sent.map((s) => s.payload.type), ['queued-run.reorder', 'queued-run.reorder', 'queued-run.edit', 'queued-run.cancel', 'queued-message.promote-to-steer', 'queued-run.start', 'queue.resume']);
  assert(sent.every((s) => s.environmentId === ENV && s.tag === 'orchestration.dispatchCommand' && s.payload.threadId === 't'), 'the owning computer receives its own thread id');
  assert.deepEqual(sent.map((s) => [s.payload.runId ?? s.payload.queuedRunId ?? null, s.payload.beforeRunId ?? s.payload.targetRunId ?? s.payload.text ?? null]),
    [['R2', 'R3'], ['R3', null], ['R2', 'New words'], ['R2', null], ['R3', 'R1'], ['R3', null], [null, null]], 'run ids pass through unchanged');
  assert(new Set(sent.map((s) => s.payload.commandId)).size === sent.length, 'each action is its own command');
  // invalid input never reaches T3
  const before = sent.length;
  await assert.rejects(t3s.editQueued(id, 'R2', '   '), /cannot be empty/);
  await assert.rejects(t3s.reorderQueued(id, '', null), /Choose a queued message/);
  await assert.rejects(t3s.steerNow(id, 'R3', null), /Choose a queued message/);
  await assert.rejects(t3s.cancelQueued({}, 'R2'), /Choose a queued message/);
  assert.equal(sent.length, before);
  t3s.setRemoteDispatch(null);
  await assert.rejects(t3s.cancelQueued(id, 'R2'), /not connected/, 'a linked computer\'s queue never falls back to the local T3');
  console.log('Queue data passed: own run decides waiting, delivered, steered and removed; held queues; linked computers in order with their own ids; every action maps to its T3 command on the owning computer; invalid input stays local.');
})().catch((err) => { console.error(err); process.exitCode = 1; });
