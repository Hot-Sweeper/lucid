import type { FunHost } from "./host";
import { drawThumbnail, type VideoDef } from "./videos";
import { Scope, fitCanvas, html, esc, DPR } from "./util";

export type Comment = { name: string; text: string; likes: string; color: string };

export const parseDur = (s: string) => s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
export const fmtDur = (sec: number) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Shared engine for the video sites: a scrolling page, live thumbnails, a player and a smooth open transition. */
export class Site {
  root: HTMLElement;
  page: HTMLElement;
  fx: HTMLElement;
  private live: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; v: VideoDef; t0: number; w: number; h: number; offset: number } | null = null;
  private hover: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; v: VideoDef; t0: number; w: number; h: number } | null = null;
  playing: { v: VideoDef; started: number; offset: number; bar: HTMLElement; time: HTMLElement; dur: number } | null = null;

  constructor(body: HTMLElement, private scope: Scope, private host: FunHost, cls: string, header: string) {
    body.innerHTML = "";
    this.root = html(`<div class="fun-site ${cls}">${header}<div class="fun-site-page"></div><div class="fun-site-fx"></div></div>`);
    body.appendChild(this.root);
    this.page = this.root.querySelector(".fun-site-page") as HTMLElement;
    this.fx = this.root.querySelector(".fun-site-fx") as HTMLElement;
    scope.raf((now) => this.frame(now * 1000));
  }

  private frame(ms: number) {
    const L = this.live;
    if (L) {
      const t = (ms - L.t0) / 1000;
      L.ctx.save();
      L.v.draw(L.ctx, L.w, L.h, t);
      L.ctx.restore();
    }
    const H = this.hover;
    if (H) {
      H.ctx.save();
      H.v.draw(H.ctx, H.w, H.h, (H.v.thumbT ?? 2) + (ms - H.t0) / 1000);
      H.ctx.restore();
    }
    const P = this.playing;
    if (P) {
      const cur = Math.min(P.dur, P.offset + (ms - P.started) / 1000);
      P.bar.style.transform = `scaleX(${(cur / P.dur).toFixed(4)})`;
      const label = `${fmtDur(cur)} / ${fmtDur(P.dur)}`;
      if (P.time.textContent !== label) P.time.textContent = label;
    }
  }

  /** Paint a still thumbnail into every canvas[data-v] under el. */
  thumbs(el: HTMLElement, videos: VideoDef[]) {
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-v]").forEach((c) => {
      const v = videos.find((x) => x.id === c.dataset.v)!;
      const w = c.clientWidth || 160, h = c.clientHeight || 90;
      const ctx = fitCanvas(c, w, h);
      drawThumbnail(v, ctx, w, h);
    });
  }

  /** Thumbnail animates while hovered, like a preview. */
  hoverPreview(canvas: HTMLCanvasElement | null, v?: VideoDef) {
    if (this.hover && this.hover.canvas !== canvas) {
      const old = this.hover;
      drawThumbnail(old.v, old.ctx, old.w, old.h);
      old.canvas.parentElement?.classList.remove("fun-hover");
    }
    if (!canvas || !v) { this.hover = null; return; }
    const ctx = canvas.getContext("2d")!;
    canvas.parentElement?.classList.add("fun-hover");
    this.hover = { canvas, ctx, v, t0: performance.now(), w: canvas.width / DPR, h: canvas.height / DPR };
  }

  /** Mount the player canvas and start playback from an offset in seconds. */
  play(canvas: HTMLCanvasElement, bar: HTMLElement, time: HTMLElement, v: VideoDef, offset = 0) {
    const w = canvas.clientWidth || 448, h = canvas.clientHeight || 252;
    const ctx = fitCanvas(canvas, w, h);
    const now = performance.now();
    this.live = { canvas, ctx, v, t0: now - offset * 1000, w, h, offset };
    this.playing = { v, started: now, offset, bar, time, dur: parseDur(v.durationLabel) };
    this.frame(now);
  }

  seek(to: number) {
    const P = this.playing;
    if (!P) return;
    const now = performance.now();
    P.offset = Math.min(P.dur - 1, to);
    P.started = now;
  }

  stop() { this.live = null; this.playing = null; this.hover = null; }

  /** Element rect in the site's own (unscaled) coordinates. */
  rect(el: Element) {
    const r = el.getBoundingClientRect(), o = this.root.getBoundingClientRect();
    const k = o.width / (this.root.offsetWidth || o.width) || 1;
    return { x: (r.left - o.left) / k, y: (r.top - o.top) / k, w: r.width / k, h: r.height / k };
  }

  /** Grow a copy of the clicked thumbnail into the player slot while the new page fades in. */
  async open(from: HTMLCanvasElement, render: () => HTMLCanvasElement) {
    const a = this.rect(from);
    const ghost = document.createElement("canvas");
    ghost.className = "fun-site-ghost";
    ghost.width = from.width; ghost.height = from.height;
    ghost.getContext("2d")!.drawImage(from, 0, 0);
    Object.assign(ghost.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
    this.fx.appendChild(ghost);
    this.hoverPreview(null);
    await this.scope.play(this.page, { opacity: 0, duration: 0.18, ease: "sine.in" });
    const target = render();
    this.page.scrollTop = 0;
    const b = this.rect(target);
    this.scope.fromTo(this.page, { opacity: 0 }, { opacity: 1, duration: 0.35, delay: 0.25, ease: "sine.out" });
    await this.scope.play(ghost, { left: b.x, top: b.y, width: b.w, height: b.h, duration: 0.55, ease: "expo.inOut" });
    this.scope.to(ghost, { opacity: 0, duration: 0.2, onComplete: () => ghost.remove() });
  }

  async swap(render: () => void) {
    this.hoverPreview(null);
    await this.scope.play(this.page, { opacity: 0, duration: 0.2, ease: "sine.in" });
    render();
    this.page.scrollTop = 0;
    await this.scope.play(this.page, { opacity: 1, duration: 0.3, ease: "sine.out" });
  }

  async scrollTo(y: number, ms = 900) {
    this.host.scroll?.();
    const max = this.page.scrollHeight - this.page.clientHeight;
    await this.scope.play(this.page, { scrollTop: Math.max(0, Math.min(max, y)), duration: ms / 1000, ease: "power2.inOut" });
  }

  /** Is the element fully inside the visible part of the page? */
  visible(el: HTMLElement) {
    const r = this.rect(el), p = this.rect(this.page);
    return r.y >= p.y && r.y + r.h <= p.y + p.h;
  }
}

export function commentsHtml(list: Comment[]) {
  return list.map((c) => `
    <div class="fun-cm">
      <span class="fun-av" style="background:${c.color}" aria-hidden="true"><i></i><i></i></span>
      <div><b>${esc(c.name)}</b><p>${esc(c.text)}</p><span class="fun-cm-like">${c.likes}</span></div>
    </div>`).join("");
}
