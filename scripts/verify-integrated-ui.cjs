const fs = require('node:fs');
const path = require('node:path');
if (!process.versions.electron) {
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'lucid-integrated-'));
  const env = {...process.env,LUCID_SHOT:out,LUCID_SHOT_EVERY:'3600000',LUCID_SHOT_PROFILE:path.join(out,'profile')};
  delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,out],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
} else {
  const {app} = require('electron');
  app.setPath('userData',path.join(app.getPath('appData'),'lucid'));
  const out = process.argv[2], wait = ms=>new Promise(r=>setTimeout(r,ms));
  const t3 = require('../electron/t3.cjs'), realConversation=t3.conversation;
  let fixture = null;
  t3.conversation = id => fixture || realConversation(id);
  app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
    const wc=win.webContents, checks=[];
    const js=code=>wc.executeJavaScript(code), check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
    const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());
    const click=async p=>{wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});await wait(120);};
    try {
      await wait(6500);
      await js(`{window.__uiErrors=[];window.addEventListener('error',e=>window.__uiErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__uiErrors.push(String(e.reason)))}`);
      check(await js('!!window.__world.orchThread && !!document.querySelector(".world-boss")'),'real Orchestrator is seated');
      await js(`{const w=window.__world;w.follow(document.querySelector('.world-boss'))}`);await wait(1200);
      const point=await js(`{const el=document.querySelector('.world-boss'),r=el.getBoundingClientRect(),s=getComputedStyle(el,'::before'),z=window.__world.cam.s;({x:Math.round(r.left),y:Math.round(r.top+(parseFloat(s.top)+parseFloat(s.height)/2)*z)})}`);
      console.log('boss point',point,await js(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,350)`));
      await click(point);await wait(900);
      check(await js(`document.querySelector('.chat-panel').classList.contains('open') && document.querySelector('.cp-who span').textContent.includes('Orchestrator')`),'clicking the boss opens its real chat');
      check(await js(`!![...document.querySelectorAll('.cp-event')].find(e=>e.textContent.includes('Context handoff'))`),'real Claude to Codex context handoff appears in chat');
      await js(`{document.querySelector('.cp-event')?.scrollIntoView({block:'center'})}`);await capture('boss-handoff');
      for(const side of ['left','right']){
        const before=await js(`{const e=document.querySelector('.grip.${side}'),r=e.getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:document.querySelector('${side==='left'?'#side-panel':'.chat-panel'}').getBoundingClientRect().width})}`);
        wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:before.x,y:before.y});
        for(let i=1;i<=6;i++){wc.sendInputEvent({type:'mouseMove',button:'left',buttons:['left'],x:before.x+(side==='left'?1:-1)*i*10,y:before.y});await wait(20);}
        wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:before.x+(side==='left'?60:-60),y:before.y});await wait(350);
        const width=await js(`document.querySelector('${side==='left'?'#side-panel':'.chat-panel'}').getBoundingClientRect().width`);
        console.log('resize',side,{before,width},await js(`({grabbing:document.body.classList.contains('col-resizing'),ui:JSON.parse(window.lucid.settingsLoad()).ui})`));
        check(width>before.width+30,`${side} panel resizes using real mouse input`);
      }
      check(await js(`{const u=JSON.parse(window.lucid.settingsLoad()).ui;typeof u.sideW==='number' && typeof u.chatW==='number'}`),'both panel widths save to the isolated settings');
      check(await js(`{const c=document.querySelector('.follow-chip').getBoundingClientRect(),s=document.querySelector('.scene').getBoundingClientRect();c.left>=s.left && c.right<=s.right}`),'follow controls stay inside the scene beside the chat');
      const time='2026-10-31T12:29:';
      fixture=[{id:'u',role:'user',at:time+'00Z',text:'Check the real app.',attachments:[]},...['First progress update.','Second progress update.','Finished result.'].map((text,i)=>({id:'a'+i,role:'assistant',at:time+(10+i)+'Z',text,attachments:[]})),{id:'event',role:'event',at:time+'20Z',text:'',attachments:[],event:{kind:'compaction',status:'completed'}},{id:'next',role:'assistant',at:time+'21Z',text:'After compaction.',attachments:[]}];
      await js('window.__world.onFollowChat(window.__world.orchThread)');await wait(700);
      check(await js(`document.querySelectorAll('.cp-group.bot').length===2 && document.querySelector('.cp-group.bot .cp-earlier summary').textContent==='2 earlier updates'`),'same-minute updates collapse and a compaction breaks grouping');
      await js(`document.querySelector('.cp-group.bot .cp-earlier summary').click()`);
      check(await js(`document.querySelector('.cp-group.bot details').open && document.querySelector('.cp-group.bot .cp-earlier-body').innerText.includes('First progress update.')`),'earlier updates expand without losing content');
      check(await js(`document.querySelector('.cp-event').textContent.includes('Context compacted')`),'compaction has a readable timeline row');
      await capture('grouped-chat');
      // Open a plan through the actual desk pad, with all long steps readable in chat.
      await js(`{const w=window.__world,d=[...w.desks.values()].find(d=>d.threadId);window.__uiDesk=d;d.setPlan([{text:'Measure idle, crowded, panning, rain, chat and app rendering costs.',status:'completed'},{text:'Implement visibility-aware rendering without starving any visible robot.',status:'in_progress'},{text:'Run comparisons and verify the combined application.',status:'pending'}]);w.focusOn(d)}`);await wait(1100);
      const planPoint=await js(`{const r=window.__uiDesk.el.querySelector('.desk-plan').getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
      console.log('plan point',planPoint,await js(`document.elementFromPoint(${planPoint.x},${planPoint.y})?.outerHTML.slice(0,250)`));
      await click(planPoint);await wait(300);
      check(await js(`document.querySelector('.cp-plan').open && document.querySelector('.cp-plan ol').innerText.includes('without starving any visible robot.')`),'desk plan pad opens all full-length steps');
      await capture('readable-plan');
      win.setSize(980,800);await wait(500);
      check(await js(`{const r=document.querySelector('.cp-form').getBoundingClientRect();document.querySelector('.scene').clientWidth>=350 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1}`),'minimum window size keeps the scene and chat composer usable');
      check((await js('window.__uiErrors')).length===0,'no renderer errors during integrated interactions');
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks},null,2));
      console.log(JSON.stringify({out,checks}));app.exit(0);
    }catch(error){await capture('failure').catch(()=>{});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,error:String(error)},null,2));console.error(out,error);app.exit(1);}
  }));
  require('../electron/main.cjs');
}
