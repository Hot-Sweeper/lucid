// Reversible, real-input A/B diagnostics against the currently running app.
// Hidden samples are saved as rejected, never accepted as foreground timings.
const fs=require('node:fs'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const out=path.resolve(process.argv[2]||'camera-ablation');fs.mkdirSync(out,{recursive:true});
  const port=Number(process.env.LUCID_CDP_PORT||9334);
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page');
  if(!page)throw Error('Live Lucid page unavailable');
  const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map();let seq=0,trace=[];
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(d.error.message)):p.resolve(d.result)}else if(d.method==='Tracing.dataCollected')trace.push(...d.params.value);else if(d.method==='Tracing.tracingComplete')traceDone?.()});
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  const js=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  const variants={baseline:'',outside:'.outside-layer',staticOutside:'.outside-native,.outside-quick,.outside-detail,.outside-vector-canvas',liveOutside:'.outside-live',weather:'.weather-layer,.weather-flash',robots:'.world-seated,.world-walker-svg,.robot-host',screens:'.monitor .screen',rooms:'.room-art,.hall',desks:'.desk-unit>svg',everything:'.world',noGrass:'',noPatterns:'',rootPromoted:'',noRoomPromotion:'',nativePromoted:'',planeContained:'',nativeIsolated:'',noNative:'.outside-native',noBitmaps:'.outside-quick,.outside-detail,.outside-vector-canvas'};
  const selected=(process.env.LUCID_ABLATIONS||'baseline,outside,staticOutside,liveOutside,weather,robots,screens,rooms,desks,baseline').split(',');
  let traceDone,held=false,point,recording=false;const results=[];
  try{
    await call('Page.enable');await call('Performance.enable');
    const initial=await js(`(()=>{const w=window.__world;window.__abOriginal={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},frame:w.frame,enabled:window.__lucidPerf.snapshot().enabled};w.stopCameraMotion();return{hidden:document.hidden,assets:[...document.scripts].map(s=>s.src).filter(Boolean),cam:window.__abOriginal.cam,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},desks:w.desks.size,projects:w.lastData.projects.length}})()`);
    initial.measurement=process.env.LUCID_AB_CONTROLLED==='1'?'controlled-native-occlusion-disabled':'actual-foreground';
    fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify(initial,null,2));
    if(initial.hidden)throw Error('Actual app is hidden before sampling');
    point=await js(`(()=>{const r=window.__world.scene.getBoundingClientRect();return{x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.5)}})()`);
    for(const variant of selected){
      if(!(variant in variants))throw Error('Unknown ablation '+variant);
      await js(`(()=>{for(const host of document.querySelectorAll('.outside-native')){host.shadowRoot?.getElementById('ablation-shadow')?.remove();const svg=host.shadowRoot?.querySelector('svg');if(svg?.__abSet){svg.setAttribute=svg.__abSet;delete svg.__abSet}}document.getElementById('camera-ablation-style')?.remove();const s=document.createElement('style');s.id='camera-ablation-style';s.textContent=${JSON.stringify(variant==='nativePromoted'?'.outside-native{will-change:transform!important}':variant==='planeContained'?'.outside-viewport{contain:strict!important;isolation:isolate}':variant==='nativeIsolated'?'.outside-native{isolation:isolate!important}':variant==='rootPromoted'?'.world.zooming{will-change:transform!important}':variant==='noRoomPromotion'?'.room,.world-seated,.world-walker-svg,.desk-unit>svg{will-change:auto!important}':variants[variant]?variants[variant]+'{visibility:hidden!important}':'')};document.head.append(s);const w=window.__world;w.stopCameraMotion();w.cam={...window.__abOriginal.cam};w.apply();for(const host of document.querySelectorAll('.outside-native')){const svg=host.shadowRoot?.querySelector('svg');if(${JSON.stringify(variant)}==='freezeOutside'&&svg){svg.__abSet=svg.setAttribute;svg.setAttribute=function(n,v){if(!['viewBox','width','height'].includes(n))this.__abSet(n,v)}}if(${JSON.stringify(variant)}==='noGrass'||${JSON.stringify(variant)}==='noPatterns'){const style=document.createElement('style');style.id='ablation-shadow';style.textContent=${JSON.stringify(variant==='noGrass'?'[fill="url(#lc-grass)"]{visibility:hidden!important}':'[fill^="url("]{visibility:hidden!important}')};host.shadowRoot?.append(style)}}})()`);
      await wait(300);
      for(const mode of (process.env.LUCID_AB_MODES||'pan,zoom').split(',')){
        await js(`(()=>{const w=window.__world;w.stopCameraMotion();w.cam={...window.__abOriginal.cam};w.apply();window.__abFrames=[];window.__abLong=[];window.__abLost=document.hidden;window.__abVisibility=()=>{if(document.hidden)window.__abLost=true};document.addEventListener('visibilitychange',window.__abVisibility);window.__abObserver=new PerformanceObserver(l=>window.__abLong.push(...l.getEntries().map(e=>e.duration)));window.__abObserver.observe({type:'longtask'});window.__abRecording=true;let last=performance.now();const frame=t=>{if(!window.__abRecording)return;window.__abFrames.push(t-last);last=t;requestAnimationFrame(frame)};requestAnimationFrame(frame);window.__lucidPerf.enable(true);window.__lucidPerf.reset();window.__abMoves=0;window.__abFirst={x:w.cam.x,y:w.cam.y,s:w.cam.s};window.__abMutation=new MutationObserver(()=>window.__abMoves++);window.__abMutation.observe(w.root,{attributes:true,attributeFilter:['style']})})()`);
        recording=true;trace=[];
        if(process.env.LUCID_AB_TRACE==='1')await call('Tracing.start',{transferMode:'ReportEvents',categories:'devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,__metadata'});
        const before=await call('Performance.getMetrics');
        if(mode==='pan'){await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'middle',buttons:4,clickCount:1,...point});held=true}
        const duration=Number(process.env.LUCID_AB_MS||1800),start=Date.now();let previous=0;
        while(Date.now()-start<duration){const t=(Date.now()-start)/duration;
          if(mode==='pan')await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'middle',buttons:4,x:point.x+Math.round(Math.sin(t*Math.PI*4)*220),y:point.y+Math.round(Math.sin(t*Math.PI*2)*90)});
          else {const target=Math.sin(t*Math.PI*2)*.65;await call('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:-(target-previous)/.0015,...point});previous=target}
          await wait(8);
        }
        if(held){await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'middle',buttons:0,clickCount:1,...point});held=false}
        const after=await call('Performance.getMetrics');
        const stats=await js(`(()=>{window.__abRecording=false;window.__abObserver.disconnect();window.__abMutation.disconnect();document.removeEventListener('visibilitychange',window.__abVisibility);const a=window.__abFrames.slice(1).sort((a,b)=>a-b),w=window.__world;return{frames:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(n=>n>33.4).length,over100:a.filter(n=>n>100).length,hidden:document.hidden,visibilityLost:window.__abLost,longTasks:window.__abLong,moves:window.__abMoves,cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},systems:window.__lucidPerf.snapshot(),outside:document.querySelector('.outside-viewport')?.dataset.presentation}})()`);
        recording=false;
        if(process.env.LUCID_AB_TRACE==='1'){const done=new Promise(r=>traceDone=r);await call('Tracing.end');await done;traceDone=null;fs.writeFileSync(path.join(out,`${results.length}-${variant}-${mode}-trace.json`),JSON.stringify({traceEvents:trace}));stats.trace=Object.fromEntries(['Paint','RasterTask','Layout','UpdateLayoutTree','PrePaint','CompositeLayers'].map(n=>{const es=trace.filter(e=>e.name===n&&e.ph==='X');return[n,{count:es.length,totalMs:es.reduce((s,e)=>s+(e.dur||0)/1000,0),maxMs:Math.max(0,...es.map(e=>(e.dur||0)/1000))}]}))}
        stats.deltas=Object.fromEntries(after.metrics.filter(m=>/Duration|Count/.test(m.name)).map(m=>[m.name,m.value-(before.metrics.find(a=>a.name===m.name)?.value||0)]));
        stats.variant=variant;stats.mode=mode;stats.measurement=initial.measurement;stats.accepted=!stats.hidden&&!stats.visibilityLost&&stats.frames>0&&stats.moves>0;results.push(stats);
        fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({variant,mode,accepted:stats.accepted,p95:stats.p95,p99:stats.p99,max:stats.max,over33:stats.over33,moves:stats.moves,trace:stats.trace,deltas:stats.deltas}));
        if(!stats.accepted)throw Error('Rejected foreground sample: hidden, no frames, or no camera changes');
      }
    }
  }finally{
    if(held)await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'middle',buttons:0,clickCount:1,...point}).catch(()=>{});
    await js(`(()=>{window.__abRecording=false;window.__abObserver?.disconnect();window.__abMutation?.disconnect();document.removeEventListener('visibilitychange',window.__abVisibility);document.getElementById('camera-ablation-style')?.remove();for(const host of document.querySelectorAll('.outside-native')){host.shadowRoot?.getElementById('ablation-shadow')?.remove();const svg=host.shadowRoot?.querySelector('svg');if(svg?.__abSet){svg.setAttribute=svg.__abSet;delete svg.__abSet}}const w=window.__world,o=window.__abOriginal;if(o){w.stopCameraMotion();w.cam={...o.cam};w.apply();w.frame=o.frame;window.__lucidPerf.enable(o.enabled)}delete window.__abOriginal})()`).catch(()=>{});ws.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
