// Sprite sheets: when a robot looks at an image made of animation frames (a sheet.png with the
// same character in a row of poses), its screen plays it like a video. The grid is worked out
// from the pixels themselves: the layout whose neighbouring frames overlap most is the real one.
import gsap from "gsap";
import type { WM } from "./wm";
import { analysisSize, sheetAnalysisBudget } from "./sheet-analysis";
import { renderLoop } from "../perf/render";

export type Sheet = { cols: number; rows: number; frames: number; fw: number; fh: number; fps: number; score: number };

const GRID = 24;      // every frame is sampled on a 24 x 24 grid

const NAME_HINT = /(sheet|sprite|frames?|strip|atlas|anim|walk|run|cycle|idle|tiles?)/i;
// Keep metadata, not decoded full-resolution images. Data URLs change when a local file does.
const analysed = new Map<string, Sheet | null>();
let cacheBytes = 0;
function remember(key: string, value: Sheet | null) {
  const bytes = key.length * 2;
  if (bytes > 8 * 1024 * 1024) return;
  if (analysed.has(key)) { cacheBytes -= key.length * 2; analysed.delete(key); }
  while (analysed.size >= 8 || cacheBytes + bytes > 16 * 1024 * 1024) {
    const oldest = analysed.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= oldest.length * 2; analysed.delete(oldest);
  }
  analysed.set(key, value); cacheBytes += bytes;
}

type Mask = { w: number; h: number; fg: Uint8Array; rgb: Uint8ClampedArray };

function load(src: string) {
  return new Promise<HTMLImageElement>((ok, no) => {
    const img = new Image();
    const timer = setTimeout(() => { img.onload = img.onerror = null; no(new Error("image load timed out")); }, 9000);
    img.onload = () => { clearTimeout(timer); ok(img); };
    img.onerror = () => { clearTimeout(timer); no(new Error("image failed to load")); };
    img.src = src;
  });
}

// What is figure and what is background: the colour that fills the image border is background
// (or transparency, for transparent PNGs).
async function maskOf(img: HTMLImageElement, checkpoint: () => Promise<void>): Promise<Mask> {
  const { w, h } = analysisSize(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const rgb = g.getImageData(0, 0, w, h).data;
  const counts = new Map<number, number>();
  const edge = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const key = rgb[i + 3] < 32 ? -1 : ((rgb[i] >> 4) << 8) | ((rgb[i + 1] >> 4) << 4) | (rgb[i + 2] >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1); }
  for (let y = 0; y < h; y++) { edge(0, y); edge(w - 1, y); }
  const [bgKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const bg = bgKey === -1 ? null : [((bgKey >> 8) & 15) * 17, ((bgKey >> 4) & 15) * 17, (bgKey & 15) * 17];
  const fg = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (p % (w * 32) === 0) await checkpoint();
    if (rgb[i + 3] < 32) continue;
    if (!bg) { fg[p] = 1; continue; }
    if (Math.abs(rgb[i] - bg[0]) + Math.abs(rgb[i + 1] - bg[1]) + Math.abs(rgb[i + 2] - bg[2]) > 54) fg[p] = 1;
  }
  return { w, h, fg, rgb };
}

// one frame sampled on a small grid: figure or not, and its colour
function sample(m: Mask, cols: number, rows: number, n: number) {
  const fw = m.w / cols, fh = m.h / rows;
  const x0 = (n % cols) * fw, y0 = Math.floor(n / cols) * fh;
  const fg = new Uint8Array(GRID * GRID), col = new Uint8Array(GRID * GRID * 3);
  let count = 0;
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const x = Math.min(m.w - 1, Math.floor(x0 + ((gx + 0.5) * fw) / GRID)), y = Math.min(m.h - 1, Math.floor(y0 + ((gy + 0.5) * fh) / GRID));
    const p = y * m.w + x, o = gy * GRID + gx;
    fg[o] = m.fg[p]; count += m.fg[p];
    col[o * 3] = m.rgb[p * 4]; col[o * 3 + 1] = m.rgb[p * 4 + 1]; col[o * 3 + 2] = m.rgb[p * 4 + 2];
  }
  return { fg, col, count };
}
type Cell = ReturnType<typeof sample>;

// how alike two frames are: the figures overlap and the colours agree where they do
function alike(a: Cell, b: Cell) {
  let both = 0, either = 0, diff = 0;
  for (let o = 0; o < GRID * GRID; o++) {
    if (a.fg[o] && b.fg[o]) {
      both++; either++;
      diff += Math.abs(a.col[o * 3] - b.col[o * 3]) + Math.abs(a.col[o * 3 + 1] - b.col[o * 3 + 1]) + Math.abs(a.col[o * 3 + 2] - b.col[o * 3 + 2]);
    } else if (a.fg[o] || b.fg[o]) either++;
  }
  if (!either) return 1;
  const color = both ? 1 - diff / (both * 765) : 0.5;
  return 0.7 * (both / either) + 0.3 * color;
}

