// One read-only capture of an already running production page on existing CDP.
// Never launches, reloads, restarts, reads world data, or copies application code.
// node scripts/capture-executing-build.cjs --root "E:/T3 Projects/Lucid" --manifest <json> --out <new.json> [--validated-source <private snapshot>]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const PRODUCTION_ROOT = path.resolve('E:/T3 Projects/Lucid');
const SOURCE_FILES = ['src/office/outside-zoom.ts', 'src/office/outside-canvas.ts', 'src/office/chat-panel.ts',
  'src/office/chat-message.ts', 'src/office/chat-scroll.ts', 'src/os/wm.ts', 'src/os/apps.ts',
  'src/harness/note-presentation.ts',
  'src/social/botsapp.ts', 'src/social/conversation-name.ts'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const readHash = file => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
const fileMap = manifest => manifest?.files && typeof manifest.files === 'object' ? manifest.files : null;
const sameFiles = (a, b) => a && b ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]) : null;
function productionPage(url, root) {
  try { return new URL(url).protocol === 'file:' && samePath(fileURLToPath(url), path.join(root, 'dist/index.html')); }
  catch { return false; }
}
function entryFile(url, root) {
  try {
    if (new URL(url).protocol !== 'file:') return null;
    const file = fileURLToPath(url);
    return samePath(path.dirname(file), path.join(root, 'dist/assets')) && /^index-[A-Za-z0-9_-]+\.js$/.test(path.basename(file)) ? file : null;
  } catch { return null; }
}
async function capture(options) {
  const { root, manifestPath, output, validatedSource } = options;
  if (!root || !samePath(root, PRODUCTION_ROOT)) throw Error('Capture is restricted to the exact production root E:/T3 Projects/Lucid.');
  const started = performance.now(), timeoutMs = 15000, remaining = limit => Math.max(1, Math.min(limit, timeoutMs - (performance.now() - started)));
  const result = { checkedAt: new Date().toISOString(), root, method: 'Existing CDP page, Debugger.getScriptSource, UTF-8 SHA-256',
    status: 'failed', noLaunchReloadOrRestart: true, validationRunIndependentlyAttested: false };
  let ws, debuggerAttempted = false, sequence = 0, onParsed = null;
  const pending = new Map(), parsed = new Map();
  const call = (method, params = {}, limit = 3500) => new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(Error('Existing CDP connection is not open.')); return; }
    if (performance.now() - started >= timeoutMs && method !== 'Debugger.disable') { reject(Error('Executing-build capture exceeded its time budget.')); return; }
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out.')); }, method === 'Debugger.disable' ? 1000 : remaining(limit));
    pending.set(id, { resolve, reject, timer });
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  const rejectPending = error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); };
  try {
    const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
    const installedManifestPath = path.join(root, 'dist/lucid-build.json');
    const installedBytes = fs.existsSync(installedManifestPath) ? fs.readFileSync(installedManifestPath) : null;
    const installedManifest = installedBytes ? JSON.parse(installedBytes) : null;
    result.manifest = { path: manifestPath, sha256: sha256(manifestBytes), installedPath: installedManifestPath,
      installedSha256: installedBytes ? sha256(installedBytes) : null,
      sameBytesAsInstalledManifest: installedBytes ? sha256(manifestBytes) === sha256(installedBytes) : null,
      sourceFileMapMatchesInstalled: sameFiles(fileMap(manifest), fileMap(installedManifest)) };
    result.sourceHashes = SOURCE_FILES.map(file => ({ file, manifestSha256: fileMap(manifest)?.[file] ?? null,
      currentWorkingTreeSha256: readHash(path.join(root, file)) }));
    const response = await fetch('http://127.0.0.1:9334/json/list', { signal: AbortSignal.timeout(remaining(4000)) });
    if (!response.ok) throw Error('Existing CDP page inventory failed with HTTP ' + response.status);
    const pages = await response.json();
    const matches = pages.filter(page => page.type === 'page' && productionPage(page.url, root));
    if (matches.length !== 1) throw Error('Expected exactly one existing production dist/index.html page, found ' + matches.length);
    const target = matches[0], endpoint = new URL(target.webSocketDebuggerUrl);
    if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.port !== '9334') throw Error('CDP target is not the required existing loopback port 9334.');
    result.target = { id: target.id, url: target.url };
    ws = new WebSocket(endpoint);
    ws.addEventListener('message', event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.id) {
        const item = pending.get(data.id); if (!item) return;
        clearTimeout(item.timer); pending.delete(data.id);
        data.error ? item.reject(Error(data.error.message)) : item.resolve(data.result);
      } else if (data.method === 'Debugger.scriptParsed' && entryFile(data.params.url, root)) {
        parsed.set(data.params.scriptId, { scriptId: data.params.scriptId, url: data.params.url }); onParsed?.();
      }
    });
    ws.addEventListener('close', () => rejectPending(Error('Existing CDP connection closed.')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Existing CDP connection timed out.')), remaining(3500));
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('Existing CDP connection failed.')); }, { once: true });
    });
    const observe = async () => {
      const value = await call('Runtime.evaluate', { expression: '({url:location.href,scripts:[...document.scripts].map(script=>script.src).filter(Boolean),officeCreated:!!window.__world})', returnByValue: true });
      if (value.exceptionDetails) throw Error('Could not read minimal production page identity.');
      const state = value.result?.value;
      if (!state?.officeCreated || !productionPage(state.url, root)) throw Error('The existing target is not an initialized production office.');
      return state;
    };
    const state = await observe(), entries = state.scripts.filter(url => entryFile(url, root));
    if (entries.length !== 1) throw Error('Expected exactly one production entry script, found ' + entries.length);
    result.observed = state;
    debuggerAttempted = true; await call('Debugger.enable');
    if (![...parsed.values()].some(script => script.url === entries[0])) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { onParsed = null; reject(Error('Executing production entry was not reported by V8.')); }, remaining(2500));
        onParsed = () => { if ([...parsed.values()].some(script => script.url === entries[0])) { clearTimeout(timer); onParsed = null; resolve(); } };
        onParsed();
      });
    }
    const scripts = [...parsed.values()].filter(script => script.url === entries[0]);
    if (scripts.length !== 1) throw Error('V8 reported ambiguous entry scripts; capture stopped without changing the page.');
    const { scriptSource } = await call('Debugger.getScriptSource', { scriptId: scripts[0].scriptId });
    if (typeof scriptSource !== 'string') throw Error('V8 did not return entry source.');
    const executingSha256 = sha256(Buffer.from(scriptSource, 'utf8')), file = entryFile(entries[0], root), installedAssetSha256 = readHash(file);
    const after = await observe();
    if (after.url !== state.url || JSON.stringify(after.scripts) !== JSON.stringify(state.scripts) || [...parsed.values()].filter(script => script.url === entries[0]).length !== 1) throw Error('Page identity changed during capture.');
    result.entry = { url: entries[0], file, relative: path.relative(path.join(root, 'dist'), file).replaceAll(path.sep, '/'),
      executingSha256, installedAssetSha256, v8MatchesInstalledAsset: executingSha256 === installedAssetSha256 };
    if (!result.entry.v8MatchesInstalledAsset) { result.status = 'executing-installed-mismatch'; throw Error('Executing V8 entry does not match the installed asset.'); }
    result.validation = { status: 'provenance-missing', providedSource: validatedSource || null,
      note: 'Byte matches do not independently establish that validation ran. Working-tree source hashes do not identify already executing code.' };
    if (validatedSource) {
      result.validation.exists = fs.existsSync(validatedSource);
      if (result.validation.exists) {
        const validationManifestPath = path.join(validatedSource, 'dist/lucid-build.json'), validationBytes = fs.existsSync(validationManifestPath) ? fs.readFileSync(validationManifestPath) : null;
        const validationManifest = validationBytes ? JSON.parse(validationBytes) : null;
        const assetPath = path.join(validatedSource, 'dist', result.entry.relative), assetSha256 = readHash(assetPath);
        Object.assign(result.validation, { manifestPath: validationManifestPath, manifestSha256: validationBytes ? sha256(validationBytes) : null,
          assetPath, assetSha256, v8MatchesSuppliedSnapshot: executingSha256 === assetSha256,
          suppliedManifestSourceMapMatches: sameFiles(fileMap(manifest), fileMap(validationManifest)),
          suppliedSourceHashes: SOURCE_FILES.map(source => ({ file: source, sha256: readHash(path.join(validatedSource, source)), manifestSha256: fileMap(validationManifest)?.[source] ?? null })) });
        const expectedSources = result.validation.suppliedSourceHashes.filter(source => source.manifestSha256 !== null);
        result.validation.narrowSourceFilesMatchManifest = expectedSources.length > 0 && expectedSources.every(source => source.sha256 === source.manifestSha256);
        const matches = result.validation.v8MatchesSuppliedSnapshot && result.validation.suppliedManifestSourceMapMatches === true && result.validation.narrowSourceFilesMatchManifest;
        result.validation.status = matches ? 'supplied-snapshot-bytes-match-validation-run-not-independently-attested' : 'supplied-snapshot-mismatch-or-incomplete';
      }
    }
    result.status = result.manifest.sourceFileMapMatchesInstalled === false ? 'execution-match-supplied-manifest-differs'
      : result.validation.status.startsWith('supplied-snapshot-bytes-match') ? 'execution-match-supplied-snapshot-matched' : 'execution-match-validation-provenance-unproven';
  } catch (error) { result.error = String(error.message || error); }
  finally {
    onParsed = null;
    if (debuggerAttempted && ws?.readyState === WebSocket.OPEN) {
      try { await call('Debugger.disable', {}, 1000); result.ownDebuggerDisabled = true; }
      catch (error) { result.ownDebuggerDisabled = false; result.cleanupError = String(error.message || error); }
    }
    if (ws) {
      await new Promise(resolve => {
        if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
        const timer = setTimeout(resolve, 1000);
        ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
        try { ws.close(); } catch { clearTimeout(timer); resolve(); }
      });
      result.webSocketClosed = ws.readyState === WebSocket.CLOSED;
      if (!result.webSocketClosed) result.cleanupError = [result.cleanupError, 'WebSocket close handshake timed out; the standalone helper will exit and release its socket.'].filter(Boolean).join(' ');
    }
    rejectPending(Error('Executing-build capture finished.'));
    result.elapsedMs = performance.now() - started;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  }
  return result;
}
if (require.main === module) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const requestedRoot = arg('--root'), manifest = arg('--manifest'), out = arg('--out'), validation = arg('--validated-source');
  if (!requestedRoot || !manifest || !out || !samePath(requestedRoot, PRODUCTION_ROOT)) throw Error('Require exact --root "E:/T3 Projects/Lucid", --manifest <json> and --out <new.json>.');
  const validatedSource = validation ? path.resolve(validation) : null;
  if (validatedSource && (!/[\\/]\.lucid-update-|[\\/]Lucid-validation[\\/]/i.test(validatedSource) || samePath(validatedSource, PRODUCTION_ROOT))) throw Error('Validated source must name a private validation snapshot.');
  const output = path.resolve(out);
  if (fs.existsSync(output)) throw Error('Capture output already exists; use a new file.');
  capture({ root: PRODUCTION_ROOT, manifestPath: path.resolve(manifest), output, validatedSource }).then(result => {
    const code = result.error || result.ownDebuggerDisabled === false || result.webSocketClosed === false ? 1 : 0;
    process.stdout.write(JSON.stringify({ status: result.status, output, executingSha256: result.entry?.executingSha256, validation: result.validation?.status }) + '\n', () => process.exit(code));
  }).catch(error => { process.stderr.write(String(error.message || error) + '\n', () => process.exit(1)); });
}
module.exports = { capture, productionPage, entryFile };
