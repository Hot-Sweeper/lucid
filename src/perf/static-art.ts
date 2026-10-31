// Only immutable artwork is rasterized here. Live windows, signs, clocks, plants,
// keys, desk props and actors keep their original SVG/HTML nodes and paint order.
// Each bitmap covers at most a viewport plus overscan at the actual camera×DPR.
const NS = "http://www.w3.org/2000/svg";
type Camera = { x: number; y: number; s: number };
type Rect = { x: number; y: number; w: number; h: number; density: number };
type Asset = { url: string; width: number; height: number; refs: number; used: number };
const surfaces = new Set<StaticRun>();
const assets = new Map<string, Asset>();
const pending = new Map<string, { promise:Promise<Asset|null>;consumers:Set<()=>boolean> }>();
const measurements=new Set<StaticRun>();let measureQueued=false;
let queue = Promise.resolve(), camera: Camera = { x: 0, y: 0, s: 1 }, viewport = { w: 0, h: 0 }, enabled = true;
const MAX_BYTES = 64 * 1024 * 1024, OVERSCAN = 256, SETTLE = 120;

function trimAssets() {
  let bytes = [...assets.values()].reduce((sum, a) => sum + a.width * a.height * 4, 0);
  for (const [key, a] of [...assets].sort((a, b) => a[1].used - b[1].used)) {
    if (bytes <= MAX_BYTES && assets.size <= 64) break;
    if (a.refs) continue;
    URL.revokeObjectURL(a.url); assets.delete(key); bytes -= a.width * a.height * 4;
  }
}

