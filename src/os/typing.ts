import type { WM } from "./wm";

export const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const el = (html: string) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

// Typing helper: types text into a target, char by char, faster for long text.
export async function typeInto(wm: WM, target: HTMLElement, text: string, opts: { cps?: number; budgetMs?: number; render?: (s: string) => string } = {}) {
  const e = wm.epoch;
  const budget = opts.budgetMs ?? 1600;
  const cps = Math.max(opts.cps ?? 38, text.length / (budget / 1000));
  const render = opts.render ?? esc;
  wm.robot.setTyping(true);
  let shown = 0;
  const start = performance.now();
  try {
    while (shown < text.length) {
      await new Promise((r) => requestAnimationFrame(r));
      wm.check(e);
      const elapsed = (performance.now() - start) * wm.speed;
      const jitter = 0.85 + Math.random() * 0.3;
      const next = Math.min(text.length, Math.max(shown + 1, Math.floor((elapsed / 1000) * cps * jitter)));
      if (next !== shown) {
        for (let i = shown; i < next; i++) wm.robot.pressKey(text[i] === "\n" ? "Enter" : text[i]);
        shown = next;
        target.innerHTML = render(text.slice(0, shown)) + '<span class="caret"></span>';
      }
    }
  } finally {
    target.innerHTML = render(text.slice(0, shown));
    wm.robot.setTyping(false);
  }
}
