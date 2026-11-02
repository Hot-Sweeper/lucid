// Runs before the production entry point. The desktop remains the only supervisor.
const entry = document.querySelector('script[data-entry]')?.dataset.entry;
let client, events, closed = false, savedSettings = '{}', savedRoster = '[]';
let reconnecting=null, probe=null, watchedIds=[];
const listeners = new Map();
const off = channel => fn => {
  if (!listeners.has(channel)) listeners.set(channel,new Set());
  listeners.get(channel).add(fn);
  return () => listeners.get(channel)?.delete(fn);
};
const dispatch = (channel,payload) => {for(const fn of listeners.get(channel)||[])fn(payload);};
function notice(text) {
  let node=document.getElementById('remote-connection');
  if(!node){node=document.createElement('p');node.id='remote-connection';node.setAttribute('role','status');node.style.cssText='position:fixed;left:12px;right:12px;top:env(safe-area-inset-top,0px);z-index:1000001;margin:8px 0;padding:12px;background:#20264b;color:#f5f2ff;border-radius:8px;font:14px Lexend,system-ui';document.body.append(node);}
  node.textContent=text;node.hidden=!text;
}
async function reconnect(){
  if(reconnecting)return reconnecting;
  reconnecting=(async()=>{
    const res=await fetch('/__lucid/bootstrap',{cache:'no-store'}),data=await res.json();
    if(!res.ok)throw Error(data.error||'The desktop is unavailable.');
    client=data.client;events?.close();events=null;
    if(watchedIds.length&&!document.hidden)await call('lucid','watchSet',[watchedIds],true);
    stream();
  })().finally(()=>{reconnecting=null;});
  return reconnecting;
}
async function call(namespace,method,args=[],retry=false) {
  if(!navigator.onLine)throw Error('Your phone is offline. Reconnect to Tailscale, then try again.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  try{
    const res=await fetch('/__lucid/call',{method:'POST',headers:{'Content-Type':'application/json','X-Lucid-Client':client},body:JSON.stringify({namespace,method,args}),signal:controller.signal});
    const result=await res.json();
    if(res.status===401&&!retry){await reconnect();return call(namespace,method,args,true);}
    if(!res.ok||!result.ok) throw Error(result.error||'Lucid could not complete this request. Try again.');
    return result.value;
  }catch(e){if(e.name==='AbortError')throw Error('The desktop took too long to answer. Check the connection, then retry.');throw e;}
  finally{clearTimeout(timer);}
}
function stream(){
  if(closed||document.hidden||events)return;
  events=new EventSource('/__lucid/events?client='+encodeURIComponent(client));
  events.onopen=()=>{notice('');window.__refresh?.();};
  events.onmessage=e=>{try{const {channel,payload}=JSON.parse(e.data);if(channel==='lucid:resync'){void call('lucid','watchSet',[[]]).then(()=>call('lucid','watchSet',[watchedIds])).catch(()=>{});}else dispatch(channel,payload);}catch{}};
  events.onerror=()=>{notice('Reconnecting to your desktop. Unsent text stays here.');if(!probe)probe=call('lucid','remoteState').catch(()=>{}).finally(()=>{probe=null;});};
}
try {
  const res=await fetch('/__lucid/bootstrap',{cache:'no-store'}),data=await res.json();
  if(!res.ok)throw Error(data.error||'The desktop is unavailable.');
  client=data.client;savedSettings=data.settings||'{}';savedRoster=data.roster||'[]';
  window.lucidRemote=true;
  // Aggregate gesture diagnostics stay on this authenticated desktop. They never
  // contain conversation text, paths, identities or an unrestricted log stream.
  window.lucidReportPerformance=async report=>{
    if(closed||document.hidden)return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('/__lucid/perf',{method:'POST',headers:{'Content-Type':'application/json','X-Lucid-Client':client},body:JSON.stringify(report),signal:controller.signal});
      if(!response.ok)throw Error('Gesture diagnostic was not accepted.');
    }finally{clearTimeout(timer);}
  };
  for(const [namespace,methods]of Object.entries(data.api))window[namespace]=Object.fromEntries(Object.keys(methods).map(method=>[method,(...args)=>call(namespace,method,args)]));
  Object.assign(window.lucid,{
    settingsLoad:()=>savedSettings,rosterLoad:()=>savedRoster,
    settingsSave:async json=>{savedSettings=json;},rosterSave:async json=>{savedRoster=json;},
    remoteFrame:input=>call('lucid','remoteFrame',[input]),
    remoteState:async()=>{const s=await call('lucid','remoteState');savedSettings=s.settings;savedRoster=s.roster;return s;},
    remoteCommit:input=>call('lucid','remoteCommit',[input]),
    onItems:off('t3:items'),onInfo:off('t3:info'),onUpdateStep:()=>()=>{},
    checkUpdate:async()=>({available:false}),applyUpdate:async()=>({ok:false,error:'Update Lucid on the desktop.'}),
    saveAttachment:(name,data)=>call('lucid','saveAttachment',[{name,data:Array.from(data)}]),
    watchSet:ids=>{watchedIds=[...ids];return call('lucid','watchSet',[document.hidden?[]:ids]);},
  });
  for(const [name,fn]of Object.entries(window.lucidT3))window.lucidT3[name]=async(...args)=>{const r=await fn(...args);if(!r?.ok){const e=Error(r?.error||'T3 did not answer. Try again.');e.code=r?.code;throw e;}return r.value;};
  if(!entry)throw Error('The Lucid build is incomplete. Update it on the desktop.');
  // Subscribe while the entry loads, before its first watch-set can publish a
  // synchronous history snapshot. The server holds a bounded opening buffer.
  stream();
  await import(new URL(entry,location.href).href);
  stream();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){events?.close();events=null;void call('lucid','watchSet',[[]]).catch(()=>{});}else{void call('lucid','watchSet',[watchedIds]).then(()=>{stream();window.__refresh?.();}).catch(()=>notice('Reconnecting to your desktop. Unsent text stays here.'));}});
  window.addEventListener('offline',()=>notice('Your phone is offline. Reconnect to Tailscale to continue.'));
  window.addEventListener('online',()=>{notice('Reconnecting to your desktop.');stream();window.__refresh?.();});
  window.addEventListener('pagehide',e=>{events?.close();events=null;if(e.persisted)return;closed=true;fetch('/__lucid/close',{method:'POST',keepalive:true,headers:{'X-Lucid-Client':client}}).catch(()=>{});});
  window.addEventListener('pageshow',()=>{if(!closed)stream();});
} catch(error) {
  const main=document.getElementById('app');
  main.style.cssText='padding:24px;color:#f5f2ff;background:#141a33;min-height:100dvh;font:16px/1.6 system-ui;box-sizing:border-box';
  const title=document.createElement('h1');title.textContent='Lucid';
  const message=document.createElement('p');message.textContent=error.message||'The desktop is unavailable. Keep Lucid open on your PC, connect Tailscale, then retry.';
  const retry=document.createElement('button');retry.textContent='Retry connection';retry.style.cssText='padding:12px 18px;border:0;border-radius:8px;background:#ff9f5a;color:#261307;font:inherit';retry.onclick=()=>location.reload();
  main.replaceChildren(title,message,retry);
}
