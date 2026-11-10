// Isolated native pixels for the production tile renderer, compiled from the
// current source. Uses the existing fixture only for original grounds artwork.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
module.exports = async ({ js, wc, wait, out, dbg = wc.debugger }) => {
  const { transformWithOxc } = await import('vite');
  const compile = async name => {
    const file = path.resolve(__dirname, '../../src', name), source = fs.readFileSync(file, 'utf8');
    let input=source.replace(/^import .*;\r?\n/gm, '');
    if(name==='office/outside-zoom.ts'&&process.env.LUCID_OUTSIDE_TILE_INTEGER_PHASE==='1'){const start=input.indexOf('    const svg = this.svg.replace'),end=input.indexOf('    const url =',start);if(start<0||end<0)throw Error('Physical capture diagnostic could not find source producer');input=input.slice(0,start)+'    const svg = captureSourceSvg(this.svg,crop,plan.density,width,height);\n'+input.slice(end);}
    return { name, sha256: crypto.createHash('sha256').update(source).digest('hex'), code: (await transformWithOxc(input, file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '') };
  };
  const parts = await Promise.all(['perf/raster-quiet.ts','perf/tile-grid.ts','perf/svg-write.ts','office/outside-view.ts','office/outside-cull.ts','office/outside-zoom.ts'].map(compile));
  const result = { source: parts.map(({name,sha256})=>({name,sha256})), cpuThrottle:process.env.LUCID_PERF_CPU||null, diagnosticIntegerPhase:process.env.LUCID_OUTSIDE_TILE_INTEGER_PHASE==='1',diagnosticOffscreenEncoder:process.env.LUCID_OUTSIDE_TILE_OFFSCREEN==='1',diagnosticUntransformedPlane:process.env.LUCID_OUTSIDE_TILE_UNTRANSFORM==='1',diagnosticGuard3:process.env.LUCID_OUTSIDE_TILE_GUARD==='3', semanticReference:'Continuous PNG from the identical source, upward density and global pixel phase. Original native raw and seam diagnostics remain separately recorded.', thresholds: { real: { meanAbsoluteChannelError:1.25,pixelsOver12Fraction:.02 }, synthetic:{meanAbsoluteChannelError:.5,pixelsOver12Fraction:.01}, seam:{physicalPixelRadius:1,referenceFlatTolerance:1,maxFlatChannelError:1,allowedViolations:0},semantic:{referenceFlatTolerance:1,flatChannelError:1,edgeHullTolerance:1,allowedViolations:0} }, samples:[], errors:[] };
  const save=()=>fs.writeFileSync(path.join(out,'outside-tiles-checks.json'),JSON.stringify(result,null,2));
  const check=(ok,message)=>{if(!ok){save();throw Error(message)}};
  let installed=false, metrics=false;
  try {
    await js(`{const beginSystem=()=>0,endSystem=()=>{};function captureSourceSvg(markup,crop,density,width,height){const root=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement,g=document.createElementNS('http://www.w3.org/2000/svg','g');for(const child of [...root.children])if(child.localName!=='defs'&&child.localName!=='style')g.append(child);g.setAttribute('transform','matrix('+[density,0,0,density,-Math.round(crop.x*density),-Math.round(crop.y*density)].join(' ')+')');root.append(g);root.setAttribute('viewBox','0 0 '+width+' '+height);root.setAttribute('width',width);root.setAttribute('height',height);root.setAttribute('preserveAspectRatio','none');return new XMLSerializer().serializeToString(root)}${parts.map(p=>p.code).join('\n')};${result.diagnosticGuard3?"const originalPlan=planRasterTiles;planRasterTiles=(...args)=>originalPlan(...args).map(plan=>{const extra=2/plan.density;return{...plan,width:plan.width+4,height:plan.height+4,crop:{...plan.crop,x:plan.crop.x-extra,y:plan.crop.y-extra,w:plan.crop.w+2*extra,h:plan.crop.h+2*extra}}});":''}${result.diagnosticIntegerPhase?"const consume=OutsideRaster.prototype.consume;OutsideRaster.prototype.consume=async function(plan,url){const tile=await consume.call(this,plan,url);if(tile&&typeof tile==='object'){tile.image.setAttribute('x',Math.round(plan.crop.x*plan.density));tile.image.setAttribute('y',Math.round(plan.crop.y*plan.density));tile.image.setAttribute('width',plan.width);tile.image.setAttribute('height',plan.height);tile.image.setAttribute('transform','scale('+1/plan.density+')')}return tile};":''}window.__outsideTileAPI={paintOutside,updateOutside,caches,captureSourceSvg,integerPhase:${result.diagnosticIntegerPhase}};void 0}`);
    await js(`(()=>{
      const w=window.__world,layer=w.root.querySelector('.outside-layer'),original=layer.querySelector('.outside-native')?.shadowRoot?.querySelector('svg');
      if(!original)throw Error('Original production grounds SVG is required');
      const source=original.cloneNode(true),W=parseFloat(layer.style.width),H=parseFloat(layer.style.height);
      source.querySelector('.outside-tiles')?.remove();source.querySelector('[data-outside-tile-defs]')?.remove();const content=source.querySelector('[data-outside-source]');if(content)content.replaceWith(...content.childNodes);source.removeAttribute('clip-path');source.querySelectorAll('clipPath[id^="outside-missing-"]').forEach(n=>n.parentElement.remove());
      source.setAttribute('xmlns','http://www.w3.org/2000/svg');source.setAttribute('viewBox','0 0 '+W+' '+H);source.setAttribute('width',W);source.setAttribute('height',H);source.removeAttribute('style');
      const ox=parseFloat(layer.style.left)||0,oy=parseFloat(layer.style.top)||0,p=w.outdoor.park,l=w.grounds.lawn;
      const q=window.__outsideTileQA={source:new XMLSerializer().serializeToString(source),W,H,
        centers:{park:{x:p.x+p.w/2-ox,y:p.y+p.h/2-oy},woodland:{x:l.x-650-ox,y:l.y+l.h/2-oy}},errors:[],decodeErrors:[],encodes:[]};
      q.decode=HTMLImageElement.prototype.decode;q.decodeWrapper=async function(...args){try{return await q.decode.apply(this,args)}catch(error){q.decodeErrors.push({name:error.name,message:error.message});throw error}};HTMLImageElement.prototype.decode=q.decodeWrapper;
      q.toBlob=HTMLCanvasElement.prototype.toBlob;q.toBlobWrapper=function(callback,...args){const own=this.className==='outside-raster-job',width=this.width,height=this.height,at=performance.now();if(own&&${result.diagnosticOffscreenEncoder}&&typeof OffscreenCanvas==='function'){
        const surface=new OffscreenCanvas(width,height),ctx=surface.getContext('2d');ctx.drawImage(this,0,0);void surface.convertToBlob({type:'image/png'}).then(blob=>{const elapsedMs=performance.now()-at,a=this.getContext('2d').getImageData(0,0,width,height).data,b=ctx.getImageData(0,0,width,height).data;let max=0,over1=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>1)over1++}q.encodes.push({mode:'offscreen',width,height,bytes:blob.size,elapsedMs,copyMaxRGBAError:max,copyChannelsOver1:over1,temporaryExtraPixels:width*height,diagnosticReadbackBytes:width*height*8,contextAttributes:ctx.getContextAttributes?.()});surface.width=surface.height=0;callback(blob)}).catch(error=>{surface.width=surface.height=0;q.encodes.push({mode:'offscreen',error:String(error)});callback(null)});return;
      }return q.toBlob.call(this,blob=>{if(own)q.encodes.push({mode:'html',width,height,bytes:blob?.size||0,elapsedMs:performance.now()-at});callback(blob)},...args)};HTMLCanvasElement.prototype.toBlob=q.toBlobWrapper;
      q.host=document.createElement('div');q.host.style.cssText='position:fixed;left:0;top:0;width:480px;height:320px;overflow:hidden;z-index:2147483647;background:white;pointer-events:none';document.body.append(q.host);
      q.error=e=>q.errors.push(e.message||String(e.reason));window.addEventListener('error',q.error);window.addEventListener('unhandledrejection',q.error);
      q.clear=()=>{q.resume?.();q.resume=null;if(q.Image){window.Image=q.Image;q.Image=null}q.controlImage?.removeAttribute('href');q.controlGroup?.remove();q.controlCoverage?.remove();if(q.controlUrl){URL.revokeObjectURL(q.controlUrl);q.controlUrl=null}q.controlImage=q.controlGroup=q.controlCoverage=null;q.cache?.destroy();q.host.replaceChildren()};
      q.mount=(markup,bounds,view,scale)=>{
        q.clear();q.view=view;q.scale=scale;q.markup=markup;
        const actual=document.createElement('div'),reference=document.createElement('div');
        const rootStyle='position:absolute;left:0;top:0;transform-origin:0 0;transform:translate('+(-view.x*scale)+'px,'+(-view.y*scale)+'px) scale('+scale+')';
        actual.style.cssText=reference.style.cssText=rootStyle;reference.style.visibility='hidden';
        const layer=document.createElement('div');layer.style.cssText='position:absolute;left:0;top:0;width:'+bounds.w+'px;height:'+bounds.h+'px';actual.append(layer);reference.innerHTML=markup;
        q.host.append(reference,actual);q.actual=actual;q.reference=reference;q.layer=layer;
        window.__outsideTileAPI.paintOutside(layer,markup);q.cache=window.__outsideTileAPI.caches.get(layer);
        window.__outsideTileAPI.updateOutside(layer,{x:-view.x*scale,y:-view.y*scale,s:scale},480,320);
      };
      q.show=reference=>{q.actual.style.display=reference===true?'none':'';q.reference.style.display=reference===true?'':'none';q.cache.tileHost.style.visibility=reference==='control'?'hidden':'';if(q.controlGroup)q.controlGroup.style.display=reference==='control'?'':'none';q.actual.style.visibility=q.reference.style.visibility='visible'};
      // Both mixed representations keep the very same original native group.
      // The independent continuous PNG covers only the union of ready cores.
      q.coverControl=()=>q.controlCoverage?.replaceChildren(...q.cache.plans.filter(p=>q.cache.tiles.has(p.key)).map(p=>q.cache.tiles.get(p.key).rect.cloneNode(true)));
      q.hole=()=>{q.Image=window.Image;const gate=new Promise(resolve=>q.resume=resolve);window.Image=function(...args){const image=new q.Image(...args),decode=image.decode.bind(image);image.decode=()=>gate.then(decode);return image};const key=q.cache.plans[0].key,tile=q.cache.tiles.get(key);tile.image.dispatchEvent(new Event('error'));q.cache.failed.delete(key);q.cache.kick();q.coverControl();return{missing:q.cache.plans.filter(p=>!q.cache.tiles.has(p.key)).length,rects:q.cache.missingClip.children.length}};
      q.makeControl=async()=>{
        const density=q.cache.plans[0].density,scale=q.scale,view=q.view,x=(Math.floor(view.x*density)-1)/density,y=(Math.floor(view.y*density)-1)/density,width=Math.ceil((view.x+480/scale-x)*density)+1,height=Math.ceil((view.y+320/scale-y)*density)+1,crop={x,y,w:width/density,h:height/density};
        const markup=window.__outsideTileAPI.integerPhase?window.__outsideTileAPI.captureSourceSvg(q.markup,crop,density,width,height):q.markup.replace(/<svg\\b[^>]*>/,root=>root.replace(/\\bviewBox="[^"]*"/,'viewBox="'+[x,y,crop.w,crop.h].join(' ')+'"').replace(/\\bwidth="[^"]*"/,'width="'+width+'"').replace(/\\bheight="[^"]*"/,'height="'+height+'"').replace(/\\s+preserveAspectRatio="[^"]*"/,'').replace(/>$/,' preserveAspectRatio="none">'));
        const sourceUrl=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'})),decoder=new Image(),canvas=document.createElement('canvas');let blob;
        try{decoder.src=sourceUrl;await decoder.decode();canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(decoder,0,0);decoder.src='';blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))}finally{decoder.src='';canvas.width=canvas.height=0;URL.revokeObjectURL(sourceUrl)}
        if(!blob)throw Error('Continuous source control did not encode');q.controlUrl=URL.createObjectURL(blob);
        const ns='http://www.w3.org/2000/svg',image=document.createElementNS(ns,'image'),clip=document.createElementNS(ns,'clipPath'),group=document.createElementNS(ns,'g');
        clip.setAttribute('id','outside-control-continuous');clip.setAttribute('clipPathUnits','userSpaceOnUse');group.setAttribute('clip-path','url(#outside-control-continuous)');q.controlCoverage=clip;q.coverControl();
        for(const [key,value]of Object.entries(crop))image.setAttribute(key==='w'?'width':key==='h'?'height':key,value);if(window.__outsideTileAPI.integerPhase){image.setAttribute('x',Math.round(x*density));image.setAttribute('y',Math.round(y*density));image.setAttribute('width',width);image.setAttribute('height',height);image.setAttribute('transform','scale('+1/density+')')}image.setAttribute('preserveAspectRatio','none');const loaded=new Promise((resolve,reject)=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',reject,{once:true})});group.append(image);q.cache.tileDefs.append(clip);q.cache.native.append(group);q.controlImage=image;q.controlGroup=group;image.setAttribute('href',q.controlUrl);await loaded;group.style.display='none';q.controlInfo={crop,density,width,height,phase:{x:x*density,y:y*density},presentation:'same-original-SVG',nativeHole:'same-original-native-group',readyCores:clip.children.length};
      };
      return true;
    })()`); installed=true;
    const { nativeImage }=require('electron');
    const capture=async()=>{
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const {data}=await dbg.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,clip:{x:0,y:0,width:480,height:320,scale:1}});
      const png=Buffer.from(data,'base64'),image=nativeImage.createFromBuffer(png);return{png,size:image.getSize(),bytes:image.toBitmap()};
    };
    const compare=(a,b,limits,cores,view,scale,dpr,strict=false)=>{
      check(a.size.width===b.size.width&&a.size.height===b.size.height,'Native tile reference size changed');
      const W=a.size.width,H=a.size.height;let total=0,over12=0,max=0;
      for(let i=0;i<a.bytes.length;i+=4){let error=0;for(let c=0;c<3;c++){const d=Math.abs(a.bytes[i+c]-b.bytes[i+c]);total+=d;max=Math.max(max,d);error=Math.max(error,d)}if(error>12)over12++}
      const mask=new Uint8Array(W*H),physical=scale*dpr;
      for(const core of cores){
        const left=(core.x-view.x)*physical,right=(core.x+core.w-view.x)*physical,top=(core.y-view.y)*physical,bottom=(core.y+core.h-view.y)*physical;
        for(const edge of [left,right])for(let x=Math.max(0,Math.floor(edge-1));x<=Math.min(W-1,Math.ceil(edge+1));x++)for(let y=Math.max(0,Math.floor(top-1));y<=Math.min(H-1,Math.ceil(bottom+1));y++)mask[y*W+x]=1;
        for(const edge of [top,bottom])for(let y=Math.max(0,Math.floor(edge-1));y<=Math.min(H-1,Math.ceil(edge+1));y++)for(let x=Math.max(0,Math.floor(left-1));x<=Math.min(W-1,Math.ceil(right+1));x++)mask[y*W+x]=1;
      }
      let seamFlatPixels=0,seamFlatViolations=0,seamMaxFlatError=0,flatPixels=0,flatViolations=0,edgeHullViolations=0,maxFlatError=0,maxEdgeHullError=0;const examples=[];
      for(let p=0;p<mask.length;p++)if(strict||mask[p]){
        const x=p%W,y=Math.floor(p/W),lo=[255,255,255],hi=[0,0,0];
        for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)for(let c=0;c<3;c++){const v=b.bytes[(yy*W+xx)*4+c];lo[c]=Math.min(lo[c],v);hi[c]=Math.max(hi[c],v);}
        const flat=hi.every((v,c)=>v-lo[c]<=1);let error=0;for(let c=0;c<3;c++)error=Math.max(error,Math.abs(a.bytes[p*4+c]-b.bytes[p*4+c]));
        if(flat){flatPixels++;maxFlatError=Math.max(maxFlatError,error);if(error>1){flatViolations++;if(examples.length<8)examples.push({x,y,actual:[...a.bytes.subarray(p*4,p*4+3)].reverse(),reference:[...b.bytes.subarray(p*4,p*4+3)].reverse(),neighborMin:[...lo].reverse(),neighborMax:[...hi].reverse(),seam:!!mask[p]})}if(mask[p]){seamFlatPixels++;seamMaxFlatError=Math.max(seamMaxFlatError,error);if(error>1)seamFlatViolations++;}}
        else if(strict){let hull=0;for(let c=0;c<3;c++)hull=Math.max(hull,lo[c]-a.bytes[p*4+c],a.bytes[p*4+c]-hi[c]);maxEdgeHullError=Math.max(maxEdgeHullError,hull);if(hull>1)edgeHullViolations++;}
      }
      const mean=total/(W*H*3),fraction=over12/(W*H);return{width:W,height:H,meanAbsoluteChannelError:mean,maxChannelError:max,pixelsOver12:over12,pixelsOver12Fraction:fraction,seamFlatPixels,seamFlatViolations,seamMaxFlatError,flatPixels,flatViolations,edgeHullViolations,maxFlatError,maxEdgeHullError,examples,strictPassed:!flatViolations&&!edgeHullViolations,passed:mean<=limits.meanAbsoluteChannelError&&fraction<=limits.pixelsOver12Fraction};
    };
    const synthetics={
      opacity:'<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1600" viewBox="0 0 2000 1600"><rect width="2000" height="1600" fill="#d2bb90" fill-opacity=".19"/><g opacity=".47"><rect x="73" y="51" width="1400" height="900" fill="#2f836c"/><g opacity=".53"><path d="M80 100H1600V1200H80Z" fill="#a84079"/><circle cx="820" cy="620" r="420" fill="#efb56d"/></g></g><path d="M90 370H1700M600 70V1400" stroke="#292b5a" stroke-width="2.7"/></svg>',
      strokes:'<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1600" viewBox="0 0 2000 1600"><defs><linearGradient id="g"><stop stop-color="#f6e6b2"/><stop offset="1" stop-color="#82b89c"/></linearGradient></defs><rect width="2000" height="1600" fill="url(#g)"/><g fill="none" stroke="#303461" stroke-width="1.7"><path d="M20 200C480 10 620 1100 1700 230M20 520C480 330 620 1420 1700 550M500 0V1500M850 0V1500M1200 0V1500"/></g><path d="M50 400H1600V900H50Z" stroke="#c17c8f" stroke-width="13.3" fill="#7cae96" fill-opacity=".36"/></svg>',
    };
    const real=await js('({W:window.__outsideTileQA.W,H:window.__outsideTileQA.H,centers:window.__outsideTileQA.centers})');
    for(const [name,kind]of [['park','real'],['woodland','real'],['opacity','synthetic'],['strokes','synthetic']]) {
      if(process.env.LUCID_OUTSIDE_TILE_CASES&&!process.env.LUCID_OUTSIDE_TILE_CASES.split(',').includes(name))continue;
      for(const [variant,dpr,scale]of [['dpr2',2,.65],['quarter-below',3,2**.25/3*(1-1e-5)],['quarter-above',3,2**.25/3*(1+1e-5)]]) {
        if(process.env.LUCID_OUTSIDE_TILE_VARIANTS&&!process.env.LUCID_OUTSIDE_TILE_VARIANTS.split(',').includes(variant))continue;
        metrics=true;await dbg.sendCommand('Emulation.setDeviceMetricsOverride',{width:800,height:700,deviceScaleFactor:dpr,mobile:false});
        const center=kind==='real'?real.centers[name]:{x:750.173,y:600.619};
        const view={x:center.x-240/scale+.173,y:center.y-160/scale+.619};
        await js(`window.__outsideTileQA.mount(${kind==='real'?'window.__outsideTileQA.source':JSON.stringify(synthetics[name])},${JSON.stringify(kind==='real'?{w:real.W,h:real.H}:{w:2000,h:1600})},${JSON.stringify(view)},${scale})`);
        if(result.diagnosticUntransformedPlane)await js(`{const q=window.__outsideTileQA;q.actual.style.transform='none';q.cache.plane.style.transform='none'}`);
        let ready=false;const readyAt=Date.now();while(Date.now()-readyAt<20000){if(await js('!window.__outsideTileQA.cache.pending&&window.__outsideTileQA.cache.plans.every(p=>window.__outsideTileQA.cache.tiles.has(p.key))')){ready=true;break}await wait(25)}
        if(!ready)result.queueFailure=await js(`({decodeErrors:window.__outsideTileQA.decodeErrors,encodes:window.__outsideTileQA.encodes,failed:[...window.__outsideTileQA.cache.failed],pending:!!window.__outsideTileQA.cache.pending,pendingCanvas:window.__outsideTileQA.cache.pending&&{width:window.__outsideTileQA.cache.pending.canvas.width,height:window.__outsideTileQA.cache.pending.canvas.height},decoders:window.__outsideTileQA.cache.images.size,tiles:window.__outsideTileQA.cache.tiles.size,plans:window.__outsideTileQA.cache.plans.length,urls:window.__outsideTileQA.cache.urls.size,visibility:document.visibilityState})`);
        check(ready,'Outdoor tile queue did not reach sharp coverage');
        await js('window.__outsideTileQA.makeControl()');
        const cores=await js('window.__outsideTileQA.cache.plans.map(p=>p.core)');
        const row={name,variant,kind,dpr,scale,readyWaitMs:Date.now()-readyAt,states:[]};
        for(const state of ['all-tiles','one-hole']) {
          if(state==='one-hole'){const holes=await js('window.__outsideTileQA.hole()');check(holes.missing===1&&holes.rects===1,'Mixed tile state did not expose precisely one SVG hole');}
          for(const background of ['#ffffff','#141a33']) {
            await js(`window.__outsideTileQA.host.style.background=${JSON.stringify(background)};window.__outsideTileQA.show(true)`);const reference=await capture();
            await js("window.__outsideTileQA.show('control')");const control=await capture();
            await js('window.__outsideTileQA.show(false)');const actual=await capture();
            const stats=compare(actual,reference,result.thresholds[kind],cores,view,scale,dpr),controlStats=compare(actual,control,result.thresholds[kind],cores,view,scale,dpr,true),controlNative=compare(control,reference,result.thresholds[kind],cores,view,scale,dpr);row.states.push({state,background,...stats,control:controlStats,controlNative});
            if(background==='#ffffff'){fs.writeFileSync(path.join(out,`outside-tiles-${name}-${variant}-${state}.png`),actual.png);fs.writeFileSync(path.join(out,`outside-tiles-${name}-${variant}-${state}-control.png`),control.png);if(state==='all-tiles')fs.writeFileSync(path.join(out,`outside-tiles-${name}-${variant}-reference.png`),reference.png);}
          }
        }
        row.geometry=await js(`(()=>{const q=window.__outsideTileQA,c=q.cache,box=r=>({x:r.x,y:r.y,width:r.width,height:r.height});return{tiles:c.plans.length,retainedPixels:c.retainedPixels(),budget:c.pixelBudget(),sourceDensity:c.plans[0]?.density,requiredDensity:c.cam.s*devicePixelRatio,reportedDpr:devicePixelRatio,nativeMissing:c.missingClip.children.length,maxAxis:Math.max(...[...c.tiles.values()].flatMap(t=>[t.plan.width,t.plan.height])),parentTransform:getComputedStyle(q.actual).transform,planeTransform:getComputedStyle(c.plane).transform,rects:c.plans.slice(0,6).map(plan=>{const tile=c.tiles.get(plan.key);return{key:plan.key,core:plan.core,image:tile?box(tile.image.getBoundingClientRect()):null,clip:tile?{x:tile.rect.getAttribute('x'),y:tile.rect.getAttribute('y'),w:tile.rect.getAttribute('width'),h:tile.rect.getAttribute('height')}:null}})}})()`);
        row.encodes=await js('window.__outsideTileQA.encodes');
        result.samples.push(row);save();console.log('outsideTilesSample',JSON.stringify({name,variant,passed:row.states.every(s=>s.passed),states:row.states,geometry:row.geometry}));
      }
    }
    result.errors=await js('window.__outsideTileQA.errors');check(!result.errors.length,'Native outdoor tiles recorded renderer errors');
    check(result.samples.every(s=>s.states.every(row=>row.passed)),'Outdoor tile/native pixel comparison exceeded existing thresholds');
    check(result.samples.every(s=>s.states.every(row=>row.controlNative.passed)),'Continuous source PNG exceeded the unchanged native raw thresholds');
    check(result.samples.every(s=>s.states.every(row=>row.control.strictPassed&&row.control.seamFlatViolations===0)),'Outdoor tile/control pixels exceeded fixed flat/hull/seam thresholds');
    result.passed=true;
  }finally{
    if(installed)await js(`{const q=window.__outsideTileQA;if(q){q.clear();q.host.remove();if(HTMLImageElement.prototype.decode===q.decodeWrapper)HTMLImageElement.prototype.decode=q.decode;if(HTMLCanvasElement.prototype.toBlob===q.toBlobWrapper)HTMLCanvasElement.prototype.toBlob=q.toBlob;window.removeEventListener('error',q.error);window.removeEventListener('unhandledrejection',q.error);delete window.__outsideTileQA}delete window.__outsideTileAPI}`).catch(()=>{});
    if(metrics)await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');save();
  }
  return result;
};

if(require.main===module||process.versions.electron&&path.resolve(process.argv[1]||'')===__filename){
  if(!process.versions.electron){
    const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});const env={...process.env,LUCID_SHOT:out,LUCID_SHOT_EVERY:'3600000',LUCID_PERF_CHECKS_ONLY:'1',LUCID_OUTSIDE_PRODUCTION_CHECKS:'1'};delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'),[__filename,out],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
  }else{
    const original=require.resolve('./render-outside-production-checks.cjs');require.cache[original]={id:original,filename:original,loaded:true,exports:module.exports};require('./render-profile.cjs');
  }
}
