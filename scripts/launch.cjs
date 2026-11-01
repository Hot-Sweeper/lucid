// Start Menu and Lucid.cmd share one launch path. Never silently start stale code.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function main() {
  process.chdir(root);
  await require('../electron/updater.cjs').apply(undefined, { localOnly: true });
  if (process.argv.includes('--prepare-only')) return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  const child = spawn(require('electron'), [root, ...(process.argv.includes('--mobile-access') ? ['--mobile-access'] : [])], { cwd: root, env, detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
main().catch(error => {
  fs.writeFileSync(path.join(root, 'lucid-launch.log'), `${new Date().toISOString()}\n${error.stack || error}\n`);
  console.error(error.message || error);
  process.exitCode = 1;
});
