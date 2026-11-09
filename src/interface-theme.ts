// Interface theme: Lucid's night blue panels, or true black panels for OLED screens.
// Only the interface chrome changes; rooms, robots and monitor apps keep their artwork.
import "./oled.css";
import { getLocale, onLocaleChange } from "./localization";

export type InterfaceTheme = "night" | "oled";
const KEY = "lucid.interfaceTheme";

const read = (): InterfaceTheme => {
  try { return localStorage.getItem(KEY) === "oled" ? "oled" : "night"; } catch { return "night"; }
};

const apply = (theme: InterfaceTheme) => {
  const root = document.documentElement;
  if (theme === "oled") root.dataset.theme = "oled"; else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "oled" ? "#000000" : "#1b2246");
};

// Runs on import, before the interface is built, so the saved theme never flashes.
apply(read());

export function setInterfaceTheme(theme: InterfaceTheme) {
  try { localStorage.setItem(KEY, theme); } catch { /* the choice still applies to this session */ }
  const swap = () => apply(theme);
  const start = (document as any).startViewTransition as undefined | ((cb: () => void) => unknown);
  if (start && !matchMedia("(prefers-reduced-motion: reduce)").matches && !document.hidden) {
    start.call(document, swap);
  } else swap();
}

/** Native select in Office & settings, next to the game language. */
export function mountInterfaceThemeSetting(parent: HTMLElement): () => void {
  const row = document.createElement("label");
  row.className = "game-language interface-theme";
  const caption = document.createElement("span");
  const select = document.createElement("select");
  select.id = "interface-theme";
  const night = document.createElement("option"); night.value = "night";
  const oled = document.createElement("option"); oled.value = "oled";
  select.append(night, oled);
  const paint = () => {
    const de = getLocale() === "de";
    caption.textContent = de ? "Oberfläche" : "Interface";
    night.textContent = de ? "Nachtblau" : "Night blue";
    oled.textContent = de ? "OLED-Schwarz" : "OLED black";
    select.title = de ? "Seitenleisten, Chat und Menüs in Nachtblau oder reinem Schwarz" : "Sidebars, chat and menus in night blue or true black";
    select.setAttribute("aria-label", caption.textContent);
    select.value = read();
  };
  select.addEventListener("change", () => setInterfaceTheme(select.value === "oled" ? "oled" : "night"));
  row.append(caption, select); parent.appendChild(row); paint();
  const stop = onLocaleChange(paint);
  return () => { stop(); row.remove(); };
}
