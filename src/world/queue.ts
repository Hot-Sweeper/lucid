import gsap from "gsap";
import { Walker } from "./walker";
import { PAL, RoomStage, WALL, plantSvg, posterArt, windowArt } from "./room";
import type { BreakThread, RoomExtension } from "./breakroom";

// The question line: robots with a question for you queue up in front of your desk (an empty
// human chair, a bell, a monitor, a plant). The front robot holds up a card with a short
// version of its question and taps the bell now and then; the others fidget. A robot whose
// question was answered waves and walks out.

const SCALE = 0.42;
const SPACING = 124;
const MAX = 9;

type Q = { id: string; w: Walker; alive: boolean; slot: number; question: string; timers: gsap.core.Tween[] };

export class QuestionLine implements RoomExtension {
  el: HTMLElement;
  onSelect: (id: string) => void = () => {};
  private stage: RoomStage;
  private line: Q[] = [];
  private $: Record<string, SVGElement> = {};
  private door: { x: number; y: number };
  private out: { x: number; y: number };
  private anims: gsap.core.Animation[] = [];

  constructor(host: HTMLElement, readonly w: number, readonly h: number) {
    this.stage = new RoomStage(host, w, h, { wall: "#ebe4ef", trim: "#d6cddd", floor: PAL.floor, seam: PAL.seam, accent: PAL.violet }, wallArt(w), "world-queue");
    this.el = this.stage.el;
    this.door = { x: w / 2, y: h - 52 };
    this.out = { x: w / 2, y: h + 70 };
    this.furnish();
  }

  private slotPos(i: number) {
    const cx = this.w / 2, first = 392;
    const perCol = Math.max(1, Math.floor((this.h - 70 - first) / SPACING) + 1);
    if (i < perCol) return { x: cx, y: first + i * SPACING };
    const j = i - perCol;
    return { x: cx + 165, y: first + 100 + (perCol - 1 - j) * SPACING }; // the line folds back up beside itself
  }

  setThreads(list: BreakThread[]) {
    const want = list.slice(0, MAX);
    const ids = new Set(want.map((t) => t.id));
    for (const q of [...this.line]) if (!ids.has(q.id)) void this.leave(q);
    for (const t of want) {
      const q = this.line.find((x) => x.id === t.id);
      const text = shortQuestion(t.question || t.title);
      if (q) {
        if (q.question !== text) { q.question = text; q.w.setCard(text); }
        if ((t.model ?? "") !== q.w.model) q.w.setModel(t.model);
        continue;
      }
      const w = new Walker(this.stage.layer, { id: t.id, provider: t.provider, model: t.model ?? undefined, name: t.name ?? t.title, scale: SCALE, look: (t as any).look });
      w.setPos(this.out.x, this.out.y + this.line.length * 20);
      w.face("up");
      w.setCard(text);
      w.el.addEventListener("click", (e) => { e.stopPropagation(); this.onSelect(t.id); });
      this.line.push({ id: t.id, w, alive: true, slot: -1, question: text, timers: [] });
    }
    this.reflow();
  }

  // Everyone walks to their place in line; the front robot holds up its card.
  private reflow() {
    const live = this.line.filter((q) => q.alive);
    live.forEach((q, i) => {
      if (q.slot === i) return;
      const was = q.slot;
      q.slot = i;
      for (const t of q.timers) t.kill();
      q.timers = [];
      const p = this.slotPos(i);
      const path = was < 0 ? [{ x: this.door.x, y: this.door.y }, p] : [p];
      gsap.delayedCall(was < 0 ? live.indexOf(q) * 0.25 : i * 0.18, async () => {
        await q.w.walkPath(path);
        if (!q.alive || q.slot !== i) return;
        q.w.face("up");
        this.settle(q);
      });
    });
  }

