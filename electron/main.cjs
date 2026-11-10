const { app, BrowserWindow, ipcMain, shell, net, protocol, nativeImage } = require("electron");
// One data folder whatever the product is called, shared by source checkouts and installed builds.
app.setPath("userData", require("node:path").join(app.getPath("appData"), "lucid"));
app.setName(require("./brand.cjs").name);
if (process.platform === "win32") app.setAppUserModelId(require("./brand.cjs").appId);
if (app.isPackaged) void require("./shell-path.cjs").loadShellPath();
// Screenshot runs use isolated profiles. Normal launches share one office process.
if (!process.env.LUCID_SHOT && !app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
const { pathToFileURL } = require("node:url");
const fsp = require("node:fs/promises");
const path = require("node:path");
const t3 = require("./t3.cjs");
const brand = require("./brand.cjs");
// Installed builds update from GitHub Releases; source checkouts through the coordinated git updater.
const updater = app.isPackaged ? require("./packaged-updater.cjs").createPackagedUpdater({ app, shell, net }) : require("./updater.cjs");
require("./gpu-fallback.cjs").install(app);
// Chromium often cannot read video memory on Linux and falls back to a small tile budget.
// At 4K with Lucid's layers that ran out ("tile memory limits exceeded"): tiles were skipped,
// so the night tint, monitors and rooms blinked or went missing in blocks while zooming.
// Chromium's middle-click autoscroll showed its scroll marker over panels and monitors; the middle
// button pans the office camera instead (office/world.ts). Middle-click paste is unaffected.
app.commandLine.appendSwitch("disable-blink-features", "MiddleClickAutoscroll");
if (process.platform === "linux" && !app.commandLine.hasSwitch("force-gpu-mem-available-mb")) app.commandLine.appendSwitch("force-gpu-mem-available-mb", "2048");

const DEV_URL = process.env.LUCID_DEV_URL;
if (process.env.LUCID_SHOT) {
  // Test runs get their own copy of the settings, so they never overwrite the real app's
  // (two apps saving the same file lose each other's changes, like the coin ledger).
  const real = app.getPath("userData");
  const test = process.env.LUCID_SHOT_PROFILE || path.join(app.getPath("temp"), "lucid-test-profile");
  require("node:fs").mkdirSync(test, { recursive: true });
  try { require("node:fs").copyFileSync(path.join(real, "settings.json"), path.join(test, "settings.json")); } catch {}
  app.setPath("userData", test);
  // keep animating even though the window is off-screen
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
}
let win = null;
app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
const watchers = new Map(); // threadId -> stop()

// Linux: frameless with our own controls. macOS: inset traffic lights centred on the 52px header
// row. Windows: native caption buttons in an overlay the renderer recolours from the theme.
function windowChrome() {
  if (process.platform === "darwin") return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 19 } };
  if (process.platform === "win32") return { titleBarStyle: "hidden", titleBarOverlay: { color: "#161b3a", symbolColor: "#b9bfe6", height: 52 } };
  return { frame: false };
}
const windowKind = () => process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#141a33",
    title: brand.name,
    autoHideMenuBar: true,
    // The window's top merges with the app's own headers on every platform (src/titlebar.ts).
    ...windowChrome(),
    // debug screenshot runs render normally but off-screen, so they never pop up on you
    ...(process.env.LUCID_SHOT ? { x: -4000, y: -4000, skipTaskbar: true, focusable: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      backgroundThrottling: !process.env.LUCID_SHOT,
      sandbox: false,
    },
  });
  require("./profiler.cjs").install(win);
  const query = {};
  if (process.env.LUCID_THREAD) query.thread = process.env.LUCID_THREAD;
  if (process.env.LUCID_PROJECT) query.project = process.env.LUCID_PROJECT;
  if (process.env.LUCID_IDLE_SCALE) query.idleScale = process.env.LUCID_IDLE_SCALE;
  // test runs: the orchestrator only answers questions from this project (by title), and
  // answers none at all without one, so a test run never answers your real threads
  if (process.env.LUCID_AUTO_SCOPE) query.autoScope = process.env.LUCID_AUTO_SCOPE;
  else if (process.env.LUCID_SHOT) query.autoScope = "(none: test run)";
  query.app = "1";   // only the real app window answers questions (not pages other tools open)
  const loadOffice = () => {
    for (const ev of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) win.on(ev, () => { if (win.isDestroyed()) return; win.webContents.send("window:maximized", win.isMaximized() || win.isFullScreen()); win.webContents.send("window:fullscreen", win.isFullScreen()); });
    // the brand module names the window; page titles do not replace it
    win.on("page-title-updated", (e) => e.preventDefault());
    if (DEV_URL) win.loadURL(DEV_URL + "?" + new URLSearchParams(query));
    else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
  };
  if (process.env.LUCID_DELIVERY_PROOF && !process.env.LUCID_SHOT) {
    // Install the capture listeners before navigation, but never await
    // Debugger.enable: a fresh BrowserWindow needs navigation to create the
    // renderer which answers that command. Auditing cannot gate the office.
    void require('./delivery-attestation.cjs').prepare(win, {root: path.resolve(__dirname, '..'), output: process.env.LUCID_DELIVERY_PROOF})
      .catch(error => { console.error('Delivery audit unavailable:', error.message); });
  }
  loadOffice();
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
      if (process.env.LUCID_EVAL || process.env.LUCID_EVAL_FILE) {
        const code = process.env.LUCID_EVAL_FILE ? fs.readFileSync(process.env.LUCID_EVAL_FILE, "utf8") : process.env.LUCID_EVAL;
        const out = await win.webContents.executeJavaScript(code).catch((e) => String(e));
        fs.appendFileSync(path.join(process.env.LUCID_SHOT, "eval.log"), `--- ${n}
${typeof out === "string" ? out : JSON.stringify(out, null, 1)}
`);
      }
      if (n >= max) { clearInterval(timer); if (process.env.LUCID_SHOT_QUIT) app.quit(); }
    }, every);
  }
  // links in chat messages open in the real browser; only web and mail links are allowed
  win.webContents.setWindowOpenHandler(({ url }) => {
    void require("./external-links.cjs").open(shell, url);
    return { action: "deny" };
  });
}

