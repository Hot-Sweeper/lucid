const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1));
} else {
  const { app, BrowserWindow } = require('electron');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-mobile-layout-'));
  app.setPath('userData', path.join(out, 'profile'));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 390, height: 844, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false, offscreen: true } });
    const check = (ok, message) => { if (!ok) throw Error(message); console.log('PASS', message); };
    const js = code => win.webContents.executeJavaScript(code);
    const wait = () => new Promise(r => setTimeout(r, 80));
    try {
      const { transformWithOxc } = await import('vite');
      const root = path.join(__dirname, '..');
      const source = (await transformWithOxc(fs.readFileSync(path.join(root, 'src/mobile.ts'), 'utf8'), 'mobile.ts')).code.replace(/^import .*?;?\s*$/gm, '').replace(/export function /g, 'function ');
      const css = ['src/styles.css', 'src/office/office.css', 'src/office/panels.css', 'src/office/hire.css', 'src/mobile.css'].map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
      const html = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="app"><aside class="panel" id="side-panel" hidden><header class="brand"><h1>Lucid</h1></header><div class="threads"><label class="th-search"><input id="th-q" placeholder="Search threads"></label>${Array.from({ length: 40 }, (_, i) => `<button class="th-row">A long project and task title ${i} with several words</button>`).join('')}</div><button id="overview">Whole building</button></aside><main class="scene" id="scene"></main><aside class="chat-panel tabbed"><header class="cp-head"><div class="cp-who"><b>Persistent robot</b><span>A real-shaped project title with long text</span></div><button class="cp-close">Close</button></header><div class="cp-list">${Array.from({ length: 40 }, (_, i) => `<div class="cp-msg bot"><div class="cp-text">Message ${i}. Preserve this reader position and the draft.</div></div>`).join('')}</div><form class="cp-form"><div class="cp-box"><textarea aria-label="Message">An unfinished phone draft</textarea><div class="cp-tools"><button class="cp-attach" type="button">Add</button><span class="cp-hint">Enter to send</span><button class="cp-send">Send</button></div></div></form></aside><div class="side-rail"></div><button class="cp-tab"></button><div class="grip"></div><div class="zoom-ui"><button>Sound on</button></div></div>`;
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      await js(`{
        const gameSound={play(){}}, getLocale=()=> 'en', onLocaleChange=()=>()=>{};
        ${source}
        window.chatFixture={el:document.querySelector('.chat-panel'),isOpen:false,onPresent(){},onCollapse(){},onChooseThread(){}};
        window.stopMobile=mountMobileShell(document.getElementById('app'),window.chatFixture); undefined;
      }`);
      await wait();
      check(await js(`document.querySelector('#app').classList.contains('mobile-layout') && document.querySelector('.scene').getBoundingClientRect().width===innerWidth`), 'phone office uses the full width and retains world geometry');
      check(await js(`getComputedStyle(document.querySelector('.panel')).display==='none' && document.querySelector('.panel').inert`), 'hidden phone panels cannot receive keyboard focus');
      await js(`document.querySelector('[data-view="chat"]').click()`);
      check(await js(`document.querySelector('#app').dataset.mobileView==='threads' && getComputedStyle(document.querySelector('.panel')).display==='flex'`), 'Chat without a selection reveals the usable thread list despite desktop fold state');
      check(await js(`{const e=document.querySelector('.panel');e.scrollTop=230;e.scrollTop>0 && e.scrollHeight>e.clientHeight}`), 'long thread lists have one working panel scrollbar');
      await js(`window.chatFixture.isOpen=true;window.chatFixture.el.classList.add('open');window.chatFixture.onPresent()`);
      check(await js(`document.querySelector('#app').dataset.mobileView==='chat' && getComputedStyle(document.querySelector('.chat-panel')).display==='flex' && document.querySelector('.scene').inert`), 'selecting a conversation presents chat and suspends world input');
      const repeated = await js(`{
        let publications=0, mutations=0;
        const count=()=>publications++;
        window.addEventListener('lucid:mobile-view',count);
        const observe=new MutationObserver(records=>mutations+=records.length);
        observe.observe(document.querySelector('#app'),{attributes:true,subtree:true});
        for(let i=0;i<40;i++)window.chatFixture.onPresent();
        mutations+=observe.takeRecords().length;observe.disconnect();
        window.removeEventListener('lucid:mobile-view',count);
        ({publications,mutations});
      }`);
      console.log('Repeated same-conversation presentation:', JSON.stringify(repeated));
      check(repeated.publications === 0 && repeated.mutations === 0, 'reopening the current mobile conversation causes no world publications or layout mutations');
      check(await js(`{const s=document.querySelector('.scene');getComputedStyle(s).contentVisibility==='hidden' && s.getBoundingClientRect().width===innerWidth && s.isConnected}`), 'covered office skips its descendant rendering while retaining its camera viewport and DOM');
      const before = await js(`{const e=document.querySelector('.cp-list');e.scrollTop=160;({scroll:e.scrollTop,draft:document.querySelector('textarea').value})}`);
      await js(`document.querySelector('textarea').focus();document.querySelector('[data-view="office"]').click();document.querySelector('[data-view="chat"]').click()`);
      check(await js(`document.querySelector('textarea').value===${JSON.stringify(before.draft)} && document.querySelector('.cp-list').scrollTop===${before.scroll}`), 'surface navigation preserves conversation scroll and unfinished input');
      await js(`{const v=new EventTarget();Object.assign(v,{height:420,offsetTop:12,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:v});v.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('resize'))}`);
      await wait();
      check(await js(`{const app=document.querySelector('#app').getBoundingClientRect(), send=document.querySelector('.cp-send').getBoundingClientRect(),nav=document.querySelector('.mobile-navigation').getBoundingClientRect();app.height===420 && app.top===12 && send.bottom<=nav.top && send.top>=app.top}`), 'virtual keyboard leaves the composer and Send action inside the visual viewport');
      check(await js(`parseFloat(getComputedStyle(document.querySelector('textarea')).fontSize)>=16 && document.documentElement.scrollWidth===innerWidth`), 'phone input avoids automatic input zoom and horizontal page overflow');
      await js(`document.body.insertAdjacentHTML('beforeend','<div class="dialog-wrap hire-wrap"><form class="dialog hire"><header class="hire-header"><h2>New thread</h2><button class="hire-close" type="button">Close</button></header><div class="hire-body"><label class="hire-task"><textarea>A long task draft</textarea></label><p>${'A long runtime and project name. '.repeat(50)}</p></div><footer class="hire-footer"><button class="primary">Hire and start</button></footer></form></div>')`);
      check(await js(`{const d=document.querySelector('.dialog.hire').getBoundingClientRect(),f=document.querySelector('.hire-footer').getBoundingClientRect();d.top>=12 && d.bottom<=432 && f.bottom<=432 && f.top>=12}`), 'hiring dialog keeps its submit footer above the keyboard');
      await wait();
      fs.writeFileSync(path.join(out, 'phone-keyboard.png'), (await win.webContents.capturePage()).toPNG());
      await js(`document.querySelector('.dialog-wrap').remove()`);
      win.setSize(1280, 920); await wait();
      check(await js(`!document.querySelector('#app').classList.contains('mobile-layout') && !document.querySelector('.scene').inert && !document.querySelector('.panel').inert && document.querySelector('.panel').hidden`), 'desktop resizing restores its original fold state and keyboard access');
      await js(`window.stopMobile()`);
      check(await js(`!document.querySelector('.mobile-navigation') && !document.documentElement.style.getPropertyValue('--mobile-height')`), 'mobile teardown releases navigation and viewport state');
      console.log('Mobile layout checks passed. Evidence:', out);
      win.destroy(); app.quit();
    } catch (error) { console.error(error); win.destroy(); app.exit(1); }
  });
}
