// The robot's head, shared by the seated and the walking robot: antenna, ears, the back of the
// head with its embossed logo, the visor face, headphones, and the walker's side view. Drawn in
// the original v0 coordinates (head center 560,659, neck pivot 560,715) and scaled into place by
// whoever uses it. No filters: the eye glow is a soft radial light behind each eye.
// Also here: eyes for each expression and painting a species (brand) or look onto the parts.
import type { Expression } from "../rig";
import type { RobotLook } from "../look";
import { PALETTES, type BrandKind } from "../brand";
import { bodyColors } from "../look";
import { stickerSvg } from "./outfit";

/** Gradients, clips and masks one robot's parts refer to. `shadow` adds the seated body's floor shade. */
export function defsSvg(id: string, shadow = false) {
  return /* svg */ `
    <radialGradient id="${id}-ag"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.9"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-eg"><stop offset="0" stop-color="var(--glow)" stop-opacity="0.42"/><stop offset="0.55" stop-color="var(--glow)" stop-opacity="0.14"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
    ${shadow ? `<radialGradient id="${id}-sh"><stop offset="0" stop-color="#05081a" stop-opacity="0.32"/><stop offset="1" stop-color="#05081a" stop-opacity="0"/></radialGradient>` : ""}
    <linearGradient id="${id}-hs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--shell)"/><stop offset="0.62" stop-color="var(--shell)"/><stop offset="1" stop-color="var(--shade)"/>
    </linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--rim)" stop-opacity="0.55"/><stop offset="0.25" stop-color="var(--rim)" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}-hc"><rect x="490" y="600" width="140" height="118" rx="44"/></clipPath>
    <mask id="${id}-lm" maskContentUnits="userSpaceOnUse"><image data-r="logoMaskImg" x="536" y="630" width="48" height="49"/></mask>
    <mask id="${id}-fm" maskContentUnits="userSpaceOnUse"><image data-r="faceMaskImg" x="551" y="606" width="18" height="18"/></mask>`;
}

// The generic robot's logo: a little chip with pins.
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

// ---- head pieces (front and back views) ---------------------------------------------------------
/** The antenna inside its lift group (raised by tall hats). The seated robot's stem is a touch slimmer. */
const antenna = (id: string, stem: string) => /* svg */ `
    <g data-r="antennaLift"><g data-r="antenna"><g data-r="antennaDroop">
      ${stem}
      <circle data-r="antennaGlow" cx="560" cy="566" r="26" fill="url(#${id}-ag)" opacity="0.9"/>
      <g data-r="tip" transform="translate(560 566)">${antennaTipSvg("ball")}</g>
    </g></g></g>`;

const EARS = /* svg */ `
    <g data-r="earL"><circle cx="486" cy="656" r="17" fill="var(--ear, var(--deep))"/><circle cx="484" cy="654" r="10" fill="var(--shade)"/></g>
    <g data-r="earR"><circle cx="634" cy="656" r="17" fill="var(--ear, var(--deep))"/><circle cx="636" cy="654" r="10" fill="var(--shade)"/></g>`;

/** The back of the head: the shell, the visor peeking round on a turn, the logo and the stickers. */
const back = (id: string) => /* svg */ `
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
    </g>`;

