// Read only the browser app explicitly identified by an agent-workspace event.
// Never attach to the host display or launch/navigate a second copy of the page.
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { nativeImage } = require('electron');
const cli = path.join(os.homedir(), '.local/bin/agent-workspace-linux');
const sessions = new Map(), captures = new Map();
const valid = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(value);
function targetOf(value) {
  if (!valid(value?.id) || !/^app-\d+$/.test(value?.appId || '') || !valid(value?.sessionId)) throw Error('Invalid agent browser handle.');
  return { id:value.id, appId:value.appId, sessionId:value.sessionId };
}
function command(args) {
  return new Promise((resolve,reject) => execFile(cli,args,{timeout:7000,maxBuffer:1024*1024,windowsHide:true},(error,stdout)=>{
    if (error) return reject(error);
    try { const result=JSON.parse(stdout);if(!result.ok) throw Error(result.message);resolve(result); } catch(error) { reject(error); }
  }));
}
function browserApp(app) {
  const args=app?.command || [], name=path.basename(args[0] || '');
  return app?.running && (name === 'agent-firefox' || /^(chromium|chrome|google-chrome)(-stable)?$/.test(name) && args.some(arg=>arg.startsWith('--user-data-dir=')));
}
async function capture(target) {
  const apps = await command(['workspace','apps','--id',target.id]);
  if (apps.status?.session_id !== target.sessionId || !browserApp(apps.apps?.find(app=>app.id===target.appId))) throw Error('The agent browser is no longer running.');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lucid-agent-browser-'));
  try {
    const file=path.join(directory,'browser.png');
    const shot=await command(['workspace','screenshot-window','--id',target.id,'--app',target.appId,'--output',file]);
    if (shot.screenshot?.target !== 'window' || shot.screenshot?.path !== file) throw Error('Browser window capture is unavailable.');
    let image=nativeImage.createFromBuffer(await fs.readFile(file));
    if(image.isEmpty()) throw Error('Browser window capture is empty.');
    const size=image.getSize();
    if(size.width>1600) image=image.resize({width:1600});
    const jpeg=image.toJPEG(85), hash=require('node:crypto').createHash('sha256').update(jpeg).digest('hex');
    // width and height are the window's real pixels: the robot's window takes that shape.
    return {ok:true,width:size.width,height:size.height,title:String(shot.windows?.[0]?.title||'Agent browser').replace(/ [—–] (Mozilla Firefox|Chromium|Google Chrome)$/,''),image:`data:image/jpeg;base64,${jpeg.toString('base64')}`,hash};
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
function close(key) {const s=sessions.get(key);clearTimeout(s?.expiry);sessions.delete(key);}
async function frame(key,req) {
  if(req.close){close(key);return {ok:true};}
  let s=sessions.get(key);
  if(req.target?.workspace){
    const target=targetOf(req.target.workspace);
    if(!s || JSON.stringify(s.target)!==JSON.stringify(target)){
      close(key);while(sessions.size>=6)close(sessions.keys().next().value);
      s={target,hash:null};sessions.set(key,s);
    }
  }
  if(!s)return {ok:false,missing:true,error:'Agent browser session ended.'};
  clearTimeout(s.expiry);s.expiry=setTimeout(()=>close(key),90000);s.expiry.unref?.();
  if(req.mode==='paused')return {ok:true};
  const sharedKey=JSON.stringify(s.target);
  try {
    let shared=captures.get(sharedKey);
    if(!shared){shared=capture(s.target).finally(()=>captures.delete(sharedKey));captures.set(sharedKey,shared);}
    const result=await shared;
    if(sessions.get(key)!==s)return {ok:false,missing:true,error:'Agent browser session ended.'};
    if(s.hash===result.hash)return {ok:true,unchanged:true};
    s.hash=result.hash;
    const {hash,...frame}=result;return frame;
  } catch { return {ok:false,error:'Waiting for the agent browser window. Its real page will appear here when it is available.'}; }
}
function closeOwner(owner) {for(const key of sessions.keys())if(owner===undefined || key.startsWith(`${owner}:`))close(key);}
module.exports={frame,close,closeOwner,has:key=>sessions.has(key),targetOf,browserApp};
