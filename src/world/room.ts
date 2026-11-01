import gsap from "gsap";
import { uid } from "./parts";
import { plankJoints } from "../perf/floor-paths";
import { releaseVectors } from "../perf/shared-vector";
import { cacheStaticArt, destroyStaticArt } from "../perf/static-art";

// Shared pieces for the top-down rooms: the shell (floor, north wall face, dark wall tops,
// door gap in the south wall), depth-sorted furniture pieces and a small walking graph.
// Depth: every piece and every walker gets z-index = the floor y of its front edge, so a
// robot standing south of a table is drawn in front of it and one north of it behind.

export const WALL = 110;   // north wall face height (including the dark top)
export const T = 16;       // wall top thickness
export const DOOR = 120;   // door gap in the south wall

export type Pt = { x: number; y: number };

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keeps the tweens and timelines of a piece of furniture so destroy() can kill them all. */
export class Anims {
  private set = new Set<gsap.core.Animation>();
  add<A extends gsap.core.Animation>(a: A): A {
    if (this.set.size > 48) for (const x of this.set) if (!x.isActive() && x.progress() === 1) this.set.delete(x);
    this.set.add(a);
    return a;
  }
  /** A promise for an animation that never settles if the animation is killed. */
  run(a: gsap.core.Animation) { return new Promise<void>((res) => { this.add(a); a.eventCallback("onComplete", () => res()); }); }
  kill() { for (const a of this.set) a.kill(); this.set.clear(); }
}
export type Palette = { wall: string; trim: string; floor: string; seam: string; accent: string };

export const PAL = {
  wall: "#ece6da", trim: "#d8cfbf", floor: "#c49a6c", seam: "#b2875b", accent: "#ff9f5a",
  top: "#3a3f4f", grey: "#4a5063", mint: "#4ff0a0", blue: "#4fb6ff", pink: "#ff6f91", violet: "#b07cff", orange: "#ff9f5a",
};

export class RoomStage {
  el: HTMLDivElement;
  layer: HTMLDivElement;
  readonly id = uid("rm");
  constructor(host: HTMLElement, readonly w: number, readonly h: number, pal: Palette, wallArt: string, cls: string, floorArt?: string) {
    const el = document.createElement("div");
    el.className = `world-room ${cls}`;
    el.dataset.vectorOwner=this.id;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.innerHTML = `${shellSvg(this.id, w, h, pal, wallArt, floorArt)}<div class="world-room-layer"></div>${frontSvg(w, h, pal)}`;
    host.appendChild(el);
    this.el = el;
    this.layer = el.querySelector(".world-room-layer")!;
    for(const svg of el.querySelectorAll<SVGSVGElement>(":scope > svg"))cacheStaticArt(svg);
  }

