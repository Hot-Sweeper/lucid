import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const compile=async file=>(await transformWithOxc((await readFile(new URL(file,import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,''),file)).code;
const layout=await compile('../src/world/question-layout.ts');
const questionPlaces=new Function(layout+';return questionPlaces')();
for(let active=0;active<=9;active++){
  const people=Array.from({length:9},(_,i)=>({id:String(i),needsDesk:i<active}));
  const places=questionPlaces(people,720,800);
  assert.equal(places.size,9);
  const line=[...places.values()].filter(p=>p.zone==='line');
  assert.equal(line.length,Math.min(active,3));assert(line.every(p=>p.x===360));
  const all=[...places.values()];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert(Math.hypot(all[i].x-all[j].x,all[i].y-all[j].y)>=123);
  const reservations=new Map([...places].filter(([,p])=>p.zone==='waiting').map(([id,p])=>[id,p.key]));
  const again=questionPlaces(people,720,800,reservations);
  for(const[id,p]of places)assert.equal(again.get(id).key,p.key);
}
let now=0;const timers=[];
const gsap={killTweensOf(){},delayedCall(delay,fn){const t={at:now+delay,fn,active:true,kill(){this.active=false}};timers.push(t);return t;}};
const tick=async seconds=>{const end=now+seconds;let n=0;while(true){const t=timers.filter(t=>t.active&&t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!t)break;assert(++n<500,'timers must yield');now=t.at;t.active=false;await t.fn();await Promise.resolve();}now=end;};
class Walker{
  constructor(_host,o){this.id=o.id;this.x=0;this.y=0;this.name=o.name;this.look=o.look;this.model=o.model;this.el={addEventListener(){}};this.speech=[];}
  setLook(v){this.look=v;}setName(v){this.name=v;}setPos(x,y){this.x=x;this.y=y;} async walkPath(path){for(const p of path)this.setPos(p.x,p.y);} stop(){} calm(){} setRunning(v){this.running=v;} face(v){this.facing=v;} setCard(v){this.card=v;} setModel(v){this.model=v;} do(v){this.activity=v;}say(v){this.speech.push(v);}poke(){}destroy(){this.destroyed=true;}
}
const queueCode=(await compile('../src/world/queue.ts')).replace(/export\s*\{[\s\S]*?\};?\s*$/,'');
const QuestionLine=new Function('gsap','Walker','questionPlaces','document',queueCode+';return QuestionLine')(gsap,Walker,questionPlaces,{hidden:false});
const q=Object.create(QuestionLine.prototype);
Object.assign(q,{w:720,h:800,line:[],entries:new Map(),verdicts:new Map(),reservations:new Map(),reports:new Set(),opened:false,stage:{layer:{}},door:{x:360,y:748},out:{x:360,y:870},el:{closest(){return null}},boss:{greet(){},passed(){},answered(){},read(){},heard(){}},ding(){}});
const people=Array.from({length:9},(_,i)=>({id:String(i),provider:'codex',title:'Question '+i,question:'Question '+i}));
const receipts=[];q.onReportArrived=id=>receipts.push(id);
q.setThreads(people);await tick(0);
assert(q.line.filter(r=>!r.waiting).every(r=>r.w.facing==='up'),'queued visitors show their backs toward the camera');
assert(q.line.filter(r=>r.waiting).every(r=>r.w.facing==='down'),'waiting visitors face into the room');
q.line[1].w.face('left');q.setThreads(people);
assert.equal(q.line[1].w.facing,'up','unchanged queue placement repairs a stale travel direction');
const customized=people.map((p,i)=>({...p,name:'Robot '+i,look:{hat:'beanie',tint:'mint',accessory:'scarf',accent:'#e2434b'}}));
const firstActor=q.line[0].w;q.setThreads(customized);
assert.equal(q.line[0].w,firstActor,'customization refresh preserves the actor');assert.deepEqual(firstActor.look,customized[0].look);assert.equal(firstActor.name,'Robot 0');
assert.equal(q.line.filter(r=>!r.waiting).length,3);assert.equal(q.line.filter(r=>r.waiting).length,6);
q.decision('0','asked');await tick(0);
assert.equal(q.line.find(r=>r.id==='0').waiting,true);assert.equal(q.line.find(r=>r.id==='1').slot,0,'manual question must release the service counter');
q.setThreads(people.map(p=>({...p,report:['1','2','3'].includes(p.id)})));
// Re-enter to exercise physical paper receipt, without a model verdict.
q.line.find(r=>r.id==='1').place=undefined;q.reflow();await tick(5);
assert.deepEqual(receipts,['1','2','3'],'three papers can be received while the first review remains pending');
assert(q.line.filter(r=>r.delivered).every(r=>r.waiting));
await tick(30);assert(q.line.some(r=>r.w.speech.some(s=>/going|coffee|wait here/.test(s??''))),'overflow visitors chat');
for(const p of q.line){for(const t of p.timers)t.kill();p.timers=[];}
if(q.conversation)q.endConversation(q.conversation.a);
const speaker=q.line.find(p=>p.waiting&&p.settled);q.chatLater(speaker);await tick(speaker.timers.at(-1).at-now+.01);
const c=q.conversation;assert(c,'one nearby pair starts a conversation');
assert.equal(q.line.filter(p=>['talk','listen'].includes(p.w.activity)).length,2,'only one pair converses, without overlapping conversations');
const opposite={up:'down',down:'up',left:'right',right:'left'};assert.equal(c.a.w.facing,opposite[c.b.w.facing],'partners face each other in two dimensions');
assert(Math.hypot(c.a.w.x-c.b.w.x,c.a.w.y-c.b.w.y)<230,'no shouting across the room');
await tick(2.7);assert.equal(c.a.w.activity,'listen');assert.equal(c.b.w.activity,'talk','listener replies after the first turn');
c.b.place=undefined;q.reflow();await tick(0);assert.equal(q.conversation,null,'moving either partner ends the conversation');
assert.equal(c.a.w.activity,'wait');assert.equal(c.a.w.facing,'down','conversation ends in the front-facing waiting pose');assert.equal(c.a.w.speech.at(-1),null,'interrupted partner clears its speech');
assert(q.line.every(r=>r.timers.length<8),'completed cosmetic timers are released');
// A brief question disappearance must never create a second physical robot.
const returning=q.line.find(r=>r.alive), returningActor=returning.w;
const without=people.filter(p=>p.id!==returning.id);
q.setThreads(without);
assert.equal(returning.alive,false);
assert(q.line.includes(returning),'departing actor stays tracked until the door handoff');
q.setThreads(people);await tick(0);
assert.equal(q.line.find(r=>r.id===returning.id).w,returningActor,'returning question reuses its departing actor');
assert.equal(q.line.filter(r=>r.id===returning.id).length,1);
await tick(4);
assert(!returningActor.destroyed,'stale exit cannot destroy a robot that returned');
assert(returning.alive&&returning.settled,'returning visitor resumes its queue place');
const pendingBefore=timers.filter(t=>t.active).length;
q.monitor={destroy(){}};q.boss.clear=()=>{};q.stage.destroy=()=>{};q.anims=[];q.$={};
const actors=[...q.line];q.destroy();assert(pendingBefore>0);assert(actors.every(r=>!r.alive),'room teardown invalidates pending movement continuations');assert.equal(timers.filter(t=>t.active).length,0);
const delegateCode=(await compile('../src/office/delegate.ts')).replace(/export\s*\{[\s\S]*?\};?\s*$/,'');
let waiting=true,sleeps=0;
const {Delegate,RESOLVED,PAUSED}=new Function('answerFor','location','setTimeout','window',delegateCode+';return {Delegate,RESOLVED,PAUSED}')(()=>null,{search:'?app=1'},fn=>{sleeps++;waiting=false;fn();},{});
const d=Object.create(Delegate.prototype);let state={threadId:'boss',auto:true,paused:false};
Object.assign(d,{appWindow:true,get:()=>state,api:{pendingRequests:async()=>waiting?[{id:'req'}]:[],repliesSince:async()=>({messages:[],runStatus:'running',exists:true})}});
assert.equal(await d.awaitReply('boss','now','Q-test',{threadId:'worker',id:'req'}),RESOLVED);assert.equal(sleeps,1,'resolved requests release the queue at the next poll, not after 150 seconds');
state.paused=true;assert.equal(await d.awaitReply('boss','now','Q-test'),PAUSED);
state.paused=false;waiting=true;let reads=0;d.api.repliesSince=async()=>{reads++;return{messages:[{streaming:false,text:'{"request":"Q-test"}'}],exists:true,runStatus:'completed'}};
assert.equal((await d.awaitReply('boss','now','Q-test',{threadId:'worker',id:'req'})).request,'Q-test');assert.equal(reads,1);assert.equal(sleeps,1,'completed replies need no initial polling sleep');
console.log(JSON.stringify({ok:true,checks:['single FIFO line','stable separated waiting spots','saved appearance refresh without recreating actor','manual question releases counter','three receipts without waiting for review','one nearby conversation with opposite facing and sequential turns','either partner moving cancels speech','bounded timers','resolved decision cancellation','global pause cancellation','immediate completed reply']}));
