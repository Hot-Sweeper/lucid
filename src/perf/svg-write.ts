/** Avoid invalidating SVG style/paint when a rig's rounded geometry did not change.
 * Read the attribute itself so GSAP, customization and other writers remain authoritative.
 * getAttribute does not force layout, unlike geometry reads in an animation callback.
 */
export function setSvgAttribute(el: SVGElement, name: string, value: string) {
  if (name === "opacity") { setSvgOpacity(el, value); return; }
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

// Chromium gives every SVG element with an `opacity` below 1 its own effect group: an extra
// node to sort into GPU layers on every frame (Layerize) and an offscreen pass when painting.
// The office art has hundreds of these for shading, which made each frame cost about twice a
// 144 Hz budget. For a shape with only a fill or only a stroke, fill-opacity/stroke-opacity draw
// exactly the same pixels without the group, and a part at opacity 0 can leave paint entirely.

const SHAPES = new Set(["rect", "ellipse", "circle", "path", "polygon", "polyline", "line"]);
/** Shapes whose opacity now lives in fill-opacity/stroke-opacity: their original values. */
const flattened = new WeakMap<Element, { fill: number; stroke: number }>();
/** Parts this module hid with display:none because their opacity reached 0. */
const hidden = new WeakSet<Element>();

const num = (value: string | null, fallback = 1) => {
  const n = value == null || value === "" ? NaN : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);

/** The element's paint for one property, following SVG inheritance up to its <svg>. */
function inherited(el: Element, name: "fill" | "stroke") {
  for (let e: Element | null = el; e && e.localName !== "foreignObject"; e = e.parentElement) {
    const style = e.getAttribute("style");
    const fromStyle = style && new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1]?.trim();
    const value = fromStyle || e.getAttribute(name);
    if (value && value !== "inherit") return value;
    if (e.localName === "svg") break;
  }
  return name === "fill" ? "black" : "none";
}

function flattenOne(el: Element) {
  if (flattened.has(el) || !SHAPES.has(el.localName) || el.firstElementChild) return;
  const opacity = num(el.getAttribute("opacity"), 1);
  if (!(opacity > 0 && opacity < 1)) return;
  // Fill and stroke together overlap: group opacity blends them once, separate opacities twice.
  if (inherited(el, "fill") !== "none" && inherited(el, "stroke") !== "none") return;
  if (el.closest("defs, mask, clipPath, pattern, .screen")) return;
  const base = { fill: num(el.getAttribute("fill-opacity")), stroke: num(el.getAttribute("stroke-opacity")) };
  flattened.set(el, base);
  el.setAttribute("fill-opacity", fmt(base.fill * opacity));
  el.setAttribute("stroke-opacity", fmt(base.stroke * opacity));
  el.removeAttribute("opacity");
}

/** Convert the semi-transparent shapes under root (inclusive). Safe to call repeatedly. */
export function flattenSvgOpacity(root: Element) {
  if (root.hasAttribute("opacity")) flattenOne(root);
  for (const el of root.querySelectorAll("[opacity]")) flattenOne(el);
}

/** Set an element's opacity, keeping flattened shapes and hidden parts consistent. */
export function setSvgOpacity(el: SVGElement, value: string) {
  const opacity = num(value, 1);
  if (opacity <= 0 && !flattened.has(el)) {
    // Hidden parts leave paint and layerization entirely while they stay invisible.
    if (el.getAttribute("display") !== "none") { el.setAttribute("display", "none"); hidden.add(el); }
    if (el.getAttribute("opacity") !== "0") el.setAttribute("opacity", "0");
    return;
  }
  if (hidden.has(el)) { hidden.delete(el); el.removeAttribute("display"); }
  const base = flattened.get(el);
  if (base) {
    const f = fmt(base.fill * opacity), s = fmt(base.stroke * opacity);
    if (el.getAttribute("fill-opacity") !== f) el.setAttribute("fill-opacity", f);
    if (el.getAttribute("stroke-opacity") !== s) el.setAttribute("stroke-opacity", s);
    return;
  }
  if (el.getAttribute("opacity") !== value) el.setAttribute("opacity", value);
}

/** Flatten office art as it is added: robots, desks and rooms (not monitor apps). */
export function watchSvgOpacity(root: Element) {
  flattenSvgOpacity(root);
  const pending = new Set<Element>();
  let queued = false;
  const flush = () => { queued = false; for (const el of pending) if (el.isConnected) flattenSvgOpacity(el); pending.clear(); };
  const observer = new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) if (node instanceof Element && !(node instanceof HTMLElement && node.closest(".screen"))) pending.add(node);
    if (pending.size && !queued) { queued = true; queueMicrotask(flush); }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
