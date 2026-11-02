const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

/** Terminate only the group/tree created for this command, before its owner is released. */
function terminateTree(child, timeoutMs) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return Promise.resolve();
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') return Promise.reject(error); }
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let details = '', done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      try { killer.kill(); } catch {}
      finish(new Error('Timed out stopping the update command process tree.'));
    }, timeoutMs);
    for (const stream of [killer.stdout, killer.stderr]) {
      stream.on('data', chunk => { if (details.length < 8192) details += chunk.toString(); });
      stream.once('error', finish);
    }
    killer.once('error', finish);
    killer.once('close', code => finish(code === 0 ? null : new Error(details.trim() || `Could not stop the update command process tree (exit ${code}).`)));
  });
}

/** Run one update command. Success returns trimmed stdout, preserving the updater API. */
function runUpdateCommand(command, args, cwd, {
  timeoutMs = command === 'git' ? 10000 : 600000,
  cleanupTimeoutMs = 5000,
  maxOutputBytes = 32 * 1024 * 1024,
  signal,
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Update command cancelled.'), { code: 'ABORT_ERR' }));
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(cleanupTimeoutMs) || cleanupTimeoutMs <= 0 ||
        !Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0) return reject(new Error('Invalid update command limits.'));
    // Only npm needs cmd.exe. Its updater arguments are fixed tokens, so reject
    // shell metacharacters rather than trying to reinterpret arbitrary shell input.
    const npmShell = process.platform === 'win32' && command === 'npm';
    if (npmShell && args.some(arg => !/^[a-zA-Z0-9_./:@=+-]+$/.test(arg))) return reject(new Error('Unsupported shell characters in npm update arguments.'));
    const executable = npmShell ? process.env.ComSpec || 'cmd.exe' : command;
    const parameters = npmShell ? ['/d', '/s', '/c', ['npm', ...args].join(' ')] : args;
    let child;
    try {
      child = spawn(executable, parameters, { cwd, windowsHide: true, shell: false,
        windowsVerbatimArguments: npmShell, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { reject(error); return; }
    let stdout = '', stderr = '', bytes = 0, done = false, closed = false, exitCode = null, exitSignal = null;
    let failure = null, termination = null, cleanupError = null, cleanupTimer = null;
    const outDecoder = new StringDecoder('utf8'), errDecoder = new StringDecoder('utf8');
    const finish = () => {
      if (done) return;
      done = true; clearTimeout(timer); clearTimeout(cleanupTimer); signal?.removeEventListener('abort', abort);
      stdout += outDecoder.end(); stderr += errDecoder.end();
      if (!failure && exitCode === 0) { resolve(stdout.trim()); return; }
      const reason = failure || new Error(`${command} exited with code ${exitCode}${exitSignal ? ` (${exitSignal})` : ''}.`);
      const useful = [stderr.trim() && `stderr:\n${stderr.trim().slice(-16000)}`, stdout.trim() && `stdout:\n${stdout.trim().slice(-16000)}`].filter(Boolean).join('\n');
      const error = new Error([reason.message, useful, cleanupError?.message].filter(Boolean).join('\n'));
      Object.assign(error, { code: reason.code || 'UPDATE_COMMAND_FAILED', stdout, stderr, exitCode, signal: exitSignal, commandPid:child.pid,
        cleanupUnconfirmed: !!cleanupError || (!!termination && !closed) });
      reject(error);
    };
    function stop(reason) {
      if (done || termination) return;
      failure = reason; clearTimeout(timer);
      // Do not kill cmd first: taskkill must discover its npm/tsc/vite descendants
      // while the owned root still exists. Wait for tree termination AND close.
      termination = terminateTree(child, cleanupTimeoutMs);
      cleanupTimer = setTimeout(() => {
        cleanupError ||= new Error('The update command did not close after process-tree termination.');
        finish();
      }, cleanupTimeoutMs + 250);
      termination.then(() => { if (closed) finish(); }, error => { cleanupError = error; finish(); });
    }
    const abort = () => stop(Object.assign(new Error('Update command cancelled.'), { code: 'ABORT_ERR' }));
    const timer = setTimeout(() => stop(Object.assign(new Error(`${command} timed out after ${timeoutMs} ms.`), { code: 'ETIMEDOUT' })), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    function collect(which, decoder, chunk) {
      if (done) return;
      const room = Math.max(0, maxOutputBytes - bytes);
      bytes += chunk.length;
      const text = decoder.write(chunk.subarray(0, room));
      if (which === 'out') stdout += text; else stderr += text;
      if (bytes > maxOutputBytes) stop(Object.assign(new Error(`${command} produced too much output.`), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }));
    }
    child.stdout.on('data', chunk => collect('out', outDecoder, chunk));
    child.stderr.on('data', chunk => collect('err', errDecoder, chunk));
    child.stdout.on('error', error => stop(error)); child.stderr.on('error', error => stop(error));
    child.once('error', error => {
      failure = error;
      if (child.pid) stop(error); else finish();
    });
    child.once('close', (code, closedSignal) => {
      closed = true; exitCode = code; exitSignal = closedSignal;
      if (!termination) finish(); else termination.then(finish, () => {});
    });
  });
}

module.exports = { runUpdateCommand };
