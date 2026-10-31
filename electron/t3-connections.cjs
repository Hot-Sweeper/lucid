// Import the user's existing T3 desktop session in an isolated helper. Session
// credentials stay in main processes. The non-exportable proof key never leaves Chromium.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { app, safeStorage, BrowserWindow, protocol } = require('electron');
const home = process.env.T3CODE_HOME || path.join(os.homedir(), '.t3');
const catalogPath = () => path.join(home, 'userdata', 'connection-catalog.json');

// Runs only in the isolated helper's renderer, with no Lucid preload or app code.
async function signProof(input) {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('t3code:cloud-auth');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  let key = globalThis.__lucidProofKey || (db.objectStoreNames.contains('keys') ? await new Promise((resolve, reject) => {
    const r = db.transaction('keys', 'readonly').objectStore('keys').get('relay-dpop-proof-key');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  }) : null);
  db.close();
  const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  // A T3 Connect account may have linked a machine without opening it on this
  // desktop yet. Use an ephemeral proof key with that same signed-in session.
  if (!key) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const canonical = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
    key = { privateKey: pair.privateKey, publicJwk, thumbprint: b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))) };
  }
  globalThis.__lucidProofKey = key;
  if (input.thumbprint && key.thumbprint !== input.thumbprint) throw new Error('T3 session key changed');
  if (input.metadata) return key.thumbprint;
  const encode = (v) => b64(new TextEncoder().encode(JSON.stringify(v)));
  const target = new URL(input.url); target.search = ''; target.hash = '';
  const head = encode({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk });
  const body = encode({ htm: input.method, htu: target.href, jti: crypto.randomUUID(), iat: Math.floor(Date.now()/1000), ...(input.token ? { ath: b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.token))) } : {}) });
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + b64(signature);
}
function runImporter() {
  const profile = process.env.LUCID_T3_IMPORT_PROFILE;
  if (!profile || !safeTemp(profile)) { process.stdout.write(JSON.stringify({ error: 'Invalid session helper profile.' })); app.quit(); return; }
  const candidates = [process.env.T3CODE_ELECTRON_USER_DATA_DIR, path.join(app.getPath('appData'), 't3code-v2'), path.join(app.getPath('appData'), 't3code')].filter(Boolean);
  const source = candidates.find((p) => fs.existsSync(path.join(p, 'Local State')));
  if (source) {
    fs.copyFileSync(path.join(source, 'Local State'), path.join(profile, 'Local State'));
    if (JSON.parse(process.env.LUCID_T3_IMPORT_REQUEST || '{}').environmentId && fs.existsSync(path.join(source, 'IndexedDB'))) fs.cpSync(path.join(source, 'IndexedDB'), path.join(profile, 'IndexedDB'), { recursive: true, filter: (p) => path.basename(p) !== 'LOCK' });
  }
  app.setPath('userData', profile);
  app.disableHardwareAcceleration();
  protocol.registerSchemesAsPrivileged([{ scheme: 't3code', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  const inputReady = Promise.resolve(JSON.parse(process.env.LUCID_T3_IMPORT_REQUEST || '{}'));
  app.whenReady().then(async () => {
    try {
      const document = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
      const catalog = JSON.parse(safeStorage.decryptString(Buffer.from(document.encryptedCatalog, 'base64')));
      const disabled = new Set(catalog.disabledEnvironmentIds || []), records = [], seen = new Set();
      for (const target of catalog.targets || []) {
        if (target._tag === 'PrimaryConnectionTarget' || disabled.has(target.environmentId) || seen.has(target.environmentId)) continue;
        const profiles = (catalog.profiles || []).filter((p) => p.environmentId === target.environmentId && p._tag === 'BearerConnectionProfile');
        const credential = (catalog.credentials || []).find((c) => profiles.some((p) => p.connectionId === c.connectionId))?.credential;
        const dpop = (catalog.remoteDpopTokens || []).find((t) => t.environmentId === target.environmentId);
        seen.add(target.environmentId);
        records.push({ id: target.environmentId, label: target.label, origins: [...new Set([...profiles.map((p) => p.httpBaseUrl), dpop?.endpoint?.httpBaseUrl].filter(Boolean))], token: credential?.token, dpop, relay: (catalog.targets || []).some((t) => t.environmentId === target.environmentId && t._tag === 'RelayConnectionTarget'), source: 't3' });
      }
      const input = await inputReady;
      if (!input.environmentId) {
        process.stdout.write(JSON.stringify({ records: records.map(({ token, dpop, ...r }) => r) }));
      } else {
        const record = records.find((r) => r.id === input.environmentId);
        if (!record || (input.origin && !record.origins.some((o) => new URL(o).origin === input.origin))) throw new Error('Unknown connection');
        const { descriptor } = require('./remote-rpc.cjs');
        let origin = input.origin;
        if (origin) { const info = await descriptor(origin); if (info.environmentId !== record.id) throw new Error('Machine identity changed'); }
        let window;
        const proof = async (method, url, token, metadata = false) => {
          if (!window) {
            protocol.handle('t3code', () => new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } }));
            window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
            await window.loadURL('t3code://app/');
          }
          return window.webContents.executeJavaScript('(' + signProof.toString() + ')(' + JSON.stringify({ method, url, token, thumbprint: token && token === record.dpop?.accessToken ? record.dpop.dpopThumbprint : undefined, metadata }) + ')');
        };
        const renew = async () => {
          const thumbprint = await proof(undefined, undefined, undefined, true);
          record.dpop = await require('./t3-connect.cjs').renew({ home, safeStorage, record, proof, thumbprint });
          origin ||= new URL(record.dpop.endpoint.httpBaseUrl).origin;
        };
        const changedKey = record.dpop && await proof(undefined, undefined, undefined, true) !== record.dpop.dpopThumbprint;
        let renewed = false;
        if (record.relay && (!record.dpop || record.dpop.expiresAtEpochMs <= Date.now() + 60000 || input.refresh || !origin || changedKey)) { await renew(); renewed = true; }
        if (!origin) throw new Error('No reachable T3 route.');
        const issue = async () => {
          const ticketUrl = origin + '/api/auth/websocket-ticket/rpc';
          const headers = record.dpop ? { authorization: 'DPoP ' + record.dpop.accessToken, dpop: await proof('POST', ticketUrl, record.dpop.accessToken) } : { authorization: 'Bearer ' + record.token };
          return fetch(ticketUrl, { method: 'POST', headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
        };
        let response = await issue();
        if (response.status === 401 && record.relay && !renewed) { await renew(); response = await issue(); }
        if (!response.ok) throw new Error('T3 session could not authorize this connection');
        const { ticket } = await response.json();
        const url = new URL(origin.replace(/^http/, 'ws') + '/ws?orchestrationProtocol=2');
        url.searchParams.set('wsTicket', ticket);
        if (record.dpop) url.searchParams.set('dpop', await proof('GET', origin + '/ws', ticket));
        process.stdout.write(JSON.stringify({ socketUrl: url.href, origin }));
      }
    } catch {
      process.stdout.write(JSON.stringify({ error: 'The current T3 Code session could not open this machine. Open it in T3 Code, then retry in Lucid.' }));
    } finally { app.quit(); }
  });
}
function safeTemp(profile) {
  const relative = path.relative(fs.realpathSync(os.tmpdir()), path.resolve(profile));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(profile).startsWith('lucid-t3-import-');
}

let cache = null, pending = null;
async function existingConnections() {
  if (!fs.existsSync(catalogPath())) return { records: [] };
  const stamp = fs.statSync(catalogPath()).mtimeMs;
  if (cache?.stamp === stamp) return cache.value;
  if (pending) return pending;
  pending = importSession({}).then((value) => { cache = { stamp, value }; return value; }).finally(() => { pending = null; });
  return pending;
}
function importSession(input) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-t3-import-'));
  const env = { ...process.env, LUCID_T3_IMPORT_PROFILE: profile, LUCID_T3_IMPORT_REQUEST: JSON.stringify(input) }; delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const args = app.isPackaged ? ['--lucid-t3-connections'] : [path.join(__dirname, '..'), '--lucid-t3-connections'];
    const child = execFile(process.execPath, args, { env, windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      try { if (safeTemp(profile)) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { return reject(new Error('The isolated T3 session helper could not clean up its temporary profile.')); }
      if (error) return reject(new Error('Could not read the current T3 Code connection. Keep T3 Code open and try again.'));
      try { const value = JSON.parse(stdout); if (value.error) reject(new Error(value.error)); else resolve(value); }
      catch { reject(new Error("T3 Code's current connection could not be read.")); }
    });
    child.stdin.end();
  });
}
async function connection(environmentId, origin, refresh = false) { return importSession({ environmentId, origin, refresh }); }
module.exports = { existingConnections, runImporter, connection };
