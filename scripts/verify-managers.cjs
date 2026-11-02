const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createManagers } = require('../electron/managers.cjs');

async function test() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-managers-'));
  const file = path.join(dir, 'managers.json');
  const data = { projects: [{ id: 'p', title: 'Project' }, { id: 'q', title: 'Other project' }], threads: [
    { id: 'a', projectId: 'p', title: 'Engineering', pinned: false },
    { id: 'b', projectId: 'p', title: 'Design', pinned: false },
  ] };
  const commands = []; let fail = false, suggestionStatus = 'completed';
  const t3 = { world: () => structuredClone(data), sendMessage: async () => {}, threadInfo: () => ({ run: { status: suggestionStatus } }), conversation: () => [{ role: 'assistant', text: '["Engineering", "Design", "Quality"]' }] };
  const server = { selection: () => ({ providerInstanceId: 'codex', model: 'example', options: { effort: 'high' } }), dispatch: async c => {
    commands.push(c); if (fail) throw Error('Offline');
    const t = data.threads.find(t => t.id === c.threadId);
    if (t && /thread\.(un)?pin$/.test(c.type)) t.pinned = c.type === 'thread.pin';
  } };
  const service = createManagers({ file, t3, server, wait: async () => {} });
  await service.update({ threadId: 'a', pinned: true, projectId: 'p' });
  assert.equal(data.threads[0].pinned, true);
  await assert.rejects(service.update({ threadId: 'b', pinned: true, projectId: 'p', roles: { b: 'Design' } }), /each manager/);
  assert.equal(data.threads[1].pinned, false);
  await assert.rejects(service.update({ threadId: 'b', pinned: true, projectId: 'p', roles: { a: 'Design', b: 'design' } }), /different role/);
  await service.update({ threadId: 'b', pinned: true, projectId: 'p', roles: { a: 'Engineering', b: 'Design' } });
  assert.deepEqual(service.world().threads.map(t => t.manager.role), ['Engineering', 'Design']);
  await service.update({ threadId: 'b', pinned: true, projectId: 'q', roles: { b: 'Release' } });
  assert.equal(service.world().threads[1].manager.projectId, 'q');
  await service.update({ threadId: 'a', pinned: false });
  assert.equal(service.world().threads[0].manager, undefined);
  data.threads[0].pinned = true;
  assert.equal(service.world().threads[0].manager.role, 'Engineering', 'external repin restores thread role');
  await service.update({ threadId: 'a', pinned: false });
  const before = fs.readFileSync(file, 'utf8'); fail = true;
  await assert.rejects(service.update({ threadId: 'a', pinned: true, projectId: 'p', roles: { a: 'Changed' } }), /Offline/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'failed pin rolls metadata back'); fail = false;
  await assert.rejects(service.update({ threadId: 'missing', pinned: true, projectId: 'p' }), /no longer/);
  await assert.rejects(service.update({ threadId: 'a', pinned: true, projectId: 'missing' }), /Choose a project/);
  const restored = createManagers({ file, t3, server, wait: async () => {} });
  assert.equal(restored.world().threads[1].manager.role, 'Release');
  assert.deepEqual(await service.suggest({ threadId: 'a', projectId: 'p' }), ['Engineering', 'Design', 'Quality']);
  const create = commands.find(c => c.type === 'thread.create');
  assert.deepEqual(create.modelSelection, { instanceId: 'codex', model: 'example', options: [{ id: 'effort', value: 'high' }] });
  assert.equal(create.runtimeMode, 'approval-required'); assert.equal(create.interactionMode, 'plan');
  assert(commands.some(c => c.type === 'thread.archive'));
  suggestionStatus = 'running';
  await assert.rejects(service.suggest({ threadId: 'a', projectId: 'p' }), /longer than expected/);
  assert(commands.some(c => c.type === 'thread.stop'), 'timed out AI helper is stopped');
  const source = fs.readFileSync('src/office/roster.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
  const code = require('node:module').stripTypeScriptTypes(source, { mode: 'transform' });
  const context = { exports: {}, brandFor: () => 'codex', companionClient: () => false, window: {}, console };
  require('node:vm').runInNewContext(code + '\nexports.Roster = Roster;', context);
  const roster = Object.create(context.exports.Roster.prototype);
  roster.robots = [{ id: 'manager-robot', name: 'Ada', brand: 'codex', threadId: 'a', jobs: 1 }];
  roster.save = () => {}; roster.hire = id => ({ id: 'worker-robot', brand: 'codex', threadId: id, jobs: 1 });
  roster.assign([{ id: 'new-task', provider: 'codex' }], new Set(['a']), new Set(['a', 'new-task']), new Set(['a']));
  assert.equal(roster.byThread('a').id, 'manager-robot', 'pinned manager keeps its robot between tasks');
  assert.equal(roster.byThread('new-task').id, 'worker-robot', 'new task does not steal manager robot');
  assert(!roster.freeTeam(new Set(['a'])).some(r => r.id === 'manager-robot'), 'resting manager is not offered as a free hire');
  roster.assign([{ id: 'a', provider: 'codex' }], new Set(['new-task']), new Set(['a', 'new-task']), new Set(['a']));
  assert.equal(roster.byThread('a').id, 'manager-robot', 'next manager task uses the same robot');
  await avatars();
  console.log('PASS: promotion, demotion, multiple roles, duplicates, project reassignment, external pin changes, persistence, failed pin rollback, AI suggestions and timeout cleanup, profile pictures');
}

