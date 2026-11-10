// The desk robot (SeatedRobot): the v0 robot seated on the south side of its desk, seen from
// behind and above. Its head is the original v0 head; its body is a slim, tapered shell. This
// class is the behaviour: poses, typing on the real keys, the mouse, expressions, reactions and
// idle life. The drawing and per-frame body live in body.ts, the desk props in props.ts.
// All secondary motion is computed in one per-frame pass on the gsap ticker: no filters, no
// blend modes, a handful of attribute writes.
import gsap from "gsap";
import { watch } from "../../perf/budget";
import { clamp } from "../../util/math";
import { rnd } from "../../util/random";
import type { DeskRig, Expression, Pose, Pt, Reaction, SeatedRobot } from "../rig";
import { HX, IDLE_L, IDLE_R, LAP_L, LAP_R, P, REST_L, REST_R, U } from "./geometry";
import { SeatedWithProps } from "./props";
import type { Side } from "./body";

export { emptyChairSvg } from "./art";

const LEFT_KEYS = "qwertasdfgzxcvb12345";
const RIGHT_KEYS = "yuiophjklnm,.67890 ";
const LETTERS = "etaoinshrdlucmfwypgbvk";   // auto typing picks letters by rough English frequency

export class TopDownRobot extends SeatedWithProps implements SeatedRobot {
  constructor(host: HTMLElement, desk: DeskRig) {
    super(host, desk);
    this.setBrand("codex");
    this.setExpression("neutral");
    this.loops.push(
      gsap.to(this.rig, { body: 1, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      gsap.to(this.glowPulse, { opacity: 0.55, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }),
    );
    this.scheduleShift();
    this.setPose("rest");
    gsap.ticker.add(this.frame);
    watch(this.el); watch(this.canvasArt.canvas);
  }

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

  protected hit(key: string, ext: boolean) {
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
      .to(this.blink, { scale: 0.1, duration: 0.07 })
      .add(paint)
      .to(this.blink, { scale: 1, duration: 0.12, ease: "back.out(2)" });
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
    // Hands full: the reaction happens around the phone instead of letting go of it.
    if (this.phoneP && this.phoneShown) {
      if (kind === "laugh" || kind === "cheer") { this.phoneReact("laugh"); return; }
      if (kind === "surprised" || kind === "angry") { this.phoneReact("flinch"); return; }
    }
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

  protected flashExpr(e: Expression, ms: number) {
    const was = this.expr;
    this.setExpression(e);
    gsap.delayedCall(ms / 1000, () => { if (this.expr === e) this.setExpression(was); });
  }



  // Both fists come up and slam the desk; keys jump.
  protected slam() {
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

  protected antennaAwake() {
    gsap.to(this.$.antenna, { opacity: 1, duration: 0.4 });
    gsap.to(this.$.antennaDroop, { rotation: 0, duration: 0.6, transformOrigin: "50% 100%", ease: "back.out(2)" });
  }

  // ---- idle life ------------------------------------------------------------------------------
  protected scheduleShift() {
    this.shiftCall = gsap.delayedCall(rnd(2.5, 6.5), () => {
      gsap.to(this.shift, { x: rnd(-1.7, 1.7), r: rnd(-2.2, 2.2), duration: rnd(1.1, 1.9), ease: "sine.inOut", overwrite: true });
      this.scheduleShift();
    });
  }


  // Auto typing (setTyping): words of a few letters with a space between them, uneven finger
  // timing, and now and then a longer pause to read the screen.
  protected autoType(now: number) {
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
    this.nextAuto = now + (k === " " || k === "Enter" ? rnd(150, 300) : rnd(70, 190)) * (1 + this.weakness * 2);
  }
}
