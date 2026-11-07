import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
const compile = async name => (await transformWithOxc((await readFile(new URL(`../src/world/${name}.ts`, import.meta.url), "utf8")).replace(/^import\s[\s\S]*?;\r?\n/gm, ""), `${name}.ts`)).code.replace(/export\s*\{[^}]*\};?/g, "").replace(/^export /gm, "");
const hiddenRoutePrefix = new Function(`${await compile("hidden-route")};return hiddenRoutePrefix`)();
const routeSuffixLengths = new Function(`${await compile("route-distance")};return routeSuffixLengths`)();
const Walker = new Function("hiddenRoutePrefix", "routeSuffixLengths", "clamp", `${await compile("walker")};return Walker`)(hiddenRoutePrefix, routeSuffixLengths, (v, a, b) => Math.min(b, Math.max(a, v)));
const view = { x: 0, y: 0, w: 100, h: 100 };
const jump = (at, pts) => hiddenRoutePrefix(at, pts, 0, view);
assert.deepEqual(jump({x:-1000,y:50}, [{x:50,y:50}]), {x:0,y:50,index:0});
assert.deepEqual(jump({x:50,y:50}, [{x:2000,y:50}]), {x:50,y:50,index:0}, "Visible actors cannot jump out");
assert.deepEqual(jump({x:-1000,y:50}, [{x:1000,y:50}]), {x:0,y:50,index:0}, "Hidden endpoints cannot skip a visible crossing");
assert.deepEqual(jump({x:-1000,y:-200}, [{x:200,y:-200},{x:200,y:200},{x:50,y:200},{x:50,y:50}]), {x:50,y:100,index:3});
assert.deepEqual(jump({x:-1000,y:-200}, [{x:-100,y:-200},{x:-100,y:-50}]), {x:-100,y:-50,index:2});
assert.deepEqual(jump({x:-1000,y:0}, [{x:1000,y:0}]), {x:0,y:0,index:0}, "A grazing body stays protected");
assert.deepEqual(jump({x:50,y:1000}, [{x:50,y:-1000}]), {x:50,y:100,index:0});
assert.deepEqual(jump({x:1000,y:50}, [{x:-1000,y:50}]), {x:100,y:50,index:0});
// Dense independent sampling proves no skipped prefix crosses the protected viewport.
let seed = 64;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2**32) * 600 - 250;
for (let n=0;n<500;n++) {
  const at={x:random(),y:random()}, pts=Array.from({length:6},()=>({x:random(),y:random()}));
  const result=jump(at,pts); let p=at;
  for(let i=0;i<=result.index && i<pts.length;i++) {
    const q=i===result.index?result:pts[i];
    for(let t=0;t<1;t+=.01) {const x=p.x+(q.x-p.x)*t,y=p.y+(q.y-p.y)*t;assert.ok(!(x>1e-6&&x<100-1e-6&&y>1e-6&&y<100-1e-6)||Math.hypot(q.x-p.x,q.y-p.y)<1e-6);}
    p=q;
  }
}
function actor(at, pts, getView=()=>view, through=false) {
  let completed=0, settled=0;
  const w=Object.assign(Object.create(Walker.prototype),at,{s:.42,speed:290,weakness:0,v:0,st:{stride:0,phase:0},shortcutView:getView,
    mv:{pts,tails:routeSuffixLengths(pts),i:0,wait:0,through,resolve(){completed++;}},place(){},faceToward(){},settle(){settled++;}});
  return {w,completed:()=>completed,settled:()=>settled};
}
const a=actor({x:-10000,y:50},[{x:50,y:50}]);a.w.moveStep(1/60);
assert.ok(a.w.x>=0&&a.w.x<6,"Hidden travel ends at the viewport; entry proceeds at physical running speed");
for(let i=0;i<600 && a.w.mv;i++)a.w.moveStep(1/60);
assert.equal(a.w.x,50);assert.equal(a.completed(),1);assert.equal(a.settled(),1);
const b=actor({x:-10000,y:50},[{x:50,y:50}],()=>null);b.w.moveStep(1/60);
assert.ok(b.w.x < -9990,"Followed, held and moving-camera actors keep continuous travel");
const c=actor({x:-10000,y:-200},[{x:-5000,y:-200}]);c.w.moveStep(1/60);c.w.moveStep(1/60);
assert.equal(c.w.x,-5000);assert.equal(c.completed(),1);assert.equal(c.settled(),0);
const d=actor({x:50,y:50},[{x:50,y:50}],()=>null,true);d.w.v=200;d.w.moveStep(1/60);
assert.ok(d.w.v>0);assert.equal(d.settled(),0,"Intermediate route legs retain momentum");
const e=actor({x:-10000,y:50},[{x:50,y:50}],()=>null);e.w.stop();e.w.moveStep(1/60);
assert.equal(e.w.x,-10000);assert.equal(e.completed(),1,"Cancelled trips cannot advance or resolve twice");
console.log("Hidden routes: boundaries, crossings, 500 sampled paths, actual movement, following, momentum and cancellation passed.");
