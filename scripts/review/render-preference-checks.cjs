// Production preference and awareness paths in the isolated Electron fixture.
const fs = require("node:fs"), path = require("node:path");
module.exports = async ({ js, wc, wait, out }) => {
  const result = {}, save = () => fs.writeFileSync(path.join(out, "preference-checks.json"), JSON.stringify(result, null, 2));
  const check = (ok, message) => { if (!ok) { save(); throw Error(message); } };
  try {
    await js(`{
      const desk=window.__world.desks.get('perf-t0')||window.__world.desks.values().next().value,d=desk.director,wm=desk.wm;
      d.reset();d.pumpEpoch=wm.epoch;wm.speed=60;
      const f=window.__preferenceCheck={desk,d,wm,idle:d.idleLife,music:d.music,saved:{prefs:wm.prefs,present:d.present,random:Math.random}};
      const world=window.__world;world.stopFollow();world.cam={s:2,x:world.scene.clientWidth/2-(parseFloat(desk.el.style.left)+200)*2,y:world.scene.clientHeight/2-(parseFloat(desk.el.style.top)+160)*2};world.apply();
      wm.prefs={...wm.prefs,apps:['doodle'],socials:['botsapp'],phone:'tube'};
      f.weights=f.idle.constructor.interestWeights(wm.prefs,()=>1);
    }`);
    result.interests = await js(`{const f=window.__preferenceCheck;({weights:f.weights,phone:f.idle.phoneApps()})}`);
    check(result.interests.weights.mail === 0 && result.interests.weights.steam === 0 && result.interests.weights.trading === 0 && result.interests.weights.botsapp > 0 && result.interests.weights.sparkplug === 0 && result.interests.phone.join() === "botsapp", "Saved app interests leaked into unrelated desktop or phone choices");
    result.awareness = await js(`(async()=>{
      const f=window.__preferenceCheck,{d,wm,idle}=f;
      idle.lockEl=document.createElement('div');d.userTyping(true);await Promise.resolve();
      const asleepIgnored=!wm.isOpen('t3code')&&!d.chat.comp.classList.contains('you-typing');idle.lockEl=null;
      await wm.open('notes','Another app',true);d.userTyping(true);await Promise.resolve();
      const otherAppIgnored=wm.isFront('notes')&&!wm.isOpen('t3code');
      await d.chat.ensure(true);d.present=()=>false;d.userTyping(true);await Promise.resolve();
      const awayIgnored=!d.chat.comp.classList.contains('you-typing');
      d.present=()=>true;d.userTyping(true);await Promise.resolve();
      const visibleChatNotices=d.chat.comp.classList.contains('you-typing')&&wm.isFront('t3code');
      d.userTyping(false);await Promise.resolve();
      return {asleepIgnored,otherAppIgnored,awayIgnored,visibleChatNotices,clears:!d.chat.comp.classList.contains('you-typing')};
    })()`);
    check(Object.values(result.awareness).every(Boolean), "Typing awareness opened an unseen app or missed the visible chat");
    result.music = await js(`(async()=>{
      const f=window.__preferenceCheck,{music,wm}=f;Math.random=()=>.4;
      await music.start(0);const before=music.trackIx,body=music.body,beforeTitle=body.querySelector('.bf-now b').textContent;
      const art=body.querySelector('.bf-now > svg.bf-art'),added=body.querySelector('.bf-added'),elapsed=music.elapsed;
      const skipped=await music.skip(),after=music.trackIx,afterTitle=body.querySelector('.bf-now b').textContent;
      return {skipped,before,after,beforeTitle,afterTitle,ownAlbumArt:!!art,addedState:!!added,elapsedBefore:elapsed,elapsedAfter:music.elapsed};
    })()`);
    check(result.music.skipped && result.music.after === result.music.before + 1 && result.music.beforeTitle !== result.music.afterTitle && result.music.ownAlbumArt && result.music.addedState && result.music.elapsedBefore <= 1 && result.music.elapsedAfter <= 1, "Botify did not skip the actual track or its artwork/state was missing");
    await wait(150);
    fs.writeFileSync(path.join(out, "preference-botify.png"), (await wc.capturePage()).toPNG());
    result.passed = true;save();console.log("preferenceChecks", JSON.stringify(result));
  } catch (error) { result.error = String(error); throw error; }
  finally {
    await js(`{const f=window.__preferenceCheck;if(f){f.music.stop();f.idle.lockEl=null;f.d.present=f.saved.present;f.wm.prefs=f.saved.prefs;Math.random=f.saved.random;f.d.reset();delete window.__preferenceCheck}}`).catch(() => {});
    save();
  }
};
