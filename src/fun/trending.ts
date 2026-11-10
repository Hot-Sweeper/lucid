import { VIDEOS, type VideoDef } from "./videos";
import { canvasText, canvasLines } from "../localization-canvas";

// Today's trending videos on BotTube, from the orchestrator's daily pack. Each one borrows the
// animation of an existing robot video and puts its own title on it, so new ones cost nothing
// to draw: a "TRENDING" badge, the title in a caption bar, and a bold thumbnail.

const TRENDING_ID = "trend-";

function make(t: { title: string; channel?: string; views?: string }, i: number): VideoDef {
  const base = VIDEOS.filter((v) => !v.id.startsWith(TRENDING_ID))[(i * 7 + t.title.length) % VIDEOS.length] ?? VIDEOS[0];
  const views = t.views || `${(1 + ((t.title.length * 37) % 90) / 10).toFixed(1)}M views`;
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, tt: number) => {
    const safe = Number.isFinite(tt) ? Math.max(0, tt) : 0;
    base.draw(ctx, w, h, safe);
    const s = Math.min(w, h) / 300;
    // TRENDING badge
    ctx.save();
    ctx.font = `700 ${Math.round(11 * s)}px Lexend Variable, sans-serif`;
    const badge = canvasText("TRENDING");
    const bw = ctx.measureText(badge).width + 18 * s;
    ctx.fillStyle = "#ff3d5a";
    ctx.beginPath(); ctx.roundRect(10 * s, 10 * s, bw, 20 * s, 10 * s); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
    ctx.fillText(badge, 19 * s, 20.5 * s);
    // the title in a caption bar
    ctx.font = `700 ${Math.round(15 * s)}px Lexend Variable, sans-serif`;
    const lines = canvasLines(ctx, t.title, w - 32 * s).slice(0, 3);
    const bh = lines.length * 19 * s + 14 * s;
    ctx.fillStyle = "rgba(12, 14, 40, 0.78)";
    ctx.fillRect(0, h - bh, w, bh);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "top";
    lines.forEach((l, k) => ctx.fillText(l, 14 * s, h - bh + 8 * s + k * 19 * s));
    ctx.restore();
  };
  return {
    id: `${TRENDING_ID}${i}`, title: t.title, channel: t.channel || base.channel, views, durationLabel: base.durationLabel,
    loop: base.loop, thumbT: base.thumbT, draw, color: base.color,
    post: { user: `@${(t.channel || "trending").toLowerCase().replace(/[^a-z0-9]+/g, "")}`, caption: t.title },
  };
}

/** Replace yesterday's trending videos with today's. */
export function setTrending(list: { title: string; channel?: string; views?: string }[] | undefined) {
  for (let i = VIDEOS.length - 1; i >= 0; i--) if (VIDEOS[i].id.startsWith(TRENDING_ID)) VIDEOS.splice(i, 1);
  (list ?? []).filter((t) => t?.title).slice(0, 8).forEach((t, i) => VIDEOS.push(make(t, i)));
}
