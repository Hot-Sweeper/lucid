import type { AccessoryKind, Build, EyeStyle, Expression, HatKind, ManagerMark, RobotLook, StickerKind, Tint } from "../office/rig";

// Robot customisation shared by every robot drawing: the desk robot (seated.ts), the hiring
// portraits, the customize dialog and, later, the walker. Everything is drawn in the v0 robot
// coordinates that parts.ts and seated-parts.ts use: head 490..630 x 600..718 (center 560,659,
// neck pivot 560,715), shoulders on y 747 at 560 +- 50, torso shell 503..617 x 727..838.
// The art only reads CSS variables, so it follows brand, tint and accent automatically:
//   --shell --shade --deep   body colours (tinted)       --glow   eyes, antenna, lights
//   --visor                  face glass                  --acc    fabric colour (look.accent)

export type View = "back" | "front";

// ---- options ------------------------------------------------------------------------------
type Opt<K extends string> = { id: K; label: string; unlock?: number };

export const BUILDS: Opt<Build>[] = [{ id: "slim", label: "Slim" }, { id: "regular", label: "Regular" }, { id: "sturdy", label: "Sturdy" }];
/** Torso width factor and v0 shoulder half width per build. Even sturdy stays a tapered shell. */
export const BUILD_SHAPE: Record<Build, { kx: number; shoulder: number; arm: number }> = {
  slim: { kx: 0.88, shoulder: 45, arm: 0.9 },
  regular: { kx: 1, shoulder: 50, arm: 1 },
  sturdy: { kx: 1.13, shoulder: 56, arm: 1.12 },
};
export const HEAD_SIZES = [0.9, 0.95, 1, 1.05, 1.1, 1.15];

// antenna: "through" pokes out of the hat, "lift" sits on top of a tall hat, "hide" is covered by it
export const HATS: (Opt<HatKind> & { antenna: "through" | "lift" | "hide"; lift?: number })[] = [
  { id: "none", label: "No hat", antenna: "through" },
  { id: "beanie", label: "Beanie", antenna: "through" },
  { id: "cap", label: "Cap", antenna: "through" },
  { id: "capBack", label: "Cap, backwards", antenna: "through" },
  { id: "headset", label: "Headset", antenna: "through" },
  { id: "beret", label: "Beret", antenna: "through" },
  { id: "catEars", label: "Cat ears", antenna: "through" },
  { id: "bow", label: "Bow", antenna: "through" },
  { id: "flowers", label: "Flower crown", antenna: "through" },
  { id: "party", label: "Party hat", antenna: "hide" },
  { id: "santa", label: "Santa hat", antenna: "hide" },
  { id: "chef", label: "Chef hat", antenna: "hide" },
  { id: "cowboy", label: "Cowboy hat", antenna: "lift", lift: 46 },
  { id: "tophat", label: "Top hat", antenna: "lift", lift: 74, unlock: 2 },
  { id: "propeller", label: "Propeller cap", antenna: "hide", unlock: 3 },
  { id: "wizard", label: "Wizard hat", antenna: "hide", unlock: 5 },
  { id: "crown", label: "Crown", antenna: "through", unlock: 8 },
];
export const ACCESSORIES: (Opt<AccessoryKind> & { covers?: boolean })[] = [
  { id: "none", label: "Nothing" },
  { id: "scarf", label: "Scarf" },
  { id: "bowtie", label: "Bow tie" },
  { id: "tie", label: "Tie" },
  { id: "lanyard", label: "Badge" },
  { id: "flower", label: "Flower pin" },
  { id: "bandana", label: "Bandana" },
  { id: "backpack", label: "Backpack", covers: true },
  { id: "jetpack", label: "Jetpack", covers: true, unlock: 4 },
  { id: "cape", label: "Cape", covers: true, unlock: 6 },
];
export const EYES: Opt<EyeStyle>[] = [
  { id: "classic", label: "Classic" }, { id: "dots", label: "Dots" }, { id: "round", label: "Sparkly" }, { id: "happy", label: "Happy" },
  { id: "visor", label: "Visor bar" }, { id: "pixel", label: "Pixel" }, { id: "sleepy", label: "Sleepy" }, { id: "hearts", label: "Hearts", unlock: 3 },
];
export const TINTS: (Opt<Tint> & { color: string | null })[] = [
  { id: "none", label: "Factory", color: null }, { id: "warm", label: "Warm", color: "#ffa36b" }, { id: "cool", label: "Cool", color: "#7fa6ff" },
  { id: "mint", label: "Mint", color: "#5fdcae" }, { id: "rose", label: "Rose", color: "#ff8fb1" }, { id: "sand", label: "Sand", color: "#dcb47a" },
  { id: "lilac", label: "Lilac", color: "#b896ff" }, { id: "graphite", label: "Graphite", color: "#4a505f" },
];
export const STICKERS: Opt<StickerKind>[] = [
  { id: "none", label: "None" }, { id: "bolt", label: "Bolt" }, { id: "star", label: "Star" }, { id: "heart", label: "Heart" }, { id: "smile", label: "Smiley" },
  { id: "flower", label: "Flower" }, { id: "moon", label: "Moon" }, { id: "ghost", label: "Ghost" }, { id: "cat", label: "Cat" }, { id: "pizza", label: "Pizza" },
  { id: "rainbow", label: "Rainbow", unlock: 2 }, { id: "planet", label: "Planet", unlock: 4 },
];
export const ANTENNA_TIPS: Opt<NonNullable<RobotLook["antennaTip"]>>[] = [
  { id: "ball", label: "Ball" }, { id: "star", label: "Star" }, { id: "heart", label: "Heart" }, { id: "ring", label: "Ring" },
];
export const ACCENTS = ["#ff9f5a", "#ffd27a", "#4ff0a0", "#4fb6ff", "#b07cff", "#ff6f91", "#e2434b", "#2f3a5c", "#f3ede2"];
export const GLOWS = ["#7cf2ff", "#4ff0a0", "#ff9d6c", "#ff6f91", "#b07cff", "#ffd23f", "#ffffff"];
export const COLOR_NAMES: Record<string, string> = {
  "#ff9f5a": "Orange", "#ffd27a": "Butter", "#4ff0a0": "Mint", "#4fb6ff": "Sky", "#b07cff": "Violet", "#ff6f91": "Pink", "#e2434b": "Red", "#2f3a5c": "Navy", "#f3ede2": "Cream",
  "#7cf2ff": "Cyan", "#ff9d6c": "Peach", "#ffd23f": "Yellow", "#ffffff": "White",
};

/** What an old profile without these fields looks like (the original robot). */
export const LOOK_DEFAULTS = { build: "regular", head: 1, hat: "none", accessory: "none", eyes: "classic", tint: "none", sticker: "none", glow: null, blush: false } as const;

