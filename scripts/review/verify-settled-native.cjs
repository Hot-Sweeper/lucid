// Native acceptance runner. Uses the real Electron main/preload, Git, build and restart.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const base = process.env.LUCID_REVIEW_DIR || path.join(require('node:os').homedir(), '.t3', 'lucid-settled-review-20261031-final');
const out = path.join(base, 'evidence'); fs.mkdirSync(out, { recursive: true });
const resume = process.argv.includes('--resume');
const result = resume ? JSON.parse(fs.readFileSync(path.join(out, 'runtime-evidence.json'), 'utf8')) : { startedAt: new Date().toISOString(), checks: [], screenshots: {}, instances: {} };
const save = () => fs.writeFileSync(path.join(out, 'runtime-evidence.json'), JSON.stringify(result, null, 2));
const delay = ms => new Promise(r => setTimeout(r, ms));
const run = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, windowsHide: true, shell: cmd === 'npm', encoding: 'utf8', maxBuffer: 16e6 });
function launch(dir, port, name) {
  const profile = path.join(base, name + '-profile'), shots = path.join(base, name + '-shots'); fs.mkdirSync(shots, { recursive: true });
  const env = { ...process.env, LUCID_SHOT: shots, LUCID_SHOT_PROFILE: profile, LUCID_SHOT_COUNT: '1', LUCID_SHOT_EVERY: '3600000' };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'LUCID_DEV_URL', 'LUCID_TRACE', 'LUCID_PROFILE', 'LUCID_SHOT_QUIT', 'LUCID_EVAL', 'LUCID_EVAL_FILE']) delete env[key];
  const log = fs.openSync(path.join(out, name + '-native.log'), 'a');
  const child = spawn(require('electron'), [dir, `--remote-debugging-port=${port}`], { cwd: dir, env, windowsHide: true, stdio: ['ignore', log, log] });
  child.unref();
  if (require.main === module) { result.instances[name] = { dir, profile, port, initialPid: child.pid }; save(); }
  return child;
}
async function connect(port) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find(p => p.type === 'page' && p.url.includes('dist/index.html'));
      if (!page) throw Error('not loaded');
      const ws = new WebSocket(page.webSocketDebuggerUrl); let id = 0; const pending = new Map();
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
      ws.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.id) { const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.reject(Error(d.error.message)) : p.resolve(d.result); } } });
      ws.addEventListener('close', () => { for (const p of pending.values()) p.reject(Error('Native connection closed')); pending.clear(); });
      const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
      const js = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
      if (!await js('Boolean(window.__world?.lastData)')) { ws.close(); throw Error('waiting for data'); }
      return { ws, call, js, page };
    } catch { await delay(1000); }
  }
  throw Error('Native instance did not become ready on ' + port);
}
async function waitUI(c, expression, max = 90000) {
  const end = Date.now() + max;
  while (Date.now() < end) { if (await c.js(expression)) return; await delay(1000); }
  throw Error('UI timeout: ' + expression);
}
async function shot(c, name) {
  const file = path.join(out, name + '.png');
  const { data } = await c.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(data, 'base64')); result.screenshots[name] = file; save(); console.log('CAPTURE', name);
}
async function loaded(c) {
  const state = await c.js(`({url:location.href,assets:[...document.scripts].map(s=>s.src),update:document.querySelector('#update')?.textContent,errors:window.__errs,order:window.__world.lastData.threads.map(t=>({id:t.id,title:t.title,pinned:t.pinned,settled:t.settled}))})`);
  const { processInfo } = await c.call('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  return { ...state, processes: processInfo, recordedAt: new Date().toISOString() };
}
async function main() {
  const before = path.join(base, 'before'), after = path.join(base, 'after');
  if (!resume) {
  assert(!fs.existsSync(after), 'Use a fresh review directory');
  fs.mkdirSync(before); fs.mkdirSync(after);
  const tar = path.join(base, 'before.tar'); run(root, 'git', ['archive', '--format=tar', '--output=' + tar, '07c5169']); run(before, 'tar', ['-xf', tar]);
  for (const name of fs.readdirSync(root)) if (!['.git', 'node_modules', 'dist', 'dist-update', 'dist-previous'].includes(name)) fs.cpSync(path.join(root, name), path.join(after, name), { recursive: true });
  for (const dir of [before, after]) fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  run(before, 'npm', ['run', 'build']); run(after, 'npm', ['run', 'build']);
  run(after, 'git', ['init', '-b', 'main']); run(after, 'git', ['add', '.']); run(after, 'git', ['-c', 'user.name=Lucid runtime verification', '-c', 'user.email=runtime@localhost', 'commit', '-m', 'Isolated runtime baseline']);
  const oldChild = launch(before, 9342, 'before'); const old = await connect(9342);
  await old.js(`(()=>{if(document.querySelector('#fold-threads')?.hidden)document.querySelector('[aria-controls="fold-threads"]')?.click()})()`);
  await waitUI(old, `document.querySelectorAll('.th-row').length>0`);
  await shot(old, 'before-native-old-sidebar'); result.before = await loaded(old); old.ws.close(); oldChild.kill();
  launch(after, 9341, 'after');
  }
  if (resume) launch(after, 9341, 'after');
  let c = await connect(9341);
  delete result.error;
  await c.js(`(()=>{const body=document.querySelector('#fold-threads');if(body?.hidden)document.querySelector('[aria-controls="fold-threads"]')?.click();})()`);
  await waitUI(c, `Boolean(document.querySelector('.th-settled-toggle'))`);
  result.initialLoaded = await loaded(c);
  result.initialPageId = c.page.id;
  await waitUI(c, `document.querySelector('#update') && !document.querySelector('#update').hidden`);
  await shot(c, 'after-update-visible');
  await c.js(`document.querySelector('.th-settled-toggle').scrollIntoView({block:'center'})`);
  await shot(c, 'after-settled-collapsed');
  await c.js(`document.querySelector('.th-settled-toggle').click()`);
  await waitUI(c, `document.querySelectorAll('.th-settled-row').length>0`);
  await shot(c, 'after-settled-expanded');
  result.checks.push('Actual native collapsed and expanded Settled section, visible update button'); save();
  // Create two actual local commits after the loaded build, without replacing any runtime API.
  for (const i of [1, 2]) {
    fs.writeFileSync(path.join(after, 'src', `native-update-${i}.ts`), `export const nativeUpdate${i} = ${i};\n`);
    run(after, 'git', ['add', `src/native-update-${i}.ts`]);
    run(after, 'git', ['-c', 'user.name=Lucid runtime verification', '-c', 'user.email=runtime@localhost', 'commit', '--allow-empty', '-m', `Native pending update ${i}`]);
  }
  await c.js(`document.querySelector('#side-panel').scrollTop=0`);
  console.log('WAITING for real minute update timer');
  await waitUI(c, `document.querySelector('#update').textContent.includes('Update (2)')`, 80000);
  result.accumulated = await c.js('window.lucid.checkUpdate()');
  await shot(c, 'after-two-accumulated-updates');
  // A genuine compiler failure exercises the entire click -> IPC -> updater path.
  fs.writeFileSync(path.join(after, 'src/native-update-2.ts'), 'export const nativeUpdate2: number = "intentional native acceptance failure";\n');
  await c.js(`document.querySelector('#update').click()`);
  await waitUI(c, `document.querySelector('#update').textContent==='Retry update'`);
  result.failure = { button: await c.js(`({text:document.querySelector('#update').textContent,title:document.querySelector('#update').title,disabled:document.querySelector('#update').disabled})`), previousIndexExists: fs.existsSync(path.join(after, 'dist/index.html')) };
  await shot(c, 'after-genuine-update-failure');
  fs.writeFileSync(path.join(after, 'src/native-update-2.ts'), 'export const nativeUpdate2 = 2;\n');
  await c.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('#update').click()`);
  await waitUI(c, `document.querySelector('#update').textContent.includes('Building') || document.querySelector('#update').textContent.includes('Restarting')`, 45000).catch(() => {});
  await delay(1500); c.ws.close();
  c = await connect(9341);
  result.relaunched = await loaded(c);
  result.relaunchedPageId = c.page.id;
  assert.notEqual(result.initialPageId, result.relaunchedPageId, 'Actual native relaunch must create a new renderer target');
  await c.js(`(()=>{if(document.querySelector('#fold-threads')?.hidden)document.querySelector('[aria-controls="fold-threads"]')?.click()})()`);
  await waitUI(c, `document.querySelectorAll('.th-row').length>0`);
  result.loadedManifest = JSON.parse(fs.readFileSync(path.join(after, 'dist/lucid-build.json'), 'utf8'));
  assert.equal(result.loadedManifest.files['src/native-update-2.ts'], require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(after, 'src/native-update-2.ts'))).digest('hex'));
  await waitUI(c, `document.querySelector('#update').textContent==='Check updates'`);
  await shot(c, 'after-real-native-relaunch');
  result.checks.push('Two local commits accumulated; genuine typecheck failure preserved running build; retry rebuilt and native app.relaunch completed');
  save(); c.ws.close();
  console.log('NATIVE UPDATE COMPLETE', out);
}
if (require.main === module) main().catch(error => { result.error = String(error.stack || error); save(); console.error(error); process.exitCode = 1; });
module.exports = { connect, launch, waitUI };
