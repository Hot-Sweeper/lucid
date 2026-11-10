// Run the production delivery bootstrap against a real, isolated Electron page.
// Never imports the application backend, opens the user's profile, or restarts Lucid.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (!process.versions.electron) {
  const output = path.resolve(process.argv[2]);
  fs.mkdirSync(output, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  require('node:child_process').spawn(require('electron'), [__filename, output, ...process.argv.slice(3)], { env, stdio: 'inherit', windowsHide: true })
    .on('error', error => { console.error(error); process.exitCode = 1; })
    .on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const output = path.resolve(process.argv[2]);
  const expectBlocked = process.argv.includes('--expect-blocked');
  const occupiedDebugger = process.argv.includes('--occupied-debugger');
  const fixture = path.join(output, 'fixture');
  app.setPath('userData', path.join(output, 'profile'));
  const proof = path.join(output, 'proof.json');
  assert(!fs.existsSync(proof), 'Use a new output directory for each native audit');
  fs.mkdirSync(path.join(fixture, 'dist/assets'), { recursive: true });
  const source = 'window.__world = { isolatedDeliveryFixture: true };\n';
  fs.writeFileSync(path.join(fixture, 'dist/assets/index-fixture.js'), source);
  fs.writeFileSync(path.join(fixture, 'dist/index.html'), '<!doctype html><html><head><title>Isolated delivery check</title></head><body><script type="module" src="./assets/index-fixture.js"></script></body></html>');
  fs.writeFileSync(path.join(fixture, 'dist/lucid-build.json'), JSON.stringify({ files: { 'fixture.js': crypto.createHash('sha256').update(source).digest('hex') } }));
  const mainSource = fs.readFileSync(path.join(__dirname, '../../electron/main.cjs'), 'utf8');
  const start = mainSource.indexOf('  if (process.env.LUCID_DELIVERY_PROOF && !process.env.LUCID_SHOT)');
  const end = mainSource.indexOf('  // Debug aid:', start);
  assert(start >= 0 && end > start, 'Could not locate production audit bootstrap');
  const bootstrap = mainSource.slice(start, end);
  fs.writeFileSync(path.join(output, 'bootstrap.js'), bootstrap);
  const timeout = setTimeout(() => { console.error('Native delivery bootstrap timed out'); app.exit(1); }, 20000);
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 480, height: 320, webPreferences: { contextIsolation: true, sandbox: true } });
    const started = Date.now(), auditErrors = [];
    let loadStartedMs = null, loadedMs = null, navigations = 0;
    win.webContents.on('did-finish-load', () => { loadedMs = Date.now() - started; });
    const loadOffice = () => { navigations++; loadStartedMs = Date.now() - started; return win.loadFile(path.join(fixture, 'dist/index.html')); };
    const prepare = require('../../electron/delivery-attestation.cjs').prepare;
    const requireAudit = id => {
      assert.equal(id, './delivery-attestation.cjs');
      return { prepare: (window, options) => prepare(window, { ...options, timeoutMs: expectBlocked ? 1200 : 10000 }) };
    };
    try {
      if (occupiedDebugger) win.webContents.debugger.attach('1.3');
      new Function('win', 'loadOffice', 'process', 'require', 'path', '__dirname', 'console', bootstrap)(win, loadOffice,
        { env: { LUCID_DELIVERY_PROOF: proof } }, requireAudit, path, path.join(fixture, 'electron'),
        { error: (...args) => auditErrors.push(args.join(' ')) });
      let result;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try { result = JSON.parse(fs.readFileSync(proof, 'utf8')); } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
        if (result && loadedMs !== null) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert(result, 'Native audit did not write its proof');
      assert.equal(navigations, 1, 'Audit must never navigate twice');
      assert.notEqual(loadedMs, null, 'Office must load even if auditing fails');
      assert.equal(win.webContents.debugger.isAttached(), occupiedDebugger, 'Audit must release its own debugger and preserve other owners');
      if (expectBlocked) {
        assert.equal(result.status, 'failed');
        assert(loadStartedMs >= 1000, 'Baseline must reproduce audit-gated navigation');
      } else if (occupiedDebugger) {
        assert.equal(result.status, 'failed');
        assert.match(result.error, /Another debugger owns/);
        assert(loadStartedMs < 1000, 'Unavailable audit must not delay navigation');
        assert.equal(auditErrors.length, 1);
      } else {
        assert.equal(result.status, 'passed', JSON.stringify(result));
        assert.equal(result.sameBytes, true);
        assert.equal(result.executingSha256, crypto.createHash('sha256').update(source).digest('hex'));
        assert(loadStartedMs < 1000, 'Audit must start navigation immediately');
        assert.equal(auditErrors.length, 0);
      }
      const evidence = { mode: expectBlocked ? 'blocked-baseline' : occupiedDebugger ? 'audit-unavailable-office-loads' : 'nonblocking-production-bootstrap', loadStartedMs, loadedMs, navigations, auditErrors, proof: result, debuggerDetached: !occupiedDebugger, otherDebuggerPreserved: occupiedDebugger };
      fs.writeFileSync(path.join(output, 'bootstrap-result.json'), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify({ mode: evidence.mode, loadStartedMs, loadedMs, status: result.status, sameBytes: result.sameBytes, output }));
      if (occupiedDebugger) win.webContents.debugger.detach();
      clearTimeout(timeout); win.destroy(); app.exit(0);
    } catch (error) { console.error(error); clearTimeout(timeout); win.destroy(); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}
