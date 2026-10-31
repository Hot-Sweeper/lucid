// Talks to the running T3 Code server for the few things its CLI cannot do:
// reorder, edit, cancel or steer queued messages, and change a thread's harness,
// model, effort or speed.
//
// Auth uses T3's official pairing flow, with only two scopes:
//   1. `t3 pair --scope orchestration:read --scope orchestration:operate --label Lucid`
//      mints a one-time pairing token (read from the CLI's output, never logged).
//   2. POST /oauth/token exchanges it for a bearer access token (30 days).
//   3. The access token is stored encrypted with Electron safeStorage in
//      userData/t3-pairing.bin.
//   4. Each WebSocket connection gets a short-lived ticket from
//      POST /api/auth/websocket-ticket/rpc, then speaks Effect RPC on /ws.
// If T3 rejects the token (expired or removed in T3's connections list), Lucid pairs
// again once, then reports the error.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

let electron = null;
try { electron = require("electron"); } catch {}

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
const RUNTIME = path.join(T3_HOME, "userdata", "server-runtime.json");
const DB_PATH = path.join(T3_HOME, "userdata", "statev2.sqlite");
const CLI = path.join(T3_HOME, "bin", process.platform === "win32" ? "t3.cmd" : "t3");
const SCOPES = ["orchestration:read", "orchestration:operate"];
const PROTOCOL = 2;

class T3ServerError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// --- server location ---------------------------------------------------------

function server() {
  let s;
  try { s = JSON.parse(fs.readFileSync(RUNTIME, "utf8")); } catch {
    throw new T3ServerError("T3 Code is not running. Open it, then try again.", "offline");
  }
  const origin = (s.origin || `http://127.0.0.1:${s.port}`).replace(/\/+$/, "");
  return { origin, ws: origin.replace(/^http/, "ws"), owner: s.ownerId || null };
}

// --- stored credential -------------------------------------------------------

let storeFile = null;
function storePath() {
  if (!storeFile) storeFile = path.join(electron.app.getPath("userData"), "t3-pairing.bin");
  return storeFile;
}
/** Tests can keep the credential somewhere else. */
function setStorePath(p) { storeFile = p; cred = undefined; }

// Electron 45 prefers the async safeStorage calls; older builds only have the sync ones.
const ss = () => electron.safeStorage;
const canEncrypt = async () => (ss().isAsyncEncryptionAvailable ? ss().isAsyncEncryptionAvailable() : ss().isEncryptionAvailable());
const encrypt = async (text) => (ss().encryptStringAsync ? ss().encryptStringAsync(text) : ss().encryptString(text));
async function decrypt(buf) {
  if (!ss().decryptStringAsync) return ss().decryptString(buf);
  const r = await ss().decryptStringAsync(buf);
  return typeof r === "string" ? r : r.result;
}

let cred; // undefined: not loaded yet, null: none
async function loadCred() {
  if (cred !== undefined && (!cred || cred.expiresAt > Date.now() + 60_000)) return cred;
  cred = null;
  try {
    if (!(await canEncrypt())) return cred;
    const c = JSON.parse(await decrypt(fs.readFileSync(storePath())));
    if (c && c.token && c.expiresAt > Date.now() + 60_000) cred = c;
  } catch {}
  return cred;
}
async function saveCred(c) {
  cred = c;
  // without OS encryption the token lives in memory only, never on disk in plain text
  if (!(await canEncrypt())) return;
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), await encrypt(JSON.stringify(c)), { mode: 0o600 });
}
function forgetCred() {
  cred = null;
  try { fs.unlinkSync(storePath()); } catch {}
}

// --- pairing -----------------------------------------------------------------

