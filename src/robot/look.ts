// A robot's look: the options it can be hired or customized with, what an old profile
// without them resolves to, random and migrated looks, and the colours a look paints onto the
// body (brand palette shifted by the tint, the theme's dark bodies, glow and fabric accent).
// The drawings of hats, accessories, eyes and stickers live in art/outfit.ts.

export type Build = "slim" | "regular" | "sturdy";
export type HatKind =
  | "none" | "beanie" | "cap" | "capBack" | "tophat" | "party" | "headset" | "crown" | "beret"
  | "propeller" | "chef" | "wizard" | "flowers" | "santa" | "cowboy" | "catEars" | "bow";
export type AccessoryKind = "none" | "scarf" | "bowtie" | "tie" | "lanyard" | "flower" | "bandana" | "backpack" | "jetpack" | "cape";
export type EyeStyle = "classic" | "dots" | "round" | "happy" | "visor" | "pixel" | "hearts" | "sleepy";
export type Tint = "none" | "warm" | "cool" | "mint" | "rose" | "sand" | "lilac" | "graphite";
export type StickerKind = "none" | "bolt" | "star" | "heart" | "smile" | "flower" | "moon" | "rainbow" | "planet" | "ghost" | "cat" | "pizza";

/** Every field is optional: old profiles keep rendering with the defaults (LOOK_DEFAULTS below). */
export interface RobotLook {
  accent?: string;                                   // trim color: ear rings, shoulder caps, and the color of fabric hats and scarves
  antennaTip?: "ball" | "star" | "heart" | "ring";
  headphones?: boolean;
  sticker?: StickerKind;                             // a small decal on the back of the head, beside the logo
  build?: Build;                                     // torso and shoulder width
  head?: number;                                     // head size, 0.9 to 1.15 (1 is the original)
  hat?: HatKind;
  accessory?: AccessoryKind;
  eyes?: EyeStyle;                                   // resting eye shape on the visor (strong expressions keep their own shapes)
  tint?: Tint;                                       // a slight shift of the brand shell color
  glow?: string | null;                              // eye, antenna and chest light color (null: the brand's own)
  blush?: boolean;                                   // pink cheeks under the visor
}

export type View = "back" | "front";

