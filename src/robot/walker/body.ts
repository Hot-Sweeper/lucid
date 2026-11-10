import { RobotPower } from "../render/power";
import { ModelSticker } from "../art/model-sticker";
import { accessorySvg, blushSvg, hatSvg, placeAntenna, styledEyes } from "../art/outfit";
import { hatInfo, paintLookColors, type RobotLook } from "../look";
import { robotSay } from "../voice";
import gsap from "gsap";
import { batteryWeakness, subscriptionBatteries } from "../../office/battery";
import { watch, unwatch, drawNow, sinceDraw, finishDraw } from "../../perf/budget";
import type { RouteView } from "../../world/hidden-route";
import { beginSystem, endSystem } from "../../perf/metrics";
import { setSvgAttribute } from "../../perf/svg-write";
import type { Expression } from "../rig";
import { brandFor, PALETTES, type BrandKind } from "../brand";
import { eyesSvg, paintBrand, paintLook } from "../art/head";
import { ik3, type V3 } from "../ik";
import { bind } from "../util";
import { clamp, lerp } from "../../util/math";
import { pick, rnd } from "../../util/random";
import { reducedMotion as reduced, uid } from "../../util/dom";
import { PROPS, OVER, walkerSticker, WALKER_SVG } from "./art";
import { SpeechBubble } from "./speech";
import { ANKLE, CROUCH_DROP, FEET, HANG, HIP, NECK, SH, SHIN, SIT_DROP, SPEED, STEP, TAU, THIGH, UPPER, FORE, project, restHand, type Activity, type Facing, type P2, type Prop, type WalkerOptions } from "./skeleton";

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
// This file is the body (state, drawing, look, speech and idle life); activities.ts and walker.ts
// add what it does on top.

// Every tween on the robot's state takes over the properties it animates from older tweens.
export const TL = (v: gsap.TimelineVars = {}) => gsap.timeline({ ...v, defaults: { overwrite: "auto", ...(v.defaults ?? {}) } });

const f1 = (n: number) => n.toFixed(1);
const headSize = (look: RobotLook) => Math.min(1.15, Math.max(0.9, look.head ?? 1));

export abstract class WalkerBody {
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
  protected deskEdge: number | null = null;
  protected s: number;
  protected speed: number;
  protected power: RobotPower;
  protected weakness = 0;
  protected remainingBattery: number | null = null;
  protected batteryProvider = "";
  protected stopBattery?: () => void;
  protected refreshBattery = () => {
    const battery = subscriptionBatteries.get(this.batteryProvider);
    this.remainingBattery = battery.remaining;
    this.weakness = batteryWeakness(battery.remaining);
    this.battery.classList.toggle("low", battery.remaining !== null && battery.remaining <= 30 && !battery.charging);
    if (battery.remaining !== null) {
      const fill = this.battery.querySelector("i") as HTMLElement;
      gsap.killTweensOf(fill);
      fill.style.transform = `scaleX(${battery.remaining / 100})`;
    }
    this.updateTitle();
  };
  protected svg: SVGSVGElement;
  protected $: Record<string, SVGElement> = {};
  protected speech: SpeechBubble;
  protected card: HTMLDivElement;
  protected battery: HTMLDivElement;
  // everything the activities animate
  protected st = {
    phase: 0, stride: 0, breath: 0, deep: 0,
    sit: 0, crouch: 0, jump: 0, sq: 0, turn: 0,
    lean: 0, roll: 0, sway: 0, bx: 0, shrug: 0,
    nod: 0, tilt: 0, look: 0, lookY: 0, dim: 0,
    lx: HANG.x, ly: HANG.y, lz: HANG.z, lr: 0, lu: 0, lak: 0,
    rx: HANG.x, ry: HANG.y, rz: HANG.z, rr: 0, ru: 0, rak: 0,
    laugh: 0, chew: 0, bounce: 0, mash: 0, wave: 0, tap: 0, kick: 0, dangle: 0, dizzy: 0, glowPulse: 0,
  };
  protected expr: Expression = "neutral";
  protected blink = { scale: 1 };
  protected propL: Prop = "none";
  protected propR: Prop = "none";
  protected act: gsap.core.Animation | null = null;
  protected actTimers: gsap.core.Tween[] = [];
  protected actAnims = new Set<gsap.core.Animation>();
  protected loops: gsap.core.Animation[] = [];
  protected zTimer = 0;
  protected blinkCall: gsap.core.Tween | null = null;
  protected lifeCall: gsap.core.Tween | null = null;
  protected gen = 0;
  // walking
  protected mv: { pts: P2[]; tails: Float64Array; i: number; wait: number; through: boolean; resolve: () => void } | null = null;
  protected v = 0;
  /** Transit only. Null keeps the entire journey continuous (including camera following). */
  shortcutView: (() => RouteView | null) | null = null;
  protected settleTl: gsap.core.Timeline | null = null;
  // antenna spring (v0 units, local to the current view)
  protected spring = { phi: 0, phiV: 0, tx: 0, tvx: 0, ty: 0, tvy: 0, init: false };
  protected headLag = 0;
  protected handR = { x: 600, y: 840 };
  protected headPx = 0;
  protected layer = { l: "", r: "", legs: "" };
  protected dangling = false;
  protected last = performance.now();
  protected glowPulse = { opacity: 0.9 };

