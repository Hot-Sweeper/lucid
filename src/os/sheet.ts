// Sheets: an image made of frames, either a sprite sheet (one character in a row of poses) or a
// contact sheet (screenshots of an app over time, tiled in a grid). A robot that looks at one
// sees it play like a video. The frame bounds come from the pixels:
//   1. gutters: full-height columns and full-width rows of one flat colour separate the cells,
//      and the cells between them are the frames, exactly, without the gutters;
//   2. repetition: sheets without gutters repeat with the cell size, so the image compared with
//      itself shifted by one cell lines up far better than at any other shift.
import gsap from "gsap";
import type { WM } from "./wm";

export type Rect = { x: number; y: number; w: number; h: number };
/** `clips`: where each clip starts, when every row of the sheet is its own little video. */
export type Sheet = { frames: Rect[]; cols: number; rows: number; fw: number; fh: number; fps: number; kind: "sprite" | "shots"; clips: number[] };

const WORK = 720;     // analysed at most this wide (and tall)
const NAME_HINT = /(sheet|sprite|frames?|strip|atlas|anim|walk|run|cycle|idle|tiles?|contact|timeline|shots)/i;

function load(src: string) {
  return new Promise<HTMLImageElement>((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => no(new Error("image failed to load"));
    img.src = src;
  });
}

type Gray = { w: number; h: number; k: number; v: Float32Array };
// brightness of every pixel at working size (transparent counts as one flat value)
function grayOf(img: HTMLImageElement): Gray {
  const k = Math.min(1, WORK / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const v = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) v[p] = d[i + 3] < 32 ? -40 : 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  return { w, h, k, v };
}

// how flat every column (axis "x") or row (axis "y") is: its spread of brightness, and the share
// of it taken by its most common colour (a gutter crossed by a scrollbar or a label is still a gutter)
function spread(gr: Gray, axis: "x" | "y") {
  const n = axis === "x" ? gr.w : gr.h, m = axis === "x" ? gr.h : gr.w;
  const sd = new Float32Array(n), share = new Float32Array(n);
  const hist = new Uint32Array(40);
  for (let a = 0; a < n; a++) {
    let s = 0, s2 = 0;
    hist.fill(0);
    for (let b = 0; b < m; b++) {
      const x = axis === "x" ? gr.v[b * gr.w + a] : gr.v[a * gr.w + b];
      s += x; s2 += x * x;
      hist[x < 0 ? 0 : 1 + Math.min(38, Math.floor(x / 7))]++;
    }
    const mean = s / m;
    sd[a] = Math.sqrt(Math.max(0, s2 / m - mean * mean));
    let top = 0;
    for (let i = 0; i < 40; i++) top = Math.max(top, hist[i] + (i > 0 ? hist[i - 1] : 0));
    share[a] = top / m;
  }
  return { sd, share };
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/**
 * Cells between flat gutters along one axis, or null when there are no clear, even gutters.
 * `loose` also counts a line as flat when one colour fills almost all of it, for gutters crossed
 * by a scrollbar or a row of labels (only tried when the strict look finds nothing, because
 * flat bands inside the frames, like a toolbar row, would pass it too).
 */
function gutterCells({ sd, share }: { sd: Float32Array; share: Float32Array }, loose: boolean): [number, number][] | null {
  const n = sd.length;
  const t = Math.max(2.2, 0.12 * median(Array.from(sd)));
  const flat = (i: number) => sd[i] <= t || (loose && share[i] >= 0.97);
  const cells: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const isFlat = i === n || flat(i);
    if (!isFlat && start < 0) start = i;
    if (isFlat && start >= 0) { if (i - start >= Math.max(4, n * 0.04)) cells.push([start, i]); start = -1; }
  }
  if (cells.length < 2) return null;
  // the frames are the runs of one common size; a label column, a scrollbar or a row cut off at
  // the bottom of a screenshot is a run of another size and is left out
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(3, b * 0.06);
  const sizes = cells.map(([a, b]) => b - a);
  const mid = sizes.map((s0) => ({ s0, k: sizes.filter((x) => near(x, s0)).length })).sort((a, b) => b.k - a.k || b.s0 - a.s0)[0].s0;
  const keep = cells.filter(([a, b]) => near(b - a, mid));
  if (keep.length < 2) return null;
  // one cell after the other, at one pitch, covering most of the sheet
  const starts = keep.map(([a]) => a);
  const pitch = median(starts.slice(1).map((x, i) => x - starts[i]));
  if (pitch > mid * 1.25 || starts.slice(1).some((x, i) => Math.abs(x - starts[i] - pitch) > Math.max(3, pitch * 0.04))) return null;
  if (keep.length * mid < n * 0.55) return null;
  return keep;
}

