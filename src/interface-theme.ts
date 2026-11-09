// Interface theme switching. The themes themselves are defined in themes/registry.ts.
import { THEMES, themeById, type ThemeDef } from "./themes/registry";
import { getLocale, onLocaleChange } from "./localization";

const KEY = "lucid.interfaceTheme";

const read = (): ThemeDef => {
  try { return themeById(localStorage.getItem(KEY)); } catch { return themeById(null); }
};

const apply = (theme: ThemeDef) => {
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.appScheme = theme.appScheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.metaColor);
  // The office relights and redraws its grounds for the new theme (world.ts).
  window.dispatchEvent(new Event("lucid:interface-theme"));
  // Far robots drawn on canvas cache their resolved colours until their SVG's class changes.
  for (const svg of document.querySelectorAll("svg.robot")) { svg.classList.add("theme-swap"); svg.classList.remove("theme-swap"); }
};

// Runs on import, before the interface is built, so the saved theme never flashes.
apply(read());

export function setInterfaceTheme(id: string) {
  const theme = themeById(id);
  try { localStorage.setItem(KEY, theme.id); } catch { /* the choice still applies to this session */ }
  const swap = () => apply(theme);
  const start = (document as any).startViewTransition as undefined | ((cb: () => void) => unknown);
  if (start && !matchMedia("(prefers-reduced-motion: reduce)").matches && !document.hidden) start.call(document, swap);
  else swap();
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
    select.title = de ? "Farben der Oberfläche, der Computer und des Büros" : "Colours of the interface, the computers and the office";
    select.setAttribute("aria-label", caption.textContent);
    select.value = read().id;
  };
  select.addEventListener("change", () => setInterfaceTheme(select.value));
  row.append(caption, select); parent.appendChild(row); paint();
  const stop = onLocaleChange(paint);
  return () => { stop(); row.remove(); };
}
