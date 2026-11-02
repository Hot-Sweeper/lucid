// Root-owned Electron harness calls this after loading its isolated renderer.
// Compare the actual batched vector paths to the previous rectangle artwork at
// multiple camera densities. This catches seam positions, checker parity,
// circular corners and alpha overlap changes without a screenshot baseline.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({js,out}) => {
  const {stripTypeScriptTypes} = require('node:module');
  const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../src/perf/floor-paths.ts'),'utf8')).replace(/^import .*$/gm,'').replace(/export /g,'');
  const lazy = await js(`(async()=>{
    const desk=[...window.__world.allDesks].find(d=>!d.threadId);
    if(!desk)throw Error('Lazy robot runtime check requires one free desk');
    const original=desk.robot,host=desk.el.querySelector('.robot-host');
    const sample=()=>({rigs:host.querySelectorAll('.world-seated').length,thumbs:desk.el.querySelectorAll('.world-thumb').length,mounted:desk.robot.mounted,stable:desk.wm.robot===original});
    const before=sample();
    try{
      const thread={id:'renderer-lazy-fixture',title:'Renderer lazy fixture',provider:'codex',model:'gpt-6.1-sol'};
      desk.assign(thread);const assigned=sample();desk.assign(thread);const repeated=sample();
      const keyBase=desk.el.querySelectorAll('.keys > .key').length;
      desk.pressKey('a');desk.pressKey('a');desk.pressKey('Enter');
      const keyPresses={base:keyBase,active:desk.el.querySelectorAll('.keys > [data-key]').length,keys:[...desk.el.querySelectorAll('.keys > [data-key]')].map(e=>e.dataset.key)};
      const phone=desk.robot.holdPhone(true);desk.assign(null);
      const cancelled=await Promise.race([phone.then(()=>true),new Promise(r=>setTimeout(()=>r(false),1500))]);
      const released=sample();desk.assign({...thread,id:'renderer-lazy-fixture-2'});const reassigned=sample();
      return {before,assigned,repeated,released,reassigned,cancelled,keyPresses,keysCleared:!desk.el.querySelector('.keys > [data-key]')};
    }finally{desk.assign(null)}
  })()`);
  fs.writeFileSync(path.join(out,'lazy-robot-checks.json'),JSON.stringify(lazy,null,2));
  if(!lazy.cancelled||!lazy.keysCleared||lazy.keyPresses.base!==1||lazy.keyPresses.active!==2||!lazy.keyPresses.keys.includes('a')||!lazy.keyPresses.keys.includes('\n')||lazy.before.rigs||lazy.before.thumbs||lazy.before.mounted||lazy.released.rigs||lazy.released.thumbs||lazy.released.mounted||['assigned','repeated','reassigned'].some(k=>lazy[k].rigs!==1||lazy[k].thumbs!==1||!lazy[k].mounted||!lazy[k].stable))throw Error('Lazy rig or batched keyboard lifecycle failed');
  console.log('lazyRobotChecks',JSON.stringify(lazy));
  const palette = await js(`(async()=>{
    const draw=async(svg)=>{const im=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await im.decode();const c=document.createElement('canvas');c.width=800;c.height=760;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,800,760);return g.getImageData(0,0,800,760).data};
    const d=[...window.__world.desks.values()].find(d=>d.threadId),original=d.robot.el,svg=original.cloneNode(true),style=getComputedStyle(original);
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg');for(let i=0;i<style.length;i++){const name=style[i];if(name.startsWith('--'))svg.style.setProperty(name,style.getPropertyValue(name))}
    const defs=document.querySelector('svg[data-lucid-vectors] defs');if(!defs)throw Error('Shared vector library is absent');svg.prepend(defs.cloneNode(true));
    const legacy=svg.cloneNode(true);let replaced=0;
    for(const use of legacy.querySelectorAll('use[href^="#lucid-static-"]')){const source=legacy.querySelector(use.getAttribute('href'));const g=document.createElementNS('http://www.w3.org/2000/svg','g');for(const a of use.attributes)if(a.name!=='href')g.setAttribute(a.name,a.value);for(const child of source.childNodes)g.appendChild(child.cloneNode(true));use.replaceWith(g);replaced++}
    const [a,b]=await Promise.all([draw(svg),draw(legacy)]);let max=0,changed=0;for(let i=0;i<a.length;i++){const n=Math.abs(a[i]-b[i]);max=Math.max(max,n);if(n>2)changed++}
    return {replaced,maxChannelError:max,channelsOver2:changed};
  })()`);
  fs.writeFileSync(path.join(out,'shared-vector-palette-checks.json'),JSON.stringify(palette,null,2));
  if(palette.replaced<2||palette.channelsOver2)throw Error('Shared static robot vectors changed inherited palette or native geometry');
  const result = await js(`(async()=>{
    ${source}
    const legacyWood=(w,h,top,seam)=>Array.from({length:Math.ceil((h-top)/26)},(_,i)=>{const y=top+i*26,off=i*97%180;return '<rect x="0" y="'+(y+25)+'" width="'+w+'" height="1.2" fill="'+seam+'" opacity="0.55"/>'+Array.from({length:Math.ceil(w/180)+1},(_,k)=>'<rect x="'+(k*180-off)+'" y="'+y+'" width="1.2" height="25" fill="'+seam+'" opacity="0.5"/>').join('')}).join('');
    const legacyTiles=(w,h,top,floor,seam)=>Array.from({length:Math.ceil(w/48)*Math.ceil(h/48)},(_,i)=>{const cols=Math.ceil(w/48);return '<rect x="'+(i%cols*48+1)+'" y="'+(top+Math.floor(i/cols)*48+1)+'" width="46" height="46" rx="3" fill="'+((i+Math.floor(i/cols))%2?floor:seam)+'" opacity="0.9"/>'}).join('');
    const paint=async(markup,w,h,density)=>{const im=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+Math.ceil(w*density)+'" height="'+Math.ceil(h*density)+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="#c9a274"/>'+markup+'</svg>');await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data};
    const rows=[];
    for(const kind of ['wood','tiles','keyboard'])for(const [w,h] of (kind==='keyboard'?[[400,380]]:[[420,480],[1450,980]]))for(const density of [.23,.65,1.5,3]){
      const keyRects=Array.from({length:48},(_,i)=>({x:Number((147.2+i%12*9).toFixed(1)),y:Number((210.8+Math.floor(i/12)*5.5).toFixed(1)),w:6.6,h:3.9,r:1.6}));keyRects.push({x:173,y:232.6,w:54,h:5,r:2});
      const before=kind==='wood'?legacyWood(w,h,90,'#ab8660'):kind==='tiles'?legacyTiles(w,h,90,'#c98a6a','#b8775a'):keyRects.map(k=>'<rect x="'+k.x+'" y="'+k.y+'" width="'+k.w+'" height="'+k.h+'" rx="'+k.r+'" fill="#5a6177"/>').join('');
      const symbol='<defs><g id="fixture-shared">'+before+'</g></defs><use href="#fixture-shared"/>';
      const after=kind==='wood'?plankJoints(w,h,90,'#ab8660'):kind==='tiles'?cafeTiles(w,h,90,'#c98a6a','#b8775a'):symbol;
      const [a,b,s]=await Promise.all([paint(before,w,h,density),paint(after,w,h,density),paint(symbol,w,h,density)]);let max=0,changed=0,sum=0,symbolMax=0,symbolChanged=0;
      for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;if(d>2)changed++}
      for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-s[i]);symbolMax=Math.max(symbolMax,d);if(d>2)symbolChanged++}
      rows.push({kind,w,h,density,sourceElements:(before.match(/<rect/g)||[]).length,instanceElements:1,maxChannelError:max,channelsOver2:changed,meanChannelError:sum/a.length,symbolMaxChannelError:symbolMax,symbolChannelsOver2:symbolChanged});
    }
    return rows;
  })()`);
  fs.writeFileSync(path.join(out,'floor-pixel-checks.json'),JSON.stringify(result,null,2));
  if(result.some(r=>r.channelsOver2!==0||r.symbolChannelsOver2!==0))throw Error('Production static geometry changed rasterized artwork beyond two channel levels');
  console.log('floorPixelChecks',JSON.stringify(result));
};
