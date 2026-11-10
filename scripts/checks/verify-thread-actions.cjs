// Stop, rename and archive: backend validation and the exact T3 commands they send.
const assert = require('node:assert/strict');
const { threadCommand } = require('../../electron/thread-actions.cjs');
const state = status => () => ({ run: { status }, pendingRuns: 0 });
assert.deepEqual(threadCommand('stop', { threadId: 't' }, { local: state('running') }), { type: 'thread.stop', threadId: 't' });
assert.throws(() => threadCommand('stop', { threadId: 't' }, { local: state('completed') }), /Nothing is running/);
assert.deepEqual(threadCommand('stop', { threadId: 'env::t' }, { local: () => { throw Error('local read for a remote thread'); } }), { type: 'thread.stop', threadId: 'env::t' }, 'linked computers are never read through the local T3');
assert.deepEqual(threadCommand('rename', { threadId: 't', title: '  Fix\n the  login ' }), { type: 'thread.metadata.update', threadId: 't', title: 'Fix the login' });
assert.throws(() => threadCommand('rename', { threadId: 't', title: '   ' }), /Enter a name/);
assert.throws(() => threadCommand('rename', { threadId: 't', title: 'x'.repeat(121) }), /under 120/);
assert.deepEqual(threadCommand('archive', { threadId: 't' }, { local: state('completed') }), { type: 'thread.archive', threadId: 't' });
assert.throws(() => threadCommand('archive', { threadId: 't' }, { local: state('running') }), /Stop this thread/);
assert.throws(() => threadCommand('archive', { threadId: 'boss' }, { reserved: id => id === 'boss' ? 'The orchestrator stays.' : null }), /orchestrator stays/);
for (const bad of [null, {}, { threadId: '' }, { threadId: 5 }]) assert.throws(() => threadCommand('stop', bad), /Choose a thread/);
assert.throws(() => threadCommand('delete', { threadId: 't' }), /Unknown/);
console.log('PASS: stop, rename and archive validate input, refuse idle or busy threads, protect the orchestrator and keep linked computers isolated.');
