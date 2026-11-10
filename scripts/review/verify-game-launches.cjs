const fs = require('node:fs');
const path = require('node:path');
if (!process.versions.electron) {
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'lucid-game-launches-'));
  const env = {...process.env,LUCID_SHOT:out,LUCID_SHOT_PROFILE:path.join(out,'profile'),LUCID_SHOT_EVERY:'3600000'};
  delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,out],{env,stdio:'inherit'}).on('exit',c=>process.exit(c??1));
} else {
  const {app,ipcMain}=require('electron'), out=process.argv[2];
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
    const wc=win.webContents, js=s=>wc.executeJavaScript(s);
    try {
      await wait(3500);
      const results=await js(`(async()=>{
        const d=window.__world.desks.get('launch-check'),wm=d.wm,idle=d.director.idleLife,checks=[];
        const assert=(ok,m)=>{if(!ok)throw Error(m);checks.push(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));
        let Cancelled;try{wm.check(wm.epoch-1)}catch(e){Cancelled=e.constructor}
        window.__launchDesk=d;window.__launchQueries=[];window.__launchResults=[];
        wm.speed=15;wm.prefs={...wm.prefs,launch:'spotlight',windows:'floating',hobby:'chiller'};
        const launch=wm.launch.bind(wm);
        wm.launch=async id=>{
          const promise=launch(id);
          const sample=setInterval(()=>{const q=wm.root.querySelector('.l-q'),r=wm.root.querySelector('.l-result:not([hidden]) > span');if(q)window.__launchQueries.push(q.textContent);if(r)window.__launchResults.push(r.textContent)},1);
          try{return await promise}finally{clearInterval(sample)}
        };
        for(const [key,title] of [['snake','Snake'],['blockcraft','Voxel Valley'],['nightshift','Uptime Till Dawn'],['chess','Chess']]){
          wm.reset();idle.token++;idle.active=true;window.__launchQueries=[];window.__launchResults=[];
          const run=idle.doActivity(key,idle.token).catch(e=>{if(!(e instanceof Cancelled))throw e});
          for(let i=0;i<200;i++){if(wm.wins.get('game')?.body.children.length)break;await wait(15)}
          const game=wm.wins.get('game');
          assert(game?.title.textContent===title && game.body.children.length>0,title+' opens its actual game content');
          assert(window.__launchQueries.includes(title.toLowerCase()) && !window.__launchQueries.includes('games'),title+' is searched by name');
          assert(window.__launchResults.includes(title),title+' is the selected launcher result');
          assert(wm.dock.querySelector('[data-app="game"]').title===title,title+' has a matching dock label');
          idle.stop();await run;await wait(100);
        }
        // The same path used after Vapor's Play click must not search/click a second time.
        wm.reset();wm.speed=15;idle.token++;idle.active=true;window.__launchQueries=[];
        const run=idle.doActivity('blockcraft',idle.token,true).catch(e=>{if(!(e instanceof Cancelled))throw e});
        for(let i=0;i<100;i++){if(wm.wins.get('game')?.body.children.length)break;await wait(15)}
        assert(wm.wins.get('game')?.title.textContent==='Voxel Valley' && window.__launchQueries.length===0,'Vapor Play opens the chosen game directly without another search');
        idle.stop();await run;await wait(100);
        wm.reset();wm.speed=1;wm.prefs={...wm.prefs,hobby:'gamer',launch:'dock'};
        window.__launchQueries=[];
        const long=wm.open('game','Rustwater Bay').catch(e=>{if(!(e instanceof Cancelled))throw e});
        await wait(180);wm.reset();await long;await wait(250);
        assert(!wm.isOpen('game') && !wm.root.querySelector('.launcher'),'interrupted search leaves no game or stale launcher');
        window.__world.focusScreen(d);await wait(1100);
        wm.speed=2;window.__launchQueries=[];
        const shot=wm.open('game','Uptime Till Dawn');
        window.__shotOpen=shot;
        for(let i=0;i<200;i++){if(wm.root.querySelector('.l-result:not([hidden])'))break;await wait(10)}
        return checks;
      })()`);
      fs.writeFileSync(path.join(out,'game-search.png'),(await wc.capturePage()).toPNG());
      await js('(async()=>{await window.__shotOpen;return true})()');
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks:results},null,2));
      console.log(JSON.stringify({out,checks:results}));app.exit(0);
    }catch(e){fs.writeFileSync(path.join(out,'failure.png'),(await wc.capturePage()).toPNG());console.error(out,e);app.exit(1);}
  }));
  require('../../electron/main.cjs');
  ipcMain.removeHandler('t3:world');ipcMain.handle('t3:world',()=>({projects:[{id:'launch-project',title:'Launch checks',root:'C:/launch-check',scratch:false}],threads:[{id:'launch-check',projectId:'launch-project',title:'Game launch check',provider:'codex',runStatus:'running',updatedAt:new Date().toISOString(),question:null,settled:false}]}));
  ipcMain.removeHandler('t3:watch-set');ipcMain.handle('t3:watch-set',()=>true);
}
