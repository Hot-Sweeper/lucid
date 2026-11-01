// Push failures must never discard or undo a local commit.
const { spawnSync } = require('node:child_process');
const branch = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8', windowsHide: true });
if (branch.status === 0) {
  const result = spawnSync('git', ['push', '--set-upstream', 'origin', branch.stdout.trim()], { stdio: 'inherit', windowsHide: true, timeout: 30000 });
  if (result.status !== 0) console.error('Commit saved locally. Automatic push failed; run git push when the connection is available.');
}
