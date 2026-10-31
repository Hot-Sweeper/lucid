const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
let messageAudience, peerToolMessage, peerDelivery;
test.before(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/harness/conversations.ts'), 'utf8');
  const code = stripTypeScriptTypes(source);
  ({ messageAudience, peerToolMessage, peerDelivery } = await import('data:text/javascript,' + encodeURIComponent(code)));
});
test('an MCP-originated user message still belongs to the user', () => {
  assert.equal(messageAudience({ createdBy: 'user', creationSource: 'mcp' }), 'user');
});
test('explicit agent senders and their thread references route to T3 Code', () => {
  assert.equal(messageAudience({ createdBy: 'agent' }), 'agent');
  assert.equal(messageAudience({ senderThreadId: 'peer' }), 'agent');
});
test('T3 and native collaboration message tools keep their actual recipient and text', () => {
  assert.deepEqual(peerToolMessage('mcp__t3_code__t3_thread_send', { threadId: 'peer', message: 'Review the patch' }), { target: 'peer', text: 'Review the patch' });
  assert.deepEqual(peerToolMessage('collaboration.send_message', { target: 'reviewer', message: 'Here is the result' }), { target: 'reviewer', text: 'Here is the result' });
  assert.deepEqual(peerToolMessage('SendMessage', { recipient: 'worker', content: 'Check the issue' }), { target: 'worker', text: 'Check the issue' });
});
test('external messaging tools and missing message bodies are not agent conversations', () => {
  assert.equal(peerToolMessage('mcp__slack__send_message', { target: 'channel', message: 'Hello' }), null);
  assert.equal(peerToolMessage('t3_thread_read', { threadId: 'peer' }), null);
  assert.equal(peerToolMessage('t3_thread_send', { threadId: 'peer', message: '' }), null);
});

test('a still-running message is never shown as sent', () => {
  assert.equal(peerDelivery({status:'running'}), 'sending');
  assert.equal(peerDelivery({status:'pending'}), 'sending');
  assert.equal(peerDelivery({status:'completed', data:{output:{ok:true}}}), 'sent');
});
test('tool and structured delivery failures stay visible', () => {
  assert.equal(peerDelivery({status:'failed'}), 'failed');
  assert.equal(peerDelivery({status:'completed', data:{output:{isError:true}}}), 'failed');
  assert.equal(peerDelivery({status:'completed', data:{output:{structuredContent:{ok:false}}}}), 'failed');
});
