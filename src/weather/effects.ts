import { outdoorLook } from "./season";
import { beginSystem, endSystem } from "../perf/metrics";
import type { Season, Weather, WeatherKind } from "./types";
export type { Weather, WeatherKind, Season } from "./types";

// The weather over the outdoors: rain, snow, fog, cloud shadows, lightning, falling leaves and
// petals. Two canvases, both children of the world element so they pan and zoom with it:
//  - "sky": cloud shadows, fog banks and the overcast tint. Huge soft shapes, so it covers the
//    whole outdoor rect at a tiny resolution and lets the browser smooth the upscale.
//  - "fall": rain, snow, splashes, leaves. Small sharp things, so it only covers the part of
//    the world currently on screen (plus a margin) at a reduced pixel density, and follows the
//    camera by changing its own transform. Its drawing work scales with the screen, not the world.

type Rect = { x: number; y: number; w: number; h: number };
export type OutdoorRect = Rect & { park?: Rect; entranceY?: number };
export type WeatherOpts = { night: number; season?: Season; frozen?: boolean;
  /** What lies on the ground: puddles left (0 to 1), heat over the paving, snow that takes footprints. */
  ground?: { puddles: number; hot: boolean; prints: boolean } };
/** A puddle (world coordinates) that rain ripples; `keep` above the puddle level means it has dried up. */
export type PuddleSpot = { x: number; y: number; r: number; keep: number };
/** Someone walking outdoors (world coordinates), for footprints in the snow. */
export type Stepper = { id: string; x: number; y: number };
export type WeatherLayer = {
  set(w: Weather | null, opts: WeatherOpts): void;
  resize(rect: OutdoorRect): void;   // the building grew and the outdoors moved
  onFlash: ((strength: number) => void) | null; // lightning, e.g. to light up the window skies
  flash(): void;                     // a lightning flash right now (storms also flash on their own)
  /** Puddles that ripple in the rain and the paving that shimmers in the heat (world coordinates). */
  setGround(puddles: PuddleSpot[], paved: Rect[]): void;
  /** Who walks outdoors right now (read every frame, so keep it cheap: no page measuring). */
  setSteppers(fn: (() => Stepper[]) | null): void;
  /** The camera moved: where the world sits on screen and its zoom. Avoids measuring the page every frame. */
  setCamera(cam: { x: number; y: number; s: number }, scene: { left: number; top: number; width: number; height: number }, worldW: number, worldH?: number): void;
  destroy(): void;
};

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mod = (a: number, n: number) => ((a % n) + n) % n;

// How each kind of weather looks, before wind and night are applied.
type Recipe = {
  rain: number;      // 0 to 1.6, how much rain (drizzle is low, storm high)
  snow: number;
  shadows: number;   // cloud shadow strength
  clouds: number;    // how many cloud shadows (0 to 1)
  overcast: [string, number]; // flat tint over the ground
  fog: number;
  lightning: boolean;
};
const RECIPES: Record<WeatherKind, Recipe> = {
  clear:   { rain: 0, snow: 0, shadows: 0.15, clouds: 0.3, overcast: ["#000000", 0], fog: 0, lightning: false },
  clouds:  { rain: 0, snow: 0, shadows: 0.18, clouds: 1, overcast: ["#26324a", 0.07], fog: 0, lightning: false },
  drizzle: { rain: 0.4, snow: 0, shadows: 0.1, clouds: 0.8, overcast: ["#2c3a52", 0.13], fog: 0, lightning: false },
  rain:    { rain: 1, snow: 0, shadows: 0.12, clouds: 1, overcast: ["#25324a", 0.2], fog: 0, lightning: false },
  storm:   { rain: 1.6, snow: 0, shadows: 0.2, clouds: 1, overcast: ["#141c30", 0.32], fog: 0, lightning: true },
  snow:    { rain: 0, snow: 1, shadows: 0.06, clouds: 0.8, overcast: ["#c8d2e0", 0.12], fog: 0.15, lightning: false },
  fog:     { rain: 0, snow: 0, shadows: 0, clouds: 0, overcast: ["#dfe5ea", 0.3], fog: 1, lightning: false },
};

