import "./titlebar.css";

// Lucid's own title bar where the window has no desktop frame (Linux). The whole bar drags the
// window and a double click maximizes it, like a native one; the buttons are Lucid's.
type WindowApi = {
  control(action: "minimize" | "maximize" | "close"): Promise<boolean>;
  state(): Promise<{ maximized: boolean; framed: boolean }>;
  onMaximized(fn: (on: boolean) => void): () => void;
};

const ICONS = {
  minimize: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  maximize: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  restore: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="4" width="6" height="6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 4V3.4C4.5 2.6 5.1 2 5.9 2h2.7C9.4 2 10 2.6 10 3.4v2.7C10 6.9 9.4 7.5 8.6 7.5H8" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  close: '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3l6 6m0-6L3 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

export async function mountTitlebar() {
  const api = (window as any).lucidWindow as WindowApi | undefined;
  if (!api) return;
  let state: { maximized: boolean; framed: boolean };
  try { state = await api.state(); } catch { return; }
  if (state.framed) return;
  const bar = document.createElement("header");
  bar.className = "app-titlebar";
  bar.innerHTML = `<div class="tb-brand"><span class="tb-mark" aria-hidden="true"></span><span>Lucid</span></div>
    <div class="tb-controls">
      <button type="button" class="tb-btn" data-act="minimize" aria-label="Minimize" title="Minimize">${ICONS.minimize}</button>
      <button type="button" class="tb-btn" data-act="maximize" aria-label="Maximize" title="Maximize">${ICONS.maximize}</button>
      <button type="button" class="tb-btn tb-close" data-act="close" aria-label="Close" title="Close">${ICONS.close}</button>
    </div>`;
  const max = bar.querySelector<HTMLButtonElement>('[data-act="maximize"]')!;
  const paint = (on: boolean) => {
    document.documentElement.classList.toggle("window-maximized", on);
    max.innerHTML = on ? ICONS.restore : ICONS.maximize;
    const label = on ? "Restore" : "Maximize";
    max.setAttribute("aria-label", label); max.title = label;
  };
  bar.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act as "minimize" | "maximize" | "close" | undefined;
    if (act) void api.control(act).then((on) => { if (act === "maximize") paint(on); });
  });
  api.onMaximized(paint);
  paint(state.maximized);
  document.body.prepend(bar);
  document.documentElement.classList.add("has-titlebar");
}
