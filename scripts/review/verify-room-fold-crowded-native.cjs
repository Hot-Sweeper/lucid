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
  const data = {projects:[{id:'collapse-project',title:'Collapse review',root:out,icon:null,scratch:false}],threads:Array.from({length:6},(_,i)=>({...worker,id:'collapse-worker-'+i,projectId:'collapse-project',title:'Occupied office '+i})),models:{},prices:{},shipped:{today:0,total:0}};
  const info = () => ({ id: worker.id, title: worker.title, provider: worker.provider, model: worker.model, effort: 'high', root: out, queued: [], run: { id: 'presence-run', status: worker.runStatus } });
  const items = [], reads = { world: 0, info: 0, items: 0, approvals: 0, outcomes: 0 };
  let pending = [], outcome = null;
  const t3 = require('../../electron/t3.cjs');
  Object.assign(t3, { world: () => { reads.world++; return structuredClone(data); }, threadInfo: () => { reads.info++; return info(); },
    listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects,
    watchThread: () => () => {}, conversation: () => [], conversationPage: () => ({ messages: [], hasMore: false, cursor: null }),
    pendingRequests: () => { reads.approvals++; return structuredClone(pending); }, requestOutcome: () => { reads.outcomes++; return outcome; },
    repliesSince: () => ({ messages: [], exists: true, runStatus: 'running' }), userMessagesSince: () => [], resolvedRequestsSince: () => [],
    itemsSince: () => { reads.items++; return structuredClone(items); }, recentItems: () => { reads.items++; return structuredClone(items); } });
  Object.assign(require('../../electron/t3server.cjs'), { usageLimits: async () => ({ providers: [] }), status: async () => ({ paired: true }), closeSock: () => {}, dispatch: async () => { throw Error('External mutation forbidden in presence fixture'); } });
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(require('../../electron/usage.cjs'), { getSessionUsage: async () => ({ available: false, tokens: null, costUsd: null }), getUsage: async () => ({ updatedAt: stamp, windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }) });
  const remoteData={...data,environmentId:'fold-remote',threads:data.threads.map(t=>({...t,id:'fold-remote::'+t.id}))};
  Object.assign(require('../../electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture', local: true,canOpen:true },{id:'fold-remote',label:'Connected review computer',local:false,canOpen:true,reason:null}] }),remote:{world:async()=>structuredClone(remoteData),split:id=>id.includes('::')?{environmentId:'fold-remote',id:id.split('::')[1]}:null,watch:()=>()=>{}} });
  Object.assign(require('../../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  require('../../electron/main.cjs');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let win;
  const report = { build, startedAt: stamp, checks: [], captures: [], synthetic: true, productionTouched: false, baselineLabel: process.argv[4]==='baseline'?'New capture of retained pre-change build bytes, not historical footage':null };
  const ev = code => win.webContents.executeJavaScript(code);
  const until=async(expr,label,ms=45000)=>{const start=Date.now();while(Date.now()-start<ms){if(await ev(expr))return;await wait(100)}throw Error('Timeout '+label+': '+JSON.stringify(await ev('window.foldState?.()')))};
  const check=(name,ok,detail)=>{report.checks.push({name,ok,detail});assert(ok,name+': '+JSON.stringify(detail));};
  const capture=async(name)=>{await wait(180);const file=path.join(out,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());report.captures.push({file,sha256:hash(fs.readFileSync(file))});};
  const click=async()=>{const p=await ev(`(()=>{const b=fw.rooms.find(r=>r.id==='p:collapse-project').el.querySelector('.room-size-hit');const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:b.textContent}})()`);report.clicks??=[];report.clicks.push(p);win.webContents.sendInputEvent({type:'mouseDown',x:p.x,y:p.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:p.x,y:p.y,button:'left',clickCount:1});};
  const deadline=setTimeout(()=>{console.error('Native fold deadline');app.exit(1)},180000);
  app.whenReady().then(async()=>{try{
    await wait(300);win=BrowserWindow.getAllWindows()[0];win.setSize(1400,1000);win.webContents.setBackgroundThrottling(false);
    await until('window.__world?.desks.size===6','initial office');
    await ev(`window.host=__world;window.fw=host;window.foldState=()=>({held:fw.physicalLayoutHeld,collapsed:fw.rooms.find(r=>r.id==='p:collapse-project')?.collapsed,transit:fw.transit.size,exits:fw.exits.size,placed:[...fw.placed],roomOf:[...fw.roomOf],desks:[...fw.desks].map(([id,d])=>({id,present:d.wm.operatorPresent})),participants:[...fw.layoutParticipants],actors:[...fw.transit].map(([id,a])=>({id,x:a.x,y:a.y})),spots:[...fw.meetingSpots],size:fw.size,topH:fw.topH});window.frameFold=()=>{const r=fw.rooms.find(r=>r.id==='p:collapse-project');host.stopCameraMotion();host.unfocus(false);const entry=[...host.neighbors.values()].find(e=>e.office===fw);host.flyTo({x:r.x+(entry?.x||0),y:r.y+(entry?.y||0),w:r.w,h:r.h},50,0)};void 0`);
    report.manifest=JSON.parse(fs.readFileSync(path.join(build,'lucid-build.json')));
    report.samples=[];
    for(const scope of ['local','connected']){
      if(scope==='connected'){
        await until('[...host.neighbors.values()].some(e=>e.office?.desks.size===6)','connected office');
        await ev('fw=host.neighbors.get("fold-remote").office;void 0');
      }
      await until('fw.transit.size===0&&[...fw.desks.values()].every(d=>d.wm.operatorPresent)','initial seated');
      await ev('frameFold();void 0');await wait(500);await capture(scope+'-01-occupied');
      const before=await ev('({seats:JSON.stringify([...fw.seats]),robot:fw.roster.byThread(fw.lastData.threads[0].id)?.id})');
      await ev(`{window.foldTrace=[];window.foldPromotions=[];const update=fw.update.bind(fw);fw.update=d=>{const held=fw.physicalLayoutHeld,old=fw.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h})),actors=[...fw.transit].map(([id,a])=>({id,x:a.x,y:a.y}));update(d);if(held&&!fw.physicalLayoutHeld)foldPromotions.push({old,actors})};window.foldTimer=setInterval(()=>{const id=fw.lastData.threads[0].id;foldTrace.push({time:performance.now(),state:foldState(),actors:[...fw.transit].map(([id,a])=>({id,x:a.x,y:a.y})),walkers:[...fw.root.querySelectorAll('.world-walker[data-id]')].filter(n=>n.dataset.id===id).length})},50);void 0}`);
      await click();await wait(120);
      const departure=await ev('foldState()');check(scope+': prompt departure',departure.transit>0,departure);
      await capture(scope+'-02-departing');
      await until('fw.rooms.find(r=>r.id==="p:collapse-project").collapsed&&!fw.physicalLayoutHeld','completed collapse');
      await until('fw.transit.size===0&&fw.exits.size===0','collapsed destination');
      await ev('frameFold();void 0');await wait(500);await capture(scope+'-03-collapsed');
      check(scope+': collapsed control',await ev('fw.rooms.find(r=>r.id==="p:collapse-project").el.querySelector(".room-size-hit").getAttribute("aria-expanded")==="false"'));
      await click();
      await until('!fw.rooms.find(r=>r.id==="p:collapse-project").collapsed&&fw.transit.size===0&&fw.exits.size===0&&[...fw.desks.values()].every(d=>d.wm.operatorPresent)','physical return');
      await ev('frameFold();void 0');await wait(500);await capture(scope+'-04-returned');
      const after=await ev('({state:foldState(),seats:JSON.stringify([...fw.seats]),robot:fw.roster.byThread(fw.lastData.threads[0].id)?.id,walkers:[...fw.root.querySelectorAll(".world-walker[data-id]")].filter(n=>n.dataset.id===fw.lastData.threads[0].id).length})');
      check(scope+': one seated actor without transit duplicate',after.state.desks.length===6&&after.state.desks[0].present&&after.walkers===0,after);
      check(scope+': identity and reservations preserved',before.robot===after.robot&&before.seats===after.seats,{before,after});
      const trace=await ev('clearInterval(foldTimer);({samples:foldTrace,promotions:foldPromotions})');
      check(scope+': no duplicate walkers during transition',trace.samples.every(s=>s.walkers<=1),{samples:trace.samples.length});
      check(scope+': collapse promoted only after actor cleared old office',trace.promotions.length>0&&trace.promotions.every(p=>p.actors.every(a=>{const r=p.old.find(r=>r.id==='p:collapse-project');return !(a.x>r.x&&a.x<r.x+r.w&&a.y>r.y&&a.y<r.y+r.h)})),trace.promotions);
      report.samples.push({scope,departure,after,trace});
    }
    const urls=await ev('[...document.scripts].map(s=>s.src).filter(Boolean)'),dbg=win.webContents.debugger,parsed=[];dbg.attach('1.3');dbg.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await dbg.sendCommand('Debugger.enable');report.assets=[];
    for(const url of urls){const p=parsed.find(p=>p.url===url);assert(p);const src=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:p.scriptId});const disk=hash(fs.readFileSync(require('url').fileURLToPath(url)));assert.equal(hash(src.scriptSource),disk);report.assets.push({url,sha256:disk,executingSha256:hash(src.scriptSource)})}dbg.detach();report.ok=true;
  }catch(e){report.ok=false;report.error=String(e.stack||e);if(win)await capture('failure').catch(()=>{});}finally{clearTimeout(deadline);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,error:report.error,checks:report.checks.length,out}));app.exit(report.ok?0:1)}});
}