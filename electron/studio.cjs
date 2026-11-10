// The robots' Studio app: serves a project's saved files (or proxies the dev server the robot
// started) to a sandboxed frame on its own lucid-studio://<session> origin, next to the build
// playback page in ./studio-page. No model is asked anything; renders come from files on disk.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEME = 'lucid-studio';
const MAX_SESSIONS = 12, MAX_FILE = 64 * 1024 * 1024;
// Sources a browser cannot run directly: they need the project's own dev server.
const BUILT = /\.(jsx|tsx?|vue|svelte|astro|scss|sass|less)$/i;
const FRAMEWORKS = ['vite', 'next', 'nuxt', 'react-scripts', '@angular/core', '@sveltejs/kit', 'svelte', 'astro', 'parcel', 'webpack', 'gatsby', '@remix-run/dev', 'react', 'vue', 'preact', 'solid-js'];
const PAGE_FILES = { 'host.html': 'text/html', 'host.mjs': 'text/javascript', 'stage-engine.mjs': 'text/javascript', 'stage-engine.css': 'text/css' };
const TYPES = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.map': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
};
// The project's own files only: no network beyond this origin, no forms, no plugins.
const PAGE_CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; form-action 'none'; base-uri 'self'; object-src 'none'";
const HOST_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'";

const sessions = new Map(); // id -> session
const keys = new Map();     // owner|root|source -> id
const lastEntry = new Map(); // owner|root -> the page shown last

function localUrl(value) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(u.hostname) ? u.href.replace('://0.0.0.0', '://127.0.0.1') : null;
  } catch { return null; }
}
function within(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function isFile(file) { try { return fs.statSync(file).isFile(); } catch { return false; } }
function realDir(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return null;
  try { const real = fs.realpathSync(value); return fs.statSync(real).isDirectory() && path.parse(real).root !== real ? real : null; } catch { return null; }
}

/** The page a save belongs to: the edited HTML file, the page shown last, or the nearest index.html above the file. */
function staticEntry(root, file, previous) {
  if (file && /\.html?$/i.test(file) && isFile(file)) return file;
  if (previous && isFile(previous)) return previous;
  for (let dir = file ? path.dirname(file) : root; within(root, dir); dir = path.dirname(dir)) {
    const index = path.join(dir, 'index.html');
    if (isFile(index)) return index;
    if (dir === root) break;
  }
  return null;
}

/** A framework project renders through its dev server, never from raw sources. */
function needsServer(root, entry, file) {
  if (file && BUILT.test(file)) return true;
  for (let dir = path.dirname(entry); within(root, dir); dir = path.dirname(dir)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (FRAMEWORKS.some((name) => Object.hasOwn(deps, name))) return true;
      break;
    } catch { /* no manifest here */ }
    if (dir === root) break;
  }
  try {
    const html = fs.readFileSync(entry, 'utf8').slice(0, 200000);
    return /<script[^>]+src=["'][^"']+\.(tsx?|jsx|vue|svelte)(\?[^"']*)?["']/i.test(html);
  } catch { return false; }
}

function close(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  if (keys.get(s.key) === id) keys.delete(s.key);
}
function closeOwner(owner) { for (const [id, s] of sessions) if (s.owner === owner) close(id); }

function session(owner, root, source, fields) {
  const key = `${owner}|${root}|${source}`;
  let s = sessions.get(keys.get(key));
  if (!s) {
    const own = [...sessions.values()].filter((x) => x.owner === owner).sort((a, b) => a.used - b.used);
    while (own.length >= MAX_SESSIONS) close(own.shift().id);
    s = { id: crypto.randomBytes(12).toString('hex'), owner, root, key, ...fields };
    sessions.set(s.id, s); keys.set(key, s.id);
  }
  s.used = Date.now();
  return { ok: true, id: s.id, origin: `${SCHEME}://${s.id}`, entry: s.entry, kind: s.server ? 'server' : 'static', label: s.label };
}

/** Resolve what a save can show: the project's static page, or the dev server it already runs. */
function open(owner, req) {
  // A linked computer's thread keeps its files there (same rule as thread-actions.cjs).
  if (typeof req?.thread === 'string' && req.thread.includes('::')) return { ok: false, reason: 'remote' };
  const root = realDir(req?.root);
  if (!root) return { ok: false, reason: 'no-project' };
  const file = typeof req.file === 'string' && req.file ? path.resolve(root, req.file) : null;
  if (file && !within(root, file)) return { ok: false, reason: 'outside' };
  const remembered = `${owner}|${root}`;
  const entry = staticEntry(root, file, lastEntry.get(remembered));
  if (entry && !needsServer(root, entry, file)) {
    let real;
    try { real = fs.realpathSync(entry); } catch { return { ok: false, reason: 'no-page' }; }
    if (!within(root, real)) return { ok: false, reason: 'outside' };
    lastEntry.set(remembered, real);
    const rel = path.relative(root, real).split(path.sep);
    return session(owner, root, `file:${real}`, { entry: '/' + rel.map(encodeURIComponent).join('/'), label: rel.join('/') });
  }
  const server = localUrl(req.server);
  if (server) {
    const u = new URL(server);
    return session(owner, root, `server:${server}`, { server: u.origin, entry: (u.pathname || '/') + u.search, label: u.host });
  }
  return { ok: false, reason: entry ? 'needs-server' : 'no-page' };
}

