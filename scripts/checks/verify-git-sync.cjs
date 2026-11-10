const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { install } = require('../setup-git-sync.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-git-sync-'));
const repo = path.join(temp, 'repo'), remote = path.join(temp, 'remote.git'), side = path.join(temp, 'old worktree'), clone = path.join(temp, 'clone');
function git(cwd, args, expected = 0) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  assert.equal(r.status, expected, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function identity(cwd) { git(cwd, ['config', 'user.name', 'Sync test']); git(cwd, ['config', 'user.email', 'sync@example.invalid']); }
function commit(cwd, file, text) { fs.writeFileSync(path.join(cwd, file), text); git(cwd, ['add', file]); return git(cwd, ['commit', '-m', text]); }
function hook(dir, name, marker) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `#!/bin/sh\nprintf 'called\\n' >> '${marker.replace(/\\/g, '/')}'\n`, { mode: 0o755 });
  fs.chmodSync(path.join(dir, name), 0o755);
}
try {
  fs.mkdirSync(repo); git(repo, ['init', '-b', 'main']); identity(repo);
  commit(repo, 'main.txt', 'initial'); git(temp, ['init', '--bare', remote]); git(repo, ['remote', 'add', 'origin', remote]); git(repo, ['push', '-u', 'origin', 'main']);
  git(repo, ['worktree', 'add', '-b', 'older', side]);
  const mainMarker = path.join(temp, 'main-marker'), sideMarker = path.join(temp, 'side-marker'), preMarker = path.join(temp, 'pre-marker');
  const mainHooks = path.join(repo, 'custom hooks'), sideHooks = path.join(temp, 'side hooks');
  hook(mainHooks, 'post-commit', mainMarker); hook(mainHooks, 'pre-commit', preMarker); hook(sideHooks, 'post-commit', sideMarker);
  const originalMainHook = fs.readFileSync(path.join(mainHooks, 'post-commit'));
  git(repo, ['config', 'core.hooksPath', 'custom hooks']); git(repo, ['config', 'extensions.worktreeConfig', 'true']);
  git(side, ['config', '--worktree', 'core.hooksPath', sideHooks]);
  const before = git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']);
  install(repo); install(repo);
  assert.equal(git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']), before, 'installation never changes branch heads');
  assert.equal(fs.existsSync(path.join(side, 'scripts', 'push-commit.cjs')), false, 'older worktree has no helper source');
  commit(repo, 'main.txt', 'main success');
  assert.equal(git(remote, ['rev-parse', 'refs/heads/main']), git(repo, ['rev-parse', 'HEAD']));
  commit(side, 'side.txt', 'side success');
  assert.equal(git(remote, ['rev-parse', 'refs/heads/older']), git(side, ['rev-parse', 'HEAD']));
  assert.equal(fs.existsSync(path.join(repo, 'side.txt')), false, 'no worktree content merged');
  assert.equal(fs.readFileSync(mainMarker, 'utf8'), 'called\n');
  assert.equal(fs.readFileSync(sideMarker, 'utf8'), 'called\n');
  assert.equal(fs.readFileSync(preMarker, 'utf8'), 'called\n');
  assert.deepEqual(fs.readFileSync(path.join(mainHooks, 'post-commit')), originalMainHook);
  git(repo, ['remote', 'set-url', '--push', 'origin', path.join(temp, 'unavailable.git')]);
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  const statusBefore = git(repo, ['status', '--porcelain']);
  commit(repo, 'offline.txt', 'offline commit survives');
  assert.notEqual(git(repo, ['rev-parse', 'HEAD']), remoteBefore);
  assert.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore);
  assert.equal(fs.readFileSync(path.join(repo, 'offline.txt'), 'utf8'), 'offline commit survives');
  assert.equal(git(repo, ['status', '--porcelain']), statusBefore);
  git(repo, ['remote', 'set-url', '--push', 'origin', remote]); git(repo, ['push']);
  git(temp, ['clone', '--branch', 'main', remote, clone]); identity(clone); install(clone);
  commit(clone, 'clone.txt', 'fresh clone success');
  assert.equal(git(remote, ['rev-parse', 'refs/heads/main']), git(clone, ['rev-parse', 'HEAD']));
  console.log('PASS: existing older worktrees, fresh clones, custom per-worktree hooks, custom pre-commit hooks, repeated installation, successful pushes, failed-push commit preservation and manual retry; branch contents preserved.');
} finally {
  const resolved = path.resolve(temp);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('lucid-git-sync-')) throw Error('Unexpected test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
}
