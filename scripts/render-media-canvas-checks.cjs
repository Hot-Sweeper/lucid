// Production Botflix/Botcord on an isolated fixture desk, with rendering clocks left real.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const result = { surfaces: [], checks: [], errors: [] };
  const save = () => fs.writeFileSync(path.join(out, 'media-canvas-checks.json'), JSON.stringify(result, null, 2));
  const check = (ok, message) => { result.checks.push({ message, passed: !!ok }); save(); if (!ok) throw Error(message); };
  const until = async (code, message, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await js(code)) return; await wait(70); }
    throw Error(message);
  };
  const shot = async name => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  try {
    await js(`{
      const w=window.__world,d=w.desks.get('perf-t0');if(!d)throw Error('Media checks require isolated perf-t0');
      for(const desk of w.desks.values())desk.director.reset();
      const idle=d.director.idleLife;
      const f=window.__mediaCanvasCheck={d,cam:{...w.cam},prefs:d.wm.prefs,speed:d.wm.speed,host:idle.host,random:Math.random,errors:[],pause:'hero',run:null,selector:''};
      try{d.wm.check(d.wm.epoch-1)}catch(e){f.Cancelled=e.constructor}
      f.error=e=>f.errors.push(e.message||String(e.reason));window.addEventListener('error',f.error);window.addEventListener('unhandledrejection',f.error);
      d.wm.speed=25;d.wm.prefs={...d.wm.prefs,windows:'fullscreen'};w.stopFollow();w.frame=null;
      f.center=s=>{w.stopFollow();w.cam={s,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*s,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+90)*s};w.apply()};
      f.stage=()=>d.wm.root.querySelector('.fun-bf-video canvas')?'player':d.wm.root.querySelector('.fun-bf-m-art canvas')?'modal':d.wm.root.querySelector('.fun-bf-hero-art canvas')?'hero':d.wm.root.querySelector('.life-ch-gif canvas')?'gif':'';
      idle.host=function(token){const h=f.host.call(this,token);return Object.assign(Object.create(h),{
        pointAt:async()=>{},click:async()=>{},tap:()=>{},react:()=>{},scroll:()=>{},
        sleep:async ms=>{while(!h.stopped&&f.pause&&f.stage()===f.pause)await new Promise(r=>setTimeout(r,20));if(h.stopped)throw new f.Cancelled();await h.sleep(Math.min(12,ms))}
      })};
      f.start=key=>{idle.active=true;const token=++idle.token;f.run=idle.doActivity(key,token,true).catch(e=>{if(!(e instanceof f.Cancelled))f.errors.push(String(e))})};
      f.stop=async()=>{f.pause='';idle.stop();if(f.run)await f.run;d.wm.reset();f.run=null};
      f.sample=()=>{
        const list=[...d.wm.root.querySelectorAll(f.selector)];
        const c=list.find(c=>{const r=c.getBoundingClientRect(),p=c.closest('.life-ch-scroll')?.getBoundingClientRect();return r.width>0&&r.height>0&&(!p||(r.bottom>p.top&&r.top<p.bottom))})||list[0];
        if(!c)return null;const r=c.getBoundingClientRect();if(!r.width||!r.height)return null;
        const probe=document.createElement('canvas');probe.width=32;probe.height=24;const g=probe.getContext('2d',{willReadFrequently:true});g.drawImage(c,0,0,32,24);
        const pixels=g.getImageData(0,0,32,24).data;let opaque=0,signature=2166136261;
        for(let i=0;i<pixels.length;i++){signature=Math.imul(signature^pixels[i],16777619);if(i%4===3&&pixels[i])opaque++}
        return {stage:f.stage(),scale:w.cam.s,width:c.width,height:c.height,displayWidth:r.width,displayHeight:r.height,densityX:c.width/r.width,densityY:c.height/r.height,dpr:devicePixelRatio,opaque,signature:signature>>>0,rendering:!d.screen.classList.contains('render-paused'),text:d.wm.root.querySelector('.life-ch-head b')?.textContent,canvases:list.length};
      };
      Math.random=()=>.5;f.center(2);f.start('botflix');
    }`);
    for (const [name, stage, selector] of [
      ['botflix-hero', 'hero', '.fun-bf-hero-art canvas'],
      ['botflix-modal', 'modal', '.fun-bf-m-art canvas'],
      ['botflix-video', 'player', '.fun-bf-video canvas'],
      ['botcord-gif', 'gif', '.life-ch-gif canvas'],
    ]) {
      const surface = { name, scales: [], rapid: [] }; result.surfaces.push(surface);
      if (stage === 'gif') {
        await js(`(async()=>{const f=window.__mediaCanvasCheck;await f.stop();Math.random=()=>.99;f.pause='gif';f.selector=${JSON.stringify(selector)};f.center(2);f.start('social')})()`);
      } else await js(`{const f=window.__mediaCanvasCheck;f.pause=${JSON.stringify(stage)};f.selector=${JSON.stringify(selector)}}`);
      await until(`{const f=window.__mediaCanvasCheck,s=f.sample();!!s&&f.stage()===${JSON.stringify(stage)}&&s.opaque>100}`, `${name} did not reach its actual drawn production surface`);
      // Entry transitions can briefly scale a hero or modal; sample after those end.
      await wait(1700);
      for (const scale of [.23, .65, 2, 5]) {
        await js(`window.__mediaCanvasCheck.center(${scale})`);
        await until(`{const s=window.__mediaCanvasCheck.sample();!!s&&s.rendering&&s.opaque>100&&s.densityX>=s.dpr-.015&&s.densityY>=s.dpr-.015}`, `${name} is blank or undersampled at ${scale}x`, 6000);
        surface.scales.push(await js(`window.__mediaCanvasCheck.sample()`));
      }
      check(surface.scales.length === 4 && surface.scales.every(s => s.densityX >= s.dpr - .015 && s.densityY >= s.dpr - .015), `${name} remains drawn at display density at .23, .65, 2 and 5x`);
      const before = await js(`window.__mediaCanvasCheck.sample().signature`);
      await until(`window.__mediaCanvasCheck.sample()?.signature!==${before}`, `${name} stopped updating its visible media pixels`, 5000);
      surface.fresh = await js(`window.__mediaCanvasCheck.sample()`);
      check(surface.fresh.signature !== before, `${name} continues presenting new animation frames`);
      surface.rapid = await js(`(async()=>{const f=window.__mediaCanvasCheck,samples=[];for(const scale of [.23,5,.65,5]){f.center(scale);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(f.sample())}return samples})()`);
      check(surface.rapid.every(s => s && s.opaque > 100 && s.densityX >= s.dpr - .015 && s.densityY >= s.dpr - .015), `${name} keeps complete sharp content through rapid reversals`);
      await shot(`media-${name}-5x`);
      if (stage === 'gif') {
        check(surface.scales.every(s => s.text), 'Botcord retains actual channel text alongside adaptive GIFs');
        await js(`window.__mediaCanvasCheck.stop()`);
        check(await js(`!window.__mediaCanvasCheck.d.wm.root.querySelector('.life-ch')`), 'Botcord window and GIF canvases dispose');
      }
      save();
    }
    result.errors = await js(`window.__mediaCanvasCheck.errors`);
    check(result.errors.length === 0, 'Botflix/Botcord acceptance has no renderer errors');
    result.passed = true;
  } catch (error) {
    result.error = String(error); result.state = await js(`window.__mediaCanvasCheck?.sample()`).catch(() => null);
    await shot('media-canvas-failure').catch(() => {}); throw error;
  } finally {
    await js(`(async()=>{const f=window.__mediaCanvasCheck;if(!f)return;await f.stop();f.d.director.idleLife.host=f.host;f.d.wm.prefs=f.prefs;f.d.wm.speed=f.speed;Math.random=f.random;window.removeEventListener('error',f.error);window.removeEventListener('unhandledrejection',f.error);window.__world.cam=f.cam;window.__world.apply();delete window.__mediaCanvasCheck})()`).catch(() => {});
    save();
  }
  console.log('mediaCanvasChecks', JSON.stringify(result));
};
