// What the seated robot does with the things on its desk: a sip from the mug, the phone (picked
// up, scrolled, tapped, shown to a neighbour, put back the moment work needs the hands) and its
// headphones, lifted on and off by both hands.
import gsap from "gsap";
import { type PhoneReaction } from "../rig";
import { reducedMotion } from "../../util/dom";
import { wait } from "../util";
import { HX, K, P, PHONE_H, PHONE_HOLD, PHONE_TILT, PHONE_W, REST_L, REST_R, U } from "./geometry";
import { SeatedBody } from "./body";

const done = (a: gsap.core.Animation) => new Promise<void>((r) => { a.eventCallback("onComplete", () => r()); a.eventCallback("onInterrupt", () => r()); });

export abstract class SeatedWithProps extends SeatedBody {
  // ---- headphones ---------------------------------------------------------------------------
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
    this.phoneWanted = on;
    return on ? this.pickUpPhone() : this.putPhoneAway();
  }

  // Glance down, reach for the phone on the desk, lift it beside the head and wake it with a tap.
  protected async pickUpPhone() {
    // a put-away (or a sip of coffee) finishes first
    while (this.busy && !this.dead) await wait(0.05);
    if (this.dead || this.phoneP || !this.phoneWanted) return;
    const r = this.rig;
    this.busy = true;
    if (this.facing) { this.turnAround(false); await wait(1.1); }
    if (this.dead) return;
    if (!this.phoneWanted) { this.busy = false; return; }
    this.pose = "phone";
    this.typing = false;
    this.poseAnim?.kill();
    gsap.to(this.mouseW, { v: 0, duration: 0.3, overwrite: true });
    const rest = this.desk.phoneRest;
    const ph = (this.phoneP = { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2 });
    this.phoneShown = false;
    this.handHome = { lx: rest.x, ly: rest.y, rx: REST_R.x, ry: REST_R.y };
    const tl = this.propTl = gsap.timeline();
    tl.to(r, { rot: -6, hy: 4, duration: 0.22, ease: "power2.out" }, 0)
      .to(r, { bx: -12 * U, duration: 0.45, ease: "power3.inOut" }, 0.08)
      .to(this.gripL, { w: 1, duration: 0.5, ease: "power3.inOut" }, 0.1)
      .to(r, { rx: REST_R.x, ry: REST_R.y, duration: 0.5, ease: "power3.inOut" }, 0.1)
      .to(this.fold, { l: 0, r: 1, duration: 0.45, ease: "power2.inOut" }, 0.1)
      .add(() => (this.phoneShown = true), 0.6)
      .to(ph, { x: PHONE_HOLD.x, y: PHONE_HOLD.y, duration: 0.62, ease: "power3.inOut" }, 0.6)
      .fromTo(this.phoneTilt, { v: 0 }, { v: PHONE_TILT, duration: 0.62, ease: "power3.inOut" }, 0.6)
      .to(r, { bx: -2, yaw: -0.12, rot: -7, hy: 2, hx: -2, lean: -0.08, duration: 0.6, ease: "back.out(1.4)" }, 0.66)
      .to(this.swipeP, { on: 1, duration: 0.2, ease: "power2.out" }, 1.12)
      // the wake tap
      .to(this.swipeP, { y: 2 * K, duration: 0.06, ease: "power2.in" }, 1.3)
      .to(this.swipeP, { y: 0, duration: 0.12, ease: "power2.out" }, 1.36);
    await done(tl);
    if (this.dead || this.propTl !== tl) return;   // cut short by a put-away
    this.propTl = null;
    this.busy = false;
  }

  // Work never waits for the phone: a pick-up or a phone reaction still running is cut short and
  // the phone goes straight back to the desk (on the desk again in under half a second).
  protected async putPhoneAway() {
    if (!this.phoneP) return;
    const r = this.rig;
    this.phoneReactTl?.kill(); this.phoneReactTl = null;
    if (this.busy && this.propTl) { this.propTl.kill(); this.propTl = null; this.busy = false; }
    while (this.busy && !this.dead) await wait(0.05);
    if (this.dead || !this.phoneP || this.phoneWanted) return;
    this.busy = true;
    const rest = this.desk.phoneRest, ph = this.phoneP;
    gsap.killTweensOf(this.swipeP);
    const lifted = this.phoneShown;
    const drop = lifted ? 0.38 : 0;
    const tl = this.propTl = gsap.timeline();
    tl.to(this.swipeP, { on: 0, x: 0, y: 0, duration: 0.12, ease: "power2.out" }, 0)
      .to(r, { bx: -6, yaw: 0, rot: 0, hy: 0, hx: 0, lean: 0, duration: 0.4, ease: "power3.inOut" }, 0)
      .to(ph, { x: rest.x - PHONE_W / 2, y: rest.y - PHONE_H / 2, duration: drop, ease: "power3.inOut" }, 0)
      .to(this.phoneTilt, { v: 0, duration: drop, ease: "power3.inOut" }, 0)
      .add(() => { this.phoneP = null; this.phoneShown = false; this.desk.showPhone(null); }, drop)
      .to(this.gripL, { w: 0, duration: 0.3, ease: "power2.out" }, drop)
      .to(r, { lx: REST_L.x, ly: REST_L.y, bx: 0, duration: 0.32, ease: "power2.out" }, drop)
      .to(this.fold, { l: 1, duration: 0.3, ease: "power2.out" }, drop);
    await done(tl);
    if (this.dead || this.propTl !== tl) return;
    this.propTl = null;
    this.busy = false;
    if (this.pose === "phone") { this.pose = "rest"; this.handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y }; }
  }

  /** Thumb scroll: it presses low on the screen, flicks up with the content, lifts and comes back. */
  swipe() {
    if (!this.phoneP || !this.phoneShown) return;
    gsap.killTweensOf(this.swipeP, "x,y");
    gsap.timeline()
      .to(this.swipeP, { y: 1.5 * K, duration: 0.06, ease: "power2.out" })
      .to(this.swipeP, { y: -22 * K, x: 2.5 * K, duration: 0.2, ease: "power2.in" })
      .to(this.swipeP, { y: 0, x: 0, duration: 0.3, ease: "power3.out" });
    gsap.fromTo(this.phoneTilt, { v: PHONE_TILT + 1.5 }, { v: PHONE_TILT, duration: 0.45, ease: "power2.out", overwrite: "auto" });
  }

  tapPhone(times = 1) {
    if (!this.phoneP || !this.phoneShown) return;
    const tl = gsap.timeline();
    for (let i = 0; i < Math.max(1, times); i++)
      tl.to(this.swipeP, { y: `+=${2 * K}`, duration: 0.05, ease: "power2.in" }).to(this.swipeP, { y: `-=${2 * K}`, duration: 0.09, ease: "power2.out" });
  }

  /** The thumb hops to a spot of the held phone's screen (0..1 across and down), e.g. a key it types. Negative: back to rest. */
  thumbAt(nx: number, ny: number) {
    if (!this.phoneP) return;
    const rest = nx < 0;
    // the thumb rests near the bottom left corner; its tip lands a little below the key's centre
    const x = rest ? 0 : nx * PHONE_W - 15 * K, y = rest ? 0 : (ny - 1) * PHONE_H + 15 * K + 3 * K;
    gsap.to(this.swipeP, { x, y, duration: rest ? 0.3 : 0.07, ease: "power2.out", overwrite: "auto" });
  }

  // Reactions with the phone in hand. Each one ends back in the holding pose, so a put-away or
  // the next reaction can take over from wherever it is.
  phoneReact(kind: PhoneReaction, side: -1 | 1 = -1) {
    const ph = this.phoneP;
    if (!ph || !this.phoneShown || this.busy) { if (!ph) this.react(kind === "flinch" ? "surprised" : "laugh"); return; }
    const r = this.rig, hold = { ...PHONE_HOLD }, tilt = PHONE_TILT;
    const pose = { bx: -2, yaw: -0.12, rot: -7, hy: 2, hx: -2, by: 0, shrug: 0 };
    this.phoneReactTl?.kill();
    const tl: gsap.core.Timeline = gsap.timeline({ onComplete: () => { if (this.phoneReactTl === tl) this.phoneReactTl = null; } });
    this.phoneReactTl = tl;
    if (reducedMotion()) {
      // Still readable without movement: the antenna light answers instead.
      this.pulseAntenna(kind === "flinch" ? "#ffd23f" : "#4ff0a0");
      tl.set(ph, hold).set(this.phoneTilt, { v: tilt }).set(r, pose);
      return;
    }
    switch (kind) {
      case "laugh":
        // The head tips back, the shoulders shake and the phone bobs along with them.
        tl.to(r, { hy: -1, rot: -3, duration: 0.18, ease: "power2.out" }, 0)
          .to(r, { shrug: 2.4, duration: 0.09, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0.06)
          .to(ph, { y: hold.y - 2.2 * K, duration: 0.09, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0.06)
          .to(this.phoneTilt, { v: tilt - 3, duration: 0.18, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.06)
          .to(r, { ...pose, duration: 0.5, ease: "power3.inOut" }, 0.86);
        this.kickAntenna(140, 90);
        break;
      case "flinch":
        // A jolt away from the screen, the arm jerking the phone back, then a slow lean in again.
        tl.to(r, { hx: 4, hy: -4, rot: 1, by: -3, duration: 0.09, ease: "power3.out" }, 0)
          .to(ph, { x: hold.x - 7 * K, y: hold.y + 3 * K, duration: 0.09, ease: "power3.out" }, 0)
          .to(this.phoneTilt, { v: tilt - 12, duration: 0.09, ease: "power3.out" }, 0)
          .to(r, { ...pose, duration: 0.55, ease: "power3.inOut" }, 0.5)
          .to(ph, { x: hold.x, y: hold.y, duration: 0.55, ease: "power3.inOut" }, 0.5)
          .to(this.phoneTilt, { v: tilt, duration: 0.55, ease: "power3.inOut" }, 0.5);
        this.kickAntenna(-240, -140);
        break;
      case "show": {
        // Holds the phone out toward the neighbour with the screen turned its way, a little nudge
        // ("look!"), then brings it back. To the right it passes behind the head.
        const out = side < 0 ? { x: hold.x - 24 * K, y: hold.y + 4 * K } : { x: HX + 30 * K, y: hold.y + 6 * K };
        tl.to(r, { yaw: 0.32 * side, rot: 5 * side, hx: 3 * side, bx: 5 * side, hy: 0, duration: 0.36, ease: "power3.inOut" }, 0)
          .to(ph, { ...out, duration: 0.36, ease: "power3.inOut" }, 0)
          .to(this.phoneTilt, { v: 14 * side, duration: 0.36, ease: "power3.inOut" }, 0)
          .to(this.swipeP, { on: 0, duration: 0.15, ease: "power2.out" }, 0)
          .to(ph, { y: out.y - 2 * K, duration: 0.12, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0.5)
          .add(() => this.kickAntenna(90 * side, 60), 0.5)
          .to(r, { ...pose, duration: 0.45, ease: "power3.inOut" }, 1.9)
          .to(ph, { x: hold.x, y: hold.y, duration: 0.45, ease: "power3.inOut" }, 1.9)
          .to(this.phoneTilt, { v: tilt, duration: 0.45, ease: "power3.inOut" }, 1.9)
          .to(this.swipeP, { on: 1, duration: 0.2, ease: "power2.out" }, 2.25);
        break;
      }
    }
  }
}
