import "@fontsource-variable/lexend";
import "./office.css";
import "../decor/decor.css";
import { outsideSvg, PARK_W, PARK_H } from "./outside";
import { ambientPlant } from "./ambient";
import { drawDecor, drawWall, placeDecor, seasonalDecor, DECOR, type DecorId } from "../decor/decor";
import type { Season } from "../weather/season";

// Demo of the ambient life (park, trees, animals, offices) and the seasonal decor.
// A world laid out like world.ts (top row, hallway, project offices, the park beside it).
// Drag to pan, wheel to zoom. URL params (for scripted captures):
//   season=spring|summer|autumn|winter  time=day|dusk|night  snow=0..1  wind=0..1
//   view=park|wide|far|office|offices|pond|fountain|clock|plain|winter|summer|spring|items
//   mode=split|img|dom (see render below)  anim=0 (all loops off)  ui=0
// For scripted timing: fitView(name), setAnim(on), measure(ms) resolves to frame statistics.

const qs = new URLSearchParams(location.search);
const state = {
  season: (qs.get("season") as Season) || "summer",
  time: (qs.get("time") || "day") as "day" | "dusk" | "night",
  snow: Number(qs.get("snow") ?? (qs.get("season") === "winter" ? 0.6 : 0)),
  wind: Number(qs.get("wind") ?? 0.2),
};

