import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';

const source=(await readFile(new URL('../src/weather/effects.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const compiled=(await transformWithOxc(source,'effects.ts')).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const viewport={left:0,top:0,width:1285,height:837},rect={x:-3000,y:-5000,w:25000,h:16000};

function fixture() {
  const canvases=[],rafs=new Map(),timers=new Map(),diagnostics=new Set();
  let serial=0,off=false;
  const events=()=>({listeners:new Map(),addEventListener(type,fn){let set=this.listeners.get(type);if(!set)this.listeners.set(type,set=new Set());set.add(fn)},removeEventListener(type,fn){this.listeners.get(type)?.delete(fn)},emit(type,detail){for(const fn of this.listeners.get(type)??[])fn({detail})}});
  class Element {
    constructor(kind){
      this.kind=kind;this.style={};this.dataset={};this.children=[];this.calls=[];this.resizes=[];this.animations=[];this._width=300;this._height=150;
      const node=this;
      this.ctx=new Proxy({
        transform:[1,0,0,1,0,0],path:[],
        drawImage(...args){node.calls.push({kind:'draw',args})},
        clearRect(...args){node.calls.push({kind:'clear',args})},
        setTransform(...args){this.transform=args;node.calls.push({kind:'transform',args})},
        createRadialGradient(){return{addColorStop(){}}},
        beginPath(){this.path=[]},
        moveTo(...args){this.path.push(['move',...args])},lineTo(...args){this.path.push(['line',...args])},
        stroke(){node.calls.push({kind:'stroke',path:this.path.slice(),transform:this.transform.slice(),width:this.lineWidth,alpha:this.globalAlpha,color:this.strokeStyle})},
      },{get:(o,k)=>o[k]??(()=>{})});
      if(kind==='canvas')canvases.push(this);
    }
    set width(value){this._width=value;this.resizes.push(['width',value])} get width(){return this._width}
    set height(value){this._height=value;this.resizes.push(['height',value])} get height(){return this._height}
    setAttribute(){} append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}} appendChild(n){this.append(n)}
    querySelector(){return null} getContext(){return this.ctx} remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
    animate(){const animation={cancelled:false,cancel(){this.cancelled=true}};this.animations.push(animation);return animation}
    getAnimations(){return this.animations}
  }
  const document={...events(),hidden:false,createElement:kind=>new Element(kind)};
  const motion={...events(),matches:false};
  const window={...events(),setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial}};
  const requestAnimationFrame=fn=>{rafs.set(++serial,fn);return serial};
  const args={document,window,requestAnimationFrame,cancelAnimationFrame:id=>rafs.delete(id),clearTimeout:id=>timers.delete(id),matchMedia:()=>motion,devicePixelRatio:1.5,innerWidth:viewport.width,innerHeight:viewport.height,beginSystem:()=>0,endSystem:()=>{},outdoorLook:()=>({season:'summer',frozen:false}),diagnosticOff:()=>off,isCalm:()=>false,isAsleep:()=>false,onCalmChange:()=>()=>{},onDiagnosticsChange:fn=>{diagnostics.add(fn);return()=>diagnostics.delete(fn)}};
  const {mountWeather}=new Function(...Object.keys(args),`${compiled};return {mountWeather}`)(...Object.values(args));
  const host=new Element('div'),weather=mountWeather(host,rect),root=host.children[0],[sky,fall]=root.children;
  const frame=now=>{assert.equal(rafs.size,1,'one owned weather animation callback');const [id,fn]=rafs.entries().next().value;rafs.delete(id);fn(now)};
  const disable=value=>{off=value;for(const fn of diagnostics)fn()};
  return {host,weather,root,sky,fall,canvases,document,window,motion,rafs,timers,diagnostics,frame,disable};
}

