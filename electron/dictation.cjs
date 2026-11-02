const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const os = require('node:os');

function createService({ root = process.env.LUCID_DICTATION_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'Lucid', 'dictation'), spawnWorker = spawn, exists = fs.existsSync, stopTimeoutMs = 5000 } = {}) {
  const python = path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let worker = null, loading = null, pending = null, device = null, backend = null, idle = null;
  const cancelled = () => Object.assign(new Error('Dictation stopped.'), { code: 'CANCELLED' });
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => stop(), 5 * 60 * 1000); idle.unref(); };
  // Keep ownership until exit/close, including after a kill request. Starting a
  // replacement immediately can overlap two native models during shutdown.
  function retire(record) {
    if (!record || record.exited) return Promise.resolve(true);
    if (record.stopping) return record.stopping;
    record.rejectReady(cancelled()); clearTimeout(record.loadTimer);
    record.stopping = new Promise(resolve => { record.stopped = resolve; });
    record.stopTimer = setTimeout(() => record.stopped(false), stopTimeoutMs);
    record.stopTimer.unref?.();
    try { record.proc.kill(); } catch { /* Exit may already be queued. */ }
    return record.stopping;
  }
  function stop() {
    clearTimeout(idle);
    device = null; backend = null;
    if (loading) { loading.reject(cancelled()); loading = null; }
    if (pending) { pending.reject(cancelled()); pending = null; }
    void retire(worker);
  }
  function load(mode = 'auto') {
    if (!['auto', 'cpu'].includes(mode)) return Promise.reject(new Error('Choose CPU or automatic acceleration.'));
    if (device && backend === mode && !worker?.stopping) { touch(); return Promise.resolve(device); }
    if (loading) return loading.promise;
    if (pending) return Promise.reject(new Error('Dictation is still transcribing.'));
    if (!exists(python) || !exists(path.join(root, 'parakeet-ultra-Q8_0.gguf'))) {
      return Promise.reject(new Error('Dictation needs its local model. Run Setup Dictation.cmd once, then try again.'));
    }
    clearTimeout(idle); device = null; backend = null;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const operation = { promise, resolve, reject };
    loading = operation;
    const current = () => { if (loading !== operation) throw cancelled(); };
    async function start(selected) {
      if (worker && !await retire(worker)) throw new Error('The previous dictation worker is still stopping. Try again.');
      current();
      const record = spawnModel(selected);
      const value = await record.ready;
      current();
      if (record !== worker || record.stopping || record.exited) throw new Error('The dictation worker stopped. Try again.');
      return value;
    }
    // Every caller shares the complete operation, including automatic fallback.
    // A cancelled operation cannot start CPU fallback after its error settles.
    void (async () => {
      try {
        let value;
        try { value = await start(mode); }
        catch (error) { current(); if (mode !== 'auto' || error.code === 'CANCELLED') throw error; value = await start('cpu'); }
        current(); device = value; backend = mode; loading = null; resolve(value); touch();
      } catch (error) { if (loading === operation) loading = null; reject(error); }
    })();
    return promise;
  }
  function spawnModel(mode) {
    const proc = spawnWorker(python, ['-u', path.join(__dirname, '..', 'scripts', 'dictation-worker.py'), mode], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LUCID_DICTATION_HOME: root, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const record = { proc, ready, resolveReady, rejectReady, stopping: null, stopped: null, exited: false, loadTimer: null, stopTimer: null };
    worker = record;
    record.loadTimer = setTimeout(() => fail(new Error('Loading dictation timed out. Try again.')), 120000);
    let lastError = '';
    function fail(error) {
      if (worker !== record || record.stopping || record.exited) return;
      clearTimeout(record.loadTimer); rejectReady(error);
      if (pending) { pending.reject(error); pending = null; }
      device = null; backend = null; void retire(record);
    }
    proc.stderr.on('data', () => {}); // Native diagnostics must not pollute JSON or UI.
    const lines = readline.createInterface({ input: proc.stdout });
    lines.on('line', line => {
      if (worker !== record || record.stopping || record.exited) return;
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'ready') {
        clearTimeout(record.loadTimer); resolveReady(msg);
      } else if (msg.type === 'result') {
        const waiter = pending; pending = null; waiter?.resolve(msg); touch();
      } else if (msg.type === 'error') {
        lastError = msg.error;
        fail(new Error(msg.error || 'Recognition failed. Try again.'));
      }
    });
    proc.stdin.on('error', () => fail(new Error('The dictation worker stopped receiving audio. Try again.')));
    proc.on('error', () => fail(new Error('Could not start dictation. Run Setup Dictation.cmd to repair the runtime.')));
    function exited() {
      if (record.exited) return;
      record.exited = true; clearTimeout(record.loadTimer); clearTimeout(record.stopTimer); lines.close();
      const error = new Error(lastError || 'The dictation worker stopped. Try again.');
      rejectReady(error);
      if (worker === record) {
        worker = null; device = null; backend = null;
        if (pending) { pending.reject(error); pending = null; }
      }
      record.stopped?.(true);
    }
    proc.once('exit', exited); proc.once('close', exited);
    return record;
  }
  async function run(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length % 4 || bytes.length > 16000 * 4 * 120) throw new Error('Invalid or oversized recording.');
    if (!device || !worker || worker.stopping) throw new Error('Load dictation before transcribing.');
    if (pending) throw new Error('Dictation is still transcribing.');
    const record = worker;
    clearTimeout(idle);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(stop, 180000);
      pending = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
      try {
        record.proc.stdin.write(JSON.stringify({ audio: Buffer.from(bytes).toString('base64') }) + '\n', error => {
          if (error && worker === record && !record.stopping && !record.exited) stop();
        });
      } catch { stop(); }
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
