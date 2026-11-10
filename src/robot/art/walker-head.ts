import openaiLogo from "../../assets/openai.svg";
import claudeLogo from "../../assets/claude.svg";
import grokLogo from "../../world/assets/grok.svg";
import opencodeLogo from "../../assets/harness/opencode.svg";
import geminiLogo from "../../assets/harness/gemini.svg";
import antigravityLogo from "../../assets/harness/antigravity.svg";
import museLogo from "../../assets/harness/muse.svg";
import { brandFor, type BrandKind } from "../brand";
import type { Expression, Pt, RobotLook } from "../rig";
import { bodyColors } from "../look";

// Shared pieces of the v0 robot: palettes, the head (back view with the embossed logo,
// front view with the visor face, side view), antenna tips, stickers, eyes and the two-bone
// arm solver. No filters: the eye glow is a soft radial light behind each eye.
// Everything is drawn in the original v0 coordinates (head center 560,659,
// shoulders at y 748) and scaled into place by whoever uses it.

export type Palette = {
  shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; rim: string;
  src: string | null; mode: "mask" | "image" | "chip";
};

export const PALETTES: Record<BrandKind, Palette> = {
  codex: { shell: "#eef0f8", shade: "#c9cee3", deep: "#98a0c2", glow: "#7cf2ff", visor: "#10142c", logo: "#98a0c2", rim: "#8fd8ff", src: openaiLogo, mode: "mask" },
  claude: { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ff9d6c", visor: "#1d1410", logo: "#d97757", rim: "#8fd8ff", src: claudeLogo, mode: "image" },
  grok: { shell: "#2e2f36", shade: "#1b1c21", deep: "#4b4d57", glow: "#ffffff", visor: "#060608", logo: "#e8e9ee", rim: "#cfd6ff", src: grokLogo, mode: "mask" },
  opencode: { shell: "#c9d3e6", shade: "#9eabc6", deep: "#6d7b9b", glow: "#4ff0a0", visor: "#121a2e", logo: "#6d7b9b", rim: "#8fd8ff", src: opencodeLogo, mode: "mask" },
  gemini: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#7b93d6", glow: "#4285f4", visor: "#121a2e", logo: "#4285f4", rim: "#8fd8ff", src: geminiLogo, mode: "mask" },
  antigravity: { shell: "#f0e6ff", shade: "#d4c2f0", deep: "#8a6bbf", glow: "#9b59b6", visor: "#1a1028", logo: "#9b59b6", rim: "#d8b4fe", src: antigravityLogo, mode: "mask" },
  muse: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#0467DF", glow: "#0467DF", visor: "#101828", logo: "#0467DF", rim: "#8fd8ff", src: museLogo, mode: "image" },
  generic: { shell: "#c9d3e6", shade: "#9eabc6", deep: "#6d7b9b", glow: "#4ff0a0", visor: "#121a2e", logo: "#6d7b9b", rim: "#8fd8ff", src: null, mode: "chip" },
};

export { brandFor };
export type { BrandKind };

let seq = 0;
export const uid = (p = "w") => `${p}${++seq}${Math.random().toString(36).slice(2, 6)}`;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function bind(root: Element, attr = "r") {
  const out: Record<string, SVGElement> = {};
  for (const n of root.querySelectorAll(`[data-${attr}]`)) out[(n as SVGElement).dataset[attr]!] = n as SVGElement;
  return out;
}

export function defsSvg(id: string) {
  return /* svg */ `
    <radialGradient id="${id}-ag"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-hs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="0.62" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--rim)" stop-opacity="0.55"/><stop offset="0.25" stop-color="var(--rim)" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-tor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
    <radialGradient id="${id}-eg"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.42"/><stop offset="0.55" stop-color="var(--glow)" stop-opacity="0.14"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}-hc"><rect x="490" y="600" width="140" height="118" rx="44"/></clipPath>
    <mask id="${id}-lm" maskContentUnits="userSpaceOnUse"><image data-r="logoMaskImg" x="536" y="630" width="48" height="49"/></mask>
    <mask id="${id}-fm" maskContentUnits="userSpaceOnUse"><image data-r="faceMaskImg" x="551" y="606" width="18" height="18"/></mask>`;
}

const chip = (cx: number, cy: number, s: number, fill: string) => {
  const h = 18 * s, pins: string[] = [];
  for (let i = -1; i <= 1; i++) {
    const o = i * 9 * s;
    pins.push(`<rect x="${cx - h - 6 * s}" y="${cy + o - 2 * s}" width="${8 * s}" height="${4 * s}" rx="${2 * s}" fill="${fill}"/>`);
    pins.push(`<rect x="${cx + h - 2 * s}" y="${cy + o - 2 * s}" width="${8 * s}" height="${4 * s}" rx="${2 * s}" fill="${fill}"/>`);
    pins.push(`<rect x="${cx + o - 2 * s}" y="${cy - h - 6 * s}" width="${4 * s}" height="${8 * s}" rx="${2 * s}" fill="${fill}"/>`);
    pins.push(`<rect x="${cx + o - 2 * s}" y="${cy + h - 2 * s}" width="${4 * s}" height="${8 * s}" rx="${2 * s}" fill="${fill}"/>`);
  }
  return `${pins.join("")}<rect x="${cx - h}" y="${cy - h}" width="${h * 2}" height="${h * 2}" rx="${7 * s}" fill="${fill}"/>
    <rect x="${cx - 8 * s}" y="${cy - 8 * s}" width="${16 * s}" height="${16 * s}" rx="${4 * s}" fill="var(--shell)" opacity="0.8"/>
    <circle cx="${cx - 3 * s}" cy="${cy - 3 * s}" r="${2.6 * s}" fill="var(--glow)"/>`;
};

/** The whole head in v0 coordinates: antenna, ears, back of the head with the logo, and the face. */
export function headSvg(id: string) {
  return /* svg */ `
    <g data-r="antenna"><g data-r="antennaDroop">
      <rect x="556" y="568" width="8" height="40" rx="4" fill="var(--deep)"/>
      <circle data-r="antennaGlow" cx="560" cy="566" r="26" fill="url(#${id}-ag)" opacity="0.9"/>
      <g data-r="tip" transform="translate(560 566)">${antennaTipSvg("ball")}</g>
    </g></g>
    <g data-r="earL"><circle cx="486" cy="656" r="17" fill="var(--ear, var(--deep))"/><circle cx="484" cy="654" r="10" fill="var(--shade)"/></g>
    <g data-r="earR"><circle cx="634" cy="656" r="17" fill="var(--ear, var(--deep))"/><circle cx="636" cy="654" r="10" fill="var(--shade)"/></g>
    <g data-r="back">
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-hs)"/>
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-rim)"/>
      <path d="M512 618 C530 606 560 604 586 608" stroke="#ffffff" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round" fill="none"/>
      <g data-r="visorPeek" opacity="0">
        <g clip-path="url(#${id}-hc)">
          <rect x="508" y="628" width="104" height="56" rx="26" fill="var(--visor)"/>
          <rect x="586" y="646" width="10" height="18" rx="5" fill="var(--glow)"/>
        </g>
      </g>
      <g data-r="logo">
        <rect data-r="logoMasked" x="536" y="630" width="48" height="49" fill="var(--logo)" mask="url(#${id}-lm)"/>
        <image data-r="logoPlain" x="538" y="632" width="44" height="44" opacity="0.9"/>
        <g data-r="logoChip">${chip(560, 655, 1, "var(--logo)")}</g>
      </g>
      <g data-r="sticker" transform="translate(606 692) rotate(-14)"></g>
      <g class="model-sticker" transform="translate(516 692) rotate(12)" style="display:none"></g>
    </g>
    <g data-r="face" opacity="0">
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-hs)"/>
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-rim)"/>
      <path d="M512 618 C530 606 560 604 586 608" stroke="#ffffff" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round" fill="none"/>
      <rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
      <path d="M520 636 C534 630 556 629 572 631" stroke="#ffffff" stroke-opacity="0.12" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g data-r="look">
        <g data-r="eyeLight"><ellipse cx="540" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/><ellipse cx="580" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/></g>
        <g data-r="eyes"></g>
      </g>
      <g class="model-sticker" transform="translate(516 697) scale(.8) rotate(12)" style="display:none"></g>
      <g data-r="faceLogo">
        <rect data-r="faceMasked" x="551" y="606" width="18" height="18" fill="var(--logo)" mask="url(#${id}-fm)" opacity="0.8"/>
        <image data-r="facePlain" x="551" y="606" width="18" height="18" opacity="0.75"/>
        <g data-r="faceChip">${chip(560, 615, 0.32, "var(--logo)")}</g>
      </g>
    </g>
    <g data-r="phones" style="display:none">
      <path d="M481 652 C480 572 640 572 639 652" fill="none" stroke="#3a3f4f" stroke-width="11" stroke-linecap="round"/>
      <path d="M492 630 C506 596 614 596 628 630" fill="none" stroke="#4a5063" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
      <rect x="468" y="632" width="28" height="50" rx="13" fill="var(--ear, #4a5063)"/><rect x="474" y="640" width="12" height="34" rx="6" fill="#3a3f4f" opacity="0.5"/>
      <rect x="624" y="632" width="28" height="50" rx="13" fill="var(--ear, #4a5063)"/><rect x="634" y="640" width="12" height="34" rx="6" fill="#3a3f4f" opacity="0.5"/>
    </g>`;
}

/** Side view head (for the walker), facing right. Mirrored for facing left. */
export function headSideSvg(id: string) {
  return /* svg */ `
    <g data-r="sideHead" style="display:none">
      <g data-r="sideAntenna">
        <rect x="548" y="568" width="8" height="40" rx="4" fill="var(--deep)"/>
        <circle data-r="sideGlow" cx="552" cy="566" r="26" fill="url(#${id}-ag)" opacity="0.9"/>
        <g data-r="sideTip" transform="translate(552 566)">${antennaTipSvg("ball")}</g>
      </g>
      <rect x="500" y="600" width="116" height="118" rx="42" fill="url(#${id}-hs)"/>
      <rect x="500" y="600" width="116" height="118" rx="42" fill="url(#${id}-rim)"/>
      <path d="M518 616 C534 606 556 604 578 608" stroke="#ffffff" stroke-opacity="0.5" stroke-width="7" stroke-linecap="round" fill="none"/>
      <clipPath id="${id}-sc"><rect x="500" y="600" width="116" height="118" rx="42"/></clipPath>
      <g clip-path="url(#${id}-sc)">
        <rect x="570" y="626" width="70" height="62" rx="26" fill="var(--visor)"/>
        <g data-r="sideLook">
          <ellipse data-r="sideEyeLight" cx="604" cy="657" rx="20" ry="27" fill="url(#${id}-eg)"/>
          <g data-r="sideEyes"></g>
        </g>
      </g>
      <circle cx="540" cy="660" r="18" fill="var(--ear, var(--deep))"/><circle cx="538" cy="658" r="11" fill="var(--shade)"/>
      <g class="model-sticker" transform="translate(565 697) scale(.8) rotate(12)" style="display:none"></g>
      <g data-r="sidePhones" style="display:none">
        <path d="M528 640 C524 586 560 578 574 596" fill="none" stroke="#3a3f4f" stroke-width="11" stroke-linecap="round"/>
        <rect x="524" y="634" width="32" height="52" rx="14" fill="var(--ear, #4a5063)"/>
      </g>
    </g>`;
}

export function antennaTipSvg(kind: RobotLook["antennaTip"] = "ball") {
  switch (kind) {
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 5.5 : 13, a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="var(--glow)" stroke="var(--glow)" stroke-width="2.5" stroke-linejoin="round"/><circle cx="-2.5" cy="-4" r="2.4" fill="#fff" opacity="0.8"/>`;
    }
    case "heart":
      return `<path d="M0 10 C-16 0 -11 -14 0 -6 C11 -14 16 0 0 10 Z" fill="var(--glow)"/><circle cx="-5" cy="-5" r="2.6" fill="#fff" opacity="0.8"/>`;
    case "ring":
      return `<circle r="8" fill="none" stroke="var(--glow)" stroke-width="5"/><circle cx="-4" cy="-5" r="2" fill="#fff" opacity="0.8"/>`;
    default:
      return `<circle r="9" fill="var(--glow)"/><circle cx="-3" cy="-3" r="3.5" fill="#ffffff" opacity="0.8"/>`;
  }
}

export function stickerSvg(kind: RobotLook["sticker"]) {
  switch (kind) {
    case "bolt":
      return `<rect x="-11" y="-13" width="22" height="26" rx="7" fill="#fbfbfb"/><path d="M2 -10 L-6 2 L0 2 L-3 10 L6 -3 L0 -3 Z" fill="#ffc531"/>`;
    case "star":
      return `<circle r="12" fill="#fbfbfb"/><polygon points="0,-8.5 2.4,-2.8 8.5,-2.6 3.8,1.4 5.3,7.4 0,4 -5.3,7.4 -3.8,1.4 -8.5,-2.6 -2.4,-2.8" fill="#ff9f5a" stroke="#ff9f5a" stroke-width="1.5" stroke-linejoin="round"/>`;
    case "heart":
      return `<path d="M0 12 C-20 0 -14 -17 0 -8 C14 -17 20 0 0 12 Z" fill="#fbfbfb"/><path d="M0 7.5 C-12 0 -8 -10 0 -4.5 C8 -10 12 0 0 7.5 Z" fill="#ff6f91"/>`;
    case "smile":
      return `<circle r="12" fill="#fbfbfb"/><circle r="9" fill="#ffd23f"/><circle cx="-3" cy="-2" r="1.4" fill="#3a3f4f"/><circle cx="3" cy="-2" r="1.4" fill="#3a3f4f"/><path d="M-4 2 Q0 6 4 2" stroke="#3a3f4f" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

/** Eyes on the visor for an expression. `xs` are eye centers (one entry for a side view). */
export function eyesSvg(e: Expression, xs: number[] = [540, 580], cy = 657) {
  const f = `fill="var(--glow)"`;
  const s = `fill="none" stroke="var(--glow)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  const single = xs.length === 1;
  return xs.map((cx, i) => {
    const left = !single && i === 0;
    switch (e) {
      case "happy": return `<path d="M${cx - 9} ${cy + 4} Q${cx} ${cy - 12} ${cx + 9} ${cy + 4}" ${s}/>`;
      case "laugh": return left
        ? `<path d="M${cx - 7} ${cy - 8} L${cx + 6} ${cy} L${cx - 7} ${cy + 8}" ${s}/>`
        : `<path d="M${cx + 7} ${cy - 8} L${cx - 6} ${cy} L${cx + 7} ${cy + 8}" ${s}/>`;
      case "angry": {
        const [a, b] = left ? [cy - 10, cy - 2] : [cy - 2, cy - 10];
        return `<path d="M${cx - 8} ${a} L${cx + 8} ${b} L${cx + 8} ${cy + 9} Q${cx + 8} ${cy + 13} ${cx + 4} ${cy + 13} L${cx - 4} ${cy + 13} Q${cx - 8} ${cy + 13} ${cx - 8} ${cy + 9} Z" ${f}/>`;
      }
      case "surprised": return `<circle cx="${cx}" cy="${cy}" r="11" ${f}/><circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--visor)"/>`;
      case "sleepy": return `<path d="M${cx - 8} ${cy + 2} Q${cx} ${cy + 8} ${cx + 8} ${cy + 2}" ${s}/>`;
      case "focus": return `<rect x="${cx - 8}" y="${cy - 3}" width="16" height="11" rx="5" ${f}/>`;
      case "shy": return `<rect x="${cx - 6 + (single ? 2 : 0)}" y="${cy - 2}" width="12" height="15" rx="6" ${f}/>` +
        `<ellipse cx="${cx + (left ? -12 : 12)}" cy="${cy + 19}" rx="8" ry="4" fill="#ff6f91" opacity="0.6"/>`;
      default: return `<rect x="${cx - 8}" y="${cy - 13}" width="16" height="26" rx="8" ${f}/>`;
    }
  }).join("");
}

