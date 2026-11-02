const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const HTTPS_PORT = 9443, BACKEND_PORT = 5180;
const TARGET = `http://127.0.0.1:${BACKEND_PORT}`;

function tailscale(args) {
  const windows = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tailscale', 'tailscale.exe');
  const command = process.platform === 'win32' && fs.existsSync(windows) ? windows : 'tailscale';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', done = false;
    const finish = (error) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(output); };
    const timer = setTimeout(() => { child.kill(); finish(Error('Tailscale did not finish. Check that it is connected and HTTPS is enabled, then retry.')); }, 25000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 2 * 1024 * 1024) { child.kill(); finish(Error('Tailscale returned too much data. Restart Tailscale and retry.')); }
    });
    child.stderr.resume();
    child.once('error', () => finish(Error('Tailscale could not be opened. Install it and sign in on this computer, then retry.')));
    child.once('close', code => finish(code === 0 ? null : Error('Tailscale could not configure phone access. Check that it is connected and HTTPS is enabled, then retry.')));
  });
}

function cleanConfig(input) {
  if (!input || typeof input !== 'object') return { enabled: false, publicOrigin: '', allowedLogin: '' };
  if (input.enabled !== true && !input.publicOrigin && !input.allowedLogin) return { enabled: false, publicOrigin: '', allowedLogin: '' };
  let origin;
  try { origin = new URL(input.publicOrigin); } catch { throw Error('Phone access settings could not be read. Set up access again.'); }
  if (origin.protocol !== 'https:' || origin.port !== String(HTTPS_PORT) || !/^[a-z0-9.-]+\.ts\.net$/i.test(origin.hostname)
    || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || typeof input.allowedLogin !== 'string' || !input.allowedLogin.trim() || /[\r\n]/.test(input.allowedLogin)) {
    throw Error('Phone access settings could not be read. Set up access again.');
  }
  return { enabled: input.enabled === true, publicOrigin: origin.origin, allowedLogin: input.allowedLogin.trim() };
}

/** Inspect only Lucid's dedicated HTTPS root, preserving every unrelated Serve route. */
function routeState(config, publicOrigin) {
  const host = new URL(publicOrigin).host;
  const scopes = [config, ...Object.values(config?.Foreground || {})].filter(Boolean);
  let owned = false;
  for (const scope of scopes) {
    if (Object.entries(scope.AllowFunnel || {}).some(([key, enabled]) => key.endsWith(`:${HTTPS_PORT}`) && enabled)) {
      throw Error('Phone access cannot use a public Funnel route. Disable Funnel on port 9443 in Tailscale, then retry.');
    }
    const sites = Object.entries(scope.Web || {}).filter(([key]) => key.endsWith(`:${HTTPS_PORT}`));
    const tcp = scope.TCP?.[HTTPS_PORT];
    if (!tcp && !sites.length) continue;
    if (scope !== config || !tcp?.HTTPS || Object.keys(tcp).some(key => key !== 'HTTPS')
      || sites.length !== 1 || sites[0][0] !== host) throw Error('Tailscale port 9443 is already used by another service. Keep that service or free this port, then retry.');
    const handlers = sites[0][1]?.Handlers || {}, root = handlers['/'];
    if (!root || root.Proxy !== TARGET || Object.keys(root).some(key => key !== 'Proxy')) {
      throw Error('Tailscale port 9443 is already used by another service. Keep that service or free this port, then retry.');
    }
    owned = true;
  }
  return owned;
}

