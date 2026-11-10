// Run through agent-workspace-linux. Real robot artwork and world data, isolated settings.
const fs=require('node:fs'),path=require('node:path');
const out=process.env.LUCID_FIRE_OUT||'/tmp/lucid-approved-fire';fs.mkdirSync(out,{recursive:true});
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
}else{
  const {app}=require('electron');
  process.env.LUCID_SHOT=out;process.env.LUCID_SHOT_PROFILE=out+'/profile';process.env.LUCID_SHOT_EVERY='3600000';
  process.env.LUCID_DEV_URL=require('node:url').pathToFileURL(path.resolve(process.env.LUCID_QA_CANDIDATE||'dist-build','index.html')).href;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));let seen=false;
  app.on('browser-window-created',(_,win)=>{
    if(seen)return;seen=true;
    win.webContents.once('did-finish-load',async()=>{
      const wc=win.webContents,js=code=>wc.executeJavaScript(code),result={};
      try{
        win.setPosition(0,0);win.setFocusable(true);win.show();win.focus();await wait(4500);
        result.robot=await js(`(()=>{
          const w=window.__world,data=w.lastData;
          const candidates=data.threads.filter(t=>w.desks.has(t.id)&&t.runStatus==='running');
          const t=candidates.find(t=>/cat/.test(w.roster.byThread(t.id)?.look?.hat||''))||candidates.find(t=>t.id.includes('777d3381ca'))||candidates[0];
          if(!t)throw Error('No active robot for native visual check');
          const d=w.desks.get(t.id);d.el.classList.remove('arriving');w.focusOn(d);window.__chat.setCollapsed(true);
          window.__fireQA={w,t,d,mode:{ultra:true,fast:false},update:w.update};
          w.update=function(data){const q=window.__fireQA;return q.update.call(this,{...data,threads:data.threads.map(x=>x.id===t.id?{...x,...q.mode}:x)})};w.update(data);
          return {id:t.id,title:t.title,look:w.roster.byThread(t.id)?.look};
        })()`);await wait(1100);
        result.frames=[];
        for(let n=0;n<16;n++){
          await wait(140);
          const r=await js(`(()=>{const p=window.__fireQA.d.power,r=p.canvas.getBoundingClientRect();return {x:Math.max(0,Math.floor(r.x-50)),y:Math.max(0,Math.floor(r.y-50)),width:Math.min(innerWidth-Math.max(0,Math.floor(r.x-50)),Math.ceil(r.width+100)),height:Math.min(innerHeight-Math.max(0,Math.floor(r.y-50)),Math.ceil(r.height+120)),tick:p.fireTick,heat:[...p.heat].reduce((a,b)=>a+b,0),front:p.front.getImageData(0,0,64,80).data.filter((v,i)=>i%4===3&&v>0).length}})()`);
          result.frames.push(r);const {x,y,width,height}=r;
          fs.writeFileSync(out+'/frame-'+String(n).padStart(2,'0')+'.png',(await wc.capturePage({x,y,width,height})).toPNG());
        }
        if(new Set(result.frames.map(f=>f.heat)).size<5||result.frames.at(-1).tick<=result.frames[0].tick)throw Error('Fire did not animate');
        if(!result.frames.some(f=>f.front>0))throw Error('Lower body foreground fire is missing');
        result.states=[];
        for(const [ultra,fast]of[[false,false],[false,true],[true,true]]){
          await js(`{const q=window.__fireQA;q.mode={ultra:${ultra},fast:${fast}};q.w.update(q.w.lastData);undefined}`);await wait(300);
          result.states.push(await js(`(()=>{const p=window.__fireQA.d.power;return {mode:p.signature,back:p.canvas.style.display,front:p.foreground.style.display}})()`));
        }
        if(result.states[0].back!=='none'||result.states[1].front!=='none'||result.states[2].mode!=='true:true')throw Error('Mode transition failed');
        wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(500);
        const still=await js(`window.__fireQA.d.power.fireTick`);await wait(400);
        result.reduced=await js(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,tick:window.__fireQA.d.power.fireTick})`);
        if(!result.reduced.matches||result.reduced.tick!==still)throw Error('Reduced motion fire kept animating');
        wc.debugger.detach();result.passed=true;
      }catch(error){result.error=error.stack;process.exitCode=1}
      finally{fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.quit()}
    });
  });require('../../electron/main.cjs');
}
