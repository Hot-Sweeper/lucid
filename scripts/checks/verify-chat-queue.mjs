// The chat's queue is the one place a queued message lives: never a transcript bubble while T3
// holds it as queued, a message sent while the robot works waits in the queue (not the
// transcript), delivery moves it into the transcript, edits keep files and threads, and each
// row action is the matching T3 operation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const load = async (file, names) => {
  const code = (await transformWithOxc(await read(file), file)).code.replace(/^import[^;]+;\n/gm, '').replace(/^export /gm, '');
  return new Function(`${code}; return { ${names.join(', ')} };`)();
};
const { splitQueue, pendingPlace, settlePending, deliveredIds, orderLabel, queueSummary, rowActions, reorderPlan } = await load('src/office/queue-model.ts', ['splitQueue', 'pendingPlace', 'settlePending', 'deliveredIds', 'orderLabel', 'queueSummary', 'rowActions', 'reorderPlan']);
const { messageParts, composeMessage } = await load('src/office/message-parts.ts', ['messageParts', 'composeMessage']);

const at = (m) => `2026-11-14T10:${String(m).padStart(2, '0')}:00.000Z`;
const user = (id, m, extra = {}) => ({ id, role: 'user', at: at(m), text: id, attachments: [], ...extra });
const q = (id, pos, extra = {}) => user(id, pos, { run: 'queued', queue: pos, queueRunId: `r-${id}`, steerTarget: 'live', ...extra });

// one source of truth: queued messages never reach the transcript, in delivery order
const msgs = [user('a', 1, { run: 'running' }), { id: 'b', role: 'assistant', at: at(2), text: 'ok', attachments: [] }, q('y', 2), q('x', 1)];
const { timeline, queued } = splitQueue(msgs);
assert.deepEqual(timeline.map((m) => m.id), ['a', 'b']);
assert.deepEqual(queued.map((m) => m.id), ['x', 'y'], 'the queue is in T3 delivery order');
assert.ok(!timeline.some((m) => m.run === 'queued'), 'no transcript bubble while queued');

// delivery: a message that was waiting and now is in the transcript moves there
const delivered = splitQueue([...msgs.filter((m) => m.id !== 'x'), user('x', 1, { run: 'running' })]);
assert.deepEqual(deliveredIds(queued.map((m) => m.id), delivered.timeline), ['x']);
assert.deepEqual(delivered.queued.map((m) => m.id), ['y'], 'and it leaves the queue');
assert.deepEqual(deliveredIds(['gone'], delivered.timeline), [], 'a removed message is not a delivery');

// a send waits where it will land
assert.equal(pendingPlace(true, 0), 'queue', 'while the robot works, T3 queues it');
assert.equal(pendingPlace(false, 2), 'queue', 'behind others still waiting');
assert.equal(pendingPlace(false, 0), 'transcript');
const known = new Set(['old']);
const pend = (key, text, extra = {}) => ({ key, threadId: 't', text, at: 0, place: 'queue', known, ...extra });
const twice = [pend('1', 'same'), pend('2', 'same')];
assert.equal(settlePending(twice, 't', [{ id: 'old', role: 'user', text: 'same' }], 10).length, 2, 'a message T3 already had cannot stand in for a new send');
assert.equal(settlePending(twice, 't', [{ id: 'n1', role: 'user', text: 'same' }], 10).length, 1, 'each new message replaces exactly one identical pending send');
assert.equal(settlePending(twice, 't', [{ id: 'n1', role: 'user', text: 'same' }, { id: 'n2', role: 'user', text: ' same ' }], 10).length, 0);
assert.equal(settlePending([pend('3', 'x', { threadId: 'other' })], 't', [{ id: 'n', role: 'user', text: 'x' }], 10).length, 1, 'another conversation keeps its pending sends');
assert.equal(settlePending([pend('4', 'lost')], 't', [], 1e9).length, 1, 'a send still on its way never times out');
assert.equal(settlePending([pend('5', 'lost', { sentAt: 0 })], 't', [], 61_000).length, 0, 'a send T3 accepted but never listed gives up after a minute');

// labels
assert.deepEqual([0, 1, 2].map(orderLabel), ['Next', '2', '3']);
assert.equal(queueSummary(2, false), '2 waiting');
assert.equal(queueSummary(3, true), '3 waiting, paused');

