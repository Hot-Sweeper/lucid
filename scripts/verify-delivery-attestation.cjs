const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const {prepare}=require('../electron/delivery-attestation.cjs');
async function readCompletedProof(file, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      // writeFile creates the file before the asynchronous write completes.
      // Retry only missing or incomplete JSON, never the assertions below.
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 2));
  } while (Date.now() < deadline);
  throw new Error(`Delivery proof did not finish writing within ${timeoutMs}ms`, { cause: lastError });
}
async function fixture({mismatch=false,earlyLoad=false,wrongEntry=false,destroyDuringObserved=false,timeoutDuringObserved=false,writeError=false,rawSpaceUrl=false,partialWrite=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lucid-delivery-proof- space-')),asset=path.join(root,'dist/assets/index-fixture.js'),output=path.join(root,'proof.json'),source='window.__world = { fixture: true };';
  fs.mkdirSync(path.dirname(asset),{recursive:true});fs.writeFileSync(asset,source);fs.writeFileSync(path.join(root,'dist/lucid-build.json'),JSON.stringify({files:{'src/os/note-app-icon.ts':'fixture-source-hash'}}));
  const url=pathToFileURL(asset).href,wc=new EventEmitter(),dbg=new EventEmitter();wc.debugger=dbg;let attached=false,detaches=0,release,releaseObserved;
  const originalWrite=fs.promises.writeFile,originalError=console.error,writeErrors=[];
  if(writeError){fs.promises.writeFile=async(file,...args)=>{if(file===output){const error=new Error('EACCES fixture proof write denied');error.code='EACCES';throw error;}return originalWrite.call(fs.promises,file,...args)};console.error=(...args)=>writeErrors.push(args.join(' '));}
  else if(partialWrite){fs.promises.writeFile=async(file,...args)=>{if(file===output){await originalWrite.call(fs.promises,file,'{');await new Promise(resolve=>setTimeout(resolve,20));}return originalWrite.call(fs.promises,file,...args)};}
  dbg.isAttached=()=>attached;dbg.attach=()=>{attached=true};dbg.detach=()=>{attached=false;detaches++};
  dbg.sendCommand=async method=>{if(method==='Debugger.enable')return{};assert.equal(method,'Debugger.getScriptSource');if(earlyLoad)await new Promise(r=>release=r);return{scriptSource:mismatch?source+'// mismatch':source}};
  wc.executeJavaScript=async()=>{if(destroyDuringObserved||timeoutDuringObserved)await new Promise(resolve=>releaseObserved=resolve);return{url:pathToFileURL(path.join(root,'dist/index.html')).href,entry:wrongEntry?url+'?wrong':url,officeCreated:true}};
  try{
    await prepare({webContents:wc},{root,output,timeoutMs:200});
    const parsedUrl=rawSpaceUrl?url.replaceAll('%20',' '):url;
    dbg.emit('message',{},'Debugger.scriptParsed',{url:parsedUrl,scriptId:'fixture'});
    wc.emit('did-finish-load');if(release)release();
    if(destroyDuringObserved){await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof releaseObserved,'function');wc.emit('destroyed');}
    if(writeError){for(let i=0;i<100&&!writeErrors.length;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(writeErrors.some(message=>message.includes('Delivery audit could not save proof:')&&message.includes('EACCES')));assert.equal(fs.existsSync(output),false);assert.equal(attached,false);assert.equal(dbg.listenerCount('message'),0);assert.equal(wc.listenerCount('did-finish-load'),0);assert.equal(wc.listenerCount('destroyed'),0);return;}
    const failed=mismatch||wrongEntry||destroyDuringObserved||timeoutDuringObserved;
    const result=await readCompletedProof(output);assert.equal(result.status,failed?'failed':'passed');
    if(!failed){assert.equal(result.parsedEntryUrl,parsedUrl);assert.equal(result.executingSha256,result.installedSha256);assert.equal(result.sameBytes,true);assert.equal(result.entry,'./assets/index-fixture.js');assert.equal(result.validatedSourceFiles['src/os/note-app-icon.ts'],'fixture-source-hash');}
    if(mismatch){assert.equal(result.sameBytes,false);assert.notEqual(result.executingSha256,result.installedSha256);}
    if(releaseObserved){releaseObserved();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).status,'failed','Late observed-entry reads cannot overwrite a terminal audit failure');}
    assert.equal(attached,false);assert.equal(detaches,1);assert.equal(dbg.listenerCount('message'),0);assert.equal(wc.listenerCount('did-finish-load'),0);assert.equal(wc.listenerCount('destroyed'),0);
  }finally{fs.promises.writeFile=originalWrite;console.error=originalError;const resolved=fs.realpathSync(root);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('lucid-delivery-proof-'));fs.rmSync(resolved,{recursive:true,force:true})}
}
(async()=>{await fixture();await fixture({partialWrite:true});await fixture({partialWrite:true,mismatch:true});await fixture({earlyLoad:true});await fixture({rawSpaceUrl:true});await fixture({mismatch:true});await fixture({wrongEntry:true});await fixture({destroyDuringObserved:true});await fixture({timeoutDuringObserved:true});await fixture({writeError:true});console.log('Delivery attestation: V8/disk byte identity, load/source race, incomplete-write polling, mismatched-source rejection, observed-entry URL binding with spaces, terminal cancellation, surfaced write failure and complete one-shot cleanup passed.');})().catch(e=>{console.error(e);process.exitCode=1});
