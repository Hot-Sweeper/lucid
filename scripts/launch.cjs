// Start Menu and Lucid.cmd open the installed build. Editing source must not
// turn opening the office into a dependency copy, typecheck and rebuild.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function prepareLaunch(directory, { prepareOnly = false, update } = {}) {
  const { hasInstalledBuild, recoverInstallation, acquireUpdateLock } = require('../electron/installation.cjs');
  if (!hasInstalledBuild(directory)) {
    const release = acquireUpdateLock(directory);
    try { recoverInstallation(directory); } finally { release(); }
  }
  if (prepareOnly || !hasInstalledBuild(directory)) {
    await (update || require('../electron/updater.cjs').createUpdater(directory)).apply(undefined, { localOnly: true });
  }
}
async function main() {
  process.chdir(root);
  await prepareLaunch(root, { prepareOnly: process.argv.includes('--prepare-only') });
  if (process.argv.includes('--prepare-only')) return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  const child = spawn(require('electron'), [root, ...(process.argv.includes('--mobile-access') ? ['--mobile-access'] : [])], { cwd: root, env, detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
module.exports = { prepareLaunch };
if (require.main === module) main().catch(error => {
  fs.writeFileSync(path.join(root, 'lucid-launch.log'), `${new Date().toISOString()}\n${error.stack || error}\n`);
  console.error(error.message || error);
  process.exitCode = 1;
});
