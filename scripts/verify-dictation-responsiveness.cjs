// One coordinated, isolated CPU-only Electron run. Never opens Lucid or T3.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('mute-audio');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid dictation responsiveness '));
  app.setPath('userData', path.join(directory, 'profile'));
  app.setPath('sessionData', path.join(directory, 'profile'));
  const root = path.resolve(__dirname, '..');
  const { createService } = require('../electron/dictation.cjs');
  const service = createService();
  const deadline = setTimeout(() => { service.stop(); console.error('Responsiveness fixture timed out'); app.exit(1); }, 45000);
  app.on('before-quit', () => service.stop());
  ipcMain.handle('fixture:load', () => service.load('cpu'));
  ipcMain.handle('fixture:run', (_event, pcm) => service.run(pcm));
  ipcMain.handle('fixture:cancel', () => service.stop());
  fs.writeFileSync(path.join(directory, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixtureSpeech',{load:()=>ipcRenderer.invoke('fixture:load'),run:pcm=>ipcRenderer.invoke('fixture:run',pcm),cancel:()=>ipcRenderer.invoke('fixture:cancel')});`);
  const csp = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert(csp, 'Prepare a private production build first.');
  let helper = fs.readFileSync(path.join(root, 'src/office/dictation-worklet.ts'), 'utf8');
  helper = helper.replace(/^import captureSource.*;$/m, 'const captureSource = ' + JSON.stringify(fs.readFileSync(path.join(root, 'scripts/dictation-test/capture-worklet.js'), 'utf8')) + ';');
  let component = fs.readFileSync(path.join(root, 'src/office/dictation.ts'), 'utf8').replace(/^import .*;$/gm, '');
  const strip = source => require('node:module').stripTypeScriptTypes(source, { mode: 'transform' }).replaceAll('export async function', 'async function').replaceAll('export function', 'function').replace(/export\s*\{\s*\};?/g, '');
  fs.writeFileSync(path.join(directory, 'fixture.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><form><textarea></textarea><div class="cp-tools"><span class="cp-hint"></span><button class="cp-send">Send</button></div></form><script src="fixture.js"></script>`);
  fs.writeFileSync(path.join(directory, 'fixture.js'), strip(helper) + '\n' + strip(component) + `
window.responsiveness = async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => { for (let i=0;i<1200;i++) { if (predicate()) return; await wait(10); } throw Error('Fixture state timed out'); };
  const report = { stages: {}, modelLoadCalls: 0, model: null, hardwareAcceleration: false };
  let stage, last=performance.now(), messages=0;
  const heartbeat=setInterval(()=>{const now=performance.now();if(stage){const item=report.stages[stage];item.maxGapMs=Math.max(item.maxGapMs,now-last);item.ticks++;}last=now;},10);
  const phase = name => {stage=name;last=performance.now();report.stages[name]={maxGapMs:0,ticks:0};};
  const NativeWorklet=AudioWorkletNode;
  window.AudioWorkletNode=class extends NativeWorklet {constructor(...args){super(...args);this.port.addEventListener('message',e=>{if(e.data instanceof Float32Array)messages++;});this.port.start();}};
  const synthetic = new AudioContext();
  await synthetic.resume();
  const oscillator=synthetic.createOscillator(), destination=synthetic.createMediaStreamDestination();
  oscillator.connect(destination);oscillator.start();
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>destination.stream.clone()});
  window.lucidDictation={load:async()=>{report.modelLoadCalls++;const value=await window.fixtureSpeech.load();report.model=value;return value;},run:pcm=>window.fixtureSpeech.run(pcm),cancel:()=>window.fixtureSpeech.cancel()};
  const controller=attachDictation(document.querySelector('form'),()=> 'fixture');
  const button=document.querySelector('.cp-dictate');
  try {
    phase('captureOnly');
    button.click();await until(()=>button.getAttribute('aria-pressed')==='true');
    const start=performance.now();await wait(3000);
    report.stages.captureOnly.messages=messages;report.stages.captureOnly.seconds=(performance.now()-start)/1000;
    if(report.modelLoadCalls!==0)throw Error('Model loaded while microphone was recording');
    phase('modelStartupAndRecognition');
    button.click();await until(()=>!controller.active());
    if(report.modelLoadCalls!==1||report.model?.backend!=='cpu')throw Error('Expected exactly one CPU model load');
    if(report.stages.captureOnly.maxGapMs>500||report.stages.modelStartupAndRecognition.maxGapMs>500)throw Error('Renderer stalled: '+JSON.stringify(report));
    if(document.querySelector('.cp-dictation-note').textContent.includes('failed'))throw Error(document.querySelector('.cp-dictation-note').textContent);
    return report;
  } finally {
    controller.cancel();clearInterval(heartbeat);oscillator.stop();destination.stream.getTracks().forEach(t=>t.stop());await synthetic.close();await window.fixtureSpeech.cancel();
  }
};`);
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(directory, 'preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    console.log(JSON.stringify({ nativePID: process.pid, profile: directory }));
    try {
      await window.loadFile(path.join(directory, 'fixture.html'));
      const result = await window.webContents.executeJavaScript('window.responsiveness()', true);
      result.nativePID = process.pid; result.profile = directory;
      fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
      service.stop(); clearTimeout(deadline); window.destroy(); app.exit(0);
    } catch (error) {
      fs.writeFileSync(path.join(directory, 'failure.txt'), error.stack || String(error));
      console.error(error); service.stop(); clearTimeout(deadline); window.destroy(); app.exit(1);
    }
  });
}
