const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const os = require('node:os');

function createService({ root = process.env.LUCID_DICTATION_HOME || path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Lucid', 'dictation'), spawnWorker = spawn, exists = fs.existsSync, stopTimeoutMs = 5000 } = {}) {
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
      return Promise.reject(new Error('Dictation needs its local model. Click Dictate to download it, then try again.'));
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
    proc.on('error', () => fail(new Error('Could not start dictation. Download the dictation model again to repair it.')));
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
  const ready = () => exists(python) && exists(path.join(root, 'parakeet-ultra-Q8_0.gguf'));
  return { load, run, stop, ready, root };
}

// One-time install of the speech runtime and model (scripts/setup-dictation.py), started from the
// Dictate button. Progress is read from the script's own output; one install runs at a time.
function createInstaller({ root, ready, spawnSetup = spawn }) {
  let proc = null, progress = 0, stage = '', error = '';
  function status() { return { ready: ready(), installing: !!proc, progress, stage, error }; }
  function start() {
    if (ready() || proc) return status();
    progress = 0; stage = 'Preparing'; error = '';
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const tails = { out: '', err: '' };
    try {
      proc = spawnSetup(python, ['-u', path.join(__dirname, '..', 'scripts', 'setup-dictation.py')], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LUCID_DICTATION_HOME: root, PYTHONUNBUFFERED: '1' },
      });
    } catch (e) { proc = null; error = `Could not start setup: ${e.message}`; return status(); }
    const read = which => chunk => {
      const text = String(chunk); tails[which] = (tails[which] + text).slice(-2000);
      const pct = [...text.matchAll(/Downloading Ultra: (\d+)%/g)].at(-1);
      if (pct) { stage = 'Downloading the speech model'; progress = Number(pct[1]) / 100; }
      else if (/Collecting|Installing|Downloading transcribe/i.test(text)) stage = 'Installing the speech engine';
    };
    proc.stdout.on('data', read('out')); proc.stderr.on('data', read('err'));
    proc.on('error', e => { error = `Could not start setup: ${e.message}. Install Python 3, then try again.`; proc = null; });
    proc.on('close', code => {
      const last = text => text.trim().split(/\r?\n|\r/).filter(Boolean).at(-1);
      if (code !== 0 && !error) error = (last(tails.err) || last(tails.out) || 'Setup failed.').slice(0, 300);
      if (code === 0) { progress = 1; stage = 'Ready'; }
      proc = null;
    });
    return status();
  }
  return { status, start, stop: () => { try { proc?.kill(); } catch {} } };
}

function register({ ipcMain, app, window, root }) {
  const service = createService({ root });
  const installer = createInstaller({ root: service.root, ready: service.ready });
  for (const [channel, fn] of [['load', mode => service.load(mode)], ['run', bytes => service.run(bytes)], ['cancel', () => service.stop()], ['status', () => installer.status()], ['setup', () => installer.start()]]) {
    ipcMain.handle(`dictation:${channel}`, async (event, value) => {
      if (event.sender !== window()?.webContents || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: 'Dictation is only available in Lucid.' };
      try { return { ok: true, value: await fn(value) }; } catch (error) { return { ok: false, error: error.message }; }
    });
  }
  app.on('before-quit', () => { service.stop(); installer.stop(); });
  return service;
}
module.exports = { createService, createInstaller, register };
