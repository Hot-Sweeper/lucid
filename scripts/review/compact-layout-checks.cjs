// Called by the isolated render harness. This file never starts Electron itself.
module.exports = async function compactChecks({ js }) {
  return js(`(async () => {
    const w=window.__world, checks=[], assert=(ok,text)=>{if(!ok)throw Error(text);checks.push(text)};
    const inside=(r,p)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
    const onHall=p=>w.floorPlan.halls.some(h=>inside(h,p));
    let hallwayLegs=0, routes=0;
    for(const source of w.rooms)for(const target of w.rooms){
      const p=w.door(source)[0], plan=w.route(p,'__compact-check',target.id);
      assert(!plan.blocked,'native corridor connects '+source.id+' to '+target.id);
      let a=p;
      for(const b of plan.pts){
        if(onHall(a)&&onHall(b)){
          assert(a.x===b.x||a.y===b.y,'native hall leg is orthogonal');
          const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/10));
          for(let i=0;i<=n;i++){
            const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};
            if(!onHall(p))throw Error('native path leaves hall floor');
            if(w.rooms.some(r=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h))throw Error('native hall crosses room');
          }
          hallwayLegs++;
        }
        a=b;
      }
      routes++;
    }
    assert(w.floorPlan.halls.some(h=>h.axis==='y'),'native office has connected vertical hall spines');
    assert(w.floorPlan.halls.some(h=>h.axis==='x'&&h.column!==null),'native fixture covers a lower project row');
    const occupied=[...w.rooms,...w.floorPlan.halls];
    const xs=[...new Set(occupied.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b),ys=[...new Set(occupied.flatMap(r=>[r.y,r.y+r.h]))].sort((a,b)=>a-b);
    let courtyard=null,courtyardArea=0;
    for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
      const p={x:(xs[i-1]+xs[i])/2,y:(ys[j-1]+ys[j])/2};
      const area=(xs[i]-xs[i-1])*(ys[j]-ys[j-1]);
      if(!occupied.some(r=>inside(r,p))&&area>courtyardArea){courtyard=p;courtyardArea=area;}
    }
    assert(courtyard&&w.footprint.path.length>0,'native building shell has a real occupied footprint and outdoor courtyard');
    const originalCam={...w.cam};
    try{
      const show=p=>{Object.assign(w.cam,{s:6,x:w.scene.clientWidth/2-p.x*6,y:w.scene.clientHeight/2-p.y*6});w.apply()};
      show(courtyard);
      assert(!w.viewIndoors,'courtyard camera is treated as outdoors');
      assert(!w.root.querySelector('.outside-live')?.classList.contains('culled'),'courtyard retains outdoor animation layer');
      assert(w.root.querySelector('.weather-layer')?.style.visibility!=='hidden','courtyard retains weather');
      const room=w.rooms.find(r=>r.kind==='project');show({x:room.x+room.w/2,y:room.y+room.h/2});
      assert(w.viewIndoors,'room interior still suspends unseen outdoor layers');
      assert(w.root.querySelector('.weather-layer')?.style.visibility==='hidden','indoor camera still suspends weather');
    }finally{Object.assign(w.cam,originalCam);w.apply()}
    // Hold the first real walkLegs promise, then grow the main office. World.update
    // must cancel it in place and the stale second waypoint must never be visited.
    const originalExtra=new Map(w.extra), originalSeats=new Map([...w.seats].map(([id,seats])=>[id,[...seats]]));
    const save=w.onLayoutChange, data=w.lastData, revision=w.layoutRevision;
    while(w.slidingDesks.size||w.deskDragActive)await new Promise(resolve=>setTimeout(resolve,50));
    const id='__compact-midleg', trip={}, el=document.createElement('div');w.deskLayer.append(el);
    let finish=null, calls=0, stops=0;
    const start={x:100,y:w.hallY};
    const mock={...start,el,facing:'right',stop(){stops++;finish?.();},walkPath(){calls++;return new Promise(resolve=>{finish=resolve})}};
    w.transit.set(id,mock);w.trips.set(id,trip);
    w.onLayoutChange=()=>{};
    try{
      const walking=w.walkLegs({id},[{x:200,y:start.y},{x:300,y:start.y}],trip);
      await Promise.resolve();
      assert(calls===1,'mid-leg fixture started exactly one movement');
      w.extra.set('main',(w.extra.get('main')??0)+6);w.update(data);
      await walking;
      assert(w.layoutRevision>revision,'office growth changes navigation revision');
      assert(stops>=1&&mock.x===start.x&&mock.y===start.y,'office growth stops the same actor at its physical position');
      assert(calls===1,'stale second movement is cancelled after growth');
      assert(w.transit.get(id)===mock&&w.trips.get(id)===trip,'growth preserves actor and trip ownership');
      const resumed=w.route(start,id,'main');
      if(!resumed.blocked)for(const point of resumed.pts)assert(Number.isFinite(point.x)&&Number.isFinite(point.y),'replanned waypoints are finite');
    }finally{
      w.transit.delete(id);w.trips.delete(id);el.remove();
      w.extra=originalExtra;w.seats=originalSeats;w.update(data);w.onLayoutChange=save;
    }
    return {ok:true,building:w.size,rooms:w.rooms.length,routes,hallwayLegs,courtyard,footprintCells:w.footprint.cells.length,growth:{stops,calls},checks:checks.length};
  })()`);
};
