// Isolated production-renderer checks. Run with LUCID_RUNNING_CHECKS=1 LUCID_PERF_CHECKS_ONLY=1 node scripts/review/render-profile.cjs <output>.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({js,wc,wait,out})=>{
 await js(`{const w=window.__world;w.stopFollow();w.unfocus(false);w.frame=null;w.cancelCameraTween();
 const r=w.rooms.find(r=>r.id==='main'),p={x:r.x+r.w/2,y:w.hallY};
 Object.assign(w.cam,{s:1.2,x:w.scene.clientWidth/2-p.x,y:w.scene.clientHeight*.6-p.y});w.apply();
 w.update=()=>{};window.runKeepAlive=setInterval(()=>window.dispatchEvent(new Event("pointermove")),100);window.runQA={p,samples:[],done:false};}`);
 await wait(500);
 await js(`{const w=window.__world,p=runQA.p,a=w.spawn({id:'run-fixture',provider:'codex'}, {x:p.x-12000,y:p.y},'right');
 a.stopBattery?.();a.weakness=0;a.setRunning(true);runQA.a=a;runQA.start=performance.now();
 void a.walkPath([{x:p.x+200,y:p.y}]).then(()=>runQA.done=true);
 const sample=()=>{runQA.samples.push({at:performance.now(),x:a.x,y:a.y,v:a.v,phase:a.st.phase,view:a.shortcutView?.()});if(!runQA.done)requestAnimationFrame(sample)};requestAnimationFrame(sample);}`);
 await wait(850);
 fs.writeFileSync(path.join(out,'running-entry.png'),(await wc.capturePage()).toPNG());
 await wait(900);
 fs.writeFileSync(path.join(out,'running-stride.png'),(await wc.capturePage()).toPNG());
 await wait(3500);
 const result=await js(`({done:runQA.done,samples:runQA.samples,startX:runQA.p.x-12000,goal:runQA.p.x+200,errors:window.__errs})`);
 assert.equal(result.samples.at(-1).x,result.goal);
 assert.ok(result.done,'Long hidden commute must finish in seconds');
 let skipped=false;
 for(let i=1;i<result.samples.length;i++){
  const a=result.samples[i-1],b=result.samples[i],dist=Math.hypot(a.x-b.x,a.y-b.y),dt=(b.at-a.at)/1000;
  if(dist>290*dt+3){skipped=true;const v=b.view;assert.ok(v && a.x<=v.x && b.x<=v.x+6,'Relocation must stay outside padded viewport');}
 }
 // The first rAF can already be after the skipped prefix.
 skipped ||= result.samples[0].x > result.startX;
 assert.ok(skipped,'Hidden distance was skipped');
 assert.ok(!result.errors?.length,'No renderer errors');
 const followed=await js(`{const w=window.__world,a=runQA.a;w.followEl=a.el;a.setPos(runQA.p.x-12000,runQA.p.y);void a.walkPath([{x:runQA.p.x,y:runQA.p.y}]);({x:a.x,shortcut:a.shortcutView()})}`);
 assert.equal(followed.shortcut,null);
 await wait(200);
 const after=await js(`({x:runQA.a.x})`);assert.ok(after.x>followed.x && after.x-followed.x<120,'Following must not skip travel');
 await js(`{clearInterval(window.runKeepAlive);window.__world.followEl=null;runQA.a.destroy();window.__world.transit.delete('run-fixture')}`);
 fs.writeFileSync(path.join(out,'running-results.json'),JSON.stringify({...result,followed,after},null,2));
 console.log('Native running checks passed: hidden entry, real stride, bounded visible movement, arrival, follow continuity, no renderer errors.');
};