async function avatars() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-manager-avatars-'));
  const data = { projects: [{ id: 'p', title: 'e2Maths' }], threads: [
    { id: 'm', projectId: 'p', title: 'Channel owner', pinned: true },
    { id: 'env::r', projectId: 'p', title: 'Remote owner', pinned: true },
    { id: 'w', projectId: 'p', title: 'Worker', pinned: false },
  ] };
  const sent = [];
  const service = createManagers({ file: path.join(dir, 'managers.json'), avatarRoot: path.join(dir, 'pictures'), isLocal: id => !id.includes('::'),
    t3: { world: () => structuredClone(data), sendMessage: async m => { sent.push(m); } }, server: { dispatch: async () => {} } });
  const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(32, 1)]);
  const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>');
  const pic = id => service.world().threads.find(t => t.id === id).manager?.avatar;
  assert.equal(pic('m'), null, 'no picture means the robot portrait');
  await assert.rejects(service.avatars.set({ threadId: 'w', data: png.toString('base64') }), /Promote/);
  await assert.rejects(service.avatars.set({ threadId: 'm', data: Buffer.from('not an image').toString('base64') }), /PNG, JPEG/);
  await assert.rejects(service.avatars.set({ threadId: 'm', data: Buffer.alloc(4 * 1024 * 1024 + 1, 1).toString('base64') }), /smaller than 4 MB/);
  const first = await service.avatars.set({ threadId: 'm', data: png.toString('base64') });
  assert.match(first, /^lucid-file:\/\/local\/.*avatar\.png\?v=/);
  assert.equal(pic('m'), first);
  // The manager's own agent replaces its file directly; Lucid keeps the earlier one.
  const folder = service.avatars.dir('m');
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(path.join(folder, 'avatar.svg'), svg);
  assert.match(pic('m'), /avatar\.svg/, 'newest agent-written file wins');
  const history = service.avatars.history({ threadId: 'm' });
  assert.equal(history.length, 1, 'previous picture kept'); assert.match(history[0].id, /\.png$/);
  assert.match(await service.avatars.set({ threadId: 'm', restore: history[0].id }), /avatar\.png/, 'earlier picture restored');
  assert(!fs.existsSync(path.join(folder, 'avatar.svg')), 'restored picture replaces other formats');
  await assert.rejects(service.avatars.set({ threadId: 'm', restore: '../managers.json' }), /no longer available/);
  assert.equal(await service.avatars.set({ threadId: 'm', clear: true }), null);
  assert.equal(pic('m'), null, 'cleared back to robot portrait');
  assert(service.avatars.history({ threadId: 'm' }).length >= 2, 'cleared picture can be restored');
  const asked = await service.avatars.ask({ threadId: 'm', note: 'green and cream' });
  assert.equal(sent.length, 1); assert(sent[0].message.includes(asked.dir) && sent[0].message.includes('e2Maths') && sent[0].message.includes('green and cream'));
  await assert.rejects(service.avatars.ask({ threadId: 'env::r' }), /another environment/);
  assert(!service.avatars.dir('env::r').includes('::'), 'folder names are safe on Windows');
}
test().catch(e => { console.error(e); process.exitCode = 1; });