function createMobileAccess({ file, start, stop, run = tailscale }) {
  let config = { enabled: false, publicOrigin: '', allowedLogin: '' }, error = null, running = false, busy = false;
  let tail = Promise.resolve(), setupPending = null, restorePending = null;
  try { config = cleanConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') error = 'Phone access settings could not be read. Set up access again.'; }
  const status = () => ({ ...config, url: config.enabled && config.publicOrigin ? `${config.publicOrigin}/` : '', running, busy, error });
  const json = async args => {
    const output = await run(args);
    try { const value = JSON.parse(output); if (value === null && args[0] === 'serve') return {}; if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
    catch { throw Error('Tailscale returned unreadable settings. Restart it and retry.'); }
  };
  const write = async value => {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await fs.promises.rename(temporary, file); }
    catch { throw Error('Phone access settings could not be saved. Check this computer\'s permissions and retry.'); }
    finally { await fs.promises.rm(temporary, { force: true }).catch(() => {}); }
  };
  const serial = action => {
    const result = tail.then(async () => { busy = true; error = null; try { await action(); } catch (e) { error = e.message || 'Phone access could not be changed. Retry.'; throw Error(error); } finally { busy = false; } return status(); });
    tail = result.catch(() => {}); return result;
  };
  const discover = async () => {
    const device = await json(['status', '--json']);
    if (device.BackendState !== 'Running' || !device.Self || device.Self.Online === false) throw Error('Connect this computer to Tailscale, then retry phone access.');
    const hostname = String(device.Self.DNSName || '').replace(/\.$/, '').toLowerCase();
    const login = device.User?.[String(device.Self.UserID)]?.LoginName;
    if (!/^[a-z0-9.-]+\.ts\.net$/.test(hostname) || typeof login !== 'string' || !login.trim()) {
      throw Error('Phone access needs a Tailscale user account and a MagicDNS name on this computer. Sign in and enable MagicDNS, then retry.');
    }
    return cleanConfig({ enabled: true, publicOrigin: `https://${hostname}:${HTTPS_PORT}`, allowedLogin: login });
  };
  const removeOwned = async origin => {
    const serve = await json(['serve', 'status', '--json']);
    if (routeState(serve, origin)) await run(['serve', '--bg', `--https=${HTTPS_PORT}`, '--set-path=/', 'off']);
  };
  const install = async restore => {
    const next = await discover();
    if (restore && (next.publicOrigin !== config.publicOrigin || next.allowedLogin !== config.allowedLogin)) {
      throw Error('The Tailscale account or computer name changed. Set up phone access again on this computer.');
    }
    const serve = await json(['serve', 'status', '--json']);
    const existing = routeState(serve, next.publicOrigin);
    let hostStarted = false, routeCreated = false;
    try {
      if (!running || config.publicOrigin !== next.publicOrigin || config.allowedLogin !== next.allowedLogin) {
        if (running) { await stop(); running = false; }
        hostStarted = true;
        await start(next); running = true;
      }
      if (!existing) {
        // Recheck directly before mutation, so an already occupied route is never overwritten.
        if (!routeState(await json(['serve', 'status', '--json']), next.publicOrigin)) {
          routeCreated = true;
          await run(['serve', '--bg', `--https=${HTTPS_PORT}`, '--set-path=/', TARGET]);
        }
      }
      if (!routeState(await json(['serve', 'status', '--json']), next.publicOrigin)) throw Error('Tailscale did not publish phone access. Retry setup.');
      await write(next); config = next;
      return status();
    } catch (e) {
      if (hostStarted) { await Promise.resolve().then(stop).catch(() => {}); running = false; }
      if (routeCreated) await removeOwned(next.publicOrigin).catch(() => {});
      throw e;
    }
  };
  return {
    status,
    setup() {
      if (setupPending) return setupPending;
      setupPending = serial(() => install(false)).finally(() => { setupPending = null; });
      return setupPending;
    },
    restore() {
      if (restorePending) return restorePending;
      restorePending = serial(async () => config.enabled ? install(true) : status()).catch(() => status()).finally(() => { restorePending = null; });
      return restorePending;
    },
    disable() {
      return serial(async () => {
        // Closing the loopback host revokes access even when Tailscale is temporarily unavailable.
        await stop(); running = false;
        const previous = config;
        const disabled = { ...previous, enabled: false };
        await write(disabled); config = disabled;
        if (previous.publicOrigin) {
          try { await removeOwned(previous.publicOrigin); }
          catch { error = 'Phone access is stopped. Its Tailscale route could not be removed; retry Disable after reconnecting Tailscale.'; }
        }
        return status();
      });
    },
  };
}

module.exports = { createMobileAccess, routeState, cleanConfig, HTTPS_PORT, BACKEND_PORT, TARGET };
