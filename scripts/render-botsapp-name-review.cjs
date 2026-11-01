const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(!process.versions.electron){
  const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,out],{env,stdio:'inherit',windowsHide:true}).on('exit',code=>process.exit(code??1));
}else{
  const {app,BrowserWindow,ipcMain}=require('electron'),out=process.argv[2],root=path.resolve(__dirname,'..');
  app.setPath('userData',path.join(out,'profile'));
  app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  const dictionary={'Robot Family':'Roboterfamilie','Lunch Crew':'Mittagsrunde','Mom':'Mama','Dad':'Papa','Grandma':'Oma'};
  // No repeated live-model acceptance: deterministic translation input to the real DOM adapter.
  ipcMain.handle('lucid:localize',(_event,input)=>({translated:true,entries:input.entries.map(e=>({id:e.id,text:dictionary[e.text]??e.text}))}));
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],states=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS',label)};
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({width:1480,height:920,x:-4000,y:-4000,skipTaskbar:true,webPreferences:{preload:path.join(root,'electron/preload.cjs'),sandbox:false,contextIsolation:true,backgroundThrottling:false}}),wc=win.webContents;
    wc.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
    const js=code=>wc.executeJavaScript(code,true),capture=async name=>{await wait(200);fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG())};
    const load=async folder=>{await win.loadFile(path.join(root,folder,'scripts/botsapp-name-review.html'));await wait(250);};
    const settle=async()=>{await wait(800);await js('nameReview.whenTranslationsIdle()');await wait(250);};
    const state=async label=>{const s=await js('nameReview.state()');states.push({label,...s});return s;};
    try{
      await load('botsapp-review-before');await js(`nameReview.setLocale('de')`);await settle();
      const before=await state('before German');check(before.header!==before.row,'before fixture reproduces the reported mismatch');await capture('before-de');await js('nameReview.dispose()');
      await load('botsapp-review');let s=await state('initial English');check(s.header===s.row&&s.header==='Robot Family','initial English names match');
      await js(`nameReview.setLocale('de')`);await settle();s=await state('family German');check(s.header===s.row&&s.header==='Roboterfamilie','German family header matches translated row');await capture('after-de');
      await js(`nameReview.open('lunch')`);await settle();s=await state('other conversation German');check(s.header===s.row&&s.header==='Mittagsrunde','opening another conversation preserves German name');await capture('other-conversation-de');
      await js(`nameReview.setLocale('en')`);await settle();s=await state('other conversation English');check(s.header===s.row&&s.header==='Lunch Crew','English restoration keeps the other conversation matched');await capture('other-conversation-en');
      await js(`nameReview.open('family')`);await settle();s=await state('family English restored');check(s.header===s.row&&s.header==='Robot Family','returning to the first conversation restores matching English');await capture('restored-en');
      await js(`nameReview.setLocale('de');nameReview.open('cousin')`);await settle();s=await state('proper name German');check(s.header===s.row&&s.header==='Cousin Rivet','proper names stay unchanged');
      check(states.slice(1).every(s=>!s.overflow),'checked header labels fit');check(errors.length===0,'no captured renderer errors');await js('nameReview.dispose()');
      const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,states,errors,sourceHashes:Object.fromEntries(['src/social/botsapp.ts','src/social/conversation-name.ts','src/localization-dom.ts'].map(p=>[p,hash(p)])),fixtureNote:'Actual BotsApp and localization modules. Test-only class export and deterministic translation IPC. Before build reverts only the header binding. Reuses prior full live acceptance.',productionManifest:path.join(root,'dist/lucid-build.json')},null,2));
    }catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,states,errors,error:e.stack},null,2));console.error(e);process.exitCode=1}
    finally{app.exit(process.exitCode||0)}
  });
}
