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
  const data = { projects: [{ id: worker.projectId, title: 'Presence fixture', root: out, icon: null, scratch: false }], threads: [], models: {}, prices: {}, shipped: { today: 0, total: 0 } };
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
  const control = process.argv[4] === 'control';
  const report = { startedAt: stamp, control, baseline: control ? 'Newly captured reconstruction of prior startup/CSS behavior, not historical footage' : null, build, checks: [], captures: [], scope: 'Isolated native Electron, production Park/ChargingRoom/Walker/SubscriptionBatteries. Synthetic provider data, no live account or task mutations.' };
  const deadline = setTimeout(() => { console.error('Bounded native startup review timed out'); app.exit(1); }, 45000);
  let win;
  const ev = code => win.webContents.executeJavaScript(code);
  const check = (name, ok, detail) => { report.checks.push({name,ok,detail}); assert(ok, name + ': ' + JSON.stringify(detail)); };
  const capture = async name => { const file=path.join(out,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());report.captures.push({file,sha256:hash(fs.readFileSync(file))}); };
  app.whenReady().then(async () => { try {
    await wait(500); win=BrowserWindow.getAllWindows()[0];
    for(let i=0;i<80 && !await ev('!!window.__world?.ext.charging&&!!window.__world?.park.geo');i++) await wait(100);
    await ev(`{
      window.world=window.__world; world.update=()=>{}; world.stopCameraMotion();world.unfocus(false);
      window.park=world.park;window.charge=world.ext.charging;
      window.limit=(id,usedPercent,stale=false)=>({id,usedPercent,stale,windowMinutes:id==='seven_day'?10080:300,resetsAt:new Date(Date.now()+3600000).toISOString(),observedAt:new Date().toISOString()});
      window.setQuota=(list)=>world.setUsage({limits:{'t3:claudeAgent':{harness:'claude',name:'Claude',observedAt:new Date().toISOString(),windows:list},'t3:work':{harness:'claude',name:'Work',observedAt:new Date().toISOString(),windows:[limit('work',20)]}}});
      window.fit=(r)=>{world.cam=world.fitTarget(r,20,world.scene.clientWidth,world.scene.clientHeight);world.apply();world.recull()};
      park.setThreads([]);charge.setThreads([]);
      window.parkList=Array.from({length:6},(_,i)=>({id:'park-review-'+i,provider:'work',name:'Park robot '+(i+1),title:'Startup park',look:{}}));
      setQuota([limit('five_hour',20),limit('seven_day',100)]);
      park.setThreads(parkList);
      window.initialPark=[...park.vis.values()].map(v=>({id:v.t.id,x:v.w.x,y:v.w.y,spot:v.spot?.key,doorDistance:Math.hypot(v.w.x-park.geo.door.x,v.w.y-park.geo.door.y)}));
      fit(park.geo.park);
    }`);
    const park=await ev('initialPark');
    check('Six unique park actors after empty then populated snapshot',park.length===6&&new Set(park.map(r=>r.id)).size===6,park);
    check('Park startup placement matches expected comparison',control?park.every(r=>r.doorDistance===0):park.every(r=>r.doorDistance>30)&&new Set(park.map(r=>r.x+','+r.y)).size===6,park);
    await capture(control?'before-reconstructed-park':'after-park');
    await ev(`{
      window.chargeList=Array.from({length:6},(_,i)=>({id:'charge-review-'+i,provider:'claudeAgent',name:'Claude robot '+(i+1),title:'Startup charging'}));
      charge.setThreads(chargeList);charge.setThreads(chargeList);
      window.initialCharge=[...charge.residents.values()].map(r=>({id:r.info.id,x:r.w.x,y:r.w.y,target:charge.spot(r.slot),docked:!r.label.hidden}));
      window.room=world.rooms.find(r=>r.id==='charging');fit({x:room.x,y:room.y,w:1500,h:800});charge.paint();
    }`);
    const charging=await ev('initialCharge');
    check('Six unique charging actors after empty and repeated populated snapshots',charging.length===6&&new Set(charging.map(r=>r.id)).size===6,charging);
    check('Charging startup placement matches expected comparison',control?charging.every(r=>!r.docked):charging.every(r=>r.docked&&r.x===r.target.x&&r.y===r.target.y),charging);
    const actorCounts=await ev(`({park:park.layer.querySelectorAll('.world-walker').length,charging:charge.el.querySelectorAll('.world-walker').length})`);
    check('DOM contains exactly one native actor per requested robot',actorCounts.park===6&&actorCounts.charging===6,actorCounts);
    await capture(control?'before-reconstructed-charging':'after-charging');
    await ev(`{
      window.w=[...park.vis.values()][0].w;w.setBrand('claudeAgent');
      window.readQuota=()=>{w.refreshBattery();return {weakness:w.weakness,remaining:w.remainingBattery}}; void 0;
    }`);
    check('Exhausted Claude is depleted natively',(await ev('readQuota()')).remaining===0);
    await ev("setQuota([limit('five_hour',20)]);");
    check('Missing weekly reading retains exhausted Claude',(await ev('readQuota()')).remaining===0);
    await ev("setQuota([limit('seven_day',10,true)]);");
    check('Stale recovery cannot release Claude',(await ev('readQuota()')).remaining===0);
    const work=await ev(`{const other=[...park.vis.values()][1].w;other.refreshBattery();({remaining:other.remainingBattery,weakness:other.weakness})}`);
    check('Independent Claude account is unaffected',work.remaining===80&&work.weakness===0,work);
    await ev("setQuota([limit('seven_day',10)]);");
    check('Fresh recovery restores capacity',(await ev('readQuota()')).remaining===90);
    await ev(`{ w.do('charge');fit(park.geo.park); }`);
    const icons=await ev(`[...document.querySelectorAll('.world-battery')].filter(e=>getComputedStyle(e).display!=='none').length`);
    check('Overhead battery CSS matches expected comparison',control?icons>0:icons===0,icons);
    await capture(control?'before-reconstructed-battery':'after-battery');
    if (!control) {
      await ev(`{
        window.routingData={projects:[{id:'routing-project',title:'Routing fixture',root:'C:/fixture',scratch:false}],threads:[...chargeList.map(t=>({...t,projectId:'routing-project',runStatus:'running',settled:false,updatedAt:new Date().toISOString()})),{id:'independent-account',provider:'work',projectId:'routing-project',title:'Independent account',runStatus:'running',settled:false,updatedAt:new Date().toISOString()}]};
        window.route=()=>Object.getPrototypeOf(world).update.call(world,routingData);
        setQuota([limit('seven_day',100)]);world.hasLayout=false;route();
      }`);
      for (const [name,reading] of [['exhausted',"[limit('seven_day',100)]"],['partial',"[limit('five_hour',20)]"],['stale',"[limit('seven_day',10,true)]"]]) {
        await ev(`setQuota(${reading});route();`);
        const state=await ev(`({claude:chargeList.map(t=>world.roomOf.get(t.id)),other:world.roomOf.get('independent-account'),actors:charge.residents.size})`);
        check('World keeps exhausted Claude charging through '+name+' data',state.claude.every(r=>r==='charging')&&state.other!=='charging'&&state.actors===6,state);
      }
      await ev("setQuota([limit('seven_day',10)]);route();");
      const recovered=await ev(`({rooms:chargeList.map(t=>world.roomOf.get(t.id)),leaving:[...charge.residents.values()].every(r=>r.leaving)})`);
      check('World releases charging robots only on fresh recovery',recovered.rooms.every(r=>r!=='charging')&&recovered.leaving,recovered);
    }
    const scriptUrls=await ev('[...document.scripts].map(s=>s.src).filter(Boolean)');
    const dbg=win.webContents.debugger;dbg.attach('1.3');const parsed=[];
    dbg.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await dbg.sendCommand('Debugger.enable');
    report.assets=[];
    for(const url of scriptUrls){const file=require('node:url').fileURLToPath(url),p=parsed.find(p=>p.url===url);assert(p,'parsed executing entry');const source=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:p.scriptId});const a={url,sha256:hash(fs.readFileSync(file)),executingSha256:hash(source.scriptSource)};assert.equal(a.sha256,a.executingSha256);report.assets.push(a)}
    dbg.detach();
    const manifest=path.join(build,'lucid-build.json');report.manifest={path:manifest,sha256:hash(fs.readFileSync(manifest)),data:JSON.parse(fs.readFileSync(manifest))};
    report.ok=true;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,out,checks:report.checks.length}));clearTimeout(deadline);app.exit(0);
  }catch(error){report.ok=false;report.error=String(error.stack||error);if(win)await capture('failure').catch(()=>{});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.error(error);clearTimeout(deadline);app.exit(1)}});
}
