import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile=async name=>(await transformWithOxc((await readFile(new URL(`../../src/${name}.ts`,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),`${name}.ts`)).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const {setDetailScene,paintDetailScene,clearDetailScene}=new Function(`${await compile('perf/detail-scene')};return {setDetailScene,paintDetailScene,clearDetailScene}`)();
const el={style:{getPropertyValue(){return '0';},setProperty(){}}};
const calls=[];const ctx=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
setDetailScene(el,{width:960,height:540,background:'#fff',shapes:[{x:10,y:10,w:200,h:100,color:'#12ab34'},{x:20,y:40,w:100,h:3,color:'#111',text:true}]});
assert.equal(paintDetailScene(ctx,el,{x:0,y:0,w:480,h:270},'lines'),true);
assert.equal(calls.filter(c=>c[0]==='fill').length,2,'Lines preserve real text bounds');calls.length=0;
paintDetailScene(ctx,el,{x:0,y:0,w:480,h:270},'shapes');assert.equal(calls.filter(c=>c[0]==='fill').length,1,'Shapes remove text geometry');
clearDetailScene(el);assert.equal(paintDetailScene(ctx,el,{x:0,y:0,w:480,h:270},'lines'),false);
const {localFrontendUrl,frontendUrlFromOutput}=new Function(`${await compile('os/frontend')};return {localFrontendUrl,frontendUrlFromOutput}`)();
assert.equal(frontendUrlFromOutput('VITE ready\nLocal: http://localhost:5173/'),'http://localhost:5173/');
assert.equal(frontendUrlFromOutput('https://example.com/api'),null);assert.equal(localFrontendUrl('http://localhost.evil.test'),null);
console.log('Frontend layout: real scene geometry, line/shape filtering, release and streaming URL detection passed.');

for (const output of [
  'curl http://127.0.0.1:5711',
  'curl: (7) Failed to connect to http://127.0.0.1:5711',
  'API endpoint: http://localhost:3000/api',
  'fetch("http://localhost:3000")',
]) assert.equal(frontendUrlFromOutput(output), null, output);
assert.equal(frontendUrlFromOutput('Server listening on http://127.0.0.1:3000'), 'http://127.0.0.1:3000/');
const director = await readFile(new URL('../../src/director.ts',import.meta.url),'utf8');
assert.ok(!director.includes('frontendUrlFromOutput(String(it.data.input'), 'Shell input cannot announce a frontend');