const headers = (type, csp) => ({ 'content-type': type, 'content-security-policy': csp, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
const fail = (status) => new Response(status === 404 ? 'Not found' : 'Not allowed', { status, headers: headers('text/plain; charset=utf-8', "default-src 'none'") });

async function staticFile(s, pathname, head) {
  // Hidden files and folders (.env, .git) are never served.
  if (pathname.split('/').some((part) => part.startsWith('.') || part.includes('\\') || part.includes('\0'))) return fail(403);
  let real;
  try { real = await fsp.realpath(path.join(s.root, pathname)); } catch { return fail(404); }
  if (!within(s.root, real)) return fail(403);
  let stat = await fsp.stat(real).catch(() => null);
  if (stat?.isDirectory()) { real = path.join(real, 'index.html'); stat = await fsp.stat(real).catch(() => null); }
  if (!stat?.isFile()) return fail(404);
  if (stat.size > MAX_FILE) return fail(403);
  const type = TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream';
  return new Response(head ? null : await fsp.readFile(real), { status: 200, headers: headers(/^text\/|javascript|json|xml|svg/.test(type) ? `${type}; charset=utf-8` : type, PAGE_CSP) });
}

async function proxy(s, url, method, fetchImpl) {
  const target = new URL(url.pathname + url.search, s.server);
  if (target.origin !== s.server) return fail(403);
  let res;
  try { res = await fetchImpl(target, { method, redirect: 'manual', headers: { accept: '*/*' }, signal: AbortSignal.timeout(15000) }); }
  catch { return new Response('The dev server is not answering.', { status: 502, headers: headers('text/plain; charset=utf-8', "default-src 'none'") }); }
  if (res.status >= 300 && res.status < 400) {
    let next = null;
    try { next = new URL(res.headers.get('location') || '', target); } catch {}
    if (next?.origin !== s.server) return fail(403);
    return new Response(null, { status: res.status, headers: { ...headers('text/plain', "default-src 'none'"), location: next.pathname + next.search } });
  }
  return new Response(method === 'HEAD' ? null : res.body, { status: res.status, headers: headers(res.headers.get('content-type') || 'application/octet-stream', PAGE_CSP) });
}

async function serve(request, fetchImpl = fetch) {
  let url;
  try { url = new URL(request.url); } catch { return fail(404); }
  const s = sessions.get(url.hostname);
  if (!s) return fail(404);
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(403);
  s.used = Date.now();
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return fail(404); }
  if (pathname.startsWith('/__studio/')) {
    const name = pathname.slice('/__studio/'.length);
    if (!Object.hasOwn(PAGE_FILES, name)) return fail(404);
    return new Response(await fsp.readFile(path.join(__dirname, 'studio-page', name)), { headers: headers(`${PAGE_FILES[name]}; charset=utf-8`, HOST_CSP) });
  }
  return s.server ? proxy(s, url, request.method, fetchImpl) : staticFile(s, pathname, request.method === 'HEAD');
}

/** A Studio document only ever navigates within its own session origin. */
function guardNavigation(contents) {
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    let from;
    try { from = new URL(event.frame?.url || ''); } catch { return; }
    if (from.protocol !== `${SCHEME}:`) return;
    let to = null;
    try { to = new URL(event.url); } catch {}
    if (to?.protocol !== `${SCHEME}:` || to.host !== from.host) event.preventDefault();
  });
}

function install({ protocol, ipcMain, app }) {
  const owners = new Set();
  ipcMain.handle('studio:open', (event, req) => {
    const owner = event.sender.id;
    if (!owners.has(owner)) { owners.add(owner); event.sender.once('destroyed', () => { owners.delete(owner); closeOwner(owner); }); }
    return open(owner, req);
  });
  ipcMain.handle('studio:close', (event, id) => { const s = sessions.get(id); if (s?.owner === event.sender.id) close(id); });
  protocol.handle(SCHEME, (request) => serve(request));
  app.on('web-contents-created', (_event, contents) => guardNavigation(contents));
}

module.exports = { install, open, close, closeOwner, serve, guardNavigation, staticEntry, needsServer, SCHEME, PAGE_CSP };
