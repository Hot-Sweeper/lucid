// Native fixture helper only. It does not launch Electron or alter production art.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ js, wc, wait, out }) => {
  const result = {
    thresholds: {
      real: { meanAbsoluteChannelError: 1.25, pixelsOver12Fraction: .02 },
      synthetic: {
        meanAbsoluteChannelError: .5, pixelsOver12Fraction: .01,
        semantic: { neighborRadiusPhysicalPixels: 1, referenceFlatTolerance: 1, nonEdgeChannelError: 1, edgeHullChannelTolerance: 1, allowedViolations: 0 },
      },
      goldenInteriorChannelError: 1,
      rationale: 'Actual-art raw limits remain unchanged. Synthetic raw limits are also reported unchanged; synthetic semantic acceptance requires every reference-flat pixel to match within one channel value, and any edge interpolation to stay inside its immediate reference-neighbor channel hull. One physical pixel of independently rendered SVG guard on every side supplies real neighbors at the tested viewport boundary, with the same pixel phase; no test column is removed. Interior golden colors independently check pattern phase and compositing. Thresholds are fixed before the next run.',
    },
    real: [], synthetic: [], checks: [], errors: [],
  };
  fs.mkdirSync(out, { recursive: true });
  const save = () => fs.writeFileSync(path.join(out, 'outside-canvas-checks.json'), JSON.stringify(result, null, 2));
  const check = (ok, message) => { result.checks.push({ passed: !!ok, message }); save(); };
  const { transformWithOxc } = await import('vite');
  const sourcePath = path.resolve(__dirname, '../src/office/outside-canvas.ts');
  const transformed = await transformWithOxc(fs.readFileSync(sourcePath, 'utf8'), sourcePath);
  const code = transformed.code.replace(/\bexport\s+class\b/g, 'class').replace(/\bexport\s*\{[^}]*\};?/g, '');
  try {
    await js(`{${code};window.__OutsideVectorCanvasFixtureClass=OutsideVectorCanvas;void 0;}`);
    const setup = await js(`(()=>{
      const live=document.querySelector('.outside-native')?.shadowRoot?.querySelector('svg');
      if(!live)throw Error('Actual mounted static outdoor SVG is required');
      const host=document.createElement('div');
      host.id='outside-canvas-fixture';host.style.cssText='position:fixed;left:-10000px;top:0;width:480px;height:320px;opacity:0;visibility:visible!important;display:block!important;pointer-events:none';
      const shadow=host.attachShadow({mode:'open'}),svg=live.cloneNode(true);
      svg.style.setProperty('visibility','visible','important');svg.style.setProperty('display','block','important');
      shadow.append(svg);document.body.append(host);
      const Class=window.__OutsideVectorCanvasFixtureClass,renderer=new Class(svg),w=window.__world;
      const ox=parseFloat(w.root.querySelector('.outside-layer').style.left)||0,oy=parseFloat(w.root.querySelector('.outside-layer').style.top)||0;
      const args=w.outArgs||{},park=args.park||w.outdoor.park,lawn=w.grounds.lawn;
      const centers={
        park:{x:park.x+park.w/2-ox,y:park.y+park.h/2-oy},
        woodland:{x:lawn.x-650-ox,y:lawn.y+lawn.h/2-oy},
        building:{x:w.size.w/2-ox,y:w.size.h/2-oy},
        fractional:{x:lawn.x+26-ox+.173,y:lawn.y+lawn.h*.47-oy+.619},
      };
      const state=window.__outsideCanvasFixture={host,svg,renderer,centers,created:[],errors:[],backings:new WeakMap()};
      state.error=e=>state.errors.push(e.message||String(e.reason));window.addEventListener('error',state.error);window.addEventListener('unhandledrejection',state.error);
      state.mount=markup=>{const s=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;shadow.append(s);return s};
      state.reference=async(svg,view,scale,width,height,dpr,guard=0)=>{
        const clone=svg.cloneNode(true),W=Math.ceil(width*dpr),H=Math.ceil(height*dpr),pixelWorldX=width/scale/W,pixelWorldY=height/scale/H,PW=W+guard*2,PH=H+guard*2;
        clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('viewBox',[view.x-guard*pixelWorldX,view.y-guard*pixelWorldY,PW*pixelWorldX,PH*pixelWorldY].join(' '));
        clone.setAttribute('width',String(PW));clone.setAttribute('height',String(PH));clone.setAttribute('preserveAspectRatio','none');
        clone.style.setProperty('width',PW+'px','important');clone.style.setProperty('height',PH+'px','important');
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
        try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=PW;canvas.height=PH;canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0,PW,PH);return canvas}
        finally{URL.revokeObjectURL(url)}
      };
      state.viewport=(renderer,view,scale,width,height,dpr,guard=0)=>{
        renderer.snapshot?.();
        const crop=renderer.crop;if(!crop)throw Error('Retained outdoor canvas did not expose its source crop');
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
        const ctx=canvas.getContext('2d',{willReadFrequently:true}),sx=(view.x-crop.x)*crop.density,sy=(view.y-crop.y)*crop.density,sw=width/scale*crop.density,sh=height/scale*crop.density;
        if(guard){const padded=document.createElement('canvas');padded.width=canvas.width+guard*2;padded.height=canvas.height+guard*2;
          padded.getContext('2d',{willReadFrequently:true}).drawImage(renderer.canvas,sx-guard*sw/canvas.width,sy-guard*sh/canvas.height,sw*padded.width/canvas.width,sh*padded.height/canvas.height,0,0,padded.width,padded.height);
          ctx.drawImage(padded,guard,guard,canvas.width,canvas.height,0,0,canvas.width,canvas.height);padded.width=padded.height=0;
        }else ctx.drawImage(renderer.canvas,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
        return canvas;
      };
      state.tileSummary=(tiles,width,height)=>{
        const buffers=tiles.map(t=>({x:t.x,y:t.y,width:t.canvas.width,height:t.canvas.height,core:t.core?{...t.core}:null}));
        const corePixels=buffers.reduce((n,t)=>n+(t.core?t.core.w*t.core.h:0),0),allocatedPixels=buffers.reduce((n,t)=>n+t.width*t.height,0);
        const covered=buffers.length===Math.ceil(width/510)*Math.ceil(height/510)&&corePixels===width*height&&new Set(buffers.map(t=>t.core?.x+','+t.core?.y)).size===buffers.length&&buffers.every(t=>{
          const c=t.core;if(!c||c.x<0||c.y<0||c.x%510||c.y%510||c.w!==Math.min(510,width-c.x)||c.h!==Math.min(510,height-c.y))return false;
          const left=c.x-t.x,top=c.y-t.y,right=t.x+t.width-c.x-c.w,bottom=t.y+t.height-c.y-c.h;
          return t.width>0&&t.height>0&&t.width<=512&&t.height<=512&&left===(c.x>0?1:0)&&top===(c.y>0?1:0)&&right===(c.x+c.w<width?1:0)&&bottom===(c.y+c.h<height?1:0);
        });
        return {buffers,corePixels,allocatedPixels,covered};
      };
      state.compare=async(renderer,svg,view,scale,width,height,dpr,limits)=>{
        if(!renderer.draw(view,scale,width,height,dpr))return {supported:false,view,scale};
        const retained=renderer.canvas,crop={...renderer.crop},guard=limits.semantic?.neighborRadiusPhysicalPixels||0,actual=state.viewport(renderer,view,scale,width,height,dpr,guard),reference=await state.reference(svg,view,scale,width,height,dpr),W=actual.width,H=actual.height;
        const semanticReference=guard?await state.reference(svg,view,scale,width,height,dpr,guard):null;
        const scratchBuffers=(renderer.scratch||[]).filter(Boolean).map(c=>({width:c.width,height:c.height}));
        const tileSummary=state.tileSummary(renderer.tiles||[],retained.width,retained.height),tileBuffers=tileSummary.buffers,tilePixels=tileSummary.allocatedPixels,corePixels=tileSummary.corePixels;
        let known=state.backings.get(renderer);if(!known){known=new Map();state.backings.set(renderer,known)}
        const signature=JSON.stringify(crop),previous=known.get(signature),reused=!!previous;
        const history=(renderer.history||[]).map(e=>{const summary=state.tileSummary(e.tiles,e.width,e.height);return {width:e.width,height:e.height,pixels:e.width*e.height,corePixels:summary.corePixels,tilePixels:summary.allocatedPixels,tileCount:e.tiles.length,tilesCover:summary.covered}});
        const backing={width:retained.width,height:retained.height},historyPixels=history.reduce((n,e)=>n+e.tilePixels,0),currentPixels=backing.width*backing.height,cachedPixels=tilePixels+historyPixels,bytes=4*(currentPixels+tilePixels+historyPixels+scratchBuffers.reduce((n,c)=>n+c.width*c.height,0));
        const cacheBounded=history.length<=2&&cachedPixels<=Math.max(40e6,tilePixels)&&history.every(e=>e.corePixels===e.pixels&&e.tilesCover);
        const bucketRatio=2**.5,maxWidth=Math.ceil((width+384)*dpr*bucketRatio)+1,maxHeight=Math.ceil((height+384)*dpr*bucketRatio)+1;
        const tilesCover=tileSummary.covered;
        const scratchBounded=scratchBuffers.every(c=>tileBuffers.length?c.width>0&&c.height>0&&c.width<=512&&c.height<=512:c.width===backing.width&&c.height===backing.height);
        const bounded=tilesCover&&scratchBounded&&cacheBounded&&(reused?backing.width===previous.width&&backing.height===previous.height&&tilePixels===previous.tilePixels:backing.width<=maxWidth&&backing.height<=maxHeight);
        const sharp=crop.density>=scale*dpr*(1-1e-9),covered=crop.x<=view.x+1e-9&&crop.y<=view.y+1e-9&&crop.x+crop.w>=view.x+view.w-1e-9&&crop.y+crop.h>=view.y+view.h-1e-9;
        const transform=new DOMMatrix(retained.style.transform),expectedScale=scale*dpr/crop.density;
        const mappingError=Math.max(Math.abs(transform.e-(crop.x-view.x)*scale),Math.abs(transform.f-(crop.y-view.y)*scale),Math.abs(parseFloat(retained.style.width)*transform.a-crop.w*scale),Math.abs(parseFloat(retained.style.height)*transform.d-crop.h*scale),Math.abs(transform.a-expectedScale),Math.abs(transform.d-expectedScale),Math.abs(transform.b),Math.abs(transform.c));
        const output={supported:true,view,scale,width,height,dpr,crop,backing,viewportPixels:{width:W,height:H},scratchBuffers,tileBuffers,corePixels,tilePixels,tilesCover,history,historyPixels,cachedPixels,cacheBounded,bytes,reused,bounded,sharp,covered,mappingError,initialBackingLimit:{width:maxWidth,height:maxHeight},backgrounds:[]};
        known.set(signature,{width:backing.width,height:backing.height,tilePixels});
        for(const background of ['#ffffff','#141a33']){
          const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=W;a.height=b.height=H;
          const ag=a.getContext('2d',{willReadFrequently:true}),bg=b.getContext('2d',{willReadFrequently:true});
          ag.fillStyle=bg.fillStyle=background;ag.fillRect(0,0,W,H);bg.fillRect(0,0,W,H);ag.drawImage(actual,0,0);bg.drawImage(reference,0,0);
          const ap=ag.getImageData(0,0,W,H).data,bp=bg.getImageData(0,0,W,H).data;
          let total=0,max=0,over12=0,changed=0,opaque=0;
          for(let i=0;i<ap.length;i+=4){let pixel=0;for(let c=0;c<3;c++){const delta=Math.abs(ap[i+c]-bp[i+c]);total+=delta;max=Math.max(max,delta);pixel=Math.max(pixel,delta)}if(pixel>12)over12++;if(pixel>1)changed++;if(ap[i+3])opaque++}
          const mean=total/(W*H*3),fraction=over12/(W*H),passed=mean<=limits.meanAbsoluteChannelError&&fraction<=limits.pixelsOver12Fraction;
          const stats={background,meanAbsoluteChannelError:mean,maxChannelError:max,pixelsOver12:over12,pixelsOver12Fraction:fraction,pixelsOver1:changed,opaque,passed};
          if(limits.semantic){
            const rule=limits.semantic,semantic={guardPhysicalPixels:guard,nonEdgePixels:0,edgeBandPixels:0,nonEdgeFailures:0,edgeHullFailures:0,maxNonEdgeError:0,maxEdgeHullError:0,maxGuardReferenceCenterDifference:0};
            const padded=document.createElement('canvas');padded.width=semanticReference.width;padded.height=semanticReference.height;const pg=padded.getContext('2d',{willReadFrequently:true});pg.fillStyle=background;pg.fillRect(0,0,padded.width,padded.height);pg.drawImage(semanticReference,0,0);const pp=pg.getImageData(0,0,padded.width,padded.height).data,PW=padded.width;
            for(let y=0;y<H;y++)for(let x=0;x<W;x++){
              const i=(y*W+x)*4,center=((y+guard)*PW+x+guard)*4,min=[pp[center],pp[center+1],pp[center+2]],max=[...min];
              for(let c=0;c<3;c++)semantic.maxGuardReferenceCenterDifference=Math.max(semantic.maxGuardReferenceCenterDifference,Math.abs(pp[center+c]-bp[i+c]));
              for(let yy=y;yy<=y+guard*2;yy++)for(let xx=x;xx<=x+guard*2;xx++){
                const j=(yy*PW+xx)*4;for(let c=0;c<3;c++){min[c]=Math.min(min[c],pp[j+c]);max[c]=Math.max(max[c],pp[j+c])}
              }
              const edge=max.some((n,c)=>n-min[c]>rule.referenceFlatTolerance);
              if(!edge){semantic.nonEdgePixels++;const error=Math.max(...min.map((_,c)=>Math.abs(ap[i+c]-pp[center+c])));semantic.maxNonEdgeError=Math.max(semantic.maxNonEdgeError,error);if(error>rule.nonEdgeChannelError)semantic.nonEdgeFailures++}
              else{semantic.edgeBandPixels++;const error=Math.max(0,...min.map((n,c)=>n-ap[i+c]),...max.map((n,c)=>ap[i+c]-n));semantic.maxEdgeHullError=Math.max(semantic.maxEdgeHullError,error);if(error>rule.edgeHullChannelTolerance)semantic.edgeHullFailures++}
            }
            semantic.passed=semantic.nonEdgeFailures<=rule.allowedViolations&&semantic.edgeHullFailures<=rule.allowedViolations;stats.semantic=semantic;padded.width=padded.height=0;
          }
          if(!passed||stats.semantic&&!stats.semantic.passed){stats.actualPng=a.toDataURL('image/png').split(',')[1];stats.referencePng=b.toDataURL('image/png').split(',')[1];
            const diff=document.createElement('canvas');diff.width=W;diff.height=H;const dg=diff.getContext('2d'),pixels=dg.createImageData(W,H);
            for(let i=0;i<ap.length;i+=4){pixels.data[i]=Math.min(255,Math.abs(ap[i]-bp[i])*4);pixels.data[i+1]=Math.min(255,Math.abs(ap[i+1]-bp[i+1])*4);pixels.data[i+2]=Math.min(255,Math.abs(ap[i+2]-bp[i+2])*4);pixels.data[i+3]=255}dg.putImageData(pixels,0,0);stats.diffPng=diff.toDataURL('image/png').split(',')[1];
          }
          output.backgrounds.push(stats);a.width=a.height=b.width=b.height=0;
        }
        reference.width=reference.height=actual.width=actual.height=0;if(semanticReference)semanticReference.width=semanticReference.height=0;return output;
      };
      return {sourceNodes:svg.querySelectorAll('*').length,sourceViewBox:svg.getAttribute('viewBox'),centers};
    })()`);
    result.setup = setup; save();

    // Each comparison has its own sequential decode and two small pixel reads.
    // The total viewport is deliberately smaller than the production window.
    for (const area of ['park', 'woodland', 'building', 'fractional']) {
      for (const scale of [.23, .65, 2, 5]) {
        const sample = await js(`(async()=>{const f=window.__outsideCanvasFixture,c=f.centers[${JSON.stringify(area)}],scale=${scale},width=360,height=240,dpr=devicePixelRatio||1,view={x:c.x-width/scale/2,y:c.y-height/scale/2,w:width/scale,h:height/scale};return f.compare(f.renderer,f.svg,view,scale,width,height,dpr,${JSON.stringify(result.thresholds.real)})})()`);
        sample.area = area; result.real.push(sample);
        for (const [i, bg] of (sample.backgrounds || []).entries()) {
          for (const key of ['actualPng', 'referencePng', 'diffPng']) if (bg[key]) {
            const name = `outside-${area}-${scale}-${i}-${key}.png`;fs.writeFileSync(path.join(out, name), Buffer.from(bg[key], 'base64'));delete bg[key];bg[key.replace('Png', 'File')] = name;
          }
        }
        save();
        check(sample.supported && sample.bounded && sample.sharp && sample.covered && sample.mappingError < .01, `${area} at ${scale}x retains bounded overscan with source density at least the display density, complete coverage and correct CSS mapping`);
        check(sample.backgrounds?.length === 2 && sample.backgrounds.every(s => s.passed), `${area} at ${scale}x matches the actual SVG within fixed edge-antialias limits on both backgrounds`);
        await wait(20);
      }
    }

    const synthetic = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="128" viewBox="0 0 180 128"><defs><pattern id="fixture-checker" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#2878c8"/><rect width="4" height="8" fill="#d05020"/></pattern></defs><rect width="180" height="128" fill="#203040"/><g transform="translate(12 8) scale(1.25)"><rect width="64" height="48" fill="url(#fixture-checker)"/></g><g transform="translate(100 15)" opacity="0.5"><rect width="40" height="40" fill="#e04020"/><rect x="20" width="40" height="40" fill="#2060e0"/></g><rect x="100" y="80" width="40" height="25" fill="#20d060" stroke="#e09020" stroke-width="8" opacity="0.5"/><path d="M10 95h60v20h-60z M20 100h40v10h-40z" fill="#f0d020" fill-rule="evenodd"/><path d="M10 84h70" fill="none" stroke="#f4e0c0" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 5"/><ellipse cx="160" cy="90" rx="7" ry="16" transform="rotate(18 160 90)" fill="#c060c0"/></svg>`;
    result.golden = await js(`(()=>{const f=window.__outsideCanvasFixture,svg=f.mount(${JSON.stringify(synthetic)}),renderer=new window.__OutsideVectorCanvasFixtureClass(svg);f.synthetic={svg,renderer};if(!renderer.draw({x:0,y:0,w:180,h:128},1,180,128,1))return {supported:false};const ctx=renderer.canvas.getContext('2d'),probes=[
      {at:[1,1],expected:[32,48,64]},
      {at:[14,12],expected:[208,80,32]},
      {at:[20,12],expected:[40,120,200]},
      {at:[110,25],expected:[128,56,48]},
      {at:[130,25],expected:[32,72,144]},
      {at:[150,25],expected:[32,72,144]},
      {at:[115,90],expected:[32,128,80]},
      {at:[102,90],expected:[128,96,48]},
      {at:[15,105],expected:[240,208,32]},
      {at:[30,105],expected:[32,48,64]}
    ];const view=f.viewport(renderer,{x:0,y:0,w:180,h:128},1,180,128,1),pixels=view.getContext('2d',{willReadFrequently:true});for(const p of probes){p.actual=[...pixels.getImageData(...p.at,1,1).data].slice(0,3);p.maxError=Math.max(...p.actual.map((n,i)=>Math.abs(n-p.expected[i])))}view.width=view.height=0;return {supported:true,probes}})()`);
    check(result.golden.supported && result.golden.probes.every(p => p.maxError <= result.thresholds.goldenInteriorChannelError), 'Compound pattern transforms, group opacity, fill/stroke opacity and even-odd holes match independent interior golden colors');
    for (const scale of [.65, 1, 2.173]) {
      const sample = await js(`(async()=>{const f=window.__outsideCanvasFixture,s=f.synthetic;return f.compare(s.renderer,s.svg,{x:.173,y:.619,w:180/${scale},h:128/${scale}},${scale},180,128,1.5,${JSON.stringify(result.thresholds.synthetic)})})()`);
      for (const [i, bg] of (sample.backgrounds || []).entries()) for (const key of ['actualPng', 'referencePng', 'diffPng']) if (bg[key]) {
        const name = `outside-synthetic-${scale}-${i}-${key}.png`;fs.writeFileSync(path.join(out, name), Buffer.from(bg[key], 'base64'));delete bg[key];bg[key.replace('Png', 'File')] = name;
      }
      result.synthetic.push(sample); save();
      check(sample.supported && sample.bounded && sample.sharp && sample.covered && sample.mappingError < .01 && sample.backgrounds?.length === 2 && sample.backgrounds.every(s => s.semantic?.passed), `Synthetic compound SVG has exact reference-flat colors and only one-physical-pixel neighbor-hull interpolation at fractional crop and ${scale}x`);
    }

    result.retention = await js(`(()=>{const f=window.__outsideCanvasFixture,r=new window.__OutsideVectorCanvasFixtureClass(f.svg),width=360,height=240,dpr=devicePixelRatio||1,scale=1.13,c=f.centers.park,view={x:c.x-width/scale/2,y:c.y-height/scale/2,w:width/scale,h:height/scale};
      if(!r.draw(view,scale,width,height,dpr))return {supported:false};
      const crop=r.crop,backing={width:r.canvas.width,height:r.canvas.height},restore=[],calls=[];
      const trap=(object,key)=>{const old=object[key];object[key]=function(){calls.push(key);throw Error('Covered camera movement repainted or measured: '+key)};restore.push(()=>object[key]=old)};
      let pan,down,error=null;
      try{for(const key of ['fill','stroke','clearRect','drawImage'])trap(CanvasRenderingContext2D.prototype,key);trap(Element.prototype,'getBoundingClientRect');trap(SVGGraphicsElement.prototype,'getBBox');trap(window,'getComputedStyle');
        const panView={...view,x:view.x+20/scale,y:view.y-12/scale};pan=r.draw(panView,scale,width,height,dpr);
        const smaller=scale*.9,downView={x:view.x,y:view.y,w:width/smaller,h:height/smaller};down=r.draw(downView,smaller,width,height,dpr);
      }catch(e){error=String(e)}finally{for(const fn of restore.reverse())fn()}
      const retained=pan===true&&down===true&&r.crop===crop&&r.canvas.width===backing.width&&r.canvas.height===backing.height;
      const magnified=crop.density/dpr*1.05,zoomView={x:view.x,y:view.y,w:width/magnified,h:height/magnified};
      const counts={fill:0,stroke:0,clearRect:0},originals=[];
      let fresh=false;try{for(const key of Object.keys(counts)){const old=CanvasRenderingContext2D.prototype[key];CanvasRenderingContext2D.prototype[key]=function(...args){counts[key]++;return old.apply(this,args)};originals.push(()=>CanvasRenderingContext2D.prototype[key]=old)}fresh=r.draw(zoomView,magnified,width,height,dpr)}finally{for(const fn of originals.reverse())fn()}
      return {supported:true,pan,down,error,calls,retained,backing,beforeCrop:{...crop},afterCrop:{...r.crop},magnify:{scale:magnified,neededDensity:magnified*dpr,fresh,density:r.crop?.density,counts,replacedCrop:r.crop!==crop}};
    })()`);
    check(result.retention.supported && result.retention.retained && result.retention.calls.length === 0 && !result.retention.error, 'Covered pan and zoom down retain the same backing pixels without Path2D drawing or geometry reads');
    check(result.retention.magnify?.fresh && result.retention.magnify.replacedCrop && result.retention.magnify.density >= result.retention.magnify.neededDensity*(1-1e-9) && result.retention.magnify.counts.clearRect > 0 && result.retention.magnify.counts.fill+result.retention.magnify.counts.stroke > 0, 'Magnifying beyond retained density immediately paints a fresh crop with enough source pixels');

    result.noGeometry = await js(`(()=>{const f=window.__outsideCanvasFixture,restore=[],calls=[];const trap=(object,key)=>{const old=object[key];object[key]=function(){calls.push(key);throw Error('Unexpected draw geometry read: '+key)};restore.push(()=>object[key]=old)};try{trap(Element.prototype,'getBoundingClientRect');trap(SVGGraphicsElement.prototype,'getBBox');trap(window,'getComputedStyle');const c=f.centers.park;const drawn=f.renderer.draw({x:c.x-200,y:c.y-100,w:400,h:200},1.173,360,240,devicePixelRatio||1);return {drawn,calls}}finally{for(const restoreOne of restore.reverse())restoreOne()}})()`);
    check(result.noGeometry.drawn && result.noGeometry.calls.length === 0, 'Retained draw performs no SVG bounds, DOM rectangle or computed-style reads');
    result.unsupported = await js(`(()=>{const f=window.__outsideCanvasFixture,out=[];for(const body of ['<text x="2" y="20">Unsupported text</text>','<rect width="40" height="40" style="filter:blur(2px)"/>']){const svg=f.mount('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'+body+'</svg>'),renderer=new window.__OutsideVectorCanvasFixtureClass(svg);out.push(renderer.draw({x:0,y:0,w:64,h:64},1,64,64,1));svg.remove()}return out})()`);
    check(result.unsupported.length === 2 && result.unsupported.every(v => v === false), 'Unsupported text and filter features gracefully request the original SVG fallback');
    result.errors = await js('window.__outsideCanvasFixture.errors');
    check(result.errors.length === 0, 'Outdoor canvas fixture has no renderer errors');
    result.production = [];
    await js(`{const w=window.__world;window.__outsideCameraBefore={cam:{x:w.cam.x,y:w.cam.y,s:w.cam.s},frame:w.frame};w.stopCameraMotion();void 0}`);
    try {
      for (const scale of [.23,.65,2,5]) {
        const row=await js(`(async()=>{const w=window.__world,p=w.outdoor.park;w.cam={s:${scale},x:w.scene.clientWidth/2-(p.x+p.w/2)*${scale},y:w.scene.clientHeight/2-(p.y+p.h/2)*${scale}};w.apply();await new Promise(requestAnimationFrame);const layer=w.root.querySelector('.outside-layer'),plane=layer.querySelector('.outside-viewport'),el=plane.querySelector('div.outside-vector-canvas'),box=w.scene.getBoundingClientRect(),r=el.getBoundingClientRect(),x=Number(el.dataset.sourceX),y=Number(el.dataset.sourceY),tiles=[...el.querySelectorAll('canvas')],s=w.cam.s;return{requested:${scale},scale:s,presentation:plane.dataset.presentation,mappingError:Math.hypot(r.left-(box.left+w.cam.x+(parseFloat(layer.style.left)+x)*s),r.top-(box.top+w.cam.y+(parseFloat(layer.style.top)+y)*s)),tiles:tiles.length,maxTile:Math.max(...tiles.map(c=>Math.max(c.width,c.height))),minimumSourcePixelsPerDisplayPixel:Math.min(...tiles.map(c=>c.width/c.getBoundingClientRect().width/devicePixelRatio)),sourceDensity:Number(el.dataset.sourceDensity),expectedDensity:s*devicePixelRatio,visible:getComputedStyle(el).display!=='none'}})()`);
        result.production.push(row);save();
        check(row.presentation==='vector-canvas'&&row.visible&&row.mappingError<.1&&row.tiles>0&&row.maxTile<=512&&row.minimumSourcePixelsPerDisplayPixel>=1-.001&&row.sourceDensity>=row.expectedDensity*(1-1e-9),`Actual mounted ${scale}x scenery tiles preserve world mapping, bounded surfaces and sharp display pixels`);
        fs.writeFileSync(path.join(out,`retained-scene-${scale}.png`),(await wc.capturePage()).toPNG());
      }
    } finally {
      await js(`{const w=window.__world,o=window.__outsideCameraBefore;if(o){w.cam=o.cam;w.frame=o.frame;w.apply()}delete window.__outsideCameraBefore;void 0}`).catch(()=>{});
    }
    result.passed = result.checks.every(c => c.passed); save();
    if (!result.passed) throw Error(`${result.checks.filter(c => !c.passed).length} outdoor canvas checks failed; see outside-canvas-checks.json and pixel-difference images`);
  } catch (error) { result.error = String(error); save(); throw error; }
  finally {
    await js(`{const f=window.__outsideCanvasFixture;if(f){window.removeEventListener('error',f.error);window.removeEventListener('unhandledrejection',f.error);f.host.remove()}delete window.__outsideCanvasFixture;delete window.__OutsideVectorCanvasFixtureClass}`).catch(() => {});
    save();
  }
  console.log('outsideCanvasChecks', JSON.stringify({passed:result.passed,checks:result.checks.length,realSamples:result.real.length,syntheticSamples:result.synthetic.length}));
  return result;
};
