// Falling weather (rain, snow, autumn leaves, spring petals), drawn off the main thread.
//
// The canvas lives in the office's weather box (world coordinates), so it sits under the
// building and moves with the camera for free. This worker draws into it on every display
// frame: particles are anchored in the world but keep a constant size on screen, and during a
// wheel glide the worker follows the same curve as the camera, so nothing stretches or snaps.
import { glideCamera, type Glide } from "../perf/ease";

type Cam = { x: number; y: number; s: number };
type Crop = { x: number; y: number; w: number; h: number; d: number };
export type ParticleParams = {
  rain: number; snow: number; leaves: number; petals: number;
  windX: number; windKmh: number; night: number; still: boolean;
  /** Nothing touched and the camera at rest: draw 24 times a second (world/budget.ts calm mode). */
  calm?: boolean;
};
export type ParticleMessage =
  | { type: "init"; canvas: OffscreenCanvas }
  | { type: "crop"; crop: Crop }
  | { type: "camera"; cam: Cam; scene: { w: number; h: number } }
  | { type: "glide"; glide: Glide | null }
  | { type: "params"; params: ParticleParams }
  | { type: "active"; on: boolean };

type Drop = { x: number; y: number; z: number; age: number; life: number; fade: number };
type Flake = Drop & { ph: number };
type Leaf = Drop & { ph: number; rot: number; spin: number; flip: number; col: number; vx: number; vy: number };

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let crop: Crop | null = null;
let cam: Cam = { x: 0, y: 0, s: 1 };
let scene = { w: 1, h: 1 };
let glide: Glide | null = null;
let params: ParticleParams = { rain: 0, snow: 0, leaves: 0, petals: 0, windX: 0, windKmh: 8, night: 0, still: false };
let active = false;
let raf = 0, last = 0, lastScale = 0, blank = true, lastBeat = NaN;
const rain: Drop[] = [], snow: Flake[] = [], leaves: Leaf[] = [];
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const now = () => performance.timeOrigin + performance.now();

const LEAF = ["#d9783a", "#e8a23c", "#b5472f", "#e6c04a", "#c9622e"];
const PETAL = ["#ffc2d6", "#ffe3ec", "#ffffff", "#f7a6c4"];
// a leaf one unit long: pointed at both ends, fuller towards the stem
const leafPath = new Path2D("M-1 0 C-0.55 -0.62 0.35 -0.62 1 0 C0.35 0.62 -0.55 0.62 -1 0 Z");
const veinPath = new Path2D("M-0.95 0 L0.9 0");
const petalPath = new Path2D("M-1 0 C-0.6 -0.9 0.6 -0.9 1 0 C0.6 0.75 -0.6 0.75 -1 0 Z");
let flakeSprite: OffscreenCanvas | null = null;
function sprite() {
  if (flakeSprite) return flakeSprite;
  flakeSprite = new OffscreenCanvas(32, 32);
  const g = flakeSprite.getContext("2d")!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(255,255,255,0.85)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return flakeSprite;
}

function camera(at: number) {
  // Past its end a glide holds its goal until the office reports the settled camera.
  if (glide) return glideCamera(glide, at);
  return cam;
}
/** The visible world rectangle for a camera. */
/** On-screen size follows zoom gently: smaller over a far-out map, a little bigger up close,
 * never giant. Sizes and speeds below are in these "felt" pixels. */
const feel = (scale: number) => clamp(Math.pow(scale / 0.6, 0.45), 0.5, 1.45);
const viewOf = (c: Cam) => ({ x: -c.x / c.s, y: -c.y / c.s, w: scene.w / c.s, h: scene.h / c.s });

// How many of each, per million screen pixels (CSS). Screen-based, so zooming keeps density.
const perMpx = () => ({
  rain: params.rain * 420,
  snow: params.snow * 150,
  leaves: params.leaves * 9,
  petals: params.petals * 14,
});

function spawnIn(v: { x: number; y: number; w: number; h: number }) {
  return { x: v.x + rand() * v.w, y: v.y + rand() * v.h };
}

