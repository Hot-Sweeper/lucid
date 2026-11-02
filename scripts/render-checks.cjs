const fs = require("node:fs");
const path = require("node:path");

module.exports = async function checks({ js, wc, wait, out, threads }) {
  const result = {};
  const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  // Hold a departing question robot for longer than the old 15-second timeout. This
  // exercises both destination spawning and the old fallback that cloned slow exits.
  await js(`{
    const w=window.__world, id='perf-t26', q=w.ext.queue.line.find(q=>q.id===id);
    if(!q) throw Error('Missing queue fixture');
    window.__releaseExit=null;
    const gate=new Promise(resolve=>window.__releaseExit=resolve);
    const walk=q.w.walkPath.bind(q.w);
    q.w.walkPath=async points=>{await gate;return walk(points)};
    // Age only the room-choice debounce. Walking and the old exit timeout use real time.
    w.placed.get(id).pending={room:'break',since:Date.now()-21000};
    window.__duplicates=[]; window.__counting=true; window.__maxActors=0;
    const sample=()=>{
      if(!window.__counting)return;
      const counts=new Map();
      for(const el of w.root.querySelectorAll('.world-walker'))counts.set(el.dataset.id,(counts.get(el.dataset.id)||0)+1);
      for(const [id,d] of w.desks)if(d.el.isConnected&&!d.el.classList.contains('arriving'))counts.set(id,(counts.get(id)||0)+1);
      window.__maxActors=Math.max(window.__maxActors,counts.get(id)||0);
      for(const [id,n] of counts)if(n>1&&window.__duplicates.length<10)window.__duplicates.push({id,n});
      requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  }`);
  threads[18].settled = false; threads[18].question = "Please check this replacement";
  threads[26].question = null; threads[26].settled = true;
  await js("window.__refresh()");
  await wait(18000);
  result.heldExit = await js(`({actors:document.querySelectorAll('.world-walker[data-id="perf-t26"]').length,waiting:window.__world.exits.has('perf-t26'),maxActors:window.__maxActors,duplicates:window.__duplicates})`);
  await shot("held-exit");
  console.log("heldExit", JSON.stringify(result.heldExit));
  if (process.env.LUCID_PERF_REPRO_ONLY) {
    fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(result, null, 2));
    return;
  }
  await js("window.__releaseExit()");
  // Let the real source, hall and destination walk complete, sampling every displayed frame.
  for (let i = 0; i < 55; i++) {
    await wait(1000);
    const arrived = await js(`!window.__world.exits.has('perf-t26')&&!window.__world.transit.has('perf-t26')`);
    if (arrived) break;
  }
  result.arrival = await js(`({actors:document.querySelectorAll('.world-walker[data-id="perf-t26"]').length,waiting:window.__world.exits.has('perf-t26'),traveling:window.__world.transit.has('perf-t26'),maxActors:window.__maxActors,duplicates:window.__duplicates})`);
  await js("window.__counting=false");
  console.log("arrival", JSON.stringify(result.arrival));
  await shot("arrival");

  // Real wheel events, then wait for the camera raster to settle at a close park view.
  const point = await js(`{const w=window.__world,p=w.outdoor.park;w.cam={s:.65,x:w.scene.clientWidth/2-(p.x+p.w/2)*.65,y:w.scene.clientHeight/2-(p.y+p.h/2)*.65};w.apply();const r=w.scene.getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
  for (let i = 0; i < 20; i++) {
    wc.sendInputEvent({ type: "mouseWheel", ...point, deltaX: 0, deltaY: 60, canScroll: true });
    await wait(20);
  }
  await wait(1200);
  result.sharpness = await js(`{const cv=document.querySelector('.outside-detail'),r=cv?.getBoundingClientRect();({scale:window.__world.cam.s,dpr:devicePixelRatio,width:cv?.width,height:cv?.height,screenWidth:r?.width,pixelsPerCssPixel:r?.width?cv.width/r.width:0,sourceDensity:Number(cv?.dataset.sourceDensity),sharp:cv?.dataset.sharp==='1',settled:!window.__world.root.classList.contains('zooming'),errors:window.__errs})}`);
  await shot("park-zoom-settled");
  // Repeated zoom direction changes must not accumulate canvases or apply a stale crop.
  for (let i = 0; i < 20; i++) {
    wc.sendInputEvent({ type: "mouseWheel", ...point, deltaX: 0, deltaY: i % 2 ? -80 : 80, canScroll: true });
    await wait(20);
  }
  await wait(1200);
  result.cacheNodes = await js(`({preview:document.querySelectorAll('.outside-quick').length,detail:document.querySelectorAll('.outside-detail').length,errors:window.__errs})`);
  fs.writeFileSync(path.join(out, "checks.json"), JSON.stringify(result, null, 2));
  console.log("checks", JSON.stringify(result));
  if (result.heldExit.actors !== 1 || !result.heldExit.waiting || result.arrival.waiting || result.arrival.traveling || result.arrival.duplicates.length) throw Error("Robot handoff regression");
  if (result.sharpness.width && (result.sharpness.pixelsPerCssPixel < result.sharpness.dpr * .99 || !result.sharpness.settled || !result.sharpness.sharp || Math.abs(result.sharpness.sourceDensity/result.sharpness.scale/result.sharpness.dpr-1)>.01)) throw Error("Zoom raster is not sharp at device resolution");
  if (result.cacheNodes.preview !== 1 || result.cacheNodes.detail !== 1 || result.cacheNodes.errors.length) throw Error("Raster lifecycle regression");
};
