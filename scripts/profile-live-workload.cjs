// Profile a running, visible Lucid through an explicitly enabled localhost CDP port.
// No fixture threads, chat sends, approvals, settings writes or source modifications.
const fs = require('node:fs');
const path = require('node:path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = path.resolve(process.argv[2] || 'live-workload');
  const port = Number(process.env.LUCID_CDP_PORT || 9334);
  fs.mkdirSync(out, { recursive: true });
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(p => p.type === 'page' && /Lucid[\\/]|Lucid\/|dist\/index\.html/.test(p.url)) || pages.find(p => p.type === 'page');
  if (!page) throw Error('No running Lucid page at the configured debugging port');
  const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(), events = new Set();
  let seq = 0;
  ws.addEventListener('message', e => {
    const data = JSON.parse(e.data);
    if (data.id) { const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(Error(data.error.message)) : p.resolve(data.result); } }
    else for (const fn of events) fn(data);
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async name => { const r = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };
  const tracing = process.env.LUCID_LIVE_TRACE === '1';
  let layerSummary = null, lastLayers = [];
  const layerEvent = e => { if (e.method === 'LayerTree.layerTreeDidChange') { const layers=e.params.layers||[];lastLayers=layers;layerSummary={count:layers.length,drawing:layers.filter(l=>l.drawsContent).length,large:layers.filter(l=>l.drawsContent&&l.width*l.height>1e6).length,paintCount:layers.reduce((n,l)=>n+(l.paintCount||0),0)}; } };
  let original, recording = false;
  const results = [];
  try {
    try {
      const windowInfo=await call('Browser.getWindowForTarget',{targetId:page.id});
      if(windowInfo.bounds.windowState==='minimized')await call('Browser.setWindowBounds',{windowId:windowInfo.windowId,bounds:{windowState:'normal'}});
    } catch(error) { if(!error.message.includes("wasn't found"))throw error; }
    await call('Page.bringToFront');
    await wait(250);
    if(await js('document.hidden'))throw Error('Lucid must be visible for an actual foreground workload profile');
    await call('Performance.enable');
    if(process.env.LUCID_LIVE_LAYERS){events.add(layerEvent);await call('LayerTree.enable');}
    await js(`{window.__liveProfileErrors=[];window.__liveProfileError=e=>window.__liveProfileErrors.push(e.message);window.__liveProfileRejection=e=>window.__liveProfileErrors.push(String(e.reason));window.addEventListener('error',window.__liveProfileError);window.addEventListener('unhandledrejection',window.__liveProfileRejection)}`);
    original = await js(`{const w=window.__world;({cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},enabled:window.__lucidPerf.snapshot().enabled,focus:w.focusDesk?.threadId,mode:w.focusMode})}`);
    if(process.env.LUCID_LIVE_CSS)await js(`{const s=document.createElement('style');s.id='live-profile-experiment';s.textContent=${JSON.stringify(process.env.LUCID_LIVE_CSS)};document.head.append(s)}`);
    await js(`window.__world.stopFollow()`);
    for (const name of (process.env.LUCID_LIVE_SCENES || 'current,overview,panning,close').split(',')) {
      if (name === 'overview') { await js(`window.__world.overview()`); await wait(1800); }
      if (name === 'close') {
        await js(`{const w=window.__world,d=[...w.desks.values()].find(d=>d.wm.wins.size && !d.el.classList.contains('arriving'))||w.desks.values().next().value;if(d){w.stopFollow();w.cam={s:2,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*2,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+100)*2};w.apply()}}`);
        await wait(800);
      }
      const point = await js(`{const r=window.__world.scene.getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
      const trace = [], onEvent = e => { if (e.method === 'Tracing.dataCollected') trace.push(...e.params.value); };
      events.add(onEvent);
      if (tracing) { await call('Tracing.start', { transferMode: 'ReportEvents', categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,__metadata' }); await call('Profiler.enable'); await call('Profiler.start'); }
      await js(`{window.__lucidPerf.enable(true);window.__lucidPerf.reset();window.__liveProfileFrames=[];window.__liveProfileRecording=true;let last=performance.now();const tick=t=>{if(!window.__liveProfileRecording)return;window.__liveProfileFrames.push(t-last);last=t;requestAnimationFrame(tick)};requestAnimationFrame(tick)}`);
      recording = true;
      const before = await call('Performance.getMetrics');
      if (name === 'panning') await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'middle', buttons: 4, clickCount: 1, ...point });
      const start = Date.now();
      while (Date.now() - start < 6000) {
        if (name === 'panning') { const t = (Date.now() - start) / 1000; await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'middle', buttons: 4, x: point.x + Math.round(Math.sin(t * 2.4) * 350), y: point.y + Math.round(Math.sin(t * 3.2) * 90) }); }
        await wait(name === 'panning' ? 16 : 100);
      }
      if (name === 'panning') await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'middle', buttons: 0, clickCount: 1, ...point });
      const after = await call('Performance.getMetrics');
      const stats = await js(`{window.__liveProfileRecording=false;const a=window.__liveProfileFrames.slice(1).sort((a,b)=>a-b),w=window.__world;({frames:a.length,mean:a.reduce((s,n)=>s+n,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],over33:a.filter(n=>n>33.4).length,over100:a.filter(n=>n>100).length,cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},hidden:document.hidden,desks:w.desks.size,projects:w.lastData?.projects.length,threads:w.lastData?.threads.length,dom:document.querySelectorAll('*').length,svg:document.querySelectorAll('svg *').length,roomNodes:[...document.querySelectorAll('.room')].map(e=>({nodes:e.querySelectorAll('*').length,culled:e.classList.contains('culled')})),canvases:document.querySelectorAll('canvas').length,screenWindows:[...w.desks.values()].map(d=>({windows:d.wm.wins.size,visible:!d.screen.classList.contains('render-paused'),apps:[...d.wm.wins.keys()]})),systems:window.__lucidPerf.snapshot(),errors:window.__liveProfileErrors})}`);
      recording = false;
      if (stats.hidden || !stats.frames) throw Error('Foreground measurement invalidated because Lucid was hidden or produced no frames');
      const deltas = Object.fromEntries(after.metrics.filter(m => /Duration|Count/.test(m.name)).map(m => [m.name, m.value - (before.metrics.find(x => x.name === m.name)?.value || 0)]));
      results.push({ name, ...stats, deltas, layers:layerSummary });
      if (tracing) {
        fs.writeFileSync(path.join(out, `${name}-cpu.json`), JSON.stringify((await call('Profiler.stop')).profile));
        const complete = new Promise(resolve => { const listener = e => { if (e.method === 'Tracing.tracingComplete') { events.delete(listener); resolve(); } }; events.add(listener); });
        await call('Tracing.end'); await complete;
        fs.writeFileSync(path.join(out, `${name}-trace.json`), JSON.stringify({ traceEvents: trace }));
      }
      events.delete(onEvent);
      await shot(name);
      if(process.env.LUCID_LIVE_LAYERS&&name==='overview'){
        const details=[];
        for(const layer of lastLayers.filter(l=>l.drawsContent).sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,30)){
          let node=null,reasons=null;
          if(layer.backendNodeId){const r=await call('DOM.describeNode',{backendNodeId:layer.backendNodeId,depth:0}).catch(()=>null);if(r){const a=r.node.attributes||[],attrs={};for(let i=0;i<a.length;i+=2)if(['class','id'].includes(a[i]))attrs[a[i]]=a[i+1];node={tag:r.node.nodeName,...attrs};}}
          reasons=await call('LayerTree.compositingReasons',{layerId:layer.layerId}).catch(()=>null);
          details.push({width:layer.width,height:layer.height,node,reasons});
        }
        fs.writeFileSync(path.join(out,'largest-layers.json'),JSON.stringify(details,null,2));
      }
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ name, frames: stats.frames, mean: stats.mean, p95: stats.p95, p99: stats.p99, over33: stats.over33, over100: stats.over100, desks: stats.desks, projects: stats.projects, dom: stats.dom, svg: stats.svg, hidden: stats.hidden, systems: stats.systems, errors: stats.errors }));
    }
  } finally {
    if(process.env.LUCID_LIVE_LAYERS)await call('LayerTree.disable').catch(()=>{});
    if (recording) await js(`window.__liveProfileRecording=false`).catch(() => {});
    if (original) await js(`{const w=window.__world;document.getElementById('live-profile-experiment')?.remove();w.stopFollow();w.cam=${JSON.stringify(original.cam)};w.apply();if(!${original.enabled})window.__lucidPerf.enable(false);window.removeEventListener('error',window.__liveProfileError);window.removeEventListener('unhandledrejection',window.__liveProfileRejection);delete window.__liveProfileFrames;delete window.__liveProfileRecording}`).catch(() => {});
    ws.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