function step(dt: number, c: Cam, v: { x: number; y: number; w: number; h: number }) {
  const real = c.s, s = real / feel(real), mpx = (scene.w * scene.h) / 1e6, want = perMpx();
  // Zooming out shows more world in the same screen: thin the old particles so density
  // stays even, and refill the newly visible area.
  if (lastScale && real < lastScale * 0.999) {
    const keep = (real / lastScale) ** 2;
    for (const list of [rain, snow, leaves] as Drop[][]) for (const p of list) if (!p.fade && rand() > keep) p.fade = 0.25;
  }
  lastScale = real;
  const lean = clamp(params.windX * (0.25 + params.windKmh / 70), -0.9, 0.9);
  const out = (p: Drop, m: number) => p.x < v.x - m || p.x > v.x + v.w + m || p.y < v.y - m || p.y > v.y + v.h + m;
  const age = <T extends Drop>(list: T[], m: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.fade) p.fade -= dt;
      if (p.age > p.life || p.fade < 0 || out(p, m)) list.splice(i, 1);
    }
  };
  // rain: streaks that fall a short way and vanish (their splashes are drawn on the ground)
  age(rain, 60 / s);
  const nRain = Math.round(want.rain * mpx);
  while (rain.length < nRain) { const p = spawnIn(v); rain.push({ ...p, z: rand(), age: 0, life: 0.25 + rand() * 0.55, fade: 0 }); }
  if (rain.length > nRain) rain.length = nRain;
  for (const p of rain) { const sp = (700 + 700 * p.z) / s; p.y += sp * dt; p.x += lean * sp * dt; }
  // snow: soft flakes drifting with the wind, swaying as they go
  age(snow, 40 / s);
  const nSnow = Math.round(want.snow * mpx);
  while (snow.length < nSnow) { const p = spawnIn(v); snow.push({ ...p, z: rand(), age: snow.length < nSnow / 2 ? rand() * 4 : 0, life: 6 + rand() * 8, fade: 0, ph: rand() * 6.28 }); }
  if (snow.length > nSnow) snow.length = nSnow;
  const drift = params.windX * (6 + params.windKmh * 1.4);
  for (const p of snow) {
    const sp = (28 + 60 * p.z) / s;
    p.y += sp * dt;
    p.x += ((drift * (0.5 + p.z)) / s + (Math.cos(p.age * 1.3 + p.ph) * (10 + 10 * p.z)) / s) * dt;
  }
  // leaves and petals: tumble, flip and ride the wind across the ground
  age(leaves, 80 / s);
  const petals = want.petals > 0, nLeaves = Math.round((petals ? want.petals : want.leaves) * mpx);
  while (leaves.length < nLeaves) {
    const p = spawnIn(v);
    leaves.push({ ...p, z: rand(), age: leaves.length < nLeaves / 2 ? rand() * 5 : 0, life: 7 + rand() * 7, fade: 0,
      ph: rand() * 6.28, rot: rand() * 6.28, spin: (rand() - 0.5) * 2.6, flip: 1.2 + rand() * 2.4,
      col: Math.floor(rand() * (petals ? PETAL.length : LEAF.length)), vx: (rand() - 0.5) * 18, vy: 6 + rand() * 14 });
  }
  if (leaves.length > nLeaves) leaves.length = nLeaves;
  const gust = 1 + 0.6 * Math.sin(performance.now() / 2300) * clamp((params.windKmh - 6) / 20, 0, 1);
  const wind = params.windX * (14 + params.windKmh * 2.4) * gust;
  for (const p of leaves) {
    const flutter = Math.sin(p.age * 1.7 + p.ph) * (16 + 10 * p.z);
    p.x += ((p.vx + wind * (0.6 + 0.6 * p.z) + flutter) / s) * dt;
    p.y += ((p.vy + Math.cos(p.age * 1.1 + p.ph) * 6) / s) * dt;
    p.rot += p.spin * dt * (0.7 + 0.5 * gust);
  }
}

function alphaOf(p: Drop, fadeIn: number, fadeOut: number) {
  const a = Math.min(1, p.age / fadeIn, (p.life - p.age) / fadeOut);
  return Math.max(0, p.fade ? Math.min(a, p.fade / 0.25) : a);
}

