// Native integration check in an agent workspace, real T3 DB is read-only, settings isolated.
const fs = require('node:fs'), path = require('node:path');
const out = '/tmp/lucid-rich-answers'; fs.mkdirSync(out, { recursive: true });
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app } = require('electron');
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = out + '/profile'; process.env.LUCID_SHOT_EVERY = '3600000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.resolve('dist-build/index.html')).href;
  let seen = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  app.on('browser-window-created', (_, win) => {
    if (seen) return; seen = true;
    win.webContents.once('did-finish-load', async () => {
      const wc = win.webContents;
      wc.on('console-message', (_e, _level, message) => { if (/Refused|blocked|Security|Failed/.test(message)) console.error('RENDERER:', message); });
      const js = code => wc.executeJavaScript(code), result = {};
      try {
        win.setPosition(0,0); win.setFocusable(true); win.show(); win.focus();
        await wait(4000);
        // Open the actual conversation from both reported screenshots.
        await js(`window.__world.onWatchChat('cef24cc9-3ae3-4dee-8e7c-c0c43a829d24')`); await wait(2500);
        result.artifacts = await js(`(()=>{const c=window.__chat;return {thread:c.threadId,frames:[...c.el.querySelectorAll('.cp-artifact iframe')].map(f=>({srcdoc:f.srcdoc,src:f.src,title:f.title,sandbox:f.getAttribute('sandbox'),height:f.clientHeight})),cards:[...c.el.querySelectorAll('.cp-thread-card')].map(b=>({text:b.textContent,disabled:b.disabled,portrait:!!b.querySelector('svg')}))}})()`);
        if (!result.artifacts.frames.some(f => f.src.startsWith('lucid-artifact://visual/') || f.srcdoc.includes('lucid-file://local/%2Ftmp%2Feffort-pixels.png'))) throw Error('Actual html_render images did not reach the answer');
        if (!result.artifacts.cards.some(c => !c.disabled && c.portrait && /Lucid Chat Media/.test(c.text))) throw Error('Actual colon-ID thread reference did not become a robot card');
        await js(`{const f=window.__chat.el.querySelector('.cp-artifact iframe');f.loading='eager';f.scrollIntoView({block:'center'});undefined}`);
        await wait(1500); fs.writeFileSync(out + '/actual-answer.png', (await wc.capturePage()).toPNG());
        // Verify image loads inside the isolated artifact with DevTools frame contexts.
        result.visualApi = await js(`window.lucid.answerVisual('<html><body><button onclick="this.textContent=42">Test</button></body></html>').then(url=>url,error=>String(error))`);
        result.images = [];
        result.frameStatus = await js(`[...window.__chat.el.querySelectorAll(".cp-artifact iframe")].map(f=>({src:f.src,doc:f.srcdoc.length,loading:f.loading}))`);
        result.frameUrls = wc.mainFrame.framesInSubtree.map(f => f.url);
        for (const frame of wc.mainFrame.framesInSubtree) if (frame.url.startsWith('lucid-artifact:') || frame.url.includes('srcdoc')) {
          result.images.push(...await frame.executeJavaScript('([...document.images].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})))'));
        }
        if (!result.images.length || result.images.some(i => !i.loaded)) throw Error('Recovered artifact media failed to load: ' + JSON.stringify(result.images));
        await js(`{const card=[...window.__chat.el.querySelectorAll('.cp-thread-card:not(:disabled)')].find(b=>b.getClientRects().length)||window.__chat.el.querySelector('.cp-thread-card:not(:disabled)');if(card.closest('details'))card.closest('details').open=true;card.scrollIntoView({block:'center'});card.focus();undefined}`);
        await wait(200);fs.writeFileSync(out+'/thread-card.png',(await wc.capturePage()).toPNG());
        result.keyFocus=await js(`({tag:document.activeElement.tagName,card:document.activeElement.classList.contains('cp-thread-card')})`);wc.sendInputEvent({type:'keyDown',keyCode:'Enter'});wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(1000);
        result.navigation = await js(`window.__chat.threadId`);
        if (result.navigation !== 'mcp:launch:d86e4a6d134ebf15de52d9a95c14e4b73059359efff25cf1f56b3a777d3381ca') throw Error('Thread card navigated to wrong thread');
        const modeId = await js(`(()=>{
          const w=window.__world, data=w.lastData, t=data.threads.find(t=>t.id==='mcp:launch:d86e4a6d134ebf15de52d9a95c14e4b73059359efff25cf1f56b3a777d3381ca' && w.desks.has(t.id)) || data.threads.find(t=>t.runStatus==='running' && w.desks.has(t.id));
          if(!t)throw Error('No desk for mode integration');
          const d=w.desks.get(t.id); d.el.classList.remove('arriving');w.focusOn(d);window.__chat.setCollapsed(true);
          window.__modeTest={w,t,d,original:w.update,mode:{ultra:false,fast:false}};
          w.update=function(data){return window.__modeTest.original.call(this,{...data,threads:data.threads.map(x=>x.id===t.id?{...x,...window.__modeTest.mode}:x)})};
          return t.id;
        })()`);
        result.modes={id:modeId,states:[]};
        for(const [ultra,fast,name] of [[false,false,'normal'],[true,false,'ultra'],[false,true,'fast'],[true,true,'combined']]) {
          await js(`{const q=window.__modeTest;q.mode={ultra:${ultra},fast:${fast}};q.w.update(q.w.lastData);q.d=q.w.desks.get(q.t.id);q.d.el.classList.remove('arriving');undefined}`);await wait(1400);
          result.modes.states.push(await js(`(()=>{const p=window.__modeTest.d.power,a=p.ctx.getImageData(0,0,64,80).data;return {ultra:${ultra},fast:${fast},pixels:[...a].filter((_,i)=>i%4===3&&a[i]>0).length,mask:p.mask?.reduce((a,b)=>a+b,0),signature:p.signature,connected:p.host.isConnected,tick:p.fireTick,hidden:document.hidden,rect:p.host.getBoundingClientRect().toJSON()}})()`));
          fs.writeFileSync(out+'/robot-'+name+'.png',(await wc.capturePage()).toPNG());
          if(name==='ultra')for(let i=0;i<12;i++){await wait(120);fs.writeFileSync(out+'/flame-'+String(i).padStart(2,'0')+'.png',(await wc.capturePage()).toPNG())}
        }
        if(result.modes.states.some(s=>(s.ultra||s.fast)&&!s.pixels)||result.modes.states.at(-1).signature!=='true:true')throw Error('Mode effect did not render or coexist');
        result.walking=await js(`(async()=>{
          const q=window.__modeTest,w=q.w,d=q.d;
          const actor=w.spawn(q.t,{x:parseFloat(d.el.style.left)+320,y:parseFloat(d.el.style.top)+360},'down',false);
          actor.shortcutView=null;actor.setRunning(false);
          const p={x:actor.x,y:actor.y};
          const measure=async fast=>{q.mode={ultra:true,fast};w.update(w.lastData);actor.setPos(p.x,p.y);actor.v=0;void actor.walkTo(p.x+600,p.y);await new Promise(r=>setTimeout(r,700));const distance=actor.x-p.x;actor.stop();return distance};
          const normal=await measure(false), fast=await measure(true);
          actor.setPos(p.x,p.y);await new Promise(r=>setTimeout(r,700));
          window.__testActor=actor;
          return {normal,fast,pixels:actor.power.ctx.getImageData(0,0,64,80).data.filter((v,i)=>i%4===3&&v>0).length,mask:actor.power.mask?.reduce((a,b)=>a+b,0)};
        })()`);
        fs.writeFileSync(out+'/robot-walking.png',(await wc.capturePage()).toPNG());
        if(result.walking.fast<result.walking.normal*1.2||!result.walking.mask)throw Error('Fast movement or walking silhouette failed');
        await js(`{window.__testActor.destroy();window.__modeTest.w.transit.delete(window.__modeTest.t.id);undefined}`);
        wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(300);
        result.reduced=await js(`(()=>{const p=window.__modeTest.d.power;return {matches:matchMedia("(prefers-reduced-motion: reduce)").matches,tick:p.last,pixels:p.ctx.getImageData(0,0,64,80).data.filter((v,i)=>i%4===3&&v>0).length}})()`);
        if(!result.reduced.matches||result.reduced.tick>0||!result.reduced.pixels)throw Error('Reduced motion should retain a still mode cue');
        wc.debugger.detach();
        // Real files through the production Markdown renderer, protocol, media decoders and save handler.
        fs.writeFileSync(out+'/download-source.txt','Lucid answer download, exact bytes.');
        const text='![Video](/tmp/claude-ultracode.mp4)\n\n[Audio](/home/spacestation/Applications/lucid/src/assets/audio/first-coffee.mp3)\n\n[File]('+out+'/download-source.txt)';
        await js(`{const c=window.__chat;c.setCollapsed(false);c.renderHistory([{id:'media-check',role:'assistant',text:${JSON.stringify(text)},at:new Date().toISOString(),streaming:false,attachments:[]}]);undefined}`);
        await wait(1500);
        result.media=await js(`(async()=>{const list=[...window.__chat.el.querySelectorAll('audio,video')];const result=[];for(const m of list){await m.play();await new Promise(r=>setTimeout(r,150));result.push({tag:m.tagName,duration:m.duration,played:m.currentTime>0});m.pause()}return result})()`);
        if(result.media.length!==2||result.media.some(m=>!m.played))throw Error('Inline playback failed');
        const {dialog}=require('electron'), originalSave=dialog.showSaveDialog;
        dialog.showSaveDialog=async()=>({canceled:false,filePath:out+'/download-saved.txt'});
        try {await js(`window.lucid.downloadAnswer('lucid-file://local/'+encodeURIComponent(${JSON.stringify(out+'/download-source.txt')}),'download-source.txt')`)}finally{dialog.showSaveDialog=originalSave}
        if(fs.readFileSync(out+'/download-source.txt','utf8')!==fs.readFileSync(out+'/download-saved.txt','utf8'))throw Error('Download bytes differ');
        result.download=true;
        result.passed = true;
      } catch(error) { result.error = error.stack; process.exitCode = 1; }
      finally { fs.writeFileSync(out + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); app.quit(); }
    });
  });
  require('../../electron/main.cjs');
}
