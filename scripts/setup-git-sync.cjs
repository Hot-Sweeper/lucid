const { spawnSync } = require('node:child_process');
const run = args => spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
if (run(['rev-parse', '--git-dir']).status === 0) {
  const hooks = run(['config', '--local', '--get', 'core.hooksPath']).stdout.trim();
  if (hooks && hooks !== '.githooks') {
    console.log('Existing Git hooks preserved. To enable automatic pushes, integrate .githooks/post-commit with your hooks.');
  } else {
    const result = run(['config', '--local', 'core.hooksPath', '.githooks']);
    if (result.status !== 0) process.exitCode = 1;
    else console.log('Automatic push enabled for future commits.');
  }
}
