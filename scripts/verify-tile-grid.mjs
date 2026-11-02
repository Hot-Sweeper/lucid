import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const code=(await transformWithOxc(await readFile(new URL('../src/perf/tile-grid.ts',import.meta.url),'utf8'),'tile-grid.ts')).code;
const {planRasterTiles,upwardTileDensity,snapTileCore,clipPixelRatio}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const bounds={x:-173.619,y:-26.173,w:2400.331,h:1700.811};
let samples=0;
for(const dpr of [1,1.5,2,3])for(const scale of [.08,.173,.317,.713,1,2.173,3.932,5])for(const shift of [0,.173,103.619]){
  const view={x:-213+shift,y:-46+shift,w:390/scale,h:844/scale},required=scale*dpr,tiles=planRasterTiles(bounds,view,required);
  const clipped={x:Math.max(bounds.x,view.x),y:Math.max(bounds.y,view.y),right:Math.min(bounds.x+bounds.w,view.x+view.w),bottom:Math.min(bounds.y+bounds.h,view.y+view.h)};
  const area=Math.max(0,clipped.right-clipped.x)*Math.max(0,clipped.bottom-clipped.y);
  let covered=0;const keys=new Set();
  for(const tile of tiles){
    assert.ok(!keys.has(tile.key));keys.add(tile.key);
    assert.ok(tile.density>=required&&tile.density<=required*2**.25*(1+1e-12));
    assert.equal(tile.width,514);assert.equal(tile.height,514);
    assert.ok(Math.abs(tile.crop.w*tile.density-514)<1e-9&&Math.abs(tile.crop.h*tile.density-514)<1e-9);
    assert.ok(tile.crop.x<=tile.core.x-1/tile.density+1e-8&&tile.crop.y<=tile.core.y-1/tile.density+1e-8);
    assert.ok(tile.core.x>=bounds.x-1e-8&&tile.core.y>=bounds.y-1e-8);
    const cam={x:-view.x*scale+.173,y:-view.y*scale+.619,s:scale},origin={x:31.173,y:47.619},snapped=snapTileCore(tile.core,cam,dpr,origin);
    assert.ok(Object.values(snapped.pixels).every(Number.isInteger),'All clip edges share integer global physical coordinates');
    const physical=(axis,value)=>(origin[axis]+cam[axis]+value*scale)*dpr;
    assert.ok(Math.abs(physical('x',snapped.world.x)-snapped.pixels.x)<1e-8&&Math.abs(physical('y',snapped.world.y)-snapped.pixels.y)<1e-8);
    assert.ok(snapped.world.x>=tile.crop.x-1e-8&&snapped.world.y>=tile.crop.y-1e-8&&snapped.world.x+snapped.world.w<=tile.crop.x+tile.crop.w+1e-8&&snapped.world.y+snapped.world.h<=tile.crop.y+tile.crop.h+1e-8,'Guarded source covers every physically snapped core');
    for(const neighbor of tiles)if(neighbor.row===tile.row&&neighbor.column===tile.column+1){const right=snapTileCore(neighbor.core,cam,dpr,origin);assert.equal(snapped.pixels.x+snapped.pixels.w,right.pixels.x,'Shared vertical edges cannot overlap or leave a physical alpha gap');}
    for(const neighbor of tiles)if(neighbor.column===tile.column&&neighbor.row===tile.row+1){const below=snapTileCore(neighbor.core,cam,dpr,origin);assert.equal(snapped.pixels.y+snapped.pixels.h,below.pixels.y,'Shared horizontal edges cannot overlap or leave a physical alpha gap');}
    const w=Math.max(0,Math.min(tile.core.x+tile.core.w,clipped.right)-Math.max(tile.core.x,clipped.x));
    const h=Math.max(0,Math.min(tile.core.y+tile.core.h,clipped.bottom)-Math.max(tile.core.y,clipped.y));covered+=w*h;
    for(const other of tiles)if(other!==tile){const overlapW=Math.min(tile.core.x+tile.core.w,other.core.x+other.core.w)-Math.max(tile.core.x,other.core.x),overlapH=Math.min(tile.core.y+tile.core.h,other.core.y+other.core.h)-Math.max(tile.core.y,other.core.y);assert.ok(overlapW<1e-8||overlapH<1e-8,'Tile cores cannot double-paint translucent artwork');}
  }
  assert.ok(Math.abs(covered-area)<Math.max(1e-6,area*1e-12),'Clipped tile cores cover every visible source pixel');samples++;
}
const a=planRasterTiles(bounds,{x:100,y:100,w:390,h:844},3),b=planRasterTiles(bounds,{x:103.173,y:106.619,w:390,h:844},3);
const common=a.filter(tile=>b.some(next=>next.key===tile.key));assert.ok(common.length>0);
for(const tile of common)assert.deepEqual(b.find(next=>next.key===tile.key),tile,'Camera translation cannot alter a retained tile crop or image geometry');
assert.equal(upwardTileDensity(3),upwardTileDensity(3.1),'Within-band zoom reuses the same physical source grid');
assert.ok(upwardTileDensity(3.4)>upwardTileDensity(3.1),'Crossing a band requires sharper source pixels');
for(const [raw,physical]of [[2.000000059604645,2],[3.000000089406967,3],[1.2345672,1.2345672]]){
  assert.equal(clipPixelRatio(raw),physical);
  const cam={x:-169.883,y:57.563,s:.713},origin={x:.173,y:.619},core={x:304.4370214406966,y:0,w:304.4370214406966,h:304.4370214406966};
  const snapped=snapTileCore(core,cam,raw,origin);assert.equal(snapped.pixelRatio,physical);
  assert.ok(Math.abs((origin.x+cam.x+snapped.world.x*cam.s)*physical-snapped.pixels.x)<1e-8,'Clip inverse uses the same physical scale as capture');
  const sourcePlan=planRasterTiles({x:0,y:0,w:2000,h:1600},{x:0,y:0,w:390,h:844},cam.s*raw);
  assert.ok(sourcePlan.every(tile=>tile.density>=cam.s*raw),'Clip scale normalization cannot reduce source pixel density');
}
console.log(JSON.stringify({tilePlans:samples,maximumBacking:[514,514],fullDensity:true,exactCoreCoverage:true,overlappingCoreArea:0,translationStable:true,withinBandStable:true}));