  protected walkerLook: RobotLook = {};
  protected lookKey = "";
  protected lookId = uid("walker-look");
  /** The robot's own head size (look.head), the same as at its desk. */
  protected headK = 1;
  protected modelSticker?: ModelSticker;
  protected carryingReport = false;
  protected reportTitle = "";
  protected footZ = { l: 0, r: 0 };
  protected lastBob = "";
  protected lastPulse = 0;

  constructor(parent: Element, opts: WalkerOptions) {
    this.id = opts.id;
    this.s = opts.scale ?? 0.48;
    this.speed = opts.speed ?? SPEED;
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
    this.speech = new SpeechBubble(parent, !!opts.flavorSpeech, () => ({ x: this.x, top: this.y - (FEET.y - 560) * this.s - 16 + this.headPx }));
    this.el = el;
    this.power = new RobotPower(el, () => this.id, { x: -88, y: -225, w: 176, h: 230 });
    this.svg = el.querySelector("svg")!;
    this.$ = bind(this.svg);
    this.card = el.querySelector(".world-card")!;
    this.battery = el.querySelector(".world-battery")!;
    el.style.setProperty("--head-top", `${((FEET.y - 560) * this.s).toFixed(1)}px`);
    paintBrand(this.svg, this.$, this.brand);
    if (opts.look) this.setLook(opts.look);
    this.setModel(this.model);
    this.setBrand(opts.provider);
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

  /** Advance along the current route (walker.ts). */
  protected abstract moveStep(dt: number): void;
  abstract stop(): void;

  setBrand(provider: string) { this.batteryProvider = provider; this.refreshBattery(); this.stopBattery ||= subscriptionBatteries.subscribe(this.refreshBattery); this.brand = brandFor(provider); paintBrand(this.svg, this.$, this.brand); paintLookColors(this.svg, PALETTES[this.brand], this.walkerLook); }
  protected updateAccessories() {
    const side = this.facing === "left" || this.facing === "right";
    const art = accessorySvg(this.walkerLook.accessory, this.facing === "up" ? "back" : "front");
    const rear = accessorySvg(this.walkerLook.accessory, "back");
    this.$.accessoryUnder.innerHTML = side ? rear.pack + rear.under : art.under;
    this.$.accessoryUnder.setAttribute("transform", side ? "translate(245 0) scale(0.52 1)" : "");
    this.$.accessoryOver.innerHTML = side ? art.over : art.pack + art.over;
    this.$.accessoryOver.setAttribute("transform", side ? "translate(338 0) scale(0.42 1)" : "");
  }
  protected updateHeadwear() {
    const side = this.facing === "left" || this.facing === "right";
    const view = this.facing === "up" ? "back" : "front";
    const art = (suffix: string) => hatSvg(this.walkerLook.hat, view).replace(/lkp([fb])/g, `${this.lookId}-${suffix}-$1`);
    this.$.fbHat.innerHTML = art("fb");
    this.$.sideHat.innerHTML = art("side");
    this.$.sideHat.setAttribute("transform", "translate(98 0) scale(0.82 1)");
    this.$.fbHat.style.display = side ? "none" : "";
    this.$.sideHat.style.display = side ? "" : "none";
    const hat = hatInfo(this.walkerLook.hat ?? "none");
    for (const antenna of [this.$.antennaLift, this.$.sideAntennaLift]) placeAntenna(antenna, hat);
    this.$.fbBlush.innerHTML = this.walkerLook.blush ? blushSvg() : "";
    this.$.fbBlush.style.display = this.facing === "down" ? "" : "none";
  }
  setLook(look: RobotLook) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.walkerLook = {...look}; this.updateAccessories(); paintLook(this.svg, this.$, look, walkerSticker);
    for (const k of ["phones", "sidePhones"]) this.$[k].style.display = look.headphones ? "" : "none";
    paintLookColors(this.svg, PALETTES[this.brand], look);
    this.headK = headSize(look); this.updateHeadwear(); this.setExpression(this.expr);
  }
  setName(name: string) { this.name = name; this.updateTitle(); }
  setModel(model: string | null | undefined) {
    this.model = model ?? "";
    (this.modelSticker ??= new ModelSticker(this.svg)).set(this.model);
    const t = this.$.model as SVGTextElement;
    t.textContent = this.model.length > 15 ? this.model.slice(0, 14) + "…" : this.model;
    this.$.nameplate.style.display = this.model ? "" : "none";
    const w = clamp(t.textContent!.length * 6.1 + 12, 34, 98);
    this.$.plate.setAttribute("x", String(560 - w / 2));
    this.$.plate.setAttribute("width", String(w));
    this.updateTitle();
  }
  protected updateTitle() { this.el.title = [this.name, this.model, this.reportTitle, this.remainingBattery === null ? "" : `${Math.floor(this.remainingBattery)}% subscription battery remaining`].filter(Boolean).join(", "); }

