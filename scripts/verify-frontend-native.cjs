// Isolated production UI + real Chromium frontend capture, never the live app.
// Run only in a coordinated native slot: node scripts/verify-frontend-native.cjs OUT WORLD_JSON.
const fs=require('node:fs'),path=require('node:path');
if(!process.versions.electron){
  const {spawn}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
}else{
  const assert=require('node:assert/strict'),{app,ipcMain}=require('electron');
  const out=path.resolve(process.argv[2]),worldFile=process.argv[3];fs.mkdirSync(out,{recursive:true});
  process.env.LUCID_SHOT=out;process.env.LUCID_SHOT_PROFILE=path.join(out,'profile');process.env.LUCID_SHOT_EVERY='3600000';
  const fixture=path.join(out,'site');fs.mkdirSync(fixture,{recursive:true});
  const html=version=>`<!doctype html><html><head><title>Frontend ${version}</title><link rel="stylesheet" href="style.css"></head><body><header>Field Notes</header><main><h1>Built while you watch</h1><p>This is a real HTML file rendered by Chromium.</p><button id="cta">${version===1?'Save draft':'Publish page'}</button>${version===2?'<section id="new">A new section appeared from the saved source.</section>':''}</main><script>document.title+=' '+typeof window.require+' '+typeof window.lucid;</script></body></html>`;
  fs.writeFileSync(path.join(fixture,'index.html'),html(1));fs.writeFileSync(path.join(fixture,'style.css'),'body{margin:0;background:#faf6ea;color:#1d4236;font:20px sans-serif}header{background:#1d4236;color:#fff;padding:22px}main{padding:32px}h1{font-size:38px}button{padding:15px 28px;background:#e7b64d;border:0;border-radius:8px;font:inherit}section{margin-top:24px;padding:22px;background:#d6e6dc}');
  let started=false;const wait=ms=>new Promise(r=>setTimeout(r,ms));
  app.on('browser-window-created',(_e,win)=>{
    if(started)return;started=true;
    win.webContents.once('did-finish-load',()=>setTimeout(async()=>{
      const result={captures:[],errors:[]};
      const js=source=>win.webContents.executeJavaScript(source);
      const backend=require('../electron/frontend.cjs');
      try{
        for(let i=0;i<30&&!await js('!!window.__world?.desks.size');i++)await wait(100);
        const first=await backend.frame(win.webContents.id,{id:'native-proof',target:{root:fixture,file:'index.html'},mode:'full'});
        assert.ok(first.ok&&first.image);assert.match(first.title,/undefined undefined$/,'Page has neither Node nor Lucid bridge');
        const action=await backend.frame(win.webContents.id,{id:'native-proof',mode:'full',action:{selector:'#cta'}});
        assert.ok(action.target&&action.pointer,'Real DOM target produces cursor/highlight geometry');
        fs.writeFileSync(path.join(out,'page-before.png'),Buffer.from(first.image.split(',')[1],'base64'));
        await js(`(async()=>{const w=window.__world;w.stopCameraMotion();for(const d of w.desks.values()){d.director.reset();d.wm.speed=100;}window.__liveDesk=[...w.desks.values()].find(d=>d.threadId);await window.__liveDesk.director.browser.frontendFile(${JSON.stringify(path.join(fixture,'index.html'))},${JSON.stringify(fixture)});})()`);
        const center=async scale=>{await js(`(()=>{const w=window.__world,d=window.__liveDesk;w.stopCameraMotion();w.frame=null;w.cam.s=${scale};w.cam.x=w.scene.clientWidth/2-(parseFloat(d.el.style.left)+192)*w.cam.s;w.cam.y=w.scene.clientHeight/2-(parseFloat(d.el.style.top)+80)*w.cam.s;w.apply()})()`);await wait(1100);};
        await center(1.6);
        assert.ok(await js(`!!window.__liveDesk.screen.querySelector('.frontend-frame')?.src`),'Production browser tab receives a real frame');
        await js(`window.__liveDesk.director.browser.frontendAction({selector:'#cta'})`);await wait(400);
        fs.writeFileSync(path.join(out,'monitor-full.png'),(await win.webContents.capturePage()).toPNG());
        fs.writeFileSync(path.join(fixture,'index.html'),html(2));await wait(800);
        const updated=await backend.frame(win.webContents.id,{id:'native-proof',mode:'full',action:{selector:'#new'}});
        assert.match(updated.title,/Frontend 2/);assert.ok(updated.target,'Saved HTML automatically reloads with new real section');
        assert.ok(updated.image);fs.writeFileSync(path.join(out,'page-after.png'),Buffer.from(updated.image.split(',')[1],'base64'));
        for(const [name,scale] of [['lines',1],['shapes',.7],['icon',.3],['restored',1.6]]){
          await center(scale);
          const state=await js(`(()=>{const d=window.__liveDesk,root=d.screen.querySelector('.frontend-view');return {requested:'${name}',tier:d.screen.dataset.screenDetail||'full',sameRoot:window.__frontendRoot?window.__frontendRoot===root:!!(window.__frontendRoot=root),sceneRevision:root?.style.getPropertyValue('--detail-scene-revision'),image:!!root?.querySelector('img')?.src,status:root?.querySelector('.frontend-status')?.hidden};})()`);
          result.captures.push(state);fs.writeFileSync(path.join(out,`monitor-${name}.png`),(await win.webContents.capturePage()).toPNG());
          assert.equal(state.tier,name==='restored'?'full':name);assert.ok(state.sameRoot&&state.image&&state.status);
        }
        const reduced=await backend.frame(win.webContents.id,{id:'native-proof',mode:'shapes',action:{selector:'#cta'}});assert.equal(reduced.image,undefined);assert.ok(reduced.shapes.length);
        await backend.frame(win.webContents.id,{id:'native-proof',close:true});await js('window.__liveDesk.director.browser.reset()');
        result.asset=await js('[...document.scripts].map(s=>s.src)');result.passed=true;
      }catch(error){result.errors.push(error.stack||String(error));result.passed=false;}
      finally{fs.writeFileSync(path.join(out,'native-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1);}
    },2500));
  });
  require('../electron/main.cjs');
  if(worldFile){const recorded=JSON.parse(fs.readFileSync(worldFile,'utf8'));for(const channel of ['t3:world','t3:watch-set','t3:conversation','t3:items-since'])ipcMain.removeHandler(channel);ipcMain.handle('t3:world',()=>recorded.data||recorded);ipcMain.handle('t3:watch-set',()=>true);ipcMain.handle('t3:conversation',()=>[]);ipcMain.handle('t3:items-since',()=>[]);}
  const timeout=setTimeout(()=>{console.error('Native frontend verification timed out');app.exit(1);},45000);timeout.unref();
}
