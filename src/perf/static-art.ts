// Only immutable artwork is rasterized here. Live windows, signs, clocks, plants,
// keys, desk props and actors keep their original SVG/HTML nodes and paint order.
// Large runs retain guarded cells; small runs keep viewport crops. Source pixels
// always meet the actual camera scale and device-pixel ratio.
import { planRasterTiles, upwardTileDensity, snapTileCore, type RasterTile, RASTER_TILE_PIXELS } from './tile-grid';
import { RasterQuietGate } from './raster-quiet';
const NS = "http://www.w3.org/2000/svg";
type Camera = { x: number; y: number; s: number };
type Rect = { x: number; y: number; w: number; h: number; density: number };
type RasterSource = { id: number; text: string; holds: number };
type Asset = { url: string; width: number; height: number; refs: number; used: number; sourceKey?: RasterSource };
const BUDGET_BLOCKED = Symbol('static-art-budget');
const CAMERA_MOVED = Symbol('static-art-camera');
type RasterResult = Asset | null | typeof BUDGET_BLOCKED | typeof CAMERA_MOVED;
const surfaces = new Set<StaticRun>();
const assets = new Map<string, Asset>();
const rasterSources = new Map<string, RasterSource>();
let sourceSerial = 0;
const pending = new Map<string, { promise:Promise<RasterResult>;consumers:Set<()=>boolean> }>();
const measurements=new Set<StaticRun>();let measureQueued=false;
// Off by default: the cached images blur while zooming in and visibly snap sharp once the
// camera rests, and live measurements were no faster with them than with the native SVG
// (the world is a frozen GPU picture during camera motion; see .world.zooming).
let queue = Promise.resolve(), camera: Camera = { x: 0, y: 0, s: 1 }, viewport = { w: 0, h: 0 }, enabled = false;
const sceneOrigin = { x: 0, y: 0 };
const MAX_BYTES = 64 * 1024 * 1024, OVERSCAN = 256, SETTLE = 120;
const rasterQuiet = new RasterQuietGate(SETTLE);
const densityBucket = (required: number) => Math.max(required, 2 ** (Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4));
let budgetRevision = 0, budgetBytes = 0, rasterBytes = 0;
let cameraRevision = 0, cameraChangedAt = -Infinity;
const assetBytes = (asset: Asset) => asset.width * asset.height * 4;
const retainedBytes = () => [...assets.values()].reduce((sum, asset) => sum + assetBytes(asset), 0);
const overscan = () => ({ x: Math.min(OVERSCAN, viewport.w / 4), y: Math.min(OVERSCAN, viewport.h / 4) });
function releaseAsset(key: string, asset: Asset) {
  URL.revokeObjectURL(asset.url); assets.delete(key); if(asset.sourceKey)releaseSource(asset.sourceKey); budgetRevision++;
}
function releaseSource(source: RasterSource) { if(--source.holds===0)rasterSources.delete(source.text); }

function trimAssets(required = 0) {
  let bytes = retainedBytes();const limit=enabled?budgetBytes:0;
  for (const [key, a] of [...assets].sort((a, b) => a[1].used - b[1].used)) {
    if (bytes + required <= limit && assets.size + Number(required > 0) <= 64) break;
    if (a.refs) continue;
    releaseAsset(key, a); bytes -= assetBytes(a);
  }
  return bytes + required <= limit && assets.size + Number(required > 0) <= 64;
}

