// Explicit one-shot delivery audit. No listener, debugger, or timer is retained
// after capture. Source comes from V8, rather than inferring execution from disk.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {fileURLToPath} = require('node:url');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function prepare(win, {root, output, timeoutMs = 15000}) {
  const wc = win.webContents, dbg = wc.debugger;
  let attached = false, done = false, source = null, sourceReady = false, load = null, busy = false;
  let readyResolve, readyReject, readySettled = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const result = {checkedAt: new Date().toISOString(), method: 'Debugger.getScriptSource, UTF-8 SHA-256', status: 'pending'};
  const write = async () => {
    try { await fs.mkdir(path.dirname(output), {recursive: true}); await fs.writeFile(output, JSON.stringify(result, null, 2)); }
    catch (error) { console.error('Delivery audit could not save proof:', error.message); throw error; }
  };
  const detach = () => { dbg.removeListener('message', message); try { if (attached && dbg.isAttached()) dbg.detach(); } catch {} attached = false; };
  const cleanup = () => { clearTimeout(timer); detach(); wc.removeListener('did-finish-load', loaded); wc.removeListener('destroyed', destroyed); };
  const fail = async error => {
    if (done) return;
    if (!readySettled) { readySettled = true; readyReject(error); }
    done = true; result.status = 'failed'; result.error = String(error.message || error); cleanup();
    await write().catch(() => {});
  };
  const finish = async () => {
    if (done || busy || !sourceReady || !source || !load) return;
    busy = true;
    try {
      const observed = await wc.executeJavaScript(`({url:location.href,entry:[...document.scripts].map(s=>s.src).find(s=>/\\/assets\\/index-[^/]+\\.js(?:$|[?#])/.test(s)),officeCreated:!!window.__world})`);
      if (done) return;
      if (!observed.officeCreated || new URL(observed.entry).href !== new URL(source.url).href) throw Error('The parsed entry is not the executing office entry.');
      const file = fileURLToPath(source.url), relative = path.relative(path.resolve(root, 'dist'), file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Executing asset is outside the installed dist.');
      const bytes = await fs.readFile(file), manifestPath = path.resolve(root, 'dist/lucid-build.json'), manifestBytes = await fs.readFile(manifestPath), manifest = JSON.parse(manifestBytes);
      if (done) return;
      const installedSha256 = hash(bytes), executingSha256 = hash(Buffer.from(source.text, 'utf8'));
      Object.assign(result, {observed, parsedEntryUrl: source.url, executingSha256, installedSha256, sameBytes: executingSha256 === installedSha256});
      if (installedSha256 !== executingSha256) throw Error('Executing V8 source differs from the installed asset.');
      Object.assign(result, {status: 'passed', observed, executingSha256, installedSha256, entry: `./${relative.replaceAll(path.sep, '/')}`,
        manifestPath, manifestSha256: hash(manifestBytes), validatedSourceFiles: manifest.files, sameBytes: true});
      done = true; cleanup(); await write();
    } catch (error) { busy = false; await fail(error); }
  };
  const message = async (_event, method, params) => {
    if (done || source || method !== 'Debugger.scriptParsed') return;
    let file;
    try { file = fileURLToPath(params.url); } catch { return; }
    if (!/^index-[^/\\]+\.js$/.test(path.basename(file)) || path.dirname(file) !== path.resolve(root, 'dist/assets')) return;
    // Only one matching entry can own the capture, including while the protocol
    // request is pending and other chunks are parsed.
    source = {url: params.url, text: ''};
    try {
      const captured = await dbg.sendCommand('Debugger.getScriptSource', {scriptId: params.scriptId});
      if (done) return;
      source.text = captured.scriptSource; sourceReady = true; detach(); await finish();
    } catch (error) { await fail(error); }
  };
  const loaded = () => { load = true; void finish(); };
  const destroyed = () => { void fail(Error('Office closed before its delivery audit completed.')); };
  const timer = setTimeout(() => { void fail(Error('Delivery audit timed out before observing a matching executing entry.')); }, timeoutMs);
  wc.once('did-finish-load', loaded); wc.once('destroyed', destroyed);
  try {
    if (dbg.isAttached()) throw Error('Another debugger owns this office.');
    dbg.attach('1.3'); attached = true; dbg.on('message', message);
    dbg.sendCommand('Debugger.enable').then(value => { if (!readySettled) { readySettled = true; readyResolve(value); } }, error => { void fail(error); });
  } catch (error) { void fail(error); }
  return ready;
}
module.exports = {prepare};
