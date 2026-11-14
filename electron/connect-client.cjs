// Authenticated links to the other computers saved in T3 Code (its connection catalog), the
// way T3's own window connects: T3 Connect (relay) issues a short-lived bootstrap credential
// for that environment, the environment exchanges it for a DPoP-bound access token, and
// reads then use the best saved route that answers as that environment (LAN, Tailscale,
// or the relay endpoint). Credentials and tokens never leave this module.
const crypto = require('node:crypto');
const { createCatalogStore } = require('./connect-catalog.cjs');
const { readDesktopSession } = require('./connect-session.cjs');
const scopes = 'orchestration:read orchestration:operate filesystem:read';
const RELAY = 'https://relay.t3.codes', CLERK = 'https://clerk.t3.codes';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

/** lan, tailscale or public for one saved address. T3 marks Tailscale routes it learned. */
function routeKind(origin, network) {
  if (network === 'tailscale') return 'tailscale';
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
  const v4 = host.split('.').map(Number);
  if (v4.length === 4 && v4.every(n => Number.isInteger(n) && n >= 0 && n < 256)) {
    if (v4[0] === 100 && v4[1] >= 64 && v4[1] < 128) return 'tailscale';
    if (v4[0] === 10 || (v4[0] === 172 && v4[1] >= 16 && v4[1] < 32) || (v4[0] === 192 && v4[1] === 168) || (v4[0] === 169 && v4[1] === 254)) return 'lan';
    return 'public';
  }
  if (/\.ts\.net$/i.test(host)) return 'tailscale';
  if (/\.(local|lan|home|internal)$/i.test(host) || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return 'lan';
  return 'public';
}
const RANK = { lan: 0, tailscale: 1, public: 2, relay: 3 };

/**
 * The fastest saved route that really is this environment. A saved LAN address can belong
 * to another machine on another network, so each answer's environment id is checked.
 */
async function pickRoute(routes, environmentId, probe) {
  const answers = await Promise.all(routes.map(async route => {
    try { return (await probe(route.origin))?.environmentId === environmentId ? route : null; } catch { return null; }
  }));
  return answers.filter(Boolean).sort((a, b) => RANK[a.kind] - RANK[b.kind])[0] || null;
}

/** Saved computers from the decrypted catalog: one per environment, routes deduplicated. */
function devicesFrom(data) {
  const disabled = new Set(Array.isArray(data?.disabledEnvironmentIds) ? data.disabledEnvironmentIds : []);
  const devices = new Map();
  // A computer can have several saved routes (relay, learned LAN and Tailscale addresses).
  // A route is not a separate building.
  for (const row of [...(Array.isArray(data?.targets) ? data.targets : []), ...(Array.isArray(data?.profiles) ? data.profiles : [])]) {
    const id = typeof row?.environmentId === 'string' ? row.environmentId.trim() : '';
    if (!id || disabled.has(id)) continue;
    let device = devices.get(id);
    if (!device) { device = { environmentId: id, label: '', routes: [], relay: false }; devices.set(id, device); }
    if (!device.label && typeof row.label === 'string') device.label = row.label.trim();
    if (row._tag === 'RelayConnectionTarget') device.relay = true;
    // SSH routes need T3's own tunnel; only HTTP routes can be used here.
    if (typeof row.httpBaseUrl !== 'string') continue;
    try {
      const url = new URL(row.httpBaseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || device.routes.some(r => r.origin === url.origin)) continue;
      device.routes.push({ origin: url.origin, kind: routeKind(url.origin, row.network) });
    } catch {}
  }
  return [...devices.values()];
}

function createConnectClient({ catalog, request = fetch, now = Date.now, readSession, probeTimeout = 2500 } = {}) {
  let store = null;
  const catalogStore = () => store ||= createCatalogStore();
  const readCatalog = catalog || (() => catalogStore().read());
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
  const jwk = { kty, crv, x, y };
  const thumbprint = crypto.createHash('sha256').update(JSON.stringify({ crv, kty, x, y })).digest('base64url');
  let devices = null, snapshot = null, snapshotAt = 0, pendingInventory = null;
  const sessions = new Map(), pending = new Map();
  const proof = (method, address, token) => {
    const url = new URL(address); url.search = ''; url.hash = '';
    const payload = { htm: method.toUpperCase(), htu: url.toString(), jti: crypto.randomUUID(), iat: Math.floor(now() / 1000), ...(token ? { ath: crypto.createHash('sha256').update(token).digest('base64url') } : {}) };
    const text = `${encode({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encode(payload)}`;
    return `${text}.${crypto.sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };
  async function json(url, options = {}, timeout = 12000) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(timeout), redirect: 'error' });
    let body;
    try { body = await response.json(); } catch { const error = new Error('T3 Connect returned an empty response. Try again.'); error.status = response.status; error.endpoint = new URL(url).pathname; throw error; }
    if (!response.ok) { const error = new Error(response.status === 401 || response.status === 403 ? 'T3 Connect could not authorize this connection. Check that T3 Code is signed in.' : 'T3 Connect could not reach this computer. Try again.'); error.status = response.status; error.reason = body?.reason || body?.error; error.endpoint = new URL(url).pathname; throw error; }
    return body;
  }
  const probe = origin => json(`${origin}/.well-known/t3/environment`, {}, probeTimeout);
  /** Public view of one device: no credentials, only addresses and the route kind in use. */
  const publicRow = d => ({ environmentId: d.environmentId, label: d.label, status: d.status, urls: d.routes.map(r => r.origin), route: sessions.get(d.environmentId)?.kind || d.route?.kind || null, desktop: true });
  async function readInventory() {
    const read = await readCatalog();
    if (read.state !== 'ok' && read.state !== 'missing') throw Object.assign(Error(read.reason || 'The computers linked in T3 Code could not be read.'), { publicReason: read.reason, catalogState: read.state });
    const found = devicesFrom(read.catalog);
    // Reachability comes from each computer's public descriptor, before any sign-in.
    await Promise.all(found.map(async d => {
      d.route = await pickRoute(d.routes, d.environmentId, probe);
      // Without an answering address, T3 Connect may still reach it through its tunnel.
      d.status = d.route ? 'reachable' : d.relay || !d.routes.length ? 'unknown' : 'unreachable';
    }));
    // A computer removed or disabled in T3 loses its link here too.
    for (const id of sessions.keys()) if (!found.some(d => d.environmentId === id)) sessions.delete(id);
    devices = found; snapshotAt = now();
    snapshot = found.map(publicRow);
    return snapshot;
  }
  async function inventory(fresh = false) {
    if (!fresh && snapshot && now() - snapshotAt < 60000) return snapshot.map(row => ({ ...row, route: sessions.get(row.environmentId)?.kind || row.route }));
    if (!pendingInventory) pendingInventory = readInventory().finally(() => { pendingInventory = null; });
    return pendingInventory;
  }
  async function exchange(origin, credential) {
    const tokenUrl = `${origin}/oauth/token`;
    return json(tokenUrl, { method: 'POST', headers: { dpop: proof('POST', tokenUrl) }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: credential, subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token', scope: scopes, client_label: require('./brand.cjs').name, client_device_type: 'desktop', client_os: process.platform }) });
  }
  async function authorize(environmentId) {
    await inventory();
    const device = devices?.find(d => d.environmentId === environmentId);
    if (!device) throw Error('This computer is not saved in T3 Code.');
    // Prefer a saved direct route that answers now; the relay endpoint is the fallback.
    const directRoute = pickRoute(device.routes, environmentId, probe);
    try { return await connectThrough(device, await directRoute); }
    catch (error) {
      const direct = await directRoute;
      if (direct || error.status === 401 || error.status === 403 || /signed in/.test(error.message)) throw error;
      device.status = 'unreachable';
      throw Object.assign(Error('It does not answer on its saved addresses or through T3 Connect.'), { offline: true });
    }
  }
  async function connectThrough(device, direct) {
    const environmentId = device.environmentId;
    const client = readSession ? await readSession() : await readDesktopSession({ decrypt: catalogStore().decrypt });
    if (!client) throw Error('T3 Connect is not signed in. Open T3 Code to restore its session.');
    const signedIn = await json(`${CLERK}/v1/client`, { headers: { authorization: `Bearer ${client}` } });
    const userSession = signedIn.response?.sessions?.find(s => s.status === 'active' && s.id === signedIn.response.last_active_session_id) || signedIn.response?.sessions?.find(s => s.status === 'active');
    if (!userSession) throw Error('T3 Connect is not signed in. Open T3 Code to restore its session.');
    const clerkToken = await json(`${CLERK}/v1/client/sessions/${encodeURIComponent(userSession.id)}/tokens/t3-relay`, { method: 'POST', headers: { authorization: `Bearer ${client}`, 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
    const exchangeUrl = `${RELAY}/v1/client/dpop-token`;
    const access = await json(exchangeUrl, { method: 'POST', headers: { dpop: proof('POST', exchangeUrl) }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: clerkToken.jwt, subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token', resource: RELAY, scope: 'environment:connect', client_id: 't3-web' }) });
    const connectUrl = `${RELAY}/v1/environments/${encodeURIComponent(environmentId)}/connect`;
    const connection = await json(connectUrl, { method: 'POST', headers: { authorization: `DPoP ${access.access_token}`, dpop: proof('POST', connectUrl, access.access_token), 'content-type': 'application/json' }, body: JSON.stringify({ clientProofKeyThumbprint: thumbprint }) });
    if (connection.environmentId !== environmentId) throw Error('T3 Connect returned a different computer.');
    const endpoint = new URL(connection.endpoint.httpBaseUrl).origin;
    device.route = direct; if (direct) device.status = 'reachable';
    let token = null, used = null, failure = null;
    for (const route of [direct, { origin: endpoint, kind: 'relay' }].filter(Boolean)) {
      try { token = await exchange(route.origin, connection.credential); used = route; break; } catch (error) { failure = error; }
    }
    if (!token) throw failure || Error('This computer did not accept the connection.');
    const session = { origin: used.origin, kind: used.kind, token: token.access_token, expires: now() + token.expires_in * 1000 };
    sessions.set(environmentId, session); return session;
  }
  async function session(id) {
    const old = sessions.get(id); if (old?.expires > now() + 60000) return old;
    if (!pending.has(id)) pending.set(id, authorize(id).finally(() => pending.delete(id)));
    return pending.get(id);
  }
  // A dropped route (left the LAN, Tailscale down) or an expired token re-authorizes once.
  const retryable = error => error?.status === 401 || error?.status === undefined;
  const checkRoute = route => { if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) throw Error('Invalid building route.'); };
  return {
    inventory,
    /** The route kind an authenticated link uses (lan, tailscale, public, relay), or null. */
    routeOf: id => sessions.get(id)?.kind || null,
    /** Re-reads the catalog when T3 rewrites it. */
    onCatalogChange(listener) {
      if (catalog) return () => {};
      return catalogStore().onChange(() => { snapshot = null; listener(); });
    },
    async rpc(id, tag, payload) {
      const ticket = await this.fetch(id, '/api/auth/websocket-ticket/rpc', { method: 'POST' });
      const s = await session(id), url = new URL(s.origin.replace(/^http/, 'ws') + '/ws');
      url.searchParams.set('orchestrationProtocol', '2'); url.searchParams.set('wsTicket', ticket.ticket);
      url.searchParams.set('dpop', proof('GET', s.origin + '/ws', ticket.ticket));
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url), timer = setTimeout(() => finish(Error('The computer did not answer in time.')), 15000);
        const finish = (error, value) => { clearTimeout(timer); ws.close(); error ? reject(error) : resolve(value); };
        ws.addEventListener('open', () => ws.send(JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] })), { once: true });
        ws.addEventListener('error', () => finish(Error('The connection to this computer closed.')), { once: true });
        ws.addEventListener('message', event => {
          let messages; try { messages = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString()); } catch { return; }
          for (const m of Array.isArray(messages) ? messages : [messages]) {
            if (m._tag === 'Ping') ws.send(JSON.stringify({ _tag: 'Pong' }));
            if (m._tag === 'Exit' && String(m.requestId) === '1') {
              if (m.exit?._tag === 'Success') finish(null, m.exit.value);
              else finish(Error('T3 could not complete this action on that computer.'));
            }
          }
        });
      });
    },
    /** Bytes of a building route (signed media), with the same authorization as fetch. */
    async raw(id, route, retried = false) {
      checkRoute(route);
      const s = await session(id), address = s.origin + route;
      let response;
      try { response = await request(address, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { 'x-t3-orchestration-protocol': '2', authorization: `DPoP ${s.token}`, dpop: proof('GET', address, s.token) } }); }
      catch (error) { if (!retried) { sessions.delete(id); return this.raw(id, route, true); } throw error; }
      if (response.status === 401 && !retried) { sessions.delete(id); return this.raw(id, route, true); }
      if (!response.ok) { const error = new Error('The computer could not send this file.'); error.status = response.status; throw error; }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > 32 * 1024 * 1024) throw Error('This file is too large to show here.');
      return { body, type: (response.headers.get('content-type') || '').split(';')[0].trim() };
    },
    async fetch(id, route, options = {}, retried = false) {
      checkRoute(route);
      const s = await session(id), address = s.origin + route;
      try { return await json(address, { ...options, headers: { 'x-t3-orchestration-protocol': '2', ...options.headers, authorization: `DPoP ${s.token}`, dpop: proof(options.method || 'GET', address, s.token) } }); }
      catch (e) { if (retryable(e) && !retried) { sessions.delete(id); return this.fetch(id, route, options, true); } throw e; }
    },
  };
}
module.exports = { createConnectClient, devicesFrom, pickRoute, routeKind };