// Retained sky geometry/density and source updates, with genuine backing-reset tracking.
{
  const f=fixture(),{weather,root,sky}=f,q=Math.min(1.5,Math.sqrt(1.6e6/(viewport.width*viewport.height)));
  for(const scale of [.042,.23,.65,2,3.932]){
    const cam={x:200,y:300,s:scale};weather.setCamera(cam,viewport,20000);
    assert.equal(Number(sky.dataset.sourceDensity),q,'retention preserves existing sky density');
    assert.ok(sky.width<=Math.ceil((viewport.width+256)*q)+1&&sky.height<=Math.ceil((viewport.height+256)*q)+1,'sky buffer stays viewport bounded');
    const before=Number(root.dataset.skyPresents),draws=sky.calls.filter(c=>c.kind==='draw').length,resizes=sky.resizes.length;
    for(let i=1;i<=80;i++)weather.setCamera({...cam,x:cam.x+i},viewport,20000);
    assert.equal(Number(root.dataset.skyPresents),before,'covered pan does not present sky again');
    assert.equal(sky.calls.filter(c=>c.kind==='draw').length,draws);
    const [tx,ty]=numbers(sky.style.transform),cx=Number(sky.dataset.sourceX),cy=Number(sky.dataset.sourceY),cw=Number(sky.dataset.sourceW),ch=Number(sky.dataset.sourceH);
    // The weather box sits on the outdoor rect in world units; the camera transform carries it.
    const ss=numbers(sky.style.transform)[2];
    assert.ok(Math.abs(tx-(cx-rect.x))<1e-2&&Math.abs(ty-(cy-rect.y))<1e-2&&Math.abs(ss-1/scale)<1e-5,'retained sky follows world coordinates');
    const sx=cam.x+80+(rect.x+tx)*scale,sy=cam.y+(rect.y+ty)*scale;
    assert.ok(sx<=0&&sy<=0&&sx+cw*scale>=viewport.width&&sy+ch*scale>=viewport.height,'sky covers viewport');
    weather.setCamera({...cam,x:cam.x+110},viewport,20000);
    assert.equal(Number(root.dataset.skyPresents),before+1,'sky renews before overscan runs out');
    assert.equal(sky.resizes.length,resizes,'renewing an unchanged sky buffer must not reset its dimensions');
  }
  weather.setCamera({x:200,y:300,s:1},viewport,20000);
  const resizes=sky.resizes.length;
  weather.setCamera({x:200,y:300,s:2},viewport,20000);
  assert.equal(sky.resizes.length,resizes,'zoom must not reset unchanged sky dimensions');
  const before=Number(root.dataset.skyPresents);f.frame(1000);
  assert.ok(Number(root.dataset.skyPresents)>before,'real weather clock still updates sky pixels');
  weather.setCamera({x:0,y:0,s:1},{...viewport,width:500,height:400},20000);
  assert.ok(sky.width<=Math.ceil((500+256)*1.5)+1&&sky.height<=Math.ceil((400+256)*1.5)+1,'viewport shrinking releases excess sky backing');
  const smallResizes=sky.resizes.length;
  for(const s of [.0421,.0503,.1177,.2301,.6513,1.0023,2.0137,3.9321])weather.setCamera({x:200,y:300,s},{...viewport,width:500,height:400},20000);
  assert.equal(sky.width,1134);assert.equal(sky.height,984);
  assert.equal(sky.style.width,'756px');assert.equal(sky.style.height,'656px');
  assert.equal(sky.resizes.length,smallResizes,'fractional zoom must not create floating-point backing size jitter');
  destroy(f);
}

function numbers(value){return value.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number)}
function strokes(f){return f.fall.calls.filter(c=>c.kind==='stroke'&&c.path.some(p=>p[0]==='line'))}
function assertRainCoverage(f,cam){
  // The canvas is placed in world units inside the outdoor box; map it to the screen.
  const [lx,ly,k]=numbers(f.fall.style.transform),x=cam.x+(rect.x+lx)*cam.s,y=cam.y+(rect.y+ly)*cam.s,scale=k*cam.s,w=f.fall.width*scale,h=f.fall.height*scale;
  assert.ok(x<=.01&&y<=.01&&x+w>=viewport.width-.01&&y+h>=viewport.height-.01,'precipitation covers all exposed pixels immediately after camera changes');
  assert.ok(f.fall.width*f.fall.height<=1.61e6,'existing particle backing cap is unchanged');
  const expectedQ=Math.min(1.5*.7,Math.sqrt(1.6e6/(viewport.width*viewport.height*1.24**2)));
  assert.equal(f.fall.width,Math.round(viewport.width*1.24*expectedQ),'existing particle pixel density is unchanged');
  const paths=strokes(f).slice(-3);assert.equal(paths.length,3,'all original rain depth layers are drawn');
  const quadrants=new Set();
  for(const path of paths){
    const [a,,,d,e,g]=path.transform;
    assert.ok(path.width>0&&path.alpha>0);
    for(const [,px,py] of path.path){
      const actualX=x+(a*px+e)*scale,actualY=y+(d*py+g)*scale;
      assert.ok(Math.abs(actualX-(cam.x+(rect.x+px)*cam.s))<.02&&Math.abs(actualY-(cam.y+(rect.y+py)*cam.s))<.02,'drawn rain retains exact source world mapping');
      if(actualX>=0&&actualY>=0&&actualX<viewport.width&&actualY<viewport.height)quadrants.add(`${actualX<viewport.width/2}|${actualY<viewport.height/2}`);
    }
  }
  assert.equal(quadrants.size,4,'actual rain paths reach every quadrant, not just an empty full-size canvas');
}

