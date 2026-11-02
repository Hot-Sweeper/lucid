// Read-only capture of the actual loaded bundle, for repeatable rendering diagnostics.
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const out = path.resolve(process.argv[2]); fs.mkdirSync(path.join(out, 'assets'), {recursive:true});
  const pages = await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const page = pages.find(p=>p.type==='page' && p.url.includes('dist/index.html'));
  if(!page) throw Error('No live Lucid page');
  const ws = new WebSocket(page.webSocketDebuggerUrl), pending=new Map(), scripts=[];
  let seq=0;
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(d.error.message)):p.resolve(d.result)}else if(d.method==='Debugger.scriptParsed')scripts.push(d.params)});
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  const result=await call('Runtime.evaluate',{expression:`(()=>{const w=window.__world;return JSON.stringify({href:location.href,hidden:document.hidden,assets:[...document.scripts].map(s=>s.src).filter(Boolean),css:[...document.querySelectorAll('link[rel=stylesheet]')].map(s=>s.href),data:w.lastData,cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},desks:w.desks.size})})()`,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  const state=JSON.parse(result.result.value); if(!state?.data)throw Error('Live world unavailable');
  const native=await call('Runtime.evaluate',{expression:`document.querySelector('.outside-native')?.shadowRoot?.querySelector('svg')?.outerHTML`,returnByValue:true});
  if(native.result.value)fs.writeFileSync(path.join(out,'native-source.svg'),native.result.value);
  await call('Debugger.enable');
  const asset=state.assets.find(u=>u.includes('/assets/index-'));
  const script=scripts.find(s=>s.url===asset);if(!script)throw Error('Live compiled script unavailable');
  fs.writeFileSync(path.join(out,'assets',path.basename(new URL(asset).pathname)),(await call('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource);
  await call('Page.enable');
  const tree=(await call('Page.getResourceTree')).frameTree;
  for(const url of state.css){const r=await call('Page.getResourceContent',{frameId:tree.frame.id,url});fs.writeFileSync(path.join(out,'assets',path.basename(new URL(url).pathname)),r.base64Encoded?Buffer.from(r.content,'base64'):r.content)}
  for(const file of fs.readdirSync(path.resolve('dist/assets')))if(!/^index-.*\.(js|css)$/.test(file))fs.copyFileSync(path.resolve('dist/assets',file),path.join(out,'assets',file));
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><title>Lucid rendering diagnostic</title>${state.css.map(u=>`<link rel="stylesheet" href="./assets/${path.basename(new URL(u).pathname)}">`).join('')}<script type="module" src="./assets/${path.basename(new URL(asset).pathname)}"></script></head><body><div id="app"></div></body></html>`);
  fs.writeFileSync(path.join(out,'live-state.json'),JSON.stringify(state,null,2));
  console.log(JSON.stringify({asset,hidden:state.hidden,desks:state.desks,viewport:state.viewport,captured:out}));
  ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
