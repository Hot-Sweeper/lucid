// Isolated native acceptance. Production main/preload/translation IPC are unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(!process.versions.electron){
  const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
  const env={...process.env,LUCID_SHOT:out,LUCID_SHOT_EVERY:'3600000',LUCID_SHOT_PROFILE:process.env.LUCID_SHOT_PROFILE||path.join(out,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,out],{env,stdio:'inherit',windowsHide:true}).on('exit',code=>process.exit(code??1));
}else{
  const {app}=require('electron');
  const out=process.argv[2],root=path.resolve(__dirname,'..'),checks=[],errors=[],commands=[];
  const profile=process.env.LUCID_SHOT_PROFILE;fs.mkdirSync(profile,{recursive:true});
  const actual=path.join(app.getPath('appData'),'lucid');app.setPath('userData',actual);
  try{fs.copyFileSync(path.join(actual,'t3-pairing.bin'),path.join(profile,'t3-pairing.bin'));}catch{}
  const server=require('../electron/t3server.cjs'),providers=server.listProviders,dispatch=server.dispatch,call=server.call;
  let failure=false,closing=false;
  server.listProviders=async(...args)=>{if(failure||closing)throw Error('Injected provider outage for native acceptance');return providers(...args)};
  server.dispatch=async c=>{commands.push({type:c.type,id:c.threadId,model:c.modelSelection,at:new Date().toISOString()});return dispatch(c)};
  server.call=async(tag,payload,...args)=>{if(tag==='orchestration.launchThread')commands.push({type:'thread.create',transport:tag,id:payload.threadId,model:payload.modelSelection,at:new Date().toISOString()});try{return await call(tag,payload,...args)}catch(e){errors.push({transport:tag,error:e.message});throw e}};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);console.log('PASS',label)};
  let owned=false;
  app.on('browser-window-created',(_e,win)=>{
    if(owned)return;owned=true;const wc=win.webContents;
    wc.on('console-message',details=>{if(details.level==='error')errors.push(details.message)});
    wc.once('did-finish-load',async()=>{
      const js=code=>wc.executeJavaScript(code,true);
      const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());
      try{
        wc.debugger.attach('1.3');const scriptEvents=[];wc.debugger.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')scriptEvents.push(p);if(m==='Runtime.exceptionThrown')errors.push(p.exceptionDetails)});await wc.debugger.sendCommand('Runtime.enable');await wc.debugger.sendCommand('Debugger.enable');
        await wait(1500);
        const assets=await js(`({url:location.href,scripts:[...document.scripts].map(s=>s.src),hidden:document.hidden})`);
        fs.writeFileSync(path.join(out,'tested-production-assets.json'),JSON.stringify({assets,scripts:scriptEvents.map(s=>({url:s.url,hash:s.hash})),manifest:JSON.parse(fs.readFileSync(path.join(root,'dist/lucid-build.json'),'utf8'))},null,2));
        await capture('production-before');
        const daily=await js('window.lucid.orchDialogs()');
        const {ipcMain}=require('electron');ipcMain.removeHandler('orch:dialogs');
        const generated={date:new Date().toLocaleDateString('en-CA'),convos:daily?.convos?.slice(0,1)??[['The printer approved my pull request.','Finally, a reviewer who understands paper trails.']],botcord:daily?.botcord?.slice(0,1)??[]};
        ipcMain.handle('orch:dialogs',()=>generated);
        await win.loadFile(path.join(root,'language-review/scripts/language-review.html'));
        if(process.env.LUCID_LANGUAGE_CACHE_ONLY==='1'){
          check(await js(`review.getLocale()==='de'`),'German preference persists across native process restart');
          const saved=await js(`window.lucid.localize({locale:'de',entries:[{id:'restart',text:'The printer learned to make coffee.',context:'native provider recovery'}]})`);
          check(saved.translated&&saved.entries[0].text!=='The printer learned to make coffee.'&&commands.filter(c=>c.type==='thread.create').length===0,'disk translation cache survives native restart without a model launch');
          await capture('native-restart-de');fs.writeFileSync(path.join(out,'native-restart.json'),JSON.stringify({checks,commands,saved},null,2));return;
        }
        if(process.env.LUCID_LANGUAGE_GENERATED_ONLY==='1'){
          const captures={};
          for(const locale of ['en','de']){
            await js(`review.setLocale(${JSON.stringify(locale)});review.loadDaily()`);await js('review.whenTranslationsIdle()');await wait(300);
            captures[locale]=await js(`review.dailyConvo()`);
            check(!!captures[locale]?.length,'generated '+locale+' pack published');
            await js(`document.querySelector('#app-body').style.display='none';document.querySelector('#heading').textContent='Generated dialogue';document.querySelector('#exchange').style.whiteSpace='pre-line';document.querySelector('#exchange').textContent=review.dailyConvo().join(String.fromCharCode(10))`);
            await wait(300);await capture('Generated-'+locale);
          }
          check(JSON.stringify(captures.en)!==JSON.stringify(captures.de),'generated exchange has distinct English and German wording');
          fs.writeFileSync(path.join(out,'generated-captures.json'),JSON.stringify({checks,captures,generated,commands,errors},null,2));return;
        }
        await js(`review.setLocale('en')`);await capture('setting-en');
        // Failure is injected at provider discovery, never by replacing IPC or model output.
        failure=true;
        const failed=await js(`window.lucid.localize({locale:'de',entries:[{id:'recovery',text:'The printer learned to make coffee.',context:'native provider recovery'}]})`);
        check(!failed.translated&&failed.entries[0].text==='The printer learned to make coffee.','real IPC provider failure preserves English');
        failure=false;await wait(31000);
        const recovered=await js(`window.lucid.localize({locale:'de',entries:[{id:'recovery',text:'The printer learned to make coffee.',context:'native provider recovery'}]})`);
        check(recovered.translated&&recovered.entries[0].text!=='The printer learned to make coffee.','real IPC recovers after provider cooldown');
        const helperCount=commands.filter(c=>c.type==='thread.create').length;
        const cached=await js(`window.lucid.localize({locale:'de',entries:[{id:'new-render-id',text:'The printer learned to make coffee.',context:'native provider recovery'}]})`);
        check(cached.entries[0].text===recovered.entries[0].text&&commands.filter(c=>c.type==='thread.create').length===helperCount,'real IPC cache reuses translation with new render ID');
        await js(`review.setLocale('de')`);await wc.reload();await wait(1200);
        check(await js(`review.getLocale()==='de'&&document.querySelector('#game-language').value==='de'`),'German setting persists through renderer reload');
        const result={failed,recovered,cached,generated};
        await js(`review.setLocale('en')`);result.authoredEnglish=await js('review.authored()');
        await js(`review.setLocale('de');review.authored();review.whenTranslationsIdle()`);result.authoredGerman=await js('review.authored()');
        check(result.authoredEnglish.lines[0]!==result.authoredGerman.lines[0]&&result.authoredEnglish.topic===result.authoredGerman.topic,'authored content exchange translates without mutating metadata');
        for(const kind of ['Speech','BotTube','Botcord','BotsApp','Titles','Canvas']){
          await js(`review.setLocale('en');review.show(${JSON.stringify(kind)})`);await wait(1100);await capture(kind+'-en');
          const english=await js(`document.querySelector('#app-body').innerText`);
          const englishSpeech=await js(`document.querySelector('#speech').innerText`);
          if(kind==='Canvas')await js('window.canvasWords=[]');
          await js(`{const s=document.querySelector('#game-language');s.value='de';s.dispatchEvent(new Event('change',{bubbles:true}));}`);
          // Await the real queued translation then allow observers to paint. Bounded wait.
          console.log('Settling German',kind);
          await wait(1000);await js('review.whenTranslationsIdle()');await wait(1000);await js('review.whenTranslationsIdle()');
          const german=await js(`document.querySelector('#app-body').innerText`);
          if(kind==='Speech'){await js('review.speech()');await js('review.whenTranslationsIdle()');}
          if(kind==='Canvas')await js('review.redrawCanvas()');
          await wait(900);await capture(kind+'-de');
          const fit=await js(`({text:document.querySelector('#app-body').innerText,overflow:[...document.querySelectorAll('#app-body button,#app-body .win-title,#app-body p')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>({text:e.innerText,width:e.clientWidth,scroll:e.scrollWidth})),titles:[...document.querySelectorAll('.win-title')].map(e=>e.textContent)})`);
          result[kind]={english,german,fit};
          check(fit.overflow.length===0,kind+' German controls and paragraphs fit their measured width');
          if(['BotTube','Botcord','BotsApp'].includes(kind))check(english!==german,kind+' visible app content changes to German through IPC');
          if(kind==='Speech'){result.speechGerman=await js(`document.querySelector('#speech').innerText`);check(result.speechGerman!==englishSpeech&&/Wolken/i.test(result.speechGerman),'incidental speech reaches German in the real bubble');}
          if(kind==='Canvas'){result.canvasGerman=await js('window.canvasWords');check(result.canvasGerman.join(' ').includes('Repo lesen'),'canvas paints authored German captions');}
          if(kind==='Titles')check(fit.titles.includes('Wetter')&&fit.titles.includes('Rechner'),'runtime explicit app titles switch to German');
          await js(`review.setLocale('en')`);await wait(900);await capture(kind+'-en-restored');
          const restored=await js(`document.querySelector('#app-body').innerText`);
          if(['BotTube','Botcord','BotsApp','Titles'].includes(kind))check(restored.replace(/\d{1,2}:\d{2}/g,'TIME')===english.replace(/\d{1,2}:\d{2}/g,'TIME'),kind+' returns to its original English content');
        }
        await js(`review.setLocale('de');review.loadDaily()`);
        result.daily=await js('review.dailyConvo()');check(!!result.daily?.length,'generated exchange passes real localization pipeline');
        await js(`document.querySelector('#app-body').style.display='none';document.querySelector('#heading').textContent='Generated dialogue';document.querySelector('#exchange').textContent=review.dailyConvo().join(${JSON.stringify('\n')});document.querySelector('#exchange').style.whiteSpace='pre-line'`);await wait(300);await capture('Generated-de');
        await js(`review.setLocale('en');review.loadDaily()`);
        result.dailyEnglish=await js('review.dailyConvo()');check(JSON.stringify(result.dailyEnglish)===JSON.stringify(generated.convos[0]),'generated exchange restores canonical English');
        await js(`document.querySelector('#exchange').textContent=review.dailyConvo().join(${JSON.stringify('\n')})`);await wait(300);await capture('Generated-en');
        await js(`review.setLocale('de');review.whenTranslationsIdle()`);
        fs.writeFileSync(path.join(out,'native-result.json'),JSON.stringify({checks,errors,commands,result},null,2));
        console.log('Native language acceptance complete',out);
      }catch(error){errors.push(String(error.stack||error));fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,commands},null,2));await capture('failure');console.error(error);process.exitCode=1}
      finally{closing=true;for(const c of commands.filter(c=>c.type==='thread.create')){try{await dispatch({type:'thread.stop',threadId:c.id,reason:'Native language acceptance finished'})}catch{}try{await dispatch({type:'thread.archive',threadId:c.id})}catch{}}app.exit(process.exitCode||0)}
    });
  });
  require('../electron/main.cjs');
}
