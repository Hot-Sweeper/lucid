const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {createMobileServer,mediaUrls}=require('../electron/mobile-server.cjs');
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lucid-mobile-server-'));
  fs.mkdirSync(path.join(root,'dist','assets'),{recursive:true});
  fs.writeFileSync(path.join(root,'dist','index.html'),'<script type="module" crossorigin src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(root,'dist','assets','app.js'),'window.fixture=true;');
  fs.writeFileSync(path.join(root,'private.js'),'private');
  const media=path.join(root,'preview.mp4');fs.writeFileSync(media,'0123456789');
  let origin='http://127.0.0.1', calls=[],closed=[],bootstrapFailure=null,perfClock=Date.now();
  // Start on an ephemeral port, then use a stable Host/Origin to exercise proxy validation.
  const config={publicOrigin:'https://phone.fixture.test:9443',allowedLogin:'owner@example.com'};
  const service=createMobileServer({root,config,now:()=>perfClock,bootstrap:async()=>{if(bootstrapFailure)throw bootstrapFailure;return{settings:'{}',roster:'[]'};},invoke:async(c,channel,args)=>{calls.push({id:c.id,channel,args});if(channel==='t3:watch-set')c.publish('t3:items',{threadId:'buffered-thread',items:[{id:'first'}],initial:true});return channel==='t3s:respond'?{ok:true,value:true}:{channel,args};},onCloseClient:c=>closed.push(c.id)});
  try{
    await service.listen(0);origin='http://127.0.0.1:'+service.status().port;
    const headers={Host:'phone.fixture.test:9443','tailscale-user-login':'owner@example.com'};
    async function req(url,options={}){return new Promise((resolve,reject)=>{const r=http.request(origin+url,{method:options.method||'GET',headers:{...headers,...options.headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);const text=(res.headers['content-encoding']==='gzip'?require('node:zlib').gunzipSync(bytes):bytes).toString();let data;try{data=JSON.parse(text);}catch{}resolve({status:res.statusCode,text,data,headers:new Headers(res.headers)});});});r.on('error',reject);r.end(options.body);});}
    assert.equal((await req('/',{headers:{'tailscale-user-login':''}})).status,403);
    assert.equal((await req('/',{headers:{'tailscale-user-login':'other@example.com'}})).status,403);
    assert.equal((await req('/',{headers:{Host:'evil.example'}})).status,403);
    assert.equal((await req('/__lucid/bootstrap',{headers:{Origin:'https://evil.example'}})).status,403);
    const html=await req('/');assert.equal(html.status,200);assert.match(html.text,/src="\/lucid-browser.js" data-entry=".\/assets\/app.js"/);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const navigation={Accept:'text/html,application/xhtml+xml','Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',Referer:'https://t3.fixture.test/thread'};
    for(const entry of ['/', '/index.html'])for(const method of ['GET','HEAD']){
      const linked=await req(entry,{method,headers:navigation});
      assert.equal(linked.status,200,'authenticated top-level links and recovery may open the entry document');
      assert.match(linked.headers.get('content-type'),/^text\/html/);
      if(method==='HEAD')assert.equal(linked.text,'');else assert.match(linked.text,/lucid-browser\.js/);
    }
    assert.equal((await req('/',{headers:{Accept:'text/html',Referer:navigation.Referer}})).status,200,'legacy navigation without Fetch Metadata keeps a working entry point');
    assert.equal((await req('/',{headers:{...navigation,Origin:'https://evil.example'}})).status,403,'navigation cannot override a wrong Origin');
    assert.equal((await req('/',{headers:{...navigation,Origin:'null'}})).status,403);
    assert.equal((await req('/',{headers:{...navigation,'tailscale-user-login':'other@example.com'}})).status,403,'navigation still requires the authenticated Tailscale owner');
    const wrongHost=await req('/',{headers:{...navigation,Host:'evil.example'}});
    assert.equal(wrongHost.status,403);assert.match(wrongHost.headers.get('content-type'),/^text\/html/);
    assert.match(wrongHost.text,/<main><h1>Open Lucid<\/h1>/);
    assert.match(wrongHost.text,/href="https:\/\/phone\.fixture\.test:9443\/"/,'recovery uses the configured address rather than an untrusted request Host');
    assert.match(wrongHost.headers.get('content-security-policy'),/default-src 'none'/);
    assert.equal((await req('/',{method:'HEAD',headers:{...navigation,Host:'evil.example'}})).text,'','document error HEAD responses contain no body');
    assert.equal((await req('/',{headers:{...navigation,'Sec-Fetch-Dest':'iframe'}})).status,403,'the document exception does not admit embedded navigation');
    const formNavigation=await req('/',{method:'POST',headers:navigation});
    assert.equal(formNavigation.status,403,'a document destination does not permit cross-site POST navigation');assert.match(formNavigation.headers.get('content-type'),/^text\/html/);
    assert.equal((await req('/',{headers:{'Sec-Fetch-Site':'cross-site',Accept:'application/json'}})).status,403);
    assert.equal((await req('//evil.example/',{headers:navigation})).status,403,'absolute request targets cannot bypass the configured origin');
    assert.equal((await req('/assets/app.js',{headers:{'Sec-Fetch-Site':'same-origin',Referer:config.publicOrigin+'/'}})).status,200);
    for(const badOrigin of ['http://phone.fixture.test:9443','https://phone.fixture.test'])assert.equal((await req('/assets/app.js',{headers:{Origin:badOrigin}})).status,403,'scheme and port must match, not just the hostname');
    for(const route of ['/__lucid/bootstrap','/__lucid/perf','/assets/app.js','/__lucid/media/'+encodeURIComponent(media)]){
      assert.equal((await req(route,{headers:navigation})).status,403,'the navigation exception cannot open APIs, assets or media across sites');
      const blocked=await req(route,{headers:{'Sec-Fetch-Site':'cross-site',Accept:'application/json'}});
      assert.equal(blocked.status,403);assert.match(blocked.headers.get('content-type'),/^application\/json/);
      assert.equal((await req(route,{headers:{'Sec-Fetch-Site':'same-site',Referer:'https://neighbor.fixture.test/'}})).status,403,'same-site metadata cannot override an external Referer');
      assert.equal((await req(route,{headers:{Referer:'not a URL'}})).status,403,'malformed Referer cannot bypass legacy origin checks');
    }
    bootstrapFailure=Object.assign(Error('Wait <script>bad()</script> & retry.'),{status:503});
    const recovery=await req('/__lucid/bootstrap',{headers:{...navigation,'Sec-Fetch-Site':'same-origin',Referer:config.publicOrigin+'/'}});
    assert.equal(recovery.status,503);assert.match(recovery.headers.get('content-type'),/^text\/html/);
    assert.match(recovery.text,/Wait &lt;script&gt;bad\(\)&lt;\/script&gt; &amp; retry\./);assert.doesNotMatch(recovery.text,/<script>/);
    assert.match(recovery.text,/>Try again<\/a>/);bootstrapFailure=null;
    assert.equal((await req('/assets/app.js')).text,'window.fixture=true;');
    assert.equal((await req('/assets/app.js')).headers.get('cache-control'),'private, max-age=31536000, immutable');
    const compressed=await req('/assets/app.js',{headers:{'Accept-Encoding':'gzip'}});assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal(compressed.text,'window.fixture=true;');
    assert.equal((await req('/%2e%2e/private.js')).status,404);
    const a=(await req('/__lucid/bootstrap')).data,b=(await req('/__lucid/bootstrap')).data;assert.notEqual(a.client,b.client);assert.equal(a.settings,'{}');
    const diagnostics={version:1,viewport:{width:390,height:844,dpr:3},gesture:{kind:'pan',durationMs:1000,moves:80,commits:40,frameCount:35,meanMs:24,p95Ms:40,maxMs:80,applyMeanMs:3,applyMaxMs:8},scene:{dom:9000,svg:7000,canvases:12,canvasPixels:12000000,desks:23,walkers:14,scale:.65},renderer:{name:'vector-canvas'}};
    const diagnosticsPost=(report=diagnostics,extra={},raw=JSON.stringify(report))=>req('/__lucid/perf',{method:'POST',headers:{'Content-Type':'application/json',Origin:config.publicOrigin,'X-Lucid-Client':a.client,...extra},body:raw});
    const filesBeforeDiagnostics=fs.readdirSync(root,{recursive:true});
    assert.deepEqual((await req('/__lucid/perf')).data,{ok:true,reports:[]},'owner diagnostics reads require no live phone session token');
    for(const bad of [{Origin:'https://evil.example'},{Referer:'https://evil.example/'},{'Sec-Fetch-Site':'cross-site'},{Host:'evil.example'},{'tailscale-user-login':''}])assert.equal((await req('/__lucid/perf',{headers:bad})).status,403,'diagnostics reads retain the existing owner and origin boundary');
    for(const bad of [{Origin:'https://evil.example'},{Origin:''},{Referer:'https://evil.example/'},{'Sec-Fetch-Site':'cross-site'},{Host:'evil.example'},{'tailscale-user-login':'other@example.com'}])assert.equal((await diagnosticsPost(diagnostics,bad)).status,403);
    for(const missing of ['', 'spoofed-session'])assert.equal((await diagnosticsPost(diagnostics,{'X-Lucid-Client':missing})).status,401);
    assert.equal((await diagnosticsPost(diagnostics,{'Content-Type':'text/plain'})).status,415);
    const invalidReports=[null,[],{}, {...diagnostics,version:2},{...diagnostics,version:'1'}, {...diagnostics,messages:['a private message']},{...diagnostics,viewport:{...diagnostics.viewport,width:0}},{...diagnostics,viewport:{...diagnostics.viewport,dpr:9}},{...diagnostics,viewport:{...diagnostics.viewport,height:16385}},
      {...diagnostics,gesture:{...diagnostics.gesture,kind:'arbitrary text'}},{...diagnostics,gesture:{...diagnostics.gesture,durationMs:-1}},{...diagnostics,gesture:{...diagnostics.gesture,moves:.5}},{...diagnostics,gesture:{...diagnostics.gesture,maxMs:10001}},{...diagnostics,gesture:{...diagnostics.gesture,p95Ms:90}},{...diagnostics,gesture:{...diagnostics.gesture,frameCount:0}},
      {...diagnostics,scene:{...diagnostics.scene,canvasPixels:1e9+1}},{...diagnostics,scene:{...diagnostics.scene,scale:0}},{...diagnostics,scene:{...diagnostics.scene,path:'C:/private/project'}},{...diagnostics,renderer:{name:'owner@example.com'}},{...diagnostics,renderer:{name:'canvas',token:a.client}},{...diagnostics,timings:{secret:'a private token'}},{...diagnostics,timings:{startupMs:null}}];
    invalidReports.push({...diagnostics,renderer:{name:'tiles',visibleTiles:-1}},{...diagnostics,renderer:{name:'mixed',missingTiles:.5}},{...diagnostics,renderer:{name:'tiles',cachePixels:1e9+1}},{...diagnostics,renderer:{name:'tiles',staticTiles:'secret'}});
    for(const report of invalidReports)assert.equal((await diagnosticsPost(report)).status,400,'only bounded numeric render aggregates and known enum values may enter diagnostics');
    for(const number of ['NaN','Infinity','1e999']){
      const raw=JSON.stringify(diagnostics).replace('"durationMs":1000','"durationMs":'+number);
      assert.equal((await diagnosticsPost(diagnostics,{},raw)).status,400,'nonfinite diagnostic values are rejected');
    }
    const oversized=JSON.stringify(diagnostics)+' '.repeat(6*1024);
    assert.equal((await diagnosticsPost(diagnostics,{},oversized)).status,413,'diagnostic bodies have their own small limit');
    assert.equal((await diagnosticsPost(diagnostics,{'Transfer-Encoding':'chunked'},oversized)).status,413,'chunked diagnostics cannot bypass the small body limit');
    assert.deepEqual((await req('/__lucid/perf')).data.reports,[],'rejected requests never enter the ring');
    const callsBeforeDiagnostics=calls.length;
    const tileReport={...diagnostics,renderer:{name:'mixed',visibleTiles:12,missingTiles:3,cachePixels:12000000,paints:400,staticTiles:20,staticMissingTiles:2},timings:{startupMs:1200,sceneryMs:3}};
    assert.equal((await diagnosticsPost(tileReport)).status,200);
    assert.equal((await diagnosticsPost()).status,429,'accepted diagnostic writes are limited to one per two seconds per session');
    assert.equal((await diagnosticsPost(diagnostics,{'X-Lucid-Client':b.client})).status,200,'separate phone sessions have separate rate limits');
    const initialReports=(await req('/__lucid/perf')).data.reports;
    assert.equal(initialReports.length,2);assert.equal(initialReports[0].receivedAt,new Date(perfClock).toISOString());
    perfClock+=2000;
    const quick={...diagnostics,gesture:{kind:'pinch',durationMs:10,moves:0,commits:0,frameCount:0,meanMs:0,p95Ms:0,maxMs:0,applyMeanMs:0,applyMaxMs:0}};
    assert.equal((await diagnosticsPost(quick)).status,200,'zero-frame quick gestures remain honest zero aggregates');
    for(let i=0;i<23;i++){perfClock+=2000;assert.equal((await diagnosticsPost({...diagnostics,gesture:{...diagnostics.gesture,durationMs:2000+i}})).status,200);}
    const ring=(await req('/__lucid/perf')).data.reports;
    assert.equal(ring.length,20,'diagnostics retain only the last twenty reports');assert.equal(ring[0].gesture.durationMs,2022);assert.equal(ring.at(-1).gesture.durationMs,2003);
    assert.equal(calls.length,callsBeforeDiagnostics,'diagnostics never enter T3 action dispatch');
    const savedDiagnostics=JSON.stringify(ring);
    for(const secret of [a.client,b.client,'owner@example.com',root])assert.equal(savedDiagnostics.includes(secret),false,'diagnostics store no session tokens, accounts or paths');
    assert.deepEqual(fs.readdirSync(root,{recursive:true}),filesBeforeDiagnostics,'diagnostics remain memory-only');
    const post=(input,extra={})=>req('/__lucid/call',{method:'POST',headers:{'Content-Type':'application/json',Origin:config.publicOrigin,'X-Lucid-Client':a.client,...extra},body:JSON.stringify(input)});
    assert.equal((await post({namespace:'lucid',method:'world',args:[]},{Origin:'https://evil.example'})).status,403);
    assert.equal((await post({namespace:'lucid',method:'world',args:[]},{'Sec-Fetch-Site':'cross-site'})).status,403,'valid Origin cannot override cross-site mutation metadata');
    assert.equal((await post({namespace:'lucid',method:'world',args:[]},{Origin:'',Referer:config.publicOrigin+'/'})).status,403,'Referer cannot replace a required mutation Origin');
    assert.equal((await post({namespace:'lucid',method:'world',args:[]},{Referer:'https://evil.example/'})).status,403);
    assert.equal((await post({namespace:'lucid',method:'world',args:[]},{'X-Lucid-Client':'unknown'})).status,401);
    assert.equal((await post({namespace:'lucid',method:'settingsSave',args:['{}']})).status,403);
    assert.equal((await post({namespace:'lucid',method:'applyUpdate',args:[]})).status,403);
    assert.equal((await post({namespace:'constructor',method:'prototype',args:[]})).status,403);
    assert.equal((await post({namespace:'lucid',method:'world',args:[]})).data.value.channel,'t3:world');
    assert.equal((await post({namespace:'lucidT3',method:'respond',args:[{threadId:'t',requestId:'r'}]})).data.value.ok,true);
    assert.equal((await post({namespace:'lucid',method:'saveAttachment',args:[{name:'x',data:[256]}]})).status,400);
    assert.equal((await post({namespace:'lucid',method:'saveAttachment',args:[{name:'x',data:[1,2,3]}]})).status,200);
    assert.equal(calls.at(-1).channel,'attach:save');
    const mediaPath='/__lucid/media/'+encodeURIComponent(media);
    assert.equal((await req(mediaPath)).text,'0123456789');
    const range=await req(mediaPath,{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(range.text,'2345');assert.equal(range.headers.get('content-range'),'bytes 2-5/10');
    assert.equal((await req(mediaPath,{headers:{Range:'bytes=-3'}})).text,'789');
    assert.equal((await req(mediaPath,{headers:{Range:'bytes=20-30'}})).status,416);
    assert.equal((await req('/__lucid/media/'+encodeURIComponent(path.join(root,'private.js')))).status,403);
    assert.equal(mediaUrls({url:'lucid-file://local/C%3A%5Cx.png?v=1'}).url,'/__lucid/media/C%3A%5Cx.png?v=1');
    // Initial subscriptions can finish before EventSource connects. Their first snapshot survives.
    await post({namespace:'lucid',method:'watchSet',args:[['buffered-thread']]},{'X-Lucid-Client':b.client});
    let stream;
    await new Promise((resolve,reject)=>{stream=http.get(origin+'/__lucid/events?client='+b.client,{headers},res=>{assert.equal(res.statusCode,200);let received='';res.on('data',chunk=>{received+=chunk;if(received.includes('buffered-thread')&&received.includes('first'))resolve();});});stream.on('error',reject);});
    await req('/__lucid/close',{method:'POST',headers:{Origin:config.publicOrigin,'X-Lucid-Client':a.client}});
    assert.ok(closed.includes(a.client));assert.equal(service.status().clients,1);
    assert.equal((await req('/__lucid/perf')).data.reports.length,20,'owner can read aggregate diagnostics after a phone session closes');
    await service.close();stream.destroy();assert.ok(closed.includes(b.client));
    console.log('Mobile HTTP bridge: identity/Origin/Referer checks, linked navigation, HTML recovery, bounded private gesture diagnostics, per-session rate limits, allowlist, clients, media, assets and cleanup passed.');
  }finally{await service.close();fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
