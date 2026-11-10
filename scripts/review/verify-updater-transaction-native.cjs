// Full production-source transaction in a private installation and Electron profile.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const { snapshot, changed } = require('../../electron/build-state.cjs');
async function native(out) {
  const { app } = require('electron');
  app.setPath('userData', path.join(out, 'profile'));
  await app.whenReady();
  const fixture = path.join(out, 'installation');
  const { createUpdater } = require('../../electron/updater.cjs');
  const { runUpdateCommand } = require('../../electron/update-command.cjs');
  const report = { electron: process.versions.electron, productionRestarted: false, attempts: [] };
  const tree = dir => {
    const result = {};
    function visit(part) { for (const e of fs.readdirSync(path.join(dir, part), { withFileTypes: true })) {
      const name = path.join(part, e.name);
      if (e.isDirectory()) visit(name);
      else result[name] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
    } }
    visit(''); return result;
  };
  const installed = tree(path.join(root, 'dist'));
  async function attempt(name, execute) {
    const row = { name, stages: [], commands: [] }; report.attempts.push(row);
    const updater = createUpdater(fixture, async (cmd, args, cwd = fixture) => {
      row.commands.push({ cmd, args });
      return execute ? execute(cmd, args, cwd) : runUpdateCommand(cmd, args, cwd);
    });
    try { row.result = await updater.apply(stage => row.stages.push(stage), { localOnly: true }); }
    catch (e) { row.error = e.stack; row.details = e.message; }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    return row;
  }
  try {
    const first = await attempt('current-source');
    assert(!first.error, first.details);
    assert(first.result.updated);
    let before = tree(path.join(fixture, 'dist'));
    const probe = path.join(fixture, 'src/update-transaction-probe.ts');
    fs.writeFileSync(probe, 'export const probe: string = 42;');
    const invalid = await attempt('compiler-failure');
    assert.match(invalid.details, /TS2322/);
    assert.deepEqual(tree(path.join(fixture, 'dist')), before);
    fs.writeFileSync(probe, 'export const probe: string = "retry";');
    const packageFile = path.join(fixture, 'package.json');
    const packageBefore = fs.readFileSync(packageFile, 'utf8');
    const pkg = JSON.parse(packageBefore);
    pkg.scripts.typecheck += ' && node scripts/update-transaction-wait.cjs';
    fs.writeFileSync(packageFile, JSON.stringify(pkg));
    fs.writeFileSync(path.join(fixture, 'scripts/update-transaction-wait.cjs'), 'console.log("VALIDATION_WAIT_READY");setInterval(()=>{},1000);');
    const interrupted = await attempt('interrupted-validation', async (cmd, args, cwd) => {
      const controller = new AbortController();
      // Interrupt a stable running validation tree, not a naturally exiting child.
      const timer = setTimeout(() => controller.abort(), 3000);
      try { return await runUpdateCommand(cmd, args, cwd, { signal: controller.signal }); }
      finally { clearTimeout(timer); }
    });
    assert.match(interrupted.details, /cancelled/);
    assert(!fs.existsSync(path.join(fixture, '.lucid-update-recovery.json')), interrupted.details);
    fs.writeFileSync(packageFile, packageBefore);
    fs.unlinkSync(path.join(fixture, 'scripts/update-transaction-wait.cjs'));
    assert.deepEqual(tree(path.join(fixture, 'dist')), before);
    assert(!fs.existsSync(path.join(fixture, '.lucid-update.lock')));
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (path.basename(from) === 'dist-update') throw Error('Injected promotion interruption'); return rename(from, to); };
    let promotion;
    try { promotion = await attempt('promotion-failure'); } finally { fs.renameSync = rename; }
    assert.match(promotion.details, /Injected promotion interruption/);
    assert.deepEqual(tree(path.join(fixture, 'dist')), before);
    const retry = await attempt('successful-retry');
    assert(!retry.error, retry.details); assert(retry.result.updated);
    assert.deepEqual(tree(path.join(fixture, 'dist-previous')), before);
    assert.equal(changed(JSON.parse(fs.readFileSync(path.join(fixture, 'dist/lucid-build.json'))).files, snapshot(fixture)).length, 0);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
  finally {
    assert.deepEqual(tree(path.join(root, 'dist')), installed);
    report.productionInstallationUnchanged = true;
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  }
}
async function prepare(out) {
  fs.mkdirSync(out, { recursive: true });
  const frozen = await require('../../electron/frozen-input.cjs').freezeInput(root);
  fs.renameSync(frozen.directory, path.join(out, 'installation'));
  // Preserve the real installed manifest so current pending changes are exercised.
  fs.cpSync(path.join(root, 'dist'), path.join(out, 'installation/dist'), { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  await new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(require('electron'), [__filename, out], { env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Native transaction exited ${code}`)));
  });
}
const out = path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(), `lucid-native-transaction-${Date.now()}`));
if (process.versions.electron) native(out).then(() => require('electron').app.exit(0), e => { console.error(e); require('electron').app.exit(1); });
else prepare(out).catch(e => { console.error(e); process.exitCode = 1; });
