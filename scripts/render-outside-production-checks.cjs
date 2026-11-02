// Mounted production ownership/mapping checks. Pixel fidelity is checked by
// render-outside-tiles-checks.cjs against native and same-density controls.
const fs=require('node:fs'),path=require('node:path');
module.exports=async({js,wc,wait,out,dbg=wc.debugger,restoreMetrics})=>{
  const result={samples:[],checks:{},screenshots:[],pixelComparisonsRun:false,note:'Actual mounted SVG PNG tiles: independent PNG dimensions, world/display mapping, original-vector/live alignment, viewport budget, decoder/canvas release and source replacement.'};
  const save=()=>fs.writeFileSync(path.join(out,'outside-production-checks.json'),JSON.stringify(result,null,2));
  const check=(ok,message)=>{if(!ok){save();throw Error(message)}};
  let installed=false,metrics=false,attached=false;
  const read=()=>js('window.__outsideProductionQA.snapshot()');
  const validate=(r,settled)=>{
    check(['vectors','mixed','tiles','empty'].includes(r.presentation),'Grounds have no supported presentation');
    check(r.planeCount===1&&r.sharedSvgRoots===1,'Grounds mounted duplicate planes or SVG paint roots');
    check(r.planeError<.3&&r.nativeMappingError<.3&&r.liveMappingError<.3&&r.tileMappingError<.3,'Grounds source/live/PNG world mapping diverged');
    check(r.minimumSourcePixelsPerDisplayPixel>=.999,'Grounds magnified undersized source pixels');
    check(r.nativeBounded&&r.decodeBounded&&r.retainedPixels<=r.pixelBudget,'Grounds escaped the viewport-derived pixel budget');
    check(r.tilesShareRoot&&r.complementaryClips,'Ready and missing cores do not share canonical SVG clips');
    if(settled)check(r.presentation==='tiles'&&r.missing===0&&!r.pending&&r.transientCanvasPixels===0&&r.svgDecoders===0&&r.retainedPixels===r.pngPixels,'Settled grounds retained duplicate source canvases, decoder URLs or mismatched PNG ownership');
  };
  const capture=async name=>{const file='outside-production-'+name+'.png';fs.writeFileSync(path.join(out,file),(await wc.capturePage()).toPNG());result.screenshots.push(file)};
  const settle=async name=>{const start=Date.now();let row;do{row=await read();if(row.presentation==='tiles'&&!row.pending&&row.svgDecoders===0&&row.transientCanvasPixels===0)break;await wait(40)}while(Date.now()-start<20000);row.name=name;row.settleWaitMs=Date.now()-start;result.samples.push(row);validate(row,true);save();return row};
  try{
    installed=true;
    await js(`(()=>{
      const w=window.__world,layer=w.root.querySelector('.outside-layer');if(!layer||!w.outdoor?.park)throw Error('Mounted real grounds are required');
      const q=window.__outsideProductionQA={cam:w.cameraState(),frame:w.frame,held:w.layoutHeld,display:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},errors:[],blobs:new Map(),svgUrls:new Set(),revoked:new Set(),canvases:new Set(),maxSvgAxis:0};
      q.error=e=>q.errors.push(e.message||String(e.reason));window.addEventListener('error',q.error);window.addEventListener('unhandledrejection',q.error);
      q.create=URL.createObjectURL;q.revoke=URL.revokeObjectURL;q.element=Document.prototype.createElement;
      q.createWrapper=function(blob){const url=q.create.call(this,blob);if(blob?.type==='image/png')q.blobs.set(url,blob.slice(0,24).arrayBuffer().then(buffer=>{const d=new DataView(buffer);if(d.byteLength<24||d.getUint32(0)!==0x89504e47)throw Error('Retained tile is not a PNG');return{width:d.getUint32(16),height:d.getUint32(20)}}));if(blob?.type==='image/svg+xml'){q.svgUrls.add(url);void blob.slice(0,2048).text().then(text=>{const root=text.match(/<svg\\b[^>]*>/)?.[0]||'',width=Number(root.match(/\\bwidth="([^"]+)"/)?.[1]),height=Number(root.match(/\\bheight="([^"]+)"/)?.[1]);q.maxSvgAxis=Math.max(q.maxSvgAxis,width||0,height||0)})}return url};
      q.revokeWrapper=function(url){q.revoked.add(url);q.blobs.delete(url);q.svgUrls.delete(url);return q.revoke.call(this,url)};
      q.elementWrapper=function(...args){const node=q.element.apply(this,args);if(String(args[0]).toLowerCase()==='canvas')q.canvases.add(node);return node};
      URL.createObjectURL=q.createWrapper;URL.revokeObjectURL=q.revokeWrapper;Document.prototype.createElement=q.elementWrapper;
      q.center=s=>{w.stopCameraMotion();const p=w.outdoor.park;w.cam={s,x:w.scene.clientWidth/2-(p.x+p.w/2)*s,y:w.scene.clientHeight/2-(p.y+p.h/2)*s};w.apply()};
      q.snapshot=async()=>{
        const layer=w.root.querySelector('.outside-layer'),plane=layer.querySelector('.outside-viewport'),host=plane.querySelector('.outside-native'),svg=host.shadowRoot.querySelector('svg'),source=svg.querySelector('[data-outside-source]'),tiles=svg.querySelector('.outside-tiles'),box=w.scene.getBoundingClientRect(),r=plane.getBoundingClientRect(),s=w.cam.s,dpr=devicePixelRatio||1;
        const left=parseFloat(layer.style.left)||0,top=parseFloat(layer.style.top)||0,matrix=svg.getScreenCTM();
        const error=(x,y,m=matrix)=>{if(!m)return 1e9;const a=new DOMPoint(x,y).matrixTransform(m);return Math.hypot(a.x-(box.left+w.cam.x+(left+x)*s),a.y-(box.top+w.cam.y+(top+y)*s))};
        const view=svg.viewBox.baseVal;let tileMappingError=0,minimum=Infinity,pngPixels=0,tilesShareRoot=true,complementaryClips=!!source?.getAttribute('clip-path'),visible=0;
        for(const image of tiles.querySelectorAll('image')){
          const dimensions=await q.blobs.get(image.href.baseVal);if(!dimensions)throw Error('Mounted PNG has no owned source blob');pngPixels+=dimensions.width*dimensions.height;
          const group=image.parentElement,clipId=group.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1],clip=clipId&&svg.querySelector('[id="'+clipId+'"]'),rect=clip?.querySelector('rect');tilesShareRoot&&=image.ownerSVGElement===svg;
          complementaryClips&&=!!rect&&rect.getAttribute('shape-rendering')==='crispEdges';
          if(group.dataset.pending==='1'||getComputedStyle(group).display==='none')continue;visible++;
          const br=image.getBoundingClientRect();minimum=Math.min(minimum,dimensions.width/(br.width*dpr),dimensions.height/(br.height*dpr));tileMappingError=Math.max(tileMappingError,error(image.x.baseVal.value,image.y.baseVal.value,image.getScreenCTM()));
          if(dimensions.width>514||dimensions.height>514)throw Error('PNG tile exceeds guarded 512px cell');
        }
        const missing=Number(plane.dataset.missingTiles),density=Number(tiles.dataset.sourceDensity);
        if(missing)minimum=Math.min(minimum,view.width?svg.width.baseVal.value/(view.width*s):Infinity,view.height?svg.height.baseVal.value/(view.height*s):Infinity);
        const live=plane.querySelector('.outside-live'),lm=live?.getScreenCTM(),lv=live?.viewBox.baseVal,liveMappingError=lm&&lv?error(lv.x+lv.width/2,lv.y+lv.height/2,lm):1e9;
        const pad={x:Math.min(256,box.width/4),y:Math.min(256,box.height/4)},transientCanvasPixels=[...q.canvases].filter(c=>c.className==='outside-raster-job').reduce((sum,c)=>sum+c.width*c.height,0);
        return{scale:s,dpr,presentation:plane.dataset.presentation,planeCount:layer.querySelectorAll('.outside-viewport').length,sharedSvgRoots:[...host.shadowRoot.children].filter(e=>e.localName==='svg').length,visiblePngTiles:visible,missing,pending:plane.dataset.pending==='1',retainedPixels:Number(plane.dataset.cachePixels),pixelBudget:Number(plane.dataset.pixelBudget),pngPixels,transientCanvasPixels,svgDecoders:q.svgUrls.size,sourceDensity:density,minimumSourcePixelsPerDisplayPixel:Number.isFinite(minimum)?minimum:density/(s*dpr),tileMappingError,nativeMappingError:error(view.x,view.y),liveMappingError,tilesShareRoot,complementaryClips,planeError:Math.max(Math.abs(r.left-box.left),Math.abs(r.top-box.top),Math.abs(r.width-box.width),Math.abs(r.height-box.height)),nativeBounded:svg.width.baseVal.value<=(box.width+2*pad.x)*2**.25+2&&svg.height.baseVal.value<=(box.height+2*pad.y)*2**.25+2,decodeBounded:q.maxSvgAxis<=514,viewport:{width:box.width,height:box.height}};
      };
      w.stopCameraMotion();w.setLayoutHeld(true);const old=layer.querySelector('.outside-viewport'),svg=old.querySelector('.outside-native').shadowRoot.querySelector('svg'),oldImages=[...svg.querySelectorAll('.outside-tiles image')],oldUrls=oldImages.map(i=>i.href.baseVal),oldCanvases=[...old.querySelectorAll('canvas')];w.redrawOutside(true);
      q.replacement={oldPlaneRemoved:!old.isConnected,oldHrefsReleased:oldImages.every(i=>!i.hasAttribute('href')),oldUrlsRevoked:oldUrls.every(url=>q.revoked.has(url)),oldBackingsReleased:oldCanvases.every(c=>!c.width&&!c.height),newPlaneCount:layer.querySelectorAll('.outside-viewport').length};return true;
    })()`);
    result.originalDisplay=await js('window.__outsideProductionQA.display');result.replacement=await js('window.__outsideProductionQA.replacement');check(Object.entries(result.replacement).every(([key,value])=>key==='newPlaneCount'?value===1:value),'Source replacement retained retired PNGs, URLs or canvas backings');
    for(const scale of [.23,.65,2,5]){await js(`window.__outsideProductionQA.center(${scale})`);const row=await read();row.name='scale-'+scale+'-immediate';result.samples.push(row);validate(row,false);await settle('scale-'+scale+'-settled');await capture('scale-'+scale)}
    if(!dbg.isAttached()){dbg.attach('1.3');attached=true}
    const original=result.originalDisplay;
    for(const variant of [{name:'resized',width:Math.max(640,Math.floor(original.width*.75)),height:Math.max(480,Math.floor(original.height*.8)),deviceScaleFactor:original.dpr},{name:'dpr-2',width:original.width,height:original.height,deviceScaleFactor:2},{name:'dpr-1.25',width:original.width,height:original.height,deviceScaleFactor:1.25}]){
      metrics=true;await dbg.sendCommand('Emulation.setDeviceMetricsOverride',{width:variant.width,height:variant.height,deviceScaleFactor:variant.deviceScaleFactor,mobile:false});await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await js('window.__outsideProductionQA.center(2.173)');await settle(variant.name);await capture(variant.name);
    }
    result.errors=await js('window.__outsideProductionQA.errors');check(!result.errors.length,'Mounted outdoor checks recorded renderer errors');result.checks={mappingDensityBoundsAndSettle:true,liveArtworkAlignment:true,sourceReplacement:true,losslessPngOwnership:true,temporaryCanvasRelease:true,resizeAndDpr:true};
  }finally{
    if(metrics){if(restoreMetrics)await dbg.sendCommand('Emulation.setDeviceMetricsOverride',restoreMetrics);else await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')}
    if(installed)result.cleanupRestored=await js(`(()=>{const q=window.__outsideProductionQA,w=window.__world;if(!q)return false;if(URL.createObjectURL===q.createWrapper)URL.createObjectURL=q.create;if(URL.revokeObjectURL===q.revokeWrapper)URL.revokeObjectURL=q.revoke;if(Document.prototype.createElement===q.elementWrapper)Document.prototype.createElement=q.element;window.removeEventListener('error',q.error);window.removeEventListener('unhandledrejection',q.error);w.stopCameraMotion();w.cam=q.cam;w.frame=q.frame;w.sceneBox=null;w.apply();w.setLayoutHeld(q.held);delete window.__outsideProductionQA;return URL.createObjectURL===q.create&&URL.revokeObjectURL===q.revoke&&Document.prototype.createElement===q.element})()`).catch(()=>false);
    if(attached)dbg.detach();save();
  }
  check(result.cleanupRestored,'Outdoor instrumentation did not restore its owners');result.passed=true;save();console.log('outsideProductionChecks',JSON.stringify({samples:result.samples.length,checks:result.checks,passed:true}));return result;
};
