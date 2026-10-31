// Shared helpers for the social and desktop pastime apps. Built on the life pack's Kit, so a
// single kill() stops every tween, timer and frame loop an app started.
import type { FunHost } from "../fun/host";
import { Kit, rnd, chance } from "../life/util";
export { Kit, runApp, rnd, irnd, chance, pick, shuffle, h, esc, canvas } from "../life/util";
import "./social.css";

export type SoHost = FunHost;
export type SoOpts = { maxMs: number; skill?: number; me?: string; phone?: boolean };

export const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n));
export const clock = (agoMs = 0) => new Date(Date.now() - agoMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A flat robot head avatar, seeded so the same name always gets the same face. */
export function avatar(color: string, seed = 0) {
  const eyes = seed % 3;
  const eye = eyes === 0
    ? `<circle cx="9.5" cy="13" r="1.7" fill="#4ff0a0"/><circle cx="14.5" cy="13" r="1.7" fill="#4ff0a0"/>`
    : eyes === 1
      ? `<rect x="7.8" y="12.2" width="3.4" height="1.6" rx=".8" fill="#7fd3ff"/><rect x="12.8" y="12.2" width="3.4" height="1.6" rx=".8" fill="#7fd3ff"/>`
      : `<path d="M8 13.6a1.6 1.6 0 0 1 3.2 0Zm4.8 0a1.6 1.6 0 0 1 3.2 0Z" fill="#ffd27a"/>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${color}"/><rect x="11.2" y="3.2" width="1.6" height="3" fill="#141a33" opacity=".35"/><circle cx="12" cy="3.2" r="1.4" fill="#fff" opacity=".85"/><rect x="5.5" y="7" width="13" height="11" rx="4" fill="#fff" opacity=".92"/><rect x="7" y="9.6" width="10" height="6" rx="2.6" fill="#141a33"/>${eye}</svg>`;
}

export function seedOf(s: string) { let x = 7; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }

/** Robot taps something on its phone: the thumb moves and a soft ripple shows where. */
export async function touch(k: Kit, el: Element, root: HTMLElement, kind: "tap" | "doubleTap" | "swipe" = "tap") {
  k.check();
  (k.host as SoHost).thumb?.(kind);
  const r = el.getBoundingClientRect(), b = root.getBoundingClientRect();
  const sx = b.width / (root.offsetWidth || 1) || 1;
  const x = (r.left - b.left + r.width / 2) / sx, y = (r.top - b.top + r.height / 2) / sx;
  const dot = document.createElement("span");
  dot.className = "so-touch";
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  root.appendChild(dot);
  k.fromTo(dot, { scale: 0.3, opacity: 0.7 }, { scale: 1.6, opacity: 0, duration: 0.42, ease: "power2.out", onComplete: () => dot.remove() });
  await k.sleep(kind === "doubleTap" ? 260 : 160);
}

const NEAR: Record<string, string> = { a: "sq", s: "ad", d: "sf", e: "wr", o: "ip", i: "uo", t: "ry", n: "bm", r: "et", l: "k", h: "gj", m: "n", u: "yi" };

/** Types text into an element key by key, with now and then a typo that gets fixed. */
export async function typeInto(k: Kit, el: HTMLElement, text: string, opts: { phone?: boolean; skill?: number } = {}) {
  const skill = opts.skill ?? 0.7;
  const press = (key: string) => { if (opts.phone) { if (chance(0.25)) (k.host as SoHost).thumb?.("tap"); } else k.tap(key); };
  el.textContent = "";
  // by whole characters, so an emoji is typed as one and never half a surrogate pair
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const near = NEAR[ch.toLowerCase()];
    if (near && i > 2 && chance(0.04 * (1.4 - skill))) {
      const wrong = near[Math.floor(Math.random() * near.length)];
      press(wrong); el.textContent += wrong;
      await k.sleep(rnd(240, 460));
      press("Backspace"); el.textContent = el.textContent!.slice(0, -1);
      await k.sleep(rnd(90, 160));
    }
    press(ch);
    el.textContent += ch;
    let d = rnd(opts.phone ? 70 : 45, opts.phone ? 130 : 95);
    if (/[.,?!]/.test(ch)) d += rnd(120, 280);
    await k.sleep(d);
  }
}

/** Smoothly scrolls a list so the element is in view (instant with reduced motion). */
export function scrollTo(k: Kit, box: HTMLElement, top: number, secs = 0.6) {
  const max = Math.max(0, box.scrollHeight - box.clientHeight);
  const to = Math.max(0, Math.min(max, top));
  if (calm()) { box.scrollTop = to; return; }
  k.to(box, { scrollTop: to, duration: secs, ease: "power2.inOut" });
}

/** A marker the desktop cursor can point at, placed anywhere inside a box (for strokes and drags). */
export function marker(box: HTMLElement) {
  const m = document.createElement("i");
  m.className = "so-mark";
  box.appendChild(m);
  return (x: number, y: number) => { m.style.left = `${x}px`; m.style.top = `${y}px`; return m; };
}

export const ICON = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c5 0 9 3.4 9 7.6s-4 7.6-9 7.6c-1 0-1.9-.1-2.8-.4L5 20.4c-.6.3-1.3-.2-1.2-.9l.5-3.2C2.9 14.9 3 13.1 3 11.1 3 6.9 7 3.5 12 3.5Zm0 2c-3.9 0-7 2.5-7 5.6 0 1.6.8 3 2.1 4.1l.4.4-.2 1.6 2.1-1 .4.1c.7.2 1.5.4 2.3.4 3.9 0 7-2.5 7-5.6s-3.2-5.6-7.1-5.6Z"/></svg>`,
  repost: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4 2 8h3v7a3 3 0 0 0 3 3h6v-2H8a1 1 0 0 1-1-1V8h3Zm12 16 4-4h-3V9a3 3 0 0 0-3-3h-6v2h6a1 1 0 0 1 1 1v7h-3Z"/></svg>`,
  send: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20.5 21.5 12 3 3.5l.1 6.6L15 12 3.1 13.9Z"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0h-2a4.5 4.5 0 0 1-9 0Zm5.5 7h2v3h-2Z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11-7.5c.6-.4.6-1.2 0-1.6l-11-7.5C7.9 3.2 7 3.7 7 4.5Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.4"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.4"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2.5 21.5 9l-2 .8-3.8 3.8.4 4.6-1.6 1.6-4.2-4.2-5 5-1.4-1.4 5-5-4.2-4.2L6.3 8.4l4.6.4L14.7 5Z"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 2c.5 3.3 4.9 5.6 4.9 11a5.5 5.5 0 0 1-11 0c0-2.4 1.1-4.3 2.4-5.6.3 1.6 1 2.6 2 3.2-.5-3.3.3-6.2 1.7-8.6Z" fill="#ff8a3d"/><path d="M12.2 11.5c1.9 1.6 3.1 3 3.1 4.9a3.3 3.3 0 0 1-6.6 0c0-1.5.8-2.6 1.8-3.4.1.8.5 1.3 1 1.6-.2-1.2.1-2.2.7-3.1Z" fill="#ffd27a"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.5 1.5-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>`,
};
