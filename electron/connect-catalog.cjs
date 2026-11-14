// T3 Code's saved connections (~/.t3/userdata/connection-catalog.json), read-only.
// The catalog holds credentials and tokens: they stay in the main process, are never
// logged, persisted by this app or sent to the renderer.
// Windows: T3's AES key in its Local State is protected with DPAPI. Linux and macOS:
// the value is Chromium os_crypt data that Electron's safeStorage opens with the
// desktop keyring (KWallet, Secret Service) or the macOS keychain.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { t3Home } = require("./t3-home.cjs");

const FILE = 'connection-catalog.json';
// Honest, short reasons for the sidebar and the campus signs.
const REASON = {
  missing: null,
  locked: {
    linux: 'The desktop keyring did not unlock the computers linked in T3 Code.',
    darwin: "macOS keeps the computers linked in T3 Code in T3's own keychain item, which this app cannot open.",
    win32: 'Windows did not unlock the computers linked in T3 Code.',
  },
  invalid: 'The computers linked in T3 Code could not be read. Open T3 Code once and try again.',
};

function decryptDesktop(value, { profile = path.join(process.env.APPDATA || '', 't3code-v2') } = {}) {
  if (process.platform !== 'win32') throw Error('DPAPI is only available on Windows.');
  const state = JSON.parse(fs.readFileSync(path.join(profile, 'Local State'), 'utf8'));
  const protectedKey = Buffer.from(state.os_crypt.encrypted_key, 'base64');
  if (protectedKey.subarray(0, 5).toString() !== 'DPAPI') throw Error('Desktop encryption format is unsupported.');
  const command = 'Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $key=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($key))';
  const key = Buffer.from(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input: protectedKey.subarray(5).toString('base64'), windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(), 'base64');
  try {
    const encrypted = Buffer.from(value, 'base64');
    if (encrypted.subarray(0, 3).toString() !== 'v10') throw Error('Desktop catalog format is unsupported.');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(3, 15));
    cipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([cipher.update(encrypted.subarray(15, -16)), cipher.final()]).toString('utf8');
  } finally { key.fill(0); }
}

const electronSafeStorage = () => process.versions.electron ? require('electron').safeStorage : null;

/**
 * Opens one os_crypt value with Electron's safeStorage. T3 writes with whichever API was
 * available to it, so the async API is tried first and the synchronous one after it (on
 * Linux, T3's values open only with the synchronous API even when the async one reports
 * itself available).
 */
async function decryptSafeStorage(value, safeStorage = electronSafeStorage()) {
  if (!safeStorage) throw Error('safeStorage is unavailable.');
  const bytes = Buffer.from(value, 'base64');
  if (typeof safeStorage.decryptStringAsync === 'function') {
    try {
      if (await safeStorage.isAsyncEncryptionAvailable()) { const out = await safeStorage.decryptStringAsync(bytes); return typeof out === 'string' ? out : out.result; }
    } catch {}
  }
  if (!safeStorage.isEncryptionAvailable()) throw Error('The keyring is unavailable.');
  return safeStorage.decryptString(bytes);
}

/**
 * Reads the catalog once per file version, so a locked keychain is asked once, not on every
 * refresh. `watch` re-reads when T3 rewrites the file (it writes a temp file and renames it).
 */
/** Linux: values T3 protected with its own app-named keyring key open in a helper named like T3. */
function t3Helper(values) {
  const { app } = require('electron');
  return require('./keyring-helper.cjs').decryptAs('t3code', values, { appPath: app.isPackaged ? null : app.getAppPath() });
}

function createCatalogStore({ home = t3Home(), platform = process.platform, safeStorage, dpapi = decryptDesktop, helper = platform === 'linux' && process.versions.electron ? t3Helper : null, fsApi = fs, debounceMs = 400 } = {}) {
  const file = path.join(home, 'userdata', FILE);
  let cached = null, cachedKey = '', pending = null;
  const listeners = new Set();
  let watcher = null, timer = null;
  const opened = new Map(); // value -> plaintext opened by the helper (main process memory only)
  async function decrypt(value) {
    if (platform === 'win32') return dpapi(value);
    try { return await decryptSafeStorage(value, safeStorage === undefined ? electronSafeStorage() : safeStorage); }
    catch (error) {
      if (!helper) throw error;
      if (opened.has(value)) return opened.get(value);
      const [text] = await helper([value]);
      if (typeof text !== 'string') throw error;
      if (opened.size > 8) opened.clear();
      opened.set(value, text); return text;
    }
  }
  const result = (state, catalog = null) => ({ state, catalog, reason: state === 'locked' ? REASON.locked[platform] || REASON.locked.linux : REASON[state] || null });
  async function load() {
    let stat;
    try { stat = await fsApi.promises.stat(file); }
    catch (error) { cachedKey = ''; return result(error.code === 'ENOENT' ? 'missing' : 'invalid'); }
    const key = `${stat.mtimeMs}:${stat.size}`;
    if (cached && key === cachedKey) return cached;
    let document;
    try { document = JSON.parse(await fsApi.promises.readFile(file, 'utf8')); } catch { return result('invalid'); }
    let text;
    try {
      if (typeof document?.encryptedCatalog !== 'string') throw Error();
      text = await decrypt(document.encryptedCatalog);
    } catch { cached = result('locked'); cachedKey = key; return cached; }
    let catalog;
    try { catalog = JSON.parse(text); } catch { cached = result('invalid'); cachedKey = key; return cached; }
    finally { text = null; }
    if (!catalog || typeof catalog !== 'object' || catalog.schemaVersion !== 1) { cached = result('invalid'); cachedKey = key; return cached; }
    cached = result('ok', catalog); cachedKey = key; return cached;
  }
  function changed() {
    cached = null; cachedKey = '';
    for (const listener of listeners) { try { listener(); } catch {} }
  }
  function startWatch() {
    if (watcher) return;
    try {
      watcher = fsApi.watch(path.dirname(file), { persistent: false }, (_event, name) => {
        if (name && String(name) !== FILE) return;
        clearTimeout(timer); timer = setTimeout(changed, debounceMs); timer.unref?.();
      });
      watcher.on?.('error', () => { watcher?.close(); watcher = null; });
    } catch { watcher = null; }
  }
  return {
    file,
    /** { state: ok | missing | locked | invalid, catalog, reason } */
    read() { startWatch(); if (!pending) pending = load().finally(() => { pending = null; }); return pending; },
    /** Decrypts another value T3 protected the same way (its sign-in session). */
    decrypt,
    onChange(listener) { listeners.add(listener); startWatch(); return () => listeners.delete(listener); },
    close() { clearTimeout(timer); watcher?.close(); watcher = null; listeners.clear(); },
  };
}

module.exports = { createCatalogStore, decryptSafeStorage, decryptDesktop };