function raster(source: string, crop: Rect, valid:()=>boolean, tile?: RasterTile): Promise<RasterResult> {
  const width = tile?.width ?? Math.max(1, Math.ceil(crop.w * crop.density)), height = tile?.height ?? Math.max(1, Math.ceil(crop.h * crop.density));
  let sourceKey=rasterSources.get(source);
  if(!sourceKey){sourceKey={id:++sourceSerial,text:source,holds:0};rasterSources.set(source,sourceKey);}
  // A tile key must not duplicate/hash the entire SVG for every small image.
  // One source identity is retained only while a job or cached asset owns it.
  const key = `${sourceKey.id}|${crop.x},${crop.y},${crop.w},${crop.h},${crop.density}`;
  const hit = assets.get(key);
  if (hit) { hit.used = performance.now(); return Promise.resolve(hit); }
  const flying = pending.get(key); if (flying) {flying.consumers.add(valid);return flying.promise}
  sourceKey.holds++;
  const consumers=new Set([valid]),needed=()=>enabled&&!document.hidden&&[...consumers].some(check=>check());
  const requestedCamera = cameraRevision;
  const cameraCurrent = () => !!tile || requestedCamera === cameraRevision && performance.now() >= cameraChangedAt + SETTLE;
  const job = queue.then(async () => {
    if (!tile && requestedCamera !== cameraRevision) return CAMERA_MOVED;
    if (!await rasterQuiet.wait(needed)) return CAMERA_MOVED;
    if (!cameraCurrent()) return CAMERA_MOVED;
    if(!needed())return null;
    const bytes = width * height * 4;
    // Admission includes referenced images. An LRU which only evicts unpinned
    // entries cannot bound a dense visible office. Original vectors remain the
    // immediate fallback when a raster would exceed this viewport's cache.
    if (!trimAssets(bytes)) return BUDGET_BLOCKED;
    rasterBytes = bytes;
    const svg = `<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none">${source}</svg>`;
    let image: HTMLImageElement | null = null, decoded: HTMLImageElement | null = null, canvas: HTMLCanvasElement | null = null, url = '', png = '', retained = false;
    try {
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      image = new Image(); image.src = url; await image.decode();
      if (!tile && requestedCamera !== cameraRevision) return CAMERA_MOVED;
      if (!await rasterQuiet.wait(needed)) return CAMERA_MOVED;
      if (!cameraCurrent()) return CAMERA_MOVED;
      if(!needed())return null;
      canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
      // The canvas owns the pixels after drawImage. Do not retain the source
      // decoder through PNG encoding and a second image decode.
      image.src = ''; image = null;
      const encoding = canvas;
      const blob = await new Promise<Blob | null>((resolve) => encoding.toBlob(resolve, "image/png"));
      canvas.width = canvas.height = 0;
      canvas = null;
      if (!blob) return null;
      if (!tile && requestedCamera !== cameraRevision) return CAMERA_MOVED;
      if (!await rasterQuiet.wait(needed)) return CAMERA_MOVED;
      if (!cameraCurrent()) return CAMERA_MOVED;
      if(!needed())return null;
      if (!trimAssets(bytes)) return BUDGET_BLOCKED;
      png = URL.createObjectURL(blob); decoded = new Image(); decoded.src = png;
      await decoded.decode();
      if (!cameraCurrent()) return CAMERA_MOVED;
      if(!needed())return null;
      if (!trimAssets(bytes)) return BUDGET_BLOCKED;
      const asset = { url: png, width, height, refs: 0, used: performance.now(), sourceKey };
      sourceKey.holds++;
      assets.set(key, asset); retained = true;
      return asset;
    } catch { return null; }
    finally {
      if (image) image.src = '';
      if (decoded) decoded.src = '';
      if (canvas) canvas.width = canvas.height = 0;
      if (png && !retained) URL.revokeObjectURL(png);
      if (url) URL.revokeObjectURL(url); rasterBytes = 0;
    }
  });
  pending.set(key,{promise:job,consumers});
  queue = job.then(() => {}, () => {});
  void job.finally(() => { pending.delete(key); releaseSource(sourceKey); queueMicrotask(trimAssets); });
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
  protected originals = document.createDocumentFragment();
  private asset: Asset | null = null;
  private crop: Rect | null = null;
  private request = "";
  protected generation = 0;
  private timer = 0;
  protected dead = false;
  protected showing = false;
  private loading = false;
  private density = 0;
  private failedUntil = 0;
  private blockedRevision = -1;
  private blockedCrop = '';
  protected ready = false;
  protected source = "";
  protected dependency = "";
  protected dependencies: string[] = [];
  protected bounds: { x: number; y: number; w: number; h: number };

  constructor(protected svg: SVGSVGElement, protected nodes: Element[]) {
    this.holder.dataset.staticArt = "1";
    const vb = svg.viewBox.baseVal;
    this.bounds = { x: vb.x, y: vb.y, w: vb.width || Number(svg.getAttribute("width")), h: vb.height || Number(svg.getAttribute("height")) };
    nodes[0].before(this.holder);
    for (const node of nodes) this.holder.appendChild(node);
    this.image.style.display = "none"; this.image.setAttribute("preserveAspectRatio", "none"); this.holder.appendChild(this.image);
  }

  protected presenting() { return !document.hidden && !this.svg.closest?.('[inert]'); }

  measure(){
    if(this.dead||!this.svg.isConnected||!this.presenting())return;
    const box=this.holder.getBBox({stroke:true,markers:true}),style=getComputedStyle(this.svg),root=this.bounds;
    if(box.width>0&&box.height>0){
      const pad=2,x=box.x-pad,y=box.y-pad,right=box.x+box.width+pad,bottom=box.y+box.height+pad;
      this.bounds=style.overflow==="visible"?{x,y,w:right-x,h:bottom-y}:{x:Math.max(root.x,x),y:Math.max(root.y,y),w:Math.min(root.x+root.w,right)-Math.max(root.x,x),h:Math.min(root.y+root.h,bottom)-Math.max(root.y,y)};
    }
  }
  prepare(){if(this.dead||!this.presenting())return;this.serialize();this.ready=true;this.update(true)}

  protected serialize() {
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

  protected position() {
    let x = 0, y = 0;
    for (let el: Element | null = this.svg.parentElement; el && !el.classList.contains("world"); el = el.parentElement) {
      const style = (el as HTMLElement).style; x += parseFloat(style.left) || 0; y += parseFloat(style.top) || 0;
    }
    return { x, y };
  }

  protected view(): Rect | null {
    const p = this.position(), b = this.bounds, s = camera.s;
    const x = Math.max(b.x, -camera.x / s - p.x), y = Math.max(b.y, -camera.y / s - p.y);
    const right = Math.min(b.x + b.w, (viewport.w - camera.x) / s - p.x), bottom = Math.min(b.y + b.h, (viewport.h - camera.y) / s - p.y);
    return s > 0 && right > x && bottom > y ? { x, y, w: right - x, h: bottom - y, density: s * (devicePixelRatio || 1) } : null;
  }
  private covers(crop: Rect | null, view: Rect, pad = 0) {
    const b = this.bounds;
    // A sharper crop stays valid when zooming out. Only magnification or missing
    // geometry requires restoring the vectors and building replacement pixels.
    return !!crop && crop.density >= view.density * (1 - 1e-10) && crop.x <= Math.max(b.x, view.x - pad) + .01 && crop.y <= Math.max(b.y, view.y - pad) + .01 && crop.x + crop.w >= Math.min(b.x + b.w, view.x + view.w + pad) - .01 && crop.y + crop.h >= Math.min(b.y + b.h, view.y + view.h + pad) - .01;
  }
  private rasterCrop(view: Rect): Rect {
    const b = this.bounds, margin = overscan(), mx = margin.x / camera.s, my = margin.y / camera.s;
    const x = Math.max(b.x, view.x - mx), y = Math.max(b.y, view.y - my);
    return { x, y, w: Math.min(b.x + b.w, view.x + view.w + mx) - x, h: Math.min(b.y + b.h, view.y + view.h + my) - y, density: densityBucket(view.density) };
  }
  protected fallback() {
    if (!this.originals.childNodes.length) return;
    this.holder.insertBefore(this.originals, this.image); this.image.style.display = "none"; this.holder.dataset.cached = "0";
    this.image.removeAttribute('href');
    this.showing = false;
  }
  releaseRaster(only?: Asset) {
    if (only && this.asset !== only) return;
    this.fallback();
    if (this.asset) { this.asset.refs--; this.asset = null; this.image.removeAttribute('href'); budgetRevision++; }
    this.crop = null;
  }
  boundRaster(width: number, height: number) {
    if (this.asset && (this.asset.width > width || this.asset.height > height)) this.releaseRaster();
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
    if (!this.presenting()) { clearTimeout(this.timer);this.timer=0;return; }
    if(!enabled){this.fallback();return}
    const view = this.view();
    if(!view){this.releaseRaster();this.blockedRevision=-1;this.blockedCrop='';trimAssets();return}
    if(!this.ready){measurements.add(this);if(!measureQueued){measureQueued=true;queueMicrotask(()=>{measureQueued=false;const batch=[...measurements];measurements.clear();for(const surface of batch)surface.measure();for(const surface of batch)surface.prepare()})}return}
    if (this.covers(this.crop, view)) this.show(); else this.releaseRaster();
    if (this.covers(this.crop, view, 64 / camera.s)) return;
    if(this.failedUntil>performance.now())return;
    if (this.blockedRevision === budgetRevision && this.blockedCrop === JSON.stringify(this.rasterCrop(view))) return;
    const scaling = this.density !== view.density; this.density = view.density;
    if (this.loading) return;
    if (this.timer) { if (!scaling) return; clearTimeout(this.timer); }
    const run = () => {
      this.timer = 0;
      if (!this.presenting()) return;
      const current = this.view(); if (!current || this.dead) return;
      const delay = cameraChangedAt + SETTLE - performance.now();
      if (delay > 0) { this.timer = window.setTimeout(run, delay); return; }
      const crop = this.rasterCrop(current);
      const signature = JSON.stringify(crop); if (signature === this.request) return;
      this.request = signature; this.loading = true; const generation = this.generation;
      void raster(this.source,crop,()=>{const view=this.presenting()?this.view():null;return !this.dead&&enabled&&generation===this.generation&&signature===this.request&&!!view&&this.covers(crop,view)}).then((asset) => {
        if (this.dead || !enabled || !this.presenting() || generation !== this.generation || signature !== this.request) return;
        const latest = this.view(); if (!latest || !this.covers(crop, latest)) return;
        if (asset === CAMERA_MOVED) return;
        if (asset === BUDGET_BLOCKED) { this.blockedRevision = budgetRevision; this.blockedCrop = signature; return; }
        if(!asset){this.failedUntil=performance.now()+5000;return}
        if (this.asset) this.asset.refs--;
        this.asset = asset; asset.refs++; asset.used = performance.now(); this.crop = crop; this.showing = false; this.blockedRevision = -1; this.blockedCrop = ''; this.show(); trimAssets();
      }).finally(() => { this.loading = false; if (this.request === signature) this.request = ""; queueMicrotask(trimAssets); if (!this.dead&&this.presenting()) this.update(); });
    };
    this.timer = window.setTimeout(run, Math.max(immediate ? 0 : SETTLE, cameraChangedAt + SETTLE - performance.now()));
  }

  destroy() {
    if (this.dead) return;
    this.dead = true; this.generation++; clearTimeout(this.timer); this.fallback();
    if (this.asset) this.asset.refs--; this.image.remove(); this.holder.replaceWith(...this.nodes);
    surfaces.delete(this);measurements.delete(this);rasterQuiet.prune();trimAssets();
  }
  suspend(){this.generation++;clearTimeout(this.timer);this.timer=0;this.request="";this.releaseRaster()}
  within(root: Element) { return root.contains(this.svg); }
  displayPending() { return 0; }
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
      const boundDensity=(devicePixelRatio||1)*2**.25, margin=overscan();
      return {width:asset.width,height:asset.height,density:crop.density,expectedDensity:camera.s*(devicePixelRatio||1),maxChannelError:max,channelsOver1:changed,backgrounds:["#ffffff","#141a33"],bounded:asset.width<=Math.ceil((viewport.w+margin.x*2)*boundDensity)+2&&asset.height<=Math.ceil((viewport.h+margin.y*2)*boundDensity)+2};
    }finally{URL.revokeObjectURL(url)}
  }
}

