// Installed apps started from the Dock or an app menu get a minimal PATH, so the CLIs the office
// runs (git, harness CLIs) installed through Homebrew, npm or ~/.local/bin would be missing.
// Read PATH from the user's login shell once, in the background, and add what is missing.
const { execFile } = require('node:child_process');
const path = require('node:path');

function mergePath(current, fromShell, delimiter = path.delimiter) {
  const seen = new Set(), out = [];
  for (const entry of [...String(current || '').split(delimiter), ...String(fromShell || '').split(delimiter)]) {
    if (entry && !seen.has(entry)) { seen.add(entry); out.push(entry); }
  }
  return out.join(delimiter);
}

function loadShellPath({ platform = process.platform, env = process.env, run = execFile } = {}) {
  if (platform === 'win32') return Promise.resolve(false);
  const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const marker = '__LUCID_PATH__';
  return new Promise(resolve => {
    run(shell, ['-ilc', `printf '${marker}%s${marker}' "$PATH"`], { timeout: 4000, encoding: 'utf8', env: { ...env, DISABLE_AUTO_UPDATE: 'true' } }, (error, stdout) => {
      const found = !error && new RegExp(`${marker}(.*)${marker}`).exec(String(stdout))?.[1];
      if (found) env.PATH = mergePath(env.PATH, found);
      resolve(!!found);
    });
  });
}

module.exports = { loadShellPath, mergePath };
