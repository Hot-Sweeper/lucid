// Shared bits of the three office apps: the ribbon, pressing its buttons, typing with a
// steady pace, and saving with Ctrl+S.
import gsap from "gsap";
import type { WM } from "../os/wm";
import { esc } from "../os/typing";
import { presentationFrame, renderFps } from "../perf/render";

export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Type `text` at `cps` characters a second (scaled by wm.speed), calling paint(n) with how much is
 * on screen. Keys are pressed on the robot's keyboard as characters appear.
 */
export async function typeWith(wm: WM, text: string, cps: number, paint: (n: number, typing: boolean) => void) {
  const e = wm.epoch;
  wm.robot.setTyping(true);
  let shown = 0;
  const start = performance.now();
  try {
    while (shown < text.length) {
      await presentationFrame(wm.root);
      wm.check(e);
      const elapsed = (performance.now() - start) * wm.speed;
      const next = Math.min(text.length, Math.floor((elapsed / 1000) * cps * (0.88 + Math.random() * 0.24)));
      if (next <= shown) continue;
      if (renderFps(wm.root)) for (let i = shown; i < next; i++) wm.robot.pressKey(text[i] === "\n" ? "Enter" : text[i]);
      shown = next;
      if (renderFps(wm.root)) paint(shown, true);
    }
  } finally {
    paint(shown, false);
    wm.robot.setTyping(false);
  }
}

/** A steady typing speed for a whole document, picked up front from its size. */
export function paceFor(chars: number, minSec = 2.5, maxSec = 16) {
  const sec = Math.min(maxSec, Math.max(minSec, chars / 50));
  return Math.max(26, chars / sec);
}

// Ribbon glyphs, drawn in currentColor so they follow the button state.
const S = (d: string, w = 16) => `<svg viewBox="0 0 16 16" width="${w}" height="${w}" aria-hidden="true">${d}</svg>`;
export const GL = {
  bullets: S(`<circle cx="3" cy="4" r="1.4" fill="currentColor"/><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="3" cy="12" r="1.4" fill="currentColor"/><rect x="6" y="3.2" width="8" height="1.6" rx=".8" fill="currentColor"/><rect x="6" y="7.2" width="8" height="1.6" rx=".8" fill="currentColor"/><rect x="6" y="11.2" width="8" height="1.6" rx=".8" fill="currentColor"/>`),
  numbers: S(`<text x="1" y="6" font-size="5" font-weight="700" fill="currentColor">1</text><text x="1" y="13.4" font-size="5" font-weight="700" fill="currentColor">2</text><rect x="6" y="3.2" width="8" height="1.6" rx=".8" fill="currentColor"/><rect x="6" y="10.4" width="8" height="1.6" rx=".8" fill="currentColor"/>`),
  left: S(`<rect x="2" y="3" width="12" height="1.6" rx=".8" fill="currentColor"/><rect x="2" y="7" width="8" height="1.6" rx=".8" fill="currentColor"/><rect x="2" y="11" width="10" height="1.6" rx=".8" fill="currentColor"/>`),
  center: S(`<rect x="2" y="3" width="12" height="1.6" rx=".8" fill="currentColor"/><rect x="4" y="7" width="8" height="1.6" rx=".8" fill="currentColor"/><rect x="3" y="11" width="10" height="1.6" rx=".8" fill="currentColor"/>`),
  table: S(`<path d="M2 3h12v10H2Zm1.4 1.4v2.2h4V4.4Zm5.2 0v2.2h4V4.4ZM3.4 8v3.6h4V8Zm5.2 0v3.6h4V8Z" fill="currentColor" fill-rule="evenodd"/>`),
  picture: S(`<path d="M2 3h12v10H2Zm1.4 1.4v6.2l3-3 2.2 2.2 1.6-1.6 2.4 2.4V4.4Z" fill="currentColor" fill-rule="evenodd"/><circle cx="10.6" cy="6.4" r="1.2" fill="currentColor"/>`),
  shapes: S(`<rect x="1.5" y="6.5" width="7" height="7" rx="1" fill="currentColor"/><circle cx="11" cy="5" r="3.5" fill="currentColor" opacity=".7"/>`),
  chart: S(`<rect x="2" y="9" width="2.6" height="5" rx=".6" fill="currentColor"/><rect x="6.7" y="5" width="2.6" height="9" rx=".6" fill="currentColor"/><rect x="11.4" y="2" width="2.6" height="12" rx=".6" fill="currentColor"/>`),
  sum: S(`<path d="M3 2.5h10v2.2h-1.6V4H6l3.4 4L6 12h5.4v-.7H13v2.2H3v-1.2L7.2 8 3 3.7Z" fill="currentColor"/>`),
  newSlide: S(`<rect x="1.5" y="3" width="10" height="7.4" rx="1" fill="currentColor" opacity=".55"/><path d="M12 9.2h1.6v2.2h2.2V13h-2.2v2.2H12V13H9.8v-1.6H12Z" fill="currentColor"/>`),
  play: S(`<path d="M4.5 2.8 13 8l-8.5 5.2Z" fill="currentColor"/>`),
  save: S(`<path d="M2.5 2.5h9l2 2v9h-11Zm2 1.4v3h6v-3Zm1 6.2a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 0 0-3.8 0Z" fill="currentColor" fill-rule="evenodd"/>`),
  undo: S(`<path d="M6 3.2V1.5L2 4.6 6 7.7V6c3 0 5 1.3 5.6 4 .7-3.9-1.8-6.8-5.6-6.8Z" fill="currentColor"/>`),
  percent: S(`<circle cx="4.5" cy="4.5" r="2" fill="currentColor"/><circle cx="11.5" cy="11.5" r="2" fill="currentColor"/><path d="m11.6 2.6 1.4 1.1-8.6 9.7L3 12.3Z" fill="currentColor"/>`),
  sort: S(`<path d="M4 2.5 6.8 6H5v7.5H3V6H1.2Zm8 11L9.2 10H11V2.5h2V10h1.8Z" fill="currentColor"/>`),
};