/** How many equal cells repeat along one axis (1 when nothing repeats), and how clearly (0..1). */
function repeats(gr: Gray, axis: "x" | "y"): { n: number; q: number } {
  const len = axis === "x" ? gr.w : gr.h;
  const step = Math.max(1, Math.floor((axis === "x" ? gr.h : gr.w) / 120));
  // 1. the picture compared with itself shifted by one cell
  const diff = (p: number) => {
    let s = 0, c = 0;
    if (axis === "x") { for (let y = 0; y < gr.h; y += step) for (let x = 0; x + p < gr.w; x += 2) { s += Math.abs(gr.v[y * gr.w + x] - gr.v[y * gr.w + x + p]); c++; } }
    else { for (let y = 0; y + p < gr.h; y += 2) for (let x = 0; x < gr.w; x += step) { s += Math.abs(gr.v[y * gr.w + x] - gr.v[(y + p) * gr.w + x]); c++; } }
    return c ? s / c : 255;
  };
  // 2. where the edges are: a window's title bar, a panel border repeat in every cell even when
  //    what is inside them changes (a dimmed game over screen, a new chart)
  const prof = new Float32Array(len);
  for (let a = 1; a < len; a++) {
    let s = 0, c = 0;
    if (axis === "x") for (let y = 0; y < gr.h; y += step) { s += Math.abs(gr.v[y * gr.w + a] - gr.v[y * gr.w + a - 1]); c++; }
    else for (let x = 0; x < gr.w; x += step) { s += Math.abs(gr.v[a * gr.w + x] - gr.v[(a - 1) * gr.w + x]); c++; }
    prof[a] = s / c;
  }
  const corr = (p: number) => {
    const m = len - p;
    if (m < 8) return 0;
    let sa = 0, sb = 0;
    for (let i = 0; i < m; i++) { sa += prof[i]; sb += prof[i + p]; }
    sa /= m; sb /= m;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < m; i++) { const a = prof[i] - sa, b = prof[i + p] - sb; num += a * b; da += a * a; db += b * b; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  };
  const odd = Array.from({ length: 24 }, (_, i) => Math.round(len * (0.05 + 0.45 * ((i * 0.618034) % 1))));
  const ref = median(odd.map(diff)), base = median(odd.map(corr));
  if (ref < 1) return { n: 1, q: 0 };
  const found: { n: number; q: number }[] = [];
  for (let n = 2; n <= 16; n++) {
    const p = Math.round(len / n);
    if (p < 10) break;
    const r = diff(p) / ref, c = corr(p);
    found.push({ n, q: Math.max(1 - r, c - Math.max(0, base)) });
  }
  const best = Math.max(...found.map((f) => f.q));
  // two cells merged repeat too, half a cell does not: the finest cut that is about as good wins
  const pick = found.filter((f) => f.q >= best - 0.08 && f.q > 0.38).sort((a, b) => b.n - a.n)[0];
  return pick ?? { n: 1, q: 0 };
}

