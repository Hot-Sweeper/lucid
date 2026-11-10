// Private, serial A/B launch and many-app benchmark. Never loads or writes production data.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const absoluteNow = () => performance.timeOrigin + performance.now();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const flag = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };

if (!process.versions.electron) {
  (async () => {
    const config = JSON.parse(fs.readFileSync(flag('--config'), 'utf8'));
    const out = path.resolve(flag('--out')); fs.mkdirSync(out, { recursive: true });
    const results = [], count = Number(flag('--count') || 6);
    const selected = process.argv.includes('--pairs') ? flag('--pairs').split(',').map(Number) : null;
    async function run(variant, phase, pair, profile) {
      const root = config[variant], id = `${phase}-${pair}-${variant}`, directory = path.join(out, id);
      if (!/[\\/]\.lucid-update-|[\\/]Lucid-validation[\\/]/i.test(root)) throw Error('Only private validation snapshots may be benchmarked');
      fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(profile, { recursive: true });
      const start = absoluteNow();
      const prepared = await require(path.join(root, 'electron/updater.cjs')).createUpdater(root).apply(undefined, { localOnly: true });
      if (prepared.updated) throw Error('Benchmark inputs were stale; preflight must not build');
      const preflightMs = absoluteNow() - start;
      const request = { root, directory, profile, variant, phase, pair, start, preflightMs,
        fixtureRoster: path.join(path.dirname(path.resolve(flag('--config'))), 'fixture-roster.json') };
      fs.writeFileSync(path.join(directory, 'request.json'), JSON.stringify(request));
      const env = { ...process.env, LUCID_BENCH_REQUEST: path.join(directory, 'request.json'), LUCID_SHOT: directory,
        LUCID_SHOT_PROFILE: profile, LUCID_SHOT_EVERY: '3600000' };
      delete env.ELECTRON_RUN_AS_NODE; delete env.LUCID_DEV_URL;
      const child = cp.spawn(require(path.join(root, 'node_modules/electron')), [__filename], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const log = fs.createWriteStream(path.join(directory, 'run.log')); child.stdout.pipe(log); child.stderr.pipe(log);
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`${id} exited ${code}`))); });
      log.end(); const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
      if (results.length && JSON.stringify(result.ready.roster) !== JSON.stringify(results[0].ready.roster)) throw Error(`${id}: fixture roster changed`);
      results.push(result); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ config, results }, null, 2));
      console.log(JSON.stringify({ id, usableMs: result.usableMs, officeMs: result.officeMs, scenes: result.scenes?.map(s => ({ name:s.name, mean:s.mean, p95:s.p95, apps:s.appCount })) }));
    }
    const only = process.argv.includes('--only') ? flag('--only') : 'all';
    // AB/BA pairs limit drift from caches, temperature and other machine work.
    if (['all','launch','cold'].includes(only)) {
    for (let pair = 0; pair < count; pair++) if (!selected || selected.includes(pair)) for (const variant of pair % 2 ? ['candidate','baseline'] : ['baseline','candidate'])
      await run(variant, 'cold-profile', pair, path.join(out, 'profiles', `cold-${pair}-${variant}`));
    }
    if (['all','launch','warm'].includes(only)) {
    for (const variant of ['baseline','candidate']) await run(variant, 'warmup', 0, path.join(out, 'profiles', `warm-${variant}`));
    for (let pair = 0; pair < count; pair++) if (!selected || selected.includes(pair)) for (const variant of pair % 2 ? ['candidate','baseline'] : ['baseline','candidate'])
      await run(variant, 'warm-profile', pair, path.join(out, 'profiles', `warm-${variant}`));
    }
    if (['all','many'].includes(only)) {
    for (let pair = 0; pair < count; pair++) if (!selected || selected.includes(pair)) for (const variant of pair % 2 ? ['candidate','baseline'] : ['baseline','candidate'])
      await run(variant, 'many-apps', pair, path.join(out, 'profiles', `many-${pair}-${variant}`));
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, ipcMain } = require('electron');
  const request = JSON.parse(fs.readFileSync(process.env.LUCID_BENCH_REQUEST));
  const result = { ...request, errors: [], scenes: [] };
  const save = () => fs.writeFileSync(path.join(request.directory, 'result.json'), JSON.stringify(result, null, 2));
  const deadline = setTimeout(() => { result.error = 'Benchmark exceeded 60 seconds'; save(); app.exit(1); }, 60000);
  app.setPath('temp', request.directory);
  const projects = Array.from({ length:4 }, (_,i) => ({ id:`perf-p${i}`, title:`Rendering ${i+1}`, root:`C:/perf/${i}`, icon:null, scratch:false }));
  const threads = Array.from({ length:31 }, (_,i) => ({ id:`perf-t${i}`, projectId:projects[i%4].id, title:`Robot ${i+1}`,
    updatedAt:'2026-10-31T12:00:00Z', provider:i%2?'codex':'claudeAgent', runStatus:i<18?'running':null,
    pinned:i<6, settled:i>=18&&i<26, question:i>=26?'Can you review this change?':null, model:null }));
  const seeded = `let seed=1731,uuid=0;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    crypto.randomUUID=()=>('00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0'));
    const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[1793448000000+performance.now()]))}static now(){return 1793448000000+performance.now()}};
    let office=false,ready=false,checking=false;
    const probe=setInterval(async()=>{const w=window.__world;if(!w?.lastData||w.lastData.threads.length!==31)return;
      if(!office){office=true;document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__benchmarkSignal({stage:'office',at:performance.now()}))))}
      if(ready||checking||document.querySelectorAll('#th-list .th-row').length!==23)return;checking=true;
      await document.fonts.ready;requestAnimationFrame(()=>requestAnimationFrame(()=>{ready=true;clearInterval(probe);window.__benchmarkSignal({stage:'ready',at:performance.now(),desks:w.desks.size,rooms:w.rooms.length,dpr:devicePixelRatio,hidden:document.hidden,roster:w.roster.robots.map(r=>[r.id,r.name,r.look.hat,r.look.tint,r.look.eyes,r.look.accent,r.prefs.windows]),camera:{s:w.cam.s,x:w.cam.x,y:w.cam.y}})}));
    },16);`;
  let win;
  app.on('browser-window-created', (_event, window) => {
    if (win) return; win = window;
    const wc = win.webContents, dbg = wc.debugger;
    wc.on('console-message', (_event, ...args) => console.log('renderer', ...args));
    wc.on('did-fail-load', (_event, code, message) => console.error('load',code,message));
    setTimeout(async () => { if (!result.readyMs) console.log('readiness',await wc.executeJavaScript(`({href:location.href,world:!!window.__world,threads:window.__world?.lastData?.threads.length,rows:document.querySelectorAll('#th-list .th-row').length,signal:typeof window.__benchmarkSignal,errors:window.__errs})`).catch(String)); }, 8000);
    dbg.attach('1.3');
  });
  const js = code => win.webContents.executeJavaScript(code);
  ipcMain.on('benchmark:signal', async (_event, data) => {
    if (data.stage === 'office') { result.officeMs = absoluteNow() - request.start; result.officeRendererMs = data.at; return; }
    if (result.readyMs) return;
    result.readyMs = absoluteNow() - request.start; result.ready = data;
    try {
      const wc = win.webContents;
      const point = await js(`{const r=document.querySelector('#th-q').getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
      const inputStart = absoluteNow();
      wc.sendInputEvent({ type:'mouseDown', button:'left', clickCount:1, ...point });
      wc.sendInputEvent({ type:'mouseUp', button:'left', clickCount:1, ...point });
      wc.sendInputEvent({ type:'char', keyCode:'7' });
      const input = await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({value:document.querySelector('#th-q').value,rows:document.querySelectorAll('#th-list .th-row').length}))))`);
      if (input.value !== '7' || input.rows !== 3) throw Error(`Input not usable: ${JSON.stringify(input)}`);
      result.usableMs = absoluteNow() - request.start; result.inputPaintMs = absoluteNow() - inputStart;
      await js(`{const q=document.querySelector('#th-q');q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));void 0}`);
      if (request.phase === 'many-apps') await manyApps();
      result.errors = await js('window.__errs||[]');
      if (result.errors.length) throw Error('Renderer reported errors');
      save(); clearTimeout(deadline); app.quit();
    } catch (error) { result.error = String(error.stack || error); save(); clearTimeout(deadline); app.exit(1); }
  });
  async function manyApps() {
    await js(`{
      const w=window.__world;w.stopCameraMotion();w.frame=null;for(const d of w.desks.values())d.director.reset();
      window.__benchApps=[];let index=0;
      for(const d of w.desks.values()){
        if(Number(d.threadId.split('perf-t')[1])>=18)continue;
        d.wm.speed=20;d.wm.prefs={...d.wm.prefs,windows:'fullscreen'};
        const idle=d.director.idleLife,original=idle.host.bind(idle);
        let Cancelled;try{d.wm.check(d.wm.epoch-1)}catch(e){Cancelled=e.constructor}
        idle.host=token=>{const h=original(token);return Object.assign(Object.create(h),{sleep:()=>new Promise((resolve,reject)=>{const check=()=>h.stopped?reject(new Cancelled()):setTimeout(check,100);check()})})};
        const kind=['voxelvalley','uptime','tidewatch','boot','botflix','benchtop'][index++%6];
        window.__benchApps.push({id:d.threadId,kind});idle.active=true;
        void idle.doActivity(kind,idle.token,true).catch(e=>{if(!(e instanceof Cancelled))console.error(e)});
      }
      void 0;
    }`);
    let population;
    for (let i=0;i<100;i++) {
      await wait(50);
      population = await js(`({apps:window.__benchApps.map(a=>{const d=window.__world.desks.get(a.id);return{id:a.id,kind:a.kind,roots:[...d.wm.wins.values()].map(w=>w.body.firstElementChild?.className||'')}}),pending:window.__staticArt.stats().pending})`);
      if (population.apps.every(a=>a.roots.some(Boolean))) break;
    }
    result.population = population;
    if (population.apps.length !== 18 || !population.apps.every(a=>a.roots.some(Boolean))) throw Error('Fixed 18-app workload did not mount');
    const dbg = win.webContents.debugger; await dbg.sendCommand('Performance.enable');
    for (const [name,scale] of [['many-original-view',.65],['many-live-close',2]]) {
      await js(`{const w=window.__world,d=w.desks.get('perf-t6'),cx=${scale===.65?'2100':'parseFloat(d.el.style.left)+200'},cy=${scale===.65?'480':'parseFloat(d.el.style.top)+100'};w.cam={s:${scale},x:w.scene.clientWidth/2-cx*${scale},y:w.scene.clientHeight/2-cy*${scale}};w.apply();window.__lucidPerf.enable(true);void 0}`);
      await wait(1200);
      const before = await dbg.sendCommand('Performance.getMetrics');
      const sample = await js(`new Promise(resolve=>{window.__lucidPerf.reset();const frames=[];let last=0,start=0;const frame=t=>{if(!start)start=t;if(last)frames.push(t-last);last=t;if(t-start<5000)return requestAnimationFrame(frame);frames.sort((a,b)=>a-b);const c=window.__world.cam;resolve({mean:frames.reduce((a,b)=>a+b,0)/frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],p99:frames[Math.floor(frames.length*.99)],max:frames.at(-1),frames:frames.length,over33:frames.filter(t=>t>33.4).length,systems:window.__lucidPerf.snapshot(),appCount:window.__benchApps.length,canvases:document.querySelectorAll('canvas').length,camera:{s:c.s,x:c.x,y:c.y},errors:window.__errs})};requestAnimationFrame(frame)})`);
      const after = await dbg.sendCommand('Performance.getMetrics');
      sample.deltas=Object.fromEntries(after.metrics.filter(m=>/Duration|Count/.test(m.name)).map(m=>[m.name,m.value-(before.metrics.find(x=>x.name===m.name)?.value||0)]));
      sample.name=name; result.scenes.push(sample);
      if (request.pair===0) fs.writeFileSync(path.join(request.directory,`${name}.png`),(await win.webContents.capturePage()).toPNG());
    }
  }
  require(path.join(request.root,'electron/main.cjs'));
  const replace = (channel, callback) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, callback); };
  replace('t3:world',()=>({projects,threads,shipped:{total:0,today:0}}));
  replace('t3:watch-set',()=>true); replace('t3:conversation',()=>[]); replace('t3:conversation-page',()=>({messages:[],hasMore:false}));
  replace('usage:get',()=>null); replace('weather:get',()=>({weather:null,error:null}));
  replace('environment:list',()=>({buildings:[{id:'local',label:'Benchmark PC',local:true,canOpen:true}]}));
  replace('app:host',()=> 'Benchmark PC'); replace('t3:attach-dir',()=> 'C:/benchmark/attachments/');
  ipcMain.removeAllListeners('settings:load');ipcMain.on('settings:load',e=>{e.returnValue='{}'});
  const fixtureRoster = fs.readFileSync(request.fixtureRoster, 'utf8');
  ipcMain.removeAllListeners('roster:load');ipcMain.on('roster:load',e=>{e.returnValue=fixtureRoster});
  replace('roster:save',()=>true);replace('settings:save',()=>true);
}
