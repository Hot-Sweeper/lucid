import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (path, names, deps = {}) => {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const code = (await transformWithOxc(source, path)).code.replace(/^import .*$/gm, '').replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
  return new Function(...Object.keys(deps), code + '; return {' + names + '};')(...Object.values(deps));
};
const { Director } = await load('src/director.ts', 'Director', { imageGenOf: () => null });
const item = {id:'reply',runId:'run',type:'assistant_message',status:'running',data:{text:'Done.',streaming:true}};
for (const status of ['completed','failed','interrupted','cancelled','canceled','error','running']) {
  let response;
  const chat = { activity(){}, async assistant(get){ response=get(); } };
  const d = Object.assign(Object.create(Director.prototype), { info:{run:{id:'run',status}}, items:new Map([['reply',item]]), untilPresent:async()=>{},idleLife:{},stage:{say(){},setGlow(){}},chat,nativeMessages:chat,wm:{sleep:async()=>{}},onActivity(){} });
  await d.play('reply');
  assert.equal(response.done, status !== 'running', status + ' overrides stale streaming only after the run ends');
  if (status === 'completed') { d.info.run.id='new-run'; await d.play('reply'); assert.equal(response.done,false,'a different run cannot terminate this reply'); }
}
const { T3CodeApp } = await load('src/harness/t3code.ts', 'T3CodeApp', { ICONS: {}, renderFps:()=>true, presentationFrame:async()=>{} });
const classes={add(){},remove(){}};
globalThis.document={createElement:()=>({classList:classes,remove(){}})};
for (const streaming of [false,true]) {
  const hands=[]; let reads=0;
  const app=Object.assign(Object.create(T3CodeApp.prototype), {wm:{epoch:1,robot:{setTyping:v=>hands.push(v)},sleep:async()=>{},check(){}},ensure:async()=>{},closeGroup(){},feed:{append(){}},compText:{},comp:{classList:classes},send:{classList:classes},stick(){} });
  await app.assistant(()=>({text:'A finished response.',done:!streaming || ++reads>2}),true);
  assert.equal(hands.at(-1),false,'hands stop after delivery');
  assert.equal(hands.includes(true),streaming,'only a live response animates typing');
}
delete globalThis.document;
const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const push=new Function('chat',main.slice(main.indexOf('function pushStatus('),main.indexOf('// Dev aid:')).replace(/: Desk/g,'').replace(/ as any/g,'')+';return pushStatus');
for(const run of ['completed','failed','interrupted','cancelled','queued','running']) {
 let typing,label;const update=push({setStatus:text=>label=text,setTyping:on=>typing=on});
 update({info:{run:{status:run}},activity:'Writing to you'});
 assert.equal(typing,run==='running');
 if(!['queued','running'].includes(run)) assert.equal(label,'Finished');
 update({info:{run:{status:run},question:true},activity:'Writing to you'});assert.equal(typing,false);
}
console.log('PASS: finished run beats stale streaming, run identity isolation, live typing preserved, completed replies skip replay, stopped hands, and chat status gating.');
