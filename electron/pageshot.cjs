// Real pages for the robots' browser: a page a robot opened to test (its own dev server, or
// HTML it rendered) is loaded in a hidden browser window and photographed, so the robot's screen
// shows the page as a browser draws it. The window is locked down: no scripts from Lucid, no
// popups, no downloads, no permissions, and it lives in its own throwaway session.
const { BrowserWindow, session, nativeImage } = require("electron");

const WIDTH = 960;
const MAX_HEIGHT = 3000;
const LOAD_MS = 12000;
let queue = Promise.resolve();

function lock(win) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.setAudioMuted(true);
  wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  wc.session.on("will-download", (e) => e.preventDefault());
  // links inside the page stay where they are: only the page that was asked for loads
  wc.on("will-navigate", (e, url) => { if (!/^(https?:|data:text\/html)/i.test(url)) e.preventDefault(); });
}

async function capture(target, html, width) {
  const part = `lucid-shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;   // not persisted
  const ses = session.fromPartition(part);
  const win = new BrowserWindow({
    show: false, width, height: 700, useContentSize: true, frame: false, skipTaskbar: true, focusable: false,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, session: ses, backgroundThrottling: false, spellcheck: false },
  });
  try {
    lock(win);
    const wc = win.webContents;
    const loaded = new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      wc.once("did-finish-load", () => done({ ok: true }));
      wc.once("did-fail-load", (_e, code, desc, _u, isMain) => { if (isMain && code !== -3) done({ ok: false, error: desc || "load failed" }); });
      setTimeout(() => done({ ok: true, slow: true }), LOAD_MS);
    });
    if (html != null) await wc.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(String(html).slice(0, 400000)).toString("base64")}`).catch(() => {});
    else {
      wc.setUserAgent(wc.getUserAgent().replace(/ Electron\/\S+/, "").replace(/ lucid\/\S+/i, ""));
      wc.loadURL(target).catch(() => {});
    }
    const state = await loaded;
    if (!state.ok) return { ok: false, error: state.error };
    // images, fonts and client-side rendering get a moment
    await new Promise((r) => setTimeout(r, 700));
    // how tall the page really is: its lowest element (a short page is not stretched to the window)
    const m = await wc.executeJavaScript(`(() => {
      let low = 0;
      const els = document.body ? document.body.querySelectorAll("*") : [];
      for (let i = 0; i < Math.min(els.length, 4000); i++) { const r = els[i].getBoundingClientRect(); if (r.height > 0 && r.bottom > low) low = r.bottom; }
      return { h: Math.min(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), Math.ceil(low + window.scrollY) + 16), t: document.title || "", u: location.href };
    })()`, true).catch(() => ({ h: 700, t: "", u: target || "" }));
    const height = Math.max(420, Math.min(MAX_HEIGHT, Math.ceil(m.h || 700)));
    win.setContentSize(width, height);
    await new Promise((r) => setTimeout(r, 250));
    let img = await wc.capturePage();
    if (img.isEmpty()) { await new Promise((r) => setTimeout(r, 400)); img = await wc.capturePage(); }
    if (img.isEmpty()) return { ok: false, error: "empty page" };
    const size = img.getSize();
    const out = size.width > width ? img.resize({ width, quality: "good" }) : img;
    const s = out.getSize();
    const jpeg = out.toJPEG(80);
    return { ok: true, title: String(m.t || "").slice(0, 200), url: html != null ? "" : String(m.u || target), width: s.width, height: s.height, tall: m.h > MAX_HEIGHT, image: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    ses.clearStorageData().catch(() => {});
  }
}

/** { url } for a page on the web or a local dev server, { html } for HTML a robot wrote. One at a time. */
function shot(req) {
  const url = String(req?.url || "");
  const html = typeof req?.html === "string" ? req.html : null;
  if (html == null && !/^https?:\/\//i.test(url)) return Promise.resolve({ ok: false, error: "not a web page" });
  const width = Math.max(320, Math.min(1280, Number(req?.width) || WIDTH));
  const run = () => capture(url, html, width).catch((err) => ({ ok: false, error: String(err?.message || err) }));
  const p = queue.then(run, run);
  queue = p.then(() => {}, () => {});
  return p;
}

module.exports = { shot };
