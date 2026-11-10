const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
module.exports = async ({js,wc,wait,out}) => {
  const capture = async name => fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());
  const result = {kind:'isolated native Electron, existing render-profile fixture',productionRestart:false};
  try {
    result.loaded = await js(`({url:location.href,scripts:[...document.scripts].map(s=>s.src)})`);
    result.assets = result.loaded.scripts.filter(s=>s.startsWith('file:')).map(url=>{const p=require('node:url').fileURLToPath(url), data=fs.readFileSync(p), copy=path.join(out,path.basename(p));fs.writeFileSync(copy,data);return {url,copy,sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length}});
    await js(`{
      const w=window.__world;w.stopFollow();w.unfocus(false);w.frame=null;
      const room=w.rooms.find(r=>r.id==='main'),out=w.door(room)[0];
      Object.assign(w.cam,{s:1,x:w.scene.clientWidth/2-out.x,y:w.scene.clientHeight*.58-w.hallY});w.apply();
      window.hallQA={bots:[],samples:[],done:0,start:performance.now(),room,record:true};
      for(let i=0;i<7;i++){
        const t={id:'hall-review-'+i,provider:i%2?'codex':'claudeAgent'},p={x:out.x+430+i*65,y:w.hallY};
        const actor=w.spawn(t,p,'left'),trip={};w.trips.set(t.id,trip);
        const route=w.route(p,t.id,room.id);hallQA.bots.push({id:t.id,route:route.pts});
        w.walkLegs(t,route.pts,trip).then(()=>hallQA.done++);
      }
      const sample=()=>{const q=hallQA;if(!q.record)return;q.samples.push({at:performance.now(),bots:q.bots.map(t=>{const a=w.transit.get(t.id);return a?{id:t.id,x:a.x,y:a.y,facing:a.facing}:null}).filter(Boolean)});requestAnimationFrame(sample)};requestAnimationFrame(sample);
    }`);
    await wait(2500);await capture('after-varied-hallway');
    await wait(4000);await capture('after-entrance-turn');
    await wait(5000);
    result.walk = await js(`({done:hallQA.done,bots:hallQA.bots,samples:hallQA.samples,rooms:window.__world.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h})),hallY:window.__world.hallY})`);
    await js(`{hallQA.record=false;const w=window.__world;w.roomOrder=w.orderRooms(w.rooms.filter(r=>r.id.startsWith('p:')||r.id==='freelance')).map(r=>r.id).reverse();w.update(w.lastData);hallQA.layout=[];
      for(const b of hallQA.bots){const a=w.transit.get(b.id),trip={};w.trips.set(b.id,trip);const route=w.route({x:a.x,y:a.y},b.id,'main');void w.walkLegs({id:b.id},route.pts,trip)}
      const p=[...w.meetingSpots.values()][0];if(p){Object.assign(w.cam,{s:1,x:w.scene.clientWidth/2-p.x-200,y:w.scene.clientHeight*.58-p.y});w.apply()}}`);
    for(let i=0;i<60;i++) {
      const s=await js(`{const w=window.__world;({held:w.physicalLayoutHeld,revision:w.layoutRevision,spots:[...w.meetingSpots],actors:[...w.transit].map(([id,a])=>({id,x:a.x,y:a.y})),topH:w.topH})}`);
      result.layout=s;
      await js(`hallQA.layout.push(${JSON.stringify(s)})`);
      if(i===8)await capture('after-layout-waiting');
      if(s.held&&s.spots.length>=3&&s.spots.filter(([id,p])=>s.actors.some(a=>a.id===id&&Math.hypot(a.x-p.x,a.y-p.y)<8)).length>=3){await capture('after-layout-waiting');result.waitingObserved=true;break;}
      await wait(500);
    }
    result.layoutHistory=await js('hallQA.layout');
    result.errors=await js('window.__errs||[]');
    const samples=result.walk.samples;let maxStep=0,maxSpeed=0,discontinuities=0;const facings=new Set();
    for(let i=1;i<samples.length;i++)for(const b of samples[i].bots){const a=samples[i-1].bots.find(a=>a.id===b.id);if(a){const d=Math.hypot(b.x-a.x,b.y-a.y);if(d>240*((samples[i].at-samples[i-1].at)/1000)+2)discontinuities++;maxStep=Math.max(maxStep,d);maxSpeed=Math.max(maxSpeed,d/((samples[i].at-samples[i-1].at)/1000));}facings.add(b.facing)}
    result.continuity={frames:samples.length,maxStep,maxSpeed,discontinuities,facings:[...facings]};
    result.variedY=[...new Set(result.walk.bots.flatMap(b=>b.route.filter(p=>Math.abs(p.y-result.walk.hallY)<46).map(p=>p.y)))];
    result.passed=result.walk.done===7&&result.variedY.length>=5&&discontinuities===0&&!!result.waitingObserved&&result.errors.length===0;
    fs.writeFileSync(path.join(out,'hallway-results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({passed:result.passed,done:result.walk.done,variedY:result.variedY,continuity:result.continuity,waiting:result.waitingObserved,errors:result.errors}));
    if(!result.passed)throw Error('Hallway native check needs review, see hallway-results.json');
  }catch(error){result.error=String(error);fs.writeFileSync(path.join(out,'hallway-results.json'),JSON.stringify(result,null,2));await capture('failure');throw error;}
};