function raster(source: string, crop: Rect, valid:()=>boolean): Promise<Asset | null> {
  const width = Math.max(1, Math.ceil(crop.w * crop.density)), height = Math.max(1, Math.ceil(crop.h * crop.density));
  const key = `${crop.x},${crop.y},${crop.w},${crop.h},${crop.density}|${source}`;
  const hit = assets.get(key);
  if (hit) { hit.used = performance.now(); return Promise.resolve(hit); }
  const flying = pending.get(key); if (flying) {flying.consumers.add(valid);return flying.promise}
  const consumers=new Set([valid]),needed=()=>enabled&&[...consumers].some(check=>check());
  const job = queue.then(async () => {
    if(!needed())return null;
    const svg = `<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none">${source}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if(!needed())return null;
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      canvas.width = canvas.height = 0;
      if (!blob) return null;
      if(!needed())return null;
      const png = URL.createObjectURL(blob), decoded = new Image(); decoded.src = png;
      try { await decoded.decode(); } catch { URL.revokeObjectURL(png); return null; }
      if(!needed()){URL.revokeObjectURL(png);return null}
      const asset = { url: png, width, height, refs: 0, used: performance.now() };
      assets.set(key, asset);
      return asset;
    } catch { return null; }
    finally { URL.revokeObjectURL(url); }
  });
  pending.set(key,{promise:job,consumers});
  queue = job.then(() => {}, () => {});
  void job.finally(() => { pending.delete(key); queueMicrotask(trimAssets); });
  return job;
}

const liveSelector = "[data-cache-live],text,foreignObject,image,.keys,.empty-chair,[data-d],[data-b],[data-r],[data-sway],[data-spin],[class*='amb-'],[class*='clock-'],[class*='dc-'],[style*='animation'],[style*='var(--lamp'],[style*='var(--stars'],[style*='var(--frost']";
function live(node: Element) {
  // Furniture games use several different data-* binding namespaces. Treat all
  // bindings as live rather than guessing which private animator will touch them.
  const bound=[node,...node.querySelectorAll("*")].some(el=>[...el.attributes].some(a=>a.name.startsWith("data-")));
  return bound || node.matches(liveSelector) || !!node.querySelector(liveSelector) || /url\(#(?:sky|.*-sky)/.test(node.getAttribute("fill") ?? "");
}
function complexity(node: Element) {
  if (node.localName === "use") {
    const href = node.getAttribute("href");
    return href?.startsWith("#") ? (document.getElementById(href.slice(1))?.querySelectorAll("*").length ?? 0) + 1 : 1;
  }
  return node.querySelectorAll("*").length + 1;
}

function inlineUse(node: Element) {
  for (const use of [...node.querySelectorAll("use")]) {
    const href = use.getAttribute("href"); if (!href?.startsWith("#")) continue;
    const source = document.getElementById(href.slice(1)); if (!source) continue;
    const group = document.createElementNS(NS, "g");
    for (const a of use.attributes) if (a.name !== "href") group.setAttribute(a.name, a.value);
    for (const child of source.childNodes) group.appendChild(child.cloneNode(true));
    use.replaceWith(group); inlineUse(group);
  }
}

class StaticRun {
  readonly holder = document.createElementNS(NS, "g");
  private image = document.createElementNS(NS, "image");
  private originals = document.createDocumentFragment();
  private asset: Asset | null = null;
  private crop: Rect | null = null;
  private request = "";
  private generation = 0;
  private timer = 0;
  private dead = false;
  private showing = false;
  private loading = false;
  private density = 0;
  private failedUntil = 0;
  private ready = false;
  private source = "";
  private dependency = "";
  private dependencies: string[] = [];
  private bounds: { x: number; y: number; w: number; h: number };

  constructor(private svg: SVGSVGElement, private nodes: Element[]) {
    this.holder.dataset.staticArt = "1";
    const vb = svg.viewBox.baseVal;
    this.bounds = { x: vb.x, y: vb.y, w: vb.width || Number(svg.getAttribute("width")), h: vb.height || Number(svg.getAttribute("height")) };
    nodes[0].before(this.holder);
    for (const node of nodes) this.holder.appendChild(node);
    this.image.style.display = "none"; this.image.setAttribute("preserveAspectRatio", "none"); this.holder.appendChild(this.image);
  }

  measure(){
    if(this.dead||!this.svg.isConnected)return;
    const box=this.holder.getBBox({stroke:true,markers:true}),style=getComputedStyle(this.svg),root=this.bounds;
    if(box.width>0&&box.height>0){
      const pad=2,x=box.x-pad,y=box.y-pad,right=box.x+box.width+pad,bottom=box.y+box.height+pad;
      this.bounds=style.overflow==="visible"?{x,y,w:right-x,h:bottom-y}:{x:Math.max(root.x,x),y:Math.max(root.y,y),w:Math.min(root.x+root.w,right)-Math.max(root.x,x),h:Math.min(root.y+root.h,bottom)-Math.max(root.y,y)};
    }
  }
  prepare(){if(this.dead)return;this.serialize();this.ready=true;this.update(true)}

  private serialize() {
    const g = document.createElementNS(NS, "g");
    for (const node of this.nodes) g.appendChild(node.cloneNode(true));
    inlineUse(g);
    const defs = document.createElementNS(NS, "defs"), copied = new Set<string>();
    const references = (root: Element) => {
      const serialized = new XMLSerializer().serializeToString(root);
      for (const match of serialized.matchAll(/url\(#([^)'"\s]+)\)/g)) {
        const id = match[1]; if (copied.has(id)) continue;
        const source = this.svg.querySelector(`[id="${CSS.escape(id)}"]`) ?? document.getElementById(id);
        if (source) { copied.add(id); const clone = source.cloneNode(true) as Element; defs.appendChild(clone); references(clone); }
      }
    };
    references(g);
    const markup = new XMLSerializer().serializeToString(defs) + new XMLSerializer().serializeToString(g);
    this.dependencies = [...new Set([...markup.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
    const style = getComputedStyle(this.svg);
    this.dependency = this.dependencies.map((name) => style.getPropertyValue(name)).join("|");
    const variables = this.dependencies.map((name) => `${name}:${style.getPropertyValue(name)};`).join("");
    this.source = `<g style="${variables.replace(/"/g, "&quot;")}">${markup}</g>`;
  }

  invalidate() {
    if (!this.dependencies.length) return;
    const style = getComputedStyle(this.svg), next = this.dependencies.map((name) => style.getPropertyValue(name)).join("|");
    if (next === this.dependency) return;
    this.generation++; this.request = ""; this.failedUntil = 0;
    this.fallback();
    // Coverage alone does not make an asset current. Keeping the old crop here
    // lets update() immediately re-show stale pixels and skip the replacement job.
    if (this.asset) { this.asset.refs--; this.asset = null; }
    this.crop = null; this.image.removeAttribute("href");
    this.serialize(); this.update(true); trimAssets();
  }

  private position() {
    let x = 0, y = 0;
    for (let el: Element | null = this.svg.parentElement; el && !el.classList.contains("world"); el = el.parentElement) {
      const style = (el as HTMLElement).style; x += parseFloat(style.left) || 0; y += parseFloat(style.top) || 0;
    }
    return { x, y };
  }

  private view(): Rect | null {
    const p = this.position(), b = this.bounds, s = camera.s;
    const x = Math.max(b.x, -camera.x / s - p.x), y = Math.max(b.y, -camera.y / s - p.y);
    const right = Math.min(b.x + b.w, (viewport.w - camera.x) / s - p.x), bottom = Math.min(b.y + b.h, (viewport.h - camera.y) / s - p.y);
    return s > 0 && right > x && bottom > y ? { x, y, w: right - x, h: bottom - y, density: s * (devicePixelRatio || 1) } : null;
  }
  private covers(crop: Rect | null, view: Rect, pad = 0) {
    const b = this.bounds;
    return !!crop && Math.abs(crop.density / view.density - 1) < .001 && crop.x <= Math.max(b.x, view.x - pad) + .01 && crop.y <= Math.max(b.y, view.y - pad) + .01 && crop.x + crop.w >= Math.min(b.x + b.w, view.x + view.w + pad) - .01 && crop.y + crop.h >= Math.min(b.y + b.h, view.y + view.h + pad) - .01;
  }
  private fallback() {
    if (!this.originals.childNodes.length) return;
    this.holder.insertBefore(this.originals, this.image); this.image.style.display = "none"; this.holder.dataset.cached = "0";
    this.showing = false;
  }
  private show() {
    if (!this.asset || !this.crop || this.showing) return;
    for (const node of this.nodes) if (node.parentNode === this.holder) this.originals.appendChild(node);
    const c = this.crop;
    for (const [key, value] of Object.entries({ x: c.x, y: c.y, width: c.w, height: c.h })) this.image.setAttribute(key, String(value));
    this.image.setAttribute("href", this.asset.url); this.image.style.display = "";
    this.holder.dataset.cached = "1"; this.holder.dataset.density = String(c.density);
    this.holder.dataset.pixels = `${this.asset.width}x${this.asset.height}`;
    this.showing = true;
  }

  update(immediate = false) {
    if (this.dead) return;
    if (!this.svg.isConnected) { this.destroy(); return; }
    if(!enabled){this.fallback();return}
    const view = this.view();
    if(!view){this.fallback();if(this.asset){this.asset.refs--;this.asset=null;this.crop=null;trimAssets()}return}
    if(!this.ready){measurements.add(this);if(!measureQueued){measureQueued=true;queueMicrotask(()=>{measureQueued=false;const batch=[...measurements];measurements.clear();for(const surface of batch)surface.measure();for(const surface of batch)surface.prepare()})}return}
    if (this.covers(this.crop, view)) this.show(); else this.fallback();
    if (this.covers(this.crop, view, 64 / camera.s)) return;
    if(this.failedUntil>performance.now())return;
    const scaling = this.density !== view.density; this.density = view.density;
    if (this.loading) return;
    if (this.timer) { if (!scaling) return; clearTimeout(this.timer); }
    const run = () => {
      this.timer = 0;
      const current = this.view(); if (!current || this.dead) return;
      const b = this.bounds, margin = OVERSCAN / camera.s;
      const x = Math.max(b.x, current.x - margin), y = Math.max(b.y, current.y - margin);
      const crop = { x, y, w: Math.min(b.x + b.w, current.x + current.w + margin) - x, h: Math.min(b.y + b.h, current.y + current.h + margin) - y, density: current.density };
      const signature = JSON.stringify(crop); if (signature === this.request) return;
      this.request = signature; this.loading = true; const generation = this.generation;
      void raster(this.source,crop,()=>{const view=this.view();return !this.dead&&enabled&&generation===this.generation&&signature===this.request&&!!view&&this.covers(crop,view)}).then((asset) => {
        if (this.dead || !enabled || generation !== this.generation || signature !== this.request) return;
        const latest = this.view(); if (!latest || !this.covers(crop, latest)) return;
        if(!asset){this.failedUntil=performance.now()+5000;return}
        if (this.asset) this.asset.refs--;
        this.asset = asset; asset.refs++; asset.used = performance.now(); this.crop = crop; this.showing = false; this.show(); trimAssets();
      }).finally(() => { this.loading = false; if (this.request === signature) this.request = ""; queueMicrotask(trimAssets); if (!this.dead) this.update(); });
    };
    this.timer = window.setTimeout(run, immediate ? 0 : SETTLE);
  }

  destroy() {
    if (this.dead) return;
    this.dead = true; this.generation++; clearTimeout(this.timer); this.fallback();
    if (this.asset) this.asset.refs--; this.image.remove(); this.holder.replaceWith(...this.nodes);
    surfaces.delete(this);measurements.delete(this);trimAssets();
  }
  suspend(){this.generation++;clearTimeout(this.timer);this.timer=0;this.request="";this.fallback();if(this.asset){this.asset.refs--;this.asset=null;this.crop=null}this.image.removeAttribute("href")}
  within(root: Element) { return root.contains(this.svg); }
  async verify() {
    if(!this.showing||!this.asset||!this.crop)return null;
    const asset=this.asset,crop={...this.crop},source=this.source;
    const expected=new Image(),actual=new Image();
    const svg=`<svg xmlns="${NS}" width="${asset.width}" height="${asset.height}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none">${source}</svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
    try{
      expected.src=url;actual.src=asset.url;await Promise.all([expected.decode(),actual.decode()]);
      const pixels=(image:HTMLImageElement,background:string)=>{const c=document.createElement("canvas");c.width=asset.width;c.height=asset.height;const ctx=c.getContext("2d")!;ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;c.width=c.height=0;return data};
      let max=0,changed=0;for(const background of ["#ffffff","#141a33"]){const a=pixels(expected,background),b=pixels(actual,background);for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);if(d>1)changed++}}
      return {width:asset.width,height:asset.height,density:crop.density,expectedDensity:camera.s*(devicePixelRatio||1),maxChannelError:max,channelsOver1:changed,backgrounds:["#ffffff","#141a33"],bounded:asset.width<=Math.ceil((viewport.w+OVERSCAN*2)*(devicePixelRatio||1))+2&&asset.height<=Math.ceil((viewport.h+OVERSCAN*2)*(devicePixelRatio||1))+2};
    }finally{URL.revokeObjectURL(url)}
  }
}

export function cacheStaticArt(svg: SVGSVGElement) {
  const own: StaticRun[] = []; let run: Element[] = [];
  const flush = () => {
    if (run.reduce((sum, node) => sum + complexity(node), 0) >= 8) { const surface = new StaticRun(svg, run); surfaces.add(surface); own.push(surface); surface.update(true); }
    run = [];
  };
  for (const node of [...svg.children]) {
    if (node.localName === "defs" || live(node)) { flush(); continue; }
    run.push(node);
  }
  flush();
  return () => { for (const surface of own) surface.destroy(); };
}
export function updateStaticArt(cam: Camera, width: number, height: number) {
  camera.x=cam.x;camera.y=cam.y;camera.s=cam.s;viewport.w=width;viewport.h=height;
  for (const surface of surfaces) surface.update();
}
export function invalidateStaticArt() { for (const surface of surfaces) surface.invalidate(); }
export function destroyStaticArt(root: Element) { for (const surface of [...surfaces]) if (surface.within(root)) surface.destroy(); }
export function staticArtStats() {
  return { surfaces: surfaces.size, assets: assets.size, pending: pending.size, bytes: [...assets.values()].reduce((sum, a) => sum + a.width * a.height * 4, 0), cached: document.querySelectorAll('[data-static-art][data-cached="1"]').length };
}
export function enableStaticArt(on:boolean){enabled=on;if(!on)measurements.clear();for(const surface of surfaces){if(!on)surface.suspend();else surface.update(true)}if(!on)for(const [key,asset]of assets)if(!asset.refs){URL.revokeObjectURL(asset.url);assets.delete(key)}}
export async function verifyStaticArt(){const results=[];for(const surface of surfaces){const result=await surface.verify();if(result)results.push(result);if(results.length>=6)break}return results}
if (typeof window !== "undefined") (window as any).__staticArt = { stats: staticArtStats, invalidate: invalidateStaticArt, enable:enableStaticArt,verify:verifyStaticArt };
