// Reproducible Electron camera benchmark. Uses the app's LUCID_SHOT offscreen path.
// node scripts/render-profile.cjs <output-folder>
// LUCID_PERF_PAN=500 exercises cache renewal during longer pans (default 180 CSS px).
// LUCID_PERF_CHECKS=1 adds held-exit, complete handoff and zoom-resolution checks.
// LUCID_PERF_CHECKS_ONLY=1 skips the benchmark; LUCID_PERF_REPRO_ONLY=1 stops at the held exit.
// LUCID_PERF_CSS is an optional isolation experiment, never needed for the fixed renderer.
// LUCID_DEV_URL can point at an older build's file: URL for the same-input comparison.
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
  app.on("browser-window-created", (_e, win) => {
    win.webContents.once("did-finish-load", async () => {
      try {
        const wc = win.webContents, dbg = wc.debugger;
        dbg.attach("1.3");
        const js = (code) => wc.executeJavaScript(code);
        await wait(6500);
        if (process.env.LUCID_PERF_CSS) await js(`{const s=document.createElement('style');s.textContent=${JSON.stringify(process.env.LUCID_PERF_CSS)};document.head.append(s)}`);
        await dbg.sendCommand("Performance.enable");
        const results = [];
        for (const [name, scale, cx, cy] of (process.env.LUCID_PERF_CHECKS_ONLY ? [] : [["overview", 0.23, 2100, 850], ["office", 0.65, 2100, 480], ["close", 2, 1460, 430]])) {
          await js(`{const w=window.__world; w.stopFollow(); w.cam={s:${scale},x:w.scene.clientWidth/2-${cx}*${scale},y:w.scene.clientHeight/2-${cy}*${scale}}; w.apply();}`);
          await wait(1200);
          const trace = [];
          const onTrace = (_e, method, params) => { if (method === "Tracing.dataCollected") trace.push(...params.value); };
          dbg.on("message", onTrace);
          await dbg.sendCommand("Tracing.start", { transferMode: "ReportEvents", categories: "devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz,__metadata" });
          await dbg.sendCommand("Profiler.enable");
          await dbg.sendCommand("Profiler.start");
          const before = await dbg.sendCommand("Performance.getMetrics");
          await js(`window.__frames=[]; window.__record=true; {let last=performance.now(); const frame=t=>{if(!window.__record)return; window.__frames.push(t-last);last=t;requestAnimationFrame(frame)};requestAnimationFrame(frame)}`);
          const point = await js(`{const r=window.__world.scene.getBoundingClientRect(); ({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
          wc.sendInputEvent({ type: "mouseDown", button: "middle", clickCount: 1, ...point });
          const started = Date.now();
          while (Date.now() - started < 4000) {
            const t = (Date.now() - started) / 1000;
            wc.sendInputEvent({ type: "mouseMove", button: "middle", buttons: ["middle"], x: point.x + Math.round(Math.sin(t * 2.4) * Number(process.env.LUCID_PERF_PAN || 180)), y: point.y + Math.round(Math.sin(t * 3.2) * 80) });
            await wait(8);
          }
          wc.sendInputEvent({ type: "mouseUp", button: "middle", clickCount: 1, ...point });
          const after = await dbg.sendCommand("Performance.getMetrics");
          const { profile } = await dbg.sendCommand("Profiler.stop");
          const stats = await js(`{window.__record=false; const a=window.__frames.slice(1).sort((a,b)=>a-b); const w=window.__world; ({frames:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over33:a.filter(x=>x>33.4).length,desks:w.desks.size,walkers:document.querySelectorAll('.world-walker').length,scale:w.cam.s,errors:window.__errs})}`);
          const complete = new Promise((resolve) => {
            const listener = (_e, method) => {
              if (method !== "Tracing.tracingComplete") return;
              dbg.removeListener("message", listener); resolve();
            };
            dbg.on("message", listener);
          });
          await dbg.sendCommand("Tracing.end");
          await complete;
          dbg.removeListener("message", onTrace);
          const deltas = Object.fromEntries(after.metrics.filter((m) => /Duration|Count/.test(m.name)).map((m) => [m.name, m.value - (before.metrics.find((x) => x.name === m.name)?.value || 0)]));
          results.push({ name, ...stats, deltas });
          fs.writeFileSync(path.join(out, `${name}-trace.json`), JSON.stringify({ traceEvents: trace }));
          fs.writeFileSync(path.join(out, `${name}-cpu.json`), JSON.stringify(profile));
          await wait(500);
          fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
          console.log(JSON.stringify(results.at(-1)));
        }
        fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
        if (process.env.LUCID_PERF_CHECKS) await require("./render-checks.cjs")({ js, wc, wait, out, threads });
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
}