// ---- options ------------------------------------------------------------------------------
type Opt<K extends string> = { id: K; label: string };

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
  { id: "tophat", label: "Top hat", antenna: "lift", lift: 74 },
  { id: "propeller", label: "Propeller cap", antenna: "hide" },
  { id: "wizard", label: "Wizard hat", antenna: "hide" },
  { id: "crown", label: "Crown", antenna: "through" },
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
  { id: "jetpack", label: "Jetpack", covers: true },
  { id: "cape", label: "Cape", covers: true },
];
export const EYES: Opt<EyeStyle>[] = [
  { id: "classic", label: "Classic" }, { id: "dots", label: "Dots" }, { id: "round", label: "Sparkly" }, { id: "happy", label: "Happy" },
  { id: "visor", label: "Visor bar" }, { id: "pixel", label: "Pixel" }, { id: "sleepy", label: "Sleepy" }, { id: "hearts", label: "Hearts" },
];
export const TINTS: (Opt<Tint> & { color: string | null })[] = [
  { id: "none", label: "Factory", color: null }, { id: "warm", label: "Soft depth", color: "#ffa36b" }, { id: "cool", label: "Soft shade", color: "#7fa6ff" },
  { id: "mint", label: "Light", color: "#5fdcae" }, { id: "rose", label: "Medium depth", color: "#ff8fb1" }, { id: "sand", label: "Medium shade", color: "#dcb47a" },
  { id: "lilac", label: "Deep", color: "#b896ff" }, { id: "graphite", label: "Graphite", color: "#4a505f" },
];
export const STICKERS: Opt<StickerKind>[] = [
  { id: "none", label: "None" }, { id: "bolt", label: "Bolt" }, { id: "star", label: "Star" }, { id: "heart", label: "Heart" }, { id: "smile", label: "Smiley" },
  { id: "flower", label: "Flower" }, { id: "moon", label: "Moon" }, { id: "ghost", label: "Ghost" }, { id: "cat", label: "Cat" }, { id: "pizza", label: "Pizza" },
  { id: "rainbow", label: "Rainbow" }, { id: "planet", label: "Planet" },
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
    antennaTip: look.antennaTip ?? "ball",
    headphones: !!look.headphones,
    sticker: look.sticker ?? LOOK_DEFAULTS.sticker,
    build: look.build ?? LOOK_DEFAULTS.build,
    head: Math.min(1.15, Math.max(0.9, look.head ?? 1)),
    hat: look.hat ?? LOOK_DEFAULTS.hat,
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
const open = <K extends string>(list: Opt<K>[]) => list.filter((o) => o.id !== "none").map((o) => o.id);

/** A varied random look. Most robots get a hat or an accessory, some get both, a few neither. */
export function randomLook(r: () => number = Math.random): RobotLook {
  const hat = r() < 0.6 ? pickFrom(r, open(HATS)) : "none";
  const accessory = r() < (hat === "none" ? 0.62 : 0.4) ? pickFrom(r, open(ACCESSORIES)) : "none";
  return {
    accent: pickFrom(r, ACCENTS),
    antennaTip: weighted(r, [["ball", 3], ["star", 1], ["heart", 1], ["ring", 1]]),
    build: weighted(r, [["slim", 3], ["regular", 4.5], ["sturdy", 2.5]]),
    head: weighted(r, [[0.9, 1], [0.95, 2], [1, 3], [1.05, 2.5], [1.1, 1.5], [1.15, 1]]),
    hat, accessory,
    eyes: r() < 0.38 ? "classic" : pickFrom(r, open(EYES)),
    tint: r() < 0.3 ? "none" : pickFrom(r, open(TINTS)),
    sticker: r() < 0.4 ? "none" : pickFrom(r, open(STICKERS)),
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

/** The brand shell shifted slightly toward a tint. Enough to tell robots apart, never enough to lose the brand. */
export function tintPalette<P extends { shell: string; shade: string; deep: string }>(p: P, tint: Tint | undefined): P {
  // Each choice stays in the harness's own color family. Vary brightness and
  // saturation rather than mixing unrelated pink, green or blue into its shell.
  const shifts: Record<string, [string, number]> = {
    warm: [p.deep, 0.10], cool: [p.shade, 0.16], mint: [p.shell, 0.08],
    rose: [p.deep, 0.16], sand: [p.shade, 0.24], lilac: [p.deep, 0.22],
    graphite: ["#17191e", 0.18],
  };
  const shift = shifts[tint || "none"];
  if (!shift) return p;
  const [target, amount] = shift;
  return { ...p, shell: mix(p.shell, target, amount), shade: mix(p.shade, target, amount * 0.7), deep: mix(p.deep, target, amount * 0.4) };
}

/**
 * Body colour variables. The theme can turn bodies dark while keeping each robot's own hue:
 * --robot-dark (0% keeps the light body, 100% the dark one) and the hue strength
 * --robot-tint come from the theme tokens.
 */
export function bodyColors(p: { shell: string; shade: string; deep: string }, hue: string) {
  const k = "var(--robot-tint, 30%)";
  const dark = (amount: string, base: string) => `color-mix(in srgb, ${hue} ${amount}, ${base})`;
  const pick = (night: string, oled: string) => `color-mix(in srgb, ${oled} var(--robot-dark, 0%), ${night})`;
  return {
    "--shell": pick(p.shell, dark(k, "#121214")),
    "--shade": pick(p.shade, dark(`calc(${k} - 8%)`, "#09090b")),
    "--deep": pick(p.deep, dark(`calc(${k} + 22%)`, "#050506")),
  };
}

/** Sets the colour variables a look needs on a robot root (call after the brand is painted). */
export function paintLookColors(el: Element, base: { shell: string; shade: string; deep: string; glow: string }, look: RobotLook) {
  const st = (el as HTMLElement | SVGElement).style;
  const p = tintPalette(base, look.tint);
  // The dark body's hue: the robot's own tinted colour.
  for (const [k, v] of Object.entries(bodyColors(p, p.deep))) st.setProperty(k, v);
  st.setProperty("--glow", look.glow || base.glow);
  st.setProperty("--acc", look.accent || "#ff9f5a");
  st.setProperty("--acc-cloth", accCloth(look.accent || "#ff9f5a"));
  return look.glow || base.glow;
}

// Accessories have a light and a dark look. Fabric in the robot's accent deepens under a dark
// theme (--acc-dark), and fixed materials read theme tokens (--acc-ink, --acc-card, --acc-metal,
// --acc-leather*, --acc-robe*, --acc-silk*), falling back to their original colours. Iconic
// pieces (crown gold, propeller, santa, chef, flowers) look the same in both.
/** The accent as fabric: the accent itself, deepened by the theme's --acc-dark. */
export const accCloth = (acc: string) => `color-mix(in srgb, ${acc}, #0d0d10 var(--acc-dark, 0%))`;
