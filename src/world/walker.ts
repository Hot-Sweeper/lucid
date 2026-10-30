import gsap from "gsap";
import type { Expression, RobotLook } from "../office/rig";
import { bind, brandFor, clamp, defsSvg, eyesSvg, headSideSvg, headSvg, lerp, paintBrand, paintLook, uid, type BrandKind } from "./parts";

// The v0 robot standing on the top-down floor. Facing up shows the v0 back (logo, antenna),
// facing down the v0 face, left and right a side view. Drawn in v0 coordinates; the element's
// origin is the point between its feet, so `x, y` are floor coordinates of the room it is in.

export type Facing = "up" | "down" | "left" | "right";
export type Activity =
  | "idle" | "talk" | "laugh" | "eat" | "drink" | "charge" | "nap" | "wave" | "wait"
  | "hold-card" | "sit" | "explain" | "listen";

export interface WalkerOptions { id: string; provider: string; name?: string; model?: string; scale?: number; look?: RobotLook }

const FEET = { x: 560, y: 905 };
const VB = { x: 400, y: 500, w: 320, h: 440 };
const SH_FB = { l: { x: 500, y: 748 }, r: { x: 620, y: 748 } };
const SH_SIDE = { x: 560, y: 750 };
const HIP_FB = { l: { x: 536, y: 846 }, r: { x: 584, y: 846 } };
const HIP_SIDE = { x: 560, y: 846 };
const UPPER = 46, FORE = 44;
const SPEED = 110; // px per second
const HANG_A = 0.42, HANG_B = -0.22; // arms hanging slightly out, clear of the torso

type ArmPose = { a: number; b: number };
export type Prop = "none" | "mug" | "bowl" | "spoon" | "card" | "wrist";

const PROPS: Record<Prop, string> = {
  none: "",
  mug: `<path d="M12 -20 q13 0 13 10 q0 10 -13 10" stroke="#e8673c" stroke-width="6" fill="none"/><rect x="-15" y="-30" width="28" height="32" rx="8" fill="#ff8a65"/><ellipse cx="-1" cy="-29" rx="12" ry="4.5" fill="#5a2b1e"/>`,
  bowl: `<ellipse cx="0" cy="-6" rx="32" ry="9" fill="#ffd27a"/><path d="M-32 -6 Q-30 24 0 26 Q30 24 32 -6 Q0 4 -32 -6 Z" fill="#4fb6ff"/><path d="M-14 -10 q6 -6 12 0 q6 -6 12 0" stroke="#f0b04a" stroke-width="3" fill="none"/>`,
  spoon: `<rect x="-3" y="-44" width="6" height="40" rx="3" fill="#d8dde8"/><ellipse cx="0" cy="-48" rx="8" ry="10" fill="#e6eaf2"/>`,
  card: "",
  wrist: `<rect x="-15" y="-34" width="30" height="20" rx="6" fill="var(--visor)"/><rect class="world-wrist" x="-10" y="-30" width="20" height="12" rx="3" fill="var(--glow)"/>`,
};