/** The frames of an image, or null when it is just a picture. */
export async function detectSheet(src: string, name: string): Promise<{ img: HTMLImageElement; sheet: Sheet } | null> {
  const img = await load(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (W < 48 || H < 16 || W * H > 40_000_000) return null;
  const hinted = NAME_HINT.test(name);
  // a long strip can be a sheet by its shape; anything else has to say so in its name
  if (!hinted && Math.max(W / H, H / W) < 2.4) return null;
  const gr = grayOf(img);
  const axis = (a: "x" | "y") => {
    const sp = spread(gr, a);
    const g = gutterCells(sp, false) ?? gutterCells(sp, true);
    if (g) return { cells: g, clear: true };
    const { n, q } = repeats(gr, a);
    const len = a === "x" ? gr.w : gr.h;
    return { cells: Array.from({ length: n }, (_, i) => [Math.round((len * i) / n), Math.round((len * (i + 1)) / n)] as [number, number]), clear: n > 1 && q > (hinted ? 0.38 : 0.6) };
  };
  const xs = axis("x"), ys = axis("y");
  if (!xs.clear && !ys.clear) return null;
  const cols = xs.clear ? xs.cells : [[0, gr.w] as [number, number]];
  const rowsC = ys.clear ? ys.cells : [[0, gr.h] as [number, number]];
  let frames: Rect[] = [];
  for (const [y0, y1] of rowsC) for (const [x0, x1] of cols) frames.push({ x: x0 / gr.k, y: y0 / gr.k, w: (x1 - x0) / gr.k, h: (y1 - y0) / gr.k });
  // empty cells at the end of the last row are padding, not frames
  const flat = (f: Rect) => {
    const x0 = Math.floor(f.x * gr.k), y0 = Math.floor(f.y * gr.k), x1 = Math.floor((f.x + f.w) * gr.k), y1 = Math.floor((f.y + f.h) * gr.k);
    let s = 0, s2 = 0, c = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const v = gr.v[y * gr.w + x]; s += v; s2 += v * v; c++; }
    return !c || Math.sqrt(Math.max(0, s2 / c - (s / c) ** 2)) < 2;
  };
  while (frames.length > 2 && flat(frames[frames.length - 1])) frames.pop();
  if (frames.length < (hinted ? 2 : 3)) return null;
  const fw = median(frames.map((f) => f.w)), fh = median(frames.map((f) => f.h));
  // frames are pictures: thin slivers are a repeating pattern in one picture (a fence, a skyline)
  if (fw / fh < 0.3 || fw / fh > 3.5 || fw < 12 || fh < 12) return null;
  // big frames are screenshots taken over time (played like a timelapse), small ones are sprite poses
  const kind: Sheet["kind"] = fw >= 180 && fh >= 110 ? "shots" : "sprite";
  const named = Number(name.match(/(\d{1,3})\s*fps/i)?.[1]);
  const fps = named >= 1 && named <= 60 ? named : kind === "shots" ? 2.5 : frames.length <= 4 ? 6 : frames.length <= 12 ? 10 : 12;
  frames = frames.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) }));
  // A sheet whose rows are different scenes (a review of several animations, one per row) plays
  // row by row as clips: frames next to each other in a row are far more alike than the end of
  // one row and the start of the next.
  const C = cols.length, clips = [0];
  if (rowsC.length > 1 && C >= 3) {
    const thumb = (f: Rect) => {
      const t = new Float32Array(256);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const x = Math.min(gr.w - 1, Math.floor((f.x + ((i + 0.5) * f.w) / 16) * gr.k)), y = Math.min(gr.h - 1, Math.floor((f.y + ((j + 0.5) * f.h) / 16) * gr.k));
        t[j * 16 + i] = gr.v[y * gr.w + x];
      }
      return t;
    };
    const th = frames.map(thumb);
    const d = (a: number, b: number) => { let s = 0; for (let i = 0; i < 256; i++) s += Math.abs(th[a][i] - th[b][i]); return s / 256; };
    const within: number[] = [], across: number[] = [];
    for (let n = 1; n < frames.length; n++) (n % C === 0 ? across : within).push(d(n - 1, n));
    if (across.length && median(across) > 2.2 * median(within) + 4) for (let n = C; n < frames.length; n += C) clips.push(n);
  }
  return { img, sheet: { frames, cols: C, rows: rowsC.length, fw: Math.round(fw), fh: Math.round(fh), fps, kind, clips } };
}

// --- the player -------------------------------------------------------------------------------
const I = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8c0 .8.9 1.3 1.6.8l11-7.4c.6-.4.6-1.3 0-1.7l-11-7.3C7.9 3.3 7 3.8 7 4.6Z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.3" height="15" rx="1.3" fill="currentColor"/><rect x="13.7" y="4.5" width="4.3" height="15" rx="1.3" fill="currentColor"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5.5" width="2.6" height="13" rx="1" fill="currentColor"/><path d="M19 6.6v10.8c0 .8-.9 1.2-1.5.8l-8-5.4a1 1 0 0 1 0-1.6l8-5.4c.6-.4 1.5 0 1.5.8Z" fill="currentColor"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="16.4" y="5.5" width="2.6" height="13" rx="1" fill="currentColor"/><path d="M5 6.6v10.8c0 .8.9 1.2 1.5.8l8-5.4a1 1 0 0 0 0-1.6l-8-5.4C5.9 5.4 5 5.8 5 6.6Z" fill="currentColor"/></svg>`,
};
const clock = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}`;

/** The frame layout of a player window that fits this sheet on a robot's 820 x 461 screen. */
export function playerFrame(s: Sheet, screenW: number, screenH: number) {
  const w = Math.min(screenW - 40, s.kind === "shots" ? 640 : 540);
  const stageW = w - 16;
  const stageH = Math.max(150, Math.min(screenH - 28 - 66 - 12, Math.round(stageW * (s.fh / s.fw))));
  const h = stageH + 28 + 66;
  return { x: Math.round((screenW - w) / 2), y: Math.max(6, Math.round((screenH - h) / 2) - 4), w, h };
}

