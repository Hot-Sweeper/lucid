const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { snapshot, changed } = require('./build-state.cjs');
const { freezeInput } = require('./frozen-input.cjs');
const ROOT = path.join(__dirname, '..');
function createUpdater(root = ROOT, execute) {
  const run = execute || ((cmd, args, cwd = root) => new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, shell: process.platform === 'win32' && cmd === 'npm', windowsHide: true, timeout: cmd === 'git' ? 10000 : 600000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).trim()));
      else resolve(stdout.trim());
    });
  }));
  let baseline, legacy = false;
  try { baseline = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'lucid-build.json'), 'utf8')).files; } catch {
    baseline = snapshot(root);
    try { const built = fs.statSync(path.join(root, 'dist', 'index.html')).mtimeMs; legacy = Object.keys(baseline).some(f => fs.statSync(path.join(root, f)).mtimeMs > built); } catch { legacy = true; }
  }
  let checking = null, applying = null;
  async function inspect(localOnly = false) {
    const files = changed(baseline, snapshot(root));
    let behind = 0, changes = [], reason;
    // Launch must not wait for credentials, network timeouts or a remote fetch.
    // The running app still checks remote updates through the normal path.
    if (localOnly || legacy || files.length > 0) return { available: legacy || files.length > 0, local: files.length, legacy, behind, changes, files };
    try {
      const upstream = await run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => null);
      if (upstream) {
        try { await run('git', ['fetch', '--quiet']); } catch { reason = 'Remote check failed. Local updates are still available.'; }
        behind = Number(await run('git', ['rev-list', '--count', 'HEAD..@{u}']));
        if (behind) changes = (await run('git', ['log', '--format=%s', '-n', '20', 'HEAD..@{u}'])).split('\n');
      } else reason = 'No remote tracking branch. Local updates are supported.';
    } catch (err) { reason = String(err.message || err); }
    return { available: legacy || files.length > 0 || behind > 0, local: files.length, legacy, behind, changes, files, reason };
  }
  function check({ localOnly = false } = {}) {
    if (localOnly) return inspect(true);
    if (!checking) checking = inspect().finally(() => { checking = null; });
    return checking;
  }
  function apply(onStep = () => {}, options = {}) {
    if (applying) return applying;
    applying = (async () => {
      onStep('Checking updates');
      const status = await check(options);
      if (!status.available) return { updated: false };
      if (status.behind) {
        if (await run('git', ['status', '--porcelain'])) throw Error('Remote updates are ready, but this checkout has local edits. Commit them first, then retry. Your files were preserved.');
        onStep('Downloading updates');
        await run('git', ['merge', '--ff-only', '@{u}']);
      }
      const current = snapshot(root);
      // A separate build may already have installed this exact source while this
      // process still owns the old office. Restart instead of rebuilding it again.
      try {
        const installed = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'lucid-build.json'), 'utf8')).files;
        if (!status.behind && installed && !changed(installed, current).length && fs.existsSync(path.join(root, 'dist', 'index.html'))) {
          onStep('Restarting');
          return { updated: true };
        }
      } catch { /* Missing or invalid installation follows full validation below. */ }

      if (legacy || changed(baseline, current).some(f => /^package.*\.json$/.test(f))) {
        onStep('Installing packages');
        await run('npm', ['install', '--no-audit', '--no-fund']);
      }
      onStep('Checking code');
      const frozen = freezeInput(root);
      try {
      const validated = frozen.files;
      require('./runtime-check.cjs').checkRuntime(frozen.directory);
      await run('npm', ['run', 'typecheck'], frozen.directory);
      if (changed(validated, snapshot(frozen.directory)).length) throw Error('Frozen update inputs changed during validation. Your previous build was preserved.');
      onStep('Building update');
      const staged = path.join(frozen.directory, 'dist-update'), previous = path.join(root, 'dist-previous'), dist = path.join(root, 'dist');
      fs.rmSync(staged, { recursive: true, force: true });
      await run('npm', ['run', 'build', '--', '--outDir', 'dist-update'], frozen.directory);
      if (!fs.existsSync(path.join(staged, 'index.html')) || !fs.existsSync(path.join(staged, 'lucid-build.json'))) throw Error('The update build is incomplete. Your previous build was preserved.');
      const built = JSON.parse(fs.readFileSync(path.join(staged, 'lucid-build.json'), 'utf8')).files;
      if (!built || changed(validated, built).length || changed(validated, snapshot(frozen.directory)).length) throw Error('Frozen update inputs do not match the validated build. Your previous build was preserved.');
      fs.rmSync(previous, { recursive: true, force: true });
      const hadDist = fs.existsSync(dist);
      if (hadDist) fs.renameSync(dist, previous);
      try { fs.renameSync(staged, dist); } catch (err) {
        if (hadDist) fs.renameSync(previous, dist);
        throw err;
      }
      onStep('Restarting');
      return { updated: true };
      } finally { frozen.dispose(); }
    })().finally(() => { applying = null; });
    return applying;
  }
  return { check, apply };
}
module.exports = { ...createUpdater(), createUpdater };
