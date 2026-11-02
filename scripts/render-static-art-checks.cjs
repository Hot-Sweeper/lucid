const fs=require('node:fs'),path=require('node:path');
module.exports=async({js,wc,wait,out})=>{
  const result={},assert=(ok,message)=>{if(!ok)throw Error(message)};
  const sharpBucket=c=>{
    if(c.density<c.expectedDensity*(1-1e-9))return false;
    if(c.density<=c.expectedDensity*2**.25*(1+1e-9))return true;
    // A covered retained LOD remains fully sharp on zoom-out. Its fixed guarded
    // backings and source pixels are still checked by the surrounding assertion.
    return c.visibleTiles>0&&c.readyTiles===c.visibleTiles&&c.verifiedTiles>=c.visibleTiles;
  };
  const until=async(code)=>{for(let i=0;i<80;i++){if(await js(code))return;await wait(100)}throw Error('Static artwork cache did not become ready')};
  try{
    await js(`{const w=window.__world,d=w.desks.get('perf-t0')||w.desks.values().next().value;window.__cacheDesk=d;w.stopFollow();w.cam={s:2,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*2,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*2};w.apply()}`);
    await until(`window.__staticArt?.stats().cached>0&&window.__staticArt.stats().pending===0`);
    result.close=await js(`window.__staticArt.verify()`);
    assert(result.close.length&&result.close.every(c=>c.bounded&&c.channelsOver1===0&&sharpBucket(c)),'Close-up static cache lost source pixels, density or viewport bounds');
    result.liveNodes=await js(`{const d=window.__cacheDesk;({keys:!!d.el.querySelector('.keys'),mouse:!!d.el.querySelector('[data-d="mouse"]'),mug:!!d.el.querySelector('[data-d="mug"]'),steam:!!d.el.querySelector('.mug-steam'),phone:!!d.el.querySelector('[data-d="phone"]'),clock:!!document.querySelector('.clock-m'),labels:!!document.querySelector('.room-name')})}`);
    assert(Object.values(result.liveNodes).every(Boolean),'A live key, prop, clock or project label was detached into static artwork');
    fs.writeFileSync(path.join(out,'static-art-close.png'),(await wc.capturePage()).toPNG());
    await js(`window.__staticArt.enable(false)`);
    result.fallback=await js(`({stats:window.__staticArt.stats(),vectors:!!window.__cacheDesk.el.querySelector('.desk-table use')})`);
    assert(result.fallback.stats.cached===0&&result.fallback.vectors,'Disabling or renewing the cache did not restore original native vectors');
    fs.writeFileSync(path.join(out,'static-art-native.png'),(await wc.capturePage()).toPNG());
    await js(`window.__staticArt.enable(true)`);
    await until(`window.__staticArt.stats().cached>0&&window.__staticArt.stats().pending===0`);
    await js(`{const w=window.__world,d=window.__cacheDesk;w.cam={s:3.932,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*3.932,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*3.932};w.apply()}`);
    result.zoomFallback=await js(`({cached:window.__staticArt.stats().cached,native:!!window.__cacheDesk.el.querySelector('.desk-table use')})`);
    assert(result.zoomFallback.cached===0&&result.zoomFallback.native,'Changing density displayed a blurry old bitmap instead of native vectors');
    await until(`window.__staticArt.stats().cached>0&&window.__staticArt.stats().pending===0`);
    result.sharp=await js(`window.__staticArt.verify()`);
    assert(result.sharp.length&&result.sharp.every(c=>c.bounded&&c.channelsOver1===0&&sharpBucket(c)),'Settled 3.932x artwork is not bounded and fully sharp');
    fs.writeFileSync(path.join(out,'static-art-sharp.png'),(await wc.capturePage()).toPNG());
    result.failureInput=await js(`{const w=window.__world,dpr=devicePixelRatio||1,retainedDensity=Math.max(w.cam.s*dpr,...[...document.querySelectorAll('[data-static-art][data-cached="1"]')].map(el=>Number(el.dataset.density)||0));window.__cacheFailureCam={x:w.cam.x,y:w.cam.y,s:w.cam.s};window.__cacheImage=window.Image;window.__cacheDecodeAttempts=0;window.Image=function(...args){window.__cacheDecodeAttempts++;const image=new window.__cacheImage(...args);image.decode=async()=>{throw Error('Static cache fixture decode failure')};return image};w.cam.s=retainedDensity/dpr*1.001;w.apply();({retainedDensity,requiredDensity:w.cam.s*dpr})}`);
    assert(result.failureInput.requiredDensity>result.failureInput.retainedDensity,'Decode failure fixture did not cross the retained density bucket');
    await wait(450);await until(`window.__staticArt.stats().pending===0`);
    const first=await js(`window.__cacheDecodeAttempts`);await wait(900);
    result.failure=await js(`({attempts:window.__cacheDecodeAttempts,cached:window.__staticArt.stats().cached,native:!!window.__cacheDesk.el.querySelector('.desk-table use')})`);
    assert(first>0&&result.failure.attempts===first&&result.failure.cached===0&&result.failure.native,'A failed cache decode retried continuously or removed the native fallback');
    await js(`{window.Image=window.__cacheImage;delete window.__cacheImage;const w=window.__world;Object.assign(w.cam,window.__cacheFailureCam);delete window.__cacheFailureCam;w.apply()}`);
    await until(`window.__staticArt.stats().cached>0`);
    result.stats=await js(`window.__staticArt.stats()`);result.passed=true;
  }catch(error){result.error=String(error);throw error}
  finally{await js(`{if(window.__cacheImage){window.Image=window.__cacheImage;delete window.__cacheImage}if(window.__cacheFailureCam){Object.assign(window.__world.cam,window.__cacheFailureCam);delete window.__cacheFailureCam;window.__world.apply()}window.__staticArt?.enable(true)}`).catch(()=>{});fs.writeFileSync(path.join(out,'static-art-checks.json'),JSON.stringify(result,null,2))}
  console.log('staticArtChecks',JSON.stringify(result));
};
