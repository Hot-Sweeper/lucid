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
  const t3 = require('../electron/t3.cjs'), realConversation=t3.conversation, realConversationPage=t3.conversationPage;
  let fixture = null;
  t3.conversation = id => fixture || realConversation(id);
  t3.conversationPage = (id, options) => fixture ? {messages:fixture,cursor:null,hasMore:false} : realConversationPage(id, options);
  let checkedWindow = false;
  app.on('browser-window-created',(_e,win)=>{if(checkedWindow)return;checkedWindow=true;win.webContents.once('did-finish-load',async()=>{
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
        for(let i=1;i<=6;i++){wc.sendInputEvent({type:'mouseMove',button:'left',modifiers:['leftbuttondown'],x:before.x+(side==='left'?1:-1)*i*10,y:before.y});await wait(20);}
        wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:before.x+(side==='left'?60:-60),y:before.y});await wait(350);
        const width=await js(`document.querySelector('${side==='left'?'#side-panel':'.chat-panel'}').getBoundingClientRect().width`);
        console.log('resize',side,{before,width},await js(`({grabbing:document.body.classList.contains('col-resizing'),ui:JSON.parse(window.lucid.settingsLoad()).ui})`));
        check(width>before.width+30,`${side} panel resizes using real mouse input`);
      }
      check(await js(`{const u=JSON.parse(window.lucid.settingsLoad()).ui;typeof u.sideW==='number' && typeof u.chatW==='number'}`),'both panel widths save to the isolated settings');
      check(await js(`!document.querySelector('.follow-chip')`),'following a robot adds no bottom pill');
      const time='2026-10-31T12:29:';
      fixture=[{id:'u',role:'user',at:time+'00Z',text:'Check the real app.',attachments:[]},...['First progress update.','Second progress update.','Finished result.'].map((text,i)=>({id:'a'+i,role:'assistant',at:time+(10+i)+'Z',text,attachments:[]})),{id:'event',role:'event',at:time+'20Z',text:'',attachments:[],event:{kind:'compaction',status:'completed'}},{id:'next',role:'assistant',at:time+'21Z',text:'After compaction.',attachments:[]}];
      await js('window.__chat.close();window.__world.onFollowChat(window.__world.orchThread)');await wait(700);
      check(await js(`document.querySelectorAll('.cp-group.bot').length===2 && document.querySelector('.cp-group.bot .cp-earlier summary').textContent==='2 earlier updates'`),'same-minute updates collapse and a compaction breaks grouping');
      await js(`document.querySelector('.cp-group.bot .cp-earlier summary').click()`);
      check(await js(`document.querySelector('.cp-group.bot details').open && document.querySelector('.cp-group.bot .cp-earlier-body').innerText.includes('First progress update.')`),'earlier updates expand without losing content');
      check(await js(`document.querySelector('.cp-event').textContent.includes('Context compacted')`),'compaction has a readable timeline row');
      await js(`window.__world.onFollowChat(window.__world.orchThread)`);await wait(200);
      check(await js(`document.querySelector('.cp-group.bot details').open`),'reopening the same thread preserves expanded message groups');
      await js(`window.__world.unfocus()`);await wait(300);
      check(await js(`window.__chat.isOpen && window.__chat.threadId===window.__world.orchThread`),'camera unfocus preserves the selected chat');
      await capture('grouped-chat');
      check(await js(`(async()=>{
        const c=window.__chat,api=c.api,original={...api},desk=c.desk;
        const ta=c.el.querySelector('textarea'),form=c.el.querySelector('form'),sent=[];
        const a={threadId:'fixture-chat-a',info:{title:'Fixture A',provider:'codex'},profile:{name:'A'}},b={threadId:'fixture-chat-b',info:{title:'Fixture B',provider:'codex'},profile:{name:'B'}};
        const tick=()=>new Promise(r=>setTimeout(r,40));let release;
        try{
          api.conversationPage=undefined;api.conversation=async()=>[];api.t3=undefined;
          api.saveAttachment=()=>new Promise(r=>{release=r});
          api.sendMessage=async(o)=>{sent.push(o);return{ok:true}};
          c.open(a);ta.value='A attachment';c.addFiles([new File(['fixture'],'fixture.txt',{type:'text/plain'})]);form.requestSubmit();await tick();
          c.open(b);if(ta.value||c.files.length)throw Error('A composer leaked into B');
          ta.value='B unfinished draft';release('fixture-file.txt');await tick();
          if(sent.length!==1||sent[0].threadId!==a.threadId||ta.value!=='B unfinished draft')throw Error('Delayed send changed target or B draft');
          c.open(a);if(ta.value||c.files.length)throw Error('Successful background send kept A draft');
          c.open(b);if(ta.value!=='B unfinished draft')throw Error('B draft did not restore');
          c.open(a);ta.value='A retry';api.sendMessage=async()=>{throw Error('Fixture connection failure')};form.requestSubmit();c.open(b);await tick();
          c.open(a);if(ta.value!=='A retry'||!c.el.querySelector('.cp-notice')?.textContent.includes('Could not send'))throw Error('Background failure lost the retry draft');
          c.paired=true;api.t3={reorder:async()=>{throw Error('Interrupted drag must not reorder')},status:async()=>({paired:true,selection:null})};
          c.renderQueue([0,1].map(i=>({id:'fixture-queue-'+i,queueRunId:'fixture-run-'+i,role:'user',at:new Date().toISOString(),text:'Queued fixture '+i,attachments:[],run:'queued',queue:i})));
          const grip=c.el.querySelector('.cq-grip'),r=grip.getBoundingClientRect();
          grip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:72,button:0,clientX:r.left+2,clientY:r.top+2}));
          window.dispatchEvent(new PointerEvent('pointermove',{pointerId:72,clientY:r.top+180}));c.open(b);
          if(document.body.classList.contains('cq-dragging')||c.queueHold)throw Error('Interrupted queue drag stayed active');
          return true;
        }finally{Object.assign(api,original);for(const id of[a.threadId,b.threadId]){c.drafts.delete(id);c.sendErrors.delete(id)}c.pending=c.pending.filter(p=>!p.threadId.startsWith('fixture-chat-'));c.open(desk)}
      })()`),'attachment sends keep their original robot and thread drafts survive switching and failed sends');
      await js(`window.__dailyReward(15,3)`);await wait(450);
      check(await js(`{const t=[...document.querySelectorAll('.milestone-toast')].at(-1),copy=t.querySelector(':scope > div > .milestone-detail'),badge=t.querySelector(':scope > .milestone-badge'),r=copy.getBoundingClientRect(),p=copy.parentElement.getBoundingClientRect();copy.textContent==='Day 3 in a row. Come back tomorrow for more.' && !!badge.querySelector('svg') && !badge.textContent.includes('Come back') && r.left>=p.left-1 && r.right<=p.right+1}`),'daily reward copy stays in its text column beside the vector badge');
      await js(`document.querySelectorAll('.milestone-toast').forEach(t=>t.getAnimations().forEach(a=>a.finish()))`);
      // Open the live plan on its monitor, then restore the existing desktop.
      await js(`{const w=window.__world,d=[...w.desks.values()].find(d=>d.threadId);window.__uiDesk=d;d.setPlan([{text:'Measure idle, crowded, panning, rain, chat and app rendering costs.',status:'completed'},{text:'Implement visibility-aware rendering without starving any visible robot.',status:'in_progress'},{text:'Run comparisons and verify the combined application.',status:'pending'}]);w.focusOn(d)}`);await wait(1100);
      const planPoint=await js(`{const r=window.__uiDesk.el.querySelector('.desk-plan').getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
      console.log('plan point',planPoint,await js(`document.elementFromPoint(${planPoint.x},${planPoint.y})?.outerHTML.slice(0,250)`));
      await click(planPoint);await wait(300);
      check(await js(`window.__uiDesk.screen.querySelector('.desk-plan-panel ol').innerText.includes('without starving any visible robot.') && window.__uiDesk.el.querySelector('.desk-plan').getAttribute('aria-expanded')==='true'`),'desk widget opens all full-length steps on the monitor');
      await capture('readable-plan');
      await js(`window.__uiDesk.screen.querySelector('.desk-plan-close').click()`);
      check(await js(`!window.__uiDesk.screen.querySelector('.desk-plan-panel') && window.__uiDesk.el.querySelector('.desk-plan').getAttribute('aria-expanded')==='false'`),'closing the plan restores the monitor desktop');
      win.setSize(980,800);await wait(500);
      check(await js(`{const r=document.querySelector('.cp-form').getBoundingClientRect();document.querySelector('.scene').clientWidth>=350 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1}`),'minimum window size keeps the scene and chat composer usable');
      check(await js(`{const head=document.querySelector('.cp-head'),name=head.querySelector('.cp-who').getBoundingClientRect(),buttons=[...head.querySelectorAll('button')].map(b=>b.getBoundingClientRect());buttons.every(b=>b.top>=name.bottom-1||b.left>=name.right-1||b.right<=name.left+1)}`),'narrow chat header controls do not cover the robot name or thread title');
      await js(`{const fold=document.querySelector('[data-fold="usage"]');if(fold.getAttribute('aria-expanded')==='false')fold.click();const toggle=[...document.querySelectorAll('.st-toggle')].find(b=>b.textContent.includes('By project'));if(toggle.getAttribute('aria-expanded')==='false')toggle.click();document.querySelector('#usage').scrollIntoView({block:'center'})}`);await wait(500);
      check(await js(`{const root=document.querySelector('#usage-body .st'),rows=[...root.querySelectorAll('.st-projects-wrap .st-model')],box=root.getBoundingClientRect();rows.length>0 && rows.every(r=>{const b=r.getBoundingClientRect();return b.left>=box.left-1&&b.right<=box.right+1}) && root.scrollWidth<=root.clientWidth+1}`),'real project usage fits the narrow sidebar with readable project rows');
      await capture('project-usage-narrow');
      check((await js('window.__uiErrors')).length===0,'no renderer errors during integrated interactions');
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks},null,2));
      console.log(JSON.stringify({out,checks}));app.exit(0);
    }catch(error){await capture('failure').catch(()=>{});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,error:String(error)},null,2));console.error(out,error);app.exit(1);}
  });});
  require('../electron/main.cjs');
}
