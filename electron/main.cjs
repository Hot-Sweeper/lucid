const { app, BrowserWindow, ipcMain, shell, net, protocol } = require("electron");
if (process.argv.includes("--lucid-t3-connections")) {
  require("./t3-connections.cjs").runImporter();
  return;
}
const { pathToFileURL } = require("node:url");
const fsp = require("node:fs/promises");
const path = require("node:path");
const t3 = require("./t3.cjs");
const updater = require("./updater.cjs");

const DEV_URL = process.env.LUCID_DEV_URL;
if (process.env.LUCID_SHOT) {
  // Test runs get their own copy of the settings, so they never overwrite the real app's
  // (two apps saving the same file lose each other's changes, like the coin ledger).
  const real = app.getPath("userData");
  const test = path.join(app.getPath("temp"), "lucid-test-profile");
  require("node:fs").mkdirSync(test, { recursive: true });
  try { require("node:fs").copyFileSync(path.join(real, "settings.json"), path.join(test, "settings.json")); } catch {}
  app.setPath("userData", test);
  // keep animating even though the window is off-screen
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
}
let win = null;
const environments = require("./environments.cjs");
let environmentId = "local", remote = null;
const backend = () => remote || t3;
const scoped = (channel, fn) => ipcMain.handle(channel, (event, expected, ...args) => {
  if (expected !== environmentId) throw new Error("The building changed. Retry in the selected building.");
  return fn(event, ...args);
});
const watchers = new Map(); // threadId -> stop()

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#141a33",
    title: "Lucid",
    autoHideMenuBar: true,
    // debug screenshot runs render normally but off-screen, so they never pop up on you
    ...(process.env.LUCID_SHOT ? { x: -4000, y: -4000, skipTaskbar: true, focusable: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      backgroundThrottling: !process.env.LUCID_SHOT,
      sandbox: false,
    },
  });
  const query = {};
  if (process.env.LUCID_THREAD) query.thread = process.env.LUCID_THREAD;
  if (process.env.LUCID_PROJECT) query.project = process.env.LUCID_PROJECT;
  if (process.env.LUCID_IDLE_SCALE) query.idleScale = process.env.LUCID_IDLE_SCALE;
  if (DEV_URL) win.loadURL(DEV_URL + "?" + new URLSearchParams(query));
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
  // Debug aid: LUCID_TRACE=file records a 5 second performance trace (style, layout, paint,
  // compositing per frame) after 8 seconds, for chrome://tracing or a summary script.
  if (process.env.LUCID_TRACE) {
    const fs = require("node:fs");
    setTimeout(async () => {
      const dbg = win.webContents.debugger;
      dbg.attach("1.3");
      const chunks = [];
      dbg.on("message", async (_e, method, params) => {
        if (method === "Tracing.dataCollected") chunks.push(...params.value);
        if (method === "Tracing.tracingComplete") { fs.writeFileSync(process.env.LUCID_TRACE, JSON.stringify({ traceEvents: chunks })); app.quit(); }
      });
      await dbg.sendCommand("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink", "cc", "viz", "gpu", "__metadata"] } });
      setTimeout(() => dbg.sendCommand("Tracing.end"), 5000);
    }, 8000);
  }
  // Debug aid: LUCID_PROFILE=file records a 4 second CPU profile after 5 seconds.
  if (process.env.LUCID_PROFILE) {
    const fs = require("node:fs");
    setTimeout(async () => {
      const dbg = win.webContents.debugger;
      dbg.attach("1.3");
      await dbg.sendCommand("Profiler.enable");
      await dbg.sendCommand("Profiler.start");
      setTimeout(async () => {
        const { profile } = await dbg.sendCommand("Profiler.stop");
        fs.writeFileSync(process.env.LUCID_PROFILE, JSON.stringify(profile));
        app.quit();
      }, 4000);
    }, 5000);
  }
  // Debug aid: LUCID_SHOT=folder saves screenshots every few seconds.
  if (process.env.LUCID_SHOT) {
    const fs = require("node:fs");
    let n = 0;
    const max = Number(process.env.LUCID_SHOT_COUNT || 6);
    const every = Number(process.env.LUCID_SHOT_EVERY || 4000);
    const timer = setInterval(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(process.env.LUCID_SHOT, `shot-${String(++n).padStart(2, "0")}.png`), img.toPNG());
      if (process.env.LUCID_EVAL) {
        const out = await win.webContents.executeJavaScript(process.env.LUCID_EVAL).catch((e) => String(e));
        fs.appendFileSync(path.join(process.env.LUCID_SHOT, "eval.log"), `--- ${n}
${typeof out === "string" ? out : JSON.stringify(out, null, 1)}
`);
      }
      if (n >= max) { clearInterval(timer); if (process.env.LUCID_SHOT_QUIT) app.quit(); }
    }, every);
  }
  // links in chat messages open in the real browser; only web and mail links are allowed
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

