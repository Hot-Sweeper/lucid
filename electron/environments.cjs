// The buildings: this computer plus every computer linked in T3 Code (its saved connection
// catalog and its CLI's environment list), with each one's live connection state.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { t3Home } = require("./t3-home.cjs");

const T3_HOME = t3Home();
const CLI = path.join(T3_HOME, "bin", process.platform === "win32" ? "t3.cmd" : "t3");

function cliLinks() {
  return new Promise((resolve, reject) => {
    let cmd = CLI, pre = [], env = { ...process.env };
    if (process.platform === "win32") {
      const launcher = fs.readFileSync(CLI, "utf8").match(/^"([^"]+\.exe)"\s+"([^"]+)"\s+%\*/m);
      if (!launcher) { reject(new Error("T3's command launcher is unavailable.")); return; }
      cmd = launcher[1]; pre = [launcher[2]];
      env = { ...env, T3CODE_HOME: T3_HOME, T3CODE_CLI_PATH: CLI, ELECTRON_RUN_AS_NODE: "1", T3CODE_DESKTOP_CLI_LAUNCHER: "1" };
    }
    const child = spawn(cmd, [...pre, "environment", "list", "--base-dir", T3_HOME, "--json"], { windowsHide: true, env });
    let out = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error("T3's environment list did not answer.")); }, 6000);
    child.stdout.on("data", chunk => { out += chunk; if (out.length > 1024 * 1024) { child.kill(); finish(new Error("T3's environment list was too large.")); } });
    child.stderr.resume();
    child.on("error", () => finish(new Error("T3's environment list could not be read.")));
    child.on("close", code => {
      if (code !== 0) return finish(new Error("T3's environment list is unavailable."));
      try { const rows = JSON.parse(out); if (!Array.isArray(rows)) throw Error(); finish(null, rows); }
      catch { finish(new Error("T3 returned an unreadable environment list.")); }
    });
    child.stdin.end();
  });
}

async function localDescriptor() {
  const runtime = JSON.parse(await fs.promises.readFile(path.join(T3_HOME, "userdata", "server-runtime.json"), "utf8"));
  const origin = new URL(runtime.origin || `http://127.0.0.1:${runtime.port}`);
  if (!["http:", "https:"].includes(origin.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)) throw Error("The local T3 descriptor is unavailable.");
  const response = await fetch(`${origin.origin}/.well-known/t3/environment`, { signal: AbortSignal.timeout(2500), redirect: "error" });
  if (!response.ok) throw Error("The local T3 descriptor is unavailable.");
  return response.json();
}

const nonempty = value => typeof value === "string" && value.trim() ? value.trim() : null;
const publicOrigins = urls => [...new Set((Array.isArray(urls) ? urls : []).flatMap(value => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? [url.origin] : []; } catch { return []; }
}))];

function createLinkedInventory({ connect, links }) {
  const saved = [null, null];
  return async () => {
    const results = await Promise.allSettled([Promise.resolve().then(connect), Promise.resolve().then(links)]);
    if (results.every(r => r.status === 'rejected')) throw Object.assign(Error('Connection inventory unavailable.'), { publicReason: results[0].reason?.publicReason || null });
    const rows = results.flatMap((result, i) => {
      if (result.status === 'fulfilled') { saved[i] = result.value; return result.value; }
      return (saved[i] || []).map(row => ({ ...row, status: 'unknown' }));
    });
    // Only an honest, prepared reason (a locked keyring, say) reaches the interface.
    const reason = results[0].status === 'rejected' ? results[0].reason?.publicReason || null : null;
    return { rows, error: !!reason || results.some((r, i) => r.status === 'rejected' && saved[i] !== null), reason };
  };
}

