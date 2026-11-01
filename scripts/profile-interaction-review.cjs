// Serial, fixed-input Electron benchmark. Primary timing runs never enable tracing.
// node scripts/profile-interaction-review.cjs --root <private snapshot> --out <new directory>
// --cycles 3 --isolation base|no-grounds|no-outdoor-live|no-office|passive-wheel
// --quick runs one diagnostic cycle; --trace captures a separate profiling run.
// --paced-only keeps the 96-input normal zoom/mixed phases and chat, skipping floods.
// --recovery-seconds 60 changes only the final post-request recovery window.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const flag = name => { const n = process.argv.indexOf(name); return n < 0 ? undefined : process.argv[n+1]; };
const clock = () => performance.timeOrigin + performance.now();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function parseInteractionOptions(args) {
  const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const quick = args.includes('--quick'), cycles = Number(value('--cycles') || 3), recovery = value('--recovery-seconds');
  if (args.includes('--cycles') && value('--cycles') === undefined || args.includes('--recovery-seconds') && recovery === undefined) throw Error('Numeric option value is missing.');
  if (!Number.isInteger(cycles) || cycles < 1) throw Error('Cycles must be a positive integer.');
  const finalRecoveryMs = recovery === undefined ? (quick ? 1500 : 30000) : Number(recovery) * 1000;
  if (!Number.isFinite(finalRecoveryMs) || finalRecoveryMs <= 0) throw Error('Recovery seconds must be positive.');
  return { cycles, quick, isolation: value('--isolation') || 'base', trace: args.includes('--trace'),
    pacedOnly: args.includes('--paced-only'), finalRecoveryMs, productionChecks: args.includes('--production-checks') };
}
function cycleWheelWorkload(cycle, options) {
  const phases = [
    { name: 'normal-zoom-' + cycle, pace: 50, mode: 'ack', mixed: false, count: 96 },
    { name: 'normal-mixed-' + cycle, pace: 50, mode: 'ack', mixed: true, count: 96 },
  ];
  if (!options.pacedOnly) {
    phases.push({ name: 'flood-zoom-' + cycle, pace: 8, mode: 'flood', mixed: false, count: 96 });
    if (!options.quick) phases.push({ name: 'wc-flood-zoom-' + cycle, pace: 8, mode: 'wc-flood', mixed: false, count: 96 });
  }
  return phases;
}
function collectGraphicsStats(document, staticArt) {
  const summarize = canvases => {
    let backingPixels = 0, maxWidth = 0, maxHeight = 0;
    for (const canvas of canvases) { backingPixels += canvas.width * canvas.height; maxWidth = Math.max(maxWidth, canvas.width); maxHeight = Math.max(maxHeight, canvas.height); }
    return { canvasCount: canvases.length, backingPixels, estimatedRgbaBytes: backingPixels * 4, maxWidth, maxHeight };
  };
  const viewport = document.querySelector('.outside-viewport'), data = viewport?.dataset || {};
  const numeric = name => data[name] !== undefined && data[name] !== '' && Number.isFinite(Number(data[name])) ? Number(data[name]) : null;
  const canvasTileCount = viewport ? viewport.querySelectorAll('.outside-vector-canvas canvas,canvas.outside-vector-canvas').length : 0;
  const svgImageTileCount = viewport?.querySelector?.('.outside-native')?.shadowRoot?.querySelectorAll('.outside-tiles image').length ?? 0;
  return { scope: 'On-DOM canvas backings only. Detached history, scratch surfaces, driver allocations and VRAM are excluded.',
    all: summarize([...document.querySelectorAll('canvas')]),
    outside: { ...summarize(viewport ? [...viewport.querySelectorAll('canvas')] : []),
      tileCount: canvasTileCount + svgImageTileCount, canvasTileCount, svgImageTileCount,
      presentation: data.presentation || null, missingTiles: numeric('missingTiles'), visibleTiles: numeric('visibleTiles'),
      cachePixels: numeric('cachePixels'), pixelBudget: numeric('pixelBudget'), paints: numeric('paints'),
      pending: numeric('pending'), requestPlanCount: numeric('queuedTiles') },
    staticArt: staticArt || null };
}
function graphicsQuiet(document, staticArt) {
  const data = document.querySelector('.outside-viewport')?.dataset;
  // queuedTiles in this renderer counts retained request plans, including ready
  // tiles. Visible holes and the active encoder describe actual unfinished work.
  return staticArt?.pending === 0 && ['missingTiles','pending'].every(name => data?.[name] === undefined || data[name] !== '' && Number(data[name]) === 0);
}
function inputAccounting(sent, before, after, all = false) {
  const signed = all ? 'allWheelSignedDelta' : 'wheelSignedDelta', magnitude = all ? 'allWheelMagnitude' : 'wheelMagnitude';
  const expectedSignedDelta = sent.reduce((sum, row) => sum + row.deltaY, 0), deliveredSignedDelta = after[signed] - before[signed];
  return { expectedSignedDelta, deliveredSignedDelta, expectedWheelMagnitude: sent.reduce((sum, row) => sum + Math.abs(row.deltaY), 0),
    deliveredWheelMagnitude: after[magnitude] - before[magnitude],
    signedDeltaMatches: Number.isFinite(deliveredSignedDelta) && Math.abs(expectedSignedDelta - deliveredSignedDelta) <= .001 };
}
function collectRecorderCounts(recorder) {
  return Object.fromEntries(['frames','inputs','commits','applies','mutations'].map(name=>[name,Array.isArray(recorder?.[name])?recorder[name].length:null]));
}
function fixtureMessageStats(messages) {
  let messageTextCodeUnits=0,messageTextUtf8Bytes=0;
  for(const message of messages){const text=typeof message.text==='string'?message.text:'';messageTextCodeUnits+=text.length;messageTextUtf8Bytes+=Buffer.byteLength(text,'utf8')}
  return {messageCount:messages.length,messageTextCodeUnits,messageTextUtf8Bytes,scope:'UTF-8 encoding of fixture message text only, not V8 heap bytes or total object size.'};
}
function verifyPrivateBuild(root) {
  const crypto = require('node:crypto');
  if (!fs.existsSync(path.join(root, 'dist/index.html')) || !fs.existsSync(path.join(root, 'dist/lucid-build.json'))) throw Error('Build and validate the private snapshot before launching Electron');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/lucid-build.json'), 'utf8'));
  if (!manifest.files || !Object.keys(manifest.files).length) throw Error('Private build has no source manifest');
  for (const [name, expected] of Object.entries(manifest.files)) {
    const relative = path.relative(root, path.resolve(root, name));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid private source manifest entry: ' + name);
    const file = path.resolve(root, name);
    if (!fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw Error('Private source differs from validated build: ' + name);
  }
  if (!manifest.files['electron/build-state.cjs']) throw Error('Private build has no source snapshot verifier');
  const { snapshot, changed } = require(path.join(root, 'electron/build-state.cjs'));
  const differences = changed(manifest.files, snapshot(root));
  if (differences.length) throw Error('Private source differs from validated build: ' + differences.join(', '));
  const index = path.join(root, 'dist/index.html'), { fileURLToPath, pathToFileURL } = require('node:url');
  const modules = [...fs.readFileSync(index, 'utf8').matchAll(/<script\b[^>]*>/gi)].map(match => match[0])
    .filter(tag => /\btype\s*=\s*["']module["']/i.test(tag)).map(tag => tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]).filter(Boolean);
  if (!modules.length) throw Error('Private build has no emitted entry module');
  for (const src of modules) {
    const url = new URL(src, pathToFileURL(index)), asset = url.protocol === 'file:' ? fileURLToPath(url) : '';
    const relative = path.relative(path.join(root, 'dist'), asset);
    if (!asset || !relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(asset)) throw Error('Private build is missing an emitted entry module: ' + src);
  }
  return manifest;
}
module.exports = { parseInteractionOptions, cycleWheelWorkload, collectGraphicsStats, graphicsQuiet, inputAccounting, collectRecorderCounts, fixtureMessageStats, verifyPrivateBuild };
if (require.main === module || process.versions.electron) {
if (!process.versions.electron) {
  const root = path.resolve(flag('--root')), out = path.resolve(flag('--out'));
  if (!/[\\/]\.lucid-update-|[\\/]Lucid-validation[\\/]/i.test(root)) throw Error('Use a frozen private source/build snapshot');
  verifyPrivateBuild(root);
  if (fs.existsSync(path.join(out,'result.json'))) throw Error('Use a fresh output directory');
  fs.mkdirSync(out,{recursive:true});
  const request={root,out,...parseInteractionOptions(process.argv),
    fixtureRoster:path.resolve(flag('--roster')||'E:/Lucid-validation/perf-review-20261101/fixture-roster.json')};
  fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request,null,2));
  const env={...process.env,LUCID_INTERACTION_REQUEST:path.join(out,'request.json')};
  for(const key of Object.keys(env))if(key.startsWith('LUCID_')&&key!=='LUCID_INTERACTION_REQUEST')delete env[key];
  delete env.ELECTRON_RUN_AS_NODE;
  const child=cp.spawn(require(path.join(root,'node_modules/electron')),[__filename],{env,stdio:'inherit',windowsHide:true});
  child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error);process.exitCode=1});
} else {
  const {app,ipcMain,contentTracing}=require('electron'), os=require('node:os');
  const request=JSON.parse(fs.readFileSync(process.env.LUCID_INTERACTION_REQUEST));
  const {root,out}=request, profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});
  app.setPath('userData',profile);app.setPath('temp',out);
  process.env.LUCID_SHOT=out;process.env.LUCID_SHOT_PROFILE=profile;process.env.LUCID_SHOT_EVERY='3600000';
  process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(path.join(root,'dist/index.html')).href;
  const result={request,hardware:{platform:process.platform,cpu:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,systemRamMiB:os.totalmem()/1048576,electron:process.versions.electron},phases:[],cycleCheckpoints:[],errors:[],started:new Date().toISOString()};
  const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  let win, sampler, isolation, tracing=false;
  const seeded=`window.__interactionSeed=1731;let seed=1731;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[1793448000000+performance.now()]))}static now(){return 1793448000000+performance.now()}};
    try{localStorage.setItem('lucid:sound',JSON.stringify({enabled:false,volume:.45}))}catch{};`;
  // Place the deterministic fixture before the module in a private HTML wrapper.
  // Electron's Page.addScriptToEvaluateOnNewDocument is not reliable in this
  // context-isolated file loader. Application JS/CSS bytes remain untouched.
  const fixtureHtml=path.join(out,'fixture.html');
  const base=require('node:url').pathToFileURL(path.join(root,'dist/')).href;
  fs.writeFileSync(fixtureHtml,fs.readFileSync(path.join(root,'dist/index.html'),'utf8').replace('<head>',`<head><base href="${base}"><script>${seeded}</script>`));
  process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(fixtureHtml).href;
  app.on('browser-window-created',(_event,window)=>{
    if(win)return;win=window;win.setContentSize(1280,800);
    const dbg=win.webContents.debugger;dbg.attach('1.3');
    win.webContents.once('did-finish-load',()=>void (async()=>{
      try{
        await run(dbg);save();app.quit();
      }
      catch(error){
        result.error=String(error.stack||error);
        try{const data=await win.webContents.executeJavaScript(`(()=>{const q=window.__interactionReview;if(!q)return null;q.recording=false;cancelAnimationFrame(q.raf);q.observer.disconnect();document.removeEventListener('wheel',q.wheel,true);window.removeEventListener('error',q.error);window.removeEventListener('unhandledrejection',q.error);window.__world.apply=q.original;return {frames:q.frames,inputs:q.inputs,commits:q.commits,applies:q.applies,mutations:q.mutations,errors:q.errors}})()`);if(data)fs.writeFileSync(path.join(out,'failed-renderer-samples.json'),JSON.stringify(data))}catch{}
        fs.writeFileSync(path.join(out,'failed-sender-samples.json'),JSON.stringify(result.phases.filter(phase=>phase.sent),null,2));
        sampler?.sample();sampler?.stop();if(sampler)fs.writeFileSync(path.join(out,'failed-process-samples.json'),JSON.stringify(sampler.rows,null,2));
        if(tracing)await contentTracing.stopRecording(path.join(out,'failed-trace.json')).catch(()=>{});
        await isolation?.().catch(()=>{});save();console.error(error);app.exit(1);
      }
    })());
  });
  async function run(dbg){
    const wc=win.webContents,js=code=>wc.executeJavaScript(code);
    let retainedRendererSamples=null;
    const until=async(code,timeout=15000)=>{const end=clock()+timeout;while(clock()<end){if(await js(code))return true;await sleep(50)}return false};
    if(!await until('!!window.__world?.lastData && window.__world.desks.size===23 && !!window.__world.desks.get("perf-t0")?.wm.operatorPresent'))throw Error('Fixed office did not reach its mounted/seated state');
    await js('document.fonts.ready');await sleep(1000);
    result.seed=await js('window.__interactionSeed');if(result.seed!==1731)throw Error('Early deterministic seed was not installed: '+result.seed);
    result.gpu=await app.getGPUInfo('basic');result.gpuFeatures=app.getGPUFeatureStatus();
    result.hardware.displays=require('electron').screen.getAllDisplays().map(({bounds,scaleFactor,displayFrequency})=>({bounds,scaleFactor,displayFrequency}));
    result.executing=await js(`({href:location.href,scripts:[...document.scripts].map(s=>s.src),styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(s=>s.href),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},roster:window.__world.roster.robots.map(r=>[r.id,r.name,r.look]),desks:window.__world.desks.size,walkers:document.querySelectorAll('.world-walker').length})`);
    const crypto=require('node:crypto');
    result.executing.scriptHashes=result.executing.scripts.filter(s=>s.startsWith('file:')).map(url=>({url,sha256:crypto.createHash('sha256').update(fs.readFileSync(require('node:url').fileURLToPath(url))).digest('hex')}));
    fs.writeFileSync(path.join(out,'executing-assets.json'),JSON.stringify(result.executing,null,2));
    await js(`{
      const w=window.__world,c=window.__chat;w.stopCameraMotion();c.close();w.setLayoutHeld(true);
      for(const d of w.desks.values())d.director.reset();
      const q=window.__interactionReview={frames:[],inputs:[],commits:[],applies:[],mutations:[],errors:[],recording:false,last:0,pending:[],lastTransform:w.root.style.transform,lastInput:0,sceneMagnitude:0,sceneDelta:0,allMagnitude:0,allDelta:0};
      q.center=()=>{const d=w.desks.get('perf-t0');w.stopCameraMotion();w.cam={s:.65,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*.65,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*.65};w.apply()};q.center();
      q.original=w.apply;w.apply=function(){const start=performance.now();try{return q.original.call(this)}finally{if(q.recording)q.applies.push({at:performance.timeOrigin+start,ms:performance.now()-start})}};
      q.wheel=e=>{if(!q.recording)return;const now=performance.now();const row={at:performance.timeOrigin+now,stamp:performance.timeOrigin+e.timeStamp,delay:Math.max(0,now-e.timeStamp),delta:e.deltaY,scene:w.scene.contains(e.target),trusted:e.isTrusted};q.inputs.push(row);q.lastInput=now;q.allMagnitude+=Math.abs(row.delta);q.allDelta+=row.delta;if(row.scene){q.pending.push(row.at);q.sceneMagnitude+=Math.abs(row.delta);q.sceneDelta+=row.delta}};
      document.addEventListener('wheel',q.wheel,{capture:true,passive:true});
      q.observer=new MutationObserver(()=>{const next=w.root.style.transform;if(next===q.lastTransform)return;q.lastTransform=next;if(q.recording){const at=performance.timeOrigin+performance.now();q.commits.push({at,first:q.pending.length?at-q.pending[0]:null,latest:q.pending.length?at-q.pending.at(-1):null,inputs:q.pending.length});q.pending=[];q.mutations.push({at,paints:Number(document.querySelector('.outside-vector-canvas')?.dataset.paints)||0,dom:document.querySelectorAll('canvas').length})}});q.observer.observe(w.root,{attributes:true,attributeFilter:['style']});
      q.frame=t=>{if(q.recording&&q.last)q.frames.push({at:performance.timeOrigin+performance.now(),ms:t-q.last});q.last=t;q.raf=requestAnimationFrame(q.frame)};q.raf=requestAnimationFrame(q.frame);
      q.error=e=>q.errors.push(e.message||String(e.reason));window.addEventListener('error',q.error);window.addEventListener('unhandledrejection',q.error);
      q.snapshot=()=>({camera:w.cameraState(),wheelMagnitude:q.sceneMagnitude,wheelSignedDelta:q.sceneDelta,allWheelMagnitude:q.allMagnitude,allWheelSignedDelta:q.allDelta,desks:w.desks.size,allDesks:w.allDesks.size,transit:w.transit.size,exits:w.exits.size,chatRows:c.shown.size,chatNodes:c.el.querySelectorAll('.cp-msg,.cp-event').length,renderLoops:window.__lucidPerf?.render?.(),canvases:document.querySelectorAll('canvas').length,backingPixels:[...document.querySelectorAll('canvas')].reduce((s,c)=>s+c.width*c.height,0),staticArt:window.__staticArt.stats(),dom:document.querySelectorAll('*').length,worldScroll:[...w.root.querySelectorAll('.win-body,.t3-scroll,.scroll')].reduce((s,e)=>s+e.scrollTop,0)});
      q.graphicsQuiet=()=>(${graphicsQuiet.toString()})(document,window.__staticArt.stats());
      q.graphics=()=>(${collectGraphicsStats.toString()})(document,window.__staticArt.stats());
      q.recorderCounts=()=>(${collectRecorderCounts.toString()})(q);
      q.recording=true;void 0;
    }`);
    const rows=Array.from({length:400},(_,i)=>({id:'review-'+i,role:i%2?'assistant':'user',at:new Date(1800000000000+i*70000).toISOString(),streaming:false,text:'Message '+i+'\n\n'+('A readable paragraph while scrolling the measured conversation. '.repeat(12))+'\n\n\u0060\u0060\u0060ts\nconst offset = '+i+';\n\u0060\u0060\u0060',attachments:[]}));
    messages=rows;
    sampler=require('./interaction-review-resources.cjs').createResourceSampler(app);sampler.start();
    isolation=await require('./interaction-review-isolation.cjs')({dbg,js,name:request.isolation});result.isolation=isolation.details;
    const scenePoint=()=>js(`{const r=window.__world.scene.getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
    const point=await scenePoint();
    let sync=[];for(let i=0;i<5;i++){const a=clock(),remote=await js('performance.timeOrigin+performance.now()'),b=clock();sync.push({rtt:b-a,offset:remote-(a+b)/2})}sync.sort((a,b)=>a.rtt-b.rtt);result.clockSync=sync[0];
    const toRenderer=t=>t+result.clockSync.offset;
    await dbg.sendCommand('Performance.enable');
    async function checkpoint(cycle,stage) {
      const collectionStartedAt=clock();
      const renderer=await js('({rendererAt:performance.timeOrigin+performance.now(),state:window.__interactionReview.snapshot(),graphics:window.__interactionReview.graphics(),recorder:window.__interactionReview.recorderCounts()})');
      let heap,domCounters;
      try { const {metrics}=await dbg.sendCommand('Performance.getMetrics');const values=Object.fromEntries(metrics.map(metric=>[metric.name,metric.value]));heap={source:'Performance.getMetrics',JSHeapUsedSize:values.JSHeapUsedSize??null,JSHeapTotalSize:values.JSHeapTotalSize??null}; }
      catch(error){heap={source:'Performance.getMetrics',error:String(error)}}
      try { domCounters=await dbg.sendCommand('Memory.getDOMCounters'); }
      catch(error){domCounters={error:String(error)}}
      const at=clock(),resources=sampler.rows.at(-1)||null;
      const point={cycle,stage,at,collectionStartedAt,collectionDurationMs:at-collectionStartedAt,...renderer,heap,domCounters,resources,resourceSampleAgeMs:resources?at-resources.at:null,
        fixtureMessages:fixtureMessageStats(messages),mainRetainedRecorder:retainedRendererSamples?collectRecorderCounts(retainedRendererSamples):null};
      result.cycleCheckpoints.push(point);save();return point;
    }
    async function wheelPhase(name,pace,mode,mixed=false,count=96){
      await js('window.__interactionReview.center()');await sleep(250);
      const before=await js('{const q=window.__interactionReview;q.pending=[];q.snapshot()}'),start=clock(),sent=[],promises=[];let lastOffer=start;
      const phase={name,start:toRenderer(start),mode,paceMs:pace,plannedInputCount:count,offeredInputCount:0,sent,before,status:'running'};result.phases.push(phase);save();
      if(mixed)await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'middle',buttons:4,clickCount:1,...point});
      for(let i=0;i<count;i++){
        if(i&&pace>0)await sleep(Math.max(0,pace-(clock()-lastOffer)));
        const deltaY=(Math.floor(i/24)%2?1:-1)*60,at=clock();lastOffer=at;
        const record={i,at,deltaY};sent.push(record);phase.offeredInputCount=sent.length;
        const move=mixed?dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',button:'middle',buttons:4,x:point.x+Math.round(Math.sin(i/9)*180),y:point.y+Math.round(Math.cos(i/11)*70)}).then(()=>{record.pointerAck=clock()}):Promise.resolve();
        const wheel=mode==='wc-flood'?(wc.sendInputEvent({type:'mouseWheel',...point,deltaX:0,deltaY:-deltaY,canScroll:true}),Promise.resolve()):dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY}).then(()=>{record.wheelAck=clock()});
        const task=Promise.all([move,wheel]).then(()=>{if(mode!=='wc-flood')record.ack=clock()},error=>{record.error=String(error);throw error});
        if(mode==='ack')await task;else promises.push(task.catch(error=>{phase.dispatchError??=String(error)}));
      }
      const offeredEnd=clock();phase.offeredEnd=toRenderer(offeredEnd);await Promise.all(promises);const ackEnd=clock();
      if(phase.dispatchError)throw Error(phase.dispatchError);
      if(mixed)await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'middle',buttons:0,clickCount:1,...point});
      // CDP acknowledges its processed wheel queue, which may coalesce opposite
      // deltas. Absolute magnitude is not conserved across zero cancellation.
      // Electron injection has no acknowledgement, so keep its stricter observed
      // magnitude barrier and report an unresolved drain rather than assume one.
      const magnitudeBarrier=mode==='wc-flood'?`window.__interactionReview.sceneMagnitude>=${before.wheelMagnitude+count*60-.001} && `:'';
      const drained=await until(`${magnitudeBarrier}performance.timeOrigin+performance.now()>${toRenderer(offeredEnd)+500} && performance.now()-window.__interactionReview.lastInput>500 && window.__interactionReview.graphicsQuiet()`,12000);
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
      const end=clock(),after=await js('window.__interactionReview.snapshot()');
      const accounting=inputAccounting(sent,before,after);
      Object.assign(phase,{ackEnd:mode==='wc-flood'?null:toRenderer(ackEnd),end:toRenderer(end),drained,...accounting,drainEvidence:mode==='wc-flood'?'observed-magnitude-and-quiet':'all-CDP-acknowledgements-signed-delta-and-quiet',after,queueDrainMs:mode==='wc-flood'?null:ackEnd-offeredEnd,settleMs:end-offeredEnd,status:drained&&accounting.signedDeltaMatches?'complete':'failed'});save();
      if(!drained||!accounting.signedDeltaMatches)throw Error(name+' has unresolved input accounting or input/raster quiet; stopping before changing surfaces');
      return phase;
    }
    // Prewarm the same route and long conversation before primary measurements.
    await wheelPhase('warmup',30,'ack',false,48);
    await js('window.__chat.open(window.__world.desks.get("perf-t0"),false)');await until('window.__chat.shown.size===400');await sleep(600);await js('window.__chat.close();window.__interactionReview.center()');await sleep(600);
    result.warmupEnd=clock();const idleMs=request.quick?1200:10000;const idleStart=clock();await sleep(idleMs);result.initialIdle={start:toRenderer(idleStart),end:toRenderer(clock())};
    if(request.trace){await dbg.sendCommand('Profiler.enable');await dbg.sendCommand('Profiler.start');await contentTracing.startRecording({included_categories:['devtools.timeline','disabled-by-default-devtools.timeline','cc','gpu','viz','v8','blink.user_timing']});tracing=true}
    const cycles=request.quick?1:request.cycles;
    result.workload={pacedOnly:!!request.pacedOnly,normalWheelInputsPerPhase:96,chatWheelInputsPerCycle:64,
      finalRecoveryMs:request.finalRecoveryMs??(request.quick?1500:30000),graphicsAndHeapSamples:'cycle boundaries only',forcedGarbageCollection:false};
    for(let cycle=0;cycle<cycles;cycle++){
      await checkpoint(cycle,'start');
      for(const phase of cycleWheelWorkload(cycle,request))await wheelPhase(phase.name,phase.pace,phase.mode,phase.mixed,phase.count);
      await js('window.__chat.open(window.__world.desks.get("perf-t0"),false)');await until('window.__chat.shown.size===400');await sleep(600);
      await js(`{const l=window.__chat.el.querySelector('.cp-list');l.scrollTop=l.scrollHeight*.45}`);
      const chatPoint=await js(`{const r=window.__chat.el.querySelector('.cp-list').getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
      const before=await js('window.__interactionReview.snapshot()'),start=clock(),sent=[];
      const chatPhase={name:'chat-scroll-'+cycle,start:toRenderer(start),before,sent,mode:'ack',paceMs:16,plannedInputCount:64,offeredInputCount:0,status:'running'};result.phases.push(chatPhase);save();
      for(let i=0;i<64;i++){
        const at=clock(),deltaY=Math.floor(i/16)%2?-40:40,record={i,at,deltaY};sent.push(record);chatPhase.offeredInputCount=sent.length;
        try{await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',...chatPoint,deltaX:0,deltaY});record.ack=clock()}
        catch(error){record.error=String(error);throw error}
        if(i%16===0){messages=messages.map((m,n)=>n===399?{...m,text:m.text+'\nRevision '+cycle+'-'+i,streaming:true}:m);await js('window.__chat.refresh()')}
        await sleep(16);
      }
      const offeredEnd=clock();chatPhase.offeredEnd=toRenderer(offeredEnd);
      const drained=await until(`performance.timeOrigin+performance.now()>${toRenderer(offeredEnd)+500} && performance.now()-window.__interactionReview.lastInput>500 && window.__interactionReview.graphicsQuiet()`),end=clock();
      const after=await js('window.__interactionReview.snapshot()'),accounting=inputAccounting(sent,before,after,true);
      Object.assign(chatPhase,{ackEnd:toRenderer(offeredEnd),end:toRenderer(end),drained,after,...accounting,status:drained&&accounting.signedDeltaMatches?'complete':'failed'});save();
      if(!drained||!accounting.signedDeltaMatches)throw Error(chatPhase.name+' has unresolved input accounting or graphics quiet');
      await js('window.__chat.close();window.__interactionReview.center()');await sleep(600);
      await checkpoint(cycle,'after-interaction');
      const recoveryStart=clock();await sleep(request.quick?1000:5000);result.phases.push({name:'cycle-recovery-'+cycle,start:toRenderer(recoveryStart),end:toRenderer(clock())});save();
      await checkpoint(cycle,'after-recovery');
    }
    if(tracing){const p=await dbg.sendCommand('Profiler.stop');fs.writeFileSync(path.join(out,'renderer.cpuprofile'),JSON.stringify(p.profile));await contentTracing.stopRecording(path.join(out,'trace.json'));tracing=false}
    // Capture the matched visible state before removing fixture work for cleanup.
    await js('window.__chat.close();window.__interactionReview.center()');await sleep(500);
    fs.writeFileSync(path.join(out,'office.png'),(await wc.capturePage()).toPNG());
    await js(`{const w=window.__world,p=w.outdoor.park;w.stopCameraMotion();w.cam={s:1,x:w.scene.clientWidth/2-(p.x+p.w/2),y:w.scene.clientHeight/2-(p.y+p.h/2)};w.apply()}`);await sleep(500);
    fs.writeFileSync(path.join(out,'grounds.png'),(await wc.capturePage()).toPNG());
    const data=await js(`{const q=window.__interactionReview;q.recording=false;cancelAnimationFrame(q.raf);q.observer.disconnect();document.removeEventListener('wheel',q.wheel,true);window.removeEventListener('error',q.error);window.removeEventListener('unhandledrejection',q.error);window.__world.apply=q.original;
      const result={frames:q.frames,inputs:q.inputs,commits:q.commits,applies:q.applies,mutations:q.mutations,errors:q.errors};q.frames=[];q.inputs=[];q.commits=[];q.applies=[];q.mutations=[];result}`);
    retainedRendererSamples=data;
    result.preCleanup=await js('window.__interactionReview.snapshot()');
    await checkpoint(null,'pre-cleanup');
    const recoveryStart=clock();
    if(!request.quick){
      worldData={projects:[],threads:[],shipped:{total:0,today:0}};
      await js(`{const w=window.__world;window.__chat.close();w.stopCameraMotion();w.setLayoutHeld(false);w.update({projects:[],threads:[],shipped:{total:0,today:0}})}`);
    }
    await sleep(request.finalRecoveryMs??(request.quick?1500:30000));
    const recoveryEnd=clock(),finalCheckpoint=await checkpoint(null,'final-recovery');
    result.finalRecovery={start:toRenderer(recoveryStart),end:toRenderer(recoveryEnd),state:finalCheckpoint.state,checkpointAt:finalCheckpoint.at};
    result.errors=data.errors;if(data.errors.length)throw Error('Renderer errors during profiling');
    fs.writeFileSync(path.join(out,'renderer-samples.json'),JSON.stringify(data));
    sampler.sample();sampler.stop();fs.writeFileSync(path.join(out,'process-samples.json'),JSON.stringify(sampler.rows,null,2));
    fs.writeFileSync(path.join(out,'sender-samples.json'),JSON.stringify(result.phases.filter(p=>p.sent).map(p=>({name:p.name,mode:p.mode,start:p.start,offeredEnd:p.offeredEnd,ackEnd:p.ackEnd,end:p.end,sent:p.sent})),null,2));
    const stats=a=>{a=a.slice().sort((a,b)=>a-b);return{count:a.length,mean:a.length?a.reduce((s,n)=>s+n,0)/a.length:null,p50:a[Math.floor(a.length*.5)]??null,p95:a[Math.floor(a.length*.95)]??null,p99:a[Math.floor(a.length*.99)]??null,max:a.at(-1)??null,over144:a.length?a.filter(n=>n>1000/144).length/a.length:null,over60:a.length?a.filter(n=>n>1000/60).length/a.length:null,over33:a.length?a.filter(n=>n>1000/30).length/a.length:null}};
    for(const phase of result.phases){
      const end=phase.offeredEnd??phase.end,subset=(rows,from,to)=>rows.filter(row=>row.at>=from&&row.at<to);
      phase.activeFrames=stats(subset(data.frames,phase.start,end).map(row=>row.ms));phase.drainFrames=stats(subset(data.frames,end,phase.end).map(row=>row.ms));
      const input=subset(data.inputs,phase.start,phase.end);phase.rendererInput={count:input.length,delta:input.reduce((s,row)=>s+row.delta,0),delay:stats(input.map(row=>row.delay))};
      phase.ack=stats((phase.sent||[]).filter(row=>row.ack).map(row=>row.ack-row.at));phase.offerGaps=stats((phase.sent||[]).slice(1).map((row,i)=>row.at-phase.sent[i].at));
      phase.commits={count:subset(data.commits,phase.start,phase.end).length,first:stats(subset(data.commits,phase.start,phase.end).filter(row=>row.first!==null).map(row=>row.first)),latest:stats(subset(data.commits,phase.start,phase.end).filter(row=>row.latest!==null).map(row=>row.latest))};
      phase.inputAfterOffer={count:input.filter(row=>row.at>end).length,lastDelayMs:input.length?Math.max(0,input.at(-1).at-end):null};
      phase.apply=stats(subset(data.applies,phase.start,phase.end).map(row=>row.ms));phase.resources=sampler.summarize(phase.start-result.clockSync.offset,phase.end-result.clockSync.offset);
      delete phase.sent;
    }
    result.idleResources=sampler.summarize(idleStart,result.initialIdle.end-result.clockSync.offset);result.recoveryResources=sampler.summarize(recoveryStart,result.finalRecovery.end-result.clockSync.offset);
    // Hash the scripts Chromium actually parsed, not just files currently on disk.
    const parsed=[];const scriptListener=(_event,method,params)=>{if(method==='Debugger.scriptParsed')parsed.push(params)};dbg.on('message',scriptListener);
    await dbg.sendCommand('Debugger.enable');await sleep(20);
    result.executing.parsedSources=[];
    for(const asset of result.executing.scriptHashes){
      const script=parsed.find(row=>row.url===asset.url);if(!script)throw Error('Executing entry script is not inspectable: '+asset.url);
      const {scriptSource}=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:script.scriptId});
      const sha256=crypto.createHash('sha256').update(scriptSource).digest('hex');
      result.executing.parsedSources.push({url:asset.url,sha256,matchesValidatedFile:sha256===asset.sha256});
      if(sha256!==asset.sha256)throw Error('Executing entry differs from its frozen asset');
    }
    await dbg.sendCommand('Debugger.disable');dbg.removeListener('message',scriptListener);
    fs.writeFileSync(path.join(out,'executing-assets.json'),JSON.stringify(result.executing,null,2));
    await isolation();
    if(request.productionChecks)result.productionChecks=await require('./render-outside-production-checks.cjs')({js,wc,wait:sleep,out,dbg});
    result.completed=new Date().toISOString();sampler.stop();save();
    console.log(JSON.stringify({out,isolation:request.isolation,trace:request.trace,phases:result.phases.filter(p=>!p.name.startsWith('warm')).map(p=>({name:p.name,p95:p.activeFrames.p95,ack:p.ack.p95,queue:p.queueDrainMs})),errors:result.errors}));
  }
  const projects=Array.from({length:4},(_,i)=>({id:'perf-p'+i,title:'Rendering '+(i+1),root:'C:/perf/'+i,icon:null,scratch:false}));
  const threads=Array.from({length:31},(_,i)=>({id:'perf-t'+i,projectId:projects[i%4].id,title:'Robot '+(i+1),updatedAt:'2026-10-31T12:00:00Z',provider:i%2?'codex':'claudeAgent',runStatus:i<18?'running':null,pinned:i<6,settled:i>=18&&i<26,question:i>=26?'Can you review this change?':null,model:null}));
  let messages=[];
  let worldData={projects,threads,shipped:{total:0,today:0}};
  require(path.join(root,'electron/main.cjs'));
  const replace=(name,fn)=>{ipcMain.removeHandler(name);ipcMain.handle(name,fn)};
  replace('t3:world',()=>worldData);replace('t3:watch-set',()=>true);replace('t3:conversation',()=>messages);replace('t3:conversation-page',()=>({messages,hasMore:false}));
  replace('t3:tasks',()=>[]);replace('usage:get',()=>null);replace('weather:get',()=>({weather:null,error:null}));replace('environment:list',()=>({buildings:[{id:'local',label:'Benchmark PC',local:true,canOpen:true}]}));replace('app:host',()=> 'Benchmark PC');
  ipcMain.removeAllListeners('settings:load');ipcMain.on('settings:load',event=>{event.returnValue='{}'});
  ipcMain.removeAllListeners('roster:load');ipcMain.on('roster:load',event=>{event.returnValue=fs.readFileSync(request.fixtureRoster,'utf8')});replace('roster:save',()=>true);replace('settings:save',()=>true);
  app.on('before-quit',()=>{sampler?.stop();save()});
}
}
