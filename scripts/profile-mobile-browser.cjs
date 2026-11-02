// Read-only production browser rendering benchmark. No desktop app, T3 calls or Tailscale changes.
// node scripts/profile-mobile-browser.cjs <snapshot-root-with-dist> <new-output-folder>
// Optional LUCID_MOBILE_CPU (default 4), LUCID_MOBILE_SECONDS (default 5), LUCID_MOBILE_SCENES.
// Gesture scenes: pan (.65), overview-pan (.23), pinch (.65 with two touch pointer streams).
// LUCID_MOBILE_DIAG: recull-off, outside-off, static-art-off or weather-off, fixture isolation only.
// LUCID_MOBILE_TRACE=1 adds native renderer/paint timings and the complete Chromium trace.
// LUCID_MOBILE_PREWARM=1 updates covered outside art once before each measured gesture.
// LUCID_MOBILE_CACHE_TIMELINE=1 records bounded decode/encode phases and settle snapshots.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
if (!process.versions.electron) {
  const root = path.resolve(process.argv[2] || '.'), out = path.resolve(process.argv[3] || path.join(os.tmpdir(), `lucid-mobile-profile-${Date.now()}`));
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.LUCID_DEV_URL;
  require('node:child_process').spawn(require('electron'), [__filename, root, out], { env, stdio: 'inherit', windowsHide: true }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow, session } = require('electron');
  const root = process.argv[2], out = process.argv[3], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  fs.mkdirSync(path.join(out, 'profile'), { recursive: true }); app.setPath('userData', path.join(out, 'profile'));
  const projects = Array.from({ length: 4 }, (_, i) => ({ id: `perf-p${i}`, title: `Rendering ${i + 1}`, root: `C:/perf/${i}`, icon: null, scratch: false }));
  const threads = Array.from({ length: 31 }, (_, i) => ({ id: `perf-t${i}`, projectId: projects[i % 4].id, title: `Robot ${i + 1}`,
    updatedAt: '2026-11-01T12:00:00Z', provider: i % 2 ? 'codex' : 'claudeAgent', runStatus: i < 18 ? 'running' : null,
    pinned: i < 6, settled: i >= 18 && i < 26, question: i >= 26 ? 'Can you review this change?' : null, model: null }));
  const roster = threads.map((thread, i) => ({ id: `mobile-perf-bot-${i}`, name: `Robot ${i + 1}`, brand: i % 2 ? 'codex' : 'claude', provider: thread.provider,
    threadId: thread.id, hiredAt: 1793448000000, jobs: 1, look: { accent: ['#ff8a65', '#4fb6ff', '#b07cff'][i % 3], antennaTip: 'ball', build: ['regular', 'slim', 'sturdy'][i % 3],
      head: 1, hat: ['none', 'beanie', 'cap', 'catEars'][i % 4], accessory: ['none', 'scarf', 'bowtie'][i % 3], eyes: 'classic', tint: 'none', sticker: 'none', glow: null, blush: false },
    prefs: { editor: i % 2 ? 'studio' : 'pad', wallpaper: i % 6, games: { snake: .5, flappy: .5, dash: .5, chess: .5 }, phone: 'clips', subagents: 'cli', music: .2, social: .5,
      mug: '#ff8a65', tasks: 'board', hobby: ['gamer', 'chatter', 'watcher', 'chiller'][i % 4], windows: 'floating', listens: 'never', launch: 'dock', switching: 'click', tidiness: 'normal',
      git: 'cli', office: 'none', apps: ['doodle'], socials: ['botsapp', 'chirp'], socialsV: 2, t3: 'stable', chatApp: 'native', leisure2: true, notesApp: 'notepad' } }));
  const data = { projects, threads, models: { codex: ['gpt-6.1-sol'], claudeAgent: ['claude-sonnet-5-5'] }, prices: {}, shipped: { total: 0, today: 0 } };
  const messages = Array.from({ length: 200 }, (_, i) => ({ id: `perf-msg${i}`, role: i % 2 ? 'assistant' : 'user', at: new Date(1800000000000 + i * 1000).toISOString(), streaming: false,
    text: `Message ${i}: **Rendering update**\n\n${'A paragraph about the office and the measured frame budget. '.repeat(4)}\n\n\`\`\`ts\nconst frame = 16.7;\n\`\`\``, attachments: [] }));
  const snapshot = { settings: JSON.stringify({ level: 1 }), roster: JSON.stringify(roster) }, calls = {}, errors = [], unknown = new Set();
  const frames = require('../electron/companion-frames.cjs').createCompanionFrames({ read: async () => ({ state: snapshot, world: data, tasks: [] }) });
  const totals = { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, byHarness: {}, byModel: {} };
  const invoke = async (_client, channel, args) => {
    calls[channel] = (calls[channel] || 0) + 1;
    switch (channel) {
      case 'remoteState': return snapshot;
      case 'remoteFrame': return frames.frame('fixture', args[0]?.known);
      case 't3:world': return data;
      case 't3:projects': case 't3:offices': return projects;
      case 't3:threads': return threads;
      case 't3:watch-set': return true;
      case 't3:tasks': case 't3:pending-requests': case 't3:items-since': case 't3:replies-since': case 't3:resolved-since': case 't3:user-messages': return [];
      case 't3:conversation-page': return { messages, cursor: null, hasMore: false };
      case 't3:conversation': return messages;
      case 't3:thread-info': return { id: args[0], title: threads.find(t => t.id === args[0])?.title || 'Robot', provider: threads.find(t => t.id === args[0])?.provider, model: null, run: { status: 'running' } };
      case 't3:request-outcome': return null;
      case 't3:attach-dir': return 'C:/fixture/attachments/';
      case 'app:host': return 'Fixture desktop';
      case 'app:version': return 'fixture';
      case 'environment:list': return { localId: 'fixture', buildings: [{ id: 'fixture', local: true, label: 'Fixture desktop', status: 'reachable', canOpen: true }], connectionState: 'no-linked-environments', error: null };
      case 'usage:get': return { updatedAt: new Date().toISOString(), windows: { last5h: totals, today: totals, week: totals }, limits: {}, errors: [] };
      case 'weather:get': return { weather: null, error: null };
      case 't3s:status': return { ok: true, value: { paired: true, error: null, selection: { providerInstanceId: 'codex', model: 'gpt-6.1-sol', options: {} } } };
      case 't3s:providers': return { ok: true, value: [] };
      case 'fs:image': case 'fs:text': case 'frontend:frame': case 'web:shot': return null;
      case 'web:peek': return { title: '', text: '', links: [] };
      case 'git:info': return { branch: 'main', files: [], status: [] };
      case 'orch:answers': case 'orch:decisions': case 'orch:approval-papers': case 'reports:list': return [];
      case 'orch:memory': case 'orch:dialogs': return '';
      case 'lucid:localize': return { translations: [], error: null };
      default: unknown.add(channel); throw Error(`Read-only fixture does not implement ${channel}`);
    }
  };
  let phone, service;
  const results = { root, platform: process.platform, versions: process.versions, hardware: { cpus: os.cpus()[0]?.model, logicalProcessors: os.cpus().length, totalMemoryBytes: os.totalmem() },
    viewport: { width: 390, height: 844, dpr: 3 }, offscreen: process.env.LUCID_MOBILE_NATIVE !== '1', cssIsolation: process.env.LUCID_MOBILE_CSS || null, diagnosis: process.env.LUCID_MOBILE_DIAG || null, prewarm: process.env.LUCID_MOBILE_PREWARM === '1', cpuSlowdown: Number(process.env.LUCID_MOBILE_CPU || 4), sampleSeconds: Number(process.env.LUCID_MOBILE_SECONDS || 5), fixture: { projects: 4, threads: 31, working: 18, settled: 8, waitingForInput: 5, roster: 31, chatMessages: 200 }, scenes: [], errors, calls };
  const save = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  const cacheTimeline = process.env.LUCID_MOBILE_CACHE_TIMELINE === '1';
  results.cacheTimelineEnabled = cacheTimeline;
  const watchdog = setTimeout(() => { errors.push('Profile exceeded three minutes'); save(); app.exit(1); }, 180000);
  // Electron on Windows needs a short Node timer while local HTTP startup settles.
  const pump = setInterval(() => {}, 50);
  const cpuSummary = profile => {
    const nodes = new Map(profile.nodes.map(node => [node.id, node])), hits = new Map();
    for (let i = 0; i < (profile.samples || []).length; i++) hits.set(profile.samples[i], (hits.get(profile.samples[i]) || 0) + (profile.timeDeltas?.[i] || 0));
    return [...hits].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([id, us]) => ({ selfMs: us / 1000, ...nodes.get(id)?.callFrame }));
  };
  app.whenReady().then(async () => {
    try {
      console.log('Mobile benchmark: starting isolated HTTP fixture');
      service = require('../electron/mobile-server.cjs').createMobileServer({ root, config: { publicOrigin: 'http://127.0.0.1:5187', allowedLogin: 'fixture-owner' }, invoke, bootstrap: async () => snapshot });
      await service.listen(5187);
      console.log('Mobile benchmark: HTTP ready, creating phone');
      const isolated = session.fromPartition('mobile-render-profile-' + Date.now());
      isolated.webRequest.onBeforeSendHeaders((details, cb) => { if (new URL(details.url).origin === 'http://127.0.0.1:5187') details.requestHeaders['Tailscale-User-Login'] = 'fixture-owner'; cb({ requestHeaders: details.requestHeaders }); });
      phone = new BrowserWindow({ width: 390, height: 844, show: false, webPreferences: { session: isolated, contextIsolation: true, backgroundThrottling: false, offscreen: results.offscreen } });
      const wc = phone.webContents, dbg = wc.debugger, js = code => wc.executeJavaScript(code);
      wc.on('console-message', event => { if (event.level === 'error') console.error('Benchmark browser:', event.message); });
      await wc.loadURL('about:blank');
      dbg.attach('1.3'); await dbg.sendCommand('Page.enable'); await dbg.sendCommand('Performance.enable');
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: results.cpuSlowdown });
      if (cacheTimeline) await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `{
        const events=window.__cachePipeline=[],limit=600,record=e=>{if(events.length<limit)events.push({at:performance.now(),...e})};let serial=0;
        const decode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(...args){const id=++serial;record({id,phase:'decode-start'});return decode.apply(this,args).then(value=>{record({id,phase:'decode-end',width:this.naturalWidth,height:this.naturalHeight});return value},error=>{record({id,phase:'decode-error',error:String(error)});throw error})};
        const toBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){const id=++serial;record({id,phase:'encode-start',width:this.width,height:this.height,class:this.className});return toBlob.call(this,blob=>{record({id,phase:'encode-end',bytes:blob?.size||0});callback(blob)},...args)};
      }` });
      await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `window.__mobileErrors=[];addEventListener('error',e=>window.__mobileErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__mobileErrors.push(String(e.reason)));let seed=1731;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};window.__mobileLong=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__mobileLong.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});` });
      await wc.loadURL('http://127.0.0.1:5187/');
      console.log('Mobile benchmark: phone loaded');
      for (let i = 0; i < 400; i++) { if (await js('window.__world?.lastData?.threads.length===31 && window.__world?.desks.size>=18')) break; if (i === 399) throw Error('The 31-thread fixture did not initialize'); await wait(100); }
      await wait(5000);
      const captureCache = async label => {
        if (!cacheTimeline) return;
        const sample = await js(`({at:performance.now(),hidden:document.hidden,staticArt:window.__staticArt?.stats(),outside:[...document.querySelectorAll('.outside-viewport')].map(e=>({...e.dataset})),pipeline:window.__cachePipeline})`);
        (results.cacheTimeline ||= []).push({ label, ...sample }); save();
      };
      await captureCache('initial-settle');
      if (process.env.LUCID_MOBILE_CSS) await js(`{const s=document.createElement('style');s.textContent=${JSON.stringify(process.env.LUCID_MOBILE_CSS)};document.head.append(s)}`);
      results.loaded = await js(`({url:location.href,entry:document.querySelector('script[data-entry]')?.dataset.entry,scripts:[...document.scripts].map(s=>s.src),dpr:devicePixelRatio,width:innerWidth,height:innerHeight,hidden:document.hidden,threads:window.__world.lastData.threads.length,desks:window.__world.desks.size,robots:window.__world.roster.robots.length,walkers:document.querySelectorAll('.world-walker').length,dom:document.querySelectorAll('*').length,initialCamera:{x:window.__world.cam.x,y:window.__world.cam.y,s:window.__world.cam.s},initialMobileView:document.querySelector('#app').dataset.mobileView})`);
      await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
      let scenes = ['initial', 'overview', 'desk', 'pan', 'overview-pan', 'pinch', 'threads', 'chat'];
      if (process.env.LUCID_MOBILE_SCENES) scenes = scenes.filter(name => process.env.LUCID_MOBILE_SCENES.split(',').includes(name));
      for (const name of scenes) {
        console.log('Mobile benchmark scene:', name);
        if (name !== 'initial') await js(`{const w=window.__world;document.querySelector('[data-view="office"]').click();window.__chat.close();w.stopCameraMotion();w.frame=null;const d=w.desks.get('perf-t0');if(${JSON.stringify(name === 'overview')}){const p=w.outdoor?.park,right=p?p.x+p.w:w.size.w;Object.assign(w.cam,w.fitTarget({x:-120,y:-170,w:right+240,h:Math.max(w.size.h,p?p.y+p.h:0)+290},20,w.scene.clientWidth,w.scene.clientHeight));w.apply()}else{const s=${name === 'overview-pan' ? .23 : .65},cx=parseFloat(d.el.style.left)+200,cy=parseFloat(d.el.style.top)+160;Object.assign(w.cam,{s,x:w.scene.clientWidth/2-cx*s,y:w.scene.clientHeight/2-cy*s});w.apply()}if(${JSON.stringify(name === 'threads')})document.querySelector('[data-view="threads"]').click();if(${JSON.stringify(name === 'chat')})window.__chat.open(d,false);void 0}`);
        if (results.prewarm) await js(`{const w=window.__world,recull=w.recull;w.recull=function(){recull.call(this);this.viewIndoors=false};try{w.apply()}finally{w.recull=recull;w.recull()}void 0}`);
        await wait(1800);
        await captureCache(name + '-settle');
        const sceneSetup = await js(`({indoors:window.__world.viewIndoors,staticArt:window.__staticArt?.stats(),outside:[...document.querySelectorAll('.outside-viewport,[data-paints]')].map(e=>({class:e.className,data:{...e.dataset}}))})`);
        await js(`{const w=window.__world,apply=w.apply,recull=w.recull,query=w.root.querySelector,fx=w.fx,setCamera=fx?.setCamera,diag=${JSON.stringify(process.env.LUCID_MOBILE_DIAG || '')}.split(',');
          const g=window.__mobileGesture={events:0,commits:0,indoorCommits:0,outdoorCommits:0,applyMs:[],recullMs:[],weatherMs:[],minScale:w.cam.s,maxScale:w.cam.s,start:{x:w.cam.x,y:w.cam.y,s:w.cam.s,indoors:w.viewIndoors},end:null};
          w.apply=function(...args){const at=performance.now();try{return apply.apply(this,args)}finally{g.applyMs.push(performance.now()-at);g.commits++;g[w.viewIndoors?'indoorCommits':'outdoorCommits']++;g.minScale=Math.min(g.minScale,w.cam.s);g.maxScale=Math.max(g.maxScale,w.cam.s);g.end={x:w.cam.x,y:w.cam.y,s:w.cam.s,indoors:w.viewIndoors}}};
          w.recull=function(...args){const at=performance.now();try{if(!diag.includes('recull-off'))return recull.apply(this,args)}finally{g.recullMs.push(performance.now()-at)}};
          if(diag.includes('outside-off'))w.root.querySelector=function(selector){return selector==='.outside-layer'?null:query.call(this,selector)};
          if(diag.includes('static-art-off'))window.__staticArt?.enable(false);
          if(fx&&setCamera)fx.setCamera=function(...args){const at=performance.now();try{if(!diag.includes('weather-off'))return setCamera.apply(this,args)}finally{g.weatherMs.push(performance.now()-at)}};
          window.__restoreMobileHooks=()=>{w.apply=apply;w.recull=recull;w.root.querySelector=query;if(fx&&setCamera)fx.setCamera=setCamera;if(diag.includes('static-art-off'))window.__staticArt?.enable(true)};void 0}`);
        if (process.env.LUCID_MOBILE_GEOMETRY === '1') await js(`{const root=window.__world.root,read=root.getBoundingClientRect,width=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth').get;window.__mobileGeometry={rect:0,width:0,stacks:[]};const mark=kind=>{const c=window.__mobileGeometry;c[kind]++;if(c.stacks.length<6)c.stacks.push({kind,stack:new Error().stack})};root.getBoundingClientRect=function(){mark('rect');return read.call(this)};Object.defineProperty(root,'offsetWidth',{configurable:true,get(){mark('width');return width.call(this)}});window.__restoreMobileGeometry=()=>{root.getBoundingClientRect=read;delete root.offsetWidth};void 0}`);
        await js(`window.__lucidPerf?.enable(true);window.__lucidPerf?.reset();window.__frames=[];window.__mobileLong=[];window.__record=true;{let last;function frame(t){if(!window.__record)return;if(last!==undefined)window.__frames.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)}`);
        app.getAppMetrics(); const before = await dbg.sendCommand('Performance.getMetrics');
        const trace = [], tracing = process.env.LUCID_MOBILE_TRACE === '1';
        const collect = (_event, method, params) => { if (method === 'Tracing.dataCollected') trace.push(...params.value); };
        if (tracing) { dbg.on('message', collect); await dbg.sendCommand('Tracing.start', { transferMode: 'ReportEvents', categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,cc,gpu,viz,__metadata' }); }
        await dbg.sendCommand('Profiler.start');
        const started = Date.now(), point = await js(`{const r=window.__world.scene.getBoundingClientRect();({x:r.left+r.width/2,y:r.top+r.height/2})}`);
        const gesture = ['pan', 'overview-pan', 'pinch'].includes(name);
        if (gesture) await js(`{const s=window.__world.scene,p=${JSON.stringify(point)},pinch=${name === 'pinch'},emit=(target,type,id,x,y)=>{window.__mobileGesture.events++;target.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:id,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true,cancelable:true}))};window.__mobileEmit=emit;emit(s,'pointerdown',73,p.x-(pinch?50:0),p.y);if(pinch)emit(s,'pointerdown',74,p.x+50,p.y);window.__mobilePanAt=performance.now();window.__mobilePanTimer=setInterval(()=>{const t=(performance.now()-window.__mobilePanAt)/1000;if(pinch){const distance=100*Math.exp(Math.sin(t*2.4)*.65),cx=p.x+Math.sin(t*1.2)*16;emit(window,'pointermove',73,cx-distance/2,p.y);emit(window,'pointermove',74,cx+distance/2,p.y)}else emit(window,'pointermove',73,p.x+Math.sin(t*2.4)*120,p.y+Math.sin(t*3.2)*100)},16);void 0}`);
        while (Date.now() - started < results.sampleSeconds * 1000) {
          await wait(100);
        }
        if (gesture) await js(`{clearInterval(window.__mobilePanTimer);window.__mobileEmit(window,'pointerup',73,0,0);if(${name === 'pinch'})window.__mobileEmit(window,'pointerup',74,0,0);void 0}`);
        const elapsedMs = Date.now() - started, after = await dbg.sendCommand('Performance.getMetrics'), profile = (await dbg.sendCommand('Profiler.stop')).profile;
        if (tracing) {
          const complete = new Promise(resolve => { const listener = (_event, method) => { if (method === 'Tracing.tracingComplete') { dbg.removeListener('message', listener); resolve(); } }; dbg.on('message', listener); });
          await dbg.sendCommand('Tracing.end'); await complete; dbg.removeListener('message', collect);
          fs.writeFileSync(path.join(out, `${name}-trace.json`), JSON.stringify({ traceEvents: trace }));
        }
        const statistics = await js(`{window.__record=false;const a=window.__frames.slice(1).sort((a,b)=>a-b),g=window.__mobileGesture,stats=values=>{const v=[...values].sort((a,b)=>a-b);return{calls:v.length,totalMs:v.reduce((s,n)=>s+n,0),p95Ms:v[Math.floor(v.length*.95)]||0,maxMs:v.at(-1)||0}};window.__restoreMobileHooks();({frames:a.length,meanMs:a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p50Ms:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],p99Ms:a[Math.floor(a.length*.99)],maxMs:a.at(-1),over33:a.filter(n=>n>33.4).length,over100:a.filter(n=>n>100).length,longTasks:window.__mobileLong,gesture:{events:g.events,commits:g.commits,indoorCommits:g.indoorCommits,outdoorCommits:g.outdoorCommits,minScale:g.minScale,maxScale:g.maxScale,start:g.start,end:g.end,apply:stats(g.applyMs),recull:stats(g.recullMs),weather:stats(g.weatherMs)},staticArt:window.__staticArt?.stats(),outside:[...document.querySelectorAll('.outside-viewport,[data-paints]')].map(e=>({class:e.className,data:{...e.dataset}})),canvasPixels:[...document.querySelectorAll('canvas')].reduce((s,c)=>s+c.width*c.height,0),systems:window.__lucidPerf?.snapshot(),surface:document.querySelector('#app').dataset.mobileView,desks:window.__world.desks.size,walkers:document.querySelectorAll('.world-walker').length,dom:document.querySelectorAll('*').length,scale:window.__world.cam.s,errors:window.__mobileErrors})}`);
        const deltas = Object.fromEntries(after.metrics.filter(metric => /Duration|Count|Timestamp/.test(metric.name)).map(metric => [metric.name, metric.value - (before.metrics.find(row => row.name === metric.name)?.value || 0)]));
        const processMetrics = app.getAppMetrics().find(metric => metric.pid === wc.getOSProcessId());
        const geometry = process.env.LUCID_MOBILE_GEOMETRY === '1' ? await js(`{const c=window.__mobileGeometry;window.__restoreMobileGeometry();c}`) : null;
        const traceMain = trace.find(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain');
        const nativeSummary = {};
        for (const event of trace) if (event.ph === 'X' && event.dur && event.pid === traceMain?.pid && event.tid === traceMain?.tid && ['Layerize','Paint','Layout','UpdateLayoutTree','FunctionCall','RunTask'].includes(event.name)) { const value = nativeSummary[event.name] ||= { count:0,totalMs:0,maxMs:0 }; value.count++;value.totalMs+=event.dur/1000;value.maxMs=Math.max(value.maxMs,event.dur/1000); }
        const row = { name, elapsedMs, sceneSetup, ...statistics, deltas, processMetrics, geometry, nativeSummary, topSelf: cpuSummary(profile) };
        fs.writeFileSync(path.join(out, `${name}-cpu.json`), JSON.stringify(profile));
        fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
        results.scenes.push(row); save(); console.log(JSON.stringify({ name, elapsedMs, mean: row.meanMs, p95: row.p95Ms, longTasks: row.longTasks.length, taskSeconds: deltas.TaskDuration, surface: row.surface, desks: row.desks, walkers: row.walkers }));
        await captureCache(name + '-finished');
        if (gesture && row.gesture.commits < 10) throw Error(`${name} did not deliver enough camera commits`);
        if (name === 'pinch' && row.gesture.maxScale - row.gesture.minScale < .3) throw Error('Two-touch pinch did not change the camera scale');
      }
      // Expose the real outdoors after the gesture to check that any covered-view
      // shortcut restores the current source density as soon as the park is visible.
      await js(`{const w=window.__world,p=w.outdoor.park,s=.65;document.querySelector('[data-view="office"]').click();w.stopCameraMotion();w.frame=null;Object.assign(w.cam,{s,x:w.scene.clientWidth/2-(p.x+p.w/2)*s,y:w.scene.clientHeight/2-(p.y+p.h/2)*s});w.apply();void 0}`);
      await wait(1800);
      await captureCache('uncovered-settle');
      results.uncoveredQuality = await js(`{const w=window.__world,plane=document.querySelector('.outside-viewport'),nativeHost=document.querySelector('.outside-native'),native=nativeHost?.shadowRoot?.querySelector('svg'),el=nativeHost?.shadowRoot?.querySelector('.outside-vector-canvas')||document.querySelector('.outside-vector-canvas,.outside-detail'),density=Number(el?.dataset.sourceDensity),presentation=plane?.dataset.presentation,required=w.cam.s*devicePixelRatio;
        const nativeVisible=!!native&&getComputedStyle(nativeHost).display!=='none'&&Number(native.getAttribute('width'))>0&&Number(native.getAttribute('height'))>0;
        const cachedSharp=Number.isFinite(density)&&density+.001>=required&&el?.dataset.sharp==='1',nativeSharp=nativeVisible&&presentation==='vectors',mixedSharp=nativeVisible&&presentation==='mixed'&&Number.isFinite(density)&&density+.001>=required;
        ({indoors:w.viewIndoors,scale:w.cam.s,dpr:devicePixelRatio,requiredDensity:required,sourceDensity:Number.isFinite(density)?density:null,presentation,sharp:el?.dataset.sharp,fullDensity:cachedSharp||nativeSharp||mixedSharp,nativeVectors:nativeSharp||mixedSharp,nativeViewport:native?{width:native.getAttribute('width'),height:native.getAttribute('height'),viewBox:native.getAttribute('viewBox')}:null,sourceX:el?.dataset.sourceX,sourceY:el?.dataset.sourceY,canvases:[...document.querySelectorAll('.outside-vector-canvas canvas,canvas.outside-detail')].map(c=>{const r=c.getBoundingClientRect();return{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,pixelsPerCssX:r.width?c.width/r.width:0,pixelsPerCssY:r.height?c.height/r.height:0}}),images:[...(nativeHost?.shadowRoot?.querySelectorAll('.outside-tiles image')||[])].map(image=>({density:Number(image.dataset.sourceDensity),width:Number(image.dataset.sourceWidth),height:Number(image.dataset.sourceHeight)})),liveView:document.querySelector('.outside-live')?.getAttribute('viewBox')})}`);
      fs.writeFileSync(path.join(out, 'uncovered-park.png'), (await wc.capturePage()).toPNG());
      if (results.uncoveredQuality.indoors || !results.uncoveredQuality.fullDensity) throw Error('The uncovered outdoors did not restore full-density cached pixels or its original native vectors');
      errors.push(...await js('window.__mobileErrors')); results.unimplemented = [...unknown]; results.gpu = await app.getGPUInfo('basic'); save();
      clearTimeout(watchdog); clearInterval(pump); await service.close(); phone.destroy(); app.quit();
    } catch (error) { errors.push(String(error.stack || error)); save(); console.error(error); clearTimeout(watchdog); clearInterval(pump); await service?.close().catch(() => {}); phone?.destroy(); app.exit(1); }
  });
}