  private settle(q: Q) {
    if (q.slot === 0) {
      q.w.do("hold-card", { card: q.question });
      const tap = () => {
        if (!q.alive || q.slot !== 0) return;
        q.w.poke();
        gsap.delayedCall(0.22, () => this.ding());
        q.timers.push(gsap.delayedCall(6 + Math.random() * 5, tap));
      };
      q.timers.push(gsap.delayedCall(1.5 + Math.random() * 2, tap));
    } else {
      q.w.do("wait");
      if (Math.random() < 0.3) q.timers.push(gsap.delayedCall(3 + Math.random() * 6, () => q.alive && q.slot > 0 && q.w.say(pick(["Any minute now.", "Still here.", "I can wait. Probably.", "Is it my turn yet?"]))));
    }
  }

  private async leave(q: Q) {
    q.alive = false;
    for (const t of q.timers) t.kill();
    this.line = this.line.filter((x) => x !== q);
    q.w.calm();
    q.w.face("down");
    q.w.do("wave");
    q.w.say(pick(["Thanks!", "Got it, thank you!", "Back to work!", "Perfect, thanks!"]), 1600);
    gsap.delayedCall(0.6, () => this.reflow());
    await new Promise((r) => gsap.delayedCall(1.7, r));
    const side = { x: this.w / 2 + 120, y: q.w.y };
    await q.w.walkPath([side, { x: this.w / 2 + 120, y: this.door.y - 20 }, this.door, this.out]);
    q.w.destroy();
  }

  private ding() {
    const $ = this.$;
    gsap.timeline()
      .fromTo($.bell, { scaleY: 0.85, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.35, ease: "elastic.out(1.2, 0.4)" })
      .fromTo($.ding, { opacity: 1, scale: 0.7, transformOrigin: "50% 100%" }, { opacity: 0, scale: 1.3, duration: 0.6, ease: "power2.out" }, 0);
  }