ipcMain.handle("environments:list", () => environments.list());
ipcMain.handle("environments:select", async (_e, id) => {
  const next = id === "local" ? null : await environments.client(id);
  for (const stop of watchers.values()) stop(); watchers.clear();
  environmentId = id; remote = next;
  return { id, label: next?.connection.label || require("node:os").hostname() };
});
scoped("t3:projects", () => backend().listProjects());
scoped("t3:threads", () => backend().listThreads());
// Watch exactly this set of threads (one per desk in the open office).
scoped("t3:watch-set", (_e, ids) => {
  const context = environmentId;
  const want = new Set(ids);
  for (const [id, stop] of watchers) if (!want.has(id)) { stop(); watchers.delete(id); }
  for (const id of want) {
    if (watchers.has(id)) continue;
    watchers.set(id, backend().watchThread(
      id,
      (items, initial) => send("t3:items", { environmentId: context, threadId: id, items, initial }),
      (info) => send("t3:info", { environmentId: context, threadId: id, info }),
    ));
  }
  return true;
});
scoped("t3:office", (_e, projectId) => backend().office(projectId));
scoped("t3:offices", () => backend().listProjectsWithCounts());
scoped("project:add", (_e, o) => backend().addProject(o));
// --- orchestrator -----------------------------------------------------------------
const orch = require("./orchestrator.cjs");
const ORCH_DIR = path.join(require("node:os").homedir(), "T3 Projects", "Lucid Orchestrator");
// keep the orchestrator's instructions current (they gain new duties over time)
try { if (require("node:fs").existsSync(ORCH_DIR)) orch.ensureFolder(ORCH_DIR); } catch {}
scoped("orch:init", async (_e, { provider = "claudeAgent", model = "claude-sonnet-5-5" } = {}) => {
  if (remote) throw new Error("The orchestrator is managed in the local building.");
  const { dir } = orch.ensureFolder(ORCH_DIR);
  const norm = (s) => String(s || "").replace(/[\/]+$/, "").toLowerCase();
  let project = backend().listProjects().find((p) => norm(p.root) === norm(dir));
  if (!project) {
    await backend().addProject({ path: dir, title: "Lucid Orchestrator" });
    project = backend().listProjects().find((p) => norm(p.root) === norm(dir));
  }
  if (!project) throw new Error("T3 did not register the orchestrator folder as a project.");
  const intro = "You are now the Orchestrator for Lucid. Read CLAUDE.md and memory.md in this folder, then reply with two short lines: what you know about the user, and how you will help.";
  const { threadId } = await backend().startThread({ project: project.id, message: intro, provider, model });
  return { threadId, projectId: project.id, dir };
});
ipcMain.handle("orch:memory", () => orch.readMemory(ORCH_DIR));
ipcMain.handle("orch:dialogs", () => orch.readDialogs(ORCH_DIR));
ipcMain.handle("orch:dir", () => ORCH_DIR);
scoped("t3:user-messages", (_e, since, exclude) => remote ? [] : t3.userMessagesSince(since, exclude));
scoped("project:remove", (_e, o) => backend().removeProject(o));
ipcMain.handle("app:host", () => require("node:os").hostname());
ipcMain.handle("usage:get", () => require("./usage.cjs").getUsage());
// Files attached in the side chat are saved where agents can open them by path.
scoped("attach:save", async (_e, { name, data }) => {
  if (remote) return remote.saveAttachment(name, data);
  const dir = path.join(require("node:os").homedir(), ".t3", "userdata", "lucid-attachments");
  await fsp.mkdir(dir, { recursive: true });
  const safe = String(name || "file").replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
  const file = path.join(dir, `${Date.now()}-${safe}`);
  await fsp.writeFile(file, Buffer.from(data));
  return file;
});
ipcMain.handle("weather:get", async () => {
  const { getWeather, lastError } = require("./weather.cjs");
  const w = await getWeather();
  return { weather: w, error: w ? null : lastError() };
});
// Small settings file (hidden offices and such).
const SETTINGS = path.join(app.getPath("userData"), "settings.json");
ipcMain.on("settings:load", (e) => { try { e.returnValue = require("node:fs").readFileSync(SETTINGS, "utf8"); } catch { e.returnValue = "{}"; } });
ipcMain.handle("settings:save", (_e, json) => require("node:fs").promises.writeFile(SETTINGS, json));
// The robot team lives in a file so names, looks and habits survive restarts.
const rosterPath = () => path.join(app.getPath("userData"), environmentId === "local" ? "roster.json" : "roster-" + environmentId.replace(/[^a-zA-Z0-9-]/g, "_") + ".json");
ipcMain.on("roster:load", (e, expected) => { try { if (expected !== environmentId) throw new Error("Building changed"); e.returnValue = require("node:fs").readFileSync(rosterPath(), "utf8"); } catch { e.returnValue = "[]"; } });
scoped("roster:save", (_e, json) => require("node:fs").promises.writeFile(rosterPath(), json));
scoped("t3:conversation", (_e, id) => backend().conversation(id));
scoped("t3:pending-requests", (_e, id) => backend().pendingRequests(id));
scoped("t3:thread-info", (_e, id) => { try { return backend().threadInfo(id); } catch { return null; } });
scoped("t3:items-since", (_e, id, since) => (since ? backend().itemsSince(id, since) : backend().recentItems(id, 60)));
scoped("t3:attach-dir", () => remote ? "" : require("node:path").join(process.env.T3CODE_HOME || require("node:path").join(require("node:os").homedir(), ".t3"), "userdata", "attachments") + require("node:path").sep);
scoped("t3:world", () => backend().world());
scoped("t3:start", (_e, opts) => backend().startThread(opts));
scoped("t3:send", (_e, opts) => backend().sendMessage(opts));

