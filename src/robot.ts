import gsap from "gsap";
import openaiLogo from "./assets/openai.svg";
import claudeLogo from "./assets/claude.svg";
import opencodeLogo from "./assets/harness/opencode.svg";
import geminiLogo from "./assets/harness/gemini.svg";
import antigravityLogo from "./assets/harness/antigravity.svg";
import grokLogo from "./assets/harness/grok.svg";
import museLogo from "./assets/harness/muse.svg";

// A full-body robot in an office chair, seen from the side and slightly above,
// facing its monitor on the left. Flat vector shapes, no outlines. Arms and legs
// are two-bone chains solved every frame, so poses are just "where are the hands,
// where is the head" and everything else follows.

type Brand = { shell: string; shade: string; deep: string; glow: string; visor: string; trim: string; logo: string; maskLogo: boolean };
const BRANDS: Record<string, Brand> = {
  codex: { shell: "#f2f4fa", shade: "#c9cee3", deep: "#8f98bd", glow: "#7cf2ff", visor: "#10142c", trim: "#3a3f5a", logo: openaiLogo, maskLogo: true },
  claude: { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ffa477", visor: "#1d1410", trim: "#d97757", logo: claudeLogo, maskLogo: false },
  opencode: { shell: "#f2f4fa", shade: "#c9cee3", deep: "#8f98bd", glow: "#4ff0a0", visor: "#10142c", trim: "#3a3f5a", logo: opencodeLogo, maskLogo: true },
  gemini: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#7b93d6", glow: "#4285f4", visor: "#121a2e", trim: "#4285f4", logo: geminiLogo, maskLogo: true },
  antigravity: { shell: "#f0e6ff", shade: "#d4c2f0", deep: "#8a6bbf", glow: "#9b59b6", visor: "#1a1028", trim: "#9b59b6", logo: antigravityLogo, maskLogo: true },
  grok: { shell: "#2e2f36", shade: "#1b1c21", deep: "#4b4d57", glow: "#ffffff", visor: "#060608", trim: "#e8e9ee", logo: grokLogo, maskLogo: true },
  muse: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#0467DF", glow: "#0467DF", visor: "#101828", trim: "#0467DF", logo: museLogo, maskLogo: false },
};
export function brandFor(provider: string | null | undefined): string {
  const p = (provider || "").toLowerCase();
  if (p.includes("claude")) return "claude";
  if (p.includes("grok")) return "grok";
  if (p.includes("muse")) return "muse";
  if (p.includes("gemini")) return "gemini";
  if (p.includes("antigravity")) return "antigravity";
  if (p.includes("opencode") || p.includes("open-code")) return "opencode";
  return "codex";
}

export type Pt = { x: number; y: number };
export type Expression = "neutral" | "happy" | "angry" | "shy" | "surprised" | "sleepy" | "focus" | "laugh";
export type Pose =
  | "idle" | "type" | "mouse" | "think" | "read" | "ask" | "rest" | "celebrate" | "sleep" | "phone" | "stretch" | "notice";

// What the desk exposes to the robot: where things are, so hands can reach them.
export interface DeskRig {
  keyPos(key: string): (Pt & { side: "near" | "far" }) | null;
  pressKey(key: string): void;
  homeNear: Pt; homeFar: Pt;
  mouse: Pt;
  moveMouse(p: Pt): void;
  mug: Pt;
  moveMug(p: Pt | null, tilt?: number): void; // null puts it back on the desk
  phoneRest: Pt;
  showPhone(at: Pt | null, tilt?: number): void; // null puts it back on the desk
}

const HIP = { x: 434, y: 330 };
const UPPER = 58, FORE = 60, THIGH = 70, SHIN = 84;

export class Robot {
  el: SVGSVGElement;
  private $: Record<string, SVGElement> = {};
  private r = {
    near: { x: 0, y: 0 }, far: { x: 0, y: 0 },
    lean: 0, breath: 0, hx: 0, hy: 0, rot: 0, face: 0, sx: 1, foot: 0,
  };
  private pose: Pose = "rest";
  private typing = false;
  private mouseHand = false;
  private mousePos: Pt;
  private brand = "codex";
  private expr: Expression = "neutral";
  private loops: gsap.core.Animation[] = [];
  private blink: gsap.core.Timeline;
  private nextKeyAt = 0;

  constructor(host: HTMLElement, private desk: DeskRig) {
    host.insertAdjacentHTML("beforeend", robotSvg());
    this.el = host.lastElementChild as SVGSVGElement;
    for (const n of this.el.querySelectorAll("[data-r]")) this.$[(n as SVGElement).dataset.r!] = n as SVGElement;
    this.r.near = { ...desk.homeNear };
    this.r.far = { ...desk.homeFar };
    this.mousePos = { ...desk.mouse };
    this.setBrand("codex");
    this.setExpression("neutral", true);
    gsap.to(this.r, { breath: 1, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.to(this.$.antGlow, { opacity: 0.5, duration: 1.7, ease: "sine.inOut", yoyo: true, repeat: -1 });
    this.blink = gsap.timeline({ repeat: -1, repeatDelay: 3.2 + Math.random() })
      .to(this.$.eyes, { scaleY: 0.08, duration: 0.07, transformOrigin: "50% 50%" })
      .to(this.$.eyes, { scaleY: 1, duration: 0.11 });
    gsap.ticker.add(this.frame);
    this.setPose("rest");
  }

  destroy() {
    gsap.ticker.remove(this.frame);
    this.blink.kill();
    this.loops.forEach((l) => l.kill());
    gsap.killTweensOf(this.r);
    this.el.remove();
  }

  get brandName() { return this.brand; }
  get currentPose() { return this.pose; }

  setBrand(provider: string) {
    const b = BRANDS[brandFor(provider)];
    this.brand = brandFor(provider);
    const s = this.el.style;
    for (const k of ["shell", "shade", "deep", "glow", "visor", "trim"] as const) s.setProperty(`--${k}`, b[k]);
    (this.$.logoImg as SVGImageElement).setAttribute("href", b.logo);
    (this.$.logoPlain as SVGImageElement).setAttribute("href", b.logo);
    this.$.logoMasked.style.display = b.maskLogo ? "" : "none";
    this.$.logoPlain.style.display = b.maskLogo ? "none" : "";
  }

  // --- faces -----------------------------------------------------------------
  setExpression(e: Expression, force = false) {
    if (e === this.expr && !force) return;
    this.expr = e;
    const glow = "var(--glow)";
    const eye = (cx: number, w: number) => {
      switch (e) {
        case "happy": case "laugh":
          return `<path d="M${cx - w} 4 Q${cx} -8 ${cx + w} 4" stroke="${glow}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`;
        case "angry":
          return `<path d="M${cx - w} -7 L${cx + w} -2 L${cx + w} 8 Q${cx} 11 ${cx - w} 8 Z" fill="${glow}"/>`;
        case "sleepy":
          return `<rect x="${cx - w}" y="1" width="${w * 2}" height="3.5" rx="1.75" fill="${glow}"/>`;
        case "surprised":
          return `<ellipse cx="${cx}" cy="0" rx="${w + 1}" ry="${w + 3}" fill="${glow}"/>`;
        case "shy":
          return `<rect x="${cx - w}" y="-1" width="${w * 2}" height="9" rx="4" fill="${glow}"/>`;
        case "focus":
          return `<rect x="${cx - w}" y="-5" width="${w * 2}" height="11" rx="4" fill="${glow}"/>`;
        default:
          return `<rect x="${cx - w}" y="-8" width="${w * 2}" height="16" rx="${w}" fill="${glow}"/>`;
      }
    };
    this.$.eyes.innerHTML = eye(-12, 5) + eye(8, 4);
    this.$.blush.style.opacity = e === "shy" || e === "laugh" ? "1" : "0";
    if (e === "laugh") this.loops.push(gsap.to(this.r, { hy: "-=3", duration: 0.12, yoyo: true, repeat: 7, ease: "sine.inOut" }));
  }

  react(kind: "focus" | "relax" | "cheer" | "angry" | "laugh" | "shy" | "surprised") {
    switch (kind) {
      case "focus": this.setExpression("focus"); gsap.to(this.r, { lean: 6, duration: 0.5, ease: "power2.out" }); break;
      case "relax": this.setExpression("neutral"); gsap.to(this.r, { lean: -4, duration: 0.8, ease: "power2.out" }); break;
      case "cheer": this.setPose("celebrate"); break;
      case "angry": {
        this.setExpression("angry");
        const n = { ...this.r.near }, f = { ...this.r.far };
        gsap.timeline()
          .to(this.r.near, { x: 330, y: 270, duration: 0.14, ease: "power2.in" })
          .to(this.r.far, { x: 318, y: 266, duration: 0.14, ease: "power2.in" }, "<0.03")
          .to(this.r, { hy: 3, duration: 0.06, yoyo: true, repeat: 3 })
          .to(this.r.near, { ...n, duration: 0.4, ease: "power2.out" }, "+=0.25")
          .to(this.r.far, { ...f, duration: 0.4, ease: "power2.out" }, "<");
        gsap.delayedCall(2.4, () => this.expr === "angry" && this.setExpression("neutral"));
        break;
      }
      case "laugh": this.setExpression("laugh"); gsap.delayedCall(1.6, () => this.expr === "laugh" && this.setExpression("neutral")); break;
      case "shy":
        this.setExpression("shy");
        gsap.to(this.r, { face: 0.7, hy: 4, rot: 6, duration: 0.5, ease: "power2.out" });
        gsap.delayedCall(1.8, () => { gsap.to(this.r, { face: 0, rot: 0, hy: 0, duration: 0.6 }); if (this.expr === "shy") this.setExpression("neutral"); });
        break;
      case "surprised":
        this.setExpression("surprised");
        gsap.fromTo(this.r, { hy: -6 }, { hy: 0, duration: 0.45, ease: "back.out(3)" });
        gsap.delayedCall(1.2, () => this.expr === "surprised" && this.setExpression("neutral"));
        break;
    }
  }

  // --- poses ------------------------------------------------------------------
  setPose(p: Pose) {
    const prev = this.pose;
    this.pose = p;
    if (p !== "type") this.typing = false;
    this.mouseHand = p === "mouse" || p === "read";
    this.loops.forEach((l) => l.kill());
    this.loops = [];
    const ease = "power3.inOut";
    const hands = (n: Pt, f: Pt, d = 0.55, lag = 0.07) => {
      gsap.to(this.r.near, { ...n, duration: d, ease, overwrite: true });
      gsap.to(this.r.far, { ...f, duration: d, ease, delay: lag, overwrite: true });
    };
    const body = (o: Partial<{ lean: number; hx: number; hy: number; rot: number; face: number }>, d = 0.7) =>
      gsap.to(this.r, { lean: 0, hx: 0, hy: 0, rot: 0, face: 0, ...o, duration: d, ease: "power2.inOut", delay: 0.06, overwrite: "auto" });
    if (prev === "sleep" && p !== "sleep") gsap.to(this.$.antenna, { opacity: 1, duration: 0.4 });
    const D = this.desk;
    switch (p) {
      case "type":
        hands(D.homeNear, D.homeFar, 0.4, 0.04);
        body({ lean: 5, hy: 2 }, 0.5);
        this.setExpression("focus");
        break;
      case "mouse":
        hands({ x: this.mousePos.x, y: this.mousePos.y - 3 }, D.homeFar, 0.45, 0.05);
        body({ lean: 3 }, 0.5);
        if (this.expr === "focus" || this.expr === "sleepy") this.setExpression("neutral");
        break;
      case "read":
        hands({ x: this.mousePos.x, y: this.mousePos.y - 3 }, { x: HIP.x - 40, y: HIP.y - 40 }, 0.5);
        body({ lean: 7, hy: 2 }, 0.6);
        this.setExpression("focus");
        break;
      case "think":
        hands({ x: HIP.x - 50, y: HIP.y - 46 }, { x: 386, y: 214 }, 0.8, 0.15);
        body({ lean: -6, rot: -8, hy: -2 }, 0.9);
        this.setExpression("neutral");
        this.loops.push(gsap.to(this.r.far, { y: "+=4", duration: 0.22, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1 }));
        break;
      case "ask":
      case "notice":
        hands({ x: HIP.x - 44, y: HIP.y - 40 }, { x: HIP.x - 30, y: HIP.y - 44 }, 0.6);
        body({ face: 1, lean: -2, hy: -2 }, 0.55);
        this.setExpression(p === "ask" ? "neutral" : "surprised");
        break;
      case "celebrate":
        hands({ x: 380, y: 120 }, { x: 410, y: 116 }, 0.35, 0.04);
        body({ lean: -8, hy: -6, face: 0.5 }, 0.4);
        this.setExpression("happy");
        gsap.delayedCall(1.6, () => this.pose === "celebrate" && this.setPose("rest"));
        break;
      case "stretch":
        hands({ x: 400, y: 80 }, { x: 430, y: 74 }, 0.9, 0.1);
        body({ lean: -12, hy: -4, rot: -6 }, 1);
        this.setExpression("happy");
        break;
      case "sleep":
        hands({ x: HIP.x - 46, y: HIP.y - 8 }, { x: HIP.x - 34, y: HIP.y - 10 }, 1.5, 0.2);
        body({ lean: -10, rot: 14, hy: 8 }, 1.8);
        this.setExpression("sleepy");
        gsap.to(this.$.antenna, { opacity: 0.4, duration: 2 });
        break;
      case "phone":
        body({ lean: 4, rot: 10, hy: 6 }, 0.6);
        this.setExpression("neutral");
        break;
      default:
        hands({ x: HIP.x - 48, y: HIP.y - 34 }, { x: HIP.x - 36, y: HIP.y - 38 }, 0.8, 0.1);
        body({ lean: -3 }, 0.9);
        if (this.expr !== "happy") this.setExpression("neutral");
        this.loops.push(gsap.timeline({ repeat: -1, repeatDelay: 4 + Math.random() * 4 })
          .to(this.r, { foot: 1, duration: 0.15, yoyo: true, repeat: 5, ease: "sine.inOut" }));
    }
  }

  setTyping(on: boolean) {
    if (on && this.pose !== "type") this.setPose("type");
    this.typing = on;
  }

  // Press the real key on the keyboard: the matching hand travels to it.
  pressKey(key: string) {
    this.desk.pressKey(key);
    const k = this.desk.keyPos(key);
    if (!k) return;
    const now = performance.now();
    if (now < this.nextKeyAt) return; // hands can't chase every key at full speed
    this.nextKeyAt = now + 55;
    if (this.pose !== "type" && this.pose !== "mouse") return;
    const hand = k.side === "near" ? this.r.near : this.r.far;
    if (this.pose === "mouse" && k.side === "near") return; // near hand is on the mouse
    gsap.timeline()
      .to(hand, { x: k.x + 2, y: k.y - 6, duration: 0.06, ease: "power2.out", overwrite: "auto" })
      .to(hand, { y: k.y - 1, duration: 0.05, ease: "power3.in" });
  }

  tap(key = " ") {
    if (this.pose !== "type") this.setPose("type");
    this.pressKey(key);
  }

  click() {
    gsap.timeline().to(this.r.near, { y: "+=2.5", duration: 0.05, ease: "power1.in" }).to(this.r.near, { y: "-=2.5", duration: 0.07 });
  }

  // The on-screen cursor moved: slide the physical mouse, and the hand on it.
  mouseTo(nx: number, ny: number) {
    const m = this.desk.mouse;
    // screen x maps to sliding along the desk, screen y to pushing away or pulling closer
    this.mousePos = { x: m.x + (nx - 0.5) * 16 - (ny - 0.5) * 6, y: m.y + (ny - 0.5) * 10 };
    this.desk.moveMouse(this.mousePos);
    if (this.mouseHand) {
      gsap.killTweensOf(this.r.near);
      this.r.near.x = this.mousePos.x;
      this.r.near.y = this.mousePos.y - 3;
    }
  }
  nudgeMouse(nx: number, ny: number) { this.mouseTo(nx, ny); }

  lookAt(nx: number, ny = 0.5) {
    if (["ask", "notice", "think", "sleep", "celebrate", "stretch", "phone"].includes(this.pose)) return;
    gsap.to(this.r, { rot: (ny - 0.5) * 8 - 2, hx: (nx - 0.5) * -3, duration: 0.6, ease: "power2.out", overwrite: "auto" });
  }

  wake() {
    if (this.pose !== "sleep") return;
    this.setPose("rest");
    this.react("surprised");
  }

  // Sip from the mug: reach, lift it to the face, tilt, put it back.
  async drink() {
    const D = this.desk;
    const prev = this.pose;
    this.loops.forEach((l) => l.kill());
    const mug = { ...D.mug }, lip = { x: 374, y: 212 };
    const follow = (tilt = 0) => () => D.moveMug({ x: this.r.far.x - 2, y: this.r.far.y + 6 }, tilt);
    const tilt = { a: 0 };
    await gsap.timeline()
      .to(this.r.far, { x: mug.x + 6, y: mug.y - 6, duration: 0.6, ease: "power2.inOut", overwrite: true })
      .to(this.r.far, { x: lip.x, y: lip.y + 12, duration: 0.7, ease: "power2.inOut", onUpdate: follow() })
      .to(this.r, { rot: -10, face: 0.15, duration: 0.4, ease: "sine.inOut" }, "<0.3")
      .to(tilt, { a: -40, duration: 0.5, ease: "sine.inOut", onUpdate: () => D.moveMug({ x: this.r.far.x - 2, y: this.r.far.y + 6 }, tilt.a) })
      .add(() => this.setExpression("happy"))
      .to(tilt, { a: 0, duration: 0.4, ease: "sine.inOut", delay: 0.5, onUpdate: () => D.moveMug({ x: this.r.far.x - 2, y: this.r.far.y + 6 }, tilt.a) })
      .to(this.r, { rot: 0, face: 0, duration: 0.4 }, "<")
      .to(this.r.far, { x: mug.x + 6, y: mug.y - 6, duration: 0.7, ease: "power2.inOut", onUpdate: follow() })
      .add(() => D.moveMug(null));
    this.setExpression("neutral");
    this.setPose(prev === "type" || prev === "mouse" || prev === "read" ? "rest" : prev);
  }

  // Pick the phone up from the desk and hold it in front of the face.
  async holdPhone(on: boolean) {
    const D = this.desk;
    const hold = { x: 368, y: 240 };
    const carry = () => D.showPhone({ x: this.r.near.x - 4, y: this.r.near.y - 26 }, -6);
    if (on) {
      this.setPose("phone");
      await gsap.timeline()
        .to(this.r.near, { x: D.phoneRest.x, y: D.phoneRest.y - 2, duration: 0.6, ease: "power2.inOut", overwrite: true })
        .to(this.r.near, { x: hold.x, y: hold.y, duration: 0.7, ease: "power2.inOut", onUpdate: carry })
        .to(this.r.far, { x: hold.x + 12, y: hold.y + 6, duration: 0.5, ease: "power2.out", overwrite: true }, "<0.2");
    } else {
      await gsap.timeline()
        .to(this.r.near, { x: D.phoneRest.x, y: D.phoneRest.y - 2, duration: 0.45, ease: "power2.inOut", overwrite: true, onUpdate: carry })
        .add(() => D.showPhone(null));
      this.setPose("rest");
    }
  }

  // Thumb flick up the phone screen.
  swipe() {
    gsap.timeline().to(this.r.near, { y: "-=7", duration: 0.12, ease: "power2.out" }).to(this.r.near, { y: "+=7", duration: 0.18, ease: "power2.in" });
  }

  // --- per-frame rig -------------------------------------------------------------
  private frame = () => {
    const r = this.r;
    const breathe = r.breath * 1.6;
    const rad = (-r.lean * Math.PI) / 180;
    const rot = (p: Pt) => ({ x: HIP.x + (p.x - HIP.x) * Math.cos(rad) - (p.y - HIP.y) * Math.sin(rad), y: HIP.y + (p.x - HIP.x) * Math.sin(rad) + (p.y - HIP.y) * Math.cos(rad) });
    const shNear = rot({ x: 418, y: 240 - breathe }), shFar = rot({ x: 432, y: 236 - breathe });
    this.$.torso.setAttribute("transform", `rotate(${-r.lean} ${HIP.x} ${HIP.y}) translate(0 ${-breathe * 0.6})`);
    const neck = rot({ x: 428, y: 220 - breathe });
    this.$.head.setAttribute("transform", `translate(${neck.x - 14 + r.hx} ${neck.y - 42 + r.hy}) rotate(${r.rot - r.lean * 0.4}) scale(${r.sx} 1)`);
    // face: 0 = profile looking left at the monitor, 1 = turned to the camera
    const f = r.face;
    this.$.visor.setAttribute("x", String(-50 + f * 14));
    this.$.visor.setAttribute("width", String(48 + f * 24));
    this.$.eyesWrap.setAttribute("transform", `translate(${-14 + f * 14} 0) scale(${1 + f * 0.2} 1)`);
    this.$.ear.setAttribute("transform", `translate(${30 - f * 30} 4) scale(${1 - f * 0.55} 1)`);
    this.$.ear.style.opacity = String(1 - f * 0.7);
    this.limb("armFar", shFar, r.far, UPPER, FORE, 1);
    this.limb("armNear", shNear, r.near, UPPER, FORE, 1);
    this.$.handFar.setAttribute("transform", `translate(${r.far.x} ${r.far.y})`);
    this.$.handNear.setAttribute("transform", `translate(${r.near.x} ${r.near.y})`);
    const footNear = { x: 352, y: 424 - r.foot * 6 }, footFar = { x: 368, y: 420 };
    this.limb("legFar", { x: HIP.x + 6, y: HIP.y - 2 }, footFar, THIGH, SHIN, -1);
    this.limb("legNear", { x: HIP.x - 4, y: HIP.y + 2 }, footNear, THIGH, SHIN, -1);
    this.$.footNear.setAttribute("transform", `translate(${footNear.x} ${footNear.y})`);
    this.$.footFar.setAttribute("transform", `translate(${footFar.x} ${footFar.y})`);
  };

  // Two-bone chain from a to b. bend 1: elbow hangs down and back. bend -1: knee points forward and up.
  private limb(key: string, a: Pt, b: Pt, l1: number, l2: number, bend: number) {
    let dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.5;
    if (d > max) { b = { x: a.x + (dx / d) * max, y: a.y + (dy / d) * max }; dx = b.x - a.x; dy = b.y - a.y; d = max; }
    const th = Math.atan2(dy, dx);
    const ang = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const e1 = { x: a.x + l1 * Math.cos(th + ang), y: a.y + l1 * Math.sin(th + ang) };
    const e2 = { x: a.x + l1 * Math.cos(th - ang), y: a.y + l1 * Math.sin(th - ang) };
    const score = (p: Pt) => (bend > 0 ? p.y + p.x * 0.6 : -p.y - p.x * 0.8);
    const e = score(e1) > score(e2) ? e1 : e2;
    this.$[key].setAttribute("d", `M${a.x} ${a.y} L${e.x} ${e.y} L${b.x} ${b.y}`);
    const hi = this.$[key + "Hi"];
    if (hi) hi.setAttribute("d", `M${a.x - 2} ${a.y - 3} L${e.x - 2} ${e.y - 3} L${b.x - 1} ${b.y - 2}`);
  }
}

let uid = 0;
const ROBOT_SVG_RAW = /* svg */ `
<svg class="robot" viewBox="0 0 600 440" aria-hidden="true">
  <defs>
    <radialGradient id="rAnt§"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <linearGradient id="rShell§" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--shell)"/><stop offset="0.65" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/></linearGradient>
    <clipPath id="rHeadClip§"><rect x="-46" y="-40" width="92" height="80" rx="32"/></clipPath>
    <mask id="rLogoMask§" maskContentUnits="userSpaceOnUse"><image data-r="logoImg" x="-9" y="-9" width="18" height="18"/></mask>
  </defs>
  <ellipse cx="440" cy="428" rx="62" ry="7" fill="#0b0e24" opacity="0.18"/>
  <rect x="436" y="344" width="9" height="62" rx="4" fill="#545a6c"/>
  <path d="M392 412 L488 412 L484 404 L396 404 Z" fill="#3c4150"/>
  <circle cx="398" cy="418" r="7" fill="#2a2e3a"/><circle cx="440" cy="420" r="7" fill="#2a2e3a"/><circle cx="482" cy="418" r="7" fill="#2a2e3a"/>
  <path d="M468 236 Q486 236 488 256 L492 328 Q492 340 480 340 L470 340 Z" fill="#3c4150"/>
  <path d="M472 244 Q482 246 483 260 L486 324 L474 326 Z" fill="#4a5062"/>

  <path data-r="legFar" fill="none" stroke="var(--deep)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <g data-r="footFar"><rect x="-22" y="-6" width="30" height="12" rx="6" fill="var(--trim)"/></g>
  <path data-r="armFar" fill="none" stroke="var(--deep)" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
  <g data-r="handFar"><circle r="9.5" fill="var(--deep)"/></g>

  <rect x="396" y="326" width="82" height="16" rx="8" fill="#4a5062"/>
  <rect x="400" y="324" width="74" height="7" rx="3.5" fill="#5a6175"/>

  <g data-r="torso">
    <path d="M404 334 C396 300 398 262 408 240 Q414 226 430 226 L446 228 Q462 232 462 252 L458 334 Z" fill="var(--shade)"/>
    <path d="M410 330 C404 300 406 266 414 246 Q420 234 432 234 L444 236 Q454 240 454 256 L450 330 Z" fill="url(#rShell§)"/>
    <rect x="412" y="268" width="5" height="40" rx="2.5" fill="var(--glow)" opacity="0.55"/>
    <rect x="420" y="214" width="20" height="18" rx="6" fill="var(--deep)"/>
  </g>

  <path data-r="legNear" fill="none" stroke="var(--shade)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <path data-r="legNearHi" fill="none" stroke="var(--shell)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <g data-r="footNear"><rect x="-24" y="-7" width="34" height="14" rx="7" fill="var(--trim)"/><rect x="-22" y="-7" width="30" height="5" rx="2.5" fill="#ffffff" opacity="0.15"/></g>

  <g data-r="head">
    <g data-r="antenna">
      <rect x="4" y="-66" width="5" height="28" rx="2.5" fill="var(--deep)"/>
      <circle data-r="antGlow" cx="6.5" cy="-68" r="16" fill="url(#rAnt§)"/>
      <circle cx="6.5" cy="-68" r="6" fill="var(--glow)"/>
      <circle cx="4.8" cy="-70" r="2.2" fill="#fff" opacity="0.8"/>
    </g>
    <rect x="-46" y="-40" width="92" height="80" rx="32" fill="url(#rShell§)"/>
    <path d="M-28 -32 Q-6 -40 18 -36" stroke="#fff" stroke-opacity="0.6" stroke-width="5" stroke-linecap="round" fill="none"/>
    <g clip-path="url(#rHeadClip§)">
      <rect data-r="visor" x="-50" y="-18" width="48" height="40" rx="18" fill="var(--visor)"/>
      <g data-r="eyesWrap" transform="translate(-14 0)">
        <g data-r="eyes"></g>
        <g data-r="blush" style="opacity:0;transition:opacity .3s"><ellipse cx="-16" cy="13" rx="5" ry="2.6" fill="#ff7aa8" opacity="0.8"/><ellipse cx="11" cy="13" rx="4" ry="2.4" fill="#ff7aa8" opacity="0.8"/></g>
      </g>
    </g>
    <g data-r="ear" transform="translate(30 4)">
      <circle r="15" fill="var(--deep)"/><circle r="11" fill="var(--shade)"/>
      <rect data-r="logoMasked" x="-9" y="-9" width="18" height="18" fill="var(--trim)" mask="url(#rLogoMask§)"/>
      <image data-r="logoPlain" x="-8" y="-8" width="16" height="16"/>
    </g>
  </g>

  <path data-r="armNear" fill="none" stroke="var(--shade)" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
  <path data-r="armNearHi" fill="none" stroke="var(--shell)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
  <g data-r="handNear"><circle r="10.5" fill="var(--shade)"/><circle cx="-2" cy="-2.5" r="7" fill="var(--shell)"/></g>
</svg>`;
// Each robot gets its own ids so several robots can share one document.
function robotSvg() { uid++; return ROBOT_SVG_RAW.replace(/§/g, String(uid)); }
