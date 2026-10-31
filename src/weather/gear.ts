// What robots wear outdoors in the weather: an umbrella in the rain, a scarf (and breath puffs)
// in the cold, a sun hat and sunglasses in the heat. The pieces are slipped into the walker's own
// svg groups (src/world/walker.ts), so they move with the robot without any per-frame work.
// Coordinates are the walker's v0 units: head 490..630 x 600..718, neck at y 730, feet at y 935.

import type { Weather } from "./types";
import "./weather.css";

export type Gear = "umbrella" | "scarf" | "sun" | null;

/** What to wear outside in this weather (null: nothing special). */
export function gearFor(w: Weather | null): Gear {
  if (!w) return null;
  if (w.kind === "rain" || w.kind === "drizzle" || w.kind === "storm") return "umbrella";
  if (w.kind === "snow" || w.tempC < 3) return "scarf";
  if (w.tempC > 26 && w.kind !== "fog") return "sun";
  return null;
}

const COLS = ["#e2626b", "#4fb6ff", "#ffd27a", "#3fbf86", "#b07cff", "#ff9f5a"];
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const darker = (c: string) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.78).toString(16).padStart(2, "0")).join("");

function umbrella(col: string, alt: string) {
  // the canopy leans a little to the robot's right, where the shaft runs down behind the head
  let scallops = "", ribs = "";
  for (let i = 0; i < 6; i++) {
    const x = 452 + i * 46;
    scallops += `q23 16 46 0`;
    ribs += `M590 434 Q${x + 30} 470 ${x + 46} 522`;
  }
  return `<g class="wx-umb">
    <path d="M600 450 L604 790" stroke="#3a3f4f" stroke-width="7" stroke-linecap="round"/>
    <path d="M452 522 Q450 440 590 432 Q730 440 728 522 Z" fill="${col}"/>
    <path d="M498 522 Q520 452 590 432 Q560 470 544 522 Z M636 522 Q620 470 590 432 Q660 452 682 522 Z" fill="${alt}"/>
    <path d="M452 520 ${scallops} L728 522 Z" fill="${col}"/>
    <path d="${ribs}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3" fill="none"/>
    <path d="M492 486 Q520 452 568 442" stroke="#ffffff" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round" fill="none"/>
    <circle cx="590" cy="428" r="7" fill="#3a3f4f"/>
  </g>`;
}

function scarfWrap(col: string, alt: string) {
  return `<rect x="519" y="716" width="82" height="26" rx="13" fill="${col}"/>
    <path d="M532 718 v22 M552 717 v24 M572 717 v24 M590 718 v22" stroke="${alt}" stroke-width="6"/>`;
}
// the loose end hangs in front, so it lives in the chest group (only shown when the robot faces us)
function scarfTail(col: string, alt: string) {
  return `<path d="M574 734 L582 792 L600 789 L594 732 Z" fill="${col}"/><path d="M577 754 L596 752 M579 770 L598 768" stroke="${alt}" stroke-width="5"/>
    <path d="M584 792 v8 M590 791 v8 M596 790 v8" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
}
const puff = (x: number, y: number, delay: number) =>
  `<g class="wx-puff" style="animation-delay:${delay.toFixed(2)}s"><circle cx="${x}" cy="${y}" r="10" fill="#ffffff" opacity="0.85"/><circle cx="${x + 10}" cy="${y - 5}" r="7" fill="#ffffff" opacity="0.7"/></g>`;

function sunHat(band: string) {
  return `<ellipse cx="560" cy="606" rx="98" ry="17" fill="#d9b765"/>
    <path d="M506 604 Q508 552 560 548 Q612 552 614 604 Z" fill="#f0d48c"/>
    <path d="M507 590 Q560 578 613 590 L614 601 Q560 589 506 601 Z" fill="${band}"/>
    <ellipse cx="560" cy="602" rx="90" ry="12" fill="#e9c97a"/>`;
}
const SHADES = `<rect x="516" y="642" width="40" height="28" rx="12" fill="#1d2233"/><rect x="564" y="642" width="40" height="28" rx="12" fill="#1d2233"/>
  <path d="M556 652 h8" stroke="#1d2233" stroke-width="5"/><path d="M524 650 l10 -3 M572 650 l10 -3" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3.5" stroke-linecap="round"/>`;
const SIDE_SHADES = `<rect x="584" y="642" width="34" height="26" rx="11" fill="#1d2233"/><path d="M590 650 l10 -3" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3.5" stroke-linecap="round"/>`;

const NS = "http://www.w3.org/2000/svg";
function put(parent: Element | null, svg: string, first = false) {
  if (!parent) return;
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "wx-gear");
  g.innerHTML = svg;
  if (first) parent.insertBefore(g, parent.firstChild); else parent.appendChild(g);
}

/** Dress a walker (its element, `.world-walker`) for the weather; null takes everything off again. */
export function dress(el: HTMLElement, gear: Gear, seed = el.dataset.id ?? "") {
  if ((el.dataset.gear ?? "") === (gear ?? "")) return;
  el.dataset.gear = gear ?? "";
  el.querySelectorAll(".wx-gear").forEach((g) => g.remove());
  if (!gear) return;
  const svg = el.querySelector("svg");
  if (!svg) return;
  const $ = (k: string) => svg.querySelector(`[data-r="${k}"]`);
  const h = hash(seed), col = COLS[h % COLS.length], alt = COLS[(h >> 3) % COLS.length] === col ? "#ffffff" : COLS[(h >> 3) % COLS.length];
  if (gear === "umbrella") put($("rig"), umbrella(col, h & 1 ? darker(col) : "#ffffff"), true);
  else if (gear === "scarf") {
    put($("body"), scarfWrap(col, alt));
    put($("chest"), scarfTail(col, alt));
    const d = -((h % 30) / 10);
    put($("face"), puff(566, 712, d));
    put($("sideHead"), puff(630, 690, d));
  } else if (gear === "sun") {
    // behind the head, so the antenna still pokes out over the hat
    put($("head"), sunHat(col), true);
    put($("face"), SHADES);
    put($("sideHead"), SIDE_SHADES);
  }
}
