import gsap from "gsap";
import openaiLogo from "./assets/openai.svg";
import claudeLogo from "./assets/claude.svg";

// A robot seen from behind, sitting at the desk. Flat vector shapes, no outlines.
// Arms are two-bone IK chains that follow hand targets, so every pose is just
// "move the hands, tilt the head" and the arms resolve themselves each frame.

type Brand = { shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; maskLogo: boolean };

const BRANDS: Record<string, Brand> = {
  codex: { shell: "#eef0f8", shade: "#c9cee3", deep: "#98a0c2", glow: "#7cf2ff", visor: "#10142c", logo: openaiLogo, maskLogo: true },
  claude: { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ff9d6c", visor: "#1d1410", logo: claudeLogo, maskLogo: false },
};

export function brandFor(provider: string | null | undefined): string {
  if (!provider) return "codex";
  return provider.toLowerCase().includes("claude") ? "claude" : "codex";
}

const SH_L = { x: 498, y: 748 };
const SH_R = { x: 622, y: 748 };
const UPPER = 70;
const FORE = 66;
const HOME_L = { x: 528, y: 712 };
const HOME_R = { x: 592, y: 712 };
const MOUSE = { x: 706, y: 748 };

export type Pose = "idle" | "type" | "mouse" | "think" | "read" | "ask" | "rest" | "celebrate" | "sleep";

export class Robot {
  el: SVGSVGElement;
  private rig = { lx: HOME_L.x, ly: HOME_L.y, rx: HOME_R.x, ry: HOME_R.y, hx: 0, hy: 0, rot: 0, yaw: 0, lean: 0, body: 0, face: 0, sx: 1 };
  private typing = false;
  private nextKey = { l: 0, r: 0 };
  private keyOff = { lx: 0, ly: 0, rx: 0, ry: 0 };
  private pose: Pose = "idle";
  private brand = "codex";
  private $: Record<string, SVGElement> = {};
  private scratch: gsap.core.Tween | null = null;
  private blinkTl: gsap.core.Timeline | null = null;

  constructor(host: HTMLElement) {
    host.insertAdjacentHTML("beforeend", ROBOT_SVG);
    this.el = host.querySelector("#robot") as SVGSVGElement;
    for (const n of this.el.querySelectorAll("[data-r]")) this.$[(n as SVGElement).dataset.r!] = n as SVGElement;
    gsap.set(this.$.torso, { transformOrigin: "50% 100%" });
    gsap.set(this.$.antenna, { transformOrigin: "50% 100%" });
    gsap.set(this.$.face, { opacity: 0 });
    this.setBrand("codex");
    gsap.ticker.add(this.frame);
    this.idleLoops();
  }

  setBrand(provider: string) {
    const b = BRANDS[brandFor(provider)];
    this.brand = brandFor(provider);
    const s = this.el.style;
    s.setProperty("--shell", b.shell);
    s.setProperty("--shade", b.shade);
    s.setProperty("--deep", b.deep);
    s.setProperty("--glow", b.glow);
    s.setProperty("--visor", b.visor);
    const logoImg = this.$.logoImg as SVGImageElement;
    logoImg.setAttribute("href", b.logo);
    this.$.logoMasked.style.display = b.maskLogo ? "" : "none";
    this.$.logoPlain.setAttribute("href", b.logo);
    this.$.logoPlain.style.display = b.maskLogo ? "none" : "";
    (this.$.faceLogo as SVGImageElement).setAttribute("href", b.logo);
    this.$.faceLogo.style.display = b.maskLogo ? "none" : "";
  }

  get brandName() { return this.brand; }

  private idleLoops() {
    // Breathing: torso and head rise together, head trails slightly.
    gsap.to(this.rig, { body: 1, duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.to(this.$.antennaGlow, { opacity: 0.55, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.to(this.$.antenna, { rotation: 3, duration: 1.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
  }

  // Hands hammer the keyboard while typing is on.
  setTyping(on: boolean) {
    if (this.typing === on) return;
    this.typing = on;
    if (on) this.setPose("type");
    else gsap.to(this.keyOff, { lx: 0, ly: 0, rx: 0, ry: 0, duration: 0.25, ease: "power2.out" });
  }

  setPose(p: Pose) {
    if (p === this.pose && p !== "type") return;
    const prev = this.pose;
    this.pose = p;
    if (p !== "type") this.typing = false;
    this.scratch?.kill();
    this.scratch = null;
    if (prev === "ask" && p !== "ask") this.turnAround(false);
    if (prev === "sleep" && p !== "sleep") gsap.to(this.$.antenna, { opacity: 1, duration: 0.4 });
    const ease = "power3.inOut";
    const hands = (lx: number, ly: number, rx: number, ry: number, d = 0.55, delayR = 0.06) => {
      gsap.to(this.rig, { lx, ly, duration: d, ease, overwrite: "auto" });
      gsap.to(this.rig, { rx, ry, duration: d, ease, delay: delayR, overwrite: "auto" });
    };
    const head = (rot: number, hx: number, hy: number, lean: number, d = 0.7) =>
      gsap.to(this.rig, { rot, hx, hy, lean, yaw: 0, duration: d, ease: "power2.inOut", delay: 0.08, overwrite: "auto" });

    switch (p) {
      case "type":
        hands(HOME_L.x, HOME_L.y, HOME_R.x, HOME_R.y, 0.4, 0.04);
        head(0, 0, 4, 0.15, 0.5);
        break;
      case "mouse":
        hands(HOME_L.x, HOME_L.y + 6, MOUSE.x, MOUSE.y, 0.45, 0);
        head(2, 4, 2, 0.1, 0.5);
        break;
      case "read":
        hands(HOME_L.x + 2, HOME_L.y + 10, MOUSE.x, MOUSE.y, 0.5, 0.05);
        head(-1, 0, -2, 0.25, 0.6);
        break;
      case "think":
        hands(HOME_L.x + 4, HOME_L.y + 10, 640, 664, 0.7, 0.12);
        head(-7, -6, -6, -0.2, 0.9);
        this.scratch = gsap.to(this.rig, { ry: 656, duration: 0.22, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.9 });
        break;
      case "ask":
        hands(532, 722, 588, 722, 0.6, 0.08);
        head(0, 0, -8, -0.1, 0.6);
        this.turnAround(true);
        break;
      case "celebrate":
        hands(430, 560, 690, 560, 0.35, 0.05);
        head(0, 0, -10, -0.15, 0.4);
        gsap.delayedCall(1.4, () => this.pose === "celebrate" && this.setPose("rest"));
        break;
      case "rest":
        hands(534, 726, 586, 726, 0.8, 0.1);
        head(3, 0, 2, -0.05, 0.9);
        break;
      case "sleep":
        hands(536, 734, 584, 734, 1.4, 0.2);
        head(9, 2, 14, -0.12, 1.8);
        gsap.to(this.$.antenna, { opacity: 0.45, duration: 2, ease: "sine.inOut" });
        break;
      default:
        hands(HOME_L.x + 4, HOME_L.y + 12, HOME_R.x - 4, HOME_R.y + 12, 0.7, 0.08);
        head(0, 0, 0, 0, 0.8);
    }
  }

  // A single key press, for games and short inputs.
  tap() {
    const side = Math.random() < 0.5 ? "l" : "r";
    gsap.timeline()
      .to(this.keyOff, { [side + "y"]: -6, duration: 0.05, ease: "power2.out" })
      .to(this.keyOff, { [side + "y"]: 0, duration: 0.09, ease: "power2.in" });
  }

  // Wake up from a nap: a little startle, then back to a normal sitting pose.
  wake() {
    if (this.pose !== "sleep") return;
    this.setPose("rest");
    gsap.fromTo(this.rig, { hy: -10 }, { hy: 2, duration: 0.5, ease: "back.out(3)" });
  }

  // Small head turn toward where the robot is looking on screen (nx: 0..1).
  lookAt(nx: number, ny = 0.5) {
    if (this.pose === "ask" || this.pose === "think") return;
    gsap.to(this.rig, { yaw: (nx - 0.5) * 0.5, rot: (nx - 0.5) * 4, hy: (ny - 0.5) * 6, duration: 0.6, ease: "power2.out", overwrite: "auto" });
  }

  // Right hand nudges the mouse along with the on-screen cursor.
  nudgeMouse(nx: number, ny: number) {
    if (this.pose !== "mouse" && this.pose !== "read") return;
    gsap.to(this.rig, { rx: MOUSE.x + (nx - 0.5) * 22, ry: MOUSE.y + (ny - 0.5) * 8, duration: 0.5, ease: "power2.out", overwrite: "auto" });
  }

  click() {
    const r = this.rig;
    gsap.to(r, { ry: r.ry + 3, duration: 0.06, yoyo: true, repeat: 1, ease: "power1.inOut" });
  }

  private turnAround(on: boolean) {
    const tl = gsap.timeline();
    if (on) {
      tl.to(this.rig, { yaw: 1, duration: 0.35, ease: "power2.in" })
        .set(this.rig, { face: 1 })
        .to(this.$.face, { opacity: 1, duration: 0.01 })
        .fromTo(this.rig, { sx: 0.86 }, { sx: 1, duration: 0.45, ease: "back.out(2.2)" })
        .to(this.rig, { yaw: 0, duration: 0.01 }, "<");
      this.blinkTl?.kill();
      this.blinkTl = gsap.timeline({ repeat: -1, repeatDelay: 2.6 })
        .to(this.$.eyes, { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" })
        .to(this.$.eyes, { scaleY: 1, duration: 0.1 });
    } else {
      this.blinkTl?.kill();
      tl.to(this.rig, { sx: 0.86, duration: 0.18, ease: "power2.in" })
        .set(this.$.face, { opacity: 0 })
        .set(this.rig, { face: 0, yaw: -0.6 })
        .to(this.rig, { sx: 1, duration: 0.3, ease: "back.out(2)" })
        .to(this.rig, { yaw: 0, duration: 0.4, ease: "power2.out" }, "<");
    }
  }

  private frame = () => {
    const r = this.rig;
    const now = performance.now();
    // Typing: each hand picks a new key every ~80-150ms and dips onto it.
    if (this.typing) {
      for (const side of ["l", "r"] as const) {
        if (now > this.nextKey[side]) {
          this.nextKey[side] = now + 70 + Math.random() * 90;
          const tx = (Math.random() - 0.5) * 22, ty = (Math.random() - 0.5) * 12;
          gsap.timeline()
            .to(this.keyOff, { [side + "x"]: tx, [side + "y"]: ty - 5, duration: 0.05, ease: "power2.out" })
            .to(this.keyOff, { [side + "y"]: ty + 2, duration: 0.04, ease: "power3.in" });
        }
      }
    }
    const breath = r.body * 2.2;
    const L = { x: r.lx + this.keyOff.lx, y: r.ly + this.keyOff.ly };
    const R = { x: r.rx + this.keyOff.rx, y: r.ry + this.keyOff.ry };
    const shL = { x: SH_L.x, y: SH_L.y - breath }, shR = { x: SH_R.x, y: SH_R.y - breath };
    this.drawArm("armL", shL, L, -1);
    this.drawArm("armR", shR, R, 1);
    (this.$.handL as SVGGElement).setAttribute("transform", `translate(${L.x} ${L.y})`);
    (this.$.handR as SVGGElement).setAttribute("transform", `translate(${R.x} ${R.y})`);
    const jig = this.typing ? (this.keyOff.ly + this.keyOff.ry) * 0.25 : 0;
    this.$.torso.setAttribute("transform", `translate(0 ${-breath + jig}) scale(${1 + r.lean * 0.03})`);
    const scale = 1 + r.lean * 0.06;
    this.$.head.setAttribute(
      "transform",
      `translate(${r.hx} ${r.hy - breath * 1.15 + jig * 0.6}) rotate(${r.rot + (this.keyOff.lx - this.keyOff.rx) * 0.04} 560 715) translate(560 715) scale(${scale * r.sx} ${scale}) translate(-560 -715)`,
    );
    // Fake 3D turn: logo and ears slide with yaw, visor peeks out on the turning side.
    const yaw = r.yaw;
    this.$.logo.setAttribute("transform", `translate(${yaw * -34} 0) translate(560 655) scale(${1 - Math.abs(yaw) * 0.5} 1) translate(-560 -655)`);
    this.$.logo.style.opacity = String(r.face ? 0 : 1 - Math.max(0, Math.abs(yaw) - 0.6) * 2.5);
    this.$.earL.setAttribute("transform", `translate(${yaw * -14} 0)`);
    this.$.earR.setAttribute("transform", `translate(${yaw * -14} 0)`);
    this.$.earL.style.opacity = String(yaw > 0.5 ? 1 - (yaw - 0.5) * 2 : 1);
    this.$.earR.style.opacity = String(yaw < -0.5 ? 1 - (-yaw - 0.5) * 2 : 1);
    const peek = Math.max(0, Math.abs(yaw) - 0.15);
    this.$.visorPeek.setAttribute("transform", `translate(${yaw > 0 ? 70 - peek * 40 : -70 + peek * 40} 0)`);
    this.$.visorPeek.style.opacity = r.face ? "0" : String(Math.min(1, peek * 2));
  };

  private drawArm(key: string, s: { x: number; y: number }, t: { x: number; y: number }, out: number) {
    let dx = t.x - s.x, dy = t.y - s.y;
    let d = Math.hypot(dx, dy);
    const max = UPPER + FORE - 0.5;
    if (d > max) { t = { x: s.x + (dx / d) * max, y: s.y + (dy / d) * max }; dx = t.x - s.x; dy = t.y - s.y; d = max; }
    const th = Math.atan2(dy, dx);
    const a = Math.acos(Math.min(1, Math.max(-1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d))));
    const e1 = { x: s.x + UPPER * Math.cos(th + a), y: s.y + UPPER * Math.sin(th + a) };
    const e2 = { x: s.x + UPPER * Math.cos(th - a), y: s.y + UPPER * Math.sin(th - a) };
    // Elbows hang down and slightly out, like someone typing seen from behind.
    const score = (p: { x: number; y: number }) => p.y + (p.x - s.x) * out * 0.35;
    const e = score(e1) > score(e2) ? e1 : e2;
    const dpath = `M${s.x} ${s.y} L${e.x} ${e.y} L${t.x} ${t.y}`;
    this.$[key].setAttribute("d", dpath);
    this.$[key + "Hi"].setAttribute("d", `M${s.x - 3} ${s.y - 4} L${e.x - 3} ${e.y - 4} L${t.x - 2} ${t.y - 3}`);
  }
}

const ROBOT_SVG = /* svg */ `
<svg id="robot" class="layer" viewBox="0 0 1280 800" aria-hidden="true">
  <defs>
    <radialGradient id="antGlow"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <linearGradient id="headShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="0.62" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fd8ff" stop-opacity="0.55"/><stop offset="0.25" stop-color="#8fd8ff" stop-opacity="0"/>
    </linearGradient>
    <mask id="logoMask" maskContentUnits="userSpaceOnUse">
      <image data-r="logoImg" x="536" y="630" width="48" height="49"/>
    </mask>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>

  <ellipse cx="560" cy="742" rx="150" ry="22" fill="#05081a" opacity="0.35" filter="url(#soft)"/>

  <!-- arms sit behind the torso: they reach away from the camera -->
  <path data-r="armL" fill="none" stroke="var(--shade)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <path data-r="armLHi" fill="none" stroke="var(--shell)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <path data-r="armR" fill="none" stroke="var(--shade)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <path data-r="armRHi" fill="none" stroke="var(--shell)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <g data-r="handL"><ellipse rx="19" ry="15" fill="var(--shade)"/><ellipse cx="-3" cy="-4" rx="12" ry="8" fill="var(--shell)"/></g>
  <g data-r="handR"><ellipse rx="19" ry="15" fill="var(--shade)"/><ellipse cx="-3" cy="-4" rx="12" ry="8" fill="var(--shell)"/></g>

  <g data-r="torso">
    <path d="M462 820 C458 770 470 738 512 728 L608 728 C650 738 662 770 658 820 Z" fill="var(--shade)"/>
    <path d="M474 820 C472 778 482 748 516 740 L604 740 C636 748 646 778 644 820 Z" fill="var(--shell)"/>
    <rect x="530" y="760" width="60" height="7" rx="3.5" fill="var(--shade)"/>
    <rect x="530" y="775" width="60" height="7" rx="3.5" fill="var(--shade)"/>
    <rect x="530" y="790" width="60" height="7" rx="3.5" fill="var(--shade)"/>
    <circle cx="500" cy="748" r="30" fill="var(--shade)"/><circle cx="496" cy="744" r="22" fill="var(--shell)"/>
    <circle cx="620" cy="748" r="30" fill="var(--shade)"/><circle cx="616" cy="744" r="22" fill="var(--shell)"/>
    <rect x="543" y="708" width="34" height="30" rx="8" fill="var(--deep)"/>
  </g>

  <g data-r="head">
    <g data-r="antenna">
      <rect x="556" y="568" width="8" height="40" rx="4" fill="var(--deep)"/>
      <circle data-r="antennaGlow" cx="560" cy="566" r="26" fill="url(#antGlow)" opacity="0.9"/>
      <circle cx="560" cy="566" r="9" fill="var(--glow)"/>
      <circle cx="557" cy="563" r="3.5" fill="#ffffff" opacity="0.8"/>
    </g>
    <g data-r="earL"><circle cx="486" cy="656" r="17" fill="var(--deep)"/><circle cx="484" cy="654" r="10" fill="var(--shade)"/></g>
    <g data-r="earR"><circle cx="634" cy="656" r="17" fill="var(--deep)"/><circle cx="636" cy="654" r="10" fill="var(--shade)"/></g>
    <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#headShade)"/>
    <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#rim)"/>
    <path d="M512 618 C530 606 560 604 586 608" stroke="#ffffff" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round" fill="none"/>
    <g data-r="visorPeek" opacity="0">
      <clipPath id="headClip"><rect x="490" y="600" width="140" height="118" rx="44"/></clipPath>
      <g clip-path="url(#headClip)">
        <rect x="508" y="628" width="104" height="56" rx="26" fill="var(--visor)"/>
        <rect x="586" y="646" width="10" height="18" rx="5" fill="var(--glow)"/>
      </g>
    </g>
    <g data-r="logo">
      <rect data-r="logoMasked" x="536" y="630" width="48" height="49" fill="var(--deep)" mask="url(#logoMask)"/>
      <image data-r="logoPlain" x="538" y="632" width="44" height="44" opacity="0.9"/>
    </g>
    <g data-r="face">
      <rect x="490" y="600" width="140" height="118" rx="44" fill="var(--shell)"/>
      <rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
      <g data-r="eyes">
        <rect x="532" y="644" width="16" height="26" rx="8" fill="var(--glow)"/>
        <rect x="572" y="644" width="16" height="26" rx="8" fill="var(--glow)"/>
      </g>
      <image data-r="faceLogo" x="551" y="606" width="18" height="18" opacity="0.7"/>
    </g>
  </g>
</svg>`;
