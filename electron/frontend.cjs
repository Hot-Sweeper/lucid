// Persistent, sandboxed mirrors of work-in-progress frontends. Captures happen on
// demand; reduced tiers ask for geometry only. Sessions belong to their IPC owner.
const { BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const page = require('./frontend-page.cjs');
const sessions = new Map();
const MAX_SESSIONS = 6, LEASE_MS = 90000;

function localUrl(value) {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password && ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname) ? u.href.replace('://0.0.0.0', '://127.0.0.1') : null; } catch { return null; }
}
function sourceOf(target) {
  if (typeof target?.html === 'string' && target.html.length <= 400000) return { key: target.html, url: `data:text/html;charset=utf-8;base64,${Buffer.from(target.html).toString('base64')}` };
  const url = localUrl(target?.url); if (url) return { key: url, url };
  if (typeof target?.file === 'string' && typeof target?.root === 'string') {
    const root = fs.realpathSync(target.root), file = fs.realpathSync(path.resolve(root, target.file));
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !/\.html?$/i.test(file) || !fs.statSync(file).isFile()) throw Error('Preview file is outside this project.');
    return { key: file, url: pathToFileURL(file).href, file, root };
  }
  throw Error('A local dev page or project HTML file is required.');
}
function close(key) {
  require('./workspace-browser.cjs').close(key);
  const s = sessions.get(key); if (!s) return;
  sessions.delete(key); clearTimeout(s.expiry); clearTimeout(s.reload); s.watcher?.close();
  if (!s.win.isDestroyed()) s.win.destroy();
  s.partition.clearStorageData().catch(() => {});
}
function touch(s) { clearTimeout(s.expiry); s.expiry = setTimeout(() => close(s.key), LEASE_MS); s.expiry.unref?.(); }
async function create(key, source, owner) {
  while (sessions.size >= MAX_SESSIONS) close([...sessions.values()].sort((a,b) => a.used - b.used)[0].key);
  const partition = session.fromPartition(`lucid-frontend-${require('node:crypto').randomUUID()}`);
  const win = new BrowserWindow({ show: false, width: 960, height: 540, useContentSize: true, frame: false, skipTaskbar: true, focusable: false,
    webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: true, spellcheck: false } });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' })); wc.setAudioMuted(true);
  partition.setPermissionRequestHandler((_wc,_permission,cb) => cb(false));
  partition.setPermissionCheckHandler(() => false);
  partition.on('will-download', e => e.preventDefault());
  partition.webRequest.onBeforeRequest((details, callback) => {
    // A file preview may load its own project assets, never Lucid's files or
    // unrelated local paths. HTTP pages retain ordinary browser network rules.
    let allowed = /^(https?:|wss?:|data:|blob:|about:)/i.test(details.url);
    if (details.url.startsWith('file:') && source.root) {
      try { const relative = path.relative(source.root, fs.realpathSync(fileURLToPath(details.url))); allowed = !relative.startsWith('..') && !path.isAbsolute(relative); } catch { allowed = false; }
    }
    callback({ cancel: !allowed });
  });
  wc.on('will-navigate', (e,url) => { if (url !== source.url && !localUrl(url)) e.preventDefault(); });
  const s = { key, source, owner, win, partition, used: Date.now(), busy: null, imageRevision: -1, hasImage: false, density: 1, height: 540, expiry: null, watcher: null, reload: null, loadError: null };
  sessions.set(key, s); touch(s);
  if (source.file) {
    // Watching the containing project supports sibling CSS/assets and atomic saves.
    s.watcher = fs.watch(path.dirname(source.file), { recursive: true }, (_event, name) => {
      if (!name || /(^|[\\/])(node_modules|\.git|dist)([\\/]|$)/.test(String(name)) || !/\.(html?|css|[cm]?js|svg|png|jpe?g)$/i.test(String(name))) return;
      clearTimeout(s.reload); s.reload = setTimeout(() => { if (!win.isDestroyed()) { s.hasImage = false; wc.reload(); } }, 220);
    });
  }
  wc.on('did-finish-load', () => { s.state = null; s.imageRevision = -1; s.hasImage = false; wc.executeJavaScript(page.install).catch(() => {}); });
  await load(s);
  return s;
}

// Failed startup and retries share the same bounded navigation path. Never sample
// Chromium's error document or turn a refused connection into a generic failure.
async function load(s) {
  let timeout;
  try {
    await Promise.race([s.win.webContents.loadURL(s.source.url), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Error('Preview load timed out')), 10000); timeout.unref?.();
    })]);
    s.loadError = null;
  } catch {
    s.loadError = s.source.file
      ? 'Waiting for the HTML file. Save it to refresh this preview.'
      : 'Waiting for the dev server. This preview will reconnect automatically when it is available.';
  } finally { clearTimeout(timeout); }
}