/** Paint a brand onto any element holding the robot parts (CSS variables + logo images). */
export function paintBrand(el: Element, $: Record<string, SVGElement>, kind: BrandKind) {
  const p = PALETTES[kind];
  const st = (el as HTMLElement).style;
  for (const [k, v] of Object.entries(bodyColors(p, p.deep))) st.setProperty(k, v);
  st.setProperty("--glow", p.glow); st.setProperty("--visor", p.visor); st.setProperty("--logo", p.logo); st.setProperty("--rim", p.rim);
  const show = (k: string, on: boolean) => { if ($[k]) $[k].style.display = on ? "" : "none"; };
  for (const k of ["logoMaskImg", "faceMaskImg"]) if ($[k] && p.src) $[k].setAttribute("href", p.src);
  for (const k of ["logoPlain", "facePlain"]) if ($[k] && p.src) $[k].setAttribute("href", p.src);
  show("logoMasked", p.mode === "mask"); show("faceMasked", p.mode === "mask");
  show("logoPlain", p.mode === "image"); show("facePlain", p.mode === "image");
  show("logoChip", p.mode === "chip"); show("faceChip", p.mode === "chip");
}

export function paintLook(el: Element, $: Record<string, SVGElement>, look: RobotLook) {
  const st = (el as HTMLElement).style;
  if (look.accent) { st.setProperty("--ear", look.accent); st.setProperty("--cap", look.accent); }
  else { st.removeProperty("--ear"); st.removeProperty("--cap"); }
  const tip = antennaTipSvg(look.antennaTip ?? "ball");
  if ($.tip) $.tip.innerHTML = tip;
  if ($.sideTip) $.sideTip.innerHTML = tip;
  if ($.phones) $.phones.style.display = look.headphones ? "" : "none";
  if ($.sidePhones) $.sidePhones.style.display = look.headphones ? "" : "none";
  if ($.sticker) $.sticker.innerHTML = stickerSvg(look.sticker ?? "none");
}

