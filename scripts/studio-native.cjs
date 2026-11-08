// Native QA harness, always launched inside the hidden agent workspace.
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.env.LUCID_STUDIO_QA_OUT || process.argv.at(-1) || '/tmp/lucid-studio-native');
fs.mkdirSync(out, { recursive: true });
if (!process.versions.electron) {
  const candidate = path.join(out, 'candidate');
  fs.cpSync(path.resolve(__dirname, '../dist-build'), candidate, { recursive: true });
  const env = { ...process.env, LUCID_STUDIO_QA_OUT: out, LUCID_SHOT: out, LUCID_SHOT_EVERY: '3600000', LUCID_DEV_URL: require('node:url').pathToFileURL(path.join(candidate, 'index.html')).href };
  delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), ['--ozone-platform=x11', ...(process.env.LUCID_TEST_REDUCED_MOTION ? ['--force-prefers-reduced-motion=reduce'] : []), __filename, out], { env, stdio: 'inherit' }).on('exit', code => process.exit(code || 0));
} else {
  const { app, webContents } = require('electron');
  app.setPath('temp', out);
  let main = null, count = 0, busy = false, commandId = null, recordTimer = null, nativeFetch = globalThis.fetch, linkOpenCalls = [], nativeOpen = require('electron').shell.openExternal;
  app.on('browser-window-created', (_event, win) => {
    if (main) return; main = win;
    win.webContents.once('did-finish-load', () => {
      // This window belongs to the hidden agent desktop, never the user's display.
      win.setFocusable(true); win.setPosition(0, 0); win.showInactive();
      const timer = setInterval(async () => {
        if (busy || win.isDestroyed()) return; busy = true;
        try {
          let command; try { command = JSON.parse(fs.readFileSync(path.join(out, 'command.json'), 'utf8')); } catch {}
          if (command && command.id !== commandId) {
            commandId = command.id;
            try {
              if (command.quit) { clearInterval(timer); app.quit(); return; }
              if (command.size) { win.setMinimumSize(320, 480); win.setContentSize(...command.size); }
              if ('linkProbe' in command) { require('electron').shell.openExternal = command.linkProbe ? async url => { linkOpenCalls.push(url); if (command.linkProbe === 'failure') throw Error('QA browser unavailable'); } : nativeOpen; }
              if (command.linkCalls) { fs.writeFileSync(path.join(out, 'link-calls.json'), JSON.stringify(linkOpenCalls)); }
              if (command.capture) fs.writeFileSync(path.join(out, String(command.capture).replace(/[^a-z0-9-]/gi, '') + '.png'), (await win.webContents.capturePage()).toPNG());
              if (command.media) {
                const dbg = win.webContents.debugger; if (!dbg.isAttached()) dbg.attach('1.3');
                const params = { features: [{ name: 'prefers-reduced-motion', value: command.media }] }; await dbg.sendCommand('Emulation.setEmulatedMedia', params);
                const targets = await dbg.sendCommand('Target.getTargets');
                for (const target of targets.targetInfos.filter(t => t.type === 'iframe' && t.url.includes('/__lucid/studio'))) { const {sessionId} = await dbg.sendCommand('Target.attachToTarget', { targetId: target.targetId, flatten: true }); await dbg.sendCommand('Emulation.setEmulatedMedia', params, sessionId); }
              }
              if (command.key) { win.webContents.focus(); win.webContents.sendInputEvent({type:'keyDown',keyCode:command.key}); win.webContents.sendInputEvent({type:'keyUp',keyCode:command.key}); }
              if ('connectionFault' in command) globalThis.fetch = command.connectionFault ? (url, ...args) => String(url).includes('ares.tailfce843.ts.net:8446/lucid-runner') ? Promise.reject(new TypeError('Injected tailnet connection loss')) : nativeFetch(url, ...args) : nativeFetch;
              if ('record' in command) { clearInterval(recordTimer); recordTimer = null; if (command.record) { let n = 0, capturing = false; recordTimer = setInterval(async () => { if (capturing || win.isDestroyed()) return; capturing = true; try { const image = (await win.webContents.capturePage()).resize({width:1280}); fs.writeFileSync(path.join(out, `demo-${String(++n).padStart(6, '0')}.jpg`), image.toJPEG(82)); } finally { capturing = false; } }, 50); } }

              let target = win.webContents.mainFrame;
              if (command.frame === 'canvas') target = target.frames.find(f => f.url.includes('/__lucid/studio'));
              if (command.frame === 'site') { const host = target.frames.find(f => f.url.includes('/__lucid/studio')); target = host?.frames.find(f => !f.url.includes('/__lucid/frame') && f.url.startsWith('http:')); }
              const value = command.code ? await target.executeJavaScript(command.code) : true;
              fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ id: command.id, value }, null, 2));
            } catch (e) { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ id: command.id, error: e.message }, null, 2)); }
          }
          const state = await win.webContents.executeJavaScript(`({studio:!!document.querySelector('.website-studio'),status:document.querySelector('.ws-status')?.textContent,error:document.querySelector('.ws-send-error')?.textContent,messages:document.querySelectorAll('.ws-messages .cp-msg').length,frames:[...document.querySelectorAll('.ws-frame')].map(f=>f.src),width:innerWidth,height:innerHeight})`);
          const host = win.webContents.mainFrame.frames.find(f => f.url.includes('/__lucid/studio'));
          if (host) state.canvas = await host.executeJavaScript(`window.__lucidCanvas?.inspect()`).catch(e => ({ error: e.message }));
          fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(state, null, 2));
          if (state.studio && state.width >= 1000) { const image = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, `frame-${String(++count).padStart(6, '0')}.jpg`), image.toJPEG(82)); }
        } catch (e) { console.error('QA observation:', e.message); } finally { busy = false; }
      }, 500);
    });
  });
  require('../electron/main.cjs');
}
