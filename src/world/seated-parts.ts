import openaiLogo from "../assets/openai.svg";
import claudeLogo from "../assets/claude.svg";
import grokLogo from "./assets/grok.svg";
import { brandFor, type BrandKind } from "../office/brand";
import type { Expression, Pt, RobotLook } from "../office/rig";
import { stickerSvg as lookSticker } from "./look";

// Drawing pieces of the seated desk robot. Started as a copy of parts.ts (the walker and the
// break room keep using that file), so the desk robot can evolve on its own. Everything is in
// the original v0 coordinates: head center 560,659, shoulders on y 748.

export type Palette = {
  shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; rim: string;
  src: string | null; mode: "mask" | "image" | "chip";
};

export const PALETTES: Record<BrandKind, Palette> = {
  codex: { shell: "#eef0f8", shade: "#c9cee3", deep: "#98a0c2", glow: "#7cf2ff", visor: "#10142c", logo: "#98a0c2", rim: "#8fd8ff", src: openaiLogo, mode: "mask" },
  claude: { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ff9d6c", visor: "#1d1410", logo: "#d97757", rim: "#8fd8ff", src: claudeLogo, mode: "image" },
  grok: { shell: "#2e2f36", shade: "#1b1c21", deep: "#4b4d57", glow: "#ffffff", visor: "#060608", logo: "#e8e9ee", rim: "#cfd6ff", src: grokLogo, mode: "mask" },
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

/** Gradients, clips and masks. No filters: the eye glow is a soft radial light behind each eye. */
export function defsSvg(id: string) {
  return /* svg */ `
    <radialGradient id="${id}-ag"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-eg"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.42"/><stop offset="0.55" stop-color="var(--glow)" stop-opacity="0.14"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-sh"><stop offset="0" stop-color="#05081a" stop-opacity="0.32"/><stop offset="1" stop-color="#05081a" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-hs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="0.62" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--rim)" stop-opacity="0.55"/><stop offset="0.25" stop-color="var(--rim)" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-tor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="0.7" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
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

// One headphone cup over an ear disc (left side; the right one is mirrored around x 560).
const cup = (side: -1 | 1) => {
  const m = (x: number, w = 0) => (side < 0 ? x : 1120 - x - w);
  return /* svg */ `
    <rect x="${m(478, 9)}" y="616" width="9" height="20" rx="4.5" fill="#3a3f4f"/>
    <rect x="${m(464, 34)}" y="627" width="34" height="60" rx="16" fill="var(--hp)"/>
    <rect x="${m(484, 14)}" y="632" width="14" height="50" rx="7" fill="#141826" opacity="0.16"/>
    <rect x="${m(469, 7)}" y="633" width="7" height="24" rx="3.5" fill="#ffffff" opacity="0.4"/>`;
};

/** The whole head in v0 coordinates: antenna, ears, back of the head with the logo, the face and headphones. */
export function headSvg(id: string) {
  return /* svg */ `
    <g data-r="antennaLift"><g data-r="antenna"><g data-r="antennaDroop">
      <rect x="556.5" y="570" width="7" height="40" rx="3.5" fill="var(--deep)"/>
      <circle data-r="antennaGlow" cx="560" cy="566" r="26" fill="url(#${id}-ag)" opacity="0.9"/>
      <g data-r="tip" transform="translate(560 566)">${antennaTipSvg("ball")}</g>
    </g></g></g>
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
    </g>
    <g data-r="face" opacity="0" style="display:none">
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-hs)"/>
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-rim)"/>
      <path d="M512 618 C530 606 560 604 586 608" stroke="#ffffff" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round" fill="none"/>
      <rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
      <path d="M520 636 C534 630 556 629 572 631" stroke="#ffffff" stroke-opacity="0.12" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g data-r="eyeLight"><ellipse cx="540" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/><ellipse cx="580" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/></g>
      <g data-r="eyes"></g>
      <g data-r="blush" style="display:none"></g>
      <g data-r="faceLogo">
        <rect data-r="faceMasked" x="551" y="606" width="18" height="18" fill="var(--logo)" mask="url(#${id}-fm)" opacity="0.8"/>
        <image data-r="facePlain" x="551" y="606" width="18" height="18" opacity="0.75"/>
        <g data-r="faceChip">${chip(560, 615, 0.32, "var(--logo)")}</g>
      </g>
    </g>
    <g data-r="hat"></g>
    <g data-r="phones" style="display:none">
      <path d="M481 640 C478 604 506 589 560 589 C614 589 642 604 639 640" fill="none" stroke="#2c3040" stroke-width="12" stroke-linecap="round"/>
      <path d="M481 640 C478 604 506 589 560 589 C614 589 642 604 639 640" fill="none" stroke="var(--hp)" stroke-width="8" stroke-linecap="round"/>
      <path d="M497 609 C514 596 540 593 560 593" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>
      <rect x="538" y="583" width="44" height="9" rx="4.5" fill="#2c3040"/>
      <g data-r="hpL">${cup(-1)}</g>
      <g data-r="hpR">${cup(1)}</g>
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

/** Stickers live in look.ts now (shared with the walker and the portraits). */
export function stickerSvg(kind: RobotLook["sticker"]) { return lookSticker(kind); }

/** Eyes on the visor for an expression. */
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

/** Paint a brand onto the robot (CSS variables + logo images). */
export function paintBrand(el: Element, $: Record<string, SVGElement>, kind: BrandKind) {
  const p = PALETTES[kind];
  const st = (el as HTMLElement).style;
  st.setProperty("--shell", p.shell); st.setProperty("--shade", p.shade); st.setProperty("--deep", p.deep);
  st.setProperty("--glow", p.glow); st.setProperty("--visor", p.visor); st.setProperty("--logo", p.logo); st.setProperty("--rim", p.rim);
  const show = (k: string, on: boolean) => { if ($[k]) $[k].style.display = on ? "" : "none"; };
  for (const k of ["logoMaskImg", "faceMaskImg"]) if ($[k] && p.src) $[k].setAttribute("href", p.src);
  for (const k of ["logoPlain", "facePlain"]) if ($[k] && p.src) $[k].setAttribute("href", p.src);
  show("logoMasked", p.mode === "mask"); show("faceMasked", p.mode === "mask");
  show("logoPlain", p.mode === "image"); show("facePlain", p.mode === "image");
  show("logoChip", p.mode === "chip"); show("faceChip", p.mode === "chip");
}

/** Accent, antenna tip and sticker. Headphones are animated by the robot itself. */
export function paintLook(el: Element, $: Record<string, SVGElement>, look: RobotLook) {
  const st = (el as HTMLElement).style;
  if (look.accent) { st.setProperty("--ear", look.accent); st.setProperty("--cap", look.accent); }
  else { st.removeProperty("--ear"); st.removeProperty("--cap"); }
  if ($.tip) $.tip.innerHTML = antennaTipSvg(look.antennaTip ?? "ball");
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