  /** Height of the robot above its feet, in px (for placing things over its head). */
  get height() {
    const top = !this.walkerLook.hat || this.walkerLook.hat === "none" ? 556 : this.walkerLook.hat === "wizard" ? 470 : 510;
    return (FEET.y - (715 + (top - 715) * this.headK)) * this.s;
  }


  setPos(x: number, y: number) { this.x = x; this.y = y; this.place(); }

  protected place() {
    this.el.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px)`;
    this.el.style.zIndex = String(Math.round(this.y) + this.zBias + (this.st.sit > 0.5 ? -2 : 0));
  }

  face(dir: Facing) {
    const was = this.facing;
    this.facing = dir;
    this.updateAccessories();
    this.updateHeadwear();
    const fb = dir === "up" || dir === "down";
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    show("fbBody", fb); show("sideBody", !fb);
    show("fbHead", fb); show("sideHead", !fb);
    show("backPlate", dir === "up"); show("chest", dir === "down");
    setSvgAttribute(this.$.face, "opacity", dir === "down" ? "1" : "0");
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
  protected get ready() { return this.svg.isConnected; }

  protected clearAct() {
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

  setCard(text: string) { this.card.querySelector("span")!.textContent = text; this.card.title = text; }

  setExpression(e: Expression) {
    this.expr = e;
    this.$.eyes.innerHTML = styledEyes(this.walkerLook.eyes, e) ?? eyesSvg(e);
    this.$.sideEyes.innerHTML = styledEyes(this.walkerLook.eyes, e, [604]) ?? eyesSvg(e, [604]);
  }

  /** Speech bubble; `think` draws it as a thought cloud instead. */
  say(text: string | null, ms?: number, think = false) {
    // Spoken lines get the robot's own synthesized babble; thoughts stay silent.
    const voice = () => { if (!think && this.activity !== "nap") robotSay({ el: this.el, seed: this.name || this.id, brand: this.brand, head: this.headK }, text!); };
    if (!this.speech.say(text, ms, think, voice)) return;
    // talking out loud: a nod on the first word
    if (!think && !this.mv && this.activity !== "nap") TL().to(this.st, { nod: "+=3", duration: 0.12, ease: "power2.out" }).to(this.st, { nod: "-=3", duration: 0.25, ease: "sine.inOut" });
  }

  protected setProps(l: Prop, r: Prop) {
    if (this.carryingReport) r = "report";
    this.propL = l; this.propR = r;
    for (const [k, p] of [["L", l], ["R", r]] as const) {
      const over = OVER.has(p);
      this.$["prop" + k + "Over"].innerHTML = over ? PROPS[p] : "";
      this.$["prop" + k + "Under"].innerHTML = over ? "" : PROPS[p];
    }
    this.$.watch.style.display = l === "wrist" ? "" : "none";
  }

  protected antennaDroop(on: boolean) {
    gsap.to(this.$.antennaDroop, { rotation: on ? 20 : 0, svgOrigin: "560 610", duration: on ? 2 : 0.6, ease: on ? "sine.inOut" : "back.out(2)", overwrite: "auto" });
  }

  protected spawnZ() {
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

  protected puff() {
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
  protected scheduleBlink() {
    this.blinkCall = gsap.delayedCall(rnd(1.8, 4.8), () => {
      if (this.expr !== "sleepy" && this.expr !== "laugh" && this.expr !== "happy") {
        const eyes = this.blink;
        const tl = TL()
          .to(eyes, { scale: 0.1, duration: 0.06, ease: "power2.in" }, 0)
          .to(eyes, { scale: 1, duration: 0.11, ease: "power2.out" }, 0.07);
        if (Math.random() < 0.22) tl.to(eyes, { scale: 0.1, duration: 0.06, ease: "power2.in" }, 0.25).to(eyes, { scale: 1, duration: 0.11, ease: "power2.out" }, 0.31);
      }
      this.scheduleBlink();
    });
  }

  protected scheduleLife() {
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
  protected frame = () => {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.svg.isConnected) return;
    this.moveStep(dt);
    // walking goes on every frame; the body is redrawn less often when off screen or tiny
    dt = sinceDraw(this, now);
    if (!drawNow(this, this.svg, now)) return;
    const started = beginSystem();
    const blink = `translate(0 657) scale(1 ${this.blink.scale.toFixed(4)}) translate(0 -657)`;
    for (const eyes of [this.$.eyes, this.$.eyeLight, this.$.sideEyes, this.$.sideEyeLight]) setSvgAttribute(eyes, 'transform', blink);
    this.modelSticker?.step(now);
    const pulse = (this.glowPulse.opacity * (1 - this.weakness * .65)).toFixed(4);
    setSvgAttribute(this.$.antennaGlow, "opacity", pulse);
    setSvgAttribute(this.$.sideGlow, "opacity", pulse);
    const st = this.st, t = now / 1000;
    const side = this.facing === "left" || this.facing === "right";
    const back = this.facing === "up";
    const dangle = st.dangle;

    // walk cycle: contact, down, passing, up (two bobs per cycle); feet planted in stance
    const stride = st.stride * (1 - dangle);
    const run = reduced() ? 0 : (this.speed > SPEED ? clamp((this.v - SPEED * 0.7) / (240 - SPEED * 0.7), 0, 1) : 0);
    const u0 = ((st.phase / TAU) % 1 + 1) % 1;
    const foot = (off: number) => {
      const u = (u0 + off) % 1;
      const stance = 0.5 - run * 0.18, reach = STEP * (1 + run * 0.85);
      if (u < stance) { const s = u / stance; return { z: reach * (1 - 2 * s), lift: 0, rot: lerp(8, -16 - run * 12, s * s) }; }
      const s = (u - stance) / (1 - stance), e = s * s * (3 - 2 * s);
      return { z: -reach + 2 * reach * e, lift: Math.sin(Math.PI * Math.pow(s, 0.8)) * (13 + run * 22), rot: lerp(-22 - run * 16, 10, e) };
    };
    const fl = foot(0), fr = foot(0.5);
    // A lower running hip keeps the longer planted leg within its real reach.
    // Brief airborne passing pose, deeper planted contact, and a tucked recovery foot.
    const flight = Math.max(0, Math.sin(TAU * 2 * (u0 - 0.32)));
    const bob = stride * ((4.2 + run * 5) * Math.cos(TAU * 2 * (u0 - 0.1)) + run * (14 - flight * 7));
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
    const walkLean = stride * (5 + run * 10);
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
      const a = project(this.facing, hip), b = project(this.facing, e), c = project(this.facing, h);
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
      const rest = restHand(prop, this.st.sit);
      const free = prop === "none" || prop === "wrist" || prop === "ball";
      // arm swing opposite to the legs (a beat late), smaller when the hand carries something
      const legZ = k === "l" ? this.footZ.r : this.footZ.l;
      const sw = stride * (free ? 1.2 : 0.12);
      rest.z += legZ * sw;
      rest.y -= Math.abs(legZ) * sw * 0.12;
      rest.x += stride * (free ? 3 : 0);
      if (free) { rest.y -= run * 36; rest.z += run * (14 + legZ * 0.3); }
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
      const a = project(this.facing, sh), b = project(this.facing, e), c = project(this.facing, h);
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
    const hy = neck.y - NECK.y + (bob - this.headLag) * 0.8 + st.nod + chew * 2.4 + fwd * 1.1 - laugh * 0.8 + this.weakness * 15;
    const tilt = st.tilt + laugh * 2.5 + st.look * (side ? 0 : 3) + dSway * 6 - rot * 0.35 + (side ? st.lookY * -4 : 0);
    this.attr(this.$.head, "transform", `translate(${f1(hx)} ${f1(hy)}) rotate(${tilt.toFixed(2)} 560 715)${this.headK === 1 ? "" : ` translate(560 715) scale(${this.headK}) translate(-560 -715)`}`);
    this.attr(this.$.look, "transform", `translate(${f1(st.look * 8)} ${f1(st.lookY * 5)})`);
    this.attr(this.$.sideLook, "transform", `translate(${f1(Math.abs(st.look) * -2)} ${f1(st.lookY * 5)})`);
    this.attr(this.$.shadow, "rx", f1((54 - st.jump * 14 - dangle * 10) * (1 + st.sit * 0.1)));
    this.attr(this.$.shadow, "opacity", (0.22 - dangle * 0.1).toFixed(2));
    const dim = (1 - st.dim * 0.55) * (1 - this.weakness * .6);
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
    this.speech.follow();
    finishDraw();
    endSystem("robots", started);
  };

  protected attr(el: SVGElement, name: string, v: string) {
    const c = ((el as any).__c ??= {}) as Record<string, string>;
    if (c[name] === v) return;
    c[name] = v;
    if (name === "opacity") setSvgAttribute(el, name, v); else el.setAttribute(name, v);
  }



  destroy() {
    this.shortcutView = null;
    this.speech.destroy();
    this.stopBattery?.();
    this.stop();
    this.power.destroy();
    gsap.ticker.remove(this.frame);
    unwatch(this.svg);
    this.clearAct();
    for (const l of this.loops) l.kill();
    this.blinkCall?.kill();
    this.lifeCall?.kill();
    this.settleTl?.kill();
    gsap.killTweensOf([this.st, this, this.blink, this.card, this.$.eyes, this.$.eyeLight, this.$.sideEyes, this.$.sideEyeLight, this.$.antennaDroop]);
    this.el.remove();
  }
}