const plain=source=>source.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const quietCode=(await transformWithOxc(await readFile(new URL('../src/perf/raster-quiet.ts',import.meta.url),'utf8'),'raster-quiet.ts')).code;
const staticCode=(await transformWithOxc((await readFile(new URL('../src/perf/static-art.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),'static-art.ts')).code;
const api=new Function('document','window','devicePixelRatio','getComputedStyle',`${plain(quietCode)}\n${plain(code)}\n${plain(staticCode)};return {TiledStaticRun,updateStaticArt}`)({addEventListener() {}}, {}, 3, ()=>({}));
api.updateStaticArt({x:0,y:0,s:1},390,844);
const owner=Object.create(api.TiledStaticRun.prototype),view={x:300,y:90,w:390,h:844,density:3},higher=planRasterTiles(bounds,view,4);
Object.assign(owner,{dead:false,tiled:true,ready:true,svg:{isConnected:true},bounds,tiles:new Map(higher.map(tile=>[tile.key,{tile,asset:{refs:1}}])),wanted:new Map(),visibleTiles:higher,blocked:new Map(),tileFailures:new Map(),tileLoading:false,view:()=>view,paintTiles(){}});
const urls=[...owner.tiles.keys()];owner.update();
assert.equal(owner.visibleTiles[0].density,4,'A fully covered sharper level survives a lower required density');
assert.deepEqual([...owner.tiles.keys()],urls,'Pinch reversal keeps every existing sharp cell');
assert.equal(owner.tileLoading,false,'Fully covered pinch reversal starts no raster job');
assert.ok(owner.visibleTiles.every(tile=>owner.tiles.has(tile.key)));
console.log(JSON.stringify({coveredSharperLevelReused:true,pinchReversalRasterJobs:0,retainedTiles:owner.tiles.size}));
owner.tileFailures.set('past-view',Infinity);owner.blocked.set('past-view',1);owner.update();
assert.equal(owner.tileFailures.has('past-view'),false,'Unwanted failed cells cannot accumulate across panning');
assert.equal(owner.blocked.has('past-view'),false,'Unwanted admission blocks cannot accumulate across panning');
owner.tileFailures.set('suspended',Infinity);owner.blocked.set('suspended',1);owner.tiles.clear();owner.fallback=()=>{};owner.suspend();
assert.equal(owner.tileFailures.size,0);assert.equal(owner.blocked.size,0,'Suspending the run releases retry metadata');
const pendingOwner=Object.create(api.TiledStaticRun.prototype),shared={refs:2};let detached=0;
let cancellations=0;
Object.assign(pendingOwner,{tiled:true,tiles:new Map(),displaying:{asset:shared,image:{removeAttribute(){detached++}},group:{remove(){}},clip:{remove(){}},finish(){cancellations++},key:'loading'},paintTiles(){}});
assert.equal(pendingOwner.displayPending(),1);
pendingOwner.releaseRaster(shared);pendingOwner.releaseRaster(shared);
assert.equal(pendingOwner.displayPending(),0);assert.equal(shared.refs,1);assert.equal(detached,1,'Cancelling an actual-image decode releases exactly its own reference once');
assert.equal(cancellations,1,'Cancelling the displayed image also settles its owned load wait');
const nativeHarness=await readFile(new URL('./render-static-art-checks.cjs',import.meta.url),'utf8');
const densityCheck=nativeHarness.slice(nativeHarness.indexOf('const sharpBucket='),nativeHarness.indexOf('const until='));
const nativeSharpCheck=new Function(`${densityCheck};return sharpBucket`)();
assert.equal(nativeSharpCheck({density:2.999,expectedDensity:3}),false,'Native acceptance cannot accept undersampled artwork');
assert.equal(nativeSharpCheck({density:4,expectedDensity:3}),false,'An excessive density is not evidence of covered higher-LOD reuse by itself');
assert.equal(nativeSharpCheck({density:4,expectedDensity:3,visibleTiles:21,readyTiles:21,verifiedTiles:28}),true,'Native acceptance permits fully covered sharper LOD reuse');
assert.equal(nativeSharpCheck({density:4,expectedDensity:3,visibleTiles:21,readyTiles:20,verifiedTiles:28}),false,'Partial higher-LOD coverage cannot bypass the normal bucket check');