// a figure that touches its own cell edge was probably cut in two by a wrong grid
function touchesEdge(c: Cell) {
  let edge = 0;
  for (let t = 0; t < GRID; t++) edge += c.fg[t] + c.fg[(GRID - 1) * GRID + t] + c.fg[t * GRID] + c.fg[t * GRID + GRID - 1];
  return edge > GRID * 1.6;
}

/** The frame layout of an image, or null when it is just a picture. */
export async function detectSheet(src: string, name: string, valid: () => boolean = () => true): Promise<{ img: HTMLImageElement; sheet: Sheet } | null> {
  const checkpoint = sheetAnalysisBudget(valid);
  await checkpoint();
  const img = await load(src);
  await checkpoint();
  const W = img.naturalWidth, H = img.naturalHeight;
  const hinted = NAME_HINT.test(name);
  // only wide or tall strips are worth a look, unless the name says it is a sheet
  if (!hinted && Math.max(W / H, H / W) < 2.4) return null;
  if (W < 48 || H < 16 || W * H > 36_000_000) return null;
  const key = `${hinted ? "hint" : "strip"}:${src}`;
  const finish = (sheet: Sheet | null) => {
    if (!sheet) return null;
    const fps = Number(name.match(/(\d{1,3})\s*fps/i)?.[1]);
    return { img, sheet: { ...sheet, fps: fps >= 1 && fps <= 60 ? fps : sheet.frames <= 4 ? 6 : sheet.frames <= 12 ? 10 : 12 } };
  };
  if (analysed.has(key)) {
    const cached = analysed.get(key)!;
    analysed.delete(key); analysed.set(key, cached);
    return finish(cached);
  }
  const m = await maskOf(img, checkpoint);
  const found: Sheet[] = [];
  for (let rows = 1; rows <= 8; rows++) for (let cols = 1; cols <= 32; cols++) {
    await checkpoint();
    const total = cols * rows;
    if (total < 3 || total > 64) continue;
    const aspect = W / cols / (H / rows);
    if (aspect < 0.3 || aspect > 3.2) continue;
    const cells = Array.from({ length: total }, (_, n) => sample(m, cols, rows, n));
    // empty cells at the end are padding, not frames
    let used = total;
    while (used > 2 && cells[used - 1].count < 3) used--;
    if (used < 3) continue;
    let s = 0, clipped = 0;
    for (let n = 1; n < used; n++) s += alike(cells[n - 1], cells[n]);
    for (let n = 0; n < used; n++) if (touchesEdge(cells[n])) clipped++;
    s = (s / (used - 1)) * (1 - 0.5 * (clipped / used));
    found.push({ cols, rows, frames: used, fw: W / cols, fh: H / rows, fps: 10, score: s });
  }
  if (!found.length) { remember(key, null); return null; }
  const top = Math.max(...found.map((c) => c.score));
  // two frames merged look alike too, a frame cut in half does not: at near equal scores the finer cut wins
  const best = found.filter((c) => c.score >= top - 0.03).sort((a, b) => b.frames - a.frames)[0];
  const result = best.score < (hinted ? 0.42 : 0.6) ? null : best;
  remember(key, result);
  return finish(result);
}

const PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11-7.5c.6-.4.6-1.2 0-1.6l-11-7.5C7.9 3.2 7 3.7 7 4.5Z" fill="currentColor"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.4" fill="currentColor"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.4" fill="currentColor"/></svg>`;

/**
 * The player: the sheet's frames play in order on a stage, a bar and a filmstrip follow the
 * frame that is really showing. The robot presses play, watches it loop, then jumps to a frame.
 */
