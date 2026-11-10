const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const out=path.resolve(process.argv[2]||'docs/evidence/question-departure-2026-10-31');
if(!process.versions.electron){(async()=>{
 fs.mkdirSync(out,{recursive:true});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lucid-departure-'));
 const source=fs.readFileSync('src/world/queue.ts','utf8');
 const before=source.replaceAll('\r\n','\n').replace('if (q.alive && !ids.has(q.id))','if (!ids.has(q.id))').replace(/        if \(!q.alive\) \{[\s\S]*?q.here = false;\r?\n        \}\r?\n/,'').replace('const version = ++q.version; q.w.stop();','q.version++; q.w.stop();').replaceAll('    if (q.alive || q.version !== version) return;\n','').replace('    q.w.calm();\n    q.w.face("down");','    this.line = this.line.filter((x) => x !== q);\n    q.w.calm();\n    q.w.face("down");').replace('    this.line = this.line.filter((x) => x !== q);\n    q.w.destroy();','    q.w.destroy();');
 if(before===source||before.includes('q.version !== version) return;\n    const side')||before.includes('const version = ++q.version; q.w.stop();'))throw Error('control reversal failed');
 fs.writeFileSync(path.join(out,'control-queue.ts'),before);fs.writeFileSync(path.join(out,'corrected-queue.ts'),source);
 const beforeDir=path.join(temp,'control'),afterDir=path.join(temp,'corrected');
 await (await import('vite')).build({logLevel:'error',plugins:[{name:'pre-fix-control',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/world/queue.ts'))return before;}}],build:{outDir:beforeDir}});
 fs.cpSync('dist',afterDir,{recursive:true});
 fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify({created:new Date().toISOString(),control:'Current source with only previous queue fix reversed in Vite transform. Reconstructed control, not historical footage.',queueHashes:{control:hash(before),corrected:hash(source)},correctedManifest:JSON.parse(fs.readFileSync(path.join(afterDir,'lucid-build.json'))),builds:{control:beforeDir,corrected:afterDir}},null,2));
 for(const [mode,build] of [['control',beforeDir],['corrected',afterDir]])await new Promise((resolve,reject)=>{const env={...process.env,DEPARTURE_BUILD:build,DEPARTURE_MODE:mode};delete env.ELECTRON_RUN_AS_NODE;require('node:child_process').spawn(require('electron'),[__filename,out],{env,windowsHide:true,stdio:'inherit'}).on('exit',c=>c?reject(Error(mode+' exit '+c)):resolve());});
})().catch(e=>{console.error(e);process.exitCode=1});}else{
 const {app,BrowserWindow}=require('electron'),mode=process.env.DEPARTURE_MODE,build=process.env.DEPARTURE_BUILD;
 const dir=path.join(out,mode);fs.mkdirSync(dir,{recursive:true});app.setPath('userData',path.join(dir,'profile'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
 app.commandLine.appendSwitch('disable-renderer-backgrounding');app.commandLine.appendSwitch('disable-background-timer-throttling');app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
 process.env.LUCID_SHOT=dir;process.env.LUCID_SHOT_PROFILE=app.getPath('userData');process.env.LUCID_SHOT_EVERY='600000';process.env.LUCID_SHOT_COUNT='100';process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(path.join(build,'index.html')).href;
 const stamp=new Date().toISOString(),worker={id:'departure-worker',projectId:'departure-project',title:'Departure regression fixture',provider:'codex',model:'Fixture',updatedAt:stamp,runStatus:'running',question:'Check departure routing?',pinned:false,settled:false};
 const data={projects:[{id:worker.projectId,title:'Departure fixture',root:dir,icon:null,scratch:false}],threads:[worker],models:{},prices:{},shipped:{today:0,total:0}};
 const totals={tokens:0,costUsd:0,byHarness:{},byModel:{},byProject:{}};
 Object.assign(require('../../electron/t3.cjs'),{world:()=>structuredClone(data),listProjects:()=>data.projects,listThreads:()=>data.threads,listProjectsWithCounts:()=>data.projects,watchThread:()=>()=>{},conversation:()=>[],conversationPage:()=>({messages:[],hasMore:false,cursor:null}),pendingRequests:()=>[],repliesSince:()=>({messages:[],exists:true,runStatus:'running'}),userMessagesSince:()=>[],resolvedRequestsSince:()=>[],itemsSince:()=>[],recentItems:()=>[]});
 Object.assign(require('../../electron/t3server.cjs'),{usageLimits:async()=>({providers:[]}),status:async()=>({paired:true}),closeSock:()=>{},dispatch:async()=>{throw Error('External mutation forbidden in fixture')}});
 Object.assign(require('../../electron/usage.cjs'),{getSessionUsage:async()=>({available:false,tokens:null,costUsd:null}),getUsage:async()=>({updatedAt:stamp,windows:{today:totals,week:totals,last5h:totals},limits:{},errors:[]})});
 Object.assign(require('../../electron/environments.cjs'),{getEnvironments:async()=>({localId:'fixture',buildings:[{id:'fixture',label:'Fixture',local:true}]})});Object.assign(require('../../electron/weather.cjs'),{getWeather:async()=>null,lastError:()=>null});
 require('../../electron/main.cjs');let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),ev=s=>win.webContents.executeJavaScript(s),captures=[];
 const capture=async name=>{const file=path.join(dir,name+'.png');fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());captures.push(file)};
 const until=async(expr,label,ms=25000)=>{const start=Date.now();while(Date.now()-start<ms){if(await ev(expr))return;await wait(50)}throw Error('Timeout '+label)};
 app.whenReady().then(async()=>{try{
 await wait(200);win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.webContents.on('console-message',(_e,...args)=>{if(args.some(a=>String(a).includes('Error')))console.log('renderer',...args)});await until('!!window.__world?.ext.queue?.line.length','queue ready');
 await ev(`window.__world.showRoom('queue')`);await wait(700);
 // Direct room contract: trigger real production actors, with real-time movement.
 await ev(`(()=>{const host=document.createElement('div');host.style.cssText='position:fixed;left:24px;top:12px;width:720px;height:920px;z-index:99999;transform:scale(.8);transform-origin:top left;background:#1d2342';document.body.append(host);window.fixtureHost=host;window.fixtureQ=new window.__world.ext.queue.constructor(host,720,800);window.person={id:'departure-direct',provider:'codex',name:'Departure fixture',title:'Question restored during departure',question:'Check departure routing?'};fixtureQ.setThreads([person]);})()`);
 await until('fixtureQ.line[0]?.settled','direct settle');
 await capture('01-initial');
 const results=[];
 for(const phase of ['wave','walking']){
 await ev(`window.original=fixtureQ.line.find(q=>q.id===person.id);window.startPos={x:original.w.x,y:original.w.y};fixtureQ.setThreads([]);`);
 if(phase==='walking')await until('Math.hypot(original.w.x-startPos.x,original.w.y-startPos.y)>24','outgoing movement');else await wait(120);
 await capture('02-'+phase+'-departure');
 const restore=await ev(`(()=>{const at={x:original.w.x,y:original.w.y};fixtureQ.setThreads([person]);const current=fixtureQ.line.find(q=>q.id===person.id);return{sameActor:current.w===original.w,at,restored:{x:current.w.x,y:current.w.y},physical:fixtureHost.querySelectorAll('.world-walker[data-id="departure-direct"]').length}})()`);
 await wait(2000);await capture('03-'+phase+'-restored');
 await wait(6500);
 const late=await ev(`({physical:fixtureHost.querySelectorAll('.world-walker[data-id="departure-direct"]').length,connected:fixtureQ.line.find(q=>q.id===person.id)?.w.el.isConnected,settled:fixtureQ.line.find(q=>q.id===person.id)?.settled})`);
 results.push({phase,restore,late});
 if(mode==='corrected'&&(!restore.sameActor||restore.physical!==1||restore.at.x!==restore.restored.x||restore.at.y!==restore.restored.y||late.physical!==1||!late.connected||!late.settled))throw Error('Direct restoration failed '+JSON.stringify(results));
 await until('fixtureQ.line.find(q=>q.id===person.id)?.settled','reset settled');
 }
 await capture('04-after-stale-callbacks');await ev('fixtureQ.destroy();fixtureHost.remove()');
 if(mode==='control') {
 if(!results.every(r=>!r.restore.sameActor&&r.restore.physical===2))throw Error('Control did not reproduce duplicate actors');
 const urls=await ev('[...document.scripts].map(s=>s.src).filter(Boolean)');
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({ok:true,mode,results,captures,loaded:urls.map(url=>({url,sha256:hash(fs.readFileSync(require('node:url').fileURLToPath(url)))})),disclaimer:'Reconstructed pre-fix control captured now. Not historical before footage. Direct question room contract only.'},null,2));console.log('control reproduction passed');app.exit(0);return;
 }
 // Integrated contract: actual World.move, exits, hall travel, enterFrom and pushExt.
 await ev(`(()=>{const w=window.__world;window.samples=[];window.handoffs=[];window.entries=[];const incoming=w.ext.queue.enterFrom.bind(w.ext.queue);w.ext.queue.enterFrom=(id,at)=>{const a=w.transit.get(id),r=w.rooms.find(r=>r.id==='queue');entries.push({id,at,world:{x:at.x+r.x,y:at.y+r.y},hall:a?{x:a.x,y:a.y}:null});return incoming(id,at)};const original=w.handOver.bind(w);w.handOver=(id,at,face)=>{const source=w.ext.queue.line.find(q=>q.id===id);const room=w.rooms.find(r=>r.id==='queue');const result=original(id,at,face);const a=w.transit.get(id);handoffs.push({id,at,source:source?{x:source.w.x+parseFloat(room.el.style.left),y:source.w.y+parseFloat(room.el.style.top)}:null,hall:a?{x:a.x,y:a.y}:null,result});return result};window.sampler=setInterval(()=>{const room=w.rooms.find(r=>r.id==='queue'),a=w.transit.get('departure-worker'),q=w.ext.queue.line.find(q=>q.id==='departure-worker');const nodes=[...document.querySelectorAll('.world-walker[data-id="departure-worker"]')];const node=nodes[0],rect=node?.getBoundingClientRect();samples.push({time:performance.now(),count:nodes.length,room:q?.alive?'queue':q?'departing':null,exits:w.exits.has('departure-worker'),trip:w.trips.has('departure-worker'),actor:a?{x:a.x,y:a.y}:q?{x:q.w.x+room.x,y:q.w.y+room.y}:null,screen:rect?{x:rect.x,y:rect.y}:null});},16)})()`);
 for(const phase of ['wave','walking']){
 await until(`window.__world.ext.queue.line.find(q=>q.id==='departure-worker')?.settled`,'world queue settle');
 worker.question=null;await ev('window.__refresh()');
 await until(`!!window.__world.exits.get('departure-worker')`,'world exit barrier');
 await ev(`window.departing=window.__world.ext.queue.line.find(q=>q.id==='departure-worker');window.departureStart={x:departing.w.x,y:departing.w.y}`);
 if(phase==='walking')await until('Math.hypot(departing.w.x-departureStart.x,departing.w.y-departureStart.y)>24','world outgoing walk');
 worker.question='Check departure routing?';await ev('window.__refresh()');await capture('05-world-'+phase+'-restored');
 await until(`!window.__world.exits.has('departure-worker')&&!window.__world.transit.has('departure-worker')&&window.__world.ext.queue.line.find(q=>q.id==='departure-worker')?.settled`,'world return via door',45000);
 await wait(3500);await capture('06-world-'+phase+'-returned');
 }
 const integrated=await ev(`clearInterval(sampler);({samples,handoffs,entries,room:window.__world.rooms.find(r=>r.id==='queue')&&{x:window.__world.rooms.find(r=>r.id==='queue').x,y:window.__world.rooms.find(r=>r.id==='queue').y,w:720,h:800}})`);
 const bad=integrated.samples.filter(s=>s.count!==1);if(bad.length)throw Error('Integrated robot count '+JSON.stringify(bad.slice(0,5)));
 for(const h of integrated.handoffs)if(h.result&&(!h.source||!h.hall||Math.hypot(h.at.x-h.source.x,h.at.y-h.source.y)>1||Math.hypot(h.at.x-h.hall.x,h.at.y-h.hall.y)>1))throw Error('Handoff discontinuity');
 // Walker.frame caps catch-up at 100 ms. Interval samples can straddle that
 // catch-up tick, so allow its bounded movement, never a room-scale jump.
 let maxStep=0;
 for(let i=1;i<integrated.samples.length;i++){const a=integrated.samples[i-1],b=integrated.samples[i];if(a.actor&&b.actor){const d=Math.hypot(a.actor.x-b.actor.x,a.actor.y-b.actor.y);maxStep=Math.max(maxStep,d);if(d>300*Math.max(.1,(b.time-a.time)/1000)+2)throw Error('Position discontinuity '+d)}}
 for(const e of integrated.entries)if(!e.hall||Math.hypot(e.world.x-e.hall.x,e.world.y-e.hall.y)>1)throw Error('Incoming handoff discontinuity');
 if(integrated.entries.length!==2||integrated.handoffs.length!==2)throw Error('Expected both full door handoffs');
 const r=integrated.room;const doorway=integrated.samples.filter(s=>s.actor&&s.actor.y>=r.y+r.h-12&&s.actor.y<=r.y+r.h+12);
 if(!doorway.length||doorway.some(s=>Math.abs(s.actor.x-(r.x+r.w/2))>50))throw Error('Robot crossed outside door');
 integrated.summary={sampleCount:integrated.samples.length,maxStep,doorwaySamples:doorway.length,physicalCountAlwaysOne:true,continuousIncomingAndOutgoing:true};
 const assets=await ev(`({scripts:[...document.scripts].map(s=>s.src).filter(Boolean),styles:[...document.styleSheets].map(s=>s.href).filter(Boolean)})`);
 const assetsWithHashes=Object.fromEntries(Object.entries(assets).map(([k,list])=>[k,list.map(url=>({url,sha256:hash(fs.readFileSync(require('node:url').fileURLToPath(url)))}))]));
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({ok:true,mode,results,integrated,captures,loaded:assetsWithHashes,adapters:['T3 data and actions','usage','weather','environment listing'],native:'Electron BrowserWindow, production built renderer, real GSAP timing and Walker, World routing',controlDisclaimer:'Reconstructed control run captured now, not historical before evidence'},null,2));console.log(mode+' passed');app.exit(0);
 }catch(e){console.error(e);if(win){await capture('failure');fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify({error:String(e),samples:await ev('window.samples??[]')},null,2));}app.exit(1)}});
}
