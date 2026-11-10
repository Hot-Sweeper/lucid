// The theme the user picked in T3 Code, for the "Follow T3" interface theme.
//
// T3 keeps the active theme only in its own window's Local Storage (origin t3code://app):
//   t3code:theme                  active theme id ("system", "light", "dark", a built-in or custom id)
//   t3code:theme-appearance-mode  "light" | "dark" | "system"
//   t3code:theme-follow-system    legacy "true" | "false"
//   t3code:theme-halves:v1        { light?: id, dark?: id }, a theme per appearance
//   t3code:themes:v1              custom themes with their palettes
// There is no server API or file for the active choice, so that folder is read read-only
// (chromium-local-storage.cjs). When it cannot be read, the environment theme T3 publishes is
// used: settings.json `defaultTheme` and themes/<id>.json in T3's userdata folder.
// The resolution mirrors T3's web client (useTheme and themePalette). Colours are returned as
// sRGB hex, with text and accent ink lifted where a palette would fall below WCAG AA contrast.
const fs = require("node:fs");
const path = require("node:path");
const { readLocalStorage, signature } = require("./chromium-local-storage.cjs");
const BUILTINS = require("./t3-theme-builtins.cjs");
const { t3Home } = require("./t3-home.cjs");

const T3_HOME = t3Home();
const ORIGIN = "t3code://app";
const KEYS = ["t3code:theme", "t3code:theme-appearance-mode", "t3code:theme-follow-system", "t3code:theme-halves:v1", "t3code:themes:v1"];
const ALIASES = { "t3-chat-dark": "t3-chat", "t3-grove": "grove", "t3-ocean": "ocean", "t3-ember": "ember", "t3-iris": "iris" };
const PALETTE_KEYS = Object.keys(BUILTINS.default.light);

// ---- colour ---------------------------------------------------------------------------

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** CSS colour (hex, rgb(), oklch()) to sRGB 0..1, or null. Alpha is ignored: palettes are opaque. */
function parseColor(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1].slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) return [m[1], m[2], m[3]].map((n) => clamp01(Number(n) / 255));
  m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.%]+\s*)?\)$/.exec(v);
  if (m) {
    const L = Number(m[1]) / (m[2] ? 100 : 1), C = Number(m[3]), h = (Number(m[4]) * Math.PI) / 180;
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s];
    return rgb.map((c) => clamp01(toGamma(clamp01(c))));
  }
  return null;
}
const hex = (rgb) => "#" + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("");
const luminance = (rgb) => { const [r, g, b] = rgb.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const mixRgb = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

/** Moves `fg` toward `goal` in small steps until it reaches `ratio` against every background. */
function lift(fg, goal, backgrounds, ratio) {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mixRgb(fg, goal, t);
    if (backgrounds.every((bg) => contrast(c, bg) >= ratio)) return c;
  }
  return goal;
}

/** Hex palette with readable text, muted text, link accent and accent ink. */
function finish(palette, appearance) {
  const rgb = {};
  const fallback = BUILTINS.default[appearance];
  for (const k of PALETTE_KEYS) rgb[k] = parseColor(palette[k]) || parseColor(fallback[k]);
  const dark = appearance === "dark";
  const extreme = dark ? [0.96, 0.96, 0.96] : [0.08, 0.08, 0.08];
  const grounds = [rgb.canvas, rgb.surface, rgb.sidebar, rgb.surfaceRaised];
  rgb.text = lift(rgb.text, extreme, grounds, 4.5);
  rgb.sidebarForeground = lift(rgb.sidebarForeground, extreme, [rgb.sidebar], 4.5);
  rgb.textMuted = lift(rgb.textMuted, rgb.text, grounds, 4.5);
  rgb.sidebarMutedForeground = lift(rgb.sidebarMutedForeground, rgb.sidebarForeground, [rgb.sidebar], 4.5);
  rgb.messageForeground = lift(rgb.messageForeground, extreme, [rgb.messageSurface], 4.5);
  rgb.codeForeground = lift(rgb.codeForeground, extreme, [rgb.codeBackground], 4.5);
  rgb.terminalForeground = lift(rgb.terminalForeground, extreme, [rgb.terminalBackground], 4.5);
  // Accent used as link text on panels, and the ink on accent buttons.
  rgb.accentText = lift(rgb.accent, rgb.text, grounds, 4.5);
  const white = [1, 1, 1], black = [0.07, 0.07, 0.07];
  const ink = (c) => (Math.min(contrast(white, rgb.accent), contrast(white, c)) >= Math.min(contrast(black, rgb.accent), contrast(black, c)) ? white : black);
  rgb.accentForeground = contrast(rgb.accentForeground, rgb.accent) >= 4.5 ? rgb.accentForeground : ink(rgb.accent);
  const out = {};
  for (const [k, v] of Object.entries(rgb)) out[k] = hex(v);
  return out;
}

