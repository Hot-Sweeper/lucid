// Isolated native diagnostic using the exact captured running renderer and world metadata.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,stdio:'inherit'}).on('exit',c=>process.exit(c??1));
}else{
  const {app,ipcMain}=require('electron');
  const baseline=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),state=JSON.parse(fs.readFileSync(path.join(baseline,'live-state.json'),'utf8'));
  fs.mkdirSync(out,{recursive:true});
  process.env.LUCID_SHOT=out;process.env.LUCID_SHOT_PROFILE=path.join(out,'profile');process.env.LUCID_SHOT_EVERY='3600000';
  process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(path.join(process.env.LUCID_AB_BUILD||baseline,'index.html')).href;
  app.commandLine.appendSwitch('remote-debugging-port','9335');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
  app.whenReady().then(async()=>{try{fs.writeFileSync(path.join(out,'gpu.json'),JSON.stringify({features:app.getGPUFeatureStatus(),info:await app.getGPUInfo('basic')},null,2))}catch{}});
  app.on('browser-window-created',(_e,win)=>{
    if(win.__ab)return;win.__ab=true;
    win.webContents.once('did-finish-load',()=>{
      win.setContentSize(state.viewport.width,state.viewport.height);
      setTimeout(async()=>{
        try{
          const gpuInfo=await app.getGPUInfo('complete');
          fs.writeFileSync(path.join(out,'gpu-active.json'),JSON.stringify({features:app.getGPUFeatureStatus(),info:gpuInfo},null,2));
          await win.webContents.executeJavaScript(`(()=>{const w=window.__world;w.stopCameraMotion();w.cam=${JSON.stringify(state.cam)};w.apply()})()`);
          if(process.env.LUCID_AB_SHARPNESS==='1'){
            await require('./render-zoom-sharpness-checks.cjs')({js:code=>win.webContents.executeJavaScript(code),wc:win.webContents,wait:ms=>new Promise(r=>setTimeout(r,ms)),out});
            app.exit(0);return;
          }
          if(process.env.LUCID_AB_CANVAS_CHECKS==='1'){
            await require('./render-outside-canvas-checks.cjs')({js:code=>win.webContents.executeJavaScript(code),wc:win.webContents,wait:ms=>new Promise(r=>setTimeout(r,ms)),out});
            if(process.env.LUCID_AB_CHECKS_ONLY==='1'){app.exit(0);return}
          }
          const env={...process.env,LUCID_CDP_PORT:'9335',LUCID_AB_CONTROLLED:'1'};delete env.ELECTRON_RUN_AS_NODE;
          const child=spawn('node',[path.join(__dirname,'profile-camera-ablation.cjs'),out],{env,stdio:'inherit'});
          child.on('exit',c=>app.exit(c??1));child.on('error',e=>{console.error(e);app.exit(1)});
        }catch(e){console.error(e);app.exit(1)}
      },5000);
    });
  });
  require('../electron/main.cjs');
  for(const channel of ['t3:world','t3:watch-set','t3:conversation'])ipcMain.removeHandler(channel);
  ipcMain.handle('t3:world',()=>state.data);ipcMain.handle('t3:watch-set',()=>true);ipcMain.handle('t3:conversation',()=>[]);
}
