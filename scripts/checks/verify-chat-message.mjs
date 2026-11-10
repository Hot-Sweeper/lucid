import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../../src/office/chat-message.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'chat-message.ts')).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
const { sameChatMessage } = new Function(`${code};return {sameChatMessage}`)();
const message = {
  id: 'message', role: 'assistant', at: '2026-10-31T12:00:00Z', orderAt: '2026-10-31T12:00:00Z', sourceOrder: 1,
  text: 'Long conversation content. '.repeat(10000), streaming: false, run: 'running', queue: 0,
  queueRunId: 'run', steerTarget: 'target', queueFixed: false, queueGuest: false,
  attachments: [{ type: 'image', name: 'reference.png', mime: 'image/png', size: 256, path: 'E:/reference.png' }],
  event: { kind: 'handoff', status: 'completed', from: { provider: 'claudeAgent', model: 'old' }, to: { provider: 'codex', model: 'new' } },
};
assert.equal(sameChatMessage(undefined, message), false);
assert.equal(sameChatMessage(message, structuredClone(message)), true, 'IPC object identity must not force a rerender');
for (const key of ['id', 'role', 'at', 'orderAt', 'sourceOrder', 'text', 'streaming', 'run', 'queue', 'queueRunId', 'steerTarget', 'queueFixed', 'queueGuest']) {
  const next = structuredClone(message);
  next[key] = typeof next[key] === 'boolean' ? !next[key] : typeof next[key] === 'number' ? next[key] + 1 : `${next[key]} changed`;
  assert.equal(sameChatMessage(message, next), false, `${key} changes must be detected`);
}
for (const key of ['type', 'name', 'mime', 'size', 'path']) {
  const next = structuredClone(message);
  next.attachments[0][key] = key === 'size' ? 512 : `${next.attachments[0][key]} changed`;
  assert.equal(sameChatMessage(message, next), false, `attachment ${key} changes must be detected`);
}
const removed = structuredClone(message); removed.attachments = [];
assert.equal(sameChatMessage(message, removed), false);
for (const [section, key] of [['event', 'kind'], ['event', 'status'], ['from', 'provider'], ['from', 'model'], ['to', 'provider'], ['to', 'model']]) {
  const next = structuredClone(message);
  const target = section === 'event' ? next.event : next.event[section];
  target[key] += ' changed';
  assert.equal(sameChatMessage(message, next), false, `${section}.${key} changes must be detected`);
}
const noEvent = structuredClone(message); delete noEvent.event;
assert.equal(sameChatMessage(message, noEvent), false);
assert.equal(sameChatMessage(noEvent, structuredClone(noEvent)), true);
const noFrom = structuredClone(message); delete noFrom.event.from;
const emptyFrom = structuredClone(noFrom); emptyFrom.event.from = {};
assert.equal(sameChatMessage(noFrom, emptyFrom), false, 'a newly shown empty selection still changes event markup');
console.log('Chat message comparisons passed: cloned long content, streamed edits, ordering, queue state, attachments and context events.');
