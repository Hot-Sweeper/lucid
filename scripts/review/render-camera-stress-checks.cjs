// Isolated native-input stress tests. No live T3 actions, settings writes or quality switches.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
module.exports = async ({ js, wc, wait, out, setMessages }) => {
  const result = { hardware: { platform: process.platform, cpu: os.cpus()[0]?.model, electron: process.versions.electron }, phases: [], checks: {} };
  const save = () => fs.writeFileSync(path.join(out, 'camera-stress-checks.json'), JSON.stringify(result, null, 2));
  const until = async (expression, message) => {
    const end = Date.now() + 12000;
    while (Date.now() < end) { if (await js(expression)) return; await wait(50); }
    throw Error(message);
  };
  const resources = () => require('electron').app.getAppMetrics().map(({ pid, type, cpu, memory }) => ({ pid, type, cpu, memory }));
  let point;
  try {
    await js(`{
      const w=window.__world,c=window.__chat;
      const q=window.__cameraStress={cam:w.cameraState(),held:w.layoutHeld,chat:c.isOpen?c.desk:null,conversationPage:c.api.conversationPage};
      w.stopCameraMotion();c.close();w.unfocus(false);w.setLayoutHeld(true);
      q.errors=[];q.error=e=>q.errors.push(e.message||String(e.reason));window.addEventListener('error',q.error);window.addEventListener('unhandledrejection',q.error);
      const d=w.desks.get('perf-t0');q.desk=d;
      q.center=scale=>{w.stopCameraMotion();w.cam={s:scale,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*scale,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*scale};w.apply()};
      q.center(.65);
      q.originalApply=w.apply;w.apply=function(){if(q.phase)q.phase.commits++;return q.originalApply.call(this)};
      q.lastWheelAt=performance.now();
      q.wheel=e=>{q.lastWheelAt=performance.now();if(q.phase){q.phase.events++;if(e.isTrusted)q.phase.trusted++;q.phase.lastInput=q.lastWheelAt;q.phase.eventDelays.push(Math.max(0,q.lastWheelAt-e.timeStamp))}};
      document.addEventListener('wheel',q.wheel,true);
      q.list=c.el.querySelector('.cp-list');q.scroll=()=>{if(q.phase){const p=q.phase;p.scrollMin=Math.min(p.scrollMin,q.list.scrollTop);p.scrollMax=Math.max(p.scrollMax,q.list.scrollTop)}};q.list.addEventListener('scroll',q.scroll,{passive:true});
      q.panel=document.getElementById('side-panel');q.panelScroll=()=>{if(q.phase){const p=q.phase;p.sidebarMin=Math.min(p.sidebarMin,q.panel.scrollTop);p.sidebarMax=Math.max(p.sidebarMax,q.panel.scrollTop)}};q.panel.addEventListener('scroll',q.panelScroll,{passive:true});
      q.observe=new MutationObserver(()=>{if(q.phase&&q.phase.lastInput)q.phase.latencies.push(performance.now()-q.phase.lastInput)});
      q.observe.observe(w.root,{attributes:true,attributeFilter:['style']});
      q.start=name=>{q.phase={name,events:0,trusted:0,commits:0,lastInput:0,latencies:[],eventDelays:[],frames:[],lastFrame:0,scales:[],scrollMin:q.list.scrollTop,scrollMax:q.list.scrollTop,sidebarMin:q.panel.scrollTop,sidebarMax:q.panel.scrollTop};
        const frame=now=>{const p=q.phase;if(!p)return;if(p.lastFrame)p.frames.push(now-p.lastFrame);p.lastFrame=now;p.scales.push(w.cam.s);q.raf=requestAnimationFrame(frame)};q.raf=requestAnimationFrame(frame)};
      q.stop=()=>{cancelAnimationFrame(q.raf);const p=q.phase;q.phase=null;const stats=a=>{a.sort((a,b)=>a-b);return{count:a.length,mean:a.length?a.reduce((s,n)=>s+n,0)/a.length:0,p95:a[Math.floor(a.length*.95)]||0,max:a.at(-1)||0}};
        return{name:p.name,wheelEvents:p.events,trustedWheelEvents:p.trusted,cameraCommits:p.commits,frames:stats(p.frames),eventToHandler:stats(p.eventDelays),handlerToTransform:stats(p.latencies),minScale:Math.min(...p.scales),maxScale:Math.max(...p.scales),scrollRange:p.scrollMax-p.scrollMin,sidebarScrollRange:p.sidebarMax-p.sidebarMin,canvases:document.querySelectorAll('canvas').length,staticArt:window.__staticArt.stats()}};
      void 0;
    }`);
    result.viewport = await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    const position = async selector => js(`{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
    point = await position('.scene');
    let injected = 0;
    const wheel = (at, deltaY) => { injected++; wc.sendInputEvent({ type: 'mouseWheel', ...at, deltaX: 0, deltaY, canScroll: true }); };
    const phase = async (name, action) => {
      injected=0;
      await js(`window.__cameraStress.start(${JSON.stringify(name)})`);
      await action();
      // Chromium coalesces high-rate native wheel input and may deliver it after
      // the sender finishes. Drain it before changing the active scroll surface.
      await until('performance.now()-window.__cameraStress.lastWheelAt>400', 'Native wheel input did not drain');
      const sample = await js('window.__cameraStress.stop()'); sample.processes = resources();
      sample.injectedWheelEvents=injected;
      result.phases.push(sample); save(); return sample;
    };
    // Multiple direction reversals repeatedly cross room/screen detail and canvas-density tiers.
    const zoom = await phase('rapid-wheel-reversals', async () => {
      for (let i=0;i<160;i++) { wheel(point, Math.floor(i/40)%2 ? 50 : -50); await wait(8); }
    });
    result.checks.zoomReceivedNativeInput = zoom.trustedWheelEvents >= 25;
    result.checks.zoomTraversedScaleRange = zoom.maxScale / zoom.minScale > 4;
    await js('window.__cameraStress.center(.65)');
    const mixed = await phase('mixed-pan-and-zoom', async () => {
      wc.sendInputEvent({ type: 'mouseDown', button: 'middle', clickCount: 1, ...point });
      for (let i=0;i<100;i++) {
        wc.sendInputEvent({ type: 'mouseMove', button: 'middle', modifiers: ['middlebuttondown'], x: point.x+Math.round(Math.sin(i/10)*180), y: point.y+Math.round(Math.cos(i/11)*70) });
        wheel(point, Math.floor(i/20)%2 ? 35 : -35); await wait(8);
      }
      wc.sendInputEvent({ type: 'mouseUp', button: 'middle', clickCount: 1, ...point });
    });
    result.checks.mixedInputClean = mixed.trustedWheelEvents > 15 && await js("!window.__world.scene.classList.contains('panning')");
    await wait(700);
    await until('window.__staticArt.stats().pending===0', 'Zoom raster jobs did not settle');
    result.settledZoom = await js(`{const w=window.__world,el=w.root.querySelector('.outside-vector-canvas'),c=w.cameraState();({camera:c,requiredDensity:c.s*devicePixelRatio,actualDensity:Number(el?.dataset.sourceDensity)||0,presentation:w.root.querySelector('.outside-viewport')?.dataset.presentation,staticArt:window.__staticArt.stats()})}`);
    result.checks.zoomJobsSettle = result.settledZoom.staticArt.pending === 0;

    const messages=Array.from({length:400},(_,i)=>({id:'stress-scroll-'+i,role:i%2?'assistant':'user',at:new Date(1800000000000+i*70000).toISOString(),streaming:false,text:'Message '+i+'\n\n'+('A readable paragraph while scrolling a real conversation. '.repeat(12))+'\n\n```ts\nconst offset = '+i+';\n```',attachments:[]}));
    setMessages(messages);
    await js(`{const q=window.__cameraStress,c=window.__chat;c.api.conversationPage=undefined;c.open(q.desk,false);c.setCollapsed(false)}`);
    await until("window.__chat.shown.size===400", 'Long chat fixture did not load');
    await wait(650); // Let the real panel entrance and scene resize finish before recording reader state.
    await js(`{const list=window.__chat.el.querySelector('.cp-list');list.scrollTop=list.scrollHeight*.45;window.__cameraStress.scrollBefore=list.scrollTop;window.__cameraStress.cameraBeforeScroll=window.__world.cameraState()}`);
    point = await position('.cp-list');
    const scroll = await phase('native-chat-scroll-with-updates', async () => {
      for (let i=0;i<100;i++) {
        wheel(point, Math.floor(i/25)%2 ? -40 : 40);
        if (i%20===0) { messages[messages.length-1]={...messages.at(-1),text:messages.at(-1).text+'\nStreaming revision '+i,streaming:true};setMessages(messages);await js('window.__chat.refresh()'); }
        await wait(8);
      }
    });
    result.chat = await js(`{const q=window.__cameraStress,c=window.__chat,list=c.el.querySelector('.cp-list');({before:q.scrollBefore,after:list.scrollTop,max:list.scrollHeight-list.clientHeight,shown:c.shown.size,latest:c.shown.get('stress-scroll-399')?.textContent.includes('Streaming revision 80'),cameraStayed:JSON.stringify(q.cameraBeforeScroll)===JSON.stringify(window.__world.cameraState())})}`);
    result.checks.chatStayedReadable = scroll.trustedWheelEvents > 20 && scroll.scrollRange > 500 && result.chat.shown === 400 && result.chat.latest && result.chat.after > 100 && result.chat.after < result.chat.max-100 && result.chat.cameraStayed;
    await js('window.__chat.close()'); await wait(650);
    await js(`{const q=window.__cameraStress;q.panel.scrollTop=(q.panel.scrollHeight-q.panel.clientHeight)*.4;q.sidebarCamera=window.__world.cameraState()}`);
    point = await position('#side-panel');
    const sidebar = await phase('native-sidebar-scroll', async () => {
      for(let i=0;i<100;i++){wheel(point,Math.floor(i/25)%2?-40:40);await wait(8)}
    });
    result.sidebar = await js(`{const q=window.__cameraStress;({scrollTop:q.panel.scrollTop,max:q.panel.scrollHeight-q.panel.clientHeight,cameraStayed:JSON.stringify(q.sidebarCamera)===JSON.stringify(window.__world.cameraState())})}`);
    result.checks.sidebarScrollIsolated = sidebar.trustedWheelEvents > 20 && sidebar.sidebarScrollRange > 100 && result.sidebar.cameraStayed;
    // Restore must update state, rather than install another set of input handlers.
    await js(`{const q=window.__cameraStress;window.__chat.close();q.center(1);q.restoreBefore=window.__world.cameraState();for(let i=0;i<6;i++)window.__world.restoreCamera(q.restoreBefore)}`);
    point = await position('.scene');
    const before = await js('window.__world.cameraState()');
    await js('window.__cameraStress.start("restore-wheel-response")'); wheel(point,-40); await wait(180);
    const restore = await js('window.__cameraStress.stop()');
    const after = await js('window.__world.cameraState()');
    result.restore = { before, after, events:restore.wheelEvents, logScaleRatio:Math.abs(Math.log(after.s/before.s)), expected: .06 };
    result.checks.restoreDoesNotMultiplyWheel = restore.wheelEvents === 1 && Math.abs(result.restore.logScaleRatio-.06) < .003;
    result.errors = await js('window.__cameraStress.errors');
    result.checks.noRendererErrors = result.errors.length === 0;
    result.passed = Object.values(result.checks).every(Boolean); save();
    if (!result.passed && !process.env.LUCID_STRESS_BASELINE) throw Error('Camera/scroll stress checks failed: '+Object.entries(result.checks).filter(([,v])=>!v).map(([k])=>k).join(', '));
    console.log('cameraStressChecks', JSON.stringify({checks:result.checks,phases:result.phases.map(({name,wheelEvents,cameraCommits,frames})=>({name,wheelEvents,cameraCommits,frames})),passed:result.passed}));
  } finally {
    if (point) wc.sendInputEvent({ type: 'mouseUp', button: 'middle', clickCount: 1, ...point });
    await js(`{const q=window.__cameraStress,w=window.__world;if(q){q.phase=null;cancelAnimationFrame(q.raf);q.observe.disconnect();document.removeEventListener('wheel',q.wheel,true);q.list.removeEventListener('scroll',q.scroll);q.panel.removeEventListener('scroll',q.panelScroll);window.removeEventListener('error',q.error);window.removeEventListener('unhandledrejection',q.error);w.apply=q.originalApply;window.__chat.close();window.__chat.api.conversationPage=q.conversationPage;w.setLayoutHeld(q.held);w.stopCameraMotion();w.cam=q.cam;w.apply();if(q.chat)window.__chat.open(q.chat,false);delete window.__cameraStress}}`).catch(()=>{});
    save();
  }
};
