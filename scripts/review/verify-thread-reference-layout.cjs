// Run through agent-workspace-linux. Reads real T3 history with isolated app settings.
const fs = require('node:fs'), path = require('node:path');
const before = process.argv.includes('--before');
const out = path.join(process.env.HOME, '.t3/artifacts/lucid-thread-reference-layout');
fs.mkdirSync(out, { recursive: true });
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app } = require('electron');
  process.env.LUCID_SHOT = out;
  process.env.LUCID_SHOT_PROFILE = path.join(out, 'profile');
  process.env.LUCID_SHOT_EVERY = '3600000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.resolve(before ? 'dist/index.html' : 'dist-build/index.html')).href;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let seen = false;
  app.on('browser-window-created', (_, win) => {
    if (seen) return; seen = true;
    win.webContents.once('did-finish-load', async () => {
      const wc = win.webContents, result = {};
      wc.on('console-message', (_e, _level, message) => console.log('RENDERER:', message));
      const js = async code => {
        const value = await wc.executeJavaScript(`(async()=>{try{return {value:await (${code})}}catch(e){return {error:e.stack}}})()`);
        if (value.error) throw Error(value.error);
        return value.value;
      };
      try {
        win.setPosition(0, 0); win.setSize(1280, 800); win.setFocusable(true); win.show(); win.focus();
        await wait(3000);
        await js(`window.__world.onWatchChat('3bfb3bf0-2c52-498c-b769-dd2144a5de08')`);
        await wait(2000);
        await js(`(async()=>{for(let n=0;n<10&&!window.__chat.el.querySelector('[data-thread-ref*="f0a2c661"]');n++)await window.__chat.loadEarlier()})()`);
        result.actual = await js(`(() => {
          const card = window.__chat.el.querySelector('[data-thread-ref*="f0a2c661"]');
          if (!card || card.disabled) throw Error('The real MotionLab reference did not resolve');
          card.scrollIntoView({block:'center'});
          window.__layoutCard = card;
          return { height:card.getBoundingClientRect().height, lineHeight:parseFloat(getComputedStyle(card.closest('p')).lineHeight), inline:card.classList.contains('cp-thread-card-inline'), title:card.title };
        })()`);
        await wait(200);
        fs.writeFileSync(path.join(out, before ? 'before.png' : 'after.png'), (await wc.capturePage()).toPNG());
        const rect = await js(`(()=>{const r=window.__layoutCard.closest('.cp-msg').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`);
        fs.writeFileSync(path.join(out, before ? 'before-detail.png' : 'after-detail.png'), (await wc.capturePage(rect)).toPNG());
        if (!before) {
          if (!result.actual.inline || result.actual.height > result.actual.lineHeight + 4) throw Error('Inline reference inflated the text line');
          // Use the production Markdown renderer and resolver for standalone, list,
          // formatted and repeated references, including an unavailable target.
          const href = 't3-thread://v2/52e51155-3b46-4db7-b731-37ac602a64ef/mcp:f0a2c661-9687-4a33-837f-7921c8591307';
          const text = `[Thread](${href})\n\nCreated **[Thread](${href})** in the project.\n\n- Open [Thread](${href}) next.\n\nCompare [first](${href}) and [second](${href}).\n\nUnavailable [thread](t3-thread://v2/52e51155-3b46-4db7-b731-37ac602a64ef/missing-thread).`;
          await js(`window.__chat.renderHistory([{id:'thread-layout-check',role:'assistant',text:${JSON.stringify(text)},attachments:[],at:new Date().toISOString()}])`);
          result.cases = await js(`([...window.__chat.el.querySelectorAll('.cp-thread-card')].map(c=>({inline:c.classList.contains('cp-thread-card-inline'),disabled:c.disabled,overflow:c.scrollWidth>c.clientWidth+1,title:c.title})))`);
          if (result.cases.length !== 6 || result.cases[0].inline || result.cases.slice(1).some(c => !c.inline || c.overflow) || !result.cases[5].disabled) throw Error('Reference context or unavailable state failed');
          result.narrow = await js(`(()=>{const t=window.__chat.el.querySelector('.cp-text');t.style.width='240px';return [...t.querySelectorAll('.cp-thread-card')].every(c=>c.scrollWidth<=c.clientWidth+1&&c.getBoundingClientRect().right<=t.getBoundingClientRect().right+1)})()`);
          if (!result.narrow) throw Error('A reference overflowed the narrow chat');
          wc.debugger.attach('1.3');
          await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
          result.reduced = await js(`getComputedStyle(window.__chat.el.querySelector('.cp-thread-card-inline')).transitionDuration`);
          wc.debugger.detach();
          if (result.reduced !== '0s') throw Error('Reduced motion left a reference transition active');
          await js(`(()=>{const c=window.__chat.el.querySelector('.cp-thread-card-inline:not(:disabled)');c.focus()})()`);
          result.focus = await js(`({card:document.activeElement.classList.contains('cp-thread-card-inline'),outline:getComputedStyle(document.activeElement).outlineStyle})`);
          win.focus(); wc.focus();
          wc.sendInputEvent({type:'keyDown',keyCode:'Enter'}); wc.sendInputEvent({type:'char',keyCode:'\r'}); wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});
          await wait(800);
          result.navigation = await js(`window.__chat.threadId`);
          if (result.navigation !== 'mcp:f0a2c661-9687-4a33-837f-7921c8591307') throw Error('Keyboard navigation opened the wrong thread');
        }
      } catch (error) { result.error = error.stack; process.exitCode = 1; fs.writeFileSync(path.join(out, 'failed.png'), (await wc.capturePage()).toPNG()); }
      finally {
        fs.writeFileSync(path.join(out, before ? 'before.json' : 'after.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result)); app.quit();
      }
    });
  });
  require('../../electron/main.cjs');
}
