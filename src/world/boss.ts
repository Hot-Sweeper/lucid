import gsap from "gsap";
import { Walker } from "../robot/walker/walker";
import type { RobotLook } from "../robot/rig";
import { line } from "../lines";

// The orchestrator (your stand-in) at the big desk in the questions room: it sits in the chair
// facing the line, types in bursts, glances at its monitor and at whoever waits, waves at robots
// that arrive, and when a run of its own ends it stamps the paper on the desk. No orchestrator:
// the chair stays empty.

export type BossInfo = { id: string; provider: string; model?: string | null; name?: string; look?: RobotLook; running: boolean };
export type BossDesk = {
  /** where the robot's feet are (hidden under the desk) and the far edge of the desk top */
  seat: { x: number; y: number }; edge: number; z: number;
  monitorX: number;
  glow?: SVGElement; mark?: SVGElement;
};

const SCALE = 0.42;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Boss {
  w: Walker | null = null;
  onSelect: (id: string) => void = () => {};
  /** where the robots in line stand, front first (for glances) */
  visitors: () => { x: number; y: number }[] = () => [];
  private running = false;
  private presence: "awake" | "sleep" | "away" = "awake";
  private info: BossInfo | null = null;
  private sleeping = false;
  private life: gsap.core.Tween | null = null;
  private busyUntil = 0;
  private glowAnim: gsap.core.Animation | null = null;
  // a robot's question is with the orchestrator right now (delegate.ts): it reads instead of idling
  private deciding = false;
  private readLoop: gsap.core.Tween | null = null;
  private quietUntil = 0;   // its run ended with a decision: no extra "Done." stamp for that run

  constructor(private layer: HTMLElement, private desk: BossDesk) {}

  set(info: BossInfo | null) {
    this.info = info;
    if (!info || this.presence === "away") { this.clear(); return; }
    if (this.w && this.w.id !== info.id) this.clear();
    if (!this.w) {
      const w = new Walker(this.layer, { id: info.id, provider: info.provider, model: info.model ?? undefined, name: info.name, scale: SCALE, look: info.look });
      w.el.classList.add("world-boss");
      w.el.setAttribute("role", "button");
      w.el.setAttribute("tabindex", "0");
      w.el.setAttribute("aria-label", "Chat with the Orchestrator");
      w.el.title = "Chat with the Orchestrator";
      w.setPos(this.desk.seat.x, this.desk.seat.y);
      w.face("down");
      w.setDeskEdge(this.desk.edge, this.desk.z - Math.round(this.desk.seat.y));
      w.do("type");
      w.el.addEventListener("click", (e) => { e.stopPropagation(); this.onSelect(info.id); });
      w.el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.onSelect(info.id); }
      });
      this.w = w;
      this.running = false;
      if (!reduced()) this.scheduleLife();
    } else {
      if ((info.model ?? "") !== this.w.model) this.w.setModel(info.model);
      if (info.look) this.w.setLook(info.look);
      if (info.name) this.w.setName(info.name);
    }
    if(this.presence === "sleep") {
      if(!this.sleeping) {
        this.read(null);this.life?.kill();this.glowAnim?.kill();
        if(this.desk.glow)gsap.set(this.desk.glow,{opacity:0});
        this.w.do("nap");this.sleeping=true;
      }
      return;
    }
    if(this.sleeping) { this.sleeping=false;this.running=info.running;this.setRunning(info.running);if(!reduced())this.scheduleLife(); }
    if (info.running !== this.running) this.setRunning(info.running);
  }

  setPresence(presence: "awake" | "sleep" | "away") {
    if(this.presence===presence)return;
    this.presence=presence;this.set(this.info);
  }

  /** A robot just took its place in line: look over and wave. */
  greet(x: number, y: number) {
    const w = this.w;
    if (!w || this.presence !== "awake" || reduced() || this.deciding || performance.now() < this.busyUntil) return;
    this.busyUntil = performance.now() + 2200;
    this.look(x, y, 1.6);
    gsap.delayedCall(0.3, () => this.w === w && this.presence === "awake" && w.greet());
  }

  /** The bell rang: a quick look at whoever rang it. */
  heard(x: number, y: number) {
    if (!this.w || this.presence !== "awake" || reduced() || this.deciding || performance.now() < this.busyUntil) return;
    this.look(x, y, 0.9);
  }

  private look(x: number, y: number, hold: number) {
    const w = this.w;
    if (!w) return;
    w.glance((x - w.x) / 90, Math.min(1, Math.max(-0.3, (y - w.y) / 160)), hold);
  }

  // Busy: types faster, leans in, the monitor glows. Done: a stamp on the paper and a nod.
  private setRunning(on: boolean) {
    const w = this.w!, was = this.running;
    this.running = on;
    w.mashRate = on ? 2.4 : 1;
    w.do("type");
    const g = this.desk.glow;
    this.glowAnim?.kill();
    if (g) this.glowAnim = on
      ? (reduced() ? gsap.to(g, { opacity: 0.85, duration: 0.3 }) : gsap.fromTo(g, { opacity: 0.55 }, { opacity: 0.95, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 }))
      : gsap.to(g, { opacity: 0, duration: 0.8, ease: "power2.out" });
    if (on && !reduced()) { this.busyUntil = performance.now() + 1500; w.glance(-1, 0.3, 1); }
    if (!on && was && !this.deciding && performance.now() > this.quietUntil) this.done();
  }

  /** While the decision is actually in flight: it turns to the robot (`at` gives where it stands)
   *  and reads its card, glancing at its screen in between. Null stops reading. */
  read(at: (() => { x: number; y: number } | null) | null) {
    if(at && this.presence!=="awake")return;
    this.readLoop?.kill();
    this.readLoop = null;
    const w = this.w;
    this.deciding = !!at;
    if (!w) return;
    if (!at) { w.setExpression("neutral"); return; }
    w.setExpression("focus");
    const loop = (i: number) => {
      if (this.w !== w || !this.deciding) return;
      const p = at();
      if (i % 3 !== 2 && p) this.look(p.x, p.y, 1.5); else w.glance(-1, 0.25, 1.1);
      this.readLoop = gsap.delayedCall(2.2, () => loop(i + 1));
    };
    if (reduced()) { const p = at(); if (p) this.look(p.x, p.y, 2); } else loop(0);
  }

  /** It answered for you: a stamp on the paper and a nod toward the robot. */
  answered(at: { x: number; y: number } | null) {
    if(this.presence!=="awake")return;
    this.read(null);
    const w = this.w;
    if (!w) return;
    this.quietUntil = performance.now() + 20000;
    this.busyUntil = performance.now() + 3200;
    if (reduced()) { w.setExpression("happy"); gsap.delayedCall(1.6, () => this.w === w && w.setExpression("neutral")); return; }
    w.stamp(() => this.thunk()).add(() => {
      w.setExpression("happy");
      if (at) this.look(at.x, at.y, 1.2);
      w.nodYes();
      gsap.delayedCall(1.8, () => this.w === w && w.setExpression("neutral"));
    });
  }

  /** It was not sure (or may not answer this kind): a shake of the head, then it points at you. */
  passed() {
    if(this.presence!=="awake")return;
    this.read(null);
    const w = this.w;
    if (!w) return;
    this.quietUntil = performance.now() + 20000;
    this.busyUntil = performance.now() + 3600;
    w.setExpression("shy");
    gsap.delayedCall(2.8, () => this.w === w && w.setExpression("neutral"));
    w.say(line("bossHandoff", w), 2200);
    if (reduced()) return;
    w.shakeNo().add(() => { if (this.w === w) w.pointAtYou(1.2); });
  }

  private done() {
    const w = this.w!;
    if (reduced()) { w.setExpression("happy"); gsap.delayedCall(1.6, () => this.w === w && w.setExpression("neutral")); return; }
    this.busyUntil = performance.now() + 3000;
    w.stamp(() => this.thunk()).add(() => {
      w.setExpression("happy");
      w.nodYes();
      w.say(line("bossAck", w), 1500);
      gsap.delayedCall(1.6, () => this.w === w && w.setExpression("neutral"));
    });
  }

  private thunk() {
    const m = this.desk.mark;
    if (!m) return;
    gsap.killTweensOf(m);
    gsap.timeline()
      .fromTo(m, { opacity: 0.95, scale: 1.25, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.18, ease: "power2.out" })
      .to(m, { opacity: 0, duration: 1.2, ease: "power1.in" }, "+=3");
  }

  // between reactions: glance at the monitor, at the line, around the room, lean back and stretch
  private scheduleLife() {
    this.life = gsap.delayedCall(rnd(2.5, 6), () => {
      const w = this.w;
      if (!w) return;
      if (performance.now() >= this.busyUntil && !this.deciding) {
        const r = Math.random(), line = this.visitors();
        if (r < 0.35) w.glance(-1, 0.25, rnd(0.8, 2));
        else if (r < 0.6 && line.length) { const v = line[0]; this.look(v.x, v.y, rnd(0.8, 1.6)); }
        else if (r < 0.82) w.glance(rnd(-0.8, 0.8), rnd(-0.4, 0.3), rnd(0.6, 1.2));
        else if (!this.running) w.nodYes();
      }
      this.scheduleLife();
    });
  }

  clear() {
    this.sleeping = false;
    this.readLoop?.kill();
    this.readLoop = null;
    this.deciding = false;
    this.life?.kill();
    this.life = null;
    this.glowAnim?.kill();
    if (this.desk.glow) gsap.set(this.desk.glow, { opacity: 0 });
    this.w?.destroy();
    this.w = null;
    this.running = false;
  }
}
