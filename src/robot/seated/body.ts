// The seated robot's body: all of its animated state and the one per-frame pass that turns that
// state into the drawing (arms solved onto the real keys, mouse, mug and phone; head, antenna
// spring, groove, swivel, headphones and outfit sway), plus its appearance (species, look, model
// plate) and the chair swivel that turns it to face the camera. Behaviour (poses, typing, props,
// reactions) lives in props.ts and robot.ts on top of this class.
import gsap from "gsap";
import { batteryWeakness, subscriptionBatteries } from "../../office/battery";
import { prettyModel } from "../../harness/themes";
import { tierFor } from "../../office/tier";
import { unwatch, drawNow, sinceDraw, finishDraw, cameraScale } from "../../perf/budget";
import { beginSystem, endSystem } from "../../perf/metrics";
import { setSvgAttribute } from "../../perf/svg-write";
import { releaseVectors } from "../../perf/shared-vector";
import { clamp, lerp } from "../../util/math";
import { uid } from "../../util/dom";
import { rnd } from "../../util/random";
import { GEOM, UNIT, type DeskRig, type Expression, type Pose, type Pt, type Reaction } from "../rig";
import { brandFor, PALETTES, type BrandKind } from "../brand";
import { eyesSvg, paintBrand, paintLook } from "../art/head";
import { accessorySvg, blushSvg, hatSvg, lookMotion, placeAntenna, stepLookMotion, styledEyes, type LookMotion } from "../art/outfit";
import { ModelSticker } from "../art/model-sticker";
import { accessoryInfo, BUILD_SHAPE, hatInfo, paintLookColors, resolveLook, type FullLook, type RobotLook } from "../look";
import { solveArm, type ArmMemo } from "../ik";
import { stepAntenna, type AntennaSpring } from "../antenna";
import { RobotCanvas, canvasRobotsWanted } from "../render/canvas";
import { bind } from "../util";
import { BASE_Y, CALM, CX, FOLD_BONE, FORE, HEAD_DROP, HX, HY, K, MAP, ORIGIN, PHONE_H, PHONE_TILT, PHONE_W, REST_L, REST_R, S, SHOULDER, TAU, U, UPPER } from "./geometry";
import { f, seatedRobotSvg } from "./art";

export type Side = "l" | "r";

const ANTENNA = { k1: 150, c1: 8.5, k2: 170, c2: 9, reach: 42, lean: 0.7, maxLag: 38, drop: 70, minStretch: 0.82, maxStretch: 1.22 };