type StaticTile = { tile: RasterTile; asset: Asset; group: SVGGElement; image: SVGImageElement; clip: SVGClipPathElement; rect: SVGRectElement };
type DisplayTile = StaticTile & { key: string; finish: (loaded: boolean) => void };
let tileOwnerSerial = 0;
const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K) => document.createElementNS(NS, tag);
function positionClip(rect: SVGRectElement, core: RasterTile['core']) {
  for (const [key, value] of Object.entries(core)) {
    const name = key === 'w' ? 'width' : key === 'h' ? 'height' : key, text = String(value);
    if (rect.getAttribute(name) !== text) rect.setAttribute(name, text);
  }
}
function tileClip(core: RasterTile['core']) {
  const rect = svgElement('rect');
  positionClip(rect, core);
  rect.setAttribute('shape-rendering', 'crispEdges');
  return rect;
}

/** Large immutable runs retain source-aligned cells. Moving the camera changes
 * neither their image geometry nor their cache key. Unready cells alone keep
 * original vectors, including their exact alpha and inherited theme colors. */
class TiledStaticRun extends StaticRun {
  private tiled = false;
  private tiles = new Map<string, StaticTile>();
  private wanted = new Map<string, RasterTile>();
  private visibleTiles: RasterTile[] = [];
  private blocked = new Map<string, number>();
  private tileLoading = false;
  private displaying: DisplayTile|null=null;
  private tileFailures = new Map<string, number>();
  private nativeGroup!: SVGGElement;
  private tileGroup!: SVGGElement;
  private definitions!: SVGDefsElement;
  private nativeClip!: SVGClipPathElement;
  private nativeRects = new Map<string, SVGRectElement>();
  private tileOwner = `static-tiles-${++tileOwnerSerial}`;
  private painted = '';
  private clipCamera = '';
  private tileSerial = 0;

