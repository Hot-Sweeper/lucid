import gsap from "gsap";
import { watch, unwatch, drawNow, sinceDraw } from "./budget";
import { beginSystem, endSystem } from "../perf/metrics";
import { setSvgAttribute } from "../perf/svg-write";
import type { Expression, RobotLook } from "../office/rig";
import { bind, brandFor, clamp, defsSvg, eyesSvg, headSideSvg, headSvg, lerp, paintBrand, paintLook, uid, type BrandKind } from "./parts";

// The v0 robot standing on the top-down floor, the same character as the desk robot: the
// original head on a slim tapered shell, thin two-bone arms and legs with real elbows and knees.
// Facing up shows the back (logo, antenna), facing down the face, left and right a side view.
// Drawn in v0 coordinates; the element's origin is the point between its feet, so `x, y` are
// floor coordinates of the room it is in.
//
// Animation model: activities only tween a small state object (hand targets in body space,
// head nod and tilt, crouch, lean...). One per-frame pass turns that into the drawing: a walk
// cycle with planted feet, 3D two-bone solves for every limb projected into the current view,
// procedural layers (breathing, laughing, chewing, bouncing, thumb mashing), a damped spring on
// the antenna and squash and stretch. No filters, no blend modes, and an attribute is only
// written when its value changed.

export type Facing = "up" | "down" | "left" | "right";
export type Activity =
  | "idle" | "talk" | "laugh" | "eat" | "drink" | "charge" | "nap" | "wave" | "wait"
  | "hold-card" | "sit" | "explain" | "listen"
  // group games: ping pong stance, gamepad, chin scratch, cheering, sulking, watching a film
  | "ready" | "play" | "think" | "cheer" | "sulk" | "watch"
  // seated behind a desk, facing the room, hands on the keyboard
  | "type";

export interface WalkerOptions { id: string; provider: string; name?: string; model?: string; scale?: number; look?: RobotLook }
export type Prop = "none" | "mug" | "bowl" | "spoon" | "card" | "wrist" | "paddle" | "pad" | "popcorn" | "ball" | "stamp";

// ---- skeleton (v0 units) ------------------------------------------------------------------------
const FEET = { x: 560, y: 935 };              // floor point between the feet
const VB = { x: 392, y: 500, w: 336, h: 482 };
const ANKLE = FEET.y - 9;
const SH = { dx: 50, y: 750 };                // shoulders: half width, height
const HIP = { dx: 15, y: 852 };               // hip joints
const NECK = { x: 560, y: 730 };
const UPPER = 43, FORE = 41;                  // arm bones
const THIGH = 38, SHIN = 37;                  // leg bones
const K = 0.38;                               // depth (toward the camera) to screen y
const SIT_DROP = 36, CROUCH_DROP = 15;
/** From the feet up to the middle of the head of a walker sitting on a chair, in v0 units (times the scale for px). */
export const SIT_HEAD = FEET.y - 659 - SIT_DROP + 21;   // the head rides on the neck a little above the art's middle
const SPEED = 105;                            // px per second (in the parent's coordinates)
const STEP = 25;                              // half a step, v0 units
const TAU = Math.PI * 2;
// which activities can be done sitting down (they keep the current seat)
const SEATABLE = new Set<Activity>(["sit", "nap", "eat", "drink", "talk", "listen", "laugh", "think", "play", "watch", "explain", "type"]);

type V3 = { x: number; y: number; z: number };
type P2 = { x: number; y: number };
/** A hand target in body space, relative to its shoulder: x outward, y down, z forward. `r` turns what it holds. */
type Hand = { x: number; y: number; z: number; r?: number };
const H = (x: number, y: number, z: number, r = 0): Hand => ({ x, y, z, r });

// poses
const HANG = H(8, 80, -1), LAP = H(-14, 86, 34);
const BOWL = H(-30, 24, 28), SCOOP = H(-44, 14, 27, -112), MOUTH = H(-35, -37, 24, -28);
const MUG = H(-16, 42, 24), SIP = H(-27, -40, 24, -34);
const HIP_HAND = H(2, 60, 6);
const CHIN = H(-44, -36, 26), CROSS_L = H(-44, 36, 22), CROSS_R = H(-46, 30, 27);
const READY_R = H(10, 30, 32, -24), READY_L = H(4, 40, 24);
const PAD = H(-30, 50, 28), PAD_SIT = H(-30, 60, 30);
const POP_STAND = H(-38, 46, 24), POP_SIT = H(-40, 64, 30), INTO_POP = H(-60, 34, 32);
// at a desk, facing the camera: hands on the keyboard, the rubber stamp over the paper beside it
const KEYS = H(-16, 40, 60), STAMP_UP = H(40, 14, 50, 0), STAMP_DOWN = H(44, 62, 70, 0);

const PROPS: Record<Prop, string> = {
  none: "",
  // origin = the hand; held things sit in or above the mitten
  mug: `<g transform="scale(1.3)"><path d="M-12 -14 q-10 0 -10 10 q0 10 10 10" stroke="#e8673c" stroke-width="5" fill="none"/>
    <rect x="-44" y="-20" width="26" height="30" rx="7" fill="#ff8a65"/><rect x="-40" y="-14" width="5" height="18" rx="2.5" fill="#ffb59a"/>
    <ellipse cx="-31" cy="-19" rx="11" ry="4" fill="#5a2b1e"/></g>`,
  bowl: `<g transform="scale(1.2)"><path d="M-27 -22 Q-25 2 0 3 Q25 2 27 -22 Z" fill="#4fb6ff"/><path d="M-20 -8 Q-8 -1 6 -2" stroke="#8fd0ff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="-22" rx="27" ry="7.5" fill="#3a8fd6"/><ellipse cx="0" cy="-22" rx="23" ry="5.5" fill="#ffd27a"/>
    <path d="M-14 -24 q5 -5 10 0 q5 -5 10 0 q4 -4 8 0" stroke="#f0b04a" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`,
  spoon: `<rect x="-2.5" y="-30" width="5" height="40" rx="2.5" fill="#cfd5e2"/><ellipse cx="0" cy="-33" rx="6.5" ry="8" fill="#e6eaf2"/>
    <ellipse data-r="bite" cx="0" cy="-34" rx="4.2" ry="5" fill="#ffd27a" opacity="0"/>`,
  card: "",
  wrist: "",
  paddle: `<g transform="scale(1.2)"><rect x="-4" y="-10" width="8" height="22" rx="4" fill="#a8774f"/><circle cx="0" cy="-29" r="20" fill="#2b2f3d"/><circle cx="0" cy="-30" r="17.5" fill="#e2483d"/>
    <ellipse cx="-6" cy="-36" rx="6.5" ry="4" fill="#ff8a7a" opacity="0.6"/></g>`,
  // held in the right hand, reaching across to the left hand
  pad: `<rect x="-60" y="-11" width="70" height="24" rx="11" fill="#3a3f4f"/><rect x="-57" y="-10" width="64" height="8" rx="4" fill="#4a5063"/>
    <circle cx="-46" cy="2" r="5" fill="#262a36"/><circle cx="-6" cy="-1" r="3.6" fill="#ff6f91"/><circle cx="-13" cy="5" r="3.6" fill="#4fb6ff"/><circle cx="-26" cy="0" r="2.4" fill="var(--glow)"/>`,
  popcorn: `<path d="M-20 -40 L20 -40 L15 0 Q0 5 -15 0 Z" fill="#fff6e8"/>
    <path d="M-13 -40 L-10 1 L-3 2 L-6 -40 Z M6 -40 L3 2 L10 1 L13 -40 Z" fill="#e2483d"/>
    <circle cx="-13" cy="-43" r="7" fill="#fff3c4"/><circle cx="-2" cy="-47" r="8" fill="#ffe9a0"/><circle cx="10" cy="-44" r="7" fill="#fff3c4"/><circle cx="16" cy="-39" r="5.5" fill="#ffd27a"/><circle cx="3" cy="-40" r="6.5" fill="#fff8de"/>`,
  ball: `<circle cx="3" cy="-11" r="7.5" fill="#fffdf6"/><circle cx="1" cy="-13.5" r="2.6" fill="#fff" opacity="0.9"/>`,
  // a rubber stamp gripped by its knob, the pad pointing down
  stamp: `<g><rect x="-5" y="-6" width="10" height="20" rx="3" fill="#a8774f"/><circle cx="0" cy="-6" r="8" fill="#c08a5c"/>
    <rect x="-13" y="13" width="26" height="8" rx="2.5" fill="#3a3f4f"/><rect x="-12" y="20" width="24" height="3.5" rx="1.5" fill="#e2483d"/></g>`,
};
// props drawn over the mitten (held from below); the rest are gripped, so the mitten covers them
const OVER = new Set<Prop>(["bowl", "popcorn", "ball"]);

// Every tween on the robot's state takes over the properties it animates from older tweens.
const TL = (v: gsap.TimelineVars = {}) => gsap.timeline({ ...v, defaults: { overwrite: "auto", ...(v.defaults ?? {}) } });
const sleep = (sec: number) => new Promise<void>((r) => gsap.delayedCall(sec, r));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Two bones from s to t in 3D; the joint bends toward `pole`. Bones may stretch a little. */
function ik3(s: V3, t: V3, A: number, B: number, pole: V3, stretch = 1.15) {
  let dx = t.x - s.x, dy = t.y - s.y, dz = t.z - s.z;
  let L = Math.hypot(dx, dy, dz) || 0.001;
  const k = clamp(L / (A + B - 0.6), 1, stretch);
  A *= k; B *= k;
  const M = A + B - 0.6;
  if (L > M) { const f = M / L; dx *= f; dy *= f; dz *= f; L = M; }
  // never fold the elbow or knee tighter than about 40 degrees: shorten the bones instead
  const dMin = Math.sqrt(A * A + B * B - 2 * A * B * 0.766);
  if (L < dMin) { const f = Math.max(0.35, L / dMin); A *= f; B *= f; }
  const nx = dx / L, ny = dy / L, nz = dz / L;
  const ca = clamp((A * A + L * L - B * B) / (2 * A * L), -1, 1), sa = Math.sqrt(1 - ca * ca);
  const pd = pole.x * nx + pole.y * ny + pole.z * nz;
  let px = pole.x - nx * pd, py = pole.y - ny * pd, pz = pole.z - nz * pd;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) { px = 0; py = 1; pz = 0; } else { px /= pl; py /= pl; pz /= pl; }
  return {
    e: { x: s.x + A * (nx * ca + px * sa), y: s.y + A * (ny * ca + py * sa), z: s.z + A * (nz * ca + pz * sa) },
    h: { x: s.x + dx, y: s.y + dy, z: s.z + dz },
  };
}

