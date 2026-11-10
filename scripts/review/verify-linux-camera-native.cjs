const fs = require('node:fs'), path = require('node:path');
const out = path.resolve(process.env.LUCID_NATIVE_OUT || process.argv[2] || '/tmp/lucid-linux-camera');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename, out], { env, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app } = require('electron');
  fs.mkdirSync(out, { recursive: true });
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = path.join(out, 'profile'); process.env.LUCID_SHOT_EVERY = '3600000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.resolve('dist-build/index.html')).href;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let seen = false;
  app.on('browser-window-created', (_event, win) => {
    if (seen) return; seen = true;
    win.webContents.once('did-finish-load', async () => {
      const wc = win.webContents, js = code => new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native check timed out: '+code.slice(0,100))),15000);wc.executeJavaScript(code).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})}), result = { checks: [], errors: [] };
      wc.on('render-process-gone', (_e, details) => result.errors.push(details));
      try {
        await wait(6000);
        result.gpu = { features: app.getGPUFeatureStatus(), info: await app.getGPUInfo('basic') };
        result.viewport = await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
        // A floor stays as original SVG throughout camera movement and cache completion.
        for (const scale of [.23, .65, 1, 2, .65, .23]) {
          await js(`{const w=window.__world;w.stopFollow();const r=w.rooms.find(r=>!r.collapsed);w.cam={s:${scale},x:w.scene.clientWidth/2-(r.x+r.w/2)*${scale},y:w.scene.clientHeight/2-(r.y+r.h/2)*${scale}};w.apply();undefined}`);
          await wait(500);
          const state = await js(`(()=>{const w=window.__world,f=[...document.querySelectorAll('[data-cache-live="floor"]')];return {scale:w.cam.s,floors:f.length,native:f.every(el=>!el.closest('[data-static-art]')&&el.childElementCount>0),errors:window.__errors||[]}})()`);
          if (!state.floors || !state.native) throw Error('Floor vectors entered the image cache at ' + scale);
          result.checks.push(state);
        }
        const compositing = await js(`(()=>{const w=window.__world;w.root.classList.add('overview','zooming');const r=w.root.querySelector('.room:not(.culled)');const out={world:getComputedStyle(w.root).willChange,willChange:getComputedStyle(r).willChange};w.root.classList.remove('zooming');return out})()`);
        if (compositing.world !== 'transform' || compositing.willChange !== 'transform') throw Error('Camera motion must keep the world and overview rooms as frozen GPU pictures');
        result.compositing = compositing;
        await js(`new Promise(resolve=>{const w=window.__world,base={...w.cam};let n=0;const frame=()=>{const s=.65+Math.sin(n/10)*.2;w.cam={s,x:base.x+Math.sin(n/7)*80,y:base.y+Math.cos(n/9)*40};w.apply();if(++n<120)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)})`);
        result.sidebar = [];
        for(const width of [260,300,420]) {
          await js(`document.querySelector('#app').style.setProperty('--side','${width}px')`);await wait(120);
          const layout=await js(`(()=>{
            const panel=document.querySelector('.panel'),p=panel.getBoundingClientRect(),rows=[...document.querySelectorAll('#th-list .th-row.th-worker:not(.mg-row)')];
            const rect=el=>el.getBoundingClientRect();
            return {width:p.width,overflow:panel.scrollWidth-panel.clientWidth,searchWidth:rect(document.querySelector('.th-search')).width,headerWidth:rect(document.querySelector('.th-head')).width,
              rows:rows.map(el=>{const r=rect(el),title=rect(el.querySelector('.th-title')),face=rect(el.querySelector('.mg-face')),meta=rect(el.querySelector('.th-top'));return {height:r.height,gap:title.left-face.right,faceAlignment:Math.abs(title.top-face.top),metaBelow:meta.top>=title.bottom-1}}),
              controlsFit:[...document.querySelectorAll('.th-head > *')].every(el=>{const r=rect(el);return r.left>=p.left&&r.right<=p.right}),
              emptyMetadata:document.querySelectorAll('#th-list .th-row:not(.mg-row) .th-bot').length};
          })()`);
          if(layout.overflow>1||!layout.controlsFit||Math.abs(layout.searchWidth-layout.headerWidth)>1||layout.emptyMetadata||layout.rows.some(r=>r.height>78||r.height<44||r.gap<8||r.faceAlignment>3||!r.metaBelow))throw Error('Sidebar spacing failed: '+JSON.stringify(layout));
          result.sidebar.push(layout);
          if(width===300)fs.writeFileSync(path.join(out,'sidebar.png'),(await wc.capturePage()).toPNG());
        }
        await js(`document.querySelector('#app').style.setProperty('--side','300px')`);
        result.monitorContinuity = await js(`(async()=>{
          const w=window.__world,d=[...w.desks.values()].find(d=>d.threadId);
          if(!d)throw Error('No visible desk for monitor continuity');d.el.classList.remove('arriving');
          const base={x:w.cam.x,y:w.cam.y,s:w.cam.s};w.cam={s:1,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200),y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+100)};w.apply();
          const probe=document.createElement('section');probe.className='win';probe.style.cssText='left:10px;top:10px;width:600px;height:350px;background:#202030;color:#ffffff';
          probe.innerHTML='<header class="win-bar">Rendering continuity</header><div class="win-body">'+Array.from({length:180},(_,i)=>'<p>Native content '+i+'</p>').join('')+'</div>';
          d.screen.querySelector('.win-layer').append(probe);
          const frame=()=>new Promise(r=>setTimeout(r,20));
          try {
            const body=probe.querySelector('.win-body'),coldVisible=getComputedStyle(body).visibility==='visible',text=getComputedStyle(body).webkitTextFillColor;
            if(!coldVisible||text==='rgba(0, 0, 0, 0)'||text==='transparent')throw Error('Cold monitor content disappeared before its first preview');
            for(let i=0;i<120&&!probe.dataset.detailReady;i++)await frame();
            const old=probe.querySelector(':scope > .screen-detail')?.firstChild;if(!old)throw Error('Monitor preview did not finish');
            probe.style.width='700px';await Promise.resolve();
            if(probe.querySelector(':scope > .screen-detail')?.firstChild!==old)throw Error('Resize cleared the visible preview');
            for(let i=0;i<120&&probe.querySelector(':scope > .screen-detail')?.firstChild===old;i++)await frame();
            if(probe.querySelector(':scope > .screen-detail')?.firstChild===old)throw Error('Monitor resize replacement stalled');
            return {coldSourceVisible:true,textVisible:true,resizeRetainedFrame:true,replacementCompleted:true};
          } finally {probe.remove();w.cam=base;w.apply()}
        })()`);
        result.terrainTransitions = await js(`new Promise((resolve,reject)=>{
          const w=window.__world,l=w.landscape,base={x:w.cam.x,y:w.cam.y,s:w.cam.s};let n=0,maxLevels=0;
          const frame=()=>{
            const s=[.45,.7,1.25,.65][Math.floor(n/20)%4];w.cam={s,x:80-Math.sin(n/12)*140,y:-700+Math.cos(n/15)*60};w.apply();
            const levels=new Set([...l.tiles.values()].filter(t=>t.shown).map(t=>t.level));maxLevels=Math.max(maxLevels,levels.size);
            if(levels.size>1){reject(Error('Terrain mixed sharp and blurry zoom levels'));return}
            if(++n<100)requestAnimationFrame(frame);else{w.cam=base;w.apply();resolve({frames:n,maxDisplayedLevels:maxLevels})}
          };requestAnimationFrame(frame);
        })`);
        await js(`{const w=window.__world;w.cam={s:.65,x:-300,y:-600};w.apply();undefined}`);await wait(1200);
        const panTrace=[], panTraceListener=(_e,method,params)=>{if(method==='Tracing.dataCollected')panTrace.push(...params.value)};
        if(process.env.LUCID_NATIVE_TRACE){wc.debugger.attach('1.3');wc.debugger.on('message',panTraceListener);await wc.debugger.sendCommand('Profiler.enable');await wc.debugger.sendCommand('Profiler.start');await wc.debugger.sendCommand('Tracing.start',{transferMode:'ReportEvents',categories:'devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,__metadata'})}
        result.panContinuity = await js(`new Promise((resolve,reject)=>{
          const w=window.__world,l=w.landscape,base={x:w.cam.x,y:w.cam.y,s:w.cam.s},samples=[];let start=0,last=0,drops=0;
          const frame=t=>{if(!start)start=t;const u=(t-start)/1000;
            w.cam={s:base.s,x:base.x+Math.sin(u*3.1)*700,y:base.y+Math.cos(u*2.7)*180};w.apply();
            if(last)samples.push(t-last);last=t;if(!l.metrics().shown)drops++;
            if(u<3)requestAnimationFrame(frame);else{w.cam=base;w.apply();samples.sort((a,b)=>a-b);if(drops)reject(Error('Panning blanked terrain on '+drops+' frames'));else resolve({frames:samples.length,detailDropFrames:drops,p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1)})}
          };requestAnimationFrame(frame);
        })`);
        if(process.env.LUCID_NATIVE_TRACE){
          fs.writeFileSync(path.join(out,'pan-cpu.json'),JSON.stringify((await wc.debugger.sendCommand('Profiler.stop')).profile));
          const complete=new Promise(resolve=>{const listener=(_e,method)=>{if(method==='Tracing.tracingComplete'){wc.debugger.removeListener('message',listener);resolve()}};wc.debugger.on('message',listener)});
          await wc.debugger.sendCommand('Tracing.end');await complete;
          fs.writeFileSync(path.join(out,'pan-trace.json'),JSON.stringify({traceEvents:panTrace}));wc.debugger.removeListener('message',panTraceListener);wc.debugger.detach();
        }
        result.terrainRecovery = await js(`(()=>{
          const l=window.__world.landscape;
          if([...l.tiles.values()].some(t=>t.canvas.width!==518||t.canvas.height!==518))throw Error('Terrain lacks guarded source pixels');
          const shown=[...l.tiles.values()].find(t=>t.shown);
          if(shown){shown.canvas.dispatchEvent(new Event('contextlost'));if(shown.shown)throw Error('Lost terrain backing stayed visible');shown.canvas.dispatchEvent(new Event('contextrestored'))}
          return {guarded:true,lostBackingHidden:true};
        })()`);
        result.sessions = await js(`(()=>{
          const w=window.__world,m=window.__monitorTasks,d=[...w.desks.values()].find(d=>d.threadId);
          if(!d)throw Error('No workstation for session continuity');
          const id=d.threadId,original=w.lastData,originalReady=m.actions.ready,originalRead=m.actions.read;
          const data={...original,threads:original.threads.map(t=>t.id===id?{...t,runStatus:'completed',question:null,settled:false}:t)};
          let read=null;
          try {
            m.actions.ready=()=>({summary:'Ready to continue',coins:'5'});m.actions.read=id=>{read=id};
            m.prepare(data);w.update(data);m.sync();
            const sameDesk=w.deskFor(id)===d,button=d.el.querySelector('[data-task-read]'),settle=d.el.querySelector('[data-task-collect]');
            if(!sameDesk||!button||!settle)throw Error('Completed session lost its desk or actions');
            button.click();
            if(read!==id||!settle.textContent.includes('Settle'))throw Error('Continuation did not open the same session');
            return {sameDesk,continuedSameThread:true,settlementExplicit:true};
          } finally {m.actions.ready=originalReady;m.actions.read=originalRead;m.prepare(original);w.update(original);m.sync()}
        })()`);
        result.afterStress = await js(`({floors:document.querySelectorAll('[data-cache-live="floor"]').length,cache:window.__staticArt.stats(),errors:window.__errors||[]})`);
        if (result.errors.length || result.afterStress.errors.length) throw Error('Renderer errors');
        await js(`{const w=window.__world;w.cam={s:.65,x:-340,y:-500};w.apply();undefined}`);
        await wait(1200);
        result.terrainDetail = await js(`(()=>{const l=window.__world.landscape;return {metrics:l.metrics(),displayed:[...new Set([...l.tiles.values()].filter(t=>t.shown).map(t=>t.level))],target:l.shownLevel}})()`);
        if(result.terrainDetail.displayed.length!==1||result.terrainDetail.displayed[0]!==result.terrainDetail.target)throw Error('Terrain failed to regain uniform sharp detail');
        fs.writeFileSync(path.join(out, 'camera.png'), (await wc.capturePage()).toPNG());
        result.ok = true;
        fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
        console.log('PASS: native floors across six zoom states, overview zoom compositing and 120 pan/zoom frames.');
        app.exit(0);
      } catch (error) {
        result.error = error.stack; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.error(error); app.exit(1);
      }
    });
  });
  // Stable read-only fixture: test availability must not depend on real agents
  // finishing or changing their sessions while native assertions are running.
  const t3=require('../../electron/t3.cjs'),stamp=new Date().toISOString();
  const data={projects:[{id:'visual-project',title:'Visual checks',root:out,scratch:false}],threads:Array.from({length:5},(_,i)=>({id:'visual-thread-'+i,projectId:'visual-project',title:['Install an Open-Source Authenticator','Fix Lucid Rendering Glitches','Separate KDE Sessions on CachyOS','Fix Still Browser Scrolling and Video Sync','CachyOS Linux Installation'][i],provider:'codex',model:null,runStatus:'running',updatedAt:stamp,pinned:false,settled:false,question:null})),models:{},prices:{},shipped:{total:0,today:0}};
  Object.assign(t3,{world:()=>structuredClone(data),watchThread:()=>()=>{},officeTasks:()=>[],coinBindings:()=>[],conversation:()=>[],conversationPage:()=>({messages:[],hasMore:false,cursor:null})});
  fs.mkdirSync(process.env.LUCID_SHOT_PROFILE,{recursive:true});fs.writeFileSync(path.join(process.env.LUCID_SHOT_PROFILE,'settings.json'),JSON.stringify({orch:null}));
  require('../../electron/main.cjs');
}
