const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { readCatalog, decryptDesktop } = require('./connect-catalog.cjs');
const scopes = 'orchestration:read orchestration:operate filesystem:read';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function createConnectClient({ catalog = readCatalog, decrypt = decryptDesktop, request = fetch, now = Date.now, readSession } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
  const jwk = { kty, crv, x, y };
  const thumbprint = crypto.createHash('sha256').update(JSON.stringify({ crv, kty, x, y })).digest('base64url');
  let snapshot = null, snapshotAt = 0;
  const sessions = new Map(), pending = new Map();
  const proof = (method, address, token) => {
    const url = new URL(address); url.search = ''; url.hash = '';
    const payload = { htm: method.toUpperCase(), htu: url.toString(), jti: crypto.randomUUID(), iat: Math.floor(now() / 1000), ...(token ? { ath: crypto.createHash('sha256').update(token).digest('base64url') } : {}) };
    const text = `${encode({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encode(payload)}`;
    return `${text}.${crypto.sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };
  async function json(url, options = {}) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(12000), redirect: 'error' });
    let body;
    try { body = await response.json(); } catch { const error = new Error('T3 Connect returned an empty response. Try again.'); error.status = response.status; error.endpoint = new URL(url).pathname; throw error; }
    if (!response.ok) { const error = new Error(response.status === 401 || response.status === 403 ? 'T3 Connect could not authorize this connection. Check that T3 is signed in.' : 'T3 Connect could not reach this building. Try again.'); error.status = response.status; error.reason = body?.reason || body?.error; error.endpoint = new URL(url).pathname; throw error; }
    return body;
  }
  function inventory(fresh = false) {
    if (!fresh && snapshot && now() - snapshotAt < 60000) return snapshot;
    const data = catalog();
    const disabled = new Set(data.disabledEnvironmentIds || []);
    const devices = new Map();
    // Connect can save several routes for one device, including profile-only
    // connections. A route is not a separate building.
    for (const row of [...(data.targets || []), ...(data.profiles || [])]) {
      const id = typeof row?.environmentId === 'string' ? row.environmentId.trim() : '';
      if (!id || disabled.has(id)) continue;
      let device = devices.get(id);
      if (!device) { device = { environmentId: id, label: '', status: 'unknown', urls: [], desktop: true }; devices.set(id, device); }
      if (!device.label && typeof row.label === 'string') device.label = row.label.trim();
      if (typeof row.httpBaseUrl === 'string') {
        try {
          const url = new URL(row.httpBaseUrl);
          if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !device.urls.includes(url.origin)) device.urls.push(url.origin);
        } catch {}
      }
    }
    snapshot = [...devices.values()];
    snapshotAt = now(); return snapshot;
  }
  async function authorize(environmentId) {
    if (!inventory().some(t => t.environmentId === environmentId)) throw Error('This building is not saved in T3 Connect.');
    const relay = 'https://relay.t3.codes';
    const home = process.env.T3CODE_HOME || path.join(os.homedir(), '.t3');
    const stored = readSession ? null : JSON.parse(fs.readFileSync(path.join(home, 'userdata', 'clerk-tokens.json'), 'utf8')).__clerk_client_jwt;
    const client = readSession ? await readSession() : stored?.startsWith('enc:') ? decrypt(stored.slice(4)) : stored?.startsWith('raw:') ? stored.slice(4) : null;
    if (!client) throw Error('T3 Connect is not signed in. Open T3 Code to restore its session.');
    const signedIn = await json('https://clerk.t3.codes/v1/client', { headers: { authorization: `Bearer ${client}` } });
    const userSession = signedIn.response?.sessions?.find(s => s.status === 'active' && s.id === signedIn.response.last_active_session_id) || signedIn.response?.sessions?.find(s => s.status === 'active');
    if (!userSession) throw Error('T3 Connect is not signed in. Open T3 Code to restore its session.');
    const clerkToken = await json(`https://clerk.t3.codes/v1/client/sessions/${encodeURIComponent(userSession.id)}/tokens/t3-relay`, { method: 'POST', headers: { authorization: `Bearer ${client}`, 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
    const exchangeUrl = `${relay}/v1/client/dpop-token`;
    const access = await json(exchangeUrl, { method: 'POST', headers: { dpop: proof('POST', exchangeUrl) }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: clerkToken.jwt, subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token', resource: relay, scope: 'environment:connect', client_id: 't3-web' }) });
    const connectUrl = `${relay}/v1/environments/${encodeURIComponent(environmentId)}/connect`;
    const connection = await json(connectUrl, { method: 'POST', headers: { authorization: `DPoP ${access.access_token}`, dpop: proof('POST', connectUrl, access.access_token), 'content-type': 'application/json' }, body: JSON.stringify({ clientProofKeyThumbprint: thumbprint }) });
    if (connection.environmentId !== environmentId) throw Error('T3 Connect returned a different building.');
    const origin = new URL(connection.endpoint.httpBaseUrl).origin;
    const tokenUrl = `${origin}/oauth/token`;
    const token = await json(tokenUrl, { method: 'POST', headers: { dpop: proof('POST', tokenUrl) }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: connection.credential, subject_token_type: 'urn:t3:params:oauth:token-type:environment-bootstrap', requested_token_type: 'urn:ietf:params:oauth:token-type:access_token', scope: scopes, client_label: 'Lucid', client_device_type: 'desktop', client_os: process.platform }) });
    let route = origin;
    for (const address of inventory().find(t => t.environmentId === environmentId)?.urls || []) {
      try {
        const candidate = new URL(address);
        if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) continue;
        const descriptor = await json(candidate.origin + '/.well-known/t3/environment');
        if (descriptor.environmentId === environmentId) { route = candidate.origin; break; }
      } catch {}
    }
    const session = { origin: route, token: token.access_token, expires: now() + token.expires_in * 1000 };
    sessions.set(environmentId, session); return session;
  }
  async function session(id) {
    const old = sessions.get(id); if (old?.expires > now() + 60000) return old;
    if (!pending.has(id)) pending.set(id, authorize(id).finally(() => pending.delete(id)));
    return pending.get(id);
  }
  return {
    inventory,
    async rpc(id, tag, payload) {
      const ticket = await this.fetch(id, '/api/auth/websocket-ticket/rpc', { method: 'POST' });
      const s = await session(id), url = new URL(s.origin.replace(/^http/, 'ws') + '/ws');
      url.searchParams.set('orchestrationProtocol', '2'); url.searchParams.set('wsTicket', ticket.ticket);
      url.searchParams.set('dpop', proof('GET', s.origin + '/ws', ticket.ticket));
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url), timer = setTimeout(() => finish(Error('The building did not answer in time.')), 15000);
        const finish = (error, value) => { clearTimeout(timer); ws.close(); error ? reject(error) : resolve(value); };
        ws.addEventListener('open', () => ws.send(JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] })), { once: true });
        ws.addEventListener('error', () => finish(Error('The building connection closed.')), { once: true });
        ws.addEventListener('message', event => {
          let messages; try { messages = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString()); } catch { return; }
          for (const m of Array.isArray(messages) ? messages : [messages]) {
            if (m._tag === 'Ping') ws.send(JSON.stringify({ _tag: 'Pong' }));
            if (m._tag === 'Exit' && String(m.requestId) === '1') {
              if (m.exit?._tag === 'Success') finish(null, m.exit.value);
              else finish(Error('T3 could not complete this building action.'));
            }
          }
        });
      });
    },
    async fetch(id, route, options = {}, retried = false) {
      if (!route.startsWith('/') || route.startsWith('//')) throw Error('Invalid building route.');
      const s = await session(id), address = s.origin + route;
      try { return await json(address, { ...options, headers: { 'x-t3-orchestration-protocol': '2', ...options.headers, authorization: `DPoP ${s.token}`, dpop: proof(options.method || 'GET', address, s.token) } }); }
      catch (e) { if (e.status === 401 && !retried) { sessions.delete(id); return this.fetch(id, route, options, true); } throw e; }
    },
  };
}
module.exports = { createConnectClient };
