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
  if (process.env.FIXTURE_DPR) app.commandLine.appendSwitch('force-device-scale-factor', process.env.FIXTURE_DPR);
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = app.getPath('userData');
  process.env.LUCID_SHOT_EVERY = '600000'; process.env.LUCID_SHOT_COUNT = '1000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.join(build, 'index.html')).href;
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({ orch: { auto: false, review: false, paused: true } }));
  const stamp = new Date().toISOString();
  const worker = { id: 'presence-worker', projectId: 'presence-project', title: 'Chair presence native fixture', provider: 'codex', model: 'Fixture model', updatedAt: stamp, runStatus: 'running', question: null, pinned: false, settled: false };
  const data = { projects: Array.from({length:6},(_,i)=>({id:'campus-project-'+i,title:['Lucid','Music studio','Website','Research','Tools','A long project name for layout review'][i],root:out,icon:null,scratch:false})), threads: Array.from({length:18},(_,i)=>({...worker,id:'campus-worker-'+i,projectId:'campus-project-'+(i%6),runStatus:i<5?'running':'completed',settled:i>=5,title:'Project task '+(i+1)})), models: {}, prices: {}, shipped: { today: 0, total: 0 } };
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
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),control=process.argv[4]==='control';let win;
  const report={build,control,checks:[],captures:[],frames:{},hardware:{cpu:require('os').cpus()[0].model},productionTouched:false};
  const ev=code=>win.webContents.executeJavaScript(code),check=(name,ok,details)=>{report.checks.push({name,ok,details});assert(ok,name)};
  const capture=async name=>{for(let i=0;i<80&&await ev('w.landscape?.metrics().queued||0');i++)await wait(50);await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null))))');const file=path.join(out,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());report.captures.push({file,sha256:hash(fs.readFileSync(file))})};
  const timeout=setTimeout(()=>{console.error('Atmosphere fixture deadline');app.exit(1)},60000);
  app.whenReady().then(async()=>{try {
    await wait(300);win=BrowserWindow.getAllWindows()[0];if(process.env.FIXTURE_SIZE){const [W,H]=process.env.FIXTURE_SIZE.split('x').map(Number);win.unmaximize?.();win.setContentSize(W,H)}
    for(let i=0;i<100&&!await ev('!!window.__world?.rooms.length');i++)await wait(100);
    await ev(`{window.w=__world;w.update=()=>{};w.stopCameraMotion();w.unfocus(false);window.frame=()=>{w.stopCameraMotion();w.sceneBox=null;Object.assign(w.cam,w.fitTarget({x:w.grounds.bounds.x,y:w.grounds.bounds.y,w:Math.max(w.grounds.bounds.x+w.grounds.bounds.w,w.campusRight)-w.grounds.bounds.x,h:Math.max(w.grounds.bounds.y+w.grounds.bounds.h,w.campusHeight)-w.grounds.bounds.y},50,w.scene.clientWidth,w.scene.clientHeight));w.apply()};frame();void 0}`);
    await ev(`w.setBuildings([{id:'remote',label:'Connected computer',local:false,canOpen:true,reason:null}],async()=>{},async()=>({...${JSON.stringify(data)},environmentId:'remote',threads:${JSON.stringify(data.threads.slice(0,9).map(t=>({...t,id:'remote-'+t.id})))}}));void 0`);
    for(let i=0;i<100&&!await ev('[...w.neighbors.values()].every(e=>e.office)');i++)await wait(100);
    await ev('w.drawBuildings();w.finishRoomTransitions();frame();void 0');
    if(!control) {
      for(const [name,month,hour,kind,temp] of [['spring-day',3,12,'clear',16],['summer-day',6,12,'clear',25],['autumn-day',10,12,'clear',10],['winter-snow',0,12,'snow',-3],['autumn-night',10,23,'clear',8],['autumn-night-rain',10,23,'rain',8]]) {
        const iso=new Date(2026,month,1,hour).toISOString();
        await ev(`{const Original=window.Date;const time=${JSON.stringify(iso)};window.Date=class extends Original{constructor(...args){super(...(args.length?args:[time]))}static now(){return Original.parse(time)}};try{w.dry=null;w.setWeather({kind:${JSON.stringify(kind)},tempC:${temp},windKmh:12,isDay:${hour===12},sunrise:null,sunset:null,observedAt:time,place:'Isolated fixture'});w.daylight();w.syncBuildings();frame()}finally{window.Date=Original}void 0}`);
        const state=await ev(`({night:w.root.style.getPropertyValue('--outdoor-night'),ground:w.scene.style.getPropertyValue('--scene-ground'),local:getComputedStyle(w.root).getPropertyValue('--night'),remote:[...w.neighbors.values()].map(e=>({night:getComputedStyle(e.office.root).getPropertyValue('--night'),shade:getComputedStyle(e.office.root.querySelector('.night-shade')).display,opacity:getComputedStyle(e.office.root.querySelector('.night-shade')).opacity})),svgNodes:w.root.querySelector('.outside-plain').querySelectorAll('*').length,forest:Number(w.root.querySelector('.landscape')?.dataset.trees||0),texture:!!w.root.querySelector('.landscape-overview')?.width,tiles:w.landscape?.metrics(),animations:w.root.querySelector('.outside-plain').querySelectorAll('animate,animateTransform,filter').length})`);
        check(name+': connected buildings share lighting',state.remote.every(e=>e.night.trim()===state.local.trim()&&e.shade!=='none'),state);
        check(name+': outside matches day/night',hour===23?Number(state.night)>=.8:Number(state.night)<.15,state);
        check(name+': bounded static artwork',state.svgNodes<2200&&state.animations===0&&state.forest>=200&&state.texture,state);
        await capture(name);
        await ev(`{w.stopCameraMotion();const p=w.outdoor.park;Object.assign(w.cam,w.fitTarget({x:p.x+p.w-500,y:p.y-500,w:1700,h:1100},0,w.scene.clientWidth,w.scene.clientHeight));w.apply();void 0}`);
        await capture(name+'-close');
        await ev(`{w.stopCameraMotion();Object.assign(w.cam,w.fitTarget({x:-100,y:-100,w:1500,h:1200},0,w.scene.clientWidth,w.scene.clientHeight));w.apply();void 0}`);await wait(400);
        await capture(name+'-office');await ev('frame();void 0');
      }
      // Use the unmodified production camera bounds, unlike the old evidence helper.
      await ev('w.overview();w.cameraTween.progress(1);void 0');
      const framed=await ev(`{const scene=w.scene.getBoundingClientRect(),p=w.root.getBoundingClientRect();({scene:scene.toJSON(),park:{x:p.x+w.outdoor.park.x*w.cam.s,y:p.y+w.outdoor.park.y*w.cam.s,w:w.outdoor.park.w*w.cam.s,h:w.outdoor.park.h*w.cam.s}})}`);
      check('Production overview includes the park with margin',framed.park.x+framed.park.w<framed.scene.right&&framed.park.y+framed.park.h<framed.scene.bottom,framed);
    }
    // Same isolated daytime workload in both builds. Timing is rAF interval, not OS FPS.
    await ev(`{w.setWeather(null);w.daylight(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate(),12));w.root.style.setProperty('--night','0');w.root.style.setProperty('--outdoor-night','0');w.scene.style.setProperty('--scene-night','0');frame();void 0}`);
    for(const name of ['overview','park-close','pan','zoom']) {
      if(name==='park-close')await ev('w.flyTo(w.outdoor.park,40,.01);void 0');else await ev('frame();void 0');
      await wait(300);
      report.frames[name]=await ev(`new Promise(resolve=>{const samples=[],base={x:w.cam.x,y:w.cam.y,s:w.cam.s};let previous=0,start=0;const step=t=>{if(!start)start=t;if(previous)samples.push(t-previous);previous=t;if(${JSON.stringify(name)}==='pan'){w.cam.x=base.x+Math.sin((t-start)/400)*90;w.apply()}if(${JSON.stringify(name)}==='zoom'){const W=w.scene.clientWidth/2,H=w.scene.clientHeight/2,k=base.s*(1+2.5*(1-Math.cos((t-start)/500))),wx=(W-base.x)/base.s,wy=(H-base.y)/base.s;w.cam.s=k;w.cam.x=W-wx*k;w.cam.y=H-wy*k;w.apply();const m=w.landscape?.metrics();window.__maxTiles=Math.max(window.__maxTiles||0,m?.tiles||0)}if(t-start<2000)requestAnimationFrame(step);else{Object.assign(w.cam,base);w.apply();samples.sort((a,b)=>a-b);resolve({samples:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],over33ms:samples.filter(t=>t>33.4).length,landscape:w.landscape?{...w.landscape.metrics(),maxTiles:window.__maxTiles||0,stats:w.landscape.stats}:null})}};requestAnimationFrame(step)})`);
    }
    report.hardware.gpu=await app.getGPUInfo('basic');
    const dbg=win.webContents.debugger,parsed=[];dbg.attach('1.3');dbg.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await dbg.sendCommand('Debugger.enable');
    const entry=await ev('[...document.scripts].map(s=>s.src).find(s=>s.includes("/assets/index-"))'),p=parsed.find(p=>p.url===entry),executing=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:p.scriptId});dbg.detach();
    report.entry={url:entry,sha256:hash(fs.readFileSync(require('url').fileURLToPath(entry))),executingSha256:hash(executing.scriptSource)};assert.equal(report.entry.sha256,report.entry.executingSha256);report.ok=true;
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,out,checks:report.checks.length,frames:report.frames}));clearTimeout(timeout);app.exit(0);
  }catch(error){report.error=String(error.stack||error);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.error(error);clearTimeout(timeout);app.exit(1)}});
}