  /** An upright or floor piece of furniture, drawn in its own box and depth-sorted by `z` (its front edge y). */
  prop(x: number, y: number, w: number, h: number, z: number, inner: string, cls = "") {
    const d = document.createElement("div");
    d.className = `world-prop ${cls}`;
    d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${Math.round(z)}`;
    d.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
    this.layer.appendChild(d);
    cacheStaticArt(d.firstElementChild as SVGSVGElement);
    return d.firstElementChild as SVGSVGElement;
  }

  destroy() {destroyStaticArt(this.el);releaseVectors(this.id);this.el.remove();}
}

function shellSvg(id: string, w: number, h: number, pal: Palette, wallArt: string, floorArt?: string) {
  const lamps: string[] = [];
  for (let ly = WALL + 190; ly < h - 60; ly += 380)
    for (let lx = 200; lx < w - 60; lx += 400)
      lamps.push(`<ellipse cx="${lx}" cy="${ly}" rx="190" ry="140" fill="url(#${id}-pool)" style="opacity:var(--lamp, 0)"/>`);
  return /* svg */ `
  <svg class="world-room-shell" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1, #6fb2ee)"/><stop offset="1" style="stop-color:var(--sky2, #d4ecfb)"/></linearGradient>
      <radialGradient id="${id}-pool"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.3"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>
    </defs>
    <rect y="${WALL}" width="${w}" height="${h - WALL}" fill="${pal.floor}"/>
    ${floorArt ?? plankJoints(w,h,WALL,pal.seam,id)}
    ${lamps.join("")}
    <rect y="${WALL}" width="${w}" height="20" fill="#000" opacity="0.07"/>
    <rect width="${w}" height="${WALL}" fill="${pal.wall}"/>
    <rect y="${WALL - 10}" width="${w}" height="10" fill="${pal.trim}"/>
    ${wallArt.replace(/SKY/g, `url(#${id}-sky)`)}
    <rect width="${w}" height="${T}" fill="${PAL.top}"/>
  </svg>`;
}

function frontSvg(w: number, h: number, pal: Palette) {
  const d0 = w / 2 - DOOR / 2;
  return /* svg */ `
  <svg class="world-room-front" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <rect width="${T}" height="${h}" fill="${PAL.top}"/>
    <rect x="${w - T}" width="${T}" height="${h}" fill="${PAL.top}"/>
    <rect y="${h - T}" width="${d0}" height="${T}" fill="${PAL.top}"/>
    <rect x="${d0 + DOOR}" y="${h - T}" width="${w - d0 - DOOR}" height="${T}" fill="${PAL.top}"/>
    <rect x="${d0 - 6}" y="${h - T - 4}" width="8" height="${T + 4}" rx="2" fill="${pal.trim}"/>
    <rect x="${d0 + DOOR - 2}" y="${h - T - 4}" width="8" height="${T + 4}" rx="2" fill="${pal.trim}"/>
  </svg>`;
}

/** A window on the north wall face, with sky, stars and a sill. Use inside wall art. */
export function windowArt(x: number, w: number, pal: Palette) {
  const top = T + 12, hh = WALL - T - 34;
  const stars = Array.from({ length: 7 }, (_, k) => `<circle cx="${x + 10 + ((k * 61) % (w - 20))}" cy="${top + 8 + ((k * 23) % (hh - 16))}" r="${k % 3 ? 1 : 1.6}" fill="#fff"/>`).join("");
  return `<rect x="${x - 6}" y="${top - 6}" width="${w + 12}" height="${hh + 12}" rx="6" fill="${pal.trim}"/>
    <rect x="${x}" y="${top}" width="${w}" height="${hh}" rx="3" fill="SKY"/>
    <g style="opacity:var(--stars, 0)">${stars}</g>
    <ellipse cx="${x + w * 0.3}" cy="${top + hh * 0.62}" rx="${w * 0.16}" ry="6" fill="#fff" opacity="0.55"/>
    <ellipse cx="${x + w * 0.38}" cy="${top + hh * 0.56}" rx="${w * 0.1}" ry="7" fill="#fff" opacity="0.55"/>
    <rect x="${x + w / 2 - 2}" y="${top}" width="4" height="${hh}" fill="${pal.trim}"/>
    <rect x="${x - 10}" y="${top + hh + 2}" width="${w + 20}" height="6" rx="3" fill="${pal.trim}"/>`;
}

/** A framed poster with a short line of robot humor. */
export function posterArt(x: number, y: number, w: number, h: number, bg: string, ink: string, lines: string[], icon = "") {
  const fs = 10;
  const ty = y + h / 2 - ((lines.length - 1) * (fs + 3)) / 2 + (icon ? 12 : 3);
  return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="4" fill="#3a3f4f" opacity="0.9"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${bg}"/>
    ${icon}
    ${lines.map((l, i) => `<text x="${x + w / 2}" y="${ty + i * (fs + 3)}" text-anchor="middle" font-family="var(--font)" font-size="${fs}" font-weight="600" fill="${ink}">${l}</text>`).join("")}`;
}

export function plantSvg(s = 1) {
  return `<g transform="scale(${s})">
    <ellipse cx="44" cy="96" rx="34" ry="9" fill="#2b1d10" opacity="0.18"/>
    <path d="M24 62 L64 62 L58 96 L30 96 Z" fill="#c86b4a"/><rect x="20" y="58" width="48" height="10" rx="4" fill="#d97c58"/>
    <path d="M44 62 C14 52 12 22 34 12 C34 34 40 48 44 62 Z" fill="#3f9b6e"/>
    <path d="M44 62 C72 50 82 26 62 8 C58 32 50 46 44 62 Z" fill="#53b884"/>
    <path d="M44 62 C24 64 6 54 4 36 C22 40 34 50 44 62 Z" fill="#46a877"/>
    <path d="M44 62 C64 66 84 56 86 40 C66 42 54 50 44 62 Z" fill="#3a8f63"/>
    <path d="M44 62 C42 40 46 20 50 2 C56 22 52 44 44 62 Z" fill="#5cc48d"/></g>`;
}

// ---- walking graph ------------------------------------------------------------------------------
export class Paths {
  /** `clear(a, b)`: whether a straight walk from a to b is free of furniture (optional). */
  constructor(private nodes: Record<string, Pt>, private edges: [string, string][], private clear?: (a: Pt, b: Pt) => boolean) {}