// ---- T3's theme resolution -----------------------------------------------------------

const isColorMap = (v) => v && typeof v === "object" && !Array.isArray(v);
function cleanColors(colors) {
  const out = {};
  if (!isColorMap(colors)) return out;
  for (const k of PALETTE_KEYS) if (parseColor(colors[k])) out[k] = colors[k];
  return out;
}

/** Custom themes from t3code:themes:v1; missing colours come from T3 Chat like in T3. */
function customThemes(raw) {
  let list;
  try { list = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list.slice(0, 200)) {
    if (!t || typeof t.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(t.id) || ALIASES[t.id] || BUILTINS[t.id] || ["system", "light", "dark"].includes(t.id)) continue;
    if (t.appearance !== "light" && t.appearance !== "dark") continue;
    const theme = { id: t.id, label: String(t.label || t.id).trim().slice(0, 48), appearance: t.appearance, [t.appearance]: { ...BUILTINS["t3-chat"][t.appearance], ...cleanColors(t.colors) } };
    for (const v of ["light", "dark"]) if (v !== t.appearance && isColorMap(t.variants?.[v])) theme[v] = { ...BUILTINS["t3-chat"][v], ...cleanColors(t.variants[v]) };
    if (!out.some((x) => x.id === theme.id)) out.push(theme);
  }
  return out;
}

/** Themes this T3 publishes in its themes folder (`t3 theme set`), with explicit colours. */
function publishedThemes(dir = path.join(T3_HOME, "userdata", "themes")) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^[a-z0-9][a-z0-9-]{0,47}\.json$/.test(n)).sort().slice(0, 32); } catch { return out; }
  for (const name of names) {
    try {
      const file = path.join(dir, name);
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.size > 32768) continue;
      const t = JSON.parse(fs.readFileSync(file, "utf8"));
      if (t.appearance !== "light" && t.appearance !== "dark") continue;
      const base = BUILTINS.default[t.appearance];
      // Canvas and accent alone: T3 derives a full palette; here they replace the base colours.
      const derived = parseColor(t.canvas) && parseColor(t.accent) ? { canvas: t.canvas, chrome: t.canvas, accent: t.accent, focus: t.accent } : {};
      const theme = { id: name.slice(0, -5), label: String(t.name || name.slice(0, -5)).slice(0, 48), appearance: t.appearance, [t.appearance]: { ...base, ...derived, ...cleanColors(t.colors) } };
      for (const v of ["light", "dark"]) if (v !== t.appearance && isColorMap(t.variants?.[v])) theme[v] = { ...BUILTINS.default[v], ...cleanColors(t.variants[v]) };
      out.push(theme);
    } catch {}
  }
  return out;
}

function environmentDefault(file = path.join(T3_HOME, "userdata", "settings.json")) {
  try { const id = JSON.parse(fs.readFileSync(file, "utf8")).defaultTheme; return typeof id === "string" && id ? id : null; } catch { return null; }
}

/**
 * Resolves T3's stored preferences to the palette(s) T3 shows. `light`/`dark` are set for each
 * appearance the user can see: both when T3 follows the system, one otherwise.
 */
