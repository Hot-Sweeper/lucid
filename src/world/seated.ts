import gsap from "gsap";
import { GEOM, UNIT, type DeskRig, type Expression, type Pose, type Pt, type Reaction, type RobotLook, type SeatedRobot } from "../office/rig";
import { bind, brandFor, clamp, defsSvg, eyesSvg, headSvg, lerp, paintBrand, paintLook, solveArm, uid, type BrandKind } from "./parts";

// The v0 robot, seated on the south side of its desk, seen from behind and above.
// Body and head are the original v0 shapes (v0 coordinates, scaled by S); the arms are
// two-bone chains solved every frame in desk-unit coordinates so the mitten hands can rest
// on the real keys, the mouse, the mug and the phone.

// Everything is derived from GEOM, so the robot follows the desk contract.
const SH = GEOM.shoulders;
const S = (SH.right.x - SH.left.x) / 120;                 // v0 shoulders are 120 apart
const U = S / 0.58;                                       // relative to the size the details were tuned at
const ORIGIN = { x: (SH.left.x + SH.right.x) / 2, y: (SH.left.y + SH.right.y) / 2 }; // v0 (560, 748)
const HEAD_DROP = (GEOM.head.y - 2 - (ORIGIN.y - 89 * S)) / S; // tucks the head toward GEOM.head (the steep view hides the neck)
const MAP = `translate(${ORIGIN.x} ${ORIGIN.y}) scale(${S}) translate(-560 -748)`;
const SH_L = { x: ORIGIN.x - 60 * S, y: ORIGIN.y };
const SH_R = { x: ORIGIN.x + 60 * S, y: ORIGIN.y };
const UPPER = 69 * S, FORE = 132 * S;   // back view; facing the camera the forearm is foreshortened
const HX = GEOM.head.x, HY = GEOM.head.y;
const TABLE_FRONT = GEOM.table.y + GEOM.table.h;
const BACK_TOP = ORIGIN.y + 56 * S;     // backrest top: below the jersey plate, over the lower back
const P = (x: number, y: number) => ({ x: HX + x * U, y: HY + y * U });  // offsets around the head

// Resting: forearms lie folded along the desk edge, elbows out, hands tucked behind the head.
const REST_L = { x: HX - 20 * U, y: TABLE_FRONT - 5 }, REST_R = { x: HX + 20 * U, y: TABLE_FRONT - 5 };
const IDLE_L = { x: HX - 32 * U, y: TABLE_FRONT - 10 }, IDLE_R = { x: HX + 32 * U, y: TABLE_FRONT - 10 };
const FOLD_BONE = 53 * U;
const LAP_L = { x: ORIGIN.x - 15 * U, y: ORIGIN.y + 42 * U }, LAP_R = { x: ORIGIN.x + 15 * U, y: ORIGIN.y + 42 * U };
const PHONE_HOLD = { x: HX - 58 * U - 45, y: HY - 84 * U };   // top-left of the held phone (45x90 at 0.3 scale)
const PHONE_W = 45, PHONE_H = 90;
const LEFT_KEYS = "qwertasdfgzxcvb12345";
const RIGHT_KEYS = "yuiophjklnm,.67890 ";

type Side = "l" | "r";
const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const done = (a: gsap.core.Animation) => new Promise<void>((r) => a.eventCallback("onComplete", () => r()));

