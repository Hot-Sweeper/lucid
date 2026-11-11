// Interface theme switching. The themes themselves are defined in themes/registry.ts.
// Follow T3 is the default when T3 Code's theme can be read (themes/t3-theme.ts); a saved
// choice of Night blue or OLED black stays as chosen.
import { THEMES, themeById, type ThemeDef } from "./themes/registry";
import { applyT3Palette, followT3, hasT3Theme, t3ThemeLabel } from "./themes/t3-theme";
import { getLocale, onLocaleChange } from "./localization";

const KEY = "lucid.interfaceTheme";

const saved = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
/** The chosen theme: the saved one, else Follow T3 once T3's palette is known, else Night blue. */
const read = (): ThemeDef => {
  const id = saved();
  return id && THEMES.some((t) => t.id === id) ? themeById(id) : hasT3Theme() ? themeById("t3") : themeById(null);
};
const followsT3 = () => { const id = saved(); return id === "t3" || !id || !THEMES.some((t) => t.id === id); };

const apply = (chosen: ThemeDef) => {
  // Without a T3 palette yet, Follow T3 shows Night blue until T3 answers.
  const theme = chosen.id === "t3" && !applyT3Palette() ? themeById(null) : chosen;
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.appScheme = theme.appScheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.metaColor);
  // The office relights and redraws its grounds for the new theme (world.ts).
  window.dispatchEvent(new Event("lucid:interface-theme"));
};

const transition = (swap: () => void) => {
  const start = (document as any).startViewTransition as undefined | ((cb: () => void) => unknown);
  if (start && !matchMedia("(prefers-reduced-motion: reduce)").matches && !document.hidden) start.call(document, swap);
  else swap();
};

// T3's palette or the system appearance changed: crossfade to it if Follow T3 is in use.
const t3Changed = () => { if (followsT3()) transition(() => apply(read())); };

// Runs on import, before the interface is built, so the saved theme never flashes.
apply(read());
followT3(followsT3(), t3Changed);

export function setInterfaceTheme(id: string) {
  const theme = themeById(id);
  try { localStorage.setItem(KEY, theme.id); } catch { /* the choice still applies to this session */ }
  followT3(theme.id === "t3", t3Changed);
  transition(() => apply(theme));
}

/** Native select in Office & settings, next to the game language, listing every theme. */
export function mountInterfaceThemeSetting(parent: HTMLElement): () => void {
  const row = document.createElement("label");
  row.className = "game-language interface-theme";
  const caption = document.createElement("span");
  const select = document.createElement("select");
  select.id = "interface-theme";
  const options = THEMES.map((t) => { const o = document.createElement("option"); o.value = t.id; select.append(o); return [t, o] as const; });
  const paint = () => {
    const de = getLocale() === "de";
    caption.textContent = de ? "Oberfläche" : "Interface";
    for (const [t, o] of options) o.textContent = de ? t.label.de : t.label.en;
    const t3 = options.find(([t]) => t.id === "t3")?.[1];
    if (t3 && hasT3Theme()) t3.textContent += ` (${t3ThemeLabel()})`;
    select.title = de ? "Farben der Oberfläche, der Computer und des Büros" : "Colours of the interface, the computers and the office";
    select.setAttribute("aria-label", caption.textContent);
    select.value = read().id;
  };
  select.addEventListener("change", () => setInterfaceTheme(select.value));
  const relabel = () => paint();
  window.addEventListener("lucid:interface-theme", relabel);
  row.append(caption, select); parent.appendChild(row); paint();
  const stop = onLocaleChange(paint);
  return () => { stop(); window.removeEventListener("lucid:interface-theme", relabel); row.remove(); };
}
