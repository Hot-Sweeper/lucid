// Isolated native component acceptance. Actual update handlers, menus, CSS,
// command runner and TypeScript validation, with no production IPC or profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const excerpt=file=>{const text=fs.readFileSync(file,'utf8'),start=text.indexOf('let updateState:'),end=text.indexOf('const attachDir =',start);assert(start>=0&&end>start);return text.slice(start,end)};
async function prepare(out,baseline){
  const fixture=path.join(out,'installed-fixture'),generated=path.join(out,'generated'),template=path.join(out,'template');
  for(const dir of [fixture,generated,template])fs.mkdirSync(dir,{recursive:true});
  const before=excerpt(path.join(baseline,'src/main.ts')),after=excerpt(path.join(root,'src/main.ts'));
  const imports=[['showMenu,closeMenu',path.join(root,'src/office/menus.ts')]];
  const code=imports.map(([what,file])=>`import {${what}} from ${JSON.stringify(file.replaceAll('\\','/'))};`).join('\n')+'\n'+
    [path.join(root,'src/styles.css'),path.join(root,'src/office/office.css'),path.join(root,'node_modules/@fontsource-variable/lexend/index.css')].map(file=>`import ${JSON.stringify(file.replaceAll('\\','/'))};`).join('\n')+`\n
    const api=window.review,companionClient=()=>false,$=id=>document.getElementById(id);
    function before(){${before};return checkUpdate}
    function after(){${after};return checkUpdate}
    window.checkReview=(api.mode==='before'?before:after)();
    document.getElementById('notes').value=localStorage.getItem('review-draft')||'';
    document.getElementById('notes').addEventListener('input',e=>localStorage.setItem('review-draft',e.target.value));
    document.getElementById('open-notes').addEventListener('click',()=>{const p=document.getElementById('note-panel');p.hidden=!p.hidden;if(!p.hidden)document.getElementById('notes').focus()});
    window.checkReview().then(()=>window.reviewReady=true);`;
  const entry=path.join(generated,'feedback.ts');fs.writeFileSync(entry,code);
  const vite=await import(require('node:url').pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')).href);
  await vite.build({configFile:false,root:generated,base:'./',logLevel:'error',build:{outDir:path.join(template,'assets'),emptyOutDir:true,lib:{entry,name:'UpdateReview',formats:['iife'],fileName:()=> 'feedback.js',cssFileName:'feedback'},rollupOptions:{output:{inlineDynamicImports:true}}}});
  fs.writeFileSync(path.join(template,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><title>Lucid update review fixture</title><link rel="stylesheet" href="./assets/feedback.css"><style>
    #app{grid-template-columns:400px minmax(0,1fr)}.panel{padding:20px 18px}.review-content{padding:38px;max-width:700px}.review-content h2{font-size:20px}.review-content p{color:var(--ink-2);line-height:1.6}.review-content button{margin:12px 0}.review-content textarea{height:130px}.fixture-note{font-size:13px;color:var(--ink-3)}
    </style></head><body><div id="app"><aside class="panel"><header class="brand"><div class="mark"></div><h1>Lucid</h1><button id="update" class="update">Check updates</button></header><p class="fixture-note">Isolated update review</p></aside><main class="review-content"><h2>Installed review app</h2><p>This local fixture uses Lucid's actual update controls and menu styling. Its installed files and saved note must remain usable when an update fails.</p><button class="primary" id="open-notes">Open notes</button><section id="note-panel" hidden><h3>Local note</h3><textarea id="notes" aria-label="Local note" placeholder="Write a note"></textarea></section></main></div><script src="./assets/feedback.js"></script></body></html>`);
  fs.cpSync(template,path.join(fixture,'dist'),{recursive:true});fs.mkdirSync(path.join(fixture,'src'),{recursive:true});
  fs.writeFileSync(path.join(fixture,'src/app.ts'),'const value: string = "installed";');
  fs.writeFileSync(path.join(fixture,'tsconfig.json'),JSON.stringify({compilerOptions:{noEmit:true,strict:true,skipLibCheck:true,types:[]},include:['src/**/*.ts']}));
  fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'lucid-update-native-fixture',version:'1.0.0',private:true,scripts:{typecheck:`node "${path.join(root,'node_modules/typescript/bin/tsc')}" -p .`,build:'node scripts/build.cjs'}}));
  fs.mkdirSync(path.join(fixture,'scripts'),{recursive:true});
  fs.writeFileSync(path.join(fixture,'scripts/build.cjs'),`const fs=require('node:fs'),path=require('node:path');const target=path.join(process.cwd(),'dist-update');fs.cpSync(${JSON.stringify(template)},target,{recursive:true});fs.writeFileSync(path.join(target,'lucid-build.json'),JSON.stringify({files:require(${JSON.stringify(path.join(root,'electron/build-state.cjs'))}).snapshot(process.cwd())}));`);
  fs.writeFileSync(path.join(fixture,'dist/lucid-build.json'),JSON.stringify({files:require('../electron/build-state.cjs').snapshot(fixture)}));
  fs.writeFileSync(path.join(generated,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('review',{mode:ipcRenderer.sendSync('review:mode'),checkUpdate:()=>ipcRenderer.invoke('review:check'),applyUpdate:()=>ipcRenderer.invoke('review:apply'),onUpdateStep:fn=>{const f=(_e,s)=>fn(s);ipcRenderer.on('review:step',f);return()=>ipcRenderer.removeListener('review:step',f)}});`);
  const files=['src/main.ts','src/office/menus.ts','src/office/office.css','src/styles.css','electron/updater.cjs','electron/update-errors.cjs','electron/update-command.cjs','electron/installation.cjs','electron/frozen-input.cjs','scripts/verify-update-feedback-native.cjs'];
  fs.writeFileSync(path.join(out,'tested-source.json'),JSON.stringify({fixture:true,baseline,baselineExcerptSha256:hash(before),afterExcerptSha256:hash(after),sources:Object.fromEntries(files.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))])),bundleSha256:hash(fs.readFileSync(path.join(template,'assets/feedback.js')))},null,2));
}
async function native(out){
  const {app,BrowserWindow,ipcMain,session,clipboard}=require('electron');
  const fixture=path.join(out,'installed-fixture'),profile=path.join(out,'profile');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
  let mode='before',lastFailure=null,promotions=0;const checks=[],captures=[],steps=[];
  const {createUpdater}=require('../electron/updater.cjs'),{snapshot,changed}=require('../electron/build-state.cjs'),{hasInstalledBuild}=require('../electron/installation.cjs');
  let updater=createUpdater(fixture);const tree=dir=>{const result={};function visit(part){for(const e of fs.readdirSync(path.join(dir,part),{withFileTypes:true})){const n=path.posix.join(part,e.name);if(e.isDirectory())visit(n);else result[n]=hash(fs.readFileSync(path.join(dir,n)))}}visit('');return result};
  const installedBefore=tree(path.join(fixture,'dist'));fs.writeFileSync(path.join(fixture,'src/app.ts'),'const value: string = 42;');
  ipcMain.on('review:mode',event=>event.returnValue=mode);
  ipcMain.handle('review:check',()=>updater.check({localOnly:true}));
  ipcMain.handle('review:apply',async event=>{try{const result=await updater.apply(step=>{steps.push(step);event.sender.send('review:step',step)},{localOnly:true});if(result.updated)promotions++;return {ok:true}}catch(error){lastFailure=error;return mode==='before'?{ok:false,error:error.message}:require('../electron/update-errors.cjs').updateFailure(error,hasInstalledBuild(fixture))}});
  await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((details,done)=>done({cancel:!['file:','data:','devtools:'].some(prefix=>details.url.startsWith(prefix))}));
  const win=new BrowserWindow({width:1180,height:660,show:false,webPreferences:{preload:path.join(out,'generated/preload.cjs'),contextIsolation:true,sandbox:false,backgroundThrottling:false,offscreen:true}});
  const wc=win.webContents,ev=code=>wc.executeJavaScript(code,true),deadline=setTimeout(()=>{console.error('Native update review deadline');app.exit(2)},90000);
  const report={at:new Date().toISOString(),fixture:true,productionTouched:false,checks,captures,steps,notes:'Actual update component and native Electron page with real TypeScript failure, private installation and real updater. Does not claim full-office performance.'};
  const check=(name,ok,detail)=>{checks.push({name,ok,detail});assert(ok,name+': '+JSON.stringify(detail))};
  const until=async(expr,label)=>{const start=Date.now();while(Date.now()-start<20000){if(await ev(expr))return;await wait(30)}throw Error('Timed out: '+label)};
  const click=async selector=>{const point=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);wc.focus();wc.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});};
  const capture=async name=>{await wait(300);const file=path.join(out,name+'.png');fs.writeFileSync(file,(await wc.capturePage()).toPNG());captures.push({name,file,sha256:hash(fs.readFileSync(file))});};
  const reload=async()=>{await win.loadFile(path.join(fixture,'dist/index.html'));await until('window.reviewReady','fixture ready')};
  let restoreClipboard=null;
  try{
    await reload();await click('#update');await until('!document.querySelector("#update").disabled&&!!document.querySelector(".pop-menu")','baseline failure');
    check('Real baseline compiler failure',/TS2322/.test(lastFailure.message));await capture('before-validation-failure');
    assert.deepEqual(tree(path.join(fixture,'dist')),installedBefore);
    mode='after';await reload();await click('#update');await until('document.querySelector("#update").textContent==="Changes not ready"','concise failure');
    const message=await ev(`(()=>{const p=document.querySelector('.pm-title'),m=p.parentElement,r=m.getBoundingClientRect();return {text:p.textContent,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,whiteSpace:getComputedStyle(p).whiteSpace,within:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,focus:document.activeElement?.textContent}})()`);
    check('Concise complete recovery message visible',message.text.includes('installed version is still available')&&message.whiteSpace==='normal'&&message.scrollHeight===message.clientHeight&&message.within,message);
    check('Copy diagnostics receives keyboard focus',message.focus==='Copy error details');await capture('after-validation-failure');
    const {ClipboardItem}=require('electron');
    const old=await Promise.all((await clipboard.read()).map(async item=>new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type=>[type,await item.getType(type)]))))));
    restoreClipboard=()=>clipboard.write(old);
    wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});report.offscreenFocusEmulated=true;
    await ev(`{const write=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async text=>{window.clipboardAttempt={focused:document.hasFocus()};try{await write(text);window.clipboardAttempt.done=true}catch(e){window.clipboardAttempt.error=e.message;throw e}}} void 0`);
    await click('.pop-menu > button');
    await wait(400);const copied=await clipboard.readText(),normalize=text=>text.replace(/\r\n/g,'\n');check('Native clipboard preserves the complete diagnostic with Windows line endings',normalize(copied)===normalize(lastFailure.message),{bytes:Buffer.byteLength(copied),sha256:hash(copied),normalizedSha256:hash(normalize(copied)),expectedNormalizedSha256:hash(normalize(lastFailure.message)),attempt:await ev('window.clipboardAttempt'),focused:await ev('document.hasFocus()')});
    await restoreClipboard();restoreClipboard=null;
    check('Installed files unchanged after validation failure',changed(installedBefore,tree(path.join(fixture,'dist'))).length===0);
    await click('#open-notes');await until('!document.querySelector("#note-panel").hidden','installed notes open');wc.insertText('This draft survives a failed update.');
    await until('document.querySelector("#notes").value==="This draft survives a failed update."','native input after failure');check('Installed app accepts native clicks and text after failure',true);await capture('after-failure-installed-app-usable');
    fs.writeFileSync(path.join(fixture,'src/app.ts'),'const value: string = "corrected update";');
    await click('#update');await until('document.querySelector("#update").textContent==="Check updates"&&!document.querySelector("#update").disabled','successful retry');
    check('Corrected source installed on retry',promotions===1&&hasInstalledBuild(fixture));assert.deepEqual(tree(path.join(fixture,'dist-previous')),installedBefore);
    check('Rollback copy is byte identical',true);check('Installed manifest matches corrected source',changed(JSON.parse(fs.readFileSync(path.join(fixture,'dist/lucid-build.json'))).files,snapshot(fixture)).length===0);
    // A normal successful update restarts Electron and constructs a fresh
    // updater baseline. Model that lifecycle inside this isolated fixture.
    updater=createUpdater(fixture);
    await reload();await click('#open-notes');check('New installed app reopens and preserves draft',await ev('document.querySelector("#notes").value==="This draft survives a failed update."'));check('Reopened updater recognizes the installed version',await ev('document.querySelector("#update").textContent==="Check updates"'));await capture('after-successful-retry');
    const entries=[],listener=(_e,method,params)=>{if(method==='Debugger.scriptParsed')entries.push(params)};wc.debugger.on('message',listener);
    try{await wc.debugger.sendCommand('Debugger.enable');const entry=entries.find(e=>e.url.endsWith('/assets/feedback.js'));assert(entry);const {scriptSource}=await wc.debugger.sendCommand('Debugger.getScriptSource',{scriptId:entry.scriptId});report.executingBundleSha256=hash(scriptSource);check('Executing native component matches tested bundle',report.executingBundleSha256===JSON.parse(fs.readFileSync(path.join(out,'tested-source.json'))).bundleSha256)}finally{wc.debugger.removeListener('message',listener);wc.debugger.detach()}
    report.status='passed';report.promotions=promotions;report.productionRestarted=false;report.externalActions=0;
  }catch(error){report.status='failed';report.error=error.stack;report.lastFailure=lastFailure?.message;await capture('failure').catch(()=>{});throw error}
  finally{await restoreClipboard?.();clearTimeout(deadline);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));win.destroy()}
}
if(require.main===module||process.versions.electron){
 const out=path.resolve(process.argv[2]||'E:/Lucid-validation/update-feedback-native-20261101');
 if(process.versions.electron)native(out).then(()=>require('electron').app.exit(0),error=>{console.error(error);require('electron').app.exit(1)});
 else(async()=>{const baseline=path.resolve(process.argv[3]||path.join(root,'.lucid-update-A4nBiu'));await prepare(out,baseline);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;for(const key of Object.keys(env))if(key.startsWith('LUCID_'))delete env[key];const child=require('node:child_process').spawn(require('electron'),[__filename,out],{env,windowsHide:true,stdio:'inherit'});child.once('exit',code=>{process.exitCode=code||0});child.once('error',error=>{console.error(error);process.exitCode=1})})().catch(error=>{console.error(error);process.exitCode=1});
}