export class TopDownRobot implements SeatedRobot {
  el: SVGSVGElement;
  private id = uid("tdr");
  private brand: BrandKind = "codex";
  private pose: Pose = "rest";
  private typing = false;
  private facing = false;
  private expr: Expression = "neutral";
  private $: Record<string, SVGElement> = {};
  private rig = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y, hx: 0, hy: 0, rot: 0, yaw: 0, lean: 0, body: 0, sx: 1, bx: 0, by: 0, shrug: 0, shake: 0, upper: UPPER, fore: FORE };
  private lift = { l: 0, r: 0 };
  private fold = { l: 1, r: 1 };
  private press = { l: 0, r: 0 };
  private bob = { v: 0 };
  private front = { l: false, r: false };
  private mouseP: Pt;
  private mouseW = { v: 0 };
  private lastMouse = "";
  private gripL = { w: 0 };
  private gripR = { w: 0 };
  private mugP: Pt | null = null;
  private mugTilt = { v: 0 };
  private phoneP: Pt | null = null;
  private phoneTilt = { v: -6 };
  private swipeP = { x: 0, y: 0, on: 0 };
  private thumb: SVGSVGElement;
  private busy = false;
  private lastExt = 0;
  private lastPress = { l: 0, r: 0 };
  private nextAuto = { l: 0, r: 0 };
  private homed = { l: true, r: true };
  private liftTl: Partial<Record<Side, gsap.core.Timeline>> = {};
  private handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y };
  private poseAnim: gsap.core.Animation | null = null;
  private reactTl: gsap.core.Animation | null = null;
  private blinkTl: gsap.core.Timeline | null = null;
  private loops: gsap.core.Animation[] = [];
  private glow = "#7cf2ff";

  constructor(host: HTMLElement, private desk: DeskRig) {
    const id = this.id;
    host.insertAdjacentHTML("beforeend", ROBOT(id));
    this.el = host.lastElementChild as SVGSVGElement;
    this.$ = bind(this.el);
    // The fingers that hold the phone sit above the phone (which the desk draws above the robot).
    const thumbHost = host.parentElement ?? host;
    thumbHost.insertAdjacentHTML("beforeend", `<svg class="world-thumb" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px" aria-hidden="true"><g data-t="g" opacity="0">
      <ellipse cx="0" cy="0" rx="5.5" ry="8" fill="var(--shade)"/><ellipse cx="-1" cy="-2" rx="3.4" ry="5" fill="var(--shell)"/></g></svg>`);
    this.thumb = thumbHost.lastElementChild as SVGSVGElement;
    this.mouseP = { ...desk.mouse };
    gsap.set(this.$.antenna, { transformOrigin: "50% 100%" });
    this.setBrand("codex");
    this.setExpression("neutral");
    this.loops.push(
      gsap.to(this.rig, { body: 1, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(this.$.antennaGlow, { opacity: 0.55, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(this.$.antenna, { rotation: 3, duration: 1.9, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    );
    this.setPose("rest");
    gsap.ticker.add(this.frame);
  }

  get brandName() { return this.brand; }
  get currentPose() { return this.pose; }

  setBrand(provider: string) {
    this.brand = brandFor(provider);
    paintBrand(this.el, this.$, this.brand);
    paintBrand(this.thumb, {}, this.brand);
    this.glow = getComputedStyle(this.el).getPropertyValue("--glow").trim() || this.el.style.getPropertyValue("--glow");
  }

  setModel(name: string | null) {
    const t = this.$.model as SVGTextElement, plate = this.$.plate;
    if (!name) { this.$.nameplate.style.display = "none"; return; }
    this.$.nameplate.style.display = "";
    const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
    t.textContent = label;
    const w = clamp(label.length * 6.7 + 16, 46, 150);
    plate.setAttribute("x", String(560 - w / 2));
    plate.setAttribute("width", String(w));
    if (label.length * 6.7 > w - 10) { t.setAttribute("textLength", String(w - 12)); t.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
    else t.removeAttribute("textLength");
    (this.$.nameTitle as SVGTitleElement).textContent = name;
  }

  setLook(look: RobotLook) { paintLook(this.el, this.$, look); }

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
    const ease = "power3.inOut";
    const hands = (l: Pt, r: Pt, d = 0.55, delayR = 0.06, delay = 0) => {
      this.handHome = { lx: l.x, ly: l.y, rx: r.x, ry: r.y };
      const folded = (q: Pt) => (Math.abs(q.y - REST_L.y) < 8 && Math.abs(q.x - HX) < 40 * U ? 1 : 0);
      gsap.to(this.fold, { l: folded(l), r: folded(r), duration: d * 0.8, ease: "power2.inOut", delay, overwrite: true });
      gsap.to(this.rig, { lx: l.x, ly: l.y, duration: d, ease, delay, overwrite: "auto" });
      gsap.to(this.rig, { rx: r.x, ry: r.y, duration: d, ease, delay: delay + delayR, overwrite: "auto" });
    };
    const head = (rot: number, hx: number, hy: number, lean: number, d = 0.7) =>
      gsap.to(this.rig, { rot, hx, hy, lean, yaw: 0, by: 0, bx: 0, duration: d, ease: "power2.inOut", delay: 0.08, overwrite: "auto" });
    const mouse = (on: boolean) => gsap.to(this.mouseW, { v: on ? 1 : 0, duration: 0.45, ease: "power2.inOut", overwrite: true });
    const layer = (l: boolean, r: boolean, at = 0) => gsap.delayedCall(at, () => { this.front.l = l; this.front.r = r; this.layerArms(); });
    if (!faces && p !== "phone") layer(false, false, p === prev ? 0 : 0.18);
    const home = { l: this.desk.homeLeft, r: this.desk.homeRight };

    switch (p) {
      case "type":
        mouse(false);
        hands(home.l, home.r, 0.4, 0.04);
        head(0, 0, 4, 0.15, 0.5);
        this.homed = { l: true, r: true };
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
        hands(LAP_L, LAP_R, 0.6, 0.08, 0.3);
        head(0, 0, p === "notice" ? -10 : -6, -0.1, 0.6);
        if (!this.facing) this.turnAround(true);
        if (p === "notice") gsap.fromTo(this.rig, { by: -7 }, { by: 0, duration: 0.6, ease: "bounce.out", delay: 0.4 });
        break;
      case "celebrate": {
        mouse(false);
        hands(P(-74, -54), P(74, -54), 0.4, 0.05, 0.3);
        head(0, 0, -10, -0.15, 0.4);
        if (!this.facing) this.turnAround(true);
        const was = this.expr;
        if (was === "neutral") this.setExpression("happy");
        this.poseAnim = gsap.timeline({ delay: 0.75 })
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
    if (on) this.setPose("type");
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
    if (!k || this.facing || this.busy || this.phoneP || this.pose === "sleep") { this.desk.pressKey(key); return; }
    if (this.pose !== "type") { this.setPose("type"); this.typing = this.typing || !ext; }
    const side: Side = k.hand === "left" ? "l" : "r";
    if (side === "r" && this.mouseW.v > 0) gsap.to(this.mouseW, { v: 0, duration: 0.12, overwrite: true });
    if (this.fold[side] > 0) gsap.to(this.fold, { [side]: 0, duration: 0.1, overwrite: "auto" });
    const gap = now - this.lastPress[side];
    this.lastPress[side] = now;
    this.homed[side] = false;
    // Faster typing shortens the travel, but the hand always travels to the real key.
    const t = clamp((gap / 1000) * 0.6, 0.05, 0.14);
    gsap.to(this.rig, { [side + "x"]: k.x, [side + "y"]: k.y + 1, duration: t, ease: "power2.out", overwrite: "auto" });
    this.liftTl[side]?.kill();
    this.liftTl[side] = gsap.timeline()
      .to(this.lift, { [side]: 1, duration: t * 0.45, ease: "power2.out" })
      .to(this.lift, { [side]: 0, duration: t * 0.55, ease: "power3.in" })
      .add(() => {
        this.desk.pressKey(key);
        gsap.fromTo(this.press, { [side]: 1 }, { [side]: 0, duration: 0.16, ease: "power2.out" });
        gsap.fromTo(this.bob, { v: 1 }, { v: 0, duration: 0.24, ease: "power2.out", overwrite: true });
      });
    gsap.to(this.rig, { yaw: ((k.x - 200) / 110) * 0.16, rot: ((k.x - 200) / 110) * 2, duration: 0.5, ease: "power2.out", overwrite: "auto" });
  }

  click() {
    gsap.timeline().to(this.press, { r: 1, duration: 0.05 }).to(this.press, { r: 0, duration: 0.12, ease: "power2.out" });
  }

  mouseTo(nx: number, ny: number, d = 0.35) {
    const m = this.desk.mouse;
    gsap.to(this.mouseP, { x: m.x + (nx - 0.5) * 26, y: m.y + (ny - 0.5) * 18, duration: d, ease: "power2.out", overwrite: true });
    if (!this.facing && !this.busy && !this.phoneP && this.pose !== "sleep" && this.pose !== "think" && this.pose !== "stretch")
      gsap.to(this.mouseW, { v: 1, duration: 0.35, ease: "power2.inOut", overwrite: true });
  }

  nudgeMouse(nx: number, ny: number) { this.mouseTo(nx, ny, 0.5); }

  lookAt(nx: number, ny = 0.5) {
    if (this.facing || this.pose === "think" || this.pose === "sleep" || this.phoneP) return;
    gsap.to(this.rig, { yaw: (nx - 0.5) * 0.45, rot: (nx - 0.5) * 4, hy: (ny - 0.5) * 6, duration: 0.6, ease: "power2.out", overwrite: "auto" });
  }

  setExpression(e: Expression) {
    const changed = e !== this.expr;
    this.expr = e;
    const paint = () => { const s = eyesSvg(e); this.$.eyes.innerHTML = s; this.$.eyesGlow.innerHTML = s; };
    if (!changed || !this.facing) { paint(); return; }
    gsap.timeline()
      .to(this.$.eyes, { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" })
      .add(paint)
      .to(this.$.eyes, { scaleY: 1, duration: 0.12, ease: "back.out(2)" });
  }

  react(kind: Reaction) {
    const r = this.rig;
    switch (kind) {
      case "focus":
        gsap.to(r, { lean: 0.32, hy: 3, duration: 0.6, ease: "power2.out", overwrite: "auto" });
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
          .to(r, { ly: 204, ry: 204, duration: 0.14, yoyo: true, repeat: 3, ease: "sine.inOut" })
          .to(r, { ...h, duration: 0.4, ease: "power2.inOut" });
        this.pulseAntenna("#4ff0a0");
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
        gsap.timeline().to(r, { rot: 8, hy: 6, shrug: 3, duration: 0.45, ease: "power2.out" }).to(r, { rot: 0, hy: 0, shrug: 0, duration: 0.6, ease: "power2.inOut" }, "+=1.2");
        break;
      case "surprised":
        if (this.facing) this.flashExpr("surprised", 1200);
        gsap.timeline().to(r, { by: -8, duration: 0.14, ease: "power2.out" }).to(r, { by: 0, duration: 0.5, ease: "bounce.out" });
        gsap.fromTo(this.$.antenna, { rotation: -14 }, { rotation: 0, duration: 1.1, ease: "elastic.out(1, 0.3)" });
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
      })
      .to(r, { shake: 1, duration: 0.04, yoyo: true, repeat: 5 })
      .set(r, { shake: 0 })
      .to(r, { ...h, hy: 0, lean: 0, duration: 0.6, ease: "power2.inOut" }, "+=0.35");
  }

  wake() {
    if (this.pose !== "sleep") return;
    this.setPose("rest");
    gsap.fromTo(this.rig, { hy: -10 }, { hy: 2, duration: 0.5, ease: "back.out(3)" });
    gsap.fromTo(this.$.antenna, { rotation: -12 }, { rotation: 0, duration: 1, ease: "elastic.out(1, 0.3)" });
  }

  private antennaAwake() {
    gsap.to(this.$.antenna, { opacity: 1, duration: 0.4 });
    gsap.to(this.$.antennaDroop, { rotation: 0, duration: 0.6, transformOrigin: "50% 100%", ease: "back.out(2)" });
  }

  // ---- props ----------------------------------------------------------------------------
  async drink() {
    if (this.busy || this.phoneP) return;
    this.busy = true;
    if (this.facing) { this.setPose("rest"); await wait(0.8); }
    const prevPose = this.pose;
    this.typing = false;
    gsap.to(this.mouseW, { v: 0, duration: 0.3, overwrite: true });
    const home = { ...this.desk.mug };
    const mug = (this.mugP = { ...home });
    const r = this.rig;
    const tl = gsap.timeline();
    gsap.to(this.fold, { r: 0, duration: 0.3, overwrite: "auto" });
    tl.to(r, { bx: 14 * U, rot: 4, duration: 0.5, ease: "power2.inOut" }, 0)
      .to(this.gripR, { w: 1, duration: 0.6, ease: "power2.inOut" }, 0.05)
      .add(() => (this.carrying = true), 0.62)
      .to(mug, { x: P(44, -26).x, y: P(44, -26).y, duration: 0.65, ease: "power2.inOut" }, 0.65)
      .to(r, { bx: 2, duration: 0.6, ease: "power2.inOut" }, 0.65)
      .to(this.mugTilt, { v: -38, duration: 0.45, ease: "power2.inOut" }, 1.25)
      .to(r, { hy: 7, rot: -4, lean: -0.22, yaw: 0, duration: 0.5, ease: "power2.inOut" }, 1.25)
      .to(this.mugTilt, { v: 0, duration: 0.35, ease: "power2.inOut" }, 2.25)
      .to(r, { hy: 2, rot: 2, lean: 0, duration: 0.5, ease: "power2.inOut" }, 2.25)
      .to(mug, { x: home.x, y: home.y, duration: 0.55, ease: "power2.inOut" }, 2.55)
      .to(r, { bx: 14 * U, duration: 0.5 }, 2.55)
      .add(() => { this.carrying = false; this.mugP = null; this.desk.moveMug(null); }, 3.12)
      .to(this.gripR, { w: 0, duration: 0.5, ease: "power2.inOut" }, 3.12)
      .to(r, { bx: 0, duration: 0.5, ease: "power2.inOut" }, 3.12)
      .to(this.fold, { r: this.handHome.rx === REST_R.x ? 1 : 0, duration: 0.4 }, 3.12);
    await done(tl);
    this.busy = false;
    if (prevPose === "mouse" || prevPose === "read") gsap.to(this.mouseW, { v: 1, duration: 0.4 });
  }
  private carrying = false;

  async holdPhone(on: boolean) {
    const r = this.rig;
    if (on) {
      if (this.phoneP || this.busy) return;
      this.busy = true;
      if (this.facing) { this.turnAround(false); await wait(0.8); }
      this.pose = "phone";
      this.typing = false;
      this.poseAnim?.kill();
      gsap.to(this.mouseW, { v: 0, duration: 0.3, overwrite: true });
      const rest = this.desk.phoneRest;
      const ph = (this.phoneP = { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2 });
      this.phoneShown = false;
      this.handHome = { lx: rest.x, ly: rest.y, rx: REST_R.x, ry: REST_R.y };
      const tl = gsap.timeline();
      tl.to(r, { bx: -12 * U, rot: -4, duration: 0.5, ease: "power2.inOut" }, 0)
        .to(this.gripL, { w: 1, duration: 0.6, ease: "power2.inOut" }, 0.05)
        .to(r, { rx: REST_R.x, ry: REST_R.y, duration: 0.6, ease: "power2.inOut" }, 0.1)
        .to(this.fold, { l: 0, r: 1, duration: 0.5 }, 0.1)
        .add(() => (this.phoneShown = true), 0.62)
        .to(ph, { x: PHONE_HOLD.x, y: PHONE_HOLD.y, duration: 0.75, ease: "power2.inOut" }, 0.65)
        .add(() => { this.front.l = true; this.layerArms(); }, 0.8)
        .to(r, { bx: -2, yaw: -0.28, rot: -5, hy: 3, hx: -2, lean: 0.05, duration: 0.7, ease: "power2.inOut" }, 0.7)
        .to(this.swipeP, { on: 1, duration: 0.3 }, 1.3);
      await done(tl);
      this.busy = false;
    } else {
      if (!this.phoneP) return;
      while (this.busy) await wait(0.1);
      if (!this.phoneP) return;
      this.busy = true;
      const rest = this.desk.phoneRest, ph = this.phoneP;
      const tl = gsap.timeline();
      tl.to(this.swipeP, { on: 0, duration: 0.2 }, 0)
        .to(r, { bx: -6, yaw: 0, rot: 0, hy: 0, hx: 0, duration: 0.6, ease: "power2.inOut" }, 0)
        .add(() => { this.front.l = false; this.layerArms(); }, 0.25)
        .to(ph, { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2, duration: 0.6, ease: "power2.inOut" }, 0)
        .add(() => { this.phoneP = null; this.phoneShown = false; this.desk.showPhone(null); }, 0.62)
        .to(this.gripL, { w: 0, duration: 0.5, ease: "power2.inOut" }, 0.62)
        .to(r, { lx: REST_L.x, ly: REST_L.y, bx: 0, duration: 0.5, ease: "power2.inOut" }, 0.62)
        .to(this.fold, { l: 1, duration: 0.5 }, 0.62);
      await done(tl);
      this.busy = false;
      if (this.pose === "phone") { this.pose = "rest"; this.handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y }; }
    }
  }
  private phoneShown = false;

  swipe() {
    if (!this.phoneP) return;
    gsap.timeline()
      .to(this.swipeP, { y: -24, x: -4, duration: 0.22, ease: "power2.inOut" })
      .to(this.swipeP, { y: 0, x: 0, duration: 0.3, ease: "power2.out" });
    gsap.fromTo(this.phoneTilt, { v: -8 }, { v: -6, duration: 0.5, ease: "power2.out" });
  }

  // ---- turning around -------------------------------------------------------------------
  private turnAround(on: boolean) {
    const r = this.rig;
    const tl = gsap.timeline();
    if (on) {
      tl.to(r, { yaw: 1, duration: 0.35, ease: "power2.in" })
        .add(() => this.setFacing(true))
        .fromTo(r, { sx: 0.86 }, { sx: 1, duration: 0.45, ease: "back.out(2.2)" })
        .to(r, { yaw: 0, duration: 0.01 }, "<");
      this.blinkTl?.kill();
      this.blinkTl = gsap.timeline({ repeat: -1, repeatDelay: 2.6, delay: 1 })
        .to([this.$.eyes, this.$.eyesGlow], { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" })
        .to([this.$.eyes, this.$.eyesGlow], { scaleY: 1, duration: 0.1 });
    } else {
      this.blinkTl?.kill();
      tl.to(r, { sx: 0.86, duration: 0.18, ease: "power2.in" })
        .add(() => this.setFacing(false))
        .set(r, { yaw: -0.6 })
        .to(r, { sx: 1, duration: 0.3, ease: "back.out(2)" })
        .to(r, { yaw: 0, duration: 0.4, ease: "power2.out" }, "<");
    }
  }

  private setFacing(on: boolean) {
    this.facing = on;
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    this.$.face.setAttribute("opacity", on ? "1" : "0");
    show("backPlate", !on); show("chest", on);
    show("backrest", !on); show("seatBack", !on); show("seatFront", on); show("legs", on);
    this.front.l = on; this.front.r = on;
    this.layerArms();
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
    if (this.typing && this.pose === "type" && now - this.lastExt > 400 && !this.busy) {
      for (const side of ["l", "r"] as const) {
        if (now > this.nextAuto[side]) {
          this.nextAuto[side] = now + 120 + Math.random() * 140;
          const keys = side === "l" ? LEFT_KEYS : RIGHT_KEYS;
          this.hit(keys[Math.floor(Math.random() * keys.length)], false);
        }
      }
    }
    // a hand that has not typed for a moment drifts back to its home key
    if (this.pose === "type") {
      for (const side of ["l", "r"] as const) {
        if (!this.homed[side] && now - this.lastPress[side] > 650) {
          this.homed[side] = true;
          const h = side === "l" ? this.desk.homeLeft : this.desk.homeRight;
          gsap.to(r, { [side + "x"]: h.x, [side + "y"]: h.y, duration: 0.4, ease: "power2.inOut", overwrite: "auto" });
        }
      }
    }

    const breath = r.body * 2.2;                // v0 units
    const jig = this.bob.v * 2.6;               // head nod per keystroke
    const shake = r.shake * 2.2;
    const bx = r.bx + shake, by = r.by;
    const breathPx = breath * S;

    // mouse, mug and phone follow their own anchors
    const mk = `${this.mouseP.x.toFixed(1)},${this.mouseP.y.toFixed(1)}`;
    if (mk !== this.lastMouse) { this.lastMouse = mk; this.desk.moveMouse(this.mouseP); }
    if (this.carrying && this.mugP) this.desk.moveMug(this.mugP, this.mugTilt.v);
    if (this.phoneP && this.phoneShown) this.desk.showPhone(this.phoneP, this.phoneTilt.v);

    let L: Pt = { x: r.lx, y: r.ly }, R: Pt = { x: r.rx, y: r.ry };
    const mouseHand = { x: this.mouseP.x + 1, y: this.mouseP.y + 3 };
    R = { x: lerp(R.x, mouseHand.x, this.mouseW.v), y: lerp(R.y, mouseHand.y, this.mouseW.v) };
    if (this.mugP) R = { x: lerp(R.x, this.mugP.x + 12 * U, this.gripR.w), y: lerp(R.y, this.mugP.y - 1, this.gripR.w) };
    else if (this.gripR.w > 0) R = { x: lerp(R.x, this.desk.mug.x + 12 * U, this.gripR.w), y: lerp(R.y, this.desk.mug.y - 1, this.gripR.w) };
    const phoneHand = this.phoneP ? { x: this.phoneP.x + PHONE_W / 2, y: this.phoneP.y + PHONE_H + 2 } : this.desk.phoneRest;
    L = { x: lerp(L.x, phoneHand.x, this.gripL.w), y: lerp(L.y, phoneHand.y, this.gripL.w) };

    const shrug = r.shrug;
    const sL = { x: SH_L.x + bx, y: SH_L.y + by - breathPx - shrug };
    const sR = { x: SH_R.x + bx, y: SH_R.y + by - breathPx - shrug };
    this.drawArm("L", sL, L, -1, this.lift.l, this.press.l);
    this.drawArm("R", sR, R, 1, this.lift.r, this.press.r);

    const tor = `translate(${bx.toFixed(2)} ${(by - shrug * 0.4).toFixed(2)}) ${MAP} translate(0 ${(-breath + jig * 0.25).toFixed(2)}) translate(560 820) scale(${(1 + r.lean * 0.03).toFixed(3)}) translate(-560 -820)`;
    this.$.torso.setAttribute("transform", tor);
    const scale = 1 + r.lean * 0.06;
    const rot = r.rot + (this.rig.lx - this.rig.rx + 108) * 0.015;
    this.$.headRoot.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)}) ${MAP} translate(0 ${HEAD_DROP.toFixed(2)})`);
    this.$.head.setAttribute("transform",
      `translate(${r.hx.toFixed(2)} ${(r.hy - breath * 1.15 + jig - shrug * 0.6).toFixed(2)}) rotate(${rot.toFixed(2)} 560 715) translate(560 715) scale(${(scale * r.sx).toFixed(3)} ${scale.toFixed(3)}) translate(-560 -715)`);

    // Fake 3D turn: logo and ears slide with yaw, the visor peeks out on the turning side.
    const yaw = r.yaw;
    this.$.logo.setAttribute("transform", `translate(${(yaw * -34).toFixed(2)} 0) translate(560 655) scale(${(1 - Math.abs(yaw) * 0.5).toFixed(3)} 1) translate(-560 -655)`);
    this.$.logo.style.opacity = String(this.facing ? 0 : 1 - Math.max(0, Math.abs(yaw) - 0.6) * 2.5);
    this.$.sticker.setAttribute("transform", `translate(${(606 + yaw * -30).toFixed(2)} 692) rotate(-14) scale(${(1 - Math.abs(yaw) * 0.5).toFixed(3)} 1)`);
    this.$.earL.setAttribute("transform", `translate(${(yaw * -14).toFixed(2)} 0)`);
    this.$.earR.setAttribute("transform", `translate(${(yaw * -14).toFixed(2)} 0)`);
    this.$.earL.style.opacity = String(yaw > 0.5 ? 1 - (yaw - 0.5) * 2 : 1);
    this.$.earR.style.opacity = String(yaw < -0.5 ? 1 - (-yaw - 0.5) * 2 : 1);
    const peek = Math.max(0, Math.abs(yaw) - 0.15);
    this.$.visorPeek.setAttribute("transform", `translate(${yaw > 0 ? 70 - peek * 40 : -70 + peek * 40} 0)`);
    this.$.visorPeek.style.opacity = this.facing ? "0" : String(Math.min(1, peek * 2));

    // fingers over the held phone
    const tg = this.thumb.firstElementChild as SVGGElement;
    if (this.phoneP && this.phoneShown) {
      const tx = this.phoneP.x + PHONE_W - 10 + this.swipeP.x, ty = this.phoneP.y + PHONE_H - 22 + this.swipeP.y;
      tg.setAttribute("transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(-28)`);
      tg.setAttribute("opacity", String(this.swipeP.on));
    } else tg.setAttribute("opacity", "0");
  };

  private drawArm(k: "L" | "R", s: Pt, t: Pt, out: number, lift: number, press: number) {
    // Behind the body the elbows sit out and slightly forward (forearms lie on the desk);
    // in front of the body (facing us, holding things up) they hang down.
    const front = this.front[k === "L" ? "l" : "r"];
    // A hand close to the shoulder means the arm points down or toward us: foreshorten both
    // bones instead of folding the elbow back, which would read as a raised arm.
    // Folded (resting on the desk): equal bones and the elbow out and up, so the forearm lies flat.
    const fd = front ? 0 : this.fold[k === "L" ? "l" : "r"];
    let up = lerp(this.rig.upper, FOLD_BONE, fd), fo = lerp(this.rig.fore, FOLD_BONE, fd);
    if (!front) {
      const ext = Math.hypot(t.x - s.x, t.y - s.y) / (up + fo);
      const kk = lerp(clamp(ext / 0.8, 0.55, 1), 1, fd);
      up *= kk; fo *= kk;
    }
    const { e, t: h } = solveArm(s, t, up, fo, out, 1.4, front ? 0.4 : lerp(-0.2, -1.2, fd));
    const hy = h.y - lift * 4 * U;
    const d = `M${s.x.toFixed(1)} ${s.y.toFixed(1)} L${e.x.toFixed(1)} ${e.y.toFixed(1)} L${h.x.toFixed(1)} ${hy.toFixed(1)}`;
    this.$["arm" + k + "Base"].setAttribute("d", d);
    this.$["arm" + k + "Hi"].setAttribute("d", `M${(s.x - 1.5).toFixed(1)} ${(s.y - 2.2).toFixed(1)} L${(e.x - 1.5).toFixed(1)} ${(e.y - 2.2).toFixed(1)} L${(h.x - 1.2).toFixed(1)} ${(hy - 1.8).toFixed(1)}`);
    const ang = (Math.atan2(hy - e.y, h.x - e.x) * 180) / Math.PI;
    const sc = 1 + lift * 0.08 - press * 0.07;
    this.$["hand" + k].setAttribute("transform", `translate(${h.x.toFixed(1)} ${hy.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${sc.toFixed(3)})`);
    // contact shadow on the desk surface
    const sh = this.$["shadow" + k];
    const onDesk = !front && h.y < GEOM.table.y + GEOM.table.h + 4 && h.y > GEOM.table.y;
    sh.setAttribute("cx", (h.x + 2 + lift * 2).toFixed(1));
    sh.setAttribute("cy", (h.y + 5).toFixed(1));
    sh.setAttribute("opacity", onDesk ? (0.22 * (1 - Math.min(1, lift) * 0.5)).toFixed(2) : "0");
  }

  destroy() {
    gsap.ticker.remove(this.frame);
    for (const a of this.loops) a.kill();
    this.poseAnim?.kill();
    this.blinkTl?.kill();
    gsap.killTweensOf([this.rig, this.lift, this.fold, this.press, this.bob, this.mouseW, this.mouseP, this.gripL, this.gripR, this.mugTilt, this.swipeP, this.phoneTilt, this.el]);
    if (this.mugP) this.desk.moveMug(null);
    if (this.phoneP) this.desk.showPhone(null);
    this.thumb.remove();
    this.el.remove();
  }
}

// ---- art -------------------------------------------------------------------------------------
const f = (n: number) => n.toFixed(1);
const hand = (thumbSide: number) => /* svg */ `<g transform="scale(${U.toFixed(3)})">
  <ellipse cx="-4" cy="${7.5 * thumbSide}" rx="4.6" ry="3.6" fill="var(--shade)"/>
  <ellipse cx="-1.5" cy="0" rx="11" ry="9.2" fill="var(--shade)"/>
  <ellipse cx="0" cy="${-1.6 * thumbSide}" rx="7.4" ry="5.2" fill="var(--shell)"/></g>`;

const arm = (k: "L" | "R") => /* svg */ `
  <g data-r="arm${k}">
    <path data-r="arm${k}Base" fill="none" stroke="var(--shade)" stroke-width="${f(28 * S)}" stroke-linecap="round" stroke-linejoin="round"/>
    <path data-r="arm${k}Hi" fill="none" stroke="var(--shell)" stroke-width="${f(14 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <g data-r="hand${k}">${hand(k === "L" ? 1 : -1)}</g>
  </g>`;

// Office chair seen from behind: backrest over the lower back, gas lift, five-star base.
const CX = GEOM.chair.x;
const BW = 104 * U, BH = 40 * U;
const BASE_Y = BACK_TOP + BH + 20 * U;
const chairBase = () => {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const x = CX + Math.cos(a) * 50 * U, y = BASE_Y + Math.sin(a) * 11 * U;
    out.push(`<path d="M${CX} ${f(BASE_Y)} L${f(x)} ${f(y)}" stroke="#3a3f4f" stroke-width="${f(6.5 * U)}" stroke-linecap="round"/>`);
    out.push(`<ellipse cx="${f(x)}" cy="${f(y + 4 * U)}" rx="${f(5 * U)}" ry="${f(4 * U)}" fill="#2a2e3b"/>`);
  }
  return `<ellipse cx="${CX}" cy="${f(BASE_Y + 10 * U)}" rx="${f(70 * U)}" ry="${f(12 * U)}" fill="#2b1d10" opacity="0.2"/>
    <rect x="${f(CX - 5 * U)}" y="${f(BACK_TOP + BH - 8)}" width="${f(10 * U)}" height="${f(BASE_Y - BACK_TOP - BH + 8)}" rx="3" fill="#3a3f4f"/>
    ${out.join("")}<ellipse cx="${CX}" cy="${f(BASE_Y)}" rx="${f(8 * U)}" ry="${f(3.6 * U)}" fill="#4a5063"/>`;
};
const HIP_Y = ORIGIN.y + 36 * U, FOOT_Y = BASE_Y + 2 * U;
const leg = (side: number) => {
  const hx = CX + side * 15 * U, kx = CX + side * 18 * U;
  const d = `M${f(hx)} ${f(HIP_Y)} L${f(kx)} ${f(HIP_Y + 14 * U)} L${f(kx)} ${f(FOOT_Y - 8 * U)}`;
  return `<path d="${d}" fill="none" stroke="var(--shade)" stroke-width="${f(34 * S)}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--shell)" stroke-width="${f(14 * S)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" transform="translate(-1.2 -1.6)"/>
    <ellipse cx="${f(kx)}" cy="${f(FOOT_Y)}" rx="${f(13 * U)}" ry="${f(7 * U)}" fill="var(--deep)"/>`;
};

const ROBOT = (id: string) => /* svg */ `
<svg class="world-seated robot" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px" aria-hidden="true">
  <defs>${defsSvg(id)}</defs>
  <g class="world-chair-base">${chairBase()}</g>
  <g data-r="seatBack"><rect x="${f(CX - BW / 2 - 2)}" y="${f(BACK_TOP - 16 * U)}" width="${f(BW + 4)}" height="${f(24 * U)}" rx="${f(12 * U)}" fill="#3a3f4f"/></g>
  <ellipse data-r="shadowL" rx="${f(10 * U)}" ry="${f(5 * U)}" fill="#2b1d10" opacity="0"/>
  <ellipse data-r="shadowR" rx="${f(10 * U)}" ry="${f(5 * U)}" fill="#2b1d10" opacity="0"/>
  <g data-r="armsBack">${arm("L")}${arm("R")}</g>
  <g data-r="torso">
    <ellipse cx="560" cy="742" rx="150" ry="22" fill="#05081a" opacity="0.18" filter="url(#${id}-soft)"/>
    <path d="M462 830 C458 770 470 738 512 728 L608 728 C650 738 662 770 658 830 Z" fill="var(--shade)"/>
    <path d="M474 830 C472 778 482 748 516 740 L604 740 C636 748 646 778 644 830 Z" fill="var(--shell)"/>
    <g data-r="backPlate">
      <rect x="538" y="752" width="44" height="6" rx="3" fill="var(--shade)"/>
      <rect x="538" y="764" width="44" height="6" rx="3" fill="var(--shade)"/>
      <g data-r="nameplate" style="display:none">
        <title data-r="nameTitle"></title>
        <rect data-r="plate" x="518" y="781" width="84" height="17" rx="6" fill="var(--shade)"/>
        <text data-r="model" x="560" y="793.5" text-anchor="middle" font-family="var(--mono)" font-size="11" font-weight="650" fill="var(--deep)"></text>
      </g>
    </g>
    <g data-r="chest" style="display:none">
      <rect x="532" y="760" width="56" height="34" rx="11" fill="var(--shade)"/>
      <circle cx="560" cy="777" r="9" fill="var(--glow)" opacity="0.35"/>
      <circle cx="560" cy="777" r="5.5" fill="var(--glow)"/>
      <circle cx="543" cy="770" r="2.5" fill="var(--deep)"/><circle cx="577" cy="770" r="2.5" fill="var(--deep)"/>
    </g>
    <circle cx="500" cy="748" r="30" fill="var(--cap, var(--shade))"/><circle cx="500" cy="751" r="27.5" fill="var(--shade)"/><circle cx="496" cy="744" r="22" fill="var(--shell)"/>
    <circle cx="620" cy="748" r="30" fill="var(--cap, var(--shade))"/><circle cx="620" cy="751" r="27.5" fill="var(--shade)"/><circle cx="616" cy="744" r="22" fill="var(--shell)"/>
    <rect x="543" y="708" width="34" height="30" rx="8" fill="var(--deep)"/>
  </g>
  <g data-r="seatFront" style="display:none">
    <rect x="${f(CX - BW / 2 - 2)}" y="${f(HIP_Y - 10 * U)}" width="${f(BW + 4)}" height="${f(26 * U)}" rx="${f(13 * U)}" fill="#4a5063"/>
    <rect x="${f(CX - BW / 2 + 6)}" y="${f(HIP_Y - 7 * U)}" width="${f(BW - 12)}" height="${f(14 * U)}" rx="${f(7 * U)}" fill="#565d73"/>
  </g>
  <g data-r="legs" style="display:none">${leg(-1)}${leg(1)}</g>
  <g data-r="headRoot"><g data-r="head">${headSvg(id)}</g></g>
  <g data-r="backrest">
    <rect x="${f(CX - 8 * U)}" y="${f(BACK_TOP + BH - 6)}" width="${f(16 * U)}" height="${f(10 * U)}" rx="3" fill="#3a3f4f"/>
    <rect x="${f(CX - BW / 2)}" y="${f(BACK_TOP)}" width="${f(BW)}" height="${f(BH)}" rx="${f(15 * U)}" fill="#4a5063"/>
    <rect x="${f(CX - BW / 2 + 7 * U)}" y="${f(BACK_TOP + 4 * U)}" width="${f(BW - 14 * U)}" height="${f(BH - 11 * U)}" rx="${f(11 * U)}" fill="#565d73"/>
    <rect x="${f(CX - BW / 2 + 16 * U)}" y="${f(BACK_TOP + 7 * U)}" width="${f(BW * 0.55)}" height="${f(3.5 * U)}" rx="${f(1.75 * U)}" fill="#ffffff" opacity="0.13"/>
  </g>
  <g data-r="armsFront"></g>
</svg>`;