  private activate() {
    super.releaseRaster();
    this.tiled = true;
    this.nativeGroup = svgElement('g'); this.tileGroup = svgElement('g'); this.definitions = svgElement('defs');
    this.nativeClip = svgElement('clipPath'); this.nativeClip.id = `${this.tileOwner}-native`;
    this.nativeClip.setAttribute('clipPathUnits', 'userSpaceOnUse'); this.definitions.append(this.nativeClip);
    this.nativeGroup.append(...this.nodes);
    this.holder.append(this.definitions, this.nativeGroup, this.tileGroup);
  }
  private removeTile(key: string, record: StaticTile) {
    record.image.removeAttribute('href'); record.group.remove();record.clip.remove();
    record.asset.refs--; budgetRevision++; this.tiles.delete(key);
  }
  private snapped(core: RasterTile['core'], p=this.position()) {
    return snapTileCore(core,{x:camera.x+p.x*camera.s,y:camera.y+p.y*camera.s,s:camera.s},devicePixelRatio||1,sceneOrigin).world;
  }
  private positionTile(record: StaticTile, p=this.position()) {
    positionClip(record.rect, this.snapped(record.tile.core,p));
  }
  private paintTiles() {
    const state = this.visibleTiles.map(tile => `${tile.key}:${Number(this.tiles.has(tile.key))}`).join('|');
    const missing = this.visibleTiles.filter(tile => !this.tiles.has(tile.key));
    const position=this.position();
    const clipCamera = `${camera.x}:${camera.y}:${camera.s}:${devicePixelRatio}:${sceneOrigin.x}:${sceneOrigin.y}:${position.x}:${position.y}`;
    if (state === this.painted && clipCamera === this.clipCamera) return;
    this.painted = state; this.clipCamera = clipCamera;
    for(const record of this.tiles.values())this.positionTile(record,position);
    // Preserve clip nodes while the camera moves. Replacing every hole each
    // frame forces SVG clip/layer reconstruction even for unchanged tile sets.
    const clipped = missing.length > 0 && missing.length < this.visibleTiles.length ? missing : [];
    const keys = new Set(clipped.map(tile => tile.key));
    for (const [key, rect] of this.nativeRects) if (!keys.has(key)) { rect.remove(); this.nativeRects.delete(key); }
    for (const tile of clipped) {
      let rect = this.nativeRects.get(tile.key);
      if (!rect) { rect = tileClip(this.snapped(tile.core,position)); this.nativeRects.set(tile.key,rect); this.nativeClip.append(rect); }
      else positionClip(rect, this.snapped(tile.core,position));
    }
    if (!missing.length && this.visibleTiles.length) {
      for (const node of this.nodes) if (node.parentNode === this.nativeGroup) this.originals.appendChild(node);
    } else {
      this.nativeGroup.append(this.originals);
      if (missing.length === this.visibleTiles.length) this.nativeGroup.removeAttribute('clip-path');
      else {
        const clip = `url(#${this.nativeClip.id})`;
        if (this.nativeGroup.getAttribute('clip-path') !== clip) this.nativeGroup.setAttribute('clip-path', clip);
      }
    }
    const ready = this.visibleTiles.length - missing.length;
    this.showing = ready > 0;
    this.holder.dataset.cached = ready ? '1' : '0';
    this.holder.dataset.tiles = `${ready}/${this.visibleTiles.length}`;
    this.holder.dataset.density = String(this.visibleTiles[0]?.density ?? 0);
  }
  protected override fallback() {
    if (!this.tiled) { super.fallback(); return; }
    this.nativeGroup.append(this.originals); this.nativeGroup.removeAttribute('clip-path');
    this.showing = false; this.holder.dataset.cached = '0'; this.painted = '';
  }
  private cancelDisplay() {
    const display = this.displaying;
    if (!display) return;
    this.displaying = null;
    display.image.onload = display.image.onerror = null;
    display.image.removeAttribute('href'); display.group.remove(); display.clip.remove();
    display.asset.refs--; budgetRevision++;
    // A disconnected or hidden SVG image need not emit load/error. Resolve our
    // wait explicitly so its owner can start the next visible tile immediately.
    display.finish(false);
  }
  override releaseRaster(only?: Asset) {
    if (!this.tiled) { super.releaseRaster(only); return; }
    if(this.displaying&&(!only||this.displaying.asset===only))this.cancelDisplay();
    for (const [key, record] of this.tiles) if (!only || record.asset === only) this.removeTile(key, record);
    this.painted = ''; this.paintTiles();
  }
  override boundRaster(width: number, height: number) {
    if (!this.tiled) super.boundRaster(width, height);
    // Each tiled backing already has the fixed, guarded physical-pixel bound.
    // Aggregate admission and viewport shrinking still release pinned owners.
  }
  override invalidate() {
    if (!this.tiled) { super.invalidate(); return; }
    if (!this.dependencies.length) return;
    const style = getComputedStyle(this.svg), next = this.dependencies.map(name => style.getPropertyValue(name)).join('|');
    if (next === this.dependency) return;
    this.generation++; this.wanted.clear(); this.visibleTiles = []; this.releaseRaster(); this.fallback();
    this.blocked.clear(); this.tileFailures.clear(); this.serialize(); this.update(true); trimAssets();
  }
  override update(immediate = false) {
    if (this.dead) return;
    if (!this.svg.isConnected) { this.destroy(); return; }
    if (!this.presenting()) { this.cancelDisplay(); super.update(immediate); return; }
    const view = this.view();
    if (!this.tiled && (!this.ready || !view || this.bounds.w * view.density <= RASTER_TILE_PIXELS && this.bounds.h * view.density <= RASTER_TILE_PIXELS)) { super.update(immediate); return; }
    if (!this.tiled) this.activate();
    if (!enabled || !view) { this.wanted.clear(); this.visibleTiles = []; this.blocked.clear();this.tileFailures.clear();this.releaseRaster(); this.fallback(); trimAssets(); return; }
    const previousDensity = this.visibleTiles[0]?.density ?? 0;
    const sharperPlan = previousDensity > upwardTileDensity(view.density) && previousDensity >= view.density
      ? planRasterTiles(this.bounds, view, previousDensity) : [];
    const reuseSharper = sharperPlan.length > 0 && sharperPlan.every(tile => this.tiles.has(tile.key));
    this.visibleTiles = reuseSharper ? sharperPlan : planRasterTiles(this.bounds, view, view.density);
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    this.visibleTiles.sort((a,b)=>Math.abs(a.core.x+a.core.w/2-cx)+Math.abs(a.core.y+a.core.h/2-cy)-Math.abs(b.core.x+b.core.w/2-cx)-Math.abs(b.core.y+b.core.h/2-cy));
    const reserve = Math.min(64, viewport.w / 8, viewport.h / 8) / camera.s;
    // A zoom-out can stay entirely on already sharp cells. Keep that covered
    // level without launching lower-density replacements or fresh prefetch jobs.
    const reserveTiles = reuseSharper ? [...this.tiles.values()].filter(record => record.tile.density === previousDensity).map(record => record.tile)
      : planRasterTiles(this.bounds, view, view.density, reserve);
    this.wanted = new Map([...this.visibleTiles, ...reserveTiles].map(tile => [tile.key, tile]));
    if (this.displaying && !this.wanted.has(this.displaying.key)) this.cancelDisplay();
    for (const [key, record] of this.tiles) if (!this.wanted.has(key)) this.removeTile(key, record);
    for (const key of this.blocked.keys()) if (!this.wanted.has(key)) this.blocked.delete(key);
    for (const key of this.tileFailures.keys()) if (!this.wanted.has(key)) this.tileFailures.delete(key);
    this.paintTiles();
    if (this.tileLoading) return;
    const next = [...this.wanted.values()].find(tile => !this.tiles.has(tile.key) && this.blocked.get(tile.key) !== budgetRevision && (this.tileFailures.get(tile.key) ?? 0) <= performance.now());
    if (!next) return;
    this.tileLoading = true;
    const generation = this.generation;
    const valid = () => !this.dead && enabled && this.presenting() && generation === this.generation && this.wanted.has(next.key);
    void raster(this.source, next.crop, valid, next).then(async asset => {
      if (!valid()) return;
      if (asset === BUDGET_BLOCKED) { this.blocked.set(next.key, budgetRevision); return; }
      if (asset === CAMERA_MOVED) return;
      if (!asset) { this.tileFailures.set(next.key, performance.now()+5000); return; }
      // Full-precision SVG clip attributes avoid CSS layout's 1/64px rounding.
      // Ready cells and native holes share canonical physical-pixel boundaries;
      // the guarded bitmap itself retains its immutable world coordinates.
      const group=svgElement('g'),image=svgElement('image'),clip=svgElement('clipPath'),rect=tileClip(next.core);
      group.dataset.staticTile=next.key;group.style.visibility='hidden';
      clip.id=`${this.tileOwner}-${++this.tileSerial}`;clip.setAttribute('clipPathUnits','userSpaceOnUse');clip.append(rect);this.definitions.append(clip);
      group.setAttribute('clip-path',`url(#${clip.id})`);image.setAttribute('preserveAspectRatio','none');
      for(const[key,value]of Object.entries({x:next.crop.x,y:next.crop.y,width:next.crop.w,height:next.crop.h}))image.setAttribute(key,String(value));
      group.append(image);this.tileGroup.append(group);
      // Keep vectors until the displayed SVG image's own load event. The PNG
      // validator and this consumer have distinct lifetimes and cancellation.
      let finish!: (loaded:boolean)=>void;
      const loaded=new Promise<boolean>(resolve=>{finish=resolve;});
      const display={tile:next,asset,image,group,clip,rect,key:next.key,finish};this.displaying=display;asset.refs++;
      image.onload=()=>finish(true);image.onerror=()=>finish(false);image.setAttribute('href',asset.url);
      const complete=await loaded;image.onload=image.onerror=null;
      if(this.displaying!==display)return;
      this.displaying=null;
      if(!complete||!valid()||retainedBytes()>budgetBytes){image.removeAttribute('href');group.remove();clip.remove();asset.refs--;budgetRevision++;if(!complete)this.tileFailures.set(next.key,performance.now()+5000);return;}
      this.positionTile(display);group.style.visibility='';
      asset.used=performance.now(); this.tiles.set(next.key,{tile:next,asset,group,image,clip,rect});
      this.painted=''; this.paintTiles(); trimAssets();
    }).finally(()=>{this.tileLoading=false;trimAssets();if(!this.dead&&this.presenting())this.update();});
  }
  override suspend() {
    if (!this.tiled) { super.suspend(); return; }
    this.generation++; this.wanted.clear(); this.visibleTiles=[];this.blocked.clear();this.tileFailures.clear();this.releaseRaster();this.fallback();
  }
  override destroy() {
    if (this.dead) return;
    if (this.tiled) {this.generation++;this.wanted.clear();this.visibleTiles=[];this.blocked.clear();this.tileFailures.clear();this.releaseRaster();this.fallback();}
    super.destroy();
  }
  override async verify() {
    if (!this.tiled) return super.verify();
    const checks=[];
    for(const record of this.tiles.values()) checks.push(await this.verifyTile(record));
    if(!checks.length)return null;
    return {...checks[0],maxChannelError:Math.max(...checks.map(check=>check.maxChannelError)),channelsOver1:checks.reduce((sum,check)=>sum+check.channelsOver1,0),sourceMaxChannelError:Math.max(...checks.map(check=>check.sourceMaxChannelError)),sourceChannelsOver1:checks.reduce((sum,check)=>sum+check.sourceChannelsOver1,0),nativeDirectMaxChannelError:Math.max(...checks.map(check=>check.nativeDirectMaxChannelError)),nativeDirectChannelsOver1:checks.reduce((sum,check)=>sum+check.nativeDirectChannelsOver1,0),bounded:checks.every(check=>check.bounded),verifiedTiles:checks.length};
  }
  override displayPending(){return this.displaying?1:0;}
  private async verifyTile(record: StaticTile) {
    const {asset,tile}=record,crop=tile.crop,source=this.source;
    const expected=new Image(),actual=new Image(),capture=document.createElement('canvas');capture.width=asset.width;capture.height=asset.height;
    const url=URL.createObjectURL(new Blob([`<svg xmlns="${NS}" width="${asset.width}" height="${asset.height}" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}" preserveAspectRatio="none">${source}</svg>`],{type:'image/svg+xml'}));
    try {
      expected.src=url;actual.src=asset.url;await Promise.all([expected.decode(),actual.decode()]);
      const pixels=(image:CanvasImageSource,background?:string)=>{const canvas=document.createElement('canvas');canvas.width=asset.width;canvas.height=asset.height;const ctx=canvas.getContext('2d')!;if(background){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;canvas.width=canvas.height=0;return data};
      // The cache captures SVG onto a transparent surface before encoding it.
      // Direct SVG-on-background drawing uses a different isolation/compositing
      // path. Keep that diagnostic, while testing stored source bytes against
      // the same isolated capture, including its complete RGBA values.
      capture.getContext('2d')!.drawImage(expected,0,0,asset.width,asset.height);
      const difference=(a:Uint8ClampedArray,b:Uint8ClampedArray)=>{let max=0,changed=0;for(let i=0;i<a.length;i++){const error=Math.abs(a[i]-b[i]);max=Math.max(max,error);if(error>1)changed++;}return{max,changed}};
      const source=difference(capture.getContext('2d')!.getImageData(0,0,asset.width,asset.height).data,pixels(actual));
      let max=source.max,changed=source.changed,directMax=0,directChanged=0;
      for(const background of ['#ffffff','#141a33']){const b=pixels(actual,background),isolated=difference(pixels(capture,background),b),direct=difference(pixels(expected,background),b);max=Math.max(max,isolated.max);changed+=isolated.changed;directMax=Math.max(directMax,direct.max);directChanged+=direct.changed;}
      return {width:asset.width,height:asset.height,density:crop.density,expectedDensity:camera.s*(devicePixelRatio||1),maxChannelError:max,channelsOver1:changed,sourceMaxChannelError:source.max,sourceChannelsOver1:source.changed,sourceReference:'isolated-svg-canvas',nativeDirectMaxChannelError:directMax,nativeDirectChannelsOver1:directChanged,backgrounds:['#ffffff','#141a33'],bounded:asset.width<=514&&asset.height<=514,tiles:this.tiles.size,visibleTiles:this.visibleTiles.length,readyTiles:this.visibleTiles.filter(tile=>this.tiles.has(tile.key)).length};
    } finally {expected.src='';actual.src='';capture.width=capture.height=0;URL.revokeObjectURL(url);}
  }
}

export function cacheStaticArt(svg: SVGSVGElement) {
  const own: StaticRun[] = []; let run: Element[] = [];
  const flush = () => {
    if (run.reduce((sum, node) => sum + complexity(node), 0) >= 8) { const surface = new TiledStaticRun(svg, run); surfaces.add(surface); own.push(surface); surface.update(true); }
    run = [];
  };
  for (const node of [...svg.children]) {
    if (node.localName === "defs" || live(node)) { flush(); continue; }
    run.push(node);
  }
  flush();
  return () => { for (const surface of own) surface.destroy(); };
}
export function updateStaticArt(cam: Camera, width: number, height: number, left = 0, top = 0) {
  if (cam.x !== camera.x || cam.y !== camera.y || cam.s !== camera.s || width !== viewport.w || height !== viewport.h) { cameraChangedAt = performance.now(); cameraRevision++; rasterQuiet.changed(); }
  camera.x=cam.x;camera.y=cam.y;camera.s=cam.s;viewport.w=width;viewport.h=height;sceneOrigin.x=left;sceneOrigin.y=top;
  const dpr = devicePixelRatio || 1, nextBudget = Math.min(MAX_BYTES, Math.ceil(Math.max(0, width) * dpr) * Math.ceil(Math.max(0, height) * dpr) * 16);
  if (budgetBytes !== nextBudget) {
    budgetBytes = nextBudget; budgetRevision++;
    const margin = overscan(), density = dpr * 2 ** .25;
    for (const surface of surfaces) surface.boundRaster(Math.ceil((width + margin.x * 2) * density) + 2, Math.ceil((height + margin.y * 2) * density) + 2);
    trimAssets();
    if (retainedBytes() > budgetBytes) for (const asset of [...assets.values()].sort((a,b)=>a.used-b.used)) {
      for (const surface of surfaces) surface.releaseRaster(asset);
      if (trimAssets()) break;
    }
  }
  for (const surface of surfaces) surface.update();
  rasterQuiet.prune();
}
export function invalidateStaticArt() { for (const surface of surfaces) surface.invalidate(); }
export function destroyStaticArt(root: Element) { for (const surface of [...surfaces]) if (surface.within(root)) surface.destroy(); }
export function staticArtStats() {
  return { surfaces: surfaces.size, assets: assets.size, pending: pending.size+[...surfaces].reduce((sum,surface)=>sum+surface.displayPending(),0), bytes: retainedBytes(), budgetBytes, rasterBytes, sources:rasterSources.size, cached: document.querySelectorAll('[data-static-art][data-cached="1"]').length };
}
export function enableStaticArt(on:boolean){enabled=on;if(!on){measurements.clear();rasterQuiet.cancel()}for(const surface of surfaces){if(!on)surface.suspend();else surface.update(true)}if(!on)for(const [key,asset]of assets)if(!asset.refs)releaseAsset(key,asset)}
export async function verifyStaticArt(){const results=[];for(const surface of surfaces){const result=await surface.verify();if(result)results.push(result);if(results.length>=6)break}return results}
// Loading may have paused while hidden without a subsequent camera event. Keep
// completed sharp pixels, cancel obsolete consumers, and resume their queue on
// visibility alone. This module owns one listener, independent of surface count.
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
  rasterQuiet.prune();
  for (const surface of surfaces) surface.update(true);
});
if (typeof window !== "undefined") (window as any).__staticArt = { stats: staticArtStats, invalidate: invalidateStaticArt, enable:enableStaticArt,verify:verifyStaticArt };
