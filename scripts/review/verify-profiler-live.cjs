const assert=require('node:assert/strict');
let cleanup=async()=>{};
const deadline=setTimeout(()=>{console.error('Native test exceeded 25 seconds');void cleanup().finally(()=>process.exit(1))},25000);
const fs=require('node:fs'),path=require('node:path');
(async()=>{
const targets=await (await fetch((process.env.LUCID_PROFILE_ENDPOINT || 'http://127.0.0.1:60111')+'/json',{signal:AbortSignal.timeout(3000)})).json();
const target=targets.find(t=>t.type==='page'&&t.url.includes('/dist/index.html'));
if(!target)throw Error('No existing delivered page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(d.error.message)):p.resolve(d.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(method+' exceeded 3 seconds')),3000);pending.set(++id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id,method,params}));});
let owned=false;
cleanup=async()=>{try{if(owned && ws.readyState===WebSocket.OPEN){const state=await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true});if(state.result.value){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119});await new Promise(r=>setTimeout(r,1800));assert.equal((await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true})).result.value,false);}}}finally{ws.close();}};
console.log(JSON.stringify({target:target.url,before:await call('Runtime.evaluate',{expression:'JSON.stringify({timeOrigin:performance.timeOrigin,recording:!!window.__stopLucidRecording})',returnByValue:true})}));
assert.equal((await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true})).result.value,false);
for(let i=0;i<2;i++){owned=true;await call('Input.dispatchKeyEvent',{type:'keyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119});await new Promise(r=>setTimeout(r,3500));assert.equal((await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true})).result.value,true);console.log(JSON.stringify({recording:i,state:await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true})}));await call('Input.dispatchKeyEvent',{type:'keyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119});await new Promise(r=>setTimeout(r,1800));}
assert.equal((await call('Runtime.evaluate',{expression:'!!window.__stopLucidRecording',returnByValue:true})).result.value,false);ws.close();clearTimeout(deadline);
})().catch(async e=>{console.error(e);clearTimeout(deadline);try{await cleanup()}catch(error){console.error('Capture cleanup failed',error)}process.exitCode=1});