/** `measured`: the space the controls take around the stage, once laid out. */
export async function playSheet(wm: WM, body: HTMLElement, found: { img: HTMLImageElement; sheet: Sheet }, src: string, opts: { loops?: number; width?: number; measured?: (inset: { w: number; h: number }) => void } = {}) {
  const { img, sheet: s } = found, e = wm.epoch;
  const tiny = s.fw <= 80 && s.fh <= 80;
  body.innerHTML = `
    <div class="sheet">
      <div class="sh-stage"><canvas class="${tiny ? "px" : ""}" width="${Math.round(s.fw)}" height="${Math.round(s.fh)}"></canvas></div>
      <div class="sh-ctrl"><button type="button" class="sh-play" aria-label="Play">${PLAY}</button><div class="sh-bar"><i></i></div><span class="sh-time"><b>1</b> / ${s.frames}</span></div>
      <div class="sh-strip" role="list">${Array.from({ length: s.frames }, (_, n) => `<span class="sh-f${n === 0 ? " on" : ""}" role="listitem" data-n="${n}"></span>`).join("")}</div>
    </div>`;
  const stage = body.querySelector(".sh-stage") as HTMLElement, canvas = body.querySelector("canvas") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = !tiny;
  const play = body.querySelector(".sh-play") as HTMLElement, bar = body.querySelector(".sh-bar i") as HTMLElement, time = body.querySelector(".sh-time b") as HTMLElement;
  const thumbs = Array.from(body.querySelectorAll(".sh-f")) as HTMLElement[];
  opts.measured?.({ w: body.clientWidth - stage.clientWidth, h: body.clientHeight - stage.clientHeight });
  // the filmstrip shows the same pixels, cut out of the sheet
  const url = src.replace(/"/g, "%22");
  // size of one filmstrip frame: as large as fits (max 64 wide, 40 tall), in the sheet's own proportions
  const avail = (opts.width ?? body.clientWidth - 24) - 3 * (s.frames - 1);
  let tw = Math.min(64, Math.floor(avail / s.frames)), th = Math.round((tw * s.fh) / s.fw);
  if (th > 40) { th = 40; tw = Math.round((th * s.fw) / s.fh); }
  thumbs.forEach((t, n) => {
    const px = s.cols > 1 ? ((n % s.cols) / (s.cols - 1)) * 100 : 0, py = s.rows > 1 ? (Math.floor(n / s.cols) / (s.rows - 1)) * 100 : 0;
    t.style.cssText = `width:${tw}px;height:${th}px;background-image:url("${url}");background-size:${s.cols * 100}% ${s.rows * 100}%;background-position:${px}% ${py}%`;
  });
  let cur = -1;
  const show = (n: number) => {
    if (n === cur) return;
    cur = n;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, (n % s.cols) * s.fw, Math.floor(n / s.cols) * s.fh, s.fw, s.fh, 0, 0, canvas.width, canvas.height);
    time.textContent = String(n + 1);
    bar.style.transform = `scaleX(${s.frames > 1 ? n / (s.frames - 1) : 1})`;
    thumbs.forEach((t, i) => t.classList.toggle("on", i === n));
  };
  show(0);
  gsap.fromTo(body.querySelector(".sheet"), { opacity: 0 }, { opacity: 1, duration: 0.35 });

  // playback: the frame comes from the clock, so it never drifts from the real frame rate
  let playing = false, t0 = 0, at = 0;
  let stopPlayback: (() => void) | null = null;
  const frameAt = () => at + ((performance.now() - t0) / 1000) * s.fps;
  const tick = () => {
    if (wm.epoch !== e || !body.contains(canvas)) { setPlaying(false); return; }
    const f = frameAt();
    show(Math.floor(f) % s.frames);
  };
  const setPlaying = (on: boolean) => {
    if (on === playing) return;
    if (on) { t0 = performance.now(); at = Math.max(0, cur); stopPlayback = renderLoop(body, tick); }
    else { stopPlayback?.(); stopPlayback = null; }
    playing = on;
    play.innerHTML = on ? PAUSE : PLAY;
    play.setAttribute("aria-label", on ? "Pause" : "Play");
  };
  try {
    wm.robot.setPose("read");
    await wm.pointAt(play, 0.5, 0.5, 420);
    await wm.click();
    wm.check(e);
    setPlaying(true);
    // it watches the loop: a few passes, a few seconds at least, never a wait for nothing
    const want = Math.max(2, opts.loops ?? 3);
    const cap = Math.min(7000, Math.max(3200, (s.frames / s.fps) * 1000 * want));
    const began = performance.now();
    await wm.pointAt(stage, 0.5, 0.55, 500);
    // Logical playback continues while its screen is hidden or covered. Its next
    // visible draw samples the actual clock instead of replaying missed frames.
    while (Math.floor(frameAt() / s.frames) < want && performance.now() - began < cap) await wm.sleep(120, e);
    // then it pauses and jumps to a frame it wants a closer look at, picked on the filmstrip
    await wm.pointAt(play, 0.5, 0.5, 360);
    await wm.click();
    wm.check(e);
    setPlaying(false);
    const pick = thumbs[Math.min(s.frames - 1, Math.floor(s.frames * (0.3 + Math.random() * 0.5)))];
    await wm.pointAt(pick, 0.5, 0.5, 420);
    await wm.click();
    wm.check(e);
    show(Number(pick.dataset.n));
    await wm.sleep(900, e);
  } finally { setPlaying(false); }
}
