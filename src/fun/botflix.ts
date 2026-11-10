// Botflix: the streaming app bored robots binge on. Profile picker, a cinematic home with rows,
// hover previews, a details modal and a player with skip intro, subtitles, autoplay and the
// "are you still watching" check. Everything it starts lives on one Scope and stops at once.
import "./botflix.css";
import { LiveCanvases, canvasPixelRatio } from "../perf/canvas";
import type gsap from "gsap";
import type { FunHost } from "./host";
import { Scope, fitCanvas, html, esc, clamp } from "./util";
import {
  SHOWS, showById, FEATURED, RESUME, ROWS, CREDITS, COLD_END, INTRO_END,
  drawArt, drawTitle, titleSize, drawEpisode, drawSting, lineAt, phaseAt, blurb, renderStage, type ShowDef,
} from "./shows";

export interface BotflixOpts { maxMs: number; me?: string }

const svg = (body: string, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const S = (d: string, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ICON = {
  play: svg(`<path d="M7.2 4.8v14.4c0 .8.9 1.3 1.6.8l11.2-7.2c.6-.4.6-1.2 0-1.6L8.8 4c-.7-.5-1.6 0-1.6.8z" fill="currentColor"/>`),
  pause: svg(`<rect x="6" y="4.6" width="4.2" height="14.8" rx="1.2" fill="currentColor"/><rect x="13.8" y="4.6" width="4.2" height="14.8" rx="1.2" fill="currentColor"/>`),
  plus: svg(S("M12 5.5v13M5.5 12h13")),
  thumb: svg(S("M7.5 10.5v9h-3v-9zM7.5 10.5l3.6-6.3c.3-.5.9-.7 1.4-.4 1 .5 1.4 1.6 1.1 2.7l-.8 3h5.1c1.2 0 2.1 1.1 1.8 2.3l-1.5 6.5c-.2.8-.9 1.2-1.7 1.2H7.5", 1.7)),
  down: svg(S("M6.5 9.5 12 15l5.5-5.5")),
  left: svg(S("M14.5 5.5 8 12l6.5 6.5", 2.6)),
  right: svg(S("M9.5 5.5 16 12l-6.5 6.5", 2.6)),
  back: svg(S("M19.5 12h-15M10.5 6l-6 6 6 6", 2.2)),
  info: svg(`<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.3" fill="currentColor"/>`),
  r10: svg(`${S("M5.6 8.6A8 8 0 1 1 4.2 13", 1.8)}${S("M5.4 4.6v4.2h4.2", 1.8)}<text x="12.6" y="15.6" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="sans-serif">10</text>`),
  f10: svg(`${S("M18.4 8.6A8 8 0 1 0 19.8 13", 1.8)}${S("M18.6 4.6v4.2h-4.2", 1.8)}<text x="11.4" y="15.6" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" font-family="sans-serif">10</text>`),
  vol: svg(`<path d="M4 9.2h3.4L12 5v14l-4.6-4.2H4z" fill="currentColor"/>${S("M15.4 9a4.2 4.2 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8", 1.8)}`),
  next: svg(`<path d="M5.5 5.6v12.8c0 .7.8 1.1 1.4.7l8.6-6.4c.5-.4.5-1.1 0-1.4L6.9 4.9c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/><rect x="16.6" y="5" width="2.6" height="14" rx="1" fill="currentColor"/>`),
  eps: svg(`<rect x="3.5" y="9" width="13" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/>${S("M7 6h12.4c.6 0 1 .4 1 1v8", 1.8)}`),
  cc: svg(`<rect x="3" y="5.5" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>${S("M6.5 12.5h4.5M13 12.5h4.5M6.5 15.4h7M15.6 15.4h1.9", 1.6)}`),
  speed: svg(`${S("M4.6 17a8.4 8.4 0 1 1 14.8 0", 1.8)}${S("M12 14l3.4-4.4", 2)}<circle cx="12" cy="14.2" r="1.6" fill="currentColor"/>`),
  full: svg(S("M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15", 1.9)),
  search: svg(`<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/>${S("M15 15l5 5", 2.2)}`),
  bell: svg(`<path d="M12 3.6c-3.3 0-5.6 2.5-5.6 5.8v3.4L4.8 16v.9h14.4V16l-1.6-3.2V9.4c0-3.3-2.3-5.8-5.6-5.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>${S("M9.8 19.4a2.4 2.4 0 0 0 4.4 0", 1.8)}`),
  x: svg(S("M6.5 6.5l11 11M17.5 6.5l-11 11", 2.2)),
};

const LOGO = `<span class="fun-bf-logo" aria-label="Botflix"><span>B</span><svg class="fun-bf-eye" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.4 2.9A7.6 7.6 0 1 0 12.6 2.9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="10" cy="11" r="2.6" fill="currentColor"/></svg><span>TFLIX</span></span>`;

// robot faces for the profile picker
function avatar(color: string, i: number, kids = false) {
  const eyes = [
    `<circle cx="22" cy="31" r="4" fill="#5cf0b0"/><circle cx="38" cy="31" r="4" fill="#5cf0b0"/>`,
    `<rect x="17" y="29" width="10" height="4" rx="2" fill="#ffd27f"/><rect x="33" y="29" width="10" height="4" rx="2" fill="#ffd27f"/>`,
    `<path d="M17 33a5 5 0 0 1 10 0M33 33a5 5 0 0 1 10 0" fill="none" stroke="#7fe7ff" stroke-width="3" stroke-linecap="round"/>`,
    `<circle cx="22" cy="31" r="4.6" fill="#fff"/><circle cx="38" cy="31" r="4.6" fill="#fff"/><circle cx="23" cy="32" r="2.2" fill="#1a1a2a"/><circle cx="39" cy="32" r="2.2" fill="#1a1a2a"/>`,
  ][i % 4];
  const bg = kids
    ? `<defs><linearGradient id="fun-bf-kg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6f91"/><stop offset=".5" stop-color="#ffcf3a"/><stop offset="1" stop-color="#5ad1ff"/></linearGradient></defs><rect width="60" height="60" fill="url(#fun-bf-kg)"/>`
    : `<rect width="60" height="60" fill="${color}"/><rect width="60" height="30" fill="#ffffff" opacity=".1"/>`;
  return `<svg viewBox="0 0 60 60" aria-hidden="true">${bg}<rect x="29" y="5" width="2.6" height="9" rx="1.3" fill="#141420" opacity=".55"/><circle cx="30.3" cy="5.5" r="3" fill="#141420" opacity=".55"/>
    <rect x="9" y="15" width="42" height="34" rx="11" fill="#141420" opacity=".88"/>${eyes}<rect x="24" y="40" width="12" height="2.6" rx="1.3" fill="#ffffff" opacity=".35"/></svg>`;
}

const fmtLeft = (sec: number) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const epDur = (show: ShowDef, e: number) => show.epLen * 60 + ((e * 37 + show.id.length * 11) % 50) - 25;
const seasons = (s: ShowDef) => (s.kind === "Film" || s.kind === "Special" ? `${Math.floor(s.epLen / 60) ? `${Math.floor(s.epLen / 60)}h ` : ""}${s.epLen % 60}m` : s.seasons > 1 ? `${s.seasons} Seasons` : `${s.eps.length} Episodes`);
const epLabel = (s: ShowDef, e: number) => `S${s.season}:E${e}`;
const isSeries = (s: ShowDef) => s.kind === "Series" || s.kind === "Docuseries";

function metaHtml(s: ShowDef) {
  return `<p class="fun-bf-meta"><b class="fun-bf-match">${s.match}% Match</b><span>${s.year}</span><span class="fun-bf-box">${esc(s.rating)}</span><span>${seasons(s)}</span><span class="fun-bf-box">HD</span></p>`;
}
const tagsHtml = (s: ShowDef) => `<p class="fun-bf-tags">${s.tags.map(esc).join(`<i aria-hidden="true"></i>`)}</p>`;

type Live = { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number; nextW: number; nextH: number; observer: ResizeObserver | null; fps: number; last: number; once?: boolean; done?: boolean; vis?: () => boolean; draw: (ctx: CanvasRenderingContext2D, w: number, h: number, ms: number) => void };
type Pick = { show: ShowDef; e: number; p: number };
type Play = {
  show: ShowDef; e: number; dur: number; pos: number; playing: boolean; stingAt: number;
  nextAt: number; ended: boolean; skipSeen: number; skipped: boolean; slot: number; cue: { slot: number; r?: "laugh" | "surprised" } | null;
};

class Botflix {
  root: HTMLElement;
  view: HTMLElement;
  fx: HTMLElement;
  home: HTMLElement | null = null;
  page: HTMLElement | null = null;
  player: HTMLElement | null = null;
  card: { el: HTMLElement; tile: HTMLElement; live: Live; show: ShowDef } | null = null;
  modal: HTMLElement | null = null;
  P: Play | null = null;
  private lives = new Set<Live>();
  private adaptive: LiveCanvases;
  private paint: (() => void)[] = [];
  private art = new Map<string, HTMLCanvasElement>();
  private uiUntil = 0;
  private lastMs = performance.now();
  readonly rm: boolean;
  readonly me: string;
  hero: ShowDef;

  constructor(body: HTMLElement, private scope: Scope, private host: FunHost, me?: string) {
    this.rm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.me = me || "Unit 7";
    this.hero = showById(FEATURED[Math.floor(Math.random() * FEATURED.length)]);
    body.innerHTML = "";
    this.root = html(`<div class="fun-bf${this.rm ? " fun-bf-rm" : ""}"><div class="fun-bf-view"></div><div class="fun-bf-fx"></div></div>`);
    body.appendChild(this.root);
    this.view = this.root.querySelector(".fun-bf-view") as HTMLElement;
    this.fx = this.root.querySelector(".fun-bf-fx") as HTMLElement;
    this.adaptive = new LiveCanvases(body);
    scope.raf(() => this.frame());
    scope.add(() => { for (const L of this.lives) L.observer?.disconnect(); this.lives.clear(); this.adaptive.clear(); this.paint = []; this.art.clear(); });
  }

  d(s: number) { return this.rm ? Math.min(s, 0.12) : s; }

  // --- the frame loop: playback clock, overlays, then any visible canvas that needs a new frame ---
  private frame() {
    const ms = performance.now();
    const dt = clamp((ms - this.lastMs) / 1000, 0, 0.25);
    this.lastMs = ms;
    this.tickPlayer(ms, dt);
    // Visibility and cadence are handled by the shared screen scheduler.
    for (let i = 0; i < 3 && this.paint.length; i++) this.paint.shift()!();
    if (this.home && this.page) this.home.classList.toggle("fun-bf-scrolled", this.page.scrollTop > 6);
    for (const L of this.lives) {
      if (!L.c.isConnected) { this.drop(L); continue; }
      if (L.vis && !L.vis()) continue;
      // Prepare only this visible full-redraw surface. A scope-wide resize would
      // clear hidden or throttled surfaces that this inner loop does not repaint.
      const width = L.c.width, height = L.c.height;
      this.refit(L);
      this.adaptive.add(L.c); this.adaptive.prepare(); this.adaptive.remove(L.c);
      const resized = width !== L.c.width || height !== L.c.height;
      if (L.once && L.done && !resized) continue;
      if (ms - L.last < 1000 / L.fps - 2 && !resized) continue;
      L.last = ms;
      L.ctx.save();
      L.draw(L.ctx, L.w, L.h, ms);
      L.ctx.restore();
      L.done = true;
    }
  }

  private refit(L: Live) {
    const w = L.nextW, h = L.nextH;
    if (Math.abs(w - L.w) > 2 || Math.abs(h - L.h) > 2) { L.w = w; L.h = h; L.ctx = fitCanvas(L.c, w, h, canvasPixelRatio(L.c)); L.done = false; }
  }

  live(c: HTMLCanvasElement, draw: Live["draw"], o: { fps?: number; once?: boolean; vis?: () => boolean } = {}) {
    const w = c.parentElement?.clientWidth || 160, h = c.parentElement?.clientHeight || 90;
    const L: Live = { c, ctx: fitCanvas(c, w, h), w, h, nextW: w, nextH: h, observer: null, fps: o.fps ?? 30, last: 0, once: o.once, vis: o.vis, draw };
    if (typeof ResizeObserver === "function" && c.parentElement) {
      L.observer = new ResizeObserver(entries => {
        const size = entries[entries.length - 1]?.contentRect;
        if (size && size.width > 0 && size.height > 0) { L.nextW = size.width; L.nextH = size.height; }
      });
      L.observer.observe(c.parentElement);
    }
    this.lives.add(L);
    return L;
  }
  drop(L: Live | null | undefined) { if (L) { L.observer?.disconnect(); this.lives.delete(L); } }

  /** Paint still art into a canvas, cached per show, kind and size. */
  still(c: HTMLCanvasElement, show: ShowDef, kind: "tile" | "poster" | "ep", ep = 0) {
    this.scope.defer(c, () => this.paintStill(c, show, kind, ep));
  }
  private paintStill(c: HTMLCanvasElement, show: ShowDef, kind: "tile" | "poster" | "ep", ep: number) {
    const w = c.parentElement?.clientWidth || 128, h = c.parentElement?.clientHeight || 72;
    const ctx = fitCanvas(c, w, h);
    const key = `${show.id}|${kind}|${ep}|${w}x${h}`;
    let src = this.art.get(key);
    if (!src) {
      src = document.createElement("canvas");
      const sctx = fitCanvas(src, w, h);
      drawArt(sctx, show, w, h, kind, show.thumbT, ep);
      this.art.set(key, src);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, 0, 0);
  }

  /** Element rect in the app's own (unscaled) coordinates. */
  rect(el: Element) {
    const r = el.getBoundingClientRect(), o = this.root.getBoundingClientRect();
    const k = o.width / (this.root.offsetWidth || o.width) || 1;
    return { x: (r.left - o.left) / k, y: (r.top - o.top) / k, w: r.width / k, h: r.height / k };
  }

  /** Title treatment drawn into a canvas whose height fits the art. Returns the canvas. */
  titleCanvas(show: ShowDef, maxW: number, size: number, maxH: number, cls: string) {
    const pad = Math.round(size * 0.28);
    const c = document.createElement("canvas");
    c.className = cls;
    const probe = document.createElement("canvas").getContext("2d")!;
    const b = titleSize(probe, show.title2, maxW, size, maxH);
    const ctx = fitCanvas(c, Math.ceil(b.w + pad * 2), Math.ceil(b.h + pad * 2));
    drawTitle(ctx, show.title2, pad, pad, maxW, size, "left", maxH);
    c.style.margin = `${-pad}px 0 ${-pad}px ${-pad}px`;
    return c;
  }

  /** An awaitable fromTo that also settles if the scope is torn down. */
  tween(el: Element, from: gsap.TweenVars, to: gsap.TweenVars) {
    return new Promise<void>((res) => {
      this.scope.fromTo(el, from, { ...to, onComplete: () => res(), onInterrupt: () => res() });
      this.scope.add(() => res());
    });
  }

  hot(el: Element | null | undefined, on = true) { el?.classList.toggle("fun-hot", on); }

  async point(el: Element, ax = 0.5, ay = 0.5, ms?: number) {
    this.showUI(2600);
    await this.host.pointAt(el, ax, ay, ms);
    this.showUI(2600);
  }

  // ====================================================================================
  // profile picker
  // ====================================================================================
  async pickProfile() {
    const others = [{ name: "Toaster", color: "#4fb6ff" }, { name: "Dustbot R7", color: "#3fcf8e" }, { name: "Mainframe", color: "#b07cff" }];
    const list = [...others];
    const mine = Math.floor(Math.random() * 3);
    list.splice(mine, 0, { name: this.me, color: "#ff9f5a" });
    list.push({ name: "Kids", color: "#ffcf3a" });
    this.view.innerHTML = `
      <div class="fun-bf-picker">
        <header class="fun-bf-pk-top">${LOGO}</header>
        <div class="fun-bf-pk-in">
          <h2>Who's watching?</h2>
          <div class="fun-bf-profiles">${list.map((p, i) => `
            <div class="fun-bf-prof${i === mine ? " fun-bf-mine" : ""}"><span class="fun-bf-av">${avatar(p.color, i, p.name === "Kids")}</span><span class="fun-bf-pname">${esc(p.name)}</span></div>`).join("")}
          </div>
          <span class="fun-bf-manage">Manage Profiles</span>
        </div>
      </div>`;
    const profs = [...this.view.querySelectorAll<HTMLElement>(".fun-bf-prof")];
    this.scope.fromTo(profs, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: this.d(0.45), stagger: this.rm ? 0 : 0.05, ease: "power2.out" });
    await this.host.sleep(900 + Math.random() * 500);
    if (Math.random() < 0.55) {
      const other = profs.filter((_, i) => i !== mine)[Math.floor(Math.random() * (profs.length - 1))];
      await this.host.pointAt(other.querySelector(".fun-bf-av")!, 0.5, 0.55);
      this.hot(other);
      await this.host.sleep(380 + Math.random() * 300);
      this.hot(other, false);
    }
    const me = profs[mine];
    await this.host.pointAt(me.querySelector(".fun-bf-av")!, 0.5, 0.55);
    this.hot(me);
    await this.host.sleep(420);
    await this.host.click();
    const av = me.querySelector(".fun-bf-av") as HTMLElement;
    await Promise.all([
      this.scope.play(av, { scale: this.rm ? 1 : 1.12, duration: this.d(0.4), ease: "power2.out" }),
      this.scope.play(this.view.querySelector(".fun-bf-picker"), { opacity: 0, duration: this.d(0.4), delay: this.rm ? 0 : 0.15, ease: "sine.in" }),
    ]);
  }

  // ====================================================================================
  // home
  // ====================================================================================
  buildHome() {
    const H = this.hero;
    const resumes = RESUME.map((r) => ({ ...r, show: showById(r.id) }));
    const tile = (s: ShowDef, extra = "") => `<div class="fun-bf-tile" data-id="${s.id}"><canvas></canvas>${extra}</div>`;
    const row = (key: string, title: string, items: string) => `
      <section class="fun-bf-row" data-row="${key}">
        <h3>${esc(title)}</h3><div class="fun-bf-pager" aria-hidden="true"></div>
        <div class="fun-bf-track">${items}</div>
        <span class="fun-bf-arrow fun-bf-al" aria-label="Previous">${ICON.left}</span><span class="fun-bf-arrow fun-bf-ar" aria-label="Next">${ICON.right}</span>
      </section>`;
    const cw = resumes.map((r) => `<div class="fun-bf-cwi"><div class="fun-bf-tile fun-bf-cw" data-id="${r.id}" data-e="${r.e}" data-p="${r.p}"><canvas></canvas></div><span class="fun-bf-prog"><i style="width:${Math.round(r.p * 100)}%"></i></span></div>`).join("");
    const top = ROWS.top10.map((id, i) => `<div class="fun-bf-top" data-id="${id}"><b class="fun-bf-rank" aria-hidden="true">${i + 1}</b>${tile(showById(id), "").replace("fun-bf-tile", "fun-bf-tile fun-bf-poster")}</div>`).join("");
    const because = showById(ROWS.because.from);
    this.view.innerHTML = `
      <div class="fun-bf-home">
        <nav class="fun-bf-nav">
          ${LOGO}
          <span class="fun-bf-links"><b>Home</b><span>Series</span><span>Films</span><span>New &amp; Popular</span><span>My List</span></span>
          <span class="fun-bf-tools"><span class="fun-bf-ico">${ICON.search}</span><span class="fun-bf-kids">Kids</span><span class="fun-bf-ico">${ICON.bell}</span><span class="fun-bf-me">${avatar("#ff9f5a", 0)}</span></span>
        </nav>
        <div class="fun-bf-page">
          <div class="fun-bf-hero">
            <div class="fun-bf-hero-art"><canvas></canvas></div>
            <div class="fun-bf-hero-shade"></div>
            <div class="fun-bf-hero-info">
              <div class="fun-bf-hero-tt"></div>
              ${metaHtml(H)}
              <p class="fun-bf-syn">${esc(H.synopsis)}</p>
              <div class="fun-bf-btns"><span class="fun-bf-btn fun-bf-play">${ICON.play}Play</span><span class="fun-bf-btn fun-bf-more">${ICON.info}More Info</span></div>
            </div>
          </div>
          <div class="fun-bf-rows">
            ${row("cw", `Continue Watching for ${this.me}`, cw)}
            ${row("trend", "Trending Now", ROWS.trending.map((id) => tile(showById(id))).join(""))}
            ${row("because", `Because you watched ${because.title}`, ROWS.because.ids.map((id) => tile(showById(id))).join(""))}
            ${row("top", "Top 10 in Robots Today", top)}
            ${row("docs", "Documentaries", ROWS.docs.map((id) => tile(showById(id))).join(""))}
            ${row("comedy", "Comedy", ROWS.comedy.map((id) => tile(showById(id))).join(""))}
          </div>
        </div>
      </div>`;
    this.home = this.view.querySelector(".fun-bf-home") as HTMLElement;
    this.page = this.home.querySelector(".fun-bf-page") as HTMLElement;
    const tt = this.home.querySelector(".fun-bf-hero-tt") as HTMLElement;
    const iw = (this.home.querySelector(".fun-bf-hero-info") as HTMLElement).clientWidth || 300;
    tt.appendChild(this.titleCanvas(H, iw, 46, 68, "fun-bf-tt"));
    const page = this.page;
    const heroArt = this.home.querySelector(".fun-bf-hero-art canvas") as HTMLCanvasElement;
    const cam = H.hero ?? H.key;
    this.live(heroArt, (ctx, w, h, ms) => renderStage(ctx, H, w, h, H.thumbT + ms / 1000, cam), {
      fps: 30, once: this.rm, vis: () => !!this.home && this.home.style.display !== "none" && page.scrollTop < heroArt.clientHeight * 0.9 && !this.modal,
    });
    // tiles: visible rows first, a few per frame so building never stalls the frame
    this.home.querySelectorAll<HTMLElement>(".fun-bf-tile").forEach((t) => {
      const c = t.querySelector("canvas") as HTMLCanvasElement;
      const s = showById(t.dataset.id!);
      this.paint.push(() => this.still(c, s, t.classList.contains("fun-bf-poster") ? "poster" : "tile"));
    });
    this.home.querySelectorAll<HTMLElement>(".fun-bf-row").forEach((r) => this.pager(r));
  }

  private pager(row: HTMLElement) {
    const track = row.querySelector(".fun-bf-track") as HTMLElement;
    const pages = Math.max(1, Math.ceil((track.scrollWidth - 10) / Math.max(1, row.clientWidth - 44)));
    const cur = Number(row.dataset.page || 0);
    (row.querySelector(".fun-bf-pager") as HTMLElement).innerHTML = Array.from({ length: pages }, (_, i) => `<i${i === Math.min(cur, pages - 1) ? ` class="fun-on"` : ""}></i>`).join("");
    row.classList.toggle("fun-bf-moved", cur > 0);
  }

  async enterHome() {
    this.buildHome();
    this.scope.fromTo(this.home, { opacity: 0 }, { opacity: 1, duration: this.d(0.5), ease: "sine.out" });
    if (!this.rm) this.scope.fromTo(this.home!.querySelector(".fun-bf-hero-art"), { scale: 1.06 }, { scale: 1, duration: 1.6, ease: "power2.out" });
  }

  async scrollPage(y: number, ms = 900) {
    const page = this.page!;
    this.host.scroll?.();
    const max = page.scrollHeight - page.clientHeight;
    await this.scope.play(page, { scrollTop: clamp(y, 0, max), duration: this.d(ms / 1000), ease: "power2.inOut" });
  }

  rowEl(key: string) { return this.home!.querySelector(`.fun-bf-row[data-row="${key}"]`) as HTMLElement; }

  /** Scroll so that a row sits comfortably under the nav. */
  async showRow(key: string) {
    const r = this.rowEl(key);
    const top = r.offsetTop + (r.offsetParent as HTMLElement).offsetTop;
    const page = this.page!;
    const inView = top - page.scrollTop > 30 && top - page.scrollTop + r.offsetHeight < page.clientHeight - 4;
    if (!inView) await this.scrollPage(top - 40, 800 + Math.random() * 400);
    return r;
  }

  visibleTiles(row: HTMLElement) {
    const pr = this.rect(this.page!);
    return [...row.querySelectorAll<HTMLElement>(".fun-bf-tile")].filter((t) => {
      const r = this.rect(t);
      return r.x >= pr.x + 4 && r.x + r.w <= pr.x + pr.w - 18 && r.y >= pr.y + 30 && r.y + r.h <= pr.y + pr.h;
    });
  }

  /** The robot nudges a row sideways: resting the cursor on the arrow pages the row. */
  async slideRow(row: HTMLElement, dir: 1 | -1) {
    const arrow = row.querySelector(dir > 0 ? ".fun-bf-ar" : ".fun-bf-al") as HTMLElement;
    this.hot(row);
    await this.host.pointAt(arrow, 0.5, 0.5);
    this.hot(arrow);
    await this.host.sleep(420);
    const track = row.querySelector(".fun-bf-track") as HTMLElement;
    const items = [...track.children] as HTMLElement[];
    const viewW = row.clientWidth - 44;
    const step = Math.max(1, Math.floor(viewW / (items[0].offsetWidth + 6)));
    let first = Number(row.dataset.first || 0) + step * dir;
    const maxFirst = Math.max(0, items.length - step);
    if (first > maxFirst) first = Number(row.dataset.first || 0) >= maxFirst ? 0 : maxFirst;
    first = Math.max(0, first);
    row.dataset.first = String(first);
    row.dataset.page = String(Math.ceil(first / step));
    const x = -(items[first].offsetLeft - items[0].offsetLeft);
    this.pager(row);
    if (this.rm) {
      await this.scope.play(track, { opacity: 0.4, duration: 0.08 });
      this.scope.to(track, { x, duration: 0 });
      await this.scope.play(track, { opacity: 1, duration: 0.1 });
    } else await this.scope.play(track, { x, duration: 0.8, ease: "power3.inOut" });
    await this.host.sleep(380);
    this.hot(arrow, false);
  }

  // --- the enlarged preview card ---
  async hoverTile(tile: HTMLElement) {
    const row = tile.closest(".fun-bf-row") as HTMLElement | null;
    const target = tile.querySelector("canvas") ?? tile;
    await this.host.pointAt(target, 0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2);
    this.hot(row);
    await this.host.sleep(260);
    await this.openCard(tile);
  }

  async openCard(tile: HTMLElement) {
    await this.closeCard();
    const show = showById(tile.dataset.id!);
    const tr = this.rect(tile);
    const base = (this.home!.querySelector(".fun-bf-tile:not(.fun-bf-poster)") as HTMLElement)?.offsetWidth || tr.w;
    const cw = Math.round(base * 1.56), ih = Math.round(cw * 0.5625);
    const e = Number(tile.dataset.e || 0), p = Number(tile.dataset.p || 0);
    const info = e
      ? `<p class="fun-bf-cardep"><b>${epLabel(show, e)}</b> ${esc(show.eps[e - 1] ?? "")}</p><p class="fun-bf-cardprog"><span class="fun-bf-prog"><i style="width:${Math.round(p * 100)}%"></i></span><span>${Math.max(1, Math.round((epDur(show, e) * (1 - p)) / 60))}m left</span></p>`
      : `${metaHtml(show)}${tagsHtml(show)}`;
    const el = html(`
      <div class="fun-bf-card" style="width:${cw}px">
        <div class="fun-bf-card-art" style="height:${ih}px"><canvas></canvas></div>
        <div class="fun-bf-card-info">
          <div class="fun-bf-card-btns"><span class="fun-bf-rb fun-bf-rb-play" aria-label="Play">${ICON.play}</span><span class="fun-bf-rb" aria-label="Add to My List">${ICON.plus}</span><span class="fun-bf-rb" aria-label="I like this">${ICON.thumb}</span><span class="fun-bf-rb fun-bf-rb-more" aria-label="More info">${ICON.down}</span></div>
          ${info}
        </div>
      </div>`);
    this.fx.appendChild(el);
    const rw = this.root.clientWidth, rh = this.root.clientHeight;
    const chH = el.offsetHeight;
    const x = clamp(tr.x + tr.w / 2 - cw / 2, 8, rw - cw - 8);
    const y = clamp(tr.y + tr.h / 2 - ih / 2 - 6, 8, rh - chH - 8);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const t0 = performance.now();
    const live = this.live(el.querySelector("canvas") as HTMLCanvasElement, (ctx, w, h, ms) => {
      // a still for a beat, then the preview starts playing
      const t = ms - t0 < 700 || this.rm ? show.thumbT : show.thumbT + (ms - t0 - 700) / 1000;
      drawArt(ctx, show, w, h, "card", t);
    }, { fps: 30, once: this.rm });
    this.card = { el, tile, live, show };
    this.hot(tile);
    if (this.rm) await this.scope.play(el, { opacity: 1, duration: 0.12 });
    else {
      this.scope.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "sine.out" });
      await this.tween(el, { x: tr.x - x, y: tr.y - y, scale: tr.w / cw, transformOrigin: "0 0" }, { x: 0, y: 0, scale: 1, duration: 0.38, ease: "power3.out" });
    }
  }

  async closeCard() {
    const c = this.card;
    if (!c) return;
    this.card = null;
    this.hot(c.tile, false);
    this.hot(c.tile.closest(".fun-bf-row"), false);
    const tr = this.rect(c.tile), cr = this.rect(c.el);
    await this.scope.play(c.el, this.rm ? { opacity: 0, duration: 0.1 } : { x: tr.x - cr.x, y: tr.y - cr.y, scale: tr.w / cr.w, opacity: 0, duration: 0.24, ease: "power2.in" });
    this.drop(c.live);
    c.el.remove();
  }

  // --- details modal ---
  async openModal(show: ShowDef, from: Element, pick: { e: number; p: number }) {
    const fromR = this.rect(from);
    await this.closeCard();
    const n = show.eps.length;
    const startE = Math.max(1, Math.min(pick.e - 1, n - 3));
    const eps = Array.from({ length: Math.min(4, n) }, (_, i) => startE + i).filter((e) => e <= n);
    const resumeE = pick.p > 0 ? pick.e : 0;
    const el = html(`
      <div class="fun-bf-modal">
        <div class="fun-bf-dim"></div>
        <div class="fun-bf-panel">
          <div class="fun-bf-scroll">
            <div class="fun-bf-m-art"><canvas></canvas><div class="fun-bf-m-shade"></div>
              <span class="fun-bf-x" aria-label="Close">${ICON.x}</span>
              <div class="fun-bf-m-head"><div class="fun-bf-m-tt"></div>
                <div class="fun-bf-btns"><span class="fun-bf-btn fun-bf-play">${ICON.play}${resumeE ? "Resume" : "Play"}</span><span class="fun-bf-rb" aria-label="Add to My List">${ICON.plus}</span><span class="fun-bf-rb" aria-label="I like this">${ICON.thumb}</span></div>
              </div>
            </div>
            <div class="fun-bf-m-body">
              <div>${metaHtml(show)}${resumeE ? `<p class="fun-bf-m-ep"><b>${epLabel(show, resumeE)}</b> ${esc(show.eps[resumeE - 1] ?? "")}</p>` : ""}<p class="fun-bf-syn">${esc(show.synopsis)}</p></div>
              <div class="fun-bf-m-side"><p><span>Cast:</span> ${show.cast.map(esc).join(", ")}</p><p><span>Genres:</span> ${show.tags.map(esc).join(", ")}</p></div>
            </div>
            ${isSeries(show) ? `<div class="fun-bf-eps">
              <div class="fun-bf-eps-head"><h4>Episodes</h4><span class="fun-bf-select">Season ${show.season}${ICON.down}</span></div>
              ${eps.map((e) => `
                <div class="fun-bf-ep${e === resumeE ? " fun-bf-ep-now" : ""}" data-e="${e}">
                  <b class="fun-bf-ep-n">${e}</b>
                  <div class="fun-bf-ep-th"><canvas></canvas><span class="fun-bf-ep-play" aria-hidden="true">${ICON.play}</span>${e === resumeE ? `<span class="fun-bf-prog"><i style="width:${Math.round(pick.p * 100)}%"></i></span>` : ""}</div>
                  <div class="fun-bf-ep-tx"><p><b>${esc(show.eps[e - 1])}</b><span>${Math.round(epDur(show, e) / 60)}m</span></p><p class="fun-bf-ep-syn">${esc(blurb(show, e))}</p></div>
                </div>`).join("")}
            </div>` : ""}
          </div>
        </div>
      </div>`);
    this.fx.appendChild(el);
    this.modal = el;
    const panel = el.querySelector(".fun-bf-panel") as HTMLElement;
    const ttBox = el.querySelector(".fun-bf-m-tt") as HTMLElement;
    ttBox.appendChild(this.titleCanvas(show, Math.min(260, panel.clientWidth * 0.48), 46, 74, "fun-bf-tt"));
    const art = el.querySelector(".fun-bf-m-art canvas") as HTMLCanvasElement;
    const t0 = performance.now();
    this.live(art, (ctx, w, h, ms) => renderStage(ctx, show, w, h, show.thumbT + (this.rm ? 0 : (ms - t0) / 1000), show.hero ?? show.key), { fps: 30, once: this.rm, vis: () => this.modal === el });
    el.querySelectorAll<HTMLElement>(".fun-bf-ep").forEach((row) => {
      const c = row.querySelector("canvas") as HTMLCanvasElement;
      this.paint.push(() => this.still(c, show, "ep", Number(row.dataset.e)));
    });
    const pr = this.rect(panel);
    this.scope.fromTo(el.querySelector(".fun-bf-dim"), { opacity: 0 }, { opacity: 1, duration: this.d(0.35) });
    if (this.rm) await this.scope.play(panel, { opacity: 1, duration: 0.12 });
    else {
      this.scope.fromTo(panel, { opacity: 0.2 }, { opacity: 1, duration: 0.2 });
      await this.tween(panel, { x: fromR.x - pr.x, y: fromR.y - pr.y, scale: fromR.w / pr.w, transformOrigin: "0 0" }, { x: 0, y: 0, scale: 1, duration: 0.5, ease: "expo.out" });
    }
    return el;
  }

  async closeModal() {
    const el = this.modal;
    if (!el) return;
    this.modal = null;
    await this.scope.play(el, { opacity: 0, duration: this.d(0.22), ease: "sine.in" });
    el.remove();
  }

  /** In the modal: maybe look at the episode list, then press Play (or a specific episode). */
  async modalPlay(show: ShowDef, pick: Pick): Promise<Pick> {
    const el = this.modal!;
    const scroller = el.querySelector(".fun-bf-scroll") as HTMLElement;
    await this.host.sleep(900 + Math.random() * 700);
    const rows = [...el.querySelectorAll<HTMLElement>(".fun-bf-ep")];
    if (rows.length && Math.random() < 0.6) {
      this.host.scroll?.();
      const list = el.querySelector(".fun-bf-eps") as HTMLElement;
      await this.scope.play(scroller, { scrollTop: Math.min(list.offsetTop - 20, scroller.scrollHeight - scroller.clientHeight), duration: this.d(0.9), ease: "power2.inOut" });
      const target = rows.find((r) => r.classList.contains("fun-bf-ep-now")) ?? rows[Math.floor(Math.random() * Math.min(2, rows.length))];
      for (const r of rows.slice(0, 2)) {
        if (r === target) continue;
        await this.host.pointAt(r.querySelector(".fun-bf-ep-th")!, 0.5, 0.5);
        this.hot(r);
        await this.host.sleep(500 + Math.random() * 300);
        this.hot(r, false);
      }
      await this.host.pointAt(target.querySelector(".fun-bf-ep-th")!, 0.5, 0.5);
      this.hot(target);
      await this.host.sleep(600);
      await this.host.click();
      const e = Number(target.dataset.e);
      return { show, e, p: e === pick.e ? pick.p : 0 };
    }
    const play = el.querySelector(".fun-bf-play") as HTMLElement;
    await this.host.pointAt(play, 0.4, 0.5);
    this.hot(play);
    await this.host.sleep(350);
    await this.host.click();
    return pick;
  }

  // ====================================================================================
  // player
  // ====================================================================================
  showUI(ms: number) {
    this.uiUntil = Math.max(this.uiUntil, performance.now() + ms);
    this.player?.classList.add("fun-bf-ui-on");
  }

  async openPlayer(pick: Pick) {
    await this.closeModal();
    const curtain = html(`<div class="fun-bf-curtain"></div>`);
    this.fx.appendChild(curtain);
    await this.scope.play(curtain, { opacity: 1, duration: this.d(0.3), ease: "sine.in" });
    this.home!.style.display = "none";
    const el = html(`
      <div class="fun-bf-player">
        <div class="fun-bf-video"><canvas></canvas></div>
        <div class="fun-bf-sub"><span></span></div>
        <div class="fun-bf-ui">
          <div class="fun-bf-ui-top"><span class="fun-bf-back" aria-label="Back to Browse">${ICON.back}</span></div>
          <div class="fun-bf-ui-bot">
            <div class="fun-bf-seek"><div class="fun-bf-bar"><i class="fun-bf-buf"></i><i class="fun-bf-fill"></i><b class="fun-bf-knob"></b></div><span class="fun-bf-left">0:00</span></div>
            <div class="fun-bf-ctl">
              <span class="fun-bf-ctl-l"><span class="fun-bf-pp">${ICON.pause}</span>${ICON.r10}${ICON.f10}${ICON.vol}</span>
              <span class="fun-bf-now"></span>
              <span class="fun-bf-ctl-r">${ICON.next}${ICON.eps}${ICON.cc}${ICON.speed}${ICON.full}</span>
            </div>
          </div>
        </div>
        <span class="fun-bf-skip">Skip Intro</span>
        <div class="fun-bf-next">
          <div class="fun-bf-next-th"><canvas></canvas></div>
          <div class="fun-bf-next-tx"><span>Next Episode</span><b></b><p></p></div>
          <div class="fun-bf-next-btns"><span class="fun-bf-btn fun-bf-next-go"><i></i><em>Next episode in 5</em></span><span class="fun-bf-btn fun-bf-ghost">Watch Credits</span></div>
        </div>
        <div class="fun-bf-still">
          <div class="fun-bf-still-in"><h2>Are you still watching <em></em>?</h2>
            <div class="fun-bf-still-btns"><span class="fun-bf-btn fun-bf-cont">${ICON.play}Continue Watching</span><span class="fun-bf-btn fun-bf-ghost fun-bf-browse">Back to Browse</span></div>
          </div>
        </div>
      </div>`);
    this.view.appendChild(el);
    this.player = el;
    this.load(pick, true);
    const video = el.querySelector(".fun-bf-video canvas") as HTMLCanvasElement;
    this.live(video, (ctx, w, h, ms) => {
      const P = this.P;
      if (!P) return;
      if (P.stingAt > 0 && ms - P.stingAt < 1600) { drawSting(ctx, w, h, (ms - P.stingAt) / 1000, this.rm); return; }
      drawEpisode(ctx, P.show, P.e, w, h, P.pos, P.dur, this.rm);
      if (!P.playing) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, w, h); }
    }, { fps: 30, vis: () => this.player === el });
    await this.scope.play(curtain, { opacity: 0, duration: this.d(0.35), ease: "sine.out" });
    curtain.remove();
  }

  load(pick: Pick, sting = false) {
    const el = this.player!;
    const dur = epDur(pick.show, pick.e);
    this.P = {
      show: pick.show, e: pick.e, dur, pos: pick.p * dur, playing: true, stingAt: sting ? performance.now() : 0,
      nextAt: 0, ended: false, skipSeen: 0, skipped: false, slot: -1, cue: null,
    };
    const now = el.querySelector(".fun-bf-now") as HTMLElement;
    now.innerHTML = `<b>${esc(pick.show.title)}</b><span>${isSeries(pick.show) ? `${epLabel(pick.show, pick.e)} ${esc(pick.show.eps[pick.e - 1] ?? "")}` : ""}</span>`;
    el.classList.remove("fun-bf-next-on", "fun-bf-skip-on", "fun-bf-still-on");
    const ne = Math.min(pick.e + 1, pick.show.eps.length);
    (el.querySelector(".fun-bf-next-tx b") as HTMLElement).textContent = `${epLabel(pick.show, ne)} ${pick.show.eps[ne - 1] ?? ""}`;
    (el.querySelector(".fun-bf-next-tx p") as HTMLElement).textContent = blurb(pick.show, ne);
    this.paint.push(() => this.still(el.querySelector(".fun-bf-next-th canvas") as HTMLCanvasElement, pick.show, "ep", ne));
    (el.querySelector(".fun-bf-still em") as HTMLElement).textContent = pick.show.title;
    this.setSub(null);
    this.showUI(3000);
  }

  private subText = "";
  setSub(text: string | null) {
    const el = this.player?.querySelector(".fun-bf-sub span") as HTMLElement | null;
    if (!el) return;
    const t = text ?? "";
    if (t === this.subText) return;
    this.subText = t;
    el.textContent = t;
    el.classList.toggle("fun-bf-cue", t.startsWith("["));
    el.parentElement!.classList.toggle("fun-on", !!t);
  }

  private tickPlayer(ms: number, dt: number) {
    const P = this.P, el = this.player;
    if (!P || !el) return;
    const stinging = P.stingAt > 0 && ms - P.stingAt < 1600;
    if (P.playing && !stinging && !P.ended) P.pos = Math.min(P.dur, P.pos + dt);
    const ph = phaseAt(P.pos, P.dur);
    // subtitles and the cue the robot reacts to
    const L = stinging ? null : lineAt(P.show, P.e, P.pos, P.dur);
    this.setSub(L?.line ? L.line.text : null);
    if (L && L.line && L.slot !== P.slot) { P.slot = L.slot; P.cue = { slot: L.slot, r: L.line.r }; }
    // skip intro button
    const skipOn = !P.skipped && ph === "intro" && P.pos > COLD_END + 0.6 && P.pos < INTRO_END - 3;
    if (skipOn && !P.skipSeen) P.skipSeen = ms;
    el.classList.toggle("fun-bf-skip-on", skipOn);
    // autoplay countdown during the credits
    if (ph === "credits" && P.playing && !P.ended) {
      if (!P.nextAt) { P.nextAt = ms + 5000; el.classList.add("fun-bf-next-on"); }
      const left = Math.max(0, P.nextAt - ms);
      const em = el.querySelector(".fun-bf-next-go em") as HTMLElement;
      const label = `Next episode in ${Math.ceil(left / 1000)}`;
      if (em.textContent !== label) em.textContent = label;
      (el.querySelector(".fun-bf-next-go i") as HTMLElement).style.transform = `scaleX(${(1 - left / 5000).toFixed(4)})`;
      if (left <= 0 || P.pos >= P.dur) P.ended = true;
    }
    // controls: progress, time left, auto-hide
    const f = clamp(P.pos / P.dur);
    (el.querySelector(".fun-bf-fill") as HTMLElement).style.transform = `scaleX(${f.toFixed(4)})`;
    (el.querySelector(".fun-bf-buf") as HTMLElement).style.transform = `scaleX(${Math.min(1, f + 0.06).toFixed(4)})`;
    (el.querySelector(".fun-bf-knob") as HTMLElement).style.left = `${(f * 100).toFixed(2)}%`;
    const tl = el.querySelector(".fun-bf-left") as HTMLElement;
    const label = fmtLeft(P.dur - P.pos);
    if (tl.textContent !== label) tl.textContent = label;
    if (ms > this.uiUntil && P.playing) el.classList.remove("fun-bf-ui-on");
  }

  async skipIntro() {
    const P = this.P!;
    const btn = this.player!.querySelector(".fun-bf-skip") as HTMLElement;
    await this.point(btn, 0.5, 0.5);
    this.hot(btn);
    await this.host.sleep(300);
    await this.host.click();
    P.skipped = true;
    P.pos = INTRO_END + 0.2;
    this.hot(btn, false);
  }

  /** Click the progress bar near the end: robots skip to the good part. */
  async seekNearEnd() {
    const P = this.P!;
    const bar = this.player!.querySelector(".fun-bf-bar") as HTMLElement;
    const to = (P.dur - CREDITS - 4 - Math.random() * 4) / P.dur;
    this.showUI(3000);
    await this.point(bar, Math.max(f0(P), to), 0.5, 700);
    this.hot(bar);
    await this.host.sleep(450);
    await this.host.click();
    if (this.P === P && to > P.pos / P.dur) P.pos = to * P.dur;
    await this.host.sleep(300);
    this.hot(bar, false);
  }

  async stillWatching() {
    const el = this.player!;
    const P = this.P!;
    P.playing = false;
    el.classList.add("fun-bf-still-on");
    if (!this.rm) this.scope.fromTo(el.querySelector(".fun-bf-still-in"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" });
    await this.host.sleep(1300 + Math.random() * 900);
    const btn = el.querySelector(".fun-bf-cont") as HTMLElement;
    await this.host.pointAt(btn, 0.4, 0.5);
    this.hot(btn);
    await this.host.sleep(450);
    await this.host.click();
    this.hot(btn, false);
    el.classList.remove("fun-bf-still-on");
    P.playing = true;
    this.showUI(1500);
  }

  async backToBrowse() {
    const back = this.player!.querySelector(".fun-bf-back") as HTMLElement;
    await this.point(back, 0.5, 0.5);
    this.hot(back);
    await this.host.sleep(300);
    await this.host.click();
    this.P = null;
    const pl = this.player!;
    this.player = null;
    await this.scope.play(pl, { opacity: 0, duration: this.d(0.3) });
    pl.remove();
    this.home!.style.display = "";
    this.scope.fromTo(this.home, { opacity: 0 }, { opacity: 1, duration: this.d(0.4) });
  }
}
const f0 = (P: Play) => P.pos / P.dur;

// ======================================================================================
// the activity
// ======================================================================================
export async function watchBotflix(body: HTMLElement, host: FunHost, opts: BotflixOpts): Promise<{ result: "done" | "closed" }> {
  const scope = new Scope(body);
  const start = performance.now();
  const left = () => opts.maxMs - (performance.now() - start);
  const timeUp = () => host.stopped || left() <= 0;
  try {
    const app = new Botflix(body, scope, host, opts.me);
    await app.pickProfile();
    if (timeUp()) return { result: "done" };
    await app.enterHome();
    // take in the featured show for a moment before browsing
    await host.sleep(900 + Math.random() * 500);
    await host.pointAt(app.home!.querySelector(".fun-bf-hero-tt")!, 0.6, 0.6, 700);
    await host.sleep(1300 + Math.random() * 900);

    // browse a little; less when time is short
    const budget = left();
    const n = budget > 80000 ? 4 : budget > 55000 ? 3 : budget > 38000 ? 2 : budget > 26000 ? 1 : 0;
    const acts = ["cw", "slide", "top", "docs", "because"].sort(() => Math.random() - 0.5).slice(0, n);
    for (const a of acts) {
      if (timeUp()) return { result: "done" };
      if (a === "cw") {
        const row = await app.showRow("cw");
        const t = app.visibleTiles(row)[1 + Math.floor(Math.random() * 2)];
        if (t) { await app.hoverTile(t); await host.sleep(1200 + Math.random() * 900); await app.closeCard(); }
      } else if (a === "slide") {
        const row = await app.showRow(Math.random() < 0.5 ? "trend" : "because");
        await app.slideRow(row, 1);
        if (Math.random() < 0.4) await app.slideRow(row, 1);
        const t = app.visibleTiles(row)[Math.floor(Math.random() * 3)];
        if (t) { await app.hoverTile(t); await host.sleep(1100 + Math.random() * 900); await app.closeCard(); }
        app.hot(row, false);
      } else {
        const row = await app.showRow(a);
        if (a !== "top" && Math.random() < 0.5) { await app.slideRow(row, 1); app.hot(row, false); }
        const vis = app.visibleTiles(row);
        const t = vis[Math.floor(Math.random() * Math.min(4, vis.length))];
        if (t) { await app.hoverTile(t); await host.sleep(1000 + Math.random() * 1000); await app.closeCard(); }
      }
      await host.sleep(300 + Math.random() * 400);
    }
    if (timeUp()) return { result: "done" };

    // decide what to watch
    const r = Math.random();
    let pick: Pick;
    if (r < 0.48) {
      // resume something from Continue Watching (usually the sitcom)
      const row = await app.showRow("cw");
      const tiles = app.visibleTiles(row).filter((t) => isSeries(showById(t.dataset.id!)));
      const t = (Math.random() < 0.65 ? tiles[0] : tiles[Math.floor(Math.random() * tiles.length)]) ?? row.querySelector<HTMLElement>(".fun-bf-tile")!;
      const show = showById(t.dataset.id!);
      pick = { show, e: Number(t.dataset.e), p: Number(t.dataset.p) };
      await app.hoverTile(t);
      await host.sleep(800 + Math.random() * 500);
      if (Math.random() < 0.4) {
        const play = app.card!.el.querySelector(".fun-bf-rb-play") as HTMLElement;
        await host.pointAt(play, 0.5, 0.5);
        app.hot(play);
        await host.sleep(300);
        await host.click();
        await app.closeCard();
      } else {
        const more = app.card!.el.querySelector(".fun-bf-rb-more") as HTMLElement;
        await host.pointAt(more, 0.5, 0.5);
        app.hot(more);
        await host.sleep(300);
        await host.click();
        await app.openModal(show, app.card!.el, pick);
        pick = await app.modalPlay(show, pick);
      }
    } else if (r < 0.68 && isSeries(app.hero)) {
      // the hero: More Info, then Play
      await app.scrollPage(0, 700);
      const show = app.hero;
      const res = RESUME.find((x) => x.id === show.id);
      pick = { show, e: res?.e ?? 1, p: res?.p ?? 0 };
      const more = app.home!.querySelector(".fun-bf-more") as HTMLElement;
      await host.pointAt(more, 0.45, 0.5);
      app.hot(more);
      await host.sleep(400);
      await host.click();
      app.hot(more, false);
      await app.openModal(show, app.home!.querySelector(".fun-bf-hero")!, pick);
      pick = await app.modalPlay(show, pick);
    } else {
      // something new from a row
      const key = ["trend", "because", "top", "docs", "comedy"][Math.floor(Math.random() * 5)];
      const row = await app.showRow(key);
      let tiles = app.visibleTiles(row).filter((t) => isSeries(showById(t.dataset.id!)));
      if (!tiles.length) tiles = app.visibleTiles(await app.showRow("cw"));
      const t = tiles[Math.floor(Math.random() * tiles.length)] ?? app.rowEl("cw").querySelector<HTMLElement>(".fun-bf-tile")!;
      const show = showById(t.dataset.id!);
      const res = RESUME.find((x) => x.id === show.id);
      pick = { show, e: res?.e ?? 1, p: res?.p ?? 0 };
      await app.hoverTile(t);
      await host.sleep(900 + Math.random() * 700);
      await host.pointAt(app.card!.el.querySelector(".fun-bf-card-art")!, 0.5, 0.5);
      await host.sleep(250);
      await host.click();
      await app.openModal(show, app.card!.el, pick);
      pick = await app.modalPlay(show, pick);
    }
    if (timeUp()) return { result: "done" };

    // watch: binge until the time is up
    await app.openPlayer(pick);
    host.react("relax");
    let asked = false, reacted = false, seekAfter = 0, rested = false;
    let mainSince = 0;
    for (;;) {
      if (timeUp()) break;
      const P = app.P!;
      const ph = phaseAt(P.pos, P.dur);
      const now = performance.now();
      if (P.cue) {
        const cue = P.cue;
        P.cue = null;
        if (cue.r && (!reacted || Math.random() < 0.7)) { reacted = true; host.react(cue.r); }
      }
      if (P.ended) {
        // the countdown ran out: load the next episode, and sometimes Botflix checks in first
        const next = Math.min(P.e + 1, P.show.eps.length);
        const nextShow = next === P.e ? showById(ROWS.because.ids.find((id) => isSeries(showById(id)) && id !== P.show.id) ?? "paper-jam") : P.show;
        app.load({ show: nextShow, e: next === P.e ? 1 : next, p: 0 });
        mainSince = 0;
        rested = false;
        seekAfter = 0;
        if (!asked) { asked = true; await app.stillWatching(); }
        continue;
      }
      if (ph === "intro" && !P.skipped && P.skipSeen && now - P.skipSeen > 900 + Math.random() * 1400) {
        await app.skipIntro();
        continue;
      }
      if (ph === "main") {
        if (!mainSince) {
          mainSince = now;
          // how long to watch before jumping ahead; the check-in should land well inside the session
          seekAfter = asked ? (left() > 50000 ? 14000 + Math.random() * 8000 : Infinity) : clamp(left() * 0.3 - 9000, 3500, 22000);
        }
        if (now - mainSince > seekAfter && P.pos < P.dur - CREDITS - 10) {
          await app.seekNearEnd();
          seekAfter = Infinity;
          continue;
        }
        if (!asked && left() < 16000 && P.pos < P.dur - CREDITS - 10) { await app.seekNearEnd(); continue; }
      }
      if (ph === "credits" && !rested) {
        rested = true;
        await host.pointAt(app.player!.querySelector(".fun-bf-video")!, 0.28 + Math.random() * 0.1, 0.3 + Math.random() * 0.1, 900);
        if (Math.random() < 0.5) host.react("relax");
        continue;
      }
      await host.sleep(120);
    }
    if (host.stopped) return { result: "done" };
    // the session ends: sometimes the robot closes the episode itself
    if (Math.random() < 0.45 && app.P && phaseAt(app.P.pos, app.P.dur) !== "credits") {
      await app.backToBrowse();
      await host.sleep(700);
      return { result: "closed" };
    }
    return { result: "done" };
  } finally {
    scope.dispose();
  }
}
