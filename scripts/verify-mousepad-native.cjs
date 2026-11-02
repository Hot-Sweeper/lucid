// Native production-component fixture. T3 adapters are isolated, and external writes are forbidden.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow } = require('electron');
  const out = path.resolve(process.argv[2]), build = path.resolve(process.argv[3]);
  fs.mkdirSync(out, { recursive: true });
  app.setPath('userData', path.join(out, 'profile')); fs.mkdirSync(app.getPath('userData'), { recursive: true });
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = app.getPath('userData');
  process.env.LUCID_SHOT_EVERY = '600000'; process.env.LUCID_SHOT_COUNT = '1000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.join(build, 'index.html')).href;
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ orch: { auto: false, review: false, paused: true } }));
  const stamp = new Date().toISOString();
  const worker = { id: 'presence-worker', projectId: 'presence-project', title: 'Chair presence native fixture', provider: 'codex', model: 'Fixture model', updatedAt: stamp, runStatus: 'running', question: null, pinned: false, settled: false };
  const data = { projects: [{ id: worker.projectId, title: 'Presence fixture', root: out, icon: null, scratch: false }], threads: [worker], models: {}, prices: {}, shipped: { today: 0, total: 0 } };
  const info = () => ({ id: worker.id, title: worker.title, provider: worker.provider, model: worker.model, effort: 'high', root: out, queued: [], run: { id: 'presence-run', status: worker.runStatus } });
  const items = [], reads = { world: 0, info: 0, items: 0, approvals: 0, outcomes: 0 };
  let pending = [], outcome = null;
  const t3 = require('../electron/t3.cjs');
  Object.assign(t3, { world: () => { reads.world++; return structuredClone(data); }, threadInfo: () => { reads.info++; return info(); },
    officeTasks: () => [], listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects,
    watchThread: () => () => {}, conversation: () => [], conversationPage: () => ({ messages: [], hasMore: false, cursor: null }),
    pendingRequests: () => { reads.approvals++; return structuredClone(pending); }, requestOutcome: () => { reads.outcomes++; return outcome; },
    repliesSince: () => ({ messages: [], exists: true, runStatus: 'running' }), userMessagesSince: () => [], resolvedRequestsSince: () => [],
    itemsSince: () => { reads.items++; return structuredClone(items); }, recentItems: () => { reads.items++; return structuredClone(items); } });
  Object.assign(require('../electron/t3server.cjs'), { usageLimits: async () => ({ providers: [] }), status: async () => ({ paired: true }), closeSock: () => {}, dispatch: async () => { throw Error('External mutation forbidden in presence fixture'); } });
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(require('../electron/usage.cjs'), { getSessionUsage: async () => ({ available: false, tokens: null, costUsd: null }), getUsage: async () => ({ updatedAt: stamp, windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }) });
  Object.assign(require('../electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture', local: true }] }) });
  Object.assign(require('../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  require('../electron/main.cjs');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let win; const captures = [], assertions = [], errors = [];
  const ev = expression => win.webContents.executeJavaScript(expression);
  const until = async (expression, label, timeout = 35000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await ev(expression)) return; await wait(50); } throw Error('Timeout: ' + label); };
  const capture = async name => { const file = path.join(out, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); captures.push(file); };
  const check = (name, condition, details) => { assertions.push({ name, ok: !!condition, at: new Date().toISOString(), details }); assert(condition, name + ': ' + JSON.stringify(details)); };
  const feed = async () => ev(`(async()=>{const incoming=await window.lucid.itemsSince('presence-worker','');desk.director.push(incoming,false);return incoming.map(i=>i.id)})()`);
  const report = { scope: 'Current native chair-presence review, separate from historical printer/report captures.', adapters: 'Fixture T3/world/usage/weather. Renderer, IPC, Desk, WM, Director, note typing, UAC and World routing are production components. No real task or approval was changed.', captures, assertions, errors, startedAt: stamp, build };
  app.whenReady().then(async () => { try {
    await wait(200); win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false);
    win.webContents.on('render-process-gone', (_event, details) => errors.push(details));
    await until(`!!window.__world?.desks.get('presence-worker')`, 'worker');
    await ev(`window.desk=__world.desks.get('presence-worker');__world.showRoom(desk.room)`);
    await until(`desk.wm.operatorPresent&&desk.wm.presentationVisible`, 'physical arrival'); await wait(400);
    await ev(`(async()=>desk.setInfo(await window.lucid.threadInfo('presence-worker')))()`);

    await ev('desk.director.reset();__world.focusOn(desk)'); await wait(1600);
    await ev('desk.robot.setPose("rest")'); await wait(800);
    report.geometry=await ev('({mouse:desk.rig().mouse,table:desk.el.querySelector(".desk-table").outerHTML})');
    await capture('after-rest');
    report.movement=[];
    for(const [name,x,y] of [['left',0,0],['right',1,1],['center',.5,.5]]){
      await ev('desk.robot.setPose("mouse");desk.robot.mouseTo('+x+','+y+')');await wait(750);
      report.movement.push(await ev('({name:'+JSON.stringify(name)+',mouse:{...desk.deferredRobot.current.mouseP},goal:{...desk.deferredRobot.current.mouseGoal},handWeight:desk.deferredRobot.current.mouseW.v,transform:desk.el.querySelector("[data-d=mouse]").getAttribute("transform")})'));
      await capture('after-mouse-'+name);
    }
    check('Physical mouse follows corrected center',report.movement[2].goal.x===288,report.movement);
    check('Mouse traverses pad with attached hand',report.movement.every(s=>s.handWeight>.99)&&report.movement[0].mouse.x<report.movement[1].mouse.x,report.movement);
    const scriptUrls = await ev('[...document.scripts].map(s=>s.src).filter(Boolean)');
    const dbg = win.webContents.debugger; dbg.attach('1.3'); const parsed = [];
    dbg.on('message', (_event, method, params) => { if (method === 'Debugger.scriptParsed') parsed.push(params); });
    await dbg.sendCommand('Debugger.enable');
    report.assets = [];
    for (const url of scriptUrls) { const file = require('node:url').fileURLToPath(url), asset = { url, file, sha256: hash(fs.readFileSync(file)) }; const script = parsed.find(p => p.url === url); assert(script, 'executing script parsed'); const source = await dbg.sendCommand('Debugger.getScriptSource', { scriptId: script.scriptId }); asset.executingSha256 = hash(source.scriptSource); assert.equal(asset.executingSha256, asset.sha256); report.assets.push(asset); }
    dbg.detach();
    report.manifest = { path: path.join(build, 'lucid-build.json'), sha256: hash(fs.readFileSync(path.join(build, 'lucid-build.json'))), data: JSON.parse(fs.readFileSync(path.join(build, 'lucid-build.json'), 'utf8')) };
    report.reads = reads; report.ok = true; report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: true, out, assertions: assertions.length, captures, nativePid: process.pid })); app.exit(0);
  } catch (error) { report.ok = false; report.error = String(error.stack || error); report.reads = reads; if (win) { report.samples = await ev('clearInterval(window.presenceSampler);window.presenceSamples').catch(() => []); await capture('failure').catch(() => {}); } fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2)); console.error(error); app.exit(1); } });
}

