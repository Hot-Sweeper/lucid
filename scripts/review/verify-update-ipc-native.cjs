// Real preload, IPC registration and main.cjs handler, with private files/profile.
// Reuses the already-installed-source restart path; backend build cases live in
// verify-updater-transaction-native.cjs and are not repeated here.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { snapshot } = require('../../electron/build-state.cjs');
async function native(out, mode) {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const profile = path.join(out, mode, 'profile'), fixture = path.join(out, mode, 'installation');
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  await app.whenReady();
  const reportFile = path.join(out, mode, 'results.json');
  const report = { mode, injected: mode === 'flush-failure', events: [], productionRestarted: false };
  const record = event => { report.events.push(event); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); };
  for (const dir of ['src', 'dist']) fs.mkdirSync(path.join(fixture, dir), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'src/probe.ts'), 'export const value = 1;');
  fs.writeFileSync(path.join(fixture, 'dist/index.html'), '<html>Private installed app</html>');
  const manifest = () => fs.writeFileSync(path.join(fixture, 'dist/lucid-build.json'), JSON.stringify({ files: snapshot(fixture) }));
  manifest();
  const updater = require('../../electron/updater.cjs').createUpdater(fixture);
  fs.writeFileSync(path.join(fixture, 'src/probe.ts'), 'export const value = 2;');
  manifest(); // A separate coordinator already installed this exact source.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let failWrites = mode === 'flush-failure';
  const io = { ...fs.promises,
    open: async (...args) => { record('save-pending'); await gate; return fs.promises.open(...args); },
    rename: async (...args) => {
      if (failWrites) { record('injected-save-error'); throw Error('Injected settings persistence failure'); }
      await fs.promises.rename(...args); record('save-durable');
    },
  };
  const source = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  const start = source.indexOf('const SETTINGS ='), end = source.indexOf('let savingBeforeQuit', start);
  const updateStart = source.indexOf('ipcMain.handle("app:check-update"'), updateEnd = source.indexOf('// lucid-file://local/', updateStart);
  assert(start > 0 && end > start && updateStart > end && updateEnd > updateStart);
  const handlerSource = source.slice(start, end) + source.slice(updateStart, updateEnd);
  report.handlerSha256 = require('node:crypto').createHash('sha256').update(handlerSource).digest('hex');
  const localRequire = name => name === './json-store.cjs'
    ? { createJsonStore: (file, options) => require('../../electron/json-store.cjs').createJsonStore(file, { ...options, io }) }
    : require(path.resolve(root, 'electron', name));
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, sandbox: false } });
  // Actual relaunch schedules a new private Electron process. Exit also remains
  // real; only its argument list is scoped to this fixture by the wrapper.
  const lifecycle = {
    getPath: name => app.getPath(name),
    relaunch: () => { record('relaunch'); app.relaunch({ execPath: process.execPath, args: [__filename, '--reopened', out, mode] }); },
    exit: code => { record('exit'); app.exit(code); },
  };
  const send = (channel, step) => { record(step); if (step === 'Restarting') release(); win.webContents.send(channel, step); };
  new Function('app', 'ipcMain', 'path', 'require', '__dirname', 'updater', 'send', handlerSource)(lifecycle, ipcMain, path, localRequire, path.join(fixture, 'electron'), updater, send);
  await win.loadURL('data:text/html,<html><title>Private update IPC fixture</title></html>');
  let result;
  try { result = await win.webContents.executeJavaScript(`(async()=>{
    const saves=[window.lucid.settingsSave(JSON.stringify({draft:'private pending draft'})),window.lucid.rosterSave(JSON.stringify([{name:'Private fixture robot'}]))];
    const observed=Promise.allSettled(saves);
    const result=await window.lucid.applyUpdate();
    return {result,saves:await observed};
  })()`); } catch (error) { if (report.events.includes('exit')) return; throw error; }
  report.response = result;
  record('ipc-returned');
  if (mode === 'flush-failure') {
    assert.equal(result.result.ok, false, 'Failed persistence must prevent relaunch');
    assert.match(result.result.details, /Injected settings persistence failure/);
    assert(!report.events.includes('relaunch'));
    failWrites = false;
    report.retryRequested = true;
    record('retry-after-successful-save');
    try {
      await win.webContents.executeJavaScript(`(async()=>{
        await Promise.all([window.lucid.settingsSave(JSON.stringify({draft:'private pending draft'})),window.lucid.rosterSave(JSON.stringify([{name:'Private fixture robot'}]))]);
        return window.lucid.applyUpdate();
      })()`);
    } catch (error) { if (report.events.includes('exit')) return; throw error; }
    throw Error('Retry should exit through the real relaunch boundary');
  } else throw Error('Successful update should exit through the real relaunch boundary');
  report.status = 'passed'; fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  win.destroy(); app.exit(0);
}
async function reopened(out, mode) {
  const { app } = require('electron');
  app.setPath('userData', path.join(out, mode, 'profile'));
  const file = path.join(out, mode, 'results.json'), report = JSON.parse(fs.readFileSync(file));
  try {
    assert(mode === 'success' || report.retryRequested, 'Injected persistence failure crossed the relaunch boundary');
    const profile = app.getPath('userData');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).draft, 'private pending draft');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'roster.json')))[0].name, 'Private fixture robot');
    assert(report.events.lastIndexOf('save-durable') < report.events.indexOf('relaunch'));
    report.status = 'passed'; report.reopenedStateVerified = true;
  } catch (e) { report.status = 'failed'; report.error = e.stack; }
  fs.writeFileSync(file, JSON.stringify(report, null, 2)); app.exit(report.status === 'passed' ? 0 : 1);
}
async function parent(out) {
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  for (const mode of ['success', 'flush-failure']) {
    await new Promise((resolve, reject) => {
      const child = require('node:child_process').spawn(require('electron'), [__filename, '--native', out, mode], { env, windowsHide: true, stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`IPC fixture exited ${code}`)));
    });
    // The relaunched process is independent of the original process handle.
    const file = path.join(out, mode, 'results.json');
    for (let i = 0; i < 200; i++) {
      const result = JSON.parse(fs.readFileSync(file));
      if (result.status) { assert.equal(result.status, 'passed', result.error); break; }
      if (i === 199) throw Error('Relaunch result deadline');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  console.log('PASS: actual preload/IPC handler, pending state durability, private relaunch/reopen, and injected save-failure response.');
}
const out = path.resolve(process.argv[3] || path.join(require('node:os').tmpdir(), `lucid-ipc-${Date.now()}`));
if (process.versions.electron) (process.argv[2] === '--reopened' ? reopened(out, process.argv[4]) : native(out, process.argv[4])).catch(e => { console.error(e); require('electron').app.exit(1); });
else parent(out).catch(e => { console.error(e); process.exitCode = 1; });