export function resolveLook(look: RobotLook = {}) {
  return {
    accent: look.accent,
    manager: look.manager,
    // a manager always wears the crown and a star on the antenna
    antennaTip: look.manager ? "star" as const : look.antennaTip ?? "ball",
    headphones: !!look.headphones,
    sticker: look.sticker ?? LOOK_DEFAULTS.sticker,
    build: look.build ?? LOOK_DEFAULTS.build,
    head: Math.min(1.15, Math.max(0.9, look.head ?? 1)),
    hat: look.manager ? "crown" as const : look.hat ?? LOOK_DEFAULTS.hat,
    accessory: look.accessory ?? LOOK_DEFAULTS.accessory,
    eyes: look.eyes ?? LOOK_DEFAULTS.eyes,
    tint: look.tint ?? LOOK_DEFAULTS.tint,
    glow: look.glow ?? null,
    blush: !!look.blush,
  };
}
export type FullLook = ReturnType<typeof resolveLook>;
export const hatInfo = (k: HatKind | undefined) => HATS.find((h) => h.id === k) ?? HATS[0];
export const accessoryInfo = (k: AccessoryKind | undefined) => ACCESSORIES.find((a) => a.id === k) ?? ACCESSORIES[0];

// ---- random looks -------------------------------------------------------------------------
/** Small seeded generator, so a robot's extras come from its id and stay the same every launch. */
export function seeded(key: string) {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickFrom = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];
const weighted = <T>(r: () => number, a: [T, number][]) => {
  let x = r() * a.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of a) if ((x -= w) <= 0) return v;
  return a[a.length - 1][0];
};
const open = <K extends string>(list: Opt<K>[], level: number) => list.filter((o) => o.id !== "none" && (o.unlock ?? 0) <= level).map((o) => o.id);

/** A varied random look. Most robots get a hat or an accessory, some get both, a few neither. */
export function randomLook(r: () => number = Math.random, level = 0): RobotLook {
  const hat = r() < 0.6 ? pickFrom(r, open(HATS, level)) : "none";
  const accessory = r() < (hat === "none" ? 0.62 : 0.4) ? pickFrom(r, open(ACCESSORIES, level)) : "none";
  return {
    accent: pickFrom(r, ACCENTS),
    antennaTip: weighted(r, [["ball", 3], ["star", 1], ["heart", 1], ["ring", 1]]),
    build: weighted(r, [["slim", 3], ["regular", 4.5], ["sturdy", 2.5]]),
    head: weighted(r, [[0.9, 1], [0.95, 2], [1, 3], [1.05, 2.5], [1.1, 1.5], [1.15, 1]]),
    hat, accessory,
    eyes: r() < 0.38 ? "classic" : pickFrom(r, open(EYES, level)),
    tint: r() < 0.3 ? "none" : pickFrom(r, open(TINTS, level)),
    sticker: r() < 0.4 ? "none" : pickFrom(r, open(STICKERS, level)),
    glow: r() < 0.8 ? null : pickFrom(r, GLOWS),
    blush: r() < 0.2,
  };
}

/** Fills only the fields an older profile is missing, from its id. */
export function migrateLook(look: RobotLook, id: string): RobotLook {
  const extra = randomLook(seeded(id + ":look"));
  const out: RobotLook = { ...look };
  for (const k of ["build", "head", "hat", "accessory", "eyes", "tint", "glow", "blush"] as const) if (out[k] === undefined) (out as any)[k] = extra[k];
  if (out.sticker === undefined) out.sticker = extra.sticker;
  return out;
}

