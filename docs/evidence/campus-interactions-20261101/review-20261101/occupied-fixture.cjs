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
  Object.assign(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture', local: true }] }) });
  Object.assign(require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  const remoteData={...structuredClone(data),environmentId:'remote',projects:[{...data.projects[0],id:'remote::project',title:'Remote project'},{...data.projects[0],id:'remote::empty',title:'Remote empty'}],threads:[{...worker,id:'remote::worker',projectId:'remote::project'}]};
  const environments=require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/environments.cjs');
  environments.getEnvironments=async()=>({localId:'fixture',buildings:[{id:'fixture',label:'Local',local:true,canOpen:true},{id:'remote',label:'Remote',local:false,canOpen:true}]});
  Object.assign(environments.remote,{world:async()=>structuredClone(remoteData),cached:()=>structuredClone(remoteData),watch:()=>()=>{},info:()=>({...info(),id:'remote::worker'}),items:async()=>[],conversation:async()=>[],conversationPage:async()=>({messages:[],hasMore:false}),pending:async()=>[]});
  require('E:/T3 Projects/Lucid/.lucid-update-fjpmiT/electron/main.cjs');

  const wait=ms=>new Promise(r=>setTimeout(r,ms));let win;const checks=[];
  const js=code=>win.webContents.executeJavaScript(code,true);
  const until=async(code)=>{for(let i=0;i<600;i++){if(await js(code))return;await wait(50)}console.log(await js("JSON.stringify({env:__world.lastData.environmentId,focus:__world.focusDesk?.threadId,desks:[...__world.desks.keys()],held:__world.physicalLayoutHeld,rooms:__world.rooms.map(r=>({id:r.id,folded:r.collapsed})),errors:[...document.querySelectorAll('.neighbor-status')].map(e=>e.textContent),neighbor:[...__world.neighbors].map(([id,e])=>({id,held:e.office?.physicalLayoutHeld,collapsed:[...e.office?.collapsedRooms??[]],trips:[...e.office?.transit??[]].map(([id,w])=>({id,x:w.x,y:w.y})),exits:[...e.office?.exits??[]],meet:e.office?.pendingMeeting}))})"));throw Error('Timeout '+code)};
  const check=async(name,code)=>{assert(await js(code),name);checks.push(name);console.log('PASS '+name)};
  const watchdog=setTimeout(()=>app.exit(1),150000);
  app.whenReady().then(async()=>{try{
    await wait(300);win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);
    await until("!!window.__world?.neighbors.get('remote')?.office");
    win.webContents.debugger.attach('1.3');const parsed=[];win.webContents.debugger.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await win.webContents.debugger.sendCommand('Debugger.enable');await wait(200);const entry=parsed.find(p=>/index-[^/]+\.js$/.test(p.url));const executing=(await win.webContents.debugger.sendCommand('Debugger.getScriptSource',{scriptId:entry.scriptId})).scriptSource;win.webContents.debugger.detach();const file=require('url').fileURLToPath(entry.url);assert.equal(hash(Buffer.from(executing)),hash(fs.readFileSync(file)));fs.writeFileSync(path.join(out,'tested-build.json'),JSON.stringify({at:new Date().toISOString(),manifest:JSON.parse(fs.readFileSync(path.join(build,'lucid-build.json'))),entry:entry.url,executingSha256:hash(Buffer.from(executing)),diskSha256:hash(fs.readFileSync(file)),matches:true},null,2));
    await check('buildings separated by one hallway',"(()=>{const w=__world;return w.neighbors.get('remote').x-w.size.w===150})()");
    await check('empty remote office has full workstation',"(()=>{const o=__world.neighbors.get('remote').office,r=o.rooms.find(r=>r.id==='p:remote::empty');return !r.collapsed&&o.freeDesks.some(d=>d.room===r.id)})()");
    await until("__world.neighbors.get('remote').office.desks.get('remote::worker')?.wm.operatorPresent");
    await js(`(()=>{window.__occupiedSamples=[];window.__occupiedTimer=setInterval(()=>{const o=__world.neighbors.get('remote')?.office;if(!o)return;const id='remote::worker';const walkers=[...o.root.querySelectorAll('.world-walker')].filter(e=>e.dataset.id===id).length;const seated=[...o.desks.values()].filter(d=>d.threadId===id&&d.wm.operatorPresent).length;__occupiedSamples.push({at:performance.now(),walkers,seated,total:walkers+seated,held:o.physicalLayoutHeld,transit:o.transit.has(id),trip:o.trips.has(id),exiting:o.exits.has(id),folded:o.rooms.find(r=>r.id==='p:remote::project')?.collapsed})},40)})()`);
    await js("__world.overview()");await wait(1100);fs.writeFileSync(path.join(out,'after-corrected-overview.png'),(await win.webContents.capturePage()).toPNG());
    await js("__world.neighbors.get('remote').office.showRoom('p:remote::project')");await wait(900);fs.writeFileSync(path.join(out,'after-expanded-occupied-control.png'),(await win.webContents.capturePage()).toPNG());
    await js("__world.neighbors.get('remote').office.rooms.find(r=>r.id==='p:remote::project').el.querySelector('.room-size-hit').click()");
    await until("__world.neighbors.get('remote').office.rooms.find(r=>r.id==='p:remote::project').collapsed");
    await until("(()=>{const o=__world.neighbors.get('remote').office;return !o.physicalLayoutHeld&&!o.transit.has('remote::worker')&&!o.trips.has('remote::worker')&&!o.exits.has('remote::worker')})()");
    await js("(()=>{const e=__world.neighbors.get('remote'),r=e.office.rooms.find(r=>r.id==='p:remote::project');__world.flyTo({x:e.x+r.x-20,y:r.y-20,w:r.w+40,h:r.h+40},20,.1)})()");await wait(500);fs.writeFileSync(path.join(out,'after-collapsed-occupied-control.png'),(await win.webContents.capturePage()).toPNG());
    await check('collapse choice retained',"__world.exportLayouts().remote.collapsedRooms.includes('p:remote::project')");
    await js("__world.neighbors.get('remote').office.rooms.find(r=>r.id==='p:remote::project').el.querySelector('.room-size-hit').click()");
    await until("!!__world.neighbors.get('remote').office.desks.get('remote::worker')");
    await until("(()=>{const o=__world.neighbors.get('remote').office;return o.desks.get('remote::worker')?.wm.operatorPresent&&!o.physicalLayoutHeld&&!o.transit.has('remote::worker')&&!o.trips.has('remote::worker')&&!o.exits.has('remote::worker')})()");
    const occupied=await js("(()=>{clearInterval(__occupiedTimer);return {samples:__occupiedSamples,final:__occupiedSamples.at(-1)}})()");
    assert(occupied.samples.length>5);assert(occupied.samples.every(s=>s.total<=1),'no duplicate actor during occupied collapse or expansion');assert.equal(occupied.final.total,1,'one seated actor after expansion');
    fs.writeFileSync(path.join(out,'occupied-transition.json'),JSON.stringify({ok:true,checks:['occupied office folded and evacuation completed','expanded actor physically seated','no unfinished transit/trip/exit ownership','no duplicate actor in sampled transition'],...occupied},null,2));
    // Click the neighboring monitor, not an inventory row.
    await js("__world.neighbors.get('remote').office.showRoom('p:remote::project')");await wait(900);
    const monitor=await js("(()=>{const el=__world.neighbors.get('remote').office.desks.get('remote::worker').monitor,r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}})()");
    assert(monitor.hit,'neighbor monitor receives real pointer hit');
    win.webContents.sendInputEvent({type:'mouseDown',x:monitor.x,y:monitor.y,button:'left',clickCount:1});
    win.webContents.sendInputEvent({type:'mouseUp',x:monitor.x,y:monitor.y,button:'left',clickCount:1});
    await until("__world.lastData.environmentId==='remote'&&__world.focusDesk?.threadId==='remote::worker'");
    await until("__chat.threadId==='remote::worker'");
    await check('neighbor computer opens authenticated conversation',"__world.focusMode==='desk'&&__chat.threadId==='remote::worker'");
    await js("__world.desks.get('remote::worker').monitor.click()");
    await check('second monitor click opens screen view',"__world.focusMode==='screen'");
    // Return through the real building selector, then use the remote empty desk.
    await js("document.querySelectorAll('.environment-row')[0].click()");
    await until("!__world.lastData.environmentId&&!!__world.neighbors.get('remote')?.office");
    await js("__world.neighbors.get('remote').office.freeDesks.find(d=>d.room==='p:remote::empty').monitor.click()");
    await until("__world.lastData.environmentId==='remote'&&!!document.querySelector('.hire-dialog, .hire-wrap')");
    checks.push('neighbor empty monitor opens task composer after environment switch');
    await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await js("__world.showRoom('p:remote::empty')");await wait(1200);
    fs.writeFileSync(path.join(out,'empty-office.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,checks,fixture:'isolated T3/remote/usage/weather adapters; production renderer and IPC'},null,2));
    console.log('PASS campus interaction fixture: '+out);clearTimeout(watchdog);app.exit(0);
  }catch(error){console.error(error);if(win)fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());clearTimeout(watchdog);app.exit(1)}});
}

