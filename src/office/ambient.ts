import "./ambient.css";

// Live outdoor groups are independent of the cached ground. Stop their CSS clocks when
// they are clipped outside the scene, including close-ups inside the building.
const outdoorWatches = new WeakMap<Element, Element[]>();
const outdoorIO = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
  for (const e of entries) e.target.classList.toggle("amb-offscreen", !e.isIntersecting);
}, { rootMargin: "120px" });
export function watchOutdoorAmbient(layer: Element) {
  for (const el of outdoorWatches.get(layer) ?? []) outdoorIO?.unobserve(el);
  const elements = [...layer.querySelectorAll(".outside-live [class*='amb-']")];
  outdoorWatches.set(layer, elements);
  for (const el of elements) outdoorIO?.observe(el);
}

// Ambient life inside the offices: potted plants that sway, a cloud drifting past every window
// and a ticking second hand on wall clocks. All motion is CSS (ambient.css), nothing runs per
// frame, and prefers-reduced-motion turns it off.
//
// - ambientPlant(x, y, s) is the room's potted plant (the art world.ts always drew) with swaying leaves.
// - addRoomAmbient(el) adds the window clouds and clock second hands to rendered room art.
//   Rooms added to the page later get them automatically: importing this module watches for new
//   `.room` and `.room-art` elements, so world.ts needs no extra call.

// Stable pseudo-random numbers from a seed, so a redraw gives every element the same timing.
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** The office potted plant seen from above, at (x, y) and scale s. Its leaves sway around the pot. */
export function ambientPlant(x: number, y: number, s = 1): string {
  const q = rnd(Math.abs(Math.round(x * 31 + y * 17)) + 7);
  q();
  const dur = 4.6 + q() * 2.2;
  return `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="4" cy="10" rx="30" ry="12" fill="#2b1d10" opacity="0.15"/>
      <circle r="24" fill="#c86b4a"/><circle r="19" fill="#5a3b2a"/>
      <g class="amb-plant" style="animation-duration:${n2(dur)}s;animation-delay:${n2(-q() * dur)}s">
      <path d="M0 0 C-30 -10 -28 -34 -6 -40 C-8 -20 -4 -8 0 0 Z" fill="#3f9b6e"/>
      <path d="M0 0 C26 -14 34 -36 14 -44 C12 -24 6 -10 0 0 Z" fill="#53b884"/>
      <path d="M0 0 C-18 14 -38 6 -40 -12 C-20 -10 -8 -6 0 0 Z" fill="#46a877"/>
      <path d="M0 0 C20 10 38 0 40 -16 C22 -12 8 -6 0 0 Z" fill="#3a8f63"/></g></g>`;
}

const NS = "http://www.w3.org/2000/svg";
const num = (el: Element, a: string, d = 0) => { const v = parseFloat(el.getAttribute(a) ?? ""); return Number.isFinite(v) ? v : d; };

// One flat cloud (a few overlapping circles) drawn left of x=0, so it starts outside the window.
function cloud(cy: number, k: number, light: string, shade: string) {
  return `<ellipse cx="${-34 * k}" cy="${cy + 4 * k}" rx="${30 * k}" ry="${7 * k}" fill="${shade}"/>
    <circle cx="${-46 * k}" cy="${cy}" r="${10 * k}" fill="${light}"/><circle cx="${-32 * k}" cy="${cy - 5 * k}" r="${13 * k}" fill="${light}"/>
    <circle cx="${-18 * k}" cy="${cy + 1 * k}" r="${9 * k}" fill="${light}"/><rect x="${-56 * k}" y="${cy}" width="${46 * k}" height="${9 * k}" rx="${4.5 * k}" fill="${light}"/>`;
}

// A window's sky rect gets a clipped layer right above it with a big slow cloud and a small faster one.
function addClouds(sky: SVGRectElement) {
  if (sky.nextElementSibling?.classList.contains("amb-window")) return;
  const x = num(sky, "x"), y = num(sky, "y"), w = num(sky, "width"), h = num(sky, "height");
  if (w < 30 || h < 20) return;
  const box = document.createElementNS(NS, "svg");
  box.setAttribute("class", "amb-window");
  for (const [a, v] of [["x", x], ["y", y], ["width", w], ["height", h]] as const) box.setAttribute(a, String(v));
  box.setAttribute("overflow", "hidden");
  box.style.opacity = "calc(0.92 - var(--stars, 0) * 0.62)";
  const d1 = 80 + Math.random() * 50, d2 = 45 + Math.random() * 30;
  const k1 = Math.min(1, h / 56), k2 = k1 * 0.6;
  box.innerHTML = `
    <g class="amb-cloud" style="--d:${n2(w + 62 * k2)}px;animation-duration:${n2(d2)}s;animation-delay:${n2(-Math.random() * d2)}s;opacity:0.7">${cloud(h * 0.28, k2, "#ffffff", "#e3eefa")}</g>
    <g class="amb-cloud" style="--d:${n2(w + 62 * k1)}px;animation-duration:${n2(d1)}s;animation-delay:${n2(-Math.random() * d1)}s">${cloud(h * 0.58, k1, "#ffffff", "#e3eefa")}</g>`;
  sky.after(box);
}

// A second hand next to the clock's minute hand, in the color of the clock's center cap.
function addSecondHand(minute: SVGElement) {
  const face = minute.parentElement;
  if (!face || face.querySelector(".clock-s")) return;
  const len = Math.max(8, -num(minute, "y", -20));
  const cap = [...face.children].reverse().find((c) => c.tagName.toLowerCase() === "circle" && c !== face.firstElementChild);
  const color = cap?.getAttribute("fill") || "#e2626b";
  const now = new Date();
  const hand = document.createElementNS(NS, "g");
  hand.setAttribute("class", "clock-s");
  hand.style.animationDelay = `${n2(-(now.getSeconds() + now.getMilliseconds() / 1000))}s`;
  hand.innerHTML = `<rect x="-0.6" y="${n2(-len - 1)}" width="1.2" height="${n2(len + 6)}" rx="0.6" fill="${color}"/>`;
  if (cap && cap.compareDocumentPosition(minute) & Node.DOCUMENT_POSITION_PRECEDING) face.insertBefore(hand, cap);
  else face.appendChild(hand);
}

/** Adds window clouds and clock second hands to every room drawing inside el. Safe to call twice. */
export function addRoomAmbient(el: ParentNode) {
  el.querySelectorAll<SVGRectElement>('rect[fill^="url(#sky"]').forEach(addClouds);
  el.querySelectorAll<SVGElement>(".clock-m").forEach(addSecondHand);
}

// Rooms are rebuilt whenever the floor plan changes; give each new one its clouds and second hand.
// The filter is a class check per added node, so other DOM churn costs next to nothing.
if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  const isRoom = (n: Node): n is Element => n instanceof Element && (n.classList.contains("room") || n.classList.contains("room-art"));
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (isRoom(n)) addRoomAmbient(n);
  }).observe(document.documentElement, { childList: true, subtree: true });
  addRoomAmbient(document);
}
