// Computers linked in T3 Code: the catalog opens through a fake safeStorage (Linux and macOS)
// or DPAPI (Windows), a locked keyring is asked once per catalog version, the catalog is
// re-read when T3 rewrites it, disabled computers stay hidden, the fastest real route wins,
// reads go to that route of a local fake T3 server, offline computers are reported as such,
// and actions on a remote thread stay on that computer.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createCatalogStore } = require('../../electron/connect-catalog.cjs');
const { createConnectClient, devicesFrom, pickRoute, routeKind } = require('../../electron/connect-client.cjs');
const { createEnvironmentRegistry, createLinkedInventory } = require('../../electron/environments.cjs');
const { createRemoteBuilding } = require('../../electron/remote-building.cjs');
const { threadCommand } = require('../../electron/thread-actions.cjs');

const ARES = '759ac290-8733-4821-b342-9357d3569073';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// The shape T3 0.1.10 writes (connection-catalog.json, decrypted), with fake secrets.
const catalogFor = (lan, tailnet) => ({
  schemaVersion: 1,
  targets: [
    { _tag: 'BearerConnectionTarget', environmentId: ARES, label: 'ARES', connectionId: `learned:${ARES}:${lan}` },
    { _tag: 'BearerConnectionTarget', environmentId: ARES, label: 'ARES', connectionId: `learned:${ARES}:${tailnet}` },
    { _tag: 'RelayConnectionTarget', environmentId: ARES, label: 'ARES' },
    { _tag: 'RelayConnectionTarget', environmentId: 'disabled-device', label: 'Old laptop' },
  ],
  profiles: [
    { _tag: 'BearerConnectionProfile', connectionId: `learned:${ARES}:${lan}`, environmentId: ARES, label: 'ARES', httpBaseUrl: `${lan}/`, wsBaseUrl: lan.replace('http', 'ws') + '/', learned: true, authorization: 't3-connect' },
    { _tag: 'BearerConnectionProfile', connectionId: `learned:${ARES}:${tailnet}`, environmentId: ARES, label: 'ARES', httpBaseUrl: `${tailnet}/`, wsBaseUrl: tailnet.replace('http', 'ws') + '/', learned: true, authorization: 't3-connect', network: 'tailscale' },
  ],
  credentials: [{ connectionId: 'paired', credential: { _tag: 'BearerConnectionCredential', token: 'SECRET-BEARER' } }],
  remoteDpopTokens: [{ environmentId: ARES, accessToken: 'SECRET-DPOP', dpopThumbprint: 'other-key', expiresAtEpochMs: 0 }],
  disabledEnvironmentIds: ['disabled-device'],
});

