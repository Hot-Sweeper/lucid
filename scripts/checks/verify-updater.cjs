const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshot, snapshotAsync } = require('../../electron/build-state.cjs');
const { createUpdater } = require('../../electron/updater.cjs');
const { prepareLaunch } = require('../launch.cjs');
const { hasInstalledBuild, recoverInstallation, acquireUpdateLock } = require('../../electron/installation.cjs');
async function main() {
  await require('./verify-build-isolation.cjs').run();
  await require('./verify-update-command.cjs').run();
  await require('./verify-update-feedback.cjs').run();
  await require('./verify-frozen-input-native.cjs').run();
  await transactionFailures();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-updater-test-'));
  const put = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value); };
  try {
    put('src/app.ts', 'initial'); put('package.json', '{}'); put('dist/index.html', 'old working build');
    put('dist/lucid-build.json', JSON.stringify({ files: snapshot(root) }));
    assert.deepEqual(await snapshotAsync(root), snapshot(root), 'Nonblocking hashing preserves the exact build snapshot');
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
    const releaseLock = acquireUpdateLock(root);
    await assert.rejects(createUpdater(root, run).apply(), /Another Lucid update/);
    releaseLock();
    assert.equal((await updater.apply(undefined, { localOnly: true })).updated, false);
    assert.equal(calls.length, 0, 'Unchanged launch requires no Git, npm, dependency copy or build');
    assert.equal((await updater.check()).available, false);
    put('src/app.ts', 'first update');
    let launchUpdates = 0;
    const launchUpdater = { apply: async () => { launchUpdates++; throw Error('Unfinished source does not typecheck'); } };
    await prepareLaunch(root, { update: launchUpdater });
    assert.equal(launchUpdates, 0, 'Ordinary startup opens the installed build without validating unfinished edits');
    await assert.rejects(prepareLaunch(root, { prepareOnly: true, update: launchUpdater }), /does not typecheck/);
    assert.equal(launchUpdates, 1, 'Explicit preparation still validates and reports failures');
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
    failBuild = false;
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (path.basename(from) === 'dist-update') throw Error('Promotion interrupted');
      return rename(from, to);
    };
    try { await assert.rejects(updater.apply(), /Promotion interrupted/); }
    finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'old working build', 'A failed promotion restores the working installation');
    assert.equal(fs.existsSync(path.join(root, '.lucid-update.lock')), false);
    drift = 'aba';
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
    // Kill a real updater while it owns private inputs, rather than simulating
    // an exception. A subsequent process must reclaim the dead lock and retry.
    put('src/app.ts', 'interrupted process update');
    const { fork } = require('node:child_process');
    const child = fork(__filename, ['--interrupt-fixture', root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(Error('Validation fixture did not start')); }, 10000);
      child.once('message', () => { clearTimeout(timeout); resolve(); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error(`Validation fixture exited early: ${code}`)); });
    });
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'), 'new working build');
    assert.equal((await createUpdater(root, run).apply(undefined, { localOnly: true })).updated, true, 'Interrupted validation can retry in a new process');
    assert.equal(fs.existsSync(path.join(root, '.lucid-update.lock')), false);
    // Model a process interruption between dist -> previous and staged -> dist.
    fs.rmSync(path.join(root, 'dist-previous'), { recursive: true, force: true });
    fs.renameSync(path.join(root, 'dist'), path.join(root, 'dist-previous'));
    await prepareLaunch(root, { update: launchUpdater });
    assert.equal(hasInstalledBuild(root), true);
    assert.equal(launchUpdates, 1, 'Interrupted promotion restores the previous build without compiling');
    assert.equal(recoverInstallation(root), false, 'Recovery leaves a complete installation alone');
    put('incomplete/index.html', '<script src="./assets/missing.js"></script>');
    assert.equal(hasInstalledBuild(root, 'incomplete'), false, 'Missing entry bundles cannot count as an installed build');
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
    const source = fs.readFileSync(path.join(__dirname, '../../src/main.ts'), 'utf8');
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
async function transactionFailures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-update-transaction-'));
  const put = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive:true }); fs.writeFileSync(path.join(root, name), value); };
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  let liveDrift = false, failTypes = false;
  const warnings = [], warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    put('package.json', '{}'); put('src/app.ts', 'old source'); put('electron/runtime.cjs', 'module.exports = {};');
    put('dist/index.html', 'working current'); put('dist-previous/index.html', 'working prior backup');
    put('dist/lucid-build.json', JSON.stringify({files:snapshot(root)}));
    const execute = async (_cmd, args, cwd = root) => {
      if (args[1] === 'typecheck' && failTypes) throw Error('Primary typecheck failure');
      if (args[1] === 'build') {
        fs.mkdirSync(path.join(cwd, 'dist-update'));
        fs.writeFileSync(path.join(cwd, 'dist-update/index.html'), 'working new');
        fs.writeFileSync(path.join(cwd, 'dist-update/lucid-build.json'), JSON.stringify({files:snapshot(cwd)}));
        if (liveDrift) put('electron/runtime.cjs', 'module.exports = { editMustSurvive: true };');
      }
      return '';
    };
    const updater = createUpdater(root, execute);
    put('src/app.ts', 'requested new source');
    liveDrift = true;
    await assert.rejects(updater.apply(undefined, {localOnly:true}), /Source files changed/);
    assert.equal(read('dist/index.html'), 'working current');
    assert.equal(read('dist-previous/index.html'), 'working prior backup');
    assert.equal(read('electron/runtime.cjs'), 'module.exports = { editMustSurvive: true };', 'Source drift must preserve the newer user edit');
    liveDrift = false;

    const rename = fs.renameSync;
    for (const point of ['previous', 'current', 'staged']) {
      let injected = false;
      fs.renameSync = (from, to) => {
        if (!injected && (point === 'previous' && from === path.join(root,'dist-previous') || point === 'current' && from === path.join(root,'dist') || point === 'staged' && path.basename(from) === 'dist-update')) {
          injected = true; throw Error(`Injected ${point} promotion failure`);
        }
        return rename(from, to);
      };
      try { await assert.rejects(updater.apply(undefined, {localOnly:true}), new RegExp(`Injected ${point}`)); }
      finally { fs.renameSync = rename; }
      assert(injected);
      assert.equal(read('dist/index.html'), 'working current', `${point} failure preserves the current installation`);
      assert.equal(read('dist-previous/index.html'), 'working prior backup', `${point} failure preserves the existing rollback copy`);
      assert.equal(fs.existsSync(path.join(root,'.lucid-update.lock')), false);
    }

    let failedPromotion = false;
    fs.renameSync = (from, to) => {
      if (path.basename(from) === 'dist-update') { failedPromotion = true; throw Error('Primary promotion failure'); }
      if (failedPromotion && from === path.join(root,'dist-previous') && to === path.join(root,'dist')) throw Error('Rollback rename unavailable');
      return rename(from, to);
    };
    try {
      await assert.rejects(updater.apply(undefined,{localOnly:true}), error => {
        assert(error instanceof AggregateError);
        assert(error.errors.some(e => /Primary promotion failure/.test(e.message)), 'Recovery failure retains the original diagnostic error');
        return /preserved for recovery/.test(error.message);
      });
    } finally { fs.renameSync = rename; }
    assert.equal(fs.existsSync(path.join(root,'dist')), false);
    assert.equal(read('dist-previous/index.html'), 'working current');
    const preserved = fs.readdirSync(root).filter(n => n.startsWith('.lucid-update-')).map(n => path.join(root,n,'dist-previous-preserved')).find(p => fs.existsSync(p));
    assert(preserved, 'Failed rollback retains private recovery files instead of deleting them in finally');
    assert.equal(fs.readFileSync(path.join(preserved,'index.html'),'utf8'), 'working prior backup');
    assert.equal(recoverInstallation(root), true, 'Next startup can restore the previous working installation');
    // Reset the older-backup fixture without discarding either preserved copy.
    fs.renameSync(preserved, path.join(root,'dist-previous'));

    const rm = fs.promises.rm;
    fs.promises.rm = async (target, options) => {
      if (path.dirname(target) === root && path.basename(target).startsWith('.lucid-update-')) throw Error('Temporary copy still in use');
      return rm(target, options);
    };
    try {
      failTypes = true;
      await assert.rejects(updater.apply(undefined, {localOnly:true}), /Primary typecheck failure/);
      assert.equal(read('dist/index.html'), 'working current');
      failTypes = false;
      const first = updater.apply(message => { if (message === 'Restarting') throw Error('Renderer closed'); }, {localOnly:true});
      assert.equal(first, updater.apply(), 'Concurrent calls still share the entire transaction');
      assert.equal((await first).updated, true, 'Cleanup/progress failures cannot report a committed update as failed');
    } finally { fs.promises.rm = rm; }
    assert.equal(read('dist/index.html'), 'working new');
    assert.equal(read('dist-previous/index.html'), 'working current');
    assert.equal(read('electron/runtime.cjs'), 'module.exports = { editMustSurvive: true };');
    assert.deepEqual(JSON.parse(read('dist/lucid-build.json')).files, snapshot(root));
    assert.equal(fs.existsSync(path.join(root,'.lucid-update.lock')), false);
    assert(warnings.some(s => /cleanup deferred/.test(s)) && warnings.some(s => /progress unavailable/.test(s)));
    assert.equal((await createUpdater(root, execute).apply(undefined,{localOnly:true})).updated, false, 'Retry recognizes the already committed build');

    put('src/app.ts', 'command cleanup interrupted');
    const unconfirmed = createUpdater(root, async (command, args, cwd) => {
      if (args[1] === 'typecheck') throw Object.assign(Error('Command shutdown unconfirmed'), {cleanupUnconfirmed:true});
      return execute(command, args, cwd);
    });
    const beforeDirectories = new Set(fs.readdirSync(root));
    await assert.rejects(unconfirmed.apply(undefined,{localOnly:true}), /shutdown unconfirmed/);
    const retained = fs.readdirSync(root).filter(name => name.startsWith('.lucid-update-') && !beforeDirectories.has(name) && fs.statSync(path.join(root,name)).isDirectory());
    assert.equal(retained.length, 1, 'A possibly running command retains its isolated files');
    assert.equal(read('dist/index.html'), 'working new');
    await assert.rejects(unconfirmed.apply(undefined,{localOnly:true}), {code:'UPDATE_RECOVERY_REQUIRED'});
    await assert.rejects(createUpdater(root, execute).apply(undefined,{localOnly:true}), {code:'UPDATE_RECOVERY_REQUIRED'});
    const {assertRecovery} = require('../../electron/update-recovery.cjs');
    const recoveryMarker = path.join(root,'.lucid-update-recovery.json');
    const recovery = JSON.parse(fs.readFileSync(recoveryMarker,'utf8'));
    recovery.pid = 2147483647; recovery.uptime = 300;
    fs.writeFileSync(recoveryMarker, JSON.stringify(recovery));
    assert.throws(() => assertRecovery(root, 90000), {code:'UPDATE_RECOVERY_REQUIRED'}, 'Elapsed time and a dead owner do not prove cleanup');
    assertRecovery(root, 10); // A new OS boot stops all previous process trees.
    assert.equal((await createUpdater(root, execute).apply(undefined,{localOnly:true})).updated, true, 'A positively established reboot allows recovery');

    const installUnconfirmed = createUpdater(root, async (command, args, cwd) => {
      if (args[0] === 'install') throw Object.assign(Error('Install shutdown unconfirmed'), {cleanupUnconfirmed:true,commandPid:123});
      return execute(command, args, cwd);
    });
    put('package.json', '{"changed":true}');
    await assert.rejects(installUnconfirmed.apply(undefined,{localOnly:true}), /Install shutdown unconfirmed/);
    await assert.rejects(createUpdater(root, execute).apply(undefined,{localOnly:true}), {code:'UPDATE_RECOVERY_REQUIRED'});
    assert.equal(JSON.parse(fs.readFileSync(recoveryMarker,'utf8')).commandPid,123);
    fs.writeFileSync(recoveryMarker, '{');
    assert.throws(() => assertRecovery(root, 0), {code:'UPDATE_RECOVERY_REQUIRED'}, 'Incomplete recovery records fail closed');
    fs.writeFileSync(recoveryMarker, JSON.stringify({uptime:300}));
    assertRecovery(root, 10);
    await createUpdater(root, execute).apply(undefined,{localOnly:true});

    // Repairing an incomplete current directory must retain the good prior build.
    const repair = createUpdater(root, execute);
    put('src/app.ts', 'repair source');
    put('dist/index.html', '<script src="missing.js"></script>');
    assert.equal((await repair.apply(undefined,{localOnly:true})).updated, true);
    assert.equal(read('dist-previous/index.html'), 'working new', 'Incomplete current output cannot replace a working rollback copy');
    console.log('Updater transactions: live backend drift, all promotion renames, retained rollback, cleanup/notification failures and retry passed.');
  } finally {
    console.warn = warn;
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, {recursive:true,force:true});
  }
}
if (process.argv[2] === '--interrupt-fixture') {
  createUpdater(process.argv[3], async (_cmd, args) => {
    if (args[1] === 'typecheck') {
      process.send('validating');
      await new Promise(() => { setInterval(() => {}, 1000); });
    }
    return '';
  }).apply(undefined, { localOnly: true }).catch(error => { console.error(error); process.exit(1); });
} else main().catch(err => { console.error(err); process.exitCode = 1; });
