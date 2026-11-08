// Privileged connector. Signing keys never enter the renderer or any preview URL.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { signedHeaders } = require('./studio-auth.cjs');
const gateways = new Map();
const CONFIG = () => process.env.LUCID_ARES_CONFIG || path.join(os.homedir(), '.config', 'lucid', 'ares.json');
function configuration() {
  let c; try { c = JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { throw Error('Ares is not connected. Run the Lucid Ares setup on the two computers.'); }
  const u = new URL(c.url); if (u.protocol !== 'https:' || !u.hostname.endsWith('.ts.net') || u.username || u.password || u.search || u.hash) throw Error('Ares connector must use its authenticated HTTPS tailnet route.');
  return { ...c, url: c.url.replace(/\/$/, '') };
}
async function remote(method, target, data, raw = false) {
  const c = configuration(), body = data === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(data));
  const headers = { ...signedHeaders(c.privateKey, method, target, body), 'Content-Type': 'application/json' };
  let response; try { response = await fetch(c.url + target, { method, headers, body: body.length ? body : undefined, signal: AbortSignal.timeout(target.includes('/render') ? 90000 : 95000) }); }
  catch (e) { throw Error(`Ares is unavailable. Reconnect to the tailnet and retry. ${e.cause?.code || e.message}`); }
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw Error(err.error || `Ares returned HTTP ${response.status}.`); }
  if (raw) return { body: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') || 'application/octet-stream' };
  return response.json();
}
function id(value) { if (typeof value !== 'string' || !/^[a-z0-9-]{16,80}$/.test(value)) throw Error('Invalid Ares project.'); return value; }
async function gateway(projectId) {
  id(projectId); if (gateways.has(projectId)) return gateways.get(projectId).url;
  const state = { width: 1440, theme: 'light', version: -1, working: false, render: null, error: null, pending: false, lastCheck: 0, snapshots: new Map(), server: null, closed: false, clients: 0, lastUsed: Date.now() };
  async function synchronize(force = false) {
    if (state.pending || state.closed || (!force && Date.now() - state.lastCheck < 500)) return;
    state.pending = true; state.lastCheck = Date.now();
    const width = state.width, theme = state.theme;
    try {
      const p = await remote('GET', `/projects/${projectId}`); state.working = !!p.turn;
      const key = `${p.version}-${width}-${theme}`;
      if (key !== state.render?.key) {
        const render = await remote('GET', `/projects/${projectId}/render?width=${width}&theme=${theme}`);
        if (state.width !== width || state.theme !== theme || state.closed) return;
        const version = ++state.version;
        state.render = { key, version, digest: render.digest, problems: render.problems };
        state.snapshots.set(version, render.html.replace(/<head([^>]*)>/i, '<head$1><base href="/">'));
        while (state.snapshots.size > 4) state.snapshots.delete(state.snapshots.keys().next().value);
      }
      state.error = null;
    } catch (e) { state.error = e.message; } finally { state.pending = false; }
  }
  const publicDir = path.join(__dirname, 'studio-public');
  const handler = async (req, res, assetsOnly = false) => {
    state.lastUsed = Date.now();
    const url = new URL(req.url, 'http://preview');
    // This origin contains project assets and inert render playback only, no execution API.
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()' };
    const send = (status, type, data) => { res.writeHead(status, { ...headers, 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : data); };
    if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'text/plain', 'Preview is read only.');
    try {
      if (!assetsOnly && url.pathname === '/__lucid/state') { await synchronize(); return send(200, 'application/json', JSON.stringify({ version: state.render?.version ?? -1, working: state.working, error: state.error, width: state.width, theme: state.theme, liveUrl: state.liveUrl, problems: state.render?.problems })); }
      if (!assetsOnly && url.pathname === '/__lucid/frame') { const v = Number(url.searchParams.get('ares')); const html = state.snapshots.get(v) || state.snapshots.get(state.render?.version); if (!html) return send(404, 'text/plain', 'Waiting for a rendered page.'); return send(200, 'text/html; charset=utf-8', html); }
      if (!assetsOnly && ['/__lucid/studio', '/__lucid/stage.mjs', '/__lucid/host.mjs', '/__lucid/stage.css'].includes(url.pathname)) {
        const file = url.pathname === '/__lucid/studio' ? 'index.html' : url.pathname.split('/').pop();
        // Restrict the trusted wrapper itself. Generated pages use a separate child frame.
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src 'self' http://127.0.0.1:*; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
        return send(200, file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript', await fs.promises.readFile(path.join(publicDir, file)));
      }
      if (url.pathname.startsWith('/__lucid/')) return send(404, 'text/plain', 'Unknown preview route.');
      // Project content cannot navigate into the privileged app's origin. No IPC preload exists here.
      const result = await remote('GET', `/projects/${projectId}/asset?path=${encodeURIComponent(req.url)}`, undefined, true);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Security-Policy', "object-src 'none'");
      return send(200, result.type, result.body);
    } catch (e) { return send(502, 'text/plain; charset=utf-8', e.message); }
  };
  const server = http.createServer((req, res) => void handler(req, res));
  const liveServer = http.createServer((req, res) => void handler(req, res, true));
  await new Promise(resolve => liveServer.listen(0, '127.0.0.1', resolve));
  state.liveServer = liveServer; state.liveUrl = `http://127.0.0.1:${liveServer.address().port}/`;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  Object.assign(state, { server, url: origin + '/__lucid/studio', origin, synchronize }); gateways.set(projectId, state);
  return state.url;
}
async function action(input) {
  switch (input?.action) {
    case 'status': return remote('GET', '/status');
    case 'create': return remote('POST', '/projects', { name: input.name, dir: input.dir || undefined, localProjectId: input.localProjectId });
    case 'project': return remote('GET', `/projects/${id(input.id)}`);
    case 'send': return remote('POST', `/projects/${id(input.id)}/send`, { text: input.text, requestId: input.requestId, model: input.model, effort: input.effort });
    case 'stop': return remote('POST', `/projects/${id(input.id)}/stop`, {});
    case 'approval': return remote('POST', `/projects/${id(input.id)}/approval`, { id: input.requestId, decision: input.decision, answers: input.answers });
    case 'preview': return { url: await gateway(id(input.id)) };
    case 'viewport': { const g = gateways.get(id(input.id)); if (g) { if (![1440, 820, 390].includes(input.width)) throw Error('Unsupported viewport.'); g.width = input.width; g.theme = input.theme === 'dark' ? 'dark' : 'light'; await g.synchronize(true); } return { ok: true }; }
    case 'close': { const key = id(input.id), g = gateways.get(key); if (g) { g.closed = true; g.server.closeAllConnections(); g.server.close(); g.liveServer?.closeAllConnections(); g.liveServer?.close(); gateways.delete(key); } return { ok: true }; }
    default: throw Error('Unknown studio action.');
  }
}
function register(ipcMain, app) {
  ipcMain.handle('studio:action', async (event, input) => {
    // IPC is reserved for the main document. A preview must never invoke this bridge.
    if (event.senderFrame !== event.sender.mainFrame) throw Error('Preview frames cannot control Lucid.');
    return action(input);
  });
  app.on('before-quit', () => { for (const g of gateways.values()) { g.closed = true; g.server.closeAllConnections(); g.server.close(); g.liveServer?.closeAllConnections(); g.liveServer?.close(); } gateways.clear(); });
}
module.exports = { action, remote, gateway, register, configuration };
