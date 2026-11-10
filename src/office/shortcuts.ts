import gsap from "gsap";
import { gameSound } from "./sound";
import "./shortcuts.css";
import { BRAND } from "../brand";

// "How it works": what to click and which keys do what. Opens from the ? button or the ? key.
const CLICKS: [string, string][] = [
  ["New task", "Starts work. Pick a project, write the task, choose who does it."],
  ["A robot or its desk", "Opens that job's chat. Click again to see the robot's profile."],
  ["A focused desk again", "Zooms into the robot's computer. Esc comes back out."],
  ["An empty desk", "Hires someone for that exact desk."],
  ["A finished desk", "Shows what it did, then Settle & collect pays you its coins."],
  ["Right-click an office", "New thread, delegate, decorate, expand or move the office."],
  ["Drag a thread", "Drop it on an office to move that job there, or on another thread to reorder."],
  ["Water, trees, lamps", "Click them outside. They react."],
];
const KEYS: [string, string][] = [
  ["Ctrl+N", "New task"],
  ["Ctrl+K", "Find a thread"],
  ["Ctrl+J", "Next thread that needs you"],
  ["Up / Down, Enter", "Move through the thread list, open"],
  ["Ctrl+B", "Hide or show the side panel"],
  ["Esc", "Zoom back out, close"],
  ["Enter", "Send a message (Shift+Enter for a new line)"],
  ["?", "This help"],
];

let wrap: HTMLElement | null = null;

export function isShortcutHelpOpen() { return !!wrap; }

export function openShortcutHelp() {
  if (wrap) { closeShortcutHelp(); return; }
  const previous = document.activeElement as HTMLElement | null;
  const el = document.createElement("div");
  el.className = "dialog-wrap help-wrap";
  el.innerHTML = `<div class="dialog help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <div class="help-head"><h2 id="help-title">How ${BRAND.name} works</h2><button type="button" class="ghost help-close" aria-label="Close">Close</button></div>
    <p class="help-lead">Each desk is one job, one T3 thread. Robots are your workers. Click things to use them.</p>
    <div class="help-cols"><section><h3>Click</h3><dl class="help-clicks"></dl></section><section><h3>Keys</h3><dl class="help-keys"></dl></section></div>
  </div>`;
  const fill = (dl: Element, rows: [string, string][], keys: boolean) => {
    for (const [k, v] of rows) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      if (keys) for (const part of k.split(/(\s*\/\s*|,\s*|\+)/)) {
        if (!part.trim() || part === "+" || /^[\s/,]+$/.test(part)) dt.append(part.trim() === "+" ? "+" : part);
        else { const kbd = document.createElement("kbd"); kbd.textContent = part.trim(); dt.append(kbd); }
      } else dt.textContent = k;
      dd.textContent = v;
      dl.append(dt, dd);
    }
  };
  fill(el.querySelector(".help-clicks")!, CLICKS, false);
  fill(el.querySelector(".help-keys")!, KEYS, true);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || (e.key === "?" && !typing(e))) { e.preventDefault(); e.stopImmediatePropagation(); closeShortcutHelp(); }
  };
  el.addEventListener("click", (e) => { if (e.target === el || (e.target as HTMLElement).closest(".help-close")) closeShortcutHelp(); });
  document.body.append(el);
  wrap = el;
  window.addEventListener("keydown", onKey, true);
  (el as any)._done = () => { window.removeEventListener("keydown", onKey, true); previous?.focus?.({ preventScroll: true }); };
  gameSound.play("open");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(el.querySelector(".dialog"), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.18 });
  el.querySelector<HTMLElement>(".help-close")!.focus();
}

export function closeShortcutHelp() {
  const el = wrap;
  if (!el) return;
  wrap = null;
  el.classList.add("closing");
  (el as any)._done?.();
  gsap.to(el, { opacity: 0, duration: 0.12, onComplete: () => el.remove() });
}

/** True while the key goes into a text field, so single-key shortcuts leave typing alone. */
export function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
