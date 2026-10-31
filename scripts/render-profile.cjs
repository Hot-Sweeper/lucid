// Reproducible Electron camera benchmark. Uses the app's LUCID_SHOT offscreen path.
// node scripts/render-profile.cjs <output-folder>
// LUCID_PERF_PAN=500 exercises cache renewal during longer pans (default 180 CSS px).
// LUCID_PERF_CHECKS=1 adds held-exit, complete handoff and zoom-resolution checks.
// LUCID_PERF_CHECKS_ONLY=1 skips the benchmark; LUCID_PERF_REPRO_ONLY=1 stops at the held exit.
// LUCID_PERF_CSS is an optional isolation experiment, never needed for the fixed renderer.
// LUCID_DEV_URL can point at an older build's file: URL for the same-input comparison.
// LUCID_PERF_SUITE=1 adds idle, crowded, close, pan, 18 real desk apps, chat and rain.
// LUCID_PERF_TRACE=0 measures without profiling; LUCID_PERF_CPU=4 applies CDP CPU slowdown.
// LUCID_PERF_METRICS=1 records system JS costs; LUCID_PERF_SCENES selects comma-separated names.
// LUCID_SYSTEM_CHECKS=1 verifies pause/resume, covered windows, chat cache and HUD controls.
const fs = require("node:fs");
const path = require("node:path");
if (!process.versions.electron) {
  const out = path.resolve(process.argv[2] || "render-profile");
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, LUCID_SHOT: out, LUCID_SHOT_EVERY: "3600000" };
  delete env.ELECTRON_RUN_AS_NODE;
  require("node:child_process").spawn(require("electron"), [__filename, out], { env, stdio: "inherit" })
    .on("exit", (code) => process.exit(code ?? 1));
} else {
  const { app, ipcMain } = require("electron");
  const out = process.argv[2];
  // The existing screenshot path derives its isolated profile from app.getPath("temp").
  // Give each run a fresh one, including its roster, to avoid cross-run state and cache locks.
  app.setPath("temp", out);
  if(process.env.LUCID_REAL_WORLD === "1") {
    const actual=path.join(app.getPath('appData'),'lucid');
    app.setPath('userData',actual);
    const profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});
    try{fs.copyFileSync(path.join(actual,'roster.json'),path.join(profile,'roster.json'));}catch{}
    process.env.LUCID_SHOT_PROFILE=profile;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const projects = Array.from({ length: 4 }, (_, i) => ({ id: `perf-p${i}`, title: `Rendering ${i + 1}`, root: `C:/perf/${i}`, icon: null, scratch: false }));
  const threads = Array.from({ length: 31 }, (_, i) => ({
    id: `perf-t${i}`, projectId: projects[i % 4].id, title: `Robot ${i + 1}`,
    updatedAt: new Date().toISOString(), provider: i % 2 ? "codex" : "claudeAgent",
    runStatus: i < 18 ? "running" : null, pinned: i < 6, settled: i >= 18 && i < 26,
    question: i >= 26 ? "Can you review this change?" : null, model: null,
  }));
  let messages = Array.from({length:200},(_,i)=>({id:`perf-msg${i}`,role:i%2?'assistant':'user',at:new Date(1800000000000+i*1000).toISOString(),streaming:false,text:`Message ${i}: **Rendering update**\n\n${'A paragraph about the office and the measured frame budget. '.repeat(4)}\n\n\`\`\`ts\nconst frame = 16.7;\n\`\`\``,attachments:[]}));
  let profilingWindow = false;
  app.on("browser-window-created", (_e, win) => {
    // Real browser previews create short-lived capture windows. Profile only Lucid.
    if (profilingWindow) return;
    profilingWindow = true;
    win.webContents.once("did-finish-load", async () => {
      try {
        const wc = win.webContents, dbg = wc.debugger;
        dbg.attach("1.3");
        const js = async (code) => {
          try { return await wc.executeJavaScript(code); }
          catch (error) { console.error("Failed fixture expression:", code.slice(0, 200)); throw error; }
        };
        await wait(6500);
        if (process.env.LUCID_REAL_WORLD !== "1") await js("window.__chat.api.conversationPage=undefined");
        if (process.env.LUCID_STATIC_ART_OFF) await js("window.__staticArt.enable(false)");
        if (process.env.LUCID_CAMERA_NO_GATE) await js("{const w=window.__world;w.flushCamera=()=>{w.applyQueued=0;w.apply();w.keepFocus()};void 0}");
        if (process.env.LUCID_PERF_CSS) await js(`{const s=document.createElement('style');s.textContent=${JSON.stringify(process.env.LUCID_PERF_CSS)};document.head.append(s)}`);
        if (process.env.LUCID_CAMERA_APPS) {
          await js(`{let i=0;for(const d of window.__world.desks.values()){d.wm.speed=20;void d.director.idleLife.doActivity(['blockcraft','nightshift','botcom','boot','botflix','tensorhub'][i++%6],d.director.idleLife.token).catch(e=>{if(e.constructor.name!=='Cancelled')console.error(e)})}}`);
          await wait(6000);
        }
        await dbg.sendCommand("Performance.enable");
        if (process.env.LUCID_PERF_CPU) await dbg.sendCommand("Emulation.setCPUThrottlingRate", { rate: Number(process.env.LUCID_PERF_CPU) });
        const suite = process.env.LUCID_PERF_SUITE, real = process.env.LUCID_REAL_WORLD === "1";
        let scenes = real ? [["overview",0,0,0],["panning",0,0,0],["office",.65,0,0],["close",2,0,0],["chat",2,0,0],["rain",0,0,0]] : suite ? [["idle", .65, 2100, 480], ["many", .23, 2100, 850], ["zoomed", 2, 1460, 430], ["panning", .65, 2100, 480], ["apps-many", .65, 2100, 480], ["apps-far", .23, 2100, 850], ["apps-close", 2, 1460, 430], ["chat", 2, 1460, 430], ["rain", .65, 2100, 480]] : [["overview", .23, 2100, 850], ["office", .65, 2100, 480], ["close", 2, 1460, 430]];
        if (process.env.LUCID_CAMERA_SUITE) scenes = [["drag-overview",0,0,0],["drag-far",.23,0,0],["drag-office",.65,0,0],["drag-close",2,0,0]];
        if (process.env.LUCID_PERF_SCENES) scenes = scenes.filter(([name]) => process.env.LUCID_PERF_SCENES.split(",").includes(name));
        const tracing = process.env.LUCID_PERF_TRACE !== "0";
        let layerNodes=[];
        if(process.env.LUCID_LAYER_CHECKS){dbg.on('message',(_e,m,p)=>{if(m==='LayerTree.layerTreeDidChange')layerNodes=p.layers||[]});await dbg.sendCommand('LayerTree.enable');}
        let chatTimer, appsStarted = false;
        const results = [];
        for (const [name, scale, cx, cy] of (process.env.LUCID_PERF_CHECKS_ONLY ? [] : scenes)) {
          if ((name === "apps-many" || name === "apps-far") && !appsStarted) {
            appsStarted = true;
            await js(`{let i=0;for(const d of window.__world.desks.values()){d.wm.speed=20;void d.director.idleLife.doActivity(['blockcraft','nightshift','botcom','boot','botflix','tensorhub'][i++%6],d.director.idleLife.token).catch(e=>{if(e.constructor.name!=='Cancelled')console.error(e)})}}`);
            await wait(6000);
          }
          if (name === "chat") { await js(`window.__chat.open(window.__world.desks.values().next().value)`); chatTimer = setInterval(() => { void js("window.__chat.refresh()"); }, 750); }
          if (name === "rain") { clearInterval(chatTimer); await js(`{window.__chat.close();const w=window.__world;w.weather={...w.weather,kind:'rain',rainMm:3};w.daylight();}`); }
          if(!scale) await js(`{const w=window.__world,p=w.outdoor?.park,right=p?p.x+p.w:w.size.w;w.stopFollow();w.unfocus(false);w.frame=null;w.cam=w.fitTarget({x:-120,y:-170,w:right+240,h:Math.max(w.size.h,p?p.y+p.h:0)+290},20,w.scene.clientWidth,w.scene.clientHeight);w.apply()}`);
          else await js(`{const w=window.__world,d=${real ? "[...w.desks.values()].find(d=>!d.el.classList.contains('arriving'))||w.desks.values().next().value" : "w.desks.get('perf-t0')"}; w.stopFollow();
            const close=${JSON.stringify(real || !!process.env.LUCID_CAMERA_SUITE || ["zoomed", "apps-close", "chat"].includes(name))};
            const r=w.rooms.find(r=>r.kind==='main'&&!r.collapsed)||w.rooms.find(r=>r.kind==='project'&&!r.collapsed)||w.rooms[0];
            const cx=close?(d?parseFloat(d.el.style.left)+200:r.x+r.w/2):${cx},cy=close?(d?parseFloat(d.el.style.top)+100:r.y+r.h/2):${cy};
            w.cam={s:${scale},x:w.scene.clientWidth/2-cx*${scale},y:w.scene.clientHeight/2-cy*${scale}}; w.apply();}`);
          await wait(1200);
          if (process.env.LUCID_PERF_METRICS) await js("window.__lucidPerf?.enable(true);window.__lucidPerf?.reset()");
          const trace = [];
          const onTrace = (_e, method, params) => { if (method === "Tracing.dataCollected") trace.push(...params.value); };
          dbg.on("message", onTrace);
          if (tracing) {
            await dbg.sendCommand("Tracing.start", { transferMode: "ReportEvents", categories: "devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,__metadata" });
            await dbg.sendCommand("Profiler.enable");
            await dbg.sendCommand("Profiler.start");
          }
          const before = await dbg.sendCommand("Performance.getMetrics");
          await js(`window.__frames=[]; window.__record=true; {let last=performance.now(); const frame=t=>{if(!window.__record)return; window.__frames.push(t-last);last=t;requestAnimationFrame(frame)};requestAnimationFrame(frame)}`);
          const point = await js(`{const r=window.__world.scene.getBoundingClientRect(); ({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
          const pan = name.startsWith("drag-") || (real ? name === "panning" : !suite || name === "panning");
          if (pan) await js(`{window.__cameraCommits=[];window.__cameraLatency=[];window.__cameraPointerAt=0;window.__cameraMove=()=>{window.__cameraPointerAt=performance.now()};window.addEventListener('pointermove',window.__cameraMove,true);let prior=window.__world.root.style.transform,last=0;window.__cameraObserver=new MutationObserver(()=>{const next=window.__world.root.style.transform;if(next===prior)return;prior=next;const now=performance.now();if(last)window.__cameraCommits.push(now-last);last=now;if(window.__cameraPointerAt)window.__cameraLatency.push(now-window.__cameraPointerAt)});window.__cameraObserver.observe(window.__world.root,{attributes:true,attributeFilter:['style']})}`);
          if (pan) wc.sendInputEvent({ type: "mouseDown", button: "middle", clickCount: 1, ...point });
          const started = Date.now();
          while (Date.now() - started < 4000) {
            const t = (Date.now() - started) / 1000;
            if (pan) wc.sendInputEvent({ type: "mouseMove", button: "middle", modifiers: ["middlebuttondown"], x: point.x + Math.round(Math.sin(t * 2.4) * Number(process.env.LUCID_PERF_PAN || 180)), y: point.y + Math.round(Math.sin(t * 3.2) * 80) });
            await wait(8);
          }
          if (pan) wc.sendInputEvent({ type: "mouseUp", button: "middle", clickCount: 1, ...point });
          const after = await dbg.sendCommand("Performance.getMetrics");
          const profile = tracing ? (await dbg.sendCommand("Profiler.stop")).profile : null;
          const stats = await js(`{window.__record=false; const a=window.__frames.slice(1).sort((a,b)=>a-b); const w=window.__world; ({frames:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over33:a.filter(x=>x>33.4).length,desks:w.desks.size,projects:w.lastData?.projects.length,dom:document.querySelectorAll('*').length,svg:document.querySelectorAll('svg *').length,hidden:document.hidden,walkers:document.querySelectorAll('.world-walker').length,canvases:document.querySelectorAll('canvas').length,scale:w.cam.s,systems:window.__lucidPerf?.snapshot(),errors:window.__errs})}`);
          if ((name === "apps-close" || name === "apps-far") && (!stats.systems?.systems.apps.calls || !await js(`!!window.__world.desks.get('perf-t0').wm.wins.get('game')?.body.children.length`))) throw Error(`${name} must measure actual live game content`);
          if (tracing) {
          const complete = new Promise((resolve) => {
            const listener = (_e, method) => {
              if (method !== "Tracing.tracingComplete") return;
              dbg.removeListener("message", listener); resolve();
            };
            dbg.on("message", listener);
          });
          await dbg.sendCommand("Tracing.end");
          await complete;
          }
          dbg.removeListener("message", onTrace);
          const deltas = Object.fromEntries(after.metrics.filter((m) => /Duration|Count/.test(m.name)).map((m) => [m.name, m.value - (before.metrics.find((x) => x.name === m.name)?.value || 0)]));
          stats.staticArt = await js("window.__staticArt?.stats()");
          if (pan) stats.camera = await js(`{window.__cameraObserver.disconnect();window.removeEventListener('pointermove',window.__cameraMove,true);const stats=a=>{a.sort((x,y)=>x-y);return{count:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1),over33:a.filter(n=>n>33.4).length}};({commits:stats(window.__cameraCommits),inputLatency:stats(window.__cameraLatency)})}`);
          results.push({ name, ...stats, deltas });
          if (tracing) {
            fs.writeFileSync(path.join(out, `${name}-trace.json`), JSON.stringify({ traceEvents: trace }));
            fs.writeFileSync(path.join(out, `${name}-cpu.json`), JSON.stringify(profile));
          }
          await wait(500);
          fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
          if(process.env.LUCID_LAYER_CHECKS&&name==='overview'){
            const details=[];
            for(const layer of layerNodes.filter(l=>l.drawsContent).sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,25)){
              let node=null;
              if(layer.backendNodeId){const r=await dbg.sendCommand('DOM.describeNode',{backendNodeId:layer.backendNodeId,depth:0}).catch(()=>null);if(r){const a=r.node.attributes||[],attrs={};for(let i=0;i<a.length;i+=2)if(['class','id'].includes(a[i]))attrs[a[i]]=a[i+1];node={tag:r.node.nodeName,...attrs}}}
              details.push({width:layer.width,height:layer.height,node,reasons:(await dbg.sendCommand('LayerTree.compositingReasons',{layerId:layer.layerId}).catch(()=>null))?.compositingReasons});
            }
            fs.writeFileSync(path.join(out,'largest-layers.json'),JSON.stringify(details,null,2));
          }
          console.log(JSON.stringify(results.at(-1)));
        }
        fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
        if (process.env.LUCID_PERF_CHECKS) await require("./render-checks.cjs")({ js, wc, wait, out, threads });
        if (process.env.LUCID_SYSTEM_CHECKS) {
          await js("window.__lucidPerf.enable(false)");
          await require("./render-system-checks.cjs")({ js, wc, wait, out, setMessages: (next) => { messages = next; } });
        }
        if (process.env.LUCID_BEHAVIOR_CHECKS) await require("./render-behavior-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_SCREEN_DETAILS_CHECKS) await require("./render-screen-details-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_FLOOR_CHECKS) await require("./render-floor-checks.cjs")({ js, out });
        if (process.env.LUCID_PREFERENCE_CHECKS) await require("./render-preference-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_INTERACTION_CHECKS) await require("./render-interaction-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_VIEWPORT_CHECKS) await require("./render-viewport-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_STATIC_ART_CHECKS) await require("./render-static-art-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_COMPACT_CHECKS) {
          const compact = await require("./compact-layout-checks.cjs")({ js });
          fs.writeFileSync(path.join(out, "compact-layout-checks.json"), JSON.stringify(compact, null, 2));
          console.log("compactLayoutChecks", JSON.stringify(compact));
        }
        if (process.env.LUCID_HISTORY_CHECKS) await require("./render-history-pagination-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_CAMERA_CHECKS) await require("./render-camera-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_ROOM_CHECKS) await require("./render-room-arrangement-checks.cjs")({ js, wc, wait, out });
        if (process.env.LUCID_ACTIVITY_CHECKS) {
          const result = await require("./activity-room-checks.cjs")({ js, wc, wait, out });
          fs.writeFileSync(path.join(out, "activity-room-checks.json"), JSON.stringify(result, null, 2));
          console.log("activityRoomChecks", JSON.stringify(result));
        }
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    });
  });
  require("../electron/main.cjs");
  // Isolated fixture, with no real thread subscriptions or writes to T3.
  if(process.env.LUCID_REAL_WORLD !== "1") {
  ipcMain.removeHandler("t3:world");
  ipcMain.handle("t3:world", () => ({ projects, threads }));
  ipcMain.removeHandler("t3:watch-set");
  ipcMain.handle("t3:watch-set", () => true);
  ipcMain.removeHandler("t3:conversation");
  ipcMain.handle("t3:conversation", () => messages);
  }
}