const sleep = (sec: number) => new Promise<void>((r) => gsap.delayedCall(sec, r));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class Walker {
  el: HTMLDivElement;
  readonly id: string;
  x = 0;
  y = 0;
  brand: BrandKind;
  name: string;
  model: string;
  facing: Facing = "down";
  activity: Activity = "idle";
  private s: number;
  private svg: SVGSVGElement;
  private $: Record<string, SVGElement> = {};
  private bubble: HTMLDivElement;
  private card: HTMLDivElement;
  private battery: HTMLDivElement;
  private st = {
    phase: 0, stride: 0, bob: 0, headLag: 0, sway: 0, lean: 0, jump: 0, sit: 0, nod: 0, tilt: 0, shake: 0, shrug: 0,
    la: HANG_A, lb: HANG_B, ra: HANG_A, rb: HANG_B, lFwd: 0, rFwd: 0, breath: 0, tapFoot: 0, dim: 0,
  };
  private expr: Expression = "neutral";
  private propL: Prop = "none";
  private propR: Prop = "none";
  private act: gsap.core.Animation | null = null;
  private actTimers: gsap.core.Tween[] = [];
  private walkTween: gsap.core.Tween | null = null;
  private walkDone: (() => void) | null = null;
  private walking = false;
  private loops: gsap.core.Animation[] = [];
  private zTimer = 0;
  private sayTimer: gsap.core.Tween | null = null;
  private blinkTl: gsap.core.Timeline;
  private gen = 0;

  constructor(parent: Element, opts: WalkerOptions) {
    this.id = opts.id;
    this.s = opts.scale ?? 0.48;
    this.brand = brandFor(opts.provider);
    this.name = opts.name ?? "";
    this.model = opts.model ?? "";
    const sid = uid("wk");
    const el = document.createElement("div");
    el.className = "world-walker";
    el.dataset.id = opts.id;
    el.innerHTML = `${WALKER_SVG(sid, this.s)}
      <div class="world-card" aria-hidden="true"><span></span></div>
      <div class="world-battery" aria-hidden="true"><i></i></div>
`;
    parent.appendChild(el);
    this.bubble = document.createElement("div");
    this.bubble.className = "world-say";
    this.bubble.setAttribute("role", "status");
    this.bubble.innerHTML = "<p></p>";
    parent.appendChild(this.bubble);
    this.el = el;
    this.svg = el.querySelector("svg")!;
    this.$ = bind(this.svg);
    this.card = el.querySelector(".world-card")!;
    this.battery = el.querySelector(".world-battery")!;
    const top = (FEET.y - 560) * this.s;
    el.style.setProperty("--head-top", `${top}px`);
    paintBrand(this.svg, this.$, this.brand);
    if (opts.look) paintLook(this.svg, this.$, opts.look);
    this.setModel(this.model);
    this.updateTitle();
    this.setExpression("neutral");
    this.loops.push(gsap.to(this.st, { breath: 1, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: Math.random() * 2 }));
    this.loops.push(gsap.to([this.$.antennaGlow, this.$.sideGlow], { opacity: 0.5, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    this.blinkTl = gsap.timeline({ repeat: -1, repeatDelay: 2.4 + Math.random() * 2, delay: Math.random() * 3 })
      .to([this.$.eyes, this.$.eyesGlow, this.$.sideEyes, this.$.sideEyesGlow], { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" })
      .to([this.$.eyes, this.$.eyesGlow, this.$.sideEyes, this.$.sideEyesGlow], { scaleY: 1, duration: 0.1 });
    this.face("down");
    gsap.ticker.add(this.frame);
    this.place();
  }

  setBrand(provider: string) { this.brand = brandFor(provider); paintBrand(this.svg, this.$, this.brand); }
  setLook(look: RobotLook) { paintLook(this.svg, this.$, look); }
  setName(name: string) { this.name = name; this.updateTitle(); }
  setModel(model: string | null | undefined) {
    this.model = model ?? "";
    const t = this.$.model as SVGTextElement;
    t.textContent = this.model.length > 18 ? this.model.slice(0, 17) + "…" : this.model;
    this.$.nameplate.style.display = this.model ? "" : "none";
    const w = clamp(t.textContent!.length * 7.2 + 16, 40, 132);
    this.$.plate.setAttribute("x", String(560 - w / 2));
    this.$.plate.setAttribute("width", String(w));
    this.updateTitle();
  }
  private updateTitle() { this.el.title = [this.name, this.model].filter(Boolean).join(", "); }

  /** Height of the robot above its feet, in px (for placing things over its head). */
  get height() { return (FEET.y - 556) * this.s; }

  setPos(x: number, y: number) { this.x = x; this.y = y; this.place(); }

  private place() {
    this.el.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px)`;
    this.el.style.zIndex = String(Math.round(this.y) + (this.st.sit > 0.5 ? -2 : 0));
  }

  face(dir: Facing) {
    this.facing = dir;
    const fb = dir === "up" || dir === "down";
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    show("fbBody", fb); show("sideBody", !fb);
    show("fbHead", fb); show("sideHead", !fb);
    show("backPlate", dir === "up"); show("chest", dir === "down");
    this.$.face.setAttribute("opacity", dir === "down" ? "1" : "0");
    this.$.flip.setAttribute("transform", dir === "left" ? "translate(1120 0) scale(-1 1)" : "");
    this.layerArms();
  }

  // ---- walking ------------------------------------------------------------------------------
  walkTo(x: number, y: number): Promise<void> {
    this.walkDone?.();
    this.walkTween?.kill();
    const dx = x - this.x, dy = y - this.y, dist = Math.hypot(dx, dy);
    if (dist < 1.5) { this.setPos(x, y); return Promise.resolve(); }
    this.calm();
    this.face(Math.abs(dx) > Math.abs(dy) * 0.9 ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    this.walking = true;
    gsap.to(this.st, { stride: 1, duration: 0.2, ease: "power2.out", overwrite: "auto" });
    return new Promise<void>((resolve) => {
      const finish = () => {
        this.walkDone = null;
        this.walking = false;
        gsap.to(this.st, { stride: 0, duration: 0.22, ease: "power2.out", overwrite: "auto" });
        resolve();
      };
      this.walkDone = finish;
      this.walkTween = gsap.to(this, {
        x, y, duration: dist / SPEED, ease: "none",
        onUpdate: () => this.place(),
        onComplete: finish,
      });
    });
  }

  /** Walk a list of points in order. */
  async walkPath(pts: { x: number; y: number }[]) {
    const g = ++this.gen;
    for (const p of pts) {
      if (g !== this.gen) return;
      await this.walkTo(p.x, p.y);
    }
  }

  stop() { this.gen++; this.walkTween?.kill(); this.walkDone?.(); }

  // ---- activities ---------------------------------------------------------------------------
  /** Stop the current activity but keep whatever the hands carry. */
  calm() {
    this.activity = "idle";
    this.act?.kill();
    this.act = null;
    for (const t of this.actTimers) t.kill();
    this.actTimers = [];
    window.clearInterval(this.zTimer);
    this.zTimer = 0;
    this.card.classList.remove("on");
    this.battery.classList.remove("on");
    const r = this.propR === "mug" || this.propR === "spoon" ? { ra: 0.25, rb: 1.5 } : { ra: HANG_A, rb: HANG_B };
    const l = this.propL === "bowl" ? { la: 0.25, lb: 1.8 } : { la: HANG_A, lb: HANG_B };
    gsap.to(this.st, { ...l, ...r, lFwd: 0, rFwd: 0, nod: 0, tilt: 0, shrug: 0, sit: 0, shake: 0, sway: 0, tapFoot: 0, dim: 0, duration: 0.3, ease: "power2.out", overwrite: "auto" });
    if (this.expr === "sleepy" || this.expr === "laugh") this.setExpression("neutral");
  }

  /** Put things in its hands (kept while walking). */
  hold(l: Prop, r: Prop) { this.setProps(l, r); this.calmArms(); }
  private calmArms() {
    if (this.activity !== "idle") return;
    const r = this.propR === "mug" || this.propR === "spoon" ? { ra: 0.25, rb: 1.5 } : { ra: HANG_A, rb: HANG_B };
    const l = this.propL === "bowl" ? { la: 0.25, lb: 1.8 } : { la: HANG_A, lb: HANG_B };
    gsap.to(this.st, { ...l, ...r, duration: 0.3, ease: "power2.out", overwrite: "auto" });
  }

  do(activity: Activity, opts: { card?: string; keep?: boolean } = {}) {
    this.activity = activity;
    this.act?.kill();
    this.act = null;
    for (const t of this.actTimers) t.kill();
    this.actTimers = [];
    window.clearInterval(this.zTimer);
    this.zTimer = 0;
    if (!opts.keep) this.setProps("none", "none");
    this.card.classList.remove("on");
    this.battery.classList.remove("on");
    const st = this.st;
    const base = { la: HANG_A, lb: HANG_B, ra: HANG_A, rb: HANG_B, lFwd: 0, rFwd: 0, nod: 0, tilt: 0, shrug: 0, lean: 0, shake: 0, sway: 0, tapFoot: 0 };
    const to = (v: Partial<typeof base> & { sit?: number; dim?: number }, d = 0.45) => gsap.to(st, { ...v, duration: d, ease: "power2.inOut", overwrite: "auto" });
    const loop = (fn: () => gsap.core.Animation | void, every: () => number) => {
      const tick = () => { fn(); this.actTimers.push(gsap.delayedCall(every(), tick)); };
      this.actTimers.push(gsap.delayedCall(0.3 + Math.random() * 0.6, tick));
    };
    to({ ...base, sit: activity === "sit" || activity === "nap" || activity === "eat" ? st.sit : 0, dim: 0 });
    if (activity !== "laugh" && activity !== "nap" && (this.expr === "laugh" || this.expr === "sleepy")) this.setExpression("neutral");

    switch (activity) {
      case "idle":
        this.calmArms();
        loop(() => {
          const r = Math.random();
          if (r < 0.4) return gsap.timeline().to(st, { tilt: pick([-7, 7]), duration: 0.6, ease: "power2.inOut" }).to(st, { tilt: 0, duration: 0.6, ease: "power2.inOut" }, "+=0.9");
          if (r < 0.7) return gsap.timeline().to(st, { sway: pick([-1, 1]), duration: 0.8, ease: "sine.inOut" }).to(st, { sway: 0, duration: 0.8, ease: "sine.inOut" }, "+=1.2");
          return gsap.timeline().to(st, { ra: 0.3, rb: 1.2, duration: 0.4 }).to(st, { ra: HANG_A, rb: HANG_B, duration: 0.5 }, "+=0.8");
        }, () => 2.5 + Math.random() * 3);
        break;
      case "talk":
        loop(() => {
          const side = Math.random() < 0.5 ? "r" : "l";
          return gsap.timeline()
            .to(st, { [side + "a"]: 0.5 + Math.random() * 0.4, [side + "b"]: 1.1 + Math.random() * 0.5, nod: 4, duration: 0.3, ease: "power2.out" })
            .to(st, { [side + "b"]: 0.7, nod: 0, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" })
            .to(st, { [side + "a"]: HANG_A, [side + "b"]: HANG_B, duration: 0.4, ease: "power2.inOut" });
        }, () => 1.1 + Math.random() * 0.9);
        break;
      case "explain":
        loop(() => {
          const side = Math.random() < 0.55 ? "r" : "l";
          const other = side === "r" ? "l" : "r";
          return gsap.timeline()
            .to(st, { [side + "a"]: 0.9 + Math.random() * 0.5, [side + "b"]: 0.9, [other + "a"]: 0.35, [other + "b"]: 1.3, nod: 3, duration: 0.35, ease: "back.out(1.6)" })
            .to(st, { [side + "b"]: 0.5, duration: 0.22, yoyo: true, repeat: 1, ease: "sine.inOut" })
            .to(st, { nod: 0, duration: 0.3 }, "<");
        }, () => 0.9 + Math.random() * 0.6);
        break;
      case "listen":
        to({ tilt: 6, la: 0.3, ra: 0.3 });
        loop(() => gsap.timeline().to(st, { nod: 7, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 3 }), () => 1.4 + Math.random() * 1.2);
        break;
      case "laugh":
        this.setExpression("laugh");
        to({ la: -0.15, lb: 1.9, ra: -0.15, rb: 1.9, tilt: -4 });
        this.act = gsap.to(st, { shake: 1, duration: 0.07, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.actTimers.push(gsap.delayedCall(1.8, () => { if (this.activity === "laugh") { this.act?.kill(); gsap.to(st, { shake: 0, duration: 0.2 }); } }));
        break;
      case "eat":
        this.setProps("bowl", "spoon");
        to({ la: 0.25, lb: 1.8, ra: 0.2, rb: 1.2 });
        loop(() => gsap.timeline().to(st, { ra: 0.35, rb: 2.35, rFwd: 1, duration: 0.35, ease: "power2.inOut" }).to(st, { nod: 4, duration: 0.15, yoyo: true, repeat: 1 }).to(st, { ra: 0.2, rb: 1.2, rFwd: 0, duration: 0.35, ease: "power2.inOut" }), () => 1.3 + Math.random() * 0.8);
        break;
      case "drink":
        this.setProps("none", "mug");
        to({ ra: 0.25, rb: 1.5 });
        loop(() => gsap.timeline().to(st, { ra: 0.4, rb: 2.4, rFwd: 1, tilt: -5, duration: 0.45, ease: "power2.inOut" }).to(st, { ra: 0.25, rb: 1.5, rFwd: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=0.8"), () => 3 + Math.random() * 2);
        break;
      case "charge":
        this.battery.classList.add("on");
        to({ la: 0.3, ra: 0.3, lb: -0.1, rb: -0.1 });
        this.act = gsap.fromTo(this.battery.querySelector("i"), { scaleX: 0.15 }, { scaleX: 1, duration: 14, ease: "none", transformOrigin: "0 50%", repeat: -1, repeatDelay: 1 });
        loop(() => gsap.timeline().to(st, { tilt: pick([-5, 5]), duration: 1.2, ease: "sine.inOut" }).to(st, { tilt: 0, duration: 1.2, ease: "sine.inOut" }), () => 4 + Math.random() * 3);
        break;
      case "nap":
        this.setExpression("sleepy");
        to({ sit: 1, la: 0.05, ra: 0.05, lb: 0.6, rb: 0.6, tilt: 9, dim: 1 }, 1.2);
        this.act = gsap.to(st, { nod: 5, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.zTimer = window.setInterval(() => this.spawnZ(), 1600);
        this.spawnZ();
        break;
      case "wave":
        this.act = gsap.timeline()
          .to(st, { ra: 2.5, rb: 0.5, duration: 0.35, ease: "back.out(1.6)" })
          .to(st, { rb: -0.3, duration: 0.22, yoyo: true, repeat: 5, ease: "sine.inOut" })
          .to(st, { ra: HANG_A, rb: HANG_B, duration: 0.4, ease: "power2.inOut" });
        if (this.expr === "neutral") { this.setExpression("happy"); this.actTimers.push(gsap.delayedCall(2.2, () => this.expr === "happy" && this.setExpression("neutral"))); }
        break;
      case "wait":
        loop(() => {
          const r = Math.random();
          if (r < 0.3) { // check the wrist display
            this.setProps("wrist", this.propR);
            return gsap.timeline().to(st, { la: 0.5, lb: 1.9, lFwd: 1, tilt: 6, nod: 4, duration: 0.45, ease: "power2.inOut" })
              .to(st, { la: HANG_A, lb: HANG_B, lFwd: 0, tilt: 0, nod: 0, duration: 0.45, ease: "power2.inOut" }, "+=1.3")
              .add(() => this.setProps("none", this.propR));
          }
          if (r < 0.55) return gsap.timeline().to(st, { sway: pick([-1, 1]), duration: 0.6, ease: "sine.inOut" }).to(st, { sway: 0, duration: 0.7, ease: "sine.inOut" }, "+=1.4");
          if (r < 0.8) { // sigh
            this.puff();
            return gsap.timeline().to(st, { shrug: 6, duration: 0.6, ease: "sine.out" }).to(st, { shrug: -2, tilt: 4, duration: 0.8, ease: "sine.inOut" }).to(st, { shrug: 0, tilt: 0, duration: 0.6 });
          }
          return gsap.timeline().to(st, { tapFoot: 1, duration: 0.14, yoyo: true, repeat: 7, ease: "sine.inOut" });
        }, () => 2.2 + Math.random() * 2.2);
        break;
      case "hold-card":
        if (opts.card != null) this.setCard(opts.card);
        this.card.classList.add("on");
        to({ la: 0.3, lb: 1.5, ra: 2.85, rb: 0.1 }, 0.5);
        this.act = gsap.to(this.card, { y: -3, duration: 1.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
        break;
      case "sit":
        to({ sit: 1, la: 0.2, lb: 1.1, ra: 0.2, rb: 1.1 }, 0.6);
        loop(() => gsap.timeline().to(st, { tilt: pick([-5, 5, 0]), duration: 0.8, ease: "sine.inOut" }), () => 3 + Math.random() * 3);
        break;
    }
  }

  /** Reach forward with the right hand (taps a bell, presses a button), then return. */
  poke() {
    const st = this.st;
    if (this.activity === "hold-card") {
      // the card hand stays up, the free hand taps
      gsap.timeline().to(st, { la: 0.5, lb: 0.9, lFwd: 1.4, duration: 0.2, ease: "power2.out" })
        .to(st, { lFwd: 1.7, duration: 0.07, yoyo: true, repeat: 1 })
        .to(st, { la: 0.3, lb: 1.5, lFwd: 0, duration: 0.35, ease: "power2.inOut" });
      return;
    }
    gsap.timeline().to(st, { ra: 0.5, rb: 1.2, rFwd: 1.4, duration: 0.2, ease: "power2.out" })
      .to(st, { rFwd: 1.7, duration: 0.07, yoyo: true, repeat: 1 })
      .to(st, { ra: HANG_A, rb: HANG_B, rFwd: 0, duration: 0.35, ease: "power2.inOut" });
  }

  /** High five toward the side it faces. */
  highFive() {
    const st = this.st;
    return gsap.timeline().to(st, { ra: 2.3, rb: 0.2, duration: 0.3, ease: "back.out(2)" }).to(st, { ra: 2.1, duration: 0.08, yoyo: true, repeat: 1 }).to(st, { ra: HANG_A, rb: HANG_B, duration: 0.45, ease: "power2.inOut" }, "+=0.3");
  }

  hop() { gsap.timeline().to(this.st, { jump: 1, duration: 0.16, ease: "power2.out" }).to(this.st, { jump: 0, duration: 0.3, ease: "bounce.out" }); }

  setCard(text: string) { this.card.querySelector("span")!.textContent = text; this.card.title = text; }

  setExpression(e: Expression) {
    this.expr = e;
    const fb = eyesSvg(e), side = eyesSvg(e, [604]);
    this.$.eyes.innerHTML = fb; this.$.eyesGlow.innerHTML = fb;
    this.$.sideEyes.innerHTML = side; this.$.sideEyesGlow.innerHTML = side;
  }

  say(text: string | null, ms?: number) {
    this.sayTimer?.kill();
    const b = this.bubble, p = b.querySelector("p")!;
    if (!text) {
      if (b.classList.contains("on")) gsap.to(p, { opacity: 0, y: 6, duration: 0.2, ease: "power2.in", onComplete: () => b.classList.remove("on") });
      return;
    }
    p.textContent = text;
    const was = b.classList.contains("on");
    b.classList.add("on");
    this.placeBubble();
    if (!was) gsap.fromTo(p, { opacity: 0, y: 8, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" });
    else gsap.fromTo(p, { scale: 0.96 }, { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
    const dur = ms ?? 1400 + text.length * 55;
    this.sayTimer = gsap.delayedCall(dur / 1000, () => this.say(null));
  }

  private setProps(l: Prop, r: Prop) {
    this.propL = l; this.propR = r;
    this.$.propL.innerHTML = PROPS[l];
    this.$.propR.innerHTML = PROPS[r];
  }

  private spawnZ() {
    const z = document.createElement("span");
    z.className = "world-z";
    z.textContent = "z";
    this.el.appendChild(z);
    const h = this.height * (1 - this.st.sit * 0.2);
    gsap.set(z, { x: 14, y: -h + 10, opacity: 0, scale: 0.6, rotation: -10 });
    gsap.timeline({ onComplete: () => z.remove() })
      .to(z, { opacity: 0.9, duration: 0.5 })
      .to(z, { x: 40 + Math.random() * 20, y: -h - 50, scale: 1.3, rotation: 12, duration: 3, ease: "sine.inOut" }, 0)
      .to(z, { opacity: 0, duration: 0.9, ease: "sine.in" }, 2.1);
  }

  private puff() {
    const p = document.createElement("span");
    p.className = "world-puff";
    this.el.appendChild(p);
    const h = this.height;
    const dx = this.facing === "left" ? -30 : this.facing === "right" ? 30 : 0;
    gsap.set(p, { x: dx, y: -h * 0.55, opacity: 0, scale: 0.4 });
    gsap.timeline({ onComplete: () => p.remove() })
      .to(p, { opacity: 0.8, scale: 1, x: dx * 1.6, y: -h * 0.62, duration: 0.6, ease: "power2.out" })
      .to(p, { opacity: 0, scale: 1.3, duration: 0.6 });
  }

  // ---- per frame ----------------------------------------------------------------------------------
  private layerArms() {
    // In the side view the far arm is behind the body; facing up both arms are seen from behind,
    // so they hang beside the body; facing down they are in front.
    const back = this.$.armsBack, front = this.$.armsFront;
    const side = this.facing === "left" || this.facing === "right";
    if (side) { back.appendChild(this.$.armL); front.appendChild(this.$.armR); }
    else { front.appendChild(this.$.armL); front.appendChild(this.$.armR); }
  }

  private last = performance.now();
  private frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const st = this.st;
    if (this.walking) st.phase += dt * 9.2;
    const stride = st.stride;
    const step = Math.sin(st.phase);
    const bob = Math.abs(Math.cos(st.phase)) * 7 * stride;
    st.headLag += (bob - st.headLag) * Math.min(1, dt * 9);   // head trails the body a little
    const sitDrop = st.sit * 40;
    const jump = st.jump * 26;
    const breath = st.breath * 2.2;
    const shakeX = st.shake * 3;
    const swayX = st.sway * 5;
    const bodyY = -bob - jump + sitDrop - breath * 0.5;
    const side = this.facing === "left" || this.facing === "right";

    // legs
    if (!side) {
      for (const k of ["l", "r"] as const) {
        const hip = HIP_FB[k], sgn = k === "l" ? -1 : 1;
        const ph = Math.sin(st.phase + (k === "l" ? 0 : Math.PI));
        let lift = Math.max(0, ph) * 13 * stride;
        if (k === "r") lift += st.tapFoot * 8;
        const hy = hip.y + bodyY * (1 - st.sit * 0.3);
        const fx = hip.x + sgn * 2 + swayX * 0.3, fy = FEET.y - 8 - lift - jump;
        const legY = st.sit ? lerp(fy, hy + 18, st.sit) : fy;
        this.$["leg" + k].setAttribute("d", `M${hip.x + swayX} ${hy.toFixed(1)} L${fx.toFixed(1)} ${legY.toFixed(1)}`);
        this.$["legHi" + k].setAttribute("d", `M${hip.x + swayX - 2} ${(hy - 2).toFixed(1)} L${(fx - 2).toFixed(1)} ${(legY - 2).toFixed(1)}`);
        this.$["foot" + k].setAttribute("transform", `translate(${fx.toFixed(1)} ${(legY + 8).toFixed(1)})`);
      }
    } else {
      for (const k of ["l", "r"] as const) {
        const ph = st.phase + (k === "l" ? 0 : Math.PI);
        const fwd = Math.sin(ph) * 24 * stride;
        const lift = Math.max(0, Math.cos(ph)) * 11 * stride + (k === "r" ? st.tapFoot * 7 : 0);
        const hy = HIP_SIDE.y + bodyY * (1 - st.sit * 0.3);
        const fx = HIP_SIDE.x + fwd + (k === "l" ? -4 : 4) + st.sit * 28, fy = FEET.y - 8 - lift - jump;
        const legY = lerp(fy, hy + 16, st.sit);
        const kx = (HIP_SIDE.x + fx) / 2 + 6 + st.sit * 10, ky = (hy + legY) / 2;
        this.$["leg" + k].setAttribute("d", `M${HIP_SIDE.x} ${hy.toFixed(1)} L${kx.toFixed(1)} ${ky.toFixed(1)} L${fx.toFixed(1)} ${legY.toFixed(1)}`);
        this.$["legHi" + k].setAttribute("d", `M${HIP_SIDE.x - 2} ${(hy - 2).toFixed(1)} L${(kx - 2).toFixed(1)} ${(ky - 2).toFixed(1)} L${(fx - 2).toFixed(1)} ${(legY - 2).toFixed(1)}`);
        this.$["foot" + k].setAttribute("transform", `translate(${(fx + 6).toFixed(1)} ${(legY + 8).toFixed(1)})`);
      }
    }

    // body
    const bodyT = `translate(${(shakeX + swayX).toFixed(2)} ${(bodyY - st.shrug * 0.3).toFixed(2)}) rotate(${(st.lean + st.sway * 1.5).toFixed(2)} 560 850)`;
    this.$.body.setAttribute("transform", bodyT);
    this.$.legs.style.opacity = st.sit > 0.9 && this.facing === "up" ? "0" : "1";

    // arms: swing while walking
    const sw = step * stride;
    for (const k of ["l", "r"] as const) {
      const sgn = k === "l" ? -1 : 1;
      let a = (st as any)[k + "a"] as number, b = (st as any)[k + "b"] as number;
      const fwd = (st as any)[k + "Fwd"] as number;
      const swing = (k === "l" ? sw : -sw);
      let s0: { x: number; y: number }, hand: { x: number; y: number }, elbow: { x: number; y: number };
      if (!side) {
        s0 = { x: SH_FB[k].x + shakeX + swayX, y: SH_FB[k].y + bodyY - st.shrug };
        // a: upper arm angle from hanging straight down, outward positive.
        // b: elbow bend; the forearm turns inward (toward chest and mouth) by b.
        const c = a - b;
        elbow = { x: s0.x + Math.sin(a) * sgn * UPPER, y: s0.y + Math.cos(a) * UPPER - fwd * 18 };
        hand = { x: elbow.x + Math.sin(c) * sgn * FORE, y: elbow.y + Math.cos(c) * FORE - Math.max(0, swing) * 12 - fwd * 46 };
      } else {
        s0 = { x: SH_SIDE.x + shakeX + swayX + (k === "l" ? -6 : 6), y: SH_SIDE.y + bodyY - st.shrug };
        const aa = (a - HANG_A) * 0.9 + 0.06 + swing * 0.55 + fwd * 0.5;
        elbow = { x: s0.x + Math.sin(aa) * UPPER, y: s0.y + Math.cos(aa) * UPPER };
        const bb = aa + (b - HANG_B) + 0.12 + fwd * 0.3;
        hand = { x: elbow.x + Math.sin(bb) * FORE, y: elbow.y + Math.cos(bb) * FORE };
      }
      const d = `M${s0.x.toFixed(1)} ${s0.y.toFixed(1)} L${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)} L${hand.x.toFixed(1)} ${hand.y.toFixed(1)}`;
      this.$["arm" + k].setAttribute("d", d);
      this.$["armHi" + k].setAttribute("d", `M${(s0.x - 2).toFixed(1)} ${(s0.y - 3).toFixed(1)} L${(elbow.x - 2).toFixed(1)} ${(elbow.y - 3).toFixed(1)} L${(hand.x - 2).toFixed(1)} ${(hand.y - 2).toFixed(1)}`);
      this.$["hand" + k].setAttribute("transform", `translate(${hand.x.toFixed(1)} ${hand.y.toFixed(1)})`);
      this.$["prop" + k.toUpperCase()].setAttribute("transform", `translate(${hand.x.toFixed(1)} ${hand.y.toFixed(1)})`);
      if (k === "r") {
        const mx = this.facing === "left" ? 1120 - hand.x : hand.x;
        this.el.style.setProperty("--hx", `${((mx - FEET.x) * this.s).toFixed(1)}px`);
        this.el.style.setProperty("--hy", `${((hand.y - FEET.y) * this.s).toFixed(1)}px`);
      }
    }

    // head trails the body bob and nods
    const headY = bodyY + (bob - st.headLag) * 0.9 + st.nod - st.shrug * 0.6;
    const tilt = st.tilt + st.shake * 2;
    this.$.head.setAttribute("transform", `translate(${(shakeX + swayX * 1.1).toFixed(2)} ${headY.toFixed(2)}) rotate(${tilt.toFixed(2)} 560 715)`);
    this.$.shadow.setAttribute("rx", String(70 - jump * 0.8));
    const dim = 1 - st.dim * 0.55;
    this.$.antenna.style.opacity = String(dim);
    this.$.sideAntenna.style.opacity = String(dim);

    // overlays follow the head
    this.headPx = headY * this.s;
    this.el.style.setProperty("--bob", `${this.headPx.toFixed(1)}px`);
    if (this.bubble.classList.contains("on")) this.placeBubble();
  };
  private headPx = 0;
  private placeBubble() {
    const top = this.y - (FEET.y - 560) * this.s * (1 - this.st.sit * 0.12) - 16 + this.headPx;
    this.bubble.style.transform = `translate(${this.x.toFixed(1)}px, ${top.toFixed(1)}px)`;
  }

  destroy() {
    this.stop();
    gsap.ticker.remove(this.frame);
    this.act?.kill();
    for (const t of this.actTimers) t.kill();
    for (const l of this.loops) l.kill();
    this.blinkTl.kill();
    this.sayTimer?.kill();
    window.clearInterval(this.zTimer);
    gsap.killTweensOf([this.st, this, this.card, this.bubble.firstElementChild]);
    this.bubble.remove();
    this.el.remove();
  }
}

/** A small helper to wait inside scripted scenes. */
export const pause = sleep;

// ---- art ---------------------------------------------------------------------------------------------
const limb = (k: string, kind: "arm" | "leg") => /* svg */ `
  <path data-r="${kind}${k}" fill="none" stroke="var(--shade)" stroke-width="${kind === "arm" ? 26 : 30}" stroke-linecap="round" stroke-linejoin="round"/>
  <path data-r="${kind}Hi${k}" fill="none" stroke="var(--shell)" stroke-width="${kind === "arm" ? 12 : 13}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;

const WALKER_SVG = (id: string, s: number) => /* svg */ `
<svg class="world-walker-svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" width="${(VB.w * s).toFixed(1)}" height="${(VB.h * s).toFixed(1)}"
  style="left:${(-(FEET.x - VB.x) * s).toFixed(1)}px;top:${(-(FEET.y - VB.y) * s).toFixed(1)}px" aria-hidden="true">
  <defs>${defsSvg(id)}</defs>
  <ellipse data-r="shadow" cx="${FEET.x}" cy="${FEET.y + 2}" rx="70" ry="15" fill="#2b1d10" opacity="0.22"/>
  <g data-r="flip">
    <g data-r="legs">
      ${limb("l", "leg")}${limb("r", "leg")}
      <ellipse data-r="footl" rx="21" ry="11" fill="var(--deep)"/>
      <ellipse data-r="footr" rx="21" ry="11" fill="var(--deep)"/>
    </g>
    <g data-r="armsBack"></g>
    <g data-r="body">
      <g data-r="fbBody">
        <path d="M462 836 C458 770 470 738 512 728 L608 728 C650 738 662 770 658 836 Q658 858 634 858 L486 858 Q462 858 462 836 Z" fill="var(--shade)"/>
        <path d="M474 830 C472 778 482 748 516 740 L604 740 C636 748 646 778 644 830 Q644 846 626 846 L492 846 Q474 846 474 830 Z" fill="var(--shell)"/>
        <g data-r="backPlate">
          <rect x="538" y="754" width="44" height="6" rx="3" fill="var(--shade)"/>
          <rect x="538" y="766" width="44" height="6" rx="3" fill="var(--shade)"/>
          <g data-r="nameplate">
            <rect data-r="plate" x="518" y="784" width="84" height="18" rx="6" fill="var(--shade)"/>
            <text data-r="model" x="560" y="797" text-anchor="middle" font-family="var(--mono)" font-size="11.5" font-weight="650" fill="var(--deep)"></text>
          </g>
        </g>
        <g data-r="chest">
          <rect x="530" y="764" width="60" height="40" rx="12" fill="var(--shade)"/>
          <circle cx="560" cy="784" r="10" fill="var(--glow)" opacity="0.35"/>
          <circle cx="560" cy="784" r="6" fill="var(--glow)"/>
          <circle cx="542" cy="776" r="2.6" fill="var(--deep)"/><circle cx="578" cy="776" r="2.6" fill="var(--deep)"/>
        </g>
        <circle cx="500" cy="748" r="30" fill="var(--cap, var(--shade))"/><circle cx="500" cy="751" r="27.5" fill="var(--shade)"/><circle cx="496" cy="744" r="22" fill="var(--shell)"/>
        <circle cx="620" cy="748" r="30" fill="var(--cap, var(--shade))"/><circle cx="620" cy="751" r="27.5" fill="var(--shade)"/><circle cx="616" cy="744" r="22" fill="var(--shell)"/>
      </g>
      <g data-r="sideBody">
        <path d="M506 836 C500 772 510 738 534 728 L590 728 C614 738 624 772 618 836 Q618 858 596 858 L528 858 Q506 858 506 836 Z" fill="var(--shade)"/>
        <path d="M516 830 C512 780 520 748 540 740 L586 740 C604 748 610 780 606 830 Q606 846 590 846 L532 846 Q516 846 516 830 Z" fill="var(--shell)"/>
        <rect x="506" y="760" width="12" height="44" rx="6" fill="var(--shade)"/>
        <circle cx="603" cy="786" r="6" fill="var(--glow)" opacity="0.8"/>
      </g>
      <rect x="543" y="708" width="34" height="30" rx="8" fill="var(--deep)"/>
    </g>
    <g data-r="head">
      <g data-r="fbHead">${headSvg(id)}</g>
      ${headSideSvg(id)}
    </g>
    <g data-r="armsFront">
      <g data-r="arml"></g>
      <g data-r="armr"></g>
    </g>
  </g>
</svg>`.replace(
  // arms are groups holding the stroke paths, the hand and the held prop
  /<g data-r="arml">[\s\S]*?<g data-r="armr"><\/g>/,
  ["l", "r"].map((k) => `<g data-r="arm${k.toUpperCase()}">
        ${limb(k, "arm")}
        <g data-r="hand${k}"><circle r="17" fill="var(--shade)"/><circle cx="-3" cy="-4" r="10" fill="var(--shell)"/></g>
        <g data-r="prop${k.toUpperCase()}"></g>
      </g>`).join(""),
);
