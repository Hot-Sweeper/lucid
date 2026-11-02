import { avatar as robotPortrait } from "./hire";
import type { RobotLook } from "./rig";

// A manager's profile picture. The robot portrait is always drawn underneath, so a missing or
// broken custom picture falls back to the robot instead of a broken-image symbol.
const portraits = new Map<string, string>();
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function portraitFor(provider: string, look: RobotLook | undefined, size: number) {
  const key = `${provider}\0${size}\0${JSON.stringify(look ?? {})}`;
  let svg = portraits.get(key);
  if (!svg) {
    svg = robotPortrait(provider, look ?? {}, size);
    portraits.set(key, svg);
    while (portraits.size > 200) portraits.delete(portraits.keys().next().value!);
  }
  return svg;
}

// Portrait SVGs carry their own mask and gradient ids. Each place that shows a face (list, folded
// strip, chat, editor) gets its own suffix, so a hidden copy never owns the ids a visible copy uses.
export function managerFace(o: { provider: string; look?: RobotLook; picture?: string | null; size: number; place: string; cls?: string }) {
  const svg = portraitFor(o.provider, o.look, Math.round(o.size * 1.15)).replace(/lkp\d+/g, (id) => `${id}${o.place}`);
  return `<span class="mg-face${o.cls ? ` ${o.cls}` : ""}" style="--mg-size:${o.size}px">${svg}${o.picture ? `<img src="${esc(o.picture)}" alt="" decoding="async" draggable="false">` : ""}</span>`;
}

/** Hide a custom picture that fails to load so the robot portrait shows through. */
export function wireFaceFallback(root: HTMLElement) {
  root.addEventListener("error", (e) => {
    const img = e.target as HTMLElement;
    if (img instanceof HTMLImageElement && img.parentElement?.classList.contains("mg-face")) img.hidden = true;
  }, true);
}
