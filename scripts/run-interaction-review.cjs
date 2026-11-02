// Alternate fresh processes with identical frozen harness bytes. No tracing.
// node scripts/run-interaction-review.cjs --before <snapshot> --after <snapshot> --out <fresh output> --cycles 2 --pairs 3
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const flag=name=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1]};
const before=path.resolve(flag('--before')),after=path.resolve(flag('--after')),out=path.resolve(flag('--out'));
const cycles=Number(flag('--cycles')||2),pairs=Number(flag('--pairs')||3);
const pacedOnly=process.argv.includes('--paced-only'),recovery=flag('--recovery-seconds');
if(!Number.isInteger(cycles)||cycles<1||!Number.isInteger(pairs)||pairs<1)throw Error('Positive integer cycles and pairs required');
if(fs.existsSync(path.join(out,'matched-runs.json')))throw Error('Use a fresh matched-run output');
for(const root of [before,after])if(!/[\\/]\.lucid-update-|[\\/]Lucid-validation[\\/]/i.test(root)||!fs.existsSync(path.join(root,'dist/index.html')))throw Error('Use validated private builds');
fs.mkdirSync(out,{recursive:true});
const tools=path.join(out,'tools');fs.mkdirSync(tools);
const manifest={started:new Date().toISOString(),before,after,cycles,pairs,pacedOnly,recoverySeconds:recovery===undefined?30:Number(recovery),tools:{},runs:[]};
for(const name of ['profile-interaction-review.cjs','interaction-review-resources.cjs','interaction-review-isolation.cjs']){
  const bytes=fs.readFileSync(path.join(__dirname,name));fs.writeFileSync(path.join(tools,name),bytes);
  manifest.tools[name]=crypto.createHash('sha256').update(bytes).digest('hex');
}
const save=()=>fs.writeFileSync(path.join(out,'matched-runs.json'),JSON.stringify(manifest,null,2));save();
(async()=>{
  for(let pair=0;pair<pairs;pair++){
    for(const variant of pair%2?['after','before']:['before','after']){
      const directory=path.join(out,`${pair}-${variant}`),run={pair,variant,directory,started:new Date().toISOString()};manifest.runs.push(run);save();
      console.log('Starting',pair,variant);
      const args=[path.join(tools,'profile-interaction-review.cjs'),'--root',variant==='before'?before:after,'--out',directory,'--cycles',String(cycles)];
      if(pacedOnly)args.push('--paced-only');if(recovery!==undefined)args.push('--recovery-seconds',recovery);
      const code=await new Promise((resolve,reject)=>{const child=cp.spawn(process.execPath,args,{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve)});
      run.completed=new Date().toISOString();run.exitCode=code;save();
      if(code!==0)throw Error(`Matched run ${pair} ${variant} failed with exit code ${code}`);
    }
  }
  manifest.completed=new Date().toISOString();save();
})().catch(error=>{manifest.error=String(error.stack||error);save();console.error(error);process.exitCode=1});