// Fetch a page the agent visited so the robot's browser can show its real title and text.
ipcMain.handle("web:peek", async (_e, url) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await net.fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 Lucid" } });
    clearTimeout(timer);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("html")) return { ok: true, title: url, text: [], type };
    const html = (await res.text()).slice(0, 400000);
    const pick = (re) => (html.match(re)?.[1] || "").replace(/\s+/g, " ").trim();
    const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&bull;/g, "•").replace(/&mdash;/g, ",").replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    const title = decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    const description = decode(pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i));
    // Read the article, not the site chrome: start at <main>, <article> or Wikipedia's content
    // block when there is one, drop nav, header, footer and sidebars, and skip one-word links.
    const start = ["<main", "<article", 'id="mw-content-text"', 'id="content"', 'role="main"'].map((k) => html.indexOf(k)).filter((i) => i >= 0);
    let body = start.length ? html.slice(Math.min(...start)) : html;
    body = body.replace(/<(nav|header|footer|aside|script|style|noscript|form)\b[\s\S]*?<\/\1>/gi, " ");
    // sidebars, info boxes and navboxes are tables (often nested): peel them away
    for (let i = 0, prev = ""; i < 6 && prev !== body; i++) { prev = body; body = body.replace(/<table\b(?:(?!<table\b)[\s\S])*?<\/table>/gi, " "); }
    const blocks = [];
    const re = /<(h1|h2|h3|p|li|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(body)) && blocks.length < 40) {
      const tag = m[1].toLowerCase();
      const text = decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (text.length < 3 || (tag === "li" && text.split(" ").length < 4) || (tag === "p" && text.length < 25)) continue;
      blocks.push({ tag, text: text.slice(0, 400) });
    }
    // an article reads from its first paragraph; list pages (news feeds) keep their items
    const firstP = blocks.findIndex((b) => b.tag === "p");
    if (firstP > 0 && blocks.filter((b) => b.tag === "p").length >= 3) blocks.splice(0, firstP);
    return { ok: true, title, description, blocks };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// GitHub, Hugging Face and Wikipedia data, web search results and read-only git facts.
require("./sites.cjs").register({ handle: (channel, fn) => channel === "git:info" ? scoped(channel, (e, root) => remote ? remote.gitInfo(root) : fn(e, root)) : ipcMain.handle(channel, fn) }, (url, opts) => net.fetch(url, opts));

