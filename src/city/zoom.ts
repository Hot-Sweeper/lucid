// Zooming without lag. The outdoors is one big vector image (.outside-img); every time the camera's
// scale changes the browser redraws it at the new scale, which costs tens of milliseconds a frame.
// So once the image has loaded, a bitmap copy of it is made (about 3200 px wide, drawn once in idle
// time). While the scale keeps changing the copy stands in for the image (stretching a bitmap is
// nearly free), and the sharp image comes back as soon as the zoom settles. Panning never swaps.
//
// Importing this module is enough: it watches for new .outside-img elements and for camera changes
// on their .world, like ambient.ts does for rooms. Nothing runs per frame.

const QUICK_W = 3200;       // the copy's width in pixels (height follows the image)
const SETTLE_MS = 220;      // the sharp image returns this long after the last scale change

const scaleOf = (el: HTMLElement) => {
  const m = /scale\(([-\d.e]+)/.exec(el.style.transform);
  return m ? Number(m[1]) : 1;
};
const idle = (f: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 200));

function prepare(img: HTMLImageElement) {
  const layer = img.parentElement;
  if (!layer || img.dataset.quick) return;
  img.dataset.quick = "1";
  const cv = document.createElement("canvas");
  cv.className = "outside-quick";
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;visibility:hidden";
  img.after(cv);
  const draw = () => {
    if (!img.isConnected || !img.naturalWidth) return;
    const k = Math.min(1, QUICK_W / img.naturalWidth);
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = cv.getContext("2d");
    if (!g) return;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    cv.dataset.ready = "1";
  };
  if (img.complete && img.naturalWidth) idle(draw);
  else img.addEventListener("load", () => idle(draw), { once: true });
  watchCamera(img.closest(".world") as HTMLElement | null);
}

const watched = new WeakSet<HTMLElement>();
function watchCamera(world: HTMLElement | null) {
  if (!world || watched.has(world)) return;
  watched.add(world);
  let last = scaleOf(world), timer = 0;
  const settle = () => {
    world.querySelectorAll(".outside-layer.zooming").forEach((l) => l.classList.remove("zooming"));
  };
  new MutationObserver(() => {
    const s = scaleOf(world);
    if (Math.abs(s - last) < 1e-6) return;
    last = s;
    const layer = world.querySelector(".outside-layer");
    if (layer?.querySelector("canvas.outside-quick[data-ready]")) layer.classList.add("zooming");
    clearTimeout(timer);
    timer = window.setTimeout(settle, SETTLE_MS);
  }).observe(world, { attributes: true, attributeFilter: ["style"] });
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const check = (n: Node) => {
    if (!(n instanceof Element)) return;
    if (n.classList.contains("outside-img")) prepare(n as HTMLImageElement);
    else if (n.classList.contains("outside-layer") || n.classList.contains("world")) n.querySelectorAll<HTMLImageElement>("img.outside-img").forEach(prepare);
  };
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) check(n);
      // world.ts swaps the image by setting the layer's innerHTML
      if (m.target instanceof Element && m.target.classList.contains("outside-layer")) m.target.querySelectorAll<HTMLImageElement>("img.outside-img").forEach(prepare);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll<HTMLImageElement>("img.outside-img").forEach(prepare);
}