// Same launcher as t3.cjs: call T3's bundled runtime directly on Windows.
function cliLauncher() {
  if (process.platform === "win32") {
    try {
      const m = fs.readFileSync(CLI, "utf8").match(/^"([^"]+\.exe)"\s+"([^"]+)"\s+%\*/m);
      if (m && fs.existsSync(m[1])) {
        return { cmd: m[1], pre: [m[2]], env: { T3CODE_HOME: T3_HOME, T3CODE_CLI_PATH: CLI, ELECTRON_RUN_AS_NODE: "1", T3CODE_DESKTOP_CLI_LAUNCHER: "1" } };
      }
    } catch {}
  }
  return { cmd: CLI, pre: [], env: {} };
}

// Runs `t3 pair` and returns only the token. Output stays in memory and is never logged.
function mintPairingToken() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI)) return reject(new T3ServerError("The t3 command was not found. Open T3 Code once so it installs it.", "no-cli"));
    const l = cliLauncher();
    // `pair` finds the server from --base-dir (or the working folder), not from T3CODE_HOME
    const args = [...l.pre, "pair", "--base-dir", T3_HOME, ...SCOPES.flatMap((s) => ["--scope", s]), "--label", "Lucid", "--ttl", "5m"];
    const child = spawn(l.cmd, args, { windowsHide: true, cwd: os.homedir(), env: { ...process.env, ...l.env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", () => reject(new T3ServerError("Could not run the t3 command.", "pair-failed")));
    child.on("close", (code) => {
      const token = out.match(/^\s*Token:\s*(\S+)\s*$/m)?.[1];
      out = "";
      if (code === 0 && token) return resolve(token);
      reject(new T3ServerError(code === 0 ? "T3 did not hand out a pairing token." : "T3 refused to pair. Make sure T3 Code is open and up to date.", "pair-failed"));
    });
    child.stdin.end();
  });
}

async function exchange(pairingToken) {
  const { origin } = server();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: pairingToken,
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    scope: SCOPES.join(" "),
    client_label: "Lucid",
    client_device_type: "desktop",
    client_os: process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux",
  });
  const res = await fetch(`${origin}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new T3ServerError(`T3 did not accept the pairing (${res.status}).`, "pair-failed");
  const j = await res.json();
  if (!j.access_token) throw new T3ServerError("T3 did not return a session.", "pair-failed");
  return { token: j.access_token, expiresAt: Date.now() + Number(j.expires_in || 0) * 1000, scope: j.scope, origin };
}

let pairing = null;
let lastError = null;
/** Makes sure Lucid holds a session. Pairs with T3 when it has none. */
async function ensurePaired({ force = false } = {}) {
  if (!force) { const c = await loadCred(); if (c) return c; }
  if (!pairing) {
    pairing = (async () => {
      try {
        const c = await exchange(await mintPairingToken());
        await saveCred(c);
        lastError = null;
        return c;
      } catch (err) {
        lastError = err.message;
        throw err;
      } finally { pairing = null; }
    })();
  }
  return pairing;
}

// HTTP with the session. A 401 means expired or revoked: pair again once, then give up.
async function authed(pathname, init = {}, retried = false) {
  const c = await ensurePaired();
  const { origin } = server();
  const res = await fetch(origin + pathname, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${c.token}` } });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401 && !retried) {
      forgetCred();
      await ensurePaired({ force: true });
      return authed(pathname, init, true);
    }
    lastError = res.status === 401 ? "T3 no longer accepts Lucid's connection." : "T3 did not give Lucid permission for this.";
    throw new T3ServerError(lastError, "unauthorized");
  }
  if (!res.ok) throw new T3ServerError(`T3 answered ${res.status}.`, "http");
  return res.json();
}

// --- WebSocket RPC (Effect RPC, JSON frames) -----------------------------------

let sock = null; // { ws, ready: Promise, pending: Map }
let nextId = 1;
let idleTimer = null;
let pingTimer = null;

function closeSock() {
  if (!sock) return;
  const s = sock;
  sock = null;
  clearInterval(pingTimer);
  try { s.ws.close(); } catch {}
  for (const p of s.pending.values()) p.reject(new T3ServerError("The connection to T3 closed.", "closed"));
  s.pending.clear();
}

