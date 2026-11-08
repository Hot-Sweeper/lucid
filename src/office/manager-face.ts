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
    // Frame the actual head and hat, rather than the portrait's roomy artboard.
    // Measure only on a cache miss; detached SVGs have no usable bounds in Chromium.
    const frame = document.createElement("div");
    frame.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict";
    frame.innerHTML = svg;
    document.body.append(frame);
    try {
      const bounds = frame.querySelector("svg")!.getBBox();
      const side = Math.max(bounds.width, bounds.height) * 1.2;
      if (side > 0) {
        const x = bounds.x + bounds.width / 2 - side / 2;
        const y = bounds.y + bounds.height / 2 - side / 2;
        svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${side} ${side}"`);
      }
    } finally { frame.remove(); }
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
