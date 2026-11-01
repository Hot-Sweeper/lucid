const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function analyze(d,{control=false}={}){
 assert(d.passed,d.error);assert(d.delayed.held&&!d.delayed.promotions,'overlapping delayed actor must prevent promotion');
 assert.equal(d.safeCheckpoint.held,control,'only the old rule requires exact rendezvous arrival');
 assert.equal(d.promotions.length,1,'one completed promotion');assert.equal(d.errors.length,0,'no renderer errors');assert.equal(d.held,false);
 const p=d.promotions[0],safe=(a)=>a.x>Math.max(p.oldFloor.size.w,p.newFloor.size.w)+40||(a.x>=40&&a.x<=Math.min(p.oldFloor.size.w,p.newFloor.size.w)-40&&a.y>=Math.max(p.oldFloor.topH,p.newFloor.topH)+40&&a.y<=Math.min(p.oldFloor.topH,p.newFloor.topH)+110);
 assert(p.actors.length===12&&p.actors.every(safe),'all bodies must clear old and new rooms at promotion');
 const notAtSpot=p.actors.filter(a=>{const q=p.spots.find(([id])=>id===a.id)?.[1];return q&&Math.hypot(a.x-q.x,a.y-q.y)>8});
 if(!control)assert(notAtSpot.length>0,'release must occur without exact rendezvous arrival');
 let maxSpeed=0,duplicateFrames=0,missingFrames=0,discontinuities=0,unrelatedRoomFrames=0;
 for(let i=0;i<d.samples.length;i++){
  const s=d.samples[i];if(Object.entries(s.counts).some(([id,n])=>id.startsWith('layout-')&&n>1))duplicateFrames++;
  if(Array.from({length:12},(_,j)=>'layout-'+j).some(id=>s.counts[id]!==1))missingFrames++;
  const prior=d.samples[i-1];
  for(const a of s.actors){const b=prior?.actors.find(b=>b.id===a.id);if(b){const dt=(s.time-prior.time)/1000,dist=Math.hypot(a.x-b.x,a.y-b.y);maxSpeed=Math.max(maxSpeed,dist/dt);if(dist>240*dt+3)discontinuities++;}
   const rooms=d.layouts?.[s.revision];if(rooms?.some(r=>!['p:layout-project','break'].includes(r.id)&&a.x>r.x+2&&a.x<r.x+r.w-2&&a.y>r.y+2&&a.y<r.y+r.h-2))unrelatedRoomFrames++;
  }
 }
 assert.equal(duplicateFrames,0);assert.equal(missingFrames,0);assert.equal(discontinuities,0);assert.equal(unrelatedRoomFrames,0,'no path through unrelated rooms');
 const final=d.samples.at(-1);for(let i=0;i<12;i++)assert.equal(final.counts['layout-'+i],1,'one destination actor per robot');
 assert.equal(final.actors.length,0,'all hallway journeys finish');
 const changed=p.oldFloor.topH!==p.newFloor.topH;assert.equal(changed,d.scenario==='height');
 return {passed:true,scenario:d.scenario,control,frames:d.samples.length,robots:12,promotions:1,oldFloor:p.oldFloor,newFloor:p.newFloor,actorsShortOfRendezvous:notAtSpot.length,duplicateFrames,missingFrames,discontinuities,unrelatedRoomFrames,maxObservedTransitSpeed:maxSpeed,destinations:d.destinations};
}
if(require.main===module){const dir=path.resolve(process.argv[2]),d=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))),summary=analyze(d,{control:process.argv.includes('--control')});fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));console.log(summary)}
module.exports={analyze};