async function connect() {
  if (sock) return sock.ready;
  const { ticket } = await authed("/api/auth/websocket-ticket/rpc", { method: "POST" });
  const { ws: base } = server();
  const ws = new WebSocket(`${base}/ws?orchestrationProtocol=${PROTOCOL}&wsTicket=${encodeURIComponent(ticket)}`);
  ws.binaryType = "arraybuffer";
  const s = { ws, pending: new Map(), ready: null };
  sock = s;
  s.ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(s), { once: true });
    ws.addEventListener("error", () => reject(new T3ServerError("Could not reach T3 Code.", "offline")), { once: true });
  });
  ws.addEventListener("message", (ev) => {
    let msgs;
    try { msgs = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8")); } catch { return; }
    for (const m of Array.isArray(msgs) ? msgs : [msgs]) {
      if (m._tag === "Ping") { try { ws.send(JSON.stringify({ _tag: "Pong" })); } catch {} continue; }
      if (m._tag === "Exit") {
        const p = s.pending.get(String(m.requestId));
        if (!p) continue;
        s.pending.delete(String(m.requestId));
        if (m.exit?._tag === "Success") p.resolve(m.exit.value);
        else p.reject(new T3ServerError(failureText(m.exit), "rejected"));
      } else if (m._tag === "Defect" || m._tag === "ClientProtocolError") {
        for (const p of s.pending.values()) p.reject(new T3ServerError("T3 could not handle that request.", "defect"));
        s.pending.clear();
      }
    }
  });
  ws.addEventListener("close", () => { if (sock === s) closeSock(); });
  clearInterval(pingTimer);
  pingTimer = setInterval(() => { try { ws.send(JSON.stringify({ _tag: "Ping" })); } catch {} }, 15_000);
  try { return await s.ready; } catch (err) { if (sock === s) closeSock(); throw err; }
}

// The most useful sentence from a failed Exit, without internal ids.
function failureText(exit) {
  const found = [];
  const walk = (v, depth) => {
    if (!v || depth > 6 || found.length > 3) return;
    if (typeof v === "string") return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === "object") {
      for (const k of ["message", "cause", "detail", "reason"]) if (typeof v[k] === "string" && v[k].trim()) found.push(v[k]);
      for (const k of Object.keys(v)) walk(v[k], depth + 1);
    }
  };
  walk(exit, 0);
  const raw = found.find((s) => s.length > 8) || found[0] || "T3 refused the change.";
  return friendly(raw);
}
function friendly(s) {
  if (/is not queued|not queued\./i.test(s)) return "That message already left the queue.";
  if (/cannot be edited to an empty/i.test(s)) return "A queued message cannot be empty.";
  if (/Automatic completion/i.test(s)) return "Automatic task reports cannot be changed.";
  if (/guest's message cannot be edited/i.test(s)) return "A guest's message cannot be edited. Cancel it instead.";
  if (/not active/i.test(s)) return "This thread is archived or deleted.";
  if (/requiredScope|permission/i.test(s)) return "T3 did not give Lucid permission for this.";
  // keep the text, but drop T3's internal ids
  return s.replace(/\b(run|thread|message|node|command):[^\s.,)]+/g, "this item").slice(0, 240);
}

async function call(tag, payload, { timeout = 15_000 } = {}) {
  const s = await connect();
  const id = String(nextId++);
  clearTimeout(idleTimer);
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.pending.delete(id); reject(new T3ServerError("T3 did not answer in time.", "timeout")); }, timeout);
    s.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
  s.ws.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] }));
  try { return await result; } finally {
    // close the socket after a quiet minute; the next call reconnects
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (sock && !sock.pending.size) closeSock(); }, 60_000);
  }
}

/** Sends one orchestration command, with a fresh UUID commandId like T3's web app. */
function dispatch(command) {
  return call("orchestration.dispatchCommand", { commandId: crypto.randomUUID(), ...command });
}

// --- queue -------------------------------------------------------------------

