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
  const context = { exports: {}, brandFor: () => 'codex', window: {}, console };
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
  console.log('PASS: promotion, demotion, multiple roles, duplicates, project reassignment, external pin changes, persistence, failed pin rollback, AI suggestions and timeout cleanup');
}
test().catch(e => { console.error(e); process.exitCode = 1; });
