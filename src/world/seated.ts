import gsap from "gsap";
import { prettyModel } from "../harness/themes";
import { watch, unwatch, drawNow, sinceDraw } from "./budget";
import { beginSystem, endSystem } from "../perf/metrics";
import { setSvgAttribute } from "../perf/svg-write";
import { sharedVector, releaseVectors } from "../perf/shared-vector";
import { GEOM, PHONE_SCALE, UNIT, type DeskRig, type Expression, type Pose, type Pt, type Reaction, type RobotLook, type SeatedRobot } from "../office/rig";
import { bind, brandFor, clamp, defsSvg, eyesSvg, headSvg, lerp, paintBrand, paintLook, PALETTES, solveArm, uid, type BrandKind, type ArmMemo } from "./seated-parts";
import { accessoryInfo, accessorySvg, blushSvg, BUILD_SHAPE, hatInfo, hatSvg, lookMotion, paintLookColors, resolveLook, stepLookMotion, styledEyes, type FullLook, type LookMotion } from "./look";
import { tierFor } from "../office/tier";

// The v0 robot, seated on the south side of its desk, seen from behind and above.
// The head is the original v0 head (v0 coordinates, scaled by S); the body is a slim, tapered
// shell under it. The arms are two-bone chains solved every frame in desk-unit coordinates so
// the mitten hands rest on the real keys, the mouse, the mug and the phone.
// All secondary motion (antenna spring, groove, weight shifts, swivel) is computed in one
// per-frame pass on the gsap ticker: no filters, no blend modes, a handful of attribute writes.

// Everything is derived from GEOM, so the robot follows the desk contract.
const SH = GEOM.shoulders;
// v0 art scale: the same as every walking robot (hallway, break room, park), so a robot looks
// the same size sitting at its desk as it does walking in. The rig scales around the shoulder
// point; the hands still reach the desk props, which keep their desk coordinates.
export const SEATED_SCALE = 0.42;
const S = SEATED_SCALE;
const K = S / 0.5;                                        // relative to the size the desk props were tuned at
const U = S / 0.58;                                       // relative to the size the details were tuned at
const ORIGIN = { x: (SH.left.x + SH.right.x) / 2, y: (SH.left.y + SH.right.y) / 2 }; // v0 (560, 748)
const HEAD_DROP = (GEOM.head.y - 2 - (ORIGIN.y - 89 * S)) / S; // tucks the head toward GEOM.head (the steep view hides the neck)
const MAP = `translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S}) translate(-560 -748)`;
const SHOULDER = 50;                                      // v0 half shoulder width of the regular build: slimmer than the original 60
// Back view: the upper arm hangs down toward the floor, so from up here it reads short and the
// elbow stays tucked at the side; the forearm reaches forward over the desk. Facing the camera the
// forearm is the foreshortened one.
const UPPER = 42 * S, FORE = 160 * S;
const HX = GEOM.head.x, HY = GEOM.head.y;
const TABLE_FRONT = GEOM.table.y + GEOM.table.h;
const BACK_TOP = ORIGIN.y + 56 * S;     // backrest top: below the jersey plate, over the lower back
const P = (x: number, y: number) => ({ x: HX + x * U, y: HY + y * U });  // offsets around the head

// Resting: forearms lie folded along the desk edge, elbows out, hands tucked behind the head.
const REST_L = { x: HX - 20 * U, y: TABLE_FRONT - 5 }, REST_R = { x: HX + 20 * U, y: TABLE_FRONT - 5 };
const IDLE_L = { x: HX - 32 * U, y: TABLE_FRONT - 10 }, IDLE_R = { x: HX + 32 * U, y: TABLE_FRONT - 10 };
const FOLD_BONE = 53 * U;
const LAP_L = { x: ORIGIN.x - 15 * U, y: ORIGIN.y + 42 * U }, LAP_R = { x: ORIGIN.x + 15 * U, y: ORIGIN.y + 42 * U };
const PHONE_W = 150 * PHONE_SCALE, PHONE_H = 300 * PHONE_SCALE;   // the held phone: a 150x300 element (rig.ts PHONE_SCALE)
// Over the left shoulder: the phone's right edge tucks just behind the head, top at eye level.
const PHONE_HOLD = { x: HX - 80 * K, y: HY - 52 * K };   // beside the head, only its edge tucked behind it, above the desk plate
const PHONE_TILT = 7;
const LEFT_KEYS = "qwertasdfgzxcvb12345";
const RIGHT_KEYS = "yuiophjklnm,.67890 ";
const LETTERS = "etaoinshrdlucmfwypgbvk";   // auto typing picks letters by rough English frequency
const CALM: Partial<Record<Pose, number>> = { rest: 1, idle: 1, read: 0.8, think: 0.7, ask: 0.6, notice: 0.5, type: 0.35, mouse: 0.5, phone: 0.5 };

type Side = "l" | "r";
const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const done = (a: gsap.core.Animation) => new Promise<void>((r) => { a.eventCallback("onComplete", () => r()); a.eventCallback("onInterrupt", () => r()); });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