/** The face: visor, glowing eyes and the small logo above them. The walker's eyes sit in a `look` group that glances around. */
const face = (id: string, seated: boolean) => {
  const eyes = /* svg */ `
      <g data-r="eyeLight"><ellipse cx="540" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/><ellipse cx="580" cy="657" rx="22" ry="27" fill="url(#${id}-eg)"/></g>
      <g data-r="eyes"></g>`;
  return /* svg */ `
    <g data-r="face" opacity="0"${seated ? ` style="display:none"` : ""}>
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-hs)"/>
      <rect x="490" y="600" width="140" height="118" rx="44" fill="url(#${id}-rim)"/>
      <path d="M512 618 C530 606 560 604 586 608" stroke="#ffffff" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round" fill="none"/>
      <rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
      <path d="M520 636 C534 630 556 629 572 631" stroke="#ffffff" stroke-opacity="0.12" stroke-width="5" stroke-linecap="round" fill="none"/>
      ${seated ? `${eyes}
      <g data-r="blush" style="display:none"></g>` : `<g data-r="look">${eyes}
      </g>`}
      <g class="model-sticker" transform="translate(516 697) scale(.8) rotate(12)" style="display:none"></g>
      <g data-r="faceLogo">
        <rect data-r="faceMasked" x="551" y="606" width="18" height="18" fill="var(--logo)" mask="url(#${id}-fm)" opacity="0.8"/>
        <image data-r="facePlain" x="551" y="606" width="18" height="18" opacity="0.75"/>
        <g data-r="faceChip">${chip(560, 615, 0.32, "var(--logo)")}</g>
      </g>
    </g>`;
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

/** The seated robot's head: its hat slot and headphones (lifted on and off by its hands) included. */
export function seatedHeadSvg(id: string) {
  return /* svg */ `${antenna(id, `<rect x="556.5" y="570" width="7" height="40" rx="3.5" fill="var(--deep)"/>`)}${EARS}${back(id)}${face(id, true)}
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

/** The walking robot's front and back head (its hat is drawn outside it, see walker/art.ts). */
export function walkerHeadSvg(id: string) {
  return /* svg */ `${antenna(id, `<rect x="556" y="568" width="8" height="40" rx="4" fill="var(--deep)"/>`)}${EARS}${back(id)}${face(id, false)}
    <g data-r="phones" style="display:none">
      <path d="M481 652 C480 572 640 572 639 652" fill="none" stroke="#3a3f4f" stroke-width="11" stroke-linecap="round"/>
      <path d="M492 630 C506 596 614 596 628 630" fill="none" stroke="#4a5063" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
      <rect x="468" y="632" width="28" height="50" rx="13" fill="var(--ear, #4a5063)"/><rect x="474" y="640" width="12" height="34" rx="6" fill="#3a3f4f" opacity="0.5"/>
      <rect x="624" y="632" width="28" height="50" rx="13" fill="var(--ear, #4a5063)"/><rect x="634" y="640" width="12" height="34" rx="6" fill="#3a3f4f" opacity="0.5"/>
    </g>`;
}

/** The walker's side-view head, facing right (mirrored for facing left). */
export function walkerSideHeadSvg(id: string) {
  return /* svg */ `
    <g data-r="sideHead" style="display:none">
      <g data-r="sideAntennaLift"><g data-r="sideAntenna">
        <rect x="548" y="568" width="8" height="40" rx="4" fill="var(--deep)"/>
        <circle data-r="sideGlow" cx="552" cy="566" r="26" fill="url(#${id}-ag)" opacity="0.9"/>
        <g data-r="sideTip" transform="translate(552 566)">${antennaTipSvg("ball")}</g>
      </g></g>
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

// ---- eyes and paint -----------------------------------------------------------------------------
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

/** Paint a species onto the robot: body colour variables and the logo in the right mode. */
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

/** Accent, antenna tip (front and side views) and sticker. `sticker` draws the decal for a sticker kind. */
export function paintLook(el: Element, $: Record<string, SVGElement>, look: RobotLook, sticker: (kind: RobotLook["sticker"]) => string = stickerSvg) {
  const st = (el as HTMLElement).style;
  if (look.accent) { st.setProperty("--ear", look.accent); st.setProperty("--cap", look.accent); }
  else { st.removeProperty("--ear"); st.removeProperty("--cap"); }
  const tip = antennaTipSvg(look.antennaTip ?? "ball");
  if ($.tip) $.tip.innerHTML = tip;
  if ($.sideTip) $.sideTip.innerHTML = tip;
  if ($.sticker) $.sticker.innerHTML = sticker(look.sticker ?? "none");
}
