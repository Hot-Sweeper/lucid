// Native controlled layout transition review. No real T3 writes or production restart.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const out=path.resolve(process.argv[2]),build=path.resolve(process.argv[3]),scenario=process.argv[4]||'shrink';
if(!process.versions.electron){
 fs.mkdirSync(out,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 require('node:child_process').spawn(require('electron'),[__filename,out,build,scenario],{env,windowsHide:true,stdio:'inherit'}).on('exit',c=>process.exit(c??1));
}else{
 const {app,BrowserWindow}=require('electron');
 app.setPath('userData',path.join(out,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
 process.env.LUCID_SHOT=out;process.env.LUCID_SHOT_PROFILE=app.getPath('userData');process.env.LUCID_SHOT_EVERY='600000';process.env.LUCID_SHOT_COUNT='100';process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(path.join(build,'index.html')).href;
 const stamp=new Date().toISOString();
 const data={projects:[{id:'layout-project',title:'Layout review',root:out,icon:null,scratch:false}],threads:Array.from({length:12},(_,i)=>({id:'layout-'+i,projectId:'layout-project',title:'Layout robot '+i,provider:i%2?'codex':'claudeAgent',model:null,updatedAt:stamp,runStatus:'running',question:null,pinned:false,settled:false})),models:{},prices:{},shipped:{today:0,total:0}};
 const totals={tokens:0,costUsd:0,byHarness:{},byModel:{},byProject:{}};
 Object.assign(require('../electron/t3.cjs'),{world:()=>structuredClone(data),officeTasks:()=>[],listProjects:()=>data.projects,listThreads:()=>data.threads,listProjectsWithCounts:()=>data.projects,watchThread:()=>()=>{},conversation:()=>[],conversationPage:()=>({messages:[],hasMore:false,cursor:null}),pendingRequests:()=>[],repliesSince:()=>({messages:[],exists:true,runStatus:'running'}),userMessagesSince:()=>[],resolvedRequestsSince:()=>[],itemsSince:()=>[],recentItems:()=>[]});
 Object.assign(require('../electron/t3server.cjs'),{usageLimits:async()=>({providers:[]}),status:async()=>({paired:true}),closeSock:()=>{},dispatch:async()=>{throw Error('External mutation forbidden in fixture')}});
 Object.assign(require('../electron/usage.cjs'),{getSessionUsage:async()=>({available:false,tokens:null,costUsd:null}),getUsage:async()=>({updatedAt:stamp,windows:{today:totals,week:totals,last5h:totals},limits:{},errors:[]})});
 Object.assign(require('../electron/environments.cjs'),{getEnvironments:async()=>({localId:'fixture',buildings:[{id:'fixture',label:'Fixture',local:true}]})});Object.assign(require('../electron/weather.cjs'),{getWeather:async()=>null,lastError:()=>null});

 require('../electron/main.cjs');let win;const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ev=s=>win.webContents.executeJavaScript(s);
 const capture=async name=>{
  await ev(`{const w=__world;w.stopFollow();w.unfocus(false);w.cancelCameraTween();w.frame=null;
   let p=review?.safeAt;if(${JSON.stringify(name)}==='05-destinations'){const r=w.rooms.find(r=>r.id==='break');p={x:r.x+r.w/2,y:r.y+r.h/2}}
   if(p){w.cam={s:.55,x:w.scene.clientWidth/2-p.x*.55,y:w.scene.clientHeight*.57-p.y*.55};w.apply()}}
  `);await wait(350);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 };

 const until=async(expr,label,ms=120000)=>{const start=Date.now();let last=0;while(Date.now()-start<ms){if(await ev(expr))return;if(Date.now()-last>5000){last=Date.now();console.log(label,await ev('({held:window.__world?.physicalLayoutHeld,transit:window.__world?.transit.size,safeHeld:window.review?.safeHeld})'))}await wait(100)}throw Error('Timeout '+label)};
 app.whenReady().then(async()=>{let result={scenario,productionRestart:false,capturedAt:new Date().toISOString(),versions:process.versions,harnessSHA256:hash(fs.readFileSync(__filename))};try{
 await wait(300);win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);
 await until('window.__world?.desks.size===12','ready');
 fs.copyFileSync(__filename,path.join(out,'tested-harness.cjs'));result.loaded=await ev('({url:location.href,scripts:[...document.scripts].map(s=>s.src).filter(Boolean)})');
 result.assets=result.loaded.scripts.map(url=>({url,sha256:hash(fs.readFileSync(require('node:url').fileURLToPath(url)))}));
 const dbg=win.webContents.debugger,parsed=[];dbg.attach('1.3');dbg.on('message',(_e,m,p)=>{if(m==='Debugger.scriptParsed')parsed.push(p)});await dbg.sendCommand('Debugger.enable');await wait(100);
 for(const asset of result.assets){const script=parsed.find(p=>p.url===asset.url);if(!script)throw Error('Loaded entry missing from runtime debugger');const code=await dbg.sendCommand('Debugger.getScriptSource',{scriptId:script.scriptId});asset.executingSHA256=hash(code.scriptSource);if(asset.executingSHA256!==asset.sha256)throw Error('Executing bytes differ from tested build')}
 result.manifest=JSON.parse(fs.readFileSync(path.join(build,'lucid-build.json')));
 await ev(`{
 const w=window.__world;w.stopFollow();w.unfocus(false);w.cancelCameraTween();w.frame=null;
 w.expandedRooms.add('main');w.extra.set('main',${scenario==='height'?12:2});w.update(w.lastData);
 window.review={samples:[],promotions:[],done:[],errors:[],active:true,delayed:true};
 const room=w.rooms.find(r=>r.id==='p:layout-project'),inn=w.door(room)[1];review.initialRooms=w.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h}));
 for(const [i,t] of w.lastData.threads.entries()){
   w.desks.get(t.id)?.setSeated(false);
   const a=w.spawn(t,{x:inn.x-90-i%3*70,y:inn.y+Math.floor(i/3)*65},'up');
   if(i===0){const wrap=a=>{const walk=a.walkPath.bind(a);a.walkPath=async pts=>{if(review.delayed)await (review.gate??=new Promise(r=>review.release=r));if(!review.safeHeld&&w.physicalLayoutHeld){
     const old=w.floorPlan,meeting=w.meetingSpots.get('layout-0'),clear=p=>meeting?.outside?p.x>old.size.w+40:p.x>=40&&p.x<=old.size.w-40&&p.y>=old.topH+40&&p.y<=old.topH+110;
     let start={x:a.x,y:a.y};for(const target of pts){for(let f=.05;f<=1;f+=.05){const p={x:start.x+(target.x-start.x)*f,y:start.y+(target.y-start.y)*f};if(clear(p)&&Math.hypot(p.x-meeting.x,p.y-meeting.y)>20){await walk([p]);review.safeHeld=true;review.safeAt={x:a.x,y:a.y};await new Promise(r=>review.releaseSafe=r);return}}await walk([target]);start=target;}return;
   }return walk(pts)};};wrap(a);const spawn=w.spawn.bind(w);w.spawn=(t,at,face,out)=>{const next=spawn(t,at,face,out);if(t.id==='layout-0')wrap(next);return next};}
   w.roomOf.set(t.id,'park');w.placed.set(t.id,{room:'park'});
   void w.travel(t,{walker:a},'park').then(()=>review.done.push(t.id));
 }
 const original=w.update.bind(w);w.update=d=>{const held=w.physicalLayoutHeld,rev=w.layoutRevision,oldFloor={topH:w.topH,size:{...w.size}},spots=[...w.meetingSpots];original(d);if(held&&!w.physicalLayoutHeld)review.promotions.push({time:performance.now(),rev,oldFloor,newFloor:{topH:w.topH,size:{...w.size}},spots,before:review.samples.at(-1),actors:[...w.transit].map(([id,a])=>({id,x:a.x,y:a.y}))})};
 const sample=()=>{if(!review.active)return;const actors=[...w.transit].map(([id,a])=>({id,x:a.x,y:a.y}));review.layouts??={};review.layouts[w.layoutRevision]??=w.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h}));const counts={};for(const n of document.querySelectorAll('.world-walker[data-id]'))counts[n.dataset.id]=(counts[n.dataset.id]||0)+1;review.samples.push({time:performance.now(),held:w.physicalLayoutHeld,revision:w.layoutRevision,topH:w.topH,width:w.size.w,participants:[...w.layoutParticipants],spots:[...w.meetingSpots],actors,counts});requestAnimationFrame(sample)};requestAnimationFrame(sample);
 w.cam={s:.28,x:40,y:20};w.apply();
 }`);
 await capture('01-before-transition');
 for(const t of data.threads){t.runStatus=null;t.settled=true;}
 await ev(`{const w=window.__world;w.extra.delete('main');w.expandedRooms.delete('main');const d=${JSON.stringify(data)};w.update(d);review.old={topH:w.topH,width:w.size.w};}`);
 await wait(5500);await capture('02-delayed-overlapping');
 result.delayed=await ev('({held:__world.physicalLayoutHeld,promotions:review.promotions.length,actor:review.samples.at(-1).actors.find(a=>a.id==="layout-0"),done:review.done})');
 if(!result.delayed.held||result.delayed.promotions)throw Error('Promoted while delayed actor still overlaps old rooms');
 await ev('review.delayed=false;review.release?.()');
 await until('review.safeHeld','safe checkpoint',120000);
 await until(`(()=>{const w=__world;return [...w.layoutParticipants].every(id=>{const a=w.transit.get(id),m=w.meetingSpots.get(id);return a&&(m?.outside?a.x>w.size.w+40:a.x>=40&&a.x<=w.size.w-40&&a.y>=w.topH+40&&a.y<=w.topH+110)})})()`,'all actors clear',120000);
 await ev('__world.update(__world.lastData)');await wait(300);
 result.safeCheckpoint=await ev('({held:__world.physicalLayoutHeld,at:review.safeAt,spots:[...__world.meetingSpots],promotions:review.promotions.length})');
 await capture('03-safe-before-rendezvous');
 const control=process.env.LUCID_LAYOUT_CONTROL==='1';if(control){await wait(4000);await capture('03-control-still-held');}
 if(control?!result.safeCheckpoint.held:result.safeCheckpoint.held)throw Error('Wrong promotion state at safe checkpoint');
 await ev('review.releaseSafe?.()');
 await until('!__world.physicalLayoutHeld','promotion',120000);await capture('04-after-promotion');
 await until('__world.transit.size===0&&__world.exits.size===0','destinations',120000);await capture('05-destinations');
 result.destinations=await ev('({rooms:[...__world.roomOf],counts:review.samples.at(-1).counts})');result.passed=true;
 }catch(e){result.error=String(e);await capture('failure').catch(()=>{});}finally{
 Object.assign(result,await ev('({done:review?.done,promotions:review?.promotions,samples:review?.samples,layouts:review?.layouts,initialRooms:review?.initialRooms,errors:window.__errs||[],held:__world.physicalLayoutHeld,participants:[...__world.layoutParticipants]})').catch(()=>({})));
 await ev('if(window.review)review.active=false').catch(()=>{});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,error:result.error,done:result.done,held:result.held,promotions:result.promotions?.length}));app.exit(result.passed?0:1);
 }});
}
