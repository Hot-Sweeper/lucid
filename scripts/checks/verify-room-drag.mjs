import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile = async f => (await transformWithOxc((await readFile(new URL(f, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, ''), f)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const helpers = await compile('../../src/office/room-order.ts');
const { orderedRooms, moveRoomOrder, roomDropSlot, wireRoomDrag } = new Function(`${helpers}\n${await compile('../../src/office/room-drag.ts')};return {orderedRooms,moveRoomOrder,roomDropSlot,wireRoomDrag}`)();
const visible=['p:a','p:b','freelance'];
assert.deepEqual(orderedRooms(visible.map(id=>({id})),['p:b','p:a']).map(r=>r.id),['p:b','p:a','freelance']);
assert.deepEqual(moveRoomOrder(['p:a','p:hidden','p:b','freelance'],visible,'p:a',null),['p:b','p:hidden','freelance','p:a']);
assert.deepEqual(moveRoomOrder([],visible,'freelance','p:a'),['freelance','p:a','p:b']);
assert.equal(moveRoomOrder([],visible,'main','p:a'),null);
assert.equal(moveRoomOrder([],visible,'p:a','missing'),null);
assert.equal(moveRoomOrder([],visible,'p:a','p:b'),null);
assert.equal(moveRoomOrder([],visible,'p:a','p:a'),null);
const rectangles=[{id:'p:a',title:'A',left:100,top:50,width:300,height:200},{id:'p:b',title:'B',left:450,top:50,width:300,height:200},{id:'freelance',title:'Freelancers',left:100,top:300,width:300,height:200}];
assert.equal(roomDropSlot(rectangles,'p:a',480,110).before,'p:b');
assert.equal(roomDropSlot(rectangles,'p:a',710,150).before,'freelance');
assert.equal(roomDropSlot(rectangles,'p:a',200,480).before,null);
assert.equal(roomDropSlot(rectangles,'p:a',1100,750),null);
assert.equal(roomDropSlot(rectangles,'p:a',710,60,true).before,'p:b','sidebar uses row half, not horizontal position');

class Classes { set=new Set(); add(...v){v.forEach(x=>this.set.add(x))} remove(...v){v.forEach(x=>this.set.delete(x))} toggle(v,on){if(on)this.add(v);else this.remove(v)} contains(v){return this.set.has(v)} }
class Element extends EventTarget {
  dataset={};classList=new Classes();style={};children=[];hidden=false;textContent='';offsetWidth=140;offsetHeight=40;
  constructor(rect={left:0,top:0,width:0,height:0}){super();this.rect={...rect,right:rect.left+rect.width,bottom:rect.top+rect.height};}
  closest(selector){return this.handle&&selector.includes('room-sign-hit')?this:null}
  setAttribute(){} setPointerCapture(){} releasePointerCapture(){}
  getBoundingClientRect(){return this.rect}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
  querySelectorAll(){return []}
}
const body=new Element(),win=new EventTarget();win.setTimeout=setTimeout;win.getSelection=()=>({removeAllRanges(){}});
globalThis.window=win;globalThis.innerWidth=1200;globalThis.innerHeight=800;
globalThis.document={body,createElement:()=>new Element()};
globalThis.KeyboardEvent=class extends Event { constructor(type,o){super(type,{cancelable:true});Object.assign(this,o)} };
const event=(type,o={})=>{const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(o))Object.defineProperty(e,k,{value:v});return e};
const scene=new Element({left:0,top:0,width:1000,height:800}),list=new Element({left:1050,top:0,width:150,height:700});
const handle=new Element();handle.handle=true;handle.dataset.roomId='p:a';
const rooms=rectangles.map(r=>({...r,kind:'project',el:new Element(r)}));
const holds=[],moves=[];
const dispose=wireRoomDrag({scene,list,rooms:()=>rooms,hold:v=>holds.push(v),reorder:(id,before)=>{moves.push({id,before});return true}});
const down=()=>scene.dispatchEvent(event('pointerdown',{target:handle,button:0,pointerId:7,clientX:110,clientY:60}));
const move=()=>handle.dispatchEvent(event('pointermove',{clientX:710,clientY:150,pointerId:7}));
down();handle.dispatchEvent(event('pointerup'));assert.deepEqual(holds,[]);assert.deepEqual(moves,[],'short click does not reorder');
down();move();assert.deepEqual(holds,[true]);assert.equal(body.children.length,2);assert.ok(body.children.some(e=>e.textContent.includes('after B')));
handle.dispatchEvent(event('pointerup'));assert.deepEqual(moves,[{id:'p:a',before:'freelance'}]);assert.deepEqual(holds,[true,false]);assert.equal(body.children.length,0);
down();move();win.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));assert.equal(moves.length,1);assert.equal(holds.at(-1),false);assert.equal(body.children.length,0);assert.ok(!body.classList.contains('room-dragging'));
down();move();handle.dispatchEvent(event('lostpointercapture'));assert.equal(moves.length,1);assert.equal(holds.at(-1),false);
down();move();win.dispatchEvent(event('blur'));assert.equal(moves.length,1);assert.equal(body.children.length,0);
down();move();handle.dispatchEvent(event('pointermove',{clientX:1190,clientY:790,pointerId:7}));handle.dispatchEvent(event('pointerup'));assert.equal(moves.length,1,'outside drop cancels without reordering');
down();move();dispose();assert.equal(holds.at(-1),false);assert.equal(body.children.length,0);
console.log('Room drag passed: saved/hidden order, utility invariants, drop slots, short-click, real preview, hold lifecycle, valid drop, Escape, lost capture, blur, outside drop and disposal.');
