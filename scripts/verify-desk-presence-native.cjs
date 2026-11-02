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
    items.push({ id: 'presence-reasoning', runId: 'presence-run', ordinal: 1, type: 'reasoning', status: 'running', updatedAt: stamp, data: { text: 'Native presence fixture: this note must pause when its robot leaves the chair. '.repeat(12), streaming: true } });
    await ev(`(()=>{window.activityCounts={keys:0,clicks:0,mouse:0};for(const [method,key] of [['pressKey','keys'],['click','clicks'],['mouseTo','mouse']]){const original=desk.robot[method].bind(desk.robot);desk.robot[method]=(...args)=>{activityCounts[key]++;return original(...args)}};window.signature=()=>({text:desk.screen.querySelector('.notes')?.textContent||'',cursor:{...desk.wm.cursor},windows:[...desk.wm.wins].map(([id,w])=>({id,left:w.el.style.left,top:w.el.style.top,width:w.el.style.width,height:w.el.style.height})),mouse:desk.el.querySelector('[data-d=mouse]').getAttribute('transform'),counts:{...activityCounts}});window.presenceSamples=[];window.presenceSampler=setInterval(()=>presenceSamples.push({time:performance.now(),present:desk.wm.operatorPresent,signature:signature()}),100)})()`);
    await feed(); await until(`(desk.screen.querySelector('.notes')?.textContent.length||0)>8`, 'active note typing');
    await capture('01-before-seated-typing');
    worker.question = 'Fixture question while task continues'; await ev('window.__refresh()');
    await until('!desk.wm.operatorPresent', 'typing departure');
    const absentAt = Date.now(), frozen = await ev('signature()');
    await capture('02-after-departure-typing-paused');
    const readBefore = { ...reads };
    items[0].status = 'completed'; items[0].data.streaming = false; items[0].updatedAt = new Date().toISOString();
    items.push({ id: 'presence-queued-reply', runId: 'presence-run', ordinal: 2, type: 'assistant_message', status: 'completed', updatedAt: new Date().toISOString(), data: { text: 'Queued while the robot was away. Render this after it returns.', streaming: false } });
    pending = [{ id: 'presence-approval', type: 'approval', requestKind: 'file-read', prompt: 'Read fixture-only notes.txt', detail: 'Isolated native test request.' }];
    items.push({ id: 'presence-approval-event', runId: 'presence-run', ordinal: 3, type: 'approval_request', status: 'running', updatedAt: new Date().toISOString(), data: { requestId: 'presence-approval' } });
    await feed();
    await until('desk.director.uac.isUp', 'approval shown while absent');
    const received = await ev(`({queued:desk.director.queue.includes('presence-queued-reply'),known:desk.director.items.has('presence-queued-reply'),approval:desk.director.uac.isUp,present:desk.wm.operatorPresent})`);
    check('Task update and approval arrive while absent', received.queued && received.known && received.approval && !received.present, received);
    await wait(650); await capture('03-away-approval-and-queued-work');
    pending = []; outcome = { status: 'resolved', decision: 'accept' };
    await until('!desk.director.uac.isUp', 'approval outcome polled while absent');
    check('Approval outcome continues through IPC', reads.outcomes > readBefore.outcomes, { before: readBefore, after: { ...reads } });
    while (Date.now() - absentAt < 65000) { await wait(Math.min(4000, 65000 - (Date.now() - absentAt))); const current = await ev('signature()'); check('No simulated activity while absent', JSON.stringify(current) === JSON.stringify(frozen), { elapsedMs: Date.now() - absentAt, signature: current }); }
    await capture('04-away-after-65-seconds');
    check('Absence exceeds old timeout in real time', Date.now() - absentAt >= 65000, { elapsedMs: Date.now() - absentAt });
    check('Background reads continued', reads.world > readBefore.world && reads.approvals > readBefore.approvals && reads.items > readBefore.items, { before: readBefore, after: { ...reads } });
    worker.question = null; await ev('window.__refresh()');
    await until('desk.wm.operatorPresent', 'return to chair');
    await until(`!desk.director.queue.includes('presence-queued-reply')&&desk.director.played.has('presence-queued-reply')&&desk.screen.textContent.includes('Queued while the robot was away')`, 'queued reply after return');
    await capture('05-after-return-queued-reply');
    const resumed = await ev('signature()'); check('Typing resumed after physical arrival', resumed.counts.keys > frozen.counts.keys, { frozen, resumed });
    // Start the real WM drag, depart while it follows the mouse, then return.
    await until('desk.director.pumpEpoch===-1&&!desk.director.queue.length', 'previous scene finished');
    await capture('06-before-departure-window-moving');
    await ev(`(()=>{desk.director.busyToken++;const w=desk.wm.wins.get('notes');window.dragTarget={x:40,y:60,w:parseFloat(w.el.style.width),h:parseFloat(w.el.style.height)};window.dragDone=false;desk.wm.dragTo('notes',dragTarget).then(()=>dragDone=true)})()`);
    await until(`desk.wm.wins.get('notes').el.classList.contains('dragging')`, 'active window movement'); await wait(70);
    const movingBeforeDeparture = await ev(`({dragging:desk.wm.wins.get('notes').el.classList.contains('dragging'),done:dragDone,moving:!!desk.wm.cursorMotion&&!desk.wm.cursorMotion.paused()})`);
    check('Departure starts during actual window movement', movingBeforeDeparture.dragging && !movingBeforeDeparture.done && movingBeforeDeparture.moving, movingBeforeDeparture);
    worker.question = 'Fixture window-movement departure'; await ev('window.__refresh()'); await until('!desk.wm.operatorPresent', 'movement departure');
    const dragFrozen = await ev('signature()'); await wait(2300);
    const dragAfter = await ev('signature()'), doneWhileAbsent = await ev('dragDone');
    check('Window drag and cursor stop mid-movement', JSON.stringify(dragAfter) === JSON.stringify(dragFrozen) && !doneWhileAbsent, { frozen: dragFrozen, after: dragAfter, doneWhileAbsent, elapsedMs: 2300 });
    await capture('07-after-departure-window-paused');
    worker.question = null; await ev('window.__refresh()'); await until('desk.wm.operatorPresent&&dragDone', 'window movement resumed');
    const finish = await ev(`({target:dragTarget,left:parseFloat(desk.wm.wins.get('notes').el.style.left),top:parseFloat(desk.wm.wins.get('notes').el.style.top)})`);
    check('Window completes original destination after sitting', Math.abs(finish.left - finish.target.x) < .1 && Math.abs(finish.top - finish.target.y) < .1, finish);
    await capture('08-after-return-window-resumed');
    report.samples = await ev('clearInterval(presenceSampler);presenceSamples');
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
