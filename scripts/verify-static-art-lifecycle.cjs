const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-art-lifecycle-')));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 390, height: 844, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    const js = code => win.webContents.executeJavaScript(code);
    const until = async (code, label) => {
      for (let i = 0; i < 100; i++) { if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 25)); }
      throw Error(label);
    };
    try {
      const { transformWithOxc } = await import('vite');
      const compile = async name => (await transformWithOxc(fs.readFileSync(path.join(__dirname, '../src/perf', name + '.ts'), 'utf8').replace(/^import .*;\r?\n/gm, ''), name + '.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
      const code = await compile('raster-quiet')+'\n'+await compile('tile-grid') + '\n' + await compile('static-art');
      await win.loadURL('data:text/html,' + encodeURIComponent('<style>body{margin:0}#world{position:absolute;transform-origin:0 0}svg{overflow:visible}</style><div id="scene"><div id="world" class="world"></div></div>'));
      await js(`{
        document.querySelector('#world').innerHTML='<svg width="4000" height="3000" viewBox="0 0 4000 3000"><g>${Array.from({length:20}, (_,i) => `<rect x="${i*200}" width="200" height="3000" fill="${i%2?'#abcdef':'#fedcba'}"/>`).join('')}</g></svg>';
        ${code}
        window.artSurface=()=>[...surfaces][0];
        window.artDispose=cacheStaticArt(document.querySelector('svg'));
        window.artView=x=>{document.querySelector('#world').style.transform='translate('+x+'px,0)';updateStaticArt({x,y:0,s:1},innerWidth,innerHeight)};
        window.artReady=()=>{const s=window.artSurface();return s?.visibleTiles.length>0&&s.visibleTiles.every(t=>s.tiles.has(t.key))&&!s.tileLoading};
        window.artHold=()=>{window.artHeld=null;window.artHoldNext=true;window.__staticArt.enable(false);window.__staticArt.enable(true)};
        const set=SVGImageElement.prototype.setAttribute;
        SVGImageElement.prototype.setAttribute=function(name,value){
          if(name==='href'&&this.parentElement?.dataset.staticTile&&window.artHoldNext){window.artHoldNext=false;window.artHeld=this;return;}
          return set.call(this,name,value);
        };
        window.artView(0);window.artHold();undefined;
      }`);
      await until('!!window.artHeld', 'No delayed SVG consumer was created');
      await js('window.artView(-2200)');
      await until('window.artReady()', 'An obsolete SVG consumer blocked all tiles after moving the camera');
      if (!await js('!window.artHeld.isConnected&&window.artHeld.onload===null&&window.artHeld.onerror===null')) throw Error('The obsolete consumer retained its node or callbacks');
      await js('window.artHold()');
      await until('!!window.artHeld', 'No delayed consumer for hidden recovery');
      await js(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);
      await until('!window.artSurface().tileLoading', 'Hiding left an SVG consumer pending');
      await js(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);
      await until('window.artReady()', 'Showing did not resume static artwork without moving the camera');
      await js('window.artDispose();window.__staticArt.enable(false)');
      if (!await js('{const s=window.__staticArt.stats();s.surfaces===0&&s.pending===0&&s.bytes===0}')) throw Error('Teardown retained artwork jobs or pixels');
      console.log('Static artwork lifecycle: obsolete consumer cancellation, hidden cancellation, immediate resume and teardown passed.');
      win.destroy(); app.quit();
    } catch (error) { console.error(error); win.destroy(); app.exit(1); }
  });
}