// ---- colour -------------------------------------------------------------------------------
const hex = (c: string) => { const n = parseInt(c.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (c: string) => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** The brand shell shifted slightly toward a tint. Enough to tell robots apart, never enough to lose the brand. */
export function tintPalette<P extends { shell: string; shade: string; deep: string }>(p: P, tint: Tint | undefined): P {
  const t = TINTS.find((x) => x.id === tint)?.color;
  if (!t) return p;
  const dark = lum(p.shell) < 0.4;
  const k = dark ? 0.12 : tint === "graphite" ? 0.15 : 0.12;
  return { ...p, shell: mix(p.shell, t, k), shade: mix(p.shade, t, k * 1.3), deep: mix(p.deep, t, k * 1.4) };
}

/** Sets the colour variables a look needs on a robot root (call after the brand is painted). */
export function paintLookColors(el: Element, base: { shell: string; shade: string; deep: string; glow: string }, look: RobotLook) {
  const st = (el as HTMLElement | SVGElement).style;
  const p = tintPalette(base, look.tint);
  st.setProperty("--shell", p.shell); st.setProperty("--shade", p.shade); st.setProperty("--deep", p.deep);
  st.setProperty("--glow", look.glow || base.glow);
  st.setProperty("--acc", look.accent || "#ff9f5a");
  if (look.manager) st.setProperty("--mgr", look.manager.color); else st.removeProperty("--mgr");
  return look.glow || base.glow;
}

// ---- hats ---------------------------------------------------------------------------------
const INK = "#2b2f3d";
const hi = (d: string, w = 6, o = 0.35) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
const mirror = (svg: string, on: boolean) => (on ? `<g transform="translate(1120 0) scale(-1 1)">${svg}</g>` : svg);

function cap(brimNear: boolean, opening: boolean) {
  const crown = `<path d="M492 628 C490 590 522 570 560 570 C598 570 630 590 628 628 Z" fill="var(--acc)"/>
    <path d="M560 572 C590 574 622 592 628 628 L604 628 C602 600 586 582 560 572 Z" fill="#000" opacity="0.1"/>
    <path d="M560 571 L560 628" stroke="#000" stroke-opacity="0.12" stroke-width="2.5"/>
    ${hi("M508 606 C514 590 530 580 546 577", 5)}
    <circle cx="560" cy="572" r="5.5" fill="var(--acc)"/><circle cx="560" cy="572" r="5.5" fill="#000" opacity="0.18"/>`;
  const gap = opening ? `<path d="M536 628 C536 612 546 604 560 604 C574 604 584 612 584 628 Z" fill="var(--shell)"/><rect x="532" y="616" width="56" height="6" rx="3" fill="${INK}" opacity="0.55"/>` : "";
  if (brimNear) return `${crown}${gap}<path d="M494 622 C520 640 600 640 626 622 C624 646 596 654 560 654 C524 654 496 646 494 622 Z" fill="var(--acc)"/>
    <path d="M494 622 C520 640 600 640 626 622 C624 646 596 654 560 654 C524 654 496 646 494 622 Z" fill="#000" opacity="0.16"/>
    <path d="M500 626 C528 642 592 642 620 626" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="3" stroke-linecap="round"/>`;
  return `<ellipse cx="560" cy="574" rx="54" ry="15" fill="var(--acc)"/><ellipse cx="560" cy="574" rx="54" ry="15" fill="#000" opacity="0.22"/>${crown}${gap}`;
}

/** A hat, drawn over the head. `view` is which side of the robot we see. */
export function hatSvg(kind: HatKind | undefined, view: View = "back"): string {
  const front = view === "front";
  switch (kind) {
    case "beanie": {
      const ribs = Array.from({ length: 11 }, (_, i) => `<rect x="${497 + i * 12}" y="612" width="3" height="20" rx="1.5" fill="#000" opacity="0.08"/>`).join("");
      return `<path d="M490 628 C487 590 518 564 560 564 C602 564 633 590 630 628 Z" fill="var(--acc)"/>
        <path d="M566 565 C600 568 630 592 630 628 L606 628 C606 598 592 576 566 565 Z" fill="#000" opacity="0.1"/>
        ${hi("M506 604 C512 586 528 574 546 570", 6)}
        <rect x="483" y="606" width="154" height="30" rx="15" fill="var(--acc)"/><rect x="483" y="606" width="154" height="30" rx="15" fill="#000" opacity="0.13"/>${ribs}
        ${hi("M498 613 L560 611", 3.5, 0.28)}`;
    }
    case "cap": return cap(front, !front);
    case "capBack": return cap(!front, front);
    case "tophat":
      return `<ellipse cx="560" cy="606" rx="68" ry="12" fill="#1c1f29"/>
        <path d="M518 604 L520 536 C520 530 600 530 600 536 L602 604 C602 612 518 612 518 604 Z" fill="#2a2e3b"/>
        <rect x="518" y="584" width="84" height="15" fill="var(--acc)"/><rect x="518" y="584" width="84" height="15" fill="#000" opacity="0.12"/>
        <rect x="530" y="542" width="8" height="38" rx="4" fill="#fff" opacity="0.12"/>
        <ellipse cx="560" cy="535" rx="40" ry="8" fill="#3b4152"/>`;
    case "party": {
      const stripes = `<path d="M545 560 L575 572" stroke="#fff" stroke-opacity="0.55" stroke-width="7"/><path d="M533 588 L587 606" stroke="#fff" stroke-opacity="0.55" stroke-width="7"/>`;
      return `<g transform="rotate(${front ? 8 : -8} 560 610)"><path d="M520 610 L560 522 L600 610 Z" fill="var(--acc)"/>
        <clipPath id="lkp${front ? "f" : "b"}"><path d="M520 610 L560 522 L600 610 Z"/></clipPath><g clip-path="url(#lkp${front ? "f" : "b"})">${stripes}</g>
        <path d="M560 522 L600 610 L580 610 Z" fill="#000" opacity="0.1"/>
        <ellipse cx="560" cy="610" rx="41" ry="7" fill="#000" opacity="0.15"/>
        <circle cx="560" cy="520" r="10" fill="#fff5d8"/><circle cx="557" cy="517" r="3.5" fill="#fff"/></g>`;
    }
    case "headset": {
      const boom = front
        ? `<path d="M638 668 C640 694 618 704 594 702" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="590" cy="702" r="7" fill="var(--acc)"/>`
        : `<path d="M478 668 C472 684 476 698 486 706" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
      return `<path d="M484 646 C480 604 512 590 560 590 C608 590 640 604 636 646" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        ${boom}<g transform="${front ? "translate(1120 0) scale(-1 1)" : ""}"><rect x="469" y="638" width="24" height="38" rx="11" fill="${INK}"/><rect x="474" y="644" width="7" height="18" rx="3.5" fill="#fff" opacity="0.25"/></g>`;
    }
    case "crown": {
      const pts = "510,612 510,572 530,592 546,560 560,584 574,560 590,592 610,572 610,612";
      return `<g transform="rotate(${front ? -5 : 5} 560 600)"><polygon points="${pts}" fill="#ffcc3d" stroke="#ffcc3d" stroke-width="5" stroke-linejoin="round"/>
        <path d="M560 584 L574 560 L590 592 L610 572 L610 612 L560 612 Z" fill="#e0a21f" opacity="0.5"/>
        <rect x="508" y="598" width="104" height="16" rx="5" fill="#f2b52b"/>
        <circle cx="510" cy="570" r="4.5" fill="#ffe08a"/><circle cx="546" cy="558" r="4.5" fill="#ffe08a"/><circle cx="574" cy="558" r="4.5" fill="#ffe08a"/><circle cx="610" cy="570" r="4.5" fill="#ffe08a"/>
        <circle cx="560" cy="606" r="5.5" fill="var(--mgr, #ff6f91)"/><circle cx="534" cy="606" r="4" fill="#4fb6ff"/><circle cx="586" cy="606" r="4" fill="#4ff0a0"/>
        ${hi("M518 606 L526 606", 3, 0.6)}</g>`;
    }
    case "beret":
      return mirror(`<g transform="rotate(-10 556 602)">
        <path d="M486 606 C480 584 508 566 552 566 C600 566 630 580 628 600 C626 616 596 624 556 624 C516 624 490 618 486 606 Z" fill="var(--acc)"/>
        <path d="M490 606 C506 616 600 620 626 602 C622 616 596 626 556 626 C518 626 494 618 490 606 Z" fill="#000" opacity="0.22"/>
        <path d="M600 572 C618 580 628 590 628 600 C626 610 616 616 600 619 C606 604 606 586 600 572 Z" fill="#000" opacity="0.08"/>
        ${hi("M502 590 C512 578 534 571 560 571", 5, 0.3)}
        <rect x="548" y="556" width="7" height="12" rx="3.5" fill="var(--acc)"/><rect x="548" y="556" width="7" height="12" rx="3.5" fill="#000" opacity="0.25"/></g>`, front);
    case "propeller": {
      const seg = (d: string, c: string) => `<path d="${d}" fill="${c}"/>`;
      return `${seg("M496 628 C494 594 524 574 560 574 L560 628 Z", "#ff6f91")}${seg("M560 574 C596 574 626 594 624 628 L560 628 Z", "#4fb6ff")}
        ${seg("M528 628 C528 596 542 578 560 574 C578 578 592 596 592 628 Z", "#ffd23f")}
        <path d="M560 576 C592 578 622 596 624 628 L604 628 C602 602 588 584 560 576 Z" fill="#000" opacity="0.08"/>
        <rect x="492" y="618" width="136" height="14" rx="7" fill="#4ff0a0"/><rect x="492" y="618" width="136" height="14" rx="7" fill="#000" opacity="0.12"/>
        <rect x="556.5" y="550" width="7" height="26" rx="3.5" fill="${INK}"/>
        <g transform="translate(560 552)"><g data-spin="1"><ellipse cx="-20" cy="0" rx="21" ry="5.5" fill="#ff6f91"/><ellipse cx="20" cy="0" rx="21" ry="5.5" fill="#4fb6ff"/></g></g>
        <circle cx="560" cy="552" r="6" fill="var(--glow)"/>`;
    }
    case "chef":
      return `<rect x="516" y="560" width="88" height="48" rx="8" fill="#f4f2ea"/>
        <circle cx="530" cy="558" r="24" fill="#fbfaf5"/><circle cx="590" cy="558" r="24" fill="#f1efe6"/><circle cx="560" cy="546" r="29" fill="#fdfcf8"/>
        <path d="M582 534 C600 538 612 552 612 566 C606 574 596 578 586 576 C592 562 590 546 582 534 Z" fill="#000" opacity="0.06"/>
        ${hi("M538 532 C546 524 556 521 566 522", 5, 0.8)}
        <rect x="510" y="590" width="100" height="22" rx="8" fill="#eceae1"/><path d="M526 592 L526 610 M546 592 L546 610 M566 592 L566 610 M586 592 L586 610" stroke="#000" stroke-opacity="0.07" stroke-width="3"/>`;
    case "wizard": {
      const star = (x: number, y: number, s: number) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#ffd23f"/>`;
      return mirror(`<ellipse cx="560" cy="608" rx="70" ry="13" fill="#372d7d"/>
        <path d="M514 608 C530 572 546 528 566 496 C574 482 590 478 600 486 C586 490 580 504 582 524 C586 560 598 588 606 608 Z" fill="#4b3fa4"/>
        <path d="M566 496 C574 482 590 478 600 486 C586 490 580 504 582 524 C586 560 598 588 606 608 L590 608 C580 574 572 540 566 496 Z" fill="#000" opacity="0.12"/>
        <rect x="514" y="592" width="92" height="12" fill="#ffd23f" opacity="0.85"/>
        ${star(544, 566, 1.2)}${star(570, 540, 0.9)}${star(574, 578, 0.7)}<circle cx="601" cy="486" r="5" fill="#ffd23f"/>`, front);
    }
    case "flowers": {
      const ring: string[] = [], flowers: string[] = [];
      const cols = ["#ff8fb1", "#ffd23f", "#ffffff", "#c9a2ff", "#ff9f5a", "#8fe0ff", "#ff8fb1"];
      for (let i = 0; i < 14; i++) {
        const a = Math.PI + (i / 13) * Math.PI, x = 560 + Math.cos(a) * 64, y = 606 + Math.sin(a) * 20;
        ring.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="5" transform="rotate(${((a * 180) / Math.PI + 90 + (i % 2 ? 30 : -30)).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${i % 2 ? "#5cbf6e" : "#47a65a"}"/>`);
      }
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + ((i + 0.5) / 7) * Math.PI, x = 560 + Math.cos(a) * 62, y = 606 + Math.sin(a) * 19;
        const petals = Array.from({ length: 5 }, (_, k) => { const b = (k / 5) * Math.PI * 2; return `<circle cx="${(x + Math.cos(b) * 5.5).toFixed(1)}" cy="${(y + Math.sin(b) * 5.5).toFixed(1)}" r="5" fill="${cols[i]}"/>`; }).join("");
        flowers.push(`${petals}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${cols[i] === "#ffd23f" ? "#ff9f5a" : "#ffd23f"}"/>`);
      }
      return ring.join("") + flowers.join("");
    }
    case "santa":
      return mirror(`<path d="M498 612 C496 572 526 552 564 554 C604 556 626 580 640 614 C646 628 650 640 652 648 L636 646 C628 626 616 610 600 606 Z" fill="#e2434b"/>
        <path d="M600 562 C620 574 632 592 640 614 C646 628 650 640 652 648 L636 646 C628 626 616 610 600 606 Z" fill="#000" opacity="0.12"/>
        ${hi("M514 590 C522 574 540 564 558 562", 5, 0.3)}
        <rect x="486" y="598" width="148" height="24" rx="12" fill="#fbfaf5"/><path d="M500 604 L620 604" stroke="#000" stroke-opacity="0.05" stroke-width="5" stroke-linecap="round"/>
        <circle cx="648" cy="652" r="12" fill="#fbfaf5"/><circle cx="645" cy="648" r="4" fill="#fff"/>`, front);
    case "cowboy":
      return `<ellipse cx="560" cy="604" rx="86" ry="17" fill="#99602f"/>
        <path d="M478 600 C478 616 520 624 560 624 C600 624 642 616 642 600 C636 612 600 618 560 618 C520 618 484 612 478 600 Z" fill="#000" opacity="0.15"/>
        <path d="M520 606 C516 584 518 562 534 556 C544 552 552 560 560 560 C568 560 576 552 586 556 C602 562 604 584 600 606 Z" fill="#b5743d"/>
        <path d="M560 560 C568 560 576 552 586 556 C602 562 604 584 600 606 L584 606 C586 586 580 568 560 560 Z" fill="#000" opacity="0.1"/>
        <path d="M519 592 C540 598 580 598 601 592 L601 602 C580 608 540 608 519 602 Z" fill="#5a3a22"/>
        ${hi("M530 570 C534 562 540 560 546 561", 4, 0.3)}`;
    case "catEars": {
      const ear = (x: number, flip: number) => `<g transform="translate(${x} 604) scale(${flip} 1)">
        <path d="M-26 6 C-28 -14 -24 -34 -16 -46 C-6 -38 6 -22 14 -6 Z" fill="var(--shell)"/>
        <path d="M-20 2 C-21 -12 -18 -26 -14 -34 C-8 -28 0 -16 5 -6 Z" fill="var(--acc)"/>
        <path d="M-26 6 C-28 -14 -24 -34 -16 -46 L-20 -10 Z" fill="#fff" opacity="0.18"/></g>`;
      return ear(524, 1) + ear(596, -1);
    }
    case "bow":
      return mirror(`<g transform="translate(516 606) rotate(-18)">
        <path d="M0 0 C-12 -20 -34 -22 -36 -6 C-38 10 -16 14 0 0 Z" fill="var(--acc)"/><path d="M0 0 C12 -20 34 -22 36 -6 C38 10 16 14 0 0 Z" fill="var(--acc)"/>
        <path d="M0 0 C12 -20 34 -22 36 -6 C38 10 16 14 0 0 Z" fill="#000" opacity="0.12"/>
        <path d="M-6 4 L-14 22 L-4 18 Z M6 4 L14 22 L4 18 Z" fill="var(--acc)"/>
        <ellipse cx="0" cy="0" rx="8" ry="9" fill="var(--acc)"/><ellipse cx="0" cy="0" rx="8" ry="9" fill="#000" opacity="0.18"/>
        ${hi("M-28 -10 C-24 -14 -18 -14 -14 -11", 3.5, 0.45)}</g>`, front);
    default:
      return "";
  }
}

// ---- accessories --------------------------------------------------------------------------
// `under` draws behind the torso shell, `over` on top of it (shoulder caps included).
// `pack` sits on the back below the model plate, so the plate reads like a patch on it.
export function accessorySvg(kind: AccessoryKind | undefined, view: View = "back"): { under: string; pack: string; over: string } {
  const front = view === "front";
  const none = { under: "", pack: "", over: "" };
  const collar = `<path d="M524 736 C536 746 584 746 596 736 L598 744 C584 754 536 754 522 744 Z" fill="${INK}" opacity="0.7"/>`;
  switch (kind) {
    case "scarf": {
      const stripes = (x0: number, y0: number, h: number) => [0, 1, 2].map((i) => `<rect x="${x0}" y="${y0 + 8 + i * 13}" width="18" height="4" fill="#fff" opacity="0.55"/>`).join("") + `<rect x="${x0}" y="${y0 + h - 4}" width="18" height="4" fill="#000" opacity="0.15"/>`;
      const band = `<rect x="514" y="726" width="92" height="26" rx="13" fill="var(--acc)"/><rect x="514" y="740" width="92" height="12" rx="6" fill="#000" opacity="0.12"/>${hi("M526 732 L594 732", 3.5, 0.35)}`;
      const tail = (x: number, y: number, rot: number) => `<g data-sway="1" data-px="${x + 9}" data-py="${y}" data-k="${front ? 0.6 : 1}"><g transform="rotate(${rot} ${x + 9} ${y})">
        <rect x="${x}" y="${y}" width="18" height="52" rx="6" fill="var(--acc)"/>${stripes(x, y, 52)}
        <path d="M${x + 2} ${y + 52} l0 6 M${x + 7} ${y + 52} l0 6 M${x + 12} ${y + 52} l0 6 M${x + 16} ${y + 52} l0 6" stroke="var(--acc)" stroke-width="2.5" stroke-linecap="round"/></g></g>`;
      return front
        ? { under: "", pack: "", over: `${band}${tail(526, 742, 6)}${tail(540, 744, -4)}` }
        : { under: "", pack: "", over: `${tail(574, 742, -8)}${band}` };
    }
    case "bowtie": {
      if (!front) return { ...none, over: collar };
      return { ...none, over: `${collar}<path d="M560 750 L536 738 C530 736 528 762 536 762 Z" fill="var(--acc)"/><path d="M560 750 L584 738 C590 736 592 762 584 762 Z" fill="var(--acc)"/>
        <path d="M560 750 L584 738 C590 736 592 762 584 762 Z" fill="#000" opacity="0.14"/><rect x="553" y="742" width="14" height="16" rx="5" fill="var(--acc)"/><rect x="553" y="742" width="14" height="16" rx="5" fill="#000" opacity="0.2"/>` };
    }
    case "tie": {
      if (!front) return { ...none, over: collar };
      return { ...none, over: `${collar}<path d="M550 742 L570 742 L566 756 L554 756 Z" fill="var(--acc)"/><path d="M550 742 L570 742 L566 756 L554 756 Z" fill="#000" opacity="0.18"/>
        <path d="M554 756 L566 756 L574 800 L560 814 L546 800 Z" fill="var(--acc)"/><path d="M560 756 L566 756 L574 800 L560 814 Z" fill="#000" opacity="0.12"/>
        <path d="M549 790 L571 776" stroke="#fff" stroke-opacity="0.35" stroke-width="3.5"/><path d="M548 802 L573 787" stroke="#fff" stroke-opacity="0.35" stroke-width="3.5"/>` };
    }
    case "lanyard": {
      if (!front) return { ...none, over: `<path d="M526 736 C540 752 580 752 594 736" fill="none" stroke="var(--acc)" stroke-width="4.5" stroke-linecap="round"/>` };
      return { ...none, over: `<path d="M528 738 L544 784 M592 738 L552 784" fill="none" stroke="var(--acc)" stroke-width="4.5" stroke-linecap="round"/>
        <rect x="532" y="780" width="32" height="36" rx="5" fill="#fbfaf5"/><rect x="544" y="776" width="8" height="8" rx="2" fill="${INK}" opacity="0.6"/>
        <rect x="538" y="788" width="12" height="12" rx="3" fill="var(--glow)" opacity="0.8"/><rect x="538" y="804" width="20" height="3" rx="1.5" fill="${INK}" opacity="0.35"/><rect x="553" y="790" width="6" height="3" rx="1.5" fill="${INK}" opacity="0.35"/>` };
    }
    case "flower": {
      const x = front ? 512 : 608, y = 742;
      const petals = Array.from({ length: 6 }, (_, k) => { const b = (k / 6) * Math.PI * 2; return `<ellipse cx="${(x + Math.cos(b) * 7).toFixed(1)}" cy="${(y + Math.sin(b) * 7).toFixed(1)}" rx="6" ry="4.5" transform="rotate(${((b * 180) / Math.PI).toFixed(0)} ${(x + Math.cos(b) * 7).toFixed(1)} ${(y + Math.sin(b) * 7).toFixed(1)})" fill="#ff8fb1"/>`; }).join("");
      return { ...none, over: `<path d="M${x - 4} ${y + 6} L${x - 14} ${y + 16}" stroke="#47a65a" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="${x - 13}" cy="${y + 10}" rx="6" ry="3" fill="#5cbf6e" transform="rotate(-40 ${x - 13} ${y + 10})"/>${petals}<circle cx="${x}" cy="${y}" r="5" fill="#ffd23f"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.6" fill="#fff" opacity="0.8"/>` };
    }
    case "bandana": {
      const dots = (pts: [number, number][]) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff" opacity="0.7"/>`).join("");
      if (!front) return { ...none, over: `<path d="M522 734 C536 748 584 748 598 734 L598 744 C584 756 536 756 522 744 Z" fill="var(--acc)"/>
        <g data-sway="1" data-px="560" data-py="746" data-k="0.7"><path d="M556 744 L544 766 L554 764 Z M564 744 L576 766 L566 764 Z" fill="var(--acc)"/><circle cx="560" cy="746" r="6" fill="var(--acc)"/><circle cx="560" cy="746" r="6" fill="#000" opacity="0.15"/></g>` };
      return { ...none, over: `<path d="M522 736 C536 748 584 748 598 736 L564 792 C562 796 558 796 556 792 Z" fill="var(--acc)"/>
        <path d="M560 744 L598 736 L564 792 C562 796 560 796 560 794 Z" fill="#000" opacity="0.1"/>${dots([[540, 750], [558, 758], [576, 750], [550, 772], [568, 772], [560, 786]])}` };
    }
    case "backpack": {
      if (front) return { ...none, over: `<path d="M530 734 C528 760 532 790 536 812 M590 734 C592 760 588 790 584 812" fill="none" stroke="var(--acc)" stroke-width="8" stroke-linecap="round"/>
        <path d="M530 734 C528 760 532 790 536 812 M590 734 C592 760 588 790 584 812" fill="none" stroke="#000" stroke-opacity="0.15" stroke-width="8" stroke-linecap="round"/>
        <rect x="527" y="776" width="13" height="9" rx="2.5" fill="${INK}" opacity="0.5"/><rect x="580" y="776" width="13" height="9" rx="2.5" fill="${INK}" opacity="0.5"/>` };
      return { ...none, pack: `<path d="M546 744 C546 732 574 732 574 744" fill="none" stroke="${INK}" stroke-width="4.5" stroke-opacity="0.6"/>
        <rect x="522" y="742" width="76" height="66" rx="20" fill="var(--acc)"/><path d="M574 742 L578 742 C590 742 598 752 598 764 L598 788 C598 800 590 808 578 808 L574 808 Z" fill="#000" opacity="0.1"/>
        ${hi("M532 756 C534 750 540 747 548 747", 4, 0.35)}
        <rect x="532" y="768" width="56" height="34" rx="11" fill="#000" opacity="0.12"/><rect x="551" y="765" width="18" height="5" rx="2.5" fill="${INK}" opacity="0.45"/>`,
        over: `<rect x="522" y="730" width="12" height="18" rx="5" fill="var(--acc)"/><rect x="586" y="730" width="12" height="18" rx="5" fill="var(--acc)"/>` };
    }
    case "jetpack": {
      if (front) return { ...none, over: `<path d="M532 734 L540 792 M588 734 L580 792" stroke="#7b849a" stroke-width="7" stroke-linecap="round"/><circle cx="540" cy="792" r="5" fill="var(--acc)"/><circle cx="580" cy="792" r="5" fill="var(--acc)"/>` };
      const tank = (x: number) => `<rect x="${x}" y="738" width="32" height="70" rx="16" fill="#aab2c4"/><rect x="${x + 20}" y="742" width="9" height="62" rx="4.5" fill="#000" opacity="0.12"/>
        <rect x="${x + 6}" y="746" width="6" height="40" rx="3" fill="#fff" opacity="0.45"/><rect x="${x}" y="738" width="32" height="12" rx="6" fill="var(--acc)"/>`;
      return { ...none, pack: `<rect x="548" y="748" width="24" height="44" rx="6" fill="#7b849a"/>${tank(518)}${tank(570)}<circle cx="560" cy="758" r="4" fill="var(--glow)"/>` };
    }
    case "cape": {
      if (front) return {
        under: `<g data-sway="1" data-px="560" data-py="736" data-k="0.5"><path d="M500 736 C478 772 466 808 458 846 L662 846 C654 808 642 772 620 736 Z" fill="var(--acc)"/><path d="M500 736 C478 772 466 808 458 846 L662 846 C654 808 642 772 620 736 Z" fill="#000" opacity="0.3"/></g>`,
        pack: "", over: `<circle cx="526" cy="740" r="6" fill="#ffcc3d"/><circle cx="594" cy="740" r="6" fill="#ffcc3d"/><path d="M532 740 Q560 750 588 740" fill="none" stroke="#ffcc3d" stroke-width="2.5"/>` };
      return { under: "", over: `<path d="M512 734 C536 742 584 742 608 734 L606 746 C584 754 536 754 514 746 Z" fill="var(--acc)"/><path d="M512 734 C536 742 584 742 608 734 L606 746 C584 754 536 754 514 746 Z" fill="#000" opacity="0.2"/>`,
        pack: `<g data-sway="1" data-px="560" data-py="738" data-k="1"><path d="M512 738 C536 746 584 746 608 738 C622 772 630 806 636 842 C612 850 592 838 572 846 C552 838 532 850 486 842 C492 806 500 772 512 738 Z" fill="var(--acc)"/>
          <path d="M572 744 C584 744 596 742 608 738 C622 772 630 806 636 842 C620 846 606 842 594 842 C590 806 584 772 572 744 Z" fill="#000" opacity="0.12"/>
          ${hi("M522 756 C516 780 512 800 510 820", 5, 0.25)}</g>` };
    }
    default:
      return none;
  }
}

/**
 * What marks a manager apart on the body: gold epaulettes on both shoulders, and from the front a
 * badge on the chest, a shield in the project's colour with its logo (or monogram) on a white disc.
 * `skipFront` drops the user's own tie or lanyard from the chest so the two do not pile up.
 */
export function managerSvg(m: ManagerMark, view: View = "back"): { under: string; pack: string; over: string } {
  const front = view === "front";
  const epaulette = (x: number) => `<g><rect x="${x - 15}" y="728" width="30" height="9" rx="4.5" fill="#ffcc3d"/><rect x="${x - 15}" y="733" width="30" height="4" rx="2" fill="#e0a21f"/>
    ${[-10, -3.5, 3.5, 10].map((dx) => `<rect x="${x + dx - 1.2}" y="736" width="2.4" height="8" rx="1.2" fill="#ffcc3d"/>`).join("")}${hi(`M${x - 11} 731 L${x + 9} 731`, 2, 0.55)}</g>`;
  const wings = `${epaulette(510)}${epaulette(610)}`;
  if (!front) return { under: "", pack: "", over: wings };
  const mono = m.mono.slice(0, 2).toUpperCase();
  // up on the chest, where the chair does not hide it when the robot faces us
  const shield = `<path d="M560 760 L588 766 C588 786 578 800 560 808 C542 800 532 786 532 766 Z" fill="#ffcc3d"/>
    <path d="M560 764 L584 769 C584 785 575 797 560 804 C545 797 536 785 536 769 Z" fill="${m.color}"/>
    <circle cx="560" cy="781" r="10.5" fill="#fff"/>
    ${m.logo ? `<image href="${m.logo}" x="552" y="773" width="16" height="16" preserveAspectRatio="xMidYMid meet"/>` : `<text x="560" y="785.5" text-anchor="middle" font-size="11" font-weight="800" font-family="var(--font, sans-serif)" fill="${m.color}">${mono}</text>`}
    ${hi("M541 770 L556 767", 2, 0.4)}`;
  return { under: "", pack: "", over: `${wings}${shield}` };
}

// ---- eyes ---------------------------------------------------------------------------------
/** Resting eyes for an eye style, or null when the expression keeps its own shape (eyesSvg). */
export function styledEyes(style: EyeStyle | undefined, e: Expression, xs: number[] = [540, 580], cy = 657): string | null {
  if (!style || style === "classic") return null;
  if (e !== "neutral" && !(style === "hearts" && (e === "happy" || e === "focus")) && !(e === "focus" && style !== "visor")) return null;
  const f = `fill="var(--glow)"`;
  const s = `fill="none" stroke="var(--glow)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  const squint = e === "focus" ? 0.62 : 1;
  if (style === "visor") {
    const x0 = Math.min(...xs) - 18, x1 = Math.max(...xs) + 18;
    return `<rect x="${x0}" y="${cy - 7 * squint}" width="${x1 - x0}" height="${14 * squint}" rx="${7 * squint}" ${f}/><rect x="${x0 + 8}" y="${cy - 3}" width="16" height="3" rx="1.5" fill="#fff" opacity="0.5"/>`;
  }
  return xs.map((cx) => {
    switch (style) {
      case "dots": return `<circle cx="${cx}" cy="${cy}" r="${8 * (e === "focus" ? 0.8 : 1)}" ${f}/>`;
      case "round": return `<circle cx="${cx}" cy="${cy}" r="12.5" ${f}/><circle cx="${cx - 4}" cy="${cy - 4.5}" r="4" fill="#fff" opacity="0.9"/><circle cx="${cx + 4.5}" cy="${cy + 4}" r="1.8" fill="#fff" opacity="0.8"/>`;
      case "happy": return `<path d="M${cx - 9} ${cy + 4} Q${cx} ${cy - 12} ${cx + 9} ${cy + 4}" ${s}/>`;
      case "pixel": {
        const p = 7, g = 1.6, o = p + g;
        return [[-1, -1], [0, -1], [-1, 0], [0, 0], [-1, 1], [0, 1]].map(([i, j]) => `<rect x="${cx + i * o + g / 2}" y="${cy + j * o - p / 2}" width="${p}" height="${p}" rx="1" ${f}/>`).join("");
      }
      case "hearts": return `<path d="M${cx} ${cy + 11} C${cx - 18} ${cy} ${cx - 12} ${cy - 15} ${cx} ${cy - 6} C${cx + 12} ${cy - 15} ${cx + 18} ${cy} ${cx} ${cy + 11} Z" ${f}/>`;
      case "sleepy": return `<path d="M${cx - 9} ${cy - 1} L${cx + 9} ${cy - 1} L${cx + 9} ${cy + 3} Q${cx + 9} ${cy + 11} ${cx} ${cy + 11} Q${cx - 9} ${cy + 11} ${cx - 9} ${cy + 3} Z" ${f}/><path d="M${cx - 11} ${cy - 5} L${cx + 11} ${cy - 5}" stroke="var(--glow)" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>`;
      default: return "";
    }
  }).join("");
}

/** Pink cheeks under the visor (front view). */
export const blushSvg = () => `<ellipse cx="520" cy="699" rx="10" ry="5" fill="#ff8fa8" opacity="0.6"/><ellipse cx="600" cy="699" rx="10" ry="5" fill="#ff8fa8" opacity="0.6"/>`;

// ---- stickers -----------------------------------------------------------------------------
/** A small die-cut decal, centered on 0,0 (about 26 v0 units across). */
export function stickerSvg(kind: StickerKind | undefined) {
  const W = "#fbfbfb";
  switch (kind) {
    case "bolt": return `<rect x="-11" y="-13" width="22" height="26" rx="7" fill="${W}"/><path d="M2 -10 L-6 2 L0 2 L-3 10 L6 -3 L0 -3 Z" fill="#ffc531"/>`;
    case "star": return `<circle r="12" fill="${W}"/><polygon points="0,-8.5 2.4,-2.8 8.5,-2.6 3.8,1.4 5.3,7.4 0,4 -5.3,7.4 -3.8,1.4 -8.5,-2.6 -2.4,-2.8" fill="#ff9f5a" stroke="#ff9f5a" stroke-width="1.5" stroke-linejoin="round"/>`;
    case "heart": return `<path d="M0 12 C-20 0 -14 -17 0 -8 C14 -17 20 0 0 12 Z" fill="${W}"/><path d="M0 7.5 C-12 0 -8 -10 0 -4.5 C8 -10 12 0 0 7.5 Z" fill="#ff6f91"/>`;
    case "smile": return `<circle r="12" fill="${W}"/><circle r="9" fill="#ffd23f"/><circle cx="-3" cy="-2" r="1.4" fill="#3a3f4f"/><circle cx="3" cy="-2" r="1.4" fill="#3a3f4f"/><path d="M-4 2 Q0 6 4 2" stroke="#3a3f4f" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case "flower": {
      const back = Array.from({ length: 5 }, (_, k) => { const b = (k / 5) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(Math.cos(b) * 6.5).toFixed(1)}" cy="${(Math.sin(b) * 6.5).toFixed(1)}" r="7" fill="${W}"/>`; }).join("");
      const pet = Array.from({ length: 5 }, (_, k) => { const b = (k / 5) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(Math.cos(b) * 6.5).toFixed(1)}" cy="${(Math.sin(b) * 6.5).toFixed(1)}" r="4.6" fill="#b07cff"/>`; }).join("");
      return `${back}${pet}<circle r="3.6" fill="#ffd23f"/>`;
    }
    case "moon": return `<circle r="12" fill="#2f3a5c"/><path d="M3 -8 A8.5 8.5 0 1 0 6 6 A7 7 0 1 1 3 -8 Z" fill="#ffd27a"/><circle cx="6" cy="-5" r="1.2" fill="#fff"/><circle cx="-6" cy="7" r="0.9" fill="#fff"/>`;
    case "rainbow": return `<path d="M-14 6 A14 14 0 0 1 14 6 L14 9 L-14 9 Z" fill="${W}"/>${["#ff6f91", "#ffd23f", "#4ff0a0", "#4fb6ff"].map((c, i) => `<path d="M${-11.5 + i * 2.6} 6 A${11.5 - i * 2.6} ${11.5 - i * 2.6} 0 0 1 ${11.5 - i * 2.6} 6" fill="none" stroke="${c}" stroke-width="2.6"/>`).join("")}`;
    case "planet": return `<circle r="12" fill="${W}"/><circle r="7.5" fill="#b07cff"/><path d="M-3 -6 A7.5 7.5 0 0 1 6 -3" stroke="#fff" stroke-opacity="0.5" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse rx="12" ry="3.4" transform="rotate(-18)" fill="none" stroke="#ffd23f" stroke-width="2.4"/>`;
    case "ghost": return `<path d="M-11 12 L-11 -1 A11 11 0 0 1 11 -1 L11 12 L6 9 L0 13 L-6 9 Z" fill="${W}"/><path d="M-8 9 L-8 -1 A8 8 0 0 1 8 -1 L8 9 L4 7 L0 10 L-4 7 Z" fill="#dfe4f5"/><circle cx="-3" cy="-1" r="1.8" fill="#3a3f4f"/><circle cx="3" cy="-1" r="1.8" fill="#3a3f4f"/>`;
    case "cat": return `<path d="M-12 -12 L-5 -8 L5 -8 L12 -12 L12 4 A12 9 0 0 1 -12 4 Z" fill="${W}"/><path d="M-9 -8 L-4 -5.5 L4 -5.5 L9 -8 L9 3 A9 7 0 0 1 -9 3 Z" fill="#ff9f5a"/><circle cx="-3.5" cy="-0.5" r="1.4" fill="#3a3f4f"/><circle cx="3.5" cy="-0.5" r="1.4" fill="#3a3f4f"/><path d="M-1.5 3 L1.5 3 L0 4.6 Z" fill="#ff6f91"/>`;
    case "pizza": return `<path d="M0 13 L-13 -9 Q0 -15 13 -9 Z" fill="${W}" stroke="${W}" stroke-width="3" stroke-linejoin="round"/><path d="M0 10 L-10 -7 Q0 -11 10 -7 Z" fill="#ffd27a"/><path d="M-10 -7 Q0 -11 10 -7" fill="none" stroke="#e0a05a" stroke-width="3"/><circle cx="-2" cy="-3" r="2.2" fill="#e2434b"/><circle cx="3" cy="2" r="2" fill="#e2434b"/><circle cx="-1" cy="5" r="1.4" fill="#e2434b"/>`;
    default: return "";
  }
}

// ---- motion -------------------------------------------------------------------------------
/** Elements of a painted look that move every frame: swaying fabric and spinning propellers. */
export type LookMotion = { sway: SVGElement[]; spin: SVGElement[] };
export function lookMotion(root: Element): LookMotion {
  return { sway: [...root.querySelectorAll<SVGElement>("[data-sway]")], spin: [...root.querySelectorAll<SVGElement>("[data-spin]")] };
}
/** `sway` is a small signed number (about -1..1) from body motion; `t` is milliseconds. */
export function stepLookMotion(m: LookMotion, t: number, sway: number) {
  for (const el of m.sway) {
    const k = Number(el.dataset.k || 1), a = (Math.sin(t * 0.0021 + k * 2) * 2.2 + sway * 9) * k;
    el.setAttribute("transform", `rotate(${a.toFixed(2)} ${el.dataset.px} ${el.dataset.py})`);
  }
  for (const el of m.spin) el.setAttribute("transform", `scale(${Math.cos(t * 0.018).toFixed(3)} 1)`);
}

// ---- portraits ----------------------------------------------------------------------------
export type PortraitPalette = { shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; src: string | null; mode: "mask" | "image" | "chip" };
let pseq = 0;

/** The accessory layers plus a manager's marks; on the chest a manager's badge replaces the user's tie, bow tie or lanyard. */
export function withManager(acc: { under: string; pack: string; over: string }, m: ManagerMark | null | undefined, kind: AccessoryKind | undefined, view: View) {
  if (!m) return acc;
  const mk = managerSvg(m, view);
  const chestItem = view === "front" && (kind === "tie" || kind === "bowtie" || kind === "lanyard");
  return { under: acc.under + mk.under, pack: acc.pack + mk.pack, over: (chestItem ? "" : acc.over) + mk.over };
}

/** A flat front portrait (head, hat, eyes; with `bust` also shoulders and accessory) for cards and option tiles. */
export function portraitSvg(look: RobotLook, base: PortraitPalette, o: { size?: number; bust?: boolean; view?: View; cls?: string; label?: string } = {}) {
  const L = resolveLook(look), view = o.view ?? "front", id = `lkp${++pseq}`;
  const p = tintPalette(base, L.tint), glow = L.glow || base.glow, acc = L.accent || "#ff9f5a";
  const hat = hatInfo(L.hat), b = BUILD_SHAPE[L.build];
  const hs = L.head;
  const tipY = 566 - (hat.antenna === "lift" ? hat.lift ?? 0 : 0);
  const antenna = hat.antenna === "hide" ? "" : `<rect x="557" y="${tipY + 4}" width="6" height="${610 - tipY - 4}" rx="3" fill="var(--deep)"/><circle cx="560" cy="${tipY}" r="9" fill="var(--glow)"/><circle cx="557" cy="${tipY - 3}" r="3.2" fill="#fff" opacity="0.8"/>`;
  const logo = view === "front"
    ? (base.src ? (base.mode === "mask"
        ? `<mask id="${id}m" maskContentUnits="userSpaceOnUse"><image href="${base.src}" x="551" y="606" width="18" height="18"/></mask><rect x="551" y="606" width="18" height="18" fill="var(--logo)" mask="url(#${id}m)" opacity="0.8"/>`
        : `<image href="${base.src}" x="551" y="606" width="18" height="18" opacity="0.75"/>`)
      : `<rect x="553" y="608" width="14" height="14" rx="4" fill="var(--logo)" opacity="0.8"/>`)
    : (base.src ? (base.mode === "mask"
        ? `<mask id="${id}m" maskContentUnits="userSpaceOnUse"><image href="${base.src}" x="536" y="630" width="48" height="49"/></mask><rect x="536" y="630" width="48" height="49" fill="var(--logo)" mask="url(#${id}m)"/>`
        : `<image href="${base.src}" x="538" y="632" width="44" height="44" opacity="0.9"/>`)
      : `<rect x="542" y="637" width="36" height="36" rx="10" fill="var(--logo)"/>`);
  const face = view === "front"
    ? `<rect x="506" y="626" width="108" height="62" rx="28" fill="var(--visor)"/>
       <g>${styledEyes(L.eyes, "neutral") ?? `<rect x="532" y="644" width="16" height="26" rx="8" fill="var(--glow)"/><rect x="572" y="644" width="16" height="26" rx="8" fill="var(--glow)"/>`}</g>
       ${L.blush ? blushSvg() : ""}${logo}`
    : `${logo}${L.sticker !== "none" ? `<g transform="translate(606 692) rotate(-14)">${stickerSvg(L.sticker)}</g>` : ""}`;
  const head = `<g transform="translate(560 715) scale(${hs}) translate(-560 -715)">
    ${hat.antenna === "through" ? "" : antenna}
    <circle cx="486" cy="656" r="17" fill="${acc}"/><circle cx="${view === "front" ? 486 : 484}" cy="654" r="10" fill="var(--shade)"/>
    <circle cx="634" cy="656" r="17" fill="${acc}"/><circle cx="636" cy="654" r="10" fill="var(--shade)"/>
    <rect x="490" y="600" width="140" height="118" rx="44" fill="var(--shade)"/><rect x="490" y="600" width="140" height="106" rx="44" fill="var(--shell)"/>
    <path d="M512 618 C530 606 560 604 586 608" stroke="#fff" stroke-opacity="0.5" stroke-width="7" stroke-linecap="round" fill="none"/>
    ${face}${hatSvg(L.hat, view)}${hat.antenna === "through" ? antenna : ""}</g>`;
  let body = "";
  if (o.bust) {
    const acc2 = withManager(accessorySvg(L.accessory, view), L.manager, L.accessory, view);
    const sx = `translate(560 0) scale(${b.kx} 1) translate(-560 0)`;
    const shoulder = (x: number) => `<circle cx="${x}" cy="747" r="18" fill="${acc}"/><circle cx="${x}" cy="749" r="15.5" fill="var(--shade)"/><circle cx="${x - 3}" cy="744.5" r="11" fill="var(--shell)"/>`;
    body = `<rect x="547" y="700" width="26" height="42" rx="9" fill="var(--deep)"/>
      <g transform="${sx}">${acc2.under}
        <path d="M503 752 C503 735 517 727 534 727 L586 727 C603 727 617 735 617 752 C617 786 607 812 601 838 L519 838 C513 812 503 786 503 752 Z" fill="var(--shade)"/>
        <path d="M509 754 C509 740 520 733 535 733 L583 733 C596 733 606 740 606 754 C606 783 597 807 592 830 L527 830 C522 807 509 783 509 754 Z" fill="var(--shell)"/>
        ${view === "front" ? `<rect x="539" y="756" width="42" height="30" rx="10" fill="var(--shade)"/><circle cx="560" cy="771" r="5" fill="var(--glow)"/>` : acc2.pack}</g>
      ${shoulder(560 - b.shoulder)}${shoulder(560 + b.shoulder)}
      <g transform="${sx}">${view === "front" ? acc2.pack : ""}${acc2.over}</g>`;
  }
  const vb = o.bust ? "448 478 224 372" : "452 486 216 240";
  const size = o.size ?? 56;
  const [w, h] = o.bust ? [size * 224 / 372, size] : [size * 216 / 240, size];
  const style = `--shell:${p.shell};--shade:${p.shade};--deep:${p.deep};--glow:${glow};--visor:${base.visor};--logo:${base.logo};--acc:${acc}${L.manager ? `;--mgr:${L.manager.color}` : ""}`;
  return `<svg class="${o.cls ?? "av"}" viewBox="${vb}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" style="${style}" ${o.label ? `role="img" aria-label="${o.label}"` : `aria-hidden="true"`}>${body}${head}</svg>`;
}