/**
 * The player: the real frames play on a stage with a video player's controls over it (play,
 * frame back and forward, a scrubber with one tick per frame, the time and the frame number)
 * and a filmstrip under it. Everything follows the frame that is really on screen. The robot
 * presses play, watches it loop, scrubs back through it, and stops on a frame to look closer.
 */
export async function playSheet(wm: WM, body: HTMLElement, found: { img: HTMLImageElement; sheet: Sheet }, opts: { loops?: number } = {}) {
  const { img, sheet: s } = found, e = wm.epoch;
  const N = s.frames.length;
  const pixel = s.kind === "sprite" && s.fw <= 96 && s.fh <= 96;
  const total = N / s.fps;
  body.innerHTML = `
    <div class="vp${pixel ? " vp-px" : ""}">
      <div class="vp-stage">
        <canvas width="${s.fw}" height="${s.fh}"></canvas>
        <span class="vp-big" aria-hidden="true">${I.play}</span>
        <div class="vp-hud">
          <div class="vp-scrub"><div class="vp-track"><i class="vp-done"></i>${N <= 48 ? s.frames.map((_, n) => `<s style="left:${N > 1 ? (n / (N - 1)) * 100 : 0}%"></s>`).join("") : ""}${s.clips.slice(1).map((c) => `<u style="left:${((c - 0.5) / (N - 1)) * 100}%"></u>`).join("")}<b class="vp-knob"></b></div></div>
          <div class="vp-row">
            <span class="vp-btn vp-prev" aria-label="Previous frame">${I.prev}</span>
            <span class="vp-btn vp-play" aria-label="Play">${I.play}</span>
            <span class="vp-btn vp-next" aria-label="Next frame">${I.next}</span>
            <span class="vp-time"><b>${clock(0)}</b> / ${clock(total)}</span>
            <span class="vp-gap"></span>
            <span class="vp-num"></span>
          </div>
        </div>
      </div>
      <div class="vp-strip" role="list">${s.frames.map((_, n) => `<canvas class="vp-th${n ? "" : " on"}" role="listitem" data-n="${n}"></canvas>`).join("")}</div>
    </div>`;
  const root = body.querySelector(".vp") as HTMLElement, stage = root.querySelector(".vp-stage") as HTMLElement;
  const canvas = root.querySelector(".vp-stage canvas") as HTMLCanvasElement, g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = !pixel;
  const big = root.querySelector(".vp-big") as HTMLElement, hud = root.querySelector(".vp-hud") as HTMLElement;
  const playBtn = root.querySelector(".vp-play") as HTMLElement, nextBtn = root.querySelector(".vp-next") as HTMLElement, prevBtn = root.querySelector(".vp-prev") as HTMLElement;
  const track = root.querySelector(".vp-track") as HTMLElement, done = root.querySelector(".vp-done") as HTMLElement, knob = root.querySelector(".vp-knob") as HTMLElement;
  const timeEl = root.querySelector(".vp-time b") as HTMLElement, numEl = root.querySelector(".vp-num") as HTMLElement;
  const strip = root.querySelector(".vp-strip") as HTMLElement, thumbs = Array.from(strip.children) as HTMLCanvasElement[];

  // the filmstrip: every frame cut out of the sheet at its real bounds
  const th = 38, tw = Math.max(20, Math.round((th * s.fw) / s.fh));
  thumbs.forEach((c, n) => {
    const f = s.frames[n];
    c.width = tw * 2; c.height = th * 2;
    c.style.width = `${tw}px`; c.style.height = `${th}px`;
    const tg = c.getContext("2d")!;
    tg.imageSmoothingEnabled = !pixel;
    tg.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
  });

  const draw = (n: number, alpha = 1) => {
    const f = s.frames[n];
    g.globalAlpha = alpha;
    if (alpha >= 1) g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, canvas.width, canvas.height);
    g.globalAlpha = 1;
  };
  let cur = -1;
  // the frame and its position: `pos` is the playback position in frames (fractional while playing)
  const show = (n: number, pos = n) => {
    const p = Math.min(1, N > 1 ? pos / (N - 1) : 1);
    done.style.transform = `scaleX(${p})`;
    knob.style.left = `${p * 100}%`;
    timeEl.textContent = clock(Math.min(total, pos / s.fps));
    if (n === cur) return;
    cur = n;
    if (s.clips.length > 1) {
      const c = s.clips.filter((x) => x <= n).length - 1, start = s.clips[c], end = s.clips[c + 1] ?? N;
      numEl.innerHTML = `Clip <b>${c + 1}</b> of ${s.clips.length}, frame <b>${n - start + 1}</b> of ${end - start}`;
    } else numEl.innerHTML = `Frame <b>${n + 1}</b> of ${N}`;
    thumbs.forEach((t, i) => t.classList.toggle("on", i === n));
    const t = thumbs[n];
    if (t.offsetLeft < strip.scrollLeft || t.offsetLeft + t.offsetWidth > strip.scrollLeft + strip.clientWidth) gsap.to(strip, { scrollLeft: t.offsetLeft - strip.clientWidth / 2 + t.offsetWidth / 2, duration: 0.3, ease: "power2.out" });
  };
  draw(0);
  show(0);
  gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3 });

  // playback runs on the clock, so the frame rate is the real one and never drifts; screenshots
  // dissolve into each other for a moment, sprite poses cut hard like animation does
  let playing = false, t0 = 0, at = 0, passes = 0;
  const tick = () => {
    const f = at + ((performance.now() - t0) / 1000) * s.fps;
    passes = Math.floor(f / N);
    const n = Math.floor(f) % N, frac = f - Math.floor(f);
    const changed = n !== cur;
    if (s.kind === "shots" && frac < 0.22 && !s.clips.includes(n)) { draw((n + N - 1) % N); draw(n, frac / 0.22); }
    else if (changed || s.kind === "shots") draw(n);
    show(n, f % N);
  };
  let hideT = 0;
  const wake = () => {
    hud.classList.remove("idle");
    window.clearTimeout(hideT);
    // while it plays and nobody moves the mouse, the controls get out of the way
    if (playing) hideT = window.setTimeout(() => { if (playing) hud.classList.add("idle"); }, 1600);
  };
  const setPlaying = (on: boolean) => {
    if (on === playing) return;
    playing = on;
    if (on) { t0 = performance.now(); at = Math.max(0, cur); passes = 0; gsap.ticker.add(tick); }
    else { gsap.ticker.remove(tick); draw(cur); }
    playBtn.innerHTML = on ? I.pause : I.play;
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    stage.classList.toggle("playing", on);
    if (on) gsap.to(big, { opacity: 0, scale: 1.25, duration: 0.3, ease: "power2.out" });
    else gsap.fromTo(big, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" });
    wake();
  };
  const press = async (el: HTMLElement, ms = 380) => {
    await wm.pointAt(el, 0.5, 0.5, ms);
    wake();
    await wm.click();
    gsap.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.25, ease: "back.out(3)" });
  };
  const step = async (d: 1 | -1) => {
    await press(d > 0 ? nextBtn : prevBtn, 260);
    const n = (cur + d + N) % N;
    draw(n); show(n);
  };
  try {
    wm.robot.setPose("read");
    // it starts the video with the big button in the middle
    await press(big, 460);
    setPlaying(true);
    await wm.pointAt(stage, 0.82, 0.3, 500);   // the hand moves away from the picture
    const want = Math.max(1, opts.loops ?? (s.kind === "shots" ? 1 : 3));
    const cap = Math.min(s.kind === "shots" ? 14000 : 7000, Math.max(3200, total * 1000 * want));
    const began = performance.now();
    while (passes < want && performance.now() - began < cap) await wm.sleep(150, e);
    // pause, then scrub back through it by dragging along the bar
    await press(playBtn, 360);
    setPlaying(false);
    const from = 0.15 + Math.random() * 0.15, to = 0.6 + Math.random() * 0.3;
    await wm.pointAt(track, from, 0.5, 380);
    wake();
    wm.robot.click();
    knob.classList.add("held");
    for (let i = 0; i <= 6; i++) {
      const p = from + ((to - from) * i) / 6;
      await wm.pointAt(track, p, 0.5, 120);
      const n = Math.round(p * (N - 1));
      draw(n); show(n);
      wake();
    }
    knob.classList.remove("held");
    // a frame or two forward and back, like looking for the exact moment
    if (N > 3) { await step(1); await wm.sleep(380, e); if (Math.random() < 0.6) { await step(-1); await wm.sleep(300, e); } }
    // and a frame it wants a closer look at, picked on the filmstrip
    const pick = thumbs[Math.min(N - 1, Math.floor(N * (0.2 + Math.random() * 0.6)))];
    await wm.pointAt(pick, 0.5, 0.5, 420);
    await wm.click();
    const n = Number(pick.dataset.n);
    draw(n); show(n);
    await wm.sleep(1100, e);
  } finally { gsap.ticker.remove(tick); window.clearTimeout(hideT); }
}
