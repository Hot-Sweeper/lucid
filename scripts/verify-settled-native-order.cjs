const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { connect, waitUI } = require('./verify-settled-native.cjs');
const base = path.join(require('node:os').homedir(), '.t3/lucid-settled-review-20261031-final');
const out = path.join(base, 'evidence'), isolated = path.join(base, 'after');
const evidence = { startedAt: new Date().toISOString(), checks: [] };
const save = () => fs.writeFileSync(path.join(out, 'real-bridge-order.json'), JSON.stringify(evidence, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function screenshot(c, name) { const r = await c.call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); }
async function main() {
  // Load the exact installed T3 Code sorting module, independently of Lucid's comparator.
  const asar = path.join(require('node:os').homedir(), 'AppData/Local/Programs/t3code/resources/server.asar');
  const b = fs.readFileSync(asar), header = JSON.parse(b.subarray(16, 16 + b.readUInt32LE(12)));
  const assets = header.files.apps.files.server.files.dist.files.client.files.assets.files;
  const name = Object.keys(assets).find(n => /^threadSort-.*\.js$/.test(n)), asset = assets[name], offset = 8 + b.readUInt32LE(4) + Number(asset.offset);
  const t3file = path.join(out, 'installed-t3-thread-sort.mjs'); fs.writeFileSync(t3file, b.subarray(offset, offset + asset.size));
  const t3sort = await import(pathToFileURL(t3file).href);
  evidence.t3Implementation = { asar, asset: name, sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(t3file)).digest('hex') };
  let c = await connect(9341);
  const initialTarget = c.page.id;
  await c.js(`(()=>{if(document.querySelector('#fold-threads')?.hidden)document.querySelector('[aria-controls="fold-threads"]')?.click()})()`);
  await waitUI(c, `document.querySelectorAll('.th-row').length>0`);
  const before = await c.js('window.lucid.world()');
  const active = before.threads.filter(t => !t.settled && !t.pinned);
  assert(active.length > 1);
  const source = active.at(-2), target = active.at(-1);
  evidence.before = active.map(t => ({ id: t.id, title: t.title, key: t.activeOrderKey }));
  evidence.move = { source: source.id, target: target.id, method: 'Actual row Alt+ArrowDown event -> renderer moveThread -> preload -> t3s:move-thread -> real T3 RPC dispatch' };
  save();
  await c.js(`(()=>{const r=document.querySelector('.th-row[data-id="${source.id}"]');r.scrollIntoView({block:'center'});r.focus();r.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));})()`);
  const expected = active.map(t => t.id); [expected[expected.length - 2], expected[expected.length - 1]] = [expected.at(-1), expected.at(-2)];
  let moved;
  for (let n = 0; n < 40; n++) {
    moved = await c.js('window.lucid.world()');
    if (JSON.stringify(moved.threads.filter(t => !t.settled && !t.pinned).map(t => t.id)) === JSON.stringify(expected)) break;
    await sleep(1000);
  }
  assert.deepEqual(moved.threads.filter(t => !t.settled && !t.pinned).map(t => t.id), expected, 'Real bridge persisted the keyboard move');
  const parity = data => {
    const actualActive = data.threads.filter(t => !t.settled && !t.pinned);
    assert.deepEqual(actualActive.map(t => t.id), t3sort.o(actualActive).map(t => t.id));
    const pinned = data.threads.filter(t => !t.settled && t.pinned);
    assert.deepEqual(pinned.map(t => t.id), t3sort.s(pinned).map(t => t.id));
  };
  parity(moved);
  evidence.persisted = moved.threads.filter(t => !t.settled && !t.pinned).map(t => ({ id: t.id, title: t.title, key: t.activeOrderKey }));
  evidence.checks.push('Keyboard reorder persisted to real T3 projection; active/pinned order matches installed T3 Code sort module'); save();
  await c.js('window.__refresh()'); await sleep(3500);
  const visible = await c.js(`[...document.querySelectorAll('#th-list>.th-row,#th-list>li>.th-row')].map(r=>r.dataset.id)`);
  assert.deepEqual(visible.filter(id => expected.includes(id)), expected);
  await screenshot(c, 'after-real-bridge-reorder');
  evidence.checks.push('Actual sidebar order survives real world refresh'); save();
  fs.writeFileSync(path.join(isolated, 'src/native-reorder-restart.ts'), 'export const nativeReorderRestart = true;\n');
  // Real update and app.relaunch again, while the changed order is persisted in T3.
  await c.js('window.lucid.applyUpdate()').catch(() => {});
  c.ws.close(); await sleep(2000); c = await connect(9341);
  assert.notEqual(c.page.id, initialTarget, 'Second actual native relaunch');
  const restarted = await c.js('window.lucid.world()'); parity(restarted);
  assert.deepEqual(restarted.threads.filter(t => !t.settled && !t.pinned).map(t => t.id), expected);
  evidence.restartedTarget = c.page.id;
  evidence.checks.push('Order survives actual native app.relaunch and matches installed T3 Code after restart'); save();
  // Return the user's original relative order through the same supported bridge.
  await c.js(`window.lucidT3.moveThread(${JSON.stringify({ threadId: source.id, targetId: target.id, after: false })})`);
  const restored = await c.js('window.lucid.world()');
  assert.deepEqual(restored.threads.filter(t => !t.settled && !t.pinned).map(t => t.id), active.map(t => t.id));
  evidence.checks.push('Original relative order restored via real bridge; valid T3 manual keys remain assigned');
  await c.js(`(()=>{if(document.querySelector('#fold-threads')?.hidden)document.querySelector('[aria-controls="fold-threads"]')?.click()})()`);
  await c.js('window.__refresh()'); await sleep(3500);
  await c.js(`document.querySelector('#side-panel').scrollTop=0`);
  await screenshot(c, 'after-native-final-loaded');
  evidence.loaded = await c.js(`({url:location.href,scripts:[...document.scripts].map(s=>s.src),update:document.querySelector('#update').textContent,errors:window.__errs})`);
  evidence.loadedManifest = JSON.parse(fs.readFileSync(path.join(isolated, 'dist/lucid-build.json'), 'utf8'));
  evidence.finishedAt = new Date().toISOString(); save(); c.ws.close();
  console.log('REAL BRIDGE ORDER PASSED', evidence.checks);
}
main().catch(error => { evidence.error = String(error.stack || error); save(); console.error(error); process.exitCode = 1; });
