// Talks to the running T3 Code server for the few things its CLI cannot do:
// reorder, edit, cancel or steer queued messages, and change a thread's harness,
// model, effort or speed.
//
// Auth uses T3's official pairing flow, with two scopes by default:
//   1. `t3 pair --scope orchestration:read --scope orchestration:operate --label <brand name>`
//      mints a one-time pairing token (read from the CLI's output, never logged).
//   2. POST /oauth/token exchanges it for a bearer access token (30 days).
//   3. The access token is stored encrypted with Electron safeStorage in
//      userData/t3-pairing.bin.
//   4. Each WebSocket connection gets a short-lived ticket from
//      POST /api/auth/websocket-ticket/rpc, then speaks Effect RPC on /ws.
// If T3 rejects the token (expired or removed in T3's connections list), the app pairs
// again once, then reports the error. A feature that needs more (settings:write to download
// T3's speech model, providers:manage to use a reset credit) asks for it with grantScope(),
// which pairs again with the extra scope after the user confirmed the action in the UI.

const fs = require("node:fs");
const brand = require("./brand.cjs");
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
// Extra scopes granted in this session; kept across a re-pair so it does not drop them.
const EXTRA_SCOPES = new Set(["settings:write", "providers:manage"]);
let extraScopes = new Set();
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
    if (c && c.token && c.expiresAt > Date.now() + 60_000) { cred = c; rememberExtras(c); }
  } catch {}
  return cred;
}
function rememberExtras(c) {
  for (const s of String(c?.scope || "").split(/\s+/)) if (EXTRA_SCOPES.has(s)) extraScopes.add(s);
}
const wantedScopes = () => [...SCOPES, ...extraScopes];
async function saveCred(c) {
  cred = c;
  rememberExtras(c);
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
function mintPairingToken(scopes) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI)) return reject(new T3ServerError("The t3 command was not found. Open T3 Code once so it installs it.", "no-cli"));
    const l = cliLauncher();
    // `pair` finds the server from --base-dir (or the working folder), not from T3CODE_HOME
    const args = [...l.pre, "pair", "--base-dir", T3_HOME, ...scopes.flatMap((s) => ["--scope", s]), "--label", brand.name, "--ttl", "5m"];
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

