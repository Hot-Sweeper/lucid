// Native regression: a stalled review and watch subscription must not gate the
// first office, controls, camera or subsequent real world snapshots.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const out = path.resolve(process.argv[2]);
  fs.mkdirSync(out, {recursive:true});
  const env = {...process.env, LUCID_SHOT:out, LUCID_SHOT_PROFILE:path.join(out,'profile'), LUCID_SHOT_EVERY:'3600000', LUCID_AUTO_SCOPE:'startup-fixture'};
  delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename,out], {env,stdio:'inherit',windowsHide:true})
    .on('exit', code => process.exit(code ?? 1));
} else {
  const {app,ipcMain} = require('electron');
  const out = process.argv[2], started = Date.now(), errors = [];
  app.setPath('temp', out);
  let releaseReports, releaseWatches, reportCalls = 0, watchCalls = 0, worldCalls = 0;
  const reports = new Promise(resolve => {releaseReports = resolve;});
  const watches = new Promise(resolve => {releaseWatches = resolve;});
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  const timeout = setTimeout(() => { console.error('Startup regression timed out'); app.exit(1); },30000);
  app.once('browser-window-created', (_event, win) => {
    win.webContents.on('console-message', (_e, ...args) => {
      const detail = args[0];
      if (detail && typeof detail === 'object' ? detail.level === 'error' : detail === 3) errors.push(typeof detail === 'object' ? detail.message : args[1]);
    });
    win.webContents.once('did-finish-load', async () => {
      try {
        const js = code => win.webContents.executeJavaScript(code);
        await wait(2500);
        const read = () => js(`({rooms:window.__world?.rooms.length,desks:window.__world?.desks.size,threads:window.__world?.lastData?.threads.length,rows:document.querySelectorAll('.th-row').length,volume:!!document.querySelector('.game-volume'),camera:{x:window.__world?.cam.x,y:window.__world?.cam.y,s:window.__world?.cam.s},errors:window.__errs||[],entry:[...document.scripts].map(s=>s.src)})`);
        const blocked = await read();
        blocked.reportCalls = reportCalls; blocked.watchCalls = watchCalls; blocked.worldCalls = worldCalls;
        fs.writeFileSync(path.join(out,'blocked.png'),(await win.webContents.capturePage()).toPNG());
        await wait(3500);
        const refreshed = await read();
        refreshed.reportCalls = reportCalls; refreshed.worldCalls = worldCalls;
        releaseReports([]); releaseWatches(true);
        await wait(1000);
        const recovered = await read();
        const result = {blocked,refreshed,recovered,elapsedMs:Date.now()-started,errors};
        fs.writeFileSync(path.join(out,'startup.json'),JSON.stringify(result,null,2));
        if (process.env.LUCID_EXPECT_BLOCKED === '1') {
          assert.equal(blocked.rooms,0,'Baseline should reproduce blank office');
        } else {
          assert(blocked.rooms > 0 && blocked.desks > 0,'Reports blocked first office');
          assert(blocked.volume && blocked.rows > 0,'Background IPC blocked controls or thread list');
          assert.equal(blocked.reportCalls,1,'Fixture must actually block a report request');
          assert(blocked.watchCalls > 0,'Subscriptions should start without awaiting reviews');
          assert(refreshed.worldCalls > blocked.worldCalls,'Blocked IPC stopped world refresh');
          assert.equal(refreshed.reportCalls,1,'Report requests overlap');
          assert.equal(recovered.errors.length,0,'Renderer exception');
          assert.equal(errors.length,0,'Console errors');
        }
        console.log(JSON.stringify(result)); clearTimeout(timeout); app.exit(0);
      } catch (error) {console.error(error);app.exit(1);}
    });
  });
  require('../electron/main.cjs');
  const handle = (channel,fn) => {ipcMain.removeHandler(channel);ipcMain.handle(channel,fn);};
  ipcMain.removeAllListeners('settings:load');
  ipcMain.on('settings:load', event => {event.returnValue=JSON.stringify({orch:{threadId:'fixture-boss',projectId:'fixture',dir:'',paused:true,review:false,seenUntil:'',lastSentAt:0,learned:0,reviewed:{}}});});
  ipcMain.removeAllListeners('roster:load'); ipcMain.on('roster:load',event=>{event.returnValue='[]';});
  handle('t3:world',()=>{worldCalls++;return {projects:[{id:'fixture',title:'Startup check',root:'C:/fixture',scratch:false}],threads:[{id:'fixture-worker',projectId:'fixture',title:'Responsive worker',updatedAt:new Date().toISOString(),provider:'codex',runStatus:'running',pinned:false,settled:false,question:null,model:null}]};});
  handle('reports:list',()=>{reportCalls++;return reports;});
  handle('reports:tick',()=>[]); handle('reports:submit',()=>null);
  handle('t3:watch-set',()=>{watchCalls++;return watches;});
  for (const channel of ['t3:tasks','t3:conversation','orch:approval-papers','orch:answers','orch:decisions','t3:user-messages']) handle(channel,()=>[]);
  handle('environment:list',()=>({localId:'local',buildings:[],error:null,connectionState:'no-linked-environments'}));
  const totals = {tokens:0,input:0,output:0,cacheRead:0,cacheWrite:0,costUsd:0,byHarness:{},byModel:{}};
  const usage = {updatedAt:new Date().toISOString(),windows:{today:totals,last5h:totals,week:totals},limits:{},errors:[]};
  handle('usage:get',()=>usage); handle('coins:usage',()=>({usage,sources:[]}));
  handle('weather:get',()=>({weather:null})); handle('app:check-update',()=>({available:false}));
  for (const channel of ['t3:send','t3:start','orch:init']) handle(channel,()=>{throw Error('Real writes forbidden in startup fixture');});
}
