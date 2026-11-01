const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createMobileAccess, routeState, TARGET } = require('../electron/mobile-access.cjs');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-mobile-access-'));
const device = { BackendState: 'Running', Self: { Online: true, DNSName: 'computer.example.ts.net.', UserID: 42 }, User: { 42: { LoginName: 'owner@example.com' } } };
const origin = 'https://computer.example.ts.net:9443', host = 'computer.example.ts.net:9443';
const unrelated = { TCP: { 443: { HTTPS: true }, 8443: { HTTPS: true } }, Web: {
  'computer.example.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:5000' } } },
  'computer.example.ts.net:8443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4190' } } },
} };
function fixture(name) {
  let serve = structuredClone(unrelated), starts = 0, stops = 0, live = false, failServe = false;
  const calls = [], file = path.join(folder, `${name}.json`);
  const run = async args => {
    calls.push([...args]);
    if (args[0] === 'status') return JSON.stringify(device);
    if (args[1] === 'status') return JSON.stringify(serve);
    if (failServe) throw Error('Tailscale is unavailable. Retry setup.');
    assert.deepEqual(args.slice(0, 4), ['serve', '--bg', '--https=9443', '--set-path=/']);
    if (args.at(-1) === 'off') {
      delete serve.Web[host]?.Handlers['/'];
      if (!Object.keys(serve.Web[host]?.Handlers || {}).length) { delete serve.Web[host]; delete serve.TCP[9443]; }
    } else { assert.equal(args.at(-1), TARGET); serve.TCP[9443] = { HTTPS: true }; serve.Web[host] = { Handlers: { '/': { Proxy: TARGET } } }; }
    return '';
  };
  const options = { file, run, start: async config => { assert.equal(config.allowedLogin, 'owner@example.com'); starts++; live = true; }, stop: async () => { stops++; live = false; } };
  return { options, file, calls, access: createMobileAccess(options), get starts() { return starts; }, get stops() { return stops; }, get live() { return live; },
    get serve() { return serve; }, set serve(value) { serve = value; }, set failServe(value) { failServe = value; } };
}