// Sky colours for the room windows. `amount` says how far to pull the clock's sky toward
// sky1/sky2 (use applySkyTint for that), `dim` how much darker the scene should get, and
// `stars` how much of the starry sky still shows through.
export function skyTint(w: Weather | null): { sky1?: string; sky2?: string; dim?: number; stars?: number; amount?: number } {
  if (!w || w.kind === "clear") return {};
  const day = w.isDay;
  switch (w.kind) {
    case "clouds": return day ? { sky1: "#8fb1d4", sky2: "#dce7f0", dim: 0.03, stars: 0.5, amount: 0.45 } : { sky1: "#161b33", sky2: "#2d3352", stars: 0.45, amount: 0.4 };
    case "drizzle": return day ? { sky1: "#8d9fb3", sky2: "#c9d3dc", dim: 0.07, stars: 0.1, amount: 0.7 } : { sky1: "#14182a", sky2: "#262b40", dim: 0.04, stars: 0, amount: 0.7 };
    case "rain": return day ? { sky1: "#77879a", sky2: "#aeb9c5", dim: 0.12, stars: 0, amount: 0.82 } : { sky1: "#11141f", sky2: "#22263a", dim: 0.06, stars: 0, amount: 0.8 };
    case "storm": return day ? { sky1: "#454f61", sky2: "#77818f", dim: 0.24, stars: 0, amount: 0.92 } : { sky1: "#0a0c16", sky2: "#1a1e2e", dim: 0.1, stars: 0, amount: 0.9 };
    case "snow": return day ? { sky1: "#b6c1cc", sky2: "#e7ecf1", dim: 0.04, stars: 0, amount: 0.8 } : { sky1: "#1c2134", sky2: "#3b4159", stars: 0, amount: 0.7 };
    case "fog": return day ? { sky1: "#c2c8ce", sky2: "#e0e4e7", dim: 0.06, stars: 0, amount: 0.85 } : { sky1: "#23273a", sky2: "#3a3f52", stars: 0, amount: 0.75 };
  }
  return {};
}

function mixHex(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, "0")).join("");
}

// Blend the clock-based sky (hex colours) with the weather: returns new colours, the star
// multiplier and the extra darkness to add to --night.
export function applySkyTint(base: { sky1: string; sky2: string }, w: Weather | null) {
  const t = skyTint(w), a = t.amount ?? 0;
  return {
    sky1: t.sky1 ? mixHex(base.sky1, t.sky1, a) : base.sky1,
    sky2: t.sky2 ? mixHex(base.sky2, t.sky2, a) : base.sky2,
    stars: t.stars ?? 1,
    dim: t.dim ?? 0,
  };
}

// A soft blob made of overlapping puffs, drawn once into a small sprite.
function blobSprite(seed: number, color: string, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const q = rnd(seed);
  const n = 5 + Math.floor(q() * 4);
  for (let i = 0; i < n; i++) {
    const a = q() * Math.PI * 2, d = q() * size * 0.18;
    const x = size / 2 + Math.cos(a) * d * 1.4, y = size / 2 + Math.sin(a) * d;
    const r = size * (0.16 + q() * 0.14);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(0.55, color);
    gr.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}

const LEAF_COLS = ["#d9783a", "#e8a23c", "#b5472f", "#e6c04a"];
const PETAL_COLS = ["#ffc2d6", "#ffe3ec", "#ffffff", "#f7a6c4"];

type Drift = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; born: number; life: number; col: number; phase: number };
type Ripple = { x: number; y: number; born: number; size: number; kind: 0 | 1 | 2 }; // pond, path, grass

