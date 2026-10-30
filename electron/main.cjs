const { app, BrowserWindow, ipcMain, shell, net } = require("electron");
const path = require("node:path");
const t3 = require("./t3.cjs");
const updater = require("./updater.cjs");

const DEV_URL = process.env.LUCID_DEV_URL;
let win = null;
let stopWatch = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#141a33",
    title: "Lucid",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  const query = process.env.LUCID_THREAD ? { thread: process.env.LUCID_THREAD } : undefined;
  if (DEV_URL) win.loadURL(DEV_URL + (query ? `?thread=${query.thread}` : ""));
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query });
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

ipcMain.handle("t3:projects", () => t3.listProjects());
ipcMain.handle("t3:threads", () => t3.listThreads());
ipcMain.handle("t3:watch", (_e, threadId) => {
  if (stopWatch) stopWatch();
  stopWatch = t3.watchThread(
    threadId,
    (items, initial) => send("t3:items", { threadId, items, initial }),
    (info) => send("t3:info", { threadId, info }),
  );
  return true;
});
ipcMain.handle("t3:start", (_e, opts) => t3.startThread(opts));
ipcMain.handle("t3:send", (_e, opts) => t3.sendMessage(opts));

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
    const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    const title = decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    const description = decode(pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i));
    const blocks = [];
    const re = /<(h1|h2|h3|p|li|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html)) && blocks.length < 40) {
      const text = decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (text.length > 2) blocks.push({ tag: m[1].toLowerCase(), text: text.slice(0, 400) });
    }
    return { ok: true, title, description, blocks };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// Images the agent looked at, sent as data URLs (common image types only, max 12 MB).
ipcMain.handle("fs:image", async (_e, p) => {
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
