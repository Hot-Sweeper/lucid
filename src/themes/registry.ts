// Interface themes. A theme is two things:
//   1. this entry: its id, settings label and how the office world is lit and drawn;
//   2. a CSS file of token values on :root[data-theme="<id>"] (see themes/oled.css).
// Every themed surface reads tokens (themes/tokens.css holds the defaults, which are the night
// look, and themes/surfaces.css applies them), so a new theme only adds an entry and a token file.
import "./tokens.css";
import "./surfaces.css";
import "./oled.css";
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

export const THEMES: readonly ThemeDef[] = [
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

const DEFAULT = THEMES[0];
export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? DEFAULT;

/** The theme on screen now (also safe where there is no document). */
export function currentTheme(): ThemeDef {
  return typeof document === "undefined" ? DEFAULT : themeById(document.documentElement.dataset.theme);
}