function draw(c: Cam) {
  if (!ctx || !canvas || !crop) return;
  const s = c.s / feel(c.s), d = canvas.width / crop.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(d, 0, 0, d, -crop.x * d, -crop.y * d);
  const px = 1 / s; // one screen pixel in world units at this moment
  const night = params.night;
  // rain in three depth bands: far streaks are short and faint, near ones long and bright
  if (rain.length) {
    const lean = clamp(params.windX * (0.25 + params.windKmh / 70), -0.9, 0.9), m = Math.hypot(lean, 1);
    ctx.lineCap = "round";
    ctx.strokeStyle = night > 0.1 ? "#b9cbe6" : "#d6e6f3";
    for (let b = 0; b < 3; b++) {
      const z0 = b / 3, z1 = (b + 1) / 3, zc = (z0 + z1) / 2;
      const len = (9 + 22 * zc) * px * (0.7 + 0.3 * Math.min(1, params.rain));
      const dx = (lean / m) * len, dy = (1 / m) * len;
      ctx.lineWidth = (0.7 + 0.9 * zc) * px;
      ctx.globalAlpha = (0.16 + 0.3 * zc) * clamp(0.6 + params.rain * 0.4, 0, 1.15);
      ctx.beginPath();
      for (const p of rain) if (p.z >= z0 && p.z < z1) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx, p.y - dy); }
      ctx.stroke();
    }
  }
  // snow: soft round flakes, nearer ones bigger and brighter
  if (snow.length) {
    const img = sprite();
    for (const p of snow) {
      const r = (1.4 + 2.6 * p.z) * px * 1.6;
      ctx.globalAlpha = (0.45 + 0.5 * p.z) * alphaOf(p, 0.8, 1.5);
      ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
    }
  }
  // leaves / petals with a soft shadow on the ground below them
  if (leaves.length) {
    const petals = params.petals > 0, cols = petals ? PETAL : LEAF, path = petals ? petalPath : leafPath;
    for (const p of leaves) {
      const a = alphaOf(p, 0.9, 1.4);
      if (a <= 0) continue;
      const size = (petals ? 3.4 + 2.4 * p.z : 5.5 + 4.5 * p.z) * px * 1.25;
      const flip = Math.cos(p.age * p.flip + p.ph); // edge-on when near 0: a turning leaf
      const lift = (5 + 9 * p.z) * px;
      ctx.setTransform(d, 0, 0, d, -crop.x * d, -crop.y * d);
      ctx.translate(p.x + lift * 0.6, p.y + lift);
      ctx.rotate(p.rot);
      ctx.scale(size, size * (0.25 + 0.75 * Math.abs(flip)));
      ctx.globalAlpha = 0.16 * a * (1 - night * 0.5);
      ctx.fillStyle = "#1c2416";
      ctx.fill(path);
      ctx.setTransform(d, 0, 0, d, -crop.x * d, -crop.y * d);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(size, size * (0.25 + 0.75 * Math.abs(flip)));
      ctx.globalAlpha = a;
      ctx.fillStyle = cols[p.col % cols.length];
      ctx.fill(path);
      if (!petals) {
        // the underside shows when the leaf has flipped over: a touch darker, with its vein
        if (flip < 0) { ctx.globalAlpha = a * 0.22; ctx.fillStyle = "#3a1d0c"; ctx.fill(path); }
        ctx.globalAlpha = a * 0.45; ctx.strokeStyle = "#6e3417"; ctx.lineWidth = 0.09; ctx.stroke(veinPath);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.globalAlpha = 1;
}

function anything() { return params.rain > 0 || params.snow > 0 || params.leaves > 0 || params.petals > 0; }

function frame() {
  raf = 0;
  if (!active || !ctx || !crop) return;
  const t = now();
  if (params.calm && !params.still) {
    const beat = Math.floor(t * 24 / 1000);
    if (beat === lastBeat) { raf = requestAnimationFrame(frame); return; }
    lastBeat = beat;
  }
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
  last = t;
  const c = camera(t), v = viewOf(c);
  if (!anything()) {
    if (!blank) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas!.width, canvas!.height); blank = true; }
    rain.length = snow.length = leaves.length = 0;
    return;
  }
  if (!params.still) step(dt, c, v);
  else if (!rain.length && !snow.length && !leaves.length) step(0.016, c, v); // a static scene for reduced motion
  draw(c);
  blank = false;
  if (!params.still) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf && active) raf = requestAnimationFrame(frame); };

self.onmessage = (e: MessageEvent<ParticleMessage>) => {
  const m = e.data;
  if (m.type === "init") { canvas = m.canvas; ctx = canvas.getContext("2d"); }
  else if (m.type === "crop") {
    crop = m.crop;
    if (canvas) {
      const w = Math.max(1, Math.round(crop.w * crop.d)), h = Math.max(1, Math.round(crop.h * crop.d));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
  }
  else if (m.type === "camera") { cam = m.cam; scene = m.scene; if (glide && now() >= glide.start + glide.ms) glide = null; }
  else if (m.type === "glide") glide = m.glide;
  else if (m.type === "params") params = m.params;
  else if (m.type === "active") { active = m.on; last = 0; if (!active && raf) { cancelAnimationFrame(raf); raf = 0; } }
  kick();
};