function resolveTheme(store, { custom = [], published = [], fallbackId = null } = {}) {
  const lookup = (id) => {
    const key = ALIASES[id] || id;
    if (BUILTINS[key] && key !== "default") return { id: key, label: BUILTINS[key].label, appearance: BUILTINS[key].appearance, light: BUILTINS[key].light, dark: BUILTINS[key].dark };
    return custom.find((t) => t.id === key) || published.find((t) => t.id === key) || null;
  };
  const variant = (theme, appearance) => theme[appearance] || null;
  const stored = store["t3code:theme"];
  const id = typeof stored === "string" && stored ? stored : fallbackId || "system";
  const legacyDark = id === "t3-chat-dark" ? "dark" : null;
  const fixed = (t) => (t === "system" ? null : t === "light" || t === "dark" ? t : legacyDark || lookup(t)?.appearance || null);
  const follow = store["t3code:theme-follow-system"];
  const followSystem = follow === "true" ? true : follow === "false" ? false : id === "system";
  const storedMode = store["t3code:theme-appearance-mode"];
  const mode = ["light", "dark", "system"].includes(storedMode) ? storedMode : followSystem ? "system" : fixed(id) || "light";
  let halves = {};
  try {
    const h = JSON.parse(store["t3code:theme-halves:v1"] || "null");
    for (const a of ["light", "dark"]) { const t = typeof h?.[a] === "string" ? lookup(h[a]) : null; if (t && variant(t, a)) halves[a] = t.id; }
  } catch { halves = {}; }
  const appearanceFor = (systemDark) => {
    const want = mode === "system" ? (systemDark ? "dark" : "light") : mode;
    if (halves[want]) return want;
    const t = lookup(id);
    return t && !variant(t, want) ? t.appearance : want;
  };
  const out = { themeId: id, label: lookup(id)?.label || "T3 Code", mode, light: null, dark: null };
  for (const systemDark of mode === "system" ? [false, true] : [mode === "dark"]) {
    const appearance = appearanceFor(systemDark);
    const theme = lookup(halves[appearance] || id);
    const colors = theme ? variant(theme, appearance) || variant(theme, theme.appearance) : BUILTINS.default[appearance];
    out[appearance] = finish(colors, appearance);
  }
  return out;
}

// ---- reading, cached by the files' fingerprint -------------------------------------------

function createT3Theme({ storageDir, t3Home = T3_HOME } = {}) {
  let cache = null; // { key, value }
  const fingerprint = (file) => { try { const s = fs.statSync(file); return `${s.size}:${s.mtimeMs}`; } catch { return "-"; } };
  return function read() {
    const themesDir = path.join(t3Home, "userdata", "themes");
    const settingsFile = path.join(t3Home, "userdata", "settings.json");
    let dirStamp = "-";
    try { dirStamp = fs.readdirSync(themesDir).map((n) => `${n}:${fingerprint(path.join(themesDir, n))}`).join(","); } catch {}
    const key = [signature(storageDir), fingerprint(settingsFile), dirStamp].join("#");
    if (cache && cache.key === key) return cache.value;
    const haveStorage = fs.existsSync(storageDir);
    const store = haveStorage ? readLocalStorage(storageDir, ORIGIN, KEYS) : null;
    if (haveStorage && !store && cache) return cache.value; // mid-compaction: keep the last answer
    const installed = haveStorage || fs.existsSync(path.join(t3Home, "userdata"));
    let value = null;
    if (installed) {
      const published = publishedThemes(themesDir);
      value = resolveTheme(store || {}, { custom: customThemes(store?.["t3code:themes:v1"]), published, fallbackId: store?.["t3code:theme"] ? null : environmentDefault(settingsFile) });
      value.source = store && store["t3code:theme"] ? "T3 window" : store ? "T3 default" : "T3 environment";
    }
    cache = { key, value };
    return value;
  };
}

function register(ipcMain, app) {
  // T3's desktop app keeps its profile in <appData>/t3code-v2 on every platform.
  const read = createT3Theme({ storageDir: path.join(app.getPath("appData"), "t3code-v2", "Local Storage", "leveldb") });
  ipcMain.handle("t3:theme", () => { try { return read(); } catch { return null; } });
}

module.exports = { register, createT3Theme, resolveTheme, customThemes, publishedThemes, finish, parseColor, contrast };
