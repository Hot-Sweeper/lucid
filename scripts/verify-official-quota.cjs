// Read the same supported T3 provider quota snapshots as the desktop UI.
// Uses the existing OS-encrypted Lucid pairing only, never pairs or prints credentials.
const fs=require('node:fs'),path=require('node:path');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
}else{
  const {app}=require('electron');
  app.setPath('userData',path.join(app.getPath('appData'),'lucid'));
  app.whenReady().then(async()=>{
    try{
      const server=require('../electron/t3server.cjs');
      const start=performance.now(),snapshot=await server.usageLimits();
      const summary={source:snapshot.source,elapsedMs:Math.round(performance.now()-start),error:snapshot.error||null,
        providers:(snapshot.providers||[]).map(p=>({instance:p.instanceId,driver:p.driver,name:p.name,checkedAt:p.usageLimits?.checkedAt||null,
          windows:(p.usageLimits?.windows||[]).map(w=>({id:w.id,label:w.label,known:typeof w.usedPercent==='number',windowMinutes:w.windowDurationMins})),
          unavailable:p.usageLimits?.unavailable?.reason||null}))};
      if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(summary,null,2));
      console.log(JSON.stringify(summary));app.exit(0);
    }catch(error){console.error(error.message);app.exit(1)}
  });
}
