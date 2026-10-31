const test = require('node:test');
const assert = require('node:assert/strict');
const { RemoteWorld } = require('../electron/remote-world.cjs');
const { originOf } = require('../electron/remote-rpc.cjs');
const project = { id: 'project', title: 'Actual project', workspaceRoot: 'E:\\Work\\App' };
const thread = { id: 'actual-thread', projectId: 'project', title: 'Actual task', createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-30T12:00:00Z', providerInstanceId: 'codex', modelSelection: { instanceId: 'codex', model: 'real-model', options: [{ id: 'reasoningEffort', value: 'high' }] }, status: 'completed', settledAt: null, worktreePath: 'E:\\Worktrees\\App-feature' };
function fixture(extra = {}) {
  const remote = new RemoteWorld({ id: 'remote' });
  remote.shell = { projects: [project], threads: [thread] }; remote.ready = Promise.resolve();
  const projection = { thread, runs: [], messages: [], turnItems: [], runtimeRequests: [], ...extra };
  remote.projection = async () => projection;
  return { remote, projection };
}
test('repository icon enrichment cannot replace the authoritative thread snapshot', async () => {
  const remote = new RemoteWorld({ id: 'remote' }); let emit;
  remote.rpc = { call: async (_tag, _payload, receive) => {
    emit = receive;
    receive({ kind: 'snapshot', snapshot: { projects: [project], threads: [thread] } });
    receive({ kind: 'snapshot', resolvedRepositoryIdentityRoots: [project.workspaceRoot], snapshot: { projects: [{ ...project, title: 'Enriched project' }], threads: [] } });
    receive({ kind: 'synchronized' });
  }, close() {} };
  const world = await remote.world();
  assert.equal(world.threads.length, 1);
  assert.equal(world.projects[0].title, 'Enriched project');
  emit({ kind: 'thread.updated', location: 'archive', thread });
  assert.equal((await remote.world()).threads.length, 0);
});
test('settled and unsettled status follows the machine, without invented shipped totals', async () => {
  const { remote } = fixture();
  remote.shell.threads = [{ ...thread, settledAt: '2026-10-29T12:00:00Z', settledOverride: 'active', unsettledAt: '2026-10-30T12:00:00Z' }];
  assert.equal((await remote.world()).threads[0].settled, false);
  remote.shell.threads[0].settledOverride = 'settled';
  const world = await remote.world(); assert.equal(world.threads[0].settled, true); assert.equal(world.shipped, undefined);
});
test('old queued messages survive the history window and keep server queue positions', async () => {
  const messages = [{ id: 'queued-old', role: 'user', createdAt: '2026-10-01T12:00:00Z', text: 'Actual queued task', attachments: [] }, ...Array.from({ length: 110 }, (_, i) => ({ id: 'm' + i, role: 'assistant', createdAt: new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString(), text: 'Reply ' + i, attachments: [] }))];
  const { remote } = fixture({ messages, runs: [{ id: 'queued-run', userMessageId: 'queued-old', status: 'queued', ordinal: 2, queuePosition: 5 }, { id: 'active-run', userMessageId: 'm0', status: 'running', ordinal: 1 }] });
  const chat = await remote.conversation(thread.id), waiting = chat.find((m) => m.id === 'queued-old');
  assert.equal(waiting.queueRunId, 'queued-run'); assert.equal(waiting.queue, 1); assert.equal(waiting.steerTarget, 'active-run'); assert.equal(chat.length, 101);
});
test('remote reads use the remote workspace, including worktrees, and never fall back locally', async () => {
  const { remote } = fixture(); const calls = [];
  remote.rpc = { call: async (tag, payload) => { calls.push({ tag, payload }); return { contents: 'Actual source' }; } };
  assert.equal(await remote.readText('E:\\Worktrees\\App-feature\\src\\main.ts'), 'Actual source');
  assert.deepEqual(calls[0], { tag: 'projects.readFile', payload: { cwd: thread.worktreePath, relativePath: 'src/main.ts' } });
  assert.equal(await remote.readText('C:\\Unrelated\\file.ts'), null); assert.equal(calls.length, 1);
});
test('dispatching queues on the actual active run and uses the current T3 protocol', async () => {
  const { remote } = fixture({ runs: [{ status: 'running' }] }); let command;
  remote.rpc = { dispatch: async (c) => { command = c; } };
  await remote.sendMessage({ threadId: thread.id, message: 'User message' });
  assert.equal(command.type, 'message.dispatch'); assert.equal(command.threadId, thread.id); assert.equal(command.text, 'User message'); assert.deepEqual(command.dispatchMode, { type: 'queue_after_active' });
  assert.equal(command.createdBy, 'user'); assert.ok(command.messageId);
});
test('only HTTP origins without URL credentials are accepted', () => {
  assert.equal(originOf('https://example.com/path'), 'https://example.com');
  assert.throws(() => originOf('file:///C:/Users/file')); assert.throws(() => originOf('https://user:secret@example.com'));
});
test('uploaded files are native T3 attachments, without unusable local file paths in the prompt', async () => {
  const { remote } = fixture(); const ref = 't3-attachment:real-upload';
  const attachment = { type: 'image', id: 'upload-id', name: 'proof.png', mimeType: 'image/png', sizeBytes: 100 };
  remote.uploads.set(ref, attachment); let command;
  remote.rpc = { dispatch: async (c) => { command = c; } };
  await remote.sendMessage({ threadId: thread.id, message: 'Review this.\n\nAttached:\n- image: ' + ref });
  assert.deepEqual(command.attachments, [attachment]); assert.equal(command.text, 'Review this.'); assert.equal(remote.uploads.size, 0);
});