async function exchange(pairingToken, scopes) {
  const { origin } = server();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: pairingToken,
    subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    scope: scopes.join(" "),
    client_label: brand.name,
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
/** Makes sure the app holds a session. Pairs with T3 when it has none. */
async function ensurePaired({ force = false } = {}) {
  if (!force) { const c = await loadCred(); if (c) return c; }
  if (!pairing) {
    pairing = (async () => {
      try {
        const scopes = wantedScopes();
        const c = await exchange(await mintPairingToken(scopes), scopes);
        if (!c.scope) c.scope = scopes.join(" ");
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

/** Whether the current session already holds a scope. */
async function hasScope(scope) {
  const c = await loadCred();
  return !!c && String(c.scope || SCOPES.join(" ")).split(/\s+/).includes(scope);
}
/**
 * Pairs again with one more scope, once, after the user confirmed an action that needs it.
 * The WebSocket reconnects with the new session on its next call.
 */
async function grantScope(scope) {
  if (!EXTRA_SCOPES.has(scope)) throw new T3ServerError("This app does not ask T3 for that permission.", "invalid");
  if (await hasScope(scope)) return cred;
  extraScopes.add(scope);
  const c = await ensurePaired({ force: true });
  closeSock();
  if (!String(c.scope || "").split(/\s+/).includes(scope)) throw new T3ServerError("T3 did not give this app that permission.", "unauthorized");
  return c;
}

// HTTP with the session. A 401 means expired or revoked: pair again once, then give up.
// Returns the raw response for 2xx and 4xx answers other than auth failures, so callers can read
// T3's own error body (the voice API reports its reasons there).
async function authedRaw(pathname, init = {}, { retried = false, pairedOnly = false } = {}) {
  const c = pairedOnly ? await loadCred() : await ensurePaired();
  if (!c) throw new T3ServerError(`Connect ${brand.name} to T3 Code to read subscription limits.`, "not-paired");
  const { origin } = server();
  let res;
  try {
    res = await fetch(origin + pathname, { ...(pairedOnly ? { signal: AbortSignal.timeout(2000) } : {}), ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${c.token}` } });
  } catch (err) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") throw err;
    throw new T3ServerError("Could not reach T3 Code. Make sure it is open.", "offline");
  }
  if (res.status === 401 && !retried && !pairedOnly) {
    forgetCred();
    await ensurePaired({ force: true });
    return authedRaw(pathname, init, { retried: true });
  }
  if (res.status === 401) {
    lastError = `T3 no longer accepts ${brand.name}'s connection.`;
    throw new T3ServerError(lastError, "unauthorized");
  }
  if (res.status === 403) {
    // T3 names the missing scope; settings:write is reported as requiredPermission.
    let body = null;
    try { body = await res.json(); } catch {}
    const scope = body?.requiredPermission || body?.requiredScope || null;
    const err = new T3ServerError(`T3 did not give ${brand.name} permission for this.`, body?.code === "insufficient_scope" ? "scope" : "unauthorized");
    err.scope = scope;
    throw err;
  }
  return res;
}
async function authed(pathname, init = {}, retried = false, pairedOnly = false) {
  const res = await authedRaw(pathname, init, { retried, pairedOnly });
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

async function connect({ pairedOnly = false } = {}) {
  if (sock) return sock.ready;
  const { ticket } = await authed("/api/auth/websocket-ticket/rpc", { method: "POST" }, false, pairedOnly);
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
  if (/Runtime request \S+ (was not found|is (resolved|cancelled|expired|failed))/i.test(s)) return "This question was already answered or closed.";
  if (/Feedback requires/i.test(s)) return "This approval does not take a note.";
  if (/not resumable|server restarted/i.test(s)) return "The agent stopped waiting for this answer. Stop the run in T3 and ask again.";
  if (/not active/i.test(s)) return "This thread is archived or deleted.";
  if (/requiredScope|permission/i.test(s)) return `T3 did not give ${brand.name} permission for this.`;
  // keep the text, but drop T3's internal ids
  return s.replace(/\b(run|thread|message|node|command):[^\s.,)]+/g, "this item").slice(0, 240);
}

async function call(tag, payload, { timeout = 15_000, pairedOnly = false } = {}) {
  const s = await connect({ pairedOnly });
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
let remoteDispatch = null, remoteSecret = null;
function dispatch(command) {
  if (remoteDispatch && [command.threadId, command.projectId].some(id => typeof id === 'string' && id.includes('::'))) return remoteDispatch(command);
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

// --- questions and approvals -------------------------------------------------

const DECISIONS = ["accept", "acceptForSession", "acceptAlways", "decline", "cancel"];
/**
 * Answers a pending runtime request the way T3's web app does:
 * questions: `answers` keyed by question id, each a string (one choice or your own words)
 * or an array of strings (several choices); approvals: a `decision`.
 */
function respondToRequest(threadId, requestId, { answers, decision, feedback, secret, declineSecret } = {}) {
  if (secret !== undefined || declineSecret) {
    if (typeof threadId !== 'string' || !threadId || typeof requestId !== 'string' || !requestId || (!declineSecret && (typeof secret !== 'string' || !secret.trim() || secret.length > 65536))) return Promise.reject(new T3ServerError('Enter a value or decline this request.', 'invalid'));
    const answer = declineSecret ? {type:'decline'} : {type:'save',secret};
    const send = threadId.includes('::') ? (remoteSecret ? remoteSecret(threadId,requestId,answer) : Promise.reject(Error('Remote secret input unavailable'))) : call('secrets.answerRequest',{threadId,turnItemId:requestId,answer});
    return send.then(() => true).catch(() => { throw new T3ServerError('The secure request could not be answered. It may have expired. Try again.', 'secret-failed'); });
  }
  if (!threadId || !requestId) return Promise.reject(new T3ServerError("This question is gone.", "invalid"));
  if (decision !== undefined) {
    if (!DECISIONS.includes(decision)) return Promise.reject(new T3ServerError("Unknown choice for this approval.", "invalid"));
    return dispatch({ type: "runtime-request.respond", threadId, requestId, decision, ...(feedback ? { feedback: String(feedback) } : {}) });
  }
  const clean = {};
  for (const [id, v] of Object.entries(answers || {})) {
    if (Array.isArray(v)) { const list = v.filter((x) => typeof x === "string" && x.trim()); if (list.length) clean[id] = list; }
    else if (typeof v === "string" && v.trim()) clean[id] = v;
  }
  if (!Object.keys(clean).length) return Promise.reject(new T3ServerError("Pick an answer first.", "invalid"));
  return dispatch({ type: "runtime-request.respond", threadId, requestId, answers: clean });
}

// Explicit settlement is reversible through T3's native thread commands.
// A session you settle from its desk may have ended any way (finished, stopped, failed), like
// T3's own Settle; reviews still require a completed run.
const ENDED_RUNS = new Set(["completed", "cancelled", "canceled", "interrupted", "failed", "error", "stopped", "aborted"]);
async function settleThread(threadId, { excludePinned = true, expectedRunId = null, ended = false } = {}) {
  // Pair/connect first, then re-read promotion state immediately before dispatch.
  {
    await connect();
    const state = require("./t3.cjs").reportState(threadId);
    const finished = ended ? ENDED_RUNS.has(state.run?.status) : state.run?.status === "completed";
    if (expectedRunId && (state.run?.id !== expectedRunId || !finished || state.pendingRuns || state.pendingRequests)) throw new T3ServerError("New work superseded this review.", "stale-review");
    if (state.pinned) throw new T3ServerError("Pinned threads cannot be settled automatically.", "manager-protected");
  }
  return dispatch({ type: "thread.settle", threadId });
}
function unsettleThread(threadId) { return dispatch({ type: "thread.unsettle", threadId, reason: "user" }); }

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
let usageLimitsCache = null, usageLimitsRead = null, usageLimitsRetryAt = 0;
function rememberUsageLimits(config) {
  // Keep only usage fields. Account identifiers and authentication metadata never
  // leave the main process through the usage bridge.
  const providers = (config?.providers || []).filter(p => p && p.enabled !== false && p.installed !== false).map(p => ({
    instanceId: p.instanceId, driver: p.driver, name: p.displayName || p.instanceId,
    usageLimits: p.usageLimits ? { checkedAt: p.usageLimits.checkedAt, windows: (p.usageLimits.windows || []).map(w => ({ id: w.id, kind: w.kind, label: w.label, usedPercent: w.usedPercent, resetsAt: w.resetsAt, windowDurationMins: w.windowDurationMins })), resetCredits: resetCredits(p.usageLimits.resetCredits), unavailable: p.usageLimits.unavailable ? { reason: p.usageLimits.unavailable.reason, message: p.usageLimits.unavailable.message } : undefined } : null,
  }));
  usageLimitsCache = { at: Date.now(), providers };
  return { providers, fetchedAt: new Date(usageLimitsCache.at).toISOString(), source: "T3 Code" };
}

// Banked reset credits: how many and when the next one expires (the credit id stays here).
function resetCredits(r) {
  const count = Number(r?.availableCount);
  if (!Number.isInteger(count) || count < 0) return undefined;
  return { availableCount: count, nextExpiresAt: typeof r.nextExpiresAt === "string" ? r.nextExpiresAt : null };
}

const RESET_OUTCOMES = {
  reset: "Limits reset.",
  nothingToReset: "Nothing to reset right now.",
  noCredit: "No reset credit left.",
  alreadyRedeemed: "That credit was already redeemed.",
};
/**
 * Redeems one banked reset credit for a provider instance (provider.consumeResetCredit, the
 * same RPC as T3's usage panel). Irreversible: the UI confirms first. Needs providers:manage,
 * which is granted once through pairing.
 */
async function consumeResetCredit(instanceId) {
  if (typeof instanceId !== "string" || !instanceId || instanceId.length > 200) throw new T3ServerError("Choose a subscription first.", "invalid");
  await grantScope("providers:manage");
  let result;
  try { result = await call("provider.consumeResetCredit", { instanceId }, { timeout: 30_000 }); }
  finally { usageLimitsCache = null; usageLimitsRetryAt = 0; providerCache = null; }
  const outcome = typeof result?.outcome === "string" ? result.outcome : "reset";
  return { outcome, message: RESET_OUTCOMES[outcome] || "T3 answered.", warning: typeof result?.warning === "string" ? result.warning.slice(0, 240) : null };
}

/** Read T3's supported provider snapshots through an existing paired connection. */
async function usageLimits() {
  if (usageLimitsCache && Date.now() - usageLimitsCache.at < 20000) return { providers: usageLimitsCache.providers, fetchedAt: new Date(usageLimitsCache.at).toISOString(), source: "T3 Code" };
  if (Date.now() < usageLimitsRetryAt) return { providers: usageLimitsCache?.providers || [], error: "T3 limits could not be refreshed.", source: "T3 Code" };
  if (usageLimitsRead) return usageLimitsRead;
  usageLimitsRead = (async () => {
    let timer;
    try {
      // Reading limits must never initiate pairing, prompt, or restart a provider.
      if (!await loadCred()) return { providers: [], error: `Connect ${brand.name} to T3 Code to read subscription limits.`, source: "T3 Code" };
      const config = await Promise.race([
        call("server.getConfig", {}, { timeout: 2000, pairedOnly: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new T3ServerError("T3 limits did not answer in time.", "timeout")), 2500); }),
      ]);
      return rememberUsageLimits(config);
    } catch {
      usageLimitsRetryAt = Date.now() + 30000;
      return { providers: usageLimitsCache?.providers || [], error: "T3 limits could not be refreshed.", source: "T3 Code" };
    } finally { clearTimeout(timer); usageLimitsRead = null; }
  })();
  return usageLimitsRead;
}
/** Harnesses T3 offers right now, with their models and each model's options (effort, fast mode). */
async function listProviders({ fresh = false } = {}) {
  if (!fresh && providerCache && Date.now() - providerCache.at < 60_000) return providerCache.list;
  const config = await call("server.getConfig", {});
  rememberUsageLimits(config);
  const list = providerList(config);
  providerCache = { at: Date.now(), list };
  return list;
}

function providerList(config) {
  return (config?.providers || [])
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
}

async function hireConfig({ projectId = '' } = {}) {
  const config = await call('server.getConfig', {});
  const settings = config.settings || {};
  let project = null;
  if (projectId) {
    const row = getDb().prepare('select * from projection_projects where project_id = ?').get(projectId);
    if (!row) throw new T3ServerError('This project is no longer available.', 'invalid');
    project = safeJson(row.payload_json) || {};
    if (!project.defaultModelSelection && row.default_model_selection_json) project.defaultModelSelection = safeJson(row.default_model_selection_json);
  }
  const defaults = require('./hire-runtime.cjs').hireDefaults(settings, projectId, project);
  const overrides = settings.projectSettingsOverrides?.[projectId]?.providerInstances || {};
  const providers = providerList(config).filter(p => overrides[p.instanceId]?.enabled !== false);
  return { providers, ...defaults };
}

async function startHire(opts) {
  const config = await hireConfig({ projectId: opts.project });
  const provider = config.providers.find(p => p.instanceId === opts.provider && p.ready);
  const model = provider?.models.find(m => m.slug === opts.model);
  if (!model) throw new T3ServerError('This harness or model is unavailable. Choose another setup and retry.', 'invalid');
  for (const [id, value] of Object.entries(opts.options || {})) {
    const option = model.options.find(o => o.id === id);
    if (!option || (option.type === 'boolean' ? typeof value !== 'boolean' : !option.choices?.some(c => c.id === value))) throw new T3ServerError('A model setting changed in T3. Reload the runtime settings and retry.', 'invalid');
  }
  opts = { ...opts, message: require('./work-skill.cjs').withWorkSkill(opts.message) };
  if (opts.contextThreadId) return require('./hire-context.cjs').continueHire(getDb(), opts, dispatch);
  const payload = require('./hire-runtime.cjs').launchPayload(opts, config.runtimeMode);
  const result = await call('orchestration.launchThread', payload, { timeout: 60_000 });
  return { threadId: result.threadId };
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
 * Whether the app is paired. `connect: true` pairs when there is no session yet.
 * With a threadId it also returns that thread's current model selection.
 */
async function status({ connect = false, threadId = null } = {}) {
  const c = await loadCred();
  const out = { paired: !!c, error: lastError, selection: null, scopes: c ? String(c.scope || SCOPES.join(" ")).split(/\s+/).filter(Boolean) : [] };
  try { if (threadId) out.selection = selection(threadId); } catch {}
  if (!out.paired && connect) {
    try { await ensurePaired(); out.paired = true; out.error = null; } catch (err) { out.error = err.message; }
  }
  return out;
}

// T3 Code's own thread search (orchestration.searchThreads), as its sidebar uses it: message text
// (words of three or more letters), ranked by match quality, plus the rows of older settled
// threads that the active list leaves out. Only small fields leave the main process.
async function searchThreads(query) {
  const q = String(query || "").trim().slice(0, 200);
  if (q.length < 2) return { matches: [], threads: [] };
  const r = await call("orchestration.searchThreads", { query: q, limit: 30, olderSettledBefore: new Date().toISOString() }, { timeout: 8000 });
  const matches = (r?.matches || []).map((m) => ({ threadId: m.threadId, projectId: m.projectId, source: m.source, snippet: String(m.snippet || "").slice(0, 240), quality: m.quality ?? null, at: m.messageCreatedAt || null }));
  const threads = (r?.threads || []).map((t) => ({
    id: t.id || t.threadId, title: t.title || "Untitled thread", projectId: t.projectId || null,
    updatedAt: t.updatedAt || t.latestUserMessageAt || t.createdAt || null,
    provider: t.modelSelection?.instanceId || t.providerInstanceId || t.defaultProvider || "",
    settled: true,
  })).filter((t) => t.id);
  return { matches, threads };
}

module.exports = {
  searchThreads,
  setRemoteSecret: fn => { remoteSecret = fn; },
  setRemoteDispatch: fn => { remoteDispatch = fn; },
  ensurePaired, hasScope, grantScope, authedRaw, status, dispatch, call, listProviders, hireConfig, startHire, hireContexts: projectId => require('./hire-context.cjs').settledContexts(getDb(), projectId), selection, usageLimits, consumeResetCredit,
  settleThread, unsettleThread, reorderQueued, cancelQueued, editQueued, steerNow, setThreadModel, respondToRequest,
  closeSock, T3ServerError,
};