require("./external-links.cjs").register(ipcMain, shell);

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

ipcMain.handle("fs:download-answer", async (_e, input) => {
  const url = new URL(String(input?.src || ""));
  if (url.protocol !== "lucid-file:" || !["local", "remote"].includes(url.hostname)) throw Error("Unsupported file address");
  const name = path.basename(String(input?.name || "download")).replace(/[\x00-\x1f]/g, "");
  const picked = await require("electron").dialog.showSaveDialog(win, { defaultPath: name });
  if (picked.canceled || !picked.filePath) return false;
  if (url.hostname === "remote") {
    const media = await remoteMedia.get(url.href);
    if (media.status !== 200) throw Error("This remote file is no longer available");
    await fsp.writeFile(picked.filePath, media.body);
  } else {
    const file = decodeURIComponent(url.pathname.slice(1));
    if (!(await fsp.stat(file)).isFile()) throw Error("This file is no longer available");
    if (path.resolve(file) !== path.resolve(picked.filePath)) await fsp.copyFile(file, picked.filePath);
  }
  return true;
});

ipcMain.handle("t3:projects", () => activeBuilding() ? remote.cached(activeBuilding())?.projects || [] : t3.listProjects());
const environments = require("./environments.cjs");
const remoteMedia = require("./remote-media.cjs").createRemoteMedia({ client: environments.client, split: require("./remote-building.cjs").split });
const remote = environments.remote;
let desktopBuilding = null;
const activeBuilding = () => desktopBuilding;
ipcMain.handle("environment:list", (_e, fresh) => environments.getEnvironments({ fresh: fresh === true }));
// Read another authenticated computer without changing the active action target.
const campusReads = new Map();
ipcMain.handle("environment:world", async (_e, id) => {
  const inventory = await environments.getEnvironments();
  const building = inventory.buildings.find(b => b.id === id && b.canOpen);
  if (!building) throw Error('This computer is not connected. Refresh Buildings and try again.');
  if (campusReads.has(id)) return campusReads.get(id);
  const read = Promise.resolve().then(async () => building.local ? t3.world() : await remote.world(id))
    .finally(() => campusReads.delete(id));
  campusReads.set(id, read); return read;
});
ipcMain.handle("environment:select", async (_e, id) => {
  const inventory = await environments.getEnvironments();
  const building = inventory.buildings.find(b => b.id === id && b.canOpen);
  if (!building) throw Error('This building is not available in T3 Connect.');
  if (!building.local) await remote.world(id);
  desktopBuilding = building.local ? null : id;
  for (const stop of watchers.values()) stop(); watchers.clear();
  return { ...building, world: activeBuilding() ? structuredClone(remote.cached(activeBuilding())) : t3.world() };
});
ipcMain.handle("t3:threads", () => activeBuilding() ? remote.cached(activeBuilding())?.threads || [] : t3.listThreads());
// Watch exactly this set of threads (one per desk in the open office).
ipcMain.handle("t3:watch-set", (_e, ids) => {
  const want = new Set(ids);
  for (const [id, stop] of watchers) if (!want.has(id)) { stop(); watchers.delete(id); }
  for (const id of want) {
    if (watchers.has(id)) continue;
    watchers.set(id, (remote.split(id) ? remote.watch : t3.watchThread)(
      id,
      (items, initial) => send("t3:items", { threadId: id, items, initial }),
      (info) => send("t3:info", { threadId: id, info }),
    ));
  }
  return true;
});
ipcMain.handle("t3:office", (_e, projectId) => { const target = remote.split(projectId); if (!target) return t3.office(projectId); const data = remote.cached(target.environmentId); return { project: data?.projects.find(p => p.id === projectId), threads: data?.threads.filter(t => t.projectId === projectId) || [] }; });
ipcMain.handle("t3:offices", () => activeBuilding() ? (remote.cached(activeBuilding())?.projects || []).map(p => ({ ...p, threads: remote.cached(activeBuilding()).threads.filter(t => t.projectId === p.id).length })) : t3.listProjectsWithCounts());
ipcMain.handle("project:add", (_e, o) => { if (activeBuilding()) throw Error('Add projects to this building in T3 Code.'); return t3.addProject(o); });
// New projects live beside the others in T3 Projects. An existing non-empty folder is
// never taken over: use "a folder I already have" for that.
const PROJECTS_BASE = path.join(require("node:os").homedir(), "T3 Projects");
ipcMain.handle("project:base", () => PROJECTS_BASE);
ipcMain.handle("project:create", async (_e, o) => {
  if (activeBuilding()) throw Error('Create projects for this building in T3 Code.');
  const name = String(o?.name ?? "").trim().replace(/[<>:"/\|?* -]/g, "").replace(/[. ]+$/, "").slice(0, 60);
  if (!name || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) throw Error('Choose a different project name.');
  const dir = path.join(PROJECTS_BASE, name);
  if (path.dirname(dir) !== PROJECTS_BASE) throw Error('Choose a different project name.');
  const fsx = require("node:fs");
  if (fsx.existsSync(dir) && fsx.readdirSync(dir).length) throw Error(`A folder named ${name} already exists in T3 Projects. Use "a folder I already have" to add it.`);
  fsx.mkdirSync(dir, { recursive: true });
  await t3.addProject({ path: dir, title: name });
  return { path: dir };
});
ipcMain.handle("project:pick-folder", async (e) => {
  const { dialog } = require("electron");
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Choose a project folder", defaultPath: PROJECTS_BASE, properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0] || null;
});
// --- orchestrator -----------------------------------------------------------------
const roster = () => { try { return JSON.parse(require("node:fs").readFileSync(path.join(app.getPath("userData"), "roster.json"), "utf8")); } catch { return []; } };
// Daily flavor text is app data, not the opt-in orchestrator's, so it lives with the settings.
const DAILY_DIR = path.join(app.getPath("userData"), "daily");
const orchestrator = require("./orchestrator-ipc.cjs").registerOrchestrator({ dailyDir: DAILY_DIR, ipcMain, t3, t3s: require("./t3server.cjs"), brand, base: PROJECTS_BASE, userData: app.getPath("userData"), usage: require("./usage.cjs"), shot: !!process.env.LUCID_SHOT, roster });
const ORCH_DIR = orchestrator.dir;
app.whenReady().then(() => void orchestrator.repairRoots());
ipcMain.handle("t3:request-context", (_e, id) => t3.requestContext(id));
ipcMain.handle("t3:replies-since", (_e, id, since) => t3.repliesSince(id, since));
ipcMain.handle("t3:resolved-since", (_e, since) => t3.resolvedRequestsSince(since));
ipcMain.handle("t3:user-messages", (_e, since, exclude) => t3.userMessagesSince(since, exclude));
ipcMain.handle("project:remove", (_e, o) => { if (remote.split(o.id)) throw Error('Remove remote projects in T3 Code.'); return t3.removeProject(o); });
ipcMain.handle("app:host", () => require("node:os").hostname());
ipcMain.handle("t3:channel", () => require("./t3-channel.cjs").t3Channel());
const usage = require("./usage.cjs");
usage.setProviderLimitsReader(() => require("./t3server.cjs").usageLimits());
ipcMain.handle("usage:get", () => usage.getUsage());
ipcMain.handle("coins:usage", () => usage.getCoinSources(t3.coinBindings()));
const reports = require("./reports.cjs").createReports({
  robots: roster, name: brand.name, spent: orchestrator.spent,
  dir: process.env.LUCID_SHOT ? path.join(app.getPath("userData"), "reports") : path.join(ORCH_DIR, "reports"), t3, server: require("./t3server.cjs"), usage,
  settings: () => { if (process.env.LUCID_SHOT) return null; try { return JSON.parse(require("node:fs").readFileSync(path.join(app.getPath("userData"), "settings.json"), "utf8")).orch || null; } catch { return null; } },
});
// Owned single-flight backend supervision continues when the office renderer is hidden.
let reportSupervisorTimer = null, reportSupervisorStopped = false;
// Titles follow each finished run, using T3 Code's own text generation model.
const titleRefresh = require('./title-refresh.cjs').createTitleRefresh({ file: path.join(app.getPath('userData'), 'title-refresh.json'), world: async () => t3.world(), reportState: t3.reportState, dispatch: command => require('./t3server.cjs').dispatch(command) });
async function superviseReports() {
  if (reportSupervisorStopped) return;
  try { await reports.supervise(); } catch (error) { console.error('Report supervision failed', error.message); }
  try { await titleRefresh.tick(); } catch (error) { console.error('Title refresh failed', error.message); }
  finally { if (!reportSupervisorStopped) reportSupervisorTimer = setTimeout(superviseReports, 5000); }
}
if (!process.env.LUCID_SHOT && !process.env.LUCID_AUTO_SCOPE?.startsWith('(none')) {
  app.whenReady().then(() => { void superviseReports(); });
}
app.on('before-quit', () => { reportSupervisorStopped = true; clearTimeout(reportSupervisorTimer); });
ipcMain.handle("reports:list", () => reports.list());
ipcMain.handle("reports:submit", (_e, id, robot) => reports.submit(id, robot));
ipcMain.handle("reports:tick", (_e, arrived) => reports.tick(arrived));
ipcMain.handle("reports:manual", (_e, id, action, values) => reports.manual(id, action, values));

// Files attached in the side chat are saved where agents can open them by path.
ipcMain.handle("attach:save", async (_e, { name, data }) => {
  if (activeBuilding()) throw Error('Use T3 Code to send files to this building.');
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
const { createJsonStore } = require('./json-store.cjs');
const settingsStore = createJsonStore(SETTINGS, { fallback: '{}' });
ipcMain.on("settings:load", (e) => { e.returnValue = settingsStore.load(); });
ipcMain.handle("settings:save", (_e, json) => settingsStore.save(json));
// The robot team lives in a file so names, looks and habits survive restarts.
const ROSTER = path.join(app.getPath("userData"), "roster.json");
const rosterStore = createJsonStore(ROSTER, { fallback: '[]', array: true });
ipcMain.on("roster:load", (e) => { e.returnValue = rosterStore.load(); });
ipcMain.handle("roster:save", (_e, json) => rosterStore.save(json));
const flushUserState = (options) => Promise.all([settingsStore.flush(options), rosterStore.flush(options)]);
let savingBeforeQuit = false;
app.on('before-quit', event => {
  if (!settingsStore.pending && !rosterStore.pending) return;
  event.preventDefault();
  if (savingBeforeQuit) return;
  savingBeforeQuit = true;
  void flushUserState().finally(() => { savingBeforeQuit = false; app.quit(); });
});
ipcMain.handle("t3:conversation", (_e, id) => remote.split(id) ? remote.conversation(id) : t3.conversation(id));
ipcMain.handle("t3:conversation-page", (_e, id, options) => remote.split(id) ? remote.conversationPage(id) : t3.conversationPage(id, options));
ipcMain.handle("t3:pending-requests", (_e, id) => remote.split(id) ? remote.pending(id) : t3.pendingRequests(id));
ipcMain.handle("t3:request-outcome", (_e, threadId, requestId) => { try { return t3.requestOutcome(threadId, requestId); } catch { return null; } });
ipcMain.handle("t3:thread-info", (_e, id) => { try { return remote.split(id) ? remote.info(id) : t3.threadInfo(id); } catch { return null; } });
ipcMain.handle("t3:items-since", (_e, id, since) => remote.split(id) ? remote.items(id) : (since ? t3.itemsSince(id, since) : t3.recentItems(id, 60)));
ipcMain.handle("t3:attach-dir", () => require("node:path").join(process.env.T3CODE_HOME || require("node:path").join(require("node:os").homedir(), ".t3"), "userdata", "attachments") + require("node:path").sep);
// Jobs a thread left running after its turn (a render service, say), from systemd on this computer.
const backgroundJobs = require("./background-jobs.cjs").createBackgroundJobs({ folders: () => { try { return t3.threadFolders(); } catch { return []; } } });
ipcMain.handle("t3:world", async () => {
  const data = activeBuilding() ? await remote.world(activeBuilding()) : t3.world();
  if (!activeBuilding()) { const jobs = backgroundJobs.current(); for (const t of data.threads) { const job = jobs.get(t.id); if (job) t.job = job; } }
  return data;
});
ipcMain.handle("t3:tasks", () => { if (activeBuilding()) return []; try { return t3.officeTasks(); } catch { return []; } });
ipcMain.handle("t3:start", (_e, opts) => { if (remote.split(opts.project)) throw Error('Start a new remote thread in T3 Code, then open it here.'); return opts.options !== undefined ? t3s.startHire(opts) : t3.startThread(opts); });
ipcMain.handle("t3:send", (_e, opts) => remote.split(opts.threadId) ? remote.send(opts) : t3.sendMessage(opts));

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

// A real picture of a page the robot opened to test it (its dev server, or HTML it rendered).
ipcMain.handle("web:shot", (_e, req) => require("./pageshot.cjs").shot(req));
require("./frontend.cjs").register(ipcMain, app);

// GitHub, Hugging Face and Wikipedia data, web search results and read-only git facts.
require("./sites.cjs").register(ipcMain, (url, opts) => net.fetch(url, opts));

// Images the agent looked at, sent as data URLs (common image types only, max 12 MB).
ipcMain.handle("fs:image", async (_e, p) => {
  if (activeBuilding()) return null;
  try {
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
ipcMain.handle("fs:text", async (_e, p) => {
  if (activeBuilding()) return null;
  try {
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

// Size and time of the exact files an agent attached (at most 8 paths, nothing listed or read).
ipcMain.handle("fs:stat", (_e, paths) => require("./file-facts.cjs").fileFacts(paths, { remote: !!activeBuilding() }));

// Show a delivered attachment in its folder. Only files inside the two attachment folders qualify.
ipcMain.handle("fs:reveal", async (_e, p) => {
  if (activeBuilding() || typeof p !== "string") return false;
  const home = process.env.T3CODE_HOME || path.join(require("node:os").homedir(), ".t3");
  const { underRoots } = require("./file-facts.cjs");
  if (!underRoots(p, [path.join(home, "userdata", "attachments"), path.join(require("node:os").homedir(), ".t3", "userdata", "lucid-attachments")])) return false;
  try { if (!(await fsp.stat(p)).isFile()) return false; } catch { return false; }
  shell.showItemInFolder(path.resolve(p));
  return true;
});
ipcMain.handle("app:check-update", () => updater.check());
ipcMain.handle("app:apply-update", async () => {
  try {
    const result = await updater.apply((step) => send("app:update-step", step));
    if (!result.updated) return { ok: true };
    delete process.env.LUCID_DEV_URL;
    await flushUserState({ requireSaved: true });
    if (result.install) { result.install(); return { ok: true }; }
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (err) {
    return require('./update-errors.cjs').updateFailure(err, require('./installation.cjs').hasInstalledBuild(path.join(__dirname, '..')));
  }
});
ipcMain.handle("app:version", () => app.getVersion());

// lucid-file://local/<encoded path> serves images and text files the agents worked with,
// so the robots' screens and the chat can show them. Only known media and text types.
protocol.registerSchemesAsPrivileged([{ scheme: "lucid-artifact", privileges: { standard: true, secure: true, supportFetchAPI: true } }, { scheme: "lucid-file", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }, { scheme: "lucid-studio", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const thumbs = require("./thumbs.cjs").createThumbs({ nativeImage, fsp });
const { fileMediaResponse, bufferMediaResponse } = require("./media-response.cjs");
const SERVE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif", ".mp4", ".webm", ".mov", ".m4v", ".ogv", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"]);

app.whenReady().then(() => {
  require("./answer-visuals.cjs").installAnswerVisuals({ protocol, ipcMain });
  require("./studio.cjs").install({ protocol, ipcMain, app });
  protocol.handle("lucid-file", async (req) => {
    // Files of threads on another computer come from that computer (remote-media.cjs).
    if (new URL(req.url).hostname === "remote") {
      const media = await remoteMedia.get(req.url);
      return media.status === 200 ? bufferMediaResponse(req, media.body, media.type) : new Response(media.status === 403 ? "not allowed" : "missing", { status: media.status });
    }
    try {
      const file = decodeURIComponent(new URL(req.url).pathname.slice(1));
      if (!SERVE.has(path.extname(file).toLowerCase())) return new Response("not allowed", { status: 403 });
      await fsp.access(file);
      // ?w=480: a resized copy for places that show the picture small (electron/thumbs.cjs)
      const want = new URL(req.url).searchParams.get("w");
      const small = want && !req.headers.has("range") ? await thumbs.get(file, want).catch(() => null) : null;
      if (small) return new Response(small.body, { headers: { "content-type": small.type, "cache-control": "private, max-age=3600" } });
      const playable = await fileMediaResponse(req, file);
      if (playable) return playable;
      return net.fetch(pathToFileURL(file).toString(), { headers: req.headers.has("range") ? { Range: req.headers.get("range") } : {} });
    } catch {
      return new Response("missing", { status: 404 });
    }
  });
  require("./app-menu.cjs").install();
  createWindow();
});
app.on("window-all-closed", () => app.quit());

// --- T3 server (paired session): queue edits and model changes ------------------
// Handlers answer { ok, value } or { ok: false, error } so the renderer gets a clean message.
const t3s = require("./t3server.cjs");
const { createLocalization, createWriterTranslator } = require('./localization.cjs');
// Flavor text, translations and board ideas come from a headless harness CLI, never a T3 thread.
const writer = require('./headless-writer.cjs').createHeadlessWriter({ settingsFile: path.join(path.dirname(t3.DB_PATH), 'settings.json') });
const dailyWriter = require('./daily-writer.cjs').createDailyWriter({ writer, dir: DAILY_DIR });
ipcMain.handle("writer:daily", (_e, input) => { if (activeBuilding()) throw Error('Write daily lines on the computer that owns the robots.'); return dailyWriter.write(input); });
const projectLife = require('./project-life.cjs').createProjectLife({ file: path.join(app.getPath('userData'), 'project-offices.json'), t3, writer, isLocal: () => !activeBuilding() });
ipcMain.handle('project-life:get', (_e, input) => projectLife.get(input));
ipcMain.handle('project-life:save', (_e, input) => projectLife.save(input));
ipcMain.handle('project-life:generate', (_e, input) => projectLife.generate(input));
const localization = createLocalization({ file: path.join(app.getPath('userData'), 'translations.json'), translate: createWriterTranslator({ writer }) });
ipcMain.handle('lucid:localize', (_e, input) => localization.localize(input));
t3s.setRemoteDispatch(c => remote.dispatch(c));
t3s.setRemoteSecret((id, item, answer) => remote.answerSecret(id, item, answer));
const t3sWrap = (fn) => async (_e, ...args) => {
  try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: String(err?.message || err), code: err?.code || null }; }
};
ipcMain.handle("t3s:status", t3sWrap(async (o) => remote.split(o?.threadId) ? { paired: true, error: null, selection: await remote.selection(o.threadId) } : t3s.status(o || {})));
// Pinning is T3's own pin: a pinned thread is listed first and keeps its desk.
ipcMain.handle("t3s:pin", t3sWrap((o) => {
  if (typeof o?.threadId !== 'string' || !o.threadId || typeof o.pinned !== 'boolean') throw Error('Choose a thread to pin or unpin.');
  const command = { type: o.pinned ? 'thread.pin' : 'thread.unpin', threadId: o.threadId };
  return remote.split(o.threadId) ? remote.dispatch(command) : t3s.dispatch(command);
}));
// Stop, rename and archive through T3's own commands (thread-actions.cjs validates them).
const orchThreadId = () => { try { return JSON.parse(require("node:fs").readFileSync(path.join(app.getPath("userData"), "settings.json"), "utf8")).orch?.threadId || null; } catch { return null; } };
for (const action of ["stop", "rename", "archive"]) ipcMain.handle(`t3s:${action}`, t3sWrap((o) => {
  const command = require("./thread-actions.cjs").threadCommand(action, o, { local: t3.reportState, reserved: id => id === orchThreadId() ? "The orchestrator's thread stays. Stop using it in its settings first." : null });
  return remote.split(command.threadId) ? remote.dispatch(command) : t3s.dispatch(command);
}));
ipcMain.handle("t3s:providers", t3sWrap((o) => activeBuilding() ? remote.providers(activeBuilding()) : t3s.listProviders(o || {})));
ipcMain.handle("t3s:search-threads", t3sWrap((q) => activeBuilding() ? { matches: [], threads: [] } : t3s.searchThreads(q)));
ipcMain.handle("t3s:hire-config", t3sWrap((o) => { if (activeBuilding()) throw Error('Start a new thread in T3 Code for this building.'); return t3s.hireConfig(o || {}); }));
ipcMain.handle("t3s:hire-contexts", t3sWrap((o) => { if (activeBuilding()) throw Error('Context search is unavailable for this building.'); return t3s.hireContexts(o.projectId); }));
let threadMovePending = false;
ipcMain.handle("t3s:move-thread", t3sWrap(async (o) => {
  if (threadMovePending) throw Error('A thread move is still saving. Try again in a moment.');
  threadMovePending = true;
  try {
    // A linked computer's order comes from and goes to that computer, never the local T3.
    const building = remote.split(o?.threadId)?.environmentId || null;
    if ((remote.split(o?.targetId)?.environmentId || null) !== building) throw Error('Move threads within one building.');
    const threads = building ? remote.cached(building)?.threads || [] : t3.world().threads;
    const assignments = require('./thread-order.cjs').moveAssignments(threads, o.threadId, o.targetId, o.after === true);
    for (const a of assignments) { const command = { type: a.pinned ? 'thread.pin.reorder' : 'thread.active.reorder', threadId: a.threadId, orderKey: a.orderKey }; await (building ? remote.dispatch(command) : t3s.dispatch(command)); }
  } finally { threadMovePending = false; }
}));
ipcMain.handle("t3s:reorder", t3sWrap((o) => t3s.reorderQueued(o.threadId, o.runId, o.beforeRunId ?? null)));
ipcMain.handle("t3s:cancel", t3sWrap((o) => t3s.cancelQueued(o.threadId, o.runId)));
// Collecting finished work without a review clears its desk by settling the thread.
ipcMain.handle("t3s:settle", t3sWrap((o) => { if (activeBuilding()) throw Error('Collect work on the computer that owns it.'); if (typeof o?.threadId !== 'string' || !o.threadId) throw Error('Choose finished work to collect.'); const state = require('./t3.cjs').reportState(o.threadId); if (!state.run || !['completed', 'cancelled', 'canceled', 'interrupted', 'failed', 'error', 'stopped', 'aborted'].includes(state.run.status) || state.pendingRuns || state.pendingRequests) throw Error(state.pendingRequests ? 'This session is waiting for your answer. Answer it before settling.' : 'This session is still running. Stop it before settling.'); return t3s.settleThread(o.threadId, { excludePinned: true, expectedRunId: state.run.id, ended: true }); }));
ipcMain.handle("t3s:edit", t3sWrap((o) => t3s.editQueued(o.threadId, o.runId, o.text)));
ipcMain.handle("t3s:steer", t3sWrap((o) => t3s.steerNow(o.threadId, o.queuedRunId, o.targetRunId)));
ipcMain.handle("t3s:setModel", t3sWrap((o) => t3s.setThreadModel(o.threadId, o.selection)));
ipcMain.handle("t3s:respond", t3sWrap((o) => t3s.respondToRequest(o.threadId, o.requestId, o)));
ipcMain.handle("t3s:reset-credit", t3sWrap((o) => { if (activeBuilding()) throw Error('Use reset credits on the computer that owns the subscription.'); return t3s.consumeResetCredit(o?.instanceId); }));
app.on("before-quit", () => t3s.closeSock());

// Office documents the agents wrote (docx, xlsx, pptx, csv...), read for the robots' office apps.
require("./office.cjs").register(ipcMain);
// Real market candles and prices behind the robots' Botcoin Exchange (cached, rate limited).
require("./market.cjs").register(ipcMain);

// Dictation goes through the local T3 Code's speech service, including for remote-building chats.
require("./t3-voice.cjs").register({ ipcMain, app, window: () => win, server: t3s });
// The palette of the theme picked in T3 Code, for the Follow T3 interface theme.
require("./t3-theme.cjs").register(ipcMain, app);
// The window's top (src/titlebar.ts): Linux window buttons and the maximized state for its restore icon.
ipcMain.handle("window:control", (event, action) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return false;
  if (action === "minimize") w.minimize();
  else if (action === "maximize") { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
  else if (action === "close") w.close();
  return w.isMaximized();
});
ipcMain.handle("window:state", (event) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  return { maximized: !!w?.isMaximized(), fullscreen: !!w?.isFullScreen(), chrome: windowKind() };
});
// Windows caption buttons take the colours of the surface beneath them.
ipcMain.handle("window:overlay", (event, c) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  const ok = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  if (!w || process.platform !== "win32" || !ok(c?.color) || !ok(c?.symbolColor)) return false;
  w.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor });
  return true;
});
