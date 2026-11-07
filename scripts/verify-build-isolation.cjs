const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runUpdateCommand}=require('../electron/update-command.cjs');
async function run(){
  const root=path.resolve(__dirname,'..'),fixture=fs.mkdtempSync(path.join(os.tmpdir(),'lucid-build-isolation-'));
  try{
    fs.mkdirSync(path.join(fixture,'dist/assets'),{recursive:true});
    fs.writeFileSync(path.join(fixture,'dist/index.html'),'installed office');
    fs.writeFileSync(path.join(fixture,'dist/assets/loaded.js'),'loaded runtime');
    fs.writeFileSync(path.join(fixture,'index.html'),'<script type="module" src="./app.js"></script>');
    fs.writeFileSync(path.join(fixture,'app.js'),'console.log("new candidate");');
    fs.mkdirSync(path.join(fixture,'src/office'),{recursive:true});
    fs.writeFileSync(path.join(fixture,'src/office/app-library-preview.html'),'<script type="module" src="../../app.js"></script>');
    const args=[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config',path.join(root,'vite.config.mjs')];
    await runUpdateCommand(process.execPath,args,fixture,{timeoutMs:15000});
    assert(fs.existsSync(path.join(fixture,'dist-build/index.html')));
    assert(fs.existsSync(path.join(fixture,'dist-build/src/office/app-library-preview.html')));
    assert(fs.existsSync(path.join(fixture,'dist-build/lucid-build.json')));
    assert.equal(fs.readFileSync(path.join(fixture,'dist/index.html'),'utf8'),'installed office');
    assert.equal(fs.readFileSync(path.join(fixture,'dist/assets/loaded.js'),'utf8'),'loaded runtime');
    fs.writeFileSync(path.join(fixture,'app.js'),'const unfinished = ;');
    await assert.rejects(runUpdateCommand(process.execPath,args,fixture,{timeoutMs:15000}));
    assert.equal(fs.readFileSync(path.join(fixture,'dist/index.html'),'utf8'),'installed office');
    assert.equal(fs.readFileSync(path.join(fixture,'dist/assets/loaded.js'),'utf8'),'loaded runtime');
    console.log('Build isolation: successful and failed real Vite builds preserve installed HTML and loaded assets.');
  }finally{
    assert.equal(path.dirname(path.resolve(fixture)),path.resolve(os.tmpdir()));
    assert(path.basename(fixture).startsWith('lucid-build-isolation-'));
    fs.rmSync(fixture,{recursive:true,force:true});
  }
}
module.exports={run};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