async function frame(owner, req) {
  if (!req || typeof req.id !== 'string' || req.id.length > 180) return { ok: false, error: 'Invalid preview request.' };
  const key = `${owner}:${req.id}`;
  if (req.close) { close(key); return { ok: true }; }
  try {
    const workspace = require('./workspace-browser.cjs');
    if (req.target?.workspace && sessions.has(key)) close(key);
    if (req.target && !req.target.workspace) workspace.close(key);
    if (req.target?.workspace || workspace.has(key)) return await workspace.frame(key, req);
    let s = sessions.get(key), created = false;
    if (req.target) {
      const source = sourceOf(req.target);
      if (s && source.key !== s.source.key) { close(key); s = null; }
      if (!s) { s = await create(key, source, owner); created = true; }
    }
    if (!s || s.win.isDestroyed()) return { ok: false, missing: true, error: 'Preview session ended.' };
    s.used = Date.now(); touch(s);
    s.win.webContents.setBackgroundThrottling(req.mode !== 'full');
    if (s.source.url.includes('/__lucid/studio')) await s.win.webContents.executeJavaScript(`window.__lucidCanvas?.pause(${req.mode === 'paused'})`).catch(() => {});
    if (req.mode === 'paused') return { ok: true };
    if (s.busy) return s.busy;
    s.busy = (async () => {
      const wc = s.win.webContents;
      const height = Math.max(200, Math.min(800, Number(req.height) || 540));
      const density = Math.min(1600 / 960, 1000 / height, Math.max(1, Number(req.density) || 1));
      if (s.height !== height || s.density !== density) {
        s.height = height; s.density = density; s.hasImage = false; s.state = null;
        wc.setZoomFactor(density); s.win.setContentSize(Math.ceil(960 * density), Math.ceil(height * density));
      }
      if (s.loadError && !created) await load(s);
      if (s.loadError) return { ok: false, error: s.loadError };
      await wc.executeJavaScript(page.install);
      const version = await wc.executeJavaScript(page.version);
      const actionKey = JSON.stringify(req.action || null);
      if (s.state && version.revision === s.state.revision && !version.animated && actionKey === s.actionKey && (req.mode !== 'full' || s.hasImage && s.imageRevision === version.revision)) return { ok: true, unchanged: true };
      const state = await wc.executeJavaScript(page.sample(req.mode, req.action));
      if (!state || !Array.isArray(state.shapes)) throw Error('Page layout is unavailable.');
      let image;
      if (req.mode === 'full' && (!s.hasImage || s.imageRevision !== state.revision || state.animated)) {
        // Chromium can stall a hidden surface after a refused navigation.
        // Release that renderer so the next poll can create a healthy session.
        let captureTimeout, captured;
        try {
          captured = await Promise.race([wc.capturePage(undefined, { stayHidden: true, stayAwake: true }), new Promise((_, reject) => {
            captureTimeout = setTimeout(() => reject(Error('Preview capture timed out')), 4000); captureTimeout.unref?.();
          })]);
        } catch {
          close(key);
          return { ok: false, missing: true, error: 'Reconnecting to the frontend…' };
        } finally { clearTimeout(captureTimeout); }
        if (!captured.isEmpty()) { const bounded = captured.resize({ width: Math.ceil(960 * density), height: Math.ceil(height * density) }); image = bounded.toDataURL(); s.hasImage = true; s.imageRevision = state.revision; }
      }
      s.state = state; s.actionKey = actionKey;
      return { ok: true, ...state, image };
    })().finally(() => { s.busy = null; });
    return await s.busy;
  } catch { return { ok: false, error: 'Could not load the frontend. Check its dev server or HTML file.' }; }
}
function register(ipcMain, app) {
  const owners = new Set();
  ipcMain.handle('frontend:frame', (event, req) => {
    const owner = event.sender.id;
    if (!owners.has(owner)) { owners.add(owner); event.sender.once('destroyed', () => { owners.delete(owner); require('./workspace-browser.cjs').closeOwner(owner); for (const [key,s] of sessions) if (s.owner === owner) close(key); }); }
    return frame(owner, req);
  });
  app.once('before-quit', () => { require('./workspace-browser.cjs').closeOwner(); for (const key of sessions.keys()) close(key); });
}
module.exports = { register, frame, close, localUrl, sourceOf };
