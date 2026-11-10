const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { readDesktopSession } = require('../../electron/connect-session.cjs');
const { createConnectClient } = require('../../electron/connect-client.cjs');
const { createRemoteBuilding } = require('../../electron/remote-building.cjs');

async function main() {
  const missing = () => { throw Object.assign(Error('private path'), { code: 'ENOENT' }); };
  const current = path.join('test-home', 'userdata', 'clerk', 'clerk-tokens.json');
  const legacy = path.join('test-home', 'userdata', 'clerk-tokens.json');
  const session = read => readDesktopSession({ home: 'test-home', read, decrypt: value => { assert.equal(value, 'protected'); return 'session'; } });
  assert.equal(session(file => { assert.equal(file, current); return JSON.stringify({ __clerk_client_jwt: 'enc:protected' }); }), 'session');
  assert.equal(session(file => file === legacy ? JSON.stringify({ __clerk_client_jwt: 'raw:legacy' }) : missing()), 'legacy');
  assert.throws(() => session(missing), /Open T3 Code/);
  assert.throws(() => session(() => '{broken'), /Open T3 Code/);
  assert.throws(() => session(() => JSON.stringify({})), /Open T3 Code/);
  assert.throws(() => session(file => file === current ? '{}' : JSON.stringify({ __clerk_client_jwt: 'raw:stale' })), /Open T3 Code/, 'an invalid current session must not revive a legacy session');
  const calls = [], jtIs = new Set(); let now = Date.now(), failOnce = false;
  let saved = { targets: [{ environmentId: 'ares', label: 'ARES' }, { environmentId: 'ares', label: 'Duplicate' }, { environmentId: 'disabled', label: 'Disabled' }, { environmentId: 'profile-label' }, {}, null], disabledEnvironmentIds: ['disabled'], profiles: [
    { environmentId: 'ares', label: 'Route', httpBaseUrl: 'http://ares.local:3773/api?secret=hidden' },
    { environmentId: 'ares', httpBaseUrl: 'http://ares.local:3773/' },
    { environmentId: 'ares', httpBaseUrl: 'https://user:password@unsafe.test' },
    { environmentId: 'profile-only', label: 'Laptop', httpBaseUrl: 'https://laptop.test' },
    { environmentId: 'profile-label', label: 'Studio' },
    { environmentId: 'disabled', label: 'Disabled route' },
  ] };
  const catalog = () => saved;
  const request = async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    const proof = options.headers?.dpop;
    if (proof) {
      const [header, body, signature] = proof.split('.'), h = JSON.parse(Buffer.from(header, 'base64url')), p = JSON.parse(Buffer.from(body, 'base64url'));
      assert.equal(h.typ, 'dpop+jwt'); assert.equal(h.alg, 'ES256');
      const key = crypto.createPublicKey({ key: h.jwk, format: 'jwk' });
      assert(crypto.verify('sha256', Buffer.from(header + '.' + body), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
      assert.equal(p.htm, options.method || 'GET'); assert.equal(p.htu, url.split('?')[0]);
      assert(!jtIs.has(p.jti)); jtIs.add(p.jti);
      if (options.headers.authorization?.startsWith('DPoP ')) assert.equal(p.ath, crypto.createHash('sha256').update(options.headers.authorization.slice(5)).digest('base64url'));
    }
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url === 'http://ares.local:3773/.well-known/t3/environment') return reply({ environmentId: 'different-device' });
    if (url.endsWith('/v1/client')) return reply({ response: { sessions: [{ id: 'signed-in', status: 'active' }], last_active_session_id: 'signed-in' } });
    if (url.endsWith('/tokens/t3-relay')) return reply({ jwt: 'clerk-session' });
    if (url.endsWith('/v1/client/dpop-token')) { assert.equal(options.body.get('subject_token'), 'clerk-session'); return reply({ access_token: 'relay-access' }); }
    if (url.endsWith('/connect')) return reply({ environmentId: 'ares', endpoint: { httpBaseUrl: 'https://ares.test' }, credential: 'short-lived-bootstrap' });
    if (url.endsWith('/oauth/token')) return reply({ access_token: 'environment-access', expires_in: 120 });
    if (url.includes('/api/orchestration/shell')) {
      assert.equal(options.headers['x-t3-orchestration-protocol'], '2');
      if (failOnce) { failOnce = false; return reply({ reason: 'expired' }, 401); }
      return reply({ projects: [{ id: 'p', title: 'Actual project', workspaceRoot: 'E:/Project' }], threads: [{ id: 't', projectId: 'p', title: 'Actual thread', providerInstanceId: 'codex', modelSelection: { model: 'example' }, pinnedAt: 'now', status: 'completed', settledAt: 'now' }] });
    }
    if (url.includes('/api/orchestration/threads/')) return reply({ projection: { thread: { id: 't', title: 'Actual thread', providerInstanceId: 'codex', projectId: 'p', modelSelection: { instanceId: 'codex', model: 'example', options: [] } }, runs: [], turnItems: [], runtimeRequests: [], messages: [{ id: 'm', role: 'assistant', createdAt: 'now', text: 'Actual reply' }] } });
    throw Error('Unexpected route');
  };
  const client = createConnectClient({ catalog, request, now: () => now, readSession: () => 'existing-desktop-session' });
  assert.deepEqual(client.inventory().map(x => x.environmentId), ['ares', 'profile-label', 'profile-only']);
  assert.deepEqual(client.inventory()[0].urls, ['http://ares.local:3773']);
  assert.equal(client.inventory()[1].label, 'Studio');
  assert.equal(client.inventory()[2].label, 'Laptop');
  assert(!JSON.stringify(client.inventory()).includes('secret'));
  assert(!JSON.stringify(client.inventory()).includes('session'));
  const building = createRemoteBuilding(client);
  const data = await building.world('ares');
  assert.equal(data.threads[0].id, 'ares::t'); assert.equal(data.projects[0].id, 'ares::p'); assert(data.threads[0].pinned);
  assert.equal((await building.info('ares::t')).title, 'Actual thread');
  assert.equal((await building.conversation('ares::t'))[0].text, 'Actual reply');
  assert.equal(calls.filter(x => x.url.endsWith('/connect')).length, 1, 'session reused');
  now += 70000; await building.world('ares');
  assert.equal(calls.filter(x => x.url.endsWith('/connect')).length, 2, 'expiring token refreshes automatically');
  failOnce = true; await building.world('ares');
  assert.equal(calls.filter(x => x.url.endsWith('/connect')).length, 3, '401 refreshes once');
  await assert.rejects(building.dispatch({ type: 'thread.pin', threadId: 'ares::t', projectId: 'other::p' }), /one building/);
  await assert.rejects(client.fetch('disabled', '/api/orchestration/shell'), /not saved/);
  saved = { targets: [{ environmentId: 'new-device', label: 'New device' }], profiles: [] };
  assert.equal(client.inventory().length, 3, 'ordinary reads use the cache');
  assert.deepEqual(client.inventory(true).map(x => x.environmentId), ['new-device'], 'refresh discovers additions and removes disconnected devices');
  console.log('PASS: all saved devices, profile-only connections, route deduplication, safe origins, refresh, existing session reuse, signed DPoP proofs, automatic expiry/401 recovery and namespace isolation');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