const reorderQueued = (threadId, runId, beforeRunId) => dispatch({ type: "queued-run.reorder", threadId, runId, beforeRunId: beforeRunId ?? null });
const cancelQueued = (threadId, runId) => dispatch({ type: "queued-run.cancel", threadId, runId });
function editQueued(threadId, runId, text) {
  if (!String(text || "").trim()) return Promise.reject(new T3ServerError("A queued message cannot be empty.", "invalid"));
  return dispatch({ type: "queued-run.edit", threadId, runId, text: String(text) });
}
const steerNow = (threadId, queuedRunId, targetRunId) => dispatch({ type: "queued-message.promote-to-steer", threadId, queuedRunId, targetRunId });

// --- model -------------------------------------------------------------------

function optionArray(options) {
  if (!options) return undefined;
  if (Array.isArray(options)) return options.filter((o) => o && o.id && (typeof o.value === "boolean" || (typeof o.value === "string" && o.value.trim())));
  return Object.entries(options).filter(([, v]) => typeof v === "boolean" || (typeof v === "string" && v.trim())).map(([id, value]) => ({ id, value }));
}

function setThreadModel(threadId, { providerInstanceId, model, options }) {
  if (!providerInstanceId || !model) return Promise.reject(new T3ServerError("Pick a harness and a model.", "invalid"));
  const modelSelection = { instanceId: providerInstanceId, model };
  const opts = optionArray(options);
  if (opts && opts.length) modelSelection.options = opts;
  return dispatch({ type: "thread.model-selection.set", threadId, modelSelection });
}

let providerCache = null;
/** Harnesses T3 offers right now, with their models and each model's options (effort, fast mode). */
async function listProviders({ fresh = false } = {}) {
  if (!fresh && providerCache && Date.now() - providerCache.at < 60_000) return providerCache.list;
  const config = await call("server.getConfig", {});
  const list = (config?.providers || [])
    .filter((p) => p && p.enabled !== false && p.availability !== "unavailable")
    .map((p) => ({
      instanceId: p.instanceId,
      driver: p.driver,
      name: p.displayName || p.instanceId,
      ready: p.status === "ready" || p.status === "warning",
      models: (p.models || []).filter((m) => !m.isLegacy).map((m) => ({
        slug: m.slug,
        name: m.name,
        shortName: m.shortName || null,
        isDefault: !!m.isDefault,
        options: (m.capabilities?.optionDescriptors || []).map((o) => ({
          id: o.id, label: o.label, type: o.type,
          choices: o.type === "select" ? (o.options || []).map((c) => ({ id: c.id, label: c.label, isDefault: !!c.isDefault })) : undefined,
          current: o.currentValue,
        })),
      })),
    }));
  providerCache = { at: Date.now(), list };
  return list;
}

// --- status ------------------------------------------------------------------

let db = null;
function getDb() {
  if (!db) db = new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

// The thread's current harness, model and options, straight from T3's database.
function selection(threadId) {
  const row = getDb().prepare("select coalesce(provider_instance_id, default_provider) as pv, payload_json as p from orchestration_v2_projection_threads where thread_id = ?").get(threadId);
  if (!row) return null;
  const ms = safeJson(row.p)?.modelSelection || {};
  const opts = optionArray(ms.options) || [];
  return { providerInstanceId: ms.instanceId || ms.provider || row.pv, model: ms.model || null, options: Object.fromEntries(opts.map((o) => [o.id, o.value])) };
}

/**
 * Whether Lucid is paired. `connect: true` pairs when there is no session yet.
 * With a threadId it also returns that thread's current model selection.
 */
async function status({ connect = false, threadId = null } = {}) {
  const out = { paired: !!(await loadCred()), error: lastError, selection: null };
  try { if (threadId) out.selection = selection(threadId); } catch {}
  if (!out.paired && connect) {
    try { await ensurePaired(); out.paired = true; out.error = null; } catch (err) { out.error = err.message; }
  }
  return out;
}

module.exports = {
  ensurePaired, status, dispatch, call, listProviders, selection,
  reorderQueued, cancelQueued, editQueued, steerNow, setThreadModel,
  setStorePath, closeSock, T3ServerError,
};