export function mountWeather(host: HTMLElement, rect0: OutdoorRect): WeatherLayer {
  let rect: OutdoorRect = { ...rect0 };
  const root = document.createElement("div");
  root.className = "weather-layer";
  root.setAttribute("aria-hidden", "true");
  const sky = document.createElement("canvas");
  const fall = document.createElement("canvas");
  const flashEl = document.createElement("div");
  flashEl.className = "weather-flash";
  root.append(sky, fall);
  // above the outdoors and the park robots, below the building's rooms and the night shade
  const plate = host.querySelector(":scope > .building-plate");
  if (plate) host.insertBefore(root, plate); else host.appendChild(root);
  // the lightning flash sits above the night shade so it lights up a dark scene
  const shade = host.querySelector(":scope > .night-shade");
  if (shade) shade.after(flashEl); else host.appendChild(flashEl);
  const place = () => {
    const pos = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;pointer-events:none;`;
    root.style.cssText = pos + "overflow:clip;";
    flashEl.style.cssText = pos + "background:#e4ecff;opacity:0;";
    // sky canvas: whole outdoor rect at about 1/16 resolution
    const k = Math.min(1 / 16, 640 / rect.w);
    sky.width = Math.max(8, Math.round(rect.w * k)); sky.height = Math.max(8, Math.round(rect.h * k));
    sky.style.cssText = `position:absolute;left:0;top:0;width:${rect.w}px;height:${rect.h}px;`;
    fall.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;";
    fallXf = "";
  };
  let fallXf = "";
  place();
  const sg = sky.getContext("2d")!;
  const fg = fall.getContext("2d")!;

  // state
  let weather: Weather | null = null;
  let opts: WeatherOpts = { night: 0 };
  let season: Season = "summer", frozen = false;
  let R: Recipe = RECIPES.clear;
  let windX = 0.3, windY = 0, windKmh = 10; // horizontal lean of the rain, and cloud drift
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0, last = 0, clock = 0, skyAt = -1, nextFlash = 0, dead = false;
  let view: { x: number; y: number; w: number; h: number; k: number } | null = null;
  const ripples: Ripple[] = [];
  // the ground: puddles and paving (relative to the outdoor rect), footprints in the snow
  let ground = { puddles: 0, hot: false, prints: false };
  let puddlesW: PuddleSpot[] = [], pavedW: Rect[] = [], pud: PuddleSpot[] = [], roads: Rect[] = [];
  const toLocal = () => { pud = puddlesW.map((p) => ({ ...p, x: p.x - rect.x, y: p.y - rect.y })); roads = pavedW.map((q) => ({ ...q, x: q.x - rect.x, y: q.y - rect.y })); };
  let steppers: (() => Stepper[]) | null = null;
  type Print = { x: number; y: number; a: number; born: number };
  const prints: Print[] = [];
  const lastStep = new Map<string, { x: number; y: number; side: number }>();
  const drifts: Drift[] = [];
  const r = rnd(1234);

  // cloud shadows and fog banks: sprites placed in a field slightly bigger than the outdoors
  const CLOUDS = Array.from({ length: 18 }, (_, i) => ({ img: blobSprite(i * 97 + 5, "rgba(18,26,44,1)", 96), u: r(), v: r(), s: 0.7 + r() * 0.8, on: r() }));
  const FOGS = Array.from({ length: 44 }, (_, i) => ({ img: blobSprite(i * 53 + 11, "rgba(238,242,246,1)", 96), u: r(), v: r(), s: 0.8 + r() * 0.9, sp: 0.6 + r() * 0.8 }));

  // --- the camera: which part of the outdoors is on screen ---------------------------------
  // Measuring the page forces the browser to lay out every element, every frame; with lots of
  // animated robots that was the main cost of rain. The world tells us its camera instead.
  let cam: { x: number; y: number; s: number } | null = null;
  let sceneBox: { left: number; top: number; width: number; height: number } | null = null;
  let hostW = 1;
  let indoors = false;
  function measure() {
    let hr: { left: number; top: number; width: number }, s: number, clip: { left: number; top: number; right: number; bottom: number };
    if (cam && sceneBox) {
      s = cam.s;
      hr = { left: sceneBox.left + cam.x, top: sceneBox.top + cam.y, width: hostW * s };
      clip = { left: sceneBox.left, top: sceneBox.top, right: sceneBox.left + sceneBox.width, bottom: sceneBox.top + sceneBox.height };
    } else {
      const r0 = host.getBoundingClientRect();
      s = host.offsetWidth > 0 ? r0.width / host.offsetWidth : 1;
      hr = r0;
      clip = (host.parentElement ?? document.documentElement).getBoundingClientRect();
    }
    if (!(s > 0)) return null;
    const x0 = Math.max(clip.left, 0), y0 = Math.max(clip.top, 0);
    const x1 = Math.min(clip.right, innerWidth), y1 = Math.min(clip.bottom, innerHeight);
    if (x1 <= x0 || y1 <= y0) return null;
    const sw = x1 - x0, sh = y1 - y0, pad = 0.12;
    // canvas buffer: the visible area plus a margin, at reduced pixel density
    let q = Math.min(devicePixelRatio || 1, 1.5) * 0.7;
    const bw0 = sw * (1 + pad * 2), bh0 = sh * (1 + pad * 2);
    if (bw0 * bh0 * q * q > 1.6e6) q = Math.sqrt(1.6e6 / (bw0 * bh0));
    const bw = Math.round(bw0 * q), bh = Math.round(bh0 * q);
    if (Math.abs(fall.width - bw) > 2 || Math.abs(fall.height - bh) > 2) {
      fall.width = bw; fall.height = bh;
      fall.style.width = `${bw}px`; fall.style.height = `${bh}px`;
    }
    const ww = (sw * (1 + pad * 2)) / s;
    const vx = (x0 - hr.left) / s - (sw * pad) / s - rect.x;
    const vy = (y0 - hr.top) / s - (sh * pad) / s - rect.y;
    const k = ww / fall.width; // world units per canvas pixel
    const v = { x: vx, y: vy, w: ww, h: fall.height * k, k };
    if (v.x > rect.w || v.y > rect.h || v.x + v.w < 0 || v.y + v.h < 0) return null;
    const xf = `translate(${v.x.toFixed(1)}px,${v.y.toFixed(1)}px) scale(${k.toFixed(5)})`;
    if (xf !== fallXf) { fall.style.transform = xf; fallXf = xf; }
    return v;
  }

  // --- park geometry for splashes ------------------------------------------------------------
  function parkGeo() {
    const p = rect.park;
    if (!p) return null;
    const cx = p.x + p.w / 2 - rect.x, cy = p.y + p.h / 2 - rect.y;
    const ey = (rect.entranceY ?? p.y + 520) - rect.y, px = p.x - rect.x;
    // points along the curved path from the entrance to the fountain
    const curve: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      curve.push([u * u * u * px + 3 * u * u * t * (cx - 300) + 3 * u * t * t * (cx - 200) + t * t * t * cx, u * u * u * ey + 3 * u * u * t * ey + 3 * u * t * t * cy + t * t * t * cy]);
    }
    return { pond: { x: cx + 260, y: cy - 120, rx: 168, ry: 100 }, lane: { x: cx, y0: p.y - rect.y + 40, y1: p.y + p.h - rect.y - 40 }, curve, walk: { x0: px - 260, x1: px, y: ey } };
  }
  let geo = parkGeo();

  // --- drawing -------------------------------------------------------------------------------
  function drawSky(t: number) {
    const W = sky.width, H = sky.height, kx = W / rect.w;
    sg.clearRect(0, 0, W, H);
    const [tint, ta] = R.overcast;
    if (ta > 0) { sg.globalAlpha = ta; sg.fillStyle = tint; sg.fillRect(0, 0, W, H); }
    // cloud shadows fade at night: there is no sun to cast them
    const shadowA = R.shadows * clamp(1 - opts.night * 3, 0.12, 1) * (weather?.cloudCover != null && weather.kind !== "fog" ? clamp(0.4 + weather.cloudCover / 100, 0.4, 1.15) : 1);
    if (shadowA > 0.005) {
      const sp = (8 + windKmh * 1.1) * (reduce.matches ? 0.25 : 1);
      const fw = rect.w + 2400, fh = rect.h + 2400;
      for (const c of CLOUDS) {
        if (c.on > R.clouds) continue;
        const size = 900 * c.s;
        const x = mod(c.u * fw + windX * sp * t * 1.4, fw) - 1200, y = mod(c.v * fh + windY * sp * t * 1.4, fh) - 1200;
        sg.globalAlpha = shadowA;
        sg.drawImage(c.img, (x - size / 2) * kx, (y - size * 0.35) * kx, size * kx, size * 0.7 * kx);
      }
    }
    if (R.fog > 0) {
      const fw = rect.w + 3000, fh = rect.h + 3000;
      for (const f of FOGS) {
        const size = 1900 * f.s;
        const x = mod(f.u * fw + (windX >= 0 ? 1 : -1) * (6 + windKmh * 0.4) * f.sp * t * (reduce.matches ? 0.3 : 1), fw) - 1500;
        const y = mod(f.v * fh, fh) - 1500;
        sg.globalAlpha = 0.42 * R.fog;
        sg.drawImage(f.img, (x - size / 2) * kx, (y - size * 0.3) * kx, size * kx, size * 0.6 * kx);
      }
    }
    sg.globalAlpha = 1;
  }

  // rain: three depth layers, each a tile of streaks repeated across the view
  const LAYERS = [
    { T: 371, n: 34, speed: 900, len: 22, width: 1.1, alpha: 0.28 },
    { T: 433, n: 26, speed: 1150, len: 30, width: 1.5, alpha: 0.38 },
    { T: 512, n: 16, speed: 1400, len: 40, width: 2, alpha: 0.5 },
  ].map((L, li) => { const q = rnd(77 + li * 31); return { ...L, drops: Array.from({ length: L.n }, () => ({ x: q() * L.T, y: q() * L.T, v: 0.85 + q() * 0.3 })) }; });
  const FLAKES = [
    { T: 389, n: 30, speed: 55, r: 1.8, alpha: 0.75, sway: 10 },
    { T: 457, n: 20, speed: 80, r: 2.6, alpha: 0.85, sway: 16 },
    { T: 541, n: 12, speed: 110, r: 3.6, alpha: 0.95, sway: 22 },
  ].map((L, li) => { const q = rnd(191 + li * 17); return { ...L, f: Array.from({ length: L.n }, () => ({ x: q() * L.T, y: q() * L.T, v: 0.8 + q() * 0.4, ph: q() * 6.28 })) }; });

  function tiles(T: number, v: { x: number; y: number; w: number; h: number }) {
    const x0 = Math.floor(Math.max(0, v.x) / T), x1 = Math.floor(Math.min(rect.w, v.x + v.w) / T);
    const y0 = Math.floor(Math.max(0, v.y) / T), y1 = Math.floor(Math.min(rect.h, v.y + v.h) / T);
    return { x0, x1, y0, y1, n: Math.max(0, (x1 - x0 + 1) * (y1 - y0 + 1)) };
  }

  function drawRain(t: number, v: NonNullable<typeof view>, amount: number) {
    const night = opts.night;
    fg.lineCap = "round";
    fg.strokeStyle = night > 0.1 ? "#c9d6f2" : "#e6f0ff";
    const lean = clamp(windX * (0.25 + windKmh / 70), -0.9, 0.9);
    for (const L of LAYERS) {
      const g = tiles(L.T, v);
      const want = L.n * amount;
      // thin out when zoomed far out so the work stays bounded
      const cap = Math.min(want, 2400 / Math.max(1, g.n));
      if (cap < 0.5) continue;
      const step = want / cap;
      const len = L.len * (0.6 + amount * 0.4);
      const nx = lean, ny = 1, m = Math.hypot(nx, ny);
      const dx = (nx / m) * len, dy = (ny / m) * len;
      fg.lineWidth = Math.max(L.width, v.k * 0.9);
      fg.globalAlpha = L.alpha * clamp(0.55 + amount * 0.45, 0, 1.1);
      fg.beginPath();
      for (let i = 0; i < want; i += step) {
        const d = L.drops[Math.floor(i) % L.n];
        const sp = L.speed * d.v;
        const ox = mod(d.x + lean * sp * t, L.T), oy = mod(d.y + sp * t, L.T);
        for (let tx = g.x0; tx <= g.x1; tx++) for (let ty = g.y0; ty <= g.y1; ty++) {
          const x = tx * L.T + ox, y = ty * L.T + oy;
          fg.moveTo(x, y); fg.lineTo(x - dx, y - dy);
        }
      }
      fg.stroke();
    }
    fg.globalAlpha = 1;
  }

  function drawSnow(t: number, v: NonNullable<typeof view>, amount: number) {
    fg.fillStyle = "#ffffff";
    const drift = windX * (6 + windKmh * 1.2);
    for (const L of FLAKES) {
      const g = tiles(L.T, v);
      const want = L.n * amount, cap = Math.min(want, 2000 / Math.max(1, g.n));
      if (cap < 0.5) continue;
      const step = want / cap;
      const rr = Math.max(L.r, v.k * 0.8);
      fg.globalAlpha = L.alpha;
      fg.beginPath();
      for (let i = 0; i < want; i += step) {
        const f = L.f[Math.floor(i) % L.n];
        const sp = L.speed * f.v;
        const ox = mod(f.x + drift * f.v * t + Math.sin(t * 0.9 + f.ph) * L.sway, L.T), oy = mod(f.y + sp * t, L.T);
        for (let tx = g.x0; tx <= g.x1; tx++) for (let ty = g.y0; ty <= g.y1; ty++) {
          const x = tx * L.T + ox, y = ty * L.T + oy;
          fg.moveTo(x + rr, y); fg.arc(x, y, rr, 0, Math.PI * 2);
        }
      }
      fg.fill();
    }
    fg.globalAlpha = 1;
  }

  function spawnRipples(t: number, dt: number, v: NonNullable<typeof view>, amount: number) {
    if (ripples.length > 260) return;
    const vis = (x: number, y: number) => x > v.x && x < v.x + v.w && y > v.y && y < v.y + v.h;
    const chance = (rate: number) => { let n = rate * dt; let c = 0; while (n > 0) { if (n >= 1 || r() < n) c++; n -= 1; } return c; };
    if (geo) {
      const P = geo.pond;
      if (!frozen && vis(P.x, P.y)) for (let i = chance(26 * amount); i > 0; i--) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        ripples.push({ x: P.x + Math.cos(a) * d * P.rx * 0.92, y: P.y + Math.sin(a) * d * P.ry * 0.92, born: t, size: 0.7 + r() * 0.6, kind: 0 });
      }
      // the fountain basin is water too
      if (!frozen && vis(P.x - 260, P.y + 120)) for (let i = chance(3 * amount); i > 0; i--) {
        const a = r() * Math.PI * 2, d = 20 + r() * 26;
        ripples.push({ x: P.x - 260 + Math.cos(a) * d, y: P.y + 120 + Math.sin(a) * d, born: t, size: 0.5, kind: 0 });
      }
      const L = geo.lane;
      if (vis(L.x, (L.y0 + L.y1) / 2) || vis(L.x, L.y0) || vis(L.x, L.y1)) for (let i = chance(14 * amount); i > 0; i--)
        ripples.push({ x: L.x + (r() - 0.5) * 28, y: L.y0 + r() * (L.y1 - L.y0), born: t, size: 0.45 + r() * 0.3, kind: 1 });
      for (let i = chance(14 * amount); i > 0; i--) {
        const p = geo.curve[Math.floor(r() * geo.curve.length)];
        if (vis(p[0], p[1])) ripples.push({ x: p[0] + (r() - 0.5) * 34, y: p[1] + (r() - 0.5) * 34, born: t, size: 0.45 + r() * 0.3, kind: 1 });
      }
      const Wk = geo.walk;
      if (vis(Wk.x0, Wk.y) || vis(Wk.x1, Wk.y)) for (let i = chance(5 * amount); i > 0; i--)
        ripples.push({ x: Wk.x0 + r() * (Wk.x1 - Wk.x0), y: Wk.y + (r() - 0.5) * 34, born: t, size: 0.45, kind: 1 });
    }
    // rain rings on the puddles that are on screen
    if (pud.length && ground.puddles > 0) {
      for (const p of pud) {
        if (p.keep > ground.puddles + 0.2 || !vis(p.x, p.y)) continue;
        for (let i = chance(1.4 * amount * (p.r / 20)); i > 0; i--) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r * 0.5;
          ripples.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.6, born: t, size: clamp(p.r / 30, 0.3, 0.75), kind: 1 });
        }
        if (ripples.length > 260) return;
      }
    }
    // faint splashes on the grass wherever you look
    const area = Math.max(0, Math.min(v.x + v.w, rect.w) - Math.max(v.x, 0)) * Math.max(0, Math.min(v.y + v.h, rect.h) - Math.max(v.y, 0));
    for (let i = chance(Math.min(80, (area / 40000) * amount)); i > 0; i--)
      ripples.push({ x: Math.max(0, v.x) + r() * Math.min(v.w, rect.w), y: Math.max(0, v.y) + r() * Math.min(v.h, rect.h), born: t, size: 0.4 + r() * 0.3, kind: 2 });
  }

  function drawRipples(t: number, v: NonNullable<typeof view>) {
    fg.strokeStyle = "#eef6ff";
    fg.lineWidth = Math.max(1.2, v.k * 0.9);
    const LIFE = 0.7;
    // draw in a few alpha buckets so every ripple does not need its own stroke call
    for (let b = 0; b < 3; b++) {
      fg.beginPath();
      let any = false;
      for (const p of ripples) {
        const a = (t - p.born) / LIFE;
        if (a < 0 || a >= 1 || Math.min(2, Math.floor(a * 3)) !== b) continue;
        const rx = (3 + a * 13) * p.size * (p.kind === 0 ? 1.4 : 1);
        fg.moveTo(p.x + rx, p.y); fg.ellipse(p.x, p.y, rx, rx * 0.6, 0, 0, Math.PI * 2);
        any = true;
      }
      if (!any) continue;
      fg.globalAlpha = [0.55, 0.32, 0.14][b];
      fg.stroke();
    }
    fg.globalAlpha = 1;
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].born >= LIFE) ripples.splice(i, 1);
  }

  // leaves in autumn, petals in spring: a few drifting pieces around what is on screen
  function stepDrifts(t: number, dt: number, v: NonNullable<typeof view>) {
    const petals = season === "spring";
    // a windy day sends more leaves flying
    const gust = 1 + clamp((windKmh - 18) / 25, 0, 1);
    const want = season === "autumn" || petals ? Math.round(clamp((v.w * v.h) / 70000, 6, petals ? 46 : 34) * gust * (R.snow > 0 ? 0 : R.rain > 1 ? 0.6 : 1)) : 0;
    const wind = windX * (12 + windKmh * 2.2);
    for (let i = drifts.length - 1; i >= 0; i--) {
      const d = drifts[i];
      if (t - d.born > d.life || d.x < v.x - 200 || d.x > v.x + v.w + 200 || d.y < v.y - 200 || d.y > v.y + v.h + 200) drifts.splice(i, 1);
    }
    while (drifts.length < want) drifts.push({
      x: v.x + r() * v.w, y: v.y + r() * v.h, vx: (r() - 0.5) * 16, vy: 8 + r() * 14,
      rot: r() * 6.28, spin: (r() - 0.5) * 3, born: t - (drifts.length < want / 2 ? r() * 4 : 0), life: 5 + r() * 6,
      col: Math.floor(r() * 4), phase: r() * 6.28,
    });
    if (drifts.length > want) drifts.length = want;
    for (const d of drifts) {
      d.x += (d.vx + wind + Math.sin(t * 1.3 + d.phase) * 14) * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
    }
    const cols = petals ? PETAL_COLS : LEAF_COLS;
    const [rx, ry] = petals ? [3.6, 2.3] : [6, 3.2];
    const s = Math.max(1, v.k * 0.7);
    for (let c = 0; c < 4; c++) {
      fg.fillStyle = cols[c];
      for (const band of [0.35, 0.95]) {
        fg.beginPath();
        let any = false;
        for (const d of drifts) {
          if (d.col !== c) continue;
          const age = t - d.born, a = Math.min(1, age / 0.8, (d.life - age) / 1.2);
          if ((a < 0.6) !== (band < 0.5) || a <= 0) continue;
          // a tumbling leaf looks thinner when it turns edge on
          const flat = 0.35 + 0.65 * Math.abs(Math.cos(d.rot * 1.7));
          fg.moveTo(d.x + rx * s, d.y); fg.ellipse(d.x, d.y, rx * s, ry * s * flat, d.rot, 0, Math.PI * 2);
          any = true;
        }
        if (any) { fg.globalAlpha = band; fg.fill(); }
      }
    }
    fg.globalAlpha = 1;
  }

  // footprints: every walker outdoors leaves a print every half stride; they fade over half a minute
  const PRINT_LIFE = 30;
  function stepPrints(t: number) {
    const list = steppers?.() ?? [];
    for (const p of list) {
      const x = p.x - rect.x, y = p.y - rect.y, l = lastStep.get(p.id);
      if (!l) { lastStep.set(p.id, { x, y, side: 1 }); continue; }
      const d = Math.hypot(x - l.x, y - l.y);
      if (d > 60) { l.x = x; l.y = y; continue; }   // picked up and put down elsewhere
      if (d < 15) continue;
      const nx = (y - l.y) / d, ny = -(x - l.x) / d;
      l.side = -l.side;
      prints.push({ x: x + nx * 4 * l.side, y: y + ny * 4 * l.side, a: Math.atan2(y - l.y, x - l.x), born: t });
      l.x = x; l.y = y;
    }
    while (prints.length && (prints.length > 500 || t - prints[0].born > PRINT_LIFE)) prints.shift();
    return list;
  }
  function drawPrints(t: number, v: NonNullable<typeof view>, walkers: Stepper[]) {
    if (!prints.length) return;
    fg.fillStyle = "#8d9fb6";
    const s = Math.max(1, v.k * 0.6);
    // in three age buckets, so they fade without a fill call per print; none right under someone's feet
    for (let b = 0; b < 3; b++) {
      fg.beginPath();
      let any = false;
      for (const p of prints) {
        const age = (t - p.born) / PRINT_LIFE;
        if (Math.min(2, Math.floor(age * 3)) !== b || p.x < v.x || p.x > v.x + v.w || p.y < v.y || p.y > v.y + v.h) continue;
        // this canvas lies over the robots: skip prints a robot is standing on or in front of
        if (walkers.some((w) => { const dy = p.y - (w.y - rect.y); return Math.abs(w.x - rect.x - p.x) < 18 && dy > -74 && dy < 9; })) continue;
        fg.moveTo(p.x + 3.4 * s, p.y); fg.ellipse(p.x, p.y, 3.4 * s, 2 * s, p.a, 0, Math.PI * 2);
        any = true;
      }
      if (any) { fg.globalAlpha = [0.5, 0.32, 0.16][b]; fg.fill(); }
    }
    fg.globalAlpha = 1;
  }

  // heat shimmer: faint wavy bright ribbons over the paving, breathing in and out
  function drawShimmer(t: number, v: NonNullable<typeof view>) {
    if (v.k > 3.2) return;   // zoomed far out it cannot be seen anyway
    fg.strokeStyle = "#fff6e0";
    fg.lineWidth = 7 * Math.max(1, v.k * 0.7);
    fg.lineCap = "round";
    const step = Math.max(18, v.k * 10);
    let n = 0;
    for (const q of roads) {
      if (q.x > v.x + v.w || q.x + q.w < v.x || q.y > v.y + v.h || q.y + q.h < v.y) continue;
      const along = q.w > q.h;
      const a0 = along ? Math.max(q.x, v.x) : Math.max(q.y, v.y), a1 = along ? Math.min(q.x + q.w, v.x + v.w) : Math.min(q.y + q.h, v.y + v.h);
      for (let k = 0; k < 3 && n < 40; k++, n++) {
        const off = (along ? q.y : q.x) + (along ? q.h : q.w) * (0.22 + k * 0.28);
        const ph = k * 2.1 + (along ? q.y : q.x) * 0.01;
        fg.globalAlpha = 0.05 + 0.05 * Math.max(0, Math.sin(t * 0.9 + ph));
        fg.beginPath();
        for (let a = a0; a <= a1; a += step) {
          const w = Math.sin(a * 0.045 + t * 2.4 + ph) * 2.6 + Math.sin(a * 0.013 - t * 1.1) * 1.8;
          if (a === a0) { if (along) fg.moveTo(a, off + w); else fg.moveTo(off + w, a); }
          else if (along) fg.lineTo(a, off + w); else fg.lineTo(off + w, a);
        }
        fg.stroke();
      }
    }
    fg.globalAlpha = 1;
  }

  function flash() {
    const k = clamp(0.3 + opts.night * 1.2, 0.3, 0.65);
    flashEl.animate([{ opacity: 0 }, { opacity: k, offset: 0.06 }, { opacity: k * 0.15, offset: 0.22 }, { opacity: k * 0.8, offset: 0.32 }, { opacity: 0 }], { duration: 800, easing: "ease-out" });
    layer.onFlash?.(k);
  }

  // --- the loop ------------------------------------------------------------------------------
  function frame(now: number) {
    raf = 0;
    if (dead || document.hidden || indoors) return;
    const started = beginSystem();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    const slow = reduce.matches;
    clock += dt;
    // the sky changes slowly: redraw it at 30 fps (4 fps when motion is reduced)
    if (clock - skyAt > (slow ? 0.25 : 1 / 12) || skyAt < 0) { drawSky(clock); skyAt = clock; }
    const rain = R.rain, snow = R.snow;
    const printing = ground.prints && !!steppers;
    if (!printing && prints.length) { prints.length = 0; lastStep.clear(); }
    const busy = rain > 0 || snow > 0 || season === "autumn" || season === "spring" || ground.hot || printing;
    view = busy ? measure() : null;
    if (view || fallDirty) {
      fg.setTransform(1, 0, 0, 1, 0, 0);
      fg.clearRect(0, 0, fall.width, fall.height);
      fallDirty = !!view;
    }
    if (view) {
      const v = view;
      fg.setTransform(1 / v.k, 0, 0, 1 / v.k, -v.x / v.k, -v.y / v.k);
      // with reduced motion the falling things hold still: a static texture
      const tp = slow ? 0 : clock;
      if (rain > 0) { if (!slow) spawnRipples(clock, dt, v, rain); drawRain(tp, v, rain); drawRipples(clock, v); }
      if (ground.hot && !slow) drawShimmer(clock, v);
      if (printing) drawPrints(clock, v, slow ? [] : stepPrints(clock));
      if (snow > 0) drawSnow(tp, v, snow);
      if (!slow) stepDrifts(clock, dt, v); else { drifts.length = 0; }
    }
    if (R.lightning && !slow) {
      if (!nextFlash) nextFlash = clock + 3 + r() * 6;
      if (clock > nextFlash) { flash(); nextFlash = clock + 5 + r() * 12; }
    }
    // nothing falling: only the slow sky moves, so 30 fps is plenty
    endSystem("weather", started);
    schedule(slow ? 250 : cam && cam.s < .3 ? 80 : busy || R.lightning ? 30 : 70);
  }
  let fallDirty = false;
  let timer = 0;
  function schedule(delay = 0) {
    if (raf || timer || dead || document.hidden || indoors) return;
    if (delay) timer = window.setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, delay);
    else raf = requestAnimationFrame(frame);
  }
  const onVis = () => { if (!document.hidden) { last = 0; schedule(); } };
  const onMotion = () => { skyAt = -1; schedule(); };
  document.addEventListener("visibilitychange", onVis);
  reduce.addEventListener("change", onMotion);

  const layer: WeatherLayer = {
    onFlash: null,
    setCamera(c, sc, w, h) {
      if (cam) { cam.x = c.x; cam.y = c.y; cam.s = c.s; } else cam = { ...c };
      if (sceneBox) Object.assign(sceneBox, sc); else sceneBox = { ...sc };
      hostW = w || 1;
      const x = -c.x / c.s, y = -c.y / c.s;
      const inside = h != null && x >= 0 && y >= 0 && x + sc.width / c.s <= w && y + sc.height / c.s <= h;
      if (inside !== indoors) {
        indoors = inside; root.style.visibility = inside ? "hidden" : "";
        if (inside) { cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0; }
        else { last = 0; skyAt = -1; schedule(); }
      }
    },
    setGround(p, rs) { puddlesW = p; pavedW = rs; toLocal(); },
    setSteppers(fn) { steppers = fn; schedule(); },
    flash,
    set(w, o) {
      weather = w;
      opts = { ...o };
      const look = outdoorLook(new Date(), w);
      season = o.season ?? look.season;
      ground = o.ground ?? { puddles: 0, hot: false, prints: false };
      frozen = o.frozen ?? look.frozen;
      R = RECIPES[w?.kind ?? "clear"];
      windKmh = w?.windKmh ?? 8;
      // windDir is where the wind comes from; the weather drifts the other way. North is up.
      const toward = (((w?.windDir ?? 250) + 180) * Math.PI) / 180;
      windX = Math.sin(toward); windY = -Math.cos(toward);
      if (!R.lightning) nextFlash = 0;
      skyAt = -1;
      schedule();
    },
    resize(next) {
      rect = { ...next };
      geo = parkGeo();
      toLocal();
      ripples.length = 0; drifts.length = 0; prints.length = 0; lastStep.clear();
      place();
      skyAt = -1;
      schedule();
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf); clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", onMotion);
      root.remove(); flashEl.remove();
    },
  };
  layer.set(null, { night: 0 });
  return layer;
}
