// The walking robot: the v0 robot standing on the top-down floor (hallway, break room, park,
// meetings, the boss desk). This class adds walking (routes with planted feet, braking only at
// the destination, hidden shortcuts while off screen) and one-off gestures to the activities
// and body below it.
import gsap from "gsap";
import { robotModeFor } from "../render/power";
import { routeSuffixLengths } from "../../world/route-distance";
import { hiddenRoutePrefix } from "../../world/hidden-route";
import { clamp } from "../../util/math";
import { reducedMotion as reduced, uid } from "../../util/dom";
import { FEET, H, HIP_HAND, KEYS, MOUTH, READY_R, SPEED, SPRINT, STEP, STAMP_DOWN, STAMP_UP, TAU, type Facing, type Hand, type P2 } from "./skeleton";
import { TL } from "./body";
import { WalkerActivities } from "./activities";

export type { Facing, Activity, Prop, WalkerOptions } from "./skeleton";
export { SIT_HEAD } from "./skeleton";

export class Walker extends WalkerActivities {
  /** Hurry to assigned work; leisure and departures retain the walking gait. A sprint is a fresh hire racing to its desk. */
  setRunning(on: boolean, sprint = false) { this.speed = sprint ? SPRINT : on ? 290 : SPEED; }

  // ---- walking ------------------------------------------------------------------------------
  walkTo(x: number, y: number): Promise<void> {
    if (Math.hypot(x - this.x, y - this.y) < 1.5) { this.finishMove(); this.setPos(x, y); return Promise.resolve(); }
    return this.go([{ x, y }]);
  }

  /** Walk a list of points in order, without stopping at the corners. */
  walkPath(pts: { x: number; y: number }[], through = false) {
    ++this.gen;
    return this.go(pts, through);
  }

  stop() { this.gen++; this.finishMove(true); }

  /** Already sitting, without the motion (a desk robot getting up hands over to its walking self). */
  sitNow() { this.do("sit"); gsap.killTweensOf(this.st, "sit"); this.st.sit = 1; }

  protected go(list: P2[], through = false): Promise<void> {
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
      this.mv = { pts, tails: routeSuffixLengths(pts), i: 0, wait: fresh ? 0.12 : 0, through, resolve };
      // anticipation: sink and lean back a touch, then push off
      if (fresh && !reduced()) TL().to(this.st, { crouch: 0.55, lean: -4, duration: 0.12, ease: "power2.out" })
        .to(this.st, { crouch: 0, lean: 0, duration: 0.32, ease: "power2.out" });
    });
  }

  protected faceToward(p: P2) {
    const dx = p.x - this.x, dy = p.y - this.y;
    const dir: Facing = Math.abs(dx) > Math.abs(dy) * 0.9 ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (dir !== this.facing) this.face(dir);
  }

  protected finishMove(stopped = false) {
    const m = this.mv;
    if (!m) return;
    this.mv = null;
    if (stopped) this.v = 0;
    m.resolve();
  }

  protected moveStep(dt: number) {
    const st = this.st, m = this.mv;
    const speed = this.speed * (robotModeFor(this.id, this.el).fast && !reduced() ? 1.5 : 1);
    if (!m) {
      this.v = 0;
      st.stride += (0 - st.stride) * Math.min(1, dt * 9);
      return;
    }
    const view = this.shortcutView?.();
    if (view) {
      const next = hiddenRoutePrefix(this, m.pts, m.i, view);
      if (Math.hypot(next.x - this.x, next.y - this.y) > 1) {
        this.x = next.x; this.y = next.y; m.i = next.index; m.wait = 0;
        this.place();
        if (m.i >= m.pts.length) { this.finishMove(true); st.stride = 0; return; }
        // The first visible step is already at a run, rather than accelerating at the edge.
        this.v = speed * (1 - this.weakness * .6); st.stride = 1;
        this.faceToward(m.pts[m.i]);
      }
    }
    if (m.wait > 0) { m.wait -= dt; return; }
    const rest = Math.hypot(m.pts[m.i].x - this.x, m.pts[m.i].y - this.y) + m.tails[m.i];
    const cap = m.through ? speed : Math.sqrt(2 * 560 * rest) + 18; // brake at the destination, not every route leg
    const want = Math.min(speed * (1 - this.weakness * .6), cap);
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
    const strideWant = 0.35 + 0.65 * Math.min(1, this.v / speed);
    st.stride += (strideWant - st.stride) * Math.min(1, dt * 10);
    // feet stay planted: half a cycle covers 2 * STEP * stride of floor
    const run = speed > SPEED ? clamp((this.v - SPEED * 0.7) / (240 - SPEED * 0.7), 0, 1) : 0;
    const stance = 0.5 - run * 0.18;
    st.phase += ((this.v / this.s) / (2 * STEP * (1 + run * 0.85) / stance * Math.max(0.3, st.stride))) * TAU * dt;
    if (m.i >= m.pts.length) {
      this.mv = null;
      if (!m.through) { this.v = 0; this.settle(); }
      m.resolve();
    }
  }

  /** Coming to a stop: the body carries on a little, then settles back. */
  protected settle() {
    if (reduced()) return;
    this.settleTl?.kill();
    this.settleTl = TL()
      .to(this.st, { lean: 5, crouch: 0.35, duration: 0.12, ease: "power2.out" })
      .to(this.st, { lean: -1.5, crouch: 0, duration: 0.22, ease: "sine.inOut" })
      .to(this.st, { lean: 0, duration: 0.25, ease: "sine.out" });
  }


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

  carryReport(text: string | null) {
    if (this.carryingReport === !!text && this.reportTitle === (text || "")) return;
    this.carryingReport = !!text; this.reportTitle = text || "";
    this.card.classList.remove("on");
    this.setProps(this.propL, text ? "report" : this.propR === "report" ? "none" : this.propR);
    this.updateTitle();
  }
}
