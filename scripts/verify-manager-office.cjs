// Real T3 state and the production renderer. Run only with the coordinated native slot.
// LUCID_MANAGER_BUILD points to an already validated build directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, BrowserWindow } = require('electron');
const out = process.env.LUCID_MANAGER_EVIDENCE || path.join(process.env.USERPROFILE, '.t3', 'lucid-manager-review');
const build = process.env.LUCID_MANAGER_BUILD;
if (!build || !fs.existsSync(path.join(build, 'index.html'))) throw Error('Provide LUCID_MANAGER_BUILD with the verified build.');
const actual = path.join(app.getPath('appData'), 'lucid'), profile = path.join(out, 'profile');
fs.mkdirSync(profile, { recursive: true });
for (const name of ['Local State', 't3-pairing.bin', 'roster.json']) try { fs.copyFileSync(path.join(actual, name), path.join(profile, name)); } catch {}
app.setPath('userData', actual);
process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = profile;
process.env.LUCID_SHOT_EVERY = '3600000';
process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.join(build, 'index.html')).toString();
require('../electron/main.cjs');
let originalSettings = {}; try { originalSettings = JSON.parse(fs.readFileSync(path.join(actual, 'settings.json'), 'utf8')); } catch {}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ ...originalSettings, orch: null }));
const t3 = require('../electron/t3.cjs'), server = require('../electron/t3server.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const result = { startedAt: new Date().toISOString(), checks: [], screenshots: [], mocked: false, isolatedProfile: profile, createdThreads: [] };
const assert = (value, label) => { if (!value) throw Error(label); result.checks.push(label); };
app.whenReady().then(async () => {
  const ids = []; let win;
  try {
    for (let i = 0; i < 200; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoading()) break; await wait(100); }
    if (!win) throw Error('Office window did not open.');
    const js = async expression => { const value = await win.webContents.executeJavaScript(expression, true); return value; };
    const until = async (expression, timeout = 40000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await js(expression)) return; await wait(200); } throw Error('Office state did not arrive: ' + expression); };
    await until('!!window.__world?.lastData');
    const world = t3.world(), project = world.projects.find(p => p.title === 'MotionLab' && p.icon) || world.projects.find(p => p.icon && !p.scratch);
    assert(project, 'real project with its own logo exists');
    const codex = world.threads.find(t => /codex/i.test(t.provider) && t.model), claude = world.threads.find(t => /claude/i.test(t.provider) && t.model);
    assert(codex && claude, 'existing Codex and Claude model selections available');
    for (const [index, source] of [codex, claude].entries()) {
      const id = crypto.randomUUID(), choice = server.selection(source.id);
      await server.dispatch({ type: 'thread.create', threadId: id, projectId: project.id, title: `[Manager verification] ${index ? 'Design' : 'Engineering'}`, modelSelection: { instanceId: choice.providerInstanceId, model: choice.model, options: Object.entries(choice.options || {}).map(([id, value]) => ({ id, value })) }, runtimeMode: 'approval-required', interactionMode: 'default', branch: null, worktreePath: null });
      ids.push(id); result.createdThreads.push({ id, provider: source.provider });
    }
    const [first, second] = ids;
    const refresh = async () => { await js(`window.__world.update(await window.lucid.world());void 0`); };
    const open = async id => {
      await refresh();
      await js(`window.__world.revealThread(${JSON.stringify(id)});void 0`);
      await until(`!!window.__world.deskFor(${JSON.stringify(id)})`);
      await js(`window.__world.showDesk(window.__world.deskFor(${JSON.stringify(id)})); window.__world.onWatchChat(${JSON.stringify(id)}); void 0`);
      await wait(1200);
    };
    const capture = async name => { await wait(400); const file = path.join(out, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); result.screenshots.push(file); };
    await open(first);
    result.codexColor = await js(`(()=>{const d=window.__world.deskFor(${JSON.stringify(first)}),el=d?.el.querySelector('.robot-host svg');return {provider:d?.info?.provider,shell:el?getComputedStyle(el).getPropertyValue('--shell'):null}})()`);
    await capture('01-before-promotion');
    await js(`document.querySelector('.cp-manage').click();void 0`);
    await until(`!!document.querySelector('.manager-editor')`);
    await js(`(()=>{const f=document.querySelector('.manager-editor'); const input=[...f.querySelectorAll('input')].find(i=>i.dataset.thread===${JSON.stringify(first)});input.value='Engineering';input.dispatchEvent(new Event('input'));f.querySelector('.manager-save').click()})();void 0`);
    await until(`!document.querySelector('.manager-editor')`);
    assert(t3.world().threads.find(t => t.id === first)?.pinned, 'promotion through UI pins the real T3 thread');
    await open(first); await capture('02-after-promotion');
    const robotBefore = await js(`window.__world.roster.byThread(${JSON.stringify(first)})?.id`);
    for (const task of ['one', 'two']) {
      await t3.sendMessage({ threadId: first, message: `Reply only "manager-check-${task}". This is a UI validation task. Do not use tools, delegate, read files, or make changes.` });
      const start = Date.now(); let completed = false;
      while (Date.now() - start < 120000) { await wait(1000); const info = t3.threadInfo(first); if (info?.run?.status === 'completed') { completed = true; break; } if (['failed', 'cancelled', 'interrupted'].includes(info?.run?.status)) throw Error('Validation task did not complete.'); }
      assert(completed, `real manager task ${task} completed`);
      await refresh();
      assert(await js(`window.__world.roster.byThread(${JSON.stringify(first)})?.id===${JSON.stringify(robotBefore)}`), `manager keeps the same robot after task ${task}`);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'managers.json'), 'utf8'));
      assert(saved[first]?.role === 'Engineering' && t3.world().threads.find(t => t.id === first)?.pinned, `role and pin persist after task ${task}`);
    }
    await open(second);
    await js(`document.querySelector('.cp-manage').click();void 0`);
    await until(`!!document.querySelector('.manager-editor')`);
    await capture('03-multiple-manager-roles');
    await js(`(()=>{const f=document.querySelector('.manager-editor'); for(const i of f.querySelectorAll('input')){i.value=i.dataset.thread===${JSON.stringify(second)}?'Design':'Engineering';i.dispatchEvent(new Event('input'))}f.querySelector('.manager-save').click()})();void 0`);
    await until(`!document.querySelector('.manager-editor')`);
    assert(ids.every(id => t3.world().threads.find(t => t.id === id)?.pinned), 'both real threads are pinned');
    await open(second); await capture('04-multiple-managers-office');
    const roles = JSON.parse(fs.readFileSync(path.join(profile, 'managers.json'), 'utf8'));
    assert(roles[first].role === 'Engineering' && roles[second].role === 'Design', 'distinct roles persisted in production manager store');
    assert(await js(`window.__world.deskFor(${JSON.stringify(second)})?.el.querySelector('.desk-plate img')?.src===${JSON.stringify(project.icon)}`), 'manager nameplate uses the real project logo');
    result.claudeColor = await js(`(()=>{const d=window.__world.deskFor(${JSON.stringify(second)}),el=d?.el.querySelector('.robot-host svg');return {provider:d?.info?.provider,shell:el?getComputedStyle(el).getPropertyValue('--shell'):null}})()`);
    assert(result.codexColor.shell && result.claudeColor.shell && result.codexColor.shell !== result.claudeColor.shell, 'actual office robots retain distinct harness shell colors');
    await js(`document.querySelector('.cp-manage').click();void 0`); await until(`!!document.querySelector('.manager-editor')`);
    await js(`document.querySelector('.manager-demote').click();void 0`); await until(`!document.querySelector('.manager-editor')`);
    assert(!t3.world().threads.find(t => t.id === second)?.pinned, 'demotion through UI unpins the real T3 thread');
    await open(second); await capture('05-after-demotion');
    await server.dispatch({ type: 'thread.unpin', threadId: first });
    await refresh();
    assert(await js(`!window.__world.lastData.threads.find(t=>t.id===${JSON.stringify(first)}).pinned`), 'pin change outside Lucid synchronizes through the real bridge');
    await server.dispatch({ type: 'thread.pin', threadId: first }); await refresh();
    assert(await js(`window.__world.lastData.threads.find(t=>t.id===${JSON.stringify(first)}).manager.role==='Engineering'`), 'repinning restores the thread manager role');
    const inventory = await js('window.lucid.environments(true)'), ares = inventory.buildings.find(b => b.label.toLowerCase() === 'ares');
    assert(ares?.canOpen, 'saved Ares connection is available without reconnecting');
    await js(`document.querySelectorAll('.manager-editor').forEach(e=>e.remove()); void 0`);
    await js(`(()=>{const b=[...document.querySelectorAll('.environment-row')].find(b=>b.querySelector('b')?.textContent.toLowerCase()==='ares');if(!b)throw Error('Ares building button missing');b.click()})();void 0`);
    await until(`window.__world.lastData?.environmentId===${JSON.stringify(ares.id)}`);
    const aresBuilding = await js(`({world:window.__world.lastData})`);
    await capture('06-ares-authenticated-office');
    assert(aresBuilding.world.environmentId === ares.id && aresBuilding.world.projects.length > 0 && aresBuilding.world.threads.length > 0, 'authenticated Ares office contains real remote projects and threads');
    result.ares = { environmentId: ares.id, projects: aresBuilding.world.projects.length, threads: aresBuilding.world.threads.length };
    result.loaded = await js(`({assets:[...document.scripts].map(s=>s.src).filter(Boolean),href:location.href})`);
    result.ok = true;
  } catch (e) { result.ok = false; result.error = e.message; result.stack = e.stack; }
  finally {
    for (const id of ids) { try { await server.dispatch({ type: 'thread.stop', threadId: id, reason: 'Manager review verification finished' }); } catch {} try { await server.dispatch({ type: 'thread.unpin', threadId: id }); await server.dispatch({ type: 'thread.archive', threadId: id }); } catch {} }
    result.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ok: result.ok, checks: result.checks.length, error: result.error, out })); app.exit(result.ok ? 0 : 1);
  }
});
