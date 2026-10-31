import "@fontsource-variable/lexend";
import "../office/office.css";
import { outsideSvg, PARK_W, PARK_H } from "../office/outside";
import { mountWeather, applySkyTint } from "./effects";
import { outdoorLook } from "./season";
import type { Season, Weather, WeatherKind } from "./types";

// Weather and seasons demo: a fake building and the real outdoors plus the weather layer.
// Drag to pan, wheel to zoom. URL params (for scripted captures):
//   season=spring|summer|autumn|winter  kind=none|clear|clouds|rain|drizzle|snow|storm|fog
//   time=day|dusk|night  wind=3|20|55  snow=auto|0|0.5|1  view=park|wide|far  ui=0

const qs = new URLSearchParams(location.search);
const state = {
  season: (qs.get("season") as Season) || outdoorLook().season,
  kind: (qs.get("kind") || "rain") as WeatherKind | "none",
  time: (qs.get("time") || "day") as "day" | "dusk" | "night",
  wind: Number(qs.get("wind") || 20),
  snow: qs.get("snow") || "auto",
};

const css = document.createElement("style");
css.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; color-scheme: dark; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #20253d; font-family: var(--font); }
  .scene { position: fixed; inset: 0; }
  .fake-room { position: absolute; background: #e9e1d2; border-radius: 6px; box-shadow: 0 18px 40px rgba(10, 12, 30, 0.35); overflow: clip; }
  .fake-room .win { position: absolute; left: 0; right: 0; top: 0; height: 110px; background: #cfc6b4; }
  .fake-room .win i { position: absolute; top: 22px; height: 56px; width: 110px; border-radius: 4px; background: linear-gradient(var(--sky1), var(--sky2)); }
  .fake-room .win i::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 30% 30%, #fff 0 1.2px, transparent 2px), radial-gradient(circle at 70% 55%, #fff 0 1px, transparent 2px); opacity: var(--stars); }
  .demo-ui { position: fixed; left: 16px; top: 16px; z-index: 60; display: grid; gap: 10px; padding: 14px; border-radius: 10px;
    background: rgba(20, 26, 51, 0.86); backdrop-filter: blur(8px); color: #eef0ff; font-size: 13px; }
  .demo-ui .row { display: flex; align-items: center; gap: 4px; }
  .demo-ui .row > span { width: 64px; color: #b9bfe6; }
  .demo-ui button { font: inherit; border: 0; padding: 6px 10px; border-radius: 6px; cursor: pointer; background: transparent; color: #b9bfe6; }
  .demo-ui button:hover { background: rgba(255, 255, 255, 0.08); color: #eef0ff; }
  .demo-ui button[aria-pressed="true"] { background: #3c4680; color: #fff; }
  .demo-ui button:focus-visible { outline: 2px solid #8a91c4; outline-offset: 1px; }
  .demo-ui p { margin: 0; color: #8a91c4; max-width: 520px; }
`;
document.head.appendChild(css);

// --- the fake world, laid out like world.ts does it -----------------------------------------
const B = { x: 0, y: 0, w: 2400, h: 1500 };
const topH = 700, HALL = 150;
const entranceY = topH + HALL / 2;
const park = { x: B.w + 300, y: Math.max(320, entranceY) - PARK_H / 2, w: PARK_W, h: PARK_H };
const out = { ox: -2400, oy: -2200, w: B.w + 300 + PARK_W + 4800, h: Math.max(B.h, park.y + park.h) + 4400 };

const scene = document.createElement("div");
scene.className = "scene";
scene.innerHTML = `<div class="world"><div class="outside-layer"></div><div class="park-layer"></div><div class="building-plate" style="display:none"></div><div class="hall"></div><div class="room-layer"></div><div class="night-shade"></div></div>`;
document.body.appendChild(scene);
const world = scene.querySelector(".world") as HTMLElement;
world.style.width = `${B.w}px`; world.style.height = `${B.h}px`;
const outside = world.querySelector(".outside-layer") as HTMLElement;
outside.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
const shade = world.querySelector(".night-shade") as HTMLElement;
shade.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px;right:auto;bottom:auto`;
(world.querySelector(".hall") as HTMLElement).style.cssText = `top:${topH}px;height:${HALL}px;width:${B.w}px`;
const rooms = world.querySelector(".room-layer") as HTMLElement;
for (const [x, y, w, h] of [[0, 0, 780, topH], [810, 0, 780, topH], [1620, 0, 780, topH], [0, topH + HALL, 1180, B.h - topH - HALL], [1220, topH + HALL, 1180, B.h - topH - HALL]]) {
  const el = document.createElement("div");
  el.className = "fake-room";
  el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  el.innerHTML = `<div class="win">${Array.from({ length: Math.floor((w - 40) / 160) }, (_, i) => `<i style="left:${40 + i * 160}px"></i>`).join("")}</div>`;
  rooms.appendChild(el);
}

const fx = mountWeather(world, { x: out.ox, y: out.oy, w: out.w, h: out.h, park, entranceY });

// --- camera ---------------------------------------------------------------------------------
const VIEWS = {
  park: { x: park.x - 120, y: park.y - 80, w: park.w + 240, h: park.h + 160 },
  wide: { x: B.x - 400, y: B.y - 500, w: park.x + park.w + 400, h: B.h + 1000 },
  far: { x: out.ox, y: out.oy, w: out.w, h: out.h },
};
const cam = { x: 0, y: 0, s: 1 };
const apply = () => { world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`; };
function fit(r: { x: number; y: number; w: number; h: number }) {
  cam.s = Math.min(innerWidth / r.w, innerHeight / r.h);
  cam.x = innerWidth / 2 - (r.x + r.w / 2) * cam.s;
  cam.y = innerHeight / 2 - (r.y + r.h / 2) * cam.s;
  apply();
}
fit(VIEWS[(qs.get("view") as keyof typeof VIEWS) || "wide"] ?? VIEWS.wide);
let drag: { x: number; y: number } | null = null;
scene.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest(".demo-ui")) return; drag = { x: e.clientX, y: e.clientY }; scene.setPointerCapture(e.pointerId); });
scene.addEventListener("pointermove", (e) => { if (!drag) return; cam.x += e.clientX - drag.x; cam.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; apply(); });
scene.addEventListener("pointerup", () => { drag = null; });
scene.addEventListener("wheel", (e) => {
  if ((e.target as HTMLElement).closest(".demo-ui")) return;
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0015), s = Math.min(3, Math.max(0.08, cam.s * f));
  cam.x = e.clientX - ((e.clientX - cam.x) * s) / cam.s; cam.y = e.clientY - ((e.clientY - cam.y) * s) / cam.s; cam.s = s;
  apply();
}, { passive: false });

// --- applying the state ---------------------------------------------------------------------
const TIMES = {
  day: { sky1: "#6fb2ee", sky2: "#d4ecfb", stars: 0, lamp: 0.1, night: 0 },
  dusk: { sky1: "#7a7fd0", sky2: "#ffbc85", stars: 0, lamp: 0.5, night: 0.05 },
  night: { sky1: "#0b1030", sky2: "#262c62", stars: 1, lamp: 1, night: 0.3 },
};
let drawnLook = "";
function render() {
  const w: Weather | null = state.kind === "none" ? null : {
    kind: state.kind, tempC: state.season === "winter" ? -3 : 12, windKmh: state.wind, windDir: 250,
    isDay: state.time !== "night", sunrise: null, sunset: null, place: "Demo", observedAt: new Date().toISOString(), cloudCover: 80,
  };
  // a date inside the chosen season, so the automatic snow and ice match it
  const date = new Date(2026, { spring: 3, summer: 6, autumn: 9, winter: 0 }[state.season], 15);
  const look = outdoorLook(date, w);
  const snowCover = state.snow === "auto" ? look.snowCover : Number(state.snow);
  const key = `${state.season}|${snowCover}|${look.frozen}`;
  if (key !== drawnLook) {
    drawnLook = key;
    outside.innerHTML = outsideSvg({ ...out, building: B, entranceY, park, season: state.season, snowCover, frozen: look.frozen || (state.season === "winter" && snowCover >= 0.4) });
  }
  const t = TIMES[state.time];
  const tint = applySkyTint(t, w);
  const st = world.style;
  st.setProperty("--sky1", tint.sky1); st.setProperty("--sky2", tint.sky2);
  st.setProperty("--stars", String(t.stars * tint.stars)); st.setProperty("--lamp", String(Math.max(t.lamp, tint.dim * 2)));
  st.setProperty("--night", String(t.night + tint.dim));
  scene.style.setProperty("--scene-night", String(t.night + tint.dim));
  fx.set(w, { night: t.night, season: state.season, frozen: look.frozen });
  for (const b of ui.querySelectorAll<HTMLButtonElement>("button[data-k]")) b.setAttribute("aria-pressed", String(String(state[b.dataset.k as keyof typeof state]) === b.dataset.v));
  info.textContent = `${state.season}, ${state.kind}, ${state.time}, wind ${state.wind} km/h, snow cover ${snowCover}${look.frozen ? ", pond frozen" : ""}`;
}

const ui = document.createElement("div");
ui.className = "demo-ui";
const row = (label: string, k: keyof typeof state, vals: (string | number)[], names?: string[]) =>
  `<div class="row" role="group" aria-label="${label}"><span>${label}</span>${vals.map((v, i) => `<button type="button" data-k="${k}" data-v="${v}">${names?.[i] ?? v}</button>`).join("")}</div>`;
ui.innerHTML = [
  row("Season", "season", ["spring", "summer", "autumn", "winter"]),
  row("Weather", "kind", ["none", "clear", "clouds", "drizzle", "rain", "storm", "snow", "fog"]),
  row("Time", "time", ["day", "dusk", "night"]),
  row("Wind", "wind", [3, 20, 55], ["calm", "breezy", "gale"]),
  row("Snow", "snow", ["auto", "0", "0.5", "1"], ["auto", "none", "some", "full"]),
  `<div class="row"><span>View</span>${Object.keys(VIEWS).map((v) => `<button type="button" data-view="${v}">${v}</button>`).join("")}</div>`,
  `<p></p>`,
].join("");
if (qs.get("ui") === "0") ui.style.display = "none";
document.body.appendChild(ui);
const info = ui.querySelector("p") as HTMLElement;
ui.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  if (b.dataset.view) { fit(VIEWS[b.dataset.view as keyof typeof VIEWS]); return; }
  const k = b.dataset.k as keyof typeof state;
  (state as Record<string, unknown>)[k] = k === "wind" ? Number(b.dataset.v) : b.dataset.v;
  render();
});
render();
if (qs.get("flash")) setTimeout(() => fx.flash(), Number(qs.get("flash")));
// for scripted checks: average frame time over two seconds
(window as unknown as { probe: () => Promise<number> }).probe = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res((performance.now() - t0) / n); }; requestAnimationFrame(f); });
