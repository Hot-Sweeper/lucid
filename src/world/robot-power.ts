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
  private foreground = document.createElement("canvas");
  private front: CanvasRenderingContext2D;
  private last = -1;
  private checkedAt = 0;
  private signature = "";
  private mask: Uint8Array | null = null;
  private heat = new Float32Array(32 * 40);
  private heatNext = new Float32Array(32 * 40);
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
    this.foreground.width=64; this.foreground.height=80; this.foreground.setAttribute("aria-hidden", "true");
    this.foreground.style.cssText=this.canvas.style.cssText+";z-index:1";
    this.front=this.foreground.getContext("2d")!; host.append(this.foreground);
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
    this.foreground.style.display = mode.ultra ? "" : "none";
    if (!mode.ultra && !mode.fast) { this.heat.fill(0); this.fireTick=0; return; }
    const rect = this.host.getBoundingClientRect();
    if (rect.right < -200 || rect.left > innerWidth + 200 || rect.bottom < -200 || rect.top > innerHeight + 300 || this.host.closest('.arriving,.empty,[inert]')) { this.canvas.style.display = this.foreground.style.display = "none"; return; }
    if (signature === this.signature && tick === this.last && this.mask) return;
    this.signature = signature; this.last = tick;
    const c = this.ctx, front=this.front; c.clearRect(0, 0, 64, 80); front.clearRect(0,0,64,80);
    if (mode.ultra) {
      if (!reduced || !this.mask) void this.sample(now);
      const mask = this.mask;
      if (mask) {
        // The approved reference uses touching, coarse cells: a compact body fire,
        // rising tongues behind the head, arm-side fire and a little foreground overlap.
        let bottom=54;
        for(let y=75;y>15;y--) if(mask[y*64+31]||mask[y*64+32]) {bottom=y;break;}
        const seedY=Math.min(36,Math.floor(bottom/2)), center=16;
        const steps=reduced?(this.fireTick?0:36):this.fireTick?2:30;
        for(let step=0;step<steps;step++) {
          const t=++this.fireTick, next=this.heatNext;next.fill(0);
          for(let y=1;y<seedY+3;y++)for(let x=1;x<31;x++) {
            const wind=Math.round(Math.sin(x*.79+y*.13+t*.17)*.68);
            const sx=Math.max(1,Math.min(30,x+wind));
            const value=this.heat[(y+1)*32+sx]*.76+(this.heat[(y+1)*32+sx-1]+this.heat[(y+1)*32+sx+1])*.12;
            const cooling=.012+.016*(.5+.5*Math.sin(x*1.17+y*.63+t*.29));
            next[y*32+x]=Math.max(0,value*.99-cooling);
          }
          for(let x=center-10;x<=center+10;x++) {
            const edge=Math.abs(x-center)/11;
            const y=seedY+Math.round(Math.sin(x*.8+t*.14));
            const source=(1-edge*edge*.55)*(.82+.18*Math.sin(x*1.3+t*.31));
            next[y*32+x]=Math.max(next[y*32+x],source);
            next[(y-1)*32+x]=Math.max(next[(y-1)*32+x],source*.9);
          }
          // Shoulder-side risers feed tall, uneven tongues behind the head.
          // They are small burning volumes, not a border following the limbs.
          for(const side of [-1,1]) {
            const x=center+side*7+Math.round(Math.sin(t*.12+side)*1.2);
            const y=seedY-11+(side<0?2:0);
            const pulse=.76+.2*Math.sin(t*.21+side*2);
            next[y*32+x]=Math.max(next[y*32+x],pulse);
            next[(y+1)*32+x]=Math.max(next[(y+1)*32+x],pulse);
            next[y*32+x+side]=Math.max(next[y*32+x+side],pulse*.72);
          }
          this.heatNext=this.heat;this.heat=next;
        }
        const shades=['#4b086d','#700aa0','#9415c4','#b52cde','#d34df0','#e893ff'];
        const baseY=seedY-4, phase=this.fireTick;
        // Broad connected fire at the waist, plus individually tapered tongues.
        // The tongues carry their own bright cores outside the robot silhouette,
        // rather than hiding all the light behind its opaque body.
        const tongues=[[-8,17,3],[-5,23,3.2],[0,20,4],[4,30,3.8],[8,22,3.2]];
        for(let y=1;y<39;y++)for(let x=1;x<31;x++) {
          const height=baseY-y;
          if(height<0)continue;
          let density=0;
          const belly=(y-(baseY-8))/12;
          if(Math.abs(belly)<1) {
            const radius=9.5*Math.sqrt(1-belly*belly);
            const d=radius-Math.abs(x-center);
            if(d>0)density=.2+Math.min(.3,d*.09);
          }
          for(let n=0;n<tongues.length;n++) {
            const [offset,length,width]=tongues[n];
            const h=length+Math.sin(phase*.065+n*2.2)*2.5;
            if(height>h)continue;
            const rise=height/h;
            const curl=Math.sin(phase*.11+n*2+height*.36)*Math.pow(rise,.7)*3.3;
            const axis=center+offset+curl;
            const radius=width*Math.pow(1-rise,.72)*(.9+.18*Math.sin(height*.5-phase*.13+n));
            const distance=Math.abs(x-axis);
            if(distance>radius)continue;
            const core=1-distance/Math.max(.5,radius);
            const value=.23+core*(.5+.15*Math.sin(height*.9-phase*.25+n))+this.heat[y*32+x]*.14;
            density=Math.max(density,value);
          }
          if(density===0)continue;
          // Large shade clusters travel upward, with touching cell edges throughout.
          const light=Math.sin(x*.9+y*.75+phase*.23)*.12;
          const shade=Math.max(0,Math.min(5,Math.floor((density+light)*6.3)));
          c.globalAlpha=.94;c.fillStyle=shades[shade];c.fillRect(x*2,y*2,2,2);
          // Short irregular wisps overlap the waist, never long strips over the chair.
          if(y>=baseY-5 && y<=baseY-2 && Math.abs(x-center)>=3 && Math.abs(x-center)<=7
            && mask[(y*2)*64+x*2] && Math.sin(x*1.4+y*.9-phase*.17)>.15) {
            front.globalAlpha=.82;front.fillStyle=shades[4+((x+y)%2)];front.fillRect(x*2,y*2,2,2);
          }
        }
        if(!reduced)for(let n=0;n<5;n++) {
          const age=((tick+n*11)%27)/27;
          const x=center+Math.round(Math.sin(n*3.7)*9+Math.sin(age*3+n));
          const y=seedY-9-Math.round(age*16);
          if(y>0&&this.heat[y*32+x]<.22) {c.globalAlpha=(1-age)*.9;c.fillStyle=n%2?'#d36af0':'#9e1ec6';c.fillRect(x*2,y*2,2,2);}
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
  destroy() { this.dead = true; motionQuery?.removeEventListener("change", this.motionChanged); gsap.ticker.remove(this.frame); this.canvas.remove(); this.foreground.remove(); }
}
