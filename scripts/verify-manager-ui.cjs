const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
} else {
  const { app, BrowserWindow } = require('electron');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-manager-ui-'));
  app.setPath('userData', dir); app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 800, height: 800, webPreferences: { contextIsolation: true } });
    try {
      await win.loadURL('data:text/html,<html><body><button id="origin">Robot</button></body></html>');
      const css = ['src/styles.css', 'src/office/office.css', 'src/office/managers.css'].map(p => fs.readFileSync(p, 'utf8')).join('\n');
      await win.webContents.insertCSS(css);
      const source = require('node:module').stripTypeScriptTypes(fs.readFileSync('src/office/managers.ts', 'utf8'), { mode: 'transform' }).replace(/^import .*;$/gm, '').replace('export function openManagers', 'function openManagers');
      await win.webContents.executeJavaScript(source + '\nwindow.openManagers = openManagers; void 0;');
      console.log(await win.webContents.executeJavaScript(`(async()=>{
        const assert=(v,s)=>{if(!v)throw Error(s)},tick=()=>new Promise(r=>setTimeout(r,0));
        const data={projects:[{id:'p',title:'MotionLab'},{id:'q',title:'Another project'}],threads:[{id:'one',projectId:'p',title:'Existing engineering manager with a long title',pinned:true,manager:{projectId:'p',role:''}},{id:'two',projectId:'p',title:'Design work',pinned:false}]};
        const actions={updates:[],refresh:async()=>{},update:async function(v){this.updates.push(v)},suggest:async()=>['Engineering','Design','Quality']};
        document.querySelector('#origin').focus();
        openManagers(data,'two','p',actions);
        const find=s=>document.querySelector(s);
        assert(find('[role=dialog]')&&find('.manager-thread').value==='two','selected robot');
        const inputs=[...document.querySelectorAll('.manager-roles input')];
        assert(inputs.length===2&&inputs.every(i=>i.required),'all managers require roles');
        find('.manager-suggest').click();await tick();
        assert(document.querySelectorAll('.manager-suggestions button').length===3,'AI suggestions shown');
        document.querySelectorAll('.manager-suggestions button')[1].click();
        assert(inputs.find(i=>i.dataset.thread==='two').value==='Design','suggestion fills selected role');
        const first=inputs.find(i=>i.dataset.thread==='one');first.value='Engineering';first.dispatchEvent(new Event('input'));
        find('.manager-save').click();await tick();
        assert(actions.updates[0].pinned&&actions.updates[0].roles.one==='Engineering'&&actions.updates[0].roles.two==='Design','promotion saves every role');
        assert(!find('[role=dialog]')&&document.activeElement.id==='origin','close restores focus');
        openManagers(data,'one','p',{...actions,update:async()=>{throw Error('Offline. Retry.')}});
        find('.manager-demote').click();await tick();
        assert(find('.manager-message').textContent==='Offline. Retry.'&&!find('.manager-save').disabled,'failed unpin stays editable');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));assert(!find('[role=dialog]'),'escape closes');
        openManagers(data,null,'p',actions);assert(find('.manager-thread').value==='one','project editor selects existing manager');
        return 'PASS: selected robot, required multiple roles, AI suggestion selection, promotion, save errors, Escape and focus restoration';
      })()`));
      win.setSize(390, 700);
      await new Promise(r => setTimeout(r, 100));
      const geometry = await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,bottom:r.bottom,height:innerHeight}})()`);
      if (geometry.left < 0 || geometry.right > geometry.width || geometry.bottom > geometry.height) throw Error('Narrow dialog exceeds viewport: ' + JSON.stringify(geometry));
      fs.writeFileSync(path.join(dir, 'manager-editor.png'), (await win.webContents.capturePage()).toPNG());
      console.log('Narrow viewport passed. Screenshot: ' + path.join(dir, 'manager-editor.png'));
      app.quit();
    } catch (e) { console.error(e); app.exit(1); }
  });
}
