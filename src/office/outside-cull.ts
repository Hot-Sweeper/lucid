// Skip only provably invisible generated paths. A visible compound path always
// keeps its complete original d, including contours outside the viewport.
export type CullRect = { x: number; y: number; w: number; h: number };
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
type CullGeometry = { matrix:Matrix; bounds:CullRect[]|null; count:number; hole:ReturnType<typeof prepareFadeHole>|ReturnType<typeof prepareHedgeHole> };
type SourceEntry = CullGeometry & { start:number; end:number };
const finiteRect = (r: CullRect) => [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
const numberPattern = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
const numberRE = new RegExp('^'+numberPattern+'$');
const close = (a: number,b: number) => Math.abs(a-b) <= 1e-8 * Math.max(1,Math.abs(a),Math.abs(b));
function tokens(d: string): (string|number)[] | null {
  const re = new RegExp('[a-zA-Z]|'+numberPattern,'g');
  if (d.replace(re,'').replace(/[\s,]/g,'')) return null;
  return (d.match(re) ?? []).map(v=>numberRE.test(v)?Number(v):v);
}
const overlaps = (a: CullRect,b: CullRect) => a.x <= b.x+b.w && a.x+a.w >= b.x && a.y <= b.y+b.h && a.y+a.h >= b.y;
const expanded = (r: CullRect,pad: number) => ({x:r.x-pad,y:r.y-pad,w:r.w+2*pad,h:r.h+2*pad});
const union = (a:CullRect,b:CullRect) => ({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)});

// Bounds of the full ellipse containing an SVG arc. This deliberately includes
// more than the arc, including radii correction for rounded generated endpoints.
function arcBounds(x0:number,y0:number,rx:number,ry:number,angle:number,dx:number,dy:number):CullRect|null {
  if (!(rx>0&&ry>0) || !(dx||dy)) return null;
  const phi=angle*Math.PI/180,c=Math.cos(phi),s=Math.sin(phi);
  const xp=(-c*dx-s*dy)/2,yp=(s*dx-c*dy)/2;
  const correction=Math.sqrt(Math.max(1,xp*xp/(rx*rx)+yp*yp/(ry*ry)));
  rx*=correction;ry*=correction;
  const divisor=rx*rx*yp*yp+ry*ry*xp*xp;
  if (!(divisor>0)) return null;
  // Generated arcs have large-arc=1, sweep=0, so the center sign is positive.
  const k=Math.sqrt(Math.max(0,(rx*rx*ry*ry-divisor)/divisor));
  const cxp=k*rx*yp/ry,cyp=-k*ry*xp/rx;
  const cx=c*cxp-s*cyp+x0+dx/2,cy=s*cxp+c*cyp+y0+dy/2;
  const ex=Math.hypot(rx*c,ry*s),ey=Math.hypot(rx*s,ry*c);
  const out={x:cx-ex,y:cy-ey,w:2*ex,h:2*ey};
  return finiteRect(out)?expanded(out,1e-6):null;
}

export function prepareArcContours(original:string) {
  const starts=[...original.matchAll(/M/g)].map(m=>m.index!);
  if (!starts.length || original.slice(0,starts[0]).trim()) return null;
  const contours:{source:string;bounds:CullRect}[]=[];
  for(let n=0;n<starts.length;n++) {
    const source=original.slice(starts[n],starts[n+1]??original.length),t=tokens(source);
    // M x y a rx ry rotation 1 0 dx dy a rx ry rotation 1 0 -dx -dy
    if(!t||t.length!==19||t[0]!=='M'||t[3]!=='a'||t[11]!=='a')return null;
    const values=t.filter(v=>typeof v==='number') as number[];
    if(values.length!==16||!values.every(Number.isFinite)||t[7]!==1||t[8]!==0||t[15]!==1||t[16]!==0)return null;
    const x=t[1] as number,y=t[2] as number,rx=t[4] as number,ry=t[5] as number,angle=t[6] as number,dx=t[9] as number,dy=t[10] as number;
    if(!close(rx,t[12] as number)||!close(ry,t[13] as number)||!close(angle,t[14] as number)||!close(dx,-(t[17] as number))||!close(dy,-(t[18] as number)))return null;
    const a=arcBounds(x,y,rx,ry,angle,dx,dy),b=arcBounds(x+dx,y+dy,rx,ry,angle,-dx,-dy);
    if(!a||!b)return null;
    contours.push({source,bounds:union(a,b)});
  }
  return {original,contours};
}