const css = document.createElement("style");
css.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; color-scheme: dark; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #20253d; font-family: var(--font); }
  .scene { position: fixed; inset: 0; }
  .no-anim *, .no-anim *::before { animation: none !important; }
  .demo-ui { position: fixed; left: 16px; top: 16px; z-index: 60; display: grid; gap: 8px; padding: 12px 14px; border-radius: 10px;
    background: rgba(20, 26, 51, 0.88); color: #eef0ff; font-size: 13px; }
  .demo-ui .row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .demo-ui .row > span { width: 58px; color: #b9bfe6; }
  .demo-ui button { font: inherit; border: 0; padding: 5px 9px; border-radius: 6px; cursor: pointer; background: transparent; color: #b9bfe6; }
  .demo-ui button:hover { background: rgba(255, 255, 255, 0.08); color: #eef0ff; }
  .demo-ui button[aria-pressed="true"] { background: #3c4680; color: #fff; }
  .demo-ui button:focus-visible { outline: 2px solid #8a91c4; outline-offset: 1px; }
  .demo-ui input { width: 120px; accent-color: #ff9f5a; }
  .items { position: fixed; inset: 0; overflow: auto; padding: 24px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; align-content: start; color: #eef0ff; }
  .items figure { margin: 0; }
  .items svg { display: block; width: 100%; height: auto; border-radius: 6px; }
  .items figcaption { font-size: 13px; padding: 6px 2px 0; color: #c9cfe6; }
  .items figcaption span { color: #8a91c4; margin-left: 6px; }
`;
document.head.appendChild(css);

// --- rooms, drawn the way world.ts draws them --------------------------------------------------
const WALL_FACE = 110, T = 16, SLOT_W = 420, SLOT_H = 400, UNIT_W = 400, UNIT_H = 380;
type FakeRoom = { x: number; y: number; w: number; h: number; desks: number; decor: DecorId[]; accent: string; clock?: boolean };

function roomSvg(r: FakeRoom) {
  const { w, h } = r, uid = Math.random().toString(36).slice(2, 8);
  const cols = Math.min(3, Math.max(1, r.desks));
  const desks = Array.from({ length: r.desks }, (_, k) => ({ x: 70 + (k % cols) * SLOT_W, y: WALL_FACE + 40 + Math.floor(k / cols) * SLOT_H, w: UNIT_W, h: UNIT_H }));
  const windows: string[] = [];
  const nWin = Math.max(1, Math.floor((w - 240) / 300));
  for (let i = 0; i < nWin; i++) {
    const wx = 200 + i * ((w - 260) / nWin), ww = Math.min(220, (w - 260) / nWin - 40);
    windows.push(`<rect x="${wx - 6}" y="${T + 14}" width="${ww + 12}" height="${WALL_FACE - T - 30}" rx="6" fill="#d8cfbf"/>
      <rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#sky${uid})"/>
      <rect x="${wx + ww / 2 - 2}" y="${T + 20}" width="4" height="${WALL_FACE - T - 42}" fill="#d8cfbf"/>
      <rect x="${wx - 10}" y="${WALL_FACE - 14}" width="${ww + 20}" height="6" rx="3" fill="#d8cfbf"/>`);
  }
  const now = new Date(), m = now.getMinutes(), hr = (now.getHours() % 12) + m / 60;
  const clock = r.clock ? `<g transform="translate(${w - 80} ${T + 46})"><circle r="28" fill="#fff"/><circle r="24" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-1" y="-22" width="2" height="${i % 3 ? 3 : 6}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.8" y="-13" width="3.6" height="15" rx="1.8" fill="#3a3f4f" transform="rotate(${hr * 30})"/>
      <rect class="clock-m" x="-1.2" y="-20" width="2.4" height="22" rx="1.2" fill="#3a3f4f" transform="rotate(${m * 6})"/>
      <circle r="2.6" fill="${r.accent}"/></g>` : "";
  const avoid = [{ x: 30, y: T, w: 148, h: WALL_FACE - T }, ...(r.clock ? [{ x: w - 112, y: T, w: 64, h: 66 }] : [])];
  const decor = r.decor.length ? placeDecor(r.decor, w, h, WALL_FACE, desks, { avoid, wallTop: T }).map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("")
    : `${ambientPlant(w - 60, h - 70)}${ambientPlant(52, h - 70, 0.85)}`;
  const deskArt = desks.map((d) => `<rect x="${d.x + 40}" y="${d.y + 150}" width="${d.w - 80}" height="120" rx="10" fill="#2b1d10" opacity="0.12"/>
    <rect x="${d.x + 34}" y="${d.y + 130}" width="${d.w - 68}" height="120" rx="10" fill="#e9dcc6"/><rect x="${d.x + 150}" y="${d.y + 96}" width="100" height="62" rx="6" fill="#3a3f4f"/>`).join("");
  return `<svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs><linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient></defs>
    <rect y="${WALL_FACE}" width="${w}" height="${h - WALL_FACE}" fill="#c9a274"/>
    ${drawWall("warm", w, WALL_FACE)}
    ${windows.join("")}
    <g transform="translate(34 ${T + 10})"><rect width="140" height="${WALL_FACE - T - 24}" rx="10" fill="#ffffff" opacity="0.94"/><rect x="10" y="12" width="46" height="46" rx="12" fill="${r.accent}"/></g>
    ${clock}${deskArt}${decor}
    <rect width="${w}" height="${T}" fill="#3a3f4f"/><rect width="${T}" height="${h}" fill="#3a3f4f"/><rect x="${w - T}" width="${T}" height="${h}" fill="#3a3f4f"/><rect y="${h - T}" width="${w}" height="${T}" fill="#3a3f4f"/>
  </svg>`;
}

// a building like a busy Lucid: queue, main office, break room on top, four project offices below
const topH = 980, HALL = 150;
const ROOMS: FakeRoom[] = [
  { x: 0, y: topH - 800, w: 720, h: 800, desks: 0, decor: [], accent: "#b07cff" },
  { x: 760, y: 0, w: 1380, h: 980, desks: 6, decor: ["plants", "coffee", "aquarium", "neon", "arcade", "posters", ...seasonalDecor("autumn")], accent: "#ff9f5a", clock: true },
  { x: 2180, y: topH - 800, w: 1900, h: 800, desks: 0, decor: ["plants", "water", "bookshelf"], accent: "#4ff0a0" },
  { x: 0, y: topH + HALL, w: 1380, h: 580, desks: 3, decor: [], accent: "#4fb6ff" },
  { x: 1420, y: topH + HALL, w: 1380, h: 580, desks: 3, decor: [...seasonalDecor("winter"), "plants"], accent: "#4fb6ff" },
  { x: 2840, y: topH + HALL, w: 1380, h: 580, desks: 3, decor: [...seasonalDecor("summer"), "trophies"], accent: "#ff6f91" },
  { x: 4260, y: topH + HALL, w: 1380, h: 580, desks: 3, decor: [...seasonalDecor("spring"), "rug"], accent: "#4fb6ff" },
];
const B = { x: 0, y: 0, w: 5640, h: topH + HALL + 580 };
const entranceY = topH + HALL / 2;
const park = { x: B.w + 300, y: Math.max(320, entranceY) - PARK_H / 2, w: PARK_W, h: PARK_H };
const out = { ox: -2400, oy: -2200, w: B.w + 300 + PARK_W + 4800, h: Math.max(B.h, park.y + park.h) + 4400 };

const scene = document.createElement("div");
scene.className = "scene";
scene.innerHTML = `<div class="world"><div class="outside-layer"></div><div class="hall"></div><div class="room-layer"></div><div class="night-shade"></div></div>`;
document.body.appendChild(scene);
const world = scene.querySelector(".world") as HTMLElement;
world.style.width = `${B.w}px`; world.style.height = `${B.h}px`;
const outside = world.querySelector(".outside-layer") as HTMLElement;
outside.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
const shade = world.querySelector(".night-shade") as HTMLElement;
shade.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px;right:auto;bottom:auto`;
(world.querySelector(".hall") as HTMLElement).style.cssText = `top:${topH}px;height:${HALL}px;width:${B.w}px`;
const roomLayer = world.querySelector(".room-layer") as HTMLElement;
// like world.ts: build each room, then append it (the ambient module adds clouds and second hands)
for (const r of ROOMS) {
  const el = document.createElement("div");
  el.className = "room";
  el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
  el.innerHTML = roomSvg(r);
  roomLayer.appendChild(el);
}

// --- camera -------------------------------------------------------------------------------------
const pcx = park.x + park.w / 2, pcy = park.y + park.h / 2;
const VIEWS = {
  park: { x: park.x - 60, y: park.y - 40, w: park.w + 120, h: park.h + 80 },
  wide: { x: -120, y: -170, w: park.x + park.w + 240, h: B.h + 290 },
  far: { x: out.ox, y: out.oy, w: out.w, h: out.h },
  office: { x: ROOMS[1].x - 10, y: ROOMS[1].y - 10, w: ROOMS[1].w + 20, h: ROOMS[1].h + 20 },
  offices: { x: -20, y: topH + HALL - 20, w: B.w + 40, h: 620 },
  pond: { x: pcx + 260 - 230, y: pcy - 120 - 150, w: 460, h: 300 },
  fountain: { x: pcx - 110, y: pcy - 80, w: 220, h: 160 },
  clock: { x: ROOMS[1].x + ROOMS[1].w - 260, y: ROOMS[1].y, w: 260, h: 160 },
  // the bottom offices: plain plants, winter, summer and spring decor
  plain: { x: ROOMS[3].x - 10, y: ROOMS[3].y - 10, w: ROOMS[3].w + 20, h: ROOMS[3].h + 20 },
  winter: { x: ROOMS[4].x - 10, y: ROOMS[4].y - 10, w: ROOMS[4].w + 20, h: ROOMS[4].h + 20 },
  summer: { x: ROOMS[5].x - 10, y: ROOMS[5].y - 10, w: ROOMS[5].w + 20, h: ROOMS[5].h + 20 },
  spring: { x: ROOMS[6].x - 10, y: ROOMS[6].y - 10, w: ROOMS[6].w + 20, h: ROOMS[6].h + 20 },
};
const cam = { x: 0, y: 0, s: 1 };
const apply = () => { world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`; };
function fit(r: { x: number; y: number; w: number; h: number }) {
  cam.s = Math.min(innerWidth / r.w, innerHeight / r.h);
  cam.x = innerWidth / 2 - (r.x + r.w / 2) * cam.s;
  cam.y = innerHeight / 2 - (r.y + r.h / 2) * cam.s;
  apply();
}
let drag: { x: number; y: number } | null = null;
scene.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest(".demo-ui")) return; drag = { x: e.clientX, y: e.clientY }; scene.setPointerCapture(e.pointerId); });
scene.addEventListener("pointermove", (e) => { if (!drag) return; cam.x += e.clientX - drag.x; cam.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; apply(); });
scene.addEventListener("pointerup", () => { drag = null; });
scene.addEventListener("wheel", (e) => {
  if ((e.target as HTMLElement).closest(".demo-ui")) return;
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.0015), s = Math.min(5, Math.max(0.05, cam.s * k));
  cam.x = e.clientX - ((e.clientX - cam.x) * s) / cam.s; cam.y = e.clientY - ((e.clientY - cam.y) * s) / cam.s; cam.s = s;
  apply();
}, { passive: false });

// --- state ----------------------------------------------------------------------------------------
const TIMES = {
  day: { sky1: "#6fb2ee", sky2: "#d4ecfb", stars: 0, lamp: 0.1, night: 0 },
  dusk: { sky1: "#7a7fd0", sky2: "#ffbc85", stars: 0, lamp: 0.5, night: 0.05 },
  night: { sky1: "#0b1030", sky2: "#262c62", stars: 1, lamp: 1, night: 0.3 },
};
// How the outdoors goes on the page (mode=):
//   split (default): the "still" layer as one static image, the "live" layer as page elements on top
//   img: everything as one image with its CSS inside (what world.ts does with layer "all")
//   dom: everything as page elements
const MODE = qs.get("mode") || "split";
let drawn = "", url = "";
function asImage(svg: string) {
  const css = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText).filter((t) => /\.outside|@keyframes|--lamp|--night/.test(t)); } catch { return []; } }).join("\n");
  const vars = getComputedStyle(world);
  const root = `svg{--lamp:${vars.getPropertyValue("--lamp") || 0};--night:${vars.getPropertyValue("--night") || 0};--wind:${vars.getPropertyValue("--wind") || 0.3}}`;
  const withCss = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, `$1<style>${root}\n${css}</style>`);
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([withCss], { type: "image/svg+xml" }));
  return `<img class="outside-img" src="${url}" alt="" draggable="false" style="display:block;width:100%;height:100%">`;
}
function render() {
  const key = `${state.season}|${state.snow}|${state.time}`;
  if (key !== drawn) {
    drawn = key;
    const args = { ...out, building: B, entranceY, park, season: state.season, snowCover: state.snow };
    if (MODE === "dom") outside.innerHTML = outsideSvg(args);
    else if (MODE === "img") outside.innerHTML = asImage(outsideSvg(args));
    else outside.innerHTML = asImage(outsideSvg({ ...args, layer: "still" })) + outsideSvg({ ...args, layer: "live" });
  }
  scene.style.background = state.season === "winter" ? "#c9d6dc" : "#6f9f5c";
}
function light() {
  const t = TIMES[state.time], st = world.style;
  st.setProperty("--sky1", t.sky1); st.setProperty("--sky2", t.sky2); st.setProperty("--stars", String(t.stars));
  st.setProperty("--lamp", String(t.lamp)); st.setProperty("--night", String(t.night)); st.setProperty("--wind", String(state.wind));
  render();
}
light();
if (qs.get("anim") === "0") document.documentElement.classList.add("no-anim");

// --- the seasonal items, large, by day and by night ---------------------------------------------
if (qs.get("view") === "items") {
  scene.style.display = "none";
  const grid = document.createElement("div");
  grid.className = "items";
  const cell = (id: DecorId, night: boolean) => {
    const wall = DECOR[id].spot === "wall", W = 260, H = 230, wf = 120;
    const vars = night ? "--lamp:1;--stars:1" : "--lamp:0.1;--stars:0";
    return `<figure><svg viewBox="0 0 ${W} ${H}" style="${vars}" role="img" aria-label="${DECOR[id].name}">
      <rect width="${W}" height="${H}" fill="${night ? "#8a7458" : "#c9a274"}"/>${drawWall(night ? "dusk" : "warm", W, wf)}
      ${night ? `<rect width="${W}" height="${H}" fill="#0b1030" opacity="0.25"/>` : ""}
      ${drawDecor(id, W / 2, wall ? wf : H - 30, 1.15)}</svg>
      <figcaption>${DECOR[id].name}<span>${DECOR[id].season}, ${DECOR[id].spot === "wall" ? "wall" : "standing"}${night ? ", night" : ""}</span></figcaption></figure>`;
  };
  const ids = seasonalDecor();
  grid.innerHTML = ids.map((id) => cell(id, false)).join("") + ids.map((id) => cell(id, true)).join("");
  document.body.appendChild(grid);
} else fit(VIEWS[(qs.get("view") as keyof typeof VIEWS) || "wide"] ?? VIEWS.wide);

// --- controls -------------------------------------------------------------------------------------
if (qs.get("ui") !== "0" && qs.get("view") !== "items") {
  const ui = document.createElement("div");
  ui.className = "demo-ui";
  const seg = <K extends "season" | "time">(label: string, key: K, opts: string[]) => `<div class="row"><span>${label}</span>${opts.map((o) =>
    `<button type="button" data-k="${key}" data-v="${o}" aria-pressed="${state[key] === o}">${o[0].toUpperCase() + o.slice(1)}</button>`).join("")}</div>`;
  ui.innerHTML = `${seg("Season", "season", ["spring", "summer", "autumn", "winter"])}${seg("Time", "time", ["day", "dusk", "night"])}
    <div class="row"><span>Wind</span><input type="range" min="0" max="1" step="0.05" value="${state.wind}" aria-label="Wind"></div>
    <div class="row"><span>View</span>${Object.keys(VIEWS).map((v) => `<button type="button" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>`;
  ui.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.view) { fit(VIEWS[b.dataset.view as keyof typeof VIEWS]); return; }
    const k = b.dataset.k as "season" | "time";
    (state as any)[k] = b.dataset.v;
    if (k === "season") state.snow = state.season === "winter" ? 0.6 : 0;
    ui.querySelectorAll<HTMLElement>(`[data-k="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    light();
  });
  ui.querySelector("input")!.addEventListener("input", (e) => { state.wind = Number((e.target as HTMLInputElement).value); light(); });
  document.body.appendChild(ui);
}

// --- frame timing, for scripted runs: window.measure(ms) ------------------------------------------
(window as any).fitView = (v: keyof typeof VIEWS) => fit(VIEWS[v]);
(window as any).setAnim = (on: boolean) => document.documentElement.classList.toggle("no-anim", !on);
(window as any).measure = (ms = 5000) => new Promise((done) => {
  const gaps: number[] = [];
  let last = 0;
  const t0 = performance.now();
  const step = (t: number) => {
    if (last) gaps.push(t - last);
    last = t;
    if (t - t0 < ms) requestAnimationFrame(step);
    else {
      gaps.sort((a, b) => a - b);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, q = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
      done({ frames: gaps.length, fps: Math.round(1000 / mean), mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +gaps[gaps.length - 1].toFixed(1), over20: gaps.filter((g) => g > 20).length });
    }
  };
  requestAnimationFrame(step);
});
(window as any).animCount = () => document.getAnimations().length;
