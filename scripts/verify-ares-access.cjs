// Opt-in real bridge verification. Creates one idle remote review thread and
// archives it afterward. Starts no AI task and never modifies project files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createManagers } = require('../electron/managers.cjs');

async function main() {
  const out = process.argv[2] || path.join(process.env.USERPROFILE, '.t3', 'lucid-manager-review');
  fs.mkdirSync(out, { recursive: true });
  const { getEnvironments, remote } = require('../electron/environments.cjs');
  const result = { startedAt: new Date().toISOString(), mocked: false, providerTasksStarted: 0, checks: [] };
  const check = (ok, label) => { if (!ok) throw Error(label); result.checks.push(label); };
  let id;
  try {
    const inventory = await getEnvironments({ fresh: true });
    const ares = inventory.buildings.find(b => b.label.toLowerCase() === 'ares');
    check(ares?.canOpen, 'existing saved Ares connection discovered without reconnecting');
    const data = await remote.world(ares.id);
    result.environmentId = ares.id; result.projects = data.projects.length; result.threads = data.threads.length;
    check(data.projects.length > 0 && data.threads.length > 0, 'authenticated remote projects and thread shells read');
    const source = data.threads.find(t => t.model), project = data.projects.find(p => p.id === source.projectId);
    const info = await remote.info(source.id), messages = await remote.conversation(source.id), items = await remote.items(source.id);
    check(!!info.title && Array.isArray(messages) && Array.isArray(items), 'actual remote thread conversation and activity read');
    check(data.threads.every(t => t.id.startsWith(ares.id + '::') && t.projectId.startsWith(ares.id + '::')), 'all remote identities scoped to Ares');
    const selection = await remote.selection(source.id);
    id = remote.ref(ares.id, crypto.randomUUID()); result.reviewThread = id;
    await remote.dispatch({ type: 'thread.create', threadId: id, projectId: project.id, title: '[Lucid review] Manager pin synchronization', modelSelection: { instanceId: selection.providerInstanceId, model: selection.model, options: Object.entries(selection.options || {}).map(([id, value]) => ({ id, value })) }, runtimeMode: 'approval-required', interactionMode: 'default', branch: null, worktreePath: null });
    let current = await remote.world(ares.id);
    check(current.threads.some(t => t.id === id && !t.pinned), 'real verification thread starts unpinned');
    const file = path.join(out, 'remote-managers.json');
    const deps = { file, t3: { world: () => structuredClone(current) }, server: { dispatch: c => remote.dispatch(c) } };
    const managers = createManagers(deps);
    await managers.update({ threadId: id, pinned: true, projectId: project.id, roles: { [id]: 'Review verification' } });
    current = await remote.world(ares.id);
    check(current.threads.find(t => t.id === id)?.pinned, 'promotion pins through the authenticated real Ares bridge');
    check(createManagers(deps).world().threads.find(t => t.id === id)?.manager?.role === 'Review verification', 'role survives manager service reload');
    await managers.update({ threadId: id, pinned: false }); current = await remote.world(ares.id);
    check(!current.threads.find(t => t.id === id)?.pinned, 'demotion unpins through the authenticated real Ares bridge');
    await remote.dispatch({ type: 'thread.pin', threadId: id }); current = await remote.world(ares.id);
    check(managers.world().threads.find(t => t.id === id)?.manager?.role === 'Review verification', 'external repin restores persisted role from actual remote state');
    result.ok = true;
  } catch (e) { result.ok = false; result.error = e.message; }
  finally {
    if (id) { const { remote } = require('../electron/environments.cjs'); try { await remote.dispatch({ type: 'thread.unpin', threadId: id }); await remote.dispatch({ type: 'thread.archive', threadId: id }); result.cleanup = 'unpinned and archived'; } catch { result.cleanup = 'cleanup needs review'; result.ok = false; } }
    result.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(out, 'ares-access.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
