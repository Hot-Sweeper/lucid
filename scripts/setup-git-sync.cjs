const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const HOOKS = ['applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-rebase', 'post-checkout', 'post-merge', 'pre-push', 'pre-auto-gc', 'post-rewrite', 'sendemail-validate', 'fsmonitor-watchman', 'p4-changelist', 'p4-prepare-changelist', 'p4-post-changelist', 'p4-pre-submit', 'post-index-change', 'reference-transaction'];
const quote = value => "'" + value.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'";
function install(root = process.cwd()) {
  const run = (cwd, args, required = false) => {
    const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true });
    if (required && result.status !== 0) throw new Error(result.stderr || 'Could not configure Git synchronization.');
    return result.stdout?.trim() || '';
  };
  if (!run(root, ['rev-parse', '--git-dir'])) return [];
  const common = path.resolve(root, run(root, ['rev-parse', '--git-common-dir'], true));
  const storage = path.join(common, 'lucid-sync');
  fs.mkdirSync(storage, { recursive: true });
  const helper = path.join(storage, 'push-commit.cjs');
  fs.copyFileSync(path.join(__dirname, 'push-commit.cjs'), helper);
  const trees = run(root, ['worktree', 'list', '--porcelain'], true).split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
  const plans = trees.filter(tree => fs.existsSync(tree)).map(tree => {
    const current = run(tree, ['config', '--get', 'core.hooksPath']);
    const managed = current.replace(/\\/g, '/').startsWith(storage.replace(/\\/g, '/') + '/hooks-');
    const original = managed ? run(tree, ['config', '--worktree', '--get', 'lucidSync.originalHooksPath']) : current;
    const originalDir = original ? path.resolve(tree, original) : path.join(common, 'hooks');
    const directory = path.join(storage, 'hooks-' + crypto.createHash('sha256').update(originalDir).digest('hex').slice(0, 16));
    return { tree, original, originalDir, directory };
  });
  run(root, ['config', '--local', 'extensions.worktreeConfig', 'true'], true);
  for (const plan of plans) {
    fs.mkdirSync(plan.directory, { recursive: true });
    for (const hook of HOOKS) {
      const original = path.join(plan.originalDir, hook);
      // The old tracked Lucid shim is replaced by the independent helper, not run twice.
      const legacy = hook === 'post-commit' && fs.existsSync(original) && fs.readFileSync(original, 'utf8').replace(/\r/g, '').trim() === '#!/bin/sh\nnode scripts/push-commit.cjs';
      const invoke = legacy ? '' : `if [ -x ${quote(original)} ]; then\n  ${quote(original)} "$@"\n  status=$?\nfi\n`;
      const script = '#!/bin/sh\nstatus=0\n' + invoke + (hook === 'post-commit' ? `node ${quote(helper)}\n` : '') + 'exit "$status"\n';
      fs.writeFileSync(path.join(plan.directory, hook), script, { mode: 0o755 });
      fs.chmodSync(path.join(plan.directory, hook), 0o755);
    }
    run(plan.tree, ['config', '--worktree', 'lucidSync.originalHooksPath', plan.original], true);
    run(plan.tree, ['config', '--worktree', 'core.hooksPath', plan.directory.replace(/\\/g, '/')], true);
  }
  console.log(`Automatic push enabled in ${plans.length} worktree(s); custom hooks preserved.`);
  return plans;
}
module.exports = { install };
if (require.main === module) {
  try { install(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
