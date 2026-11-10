const fs = require("node:fs");
const path = require("node:path");

// Opt-in isolated renderer assertions. The caller owns Electron startup and shutdown.
module.exports = async ({ js, wc, wait, out }) => {
  const result = {};
  const save = () => fs.writeFileSync(path.join(out, "behavior-checks.json"), JSON.stringify(result, null, 2));
  const assert = (value, message) => { if (!value) { save(); throw Error(message); } };
  try {
    await js(`(async()=>{
      const desk=window.__world.desks.get('perf-t0')||window.__world.desks.values().next().value;
      if(!desk)throw Error('Behavior fixture requires a world desk');
      const d=desk.director,wm=desk.wm,c=d.codex,browser=d.browser;
      d.reset();d.pumpEpoch=wm.epoch;wm.speed=80;
      const world=window.__world;
      const b=window.__behavior={desk,d,wm,c,browser,world,points:[],opens:[],refreshes:[],activities:[],peekCalls:0,seq:0};
      b.saved={open:wm.open,pointAt:wm.pointAt,generate:c.generate,refresh:c.refresh,onActivity:d.onActivity,peek:browser.peek,Image:window.Image,prefs:wm.prefs,cam:{...world.cam}};
      world.cam={s:2,x:world.scene.clientWidth/2-(parseFloat(desk.el.style.left)+200)*2,y:world.scene.clientHeight/2-(parseFloat(desk.el.style.top)+160)*2};world.apply();
      wm.prefs={...wm.prefs,tidiness:'messy'};
      wm.open=function(id,title){b.opens.push(id);return b.saved.open.call(wm,id,title,true)};
      wm.pointAt=function(el,...args){b.points.push({id:el?.id,tag:el?.tagName,text:el?.textContent?.slice(0,100)});return b.saved.pointAt.call(wm,el,...args)};
      browser.peek=async()=>{b.peekCalls++;return null};
      c.generate=function(opts){return b.saved.generate.call(c,{...opts,instant:true,maxMs:0})};
      c.refresh=function(...args){const p=b.saved.refresh.call(c,...args);b.lastRefresh=p;b.refreshes.push(args[0]);return p};
      d.onActivity=text=>{b.activities.push(text);b.saved.onActivity(text)};
      b.image=color=>{const canvas=document.createElement('canvas');canvas.width=24;canvas.height=16;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,24,16);return canvas.toDataURL('image/png')};
      b.red=b.image('#ff4000');b.blue=b.image('#0066ff');
      b.item=(id,status,output)=>({id,runId:'behavior-run',ordinal:++b.seq,type:'dynamic_tool',status,updatedAt:new Date(Date.now()+b.seq).toISOString(),data:{toolName:'mcp__image_gen__imagegen',input:{prompt:'Fixture '+id},output}});
      b.snapshot=()=>{const root=wm.wins.get('codex')?.body,blocks=root?.querySelectorAll('.cx-a'),block=blocks?.[blocks.length-1];return {activity:b.activities[b.activities.length-1],line:block?.querySelector('.cx-line')?.textContent,error:block?.querySelector('.cx-err')?.textContent,images:block?.querySelectorAll('.cx-pics img').length||0,prompts:root?.querySelectorAll('.cx-u').length||0,blocks:blocks?.length||0,windows:[...wm.wins.keys()]}};
      b.play=async(id,status,output)=>{const item=b.item(id,status,output);d.items.set(id,item);d.played.add(id);await d.playImageGen(id,{prompt:'Fixture '+id,edit:false});return b.snapshot()};
    })()`);

    result.previewClose = await js(`(async()=>{
      const b=window.__behavior,{d,browser}=b;
      await browser.open('https://behavior.invalid/first',{key:'pv:fixture-first',text:'First fixture page',instant:true,read:false});
      await browser.open('https://behavior.invalid/second',{key:'pv:fixture-second',text:'Second fixture page',instant:true,read:false});
      const first=browser.tabs.find(t=>t.key==='pv:fixture-first'),second=browser.tabs.find(t=>t.key==='pv:fixture-second');
      d.items.set('fixture-close',{...b.item('fixture-close','completed',{}),data:{toolName:'mcp__t3_code__preview_close',input:{tabId:'fixture-first'},output:{tabId:'fixture-first'}}});
      const handled=await d.playTool('fixture-close','mcp__t3_code__preview_close');
      const after={handled,keys:browser.tabs.map(t=>t.key),sameRemainingPage:browser.active===second&&second.page.isConnected,closedPageDetached:!first.page.isConnected};
      d.items.set('fixture-failed-close',{...b.item('fixture-failed-close','failed',{isError:true}),data:{input:{tabId:'fixture-second'},output:{isError:true}}});
      await d.playTool('fixture-failed-close','mcp__t3_code__preview_close');
      after.failedPreserved=browser.tabs.includes(second)&&second.page.isConnected;
      await browser.closeTab('pv:unknown',true);after.unknownPreserved=browser.tabs.includes(second);
      return after;
    })()`);
    assert(result.previewClose.handled && result.previewClose.keys.length === 1 && result.previewClose.keys[0] === "pv:fixture-second" && result.previewClose.sameRemainingPage && result.previewClose.closedPageDetached && result.previewClose.failedPreserved && result.previewClose.unknownPreserved, "preview_close did not preserve the other preview tab or respect failure/unknown IDs");

    result.sameSite = await js(`(async()=>{
      const b=window.__behavior,{browser,wm}=b,t=browser.active;
      t.page.innerHTML='<div style="height:40px"></div><h2 id="behavior-unrelated-heading">A heading unrelated to the destination</h2><p>Fixture page content.</p>';
      b.points.length=0;
      const next=await browser.open('https://behavior.invalid/actual-destination',{text:'Actual destination fixture',title:'Actual destination',read:false});
      return {url:next.url,address:wm.wins.get('browser').body.querySelector('.b-addr').textContent,sameTab:next===t,wrongHeading:b.points.some(p=>p.id==='behavior-unrelated-heading'),addressTargeted:b.points.some(p=>p.tag==='SPAN'&&p.text?.includes('behavior.invalid')),peekCalls:b.peekCalls};
    })()`);
    assert(result.sameSite.url === "https://behavior.invalid/actual-destination" && result.sameSite.address.includes("behavior.invalid/actual-destination") && result.sameSite.sameTab && !result.sameSite.wrongHeading && result.sameSite.addressTargeted && result.sameSite.peekCalls === 0, "Same-site navigation did not use its actual destination address");
    fs.writeFileSync(path.join(out, "behavior-browser.png"), (await wc.capturePage()).toPNG());

    result.images = await js(`(async()=>{
      const b=window.__behavior;
      const success=await b.play('fixture-success','completed',{images:[b.red]});
      const failed=await b.play('fixture-failed','failed',{isError:true,error:'Fixture image service failed'});
      const pending=await b.play('fixture-pending','running',{});
      const unreadable=await b.play('fixture-unreadable','completed',{images:['data:image/png;base64,bm90LWFuLWltYWdl']});
      const interrupted=await b.play('fixture-interrupted','interrupted',{});
      return {success,failed,pending,unreadable,interrupted};
    })()`);
    assert(result.images.success.images === 1 && result.images.success.line.includes("Generated image") && result.images.success.activity === "Generated an image", "Successful real image output was not displayed");
    for (const kind of ["failed", "pending", "unreadable", "interrupted"]) assert(!/Generated|Edited image/.test(result.images[kind].line) && result.images[kind].images === 0 && !/^Generated an image$/.test(result.images[kind].activity), `${kind} image fixture falsely claimed a generated image`);
    assert(result.images.failed.activity === "Image generation failed" && result.images.interrupted.activity === "Image generation failed" && result.images.pending.activity === "Waiting for image generation" && result.images.unreadable.activity === "Image preview unavailable", "Image outcome activity did not match its real tool result");

    result.late = await js(`(async()=>{
      const b=window.__behavior,{d,c,wm}=b;
      await b.play('fixture-late','running',{});
      const block=c.presentation.block,root=c.presentation.root,prompts=root.querySelectorAll('.cx-u').length,blocks=root.querySelectorAll('.cx-a').length;
      await wm.open('notes','Focus must stay here');
      const opens=b.opens.length,refreshes=b.refreshes.length,item=b.item('fixture-late','completed',{images:[b.blue]});
      d.push([item],false);await b.lastRefresh;
      const after={sameBlock:c.presentation.block===block,images:block.querySelectorAll('.cx-pics img').length,line:block.querySelector('.cx-line').textContent,prompts:root.querySelectorAll('.cx-u').length,blocks:root.querySelectorAll('.cx-a').length,focusPreserved:wm.isFront('notes'),noOpen:b.opens.length===opens,refreshes:b.refreshes.length-refreshes,played:d.played.has(item.id),queued:d.queue.includes(item.id),expectedPrompts:prompts,expectedBlocks:blocks};
      d.push([{...item,updatedAt:new Date().toISOString()}],false);
      after.duplicateIgnored=b.refreshes.length===refreshes+1;
      return after;
    })()`);
    assert(result.late.sameBlock && result.late.images === 1 && result.late.line.includes("Generated image") && result.late.prompts === result.late.expectedPrompts && result.late.blocks === result.late.expectedBlocks && result.late.focusPreserved && result.late.noOpen && result.late.refreshes === 1 && result.late.played && !result.late.queued && result.late.duplicateIgnored, "Late image update replayed, stole focus, duplicated the prompt, or failed to fill its original result block");

    result.lateFailures = await js(`(async()=>{
      const b=window.__behavior,{d,c}=b,out={};
      for(const kind of ['failed','unreadable']){
        const id='fixture-late-'+kind;await b.play(id,'running',{});const block=c.presentation.block;
        const output=kind==='failed'?{isError:true,error:'Late service failure'}:{images:['data:image/png;base64,bm90LWFuLWltYWdl']};
        d.push([b.item(id,kind==='failed'?'failed':'completed',output)],false);await b.lastRefresh;
        out[kind]={sameBlock:c.presentation.block===block,line:block.querySelector('.cx-line').textContent,images:block.querySelectorAll('.cx-pics img').length};
      }
      return out;
    })()`);
    assert(result.lateFailures.failed.sameBlock && result.lateFailures.failed.line === "Image generation failed" && result.lateFailures.failed.images === 0 && result.lateFailures.unreadable.sameBlock && result.lateFailures.unreadable.line === "Image preview unavailable" && result.lateFailures.unreadable.images === 0, "Late failed/unreadable image update falsely claimed success");

    result.stale = await js(`(async()=>{
      const b=window.__behavior,{d,c}=b;
      await b.play('fixture-old-slow','running',{});const oldBlock=c.presentation.block;
      const NativeImage=b.saved.Image,src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');b.held=[];
      window.Image=function(...args){const im=new NativeImage(...args);Object.defineProperty(im,'src',{configurable:true,get(){return src.get.call(im)},set(value){if(value===b.red)b.held.push(()=>src.set.call(im,value));else src.set.call(im,value)}});return im};
      d.push([b.item('fixture-old-slow','completed',{images:[b.red]})],false);const oldRefresh=b.lastRefresh;
      window.Image=NativeImage;
      if(b.held.length!==1)throw Error('Stale image fixture did not hold the old asynchronous load');
      await b.play('fixture-newest','completed',{images:[b.blue]});const newest=c.presentation.block;
      b.held.forEach(release=>release());const oldOutcome=await oldRefresh;
      return {oldOutcome,newestUnchanged:c.presentation.block===newest,newestSource:newest.querySelector('.cx-pics img')?.src,expectedSource:b.blue,newestLine:newest.querySelector('.cx-line').textContent,oldImages:oldBlock.querySelectorAll('.cx-pics img').length,peekCalls:b.peekCalls};
    })()`);
    assert(result.stale.oldOutcome === null && result.stale.newestUnchanged && result.stale.newestSource === result.stale.expectedSource && result.stale.newestLine.includes("Generated image") && result.stale.oldImages === 0 && result.stale.peekCalls === 0, "Stale asynchronous image result replaced a newer image or attempted external page loading");
    await wait(100);
    fs.writeFileSync(path.join(out, "behavior-images.png"), (await wc.capturePage()).toPNG());
    result.passed = true;
    save();
    console.log("behaviorChecks", JSON.stringify(result));
  } catch (error) {
    result.error = error.message;
    throw error;
  } finally {
    await js(`{const b=window.__behavior;if(b){const {d,wm,c,browser,saved,world}=b;window.Image=saved.Image;wm.open=saved.open;wm.pointAt=saved.pointAt;c.generate=saved.generate;c.refresh=saved.refresh;browser.peek=saved.peek;d.onActivity=saved.onActivity;d.reset();d.pumpEpoch=-1;wm.speed=1;wm.prefs=saved.prefs;world.cam=saved.cam;world.apply();delete window.__behavior}}`).catch(() => {});
    save();
  }
};
