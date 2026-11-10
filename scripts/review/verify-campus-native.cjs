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
  const data = { projects: Array.from({length:6},(_,i)=>({id:'campus-project-'+i,title:['Lucid','Music studio','Website','Research','Tools','A long project name for layout review'][i],root:out,icon:null,scratch:false})), threads: Array.from({length:18},(_,i)=>({...worker,id:'campus-worker-'+i,projectId:'campus-project-'+(i%6),runStatus:i<5?'running':'completed',settled:i>=5,title:'Project task '+(i+1)})), models: {}, prices: {}, shipped: { today: 0, total: 0 } };
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
  Object.assign(require('../../electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture', local: true }] }) });
  Object.assign(require('../../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  require('../../electron/main.cjs');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let win;
  const report = { build, startedAt: stamp, checks: [], captures: [], synthetic: true, productionTouched: false, baselineLabel: process.argv[4]==='baseline'?'New capture of retained pre-change build bytes, not historical footage':null };
  const ev = code => win.webContents.executeJavaScript(code);
  const measure = () => ev(`(()=>{
    const scene=w.scene.getBoundingClientRect(),root=w.root.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(w.root).transform);
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    const project=r=>({x:root.x+r.x*m.a,y:root.y+r.y*m.d,w:r.w*m.a,h:r.h*m.d});
    const targets=[...w.rooms.map(r=>({id:r.id,kind:'room',...rect(r.el)})),
      {id:'park',kind:'park',...project(w.outdoor.park)},
      ...w.park.toys.spots.filter(s=>['pond','fountain'].includes(s.kind)).map(s=>({id:s.key,kind:'park-target',...project({x:s.x-s.rx,y:s.y-s.ry,w:s.rx*2,h:s.ry*2})})),
      ...[...w.neighbors.values()].flatMap(e=>e.office?e.office.rooms.map(r=>({id:e.open.textContent+':'+r.id,kind:'neighbor-room',...rect(r.el)})):[])];
    const inside=r=>r.w>0&&r.h>0&&r.x>=scene.x+12&&r.y>=scene.y+12&&r.x+r.w<=scene.right-12&&r.y+r.h<=scene.bottom-12;
    return {hidden:document.hidden,inert:w.scene.inert,cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},matrix:{a:m.a,d:m.d,e:m.e,f:m.f},root:rect(w.root),scene:rect(w.scene),targets:targets.map(r=>({...r,inside:inside(r)})),dpr:devicePixelRatio,viewport:{w:innerWidth,h:innerHeight}};
  })()`);
  const capture = async (name, overview = true) => {
    // Let the actual DOM and compositor observe the final camera and resize.
    await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(null))))');
    const rendered=await measure();
    check(name+': rendered transform matches camera',Math.abs(rendered.matrix.a-rendered.cam.s)<.00001&&Math.abs(rendered.matrix.e-rendered.cam.x)<.01&&Math.abs(rendered.matrix.f-rendered.cam.y)<.01&&Math.abs(rendered.root.x-rendered.scene.x-rendered.cam.x)<.1&&Math.abs(rendered.root.y-rendered.scene.y-rendered.cam.y)<.1,rendered);
    if(overview)check(name+': rendered rooms, park, pond and fountain are inside scene',rendered.targets.every(r=>r.inside),rendered.targets.filter(r=>!r.inside));
    const file=path.join(out,name+'.png'),png=await win.webContents.capturePage(),after=await measure();
    check(name+': camera unchanged during capture',JSON.stringify(rendered.matrix)===JSON.stringify(after.matrix)&&JSON.stringify(rendered.cam)===JSON.stringify(after.cam));
    fs.writeFileSync(file,png.toPNG());report.captures.push({file,sha256:hash(fs.readFileSync(file)),pngSize:png.getSize(),rendered});
  };
  const check = (name, ok, detail) => { report.checks.push({name,ok,detail}); assert(ok,name+': '+JSON.stringify(detail)); };
  const deadline = setTimeout(()=>{console.error('Campus fixture deadline');app.exit(1)},45000);
  app.whenReady().then(async()=>{try {
    await wait(300);win=BrowserWindow.getAllWindows()[0];
    for(let i=0;i<100&&!await ev('!!window.__world?.rooms.length');i++)await wait(100);
    await ev(`{window.w=window.__world;w.update=()=>{};
      // Evidence framing needs a margin beyond the game's minimum overview zoom.
      // Only this isolated fixture relaxes the minimum; production is untouched.
      window.normalZoomBounds=w.cameraZoomBounds.bind(w);
      w.cameraZoomBounds=()=>({...normalZoomBounds(),min:.001});
      w.stopCameraMotion();w.unfocus(false);window.frame=()=>{w.stopCameraMotion();Object.assign(w.cam,w.fitTarget({x:w.grounds.bounds.x-80,y:w.grounds.bounds.y-100,w:Math.max(w.campusRight,w.grounds.bounds.x+w.grounds.bounds.w,w.outdoor.park.x+w.outdoor.park.w)-w.grounds.bounds.x+160,h:Math.max(w.campusHeight,w.grounds.bounds.y+w.grounds.bounds.h,w.outdoor.park.y+w.outdoor.park.h)-w.grounds.bounds.y+200},20,w.scene.clientWidth,w.scene.clientHeight));w.sceneBox=null;w.apply();w.recull()};w.drawBuildings();frame();void 0}`);
    await wait(300);
    await capture('single-computer');
    report.single=await ev('({size:w.size,park:w.outdoor.park,entranceY:w.topH+75,campus:{w:w.campusRight,h:w.campusHeight}})');
    if(process.argv[4]!=='baseline')check('Park stays beside entrance',report.single.park.x-report.single.size.w===180&&report.single.park.y<=report.single.entranceY&&report.single.park.y+report.single.park.h>=report.single.entranceY,report.single);
    const sample={...data,environmentId:'fixture-remote'};
    await ev(`w.setBuildings(${JSON.stringify(Array.from({length:4},(_,i)=>({id:'remote-'+i,label:'Computer '+(i+1),local:false,canOpen:true,reason:null})))},async()=>{},async(id)=>({...${JSON.stringify(sample)},environmentId:id,threads:[],projects:[]}));void 0`);
    for(let i=0;i<100&&!await ev('[...w.neighbors.values()].every(e=>e.office)');i++)await wait(100);
    await ev('w.drawBuildings();frame();void 0');await wait(500);await ev('w.finishRoomTransitions();frame();void 0');await wait(100);await capture('campus-overview');
    report.campus=await ev('({bounds:{w:w.campusRight,h:w.campusHeight},buildings:[...w.neighbors.values()].map(e=>({x:e.x,y:e.y??0,cam:e.office.cam,size:e.office.size,park:e.office.outdoor.park})),actors:document.querySelectorAll(".world-walker").length})');
    {
      const corrected = process.argv[4]!=='baseline';
      if(corrected)check('Overview contains all building walls',await ev('[...w.neighbors.values()].every(e=>{const x=w.cam.x+e.x*w.cam.s,y=w.cam.y+e.y*w.cam.s;return x>=-1&&y>=-1&&x+e.office.size.w*w.cam.s<=w.scene.clientWidth+1&&y+e.office.size.h*w.cam.s<=w.scene.clientHeight+1})'));
      if(corrected)check('Connected buildings wrap into rows',report.campus.buildings.some(e=>e.y>0),report.campus);
      if(corrected){
      const aligned=await ev('[...w.neighbors.values()].every(e=>Math.abs(e.office.cam.y-(w.cam.y+(parseFloat(e.el.style.top)||0)*w.cam.s))<.1)');
      check('Embedded camera uses both campus coordinates',aligned);
      await ev('window.e=[...w.neighbors.values()].find(e=>e.y>0);e.office.showRoom(e.office.rooms[0].id);void 0');await wait(650);
      check('Room framing includes row offset',await ev('Math.abs(w.cam.y+(e.y+e.office.rooms[0].y+e.office.rooms[0].h/2)*w.cam.s-w.scene.clientHeight/2)<50'));
      await capture('neighbor-room',false);
      }
      win.setSize(600,850);await wait(250);await ev('frame();void 0');await capture('narrow-overview');
      check('Narrow viewport retains finite camera and unchanged campus coordinates',await ev('Number.isFinite(w.cam.s)&&w.cam.s>0&&[...w.neighbors.values()].every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y??0))'));
    }
    const urls=await ev('[...document.scripts].map(s=>s.src).filter(Boolean)'),dbg=win.webContents.debugger,parsed=[];dbg.attach('1.3');dbg.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await dbg.sendCommand('Debugger.enable');report.assets=[];
    for(const url of urls){const p=parsed.find(p=>p.url===url);assert(p);const source=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:p.scriptId});const disk=hash(fs.readFileSync(require('node:url').fileURLToPath(url)));assert.equal(hash(source.scriptSource),disk);report.assets.push({url,sha256:disk,executingSha256:hash(source.scriptSource)})}dbg.detach();
    report.manifest=JSON.parse(fs.readFileSync(path.join(build,'lucid-build.json')));report.ok=true;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,out,checks:report.checks.length}));clearTimeout(deadline);app.exit(0);
  }catch(error){report.error=String(error.stack||error);report.ok=false;if(win){try{fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG())}catch{}}fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.error(error);clearTimeout(deadline);app.exit(1)}});
}


