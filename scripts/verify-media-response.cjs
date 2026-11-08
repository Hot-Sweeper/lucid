const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { byteRange, fileMediaResponse, bufferMediaResponse } = require('../electron/media-response.cjs');
(async()=>{
  assert.deepEqual(byteRange('bytes=3-6',10),{start:3,end:6});
  assert.deepEqual(byteRange('bytes=6-',10),{start:6,end:9});
  assert.deepEqual(byteRange('bytes=-3',10),{start:7,end:9});
  assert.deepEqual(byteRange('bytes=6-100',10),{start:6,end:9});
  for(const range of ['bytes=-0','bytes=10-','bytes=7-2','bytes=','bytes=0-1,3-4','items=0-3','bytes=999999999999999999999-']) assert.equal(byteRange(range,10),false,range);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lucid-media-'));
  try{
    const file=path.join(dir,'exact bytes #ä.mp3'), bytes=Buffer.from('0123456789'); await fs.writeFile(file,bytes);
    for(const range of [null,'bytes=3-6','bytes=6-','bytes=-3','bytes=6-100','bytes=10-']){
      const request=new Request('https://lucid.test/file',{headers:range?{Range:range}:{}});
      const local=await fileMediaResponse(request,file), remote=bufferMediaResponse(request,bytes,'audio/mpeg');
      const expected=range?byteRange(range,10):null;
      for(const response of [local,remote]){
        assert.equal(response.status,expected===false?416:expected?206:200);
        assert.equal(response.headers.get('accept-ranges'),'bytes');
        const body=Buffer.from(await response.arrayBuffer());
        assert.deepEqual(body,expected===false?Buffer.alloc(0):expected?bytes.subarray(expected.start,expected.end+1):bytes);
        assert.equal(response.headers.get('content-length'),String(body.length));
        if(expected) assert.equal(response.headers.get('content-range'),`bytes ${expected.start}-${expected.end}/10`);
      }
    }
    const head=await fileMediaResponse(new Request('https://lucid.test/file',{method:'HEAD'}),file);
    assert.equal(head.headers.get('content-length'),'10'); assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal(await fileMediaResponse(new Request('https://lucid.test/file'),path.join(dir,'no.txt')),null);
    await fs.writeFile(file,Buffer.alloc(0)); const empty=await fileMediaResponse(new Request('https://lucid.test/file'),file); assert.equal(empty.status,200); assert.equal((await empty.arrayBuffer()).byteLength,0);
    console.log('PASS: exact local/remote bytes, open/suffix/clamped ranges, 416, HEAD, MIME and empty files');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