  /** The nearest node that can be reached in a straight line (the nearest one if none can). */
  private nearest(p: Pt) {
    const order = Object.entries(this.nodes).map(([k, n]) => [k, Math.hypot(n.x - p.x, n.y - p.y)] as const).sort((a, b) => a[1] - b[1]);
    if (this.clear) for (const [k] of order) if (this.clear(p, this.nodes[k])) return k;
    return order[0][0];
  }

  /** Can some node be reached from p in a straight line? */
  reaches(p: Pt) { return !this.clear || Object.values(this.nodes).some((n) => this.clear!(p, n)); }

  /** All nodes and edges (for debugging overlays). */
  get graph() { return { nodes: this.nodes, edges: this.edges }; }

  /** Waypoints from `a` to `b` along the graph (excluding `a`, including `b`). */
  route(a: Pt, b: Pt): Pt[] {
    const s = this.nearest(a), t = this.nearest(b);
    const dist: Record<string, number> = {}, prev: Record<string, string | null> = {};
    const q = new Set(Object.keys(this.nodes));
    for (const k of q) { dist[k] = Infinity; prev[k] = null; }
    dist[s] = 0;
    while (q.size) {
      let u = "", ud = Infinity;
      for (const k of q) if (dist[k] < ud) { ud = dist[k]; u = k; }
      if (!u || u === t) break;
      q.delete(u);
      for (const [x, y] of this.edges) {
        const v = x === u ? y : y === u ? x : null;
        if (!v || !q.has(v)) continue;
        const nd = ud + Math.hypot(this.nodes[u].x - this.nodes[v].x, this.nodes[u].y - this.nodes[v].y);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    const chain: Pt[] = [];
    for (let k: string | null = t; k; k = prev[k]) chain.unshift(this.nodes[k]);
    // skip the first node when we are already past it toward the second one (and can walk there directly)
    if (chain.length > 1) {
      const [n0, n1] = chain;
      if (Math.hypot(n1.x - a.x, n1.y - a.y) < Math.hypot(n1.x - n0.x, n1.y - n0.y) && (!this.clear || this.clear(a, n1))) chain.shift();
    }
    // and the last one when the goal is reachable straight from the one before it
    if (chain.length > 1 && this.clear) {
      const m = chain[chain.length - 2], l = chain[chain.length - 1];
      if (Math.hypot(b.x - m.x, b.y - m.y) < Math.hypot(l.x - m.x, l.y - m.y) && this.clear(m, b)) chain.pop();
    }
    if (chain.length && Math.hypot(chain[chain.length - 1].x - b.x, chain[chain.length - 1].y - b.y) < 2) chain.pop();
    return [...chain, b];
  }
}
