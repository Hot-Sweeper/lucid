// Reconstruct the old exact-arrival rule without modifying the shared checkout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
 const file='src/office/world.ts',current=fs.readFileSync(file,'utf8');
 const needle='return !!actor && !this.exits.has(id) && layoutClearAt(actor, this.floorPlan, desiredFloor, HALL);';
 if(!current.includes(needle))throw Error('Readiness rule changed; review control reversal');
 const control=current.replace(needle,'return !!actor && !this.exits.has(id) && Math.hypot(actor.x - this.meetingSpots.get(id).x, actor.y - this.meetingSpots.get(id).y) <= 8;');
 fs.writeFileSync(path.join(out,'control-world.ts'),control);
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 fs.writeFileSync(path.join(out,'control-provenance.json'),JSON.stringify({createdAt:new Date().toISOString(),description:'Reconstructed comparison, current source with only readiness restored to exact arrival. Not historical footage.',source:file,currentSHA256:hash(current),controlSHA256:hash(control)},null,2));
 await(await import('vite')).build({plugins:[{name:'exact-rendezvous-control',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/'+file))return control}}],build:{outDir:path.join(out,'dist')}});
})().catch(e=>{console.error(e);process.exitCode=1});
