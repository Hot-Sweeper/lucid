// Exercise the production window manager without Electron or a GPU. The fake tween
// clock exposes the intermediate states where moving opaque windows uncovered blanks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../../src/os/wm.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source.replace(/^import .*;\r?\n/gm, ''), 'wm.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const tweens = [];
const gsap = { to: (target, vars) => { const tween={ target, vars };tweens.push(tween);return tween; } };
const { WM } = new Function('gsap', 'ICONS', 'wakeRender', 'renderFps', 'CHAT_TITLE', `${code};return {WM}`)(gsap, {}, () => {}, () => 60, 'Chat');
const el = (frame, z) => {
  const classes=new Set();
  return { style:{left:`${frame.x}px`,top:`${frame.y}px`,width:`${frame.w}px`,height:`${frame.h}px`,zIndex:String(z)},dataset:{},querySelector:()=>null,classList:{contains:c=>classes.has(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c),add:c=>classes.add(c),remove:c=>classes.delete(c)} };
};
const wm=Object.create(WM.prototype);
wm.wins=new Map();wm.movingWindows=new Map();wm.unmax=new Map();wm.speed=1;
wm.pointAt=async()=>{};wm.click=async()=>{};wm.sleep=async()=>{};
const full={x:4,y:4,w:812,h:403}, small={x:40,y:30,w:300,h:240};
const lower={id:'game',el:el(small,10)},upper={id:'notes',el:el(full,11)};
wm.wins.set(lower.id,lower);wm.wins.set(upper.id,upper);
const finish=()=>{
  const tween=tweens.shift();assert.ok(tween,'Expected geometry tween');
  for(const k of ['left','top','width','height'])if(tween.vars[k]!=null)tween.target.style[k]=typeof tween.vars[k]==='number'?`${tween.vars[k]}px`:tween.vars[k];
  tween.vars.onComplete();
};
wm.syncOcclusion();assert.equal(lower.el.dataset.renderHidden,'1');
wm.animateFrame(upper,{x:500,y:40,w:300,h:240},.3);
assert.equal(lower.el.dataset.renderHidden,'0','Starting a move exposes the real underlying app before its next paint');
finish();assert.equal(lower.el.dataset.renderHidden,'0','Finishing a move keeps uncovered content visible');
wm.animateFrame(upper,full,.3);finish();assert.equal(lower.el.dataset.renderHidden,'1');

await wm.maximize('notes');assert.equal(lower.el.dataset.renderHidden,'0','Maximize must resume underlying content throughout its tween');
finish();assert.equal(lower.el.dataset.renderHidden,'1');
wm.unmax.set('notes',{left:'500px',top:'40px',width:'300px',height:'240px'});
await wm.unmaximize('notes');assert.equal(lower.el.dataset.renderHidden,'0','Restoring a window must immediately uncover its old opaque rectangle');
finish();assert.equal(lower.el.dataset.renderHidden,'0');

wm.animateFrame(upper,full,.3);
const endNested=wm.beginWindowMove(upper);
finish();assert.equal(lower.el.dataset.renderHidden,'0','One completed tween must not retire another active movement');
endNested();assert.equal(lower.el.dataset.renderHidden,'1');
endNested();assert.equal(wm.movingWindows.size,0,'Movement completion is idempotent');
wm.animateFrame(upper,{x:500,y:40,w:300,h:240},.3);
tweens.shift().vars.onInterrupt();assert.equal(wm.movingWindows.size,0,'Interrupted geometry tweens release occlusion ownership');
assert.equal(lower.el.dataset.renderHidden,'1');
upper.el.classList.add('render-opening');wm.syncOcclusion();assert.equal(lower.el.dataset.renderHidden,'0','Translucent entrance windows must not occlude opaque content');
console.log('PASS: move, maximize, restore, nested movement, interruption and entrance occlusion preserve real app bodies');
