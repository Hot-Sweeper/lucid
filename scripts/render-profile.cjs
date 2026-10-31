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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const projects = Array.from({ length: 4 }, (_, i) => ({ id: `perf-p${i}`, title: `Rendering ${i + 1}`, root: `C:/perf/${i}`, icon: null, scratch: false }));
  const threads = Array.from({ length: 31 }, (_, i) => ({
    id: `perf-t${i}`, projectId: projects[i % 4].id, title: `Robot ${i + 1}`,
    updatedAt: new Date().toISOString(), provider: i % 2 ? "codex" : "claudeAgent",
    runStatus: null, pinned: i < 6, settled: i >= 18 && i < 26,
    question: i >= 26 ? "Can you review this change?" : null, model: null,
  }));
  let messages = Array.from({length:200},(_,i)=>({id:`perf-msg${i}`,role:i%2?'assistant':'user',at:new Date(1800000000000+i*1000).toISOString(),streaming:false,text:`Message ${i}: **Rendering update**\n\n${'A paragraph about the office and the measured frame budget. '.repeat(4)}\n\n\`\`\`ts\nconst frame = 16.7;\n\`\`\``,attachments:[]}));
  app.on("browser-window-created", (_e, win) => {
    win.webContents.once("did-finish-load", async () => {
      try {
        const wc = win.webContents, dbg = wc.debugger;
        dbg.attach("1.3");
        const js = (code) => wc.executeJavaScript(code);
        await wait(6500);
        if (process.env.LUCID_PERF_CSS) await js(`{const s=document.createElement('style');s.textContent=${JSON.stringify(process.env.LUCID_PERF_CSS)};document.head.append(s)}`);
        await dbg.sendCommand("Performance.enable");
        if (process.env.LUCID_PERF_CPU) await dbg.sendCommand("Emulation.setCPUThrottlingRate", { rate: Number(process.env.LUCID_PERF_CPU) });
        const suite = process.env.LUCID_PERF_SUITE;
        let scenes = suite ? [["idle", .65, 2100, 480], ["many", .23, 2100, 850], ["zoomed", 2, 1460, 430], ["panning", .65, 2100, 480], ["apps-many", .65, 2100, 480], ["apps-close", 2, 1460, 430], ["chat", 2, 1460, 430], ["rain", .65, 2100, 480]] : [["overview", .23, 2100, 850], ["office", .65, 2100, 480], ["close", 2, 1460, 430]];
        if (process.env.LUCID_PERF_SCENES) scenes = scenes.filter(([name]) => process.env.LUCID_PERF_SCENES.split(",").includes(name));
        const tracing = process.env.LUCID_PERF_TRACE !== "0";
        let chatTimer;
        const results = [];
        for (const [name, scale, cx, cy] of (process.env.LUCID_PERF_CHECKS_ONLY ? [] : scenes)) {
          if (name === "apps-many") {
            await js(`{let i=0;for(const d of window.__world.desks.values()){d.wm.speed=20;void d.director.idleLife.doActivity(['blockcraft','nightshift','botcom','boot','botflix','tensorhub'][i++%6],d.director.idleLife.token).catch(e=>{if(e.constructor.name!=='Cancelled')console.error(e)})}}`);
            await wait(6000);
          }
          if (name === "chat") { await js(`window.__chat.open(window.__world.desks.values().next().value)`); chatTimer = setInterval(() => { void js("window.__chat.refresh()"); }, 750); }
          if (name === "rain") { clearInterval(chatTimer); await js(`{window.__chat.close();const w=window.__world;w.weather={...w.weather,kind:'rain',rainMm:3};w.daylight();}`); }
          await js(`{const w=window.__world; w.stopFollow(); w.cam={s:${scale},x:w.scene.clientWidth/2-${cx}*${scale},y:w.scene.clientHeight/2-${cy}*${scale}}; w.apply();}`);
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
          const pan = !suite || name === "panning";
          if (pan) wc.sendInputEvent({ type: "mouseDown", button: "middle", clickCount: 1, ...point });
          const started = Date.now();
          while (Date.now() - started < 4000) {
            const t = (Date.now() - started) / 1000;
            if (pan) wc.sendInputEvent({ type: "mouseMove", button: "middle", buttons: ["middle"], x: point.x + Math.round(Math.sin(t * 2.4) * Number(process.env.LUCID_PERF_PAN || 180)), y: point.y + Math.round(Math.sin(t * 3.2) * 80) });
            await wait(8);
          }
          if (pan) wc.sendInputEvent({ type: "mouseUp", button: "middle", clickCount: 1, ...point });
          const after = await dbg.sendCommand("Performance.getMetrics");
          const profile = tracing ? (await dbg.sendCommand("Profiler.stop")).profile : null;
          const stats = await js(`{window.__record=false; const a=window.__frames.slice(1).sort((a,b)=>a-b); const w=window.__world; ({frames:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over33:a.filter(x=>x>33.4).length,desks:w.desks.size,walkers:document.querySelectorAll('.world-walker').length,canvases:document.querySelectorAll('canvas').length,scale:w.cam.s,systems:window.__lucidPerf?.snapshot(),errors:window.__errs})}`);
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
          results.push({ name, ...stats, deltas });
          if (tracing) {
            fs.writeFileSync(path.join(out, `${name}-trace.json`), JSON.stringify({ traceEvents: trace }));
            fs.writeFileSync(path.join(out, `${name}-cpu.json`), JSON.stringify(profile));
          }
          await wait(500);
          fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
          console.log(JSON.stringify(results.at(-1)));
        }
        fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
        if (process.env.LUCID_PERF_CHECKS) await require("./render-checks.cjs")({ js, wc, wait, out, threads });
        if (process.env.LUCID_SYSTEM_CHECKS) {
          await js("window.__lucidPerf.enable(false)");
          await require("./render-system-checks.cjs")({ js, wc, wait, out, setMessages: (next) => { messages = next; } });
        }
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    });
  });
  require("../electron/main.cjs");
  // Isolated fixture, with no real thread subscriptions or writes to T3.
  ipcMain.removeHandler("t3:world");
  ipcMain.handle("t3:world", () => ({ projects, threads }));
  ipcMain.removeHandler("t3:watch-set");
  ipcMain.handle("t3:watch-set", () => true);
  ipcMain.removeHandler("t3:conversation");
  ipcMain.handle("t3:conversation", () => messages);
}
