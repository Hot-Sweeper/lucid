const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshot } = require('../electron/build-state.cjs');
const { createUpdater } = require('../electron/updater.cjs');
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-updater-test-'));
  const put = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value); };
  try {
    put('src/app.ts', 'initial'); put('package.json', '{}'); put('dist/index.html', 'old working build');
    put('dist/lucid-build.json', JSON.stringify({ files: snapshot(root) }));
    let remote = 0, dirty = '', failBuild = false, offline = false, failTypes = false, drift = '';
    const calls = [];
    let checkedDirectory, checkedBytes;
    const run = async (cmd, args, cwd = root) => {
      calls.push([cmd, ...args].join(' '));
      if (args[0] === 'rev-parse') return 'origin/main';
      if (args[0] === 'fetch' && offline) throw Error('offline');
      if (args[0] === 'rev-list') return String(remote);
      if (args[0] === 'log') return 'First commit\nSecond commit';
      if (args[0] === 'status') return dirty;
      if (cmd === 'npm' && args[1] === 'typecheck') {
        if (failTypes) throw Error('Typecheck failed');
        assert.notEqual(cwd, root);
        checkedDirectory = cwd;
        checkedBytes = fs.readFileSync(path.join(cwd, 'src/app.ts'), 'utf8');
        if (drift === 'check') fs.writeFileSync(path.join(cwd, 'src/app.ts'), 'tampered private input');
        if (drift === 'aba') {
          const original = fs.readFileSync(path.join(root, 'src/app.ts'));
          put('src/app.ts', 'temporary invalid source');
          assert.equal(fs.readFileSync(path.join(cwd, 'src/app.ts'), 'utf8'), checkedBytes);
          fs.writeFileSync(path.join(root, 'src/app.ts'), original);
        }
      }
      if (cmd === 'npm' && args[1] === 'build') {
        if (failBuild) throw Error('Build failed');
        assert.equal(cwd, checkedDirectory, 'Both processes use the same private input tree');
        assert.equal(fs.readFileSync(path.join(cwd, 'src/app.ts'), 'utf8'), checkedBytes);
        fs.mkdirSync(path.join(cwd, 'dist-update'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'dist-update/index.html'), 'new working build');
        fs.writeFileSync(path.join(cwd, 'dist-update/lucid-build.json'), JSON.stringify({ files: snapshot(cwd) }));
        if (drift === 'build') fs.writeFileSync(path.join(cwd, 'src/app.ts'), 'tampered after build');
      }
      return '';
    };
    const updater = createUpdater(root, run);
    assert.equal((await updater.apply(undefined, { localOnly: true })).updated, false);
    assert.equal(calls.length, 0, 'Unchanged launch requires no Git, npm, dependency copy or build');
    assert.equal((await updater.check()).available, false);
    put('src/app.ts', 'first update');
    assert.equal((await updater.check()).local, 1);
    put('src/second.ts', 'another update');
    assert.equal((await updater.check()).local, 2, 'Updates accumulate against loaded build');
    offline = true;
    assert.equal((await updater.check()).available, true, 'Offline checks retain local updates');
    offline = false; remote = 2; dirty = ' M src/app.ts';
    assert.equal((await updater.check()).behind, 0, 'Local build updates take priority over remote work');
    const remoteOnly = createUpdater(root, run);
    // Its captured manifest still has local differences, so it must not fetch.
    const beforeFast = calls.length;
    await remoteOnly.check();
    assert.equal(calls.length, beforeFast, 'Local update check performs no network calls');
    assert.equal(fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8'), 'first update');
    remote = 0; failTypes = true;
    put('electron/incomplete.cjs', 'module.exports = {');
    await assert.rejects(updater.apply(), /runtime syntax check failed.*incomplete.cjs/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build');
    fs.unlinkSync(path.join(root, 'electron/incomplete.cjs'));
    await assert.rejects(updater.apply(), /Typecheck failed/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build');
    failTypes = false;
    const interrupted = createUpdater(root, async (cmd, args, cwd) => {
      if (cmd === 'npm' && args[1] === 'typecheck') throw Error('Validation interrupted');
      return run(cmd, args, cwd);
    });
    await assert.rejects(interrupted.apply(), /Validation interrupted/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build');
    assert(!fs.readdirSync(root).some(name => name.startsWith('.lucid-update-')), 'Interrupted validation releases private input');
    drift = 'check';
    await assert.rejects(updater.apply(), /Frozen update inputs changed/);
    drift = 'build';
    await assert.rejects(updater.apply(), /Frozen update inputs do not match/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build');
    drift = ''; failBuild = true;
    await assert.rejects(updater.apply(), /Build failed/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build');
    failBuild = false; drift = 'aba';
    const steps = [];
    const first = updater.apply(s => steps.push(s));
    assert.equal(first, updater.apply(), 'Concurrent apply requests share one operation');
    assert.equal((await first).updated, true);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'new working build');
    assert.equal(fs.readFileSync(path.join(root, 'dist-previous/index.html'), 'utf8'), 'old working build');
    assert.equal((await createUpdater(root, run).check()).available, false, 'Restart recognizes the installed build');
    assert(!calls.some(c => /checkout|reset/.test(c)), 'Never reset user files');
    assert(!calls.some(c => c.startsWith('npm install')), 'Unchanged dependencies need no reinstall');
    assert(steps.includes('Restarting'));
    assert.equal(fs.existsSync(checkedDirectory), false, 'Private inputs are released after promotion');
    assert.equal(fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8'), 'first update', 'Transient root edits cannot affect validated inputs');
    const oldProcess = createUpdater(root, run);
    put('src/app.ts', 'externally built update');
    put('dist/lucid-build.json', JSON.stringify({ files: snapshot(root) }));
    const beforeRestart = calls.length;
    assert.equal((await oldProcess.check({ localOnly: true })).available, true);
    assert.equal((await oldProcess.apply(undefined, { localOnly: true })).updated, true, 'Old process restarts into an already installed build');
    assert.equal(calls.length, beforeRestart, 'Installed current build needs no second build');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'dist/lucid-build.json'))).files, snapshot(root));
    drift = '';
    remote = 2; dirty = ' M notes.txt';
    await assert.rejects(createUpdater(root, run).apply(), /local edits/);
    dirty = '';
    await createUpdater(root, run).apply();
    assert(calls.includes('git merge --ff-only @{u}'), 'Remote updates use fast-forward only');
    remote = 0;
    const dependencies = createUpdater(root, run);
    put('package.json', '{"updated":true}');
    await dependencies.apply();
    assert(calls.includes('npm install --no-audit --no-fund'));
    const local = createUpdater(root, run);
    put('src/app.ts', 'local launch update');
    remote = 2; dirty = ' M src/app.ts';
    const beforeLocal = calls.length;
    assert.equal((await local.apply(undefined, { localOnly: true })).updated, true);
    assert(!calls.slice(beforeLocal).some(c => c.startsWith('git ')), 'Local launch cannot block on a remote check or dirty-branch merge');
    assert(calls.slice(beforeLocal).includes('npm run typecheck'), 'Changed launch still validates frozen inputs');
    remote = 0; dirty = '';
    let releaseRemote;
    const gate = new Promise(resolve => { releaseRemote = resolve; });
    const checkingRemote = createUpdater(root, async (cmd, args, cwd) => {
      if (cmd === 'git' && args[0] === 'rev-parse') await gate;
      return run(cmd, args, cwd);
    });
    const pendingRemote = checkingRemote.check();
    assert.equal((await checkingRemote.apply(undefined, { localOnly: true })).updated, false, 'Launch does not queue behind an in-flight remote check');
    releaseRemote(); await pendingRemote;
    const vm = require('node:vm'), { stripTypeScriptTypes } = require('node:module');
    const source = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
    const uiSource = source.slice(source.indexOf('let updateState:'), source.indexOf('const attachDir ='));
    const button = { textContent: '', title: '', disabled: false, addEventListener: (_name, fn) => { button.click = fn; }, getBoundingClientRect: () => ({ left: 0, bottom: 0 }) };
    let state = { available: false }, fail = false, applyCalls = 0, offCalls = 0;
    const context = {
      setTimeout, clearTimeout, $: () => button, showMenu: () => {}, companionClient: () => false,
      api: { checkUpdate: async () => state, onUpdateStep: () => () => offCalls++, applyUpdate: async () => { applyCalls++; if (fail) throw Error('disconnected'); return { ok: true }; } },
    };
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(uiSource, { mode: 'transform' }) + '\nthis.check = checkUpdate;', context);
    await context.check();
    assert.equal(button.textContent, 'Check updates');
    state = { available: true, local: 3, behind: 2 };
    await context.check();
    assert.equal(button.textContent, 'Update (5)');
    fail = true; await button.click();
    assert.equal(button.textContent, 'Retry update');
    assert.equal(button.disabled, false);
    fail = false; await button.click();
    assert.equal(applyCalls, 2); assert.equal(offCalls, 2);
    assert.equal(button.disabled, false);
    console.log('Updater: accumulation, offline, dirty files, failed builds, retry, concurrency, promotion and restart passed.');
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
