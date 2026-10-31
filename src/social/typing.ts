// "Typing..." for every chat-like app: the other side types for a believable time that fits
// the message length, shown in the app's own idiom (header line, dots bubble, peeking avatar),
// and only then does the message arrive.
import { Kit, rnd, chance, h, calm } from "./kit";
import "./chatkit.css";

/** How long someone types a message this long: 40 to 80 ms a character, clamped. */
export function typingMs(text: string | undefined, min = 1100, max = 5200) {
  const n = text?.length || 10;
  return Math.max(min, Math.min(max, n * rnd(40, 80)));
}

/** Three dots that bob in turn (CSS animation, transform and opacity only). */
export const DOTS = `<span class="so-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;

/**
 * The other side types. `show` turns the app's indicator on and returns its own undo.
 * Long messages now and then pause halfway (the dots vanish a moment), like someone rewording.
 */
export async function theyType(k: Kit, text: string | undefined, show: () => () => void, o: { min?: number; max?: number } = {}) {
  const total = typingMs(text, o.min, o.max);
  let off: (() => void) | null = show();
  try {
    if ((text?.length ?? 0) > 36 && chance(0.3)) {
      const a = total * rnd(0.35, 0.55);
      await k.sleep(a);
      off(); off = null;
      await k.sleep(rnd(500, 1100));
      off = show();
      await k.sleep(total - a);
    } else await k.sleep(total);
  } finally { off?.(); }
}

/** A chat bubble holding the dots at the end of a message list. Returns the remover. */
export function dotsBubble(k: Kit, list: HTMLElement, cls: string, lead = "") {
  const b = h("div", cls, lead + DOTS);
  list.appendChild(b);
  if (!calm()) k.fromTo(b, { opacity: 0, scale: 0.7, transformOrigin: "0% 100%" }, { opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2)" });
  return () => b.remove();
}

/** A header subtitle that reads "typing" with animated dots for a while. Returns the undo. */
export function headerTyping(sub: HTMLElement, label: string, cls = "typing") {
  const was = sub.innerHTML;
  sub.innerHTML = `${label}${DOTS}`;
  sub.classList.add(cls);
  return () => { sub.innerHTML = was; sub.classList.remove(cls); };
}
