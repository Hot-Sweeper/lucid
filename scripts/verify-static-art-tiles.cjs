const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'),[__filename,process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'lucid-static-tiles-'))],{env,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
}else{
  const {app,BrowserWindow,nativeImage}=require('electron'),out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({width:390,height:844,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
    const js=code=>wc.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,message)=>{if(!ok)throw Error(message)};
    const capture=async()=>{
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const {data}=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,clip:{x:0,y:0,width:390,height:844,scale:1}});
      return nativeImage.createFromBuffer(Buffer.from(data,'base64'));
    };
    const result={thresholds:{meanAbsoluteChannelError:1.25,pixelsOver12Fraction:.02,flatChannelError:1,edgeHullError:1,allowedSemanticViolations:0},samples:[],checks:[],errors:[]};
    result.comparisonContract={native:'Unchanged raw limits and genuine all-RGB flat pixels, with native hull violations recorded for tiles and the continuous control.',continuous:'Same serialized source, same upward density, integer source-pixel phase, strict flat error1 and edge-hull error1 with zero violations.'};
    result.comparisonContract.source='Stored PNG is compared with the original isolated transparent SVG canvas, including complete RGBA and both backgrounds, under unchanged max1/zero>1. Direct SVG-on-background diagnostics remain separate because that isolation/compositing path also differs from an independently encoded untiled PNG.';
    const save=()=>fs.writeFileSync(path.join(out,'static-tiles.json'),JSON.stringify(result,null,2));
    const compare=(a,b)=>{
      const size=a.getSize(),A=a.toBitmap(),B=b.toBitmap();assert(B.length===A.length,'Pixel dimensions changed');
      const width=size.width,height=size.height;let total=0,over12=0,flatViolations=0,legacyFlatChannelViolations=0,hullViolations=0,max=0,flatPixels=0;
      const hullLocations=[],hullHash=crypto.createHash('sha256');
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const p=(y*width+x)*4;let pixelMax=0;const ranges=[],errors=[];
        for(let c=0;c<3;c++){
          const error=Math.abs(A[p+c]-B[p+c]);errors.push(error);total+=error;max=Math.max(max,error);pixelMax=Math.max(pixelMax,error);
          let lo=255,hi=0;for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){const value=A[(yy*width+xx)*4+c];lo=Math.min(lo,value);hi=Math.max(hi,value);}
          ranges.push(hi-lo);
          if(hi-lo<=1&&error>1)legacyFlatChannelViolations++;
          if(B[p+c]<lo-1||B[p+c]>hi+1){hullViolations++;hullHash.update(`${x},${y},${c};`);if(hullLocations.length<64)hullLocations.push({x,y,channel:c,reference:A[p+c],actual:B[p+c],lo,hi});}
        }
        if(ranges.every(range=>range<=1)){flatPixels++;flatViolations+=errors.filter(error=>error>1).length;}
        if(pixelMax>12)over12++;
      }
      return{width,height,meanAbsoluteChannelError:total/(width*height*3),pixelsOver12Fraction:over12/(width*height),maxChannelError:max,flatPixels,flatViolations,legacyFlatChannelViolations,hullViolations,hullLocations,hullLocationsHash:hullHash.digest('hex')};
    };
    try{
      const {transformWithOxc}=await import('vite');
      const compile=async file=>(await transformWithOxc(fs.readFileSync(path.join(__dirname,'../src/perf',file+'.ts'),'utf8').replace(/^import .*;\r?\n/gm,''),file+'.ts')).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
      result.source=['raster-quiet','tile-grid','static-art'].map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/perf',name+'.ts'))).digest('hex')}));
      const code=await compile('raster-quiet')+'\n'+await compile('tile-grid')+'\n'+await compile('static-art')+'\nwindow.tileFixtureSurface=()=>[...surfaces][0];';
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#141a33;overflow:hidden}#scene{position:fixed;inset:0;overflow:hidden}#world{position:absolute;transform-origin:0 0;--tile-floor:#64926c}svg{overflow:visible;display:block}</style><div id="scene"><div class="world" id="world"></div></div>'));
      await js(`{document.querySelector('#world').innerHTML='<svg id="fixture-source" width="2400" height="1800" viewBox="0 0 2400 1800"><defs><linearGradient id="fixture-gradient"><stop stop-color="#ffb56c"/><stop offset="1" stop-color="#597dba"/></linearGradient></defs><g><rect width="2400" height="1800" fill="var(--tile-floor)" opacity=".63"/><rect x="200" y="240" width="900" height="550" rx="17" fill="url(#fixture-gradient)" opacity=".56"/><circle cx="512" cy="512" r="233.173" fill="#ef8592" opacity=".45"/><path d="M100 900 900 100M300 1000 1100 200" stroke="#ffd898" stroke-width="2.173" opacity=".65"/>${Array.from({length:20},(_,i)=>`<path d="M${i*93.173} 0v1800" stroke="#fff3d8" stroke-width="1.25" opacity=".18"/>`).join('')}</g></svg>';window.tileSVGJobs=0;const createURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='image/svg+xml')window.tileSVGJobs++;return createURL(blob)};${code};window.tileFixture={cacheStaticArt,updateStaticArt,invalidateStaticArt,dispose:cacheStaticArt(document.querySelector('#fixture-source'))};window.tileSetView=(s,x,y)=>{document.querySelector('#world').style.transform='translate('+x+'px,'+y+'px) scale('+s+')';window.tileFixture.updateStaticArt({s,x,y},innerWidth,innerHeight)};undefined}`);
      await js(`{
        window.tileErrors=[];window.addEventListener('error',event=>window.tileErrors.push(event.message));window.addEventListener('unhandledrejection',event=>window.tileErrors.push(String(event.reason)));
        window.tileControlClear=()=>{const q=window.tileControl;if(!q)return;q.image.removeAttribute('href');q.image.remove();q.clip?.remove();URL.revokeObjectURL(q.url);q.owner.tileGroup.style.visibility=q.tileVisibility;delete window.tileControl};
        window.tileControlMount=async()=>{
          window.tileControlClear();const owner=window.tileFixtureSurface(),view=owner.view(),density=owner.visibleTiles[0]?.density;
          if(!view||!density)throw Error('A ready tiled source is required for the continuous control');
          const left=Math.floor(view.x*density)-1,top=Math.floor(view.y*density)-1,right=Math.ceil((view.x+view.w)*density)+1,bottom=Math.ceil((view.y+view.h)*density)+1;
          const width=right-left,height=bottom-top,crop={x:left/density,y:top/density,w:width/density,h:height/density};
          const canvas=document.createElement('canvas'),sourceImage=new Image();let sourceURL='',pngURL='';
          try{
            sourceURL=URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="'+crop.x+' '+crop.y+' '+crop.w+' '+crop.h+'" preserveAspectRatio="none">'+owner.source+'</svg>'],{type:'image/svg+xml'}));
            sourceImage.src=sourceURL;await sourceImage.decode();canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(sourceImage,0,0,width,height);sourceImage.src='';
            const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('Continuous control encoding failed');pngURL=URL.createObjectURL(png);
            const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('preserveAspectRatio','none');image.style.visibility='hidden';
            for(const[key,value]of Object.entries({x:crop.x,y:crop.y,width:crop.w,height:crop.h}))image.setAttribute(key,String(value));
            const q=window.tileControl={owner,image,url:pngURL,tileVisibility:owner.tileGroup.style.visibility};
            const missing=owner.visibleTiles.filter(tile=>!owner.tiles.has(tile.key));
            if(missing.length){
              const clip=q.clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.id='static-continuous-ready';clip.setAttribute('clipPathUnits','userSpaceOnUse');
              for(const tile of owner.visibleTiles.filter(tile=>owner.tiles.has(tile.key))){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const[key,value]of Object.entries(owner.snapped(tile.core)))rect.setAttribute(key==='w'?'width':key==='h'?'height':key,String(value));rect.setAttribute('shape-rendering','crispEdges');clip.append(rect);}
              owner.svg.append(clip);image.setAttribute('clip-path','url(#'+clip.id+')');
            }
            owner.svg.append(image);
            await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Continuous SVG image load timed out')),5000);const done=error=>{clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve()};image.onload=()=>done();image.onerror=()=>done(Error('Continuous control image failed'));image.setAttribute('href',pngURL)});
            owner.tileGroup.style.visibility='hidden';image.style.visibility='';return{density,width,height,crop,phase:{x:left,y:top},reportedDpr:devicePixelRatio,missingCores:missing.length};
          }catch(error){window.tileControlClear();if(pngURL)URL.revokeObjectURL(pngURL);throw error;}
          finally{sourceImage.src='';if(sourceURL)URL.revokeObjectURL(sourceURL);canvas.width=canvas.height=0;}
        };
        window.tileSourceDiagnostic=async key=>{
          const owner=window.tileFixtureSurface(),record=owner.tiles.get(key),{asset,tile}=record,crop=tile.crop,W=asset.width,H=asset.height;
          const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="'+crop.x+' '+crop.y+' '+crop.w+' '+crop.h+'" preserveAspectRatio="none">'+owner.source+'</svg>';
          const svgURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),source=new Image(),actual=new Image(),roundtrip=new Image(),canvases=[];let pngURL='';
          const canvas=()=>{const value=document.createElement('canvas');value.width=W;value.height=H;canvases.push(value);return value};
          const paint=(image,background,explicit=true)=>{const value=canvas(),ctx=value.getContext('2d');if(background){ctx.fillStyle=background;ctx.fillRect(0,0,W,H)}explicit?ctx.drawImage(image,0,0,W,H):ctx.drawImage(image,0,0);return{canvas:value,rgba:ctx.getImageData(0,0,W,H).data}};
          const metric=(a,b)=>{let max=0,over1=0,alphaMax=0,premulMax=0,minErrorAlpha=255;const examples=[];for(let i=0;i<a.length;i+=4){let pixelMax=0;for(let c=0;c<4;c++){const error=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,error);pixelMax=Math.max(pixelMax,error);if(error>1)over1++;if(c<3)premulMax=Math.max(premulMax,Math.abs(Math.round(a[i+c]*a[i+3]/255)-Math.round(b[i+c]*b[i+3]/255)));}alphaMax=Math.max(alphaMax,Math.abs(a[i+3]-b[i+3]));if(pixelMax>1){minErrorAlpha=Math.min(minErrorAlpha,a[i+3],b[i+3]);if(examples.length<16)examples.push({x:(i/4)%W,y:Math.floor(i/4/W),expected:[...a.slice(i,i+4)],actual:[...b.slice(i,i+4)]})}}return{maxChannelError:max,channelsOver1:over1,maxAlphaError:alphaMax,maxPremultipliedChannelError:premulMax,minErrorAlpha:over1?minErrorAlpha:null,examples}};
          const dataURL=blob=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob)});
          try{
            source.src=svgURL;actual.src=asset.url;await Promise.all([source.decode(),actual.decode()]);
            const sourcePixels=paint(source),actualPixels=paint(actual),png=await new Promise(resolve=>sourcePixels.canvas.toBlob(resolve,'image/png'));pngURL=URL.createObjectURL(png);roundtrip.src=pngURL;await roundtrip.decode();const roundtripPixels=paint(roundtrip);
            const alpha={min:255,max:0,minNonzero:255};for(let i=3;i<sourcePixels.rgba.length;i+=4){const value=sourcePixels.rgba[i];alpha.min=Math.min(alpha.min,value);alpha.max=Math.max(alpha.max,value);if(value)alpha.minNonzero=Math.min(alpha.minNonzero,value)}
            const backgrounds={};for(const color of ['#ffffff','#141a33']){const direct=paint(source,color,false),stored=paint(actual,color,false),independent=paint(roundtrip,color,false),isolated=paint(sourcePixels.canvas,color,false);backgrounds[color]={directVsStored:metric(direct.rgba,stored.rgba),directVsIndependentRoundtrip:metric(direct.rgba,independent.rgba),isolatedCanvasVsStored:metric(isolated.rgba,stored.rgba),independentVsStored:metric(independent.rgba,stored.rgba)}}
            return{key,width:W,height:H,crop,sourceMatches:asset.sourceKey?.text===owner.source,alpha,sourceCanvasVsStoredRGBA:metric(sourcePixels.rgba,actualPixels.rgba),sourceCanvasVsRoundtripRGBA:metric(sourcePixels.rgba,roundtripPixels.rgba),storedVsIndependentRGBA:metric(actualPixels.rgba,roundtripPixels.rgba),backgrounds,sourceCanvasPNG:await dataURL(png),storedPNG:await dataURL(await(await fetch(asset.url)).blob())};
          }finally{source.src=actual.src=roundtrip.src='';URL.revokeObjectURL(svgURL);if(pngURL)URL.revokeObjectURL(pngURL);for(const value of canvases)value.width=value.height=0;}
        };
        undefined;
      }`);
      wc.debugger.attach('1.3');
      await js(`{const setView=window.tileSetView;window.tileSetView=(s,x,y,left=0,top=0)=>{document.querySelector('#scene').style.transform='translate('+left+'px,'+top+'px)';setView(s,x,y);window.tileFixture.updateStaticArt({s,x,y},innerWidth,innerHeight,left,top)};undefined}`);
      const sourceOnly=process.env.LUCID_STATIC_SOURCE_ONLY==='1';result.diagnosticOnly=sourceOnly;
      if(sourceOnly)await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
      const cases=sourceOnly?[]:[2,3].flatMap(dpr=>[.713,1,2.173].map(scale=>({dpr,scale,origin:{x:0,y:0}})).concat({dpr,scale:.713,origin:{x:.173,y:.619}}));
      for(const {dpr,scale,origin}of cases){
        await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:dpr,mobile:true});
        const x=195-512*scale+.173,y=422-512*scale+.619;
        await js(`window.__staticArt.enable(false);window.tileSetView(${scale},${x},${y},${origin.x},${origin.y})`);await wait(100);
        const reference=await capture();
        assert(reference.getSize().width===390*dpr&&reference.getSize().height===844*dpr,'The native pixel capture must retain the requested physical DPR');
        await js('window.__staticArt.enable(true)');
        let ready=false;for(let i=0;i<250;i++){ready=await js(`{const holders=[...document.querySelectorAll('[data-static-art]')];holders.length>0&&holders.every(el=>{const parts=el.dataset.tiles?.split('/').map(Number);return parts&&parts[0]>0&&parts[0]===parts[1]})&&window.__staticArt.stats().pending===0}`);if(ready)break;await wait(40);}
        assert(ready,'Visible tiles did not become complete');await wait(100);
        const actual=await capture(),sample={dpr,scale,origin,...compare(reference,actual),reportedDpr:await js('devicePixelRatio'),worldTransform:await js("getComputedStyle(document.querySelector('#world')).transform"),stats:await js('window.__staticArt.stats()')};
        const geometry=await js('window.tileControlMount()'),continuous=await capture();await js('window.tileControlClear()');
        sample.continuous={geometry,native:compare(reference,continuous),tiles:compare(continuous,actual)};
        sample.nativeHullMatchesControl=sample.hullViolations===sample.continuous.native.hullViolations&&sample.hullLocationsHash===sample.continuous.native.hullLocationsHash;
        result.samples.push(sample);save();
        const label=`tiles-${dpr}-${scale}${origin.x||origin.y?'-phase':''}`;
        fs.writeFileSync(path.join(out,`${label}-reference.png`),reference.toPNG());fs.writeFileSync(path.join(out,`${label}-actual.png`),actual.toPNG());fs.writeFileSync(path.join(out,`${label}-continuous.png`),continuous.toPNG());
        assert(sample.meanAbsoluteChannelError<=1.25&&sample.pixelsOver12Fraction<=.02,'Native SVG raw pixel agreement exceeded the fixed existing limits');
        // Native hull counts remain diagnostics. Only the same-source, same-LOD
        // continuous control can distinguish resampling AA from a tile seam.
        assert(sample.stats.bytes<=sample.stats.budgetBytes&&sample.stats.rasterBytes===0,'Retained tile cache exceeded its admission budget');
        const before=await js(`[...document.querySelectorAll('[data-static-tile] image')].map(el=>el.getAttribute('href'))`);
        await js(`window.tileSetView(${scale},${x+7.173},${y+11.619},${origin.x},${origin.y})`);
        const retention=await js(`({allReady:[...document.querySelectorAll('[data-static-art]')].every(el=>{const p=el.dataset.tiles.split('/').map(Number);return p[0]===p[1]}),urls:[...document.querySelectorAll('[data-static-tile] image')].map(el=>el.getAttribute('href'))})`);
        assert(retention.allReady&&retention.urls.some(url=>before.includes(url)),'A short pan discarded sharp retained tile coverage');result.checks.push({dpr,scale,retained:true});
      }
      let partial;
      if(!sourceOnly){
      await js(`window.__staticArt.enable(false);window.tileSetView(1,195-512+.173,422-512+.619)`);await wait(100);
      const partialReference=await capture();
      await js(`{window.tileSourceURLs=new Set();const priorURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=priorURL(blob);if(blob.type==='image/svg+xml')window.tileSourceURLs.add(url);return url};window.tileNativeImage=window.Image;window.tileFailNext=true;window.Image=function(...args){const image=new window.tileNativeImage(...args),decode=image.decode.bind(image);image.decode=async()=>{if(window.tileFailNext&&window.tileSourceURLs.has(image.src)){window.tileFailNext=false;throw Error('One missing static tile fixture')}return decode()};return image};window.__staticArt.enable(true);undefined}`);
      let partialReady=false;for(let i=0;i<250;i++){partialReady=await js(`{const p=document.querySelector('[data-static-art]')?.dataset.tiles?.split('/').map(Number);p&&p[0]>0&&p[0]===p[1]-1&&!window.tileFailNext&&window.__staticArt.stats().pending===0}`);if(partialReady)break;await wait(40);}
      assert(partialReady,'The mixed native/cached fixture did not retain exactly one missing visible cell');await wait(100);
      const partialImage=await capture();partial=compare(partialReference,partialImage);
      const partialGeometry=await js('window.tileControlMount()'),partialContinuous=await capture();await js('window.tileControlClear()');
      partial.continuous={geometry:partialGeometry,native:compare(partialReference,partialContinuous),tiles:compare(partialContinuous,partialImage)};result.partial=partial;save();
      fs.writeFileSync(path.join(out,'one-hole-reference.png'),partialReference.toPNG());fs.writeFileSync(path.join(out,'one-hole-actual.png'),partialImage.toPNG());fs.writeFileSync(path.join(out,'one-hole-continuous.png'),partialContinuous.toPNG());
      await js(`window.Image=window.tileNativeImage;delete window.tileNativeImage;window.tileSetView(1.2,195-512*1.2+.173,422-512*1.2+.619)`);
      for(let i=0;i<250;i++){if(await js(`{const p=document.querySelector('[data-static-art]')?.dataset.tiles?.split('/').map(Number);p&&p[0]>0&&p[0]===p[1]&&window.__staticArt.stats().pending===0}`))break;await wait(40);}
      const beforeReversal=await js('window.tileSVGJobs');
      await js(`window.tileSetView(1,195-512+.173,422-512+.619)`);await wait(100);
      result.reversal=await js(`({jobs:window.tileSVGJobs-${beforeReversal},ready:document.querySelector('[data-static-art]').dataset.tiles,density:Number(document.querySelector('[data-static-art]').dataset.density),required:devicePixelRatio})`);
      assert(result.reversal.jobs===0&&result.reversal.density>=result.reversal.required,'A fully covered sharper level must survive pinch reversal without new raster work');
      const reversalParts=result.reversal.ready.split('/').map(Number);assert(reversalParts[0]>0&&reversalParts[0]===reversalParts[1],'Pinch reversal reentered native fallback despite complete sharp coverage');
      }
      await js(`window.__staticArt.enable(false);document.querySelector('#world').style.setProperty('--tile-floor','#a36b45');window.__staticArt.invalidate();window.tileSetView(1,-317.173,-89.619)`);await wait(100);
      const themedReference=await capture();await js('window.__staticArt.enable(true)');
      for(let i=0;i<250;i++){if(await js(`{const p=document.querySelector('[data-static-art]')?.dataset.tiles?.split('/').map(Number);p&&p[0]>0&&p[0]===p[1]&&window.__staticArt.stats().pending===0}`))break;await wait(40);}
      await wait(100);const themedImage=await capture(),themed=compare(themedReference,themedImage);
      const themedGeometry=await js('window.tileControlMount()'),themedContinuous=await capture();await js('window.tileControlClear()');
      themed.continuous={geometry:themedGeometry,native:compare(themedReference,themedContinuous),tiles:compare(themedContinuous,themedImage)};result.theme=themed;save();
      const verified=await js('window.__staticArt.verify()');result.sourceVerification=verified;
      const sourcesPass=verified.length&&verified.every(s=>s.channelsOver1===0&&s.bounded&&s.verifiedTiles>0);
      if(!sourcesPass){
        result.sourceTileVerification=await js(`(async()=>{const s=window.tileFixtureSurface(),rows=[];for(const record of s.tiles.values()){const result=await s.verifyTile(record);if(result.channelsOver1||!result.bounded)rows.push({...result,key:record.tile.key,sourceMatches:record.asset.sourceKey?.text===s.source,crop:record.tile.crop})}return rows})()`);
        const worst=[...result.sourceTileVerification].sort((a,b)=>b.maxChannelError-a.maxChannelError||b.channelsOver1-a.channelsOver1)[0];
        const diagnostic=await js(`window.tileSourceDiagnostic(${JSON.stringify(worst.key)})`);
        for(const [name,file]of [['sourceCanvasPNG','source-canvas.png'],['storedPNG','stored-source.png']]){fs.writeFileSync(path.join(out,file),Buffer.from(diagnostic[name].split(',')[1],'base64'));delete diagnostic[name];}
        result.sourceDiagnostic=diagnostic;
      }
      save();assert(sourcesPass,'A tile source raster lost exact native pixels');
      result.errors=await js('window.tileErrors');assert(result.errors.length===0,'The native tile fixture reported a renderer error');
      await js('window.tileFixture.dispose();window.__staticArt.enable(false)');
      result.cleanup=await js('window.__staticArt.stats()');assert(result.cleanup.bytes===0&&result.cleanup.rasterBytes===0&&result.cleanup.surfaces===0,'Tile teardown retained image ownership');
      const nativePass=row=>row.meanAbsoluteChannelError<=1.25&&row.pixelsOver12Fraction<=.02&&row.flatViolations===0;
      const controlPass=row=>row.flatViolations===0&&row.hullViolations===0;
      result.controlAcceptance=[...result.samples,...(partial?[partial]:[]),themed].every(row=>nativePass(row)&&nativePass(row.continuous.native)&&controlPass(row.continuous.tiles));
      assert(result.controlAcceptance,'Native raw/RGB-flat agreement or strict same-source continuous-control semantics failed');
      result.passed=!sourceOnly;save();console.log(sourceOnly?'Static source-only checks passed (full suite not run):':'Static tile native checks passed:',out);win.destroy();app.quit();
    }catch(error){result.error=String(error);save();console.error(error);win.destroy();app.exit(1);}
  });
}