  private furnish() {
    const st = this.stage, w = this.w;
    const keep = (svg: SVGSVGElement) => { for (const n of svg.querySelectorAll("[data-b]")) this.$[(n as SVGElement).dataset.b!] = n as SVGElement; };
    const cx = w / 2;
    // a runner mat along the line
    st.prop(cx - 48, 318, 96, this.h - 340, 1, `<rect width="96" height="${this.h - 340}" rx="8" fill="#7c6aa8" opacity="0.45"/><rect x="8" y="0" width="5" height="${this.h - 340}" fill="#ffffff" opacity="0.18"/><rect x="83" y="0" width="5" height="${this.h - 340}" fill="#ffffff" opacity="0.18"/>`);
    // your (empty) chair behind the desk, facing the line
    st.prop(cx - 46, WALL + 20, 92, 96, WALL + 100, /* svg */ `
      <ellipse cx="46" cy="90" rx="40" ry="6" fill="#2b1d10" opacity="0.18"/>
      <rect x="8" y="2" width="76" height="54" rx="16" fill="#4a5063"/><rect x="14" y="7" width="64" height="42" rx="12" fill="#565d73"/>
      <rect x="4" y="50" width="84" height="26" rx="12" fill="#3a3f4f"/><rect x="10" y="53" width="72" height="12" rx="6" fill="#4a5063"/>
      <rect x="42" y="74" width="8" height="12" fill="#3a3f4f"/>`);
    // the desk: monitor back, bell, plant, mug, nameplate
    keep(st.prop(cx - 200, 150, 400, 150, 292, /* svg */ `
      <ellipse cx="200" cy="146" rx="196" ry="6" fill="#2b1d10" opacity="0.18"/>
      <rect x="0" y="108" width="400" height="34" rx="8" fill="#9a7553"/>
      <rect x="0" y="54" width="400" height="66" rx="10" fill="#c99a6a"/>
      <rect x="8" y="58" width="384" height="4" rx="2" fill="#fff" opacity="0.25"/>
      <rect x="150" y="116" width="100" height="20" rx="5" fill="#f6efe3"/>
      <text x="200" y="130" text-anchor="middle" font-family="var(--font)" font-size="11" font-weight="600" fill="#3a3f4f">Your desk</text>
      <rect x="30" y="0" width="110" height="72" rx="9" fill="#3a3f4f"/><rect x="36" y="6" width="98" height="58" rx="6" fill="#4a5063"/>
      <circle cx="85" cy="35" r="9" fill="#5a6177"/>
      <rect x="77" y="70" width="16" height="10" fill="#3a3f4f"/><ellipse cx="85" cy="84" rx="24" ry="6" fill="#4a5063"/>
      <g data-b="bell"><ellipse cx="170" cy="94" rx="20" ry="5" fill="#8f7658"/><path d="M154 92 Q154 72 170 72 Q186 72 186 92 Z" fill="#ffc531"/><circle cx="170" cy="70" r="4" fill="#ffd96a"/><path d="M160 84 Q162 78 168 76" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.6" stroke-linecap="round"/></g>
      <g data-b="ding" opacity="0"><path d="M170 60 L170 50 M156 64 L150 56 M184 64 L190 56" stroke="#ffc531" stroke-width="3" stroke-linecap="round"/></g>
      <rect x="276" y="80" width="18" height="18" rx="5" fill="${PAL.blue}"/><ellipse cx="285" cy="81" rx="8" ry="3" fill="#6b3f2a"/>
      <rect x="226" y="70" width="40" height="28" rx="3" fill="#f6efe3" transform="rotate(-6 246 84)"/><rect x="232" y="78" width="26" height="2.5" rx="1.2" fill="#b9bfe6" transform="rotate(-6 246 84)"/><rect x="232" y="85" width="20" height="2.5" rx="1.2" fill="#b9bfe6" transform="rotate(-6 246 84)"/>
      <g transform="translate(320 6) scale(0.8)">${plantSvg(1)}</g>`));
    // queue posts with a soft rope
    const posts = [400, 650].map((y) => ({ x: cx - 70, y }));
    for (const p of posts) st.prop(p.x - 10, p.y - 52, 20, 60, p.y, `<ellipse cx="10" cy="56" rx="10" ry="3.5" fill="#3a3f4f"/><rect x="7" y="8" width="6" height="48" rx="3" fill="#c9a24a"/><circle cx="10" cy="7" r="6" fill="#e3bf5e"/>`);
    st.prop(cx - 72, 350, 4, 260, 350, `<path d="M2 6 Q-14 130 2 254" stroke="${PAL.pink}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85"/>`);
    // plants and a bench by the wall
    st.prop(22, this.h - 116, 90, 104, this.h - 16, plantSvg(1));
    st.prop(w - 106, WALL + 8, 90, 104, WALL + 110, plantSvg(0.95));
    st.prop(26, 330, 60, 220, 548, /* svg */ `
      <ellipse cx="34" cy="214" rx="28" ry="5" fill="#2b1d10" opacity="0.15"/>
      <rect x="6" y="4" width="22" height="206" rx="7" fill="#a8774f"/>
      <rect x="22" y="6" width="34" height="200" rx="10" fill="#c08a5c"/><rect x="28" y="10" width="8" height="190" rx="4" fill="#cf9b6d"/>`);
    this.anims.push(gsap.to(this.$.ding, { opacity: 0, duration: 0.01 }));
  }

  destroy() {
    for (const q of this.line) { for (const t of q.timers) t.kill(); q.w.destroy(); }
    this.line = [];
    for (const a of this.anims) a.kill();
    gsap.killTweensOf(Object.values(this.$));
    this.stage.destroy();
  }
}

/** A short version of a question for a hand-held card. */
export function shortQuestion(q: string) {
  const clean = q.replace(/\s+/g, " ").replace(/[`*_#>]/g, "").trim();
  const first = clean.split(/(?<=[?.!])\s/)[0] || clean;
  const s = first.length <= 72 ? first : first.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  return s;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function wallArt(w: number) {
  const pal = { wall: "#ebe4ef", trim: "#d6cddd", floor: PAL.floor, seam: PAL.seam, accent: PAL.violet };
  return /* svg */ `
    ${posterArt(40, 22, 110, 66, "#2c3352", "#ffffff", ["Your question", "is important", "to us"])}
    ${windowArt(w / 2 - 90, 180, pal)}
    ${posterArt(w - 150, 22, 110, 66, PAL.violet, "#ffffff", ["No question", "is too small.", "Except 0 bytes."])}`;
}