function roundedRect(t:(string|number)[],start=0) {
  let i=start;
  const command=(name:string)=>{if(t[i++]!==name)throw 0;};
  const value=()=>{const v=t[i++];if(typeof v!=='number'||!Number.isFinite(v))throw 0;return v;};
  try {
    command('M');const mx=value(),y=value();command('H');const hx=value();
    command('A');const r=value(),ry=value();if(!(r>0)||!close(r,ry))return null;
    if(value()!==0||value()!==0||value()!==1)return null;
    const right=value(),ay=value(),x=mx-r;command('V');const vy=value();
    const arc=(ex:number,ey:number)=>{command('A');if(!close(value(),r)||!close(value(),r)||value()!==0||value()!==0||value()!==1||!close(value(),ex)||!close(value(),ey))throw 0;};
    const bottom=vy+r;
    arc(right-r,bottom);command('H');if(!close(value(),mx))return null;
    arc(x,bottom-r);command('V');if(!close(value(),y+r))return null;
    arc(mx,y);command('Z');
    if(!close(hx,right-r)||!close(ay,y+r)||right-x<2*r||bottom-y<2*r)return null;
    return {x,y,w:right-x,h:bottom-y,r,end:i};
  }catch{return null;}
}
const insideRect=(inner:CullRect,outer:CullRect)=>inner.x>outer.x&&inner.y>outer.y&&inner.x+inner.w<outer.x+outer.w&&inner.y+inner.h<outer.y+outer.h;
function insideRounded(view:CullRect,round:CullRect&{r:number}) {
  if(!insideRect(view,round))return false;
  for(const x of [view.x,view.x+view.w])for(const y of [view.y,view.y+view.h]) {
    const cx=Math.max(round.x+round.r,Math.min(round.x+round.w-round.r,x));
    const cy=Math.max(round.y+round.r,Math.min(round.y+round.h-round.r,y));
    if((x-cx)**2+(y-cy)**2>=round.r**2)return false;
  }
  return true;
}
export function prepareFadeHole(original:string,fillRule:string) {
  if(fillRule!=='evenodd')return null;
  const t=tokens(original);if(!t||t[0]!=='M'||t[3]!=='h'||t[5]!=='v'||t[7]!=='h'||t[9]!=='Z')return null;
  const x=t[1] as number,y=t[2] as number,w=t[4] as number,h=t[6] as number;
  if(![x,y,w,h,t[8]].every(v=>typeof v==='number'&&Number.isFinite(v))||!(w>0&&h>0)||!close(t[8] as number,-w))return null;
  const hole=roundedRect(t,10);
  if(!hole||hole.end!==t.length||hole.x<x||hole.y<y||hole.x+hole.w>x+w||hole.y+hole.h>y+h)return null;
  return {original,hole,hidden(view:CullRect,padding=0){return finiteRect(view)&&Number.isFinite(padding)&&padding>=0&&insideRounded(expanded(view,padding),hole);}};
}
export function prepareHedgeHole(original:string,fill:string,strokeWidth:number) {
  if(fill!=='none'||!(strokeWidth>0)||!Number.isFinite(strokeWidth))return null;
  const t=tokens(original),box=t&&roundedRect(t);
  if(!box||box.end!==t!.length)return null;
  const inset=box.r+strokeWidth/2;
  const hole={x:box.x+inset,y:box.y+inset,w:box.w-2*inset,h:box.h-2*inset};
  if(!finiteRect(hole))return null;
  return {original,hole,hidden(view:CullRect,padding=0){return finiteRect(view)&&Number.isFinite(padding)&&padding>=0&&insideRect(expanded(view,padding),hole);}};
}

function inverse(m:Matrix):Matrix|null {
  const det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-15)return null;
  const result={a:m.d/det,b:-m.b/det,c:-m.c/det,d:m.a/det,e:(m.c*m.f-m.d*m.e)/det,f:(m.b*m.e-m.a*m.f)/det};
  return Object.values(result).every(Number.isFinite)?result:null;
}
function mapped(view:CullRect,m:Matrix):CullRect {
  const x0=m.a*view.x+m.c*view.y+m.e,y0=m.b*view.x+m.d*view.y+m.f;
  const ax=m.a*view.w,ay=m.b*view.w,bx=m.c*view.h,by=m.d*view.h;
  const x=Math.min(x0,x0+ax,x0+bx,x0+ax+bx),y=Math.min(y0,y0+ay,y0+by,y0+ay+by);
  return{x,y,w:Math.max(x0,x0+ax,x0+bx,x0+ax+bx)-x,h:Math.max(y0,y0+ay,y0+by,y0+ay+by)-y};
}