// Chromium os_crypt stand-in: "v11" + payload. Like Linux, the async API reports itself
// available but cannot open T3's values; the synchronous one can.
function fakeSafeStorage({ locked = false } = {}) {
  const calls = { sync: 0, async: 0 };
  return {
    calls,
    async isAsyncEncryptionAvailable() { return true; },
    async decryptStringAsync() { calls.async++; throw Error('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.'); },
    isEncryptionAvailable() { return true; },
    decryptString(bytes) {
      calls.sync++;
      if (locked || bytes.subarray(0, 3).toString() !== 'v11') throw Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');
      return bytes.subarray(3).toString('utf8');
    },
  };
}
const seal = text => Buffer.concat([Buffer.from('v11'), Buffer.from(text)]).toString('base64');
function writeCatalog(home, catalog) {
  fs.mkdirSync(path.join(home, 'userdata'), { recursive: true });
  const file = path.join(home, 'userdata', 'connection-catalog.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, encryptedCatalog: seal(JSON.stringify(catalog)) }));
  fs.renameSync(file + '.tmp', file);
}

async function catalogChecks(home) {
  writeCatalog(home, catalogFor('http://192.168.178.100:3773', 'http://100.126.199.24:3773'));
  const storage = fakeSafeStorage();
  const store = createCatalogStore({ home, platform: 'linux', safeStorage: storage, helper: null, debounceMs: 20 });
  const read = await store.read();
  assert.equal(read.state, 'ok'); assert.equal(read.catalog.targets[0].label, 'ARES');
  assert.equal(storage.calls.async, 1, 'the async API is tried first'); assert.equal(storage.calls.sync, 1, 'then the synchronous API opens T3\'s value');
  await store.read(); assert.equal(storage.calls.sync, 1, 'an unchanged catalog is not decrypted again');

  // A rewrite (temp file + rename, like T3) is noticed and re-read.
  let changes = 0; store.onChange(() => changes++);
  await wait(30);
  writeCatalog(home, { ...catalogFor('http://192.168.178.100:3773', 'http://100.126.199.24:3773'), disabledEnvironmentIds: [ARES, 'disabled-device'] });
  for (let i = 0; i < 50 && !changes; i++) await wait(20);
  assert(changes >= 1, 'a rewritten catalog notifies its listeners');
  assert.deepEqual(devicesFrom((await store.read()).catalog), [], 'a computer disabled in T3 has no building');
  store.close();

  // A locked keyring: an honest reason, asked once per catalog version, never a stack trace.
  const lockedStorage = fakeSafeStorage({ locked: true });
  const locked = createCatalogStore({ home, platform: 'linux', safeStorage: lockedStorage, helper: null });
  const first = await locked.read();
  assert.equal(first.state, 'locked'); assert.match(first.reason, /keyring/); assert.equal(first.catalog, null);
  await locked.read(); await locked.read();
  assert.equal(lockedStorage.calls.sync, 1, 'a locked keyring is not asked again until the catalog changes');
  const mac = await createCatalogStore({ home, platform: 'darwin', safeStorage: fakeSafeStorage({ locked: true }), helper: null }).read();
  assert.equal(mac.state, 'locked'); assert.match(mac.reason, /keychain/, 'macOS explains that T3 keeps its own keychain item');
  locked.close();

  // Windows keeps the DPAPI path.
  let dpapi = 0;
  const win = await createCatalogStore({ home, platform: 'win32', dpapi: value => { dpapi++; return Buffer.from(value, 'base64').subarray(3).toString(); } }).read();
  assert.equal(win.state, 'ok'); assert.equal(dpapi, 1);

  // Values protected with T3's own app-named key open in the helper, once per value.
  let helped = 0;
  const helperStore = createCatalogStore({ home, platform: 'linux', safeStorage: fakeSafeStorage(), helper: async values => { helped++; return values.map(() => 'clerk-client'); } });
  assert.equal(await helperStore.decrypt(Buffer.from('async-only').toString('base64')), 'clerk-client');
  assert.equal(await helperStore.decrypt(Buffer.from('async-only').toString('base64')), 'clerk-client');
  assert.equal(helped, 1, 'the helper runs once per value');
  await assert.rejects(createCatalogStore({ home, platform: 'linux', safeStorage: fakeSafeStorage(), helper: async values => values.map(() => null) }).decrypt('bm9wZQ=='), /decrypting/);

  const missing = await createCatalogStore({ home: path.join(home, 'nowhere'), platform: 'linux', safeStorage: storage, helper: null }).read();
  assert.equal(missing.state, 'missing');
}

function routeChecks() {
  assert.equal(routeKind('http://192.168.178.100:3773'), 'lan');
  assert.equal(routeKind('http://100.126.199.24:3773'), 'tailscale');
  assert.equal(routeKind('http://10.0.0.2:3773', 'tailscale'), 'tailscale');
  assert.equal(routeKind('https://ares.example.ts.net'), 'tailscale');
  assert.equal(routeKind('https://t3.example.com'), 'public');
  const devices = devicesFrom(catalogFor('http://192.168.178.100:3773', 'http://100.126.199.24:3773'));
  assert.equal(devices.length, 1, 'several saved routes are one building');
  assert.deepEqual(devices[0].routes.map(r => r.kind), ['lan', 'tailscale']); assert.equal(devices[0].relay, true);
  assert(!/SECRET/.test(JSON.stringify(devices)), 'credentials and tokens never leave the catalog reader');
}

async function pickChecks() {
  const routes = [{ origin: 'http://lan', kind: 'lan' }, { origin: 'http://tail', kind: 'tailscale' }];
  const answer = map => async origin => { if (!(origin in map)) throw TypeError('fetch failed'); return { environmentId: map[origin] }; };
  assert.equal((await pickRoute(routes, ARES, answer({ 'http://lan': ARES, 'http://tail': ARES }))).kind, 'lan', 'the local network wins when both answer');
  assert.equal((await pickRoute(routes, ARES, answer({ 'http://tail': ARES }))).kind, 'tailscale', 'away from home, Tailscale is used');
  assert.equal(await pickRoute(routes, ARES, answer({ 'http://lan': 'another-machine' })), null, 'a LAN address that is another machine on this network is refused');
}

/** A local fake T3 server: descriptor, DPoP token exchange and the read endpoints. */
function fakeT3(label) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const reply = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/.well-known/t3/environment') return reply({ environmentId: ARES, label });
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      if (req.url === '/oauth/token') {
        const proof = req.headers.dpop, form = new URLSearchParams(body);
        assert(proof, 'the token exchange carries a DPoP proof');
        const payload = JSON.parse(Buffer.from(proof.split('.')[1], 'base64url'));
        assert.equal(payload.htu, `http://${req.headers.host}/oauth/token`, 'the proof names this route');
        assert.equal(form.get('subject_token'), 'bootstrap-credential');
        return reply({ access_token: `access-${label}`, expires_in: 600 });
      }
      if (req.headers.authorization !== `DPoP access-${label}`) return reply({ error: 'unauthorized' }, 401);
      if (req.url === '/api/orchestration/shell') return reply({ projects: [{ id: 'p1', title: 'GridAPI', workspaceRoot: 'E:/GridAPI' }], threads: [
        { id: 't1', projectId: 'p1', title: 'Grid API and UI Polish', providerInstanceId: 'claude', status: 'running', activityRunStatus: 'running', updatedAt: '2026-11-14T10:00:00Z' },
        { id: 't2', projectId: 'p1', title: 'Archived', archivedAt: 'x', updatedAt: '2026-11-14T10:00:00Z' },
      ] });
      if (req.url.startsWith('/api/orchestration/threads/')) return reply({ projection: { thread: { id: 't1', title: 'Grid API and UI Polish', providerInstanceId: 'claude', projectId: 'p1', modelSelection: { instanceId: 'claude', model: 'opus', options: [] } }, runs: [{ id: 'r1', status: 'running' }], turnItems: [], runtimeRequests: [], messages: [{ id: 'm1', role: 'assistant', createdAt: 'now', text: 'Working on the grid' }] } });
      reply({ error: 'not found' }, 404);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` })));
}

async function serverChecks() {
  const direct = await fakeT3('direct'), tunnel = await fakeT3('tunnel');
  const dead = 'http://127.0.0.1:9'; // nothing listens on the discard port
  const relayCalls = [];
  let relayDown = false;
  const request = async (url, options = {}) => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://clerk.t3.codes/')) {
      relayCalls.push(new URL(url).pathname);
      if (url.endsWith('/v1/client')) return reply({ response: { sessions: [{ id: 's', status: 'active' }], last_active_session_id: 's' } });
      return reply({ jwt: 'clerk-jwt' });
    }
    if (url.startsWith('https://relay.t3.codes/')) {
      relayCalls.push(new URL(url).pathname);
      if (relayDown && url.endsWith('/connect')) return reply({ error: 'environment_offline' }, 503);
      if (url.endsWith('/dpop-token')) return reply({ access_token: 'relay-access' });
      return reply({ environmentId: ARES, endpoint: { httpBaseUrl: tunnel.origin + '/' }, credential: 'bootstrap-credential' });
    }
    return fetch(url, options);
  };
  let catalog = catalogFor(dead, direct.origin);
  const client = createConnectClient({ catalog: async () => ({ state: 'ok', catalog }), request, readSession: async () => 'clerk-client', probeTimeout: 800 });
  const rows = await client.inventory(true);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'reachable'); assert.equal(rows[0].label, 'ARES');
  const building = createRemoteBuilding(client);
  const world = await building.world(ARES);
  assert.deepEqual(world.projects.map(p => p.id), [`${ARES}::p1`]);
  assert.deepEqual(world.threads.map(t => t.title), ['Grid API and UI Polish'], 'archived threads have no desk');
  assert.equal(world.threads[0].id, `${ARES}::t1`);
  assert.equal(client.routeOf(ARES), 'tailscale', 'the answering saved route is used, the dead LAN address is skipped');
  assert(direct.seen.includes('GET /api/orchestration/shell') && !tunnel.seen.includes('GET /api/orchestration/shell'), 'reads go to the direct route, not through the relay tunnel');
  assert.equal((await building.conversation(`${ARES}::t1`))[0].text, 'Working on the grid');

  // Offline: no saved address answers and T3 Connect cannot reach it either.
  catalog = catalogFor(dead, 'http://127.0.0.1:1');
  relayDown = true;
  const offlineClient = createConnectClient({ catalog: async () => ({ state: 'ok', catalog }), request, readSession: async () => 'clerk-client', probeTimeout: 500 });
  const registry = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: 'local-pc', label: 'SpaceStation' }), routeOf: offlineClient.routeOf,
    links: createLinkedInventory({ connect: () => offlineClient.inventory(true), links: async () => [] }) });
  const before = (await registry.get()).buildings.find(b => b.id === ARES);
  assert.equal(before.status, 'unknown', 'with a relay route, silence on the LAN alone is not yet offline');
  const offline = createRemoteBuilding(offlineClient);
  const failure = await offline.world(ARES).catch(error => error);
  assert.equal(failure.offline, true); assert.match(failure.message, /does not answer/);
  registry.markLink(ARES, false, failure);
  const after = (await registry.get()).buildings.find(b => b.id === ARES);
  assert.equal(after.status, 'unreachable'); assert.equal(after.link, 'failed'); assert.match(after.linkError, /does not answer/);
  assert(!/SECRET|clerk-client|bootstrap|access-/.test(JSON.stringify(await registry.get())), 'no credential reaches the inventory the renderer sees');

  // A locked catalog surfaces its honest reason instead of an empty campus.
  const lockedClient = createConnectClient({ catalog: async () => ({ state: 'locked', catalog: null, reason: 'The desktop keyring did not unlock the computers linked in T3 Code.' }), request });
  const lockedRegistry = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: 'local-pc', label: 'SpaceStation' }), links: createLinkedInventory({ connect: () => lockedClient.inventory(true), links: async () => [] }) });
  assert.equal((await lockedRegistry.get()).error, 'The desktop keyring did not unlock the computers linked in T3 Code.');
  direct.server.close(); tunnel.server.close();
}

async function isolationChecks() {
  const sent = [];
  let projection = { thread: { id: 't1', projectId: 'p1', pinnedAt: null }, runs: [{ id: 'r1', status: 'running' }], runtimeRequests: [], turnItems: [], messages: [] };
  const client = { async fetch() { return { projection: structuredClone(projection) }; }, async rpc(environmentId, tag, payload) { sent.push({ environmentId, tag, payload }); return { ok: true }; } };
  const building = createRemoteBuilding(client);
  const id = `${ARES}::t1`;
  await assert.rejects(building.settle(id), /still running/, 'running remote work is not settled');
  projection.runs = [{ id: 'r1', status: 'completed' }]; projection.runtimeRequests = [{ id: 'q', status: 'pending' }];
  await assert.rejects(building.settle(id), /waiting for your answer/);
  projection.runtimeRequests = []; projection.thread.pinnedAt = 'now';
  await assert.rejects(building.settle(id), /Pinned/);
  projection.thread.pinnedAt = null;
  await building.settle(id);
  for (const action of ['stop', 'rename']) await building.dispatch(threadCommand(action, { threadId: id, title: 'New name' }, { local: () => { throw Error('local T3 must not be read for a remote thread'); } }));
  await building.send({ threadId: id, message: 'hello' });
  assert.deepEqual(sent.map(s => s.environmentId), [ARES, ARES, ARES, ARES], 'settle, stop, rename and send all go to the computer that owns the thread');
  assert(sent.every(s => s.tag === 'orchestration.dispatchCommand' && !s.payload.threadId.includes('::')), 'the owning computer receives its own thread id');
  assert.deepEqual(sent.map(s => s.payload.type), ['thread.settle', 'thread.stop', 'thread.metadata.update', 'message.dispatch']);
  await assert.rejects(building.dispatch({ type: 'thread.pin', threadId: id, projectId: 'other-machine::p' }), /one building/, 'an action never spans two computers');
  await assert.rejects(building.settle('local-thread'), /Choose finished work/);

  // The local T3 never receives a remote thread, even before remote dispatch is wired.
  const t3s = require('../../electron/t3server.cjs');
  await assert.rejects(t3s.dispatch({ type: 'thread.stop', threadId: id }), /not connected/);
  let routed = null; t3s.setRemoteDispatch(command => { routed = command; return { ok: true }; });
  await t3s.setThreadModel(id, { providerInstanceId: 'claude', model: 'opus' });
  await t3s.respondToRequest(id, 'req', { decision: 'decline' });
  assert.equal(routed.type, 'runtime-request.respond'); assert.equal(routed.threadId, id);
  t3s.setRemoteDispatch(null);
}

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'linked-computers-'));
  try {
    await catalogChecks(home);
    routeChecks();
    await pickChecks();
    await serverChecks();
    await isolationChecks();
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
  console.log('PASS: catalog opens with a fake safeStorage and DPAPI, locked keyrings are asked once with an honest reason, rewrites are re-read, disabled computers stay hidden, the fastest real route wins, reads use a local fake T3 server over that route, offline computers are reported, and remote actions stay on their computer');
})().catch(error => { console.error(error); process.exitCode = 1; });
