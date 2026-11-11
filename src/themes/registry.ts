// Interface themes. A theme is two things (Follow T3 also reads T3 Code's palette at run time):
//   1. this entry: its id, settings label and how the office world is lit and drawn;
//   2. a CSS file of token values on :root[data-theme="<id>"] (see themes/oled.css).
// Every themed surface reads tokens (themes/tokens.css holds the defaults, which are the night
// look, and themes/surfaces.css applies them), so a new theme only adds an entry and a token file.
import "./tokens.css";
import "./surfaces.css";
import "./oled.css";
import "./t3.css";
import "./app-dark/index.css";

export type WorldLook = {
  /** Lock the office lighting to midnight; the wall clock keeps real time. */
  alwaysMidnight: boolean;
  /** Sky colours used at night (window views and weather sky). Omitted: the time-of-day sky. */
  nightSky?: { sky1: string; sky2: string };
  /** How far the outdoor art sinks toward black (0 keeps the season's colours). */
  artShade: number;
  /** Colour the woodland fades into at the edge of the map. Omitted: the season's deep green. */
  mapEdge?: string;
};

export type ThemeDef = {
  id: string;
  label: { en: string; de: string };
  /** Browser and window chrome colour. */
  metaColor: string;
  /** Colour scheme of the apps on the robots' computers. Each app has a light look (its own
   *  stylesheet) and a dark look (themes/app-dark/), chosen by data-app-scheme on <html>. */
  appScheme: "light" | "dark";
  world: WorldLook;
};

// Follow T3 takes the colours of the theme active in T3 Code (themes/t3-theme.ts). Its scheme and
// window colour change with that theme, so this entry is updated in place. The office world keeps
// the warm season art and real time-of-day light under every T3 palette: a dark interface must not
// crush the park and rooms into black (only OLED black chooses the moonlit office on purpose).
const WARM_WORLD: WorldLook = { alwaysMidnight: false, artShade: 0 };
export const T3_THEME: ThemeDef = {
  id: "t3",
  label: { en: "Follow T3", de: "Wie T3" },
  metaColor: "#000000",
  appScheme: "dark",
  world: WARM_WORLD,
};
/** Follows T3's appearance: window colour and the computers' app scheme. The office stays warm. */
export function setT3Look(appearance: "light" | "dark", canvas: string) {
  T3_THEME.metaColor = canvas;
  T3_THEME.appScheme = appearance;
}

export const THEMES: readonly ThemeDef[] = [
  T3_THEME,
  {
    id: "night",
    label: { en: "Night blue", de: "Nachtblau" },
    metaColor: "#1b2246",
    appScheme: "light",
    world: { alwaysMidnight: false, artShade: 0 },
  },
  {
    id: "oled",
    label: { en: "OLED black", de: "OLED-Schwarz" },
    metaColor: "#000000",
    appScheme: "dark",
    world: { alwaysMidnight: true, nightSky: { sky1: "#000000", sky2: "#08080b" }, artShade: 0.78, mapEdge: "#000000" },
  },
];

const DEFAULT = THEMES[1];
export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? DEFAULT;

/** The theme on screen now (also safe where there is no document). */
export function currentTheme(): ThemeDef {
  return typeof document === "undefined" ? DEFAULT : themeById(document.documentElement.dataset.theme);
}
