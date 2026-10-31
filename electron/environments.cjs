// Read-only environment inventory through T3's supported descriptor and CLI.
// Remote credentials stay owned by T3. Inventory is not authority to read a remote world.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
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

function createEnvironmentRegistry({ descriptor = localDescriptor, links = cliLinks, hostname = os.hostname, now = Date.now } = {}) {
  let cached = null, at = 0, pending = null;
  const read = async () => {
    const [identity, inventory] = await Promise.allSettled([descriptor(), links()]);
    const local = identity.status === "fulfilled" ? identity.value : null;
    const localId = nonempty(local?.environmentId) || `local:${hostname()}`;
    const buildings = [{ id: localId, label: nonempty(local?.label) || hostname(), local: true, status: identity.status === "fulfilled" ? "reachable" : "unknown", canOpen: true, reason: null, origins: [] }];
    const ids = new Set([localId]);
    if (inventory.status === "fulfilled" && Array.isArray(inventory.value)) for (const row of inventory.value) {
      const id = nonempty(row?.environmentId), label = nonempty(row?.label);
      if (!id || !label || ids.has(id)) continue;
      ids.add(id);
      buildings.push({ id, label, local: false, status: ["reachable", "unreachable", "expired"].includes(row.status) ? row.status : "unknown", canOpen: false,
        reason: "This environment is linked in T3 Code. Its authenticated building feed is not connected to Lucid.", origins: publicOrigins(row.urls) });
    }
    const result = { localId, buildings, remoteWorldSupported: false, observedAt: new Date(now()).toISOString(),
      error: inventory.status === "rejected" ? "Linked environments could not be read from T3 Code." : null,
      connectionState: buildings.length > 1 ? "remote-feed-unavailable" : inventory.status === "rejected" ? "inventory-unavailable" : "no-linked-environments" };
    cached = result; at = now(); return result;
  };
  return {
    get({ fresh = false } = {}) {
      if (!fresh && cached && now() - at < 60000) return Promise.resolve(cached);
      if (!pending) pending = read().finally(() => { pending = null; });
      return pending;
    },
    async requireLocal(environmentId) {
      const snapshot = await this.get();
      if (!environmentId || environmentId === snapshot.localId) return snapshot.localId;
      const error = new Error("This building's authenticated data is not connected to Lucid. Continue in T3 Code.");
      error.code = "remote-environment-unavailable"; throw error;
    },
  };
}

const registry = createEnvironmentRegistry();
module.exports = { getEnvironments: options => registry.get(options), requireLocalEnvironment: id => registry.requireLocal(id), createEnvironmentRegistry };