{
  const f=fixture(),cam={x:200,y:300,s:.65};
  f.weather.set({kind:'rain',isDay:true,windKmh:10,windDir:250},{night:0,season:'summer'});
  f.weather.setCamera(cam,viewport,20000);f.frame(1000);assertRainCoverage(f,cam);
  const original=strokes(f).slice(-3),scheduled=[...f.timers],clears=f.fall.calls.filter(c=>c.kind==='clear').length;
  f.weather.setCamera({...cam,x:cam.x+80},viewport,20000);
  assert.equal(f.fall.calls.filter(c=>c.kind==='clear').length,clears,'covered pan retains precipitation pixels');
  // No animation callback runs during these fast pans and zooms.
  for(const next of [{x:950,y:640,s:.65},{x:200,y:300,s:.23},{x:-500,y:150,s:2},{x:-6000,y:300,s:.65},cam]){
    f.weather.setCamera(next,viewport,20000);assertRainCoverage(f,next);
    assert.deepEqual([...f.timers],scheduled,'crop renewal does not accelerate or duplicate weather timers');
    assert.equal(f.rafs.size,0,'crop renewal adds no animation callback');
  }
  assert.ok(JSON.stringify(strokes(f).slice(-3).map(p=>p.path))===JSON.stringify(original.map(p=>p.path)),'camera renewal does not advance rain time or alter its artwork');
  assert.equal(scheduled[0][1].delay,30,'existing near weather cadence remains unchanged');

  f.document.hidden=true;f.document.emit('visibilitychange');
  assert.equal(f.timers.size+f.rafs.size,0,'hidden weather cancels pending owned work');
  const count=()=>f.sky.calls.length+f.fall.calls.length+f.sky.resizes.length;
  const before=count(),hiddenCam={x:700,y:600,s:.23};
  f.weather.setCamera(hiddenCam,viewport,20000);assert.equal(count(),before,'hidden camera must not raster weather');
  f.document.hidden=false;f.document.emit('visibilitychange');f.frame(2000);assertRainCoverage(f,hiddenCam);
  assert.equal([...f.timers.values()][0].delay,80,'existing overview cadence remains unchanged');

  f.disable(true);const disabled=count();
  f.weather.setCamera(cam,viewport,20000);assert.equal(count(),disabled,'diagnostic suspension also stops camera-driven painting');
  assert.equal(f.timers.size+f.rafs.size,0);
  f.disable(false);f.frame(3000);assertRainCoverage(f,cam);
  const beforeResize=f.fall.calls.length;
  f.weather.resize({...rect,x:rect.x-400,y:rect.y-400});
  f.weather.setCamera(hiddenCam,viewport,20000);
  assert.ok(f.fall.calls.length>beforeResize,'moving outdoor geometry invalidates retained precipitation coordinates');
  f.weather.flash();assert.equal(f.host.children[1].getAnimations().length,1);
  destroy(f);
}

// Rain stays a fine streak across zoom levels, and stronger rain adds distinct
// drops instead of retracing the same bright paths. Camera motion still leaves
// the rain clock unchanged (covered above).
for(const kind of ['drizzle','rain','storm']) {
  for(const scale of [.042,.23,.65,2,3.932]) {
    const f=fixture();
    f.weather.set({kind,isDay:true,windKmh:10,windDir:250},{night:0,season:'summer'});
    f.weather.setCamera({x:200,y:300,s:scale},viewport,20000);
    if(f.rafs.size)f.frame(1000);
    for(const path of strokes(f).slice(-3)) {
      const width=path.width*scale;
      assert.ok(width>=.55-1e-8&&width<=1.05+1e-8,'rain remains fine at every zoom');
      assert.ok(path.alpha<=.33,'rain highlights remain translucent');
      const positions=new Set();
      for(let i=0;i<path.path.length;i+=2) {
        const [,x,y]=path.path[i], [,ex,ey]=path.path[i+1];
        const length=Math.hypot(x-ex,y-ey)*scale;
        assert.ok(length>=width*3,'distant rain remains a streak rather than a round dot');
        assert.ok(length<=40,'close rain does not become an oversized foreground bar');
        const key=`${x},${y}`;
        assert.ok(!positions.has(key),'storm must not retrace duplicate drops');
        positions.add(key);
      }
    }
    destroy(f);
  }
}

function destroy(f){
  const animations=f.host.children.flatMap(node=>node.getAnimations());
  f.weather.destroy();
  assert.equal(f.host.children.length,0);assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);assert.equal(f.diagnostics.size,0);
  for(const target of [f.document,f.window,f.motion])for(const listeners of target.listeners.values())assert.equal(listeners.size,0,'owned event listeners are released');
  assert.ok(f.canvases.every(c=>c.width===0&&c.height===0),'all owned canvas and sprite backings are released');
  assert.ok(animations.every(a=>a.cancelled),'owned lightning animation is cancelled');
  f.weather.set({kind:'rain'},{night:0});f.weather.setCamera({x:200,y:300,s:1},viewport,20000);f.weather.resize(rect);f.weather.flash();
  assert.ok(f.canvases.every(c=>c.width===0&&c.height===0),'stale public calls cannot resurrect released backings');
  assert.equal(f.rafs.size+f.timers.size,0,'stale public calls cannot restart weather');
}
console.log('PASS: sky backing reuse/density; retained pan and immediate rain coverage/world mapping; rain proportions and unique storm drops; camera-stable clock/cadence; hidden/diagnostic resume; graphics/timer/listener cleanup');