function createEnvironmentRegistry({ descriptor = localDescriptor, links = cliLinks, hostname = os.hostname, now = Date.now, routeOf = () => null } = {}) {
  let cached = null, at = 0, pending = null;
  // A saved connection is only "configured" until a real authenticated read succeeds.
  const live = new Map();
  const withLink = snapshot => snapshot && ({ ...snapshot, buildings: snapshot.buildings.map(b => {
    if (b.local) return { ...b, link: "local", linkError: null };
    if (!b.canOpen) return { ...b, link: "linked", linkError: null };
    const seen = live.get(b.id);
    // A working read is the current truth; a computer that answered nowhere is offline.
    const status = seen?.ok ? "reachable" : seen?.offline ? "unreachable" : b.status;
    return { ...b, status, route: seen?.ok ? routeOf(b.id) || b.route || null : null, link: seen ? seen.ok ? "authenticated" : "failed" : "configured", linkError: seen && !seen.ok ? seen.error : null };
  }) });
  const read = async () => {
    const [identity, inventory] = await Promise.allSettled([descriptor(), links()]);
    const local = identity.status === "fulfilled" ? identity.value : null;
    const localId = nonempty(local?.environmentId) || cached?.localId || `local:${hostname()}`;
    const buildings = [{ id: localId, label: nonempty(local?.label) || cached?.buildings.find(b => b.local)?.label || hostname(), local: true, status: identity.status === "fulfilled" ? "reachable" : "unknown", canOpen: true, reason: null, origins: [] }];
    const devices = new Map();
    const rows = inventory.status === "fulfilled" ? Array.isArray(inventory.value) ? inventory.value : inventory.value.rows : [];
    const inventoryError = inventory.status === "rejected" || !!inventory.value?.error;
    const inventoryReason = inventory.status === "rejected" ? inventory.reason?.publicReason : inventory.value?.reason;
    for (const row of rows) {
      const id = nonempty(row?.environmentId), label = nonempty(row?.label);
      if (!id || id === localId) continue;
      let device = devices.get(id);
      if (!device) { device = { id, label: null, status: "unknown", canOpen: false, origins: [], route: null }; devices.set(id, device); }
      if (label && (!device.label || row.desktop)) device.label = label;
      if (["reachable", "unreachable", "expired"].includes(row.status)) device.status = row.status;
      device.canOpen ||= !!row.desktop;
      if (row.route) device.route = row.route;
      device.origins = publicOrigins([...device.origins, ...(Array.isArray(row.urls) ? row.urls : [])]);
    }
    for (const device of devices.values()) buildings.push({ ...device, label: device.label || "Connected computer", local: false,
      reason: device.canOpen ? null : "Linked in T3 Code. T3 keeps this link's access to itself, so its sessions cannot be shown here yet." });
    // A temporary inventory failure must not make already discovered buildings
    // disappear. A successful empty inventory still removes disconnected devices.
    if (inventory.status === "rejected" && cached) for (const building of cached.buildings) {
      if (!building.local && building.id !== localId) buildings.push({ ...building, status: "unknown" });
    }
    const result = { localId, buildings, remoteWorldSupported: buildings.some(b => !b.local && b.canOpen), observedAt: new Date(now()).toISOString(),
      error: inventoryReason || (inventoryError ? "Linked computers could not be refreshed from T3 Code. Try Refresh again." : null),
      connectionState: inventoryError ? "inventory-unavailable" : buildings.some(b => !b.local && b.canOpen) ? "available" : buildings.length > 1 ? "remote-feed-unavailable" : "no-linked-environments" };
    cached = result; at = now(); return result;
  };
  return {
    get({ fresh = false } = {}) {
      if (!fresh && cached && now() - at < 60000) return Promise.resolve(withLink(cached));
      if (!pending) pending = read().finally(() => { pending = null; });
      return pending.then(withLink);
    },
    /** Record the outcome of an authenticated read of a linked computer. */
    markLink(id, ok, error = null) { live.set(id, { ok, offline: !ok && !!error?.offline, error: ok ? null : String(error?.message || error || "The connection failed."), at: now() }); },
    /** Forget cached rows and link outcomes (T3 rewrote its catalog). */
    invalidate() { cached = null; at = 0; live.clear(); },
  };
}

const client = require('./connect-client.cjs').createConnectClient();
const remote = require('./remote-building.cjs').createRemoteBuilding(client);
const registry = createEnvironmentRegistry({ routeOf: client.routeOf, links: createLinkedInventory({ connect: () => client.inventory(true), links: cliLinks }) });
// Every authenticated world read (campus, opening, refresh) updates that computer's live state.
const readWorld = remote.world;
remote.world = async id => {
  try { const world = await readWorld(id); registry.markLink(id, true); return world; }
  catch (error) { registry.markLink(id, false, error); throw error; }
};
/** Calls back (debounced) when T3 Code adds, removes or disables a linked computer. */
function onEnvironmentsChange(listener) { return client.onCatalogChange(() => { registry.invalidate(); listener(); }); }
module.exports = { client, remote, getEnvironments: options => registry.get(options), onEnvironmentsChange, createEnvironmentRegistry, createLinkedInventory };
