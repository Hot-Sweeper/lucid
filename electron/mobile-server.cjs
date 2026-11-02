const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const gzip = promisify(require('node:zlib').gzip);
const { EventEmitter } = require('node:events');
const api = require('./browser-api.cjs');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/mp4','.ogv':'video/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac','.opus':'audio/ogg'};
const MEDIA = new Set(Object.keys(MIME).filter(x => !['.html','.js','.css','.woff','.woff2'].includes(x)));
const fail = (status, message) => Object.assign(Error(message), {status});
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function documentNavigation(req) {
  const mode=req.headers['sec-fetch-mode'],dest=req.headers['sec-fetch-dest'];
  if (mode || dest) return mode==='navigate' && dest==='document';
  // Older clients can omit Fetch Metadata. HTML acceptance identifies their
  // navigation for presentation only; the entry-path check below scopes access.
  return /(?:^|[,;\s])text\/html(?:[,;\s]|$)/i.test(req.headers.accept || '');
}
const PERF_BODY_LIMIT = 6 * 1024;
function perfReport(value) {
  const invalid=()=>{throw fail(400,'Invalid render diagnostics.');};
  const record=(input,allowed,required=allowed)=>{
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!allowed.includes(key)) || required.some(key=>!Object.hasOwn(input,key)))invalid();
  };
  const numbers=(input,rules)=>{
    record(input,Object.keys(rules));
    const result={};
    for(const [key,[min,max,integer]] of Object.entries(rules)){
      const n=input[key];
      if(typeof n!=='number' || !Number.isFinite(n) || n<min || n>max || integer && !Number.isSafeInteger(n))invalid();
      result[key]=n;
    }
    return result;
  };
  record(value,['version','viewport','gesture','scene','renderer','timings'],['version','viewport','gesture','scene','renderer']);
  if(value.version!==1)invalid();
  const viewport=numbers(value.viewport,{width:[1,16384],height:[1,16384],dpr:[.1,8]});
  record(value.gesture,['kind','durationMs','moves','commits','frameCount','meanMs','p95Ms','maxMs','applyMeanMs','applyMaxMs']);
  if(!['pan','pinch'].includes(value.gesture.kind))invalid();
  const {kind,...metrics}=value.gesture;
  const gesture={kind,...numbers(metrics,{durationMs:[.01,120000],moves:[0,100000,true],commits:[0,100000,true],frameCount:[0,100000,true],meanMs:[0,10000],p95Ms:[0,10000],maxMs:[0,10000],applyMeanMs:[0,10000],applyMaxMs:[0,10000]})};
  if(gesture.meanMs>gesture.maxMs || gesture.p95Ms>gesture.maxMs || gesture.applyMeanMs>gesture.applyMaxMs || !gesture.frameCount && (gesture.meanMs || gesture.p95Ms || gesture.maxMs))invalid();
  const scene=numbers(value.scene,{dom:[0,1000000,true],svg:[0,1000000,true],canvases:[0,4096,true],canvasPixels:[0,1e9,true],desks:[0,10000,true],walkers:[0,10000,true],scale:[.000001,10]});
  const tileMetrics=['visibleTiles','missingTiles','cachePixels','paints','staticTiles','staticMissingTiles'];
  record(value.renderer,['name',...tileMetrics],['name']);
  if(!['svg','canvas','vector-canvas','tiles','mixed','webgl','webgl2','overview','detail','vectors','unknown'].includes(value.renderer.name))invalid();
  const rendererMetrics=Object.fromEntries(tileMetrics.filter(key=>Object.hasOwn(value.renderer,key)).map(key=>[key,value.renderer[key]]));
  const report={version:1,viewport,gesture,scene,renderer:{name:value.renderer.name,...numbers(rendererMetrics,Object.fromEntries(Object.keys(rendererMetrics).map(key=>[key,[0,key==='cachePixels'?1e9:1e7,true]])))}};
  if(value.timings!==undefined){
    const allowed=['startupMs','bootMs','worldMs','networkMs','renderMs','sceneryMs','recullMs','paintMs','frameMs'];
    record(value.timings,allowed,[]);
    report.timings=numbers(value.timings,Object.fromEntries(Object.keys(value.timings).map(key=>[key,[0,120000]])));
  }
  return report;
}
function mediaUrls(value) {
  if (typeof value === 'string') return value.replace(/lucid-file:\/\/local\/([^\s"'<>]+)/g, '/__lucid/media/$1');
  if (Array.isArray(value)) return value.map(mediaUrls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mediaUrls(v)]));
  return value;
}
function createMobileServer({ root, config, invoke, bootstrap, onCloseClient = () => {}, now = Date.now }) {
  const clients = new Map(), perfReports=[]; let server, expiry;
  const origin = new URL(config.publicOrigin).origin;
  let clientNumber = -1000;
  function closeClient(id) {
    const c = clients.get(id); if (!c) return;
    clients.delete(id); c.stream?.end(); c.sender.emit('destroyed'); onCloseClient(c);
  }
  function publish(c, channel, payload) {
    const data = `data: ${JSON.stringify({channel,payload:mediaUrls(payload)})}\n\n`;
    if (!c.stream || c.stream.destroyed) {
      if (c.openingBytes + Buffer.byteLength(data) <= 2 * 1024 * 1024 && c.opening.length < 128) {
        c.opening.push(data); c.openingBytes += Buffer.byteLength(data);
      } else { c.opening.length = 0; c.openingBytes = 0; c.resync = true; }
      return;
    }
    // A suspended phone reconnects and refetches instead of buffering unbounded events.
    if (c.stream.writableLength > 1024 * 1024 || Buffer.byteLength(data) > 2 * 1024 * 1024) { c.stream.end(); return; }
    c.stream.write(data);
  }
  async function json(req, res, value, status = 200) {
    let data = Buffer.from(JSON.stringify(value));
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding'};
    if (data.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { data = await gzip(data); headers['Content-Encoding']='gzip'; }
    res.writeHead(status, {...headers,'Content-Length':data.length}); res.end(data);
  }
  function documentError(req,res,status,message) {
    const title=status===403?'Open Lucid':status===401?'Reconnect to Lucid':status===404?'Page unavailable':status===429?'Too many Lucid tabs':'Lucid could not open';
    const label=status===403?'Open Lucid':'Try again';
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapeHtml(title)} | Lucid</title><style>:root{color-scheme:dark;font-family:Lexend,system-ui,sans-serif;background:#141a33;color:#f3efff}body{margin:0;min-height:100svh;display:grid;align-items:center}main{box-sizing:border-box;width:100%;max-width:36rem;margin:auto;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}h1{font-size:1.5rem;line-height:1.3;margin:0 0 16px;font-weight:600}p{color:#c4c3da;font-size:1rem;line-height:1.6;margin:0 0 24px;overflow-wrap:anywhere}a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:10px 18px;border-radius:9px;background:#ff9f5a;color:#2a1407;text-decoration:none;font:inherit;font-weight:600}a:hover{background:#ffb27b}a:focus-visible{outline:2px solid #fff;outline-offset:4px}@media(prefers-reduced-motion:no-preference){a{transition:background .12s}}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="${escapeHtml(origin)}/">${label}</a></main></body></html>`;
    res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(html),'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
    res.end(req.method==='HEAD'?undefined:html);
  }
  async function body(req,limit=24*1024*1024,limitMessage='This attachment is too large. Send a file smaller than 4 MB.') {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415,'Use JSON for this request.');
    if(Number(req.headers['content-length'])>limit)throw fail(413,limitMessage);
    let size = 0, chunks=[];
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413,limitMessage); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400,'Invalid request.'); }
  }
  async function file(req,res,name,media=false) {
    const stat = await fsp.stat(name).catch(()=>null);
    if (!stat?.isFile()) throw fail(404,'File unavailable.');
    const ext = path.extname(name).toLowerCase(); if (!MIME[ext] || media && !MEDIA.has(ext)) throw fail(403,'File type unavailable.');
    const headers = {'Content-Type':MIME[ext],'Accept-Ranges':'bytes','Cache-Control':media?'private, max-age=60':/[/\\]assets[/\\]/.test(name)?'private, max-age=31536000, immutable':'no-cache'};
    if (media) headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
    let start=0,end=stat.size-1,status=200;
    if (req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!m || !m[1] && !m[2]) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}); res.end(); return; }
      if (m[1]) { start=Number(m[1]); end=m[2]?Math.min(end,Number(m[2])):end; }
      else start=Math.max(0,stat.size-Number(m[2]));
      if (start>end || start>=stat.size) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}); res.end(); return; }
      status=206; headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    const compressed=!media && status===200 && ['.js','.css'].includes(ext) && /\bgzip\b/.test(req.headers['accept-encoding']||'');
    if(compressed){headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}
    else headers['Content-Length']=Math.max(0,end-start+1);
    res.writeHead(status,headers);
    if(req.method==='HEAD' || !stat.size){res.end();return;}
    const stream=fs.createReadStream(name,{start,end}); stream.on('error',()=>res.destroy()); res.on('close',()=>stream.destroy());
    if(compressed){const zip=require('node:zlib').createGzip();zip.on('error',()=>res.destroy());res.on('close',()=>zip.destroy());stream.pipe(zip).pipe(res);}else stream.pipe(res);
  }
  async function handle(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    // Tailscale Serve strips and sets identity headers. Only its loopback proxy can reach this listener.
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || String(req.headers['tailscale-user-login'] || '').toLowerCase() !== config.allowedLogin.toLowerCase()) throw fail(403,'Open Lucid through Tailscale using the same account as this computer.');
    if (req.headers.host !== new URL(origin).host) throw fail(403,'Open Lucid using its Tailscale address.');
    const url = new URL(req.url,origin);
    if (url.origin!==origin || req.headers.origin && req.headers.origin!==origin) throw fail(403,'Open Lucid directly to continue.');
    // Links and browser recovery can legitimately navigate here from another
    // site. Only the inert app entry document gets this exception. Bootstrap,
    // streams, media, assets and all actions keep their same-origin checks.
    const entryDocument=['GET','HEAD'].includes(req.method) && documentNavigation(req) && ['/', '/index.html'].includes(url.pathname);
    if (!entryDocument) {
      if (req.headers['sec-fetch-site']==='cross-site') throw fail(403,'Open Lucid directly to continue.');
      if (req.headers.referer) {
        let referringOrigin;
        try { referringOrigin=new URL(req.headers.referer).origin; } catch { throw fail(403,'Open Lucid directly to continue.'); }
        if(referringOrigin!==origin) throw fail(403,'Open Lucid directly to continue.');
      }
    }
    if (req.method==='GET' && url.pathname==='/__lucid/bootstrap') {
      if(clients.size>=6) throw fail(429,'Too many Lucid tabs. Close another tab and retry in a few minutes.');
      const state = await bootstrap();
      const id=crypto.randomBytes(24).toString('hex'), sender=new EventEmitter(); sender.id=clientNumber--;
      const c={id,sender,environment:null,last:Date.now(),stops:new Map(),stream:null,inflight:0,opening:[],openingBytes:0,resync:false}; c.publish=(channel,payload)=>publish(c,channel,payload); clients.set(id,c);
      return json(req,res,{client:id,api,...state});
    }
    if (url.pathname.startsWith('/__lucid/')) {
      // Diagnostics contain only validated numeric aggregates. The authenticated
      // desktop owner can read them even after the phone's session has expired.
      if(req.method==='GET' && url.pathname==='/__lucid/perf')return json(req,res,{ok:true,reports:[...perfReports].reverse()});
      if (url.pathname.startsWith('/__lucid/media/')) {
        if(!['GET','HEAD'].includes(req.method)) throw fail(405,'Method unavailable.');
        return file(req,res,decodeURIComponent(url.pathname.slice('/__lucid/media/'.length)),true);
      }
      const c = clients.get(req.headers['x-lucid-client'] || url.searchParams.get('client'));
      if(!c) throw fail(401,'Connection expired. Reload Lucid to reconnect.'); c.last=Date.now();
      if(req.method==='GET' && url.pathname==='/__lucid/events') {
        c.stream?.end(); c.stream=res; res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.write(': connected\n\n');
        for (const data of c.opening) res.write(data);
        c.opening.length = 0; c.openingBytes = 0;
        if(c.resync){c.resync=false;publish(c,'lucid:resync',null);}
        req.on('close',()=>{if(c.stream===res)c.stream=null;}); return;
      }
      if(req.method!=='POST' || req.headers.origin!==origin) throw fail(403,'Request origin unavailable. Reload Lucid.');
      if(url.pathname==='/__lucid/perf'){
        const report=perfReport(await body(req,PERF_BODY_LIMIT,'Render diagnostics are too large.'));
        const received=now();
        if(c.lastPerf!==undefined && received-c.lastPerf<2000)throw fail(429,'Render diagnostics were sent too recently.');
        c.lastPerf=received;
        perfReports.push({receivedAt:new Date(received).toISOString(),...report});
        if(perfReports.length>20)perfReports.shift();
        return json(req,res,{ok:true});
      }
      if(url.pathname==='/__lucid/close'){closeClient(c.id);return json(req,res,{ok:true});}
      if(url.pathname!=='/__lucid/call')throw fail(404,'Request unavailable.');
      if(c.inflight>=12)throw fail(429,'Lucid is catching up. Try again in a moment.');
      c.inflight++;
      try {
        const input=await body(req),{namespace,method,args}=input;
        if(!Array.isArray(args) || args.length>6)throw fail(400,'Invalid request arguments.');
        let channel = Object.hasOwn(api,namespace || '') && Object.hasOwn(api[namespace],method || '') ? api[namespace][method] : null;
        if(namespace==='lucid' && ['remoteState','remoteCommit','remoteFrame'].includes(method)) channel=method;
        if(!channel)throw fail(403,'This action is only available on the desktop.');
        if(channel==='attach:save') { const data=args[0]?.data; if(!Array.isArray(data)||data.length>4*1024*1024||data.some(n=>!Number.isInteger(n)||n<0||n>255))throw fail(400,'Invalid attachment. Use a file smaller than 4 MB.'); }
        const value=await invoke(c,channel,args); return json(req,res,{ok:true,value:mediaUrls(value)});
      } finally {c.inflight--;}
    }
    if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method unavailable.');
    if(url.pathname==='/' || url.pathname==='/index.html') {
      let html=await fsp.readFile(path.join(root,'dist','index.html'),'utf8');
      const match=html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
      if(!match)throw fail(503,'Lucid needs a complete production build. Update it on the desktop.');
      html=html.replace(match[0],`<script type="module" src="/lucid-browser.js" data-entry="${match[1]}"></script>`);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}); res.end(req.method==='HEAD'?undefined:html);return;
    }
    const dist=await fsp.realpath(path.join(root,'dist')), target=await fsp.realpath(path.join(dist,decodeURIComponent(url.pathname))).catch(()=>null);
    if(!target || !path.relative(dist,target) || path.relative(dist,target).startsWith('..') || path.isAbsolute(path.relative(dist,target))) throw fail(404,'File unavailable.');
    return file(req,res,target);
  }
  return {
    async listen(port=5180){ if(server)return; server=http.createServer((req,res)=>{handle(req,res).catch(error=>{if(res.headersSent){res.destroy();return;}const status=error.status||500,message=error.status?error.message:'Lucid could not complete this request. Try again.';if(documentNavigation(req)){documentError(req,res,status,message);return;}json(req,res,{ok:false,error:message},status).catch(()=>res.destroy());});}); server.requestTimeout=30000; server.headersTimeout=10000;
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
      expiry=setInterval(()=>{for(const c of clients.values()){if(Date.now()-c.last>5*60*1000)closeClient(c.id);else if(c.stream){c.last=Date.now();c.stream.write(': keepalive\n\n');}}},25000);expiry.unref();
    },
    async close(){clearInterval(expiry);for(const id of clients.keys())closeClient(id);perfReports.length=0;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}},
    status(){return{listening:!!server?.listening,clients:clients.size,port:server?.address()?.port};},
  };
}
module.exports={createMobileServer,mediaUrls};
