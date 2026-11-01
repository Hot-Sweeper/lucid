const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ js, wc, wait, out, setMessages }) => {
  const result = {};
  const assert = (value, message) => { if (!value) { fs.writeFileSync(path.join(out, "system-checks.json"), JSON.stringify(result,null,2)); throw Error(message); } };
  const until = async (code, message, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await js(code)) return; await wait(60); }
    assert(false, message);
  };
  const layoutHeld = await js("window.__world.layoutHeld");
  try {
  result.hudHiddenByDefault = await js("!document.getElementById('lucid-perf') && !window.__lucidPerf.snapshot().enabled");
  assert(result.hudHiddenByDefault, "Diagnostics must be opt-in");
  // The seated presentation intentionally stays paused while its real robot
  // walks in. Begin manual app checks only after that physical handoff.
  await until("{const d=window.__world.desks.get('perf-t0');!!d&&d.el.isConnected&&!d.el.classList.contains('arriving')}", "Fixture robot did not reach its desk", 20000);
  await js(`{
    // These checks manually drive a desk's applications. Keep the periodic world
    // fixture refresh from assigning that same robot a different presentation
    // halfway through a sample. Camera, apps and animation schedulers stay live.
    window.__world.setLayoutHeld(true);
    for(const desk of window.__world.desks.values())desk.director.reset();
    const w=window.__world,d=w.desks.get('perf-t0');window.__checkDesk=d;
    try{d.wm.check(d.wm.epoch-1)}catch(error){window.__fixtureCancelled=error.constructor}
    // A collapsed chat exposes more of the world. Keep the indoor weather check
    // wholly inside this office rather than including a strip of lawn at its edge.
    window.__centerCheckDesk=(scale=Math.max(2,w.scene.clientWidth/350,w.scene.clientHeight/300))=>{w.stopCameraMotion();w.frame=null;w.cam={s:scale,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*scale,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*scale};w.apply()};
    window.__centerCheckDesk();d.wm.speed=20;
    void d.director.idleLife.doActivity('nightshift',d.director.idleLife.token).catch(e=>{if(!(e instanceof window.__fixtureCancelled))console.error(e)});
    window.__lucidPerf.enable(true);
  }`);
  // Cold optional modules and physical desk arrival can outlast a fixed delay.
  // Test the running production game only after its actual app entry is mounted.
  await until("!!window.__checkDesk.wm.wins.get('game')?.body.querySelector('canvas') && window.__lucidPerf.render().active > 0", "Fixture game did not enter its visible full-detail rendering state");
  const sample = async () => {
    await js("window.__lucidPerf.reset()"); await wait(700);
    return js("({calls:window.__lucidPerf.snapshot().systems.apps.calls,render:window.__lucidPerf.render()})");
  };
  result.visible = await sample();
  assert(result.visible.calls > 0, "Visible game must animate");
  await js("window.__fullGameCanvas=window.__checkDesk.wm.wins.get('game').body.querySelector('canvas');void 0");
  result.indoors = await js("({weather:document.querySelector('.weather-layer').style.visibility,scenery:document.querySelector('.outside-live').classList.contains('culled')})");
  assert(result.indoors.weather === "hidden" && result.indoors.scenery, "Invisible outdoor layers must stop indoors");
  await js("{const w=window.__world;w.cam.x=w.scene.clientWidth/2-4200*2;w.apply()}");
  await wait(250);
  result.offscreen = await sample();
  assert(result.offscreen.calls === 0, "Offscreen game still renders");
  await js("window.__centerCheckDesk()"); await wait(250);
  result.resumed = await sample();
  assert(result.resumed.calls > 0, "Game must resume when camera returns");
  result.screenScales = [];
  for (const scale of [.65, .23]) {
    await js(`window.__centerCheckDesk(${scale})`);
    await until("window.__checkDesk.wm.wins.get('game')?.el.dataset.detailReady === '1'", `Visible ${scale}x game detail did not finish capturing`);
    const measured = await sample();
    const content = await js(`{const d=window.__checkDesk,os=d.wm.root,style=getComputedStyle(os),game=d.wm.wins.get('game'),detail=game?.el.querySelector('.screen-detail');({scale:window.__world.cam.s,fps:Number(d.screen.dataset.renderFps),visible:style.visibility,contentVisibility:style.contentVisibility,paused:d.screen.classList.contains('render-paused'),tier:d.screen.dataset.screenDetail,title:game?.title.textContent,gameContent:!!game?.body.children.length,detailReady:game?.el.dataset.detailReady,detailVisible:!!detail&&getComputedStyle(detail).display!=='none'&&getComputedStyle(detail).visibility==='visible',detailContent:!!detail?.children.length,artworkRetained:game?.body.querySelector('canvas')===window.__fullGameCanvas})}`);
    result.screenScales.push({ requested:scale,...content,...measured });
    assert(content.fps >= 20 && content.visible === 'visible' && content.contentVisibility !== 'hidden' && !content.paused && content.gameContent && content.artworkRetained && content.tier && content.detailReady === '1' && content.detailVisible && content.detailContent && measured.calls === 0, `Visible ${scale}x screen lost its detail snapshot or kept painting an obscured canvas`);
    fs.writeFileSync(path.join(out,`game-live-${scale}.png`),(await wc.capturePage()).toPNG());
  }
  result.distant = result.screenScales[1];
  await js("window.__centerCheckDesk()"); await wait(250);
  result.fullDetailReturned = await sample();
  assert(result.fullDetailReturned.calls > 0 && await js("!window.__checkDesk.screen.dataset.screenDetail && window.__checkDesk.wm.wins.get('game').body.querySelector('canvas')===window.__fullGameCanvas"), "Returning from reduced detail must resume the same full-detail game canvas");
  await js(`(async()=>{const wm=window.__checkDesk.wm,w=await wm.open('notes','Covered-game check',true),f=wm.frameOf(wm.wins.get('game'));window.__coverFrame=f;Object.assign(w.el.style,{left:f.x+'px',top:f.y+'px',width:f.w+'px',height:f.h+'px',zIndex:String(++wm.z)});wm.syncOcclusion()})()`);
  // Opening surfaces remain translucent until their real entrance animation ends.
  for (let i=0;i<30 && !await js("window.__checkDesk.wm.wins.get('game').el.classList.contains('render-hidden')");i++) await wait(50);
  assert(await js("window.__checkDesk.wm.wins.get('game').el.classList.contains('render-hidden')"), "Opaque covering window did not hide the game");
  result.covered = await sample();
  assert(result.covered.calls === 0, "Fully covered app still renders");
  await js(`{const wm=window.__checkDesk.wm,f=window.__coverFrame;wm.speed=1;wm.animateFrame(wm.wins.get('notes'),{x:f.x+f.w-20,y:f.y,w:100,h:200},.8);void 0}`);
  result.movingCover = await js(`{const w=window.__checkDesk.wm.wins.get('game');({hidden:w.el.dataset.renderHidden,bodyVisibility:getComputedStyle(w.body).visibility})}`);
  assert(result.movingCover.hidden === "0" && result.movingCover.bodyVisibility === "visible", "Moving a covering window must immediately expose the real app body");
  await wait(900);
  result.movedCover = await sample();
  assert(result.movedCover.calls > 0, "An app exposed by moving another window must resume without a focus change");
  await js(`{const wm=window.__checkDesk.wm;wm.animateFrame(wm.wins.get('notes'),window.__coverFrame,.1);void 0}`);
  await wait(250);
  result.recoveredCover = await sample();
  assert(result.recoveredCover.calls === 0, "A settled opaque covering window must pause the app again");
  await js("window.__checkDesk.wm.speed=20");
  await js("window.__checkDesk.wm.focus('game')");
  result.uncovered = await sample();
  assert(result.uncovered.calls > 0, "Uncovered game must resume");
  fs.writeFileSync(path.join(out, "game-resumed.png"), (await wc.capturePage()).toPNG());
  await js("window.__checkDesk.director.idleLife.token++;window.__checkDesk.wm.reset()");
  await wait(500);

  const message = { id: "cache-check", role: "assistant", at: "2026-10-31T12:00:00Z", streaming: false, text: "**first**", attachments: [] };
  setMessages(Array.from({length:100},(_,i)=>({...message,id:`cache-${i}`,role:i%2?'assistant':'user',text:`${message.text} ${i} ${'A long paragraph. '.repeat(15)}`})));
  await js("window.__chat.open(window.__checkDesk)"); await wait(700);
  await js(`{const c=window.__chat,render=c.render.bind(c);window.__markdownRenders=0;c.render=m=>{window.__markdownRenders++;return render(m)};const list=c.el.querySelector('.cp-list');list.scrollTop=150;window.__chatScroll=list.scrollTop}`);
  await js("window.__chat.refresh()");
  result.unchangedChat = await js("({renders:window.__markdownRenders,scroll:window.__chat.el.querySelector('.cp-list').scrollTop,previous:window.__chatScroll})");
  assert(result.unchangedChat.renders === 0, "Unchanged chat reparsed Markdown");
  assert(result.unchangedChat.scroll === result.unchangedChat.previous, "Polling changed chat scroll position");
  setMessages([{...message, text:"**other**"}]); await js("window.__chat.refresh()");
  setMessages([{...message, text:"**third**"}]); await js("window.__chat.refresh()");
  result.sameLengthEdit = await js("window.__chat.el.querySelector('.cp-msg .cp-text').textContent");
  assert(result.sameLengthEdit.trim() === "third", "Same-length chat edit did not render");
  setMessages([{...message,text:"**third**",attachments:[{type:"file",name:"new.txt",size:12,mime:"text/plain",path:null}]}]);
  await js("window.__chat.refresh()");
  result.attachment = await js("window.__chat.el.querySelector('.cp-file')?.textContent.includes('new.txt')");
  assert(result.attachment, "Attachment metadata change did not render");
  await js(`(async()=>{window.__chat.close();window.__centerCheckDesk();const d=window.__checkDesk;window.__helperCheck=await d.director.harness.start({id:'render-helper',kind:'codex',title:'Rendering check',prompt:'Check the render budget'});window.__helperCheck.stream('Actual fixture streaming text. '.repeat(20))})()`);
  result.harnessVisible = await sample();
  assert(result.harnessVisible.calls > 0, "Visible harness must render");
  await js("{const w=window.__world;w.cam.x=w.scene.clientWidth/2-4200*2;w.apply();window.__helperCheck.stream('Updated while hidden. '.repeat(20))}");
  await wait(250);
  result.harnessHidden = await sample();
  assert(result.harnessHidden.calls === 0, "Hidden harness still renders");
  await js("window.__centerCheckDesk()"); await wait(250);
  result.harnessResumed = await sample();
  assert(result.harnessResumed.calls > 0, "Harness must resume with real buffered text");
  await js("window.__centerCheckDesk(.23);window.__helperCheck.stream('Far zoom live update. ')");
  await until("window.__checkDesk.screen.dataset.renderFps !== '0' && window.__helperCheck.app.root.closest('.win')?.dataset.detailReady === '1'", "Far harness did not enter a visible reduced detail state");
  await js("window.__lucidPerf.reset()");
  await wait(700);
  result.farHarnessProgress = await js("{const d=window.__checkDesk,win=window.__helperCheck.app.root.closest('.win'),detail=win.querySelector('.screen-detail');({fps:Number(d.screen.dataset.renderFps),streamText:window.__helperCheck.streamLine?.inner.textContent,streamTarget:window.__helperCheck.streamLine?.target,calls:window.__lucidPerf.snapshot().systems.apps.calls,paused:d.screen.classList.contains('render-paused'),visible:getComputedStyle(d.wm.root).visibility,tier:d.screen.dataset.screenDetail,detailReady:win.dataset.detailReady,detailContent:!!detail?.children.length,detailVisible:!!detail&&getComputedStyle(detail).display!=='none'&&getComputedStyle(detail).visibility==='visible'})}");
  result.farHarnessGeometry = await js("{const d=window.__checkDesk,w=window.__world;({cam:w.cam,scene:w.scene.getBoundingClientRect().toJSON(),desk:d.el.getBoundingClientRect().toJSON(),screen:d.screen.getBoundingClientRect().toJSON(),classes:d.el.className,connected:d.el.isConnected,stillCurrent:w.desks.get('perf-t0')===d,threadId:d.threadId})}");
  const progress = result.farHarnessProgress;
  assert(progress.fps >= 20 && progress.calls === 0 && !progress.paused && progress.visible === 'visible' && progress.tier && progress.detailReady === '1' && progress.detailContent && progress.detailVisible && progress.streamTarget === 'Far zoom live update. ', "Reduced harness lost its visible snapshot or incoming buffered progress");
  fs.writeFileSync(path.join(out,"harness-far-snapshot.png"),(await wc.capturePage()).toPNG());
  // Reduced tiers hide the text layer and pause its cosmetic reveal ticker.
  // Incoming data must survive, then reveal completely when readable again.
  await js("window.__centerCheckDesk()");
  await until("window.__helperCheck.streamLine?.inner.textContent === 'Far zoom live update. '", "Returning from reduced detail did not reveal the buffered streaming content");
  result.farHarness = await sample();
  assert(result.farHarness.calls > 0, "Returning from reduced detail did not resume the harness");
  await js("window.__helperCheck.finish('Render check complete')");
  // Check the renderer's diagnostic shortcut in its own event layer. Native F8
  // is owned by the Electron capture profiler, which cannot record while this
  // verification harness already owns the DevTools debugger connection.
  await js("window.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',key:'F8',ctrlKey:true,shiftKey:true,bubbles:true}));void 0");
  await wait(600);
  result.hud = await js("document.getElementById('lucid-perf')?.textContent.includes('ms/frame')");
  assert(result.hud, "Frame diagnostics did not render");
  fs.writeFileSync(path.join(out, "perf-hud.png"), (await wc.capturePage()).toPNG());
  await js("window.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',key:'F8',ctrlKey:true,shiftKey:true,bubbles:true}));void 0");
  result.disabled = await js("!document.getElementById('lucid-perf')&&!window.__lucidPerf.snapshot().enabled");
  await js(`{
    const w=window.__world;w.setLayoutHeld(false);w.cam={s:.23,x:w.scene.clientWidth/2-2100*.23,y:w.scene.clientHeight/2-850*.23};w.apply();
    const box=w.scene.getBoundingClientRect();window.__robotChecks=[];
    window.__robotEligibility=el=>{
      if(!el.isConnected)return 'disconnected';
      if(el.closest('.desk-unit.arriving'))return 'arriving';
      if(el.closest('.desk-unit.empty'))return 'empty';
      if(el.closest('.culled,[inert]'))return 'covered';
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height||r.right<box.left||r.left>box.right||r.bottom<box.top||r.top>box.bottom)return 'offscreen';
      return null;
    };
    for(const el of w.root.querySelectorAll('.world-seated,.world-walker-svg')) {
      const r=el.getBoundingClientRect();if(r.right<box.left||r.left>box.right||r.bottom<box.top||r.top>box.bottom)continue;
      const item={el,count:0,excluded:window.__robotEligibility(el),observer:null};item.observer=new MutationObserver(records=>item.count+=records.length);item.observer.observe(el,{subtree:true,attributes:true});window.__robotChecks.push(item);
    }
    // Record an ownership transition even if it reverses before the sample ends.
    window.__robotEligibilityObserver=new MutationObserver(()=>{for(const item of window.__robotChecks)item.excluded??=window.__robotEligibility(item.el)});
    window.__robotEligibilityObserver.observe(w.root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }`);
  await wait(1500);
  result.robotEligibility = await js("{window.__robotEligibilityObserver.disconnect();window.__robotChecks.map(item=>{item.observer.disconnect();return{count:item.count,excluded:item.excluded??window.__robotEligibility(item.el),classes:item.el.getAttribute('class'),desk:item.el.closest('.desk-unit')?.className}})}");
  result.robotFairness = result.robotEligibility.filter(item=>!item.excluded).map(item=>item.count);
  assert(result.robotFairness.length >= 8 && result.robotFairness.every(n=>n>0), "Visible robot starvation in shared budget");
  // Use a fresh real walker so a question-room controller cannot dismiss its
  // battery halfway through the overlay geometry assertion.
  await js("{const w=window.__world,source=w.ext.queue.line.find(q=>q.alive).w,actor=new source.constructor(w.root,{id:'overlay-fixture',scale:.42});actor.setPos((w.scene.clientWidth/2-w.cam.x)/w.cam.s,(w.scene.clientHeight/2-w.cam.y)/w.cam.s);window.__overlayActor=actor;actor.do('hold-card');actor.battery.classList.add('on')}");
  await wait(700);
  result.overlays = await js(`{const w=window.__overlayActor,c=getComputedStyle(w.card),b=getComputedStyle(w.battery);const x=w.facing==='left'?1120-w.handR.x:w.handR.x;({cardError:Math.abs(parseFloat(c.left)-(x-560)*w.s),batteryError:Math.abs(parseFloat(b.bottom)-((935-560)*w.s+14-w.headPx)),rootBob:w.el.style.getPropertyValue('--bob'),scale:w.s,head:w.headPx,cssHead:b.getPropertyValue('--head-top'),cssBob:b.getPropertyValue('--bob'),bottom:b.bottom,connected:w.el.isConnected})}`);
  assert(result.overlays.cardError < .2 && result.overlays.batteryError < .2 && !result.overlays.rootBob, "Localized overlay geometry regression");
  await js("window.__overlayActor.destroy();delete window.__overlayActor");
  result.errors = await js("window.__errs");
  assert(result.disabled && !result.errors.length, "Diagnostics cleanup or renderer error regression");
  fs.writeFileSync(path.join(out, "system-checks.json"), JSON.stringify(result,null,2));
  console.log("systemChecks",JSON.stringify(result));
  } finally {
    await js(`window.__robotEligibilityObserver?.disconnect();for(const item of window.__robotChecks??[])item.observer.disconnect();delete window.__robotEligibilityObserver;delete window.__robotEligibility;delete window.__robotChecks;window.__world.setLayoutHeld(${!!layoutHeld});delete window.__fullGameCanvas;delete window.__coverFrame;void 0`).catch(() => {});
  }
};