/** A ribbon: the tab row (app colour) and the tool row of the active tab. */
export function ribbon(tabs: string[], active: string) {
  return `<div class="oa-tabs" role="tablist">${tabs.map((t) => `<span role="tab" class="oa-tab${t === active ? " on" : ""}" data-tab="${esc(t)}">${esc(t)}</span>`).join("")}</div><div class="oa-tools"></div>`;
}

export function setTab(root: HTMLElement, tab: string) {
  root.querySelectorAll<HTMLElement>(".oa-tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === tab));
  root.querySelectorAll<HTMLElement>(".oa-tools [data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== tab));
}

/** Point at a ribbon button (or anything) and click it, with the button visibly pressed. */
export async function press(wm: WM, el: Element | null, instant = false, ms = 340) {
  if (!el) return;
  if (!instant) {
    await wm.pointAt(el, 0.5, 0.55, ms);
    el.classList.add("down");
    await wm.click();
    el.classList.remove("down");
  }
}

/** Switch ribbon tab by clicking it. */
export async function openTab(wm: WM, root: HTMLElement, tab: string, instant = false) {
  const t = root.querySelector(`.oa-tab[data-tab="${tab}"]`);
  if (!t || t.classList.contains("on")) return setTab(root, tab);
  await press(wm, t, instant, 300);
  setTab(root, tab);
}

/** Ctrl+S: the status shows Saving, then Saved (nothing measurable, so no percentage). */
export async function save(wm: WM, status: HTMLElement | null, instant = false) {
  if (!status) return;
  if (instant) { status.textContent = "Saved"; status.classList.remove("busy"); return; }
  const e = wm.epoch;
  wm.robot.pressKey("Control");
  await wm.sleep(90, e);
  wm.robot.pressKey("s");
  status.textContent = "Saving...";
  status.classList.add("busy");
  await wm.sleep(650, e);
  status.textContent = "Saved";
  status.classList.remove("busy");
  if (!reduced()) gsap.fromTo(status, { opacity: 0.4 }, { opacity: 1, duration: 0.4 });
}

/** A soft highlight on something that just changed, fading out. */
export function flash(el: HTMLElement | null, color = "rgba(255, 214, 102, 0.55)", dur = 1.4) {
  if (!el) return;
  if (reduced()) { el.style.backgroundColor = ""; return; }
  gsap.fromTo(el, { backgroundColor: color }, { backgroundColor: "rgba(255, 214, 102, 0)", duration: dur, ease: "sine.out", clearProps: "backgroundColor" });
}

/** Keep `el` in view inside `scroller`, gliding when motion is fine. */
export function follow(scroller: HTMLElement, el: HTMLElement, speed: number, where = 0.45) {
  const top = el.offsetTop - scroller.clientHeight * where;
  const bottom = el.offsetTop + el.offsetHeight;
  if (el.offsetTop >= scroller.scrollTop + 8 && bottom <= scroller.scrollTop + scroller.clientHeight - 16) return;
  const to = Math.max(0, top);
  if (reduced()) scroller.scrollTop = to;
  else gsap.to(scroller, { scrollTop: to, duration: 0.35 / speed, ease: "power2.out", overwrite: true });
}