// Images the agent looked at, sent as data URLs (common image types only, max 12 MB).
scoped("fs:image", async (_e, p) => {
  try {
    if (remote) return remote.readImage(p);
    const fs = require("node:fs/promises");
    const ext = path.extname(p).toLowerCase().slice(1);
    const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
    if (!types[ext]) return null;
    const st = await fs.stat(p);
    if (st.size > 12 * 1024 * 1024) return null;
    return `data:${types[ext]};base64,${(await fs.readFile(p)).toString("base64")}`;
  } catch {
    return null;
  }
});

// Text of a file the agent created or changed (max 400 KB), shown in the robot's editor.
scoped("fs:text", async (_e, p) => {
  try {
    if (remote) return remote.readText(p);
    const fs = require("node:fs/promises");
    const st = await fs.stat(p);
    if (!st.isFile() || st.size > 400 * 1024) return null;
    const buf = await fs.readFile(p);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
});

ipcMain.handle("app:check-update", () => updater.check());
ipcMain.handle("app:apply-update", async () => {
  try {
    await updater.apply((step) => send("app:update-step", step));
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle("app:version", () => app.getVersion());

// lucid-file://local/<encoded path> serves images and text files the agents worked with,
// so the robots' screens and the chat can show them. Only known media and text types.
protocol.registerSchemesAsPrivileged([{ scheme: "lucid-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const SERVE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"]);

app.whenReady().then(() => {
  protocol.handle("lucid-file", async (req) => {
    try {
      const file = decodeURIComponent(new URL(req.url).pathname.slice(1));
      if (remote && file.startsWith("t3-attachment:")) return await remote.mediaResponse(file) || new Response("missing", { status: 404 });
      if (!SERVE.has(path.extname(file).toLowerCase())) return new Response("not allowed", { status: 403 });
      if (remote) { const response = await remote.mediaResponse(file); return response || new Response("missing", { status: 404 }); }
      await fsp.access(file);
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("missing", { status: 404 });
    }
  });
  createWindow();
});
app.on("window-all-closed", () => app.quit());

// --- T3 server (paired session): queue edits and model changes ------------------
// Handlers answer { ok, value } or { ok: false, error } so the renderer gets a clean message.
const t3s = require("./t3server.cjs");
const t3sWrap = (fn) => async (_e, ...args) => {
  try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: String(err?.message || err), code: err?.code || null }; }
};
scoped("t3s:status", t3sWrap((o) => remote ? remote.status(o || {}) : t3s.status(o || {})));
scoped("t3s:providers", t3sWrap((o) => remote ? remote.listProviders() : t3s.listProviders(o || {})));
scoped("t3s:reorder", t3sWrap((o) => remote ? remote.rpc.dispatch({ type: "queued-run.reorder", threadId: o.threadId, runId: o.runId, beforeRunId: o.beforeRunId ?? null }) : t3s.reorderQueued(o.threadId, o.runId, o.beforeRunId ?? null)));
scoped("t3s:cancel", t3sWrap((o) => remote ? remote.rpc.dispatch({ type: "queued-run.cancel", threadId: o.threadId, runId: o.runId }) : t3s.cancelQueued(o.threadId, o.runId)));
scoped("t3s:edit", t3sWrap((o) => remote ? remote.rpc.dispatch({ type: "queued-run.edit", threadId: o.threadId, runId: o.runId, text: o.text }) : t3s.editQueued(o.threadId, o.runId, o.text)));
scoped("t3s:steer", t3sWrap((o) => remote ? remote.rpc.dispatch({ type: "queued-message.promote-to-steer", threadId: o.threadId, queuedRunId: o.queuedRunId, targetRunId: o.targetRunId }) : t3s.steerNow(o.threadId, o.queuedRunId, o.targetRunId)));
scoped("t3s:setModel", t3sWrap((o) => remote ? remote.setModel(o.threadId, o.selection) : t3s.setThreadModel(o.threadId, o.selection)));
scoped("t3s:respond", t3sWrap((o) => remote ? remote.respond(o.threadId, o.requestId, o) : t3s.respondToRequest(o.threadId, o.requestId, o)));
app.on("before-quit", () => { t3s.closeSock(); environments.close(); for (const stop of watchers.values()) stop(); });

// Office documents the agents wrote (docx, xlsx, pptx, csv...), read for the robots' office apps.
require("./office.cjs").register({ handle: (channel, fn) => scoped(channel, (e, p) => remote ? remote.readDoc(p) : fn(e, p)) });
