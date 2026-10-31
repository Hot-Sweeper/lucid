const fs=require('node:fs'),path=require('node:path');
module.exports=async({js,wc,wait,out})=>{
  const rows=[];
  await js(`{const w=window.__world;window.__viewportOriginal={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},frame:w.frame,live:w.root.querySelector('.outside-live')};w.stopFollow();w.frame=null}`);
  try{
    for(const scale of [.042,.23,.65,2,3.932]){
      await js(`{const w=window.__world,p=w.outdoor.park;w.cam={s:${scale},x:w.scene.clientWidth/2-(p.x+p.w/2)*${scale},y:w.scene.clientHeight/2-(p.y+p.h/2)*${scale}};w.apply()}`);
      await wait(800);
      const row=await js(`{const w=window.__world,box=w.scene.getBoundingClientRect(),layer=w.root.querySelector('.outside-layer'),live=layer.querySelector('.outside-live'),plane=layer.querySelector('.outside-viewport'),weather=w.root.querySelector('.weather-layer'),quick=layer.querySelector('.outside-quick'),detail=layer.querySelector('.outside-detail'),p=w.outdoor.park;const point=live.createSVGPoint();point.x=p.x+p.w/2-parseFloat(layer.style.left);point.y=p.y+p.h/2-parseFloat(layer.style.top);const mapped=point.matrixTransform(live.getScreenCTM());const rect=el=>{const r=el.getBoundingClientRect();return{left:r.left-box.left,top:r.top-box.top,w:r.width,h:r.height}};({requested:${scale},scale:w.cam.s,cam:{x:w.cam.x,y:w.cam.y},box:{w:box.width,h:box.height},plane:rect(plane),weather:rect(weather),live:rect(live),sameLive:live===window.__viewportOriginal.live,mappingError:Math.hypot(mapped.x-(box.left+w.cam.x+(p.x+p.w/2)*w.cam.s),mapped.y-(box.top+w.cam.y+(p.y+p.h/2)*w.cam.s)),quick:{width:quick.width,height:quick.height},detail:{width:detail.width,height:detail.height,sharp:detail.dataset.sharp==='1',sourceDensity:Number(detail.dataset.sourceDensity)},dpr:devicePixelRatio,weatherBuffers:[...weather.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,rect:rect(c),sky:c.classList.contains('weather-sky-view'),density:Number(c.dataset.sourceDensity),source:{x:Number(c.dataset.sourceX),y:Number(c.dataset.sourceY),w:Number(c.dataset.sourceW),h:Number(c.dataset.sourceH)}})),counts:{quick:document.querySelectorAll('.outside-quick').length,detail:document.querySelectorAll('.outside-detail').length,live:document.querySelectorAll('.outside-live').length},errors:window.__errs})}`);
      rows.push(row);
      const near=(a,b)=>Math.abs(a-b)<.08;
      if(!row.sameLive||row.mappingError>.08||!near(row.plane.left,0)||!near(row.plane.top,0)||!near(row.plane.w,row.box.w)||!near(row.plane.h,row.box.h)||!near(row.weather.left,0)||!near(row.weather.top,0)||!near(row.weather.w,row.box.w)||!near(row.weather.h,row.box.h))throw Error('Viewport presentation lost camera alignment');
      if(row.quick.width>Math.ceil((row.box.w+512)*row.dpr)||row.quick.height>Math.ceil((row.box.h+512)*row.dpr)||row.detail.width>Math.ceil((row.box.w+512)*row.dpr)+1||row.detail.height>Math.ceil((row.box.h+512)*row.dpr)+1||row.weatherBuffers.some(c=>c.sky?(c.width>Math.ceil((row.box.w+256)*c.density)+1||c.height>Math.ceil((row.box.h+256)*c.density)+1||Math.abs(c.density-Math.min(row.dpr,1.5,Math.sqrt(1.6e6/(row.box.w*row.box.h))))>.001):c.width*c.height>1.61e6)||Object.values(row.counts).some(n=>n!==1)||row.errors.length)throw Error('Viewport buffers or lifecycle exceeded bounds');
      const sky=row.weatherBuffers.find(c=>c.sky);
      if(!sky)throw Error('Weather sky source is missing');
      const wx=(row.box.w/2-row.cam.x)/row.scale,wy=(row.box.h/2-row.cam.y)/row.scale;
      const sx=sky.rect.left+(wx-sky.source.x)/sky.source.w*sky.rect.w,sy=sky.rect.top+(wy-sky.source.y)/sky.source.h*sky.rect.h;
      if(Math.hypot(sx-row.box.w/2,sy-row.box.h/2)>.08)throw Error('Retained weather pixels lost world mapping');
      if(scale>=2&&(!row.detail.sharp||Math.abs(row.detail.sourceDensity/row.scale/row.dpr-1)>.01))throw Error('Visible outdoor source is not sharp at actual camera DPR');
      if(scale===.23||scale===3.932)fs.writeFileSync(path.join(out,`viewport-${scale}.png`),(await wc.capturePage()).toPNG());
    }
    console.log('viewportChecks',JSON.stringify(rows));
  }finally{
    fs.writeFileSync(path.join(out,'viewport-checks.json'),JSON.stringify(rows,null,2));
    await js(`{const w=window.__world,o=window.__viewportOriginal;if(o){w.cam=o.cam;w.frame=o.frame;w.apply();delete window.__viewportOriginal}}`).catch(()=>{});
  }
};
