// T3 Code protects some values (its T3 Connect sign-in) with Electron's async safeStorage,
// whose Linux keyring key is named after the app ("t3code Safe Storage"). Only a process with
// T3's app name can open them, so a short-lived helper process runs under that name with its
// own throwaway data folder (never T3's), opens the values and exits. Plaintext only travels
// through the helper's stdout pipe to the main process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const FLAG = '--t3-keyring-helper=';
const validName = name => /^[\w.-]{1,40}$/.test(name || '');

/** Helper mode, called from the top of main.cjs before anything else touches the app. */
function run(app, name) {
  if (!validName(name)) { app.exit(2); return; }
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-keyring-'));
  app.setName(name);
  app.setPath('userData', data);
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 1 << 20) process.stdin.destroy(); });
  const finish = (code, out = '') => { try { fs.rmSync(data, { recursive: true, force: true }); } catch {} process.stdout.write(out, () => app.exit(code)); };
  app.whenReady().then(() => new Promise(resolve => process.stdin.on('end', resolve))).then(async () => {
    const { safeStorage } = require('electron');
    const values = JSON.parse(input);
    const results = [];
    for (const value of Array.isArray(values) ? values.slice(0, 16) : []) {
      const bytes = Buffer.from(String(value), 'base64');
      let text = null;
      try { if (await safeStorage.isAsyncEncryptionAvailable()) { const out = await safeStorage.decryptStringAsync(bytes); text = typeof out === 'string' ? out : out.result; } } catch {}
      if (text === null) try { text = safeStorage.decryptString(bytes); } catch {}
      results.push(text);
    }
    finish(0, JSON.stringify(results));
  }).catch(() => finish(1));
}

/** Opens values in a helper named `name`. Resolves to one string or null per value. */
function decryptAs(name, values, { execPath = process.execPath, appPath = null, spawnProcess = spawn, timeout = 10000 } = {}) {
  if (!validName(name)) return Promise.reject(Error('Invalid helper name.'));
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const args = [...(appPath ? [appPath] : []), '--ozone-platform=headless', `${FLAG}${name}`];
    const child = spawnProcess(execPath, args, { env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let out = '', settled = false;
    const done = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); done(Error('The keyring helper did not answer.')); }, timeout);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('error', () => done(Error('The keyring helper could not start.')));
    child.on('close', code => {
      if (code !== 0) return done(Error('The keyring helper failed.'));
      try { const rows = JSON.parse(out); out = ''; done(null, rows.map(row => typeof row === 'string' ? row : null)); }
      catch { done(Error('The keyring helper answered unreadably.')); }
    });
    child.stdin.end(JSON.stringify(values));
  });
}

/** The helper flag's name, when this process was started as the helper. */
const helperName = (argv = process.argv) => argv.find(arg => arg.startsWith(FLAG))?.slice(FLAG.length) || null;

module.exports = { run, decryptAs, helperName };
