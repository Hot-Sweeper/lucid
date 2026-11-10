// Follow T3: reads the palette of the theme active in T3 Code (electron/t3-theme.cjs) and puts
// it on <html> as --t3-* variables, which themes/t3.css maps onto Lucid's tokens. The last
// palette is kept in localStorage so a launch paints it before T3 has answered.
// A cheap check runs every few seconds while the window is visible and Follow T3 is in use,
// never two at once, and right away when the window becomes visible or focused again.
import { setT3Look } from "./registry";

type Palette = Record<string, string>;
export type T3Theme = { themeId: string; label: string; mode: string; source?: string; light: Palette | null; dark: Palette | null };

const CACHE = "lucid.t3Theme";
const CHECK_MS = 8000;
const VARS: [string, string][] = [
  ["canvas", "canvas"], ["sidebar", "sidebar"], ["surface", "surface"], ["raised", "surfaceRaised"], ["overlay", "surfaceOverlay"],
  ["text", "text"], ["text-muted", "textMuted"], ["border", "border"], ["accent", "accent"], ["accent-text", "accentText"],
  ["accent-ink", "accentForeground"], ["secondary", "secondary"], ["code", "codeBackground"], ["control", "toolbarControl"],
  ["control-hover", "toolbarControlHover"], ["row-hover", "sidebarRowHover"], ["row-selected", "sidebarRowSelected"],
  ["sidebar-ink", "sidebarForeground"], ["sidebar-muted", "sidebarMutedForeground"], ["message", "messageSurface"], ["terminal", "terminalBackground"],
];
const HEX = /^#[0-9a-f]{6}$/i;

let data: T3Theme | null = load();
const dark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function load(): T3Theme | null {
  try { const v = JSON.parse(localStorage.getItem(CACHE) || "null"); return valid(v) ? v : null; } catch { return null; }
}
function valid(v: any): v is T3Theme {
  const ok = (p: any) => p === null || (p && typeof p === "object" && VARS.every(([, k]) => HEX.test(p[k])));
  return !!v && typeof v === "object" && (v.light || v.dark) && ok(v.light ?? null) && ok(v.dark ?? null);
}

export const hasT3Theme = () => !!data;
export const t3ThemeLabel = () => data?.label || "T3 Code";

/** The appearance T3 shows now: its fixed one, or the system's when T3 follows the system. */
function appearance(t: T3Theme): "light" | "dark" {
  if (t.light && t.dark) return dark?.matches ? "dark" : "light";
  return t.dark ? "dark" : "light";
}

/** Puts T3's colours on <html>. Returns false when there is no T3 palette yet. */
export function applyT3Palette(): boolean {
  if (!data) return false;
  const look = appearance(data);
  const p = (data[look] || data.light || data.dark)!;
  const root = document.documentElement;
  for (const [name, key] of VARS) root.style.setProperty(`--t3-${name}`, p[key]);
  // Input fields sit a step off the surface, toward the text.
  root.style.setProperty("--t3-input-surface", `color-mix(in oklab, ${p.surface} 93%, ${p.text})`);
  root.dataset.t3Appearance = look;
  setT3Look(look, p.canvas, p.surfaceRaised);
  return true;
}

let timer = 0, checking = false, stopped = true, onChange: (() => void) | null = null;

async function check() {
  if (stopped || checking || document.hidden) return;
  checking = true;
  window.clearTimeout(timer);
  try {
    const next = await (window as any).lucid?.t3Theme?.();
    if (valid(next) && JSON.stringify(next) !== JSON.stringify(data)) {
      data = { themeId: next.themeId, label: next.label, mode: next.mode, source: next.source, light: next.light, dark: next.dark };
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* the palette still applies this session */ }
      onChange?.();
    }
  } catch { /* T3 unreadable right now: keep the last palette */ }
  finally {
    checking = false;
    if (!stopped && !document.hidden) timer = window.setTimeout(() => void check(), CHECK_MS);
  }
}
const wake = () => { if (!document.hidden) void check(); };
const systemChanged = () => { if (data?.light && data?.dark) onChange?.(); };

/** Follows T3 while `active`; `changed` runs when T3's palette or the system appearance changes. */
export function followT3(active: boolean, changed: () => void) {
  onChange = changed;
  if (active === !stopped) return;
  stopped = !active;
  if (active) {
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    dark?.addEventListener("change", systemChanged);
    void check();
  } else {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
    dark?.removeEventListener("change", systemChanged);
  }
}
