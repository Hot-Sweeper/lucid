type Rect = { x: number; y: number; w: number; h: number };
export type ForestTree = { x: number; y: number; r: number; seed: number };
/** Sparse inner grove and a continuous outer belt, with all crowns clear of work and routes. */
export function forestPlan(areas: Rect[], routes: Rect[] = []) {
  if (!areas.length) return { trees: [] as ForestTree[], bounds: { x: 0, y: 0, w: 0, h: 0 } };
  const left = Math.min(...areas.map(r=>r.x)), top = Math.min(...areas.map(r=>r.y));
  const right = Math.max(...areas.map(r=>r.x+r.w)), bottom = Math.max(...areas.map(r=>r.y+r.h));
  const bounds = { x: left-780, y: top-780, w: right-left+1560, h: bottom-top+1560 };
  const trees: ForestTree[] = [], occupied = new Set<string>();
  const blocked = [...areas, ...routes];
  const add = (x:number,y:number) => {
    const raw = Math.abs(Math.round(x*73+y*137));
    const seed = ((Math.imul(raw ^ (raw>>>16),73244475)>>>0)%100000)+3001;
    x += (seed%161)-80; y += ((seed>>>6)%161)-80;
    const r = 96 + seed%55;
    const key = `${Math.round(x/100)}:${Math.round(y/100)}`;
    if (occupied.has(key) || trees.length >= 384) return;
    if (blocked.some(b=>x+r+45>b.x && x-r-45<b.x+b.w && y+r+45>b.y && y-r-45<b.y+b.h)) return;
    if (trees.some(t=>Math.hypot(t.x-x,t.y-y)<145)) return;
    occupied.add(key);trees.push({x,y,r,seed});
  };
  const ring = (r:Rect, distance:number, step:number) => {
    const x0=r.x-distance,y0=r.y-distance,x1=r.x+r.w+distance,y1=r.y+r.h+distance;
    const nx=Math.max(1,Math.ceil((x1-x0)/step)),ny=Math.max(1,Math.ceil((y1-y0)/step));
    // A scalloped woodland edge, rather than straight rows of identical trees.
    const bend=(v:number)=>65+Math.sin(v*.0031)*43+Math.sin(v*.0073)*22;
    for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx;add(x,y0+bend(x));add(x,y1-bend(x+730));}
    for(let i=1;i<ny;i++){const y=y0+(y1-y0)*i/ny;add(x0+bend(y+340),y);add(x1-bend(y+910),y);}
  };
  const campus={x:left,y:top,w:right-left,h:bottom-top};
  const perimeter=2*(campus.w+campus.h);
  const spacing=Math.max(210,perimeter/190);
  ring(campus,460,spacing);ring(campus,255,spacing);
  for(const area of areas)ring(area,220,Math.max(280,perimeter/100));
  return { trees, bounds };
}
