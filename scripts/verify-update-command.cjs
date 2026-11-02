// Native Node children only. No Electron window, build, Git mutation or network call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { runUpdateCommand } = require('../electron/update-command.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid update command fixture '));
  const families = [];
  let sibling;
  try {
    assert.equal(await runUpdateCommand(process.execPath, ['-e', 'process.stdout.write("  completed\\n")'], directory), 'completed');
    await assert.rejects(runUpdateCommand(process.execPath, ['-e', 'console.log("useful progress");console.error("specific failure");process.exit(7)'], directory), error => {
      assert.match(error.message, /specific failure/); assert.match(error.stdout, /useful progress/); assert.equal(error.exitCode, 7); assert.equal(error.cleanupUnconfirmed, false); return true;
    });
    await assert.rejects(runUpdateCommand('lucid-nonexistent-update-command-76345', [], directory), { code: 'ENOENT' });
    const before = new AbortController(); before.abort();
    await assert.rejects(runUpdateCommand(process.execPath, ['-e', 'process.exit(99)'], directory, { signal: before.signal }), { code: 'ABORT_ERR' });
    // Exercise cmd/npm lookup with a harmless local package in a directory with spaces.
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'local-command-fixture', version: '1.0.0', scripts: { probe: 'node probe.cjs', tree: 'node parent.cjs npm-timeout.json' } }));
    fs.writeFileSync(path.join(directory, 'probe.cjs'), 'console.log("npm-probe-ok")');
    assert.match(await runUpdateCommand('npm', ['run', 'probe', '--silent'], directory, { timeoutMs: 10000 }), /npm-probe-ok/);
    if (process.platform === 'win32') await assert.rejects(runUpdateCommand('npm', ['run', 'probe&echo'], directory), /Unsupported shell characters/);

    fs.writeFileSync(path.join(directory, 'child.cjs'), 'setInterval(()=>{},1000);');
    fs.writeFileSync(path.join(directory, 'parent.cjs'), `const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const child=spawn(process.execPath,[path.join(__dirname,'child.cjs')],{windowsHide:true,stdio:'ignore'});fs.writeFileSync(process.argv[2]+'.tmp',JSON.stringify({parent:process.pid,child:child.pid}));fs.renameSync(process.argv[2]+'.tmp',process.argv[2]);console.log('parent-started');console.error('diagnostic-before-timeout');setInterval(()=>{},1000);`);
    sibling = spawn(process.execPath, [path.join(directory, 'child.cjs')], { cwd: directory, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { sibling.once('spawn', resolve); sibling.once('error', reject); });
    for (const mode of ['timeout', 'abort', 'npm-timeout']) {
      const file = path.join(directory, mode + '.json');
      const cancellation = new AbortController();
      const started = Date.now();
      const result = runUpdateCommand(mode === 'npm-timeout' ? 'npm' : process.execPath,
        mode === 'npm-timeout' ? ['run', 'tree', '--silent'] : [path.join(directory, 'parent.cjs'), file], directory,
        { timeoutMs: mode === 'abort' ? 10000 : mode === 'npm-timeout' ? 1000 : 600, cleanupTimeoutMs: 3000, signal: cancellation.signal });
      const expected = assert.rejects(result, error => {
        assert.equal(error.code, mode === 'abort' ? 'ABORT_ERR' : 'ETIMEDOUT');
        assert.equal(error.cleanupUnconfirmed, false, error.message);
        assert.match(error.stderr, /diagnostic-before-timeout/); assert.match(error.stdout, /parent-started/); return true;
      });
      for (let n = 0; !fs.existsSync(file) && n < 100; n++) await wait(10);
      assert(fs.existsSync(file), 'fixture parent must report both owned process IDs');
      const family = JSON.parse(fs.readFileSync(file, 'utf8')); families.push(family);
      assert(alive(family.parent)); assert(alive(family.child));
      if (mode === 'abort') cancellation.abort();
      await expected;
      for (let n = 0; (alive(family.parent) || alive(family.child)) && n < 50; n++) await wait(20);
      assert.equal(alive(family.parent), false, `${mode} must stop the owned parent`);
      assert.equal(alive(family.child), false, `${mode} must stop its child, not only the shell`);
      assert(alive(sibling.pid), 'an unrelated sibling Node process must remain alive');
      assert(Date.now() - started < 5000, 'termination and close must remain bounded');
    }
    await assert.rejects(runUpdateCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'], directory,
      { timeoutMs: 5000, cleanupTimeoutMs: 3000, maxOutputBytes: 1024 }), error => {
      assert.equal(error.code, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'); assert(error.stdout.length <= 1024); assert.equal(error.cleanupUnconfirmed, false); return true;
    });
    console.log('PASS: command success/errors, npm through cmd, bounded output, timeout/abort kill owned trees including npm grandchildren, and preserve an unrelated sibling.');
  } finally {
    // Only test-created PIDs may be cleaned up if an assertion fails.
    for (const family of families) for (const pid of [family.parent, family.child]) if (alive(pid)) {
      if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 3000 }, () => resolve()));
      else { try { process.kill(pid, 'SIGKILL'); } catch {} }
    }
    if (sibling && sibling.exitCode === null && sibling.signalCode === null) {
      await new Promise(resolve => { sibling.once('close', resolve); sibling.kill(); });
    }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('lucid update command fixture '));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run: main };
