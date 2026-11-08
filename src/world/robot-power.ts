import gsap from "gsap";
type Mode = { ultra?: boolean; fast?: boolean };
const modes = new WeakMap<Element, Map<string, Mode>>();
const none: Mode = {};
const motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let nextSampleAt = 0;
export const robotModeFor = (id: string | null, host: Element) => id ? modes.get(host.closest(".world")!)?.get(id) || none : none;
export function setRobotModes(threads: ({ id: string } & Mode)[], root: Element) {
  modes.set(root, new Map(threads.map(t => [t.id, { ultra: !!t.ultra, fast: !!t.fast }])));
}
/** One small pixel surface per visible actor. Uses the shared ticker, never per-pixel DOM. */
export class RobotPower {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private last = -1;
  private checkedAt = 0;
  private signature = "";
  private mask: Uint8Array | null = null;
  private heat = new Float32Array(64 * 80);
  private heatNext = new Float32Array(64 * 80);
  private fireTick = 0;
  private busy = false;
  private sampled = 0;
  private dead = false;
  private box: { x: number; y: number; w: number; h: number };
  private async sample(now: number) {
    if (this.busy || now - this.sampled < 400 || now < nextSampleAt) return;
    const svg = this.host.querySelector<SVGSVGElement>("svg.world-seated,svg.world-walker-svg");
    if (!svg) return;
    this.sampled = now; nextSampleAt = now + 30; this.busy = true;
    let url = "";
    try {
      const copy = svg.cloneNode(true) as SVGSVGElement;
      copy.querySelectorAll('.world-chair-base,[data-r="seatBack"],[data-r="seatFront"],[data-r="backrest"],[data-r="shadow"],[data-r="shadowL"],[data-r="shadowR"],title').forEach(e => e.remove());
      const computed = getComputedStyle(svg);
      let markup = new XMLSerializer().serializeToString(copy);
      for (let i = 0; i < 8 && markup.includes("var("); i++) markup = markup.replace(/var\((--[a-zA-Z0-9-]+)(?:,\s*([^()]*))?\)/g, (_, key, fallback) => (computed.getPropertyValue(key).trim() || fallback || "#fff").replace(/&/g,"&amp;").replace(/"/g,"&quot;"));
      const image = new Image(); url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" })); image.src = url; await image.decode();
      if (this.dead) return;
      const surface = document.createElement("canvas"); surface.width = 64; surface.height = 80;
      const ctx = surface.getContext("2d", { willReadFrequently: true })!;
      const left = parseFloat(svg.style.left) || 0, top = parseFloat(svg.style.top) || 0;
      const width = parseFloat(svg.style.width) || Number(svg.getAttribute("width")) || 400;
      const height = parseFloat(svg.style.height) || Number(svg.getAttribute("height")) || 380;
      ctx.drawImage(image, (left-this.box.x)/this.box.w*64, (top-this.box.y)/this.box.h*80, width/this.box.w*64, height/this.box.h*80);
      const pixels = ctx.getImageData(0,0,64,80).data;
      this.last = -1;
      this.mask = Uint8Array.from({length:64*80}, (_,i) => pixels[i*4+3] > 100 ? 1 : 0);
    } catch (error) { (this as any).sampleError = String(error); }
    finally { if (url) URL.revokeObjectURL(url); this.busy = false; }
  }
  constructor(private host: HTMLElement, private id: () => string | null, box: { x: number; y: number; w: number; h: number }) {
    this.box = box;
    this.canvas.width = 64; this.canvas.height = 80; this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText = `position:absolute;pointer-events:none;image-rendering:pixelated;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;display:none`;
    this.ctx = this.canvas.getContext("2d")!; host.prepend(this.canvas); gsap.ticker.add(this.frame);
    motionQuery?.addEventListener("change", this.motionChanged);
  }
  private motionChanged = () => { this.last=-1; this.checkedAt=0; this.frame(); };
  private frame = () => {
    if (document.hidden || !this.host.isConnected) return;
    const now = performance.now();
    if (now - this.checkedAt < 95) return;
    this.checkedAt = now;
    const mode = robotModeFor(this.id(), this.host), reduced = !!motionQuery?.matches;
    const tick = reduced ? 0 : Math.floor(performance.now() / 100);
    const signature = `${!!mode.ultra}:${!!mode.fast}`;

    this.canvas.style.display = mode.ultra || mode.fast ? "" : "none";
    if (!mode.ultra && !mode.fast) { this.heat.fill(0); this.fireTick=0; return; }
    const rect = this.host.getBoundingClientRect();
    if (rect.right < -200 || rect.left > innerWidth + 200 || rect.bottom < -200 || rect.top > innerHeight + 300 || this.host.closest('.arriving,.empty,[inert]')) { this.canvas.style.display = "none"; return; }
    if (signature === this.signature && tick === this.last && this.mask) return;
    this.signature = signature; this.last = tick;
    const c = this.ctx; c.clearRect(0, 0, 64, 80);
    if (mode.ultra) {
      if (!reduced || !this.mask) void this.sample(now);
      const mask = this.mask;
      if (mask) {
        // Heat comes from the lower body volume, not from a dilated contour.
        // Two upward advection steps per paint let tongues split, curl and cool.
        let bottom = 50;
        for (let y=79;y>10;y--) if(mask[y*64+31] || mask[y*64+32]) { bottom=y; break; }
        const seedY=Math.min(75,bottom-2), center=32;
        const steps = reduced ? (this.fireTick ? 0 : 45) : this.fireTick ? 2 : 30;
        for(let step=0;step<steps;step++) {
          const t=++this.fireTick;
          const next=this.heatNext; next.fill(0);
          for(let y=1;y<seedY+3;y++) for(let x=2;x<62;x++) {
            const wind=Math.round(Math.sin(x*.56+t*.19+y*.11)*.8);
            const sx=Math.max(1,Math.min(62,x+wind)), row=(y+1)*64;
            const value=this.heat[row+sx]*.56+(this.heat[row+sx-1]+this.heat[row+sx+1])*.17+this.heat[Math.min(79,y+2)*64+sx]*.1;
            const cooling=.003+.005*(.5+.5*Math.sin(x*.71+y*.37+t*.24));
            next[y*64+x]=Math.max(0,value*.994-cooling);
          }
          for(let x=center-21;x<=center+21;x++) {
            const edge=Math.abs(x-center)/21;
            const source=(1-edge*edge)*(.65+.35*Math.sin(x*.72+t*.23));
            const y=seedY+Math.round(Math.sin(x*.44+t*.15)*2);
            next[y*64+x]=Math.max(next[y*64+x],source);
            next[(y-1)*64+x]=Math.max(next[(y-1)*64+x],source*.8);
          }
          this.heatNext=this.heat; this.heat=next;
        }
        const shades=['#512080','#7d2dba','#a23bdd','#be4bee','#d276f5','#e4acff'];
        for(let y=1;y<79;y++) for(let x=1;x<63;x++) {
          const heat=this.heat[y*64+x];
          if(heat<.075)continue;
          // Filled square cells form connected flames; subtle shade separation recalls activity cells.
          const level=Math.min(5,Math.floor(heat*7));
          c.globalAlpha=(.25+Math.min(.65,heat*.8))*Math.min(1,y/10);
          c.fillStyle=shades[level]; c.fillRect(x,y,1,1);
        }
        if(!reduced)for(let n=0;n<6;n++) {
          const age=((tick+n*9)%31)/31, x=center+Math.round(Math.sin(n*4.1)*15+Math.sin(age*4+n)*2);
          const y=seedY-20-Math.round(age*28);
          if(y>0 && this.heat[y*64+x]<.1) {c.globalAlpha=(1-age)*.5;c.fillStyle='#be63ee';c.fillRect(x,y,1,1);}
        }
      }
    }
    c.globalAlpha = 1;
    if (mode.fast) {
      c.fillStyle = '#ffe48b'; c.strokeStyle = '#614688'; c.lineWidth = 1;
      for (const [x,y] of [[8,13],[49,37]]) {
        const lift = reduced ? 0 : Math.round(Math.sin(tick * .45 + x) * 2);
        c.beginPath(); c.moveTo(x+7,y+lift); c.lineTo(x,y+12+lift); c.lineTo(x+5,y+12+lift); c.lineTo(x+2,y+22+lift); c.lineTo(x+13,y+8+lift); c.lineTo(x+7,y+8+lift); c.closePath(); c.fill(); c.stroke();
      }
    }
    this.host.dataset.power = mode.ultra && mode.fast ? 'Ultra, fast' : mode.ultra ? 'Ultra' : 'Fast';
  };
  destroy() { this.dead = true; motionQuery?.removeEventListener("change", this.motionChanged); gsap.ticker.remove(this.frame); this.canvas.remove(); }
}
