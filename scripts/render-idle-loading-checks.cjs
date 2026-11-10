const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const result = { apps: [], errors: [] };
  try {
    await js(`{
      const w=window.__world;for(const d of w.desks.values())d.director.reset();
      const d=w.desks.get('perf-t6');if(!d)throw Error('No fixture workstation');
      w.stopCameraMotion();w.frame=null;w.cam={s:2,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*2,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+100)*2};w.apply();
      const idle=d.director.idleLife;d.wm.speed=25;
      const state=window.__loadingCheck={d,idle,run:null,errors:[]};
      try{d.wm.check(d.wm.epoch-1)}catch(e){state.Cancelled=e.constructor}
      state.start=act=>{idle.active=true;state.run=idle.doActivity(act,++idle.token,true).catch(e=>{if(!(e instanceof state.Cancelled))state.errors.push(String(e.stack||e))})};
      state.stop=async()=>{idle.stop();await state.run;d.wm.reset()};
      void 0;
    }`);
    const apps = ['snake','flappy','dash','blockcraft','nightshift','tictactoe','connect4','bitmerge','island','botcom','bugger','boot',
      'botflix','tube','benchtop','beats','social','phone','botsapp','telegrid','chirp','doodle','crossword','solitaire','stocks','mail','lingo','instaweb','spoolweb','sparkplug','steam','trading'];
    for (const name of apps) {
      await js(`window.__loadingCheck.start(${JSON.stringify(name)})`);
      let sample;
      for (let i=0;i<60;i++) {
        await wait(50);
        sample = await js(`{const s=window.__loadingCheck,d=s.d,body=${name === 'phone' ? 'd.phoneScreen' : '[...d.wm.wins.values()].at(-1)?.body'},root=body?.firstElementChild,r=root?.getBoundingClientRect();({app:${JSON.stringify(name)},root:root?.className,width:r?.width,height:r?.height,stylesReady:[...document.querySelectorAll('link[rel=stylesheet]')].every(l=>!!l.sheet),errors:s.errors.slice()})}`);
        if (sample.errors.length || sample.root && sample.width > 0 && sample.height > 0 && sample.stylesReady) break;
      }
      result.apps.push(sample);
      if (sample.errors.length || !sample.root || !sample.width || !sample.height || !sample.stylesReady) throw Error(`Cold ${name} did not mount with its styles: ${JSON.stringify(sample)}`);
      if (['botflix','phone','solitaire'].includes(name)) fs.writeFileSync(path.join(out, `cold-${name}.png`), (await wc.capturePage()).toPNG());
      await js('window.__loadingCheck.stop()');
      const remaining = await js(`({windows:window.__loadingCheck.d.wm.wins.size,errors:window.__loadingCheck.errors})`);
      if (remaining.windows || remaining.errors.length) throw Error(`Cancelled ${name} did not dispose: ${JSON.stringify(remaining)}`);
    }
    result.errors = await js('window.__errs||[]');
    if (result.errors.length) throw Error('Renderer errors during cold optional-app checks');
    result.passed = true;
  } catch (error) { result.error = String(error); throw error; }
  finally {
    await js('window.__loadingCheck?.stop()').catch(()=>{});
    fs.writeFileSync(path.join(out, 'idle-loading-checks.json'), JSON.stringify(result,null,2));
  }
  console.log('idleLoadingChecks', JSON.stringify(result));
};
