import "./titlebar.css";
import { BRAND } from "./brand";
import { icon } from "./ui/icons";

// The window's top merges with the app's own headers: no separate title bar. Each platform keeps
// its native feel (electron/main.cjs picks the frame):
// - Linux: frameless, with our minimize, maximize and close in the top right corner.
// - macOS: hidden inset title bar; the traffic lights sit in the sidebar header's left padding.
// - Windows: native caption buttons in a title bar overlay coloured from the theme tokens.
// The empty parts of the headers drag the window and a double click maximizes it (titlebar.css).
type Chrome = "linux" | "mac" | "windows" | "native";
type WindowState = { maximized: boolean; fullscreen?: boolean; chrome?: Chrome };
type WindowApi = {
  control(action: "minimize" | "maximize" | "close"): Promise<boolean>;
  state(): Promise<WindowState>;
  onMaximized(fn: (on: boolean) => void): () => void;
  onFullscreen?(fn: (on: boolean) => void): () => void;
  overlay?(colors: { color: string; symbolColor: string }): Promise<boolean>;
};

const hex = (css: string) => {
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : css;
};

export async function mountTitlebar() {
  document.title = BRAND.name;
  const api = (window as any).lucidWindow as WindowApi | undefined;
  if (!api) return;
  let state: WindowState;
  try { state = await api.state(); } catch { return; }
  const chrome: Chrome = state.chrome ?? "native";
  if (chrome === "native") return;
  const root = document.documentElement;
  root.dataset.chrome = chrome;

  // A plate in the controls' corner: transparent over a header, a small tab when the column
  // under it is folded into a rail.
  const plate = document.createElement("div");
  plate.className = "app-wc";
  document.body.append(plate);
  const fullscreen = (on: boolean) => root.toggleAttribute("data-fullscreen", on);
  api.onFullscreen?.(fullscreen);
  fullscreen(!!state.fullscreen);

  if (chrome === "linux") {
    plate.setAttribute("role", "group");
    plate.setAttribute("aria-label", "Window");
    plate.innerHTML = `<button type="button" class="wc-btn" data-act="minimize" aria-label="Minimize" title="Minimize">${icon("minimize")}</button>
      <button type="button" class="wc-btn" data-act="maximize">${icon("maximize")}</button>
      <button type="button" class="wc-btn wc-close" data-act="close" aria-label="Close" title="Close">${icon("close")}</button>`;
    const max = plate.querySelector<HTMLButtonElement>('[data-act="maximize"]')!;
    const paint = (on: boolean) => {
      max.innerHTML = icon(on ? "restore" : "maximize");
      const label = on ? "Restore" : "Maximize";
      max.setAttribute("aria-label", label); max.title = label;
    };
    plate.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act as "minimize" | "maximize" | "close" | undefined;
      if (act) void api.control(act).then((on) => { if (act === "maximize") paint(on); });
    });
    api.onMaximized(paint);
    paint(state.maximized);
    root.style.setProperty("--wc-right", `${plate.offsetWidth}px`);
  }

  if (chrome === "windows") {
    // Keep clear of the native caption buttons, wherever Windows puts them.
    const wco = (navigator as any).windowControlsOverlay;
    const measure = () => {
      const r: DOMRect | undefined = wco?.visible ? wco.getTitlebarAreaRect() : undefined;
      root.style.setProperty("--wc-right", `${r && r.width ? Math.max(0, innerWidth - r.x - r.width) : 138}px`);
    };
    wco?.addEventListener?.("geometrychange", measure);
    measure();
    // The caption buttons take the colour of the surface beneath them, following theme and folding.
    let last = "";
    const recolor = () => {
      const app = document.getElementById("app");
      const under = app?.classList.contains("chat-folded") ? plate : document.querySelector(".chat-panel");
      const color = hex(getComputedStyle(under ?? plate).backgroundColor);
      const symbolColor = hex(getComputedStyle(root).getPropertyValue("--ink-2").trim() || "#b9bfe6");
      const key = color + symbolColor;
      if (key === last || !/^#[0-9a-f]{6}$/i.test(color)) return;
      last = key;
      void api.overlay?.({ color, symbolColor });
    };
    // once on the next frame, and again after the 260ms theme crossfade has settled
    const watch = new MutationObserver(() => { requestAnimationFrame(recolor); window.setTimeout(recolor, 320); });
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    const app = document.getElementById("app");
    if (app) watch.observe(app, { attributes: true, attributeFilter: ["class"] });
    recolor();
  }
}
