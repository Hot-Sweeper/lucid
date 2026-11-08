// Real backend logic with fake Electron resources; no native window or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const windows = [];
let captures = 0, revision = 1, holdCapture, releaseCapture, unavailable = false;
class WebContents extends EventEmitter {
  setWindowOpenHandler(fn) { this.popup = fn; }
  setAudioMuted() {}
  setBackgroundThrottling(value) { this.throttled = value; }
  setZoomFactor() {}
  async loadURL(url) { this.url = url; if (unavailable) throw Error('ERR_CONNECTION_REFUSED'); this.emit('did-finish-load'); }
  async executeJavaScript(source) {
    if (source.includes('function install')) return;
    return { width: 960, height: 540, shapes: [], background: '#fff', revision, title: 'Real frontend', animated: false };
  }
  async capturePage() {
    captures++; if (holdCapture) await new Promise(resolve => releaseCapture = resolve);
    return { isEmpty: () => false, resize: () => ({ toDataURL: () => 'data:image/png;base64,frame' }) };
  }
  reload() { this.emit('did-finish-load'); }
}
class Window {
  constructor(options) { this.options = options; this.webContents = new WebContents(); this.dead = false; windows.push(this); }
  isDestroyed() { return this.dead; }
  destroy() { this.dead = true; }
  setContentSize() {}
}
const partitions = [];
const electron = { BrowserWindow: Window, session: { fromPartition() {
  const s = new EventEmitter();s.webRequest={onBeforeRequest:fn=>s.filter=fn};s.setPermissionRequestHandler = fn => s.permission = fn;s.setPermissionCheckHandler = fn => s.permissionCheck = fn;s.clearStorageData = async () => { s.cleared = true; };partitions.push(s);return s;
} } };
const moduleObject = { exports: {} };
const context = { require: name => name === 'electron' ? electron : name === './frontend-page.cjs' ? require('../electron/frontend-page.cjs') : require(name), module: moduleObject, exports: moduleObject.exports, Buffer, URL, setTimeout, clearTimeout, console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/frontend.cjs'), 'utf8'), context);
const api = moduleObject.exports;
const run = async () => {
  assert.equal(api.localUrl('http://localhost:5173/'), 'http://localhost:5173/');
  for (const url of ['https://example.com/', 'file:///tmp/x', 'javascript:alert(1)', 'http://me:secret@localhost:80', 'http://localhost.evil.test']) assert.equal(api.localUrl(url), null);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-frontend-test-'));
  try {
    fs.writeFileSync(path.join(folder, 'index.html'), '<h1>Actual file</h1>');
    fs.mkdirSync(path.join(folder,'sub'));
    assert.ok(api.sourceOf({ root: folder, file: 'index.html' }).url.startsWith('file:'));
    assert.throws(() => api.sourceOf({ root: path.join(folder, 'sub'), file: '../index.html' }));
    let r = await api.frame(1, { id: 'a', target: { html: '<h1>Frontend</h1>' }, mode: 'full' });
    assert.equal(r.ok, true);assert.ok(r.image);assert.equal(captures, 1);
    assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
    assert.equal(windows[0].options.webPreferences.sandbox, true);
    assert.equal(windows[0].webContents.popup().action, 'deny');assert.equal(partitions[0].permissionCheck(), false);
    partitions[0].filter({url:'file:///unrelated/secret.txt'},r=>assert.equal(r.cancel,true));
    r = await api.frame(1, { id: 'a', mode: 'full' });assert.equal(r.image, undefined);assert.equal(captures, 1, 'Static frontend does not reencode identical frames');
    revision++;
    await api.frame(1, { id: 'a', mode: 'lines' });assert.equal(captures, 1, 'Lines use actual page geometry without a screenshot');
    r = await api.frame(1, { id: 'a', mode: 'full' });assert.ok(r.image, 'Zoom back refreshes pixels changed during reduced detail');assert.equal(captures, 2);
    await api.frame(1, { id: 'a', mode: 'paused' });assert.equal(windows[0].webContents.throttled, true);assert.equal(captures, 2);
    const foreign = await api.frame(2, { id: 'a', mode: 'full' });assert.equal(foreign.missing, true, 'A different renderer cannot read another session');
    revision++;holdCapture = true;
    const one = api.frame(1, { id: 'a', mode: 'full' });
    await new Promise(resolve => setImmediate(resolve));
    const two = api.frame(1, { id: 'a', mode: 'full' });
    releaseCapture();await Promise.all([one,two]);holdCapture = false;assert.equal(captures, 3, 'Overlapping requests share one capture');
    await api.frame(1, { id: 'a', close: true });assert.equal(windows[0].dead, true);assert.equal(partitions[0].cleared, true);
    for (let i=0;i<8;i++) await api.frame(1,{id:`bounded${i}`,target:{html:`<h1>${i}</h1>`},mode:'lines'});
    assert.ok(windows.filter(w=>!w.dead).length<=6,'Persistent renderers have a hard bound');
    for(let i=0;i<8;i++) await api.frame(1,{id:`bounded${i}`,close:true});
    unavailable = true;
    const beforeFailure = captures;
    r = await api.frame(1, {id:'recovery',target:{url:'http://127.0.0.1:5711'},mode:'full'});
    assert.equal(r.ok, false);assert.match(r.error, /reconnect automatically/);
    r = await api.frame(1, {id:'recovery',mode:'full'});
    assert.equal(r.ok, false);assert.equal(captures,beforeFailure,'Unavailable pages never capture an error document');
    unavailable = false;
    r = await api.frame(1, {id:'recovery',mode:'full'});
    assert.equal(r.ok,true);assert.ok(r.image,'Same preview recovers when the server starts');
    await api.frame(1,{id:'recovery',close:true});
    console.log('Frontend backend: sandbox, source scope, stable frames, LOD suppression/resume, ownership, coalescing, close and pool bounds passed.');
  } finally { fs.rmSync(folder,{recursive:true,force:true}); }
};
run().catch(error=>{console.error(error);process.exitCode=1;});
