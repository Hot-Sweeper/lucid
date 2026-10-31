const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const os = require('node:os');

function createService({ root = process.env.LUCID_DICTATION_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'Lucid', 'dictation'), spawnWorker = spawn, exists = fs.existsSync } = {}) {
  const python = path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let child = null, loading = null, pending = null, device = null, backend = null, idle = null;
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => stop(), 5 * 60 * 1000); idle.unref(); };
  function stop() {
    clearTimeout(idle);
    const old = child; child = null; device = null; backend = null;
    const cancelled = Object.assign(new Error('Dictation stopped.'), { code: 'CANCELLED' });
    if (loading) { loading.reject(cancelled); loading = null; }
    if (pending) { pending.reject(cancelled); pending = null; }
    old?.kill();
  }
  function load(mode = 'auto') {
    if (!['auto', 'cpu'].includes(mode)) return Promise.reject(new Error('Choose CPU or automatic acceleration.'));
    if (device && backend === mode) { touch(); return Promise.resolve(device); }
    if (loading) return loading.promise;
    if (pending) return Promise.reject(new Error('Dictation is still transcribing.'));
    if (!exists(python) || !exists(path.join(root, 'parakeet-ultra-Q8_0.gguf'))) {
      return Promise.reject(new Error('Dictation needs its local model. Run Setup Dictation.cmd once, then try again.'));
    }
    stop();
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    loading = { promise, resolve, reject };
    const proc = spawnWorker(python, ['-u', path.join(__dirname, '..', 'scripts', 'dictation-worker.py'), mode], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LUCID_DICTATION_HOME: root, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    child = proc; backend = mode;
    const timer = setTimeout(() => fail(new Error('Loading dictation timed out. Try again.')), 120000);
    let lastError = '';
    function fail(error) {
      if (child !== proc) return;
      clearTimeout(timer);
      if (loading) { loading.reject(error); loading = null; }
      if (pending) { pending.reject(error); pending = null; }
      stop();
    }
    proc.stderr.on('data', () => {}); // Native diagnostics must not pollute JSON or UI.
    readline.createInterface({ input: proc.stdout }).on('line', line => {
      if (child !== proc) return;
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'ready') {
        clearTimeout(timer); device = msg;
        const waiter = loading; loading = null; waiter?.resolve(msg); touch();
      } else if (msg.type === 'result') {
        const waiter = pending; pending = null; waiter?.resolve(msg); touch();
      } else if (msg.type === 'error') {
        lastError = msg.error;
        fail(new Error(msg.error || 'Recognition failed. Try again.'));
      }
    });
    proc.on('error', () => fail(new Error('Could not start dictation. Run Setup Dictation.cmd to repair the runtime.')));
    proc.on('exit', () => fail(new Error(lastError || 'The dictation worker stopped. Try again.')));
    // Keep timer cleanup attached even when cancellation rejects the load.
    promise.finally(() => clearTimeout(timer)).catch(() => {});
    if (mode === 'auto') return promise.catch(error => {
      if (error.code === 'CANCELLED') throw error;
      return load('cpu').then(value => { backend = 'auto'; return value; });
    });
    return promise;
  }
  async function run(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length % 4 || bytes.length > 16000 * 4 * 120) throw new Error('Invalid or oversized recording.');
    if (!device || !child) throw new Error('Load dictation before transcribing.');
    if (pending) throw new Error('Dictation is still transcribing.');
    clearTimeout(idle);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(stop, 180000);
      pending = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
      child.stdin.write(JSON.stringify({ audio: Buffer.from(bytes).toString('base64') }) + '\n', error => {
        if (error) stop();
      });
    });
  }
  return { load, run, stop };
}

function register({ ipcMain, app, window, root }) {
  const service = createService({ root });
  for (const [channel, fn] of [['load', mode => service.load(mode)], ['run', bytes => service.run(bytes)], ['cancel', () => service.stop()]]) {
    ipcMain.handle(`dictation:${channel}`, async (event, value) => {
      if (event.sender !== window()?.webContents || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: 'Dictation is only available in Lucid.' };
      try { return { ok: true, value: await fn(value) }; } catch (error) { return { ok: false, error: error.message }; }
    });
  }
  app.on('before-quit', () => service.stop());
  return service;
}
module.exports = { createService, register };