const identity=():Matrix=>({a:1,b:0,c:0,d:1,e:0,f:0});
const multiply=(a:Matrix,b:Matrix):Matrix=>({a:a.a*b.a+a.c*b.b,b:a.b*b.a+a.d*b.b,c:a.a*b.c+a.c*b.d,d:a.b*b.c+a.d*b.d,e:a.a*b.e+a.c*b.f+a.e,f:a.b*b.e+a.d*b.f+a.f});
/** The static artwork uses only these SVG transforms. Unknown syntax leaves
 * the complete path drawable rather than guessing its screen position. */
export function outsideTransform(value:string):Matrix|null {
  let result=identity(),end=0;
  const re=/([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for(const match of value.matchAll(re)) {
    if(value.slice(end,match.index).replace(/[\s,]/g,''))return null;end=match.index!+match[0].length;
    const args=tokens(match[2]);if(!args||args.some(v=>typeof v!=='number'||!Number.isFinite(v)))return null;
    const n=args as number[];let next:Matrix;
    if(match[1]==='matrix'&&n.length===6)next={a:n[0],b:n[1],c:n[2],d:n[3],e:n[4],f:n[5]};
    else if(match[1]==='translate'&&(n.length===1||n.length===2))next={...identity(),e:n[0],f:n[1]??0};
    else if(match[1]==='scale'&&(n.length===1||n.length===2))next={...identity(),a:n[0],d:n[1]??n[0]};
    else if(match[1]==='rotate'&&(n.length===1||n.length===3)) {
      const angle=n[0]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=n[1]??0,y=n[2]??0;
      next={a:c,b:s,c:-s,d:c,e:x-c*x+s*y,f:y-s*x-c*y};
    }else return null;
    result=multiply(result,next);
  }
  return value.slice(end).trim()||!Object.values(result).every(Number.isFinite)?null:result;
}

/** view is the actual visible viewport in the original SVG coordinates. The
 * owner updates every camera paint, including pans inside a retained crop.
 * Transform attributes are immutable, so no layout/CTM reads enter that loop. */
export function mountNativeContourCull(svg:SVGSVGElement,container:Element=svg.querySelector('[data-outside-source]')??svg) {
  const records:{node:SVGPathElement;original:string;hidden:boolean;matrix:Matrix;bounds:CullRect[]|null;count:number;hole:ReturnType<typeof prepareFadeHole>|ReturnType<typeof prepareHedgeHole>}[]=[];
  const transforms=new Map<Element,Matrix|null>(),styles=new Map<Element,CSSStyleDeclaration>();
  const transform=(element:Element):Matrix|null=>{
    if(transforms.has(element))return transforms.get(element)!;
    let result:Matrix|null=null;
    try {
      const style=getComputedStyle(element);styles.set(element,style);
      // Filters can extend beyond geometry; CSS animation/transforms can change
      // immutable bounds. Leave those elements and their descendants native.
      if((style.filter&&style.filter!=='none')||(style.animationName&&style.animationName!=='none'))throw 0;
      if(element===svg)result=identity();
      else {
        if(element.localName==='svg')throw 0; // A nested viewBox changes coordinates.
        const own=outsideTransform(element.getAttribute('transform')??'');if(!own)throw 0;
        if(style.transform&&style.transform!=='none') {
          const computed=outsideTransform(style.transform);if(!computed)throw 0;
          if((Object.keys(own) as (keyof Matrix)[]).some(k=>Math.abs(own[k]-computed[k])>1e-5*Math.max(1,Math.abs(own[k]))))throw 0;
          if(style.transformOrigin&&style.transformOrigin.split(/\s+/).some(v=>parseFloat(v)!==0))throw 0;
        }
        const parent=element.parentElement&&transform(element.parentElement);if(!parent)throw 0;
        result=multiply(parent,own);
      }
    }catch{result=null;}
    transforms.set(element,result);return result;
  };
  for(const node of container.querySelectorAll<SVGPathElement>('path')) {
    if(node.closest('defs,clipPath,mask,filter'))continue;
    const matrix=transform(node),style=styles.get(node);if(!matrix||!style)continue;
    if([style.markerStart,style.markerMid,style.markerEnd].some(value=>value&&value!=='none'))continue;
    const original=node.getAttribute('d')??'',stroke=style.stroke||node.getAttribute('stroke')||'none',width=parseFloat(style.strokeWidth||node.getAttribute('stroke-width')||'1');
    const arcs=stroke==='none'?prepareArcContours(original):null;
    const hole=(stroke==='none'?prepareFadeHole(original,style.fillRule||node.getAttribute('fill-rule')||''):null)
      ??(stroke!=='none'&&(!style.vectorEffect||style.vectorEffect==='none')?prepareHedgeHole(original,style.fill||node.getAttribute('fill')||'',width):null);
    if(!arcs&&!hole)continue;
    const back=inverse(matrix);if(!back)continue;
    const bounds=arcs?arcs.contours.map(c=>mapped(c.bounds,matrix)):null;
    if(bounds?.some(bound=>!finiteRect(bound)))continue;
    records.push({node,original,hidden:false,matrix:back,bounds,count:arcs?.contours.length??(original.match(/M/g)??[]).length,hole});
  }
  transforms.clear();styles.clear();
  let dead=false;
  const restore=()=>{for(const r of records)if(r.hidden){r.node.setAttribute('d',r.original);r.hidden=false;}};
  return {stats:{paths:records.length,arcPaths:records.filter(r=>r.bounds).length,holes:records.filter(r=>r.hole).length},
    prepareSource(canonical:string) {
      // Map canonical path attribute spans once, never serialize the currently
      // culled native DOM. A mismatch disables source culling for this owner.
      const nodes=[...svg.querySelectorAll<SVGPathElement>('path')];
      const tags=[...canonical.matchAll(/<path\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)];
      const byNode=new Map(records.map(record=>[record.node,record]));
      const entries:SourceEntry[]=[];
      if(nodes.length!==tags.length)return makeRasterSource(canonical,[],false);
      for(let i=0;i<tags.length;i++) {
        const tag=tags[i],attr=/\sd\s*=\s*("[^"]*"|'[^']*')/.exec(tag[0]);
        const value=attr?attr[1].slice(1,-1):'';
        // Generated numeric path values contain no XML entities. Refuse an
        // ambiguous raw/DOM mapping instead of modifying a different attribute.
        if(value!==(nodes[i].getAttribute('d')??''))return makeRasterSource(canonical,[],false);
        const record=byNode.get(nodes[i]);if(!record||!attr)continue;
        const start=tag.index!+attr.index+attr[0].length-attr[1].length+1;
        entries.push({start,end:start+value.length,matrix:record.matrix,bounds:record.bounds,count:record.count,hole:record.hole});
      }
      return makeRasterSource(canonical,entries,true);
    },
    update(view:CullRect,density:number){
      if(dead)return{changed:0,hidden:0,contours:0};
      if(!finiteRect(view)||!(density>0)||!Number.isFinite(density)){restore();return{changed:0,hidden:0,contours:0};}
      const guarded=expanded(view,2/density);let changed=0,hidden=0,contours=0;
      for(const r of records){
        // Do not shorten a partially visible compound path. That changes Skia's
        // tessellation/antialiasing even when the omitted contours are outside.
        const skip=r.bounds?!r.bounds.some(bounds=>overlaps(bounds,guarded)):!!r.hole?.hidden(mapped(guarded,r.matrix));
        if(skip!==r.hidden){r.node.setAttribute('d',skip?'':r.original);r.hidden=skip;changed++;}
        if(skip)hidden++;else contours+=r.count;
      }
      return{changed,hidden,contours};
    },restore,destroy(){restore();dead=true;records.length=0;}};
}

function makeRasterSource(canonical:string,entries:SourceEntry[],matched:boolean) {
  // One canonical source and O(original contours) numeric bounds are retained.
  // Each result is transient and no larger than the original source. No DOM,
  // output cache, canvas, decoder or timer belongs to this preparation object.
  const stats={matched,paths:entries.length,contours:entries.reduce((sum,e)=>sum+e.count,0),sourceBytes:canonical.length};
  let dead=false;
  return {stats,
    sourceFor(view:CullRect,density:number) {
      if(dead)throw new Error('Outdoor raster source owner was destroyed');
      if(!finiteRect(view)||!(density>0)||!Number.isFinite(density))return{svg:canonical,hiddenPaths:0,removedContours:0,removedBytes:0};
      const guarded=expanded(view,2/density),pieces:string[]=[];
      let cursor=0,hiddenPaths=0,removedContours=0,removedBytes=0;
      for(const entry of entries) {
        const skip=entry.bounds?!entry.bounds.some(bounds=>overlaps(bounds,guarded)):!!entry.hole?.hidden(mapped(guarded,entry.matrix));
        if(!skip)continue;
        pieces.push(canonical.slice(cursor,entry.start));cursor=entry.end;
        hiddenPaths++;removedContours+=entry.count;removedBytes+=entry.end-entry.start;
      }
      if(!hiddenPaths)return{svg:canonical,hiddenPaths,removedContours,removedBytes};
      pieces.push(canonical.slice(cursor));
      return{svg:pieces.join(''),hiddenPaths,removedContours,removedBytes};
    },
    destroy(){dead=true;canonical='';entries.length=0;}
  };
}