const f1 = (n: number) => n.toFixed(1);
const headSize = (look: RobotLook) => Math.min(1.15, Math.max(0.9, look.head ?? 1));

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
  /** How hard the thumbs work in "play" (1 normal, 2.5 button mashing); also typing speed. */
  mashRate = 1;
  /** Added to the stacking order (a robot sitting behind a desk is drawn over it, see `setDeskEdge`). */
  zBias = 0;
  private deskEdge: number | null = null;
  private s: number;
  private svg: SVGSVGElement;
  private $: Record<string, SVGElement> = {};
  private bubble: HTMLDivElement;
  private card: HTMLDivElement;
  private battery: HTMLDivElement;
  // everything the activities animate
  private st = {
    phase: 0, stride: 0, breath: 0, deep: 0,
    sit: 0, crouch: 0, jump: 0, sq: 0, turn: 0,
    lean: 0, roll: 0, sway: 0, bx: 0, shrug: 0,
    nod: 0, tilt: 0, look: 0, lookY: 0, dim: 0,
    lx: HANG.x, ly: HANG.y, lz: HANG.z, lr: 0, lu: 0, lak: 0,
    rx: HANG.x, ry: HANG.y, rz: HANG.z, rr: 0, ru: 0, rak: 0,
    laugh: 0, chew: 0, bounce: 0, mash: 0, wave: 0, tap: 0, kick: 0, dangle: 0, dizzy: 0, glowPulse: 0,
  };
  private expr: Expression = "neutral";
  private propL: Prop = "none";
  private propR: Prop = "none";
  private act: gsap.core.Animation | null = null;
  private actTimers: gsap.core.Tween[] = [];
  private actAnims = new Set<gsap.core.Animation>();
  private loops: gsap.core.Animation[] = [];
  private zTimer = 0;
  private sayTimer: gsap.core.Tween | null = null;
  private blinkCall: gsap.core.Tween | null = null;
  private lifeCall: gsap.core.Tween | null = null;
  private gen = 0;
  // walking
  private mv: { pts: P2[]; i: number; wait: number; resolve: () => void } | null = null;
  private v = 0;
  private settleTl: gsap.core.Timeline | null = null;
  // antenna spring (v0 units, local to the current view)
  private spring = { phi: 0, phiV: 0, tx: 0, tvx: 0, ty: 0, tvy: 0, init: false };
  private headLag = 0;
  private handR = { x: 600, y: 840 };
  private headPx = 0;
  private layer = { l: "", r: "", legs: "" };
  private dangling = false;
  private last = performance.now();
  private glowPulse = { opacity: 0.9 };

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
    el.style.setProperty("--head-top", `${((FEET.y - 560) * this.s).toFixed(1)}px`);
    paintBrand(this.svg, this.$, this.brand);
    if (opts.look) { paintLook(this.svg, this.$, opts.look); this.headK = headSize(opts.look); }
    this.setModel(this.model);
    this.updateTitle();
    this.setExpression("neutral");
    const still = reduced();
    this.loops.push(gsap.to(this.st, { breath: 1, duration: rnd(2, 2.6), ease: "sine.inOut", yoyo: true, repeat: -1, delay: Math.random() * 2 }));
    if (!still) this.loops.push(gsap.to(this.glowPulse, { opacity: 0.5, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    this.scheduleBlink();
    if (!still) this.scheduleLife();
    this.face("down");
    gsap.ticker.add(this.frame);
    watch(this.svg);
    this.place();
  }

  setBrand(provider: string) { this.brand = brandFor(provider); paintBrand(this.svg, this.$, this.brand); }
  setLook(look: RobotLook) { paintLook(this.svg, this.$, look); this.headK = headSize(look); }
  /** The robot's own head size (look.head), the same as at its desk. */
  private headK = 1;
  setName(name: string) { this.name = name; this.updateTitle(); }
  setModel(model: string | null | undefined) {
    this.model = model ?? "";
    const t = this.$.model as SVGTextElement;
    t.textContent = this.model.length > 15 ? this.model.slice(0, 14) + "…" : this.model;
    this.$.nameplate.style.display = this.model ? "" : "none";
    const w = clamp(t.textContent!.length * 6.1 + 12, 34, 98);
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
    this.el.style.zIndex = String(Math.round(this.y) + this.zBias + (this.st.sit > 0.5 ? -2 : 0));
  }

  face(dir: Facing) {
    const was = this.facing;
    this.facing = dir;
    const fb = dir === "up" || dir === "down";
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    show("fbBody", fb); show("sideBody", !fb);
    show("fbHead", fb); show("sideHead", !fb);
    show("backPlate", dir === "up"); show("chest", dir === "down");
    this.$.face.setAttribute("opacity", dir === "down" ? "1" : "0");
    show("face", dir === "down"); show("back", dir !== "down");
    this.$.flip.setAttribute("transform", dir === "left" ? "translate(1120 0) scale(-1 1)" : "");
    // far limbs in the side view are a shade darker
    for (const k of ["l", "r"] as const) {
      const far = !fb && k === "l";
      for (const part of ["arm", "leg"]) {
        this.$[`${part}${k}Up`].setAttribute("stroke", far ? "var(--deep)" : "var(--shade)");
        this.$[`${part}${k}Lo`].setAttribute("stroke", far ? "var(--deep)" : "var(--shade)");
        this.$[`${part}${k}Hi`].setAttribute("stroke", far ? "var(--shade)" : "var(--shell)");
      }
    }
    this.layer = { l: "", r: "", legs: "" };
    this.spring.init = false;
    // turning on the spot: a quick squash sells the change of view
    if (was !== dir && this.ready) gsap.fromTo(this.st, { turn: 1 }, { turn: 0, duration: 0.2, ease: "power2.out", overwrite: "auto" });
  }
  private get ready() { return this.svg.isConnected; }

  // ---- walking ------------------------------------------------------------------------------
  walkTo(x: number, y: number): Promise<void> {
    if (Math.hypot(x - this.x, y - this.y) < 1.5) { this.finishMove(); this.setPos(x, y); return Promise.resolve(); }
    return this.go([{ x, y }]);
  }

  /** Walk a list of points in order, without stopping at the corners. */
  walkPath(pts: { x: number; y: number }[]) {
    ++this.gen;
    return this.go(pts);
  }

  stop() { this.gen++; this.finishMove(true); }

  /** Already sitting, without the motion (a desk robot getting up hands over to its walking self). */
  sitNow() { this.do("sit"); gsap.killTweensOf(this.st, "sit"); this.st.sit = 1; }

  private go(list: P2[]): Promise<void> {
    this.finishMove();
    const pts: P2[] = [];
    let p = { x: this.x, y: this.y };
    for (const q of list) if (Math.hypot(q.x - p.x, q.y - p.y) >= 1.5) { pts.push({ x: q.x, y: q.y }); p = q; }
    if (!pts.length) return Promise.resolve();
    this.calm();
    this.settleTl?.kill();
    const fresh = this.v < 5 && this.st.stride < 0.25;
    this.faceToward(pts[0]);
    return new Promise<void>((resolve) => {
      this.mv = { pts, i: 0, wait: fresh ? 0.12 : 0, resolve };
      // anticipation: sink and lean back a touch, then push off
      if (fresh && !reduced()) TL().to(this.st, { crouch: 0.55, lean: -4, duration: 0.12, ease: "power2.out" })
        .to(this.st, { crouch: 0, lean: 0, duration: 0.32, ease: "power2.out" });
    });
  }

  private faceToward(p: P2) {
    const dx = p.x - this.x, dy = p.y - this.y;
    const dir: Facing = Math.abs(dx) > Math.abs(dy) * 0.9 ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (dir !== this.facing) this.face(dir);
  }

  private finishMove(stopped = false) {
    const m = this.mv;
    if (!m) return;
    this.mv = null;
    if (stopped) this.v = 0;
    m.resolve();
  }

  private moveStep(dt: number) {
    const st = this.st, m = this.mv;
    if (!m) {
      this.v = 0;
      st.stride += (0 - st.stride) * Math.min(1, dt * 9);
      return;
    }
    if (m.wait > 0) { m.wait -= dt; return; }
    let rest = Math.hypot(m.pts[m.i].x - this.x, m.pts[m.i].y - this.y);
    for (let j = m.i + 1; j < m.pts.length; j++) rest += Math.hypot(m.pts[j].x - m.pts[j - 1].x, m.pts[j].y - m.pts[j - 1].y);
    const cap = Math.sqrt(2 * 560 * rest) + 18;                // ease into the stop
    const want = Math.min(SPEED, cap);
    this.v = want > this.v ? this.v + (want - this.v) * Math.min(1, dt * 7) : want;
    let step = this.v * dt;
    while (step > 0 && m.i < m.pts.length) {
      const q = m.pts[m.i], d = Math.hypot(q.x - this.x, q.y - this.y);
      if (step >= d) {
        this.x = q.x; this.y = q.y; step -= d; m.i++;
        if (m.i < m.pts.length) this.faceToward(m.pts[m.i]);
      } else { this.x += ((q.x - this.x) / d) * step; this.y += ((q.y - this.y) / d) * step; step = 0; }
    }
    this.place();
    const strideWant = 0.35 + 0.65 * Math.min(1, this.v / SPEED);
    st.stride += (strideWant - st.stride) * Math.min(1, dt * 10);
    // feet stay planted: half a cycle covers 2 * STEP * stride of floor
    st.phase += ((this.v / this.s) / (4 * STEP * Math.max(0.3, st.stride))) * TAU * dt;
    if (m.i >= m.pts.length) {
      this.mv = null;
      this.v = 0;
      this.settle();
      m.resolve();
    }
  }

  /** Coming to a stop: the body carries on a little, then settles back. */
  private settle() {
    if (reduced()) return;
    this.settleTl?.kill();
    this.settleTl = TL()
      .to(this.st, { lean: 5, crouch: 0.35, duration: 0.12, ease: "power2.out" })
      .to(this.st, { lean: -1.5, crouch: 0, duration: 0.22, ease: "sine.inOut" })
      .to(this.st, { lean: 0, duration: 0.25, ease: "sine.out" });
  }

  // ---- activities ---------------------------------------------------------------------------
  private clearAct() {
    this.act?.kill();
    this.act = null;
    for (const a of this.actAnims) a.kill();
    this.actAnims.clear();
    for (const t of this.actTimers) t.kill();
    this.actTimers = [];
    window.clearInterval(this.zTimer);
    this.zTimer = 0;
    this.card.classList.remove("on");
    this.battery.classList.remove("on");
  }

  /** Stop the current activity but keep whatever the hands carry. */
  calm() {
    this.activity = "idle";
    this.clearAct();
    gsap.to(this.st, {
      lu: 0, ru: 0, lak: 0, rak: 0, nod: 0, tilt: 0, shrug: 0, sit: 0, roll: 0, sway: 0, bx: 0, crouch: 0, bounce: 0, laugh: 0, chew: 0, mash: 0, wave: 0, tap: 0, kick: 0,
      look: 0, lookY: 0, dim: 0, deep: 0, glowPulse: 0, duration: 0.3, ease: "power2.out", overwrite: "auto",
    });
    this.antennaDroop(false);
    if (this.expr === "sleepy" || this.expr === "laugh") this.setExpression("neutral");
  }

  /** Put things in its hands (kept while walking). */
  hold(l: Prop, r: Prop) {
    this.setProps(l, r);
    if (this.activity === "idle") gsap.to(this.st, { lu: 0, ru: 0, duration: 0.3, ease: "power2.out", overwrite: "auto" });
  }

  /** `seated` keeps the robot sitting (laughing on a couch, thinking at a chess table). */
  do(activity: Activity, opts: { card?: string; keep?: boolean; seated?: boolean } = {}) {
    this.activity = activity;
    this.clearAct();
    if (!opts.keep) this.setProps("none", "none");
    const st = this.st;
    const seated = !!opts.seated || activity === "watch" || activity === "nap" || activity === "sit" || activity === "type";
    const sit = seated ? 1 : SEATABLE.has(activity) ? st.sit : 0;
    const base = { lu: 0, ru: 0, lak: 0, rak: 0, nod: 0, tilt: 0, shrug: 0, roll: 0, sway: 0, bx: 0, crouch: 0, bounce: 0, laugh: 0, chew: 0, mash: 0, wave: 0, tap: 0, kick: 0, look: 0, lookY: 0, deep: 0, glowPulse: 0 };
    const to = (v: Record<string, number>, d = 0.45, ease = "power2.inOut") => gsap.to(st, { ...v, duration: d, ease, overwrite: "auto" });
    const loop = (fn: () => gsap.core.Animation | void, every: () => number, first = rnd(0.3, 0.9)) => {
      const tick = () => {
        if (this.activity !== activity) return;
        const a = fn();
        if (a) { this.actAnims.add(a); a.eventCallback("onComplete", () => this.actAnims.delete(a)); }
        this.actTimers.push(gsap.delayedCall(every(), tick));
      };
      this.actTimers.push(gsap.delayedCall(first, tick));
    };
    const arm = (k: "l" | "r", p: Hand, u = 1) => ({ [k + "x"]: p.x, [k + "y"]: p.y, [k + "z"]: p.z, [k + "r"]: p.r ?? 0, [k + "u"]: u });
    gsap.killTweensOf(st, "lean");
    // the reset never overrides anything; the activity's own tweens below take over what they animate
    gsap.to(st, { ...base, sit, lean: 0, dim: 0, duration: 0.45, ease: "power2.inOut", overwrite: false });
    this.antennaDroop(false);
    if (activity !== "laugh" && activity !== "nap" && (this.expr === "laugh" || this.expr === "sleepy")) this.setExpression("neutral");
    if (activity !== "sulk" && activity !== "cheer" && (this.expr === "angry" || this.expr === "happy")) this.setExpression("neutral");
    const seatedNow = () => st.sit > 0.5 || sit > 0.5;

    switch (activity) {
      case "idle":
        break;
      case "talk": {
        // a gesture on every phrase: open palm, both hands out, a point, a beat
        const gesture = () => {
          const r = Math.random(), k = Math.random() < 0.6 ? "r" : "l", o = k === "r" ? "l" : "r";
          const low = seatedNow() ? 12 : 0;
          const tl = TL();
          if (r < 0.35) tl.to(st, { ...arm(k, H(22, 10 + low, 40, -20)), nod: 3, tilt: k === "r" ? -4 : 4, duration: 0.32, ease: "back.out(1.7)" })
            .to(st, { [k + "y"]: 22 + low, nod: 0, duration: 0.26, ease: "sine.inOut", yoyo: true, repeat: 1 })
            .to(st, { [k + "u"]: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=0.15");
          else if (r < 0.55) tl.to(st, { ...arm("l", H(34, 18 + low, 30)), ...arm("r", H(34, 18 + low, 30)), shrug: 4, tilt: pick([-5, 5]), duration: 0.35, ease: "back.out(1.6)" })
            .to(st, { lu: 0, ru: 0, shrug: 0, tilt: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.5");
          else if (r < 0.75) tl.to(st, { ...arm(k, H(-8, -4 + low, 56)), nod: -2, duration: 0.24, ease: "power3.out" })
            .to(st, { [k + "z"]: 44, duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" })
            .to(st, { [k + "u"]: 0, nod: 0, duration: 0.4, ease: "power2.inOut" });
          else tl.to(st, { ...arm(k, H(10, 20 + low, 40, 10)), [o + "u"]: 0, duration: 0.22, ease: "power2.out" })
            .to(st, { [k + "y"]: 36 + low, nod: 4, duration: 0.1, ease: "power2.in", yoyo: true, repeat: 3 })
            .to(st, { [k + "u"]: 0, nod: 0, duration: 0.4, ease: "power2.inOut" });
          return tl;
        };
        loop(gesture, () => rnd(1.2, 2));
        break;
      }
      case "explain": {
        loop(() => {
          const k = Math.random() < 0.55 ? "r" : "l", o = k === "r" ? "l" : "r";
          return TL()
            .to(st, { ...arm(k, H(rnd(16, 34), rnd(-10, 14), 36, -30)), ...arm(o, H(-20, 40, 24), 0.8), nod: 3, roll: k === "r" ? 2 : -2, duration: 0.36, ease: "back.out(1.6)" })
            .to(st, { [k + "x"]: "-=14", [k + "z"]: "+=10", duration: 0.24, yoyo: true, repeat: 1, ease: "sine.inOut" })
            .to(st, { nod: 0, roll: 0, duration: 0.3 }, "<");
        }, () => rnd(0.9, 1.5));
        break;
      }
      case "listen":
        to({ tilt: 7, ...arm("r", HIP_HAND, seatedNow() ? 0 : 1), rak: 1 }, 0.6);
        loop(() => {
          if (Math.random() < 0.25) return TL().to(st, { look: pick([-0.7, 0.7]), tilt: -3, duration: 0.3 }).to(st, { look: 0, tilt: 7, duration: 0.5 }, "+=0.9");
          return TL().to(st, { nod: 6, duration: 0.16, ease: "sine.inOut", yoyo: true, repeat: 3 });
        }, () => rnd(1.3, 2.4));
        break;
      case "laugh":
        this.setExpression("laugh");
        this.act = TL()
          .to(st, { ...arm("l", H(-34, 60, 24)), ...arm("r", H(-34, 60, 24)), nod: -6, lean: -5, shrug: 3, laugh: 1, duration: 0.25, ease: "power2.out" })
          .to(st, { nod: 4, lean: 6, duration: 0.5, ease: "sine.inOut" }, "+=0.5")
          .to(st, { nod: -3, lean: -2, duration: 0.45, ease: "sine.inOut" })
          .to(st, { laugh: 0, shrug: 0, nod: 0, lean: 0, lu: 0, ru: 0, duration: 0.6, ease: "power2.out" }, "+=0.2");
        break;
      case "eat":
        this.setProps("bowl", "spoon");
        to({ ...arm("l", BOWL, 0), ...arm("r", SCOOP) }, 0.5);
        loop(() => this.bite(), () => rnd(2.3, 3.4), 0.7);
        break;
      case "drink":
        this.setProps("none", "mug");
        loop(() => this.sip(), () => rnd(3.2, 5), 1);
        break;
      case "charge":
        this.battery.classList.add("on");
        to({ ...arm("l", H(12, 66, -12)), ...arm("r", H(12, 66, -12)), nod: 3, lookY: 0.4 }, 0.8);
        this.act = gsap.fromTo(this.battery.querySelector("i"), { scaleX: 0.15 }, { scaleX: 1, duration: 14, ease: "none", transformOrigin: "0 50%", repeat: -1, repeatDelay: 1 });
        if (!reduced()) this.actTimers.push(gsap.to(st, { glowPulse: 1, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }) as unknown as gsap.core.Tween);
        loop(() => {
          // a little hum of energy now and then; glances up at the battery
          if (Math.random() < 0.5) return TL().to(st, { shrug: 3, duration: 0.08, yoyo: true, repeat: 3, ease: "sine.inOut" });
          return TL().to(st, { lookY: -1, nod: -3, duration: 0.5, ease: "sine.inOut" }).to(st, { lookY: 0.4, nod: 3, duration: 0.6, ease: "sine.inOut" }, "+=0.8");
        }, () => rnd(3, 5.5));
        break;
      case "nap":
        this.setExpression("sleepy");
        to({ sit: 1, ...arm("l", H(-26, 84, 30)), ...arm("r", H(-26, 84, 30)), tilt: 13, roll: 3, lean: -4, dim: 1, deep: 1 }, 1.4);
        this.antennaDroop(true);
        this.act = gsap.to(st, { nod: 6, duration: 2.3, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1 });
        this.zTimer = window.setInterval(() => this.spawnZ(), 1700);
        this.spawnZ();
        break;
      case "wave":
        if (this.expr === "neutral") { this.setExpression("happy"); this.actTimers.push(gsap.delayedCall(2.2, () => this.expr === "happy" && this.setExpression("neutral"))); }
        this.act = TL()
          .to(st, { crouch: 0.3, ...arm("r", H(20, 10, 16), 0.4), duration: 0.12, ease: "power2.in" })
          .to(st, { crouch: 0, ...arm("r", H(22, -74, 10, 18)), roll: -3, tilt: -5, duration: 0.3, ease: "back.out(1.8)" })
          .to(st, { wave: 1, duration: 0.15 }, "<0.1")
          .to(st, { wave: 0, ru: 0, roll: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=1.2");
        break;
      case "wait":
        loop(() => {
          const r = Math.random();
          if (r < 0.28) { // check the wrist display
            this.setProps("wrist", this.propR);
            return TL().to(st, { ...arm("l", H(-36, 16, 30)), nod: 6, lookY: 1, tilt: 4, duration: 0.45, ease: "power2.inOut" })
              .to(st, { lu: 0, nod: 0, lookY: 0, tilt: 0, duration: 0.45, ease: "power2.inOut" }, "+=1.3")
              .add(() => { if (this.propL === "wrist") this.setProps("none", this.propR); });
          }
          if (r < 0.48) return TL().to(st, { ...arm("l", H(-12, 64, -18)), ...arm("r", H(-12, 64, -18)), sway: pick([-0.7, 0.7]), duration: 0.6, ease: "sine.inOut" })
            .to(st, { lu: 0, ru: 0, sway: 0, duration: 0.6, ease: "sine.inOut" }, "+=2.2");
          if (r < 0.72) { // sigh
            this.puff();
            return TL().to(st, { shrug: 7, nod: -3, duration: 0.6, ease: "sine.out" }).to(st, { shrug: -3, nod: 4, tilt: 5, duration: 0.8, ease: "sine.inOut" }).to(st, { shrug: 0, nod: 0, tilt: 0, duration: 0.6 });
          }
          return TL().to(st, { tap: 1, duration: 0.15 }).to(st, { tap: 0, duration: 0.2 }, "+=1.6");
        }, () => rnd(2.2, 4.2));
        break;
      case "hold-card":
        if (opts.card != null) this.setCard(opts.card);
        this.card.classList.add("on");
        to({ ...arm("r", H(16, -82, 6)), ...arm("l", HIP_HAND), lak: 1 }, 0.5);
        this.act = gsap.to(this.card, { y: -3, duration: 1.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
        break;
      case "sit":
        to({ sit: 1 }, 0.6);
        loop(() => {
          const r = Math.random();
          if (r < 0.4) return TL().to(st, { look: pick([-1, 1]), tilt: pick([-4, 4]), duration: 0.5, ease: "sine.inOut" }).to(st, { look: 0, tilt: 0, duration: 0.7, ease: "sine.inOut" }, "+=1.4");
          if (r < 0.65) return TL().to(st, { kick: 1, duration: 0.3 }).to(st, { kick: 0, duration: 0.4 }, "+=1.6");
          return TL().to(st, { lean: -4, roll: pick([-2, 2]), duration: 0.9, ease: "sine.inOut" }).to(st, { lean: 0, roll: 0, duration: 0.9, ease: "sine.inOut" }, "+=1.5");
        }, () => rnd(2.5, 4.5));
        break;
      case "ready": // ping pong stance: knees bent, paddle up and forward, bouncing on the toes
        this.setProps("none", "paddle");
        to({ crouch: 0.6, lean: 7, ...arm("r", READY_R), ...arm("l", READY_L), bounce: 1 }, 0.35);
        break;
      case "play": { // gamepad in both hands, thumbs never rest
        this.setProps("none", "pad");
        const p = seatedNow() ? PAD_SIT : PAD;
        to({ ...arm("l", p), ...arm("r", p), lean: 6, nod: 3, mash: 1 }, 0.4);
        loop(() => TL().to(st, { roll: pick([-4, 4, -2, 2]), sway: pick([-0.4, 0.4]), lean: 6 + 3 * this.mashRate, duration: 0.3, ease: "sine.inOut" })
          .to(st, { roll: 0, sway: 0, lean: 6, duration: 0.4, ease: "sine.inOut" }, "+=0.3"), () => rnd(1.2, 2.6));
        break;
      }
      case "think": // scratch the chin
        to({ ...arm("r", CHIN), ...arm("l", CROSS_L), tilt: 7, lookY: -0.8, look: 0.5 }, 0.5);
        this.act = gsap.to(st, { ry: CHIN.y + 4, duration: 0.15, yoyo: true, repeat: -1, repeatDelay: 0.45, ease: "sine.inOut", delay: 0.6 });
        loop(() => TL().to(st, { tilt: pick([-6, 8]), look: pick([-0.6, 0.6]), duration: 0.9, ease: "sine.inOut" }), () => rnd(2, 4));
        break;
      case "cheer": {
        this.setExpression("happy");
        const up = H(28, -76, 6);
        to({ ...arm("l", up), ...arm("r", up), sit: 0, lean: 0 }, 0.22, "back.out(1.6)");
        const tl = TL({ delay: 0.15 });
        for (let i = 0; i < 3; i++) {
          tl.to(st, { sq: 0.7, duration: 0.09, ease: "power2.in" })
            .to(st, { jump: 1, sq: -0.5, ly: -84, ry: -84, duration: 0.18, ease: "power2.out" })
            .to(st, { sq: 0, duration: 0.12 }, "<0.1")
            .to(st, { jump: 0, ly: -70, ry: -70, duration: 0.2, ease: "power2.in" })
            .to(st, { sq: 0.6, duration: 0.06 })
            .to(st, { sq: 0, duration: 0.3, ease: "elastic.out(1, 0.45)" });
        }
        tl.to(st, { lu: 0, ru: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.5");
        this.act = tl;
        break;
      }
      case "sulk":
        this.setExpression("angry");
        to({ ...arm("l", CROSS_L), ...arm("r", CROSS_R), nod: 7, tilt: -8, shrug: 5, look: pick([-1, 1]) }, 0.5);
        loop(() => {
          this.puff();
          return TL().to(st, { shrug: 9, nod: 4, duration: 0.35, ease: "power2.out" }).to(st, { shrug: 4, nod: 7, duration: 0.6 })
            .to(st, { tap: seatedNow() ? 0 : 1, duration: 0.1 }, 0).to(st, { tap: 0, duration: 0.2 }, 0.5);
        }, () => rnd(2.2, 4));
        break;
      case "type": // typing in bursts; `mashRate` sets the pace
        to({ sit: 1, ...arm("l", KEYS), ...arm("r", KEYS), lean: 2, nod: 2, lookY: 0.5 }, 0.5);
        if (reduced()) break;
        loop(() => TL().to(st, { mash: 1, nod: 3, duration: 0.15 })
          .to(st, { mash: 0, nod: 2, duration: 0.25 }, `+=${rnd(0.8, 2.6) * Math.min(1.6, this.mashRate)}`), () => rnd(1.4, 3.6) / this.mashRate, 0.3);
        break;
      case "watch": // sitting, eyes on the screen; munches if holding popcorn
        to({ sit: 1, lean: 3 }, 0.6);
        loop(() => {
          if (this.propL === "popcorn" && Math.random() < 0.75) return this.munch();
          return TL().to(st, { tilt: pick([-5, 5]), lean: pick([0, 6]), duration: 1, ease: "sine.inOut" }).to(st, { tilt: 0, lean: 3, duration: 1, ease: "sine.inOut" }, "+=1.5");
        }, () => rnd(2.4, 4.4));
        break;
    }
  }

  /** One spoonful: scoop, lift to the mouth while the head leans in, chew, back to the bowl. */
  private bite() {
    const st = this.st;
    const arm = (p: Hand) => ({ rx: p.x, ry: p.y, rz: p.z, rr: p.r ?? 0, ru: 1 });
    const bite = this.$.propRUnder.querySelector<SVGElement>('[data-r="bite"]');
    const tl = TL()
      // dip into the bowl, the bowl tips toward the spoon
      .to(st, { ...arm({ ...SCOOP, y: SCOOP.y + 10, r: -128 }), lr: 12, lu: 1, lx: BOWL.x, ly: BOWL.y, lz: BOWL.z, nod: 3, lookY: 1, duration: 0.3, ease: "power2.inOut" })
      .to(st, { rx: SCOOP.x + 6, rr: -100, duration: 0.18, ease: "power1.inOut" })
      .add(() => bite && gsap.set(bite, { opacity: 1 }))
      // up to the mouth: the head comes down to meet it, the bowl follows a little
      .to(st, { ...arm(MOUTH), lr: 0, ly: BOWL.y - 8, lz: BOWL.z + 4, duration: 0.42, ease: "power2.inOut" })
      .to(st, { nod: 6, tilt: -4, lookY: 0.4, duration: 0.3, ease: "power2.out" }, "<0.12")
      .add(() => bite && gsap.set(bite, { opacity: 0 }))
      .to(st, { nod: 2, duration: 0.1, ease: "power2.out" })
      // chew while the spoon goes back down
      .to(st, { ...arm(SCOOP), ly: BOWL.y, lz: BOWL.z, chew: 1, tilt: 0, lookY: 0, duration: 0.45, ease: "power2.inOut" })
      .to(st, { chew: 0, nod: 0, duration: 0.3 }, "+=0.9");
    if (Math.random() < 0.3) tl.add(() => { if (this.activity === "eat") this.setExpression("happy"); }, 1.4).add(() => { if (this.activity === "eat") this.setExpression("neutral"); }, 2.4);
    return tl;
  }

  /** A sip: tip the mug at the mouth, head back, a satisfied little sigh. */
  private sip() {
    const st = this.st;
    return TL()
      .to(st, { ry: MUG.y + 5, ru: 0.6, rx: MUG.x, rz: MUG.z, duration: 0.15, ease: "power2.in" })
      .to(st, { rx: SIP.x, ry: SIP.y, rz: SIP.z, rr: SIP.r, ru: 1, nod: -5, tilt: -3, duration: 0.5, ease: "power2.inOut" })
      .to(st, { rr: -48, nod: -7, duration: 0.6, ease: "sine.inOut" })
      .to(st, { ru: 0, rr: 0, nod: 2, tilt: 0, duration: 0.5, ease: "power2.inOut" })
      .add(() => { if (this.activity === "drink" && Math.random() < 0.5) { this.puff(); this.setExpression("happy"); gsap.delayedCall(1.1, () => this.activity === "drink" && this.setExpression("neutral")); } })
      .to(st, { shrug: -4, duration: 0.35, ease: "sine.out" }, "-=0.1")
      .to(st, { shrug: 0, nod: 0, duration: 0.5, ease: "sine.inOut" });
  }

  /** Hand into the popcorn, then to the mouth. */
  munch() {
    const st = this.st;
    return TL()
      .to(st, { rx: INTO_POP.x, ry: INTO_POP.y - 10, rz: INTO_POP.z, rr: 0, ru: 1, lookY: 0.8, duration: 0.28, ease: "power2.inOut" })
      .to(st, { ry: INTO_POP.y, duration: 0.12, ease: "power2.in" })
      .to(st, { rx: MOUTH.x - 4, ry: MOUTH.y + 6, rz: MOUTH.z, lookY: 0, nod: 4, duration: 0.36, ease: "power2.inOut" })
      .to(st, { ru: 0, chew: 1, nod: 0, duration: 0.42, ease: "power2.inOut" })
      .to(st, { chew: 0, duration: 0.3 }, "+=0.8");
  }

  /** Reach sideways into a neighbor's popcorn (`dir` -1 left, 1 right on screen), then eat it. */
  reachOver(dir: -1 | 1) {
    const st = this.st, k = dir < 0 ? "l" : "r", look = this.facing === "up" ? -dir : dir;
    return TL()
      .to(st, { look: look, tilt: dir * 5, duration: 0.25 })
      .to(st, { [k + "x"]: 84, [k + "y"]: 40, [k + "z"]: 22, [k + "u"]: 1, sway: dir * 1.4, roll: dir * 6, duration: 0.45, ease: "power2.out" })
      .to(st, { [k + "y"]: 52, duration: 0.12, yoyo: true, repeat: 1 })
      .to(st, { [k + "x"]: MOUTH.x, [k + "y"]: MOUTH.y + 6, [k + "z"]: MOUTH.z, sway: 0, roll: 0, look: -look * 0.6, nod: 4, duration: 0.45, ease: "power2.inOut" })
      .to(st, { [k + "u"]: 0, chew: 1, nod: 0, tilt: 0, duration: 0.4 }, "+=0.15")
      .to(st, { chew: 0, look: 0, duration: 0.3 }, "+=0.7");
  }

  /** Ping pong forehand; the paddle meets the ball `contact` seconds from now. */
  swing(contact = 0.2) {
    const st = this.st;
    const back = Math.max(0.08, contact - 0.09);
    this.act?.kill();
    this.act = null;
    return TL()
      .to(st, { rx: 40, ry: 28, rz: -50, rr: -60, ru: 1, lean: -4, crouch: 0.9, roll: 4, duration: back, ease: "power2.out" })
      .to(st, { rx: -4, ry: 4, rz: 50, rr: 12, lean: 11, crouch: 0.45, roll: -2, duration: 0.09, ease: "power3.in" })
      .to(st, { rx: -30, ry: -20, rz: 34, rr: 48, lean: 9, duration: 0.14, ease: "power2.out" })
      .to(st, { rx: READY_R.x, ry: READY_R.y, rz: READY_R.z, rr: READY_R.r ?? 0, lean: 7, crouch: 0.6, roll: 0, duration: 0.42, ease: "back.out(1.6)" });
  }

  /** A whiff: the swing goes through empty air. */
  whiff() {
    const st = this.st;
    this.act?.kill();
    this.act = null;
    return TL()
      .to(st, { rx: -6, ry: 16, rz: 62, rr: 30, ru: 1, lean: 16, crouch: 0.95, duration: 0.12, ease: "power3.in" })
      .add(() => this.setExpression("surprised"))
      .to(st, { look: -1, tilt: -6, duration: 0.25, ease: "power2.out" }, "+=0.1")
      .to(st, { rx: READY_R.x, ry: READY_R.y, rz: READY_R.z, rr: READY_R.r ?? 0, lean: 7, crouch: 0.6, look: 0, tilt: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.3")
      .add(() => { if (this.expr === "surprised") this.setExpression("neutral"); });
  }

  /** Bend down to pick something up from the floor. */
  pickUp() {
    const st = this.st;
    return TL()
      .to(st, { crouch: 2, lean: 26, rx: 2, ry: 112, rz: 40, rr: 0, ru: 1, nod: 7, lookY: 1, duration: 0.34, ease: "power2.inOut" })
      .to(st, { ry: 120, duration: 0.1 })
      .to(st, { crouch: 0, lean: 0, ru: 0, nod: 0, lookY: 0, duration: 0.38, ease: "power2.inOut" }, "+=0.08");
  }

  /** Hold the right hand out and shake it (pair with the robot opposite). */
  shake() {
    const st = this.st;
    return TL().to(st, { rx: -8, ry: 40, rz: 48, rr: 0, ru: 1, lean: 4, duration: 0.35, ease: "power2.out" })
      .to(st, { ry: 48, nod: 3, duration: 0.13, yoyo: true, repeat: 5, ease: "sine.inOut" })
      .to(st, { ru: 0, lean: 0, nod: 0, duration: 0.4, ease: "power2.inOut" });
  }

  /** Flinch at something scary: arms up in front of the face, a little jump. */
  flinch() {
    const st = this.st;
    this.setExpression("surprised");
    this.hop();
    const guard = H(-34, -26, 30);
    return TL().to(st, { lx: guard.x, ly: guard.y, lz: guard.z, lu: 1, rx: guard.x, ry: guard.y, rz: guard.z, ru: 1, lean: -8, nod: 3, shrug: 6, duration: 0.13, ease: "power3.out" })
      .to(st, { ly: 20, lx: -20, shrug: 2, duration: 0.4, ease: "power2.inOut" }, "+=0.45")   // peek over the arm
      .to(st, { lu: 0, ru: 0, lean: 0, nod: 0, shrug: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.35");
  }

  /** Floor position of the right hand (for things held or hit with it). */
  handPoint() {
    const mx = this.facing === "left" ? 1120 - this.handR.x : this.handR.x;
    return { x: this.x + (mx - FEET.x) * this.s, y: this.y + (this.handR.y - FEET.y) * this.s };
  }

  /** Reach forward with the right hand (taps a bell, presses a button), then return. */
  poke() {
    const st = this.st;
    const card = this.activity === "hold-card";
    const k = card ? "l" : "r";   // the card hand stays up, the free hand taps
    // after the tap the card holder's free hand goes back to its hip
    const after = card ? { lx: HIP_HAND.x, ly: HIP_HAND.y, lz: HIP_HAND.z, lu: 1 } : { ru: 0 };
    TL().to(st, { [k + "x"]: -12, [k + "y"]: 24, [k + "z"]: 46, [k + "r"]: 0, [k + "u"]: 1, lean: 3, duration: 0.18, ease: "power2.out" })
      .to(st, { [k + "z"]: 56, duration: 0.07, ease: "power2.in", yoyo: true, repeat: 1 })
      .to(st, { ...after, lean: 0, duration: 0.35, ease: "power2.inOut" });
  }

  /** High five toward the side it faces. */
  highFive() {
    const st = this.st;
    return TL()
      .to(st, { rx: 20, ry: 10, rz: -14, rr: 0, ru: 1, crouch: 0.5, duration: 0.18, ease: "power2.in" })
      .to(st, { rx: 4, ry: -70, rz: 36, crouch: 0, lean: 6, duration: 0.18, ease: "back.out(2)" })
      .to(st, { sq: 0.4, duration: 0.05 }).to(st, { sq: 0, duration: 0.35, ease: "elastic.out(1, 0.4)" })
      .to(st, { ru: 0, lean: 0, duration: 0.45, ease: "power2.inOut" }, "+=0.25");
  }

  hop() {
    TL()
      .to(this.st, { sq: 0.5, duration: 0.07, ease: "power2.in" })
      .to(this.st, { jump: 1, sq: -0.45, duration: 0.17, ease: "power2.out" })
      .to(this.st, { sq: 0, duration: 0.12 }, "<0.1")
      .to(this.st, { jump: 0, duration: 0.2, ease: "power2.in" })
      .to(this.st, { sq: 0.55, duration: 0.05 })
      .to(this.st, { sq: 0, duration: 0.4, ease: "elastic.out(1, 0.4)" });
  }

  /** Picked up by the cursor (true) or put down (false): legs dangle and kick, then a wobbly landing. */
  grabbed(on: boolean) {
    const st = this.st;
    if (on) {
      if (this.dangling) return;
      this.dangling = true;
      this.stop();
      this.calm();
      gsap.to(st, { dangle: 1, lx: 30, ly: -40, lz: 10, lu: 1, rx: 30, ry: -40, rz: 10, ru: 1, duration: 0.25, ease: "back.out(2)", overwrite: "auto" });
      return;
    }
    if (!this.dangling) return;
    this.dangling = false;
    TL()
      .to(st, { dangle: 0, lu: 0, ru: 0, duration: 0.12, ease: "power2.in" })
      .to(st, { sq: 0.7, duration: 0.06 }, 0.08)
      .to(st, { sq: 0, duration: 0.5, ease: "elastic.out(1, 0.35)" })
      .to(st, { dizzy: 1, duration: 0.2 }, 0.2)
      .to(st, { dizzy: 0, duration: 1.2, ease: "power1.in" }, 0.9);
  }

  /** Turn the eyes and head toward a floor x (a chat partner on the same couch); null looks ahead again. */
  lookToward(x: number | null) {
    const side = this.facing === "left" || this.facing === "right";
    const d = x == null || side ? 0 : clamp((x - this.x) / 60, -1, 1) * (this.facing === "up" ? -1 : 1);
    gsap.to(this.st, { look: d * 0.8, duration: 0.35, ease: "power2.out", overwrite: "auto" });
  }

  /** Sitting behind a desk whose far edge is at floor y `edge`: the body is hidden below that
   *  line (the desk top covers the lap), legs and floor shadow go, and the robot is drawn over
   *  the desk so its hands rest on it. Null stands it up again. */
  setDeskEdge(edge: number | null, zBias = 0) {
    this.deskEdge = edge;
    this.zBias = edge == null ? 0 : zBias;
    let clip = this.svg.querySelector("clipPath.desk-edge") as SVGClipPathElement | null;
    if (edge == null) { this.$.lower.removeAttribute("clip-path"); clip?.remove(); this.$.shadow.style.display = ""; this.place(); return; }
    if (!clip) {
      const ns = "http://www.w3.org/2000/svg";
      clip = document.createElementNS(ns, "clipPath") as SVGClipPathElement;
      clip.classList.add("desk-edge");
      clip.id = uid("edge");
      clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      clip.appendChild(document.createElementNS(ns, "rect"));
      this.svg.querySelector("defs")!.appendChild(clip);
    }
    const y = FEET.y + (edge - this.y) / this.s;
    const r = clip.firstElementChild!;
    r.setAttribute("x", "0"); r.setAttribute("y", "0"); r.setAttribute("width", "1120"); r.setAttribute("height", y.toFixed(1));
    this.$.lower.setAttribute("clip-path", `url(#${clip.id})`);
    this.$.shadow.style.display = "none";
    this.place();
  }

  /** Eyes and head turn somewhere for a moment (`look` -1 left to 1 right, `lookY` -1 up to 1 down), then come back. */
  glance(look: number, lookY: number, hold = 1.2) {
    const st = this.st, back = this.activity === "type" ? 0.5 : 0;
    return TL().to(st, { look: clamp(look, -1, 1), lookY: clamp(lookY, -1, 1), tilt: look * 3, duration: 0.25, ease: "power2.out" })
      .to(st, { look: 0, lookY: back, tilt: 0, duration: 0.4, ease: "power2.inOut" }, `+=${hold}`);
  }

  /** A friendly hello from the desk: hand up, a little wave and a nod, then back to work. */
  greet() {
    const st = this.st, typing = this.activity === "type";
    if (this.expr === "neutral") { this.setExpression("happy"); gsap.delayedCall(1.8, () => this.expr === "happy" && this.setExpression("neutral")); }
    const home = typing ? KEYS : null;
    return TL()
      .to(st, { mash: 0, duration: 0.1 })
      .to(st, { rx: 20, ry: -38, rz: 26, rr: 14, ru: 1, wave: 1, nod: 4, roll: -2, duration: 0.3, ease: "back.out(1.7)" }, 0)
      .to(st, { nod: 0, duration: 0.3, ease: "sine.inOut" }, 0.35)
      .to(st, { wave: 0, roll: 0, ...(home ? { rx: home.x, ry: home.y, rz: home.z, rr: 0 } : { ru: 0 }), duration: 0.45, ease: "power2.inOut" }, "+=0.9");
  }

  /** A short "yes" nod. */
  nodYes() {
    return TL().to(this.st, { nod: 6, duration: 0.14, ease: "sine.inOut", yoyo: true, repeat: 3 });
  }

  /** A "no": the head turns from side to side. */
  shakeNo() {
    return TL().to(this.st, { look: -0.55, tilt: -2, duration: 0.16, ease: "sine.inOut" })
      .to(this.st, { look: 0.55, tilt: 2, duration: 0.28, ease: "sine.inOut", yoyo: true, repeat: 2 })
      .to(this.st, { look: 0, tilt: 0, duration: 0.2, ease: "sine.out" });
  }

  /** Point straight out of the picture, at you, then hands back to where they were. */
  pointAtYou(hold = 1.4) {
    const st = this.st, typing = this.activity === "type";
    return TL().to(st, { mash: 0, rx: 12, ry: 4, rz: 86, rr: 0, ru: 1, lean: 4, nod: 2, duration: 0.3, ease: "back.out(1.6)" })
      .to(st, { rz: 92, duration: 0.12, yoyo: true, repeat: 1, ease: "sine.inOut" })
      .to(st, { ...(typing ? { rx: KEYS.x, ry: KEYS.y, rz: KEYS.z } : { ru: 0 }), lean: 0, nod: 0, duration: 0.45, ease: "power2.inOut" }, `+=${hold}`);
  }

  /** Pick up the rubber stamp, press it down beside the keyboard (`onHit` at contact), put it away. */
  stamp(onHit: () => void = () => {}) {
    const st = this.st, keep = this.propL;
    this.setProps(keep, "stamp");
    const pose = (p: Hand) => ({ rx: p.x, ry: p.y, rz: p.z, rr: p.r ?? 0, ru: 1 });
    return TL()
      .to(st, { mash: 0, ...pose(STAMP_UP), look: 0.6, lookY: 1, nod: 4, duration: 0.35, ease: "power2.out" })
      .to(st, { ry: STAMP_UP.y - 8, duration: 0.18, ease: "sine.out" })
      .to(st, { ...pose(STAMP_DOWN), lean: 5, shrug: 3, duration: 0.11, ease: "power3.in" })
      .add(onHit)
      .to(st, { sq: 0.12, duration: 0.05 })
      .to(st, { sq: 0, duration: 0.3, ease: "elastic.out(1, 0.4)" })
      .to(st, { ...pose(STAMP_UP), lean: 2, shrug: 0, duration: 0.3, ease: "power2.out" }, "+=0.12")
      .add(() => { if (this.propR === "stamp") this.setProps(keep, "none"); })
      .to(st, { ...pose(KEYS), look: 0, lookY: 0.5, nod: 2, duration: 0.4, ease: "power2.inOut" });
  }

  setCard(text: string) { this.card.querySelector("span")!.textContent = text; this.card.title = text; }

  setExpression(e: Expression) {
    this.expr = e;
    this.$.eyes.innerHTML = eyesSvg(e);
    this.$.sideEyes.innerHTML = eyesSvg(e, [604]);
  }

  /** Speech bubble; `think` draws it as a thought cloud instead. */
  say(text: string | null, ms?: number, think = false) {
    this.sayTimer?.kill();
    const b = this.bubble, p = b.querySelector("p")!;
    if (text) b.classList.toggle("think", think);
    if (!text) {
      if (b.classList.contains("on")) gsap.to(p, { opacity: 0, y: 6, duration: 0.2, ease: "power2.in", onComplete: () => b.classList.remove("on") });
      return;
    }
    p.textContent = text;
    const was = b.classList.contains("on");
    b.classList.add("on");
    // inside a room the bubble must stay within its walls (rooms clip what sticks out);
    // measured once here, not every frame
    const room = b.parentElement?.closest(".room") ? b.parentElement : null;
    this.bubbleFit = room ? { bw: p.offsetWidth, bh: p.offsetHeight, pw: room.clientWidth, ph: room.clientHeight } : null;
    this.placeBubble();
    if (!was) gsap.fromTo(p, { opacity: 0, y: 8, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" });
    else gsap.fromTo(p, { scale: 0.96 }, { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
    const dur = ms ?? 1400 + text.length * 55;
    this.sayTimer = gsap.delayedCall(dur / 1000, () => this.say(null));
    // talking out loud: a nod on the first word
    if (!think && !this.mv && this.activity !== "nap") TL().to(this.st, { nod: "+=3", duration: 0.12, ease: "power2.out" }).to(this.st, { nod: "-=3", duration: 0.25, ease: "sine.inOut" });
  }

  private setProps(l: Prop, r: Prop) {
    this.propL = l; this.propR = r;
    for (const [k, p] of [["L", l], ["R", r]] as const) {
      const over = OVER.has(p);
      this.$["prop" + k + "Over"].innerHTML = over ? PROPS[p] : "";
      this.$["prop" + k + "Under"].innerHTML = over ? "" : PROPS[p];
    }
    this.$.watch.style.display = l === "wrist" ? "" : "none";
  }

  private antennaDroop(on: boolean) {
    gsap.to(this.$.antennaDroop, { rotation: on ? 20 : 0, svgOrigin: "560 610", duration: on ? 2 : 0.6, ease: on ? "sine.inOut" : "back.out(2)", overwrite: "auto" });
  }

  private spawnZ() {
    const z = document.createElement("span");
    z.className = "world-z";
    z.textContent = "z";
    this.el.appendChild(z);
    const h = this.height - this.st.sit * SIT_DROP * this.s;
    gsap.set(z, { x: 14, y: -h + 10, opacity: 0, scale: 0.6, rotation: -10 });
    gsap.timeline({ onComplete: () => z.remove() })
      .to(z, { opacity: 0.9, duration: 0.5 })
      .to(z, { x: 40 + Math.random() * 20, y: -h - 50, scale: 1.3, rotation: 12, duration: 3, ease: "sine.inOut" }, 0)
      .to(z, { opacity: 0, duration: 0.9, ease: "sine.in" }, 2.1);
  }

  private puff() {
    if (this.facing === "up") return;   // it sighs out of its face, which is turned away
    const p = document.createElement("span");
    p.className = "world-puff";
    this.el.appendChild(p);
    const h = this.height - this.st.sit * SIT_DROP * this.s;
    const dx = this.facing === "left" ? -26 : this.facing === "right" ? 26 : 0;
    gsap.set(p, { x: dx, y: -h * 0.6, opacity: 0, scale: 0.4 });
    gsap.timeline({ onComplete: () => p.remove() })
      .to(p, { opacity: 0.8, scale: 1, x: dx * 1.6, y: -h * 0.66, duration: 0.6, ease: "power2.out" })
      .to(p, { opacity: 0, scale: 1.3, duration: 0.6 });
  }

  // ---- idle life: blinks, glances, small weight shifts ---------------------------------------------
  private scheduleBlink() {
    this.blinkCall = gsap.delayedCall(rnd(1.8, 4.8), () => {
      if (this.expr !== "sleepy" && this.expr !== "laugh" && this.expr !== "happy") {
        const fb = [this.$.eyes, this.$.eyeLight], sd = [this.$.sideEyes, this.$.sideEyeLight];
        const tl = TL()
          .to(fb, { scaleY: 0.1, svgOrigin: "560 657", duration: 0.06, ease: "power2.in" }, 0)
          .to(sd, { scaleY: 0.1, svgOrigin: "604 657", duration: 0.06, ease: "power2.in" }, 0)
          .to([...fb, ...sd], { scaleY: 1, duration: 0.11, ease: "power2.out" }, 0.07);
        if (Math.random() < 0.22) tl.to([...fb, ...sd], { scaleY: 0.1, duration: 0.06, ease: "power2.in" }, 0.25).to([...fb, ...sd], { scaleY: 1, duration: 0.11, ease: "power2.out" }, 0.31);
      }
      this.scheduleBlink();
    });
  }

  private scheduleLife() {
    this.lifeCall = gsap.delayedCall(rnd(2.2, 5.5), () => {
      const a = this.activity, st = this.st;
      if (!this.mv && !this.dangling && (a === "idle" || a === "wait" || a === "sit" || a === "watch" || a === "charge")) {
        const r = Math.random();
        if (r < 0.5) TL().to(st, { look: rnd(-1, 1), lookY: rnd(-0.5, 0.4), duration: 0.22, ease: "power2.out" }).to(st, { look: 0, lookY: 0, duration: 0.35, ease: "power2.inOut" }, `+=${rnd(0.6, 1.6)}`);
        else if (r < 0.8 && st.sit < 0.5) gsap.to(st, { sway: pick([-0.8, -0.5, 0.5, 0.8]), roll: 0, duration: rnd(0.9, 1.4), ease: "sine.inOut" });
        else if (st.sit < 0.5) gsap.to(st, { sway: 0, duration: 1, ease: "sine.inOut" });
        else TL().to(st, { tilt: pick([-5, 5]), duration: 0.6, ease: "sine.inOut" }).to(st, { tilt: 0, duration: 0.8, ease: "sine.inOut" }, "+=1.2");
      }
      this.scheduleLife();
    });
  }

  // ---- per frame ----------------------------------------------------------------------------------
  private proj(v: V3): P2 {
    switch (this.facing) {
      case "down": return { x: v.x, y: v.y + v.z * K };
      case "up": return { x: v.x, y: v.y - v.z * K };
      default: return { x: 560 + v.z + (v.x - 560) * 0.12, y: v.y + (v.x - 560) * 0.08 };
    }
  }

  private frame = () => {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.svg.isConnected) return;
    this.moveStep(dt);
    // walking goes on every frame; the body is redrawn less often when off screen or tiny
    dt = sinceDraw(this, now);
    if (!drawNow(this, this.svg, now)) return;
    const started = beginSystem();
    const pulse = this.glowPulse.opacity.toFixed(4);
    setSvgAttribute(this.$.antennaGlow, "opacity", pulse);
    setSvgAttribute(this.$.sideGlow, "opacity", pulse);
    const st = this.st, t = now / 1000;
    const side = this.facing === "left" || this.facing === "right";
    const back = this.facing === "up";
    const dangle = st.dangle;

    // walk cycle: contact, down, passing, up (two bobs per cycle); feet planted in stance
    const stride = st.stride * (1 - dangle);
    const u0 = ((st.phase / TAU) % 1 + 1) % 1;
    const foot = (off: number) => {
      const u = (u0 + off) % 1;
      if (u < 0.5) { const s = u / 0.5; return { z: STEP * (1 - 2 * s), lift: 0, rot: lerp(8, -16, s * s) }; }
      const s = (u - 0.5) / 0.5, e = s * s * (3 - 2 * s);
      return { z: -STEP + 2 * STEP * e, lift: Math.sin(Math.PI * Math.pow(s, 0.8)) * 13, rot: lerp(-22, 10, e) };
    };
    const fl = foot(0), fr = foot(0.5);
    const bob = stride * 4.2 * Math.cos(TAU * 2 * (u0 - 0.1));
    const weight = side ? 0 : -stride * 4.5 * Math.sin(TAU * u0);   // over the standing foot

    // procedural layers
    const breath = st.breath * (2 + st.deep * 2.5);
    const laugh = st.laugh * Math.sin(t * 34) * (0.6 + 0.4 * Math.sin(t * 5));
    const bounce = st.bounce * Math.abs(Math.sin(t * 7.2));
    const chew = st.chew * Math.abs(Math.sin(t * 13));
    const dizzy = st.dizzy;
    const kick = st.kick;
    const dSway = dizzy * Math.sin(t * 6) * 1.2;

    // body: drop (sit, crouch), bob, weight, sway; lean forward in the side view, roll in front
    const drop = st.sit * SIT_DROP + st.crouch * CROUCH_DROP - bounce * 3.5 + bob;
    const bx = weight + (st.sway + dSway) * 5 + st.bx;
    const by = drop - laugh * 1.8;
    const walkLean = stride * 5;
    const rot = side ? st.lean + walkLean : st.roll + weight * 0.5 + dSway * 4 + laugh * 0.8;
    const fwd = side ? 0 : (back ? -1 : 1) * (st.lean + walkLean * 0.4) * 0.55;   // forward lean seen from the front
    const upper = -breath * 0.45 - st.shrug * 0.3;
    // squash and stretch around the feet, plus the jump
    const sq = st.sq + st.turn * 0.25, jump = st.jump * 26 + dangle * 6;
    const sx = 1 + sq * 0.12 - st.turn * 0.12, sy = 1 - sq * 0.12;
    this.attr(this.$.rig, "transform", `translate(0 ${f1(-jump)}) translate(560 ${FEET.y}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-560 ${-FEET.y})`);
    const bodyT = `translate(${f1(bx)} ${f1(by + upper + fwd * 0.4)}) rotate(${rot.toFixed(2)} 560 ${HIP.y})`;
    this.attr(this.$.body, "transform", bodyT);
    this.attr(this.$.armsFront, "transform", bodyT);
    const rr = (rot * Math.PI) / 180, cr = Math.cos(rr), sr = Math.sin(rr);
    const toScreen = (p: P2): P2 => ({ x: 560 + (p.x - 560) * cr - (p.y - HIP.y) * sr + bx, y: HIP.y + (p.x - 560) * sr + (p.y - HIP.y) * cr + by + upper + fwd * 0.4 });

    // legs
    const legsFront = !side && !back && st.sit > 0.5;
    const legKey = legsFront ? "front" : "back";
    if (legKey !== this.layer.legs) { this.layer.legs = legKey; (legsFront ? this.$.legsFront : this.$.legsBack).appendChild(this.$.legs); }
    this.$.legs.style.display = (st.sit > 0.9 && back) || this.deskEdge != null ? "none" : "";
    const swingFoot = { l: fl, r: fr };
    for (const k of ["l", "r"] as const) {
      const sgn = k === "l" ? -1 : 1;
      const w = swingFoot[k];
      const hip: V3 = { x: 560 + sgn * HIP.dx + bx * 0.9, y: HIP.y + drop, z: 0 };
      let fz = w.z * stride + st.sit * 42 + kick * Math.sin(t * 7 + (k === "l" ? 0 : 2.4)) * 8 * st.sit;
      let lift = w.lift * stride + (k === "r" ? st.tap * Math.max(0, Math.sin(t * 15)) * 8 : 0);
      let fy = ANKLE - lift;
      let fx = 560 + sgn * (HIP.dx + st.sit * 5) + (side ? 0 : bx * 0.15);
      if (dangle > 0.01) {   // hanging from the cursor: legs dangle and pedal
        const pd = Math.sin(t * 8 + (k === "l" ? 0 : Math.PI));
        fz = lerp(fz, pd * 14, dangle);
        fy = lerp(fy, hip.y + 68 + Math.cos(t * 8 + (k === "l" ? 0 : Math.PI)) * 4, dangle);
        fx = lerp(fx, hip.x + sgn * 4, dangle);
      }
      const { e, h } = ik3(hip, { x: fx, y: fy, z: fz }, THIGH, SHIN, { x: sgn * 0.12, y: -0.1, z: 1 }, 1.05);
      const a = this.proj(hip), b = this.proj(e), c = this.proj(h);
      this.attr(this.$[`leg${k}Up`], "d", `M${f1(a.x)} ${f1(a.y)} L${f1(b.x)} ${f1(b.y)}`);
      this.attr(this.$[`leg${k}Lo`], "d", `M${f1(b.x)} ${f1(b.y)} L${f1(c.x)} ${f1(c.y)}`);
      this.attr(this.$[`leg${k}Hi`], "d", `M${f1(a.x - 2)} ${f1(a.y - 1.5)} L${f1(b.x - 2)} ${f1(b.y - 1.5)} L${f1(c.x - 1.5)} ${f1(c.y - 2)}`);
      this.attr(this.$[`knee${k}`], "transform", `translate(${f1(b.x)} ${f1(b.y)})`);
      const footRot = side ? w.rot * stride + st.sit * -6 + dangle * 25 : 0;
      this.attr(this.$[`foot${k}`], "transform", `translate(${f1(c.x)} ${f1(c.y)}) rotate(${footRot.toFixed(1)})`);
      if (k === "r") this.footZ.r = w.z; else this.footZ.l = w.z;
    }

    // arms: rest pose (by what the hand holds and whether it sits), blended with the posed target
    for (const k of ["l", "r"] as const) {
      const sgn = k === "l" ? -1 : 1;
      const prop = k === "l" ? this.propL : this.propR;
      const rest = this.restHand(k, prop);
      const free = prop === "none" || prop === "wrist" || prop === "ball";
      // arm swing opposite to the legs (a beat late), smaller when the hand carries something
      const legZ = k === "l" ? this.footZ.r : this.footZ.l;
      const sw = stride * (free ? 1.2 : 0.12);
      rest.z += legZ * sw;
      rest.y -= Math.abs(legZ) * sw * 0.12;
      rest.x += stride * (free ? 3 : 0);
      const u = (st as any)[k + "u"] as number;
      const tg = { x: lerp(rest.x, (st as any)[k + "x"], u), y: lerp(rest.y, (st as any)[k + "y"], u), z: lerp(rest.z, (st as any)[k + "z"], u) };
      let pr = lerp(rest.r ?? 0, (st as any)[k + "r"], u);
      // layers on top of the pose
      if (st.mash > 0.01) { const m = st.mash * (0.6 + 0.6 * this.mashRate); tg.y += Math.sin(t * (30 + (k === "l" ? 0 : 7)) + (k === "l" ? 0 : 1.3)) * 1.6 * m; pr += Math.sin(t * 9) * 3 * m; }
      if (k === "r" && st.wave > 0.01) { tg.x += Math.sin(t * 13) * 11 * st.wave; pr += Math.sin(t * 13 - 0.6) * 18 * st.wave; }
      if (dangle > 0.01) { tg.x += Math.sin(t * 11 + (k === "l" ? 0 : 1.7)) * 9 * dangle; tg.y += Math.cos(t * 9 + (k === "l" ? 0 : 1)) * 7 * dangle; }
      tg.y -= laugh * 2;
      const sh: V3 = { x: 560 + sgn * SH.dx, y: SH.y - st.shrug - laugh * 1.5, z: 0 };
      const hand: V3 = { x: sh.x + sgn * tg.x, y: sh.y + tg.y, z: tg.z };
      // elbow: out and back; a hand on the hip ("akimbo") points it straight out to the side
      const ak = (st as any)[k + "ak"] as number;
      const { e, h } = ik3(sh, hand, UPPER, FORE, { x: sgn * lerp(0.55, 1, ak), y: lerp(0.5, 0.1, ak), z: lerp(-0.65, -0.05, ak) }, 1.25);
      const a = this.proj(sh), b = this.proj(e), c = this.proj(h);
      this.attr(this.$[`arm${k}Up`], "d", `M${f1(a.x)} ${f1(a.y)} L${f1(b.x)} ${f1(b.y)}`);
      this.attr(this.$[`arm${k}Lo`], "d", `M${f1(b.x)} ${f1(b.y)} L${f1(c.x)} ${f1(c.y)}`);
      this.attr(this.$[`arm${k}Hi`], "d", `M${f1(a.x - 1.5)} ${f1(a.y - 2)} L${f1(b.x - 1.5)} ${f1(b.y - 2)} L${f1(c.x - 1)} ${f1(c.y - 1.5)}`);
      this.attr(this.$[`elbow${k}`], "transform", `translate(${f1(b.x)} ${f1(b.y)})`);
      const ang = Math.atan2(c.y - b.y, c.x - b.x) * 180 / Math.PI;
      const flipY = Math.abs(ang) > 90 ? -1 : 1;
      this.attr(this.$[`hand${k}`], "transform", `translate(${f1(c.x)} ${f1(c.y)}) rotate(${ang.toFixed(1)}) scale(1 ${flipY})`);
      const flat = side && prop === "pad" ? 0.45 : 1;
      const pt = `translate(${f1(c.x)} ${f1(c.y)}) rotate(${pr.toFixed(1)}) scale(${flat} 1)`;
      this.attr(this.$[`prop${k.toUpperCase()}Under`], "transform", pt);
      this.attr(this.$[`prop${k.toUpperCase()}Over`], "transform", pt);
      // which side of the body the arm is on
      const behind = side ? k === "l" : back ? tg.z > 6 : tg.z < -10;
      const lk = behind ? "back" : "front";
      if (lk !== this.layer[k]) { this.layer[k] = lk; (behind ? this.$.armsBack : this.$.armsFront).appendChild(this.$[`arm${k.toUpperCase()}`]); }
      if (k === "r") {
        const sc = toScreen(c);
        this.handR.x = sc.x; this.handR.y = sc.y - jump;
        if (this.card.classList.contains("on")) {
          const mx = this.facing === "left" ? 1120 - sc.x : sc.x;
          this.card.style.setProperty("--hx", `${((mx - FEET.x) * this.s).toFixed(1)}px`);
          this.card.style.setProperty("--hy", `${((sc.y - jump - FEET.y) * this.s).toFixed(1)}px`);
        }
      }
    }

    // head rides on the neck, trails the bob a little, nods, tilts, chews, glances
    const neck = toScreen(NECK);
    this.headLag += (bob - this.headLag) * Math.min(1, dt * 10);
    const hx = neck.x - NECK.x + st.look * (side ? 0 : 2);
    const hy = neck.y - NECK.y + (bob - this.headLag) * 0.8 + st.nod + chew * 2.4 + fwd * 1.1 - laugh * 0.8;
    const tilt = st.tilt + laugh * 2.5 + st.look * (side ? 0 : 3) + dSway * 6 - rot * 0.35 + (side ? st.lookY * -4 : 0);
    this.attr(this.$.head, "transform", `translate(${f1(hx)} ${f1(hy)}) rotate(${tilt.toFixed(2)} 560 715)${this.headK === 1 ? "" : ` translate(560 715) scale(${this.headK}) translate(-560 -715)`}`);
    this.attr(this.$.look, "transform", `translate(${f1(st.look * 8)} ${f1(st.lookY * 5)})`);
    this.attr(this.$.sideLook, "transform", `translate(${f1(Math.abs(st.look) * -2)} ${f1(st.lookY * 5)})`);
    this.attr(this.$.shadow, "rx", f1((54 - st.jump * 14 - dangle * 10) * (1 + st.sit * 0.1)));
    this.attr(this.$.shadow, "opacity", (0.22 - dangle * 0.1).toFixed(2));
    const dim = 1 - st.dim * 0.55;
    this.attr(this.$.antenna, "opacity", dim.toFixed(2));
    this.attr(this.$.sideAntenna, "opacity", dim.toFixed(2));
    if (st.glowPulse > 0.001 || this.lastPulse > 0) { this.lastPulse = st.glowPulse; this.attr(this.$.chestGlow, "r", f1(8 + st.glowPulse * 6)); }

    // antenna: a damped spring that lags behind the head, in the view's own x (walking included)
    const sp = this.spring;
    const wx = (this.facing === "left" ? -this.x : this.x) / this.s;
    const headX = hx + (side ? wx : this.x / this.s), headY = hy - jump;
    if (!sp.init) { sp.init = true; sp.tx = headX; sp.ty = headY; sp.phi = tilt; sp.tvx = sp.tvy = sp.phiV = 0; }
    const k1 = 150, c1 = 8, k2 = 160, c2 = 8.5;
    sp.phiV += (k1 * (tilt - sp.phi) - c1 * sp.phiV) * dt; sp.phi += sp.phiV * dt;
    sp.tvx += (k2 * (headX - sp.tx) - c2 * sp.tvx) * dt; sp.tx += sp.tvx * dt;
    sp.tvy += (k2 * (headY - sp.ty) - c2 * sp.tvy) * dt; sp.ty += sp.tvy * dt;
    if (Math.abs(sp.tx - headX) > 200) sp.tx = headX;   // teleported (setPos far away)
    if (Math.abs(sp.ty - headY) > 200) sp.ty = headY;
    const lag = clamp(sp.phi - tilt + ((sp.tx - headX) / 40) * 57.3 * 0.75, -40, 40);
    const idle = Math.sin(t * 1.6 + this.x * 0.01) * 2;
    const stretch = clamp(1 + (headY - sp.ty) / 60, 0.8, 1.25);
    const at = `rotate(${(lag + idle).toFixed(2)} 560 610) translate(560 610) scale(1 ${stretch.toFixed(3)}) translate(-560 -610)`;
    this.attr(this.$.antenna, "transform", at);
    this.attr(this.$.sideAntenna, "transform", `rotate(${(lag + idle).toFixed(2)} 552 610) translate(552 610) scale(1 ${stretch.toFixed(3)}) translate(-552 -610)`);

    // overlays follow the head
    this.headPx = (hy - jump) * this.s;
    const bobPx = `${this.headPx.toFixed(1)}px`;
    // An inherited variable on the actor root invalidated every SVG descendant each
    // frame. Only the battery uses this offset, so update that small overlay itself.
    if (this.battery.classList.contains("on")) {
      if (bobPx !== this.lastBob) { this.lastBob = bobPx; this.battery.style.setProperty("--bob", bobPx); }
    } else this.lastBob = "";
    if (this.bubble.classList.contains("on")) this.placeBubble();
    endSystem("robots", started);
  };
  private footZ = { l: 0, r: 0 };
  private lastBob = "";
  private lastPulse = 0;

  /** Where a hand rests when no pose drives it: hanging, on the lap, or carrying its prop. */
  private restHand(k: "l" | "r", prop: Prop): Hand {
    const sit = this.st.sit;
    const mix = (a: Hand, b: Hand) => ({ x: lerp(a.x, b.x, sit), y: lerp(a.y, b.y, sit), z: lerp(a.z, b.z, sit), r: lerp(a.r ?? 0, b.r ?? 0, sit) });
    switch (prop) {
      case "bowl": return { ...BOWL };
      case "spoon": return { ...SCOOP };
      case "mug": return { ...MUG };
      case "popcorn": return mix(POP_STAND, POP_SIT);
      case "pad": return mix(PAD, PAD_SIT);
      case "paddle": return { ...READY_R, y: 50, z: 18, r: -10 };
      case "ball": return mix(H(6, 58, 14), LAP);
      default: return mix(HANG, LAP);
    }
  }

  private attr(el: SVGElement, name: string, v: string) {
    const c = ((el as any).__c ??= {}) as Record<string, string>;
    if (c[name] === v) return;
    c[name] = v;
    el.setAttribute(name, v);
  }

  private bubbleFit: { bw: number; bh: number; pw: number; ph: number } | null = null;
  private placeBubble() {
    let top = this.y - (FEET.y - 560) * this.s - 16 + this.headPx, x = this.x;
    const f = this.bubbleFit;
    if (f && f.pw > 0) {
      top = Math.max(top, f.bh + 8);                                   // not through the top wall
      x = Math.min(Math.max(x, f.bw / 2 + 8), f.pw - f.bw / 2 - 8);   // nor through the side walls
    }
    this.bubble.style.transform = `translate(${x.toFixed(1)}px, ${top.toFixed(1)}px)`;
  }

  destroy() {
    this.stop();
    gsap.ticker.remove(this.frame);
    unwatch(this.svg);
    this.clearAct();
    for (const l of this.loops) l.kill();
    this.blinkCall?.kill();
    this.lifeCall?.kill();
    this.settleTl?.kill();
    this.sayTimer?.kill();
    gsap.killTweensOf([this.st, this, this.card, this.bubble.firstElementChild, this.$.eyes, this.$.eyeLight, this.$.sideEyes, this.$.sideEyeLight, this.$.antennaDroop]);
    this.bubble.remove();
    this.el.remove();
  }
}

/** A small helper to wait inside scripted scenes. */
export const pause = sleep;

// ---- art ---------------------------------------------------------------------------------------------
// A limb: two stroked bones in the shade color, a lit highlight along them and a joint disc.
const limb = (kind: "arm" | "leg", k: string) => {
  const [up, lo, hi, joint] = kind === "arm" ? [17, 14, 6, 8.5] : [19, 16, 6.5, 8.5];
  const j = kind === "arm" ? "elbow" : "knee";
  return /* svg */ `
    <path data-r="${kind}${k}Up" fill="none" stroke="var(--shade)" stroke-width="${up}" stroke-linecap="round"/>
    <path data-r="${kind}${k}Lo" fill="none" stroke="var(--shade)" stroke-width="${lo}" stroke-linecap="round"/>
    <path data-r="${kind}${k}Hi" fill="none" stroke="var(--shell)" stroke-width="${hi}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <g data-r="${j}${k}"><circle r="${joint}" fill="var(--deep)"/><circle cx="-1.4" cy="-1.8" r="${joint * 0.52}" fill="var(--shade)"/></g>`;
};
// A slim mitten with a wrist cuff; x points along the forearm.
const MITTEN = /* svg */ `
  <ellipse cx="-11" cy="0" rx="5" ry="7.5" fill="var(--deep)"/>
  <ellipse cx="-2" cy="8.5" rx="5.6" ry="4.4" fill="var(--shade)"/>
  <ellipse cx="2" cy="0" rx="12.5" ry="10.5" fill="var(--shade)"/>
  <ellipse cx="3.5" cy="-2" rx="8" ry="5.8" fill="var(--shell)"/>`;
const armSvg = (k: "l" | "r") => /* svg */ `
  <g data-r="arm${k.toUpperCase()}">
    ${limb("arm", k)}
    <g data-r="prop${k.toUpperCase()}Under"></g>
    <g data-r="hand${k}">${MITTEN}${k === "l" ? `<g data-r="watch" style="display:none"><rect x="-17" y="-8" width="9" height="16" rx="3" fill="var(--visor)"/><rect class="world-wrist" x="-15.5" y="-5.5" width="6" height="11" rx="2" fill="var(--glow)"/></g>` : ""}</g>
    <g data-r="prop${k.toUpperCase()}Over"></g>
  </g>`;
const footSvg = (k: string) => /* svg */ `
  <g data-r="foot${k}"><ellipse cx="3" cy="1" rx="14" ry="8" fill="var(--deep)"/><ellipse cx="1" cy="-1.5" rx="8" ry="4" fill="var(--shade)" opacity="0.8"/></g>`;
const cap = (x: number) => /* svg */ `
  <circle cx="${x}" cy="747" r="18" fill="var(--cap, var(--shade))"/><circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/><circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;

const WALKER_SVG = (id: string, s: number) => /* svg */ `
<svg class="world-walker-svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" width="${(VB.w * s).toFixed(1)}" height="${(VB.h * s).toFixed(1)}"
  style="left:${(-(FEET.x - VB.x) * s).toFixed(1)}px;top:${(-(FEET.y - VB.y) * s).toFixed(1)}px" aria-hidden="true">
  <defs>${defsSvg(id)}</defs>
  <ellipse data-r="shadow" cx="${FEET.x}" cy="${FEET.y + 1}" rx="54" ry="12" fill="#2b1d10" opacity="0.22"/>
  <g data-r="flip"><g data-r="rig">
    <g data-r="lower"><g data-r="legsBack"><g data-r="legs">${limb("leg", "l")}${footSvg("l")}${limb("leg", "r")}${footSvg("r")}</g></g>
    <g data-r="body">
      <g data-r="armsBack"></g>
      <rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g data-r="fbBody">
        <rect x="524" y="826" width="72" height="40" rx="17" fill="var(--deep)"/>
        <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 609 814 603 840 L517 840 C511 814 503 786 503 752 Z" fill="var(--shade)"/>
        <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 599 808 594 832 L526 832 C521 808 509 783 509 754 Z" fill="var(--shell)"/>
        <path d="M598 750 C600 778 595 802 589 824" fill="none" stroke="var(--shade)" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
        <g data-r="backPlate">
          <rect x="541" y="750" width="38" height="5" rx="2.5" fill="var(--shade)"/>
          <rect x="544" y="760" width="32" height="5" rx="2.5" fill="var(--shade)"/>
          <g data-r="nameplate">
            <rect data-r="plate" x="518" y="776" width="84" height="16" rx="6" fill="var(--shade)"/>
            <text data-r="model" x="560" y="788" text-anchor="middle" font-family="var(--mono)" font-size="10" font-weight="650" fill="var(--deep)"></text>
          </g>
        </g>
        <g data-r="chest">
          <rect x="539" y="758" width="42" height="32" rx="11" fill="var(--shade)"/>
          <circle data-r="chestGlow" cx="560" cy="774" r="8" fill="var(--glow)" opacity="0.35"/>
          <circle cx="560" cy="774" r="5" fill="var(--glow)"/>
          <circle cx="546" cy="766" r="2.2" fill="var(--deep)"/><circle cx="574" cy="766" r="2.2" fill="var(--deep)"/>
        </g>
        ${cap(510)}${cap(610)}
      </g>
      <g data-r="sideBody">
        <rect x="534" y="826" width="54" height="40" rx="17" fill="var(--deep)"/>
        <path d="M528 752 C528 735 539 727 552 727 L570 727 C588 727 598 738 598 756 C598 790 592 816 586 840 L536 840 C532 816 528 790 528 752 Z" fill="var(--shade)"/>
        <path d="M534 754 C534 740 543 733 554 733 L568 733 C583 733 590 742 590 758 C590 788 585 810 580 832 L541 832 C538 810 534 786 534 754 Z" fill="var(--shell)"/>
        <rect x="521" y="752" width="11" height="46" rx="5.5" fill="var(--shade)"/>
        <circle cx="586" cy="774" r="5" fill="var(--glow)" opacity="0.85"/>
        ${cap(566)}
      </g>
    </g></g>
    <g data-r="head">
      <g data-r="fbHead">${headSvg(id)}</g>
      ${headSideSvg(id)}
    </g>
    <g data-r="legsFront"></g>
    <g data-r="armsFront">${armSvg("l")}${armSvg("r")}</g>
  </g></g>
</svg>`;