/** Two-bone arm: shoulder s, hand target t. `out` (-1 left, 1 right) picks the elbow that hangs outward. Bones may stretch a little. */
/** Which way an elbow bent last frame, so it does not flip when both ways score about the same. */
export type ArmMemo = { side?: 1 | -1 };
const MIN_ELBOW = (40 * Math.PI) / 180;   // the elbow never closes tighter than this
export function solveArm(s: Pt, t: Pt, upper: number, fore: number, out: number, stretch = 1.25, down = 0.35, memo?: ArmMemo) {
  let dx = t.x - s.x, dy = t.y - s.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const k = clamp(d / (upper + fore - 0.5), 1, stretch);
  let U = upper * k, F = fore * k;
  const M = U + F - 0.5;
  if (d > M) { t = { x: s.x + (dx / d) * M, y: s.y + (dy / d) * M }; dx = t.x - s.x; dy = t.y - s.y; d = M; }
  // A hand close to the shoulder would fold the elbow into a hairpin: shorten both bones
  // instead (the arm reads as pointing toward or away from us), keeping the hand on target.
  const dMin = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(MIN_ELBOW));
  if (d < dMin) { const f = Math.max(0.35, d / dMin); U *= f; F *= f; }
  const th = Math.atan2(dy, dx);
  const a = Math.acos(clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1));
  const e1 = { x: s.x + U * Math.cos(th + a), y: s.y + U * Math.sin(th + a) };
  const e2 = { x: s.x + U * Math.cos(th - a), y: s.y + U * Math.sin(th - a) };
  const score = (p: Pt) => (p.x - s.x) * out + (p.y - s.y) * down;
  const diff = score(e1) - score(e2);
  if (!memo) return { e: diff > 0 ? e1 : e2, t };
  // keep bending the same way unless the other way is clearly better (no sudden flips)
  const margin = (upper + fore) * 0.12;
  if (memo.side == null || (memo.side === 1 ? diff < -margin : diff > margin)) memo.side = diff > 0 ? 1 : -1;
  return { e: memo.side === 1 ? e1 : e2, t };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