export abstract class SeatedBody {
  el: SVGSVGElement;
  protected id = uid("tdr");
  protected brand: BrandKind = "codex";
  protected weakness = 0;
  protected batteryProvider = "codex";
  protected stopBattery?: () => void;
  protected refreshBattery = () => {
    const battery = subscriptionBatteries.get(this.batteryProvider);
    this.weakness = batteryWeakness(battery.remaining);
    this.el.dataset.battery = battery.remaining === null ? "unknown" : String(Math.floor(battery.remaining));
  };
  protected pose: Pose = "rest";
  protected typing = false;
  protected facing = false;
  protected expr: Expression = "neutral";
  protected blink = { scale: 1 };
  protected deskHost: Element | null = null;
  protected $: Record<string, SVGElement> = {};
  protected rig = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y, hx: 0, hy: 0, rot: 0, yaw: 0, lean: 0, body: 0, sx: 1, bx: 0, by: 0, shrug: 0, shake: 0, upper: UPPER, fore: FORE, sw: 0, base: 0 };
  protected lift = { l: 0, r: 0 };
  protected fold = { l: 1, r: 1 };
  protected press = { l: 0, r: 0 };
  protected bob = { v: 0 };
  protected ant = { v: 0 };                         // anticipation dip before a pose change
  protected shift = { x: 0, r: 0 };                 // slow weight shifts
  protected ponder = { v: 0, side: 1, target: 0 };  // typing pause: head tilts toward the screen
  protected groove = { amp: 0, bpm: 0, phase: 0, beat: 0 };
  protected hp = { on: false, y: 0, sx: 1, sy: 1, o: 0, grip: 0 };
  protected spring: AntennaSpring = { phi: 0, phiV: 0, tx: 0, tvx: 0, ty: 0, tvy: 0 };
  protected wrist = { vx: 0, lastX: 0 };
  protected front = { l: false, r: false };
  protected mouseP: Pt;
  protected mouseSpin = 0;
  protected mouseGoal: Pt;                          // where the real cursor says the mouse should be
  protected mouseW = { v: 0 };
  protected lastMouse = "";
  protected gripL = { w: 0 };
  protected gripR = { w: 0 };
  protected mugP: Pt | null = null;
  protected mugTilt = { v: 0 };
  protected phoneP: Pt | null = null;
  protected phoneTilt = { v: 0 };
  protected swipeP = { x: 0, y: 0, on: 0 };
  protected thumb: SVGSVGElement;
  protected busy = false;
  protected dead = false;
  protected fitting = false;
  protected carrying = false;
  protected phoneShown = false;
  protected phoneWanted = false;                    // the latest holdPhone() request; a put-away cancels a pick-up in flight
  protected phoneReactTl: gsap.core.Timeline | null = null;
  protected lastExt = 0;
  protected lastAny = 0;
  protected lastPress = { l: 0, r: 0 };
  protected nextAuto = 0;
  protected autoQ: string[] = [];
  protected homed = { l: true, r: true };
  protected liftTl: Partial<Record<Side, gsap.core.Timeline>> = {};
  protected handHome = { lx: REST_L.x, ly: REST_L.y, rx: REST_R.x, ry: REST_R.y };
  protected poseAnim: gsap.core.Animation | null = null;
  protected reactTl: gsap.core.Animation | null = null;
  protected antTl: gsap.core.Animation | null = null;
  protected swTl: gsap.core.Animation | null = null;
  protected hpTl: gsap.core.Animation | null = null;
  protected propTl: gsap.core.Animation | null = null;
  protected blinkCall: gsap.core.Tween | null = null;
  protected shiftCall: gsap.core.Tween | null = null;
  protected loops: gsap.core.Animation[] = [];
  protected glow = "#7cf2ff";
  protected glowPulse = { opacity: 0.9 };
  protected spokes: SVGElement[] = [];
  protected lastBase = NaN;
  protected lastSw = "";
  protected look: FullLook = resolveLook();
  protected hasLook = false;
  protected shoulder = SHOULDER;                    // v0 half shoulder width for the current build
  protected motion: LookMotion = { sway: [], spin: [] };
  protected sway = { v: 0, vel: 0, lastBx: 0 };
  protected modelName: string | null = null;
  protected armMemo: Record<"L" | "R", ArmMemo> = { L: {}, R: {} };
  protected canvasArt!: RobotCanvas;


  constructor(host: HTMLElement, protected desk: DeskRig) {
    this.deskHost = host.closest('.desk-unit');
    const id = this.id;
    host.insertAdjacentHTML("beforeend", seatedRobotSvg(id));
    this.el = host.lastElementChild as SVGSVGElement;
    this.$ = bind(this.el);
    this.canvasArt = new RobotCanvas(this.el, host);
    this.canvasArt.allowed = () => !this.deskHost?.classList.contains("arriving");
    this.spokes = [...this.el.querySelectorAll<SVGElement>("[data-spoke]")];
    // The fingers that hold the phone sit above the phone (which the desk draws above the robot).
    const thumbHost = host.parentElement ?? host;
    thumbHost.insertAdjacentHTML("beforeend", `<svg class="world-thumb" viewBox="0 0 ${UNIT.w} ${UNIT.h}" style="width:${UNIT.w}px;height:${UNIT.h}px" aria-hidden="true"><g data-t="g" opacity="0">
      <ellipse cx="0" cy="0" rx="4.6" ry="6.8" fill="var(--shade)"/><ellipse cx="-1" cy="-1.8" rx="2.9" ry="4.3" fill="var(--shell)"/></g></svg>`);
    this.thumb = thumbHost.lastElementChild as SVGSVGElement;
    this.mouseP = { ...desk.mouse };
    this.mouseGoal = { ...desk.mouse };
    this.wrist.lastX = this.mouseP.x;
  }

  abstract setPose(p: Pose): void;
  abstract react(kind: Reaction): void;
  /** Called every drawn frame while typing on its own (setTyping). */
  protected abstract autoType(now: number): void;

  get brandName() { return this.brand; }
  get currentPose() { return this.pose; }

  setBrand(provider: string) {
    this.batteryProvider = provider;
    this.refreshBattery();
    this.stopBattery ||= subscriptionBatteries.subscribe(this.refreshBattery);
    this.brand = brandFor(provider);
    paintBrand(this.el, this.$, this.brand);
    paintBrand(this.thumb, {}, this.brand);
    this.glow = getComputedStyle(this.el).getPropertyValue("--glow").trim() || this.el.style.getPropertyValue("--glow");
    if (this.hasLook) this.applyColors();
  }

  // Tint, glow and fabric colour on top of the brand palette (also on the phone thumb).
  protected applyColors() {
    this.glow = paintLookColors(this.el, PALETTES[this.brand], this.look);
    paintLookColors(this.thumb, PALETTES[this.brand], this.look);
  }

  protected modelSticker?: ModelSticker;
  setModel(name: string | null) {
    const t = this.$.model as SVGTextElement, plate = this.$.plate;
    this.modelName = name;
    (this.modelSticker ??= new ModelSticker(this.el)).set(name);
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
    paintBrand(this.el, this.$, this.brand);
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
  protected renderLook() {
    const L = this.look, view = this.facing ? "front" : "back";
    const hat = hatInfo(L.hat), head = this.$.head, lift = this.$.antennaLift;
    this.$.hat.innerHTML = hatSvg(L.hat, view);
    // the antenna pokes out of low hats (drawn over them), sits on top of tall ones or hides under them
    if (hat.antenna === "through") { if (lift.nextSibling !== this.$.phones) head.insertBefore(lift, this.$.phones); }
    else if (head.firstChild !== lift) head.insertBefore(lift, head.firstChild);
    placeAntenna(lift, hat);
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

  protected eyesFor(e: Expression) { return styledEyes(this.look.eyes, e) ?? eyesSvg(e); }

  protected pulseAntenna(color: string) {
    gsap.timeline()
      .to(this.el, { "--glow": color, duration: 0.15 } as gsap.TweenVars)
      .to(this.$.antennaGlow, { scale: 1.6, transformOrigin: "50% 50%", duration: 0.2, yoyo: true, repeat: 1 }, 0)
      .to(this.el, { "--glow": this.glow, duration: 0.8, ease: "sine.inOut" } as gsap.TweenVars, 0.6);
  }

  /** Push the antenna spring: angular velocity (deg/s) and stretch velocity. */
  protected kickAntenna(av: number, stretch: number) {
    this.spring.phiV += av;
    this.spring.tvy -= stretch;
  }

  protected scheduleBlink() {
    this.blinkCall?.kill();
    this.blinkCall = gsap.delayedCall(rnd(1.8, 4.6), () => {
      const eyes = this.blink;
      const tl = gsap.timeline()
        .to(eyes, { scale: 0.1, duration: 0.06, ease: "power2.in" })
        .to(eyes, { scale: 1, duration: 0.11, ease: "power2.out" });
      if (Math.random() < 0.22) tl.to(eyes, { scale: 0.1, duration: 0.06, ease: "power2.in" }, "+=0.08").to(eyes, { scale: 1, duration: 0.11, ease: "power2.out" });
      this.scheduleBlink();
    });
  }


  // ---- turning around: a chair swivel ---------------------------------------------------------
  // The head turns first, the body winds up the other way, then swings round on the seat (the
  // star base spins a little), flips sides at its narrowest and settles with an overshoot.
  protected turnAround(on: boolean) {
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

  protected setFacing(on: boolean) {
    this.facing = on;
    const show = (k: string, v: boolean) => (this.$[k].style.display = v ? "" : "none");
    setSvgAttribute(this.$.face, "opacity", on ? "1" : "0");
    show("face", on); show("back", !on);
    show("backPlate", !on); show("chest", on);
    show("backrest", !on); show("seatBack", !on); show("seatFront", on); show("legs", on);
    this.front.l = on || this.fitting; this.front.r = on || this.fitting;
    this.layerArms();
    this.renderLook();
    gsap.to(this.rig, { upper: on ? 60 * S : UPPER, fore: on ? 72 * S : FORE, duration: 0.35, ease: "power2.out" });
  }

  protected layerArms() {
    const put = (arm: SVGElement, front: boolean) => {
      const parent = front ? this.$.armsFront : this.$.armsBack;
      if (arm.parentNode !== parent) parent.appendChild(arm);
    };
    put(this.$.armL, this.front.l);
    put(this.$.armR, this.front.r);
  }


  // ---- per frame ----------------------------------------------------------------------------
  protected frame = () => {
    const r = this.rig, now = performance.now();
    // off screen or tiny (zoomed out): redraw less often, or not at all
    const dt = sinceDraw(this, now);
    if (!drawNow(this, this.canvasArt.shown ? this.canvasArt.canvas : this.el, now, !this.deskHost?.classList.contains('arriving'))) return;
    const started = beginSystem();
    const blink = `translate(0 657) scale(1 ${this.blink.scale.toFixed(4)}) translate(0 -657)`;
    setSvgAttribute(this.$.eyes, 'transform', blink);
    setSvgAttribute(this.$.eyeLight, 'transform', blink);
    this.modelSticker?.step(now);
    // Keep the pulse clock running, but present it with the rest of this actor.
    // A direct infinite SVG tween otherwise repaints even offscreen or between body draws.
    setSvgAttribute(this.$.antennaGlow, "opacity", (this.glowPulse.opacity * (1 - this.weakness * .65)).toFixed(4));
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
    const hdy = r.hy - breath * 1.15 + jig - shrug * 0.6 + gNod * 5 + ant * 3.5 - pv * 2.5 + this.weakness * 15;
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
    const { lag: lagAngle, stretch } = stepAntenna(sp, ANTENNA, dt, rot, headX, headY);
    const idle = Math.sin(now * 0.0016) * 2.2;
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
    // zoomed out, the robot is drawn on its canvas from the SVG just updated (robot-canvas.ts)
    const zoom = cameraScale();
    this.canvasArt.frame(canvasRobotsWanted(zoom) && !this.deskHost?.classList.contains("arriving"), zoom);
    finishDraw();
    endSystem("robots", started);
  };

  /** A point given in head v0 coordinates, in desk coordinates for the current frame. */
  protected headPoint(vx: number, vy: number, bx: number, by: number, hdx: number, hdy: number, rot: number): Pt {
    const hs = this.look.head, a = (rot * Math.PI) / 180, dx = (vx - 560) * hs, dy = (vy - 715) * hs;
    const x = 560 + dx * Math.cos(a) - dy * Math.sin(a) + hdx;
    const y = 715 + dx * Math.sin(a) + dy * Math.cos(a) + hdy + HEAD_DROP;
    return { x: ORIGIN.x + bx + (x - 560) * S, y: ORIGIN.y + by + (y - 748) * S };
  }

  protected mix(a: Pt, b: Pt, t: number): Pt { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

  protected drawArm(k: "L" | "R", s: Pt, t: Pt, out: number, lift: number, press: number, flex = 0) {
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

  protected drawBase(deg: number) {
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
    this.stopBattery?.();
    this.dead = true;
    this.busy = false;
    gsap.ticker.remove(this.frame);
    unwatch(this.el); unwatch(this.canvasArt.canvas);
    for (const a of this.loops) a.kill();
    for (const a of [this.poseAnim, this.reactTl, this.antTl, this.swTl, this.hpTl, this.propTl, this.phoneReactTl, this.blinkCall, this.shiftCall]) a?.kill();
    for (const s of ["l", "r"] as const) this.liftTl[s]?.kill();
    gsap.killTweensOf([this.rig, this.lift, this.fold, this.press, this.bob, this.ant, this.shift, this.ponder, this.groove, this.hp, this.mouseW, this.mouseP, this.blink,
      this.gripL, this.gripR, this.mugTilt, this.swipeP, this.phoneTilt, this.el, this.$.antenna, this.$.antennaDroop, this.$.antennaGlow, this.$.eyes, this.$.eyeLight]);
    if (this.mugP) this.desk.moveMug(null);
    if (this.phoneP) this.desk.showPhone(null);
    this.thumb.remove();
    this.canvasArt.destroy();
    this.el.remove();
    releaseVectors(this.id);
  }
}