(async () => {
  try {
    const f = fixture('success');
    assert.equal(f.access.status().enabled, false);
    const first = f.access.setup(), second = f.access.setup();
    assert.equal(first, second, 'duplicate setup actions share one operation');
    const state = await first;
    assert.equal(state.running, true); assert.equal(state.busy, false); assert.equal(state.url, `${origin}/`);
    assert.equal(f.starts, 1); assert.equal(f.live, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file)), { enabled: true, publicOrigin: origin, allowedLogin: 'owner@example.com' });
    const otherRoutes = { TCP: { 443: f.serve.TCP[443], 8443: f.serve.TCP[8443] }, Web: Object.fromEntries(Object.entries(f.serve.Web).filter(([key]) => key !== host)) };
    assert.deepEqual(otherRoutes, unrelated, 'setup preserves existing application routes');
    await f.access.setup(); assert.equal(f.starts, 1, 'setup does not restart a running same-identity host');
    assert.equal(f.calls.filter(args => args.at(-1) === TARGET).length, 1, 'an owned route is reused');
    f.serve.Web[host].Handlers['/other'] = { Proxy: 'http://127.0.0.1:7100' };
    await f.access.disable(); assert.equal(f.live, false); assert.equal(f.access.status().enabled, false);
    assert.equal(f.serve.Web[host].Handlers['/other'].Proxy, 'http://127.0.0.1:7100', 'disabling removes only the owned root path');
    assert.equal(f.serve.Web['computer.example.ts.net:443'].Handlers['/'].Proxy, 'http://127.0.0.1:5000');

    const conflict = fixture('conflict'); conflict.serve.TCP[9443] = { HTTPS: true };
    conflict.serve.Web[host] = { Handlers: { '/': { Proxy: 'http://127.0.0.1:9000' } } };
    await assert.rejects(conflict.access.setup(), /already used/); assert.equal(conflict.starts, 0);
    assert.equal(conflict.calls.filter(args => args[1] !== 'status' && args[0] !== 'status').length, 0, 'conflicts never invoke mutation commands');

    const funnel = fixture('funnel'); funnel.serve.AllowFunnel = { [host]: true };
    await assert.rejects(funnel.access.setup(), /public Funnel/); assert.equal(funnel.starts, 0);
    const foreground = structuredClone(unrelated); foreground.Foreground = { session: { TCP: { 9443: { HTTPS: true } }, Web: { [host]: { Handlers: { '/': { Proxy: TARGET } } } } } };
    assert.throws(() => routeState(foreground, origin), /another service/, 'a foreground session is never adopted or overwritten');

    const fail = fixture('rollback'); fail.failServe = true;
    await assert.rejects(fail.access.setup(), /unavailable/); assert.equal(fail.starts, 1); assert.equal(fail.stops, 1); assert.equal(fail.live, false);
    assert.equal(fs.existsSync(fail.file), false, 'failed setup does not persist enabled access');
    fail.failServe = false; await fail.access.setup(); assert.equal(fail.access.status().running, true, 'failed setup remains retryable');

    const listenFailure = fixture('listen-failure'); let stoppedPartial = false;
    const failedListener = createMobileAccess({ ...listenFailure.options, start: async () => { throw Error('The phone port is already in use.'); }, stop: async () => { stoppedPartial = true; } });
    await assert.rejects(failedListener.setup(), /port is already in use/);
    assert.equal(stoppedPartial, true, 'a failed listener start still releases its partially created host');

    const persist = fixture('persistence-failure');
    fs.writeFileSync(path.join(folder, 'not-a-folder'), 'preserve');
    persist.options.file = path.join(folder, 'not-a-folder', 'config.json');
    const badPersistence = createMobileAccess(persist.options);
    await assert.rejects(badPersistence.setup(), /could not be saved/);
    assert.equal(persist.live, false); assert.equal(persist.serve.Web[host], undefined, 'persistence failure rolls back the created route and host');
    assert.equal(fs.readFileSync(path.join(folder, 'not-a-folder'), 'utf8'), 'preserve');

    const restored = createMobileAccess(fail.options); await restored.restore(); assert.equal(restored.status().running, true, 'enabled access restarts from saved identity');
    const oldLogin = device.User[42].LoginName; device.User[42].LoginName = 'other@example.com';
    const wrongIdentity = createMobileAccess(fail.options); await wrongIdentity.restore();
    assert.equal(wrongIdentity.status().running, false); assert.match(wrongIdentity.status().error, /account or computer name changed/);
    device.User[42].LoginName = oldLogin;

    fail.serve.Web[host].Handlers['/'] = { Proxy: 'http://127.0.0.1:8888' };
    await fail.access.disable(); assert.equal(fail.live, false);
    assert.equal(fail.serve.Web[host].Handlers['/'].Proxy, 'http://127.0.0.1:8888', 'disable never removes a route adopted by another service');
    assert.equal(fail.access.status().enabled, false); assert.match(fail.access.status().error, /stopped/);

    const retry = fixture('disable-retry'); await retry.access.setup(); retry.failServe = true;
    await retry.access.disable(); assert.equal(retry.live, false); assert.equal(retry.access.status().enabled, false);
    retry.failServe = false; const afterRestart = createMobileAccess(retry.options); await afterRestart.disable();
    assert.equal(retry.serve.Web[host], undefined, 'a failed route cleanup can be retried after restart');

    const offline = fixture('offline'); device.BackendState = 'Stopped';
    await assert.rejects(offline.access.setup(), /Connect this computer/); assert.equal(offline.starts, 0); device.BackendState = 'Running';
    console.log('PASS: Tailscale identity setup, owned-root-only route changes, route/Funnel/foreground conflicts, duplicate starts, failed setup rollback and retry, persisted restore, changed-account rejection, offline recovery and disable cleanup retry');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
