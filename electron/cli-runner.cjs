const { spawn } = require('node:child_process');

function runCliProcess(command, args, { input, env = process.env, timeoutMs = 30000, maxOutputBytes = 8 * 1024 * 1024,
  spawnProcess = spawn, timeout = setTimeout, cancelTimeout = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { windowsHide: true, env });
    let out = '', err = '', bytes = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; cancelTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const stop = message => {
      finish(new Error(message));
      try { child.kill(); } catch {}
    };
    const timer = timeout(() => stop('T3 did not answer in time. The action may have reached T3 Code. Check the thread before retrying.'), timeoutMs);
    timer.unref?.();
    const collect = (stream, data) => {
      if (settled) return;
      bytes += Buffer.byteLength(data);
      if (bytes > maxOutputBytes) return stop('T3 returned too much output. Check the thread in T3 Code before retrying.');
      if (stream === 'out') out += data; else err += data;
    };
    child.stdout.on('data', data => collect('out', data));
    child.stderr.on('data', data => collect('err', data));
    child.on('error', error => finish(error));
    // A failed launcher can close stdin before the write completes. Do not let
    // its EPIPE become an uncaught exception in Electron's main process.
    child.stdin.on('error', error => { if (!settled) { finish(error); try { child.kill(); } catch {} } });
    child.on('close', code => finish(code === 0 ? null : new Error(err.trim() || `T3 exited with code ${code}`), out));
    child.stdin.end(input == null ? undefined : input);
  });
}

module.exports = { runCliProcess };
