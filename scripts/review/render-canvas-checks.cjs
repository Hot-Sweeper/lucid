// Fixture-only native checks. Invoked by render-profile.cjs, never launches Electron.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ js, wc, wait, out }) => {
  const result = { games: [], checks: [], excluded: ['BOOT uses its original 300-pixel software renderer and intentional pixel art.'], errors: [] };
  const save = () => fs.writeFileSync(path.join(out, 'canvas-checks.json'), JSON.stringify(result, null, 2));
  const check = (ok, message) => { result.checks.push({ message, passed: !!ok }); save(); if (!ok) throw Error(message); };
  const shot = async name => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  const until = async (expression, message, timeout = 8000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await js(expression)) return; await wait(60); }
    throw Error(message);
  };
  let emulatedDpr = false;
  try {
    await js(`{
      const w=window.__world,d=w.desks.get('perf-t0');
      if(!d)throw Error('Adaptive canvas checks require isolated perf-t0 fixture');
      window.__canvasCheck={d,cam:{...w.cam},prefs:d.wm.prefs,speed:d.wm.speed,errors:[],run:null};
      const f=window.__canvasCheck;
      try{d.wm.check(d.wm.epoch-1)}catch(error){f.cancelled=error.constructor}
      f.onError=e=>f.errors.push(e.error?.stack||e.reason?.stack||e.message||String(e.reason));
      window.addEventListener('error',f.onError);window.addEventListener('unhandledrejection',f.onError);
      for(const desk of w.desks.values())desk.director.reset();
      d.wm.speed=20;d.wm.prefs={...d.wm.prefs,windows:'fullscreen'};
      w.stopFollow();w.frame=null;
      f.center=scale=>{w.stopFollow();w.cam={s:scale,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*scale,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+90)*scale};w.apply()};
      f.sample=()=>{
        const c=d.wm.root.querySelector(f.selector);if(!c)return null;
        const r=c.getBoundingClientRect(),probe=document.createElement('canvas');probe.width=probe.height=8;
        const g=probe.getContext('2d',{willReadFrequently:true});g.drawImage(c,0,0,8,8);
        const pixels=g.getImageData(0,0,8,8).data;let opaque=0;const colors=new Set();
        for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])opaque++;colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]+','+pixels[i+3])}
        return {scale:w.cam.s,backing:{width:c.width,height:c.height},display:{width:r.width,height:r.height},densityX:c.width/r.width,densityY:c.height/r.height,dpr:devicePixelRatio,opaque,colors:colors.size,visible:!d.screen.classList.contains('render-paused'),fps:Number(d.screen.dataset.renderFps)};
      };
      f.stop=async()=>{d.director.idleLife.stop();if(f.run)await f.run;d.wm.reset();f.run=null};
      f.start=game=>{const idle=d.director.idleLife;idle.active=true;const token=++idle.token;f.run=idle.doActivity(game,token,true).catch(e=>{if(!(e instanceof f.cancelled))f.errors.push(e.stack||String(e))})};
      f.center(2);
    }`);
    for (const [game, selector] of [
      ['voxelvalley', '.gm-bc .gm-stage > canvas'],
      ['uptime', '.gm-ns-office'],
      ['tidewatch', '.gm-bx .gm-stage > canvas'],
    ]) {
      const entry = { game, scales: [], rapid: [] }; result.games.push(entry);
      await js(`{const f=window.__canvasCheck;f.selector=${JSON.stringify(selector)};f.center(2);f.start(${JSON.stringify(game)})}`);
      await until(`{const s=window.__canvasCheck.sample();!!s&&s.opaque>32}`, `${game} did not draw its production canvas`);
      for (const scale of [.23, .65, 2, 5]) {
        await js(`window.__canvasCheck.center(${scale})`);
        await until(`{const s=window.__canvasCheck.sample();!!s&&s.visible&&s.opaque>32&&s.densityX>=s.dpr-.01&&s.densityY>=s.dpr-.01}`, `${game} is blurry or empty at ${scale}x`);
        const sample = await js(`window.__canvasCheck.sample()`); entry.scales.push(sample);
        check(sample.opaque > 32 && sample.colors > 1, `${game} retains actual drawn content at ${scale}x`);
        check(sample.densityX >= sample.dpr - .01 && sample.densityY >= sample.dpr - .01, `${game} meets display density at ${scale}x`);
        if (scale === 5) {
          check(sample.backing.width / await js(`parseFloat(window.__canvasCheck.d.wm.root.querySelector(window.__canvasCheck.selector).style.width)`) > 2,
            `${game} close-up exceeds the former fixed 2x backing density`);
          await shot(`canvas-${game}-5x`);
        }
      }
      // Each reversal gets two real display callbacks, rather than a settle timer.
      entry.rapid = await js(`(async()=>{const f=window.__canvasCheck,samples=[];for(const scale of [.23,5,.65,5,.23,5]){f.center(scale);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(f.sample())}return samples})()`);
      check(entry.rapid.every(s => s && s.opaque > 32 && s.densityX >= s.dpr - .01 && s.densityY >= s.dpr - .01),
        `${game} stays drawn and sharp through repeated rapid zoom reversals`);
      if (game === 'tidewatch') {
        const viewport = await js(`({width:innerWidth,height:innerHeight})`);
        await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: false });
        emulatedDpr = true;
        await js(`window.__canvasCheck.center(5)`);
        await until(`{const s=window.__canvasCheck.sample();!!s&&Math.abs(s.dpr-2)<.001&&s.opaque>32&&s.densityX>=s.dpr-.01&&s.densityY>=s.dpr-.01}`, 'Tidewatch Tactics did not restore full content and sharp density after DPR change');
        entry.dprChange = await js(`window.__canvasCheck.sample()`);
        check(entry.dprChange.opaque > 32, 'Tidewatch Tactics redraw gate does not leave a cleared canvas after DPR change');
        await shot('canvas-tidewatch-dpr2');
        await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride'); emulatedDpr = false;
      }
      await js(`window.__canvasCheck.stop()`);
      await until(`!window.__canvasCheck.d.wm.root.querySelector(${JSON.stringify(selector)})`, `${game} canvas was retained after disposal`);
      check(true, `${game} disposes its window and canvas`);
    }
    result.errors = await js(`window.__canvasCheck.errors`);
    check(result.errors.length === 0, 'Adaptive canvas checks produced no renderer errors');
    result.passed = true;
  } catch (error) {
    result.failureState = await js(`{const f=window.__canvasCheck;({sample:f?.sample(),errors:f?.errors,screen:f?.d.screen.dataset.renderFps,hidden:document.hidden,rootClasses:window.__world.root.className,game:f?.d.wm.wins.get('game')?.title.textContent})}`).catch(String);
    result.error = String(error); await shot('canvas-check-failure').catch(() => {}); throw error;
  } finally {
    if (emulatedDpr) await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {});
    await js(`(async()=>{const f=window.__canvasCheck;if(!f)return;await f.stop();f.d.wm.prefs=f.prefs;f.d.wm.speed=f.speed;window.removeEventListener('error',f.onError);window.removeEventListener('unhandledrejection',f.onError);window.__world.cam=f.cam;window.__world.apply();delete window.__canvasCheck})()`).catch(() => {});
    save();
  }
  console.log('canvasChecks', JSON.stringify(result));
};
