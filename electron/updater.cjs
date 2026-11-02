const fs = require('node:fs');
const { runUpdateCommand } = require('./update-command.cjs');
const path = require('node:path');
const { snapshotAsync, changed } = require('./build-state.cjs');
const { freezeInput } = require('./frozen-input.cjs');
const { hasInstalledBuild, recoverInstallation, acquireUpdateLock } = require('./installation.cjs');
const ROOT = path.join(__dirname, '..');
function createUpdater(root = ROOT, execute) {
  const run = execute || ((cmd, args, cwd = root) => runUpdateCommand(cmd, args, cwd));
  let baseline, legacy = false;
  try {
    baseline = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'lucid-build.json'), 'utf8')).files;
    if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) throw Error('Invalid build manifest');
  } catch { baseline = {}; legacy = true; }
  let checking = null, checkingLocal = null, applying = null, recoveryFailure = null;
  async function inspect(localOnly = false) {
    const files = changed(baseline, await snapshotAsync(root));
    const incomplete = !hasInstalledBuild(root);
    let behind = 0, changes = [], reason;
    // Launch must not wait for credentials, network timeouts or a remote fetch.
    // The running app still checks remote updates through the normal path.
    if (localOnly || legacy || incomplete || files.length > 0) return { available: legacy || incomplete || files.length > 0, local: files.length, legacy, behind, changes, files };
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
    if (localOnly) {
      if (!checkingLocal) checkingLocal = inspect(true).finally(() => { checkingLocal = null; });
      return checkingLocal;
    }
    if (!checking) checking = inspect().finally(() => { checking = null; });
    return checking;
  }
  function apply(onStep = () => {}, options = {}) {
    if (applying) return applying;
    if (recoveryFailure) return Promise.reject(recoveryFailure);
    const step = message => {
      // A closed renderer or observer must not turn an installed update into a
      // failed transaction, especially after the promotion has committed.
      try { onStep(message); } catch (error) { console.warn('Update progress unavailable:', error.message); }
    };
    applying = (async () => {
      const release = acquireUpdateLock(root);
      let releaseLock = true;
      try {
      recoverInstallation(root);
      step('Checking updates');
      const status = await check(options);
      if (!status.available) return { updated: false };
      if (status.behind) {
        if (await run('git', ['status', '--porcelain'])) throw Error('Remote updates are ready, but this checkout has local edits. Commit them first, then retry. Your files were preserved.');
        step('Downloading updates');
        await run('git', ['merge', '--ff-only', '@{u}']);
      }
      const current = await snapshotAsync(root);
      // A separate build may already have installed this exact source while this
      // process still owns the old office. Restart instead of rebuilding it again.
      try {
        const installed = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'lucid-build.json'), 'utf8')).files;
        if (!status.behind && installed && !changed(installed, current).length && hasInstalledBuild(root)) {
          step('Restarting');
          return { updated: true };
        }
      } catch { /* Missing or invalid installation follows full validation below. */ }

      if (legacy || changed(baseline, current).some(f => /^package.*\.json$/.test(f))) {
        step('Installing packages');
        await run('npm', ['install', '--no-audit', '--no-fund']);
      }
      step('Preparing update');
      const frozen = await freezeInput(root);
      let retainFrozen = false;
      try {
      const validated = frozen.files;
      step('Checking code');
      require('./runtime-check.cjs').checkRuntime(frozen.directory);
      await run('npm', ['run', 'typecheck'], frozen.directory);
      if (changed(validated, await snapshotAsync(frozen.directory)).length) throw Error('Frozen update inputs changed during validation. Your previous build was preserved.');
      step('Building update');
      const staged = path.join(frozen.directory, 'dist-update'), previous = path.join(root, 'dist-previous'), dist = path.join(root, 'dist');
      await fs.promises.rm(staged, { recursive: true, force: true });
      await run('npm', ['run', 'build', '--', '--outDir', 'dist-update'], frozen.directory);
      if (!hasInstalledBuild(frozen.directory, 'dist-update') || !fs.existsSync(path.join(staged, 'lucid-build.json'))) throw Error('The update build is incomplete. Your previous build was preserved.');
      const built = JSON.parse(fs.readFileSync(path.join(staged, 'lucid-build.json'), 'utf8')).files;
      if (!built || changed(validated, built).length || changed(validated, await snapshotAsync(frozen.directory)).length) throw Error('Frozen update inputs do not match the validated build. Your previous build was preserved.');
      // Electron backend files are loaded from the live tree after restart.
      // Never pair a validated renderer with newer, unvalidated backend edits.
      if (changed(validated, await snapshotAsync(root)).length) throw Error('Source files changed while the update was being checked. Your previous build and edits were preserved. Retry the update when editing has finished.');
      const hadDist = fs.existsSync(dist);
      const savedPrevious = path.join(frozen.directory, 'dist-previous-preserved');
      // An incomplete current directory must not replace a working backup.
      const currentBackup = hasInstalledBuild(root) ? previous : path.join(frozen.directory, 'dist-incomplete');
      let movedPrevious = false, movedCurrent = false;
      try {
        if (hadDist && currentBackup === previous && fs.existsSync(previous)) {
          fs.renameSync(previous, savedPrevious); movedPrevious = true;
        }
        if (hadDist) { fs.renameSync(dist, currentBackup); movedCurrent = true; }
        fs.renameSync(staged, dist);
      } catch (err) {
        const rollbackErrors = [];
        if (movedCurrent) try { fs.renameSync(currentBackup, dist); } catch (error) { rollbackErrors.push(error); }
        if (movedPrevious) try { fs.renameSync(savedPrevious, previous); } catch (error) { rollbackErrors.push(error); }
        if (rollbackErrors.length) {
          retainFrozen = true;
          throw new AggregateError([err, ...rollbackErrors], 'Update promotion failed. Previous build files are preserved for recovery; restart Lucid before retrying.');
        }
        throw err;
      }
      step('Restarting');
      return { updated: true };
      } catch (error) {
        // A process whose shutdown could not be confirmed may still own these
        // files. Keep its private inputs instead of racing it with removal.
        if (error.cleanupUnconfirmed) retainFrozen = true;
        throw error;
      } finally {
        // Cleanup is not the commit. Preserve the original validation error or
        // successful result when antivirus/file handles delay temporary removal.
        if (!retainFrozen) try { await frozen.dispose(); } catch (error) { console.warn('Update temporary cleanup deferred:', error.message); }
      }
      } catch (error) {
        if (error.cleanupUnconfirmed) {
          recoveryFailure = require('./update-recovery.cjs').recoveryError();
          try { require('./update-recovery.cjs').retainRecovery(root, error); }
          catch (failure) {
            // If a recovery marker cannot be written, retain this process's
            // lease as well as the in-memory gate. Never knowingly overlap it.
            releaseLock = false;
            throw Object.assign(new AggregateError([error, failure], recoveryFailure.message), {cleanupUnconfirmed:true});
          }
        }
        throw error;
      } finally { if (releaseLock) try { release(); } catch (error) { console.warn('Update lock cleanup deferred:', error.message); } }
    })().finally(() => { applying = null; });
    return applying;
  }
  return { check, apply };
}
module.exports = { ...createUpdater(), createUpdater };
