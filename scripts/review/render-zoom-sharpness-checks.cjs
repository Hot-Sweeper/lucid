const fs=require('node:fs'),path=require('node:path');
module.exports=async({js,wc,wait,out})=>{
  const rows=[];
  await js(`{const w=window.__world;window.__sharpBefore={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},frame:w.frame};w.stopCameraMotion();void 0}`);
  await js(`(async()=>{const w=window.__world,d=[...w.desks.values()].find(d=>!d.el.classList.contains('arriving'))||w.desks.values().next().value;window.__sharpDesk=d;d.director.reset();d.wm.speed=40;d.wm.prefs={...d.wm.prefs,windows:'fullscreen'};const win=await d.wm.open('files','Sharpness test');win.body.innerHTML='<div style="height:100%;padding:24px;background:#f5f5f5;color:#222;font:18px monospace"><h2>Sharp screen geometry</h2><p>Files, messages and app controls</p><div style="height:4px;background:#2a7fcd;margin:14px 0"></div><div style="width:160px;height:80px;background:#df7456;border-radius:12px"></div></div>';return true})()`);
  try{
    for(const scale of [.65,.85,1,1.2,1.4,2,3,5]){
      await js(`{const w=window.__world,d=window.__sharpDesk;w.cam={s:${scale},x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*${scale},y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+80)*${scale}};w.apply();void 0}`);
      await wait(30);
      const row=await js(`(()=>{const w=window.__world;const canvases=[...document.querySelectorAll('.desk-unit canvas')].map(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return{cls:c.className,ancestor:c.closest('.screen-detail')?'detail':c.closest('.win')?'app':'shell',tier:c.closest('.screen')?.dataset.screenDetail||'full',w:c.width,h:c.height,displayW:r.width,displayH:r.height,density:r.width?c.width/r.width/devicePixelRatio:0,visible:r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight}}).filter(c=>c.visible);return{scale:w.cam.s,dpr:devicePixelRatio,canvases}})()`);
      rows.push(row);fs.writeFileSync(path.join(out,'zoom-sharpness.json'),JSON.stringify(rows,null,2));
      await wait(270);
      if([.85,1.2,2,5].includes(scale))fs.writeFileSync(path.join(out,`sharp-${scale}.png`),(await wc.capturePage()).toPNG());
    }
    const display=await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    const attached=!wc.debugger.isAttached();
    if(attached)wc.debugger.attach('1.3');
    try{
      for(const dpr of [2,1.25,2]){
        await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:display.width,height:display.height,deviceScaleFactor:dpr,mobile:false});
        await js(`{const w=window.__world,d=window.__sharpDesk;w.cam={s:.85,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*.85,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+80)*.85};w.apply();void 0}`);
        await wait(250);
        const row=await js(`(()=>{const w=window.__world,scene=w.scene.getBoundingClientRect(),layer=w.root.querySelector('.outside-layer'),el=layer.querySelector('div.outside-vector-canvas'),r=el.getBoundingClientRect(),x=Number(el.dataset.sourceX),y=Number(el.dataset.sourceY),tiles=[...el.querySelectorAll('canvas')];return{dpr:devicePixelRatio,scale:w.cam.s,mappingError:Math.hypot(r.left-(scene.left+w.cam.x+(parseFloat(layer.style.left)+x)*w.cam.s),r.top-(scene.top+w.cam.y+(parseFloat(layer.style.top)+y)*w.cam.s)),outdoorDensity:Math.min(...tiles.map(c=>c.width/c.getBoundingClientRect().width/devicePixelRatio)),detailDensity:[...window.__sharpDesk.el.querySelectorAll('.screen-detail canvas')].map(c=>c.width/c.getBoundingClientRect().width/devicePixelRatio)}})()`);
        rows.push({...row,canvases:[]});
        if(row.mappingError>.1||row.outdoorDensity<.99||!row.detailDensity.length||row.detailDensity.some(n=>n<.99))throw Error('Display density change left stale geometry or undersampled pixels: '+JSON.stringify(row));
      }
    }finally{
      await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
      if(attached)wc.debugger.detach();
    }
    fs.writeFileSync(path.join(out,'zoom-sharpness.json'),JSON.stringify(rows,null,2));
    await js(`{const w=window.__world,d=window.__sharpDesk;w.cam={s:5,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*5,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+80)*5};w.apply();void 0}`);
    await wait(250);
    const cache=await js(`(()=>{const rows=[...document.querySelectorAll('[data-static-art][data-cached="1"]')].map(h=>{const image=h.querySelector('image'),m=image?.getScreenCTM(),pixels=h.dataset.pixels?.split('x').map(Number);if(!image||!m||!pixels)return null;const r=image.getBoundingClientRect();if(!r.width||!r.height||r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight)return null;return{densityX:pixels[0]/(image.width.baseVal.value*Math.hypot(m.a,m.b)*devicePixelRatio),densityY:pixels[1]/(image.height.baseVal.value*Math.hypot(m.c,m.d)*devicePixelRatio)}}).filter(Boolean);return rows})()`);
    fs.writeFileSync(path.join(out,'static-composed-density.json'),JSON.stringify(cache,null,2));
    if(process.env.LUCID_SHARP_ASSERT==='1'&&cache.some(c=>c.densityX<.99||c.densityY<.99))throw Error('Composed static cache is undersampled');
    await js(`{const s=document.createElement('style');s.id='sharp-promotion-experiment';s.textContent='.room,.world-seated,.world-walker-svg,.desk-unit>svg{will-change:auto!important}';document.head.append(s);void 0}`);
    await wait(250);
    fs.writeFileSync(path.join(out,'sharp-5-unpromoted.png'),(await wc.capturePage()).toPNG());
    await js(`window.__staticArt.enable(false)`);await wait(150);
    fs.writeFileSync(path.join(out,'sharp-5-original-vectors.png'),(await wc.capturePage()).toPNG());
    await js(`window.__staticArt.enable(true)`);
    console.log('zoomSharpness',JSON.stringify(rows.map(r=>({scale:r.scale,canvases:r.canvases.length,undersampled:r.canvases.filter(c=>c.density<.99).map(c=>({ancestor:c.ancestor,tier:c.tier,density:c.density,w:c.w,displayW:c.displayW}))}))));
  }finally{
    await js(`{document.getElementById('sharp-promotion-experiment')?.remove();const w=window.__world,o=window.__sharpBefore;if(o){w.cam=o.cam;w.frame=o.frame;w.apply()}delete window.__sharpBefore;void 0}`).catch(()=>{});
  }
  if(process.env.LUCID_SHARP_ASSERT==='1'&&rows.some(r=>r.canvases.some(c=>c.ancestor==='detail'&&c.density<.99)))throw Error('Visible detail snapshots are magnifying undersized pixels');
};
