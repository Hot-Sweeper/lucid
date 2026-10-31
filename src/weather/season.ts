import type { Season, Weather } from "./types";
export type { Season } from "./types";

// Seasons for the outdoors. Meteorological seasons (whole months), which match how the
// park actually looks in Germany better than the astronomical dates do.

export function seasonFor(date: Date = new Date()): Season {
  const m = date.getMonth(); // 0 = January
  return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}

// The coldest stretch, roughly 20 December to 15 February: the pond freezes over.
export function isDeepWinter(date: Date = new Date()) {
  const m = date.getMonth(), d = date.getDate();
  return (m === 11 && d >= 20) || m === 0 || (m === 1 && d <= 15);
}

type Triad = [string, string, string];
export type SeasonPalette = {
  ground: string;           // the grass everywhere, also a good scene background colour
  tuft: string;             // little grass strokes
  tuftOpacity: number;
  park: [string, string];   // park lawn: outer rim, inner
  path: string;
  plaza: string;            // the stone ring around the fountain and the entrance steps
  shadow: string;
  trees: Triad[];           // leafy crowns, dark to light
  bush: Triad;
  bare: number;             // share of trees standing without leaves (0 to 1)
  branch: string;
  blossom: { share: number; colors: string[] };   // trees dotted with blossoms
  litter: string[];         // fallen leaves on the grass, empty for none
  flowers: { density: number; colors: string[]; covered: boolean };
  lily: string | null;
};

const SUMMER: SeasonPalette = {
  ground: "#78b066", tuft: "#5f9c55", tuftOpacity: 1,
  park: ["#7fbf6a", "#86c871"], path: "#e6d6b4", plaza: "#d8c8a6", shadow: "#1f3a22",
  trees: [["#3f8f5a", "#57a96f", "#78c48a"], ["#357f52", "#4c9c65", "#6db57d"], ["#4a9a5e", "#62b574", "#86cf94"]],
  bush: ["#4e9d62", "#468f59", "#62b574"],
  bare: 0, branch: "#6b5646",
  blossom: { share: 0, colors: [] },
  litter: [],
  flowers: { density: 1, colors: ["#ff6f91", "#ffd27a", "#b07cff", "#ffffff", "#ff9f5a"], covered: false },
  lily: "#5aa85c",
};

const PALETTES: Record<Season, SeasonPalette> = {
  summer: SUMMER,
  spring: {
    ...SUMMER,
    ground: "#7fba68", tuft: "#67a85a",
    park: ["#86c66c", "#8fd176"],
    trees: [["#4a9b5a", "#66b86f", "#90d48d"], ["#3f8e55", "#58ab68", "#7fc985"], ["#56a75f", "#72c278", "#9edc98"]],
    bush: ["#5aa865", "#4f9a5c", "#78c47c"],
    blossom: { share: 0.4, colors: ["#ffc2d6", "#ffe3ec", "#ffffff", "#f7a6c4"] },
    flowers: { density: 1.15, colors: ["#ff6f91", "#ffd27a", "#ffffff", "#f7a6c4", "#b07cff", "#ff8a5c"], covered: false },
  },
  autumn: {
    ...SUMMER,
    ground: "#8ba65e", tuft: "#7a9450", tuftOpacity: 0.8,
    park: ["#93ad62", "#9bb86a"],
    trees: [["#c4632c", "#dd8538", "#f1ad58"], ["#a8432f", "#c75a3a", "#e27e54"], ["#c3962c", "#ddb53e", "#f2d26e"], ["#6f8f3f", "#89a64d", "#a9c26a"]],
    bush: ["#9a8a3c", "#8a7a34", "#b8a24c"],
    bare: 0.08,
    litter: ["#d9783a", "#e8a23c", "#b5472f", "#e6c04a"],
    flowers: { density: 0.3, colors: ["#d9783a", "#b0453a", "#e2b941", "#9b5fb0"], covered: false },
    lily: "#7c9a4a",
  },
  winter: {
    ...SUMMER,
    ground: "#869d74", tuft: "#76906a", tuftOpacity: 0.55,
    park: ["#8aa577", "#91ad7e"],
    trees: [["#2f5f4a", "#3d7259", "#558a6c"], ["#2a5644", "#376651", "#4d7f63"]],
    bush: ["#55745a", "#4b6a51", "#6a8a6c"],
    bare: 0.62, branch: "#6b5848",
    flowers: { density: 0, colors: [], covered: true },
    lily: null,
  },
};

export function seasonPalette(season: Season): SeasonPalette {
  return PALETTES[season];
}

// Everything the outdoors needs for a given moment: season, how much snow lies on the
// ground (0 to 1) and whether the pond is frozen. Snow lies when it is snowing, or in winter
// when it is cold; the pond freezes in deep winter or after a hard frost.
export function outdoorLook(date: Date = new Date(), w: Weather | null = null) {
  const season = seasonFor(date);
  const t = w?.tempC;
  let snowCover = 0;
  if (w?.kind === "snow") snowCover = t != null && t > 2 ? 0.45 : 1;
  else if (season === "winter") snowCover = t == null ? (isDeepWinter(date) ? 0.6 : 0) : t <= -2 ? 0.75 : t <= 1 ? 0.35 : 0;
  const frozen = season === "winter" && (t == null ? isDeepWinter(date) : t <= 0 || (isDeepWinter(date) && t <= 3));
  return { season, snowCover, frozen };
}
