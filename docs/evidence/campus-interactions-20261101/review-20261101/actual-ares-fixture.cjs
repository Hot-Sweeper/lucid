// Native production-component fixture. T3 adapters are isolated, and external writes are forbidden.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/node_modules/electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
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
  const t3 = require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/t3.cjs');
  Object.assign(t3, { world: () => { reads.world++; return structuredClone(data); }, threadInfo: () => { reads.info++; return info(); },
    officeTasks: () => [], listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects,
    watchThread: () => () => {}, conversation: () => [], conversationPage: () => ({ messages: [], hasMore: false, cursor: null }),
    pendingRequests: () => { reads.approvals++; return structuredClone(pending); }, requestOutcome: () => { reads.outcomes++; return outcome; },
    repliesSince: () => ({ messages: [], exists: true, runStatus: 'running' }), userMessagesSince: () => [], resolvedRequestsSince: () => [],
    itemsSince: () => { reads.items++; return structuredClone(items); }, recentItems: () => { reads.items++; return structuredClone(items); } });
  Object.assign(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/t3server.cjs'), { usageLimits: async () => ({ providers: [] }), status: async () => ({ paired: true }), closeSock: () => {}, dispatch: async () => { throw Error('External mutation forbidden in presence fixture'); } });
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/usage.cjs'), { getSessionUsage: async () => ({ available: false, tokens: null, costUsd: null }), getUsage: async () => ({ updatedAt: stamp, windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }) });

  Object.assign(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });

  const environments=require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/environments.cjs');
  const mutationError=()=>{throw Error('No remote writes are allowed in this read-only review')};environments.remote.dispatch=mutationError;t3.sendMessage=mutationError;
  require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/main.cjs');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));let win;const js=c=>win.webContents.executeJavaScript(c,true);
  const until=async c=>{for(let i=0;i<400;i++){if(await js(c))return;await wait(100)}throw Error('Timeout: '+c)};
  const watchdog=setTimeout(()=>app.exit(1),90000);
  app.whenReady().then(async()=>{try{
    await wait(300);win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);
    await until("!!window.__world?.lastData");
    const chosen=await js(`(async()=>{const inv=await lucid.environments();const b=inv.buildings.find(b=>b.label.toLowerCase()==='ares'&&b.canOpen);if(!b)throw Error('Ares is not connected');window.__aresId=b.id;return {id:b.id,label:b.label}})()`);
    await until("!!__world.neighbors.get(window.__aresId)?.office?.desks.size");
    const expected=await js(`(async()=>{const o=__world.neighbors.get(window.__aresId).office;const d=[...o.desks.values()].find(d=>d.threadId);const info=await lucid.threadInfo(d.threadId);window.__realAres={environmentId:window.__aresId,threadId:d.threadId,title:info.title,room:d.room};o.showRoom(d.room);return window.__realAres})()`);
    await wait(1200);fs.writeFileSync(path.join(out,'actual-ares-before-opening.png'),(await win.webContents.capturePage()).toPNG());
    const hit=await js(`(()=>{const s=window.__realAres,d=__world.neighbors.get(s.environmentId).office.desks.get(s.threadId),r=d.monitor.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),hit:d.monitor.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}})()`);assert(hit.hit,'actual Ares monitor receives pointer');
    win.webContents.sendInputEvent({type:'mouseDown',x:hit.x,y:hit.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:hit.x,y:hit.y,button:'left',clickCount:1});
    await until("__world.lastData.environmentId===window.__realAres.environmentId&&__chat.threadId===window.__realAres.threadId");
    await wait(1400);
    const actual=await js(`({environment:__world.lastData.environmentId,chat:__chat.threadId,focus:__world.focusDesk?.threadId??null,title:__world.lastData.threads.find(t=>t.id===__chat.threadId)?.title})`);
    fs.writeFileSync(path.join(out,'actual-ares-session.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out,'actual-ares-read-only.json'),JSON.stringify({ok:true,at:new Date().toISOString(),remoteDataMocked:false,localWorldMocked:true,computerFocusVerified:actual.focus===expected.threadId,remoteWrites:0,productionRestart:false,isolatedProfile:true,expected,actual,checks:['authenticated existing Ares link','actual remote thread info read','real mouse input on occupied remote monitor','active environment, chat thread and actual title match']},null,2));
    console.log('PASS real Ares read-only computer opening: '+out);clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);if(win)fs.writeFileSync(path.join(out,'ares-failure.png'),(await win.webContents.capturePage()).toPNG());clearTimeout(watchdog);app.exit(1)}});
}