// row actions map to T3 operations
const items = [q('auto', 1, { queueFixed: true }), q('m1', 2), q('m2', 3, { queueGuest: true })];
assert.equal(rowActions(items, 0, true).move, false, 'automatic reports cannot be changed');
assert.equal(rowActions(items, 0, true).remove, false);
const a1 = rowActions(items, 1, true);
assert.deepEqual([a1.move, a1.up, a1.down, a1.edit, a1.send, a1.remove], [true, false, true, true, 'steer', true], 'below an automatic report nothing moves up; Send now steers into the live turn');
assert.equal(rowActions(items, 2, true).edit, false, "a guest's message cannot be edited");
assert.equal(rowActions([q('h', 1, { steerTarget: null, queueHeld: true })], 0, true).send, 'start', 'after a stop, Send now starts the next turn with it');
assert.equal(rowActions([q('w', 1, { steerTarget: null })], 0, true).send, null, 'a queue about to start on its own has no Send now');
assert.equal(rowActions(items, 1, false).move, false, 'without a paired T3 session the queue is read-only');
// reorder: the run T3 wants it in front of
const order = [q('a', 1), q('b', 2), q('c', 3)];
assert.deepEqual(reorderPlan(order, 'r-c', 0), { order: ['r-c', 'r-a', 'r-b'], beforeRunId: 'r-a', to: 0 });
assert.deepEqual(reorderPlan(order, 'r-a', 2), { order: ['r-b', 'r-c', 'r-a'], beforeRunId: null, to: 2 }, 'the end of the queue is null');
assert.equal(reorderPlan(order, 'r-a', -4), null, 'moving past the top is no move');
assert.equal(reorderPlan([q('f', 1, { queueFixed: true }), ...order], 'r-b', 0).to, 1, 'automatic reports at the front keep their place');

// editing changes only your words; threads and the files you keep go back unchanged
const ref = '<referenced_thread id="t1" title="Nameplates" project="Lucid" harness="codex">\nRead it.\n</referenced_thread>';
const sent = `Fix the tags\nand the hover\n\n${ref}\n\nAttached:\n- image: /x/1794-shot.png\n- file: /x/notes.md`;
const parts = messageParts(sent);
assert.equal(parts.body, 'Fix the tags\nand the hover');
assert.deepEqual(parts.refs, [{ id: 't1', title: 'Nameplates', project: 'Lucid', harness: 'codex' }]);
assert.deepEqual(parts.files.map((f) => [f.kind, f.name]), [['image', 'shot.png'], ['file', 'notes.md']]);
assert.equal(composeMessage(parts, parts.body, parts.files), sent, 'an unchanged edit is the same message');
assert.equal(composeMessage(parts, 'Only tags', parts.files.slice(1)), `Only tags\n\n${ref}\n\nAttached:\n- file: /x/notes.md`);
assert.equal(composeMessage(messageParts('Hi'), '', [{ kind: 'image', path: '/p.png', name: 'p.png' }]), 'Have a look at the attached files.\n\nAttached:\n- image: /p.png');

// wiring: the transcript renders only the timeline, sends wait in the queue while working,
// deliveries fly from the queue, and the queue calls the T3 operations it shows
const panel = await read('src/office/chat-panel.ts'), queue = await read('src/office/chat-queue.ts');
assert.match(panel, /const \{ timeline, queued \} = splitQueue\(msgs\);/);
assert.match(panel, /for \(const m of timeline\) \{\n\s+let el = this\.shown\.get\(m\.id\);/, 'transcript bubbles come only from the timeline');
assert.match(panel, /place: threadId === this\.threadId \? pendingPlace\(this\.working, this\.queue\.size\)/);
assert.match(panel, /mine\.filter\(\(p\) => p\.place === "transcript"\)/, 'only sends that will land in the transcript wait there');
assert.match(panel, /this\.queue\.rects\(deliveredIds\(this\.queue\.ids, timeline\)\)/);
assert.match(panel, /this\.settlePending\(msgs\);\n/, 'pending sends settle on every refresh, even when the transcript is unchanged');
assert.ok(panel.indexOf('this.settlePending(msgs);') < panel.indexOf('if (!changed.size && !reordered)'), 'settling happens before the unchanged-transcript early return');
assert.match(panel, /label = this\.working \? "Queue" : "Send"/);
assert.match(queue, /t3\.steer\(\{ threadId, queuedRunId: run, targetRunId: m\.steerTarget \}\)/);
assert.match(queue, /t3\.startQueued\(\{ threadId, runId: run \}\)/);
assert.match(queue, /t3\.reorder\(\{ threadId, runId: li\.dataset\.run!, beforeRunId: plan\.beforeRunId \}\)/);
assert.match(queue, /t3\.edit\(\{ threadId, runId: run, text \}\)/);
assert.match(queue, /t3\.cancel\(\{ threadId, runId: run \}\)/);
assert.ok((queue.match(/this\.busy\.has\(/g) || []).length >= 5, 'every queue action ignores repeats while one is on its way');
assert.doesNotMatch(await read('src/office/chat-queue.css'), /line-clamp|text-overflow: ellipsis[^}]*cq-text/, 'queued words are never cut with an ellipsis');
console.log('Chat queue passed: one place while queued, delivery moves it, sends wait where they land, clock-free settling, labels, T3 action mapping, edits keep files and threads, repeat protection.');