export class TopDownRobot implements SeatedRobot {
  el: SVGSVGElement;
  private id = uid("tdr");
  private brand: BrandKind = "codex";
  private pose: Pose = "rest";
  private typing = false;
  private facing = false;
  private expr: Expression = "neutral";
  private $: Record<string, SVGElement> = {};
  private rig = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y, hx: 0, hy: 0, rot: 0, yaw: 0, lean: 0, body: 0, sx: 1, bx: 0, by: 0, shrug: 0, shake: 0, upper: UPPER, fore: FORE, sw: 0, base: 0 };
  private lift = { l: 0, r: 0 };
  private fold = { l: 1, r: 1 };
  private press = { l: 0, r: 0 };
  private bob = { v: 0 };
  private ant = { v: 0 };                         // anticipation dip before a pose change
  private shift = { x: 0, r: 0 };                 // slow weight shifts
  private ponder = { v: 0, side: 1, target: 0 };  // typing pause: head tilts toward the screen
  private groove = { amp: 0, bpm: 0, phase: 0, beat: 0 };
  private hp = { on: false, y: 0, sx: 1, sy: 1, o: 0, grip: 0 };
  private spring = { phi: 0, phiV: 0, tx: 0, tvx: 0, ty: 0, tvy: 0, kick: 0 };
  private wrist = { vx: 0, lastX: 0 };
  private front = { l: false, r: false };
  private mouseP: Pt;
  private mouseSpin = 0;
  private mouseGoal: Pt;                          // where the real cursor says the mouse should be
  private mouseW = { v: 0 };
  private lastMouse = "";
  private gripL = { w: 0 };
  private gripR = { w: 0 };
  private mugP: Pt | null = null;
  private mugTilt = { v: 0 };
  private phoneP: Pt | null = null;
  private phoneTilt = { v: 0 };
  private swipeP = { x: 0, y: 0, on: 0 };
  private thumb: SVGSVGElement;
  private busy = false;
  private dead = false;
  private fitting = false;
  private carrying = false;
  private phoneShown = false;
  private lastExt = 0;
  private lastAny = 0;
  private lastPress = { l: 0, r: 0 };
  private nextAuto = 0;
  private autoQ: string[] = [];
  private homed = { l: true, r: true };
  private liftTl: Partial<Record<Side, gsap.core.Timeline>> = {};
  private handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y };
  private poseAnim: gsap.core.Animation | null = null;
  private reactTl: gsap.core.Animation | null = null;
  private antTl: gsap.core.Animation | null = null;
  private swTl: gsap.core.Animation | null = null;
  private hpTl: gsap.core.Animation | null = null;
  private propTl: gsap.core.Animation | null = null;
  private blinkCall: gsap.core.Tween | null = null;
  private shiftCall: gsap.core.Tween | null = null;
  private loops: gsap.core.Animation[] = [];
  private glow = "#7cf2ff";
  private glowPulse = { opacity: 0.9 };
  private spokes: SVGElement[] = [];
  private lastBase = NaN;
  private lastSw = "";
  private look: FullLook = resolveLook();
  private hasLook = false;
  private shoulder = SHOULDER;                    // v0 half shoulder width for the current build
  private motion: LookMotion = { sway: [], spin: [] };
  private sway = { v: 0, vel: 0, lastBx: 0 };
  private modelName: string | null = null;
  private armMemo: Record<"L" | "R", ArmMemo> = { L: {}, R: {} };

  constructor(host: HTMLElement, private desk: DeskRig) {
    const id = this.id;
    host.insertAdjacentHTML("beforeend", ROBOT(id));
    this.el = host.lastElementChild as SVGSVGElement;
    this.$ = bind(this.el);
    this.spokes = [...this.el.querySelectorAll<SVGElement>("[data-spoke]")];
    // The fingers that hold the phone sit above the phone (which the desk draws above the robot).
    const thumbHost = host.parentElement ?? host;
    thumbHost.insertAdjacentHTML("beforeend", `<svg class="world-thumb" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px" aria-hidden="true"><g data-t="g" opacity="0">
      <ellipse cx="0" cy="0" rx="4.6" ry="6.8" fill="var(--shade)"/><ellipse cx="-1" cy="-1.8" rx="2.9" ry="4.3" fill="var(--shell)"/></g></svg>`);
    this.thumb = thumbHost.lastElementChild as SVGSVGElement;
    this.mouseP = { ...desk.mouse };
    this.mouseGoal = { ...desk.mouse };
    this.wrist.lastX = this.mouseP.x;
    this.setBrand("codex");
    this.setExpression("neutral");
    this.loops.push(
      gsap.to(this.rig, { body: 1, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(this.glowPulse, { opacity: 0.55, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    );
    this.scheduleShift();
    this.setPose("rest");
    gsap.ticker.add(this.frame);
    watch(this.el);
  }

  get brandName() { return this.brand; }
  get currentPose() { return this.pose; }

  setBrand(provider: string) {
    this.brand = brandFor(provider);
    paintBrand(this.el, this.$, this.brand);
    paintBrand(this.thumb, {}, this.brand);
    this.glow = getComputedStyle(this.el).getPropertyValue("--glow").trim() || this.el.style.getPropertyValue("--glow");
    if (this.hasLook) this.applyColors();
  }

  // Tint, glow and fabric colour on top of the brand palette (also on the phone thumb).
  private applyColors() {
    this.glow = paintLookColors(this.el, PALETTES[this.brand], this.look);
    paintLookColors(this.thumb, PALETTES[this.brand], this.look);
  }

  setModel(name: string | null) {
    const t = this.$.model as SVGTextElement, plate = this.$.plate;
    this.modelName = name;
    if (!name) { this.$.nameplate.style.display = "none"; return; }
    this.$.nameplate.style.display = "";
    const pretty = prettyModel(name) || name;
    const label = pretty.length > 16 ? pretty.slice(0, 15) + "…" : pretty;
    t.textContent = label;
    // The back is slim now: the plate stays inside it and long names are condensed to fit.
    const w = clamp(label.length * 6.2 + 14, 40, 92 * BUILD_SHAPE[this.look.build].kx);
    plate.setAttribute("x", String(560 - w / 2));
    plate.setAttribute("width", String(w));
    if (label.length * 6.2 > w - 10) { t.setAttribute("textLength", String(w - 10)); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
    else t.removeAttribute("textLength");
    (this.$.nameTitle as SVGTitleElement).textContent = name;
    // Stronger models look a touch more distinguished: a gold rim and a rank pip on the plate
    // for flagship models, a silver rim for standard ones, nothing extra for light ones.
    const tier = tierFor(name);
    plate.style.stroke = tier === "flagship" ? "#ffcf5a" : tier === "standard" ? "rgba(200, 210, 235, 0.9)" : "";
    plate.style.strokeWidth = tier === "light" ? "" : tier === "flagship" ? "2.4" : "1.4";
    let pip = this.$.nameplate.querySelector(".tier-pip") as SVGPathElement | null;
    if (!pip) {
      pip = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pip.setAttribute("class", "tier-pip");
      this.$.nameplate.appendChild(pip);
    }
    const px = 560 - w / 2 - 9, py = Number(plate.getAttribute("y") || 0) + Number(plate.getAttribute("height") || 14) / 2;
    pip.setAttribute("d", `M${px} ${py - 5} L${px + 5} ${py} L${px} ${py + 5} L${px - 5} ${py} Z`);
    pip.setAttribute("fill", "#ffcf5a");
    pip.style.display = tier === "flagship" ? "" : "none";
    this.el.dataset.tier = tier;
  }

  setLook(look: RobotLook) {
    this.look = resolveLook(look);
    this.hasLook = true;
    paintLook(this.el, this.$, look);
    this.applyColors();
    this.renderLook();
    if (this.modelName) this.setModel(this.modelName);
    if (look.headphones !== undefined && look.headphones !== this.hp.on) {
      this.hpTl?.kill();
      this.fitting = false;
      this.hp.on = look.headphones;
      Object.assign(this.hp, { y: 0, sx: 1, sy: 1, o: look.headphones ? 1 : 0, grip: 0 });
    }
  }

  // Hat, accessory, build and face extras for the side we are looking at.
  private renderLook() {
    const L = this.look, view = this.facing ? "front" : "back";
    const hat = hatInfo(L.hat), head = this.$.head, lift = this.$.antennaLift;
    this.$.hat.innerHTML = hatSvg(L.hat, view);
    // the antenna pokes out of low hats (drawn over them), sits on top of tall ones or hides under them
    if (hat.antenna === "through") { if (lift.nextSibling !== this.$.phones) head.insertBefore(lift, this.$.phones); }
    else if (head.firstChild !== lift) head.insertBefore(lift, head.firstChild);
    lift.style.display = hat.antenna === "hide" ? "none" : "";
    lift.setAttribute("transform", hat.antenna === "lift" ? `translate(0 ${-(hat.lift ?? 0)})` : "");
    const acc = accessorySvg(L.accessory, view);
    this.$.accUnder.innerHTML = acc.under;
    this.$.accPack.innerHTML = acc.pack;
    this.$.accOver.innerHTML = acc.over;
    this.$.vents.style.display = accessoryInfo(L.accessory).covers ? "none" : "";
    const b = BUILD_SHAPE[L.build];
    this.shoulder = b.shoulder;
    const wide = `translate(560 0) scale(${b.kx} 1) translate(-560 0)`;
    this.$.shellG.setAttribute("transform", wide);
    this.$.accOverG.setAttribute("transform", wide);
    this.$.shL.setAttribute("transform", `translate(${SHOULDER - b.shoulder} 0)`);
    this.$.shR.setAttribute("transform", `translate(${b.shoulder - SHOULDER} 0)`);
    for (const k of ["L", "R"]) {
      this.$[`arm${k}Up`].setAttribute("stroke-width", f(19 * S * b.arm));
      this.$[`arm${k}Fo`].setAttribute("stroke-width", f(15 * S * b.arm));
    }
    this.$.blush.innerHTML = L.blush ? blushSvg() : "";
    this.$.blush.style.display = L.blush ? "" : "none";
    this.$.eyes.innerHTML = this.eyesFor(this.expr);
    this.motion = lookMotion(this.el);
  }

  private eyesFor(e: Expression) { return styledEyes(this.look.eyes, e) ?? eyesSvg(e); }

  // ---- poses --------------------------------------------------------------------------
  setPose(p: Pose) {
    if (p === this.pose && p !== "type") return;
    const prev = this.pose;
    this.pose = p;
    if (p !== "type") this.typing = false;
    this.poseAnim?.kill();
    this.poseAnim = null;
    this.reactTl?.kill();
    this.reactTl = null;
    if (prev === "sleep" && p !== "sleep") this.antennaAwake();
    if (this.phoneP && p !== "phone") void this.holdPhone(false);
    const faces = p === "ask" || p === "notice" || p === "celebrate";
    if (this.facing && !faces) this.turnAround(false);
    // Anticipation: the body sinks a little before it moves, then springs into the new pose.
    if (p !== prev) {
      this.antTl?.kill();
      this.antTl = gsap.timeline()
        .to(this.ant, { v: 1, duration: 0.12, ease: "power2.out" })
        .to(this.ant, { v: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
    }
    const ease = "back.inOut(1.2)";
    const hands = (l: Pt, r: Pt, d = 0.55, delayR = 0.06, delay = 0) => {
      this.handHome = { lx: l.x, ly: l.y, rx: r.x, ry: r.y };
      const folded = (q: Pt) => (Math.abs(q.y - REST_L.y) < 8 && Math.abs(q.x - HX) < 40 * U ? 1 : 0);
      gsap.to(this.fold, { l: folded(l), r: folded(r), duration: d * 0.8, ease: "power2.inOut", delay: delay + 0.06, overwrite: true });
      gsap.to(this.rig, { lx: l.x, ly: l.y, duration: d, ease, delay: delay + 0.06, overwrite: "auto" });
      gsap.to(this.rig, { rx: r.x, ry: r.y, duration: d, ease, delay: delay + 0.06 + delayR, overwrite: "auto" });
    };
    // The head leads the hands a touch and settles with a small overshoot.
    const head = (rot: number, hx: number, hy: number, lean: number, d = 0.7) =>
      gsap.to(this.rig, { rot, hx, hy, lean, yaw: 0, by: 0, bx: 0, duration: d, ease: "back.out(1.5)", delay: 0.04, overwrite: "auto" });
    const mouse = (on: boolean) => gsap.to(this.mouseW, { v: on ? 1 : 0, duration: 0.45, ease: "power2.inOut", overwrite: true });
    const layer = (l: boolean, r: boolean, at = 0) => gsap.delayedCall(at, () => { this.front.l = l; this.front.r = r; this.layerArms(); });
    if (!faces && p !== "phone") layer(false, false, p === prev ? 0 : 0.18);
    const home = { l: this.desk.homeLeft, r: this.desk.homeRight };

    switch (p) {
      case "type":
        mouse(false);
        hands(home.l, home.r, 0.42, 0.04);
        head(0, 0, 4, 0.15, 0.5);
        this.homed = { l: true, r: true };
        this.lastAny = performance.now();
        break;
      case "mouse":
        mouse(true);
        hands({ x: home.l.x, y: home.l.y + 4 }, IDLE_R, 0.45, 0);
        head(2, 4, 2, 0.1, 0.5);
        break;
      case "read":
        mouse(true);
        hands(IDLE_L, IDLE_R, 0.5, 0.05);
        head(-1, 0, -2, 0.25, 0.6);
        break;
      case "think":
        mouse(false);
        hands(REST_L, P(47, -22), 0.7, 0.12);
        layer(false, true, 0.3);
        head(-7, -6, -6, -0.2, 0.9);
        this.poseAnim = gsap.to(this.rig, { ry: P(47, -30).y, duration: 0.22, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.95 });
        break;
      case "ask":
      case "notice":
        mouse(false);
        hands(LAP_L, LAP_R, 0.6, 0.08, 0.15);
        head(0, 0, p === "notice" ? -10 : -6, -0.1, 0.6);
        if (!this.facing) this.turnAround(true);
        if (p === "notice") gsap.fromTo(this.rig, { by: -7 }, { by: 0, duration: 0.6, ease: "bounce.out", delay: 0.75 });
        break;
      case "celebrate": {
        mouse(false);
        hands(P(-74, -54), P(74, -54), 0.4, 0.05, 0.3);
        head(0, 0, -10, -0.15, 0.4);
        if (!this.facing) this.turnAround(true);
        const was = this.expr;
        if (was === "neutral") this.setExpression("happy");
        this.poseAnim = gsap.timeline({ delay: 0.8 })
          .to(this.rig, { ly: P(0, -68).y, ry: P(0, -40).y, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 5 })
          .add(() => { if (this.pose === "celebrate") { if (was === "neutral") this.setExpression("neutral"); this.setPose("rest"); } }, "+=0.5");
        break;
      }
      case "rest":
        mouse(false);
        hands(REST_L, REST_R, 0.8, 0.1);
        head(3, 0, 2, -0.05, 0.9);
        break;
      case "sleep":
        mouse(false);
        hands({ x: REST_L.x + 4, y: REST_L.y + 4 }, { x: REST_R.x - 4, y: REST_R.y + 6 }, 1.4, 0.2);
        gsap.to(this.rig, { rot: 9, hx: 2, hy: 16, lean: -0.12, yaw: 0, by: 3, shrug: -2, duration: 1.8, ease: "power2.inOut", delay: 0.1, overwrite: "auto" });
        gsap.to(this.$.antenna, { opacity: 0.45, duration: 2, ease: "sine.inOut" });
        gsap.to(this.$.antennaDroop, { rotation: 18, duration: 2, transformOrigin: "50% 100%", ease: "sine.inOut" });
        break;
      case "phone":
        void this.holdPhone(true);
        break;
      case "stretch":
        mouse(false);
        hands(P(-22, -84), P(22, -84), 0.8, 0.06);
        layer(true, true, 0.35);
        gsap.to(this.rig, { rot: 0, hx: 0, hy: 7, lean: -0.3, yaw: 0, by: -3, shrug: 3, duration: 0.8, ease: "power2.inOut", overwrite: "auto" });
        this.poseAnim = gsap.delayedCall(2, () => { if (this.pose === "stretch") { gsap.to(this.rig, { shrug: 0, duration: 0.6 }); this.setPose("rest"); } });
        break;
      default:
        mouse(false);
        hands(IDLE_L, IDLE_R, 0.7, 0.08);
        head(0, 0, 0, 0, 0.8);
    }
  }

  setTyping(on: boolean) {
    if (this.typing === on) return;
    this.typing = on;
    if (on) { this.autoQ = []; this.nextAuto = performance.now() + 120; this.setPose("type"); }
    else {
      gsap.to(this.lift, { l: 0, r: 0, duration: 0.2, overwrite: true });
      const h = { l: this.desk.homeLeft, r: this.desk.homeRight };
      if (this.pose === "type") gsap.to(this.rig, { lx: h.l.x, ly: h.l.y, rx: h.r.x, ry: h.r.y, duration: 0.35, ease: "power2.out", overwrite: "auto" });
    }
  }

  pressKey(key: string) { this.hit(key, true); }

  tap(key?: string) {
    if (key) { this.hit(key, true); return; }
    const side: Side = Math.random() < 0.5 ? "l" : "r";
    const keys = side === "l" ? LEFT_KEYS : RIGHT_KEYS;
    this.hit(keys[Math.floor(Math.random() * keys.length)], true);
  }

  private hit(key: string, ext: boolean) {
    const now = performance.now();
    if (ext) this.lastExt = now;
    const k = this.desk.keyPos(key);
    if (!k || this.facing || this.busy || this.fitting || this.phoneP || this.pose === "sleep") { this.desk.pressKey(key); return; }
    if (this.pose !== "type") { this.setPose("type"); this.typing = this.typing || !ext; }
    this.lastAny = now;
    const side: Side = k.hand === "left" ? "l" : "r";
    if (side === "r" && this.mouseW.v > 0) gsap.to(this.mouseW, { v: 0, duration: 0.12, overwrite: true });
    if (this.fold[side] > 0) gsap.to(this.fold, { [side]: 0, duration: 0.1, overwrite: "auto" });
    const gap = now - this.lastPress[side];
    this.lastPress[side] = now;
    this.homed[side] = false;
    // Faster typing shortens the travel, but the hand always travels to the real key.
    const t = clamp((gap / 1000) * 0.6, 0.05, 0.14);
    const big = key === "Enter" || key === " " || key === "Backspace";
    const h = (big ? 1.35 : 0.75 + Math.random() * 0.45);   // varied finger height: no two strokes alike
    gsap.to(this.rig, { [side + "x"]: k.x, [side + "y"]: k.y + 1, duration: t, ease: "power2.out", overwrite: "auto" });
    this.liftTl[side]?.kill();
    this.liftTl[side] = gsap.timeline()
      .to(this.lift, { [side]: h, duration: t * 0.45, ease: "power2.out" })
      .to(this.lift, { [side]: 0, duration: t * 0.55, ease: "power3.in" })
      .add(() => {
        this.desk.pressKey(key);
        gsap.fromTo(this.press, { [side]: 1 }, { [side]: 0, duration: 0.16, ease: "power2.out" });
        gsap.fromTo(this.bob, { v: big ? 1.4 : 0.6 + Math.random() * 0.5 }, { v: 0, duration: 0.26, ease: "power2.out", overwrite: true });
      });
    gsap.to(this.rig, { yaw: ((k.x - 200) / 110) * 0.16, rot: ((k.x - 200) / 110) * 2, duration: 0.5, ease: "power2.out", overwrite: "auto" });
  }

  click() {
    gsap.timeline().to(this.press, { r: 1, duration: 0.05 }).to(this.press, { r: 0, duration: 0.12, ease: "power2.out" });
  }

  // The on-screen cursor moved: the physical mouse follows the same path, frame by frame, at
  // the scale of a real mouse (the whole screen is about the width of the pad). It is not
  // tweened here: restarting an eased tween every frame is what made it crawl before.
  mouseTo(nx: number, ny: number) {
    const m = this.desk.mouse;
    this.mouseGoal = { x: m.x + (nx - 0.5) * 25, y: m.y + (ny - 0.5) * 15 };
    if (this.mouseW.v < 0.999 && !gsap.isTweening(this.mouseW) && !this.facing && !this.busy && !this.fitting && !this.phoneP && this.pose !== "sleep" && this.pose !== "think" && this.pose !== "stretch")
      gsap.to(this.mouseW, { v: 1, duration: 0.35, ease: "power2.inOut" });
  }

  nudgeMouse(nx: number, ny: number) { this.mouseTo(nx, ny); }

  lookAt(nx: number, ny = 0.5) {
    if (this.facing || this.pose === "think" || this.pose === "sleep" || this.phoneP) return;
    gsap.to(this.rig, { yaw: (nx - 0.5) * 0.45, rot: (nx - 0.5) * 4, hy: (ny - 0.5) * 6, duration: 0.6, ease: "back.out(1.3)", overwrite: "auto" });
  }

  setExpression(e: Expression) {
    const changed = e !== this.expr;
    this.expr = e;
    const paint = () => { this.$.eyes.innerHTML = this.eyesFor(e); };
    if (!changed || !this.facing) { paint(); return; }
    gsap.timeline()
      .to([this.$.eyes, this.$.eyeLight], { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" })
      .add(paint)
      .to([this.$.eyes, this.$.eyeLight], { scaleY: 1, duration: 0.12, ease: "back.out(2)" });
  }

  // ---- headphones and music ----------------------------------------------------------------
  /** Puts the headphones on (hands lift them over the head and press them onto the ears) or takes them off. */
  setHeadphones(on: boolean) {
    if (on === this.hp.on) return;
    this.hp.on = on;
    this.hpTl?.kill();
    const hp = this.hp;
    const hands = !this.busy && !this.phoneP && !this.carrying && this.pose !== "sleep";
    if (!hands) {
      // hands are full: they just settle on (or lift off) by themselves
      this.fitting = false;
      this.hpTl = on
        ? gsap.timeline().set(hp, { y: -26, sx: 1.1, sy: 0.94, o: 0 }).to(hp, { o: 1, duration: 0.15 }).to(hp, { y: 0, sx: 1, sy: 1, duration: 0.5, ease: "back.out(2)" }, 0)
          .add(() => this.kickAntenna(0, 90), 0.3)
        : gsap.timeline().to(hp, { y: -26, sx: 1.08, duration: 0.35, ease: "power2.out" }).to(hp, { o: 0, duration: 0.2 }, 0.15);
      return;
    }
    this.fitting = true;
    const was = { ...this.front };
    this.front.l = true; this.front.r = true;
    this.layerArms();
    gsap.to(this.lift, { l: 0, r: 0, duration: 0.15, overwrite: true });
    const finish = () => {
      this.fitting = false;
      if (!this.facing) { this.front.l = was.l; this.front.r = was.r; this.layerArms(); }
    };
    const tl = gsap.timeline({ onComplete: finish });
    tl.to(this.ant, { v: 0.7, duration: 0.12, ease: "power2.out" }, 0)
      .to(this.ant, { v: 0, duration: 0.5, ease: "power2.out" }, 0.12);
    if (on) {
      gsap.set(hp, { y: -38, sx: 1.16, sy: 0.92, o: 0, grip: 0 });
      tl.to(hp, { grip: 1, duration: 0.45, ease: "back.out(1.4)" }, 0.06)
        .to(hp, { o: 1, duration: 0.16 }, 0.24)
        .to(hp, { y: 0, duration: 0.3, ease: "power2.in" }, 0.56)
        .add(() => { this.kickAntenna(0, 140); gsap.fromTo(this.bob, { v: 1.6 }, { v: 0, duration: 0.45, ease: "power2.out", overwrite: true }); }, 0.86)
        .to(hp, { sx: 1, sy: 1, duration: 0.6, ease: "elastic.out(1, 0.45)" }, 0.86)
        .to(hp, { grip: 0, duration: 0.55, ease: "back.inOut(1.2)" }, 1.0);
    } else {
      tl.to(hp, { grip: 1, duration: 0.42, ease: "back.out(1.4)" }, 0.06)
        .to(hp, { y: -40, sx: 1.14, sy: 0.94, duration: 0.36, ease: "power2.out" }, 0.5)
        .add(() => this.kickAntenna(0, -60), 0.5)
        .to(hp, { o: 0, duration: 0.22 }, 0.76)
        .to(hp, { grip: 0, duration: 0.5, ease: "back.inOut(1.2)" }, 0.82);
    }
    this.hpTl = tl;
  }

  /** Bob to the music: head on the beat, shoulders sway, the antenna bounces. 0 stops smoothly. */
  setGroove(bpm: number) {
    const g = this.groove;
    bpm = Number.isFinite(bpm) ? clamp(bpm, 0, 220) : 0;
    if (bpm > 0) {
      if (g.amp < 0.01) { g.phase = 0.6; g.beat = 0; }   // start a little before the first beat
      g.bpm = bpm;
      gsap.to(g, { amp: 1, duration: 0.8, ease: "power2.out", overwrite: "auto" });
    } else {
      gsap.to(g, { amp: 0, duration: 0.9, ease: "power2.inOut", overwrite: "auto" });
    }
  }

  react(kind: Reaction) {
    const r = this.rig;
    switch (kind) {
      case "focus":
        gsap.to(r, { lean: 0.32, hy: 3, duration: 0.6, ease: "back.out(1.4)", overwrite: "auto" });
        if (this.facing) this.setExpression("focus");
        break;
      case "relax":
        gsap.timeline().to(r, { shrug: 4, duration: 0.6, ease: "sine.inOut" }).to(r, { shrug: -1.5, lean: -0.1, duration: 0.9, ease: "sine.inOut" }).to(r, { shrug: 0, duration: 0.6 });
        break;
      case "cheer": {
        if (this.facing) this.flashExpr("happy", 1400);
        const h = { ...this.handHome };
        this.reactTl?.kill();
        this.reactTl = gsap.timeline()
          .to(r, { lx: P(-64, -54).x, ly: P(-64, -54).y, rx: P(64, -54).x, ry: P(64, -54).y, duration: 0.22, ease: "back.out(2)", overwrite: "auto" })
          .to(r, { ly: P(0, -78).y, ry: P(0, -78).y, duration: 0.14, yoyo: true, repeat: 3, ease: "sine.inOut" })
          .to(r, { ...h, duration: 0.4, ease: "power2.inOut" });
        this.pulseAntenna("#4ff0a0");
        this.kickAntenna(120, 80);
        break;
      }
      case "angry": this.slam(); break;
      case "laugh":
        if (this.facing) this.flashExpr("laugh", 1500);
        gsap.timeline().to(r, { shake: 1, duration: 0.08, yoyo: true, repeat: 11, ease: "sine.inOut" }).set(r, { shake: 0 });
        gsap.fromTo(r, { rot: r.rot - 4 }, { rot: r.rot, duration: 1, ease: "elastic.out(1, 0.4)" });
        break;
      case "shy":
        if (this.facing) this.flashExpr("shy", 2200);
        gsap.timeline().to(r, { rot: 8, hy: 6, shrug: 3, duration: 0.45, ease: "back.out(1.5)" }).to(r, { rot: 0, hy: 0, shrug: 0, duration: 0.6, ease: "power2.inOut" }, "+=1.2");
        break;
      case "surprised":
        if (this.facing) this.flashExpr("surprised", 1200);
        gsap.timeline().to(r, { by: -8, duration: 0.14, ease: "power2.out" }).to(r, { by: 0, duration: 0.5, ease: "bounce.out" });
        this.kickAntenna(-260, -120);
        break;
    }
  }

  private flashExpr(e: Expression, ms: number) {
    const was = this.expr;
    this.setExpression(e);
    gsap.delayedCall(ms / 1000, () => { if (this.expr === e) this.setExpression(was); });
  }

  private pulseAntenna(color: string) {
    gsap.timeline()
      .to(this.el, { "--glow": color, duration: 0.15 } as gsap.TweenVars)
      .to(this.$.antennaGlow, { scale: 1.6, transformOrigin: "50% 50%", duration: 0.2, yoyo: true, repeat: 1 }, 0)
      .to(this.el, { "--glow": this.glow, duration: 0.8, ease: "sine.inOut" } as gsap.TweenVars, 0.6);
  }

  /** Push the antenna spring: angular velocity (deg/s) and stretch velocity. */
  private kickAntenna(av: number, stretch: number) {
    this.spring.phiV += av;
    this.spring.tvy -= stretch;
  }

  // Both fists come up and slam the desk; keys jump.
  private slam() {
    if (this.facing) { this.flashExpr("angry", 1600); }
    const r = this.rig, h = { ...this.handHome };
    this.pulseAntenna("#ff6f91");
    gsap.to(this.mouseW, { v: 0, duration: 0.1, overwrite: true });
    if (this.facing) {
      gsap.timeline().to(r, { shake: 1, duration: 0.05, yoyo: true, repeat: 9 }).set(r, { shake: 0 });
      return;
    }
    this.reactTl?.kill();
    this.reactTl = gsap.timeline()
      .to(r, { lx: REST_L.x + 4, ly: REST_L.y - 18, rx: REST_R.x - 4, ry: REST_R.y - 18, duration: 0.25, ease: "power2.out", overwrite: "auto" })
      .to(this.lift, { l: 3, r: 3, duration: 0.25, ease: "power2.out" }, 0)
      .to(r, { hy: -5, lean: 0.2, duration: 0.25 }, 0)
      .to(this.lift, { l: 0, r: 0, duration: 0.07, ease: "power4.in" })
      .to(r, { ly: REST_L.y - 4, ry: REST_R.y - 4, hy: 6, duration: 0.07, ease: "power4.in" }, "<")
      .add(() => {
        for (const k of "qweasdzxcuiojklm,.") if (Math.random() < 0.6) this.desk.pressKey(k);
        gsap.fromTo(this.press, { l: 1, r: 1 }, { l: 0, r: 0, duration: 0.3 });
        this.kickAntenna(0, 220);
      })
      .to(r, { shake: 1, duration: 0.04, yoyo: true, repeat: 5 })
      .set(r, { shake: 0 })
      .to(r, { ...h, hy: 0, lean: 0, duration: 0.6, ease: "power2.inOut" }, "+=0.35");
  }

  wake() {
    if (this.pose !== "sleep") return;
    this.setPose("rest");
    gsap.fromTo(this.rig, { hy: -10 }, { hy: 2, duration: 0.5, ease: "back.out(3)" });
    this.kickAntenna(-200, 160);
  }

  private antennaAwake() {
    gsap.to(this.$.antenna, { opacity: 1, duration: 0.4 });
    gsap.to(this.$.antennaDroop, { rotation: 0, duration: 0.6, transformOrigin: "50% 100%", ease: "back.out(2)" });
  }

  // ---- idle life ------------------------------------------------------------------------------
  private scheduleShift() {
    this.shiftCall = gsap.delayedCall(rnd(2.5, 6.5), () => {
      gsap.to(this.shift, { x: rnd(-1.7, 1.7), r: rnd(-2.2, 2.2), duration: rnd(1.1, 1.9), ease: "sine.inOut", overwrite: true });
      this.scheduleShift();
    });
  }

  private scheduleBlink() {
    this.blinkCall?.kill();
    this.blinkCall = gsap.delayedCall(rnd(1.8, 4.6), () => {
      const eyes = [this.$.eyes, this.$.eyeLight];
      const tl = gsap.timeline()
        .to(eyes, { scaleY: 0.1, duration: 0.06, transformOrigin: "50% 50%", ease: "power2.in" })
        .to(eyes, { scaleY: 1, duration: 0.11, ease: "power2.out" });
      if (Math.random() < 0.22) tl.to(eyes, { scaleY: 0.1, duration: 0.06, ease: "power2.in" }, "+=0.08").to(eyes, { scaleY: 1, duration: 0.11, ease: "power2.out" });
      this.scheduleBlink();
    });
  }

  // ---- props ----------------------------------------------------------------------------
  async drink() {
    if (this.dead || this.busy || this.phoneP) return;
    this.busy = true;
    if (this.facing) { this.setPose("rest"); await wait(1.1); }
    if (this.dead) return;
    const prevPose = this.pose;
    this.typing = false;
    gsap.to(this.mouseW, { v: 0, duration: 0.3, overwrite: true });
    const home = { ...this.desk.mug };
    const mug = (this.mugP = { ...home });
    const r = this.rig;
    const tl = this.propTl = gsap.timeline();
    gsap.to(this.fold, { r: 0, duration: 0.3, overwrite: "auto" });
    tl.to(r, { bx: 14 * U, rot: 4, duration: 0.5, ease: "back.inOut(1.2)" }, 0)
      .to(this.gripR, { w: 1, duration: 0.6, ease: "power2.inOut" }, 0.05)
      .add(() => (this.carrying = true), 0.62)
      .to(mug, { x: P(44, -26).x, y: P(44, -26).y, duration: 0.65, ease: "power2.inOut" }, 0.65)
      .to(r, { bx: 2, duration: 0.6, ease: "power2.inOut" }, 0.65)
      .to(this.mugTilt, { v: -38, duration: 0.45, ease: "power2.inOut" }, 1.25)
      .to(r, { hy: 7, rot: -4, lean: -0.22, yaw: 0, duration: 0.5, ease: "power2.inOut" }, 1.25)
      .to(this.mugTilt, { v: 0, duration: 0.35, ease: "power2.inOut" }, 2.25)
      .to(r, { hy: 2, rot: 2, lean: 0, duration: 0.5, ease: "back.out(1.6)" }, 2.25)
      .to(mug, { x: home.x, y: home.y, duration: 0.55, ease: "power2.inOut" }, 2.55)
      .to(r, { bx: 14 * U, duration: 0.5 }, 2.55)
      .add(() => { this.carrying = false; this.mugP = null; this.desk.moveMug(null); }, 3.12)
      .to(this.gripR, { w: 0, duration: 0.5, ease: "power2.inOut" }, 3.12)
      .to(r, { bx: 0, duration: 0.5, ease: "back.out(1.4)" }, 3.12)
      .to(this.fold, { r: this.handHome.rx === REST_R.x ? 1 : 0, duration: 0.4 }, 3.12);
    await done(tl);
    if (this.dead) return;
    this.propTl = null;
    this.busy = false;
    if (prevPose === "mouse" || prevPose === "read") gsap.to(this.mouseW, { v: 1, duration: 0.4 });
  }

  async holdPhone(on: boolean) {
    if (this.dead) return;
    const r = this.rig;
    if (on) {
      if (this.phoneP || this.busy) return;
      this.busy = true;
      if (this.facing) { this.turnAround(false); await wait(1.1); }
      if (this.dead) return;
      this.pose = "phone";
      this.typing = false;
      this.poseAnim?.kill();
      gsap.to(this.mouseW, { v: 0, duration: 0.3, overwrite: true });
      const rest = this.desk.phoneRest;
      const ph = (this.phoneP = { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2 });
      this.phoneShown = false;
      this.handHome = { lx: rest.x, ly: rest.y, rx: REST_R.x, ry: REST_R.y };
      const tl = this.propTl = gsap.timeline();
      tl.to(r, { bx: -12 * U, rot: -4, duration: 0.5, ease: "back.inOut(1.2)" }, 0)
        .to(this.gripL, { w: 1, duration: 0.6, ease: "power2.inOut" }, 0.05)
        .to(r, { rx: REST_R.x, ry: REST_R.y, duration: 0.6, ease: "power2.inOut" }, 0.1)
        .to(this.fold, { l: 0, r: 1, duration: 0.5 }, 0.1)
        .add(() => (this.phoneShown = true), 0.62)
        .to(ph, { x: PHONE_HOLD.x, y: PHONE_HOLD.y, duration: 0.75, ease: "power2.inOut" }, 0.65)
        .fromTo(this.phoneTilt, { v: 0 }, { v: PHONE_TILT, duration: 0.75, ease: "power2.inOut" }, 0.65)
        .to(r, { bx: -2, yaw: -0.12, rot: -7, hy: 2, hx: -2, lean: -0.08, duration: 0.7, ease: "back.out(1.4)" }, 0.7)
        .to(this.swipeP, { on: 1, duration: 0.3 }, 1.3);
      await done(tl);
      if (this.dead) return;
      this.propTl = null;
      this.busy = false;
    } else {
      if (!this.phoneP) return;
      while (this.busy && !this.dead) await wait(0.1);
      if (this.dead || !this.phoneP) return;
      this.busy = true;
      const rest = this.desk.phoneRest, ph = this.phoneP;
      const tl = this.propTl = gsap.timeline();
      tl.to(this.swipeP, { on: 0, duration: 0.2 }, 0)
        .to(r, { bx: -6, yaw: 0, rot: 0, hy: 0, hx: 0, duration: 0.6, ease: "power2.inOut" }, 0)
        .to(ph, { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2, duration: 0.6, ease: "power2.inOut" }, 0)
        .to(this.phoneTilt, { v: 0, duration: 0.6, ease: "power2.inOut" }, 0)
        .add(() => { this.phoneP = null; this.phoneShown = false; this.desk.showPhone(null); }, 0.62)
        .to(this.gripL, { w: 0, duration: 0.5, ease: "power2.inOut" }, 0.62)
        .to(r, { lx: REST_L.x, ly: REST_L.y, bx: 0, duration: 0.5, ease: "back.out(1.3)" }, 0.62)
        .to(this.fold, { l: 1, duration: 0.5 }, 0.62);
      await done(tl);
      if (this.dead) return;
      this.propTl = null;
      this.busy = false;
      if (this.pose === "phone") { this.pose = "rest"; this.handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y }; }
    }
  }

  swipe() {
    if (!this.phoneP) return;
    gsap.timeline()
      .to(this.swipeP, { y: -20 * K, x: 2 * K, duration: 0.2, ease: "power2.inOut" })
      .to(this.swipeP, { y: 0, x: 0, duration: 0.3, ease: "power2.out" });
    gsap.fromTo(this.phoneTilt, { v: PHONE_TILT + 2 }, { v: PHONE_TILT, duration: 0.5, ease: "power2.out" });
  }

  /** The thumb hops to a spot of the held phone's screen (0..1 across and down), e.g. a key it types. Negative: back to rest. */
  thumbAt(nx: number, ny: number) {
    if (!this.phoneP) return;
    const rest = nx < 0;
    // the thumb rests near the bottom left corner; its tip lands a little below the key's centre
    const x = rest ? 0 : nx * PHONE_W - 15 * K, y = rest ? 0 : (ny - 1) * PHONE_H + 15 * K + 3 * K;
    gsap.to(this.swipeP, { x, y, duration: rest ? 0.3 : 0.07, ease: "power2.out", overwrite: "auto" });
  }

  // ---- turning around: a chair swivel ---------------------------------------------------------
  // The head turns first, the body winds up the other way, then swings round on the seat (the
  // star base spins a little), flips sides at its narrowest and settles with an overshoot.
  private turnAround(on: boolean) {
    const r = this.rig, dir = on ? 1 : -1;
    this.swTl?.kill();
    this.swTl = gsap.timeline()
      .to(r, { sw: -0.12 * dir, duration: 0.16, ease: "power2.out" }, 0)
      .to(r, { yaw: 0.85 * dir, duration: 0.32, ease: "power2.inOut" }, 0)
      .to(r, { sw: dir, duration: 0.3, ease: "power2.in" }, 0.16)
      .to(r, { base: r.base + 40 * dir, duration: 1.1, ease: "power3.out" }, 0.12)
      .add(() => { this.setFacing(on); r.sw = -dir; r.yaw = on ? 0 : -0.55 * dir; }, 0.46)
      .to(r, { sw: 0, duration: 0.7, ease: "back.out(1.9)" }, 0.46)
      .to(r, { yaw: 0, duration: 0.6, ease: "back.out(1.5)" }, 0.56);
    if (on) this.scheduleBlink();
    else { this.blinkCall?.kill(); this.blinkCall = null; }
  }

  private setFacing(on: boolean) {
    this.facing = on;
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    this.$.face.setAttribute("opacity", on ? "1" : "0");
    show("face", on); show("back", !on);
    show("backPlate", !on); show("chest", on);
    show("backrest", !on); show("seatBack", !on); show("seatFront", on); show("legs", on);
    this.front.l = on || this.fitting; this.front.r = on || this.fitting;
    this.layerArms();
    this.renderLook();
    gsap.to(this.rig, { upper: on ? 60 * S : UPPER, fore: on ? 72 * S : FORE, duration: 0.35, ease: "power2.out" });
  }

  private layerArms() {
    const put = (arm: SVGElement, front: boolean) => {
      const parent = front ? this.$.armsFront : this.$.armsBack;
      if (arm.parentNode !== parent) parent.appendChild(arm);
    };
    put(this.$.armL, this.front.l);
    put(this.$.armR, this.front.r);
  }

  // ---- per frame ----------------------------------------------------------------------------
  private frame = () => {
    const r = this.rig, now = performance.now();
    // off screen or tiny (zoomed out): redraw less often, or not at all
    const dt = sinceDraw(this, now);
    if (!drawNow(this, this.el, now)) return;
    const started = beginSystem();
    // Keep the pulse clock running, but present it with the rest of this actor.
    // A direct infinite SVG tween otherwise repaints even offscreen or between body draws.
    setSvgAttribute(this.$.antennaGlow, "opacity", this.glowPulse.opacity.toFixed(4));
    this.autoType(now);
    if (this.pose === "type") {
      // a hand that has not typed for a moment drifts back to its home key
      for (const side of ["l", "r"] as const) {
        if (!this.homed[side] && now - this.lastPress[side] > 650) {
          this.homed[side] = true;
          const h = side === "l" ? this.desk.homeLeft : this.desk.homeRight;
          gsap.to(r, { [side + "x"]: h.x, [side + "y"]: h.y, duration: 0.45, ease: "back.out(1.3)", overwrite: "auto" });
        }
      }
      // a pause in the typing: the robot reads what it wrote, head tilted toward the screen
      const target = !this.busy && !this.fitting && now - this.lastAny > 700 ? 1 : 0;
      if (target !== this.ponder.target) {
        this.ponder.target = target;
        if (target) this.ponder.side = Math.random() < 0.5 ? -1 : 1;
        gsap.to(this.ponder, { v: target, duration: target ? 0.8 : 0.22, ease: target ? "back.out(1.4)" : "power2.out", overwrite: "auto" });
      }
    } else if (this.ponder.target) {
      this.ponder.target = 0;
      gsap.to(this.ponder, { v: 0, duration: 0.3, overwrite: "auto" });
    }

    // groove: a beat clock that keeps running while the amplitude fades out
    const g = this.groove;
    let gNod = 0, gSway = 0;
    if (g.amp > 0.001) {
      g.phase += (dt * g.bpm) / 60;
      const beat = Math.floor(g.phase);
      if (beat !== g.beat) { g.beat = beat; this.kickAntenna((beat % 2 ? 1 : -1) * 45 * g.amp, 70 * g.amp); }
      const f = g.phase - beat;
      gNod = Math.pow((1 + Math.cos(f * TAU)) / 2, 2) * g.amp;     // sharp dip on the beat
      gSway = Math.sin(g.phase * Math.PI) * g.amp;                // one side per beat
    }

    const calm = (CALM[this.pose] ?? 0.4) * (this.busy ? 0.3 : 1);
    const breath = r.body * 2.2;                // v0 units
    const jig = this.bob.v * 2.4;               // head nod per keystroke
    const shake = r.shake * 2.2;
    const ant = this.ant.v;
    const pv = this.ponder.v;
    const swing = -Math.sin((r.sw * Math.PI) / 2) * 5;           // the body swings off-axis while swivelling
    const bx = r.bx + shake + this.shift.x * calm + gSway * 1.4;
    const by = r.by + ant * 1.2;
    const shrug = r.shrug - gNod * 1.3 - ant * 1.4;
    const breathPx = breath * S;

    // The mouse chases the real cursor path (a short smoothing only, so it stays 1:1) and turns
    // a little with the swing of the wrist, like a real mouse under a hand.
    if (this.mouseW.v > 0.5) {
      const k = 1 - Math.exp(-dt / 0.028), gx = this.mouseGoal.x - this.mouseP.x, gy = this.mouseGoal.y - this.mouseP.y;
      this.mouseP.x += gx * k; this.mouseP.y += gy * k;
      this.mouseSpin = lerp(this.mouseSpin, clamp(gx * 5, -7, 7), 1 - Math.exp(-dt / 0.09));
    } else this.mouseSpin = lerp(this.mouseSpin, 0, 0.2);
    // mouse, mug and phone follow their own anchors
    const mk = `${this.mouseP.x.toFixed(2)},${this.mouseP.y.toFixed(2)},${this.mouseSpin.toFixed(1)}`;
    if (mk !== this.lastMouse) { this.lastMouse = mk; this.desk.moveMouse(this.mouseP, this.mouseSpin); }
    if (this.carrying && this.mugP) this.desk.moveMug(this.mugP, this.mugTilt.v);
    if (this.phoneP && this.phoneShown) this.desk.showPhone(this.phoneP, this.phoneTilt.v);

    // head (v0 units inside the head group)
    const hdx = r.hx;
    const hdy = r.hy - breath * 1.15 + jig - shrug * 0.6 + gNod * 5 + ant * 3.5 - pv * 2.5;
    const rot = r.rot + (this.rig.lx - this.rig.rx + 108) * 0.015 + this.shift.r * calm + gSway * 3 + pv * 5 * this.ponder.side;
    const scale = (1 + (r.lean + pv * 0.08) * 0.06) * this.look.head;

    // hands
    let L: Pt = { x: r.lx, y: r.ly }, R: Pt = { x: r.rx, y: r.ry };
    const mouseHand = { x: this.mouseP.x + 1, y: this.mouseP.y + 3 };
    R = { x: lerp(R.x, mouseHand.x, this.mouseW.v), y: lerp(R.y, mouseHand.y, this.mouseW.v) };
    if (this.mugP) R = { x: lerp(R.x, this.mugP.x + 12 * U, this.gripR.w), y: lerp(R.y, this.mugP.y - 1, this.gripR.w) };
    else if (this.gripR.w > 0) R = { x: lerp(R.x, this.desk.mug.x + 12 * U, this.gripR.w), y: lerp(R.y, this.desk.mug.y - 1, this.gripR.w) };
    // Both hands hold the phone at its lower corners: the left one in front, the right one
    // reaching across behind the head.
    const phoneHand = this.phoneP ? { x: this.phoneP.x + 9 * K, y: this.phoneP.y + PHONE_H - 4 * K } : this.desk.phoneRest;
    L = { x: lerp(L.x, phoneHand.x, this.gripL.w), y: lerp(L.y, phoneHand.y, this.gripL.w) };
    if (this.phoneP && this.phoneShown) {
      const rh = { x: this.phoneP.x + PHONE_W - 2 * K, y: this.phoneP.y + PHONE_H - 10 * K };
      R = { x: lerp(R.x, rh.x, this.gripL.w * 0.9), y: lerp(R.y, rh.y, this.gripL.w * 0.9) };
    }
    // headphones: the hands hold the cups
    const hp = this.hp;
    if (hp.grip > 0.001) {
      const cupPt = (vx: number) => this.headPoint(vx * hp.sx + 560 * (1 - hp.sx), 660 + hp.y, bx, by, hdx, hdy, rot);
      L = this.mix(L, cupPt(472), hp.grip);
      R = this.mix(R, cupPt(648), hp.grip);
    }
    // mouse wrist: the hand pivots on the mouse with the direction and speed of travel
    const mvx = (this.mouseP.x - this.wrist.lastX) / dt;
    this.wrist.lastX = this.mouseP.x;
    this.wrist.vx = lerp(this.wrist.vx, mvx, 0.18);
    const flexR = clamp((this.mouseP.x - this.desk.mouse.x) * 1.5 + this.wrist.vx * 0.09, -28, 28) * this.mouseW.v;

    // Facing us, a hand that is still inside the head's outline (on its way from the desk) passes
    // behind the head instead of across the face.
    if (this.facing && !this.fitting) {
      const inHead = (p: Pt) => Math.abs(p.x - HX - bx) < 38 * K && p.y > HY + by - 34 * K && p.y < HY + by + 28 * K;
      const fl = !inHead(L), fr = !inHead(R);
      if (fl !== this.front.l || fr !== this.front.r) { this.front.l = fl; this.front.r = fr; this.layerArms(); }
    }
    const sL = { x: ORIGIN.x - this.shoulder * S + bx, y: ORIGIN.y + by - breathPx - shrug };
    const sR = { x: ORIGIN.x + this.shoulder * S + bx, y: ORIGIN.y + by - breathPx - shrug };
    const hover = pv * 0.45;
    this.drawArm("L", sL, L, -1, this.lift.l + hover, this.press.l, -6 * (1 - this.gripL.w) * (this.pose === "type" ? 1 : 0));
    this.drawArm("R", sR, R, 1, this.lift.r + hover * (1 - this.mouseW.v), this.press.r, flexR + 6 * (1 - this.mouseW.v) * (this.pose === "type" ? 1 : 0));

    const tor = `translate(${bx.toFixed(2)} ${(by - shrug * 0.4).toFixed(2)}) ${MAP} translate(0 ${(-breath + jig * 0.25 + ant * 1.5).toFixed(2)}) translate(560 820) scale(${(1 + r.lean * 0.03).toFixed(3)}) translate(-560 -820)`;
    setSvgAttribute(this.$.torso, "transform", tor);
    setSvgAttribute(this.$.headRoot, "transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)}) ${MAP} translate(0 ${HEAD_DROP.toFixed(2)})`);
    setSvgAttribute(this.$.head, "transform",
      `translate(${hdx.toFixed(2)} ${hdy.toFixed(2)}) rotate(${rot.toFixed(2)} 560 715) translate(560 715) scale(${(scale * r.sx).toFixed(3)} ${scale.toFixed(3)}) translate(-560 -715)`);

    // Fake 3D turn: logo and ears slide with yaw, the visor peeks out on the turning side.
    const yaw = r.yaw;
    setSvgAttribute(this.$.logo, "transform", `translate(${(yaw * -34).toFixed(2)} 0) translate(560 655) scale(${(1 - Math.abs(yaw) * 0.5).toFixed(3)} 1) translate(-560 -655)`);
    this.$.logo.style.opacity = String(this.facing ? 0 : 1 - Math.max(0, Math.abs(yaw) - 0.6) * 2.5);
    setSvgAttribute(this.$.sticker, "transform", `translate(${(606 + yaw * -30).toFixed(2)} 692) rotate(-14) scale(${(1 - Math.abs(yaw) * 0.5).toFixed(3)} 1)`);
    const earT = `translate(${(yaw * -14).toFixed(2)} 0)`;
    setSvgAttribute(this.$.earL, "transform", earT);
    setSvgAttribute(this.$.earR, "transform", earT);
    const oL = yaw > 0.5 ? 1 - (yaw - 0.5) * 2 : 1, oR = yaw < -0.5 ? 1 - (-yaw - 0.5) * 2 : 1;
    this.$.earL.style.opacity = String(oL);
    this.$.earR.style.opacity = String(oR);
    const peek = Math.max(0, Math.abs(yaw) - 0.15);
    setSvgAttribute(this.$.visorPeek, "transform", `translate(${yaw > 0 ? 70 - peek * 40 : -70 + peek * 40} 0)`);
    this.$.visorPeek.style.opacity = this.facing ? "0" : String(Math.min(1, peek * 2));

    // headphones ride on the head; the cups slide with the ears
    if (hp.o > 0.001) {
      this.$.phones.style.display = "";
      setSvgAttribute(this.$.phones, "opacity", hp.o.toFixed(3));
      setSvgAttribute(this.$.phones, "transform", `translate(0 ${hp.y.toFixed(2)}) translate(560 660) scale(${hp.sx.toFixed(3)} ${hp.sy.toFixed(3)}) translate(-560 -660)`);
      setSvgAttribute(this.$.hpL, "transform", earT);
      setSvgAttribute(this.$.hpR, "transform", earT);
      this.$.hpL.style.opacity = String(oL);
      this.$.hpR.style.opacity = String(oR);
    } else if (this.$.phones.style.display !== "none") this.$.phones.style.display = "none";

    // Antenna: a damped spring that lags behind the head (it follows the head's tilt and position
    // a little late, overshoots and settles), stretches when the head drops, bounces on kicks.
    const sp = this.spring;
    const headX = bx / S + hdx + swing / S, headY = by / S + hdy;
    const k1 = 150, c1 = 8.5, k2 = 170, c2 = 9;
    sp.phiV += (k1 * (rot - sp.phi) - c1 * sp.phiV) * dt; sp.phi += sp.phiV * dt;
    sp.tvx += (k2 * (headX - sp.tx) - c2 * sp.tvx) * dt; sp.tx += sp.tvx * dt;
    sp.tvy += (k2 * (headY - sp.ty) - c2 * sp.tvy) * dt; sp.ty += sp.tvy * dt;
    const lagAngle = clamp(sp.phi - rot + ((sp.tx - headX) / 42) * 57.3 * 0.7, -38, 38);
    const idle = Math.sin(now * 0.0016) * 2.2;
    const stretch = clamp(1 + (headY - sp.ty) / 70, 0.82, 1.22);
    setSvgAttribute(this.$.antenna, "transform", `rotate(${(lagAngle + idle).toFixed(2)} 560 610) translate(560 610) scale(1 ${stretch.toFixed(3)}) translate(-560 -610)`);

    // the hat slides with the turn and lags a touch behind fast head moves; fabric sways with the body
    if (this.look.hat !== "none") setSvgAttribute(this.$.hat, "transform", `translate(${(yaw * -9).toFixed(2)} ${(clamp(headY - sp.ty, -6, 6) * 0.25).toFixed(2)}) rotate(${(lagAngle * 0.14).toFixed(2)} 560 612)`);
    if (this.motion.sway.length || this.motion.spin.length) {
      const sw = this.sway, v = (bx - sw.lastBx) / dt;
      sw.lastBx = bx;
      const target = clamp(-v * 0.03 + swing * 0.12 + gSway * 0.25 + (lagAngle / 38) * 0.6, -1.4, 1.4);
      sw.vel += (55 * (target - sw.v) - 6.5 * sw.vel) * dt;
      sw.v += sw.vel * dt;
      stepLookMotion(this.motion, now, sw.v);
    }

    // chair swivel
    const swKey = `${r.sw.toFixed(3)}`;
    if (swKey !== this.lastSw) {
      this.lastSw = swKey;
      const sc = Math.max(0.2, Math.cos((r.sw * Math.PI) / 2 * 0.86));
      this.$.body.setAttribute("transform", r.sw === 0 ? "" : `translate(${(CX + swing).toFixed(2)} 0) scale(${sc.toFixed(3)} 1) translate(${-CX} 0)`);
    }
    if (r.base !== this.lastBase) { this.lastBase = r.base; this.drawBase(r.base); }

    // fingers over the held phone
    const tg = this.thumb.firstElementChild as SVGGElement;
    if (this.phoneP && this.phoneShown) {
      const tx = this.phoneP.x + 15 * K + this.swipeP.x, ty = this.phoneP.y + PHONE_H - 15 * K + this.swipeP.y;
      setSvgAttribute(tg, "transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${(PHONE_TILT + 24).toFixed(0)}) scale(${(0.8 * K).toFixed(3)})`);
      setSvgAttribute(tg, "opacity", String(this.swipeP.on));
    } else setSvgAttribute(tg, "opacity", "0");
    endSystem("robots", started);
  };

  // Auto typing (setTyping): words of a few letters with a space between them, uneven finger
  // timing, and now and then a longer pause to read the screen.
  private autoType(now: number) {
    if (!this.typing || this.pose !== "type" || now - this.lastExt < 400 || this.busy || this.fitting) return;
    if (now < this.nextAuto) return;
    if (!this.autoQ.length) {
      const n = 2 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) this.autoQ.push(LETTERS[Math.floor(Math.random() ** 1.6 * LETTERS.length)]);
      this.autoQ.push(Math.random() < 0.1 ? "Enter" : " ");
      if (Math.random() < 0.16) { this.nextAuto = now + rnd(900, 1800); return; }
    }
    const k = this.autoQ.shift()!;
    this.hit(k, false);
    this.nextAuto = now + (k === " " || k === "Enter" ? rnd(150, 300) : rnd(70, 190));
  }

  /** A point given in head v0 coordinates, in desk coordinates for the current frame. */
  private headPoint(vx: number, vy: number, bx: number, by: number, hdx: number, hdy: number, rot: number): Pt {
    const hs = this.look.head, a = (rot * Math.PI) / 180, dx = (vx - 560) * hs, dy = (vy - 715) * hs;
    const x = 560 + dx * Math.cos(a) - dy * Math.sin(a) + hdx;
    const y = 715 + dx * Math.sin(a) + dy * Math.cos(a) + hdy + HEAD_DROP;
    return { x: ORIGIN.x + bx + (x - 560) * S, y: ORIGIN.y + by + (y - 748) * S };
  }

  private mix(a: Pt, b: Pt, t: number): Pt { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

  private drawArm(k: "L" | "R", s: Pt, t: Pt, out: number, lift: number, press: number, flex = 0) {
    // Behind the body the elbows sit out and slightly forward (forearms lie on the desk);
    // in front of the body (facing us, holding things up) they hang down.
    const front = this.front[k === "L" ? "l" : "r"];
    // A hand close to the shoulder means the arm points down or toward us: foreshorten both
    // bones instead of folding the elbow back, which would read as a raised arm.
    // Folded (resting on the desk): equal bones and the elbow out and up, so the forearm lies flat.
    const fd = front ? 0 : this.fold[k === "L" ? "l" : "r"];
    let up = lerp(this.rig.upper, FOLD_BONE, fd), fo = lerp(this.rig.fore, FOLD_BONE, fd);
    const ext = Math.hypot(t.x - s.x, t.y - s.y) / (up + fo);
    const kk = lerp(clamp(ext / 0.8, 0.55, Math.max(1, ext * 1.01)), 1, fd);
    const shorten = front ? lerp(0.75, 0.85, this.hp.grip) : 1;   // in front of the body the arm also points at us: foreshorten it
    up *= lerp(1, kk, shorten); fo *= lerp(1, kk, shorten);
    // The mouse hand reaches out to the side: its elbow goes out and down beside the body, never
    // up behind the head (where only the forearm would show, poking out of the ear).
    let down = front ? lerp(0.4, -0.6, this.hp.grip) : lerp(-0.2, -1.2, fd);
    if (k === "R" && !front) down = lerp(down, 1.4, this.mouseW.v);
    const { e, t: h } = solveArm(s, t, up, fo, out, 1.4, down, this.armMemo[k]);
    const hy = h.y - lift * 4 * U;
    const f = (n: number) => n.toFixed(1);
    setSvgAttribute(this.$["arm" + k + "Up"], "d", `M${f(s.x)} ${f(s.y)} L${f(e.x)} ${f(e.y)}`);
    setSvgAttribute(this.$["arm" + k + "Fo"], "d", `M${f(e.x)} ${f(e.y)} L${f(h.x)} ${f(hy)}`);
    setSvgAttribute(this.$["arm" + k + "Hi"], "d", `M${f(s.x - 1)} ${f(s.y - 1.6)} L${f(e.x - 1)} ${f(e.y - 1.6)} L${f(h.x - 0.8)} ${f(hy - 1.3)}`);
    setSvgAttribute(this.$["arm" + k + "El"], "transform", `translate(${f(e.x)} ${f(e.y)})`);
    const ang = (Math.atan2(hy - e.y, h.x - e.x) * 180) / Math.PI + flex;
    const sc = 1 + lift * 0.08 - press * 0.07;
    setSvgAttribute(this.$["hand" + k], "transform", `translate(${f(h.x)} ${f(hy)}) rotate(${ang.toFixed(1)}) scale(${sc.toFixed(3)})`);
    // contact shadow on the desk surface
    const sh = this.$["shadow" + k];
    const onDesk = !front && h.y < GEOM.table.y + GEOM.table.h + 4 && h.y > GEOM.table.y;
    setSvgAttribute(sh, "cx", (h.x + 2 + lift * 2).toFixed(1));
    setSvgAttribute(sh, "cy", (h.y + 4.5).toFixed(1));
    setSvgAttribute(sh, "opacity", onDesk ? (0.22 * (1 - Math.min(1, lift) * 0.5)).toFixed(2) : "0");
  }

  private drawBase(deg: number) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.PI / 2 + (deg * Math.PI) / 180;
      const x = CX + Math.cos(a) * 46 * U, y = BASE_Y + Math.sin(a) * 10 * U;
      this.spokes[i * 2].setAttribute("d", `M${CX} ${BASE_Y.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`);
      this.spokes[i * 2 + 1].setAttribute("cx", x.toFixed(1));
      this.spokes[i * 2 + 1].setAttribute("cy", (y + 4 * U).toFixed(1));
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.busy = false;
    gsap.ticker.remove(this.frame);
    unwatch(this.el);
    for (const a of this.loops) a.kill();
    for (const a of [this.poseAnim, this.reactTl, this.antTl, this.swTl, this.hpTl, this.propTl, this.blinkCall, this.shiftCall]) a?.kill();
    for (const s of ["l", "r"] as const) this.liftTl[s]?.kill();
    gsap.killTweensOf([this.rig, this.lift, this.fold, this.press, this.bob, this.ant, this.shift, this.ponder, this.groove, this.hp, this.mouseW, this.mouseP,
      this.gripL, this.gripR, this.mugTilt, this.swipeP, this.phoneTilt, this.el, this.$.antenna, this.$.antennaDroop, this.$.antennaGlow, this.$.eyes, this.$.eyeLight]);
    if (this.mugP) this.desk.moveMug(null);
    if (this.phoneP) this.desk.showPhone(null);
    this.thumb.remove();
    this.el.remove();
    releaseVectors(this.id);
  }
}

// ---- art -------------------------------------------------------------------------------------
const f = (n: number) => n.toFixed(1);
// A slim mitten with a wrist cuff; x points along the forearm.
const hand = (thumbSide: number,id:string) => /* svg */ `<g transform="scale(${(U * 0.86).toFixed(3)})">${sharedVector(`
  <ellipse cx="-12" cy="0" rx="4" ry="6.2" fill="var(--deep)"/>
  <ellipse cx="-3.5" cy="${7 * thumbSide}" rx="4.2" ry="3.3" fill="var(--shade)"/>
  <ellipse cx="-1" cy="0" rx="10" ry="8.4" fill="var(--shade)"/>
  <ellipse cx="0.5" cy="${-1.5 * thumbSide}" rx="6.6" ry="4.8" fill="var(--shell)"/>`,id)}</g>`;

const arm = (k: "L" | "R",id:string) => /* svg */ `
  <g data-r="arm${k}">
    <path data-r="arm${k}Up" fill="none" stroke="var(--shade)" stroke-width="${f(19 * S)}" stroke-linecap="round"/>
    <path data-r="arm${k}Fo" fill="none" stroke="var(--shade)" stroke-width="${f(15 * S)}" stroke-linecap="round"/>
    <path data-r="arm${k}Hi" fill="none" stroke="var(--shell)" stroke-width="${f(7 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <g data-r="arm${k}El">${sharedVector(`<circle r="${f(9.5 * S)}" fill="var(--deep)"/><circle cx="${f(-1.2 * S)}" cy="${f(-1.6 * S)}" r="${f(5 * S)}" fill="var(--shade)"/>`,id)}</g>
    <g data-r="hand${k}">${hand(k === "L" ? 1 : -1,id)}</g>
  </g>`;

// Office chair seen from behind: backrest over the lower back, gas lift, five-star base.
const CX = GEOM.chair.x;
const BW = 100 * U, BH = 40 * U;
const BASE_Y = BACK_TOP + BH + 20 * U;
const chairBase = () => {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(`<path data-spoke="${i}" stroke="#3a3f4f" stroke-width="${f(6 * U)}" stroke-linecap="round"/>`);
    out.push(`<ellipse data-spoke="w${i}" rx="${f(4.6 * U)}" ry="${f(3.8 * U)}" fill="#2a2e3b"/>`);
  }
  return `<ellipse cx="${CX}" cy="${f(BASE_Y + 10 * U)}" rx="${f(66 * U)}" ry="${f(12 * U)}" fill="#2b1d10" opacity="0.2"/>
    <rect x="${f(CX - 4.5 * U)}" y="${f(BACK_TOP + BH - 8)}" width="${f(9 * U)}" height="${f(BASE_Y - BACK_TOP - BH + 8)}" rx="3" fill="#3a3f4f"/>
    ${out.join("")}<ellipse cx="${CX}" cy="${f(BASE_Y)}" rx="${f(7.5 * U)}" ry="${f(3.4 * U)}" fill="#4a5063"/>`;
};
const SEAT_BACK = `<rect x="${f(CX - BW / 2 - 2)}" y="${f(BACK_TOP - 16 * U)}" width="${f(BW + 4)}" height="${f(24 * U)}" rx="${f(12 * U)}" fill="#3a3f4f"/>`;
const BACKREST = `<rect x="${f(CX - 7 * U)}" y="${f(BACK_TOP + BH - 6)}" width="${f(14 * U)}" height="${f(10 * U)}" rx="3" fill="#3a3f4f"/>
      <rect x="${f(CX - BW / 2)}" y="${f(BACK_TOP)}" width="${f(BW)}" height="${f(BH)}" rx="${f(16 * U)}" fill="#4a5063"/>
      <rect x="${f(CX - BW / 2 + 7 * U)}" y="${f(BACK_TOP + 4 * U)}" width="${f(BW - 14 * U)}" height="${f(BH - 11 * U)}" rx="${f(11 * U)}" fill="#565d73"/>
      <rect x="${f(CX - BW / 2 + 16 * U)}" y="${f(BACK_TOP + 7 * U)}" width="${f(BW * 0.55)}" height="${f(3.5 * U)}" rx="${f(1.75 * U)}" fill="#ffffff" opacity="0.13"/>`;
/** The chair alone, for a desk with nobody at it (desk coordinates; drawn once, nothing moves). */
export function emptyChairSvg() {
  const spokes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.PI / 2, x = CX + Math.cos(a) * 46 * U, y = BASE_Y + Math.sin(a) * 10 * U;
    spokes.push(`<path d="M${CX} ${f(BASE_Y)} L${f(x)} ${f(y)}" stroke="#3a3f4f" stroke-width="${f(6 * U)}" stroke-linecap="round"/><ellipse cx="${f(x)}" cy="${f(y + 4 * U)}" rx="${f(4.6 * U)}" ry="${f(3.8 * U)}" fill="#2a2e3b"/>`);
  }
  return `<g class="empty-chair">${chairBase().replace(/<(path|ellipse) data-spoke[^>]*\/>/g, "")}${spokes.join("")}${SEAT_BACK}${BACKREST}</g>`;
}
const HIP_Y = ORIGIN.y + 36 * U, FOOT_Y = BASE_Y + 2 * U;
const leg = (side: number) => {
  const hx = CX + side * 12 * U, kx = CX + side * 14 * U;
  const d = `M${f(hx)} ${f(HIP_Y)} L${f(kx)} ${f(HIP_Y + 14 * U)} L${f(kx)} ${f(FOOT_Y - 8 * U)}`;
  return `<path d="${d}" fill="none" stroke="var(--shade)" stroke-width="${f(22 * S)}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--shell)" stroke-width="${f(9 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" transform="translate(-1 -1.4)"/>
    <ellipse cx="${f(kx)}" cy="${f(HIP_Y + 14 * U)}" rx="${f(6 * S)}" ry="${f(6 * S)}" fill="var(--deep)"/>
    <ellipse cx="${f(kx + side * 1.5)}" cy="${f(FOOT_Y)}" rx="${f(10 * U)}" ry="${f(6 * U)}" fill="var(--deep)"/>`;
};

// Slim tapered shell: narrow at the shoulders, narrower at the waist; lit from the upper left.
const shoulder = (x: number) => /* svg */ `
  <circle cx="${x}" cy="747" r="18" fill="var(--cap, var(--shade))"/>
  <circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/>
  <circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;

const ROBOT = (id: string) => /* svg */ `
<svg id="${id}" class="world-seated robot" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px;--hp:var(--ear, var(--glow))" aria-hidden="true">
  <defs>${defsSvg(id)}</defs>
  <g class="world-chair-base">${chairBase()}</g>
  <ellipse data-r="shadowL" rx="${f(8.5 * U)}" ry="${f(4.2 * U)}" fill="#2b1d10" opacity="0"/>
  <ellipse data-r="shadowR" rx="${f(8.5 * U)}" ry="${f(4.2 * U)}" fill="#2b1d10" opacity="0"/>
  <g data-r="body">
    <g data-r="seatBack">${sharedVector(SEAT_BACK,id)}</g>
    <g data-r="armsBack">${arm("L",id)}${arm("R",id)}</g>
    <g data-r="torso">
      <ellipse cx="560" cy="742" rx="92" ry="22" fill="url(#${id}-sh)"/>
      <rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g data-r="shellG"><g data-r="accUnder"></g>
      <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 607 812 601 838 L519 838 C513 812 503 786 503 752 Z" fill="var(--shade)"/>
      <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 597 807 592 830 L527 830 C522 807 509 783 509 754 Z" fill="var(--shell)"/>
      <path d="M598 748 C600 776 594 800 588 822" fill="none" stroke="var(--shade)" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
      <g data-r="accPack"></g></g>
      <g data-r="backPlate">
        <g data-r="vents"><rect x="541" y="750" width="38" height="5" rx="2.5" fill="var(--shade)"/>
        <rect x="544" y="760" width="32" height="5" rx="2.5" fill="var(--shade)"/></g>
        <g data-r="nameplate" style="display:none">
          <title data-r="nameTitle"></title>
          <rect data-r="plate" x="518" y="774" width="84" height="16" rx="6" fill="var(--shade)"/>
          <text data-r="model" x="560" y="786" text-anchor="middle" font-family="var(--mono)" font-size="10.5" font-weight="650" fill="var(--deep)"></text>
        </g>
      </g>
      <g data-r="chest" style="display:none">
        <rect x="539" y="756" width="42" height="30" rx="10" fill="var(--shade)"/>
        <circle cx="560" cy="771" r="8.5" fill="var(--glow)" opacity="0.35"/>
        <circle cx="560" cy="771" r="5" fill="var(--glow)"/>
        <circle cx="546" cy="764" r="2.2" fill="var(--deep)"/><circle cx="574" cy="764" r="2.2" fill="var(--deep)"/>
      </g>
      <g data-r="shL">${shoulder(560 - SHOULDER)}</g><g data-r="shR">${shoulder(560 + SHOULDER)}</g>
      <g data-r="accOverG"><g data-r="accOver"></g></g>
    </g>
    <g data-r="seatFront" style="display:none">
      <rect x="${f(CX - BW / 2 - 2)}" y="${f(HIP_Y - 10 * U)}" width="${f(BW + 4)}" height="${f(26 * U)}" rx="${f(13 * U)}" fill="#4a5063"/>
      <rect x="${f(CX - BW / 2 + 6)}" y="${f(HIP_Y - 7 * U)}" width="${f(BW - 12)}" height="${f(14 * U)}" rx="${f(7 * U)}" fill="#565d73"/>
    </g>
    <g data-r="legs" style="display:none">${leg(-1)}${leg(1)}</g>
    <g data-r="headRoot"><g data-r="head">${headSvg(id)}</g></g>
    <g data-r="backrest">
      ${sharedVector(BACKREST,id)}
    </g>
    <g data-r="armsFront"></g>
  </g>
</svg>`;
