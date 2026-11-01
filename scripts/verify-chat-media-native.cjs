// Isolated actual ChatPanel/Markdown/DOMPurify + production media protocol/CSP.
// No production profile, T3 calls, messages, reload or restart.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const out = process.env.LUCID_CHAT_MEDIA_REVIEW || path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-chat-media-')));
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(out, { recursive: true });
    const sourceRoot = root.replaceAll('\\', '/');
    const entry = path.join(out, 'entry.ts');
    fs.writeFileSync(entry, `import {ChatPanel} from ${JSON.stringify(sourceRoot + '/src/office/chat-panel.ts')};
import * as media from ${JSON.stringify(sourceRoot + '/src/office/chat-media.ts')};
import ${JSON.stringify(sourceRoot + '/src/styles.css')};
import ${JSON.stringify(sourceRoot + '/src/office/office.css')};
window.review={ChatPanel,...media};`);
    await (await import('vite')).build({ configFile: false, logLevel: 'error', build: { outDir: out, emptyOutDir: false, lib: { entry, name: 'ChatMediaReview', formats: ['iife'], fileName: () => 'fixture.js', cssFileName: 'fixture' } } });
    const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
    fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head>${csp}<link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#141a33}#app{display:block;height:100vh}.chat-panel{position:relative;inset:auto!important;width:100%!important;max-width:100%;height:100vh!important;transform:none!important;opacity:1!important;visibility:visible!important}.cp-list{overflow:auto}.cp-text{font-size:14px}</style></head><body><div id="app"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env, LUCID_CHAT_MEDIA_REVIEW: out }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, protocol, net } = require('electron');
  const fsp = require('node:fs/promises'), { pathToFileURL } = require('node:url');
  const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  const serve = main.match(/const SERVE = new Set\([^\n]+/)[0];
  const start = main.indexOf('  protocol.handle("lucid-file",');
  const handler = main.slice(start, main.indexOf('\n  createWindow();', start));
  protocol.registerSchemesAsPrivileged([{ scheme: 'lucid-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
  app.setPath('userData', path.join(out, 'profile'));
  app.whenReady().then(async () => {
    new Function('protocol', 'fsp', 'path', 'net', 'pathToFileURL', `${serve}\n${handler}`)(protocol, fsp, path, net, pathToFileURL);
    const win = new BrowserWindow({ show: false, width: 620, height: 900, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
    const result = { assertions: [], errors: [], source: {}, screenshots: [] };
    const crypto = require('node:crypto');
    for (const file of ['src/office/chat-media.ts', 'src/office/chat-panel.ts', 'src/office/office.css', 'index.html']) result.source[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    win.webContents.on('render-process-gone', (_e, info) => result.errors.push(info.reason));
    const deadline = setTimeout(() => { result.errors.push('Fixture deadline exceeded'); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(1); }, 25000);
    try {
      await win.loadFile(path.join(out, 'index.html'));
      // Use a genuine local screenshot and a special-character filename copy.
      const original = 'E:/Lucid-validation/landscape-20261101/s5/autumn-day.png';
      const image = fs.existsSync(original) ? original : 'C:/Users/tim/.t3/userdata/lucid-attachments/1793574443374-image.png';
      const special = path.join(out, 'image #1 (ä) 50%.png'); fs.copyFileSync(image, special);
      const input = { image: image.replaceAll('\\', '/'), special: special.replaceAll('\\', '/'), missing: path.join(out, 'not-present.png').replaceAll('\\', '/') };
      const value = await win.webContents.executeJavaScript(`(async()=>{
        const checks=[],check=(value,label)=>{if(!value)throw Error(label);checks.push(label)};
        const input=${JSON.stringify(input)},c=new review.ChatPanel(document.getElementById('app'),{conversation:async()=>[],sendMessage:async()=>{throw Error('No sends')},saveAttachment:async()=>{throw Error('No saves')}});window.fixtureChat=c;
        c.el.classList.add('open');c.el.querySelector('.cp-empty').hidden=true;
        const list=c.el.querySelector('.cp-list');
        const message={id:'fixture',role:'assistant',at:new Date().toISOString(),streaming:false,attachments:[],text:'## Images in chat\\n\\n![Autumn overview]('+input.image+')\\n\\n![Special filename](<'+input.special+'>)\\n\\n<img src="'+input.image+'" alt="HTML image" onerror="window.badImage=true">\\n\\n![Missing]('+input.missing+')\\n\\n![Unsafe](javascript:alert(1))'};
        const row=document.createElement('div');row.className='cp-msg bot';row.innerHTML=c.render(message);list.append(row);
        const wait=()=>new Promise(r=>setTimeout(r,30));
        for(let i=0;i<100;i++){const images=[...row.querySelectorAll('img')];if(images.length===3&&images.every(img=>img.complete&&img.naturalWidth>0))break;await wait()}
        const images=[...row.querySelectorAll('img')];
        check(images.length===3&&images.every(img=>img.complete&&img.naturalWidth>0),'Native Windows Markdown, special-character filename and raw HTML image actually decode');
        check(images.every(img=>img.src.startsWith('lucid-file://local/')),'All local inline sources use the production media protocol');
        check(!row.querySelector('[onerror]')&&!window.badImage,'Markdown and HTML are sanitized');
        check(row.querySelectorAll('.cp-media-unavailable').length===2,'Missing and unsafe images show readable fallbacks without broken-image icons');
        check(row.scrollWidth<=row.clientWidth+1,'Images fit the chat column');
        const button=row.querySelector('[data-media-src]');button.focus();button.click();const dialog=c.el.querySelector('.cp-zoom');
        for(let i=0;i<50&&!dialog.querySelector('img')?.naturalWidth;i++)await wait();
        check(dialog.open&&dialog.querySelector('img').naturalWidth>0,'Inline image opens the actual in-chat media viewer');
        check(document.activeElement===dialog.querySelector('button'),'Preview close button receives focus');
        dialog.close();await wait();check(!dialog.open&&document.activeElement===button,'Closing restores image-button focus');
        const attach=document.createElement('div');attach.className='cp-msg you';attach.innerHTML=c.render({...message,text:'Uploaded reference',role:'user',attachments:[{path:input.special,name:'Reference.png',mime:'image/png',type:'image',size:100}]});list.append(attach);
        for(let i=0;i<50&&!attach.querySelector('img')?.naturalWidth;i++)await wait();
        check(attach.querySelector('img').naturalWidth>0,'Uploaded attachment images still decode');
        const remote=review.chatMediaSource(input.special);window.lucidRemote=true;const companion=review.chatMediaSource(input.special);delete window.lucidRemote;
        check(remote.startsWith('lucid-file:')&&companion.startsWith('/__lucid/media/'),'Desktop and companion choose their own media transport');
        window.fixtureRow=row;return{checks,width:window.innerWidth,imageCount:images.length};
      })()`);
      result.assertions.push(...value.checks); result.geometry = value;
      await new Promise(resolve => setTimeout(resolve, 150));
      const rect = await win.webContents.executeJavaScript(`(()=>{const r=fixtureRow.querySelector('img').getBoundingClientRect();return{x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height)}})()`);
      const painted = await win.webContents.capturePage();
      const factor = painted.getSize().width / value.width;
      const imagePixels = painted.crop({ x: Math.round(rect.x * factor), y: Math.round(rect.y * factor), width: Math.floor(rect.width * factor), height: Math.floor(rect.height * factor) }).toBitmap(), colors = new Set();
      for (let i = 0; i < imagePixels.length; i += 32) colors.add(imagePixels.readUInt32LE(i));
      if (colors.size < 100) throw Error('Native screenshot did not paint the decoded image');
      result.assertions.push('Native screenshot contains painted image pixels, not only decoded DOM images');
      fs.writeFileSync(path.join(out, 'after-chat.png'), painted.toPNG()); result.screenshots.push('after-chat.png');
      await win.setContentSize(360, 760);
      const narrow = await win.webContents.executeJavaScript(`({fits:fixtureRow.scrollWidth<=fixtureRow.clientWidth+1,width:innerWidth})`);
      if (!narrow.fits) throw Error('Narrow chat overflows'); result.assertions.push('Images remain contained at 360px viewport');
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(out, 'after-narrow.png'), (await win.webContents.capturePage()).toPNG()); result.screenshots.push('after-narrow.png');
      result.ok = true; clearTimeout(deadline); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0);
    } catch (error) { result.errors.push(String(error.stack || error)); clearTimeout(deadline); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.error(error); app.exit(1); }
  });
}
