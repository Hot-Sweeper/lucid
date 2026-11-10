import "@fontsource-variable/lexend";
import "./decor.css";
import {
  DECOR, DECOR_IDS, FLOORS, WALLS, drawDecor, drawFloor, drawWall, placeDecor, regularDecor, windowSlots,
  type DecorId, type FloorId, type WallId,
} from "./decor";

// Demo of the office decor pack. URL params (all optional):
//   floor=wood|oak|carpet|tiles|concrete|terrazzo   wall=warm|cool|mint|lilac|dusk|brick
//   desks=0|2|3   night=1   only=room|grid

const qs = new URLSearchParams(location.search);
// size=WxH tries another room size (default 1300x700)
const [W, H] = (qs.get("size") || "1300x700").split("x").map(Number);
const WF = 110, T = 16;
const state = {
  floor: (qs.get("floor") as FloorId) || "wood",
  wall: (qs.get("wall") as WallId) || "warm",
  desks: Number(qs.get("desks") ?? 2),
  night: qs.get("night") === "1",
};
const ONLY = qs.get("only");

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --ink: #eef0ff; --dim: #a9afc9; --accent: #ff9f5a;
    --sky1: #6fb2ee; --sky2: #d4ecfb; --stars: 0; --lamp: 0.1; color-scheme: dark; }
  :root.night { --sky1: #0b1030; --sky2: #262c62; --stars: 1; --lamp: 1; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #20253d; color: var(--ink); font-family: var(--font); }
  #demo { max-width: 1340px; margin: 0 auto; padding: 22px 20px 48px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 14px; }
  h2 { font-size: 16px; font-weight: 600; margin: 34px 0 12px; }
  .bar { display: flex; flex-wrap: wrap; gap: 18px 28px; align-items: flex-end; margin-bottom: 14px; }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .group > span { font-size: 12px; color: var(--dim); }
  .swatches { display: flex; gap: 6px; }
  .swatches button { width: 44px; height: 32px; padding: 0; border: 0; border-radius: 6px; cursor: pointer; overflow: hidden;
    background: none; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color 120ms; }
  .swatches button svg { display: block; width: 100%; height: 100%; }
  .swatches button:hover { outline-color: rgba(255,255,255,0.35); }
  .swatches button[aria-checked="true"] { outline-color: var(--accent); }
  .swatches button:focus-visible { outline-color: #fff; }
  .seg { display: flex; background: #161a2e; border-radius: 8px; padding: 3px; }
  .seg button { border: 0; background: none; color: var(--dim); font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
  .seg button:hover { color: var(--ink); }
  .seg button[aria-checked="true"] { background: #2d3352; color: var(--ink); }
  input[type=range] { -webkit-appearance: none; appearance: none; width: 170px; height: 4px; border-radius: 2px; background: #2d3352; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; }
  .toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; border: 0; background: none; color: var(--ink); padding: 4px 0; font: inherit; }
  .toggle i { width: 34px; height: 20px; border-radius: 10px; background: #2d3352; position: relative; transition: background 160ms; }
  .toggle i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #c9cfe6; transition: transform 160ms; }
  .toggle[aria-checked="true"] i { background: var(--accent); }
  .toggle[aria-checked="true"] i::after { transform: translateX(14px); background: #fff; }
  .room { display: block; width: 100%; height: auto; border-radius: 6px; }
  .note { font-size: 13px; color: var(--dim); margin: 8px 0 0; min-height: 1.4em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 22px 18px; }
  .cell svg { display: block; width: 100%; height: auto; border-radius: 6px; }
  .cell p { margin: 7px 0 0; font-size: 13px; display: flex; justify-content: space-between; }
  .cell p span { color: var(--dim); }
`;
document.head.appendChild(style);

const root = document.getElementById("demo")!;
root.innerHTML = `
  <h1>Office decor</h1>
  <div class="bar">
    <div class="group"><span id="floor-label">Floor</span><div class="swatches" role="radiogroup" aria-labelledby="floor-label" data-k="floor"></div></div>
    <div class="group"><span id="wall-label">Wall</span><div class="swatches" role="radiogroup" aria-labelledby="wall-label" data-k="wall"></div></div>
    <div class="group"><span id="desk-label">Desks</span><div class="seg" role="radiogroup" aria-labelledby="desk-label" data-k="desks"></div></div>
    <button type="button" class="toggle" role="switch" aria-checked="false"><i></i>Night</button>
  </div>
  <div id="room"></div>
  <p class="note" id="note"></p>
  <h2>Every item</h2>
  <div class="grid" id="grid"></div>`;

// ---------------------------------------------------------------------------------------------
// room scene, mirroring roomSvg in src/office/world.ts

function windows(uidSky: string) {
  return windowSlots(W).map(({ x, w }) => {
    const wx = x + 10, ww = w - 20, trim = WALLS[state.wall].trim;
    return `
      <rect x="${wx - 6}" y="${T + 14}" width="${ww + 12}" height="${WF - T - 30}" rx="6" fill="${trim}"/>
      <rect x="${wx}" y="${T + 20}" width="${ww}" height="${WF - T - 42}" rx="3" fill="url(#${uidSky})"/>
      <g style="opacity:var(--stars)">${Array.from({ length: 7 }, (_, k) => `<circle cx="${wx + 8 + ((k * 61) % (ww - 16))}" cy="${T + 26 + ((k * 23) % 30)}" r="${k % 3 ? 1 : 1.6}" fill="#fff"/>`).join("")}</g>
      <rect x="${wx + ww / 2 - 2}" y="${T + 20}" width="4" height="${WF - T - 42}" fill="${trim}"/>
      <rect x="${wx - 10}" y="${WF - 14}" width="${ww + 20}" height="6" rx="3" fill="${trim}"/>`;
  }).join("");
}

function sign() {
  return `<g transform="translate(34 ${T + 10})">
    <rect width="140" height="${WF - T - 24}" rx="10" fill="#ffffff" opacity="0.94"/>
    <rect x="10" y="12" width="46" height="46" rx="12" fill="#ff9f5a"/>
    <text x="33" y="42" text-anchor="middle" font-size="19" font-weight="600" fill="#fff" style="font-family:var(--font)">MO</text>
    <text x="64" y="32" font-size="13" font-weight="600" fill="#3a3f4f" style="font-family:var(--font)">Main</text>
    <text x="64" y="48" font-size="13" font-weight="600" fill="#3a3f4f" style="font-family:var(--font)">office</text>
  </g>`;
}

function clock() {
  return `<g transform="translate(${W - 80} ${T + 46})">
    <circle r="28" fill="#fff"/><circle r="24" fill="#f6f2ea"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="-1" y="-22" width="2" height="${i % 3 ? 3 : 6}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
    <rect x="-1.8" y="-13" width="3.6" height="15" rx="1.8" fill="#3a3f4f" transform="rotate(305)"/>
    <rect x="-1.2" y="-20" width="2.4" height="22" rx="1.2" fill="#3a3f4f" transform="rotate(60)"/>
    <circle r="2.6" fill="#ff9f5a"/></g>`;
}

// A stand-in for the real desk unit (400x380): table, monitor and chair.
function desk(x: number, y: number, hue: string) {
  return `<g transform="translate(${x} ${y})">
    <ellipse cx="200" cy="276" rx="172" ry="12" fill="#2b1d10" opacity="0.18"/>
    <rect x="34" y="244" width="332" height="24" rx="6" fill="#b48a5e"/>
    <rect x="34" y="180" width="332" height="76" rx="8" fill="#d7b48a"/>
    <rect x="40" y="184" width="320" height="3" rx="1.5" fill="#fff" opacity="0.25"/>
    <ellipse cx="200" cy="194" rx="30" ry="9" fill="#4a5063"/><rect x="193" y="170" width="14" height="22" fill="#3a3f4f"/>
    <rect x="54" y="4" width="292" height="172" rx="12" fill="#2e3242"/>
    <rect x="62" y="12" width="276" height="155" rx="6" fill="${hue}"/>
    <rect x="80" y="30" width="130" height="80" rx="5" fill="#fff" opacity="0.85"/>
    <rect x="90" y="44" width="80" height="5" rx="2.5" fill="#c9cfdb"/><rect x="90" y="56" width="100" height="5" rx="2.5" fill="#c9cfdb"/><rect x="90" y="68" width="64" height="5" rx="2.5" fill="#c9cfdb"/>
    <rect x="200" y="70" width="120" height="80" rx="5" fill="#22263a" opacity="0.9"/>
    <rect x="212" y="84" width="60" height="4" rx="2" fill="#4ff0a0"/><rect x="212" y="96" width="86" height="4" rx="2" fill="#4fb6ff"/><rect x="212" y="108" width="40" height="4" rx="2" fill="#ffd27a"/>
    <rect x="146" y="205" width="108" height="34" rx="7" fill="#2e3242"/>
    <rect x="152" y="210" width="96" height="24" rx="3" fill="#4a5063"/>
    <ellipse cx="278" cy="226" rx="9" ry="12" fill="#2e3242"/>
    <ellipse cx="200" cy="304" rx="40" ry="22" fill="#3a3f4f"/>
    <rect x="164" y="300" width="72" height="44" rx="16" fill="#4a5063"/>
    <ellipse cx="200" cy="268" rx="26" ry="22" fill="#c9cfdb"/><ellipse cx="200" cy="262" rx="18" ry="12" fill="#e9edf5"/>
  </g>`;
}

function deskRects() {
  const xs = state.desks === 3 ? (W >= 1380 ? [70, 490, 910] : [40, 450, 860]) : state.desks === 2 ? [70, 490] : [];
  return xs.map((x) => ({ x, y: WF + 40, w: 400, h: 380 }));
}

function renderRoom() {
  const items = regularDecor();
  const desks = deskRects();
  const placed = placeDecor(items, W, H, WF, desks);
  const sky = "sky" + Math.random().toString(36).slice(2, 7);
  const hues = ["#3b4a7a", "#3f5f6e", "#4b3f6e"];
  const svg = `<svg class="room" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Office with ${placed.length} decorations">
    <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient></defs>
    ${drawFloor(state.floor, W, H, WF)}
    <rect y="${WF}" width="${W}" height="18" fill="#000" opacity="0.07"/>
    ${drawWall(state.wall, W, WF)}
    ${windows(sky)}${sign()}${clock()}
    ${placed.map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("")}
    <rect width="${W}" height="${T}" fill="#3a3f4f"/><rect width="${T}" height="${H}" fill="#3a3f4f"/>
    <rect x="${W - T}" width="${T}" height="${H}" fill="#3a3f4f"/><rect y="${H - T}" width="${W}" height="${T}" fill="#3a3f4f"/>
    <rect x="${W / 2 - 60}" y="${H - T}" width="120" height="${T}" fill="#8f8a7f"/>
    ${state.night ? `<rect width="${W}" height="${H}" fill="#0b1030" opacity="0.27"/>` : ""}
    ${desks.map((d, i) => desk(d.x, d.y, hues[i % 3])).join("")}
  </svg>`;
  document.getElementById("room")!.innerHTML = svg;
  const left = items.filter((id) => !placed.some((p) => p.id === id));
  const names = (ids: DecorId[]) => ids.map((id) => DECOR[id].name.toLowerCase()).join(", ");
  document.getElementById("note")!.textContent = left.length
    ? `No room left for: ${names(left)}.`
    : items.length ? `${items.length} of ${DECOR_IDS.length} decorations unlocked.` : "Nothing unlocked yet.";
}

// ---------------------------------------------------------------------------------------------
// item grid

function renderGrid() {
  const CW = 300, CH = 230, wf = 104;
  const cells = DECOR_IDS.map((id) => {
    const spot = DECOR[id].spot;
    const showWall = spot !== "floor";
    const x = CW / 2, y = spot === "wall" ? wf : spot === "corner" ? CH - 34 : (showWall ? wf : 0) + (CH - (showWall ? wf : 0)) / 2;
    const top = showWall ? wf : 0;
    const svg = `<svg viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" role="img" aria-label="${DECOR[id].name}">
      ${drawFloor(state.floor, CW, CH, top)}
      ${showWall ? `<rect y="${wf}" width="${CW}" height="14" fill="#000" opacity="0.07"/>${drawWall(state.wall, CW, wf)}<rect width="${CW}" height="10" fill="#3a3f4f"/>` : ""}
      ${drawDecor(id, x, y, id === "rug" || id === "pingpong" ? 0.82 : 1)}
      ${state.night ? `<rect width="${CW}" height="${CH}" fill="#0b1030" opacity="0.27"/>` : ""}
    </svg>`;
    return `<div class="cell">${svg}<p>${DECOR[id].name}${DECOR[id].season ? `<span>${DECOR[id].season}</span>` : ""}</p></div>`;
  });
  document.getElementById("grid")!.innerHTML = cells.join("");
}

// ---------------------------------------------------------------------------------------------
// controls

function swatchFloor(id: FloorId) { return `<svg viewBox="0 0 88 64" preserveAspectRatio="xMidYMid slice">${drawFloor(id, 88, 64, 0)}</svg>`; }
function swatchWall(id: WallId) { return `<svg viewBox="0 0 88 64" preserveAspectRatio="xMidYMid slice">${drawWall(id, 88, 64)}</svg>`; }

function renderControls() {
  const fl = root.querySelector('[data-k="floor"]')!, wl = root.querySelector('[data-k="wall"]')!, dk = root.querySelector('[data-k="desks"]')!;
  fl.innerHTML = (Object.keys(FLOORS) as FloorId[]).map((id) => `<button type="button" role="radio" data-v="${id}" aria-checked="${id === state.floor}" aria-label="${FLOORS[id].name}" title="${FLOORS[id].name}">${swatchFloor(id)}</button>`).join("");
  wl.innerHTML = (Object.keys(WALLS) as WallId[]).map((id) => `<button type="button" role="radio" data-v="${id}" aria-checked="${id === state.wall}" aria-label="${WALLS[id].name}" title="${WALLS[id].name}">${swatchWall(id)}</button>`).join("");
  dk.innerHTML = [[0, "None"], [2, "Two"], [3, "Three"]].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === state.desks}">${l}</button>`).join("");
  const tg = root.querySelector(".toggle") as HTMLButtonElement;
  tg.setAttribute("aria-checked", String(state.night));
  document.documentElement.classList.toggle("night", state.night);
}

root.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const group = b.parentElement?.getAttribute("data-k");
  if (group === "floor") state.floor = b.dataset.v as FloorId;
  else if (group === "wall") state.wall = b.dataset.v as WallId;
  else if (group === "desks") state.desks = Number(b.dataset.v);
  else if (b.classList.contains("toggle")) state.night = !state.night;
  else return;
  render();
// zoom=2 enlarges the page, for checking small details in captures
if (qs.get("zoom")) (document.body.style as any).zoom = qs.get("zoom");
});

function render() {
  renderControls();
  renderRoom();
  renderGrid();
  if (ONLY === "room") (root.querySelector("h2") as HTMLElement).style.display = (document.getElementById("grid") as HTMLElement).style.display = "none";
  if (ONLY === "grid") for (const s of [".bar", "#room", "#note", "h1"]) (root.querySelector(s) as HTMLElement).style.display = "none";
}
render();
// zoom=2 enlarges the page, for checking small details in captures
if (qs.get("zoom")) (document.body.style as any).zoom = qs.get("zoom");
