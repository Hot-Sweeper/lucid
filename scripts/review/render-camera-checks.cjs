// Root-owned isolated Electron run. Uses real middle input without app/message writes.
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const result = {}, save = () => fs.writeFileSync(path.join(out, 'camera-checks.json'), JSON.stringify(result, null, 2));
  let position;
  const check = (ok, message) => { if (!ok) { save(); throw Error(message); } };
  try {
    await js(`{const w=window.__world;window.__cameraQA={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},frame:w.frame,events:[],id:0};const q=window.__cameraQA;q.trace=e=>{if(e.type==='pointerdown')q.id=e.pointerId;q.events.push({type:e.type,button:e.button,buttons:e.buttons,target:e.target.nodeName})};for(const t of ['pointerdown','pointerup','pointercancel','lostpointercapture'])window.addEventListener(t,q.trace,true);w.unfocus(false);w.stopCameraMotion();const p=w.outdoor.park;Object.assign(w.cam,{s:2,x:w.scene.clientWidth/2-(p.x+p.w/2)*2,y:w.scene.clientHeight/2-(p.y+p.h/2)*2});w.apply()}`);
    await wait(1000);
    position = await js(`{const w=window.__world,q=window.__cameraQA,r=w.scene.getBoundingClientRect(),plane=w.root.querySelector('.outside-viewport');q.detail=plane.querySelector(plane.dataset.presentation==='vector-canvas'?'.outside-vector-canvas':'.outside-detail');q.before={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},paints:Number((plane.dataset.presentation==='vector-canvas'?q.detail:plane).dataset.paints||0),liveViews:Number(plane.dataset.liveViews),sourceDensity:Number(q.detail.dataset.sourceDensity),sharp:q.detail.dataset.sharp};({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
    result.weatherReuse = await js(`{const w=window.__world,q=window.__cameraQA,weather=w.root.querySelector('.weather-layer'),sky=weather.querySelector('.weather-sky-view'),before=Number(weather.dataset.skyPresents),x=w.cam.x;for(let i=1;i<=40;i++){w.cam.x=x+i*2;w.apply()}const after=Number(weather.dataset.skyPresents);w.cam.x=x;w.apply();({presentations:after-before,density:Number(sky.dataset.sourceDensity),expectedDensity:Math.min(devicePixelRatio||1,1.5,Math.sqrt(1.6e6/(w.scene.clientWidth*w.scene.clientHeight))),width:sky.width,height:sky.height})}`);
    check(result.weatherReuse.presentations === 0 && Math.abs(result.weatherReuse.density - result.weatherReuse.expectedDensity) < .001, 'Covered weather pan reblitted sky pixels or reduced their existing density');
    wc.sendInputEvent({ type: 'mouseDown', button: 'middle', clickCount: 1, ...position });
    for (let i = 1; i <= 8; i++) {
      wc.sendInputEvent({ type: 'mouseMove', button: 'middle', modifiers: ['middlebuttondown'], x: position.x + i * 10, y: position.y + i * 3 });
      await wait(18);
    }
    await wait(40);
    result.held = await js(`{const w=window.__world,q=window.__cameraQA,plane=w.root.querySelector('.outside-viewport');({panning:w.scene.classList.contains('panning'),capture:w.scene.hasPointerCapture(q.id),sameDetail:q.detail===plane.querySelector(plane.dataset.presentation==='vector-canvas'?'.outside-vector-canvas':'.outside-detail'),paintDelta:Number((plane.dataset.presentation==='vector-canvas'?q.detail:plane).dataset.paints||0)-q.before.paints,liveViewDelta:Number(plane.dataset.liveViews)-q.before.liveViews,dx:w.cam.x-q.before.cam.x,dy:w.cam.y-q.before.cam.y,sourceDensity:Number(q.detail.dataset.sourceDensity),scale:w.cam.s,dpr:devicePixelRatio,sharp:q.detail.dataset.sharp})}`);
    check(result.held.panning && result.held.capture && result.held.sameDetail && result.held.paintDelta === 0 && result.held.liveViewDelta === 0, 'Held middle pan did not capture input or reused scenery was repainted');
    check(Math.abs(result.held.dx - 80) < 1 && Math.abs(result.held.dy - 24) < 1 && result.held.sharp === '1' && result.held.sourceDensity >= result.held.scale * result.held.dpr * .99, 'Middle pan displacement or real-DPR sharpness changed');
    await js(`{const w=window.__world,q=window.__cameraQA;w.scene.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:q.id,pointerType:'mouse',button:1,buttons:0}))}`);
    result.cancel = await js(`{const w=window.__world,q=window.__cameraQA;({clean:!w.scene.classList.contains('panning'),capture:w.scene.hasPointerCapture(q.id)})}`);
    check(result.cancel.clean && !result.cancel.capture, 'Pointer cancellation left a captured or stuck camera pan');
    wc.sendInputEvent({ type: 'mouseUp', button: 'middle', clickCount: 1, x: position.x + 80, y: position.y + 24 });
    await wait(50);

    // A middle-down on a real workstation must be claimed before descendant controls.
    position = await js(`{const w=window.__world,q=window.__cameraQA,d=[...w.allDesks].find(d=>d.threadId);if(!d)throw Error('Camera fixture needs a real occupied desk');q.desk=d;q.downs=0;q.down=()=>q.downs++;d.el.addEventListener('pointerdown',q.down);Object.assign(w.cam,{s:1,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+150),y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+120)});w.apply();const r=w.scene.getBoundingClientRect();({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})}`);
    await wait(400);
    wc.sendInputEvent({ type: 'mouseDown', button: 'middle', clickCount: 1, ...position });
    wc.sendInputEvent({ type: 'mouseMove', button: 'middle', modifiers: ['middlebuttondown'], x: position.x + 35, y: position.y + 15 });
    await wait(50);
    result.workstation = await js(`{const w=window.__world,q=window.__cameraQA;({descendantDowns:q.downs,panning:w.scene.classList.contains('panning'),capture:w.scene.hasPointerCapture(q.id),deskDragging:w.deskDragActive})}`);
    check(result.workstation.descendantDowns === 0 && result.workstation.panning && result.workstation.capture && !result.workstation.deskDragging, 'Middle camera input leaked into workstation drag/focus handlers');
    await js(`window.dispatchEvent(new Event('blur'))`);
    result.blur = await js(`{const w=window.__world,q=window.__cameraQA;({clean:!w.scene.classList.contains('panning'),capture:w.scene.hasPointerCapture(q.id)})}`);
    check(result.blur.clean && !result.blur.capture, 'Window blur left the camera in a stuck drag');
    wc.sendInputEvent({ type: 'mouseUp', button: 'middle', clickCount: 1, x: position.x + 35, y: position.y + 15 });
    result.tweenClock = await js(`new Promise(resolve=>{
      const w=window.__world,d=window.__cameraQA.desk;
      w.stopCameraMotion();let frames=0,commits=0,prior=w.root.style.transform;
      const start=performance.now();
      w.flyTo({x:parseFloat(d.el.style.left)-20,y:parseFloat(d.el.style.top)-40,w:440,h:380},30,1.2);
      const sample=now=>{frames++;const next=w.root.style.transform;if(next!==prior){commits++;prior=next}
        if(now-start<800)requestAnimationFrame(sample);else{w.stopCameraMotion();resolve({frames,commits,duration:now-start,ratio:commits/frames})}};
      requestAnimationFrame(sample);
    })`);
    // Slow machines cannot distinguish a 60 Hz cap from their actual display cadence.
    // On a fast callback clock the tween must use most available display frames.
    check(result.tweenClock.frames < 70 || result.tweenClock.ratio > .8, 'Camera tween still skips high-refresh display frames');
    result.errors = await js(`window.__errs||[]`);
    check(result.errors.length === 0, 'Camera checks logged runtime errors');
    console.log('cameraChecks', JSON.stringify(result));
  } finally {
    if (position) wc.sendInputEvent({ type: 'mouseUp', button: 'middle', clickCount: 1, ...position });
    await js(`{const q=window.__cameraQA,w=window.__world;if(q){w.scene.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:q.id,pointerType:'mouse'}));for(const t of ['pointerdown','pointerup','pointercancel','lostpointercapture'])window.removeEventListener(t,q.trace,true);q.desk?.el.removeEventListener('pointerdown',q.down);Object.assign(w.cam,q.cam);w.frame=q.frame;w.apply();delete window.__cameraQA}}`).catch(() => {});
    save();
  }
};
