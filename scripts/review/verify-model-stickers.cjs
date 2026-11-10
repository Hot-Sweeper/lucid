// Isolated Electron fixture using the real seated and walking robot renderers.
const fs = require('node:fs'), path = require('node:path');
const out = path.resolve('docs/evidence/model-stickers');
const fixture = process.env.LUCID_MODEL_REVIEW || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lucid-model-stickers-'));
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(out, { recursive: true });
    const root = path.resolve('.').replaceAll('\\', '/');
    const entry = path.join(fixture, 'entry.ts');
    fs.writeFileSync(entry, `import {Walker} from '${root}/src/world/walker';
import {TopDownRobot} from '${root}/src/world/seated';
import {modelStickerKind} from '${root}/src/world/model-sticker';
import '${root}/src/world/world.css';
window.review={Walker,TopDownRobot,modelStickerKind};`);
    await (await import('vite')).build({ configFile: false, logLevel: 'error', build: { outDir: fixture, emptyOutDir: false, lib: { entry, name: 'Review', formats: ['iife'], fileName: () => 'fixture.js', cssFileName: 'fixture' } } });
    fs.writeFileSync(path.join(fixture, 'index.html'), `<html><head><link rel="stylesheet" href="fixture.css"><style>
body{margin:0;padding:20px;background:#c5a47e;color:#2f3a5c;font:16px system-ui;--mono:monospace}main{display:flex;gap:8px}.column{width:155px;text-align:center}.pose{height:220px;position:relative}.seat{height:210px;position:relative;overflow:hidden}.seat .world-seated{left:-122px;top:-145px}h2{font-size:18px}p{margin:0} .world-say{display:none}
</style></head><body><main></main><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env, LUCID_MODEL_REVIEW: fixture }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1));
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(fixture, 'profile'));
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: true, x: -4000, y: -4000, focusable: false, skipTaskbar: true, width: 1190, height: 1030, webPreferences: { backgroundThrottling: false } });
    try {
      await win.loadFile(path.join(fixture, 'index.html'));
      const checks = await win.webContents.executeJavaScript(`(async()=>{
const {Walker,TopDownRobot,modelStickerKind}=review,actors=[],checks=[];
const check=(v,m)=>{if(!v)throw Error(m);checks.push(m)};
const families=['luna','sol','terra','astra','opus','sonnet','haiku'];
for(const kind of families){
 const col=document.createElement('section');col.className='column';col.innerHTML='<h2>'+kind[0].toUpperCase()+kind.slice(1)+'</h2>';document.querySelector('main').append(col);
 const model=(['opus','sonnet','haiku'].includes(kind)?'claude-':'gpt-6.1-')+kind;
 for(const dir of ['up','down','right']){
  const host=document.createElement('div');host.className='pose';col.append(host);
  const w=new Walker(host,{id:kind+dir,provider:model.startsWith('claude')?'claudeAgent':'codex',model,look:{sticker:'heart',hat:'none'},scale:.48});
  w.setPos(78,218);w.face(dir);actors.push(w);
 }
 const host=document.createElement('div');host.className='seat';col.append(host);
 const desk={mouse:{x:278,y:226},homeLeft:{x:170,y:208},homeRight:{x:210,y:208},mug:{x:330,y:204},phoneRest:{x:76,y:226},keyPos:()=>null,pressKey(){},moveMouse(){},moveMug(){},showPhone(){}};
 const r=new TopDownRobot(host,desk);r.setBrand(model.startsWith('claude')?'claudeAgent':'codex');r.setLook({sticker:'heart'});r.setModel(model);actors.push(r);
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(650);
const w=actors[0],root=w.svg??w.el;
const art=root.querySelector('.model-sticker>g'),cosmetic=root.querySelector('[data-r="sticker"]').innerHTML;
check(!art.hasAttribute('transform'),'initial appearance has no animation');
w.setModel('gpt-6.1-luna');check(root.querySelector('.model-sticker>g')===art,'same family preserves decal DOM');
w.setModel('claude-opus-5');check(root.querySelector('.model-sticker title').textContent==='Opus','live model change updates sticker');
check(root.querySelector('[data-r="sticker"]').innerHTML===cosmetic,'personal sticker survives model changes');
await wait(550);check(root.querySelector('.model-sticker>g').getAttribute('transform').includes('scale(1 1.000)'),'model change settles');
w.setModel(null);check([...root.querySelectorAll('.model-sticker')].every(n=>n.style.display==='none'),'unknown or cleared model removes every view');
for(const value of ['absolute','lunar',null,'','gpt-6.1'])check(modelStickerKind(value)===null,'unknown model stays unmarked: '+value);
w.setModel('gpt-6.1-luna');await wait(550);
check(document.querySelectorAll('.model-sticker title').length===77,'all seated, front, back and side decals rendered');
window.sample=w;window.cleanup=()=>actors.forEach(a=>a.destroy());return checks;
})()`);
      fs.writeFileSync(path.join(out, 'robots.png'), (await win.webContents.capturePage()).toPNG());
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const reduced = await win.webContents.executeJavaScript(`sample.setModel('claude-haiku');sample.modelSticker.step(performance.now());sample.modelSticker.applied===0 && !sample.svg.querySelector('.model-sticker>g').hasAttribute('transform')`);
      if (!reduced) throw Error('Reduced motion applied an animation');
      checks.push('reduced motion changes decal immediately without animation');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      win.webContents.setBackgroundThrottling(true);
      win.hide();
      await new Promise(resolve => setTimeout(resolve, 150));
      const hidden = await win.webContents.executeJavaScript(`sample.setModel('claude-sonnet');document.hidden && sample.modelSticker.applied===0`);
      if (!hidden) throw Error('Hidden model change queued an animation');
      checks.push('hidden model change queues no cosmetic animation or sound');
      fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2));
      await win.webContents.executeJavaScript('cleanup()');
      if (await win.webContents.executeJavaScript(`document.querySelector('.world-walker,.world-seated,.world-thumb')!==null`)) throw Error('Actor teardown retained robot nodes');
      console.log('Model stickers:', checks.length, 'native checks passed.');
    } catch (e) { console.error(e); app.exit(1); }
    finally { if (!win.isDestroyed()) win.destroy(); app.quit(); }
  });
}
