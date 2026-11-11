// Window sizes for real content with a known shape (a captured browser window, a photo, a
// sprite sheet frame). The window's content box keeps exactly that aspect ratio wherever the
// window manager puts it, so the content fills it without letterbox bars.
export type Size = { w: number; h: number };
export type Rect = Size & { x: number; y: number };
/** What the window adds around the content: its title bar and any app controls. */
export type ContentFit = { content: Size; inset: Size; prefer?: Size; maxScale?: number };

const MIN: Size = { w: 150, h: 96 };

/**
 * The window size whose content box has the content's aspect ratio, close to the preferred
 * window's area (so a tall page gets a tall window of similar presence, not a sliver), never
 * larger than `room`, and never more than `maxScale` times the content's own pixels.
 */
export function fitWindow(fit: ContentFit, room: Size): Size {
  const { content, inset } = fit;
  if (!(content.w > 0 && content.h > 0)) return { w: Math.round(room.w), h: Math.round(room.h) };
  const ratio = content.w / content.h;
  const prefer = fit.prefer ?? room;
  const area = Math.max(1, (prefer.w - inset.w) * (prefer.h - inset.h));
  let w = Math.sqrt(area * ratio);
  // Shrink uniformly until it fits the room and the content's own resolution allows it.
  const k = Math.min(1, (room.w - inset.w) / w, (room.h - inset.h) / (w / ratio), fit.maxScale ? (content.w * fit.maxScale) / w : Infinity);
  w *= k;
  // Too small for a usable window: enlarge (in shape) as far as the room allows.
  const need = Math.max((MIN.w - inset.w) / w, (MIN.h - inset.h) / (w / ratio));
  if (need > 1) w *= Math.max(1, Math.min(need, (room.w - inset.w) / w, (room.h - inset.h) / (w / ratio)));
  // Whole pixels: round the shorter side down and derive the longer one from it, so the
  // content box is off its true shape by at most half a pixel along either side.
  let bw: number, bh: number;
  if (ratio >= 1) { bh = Math.floor(w / ratio); bw = Math.round(bh * ratio); }
  else { bw = Math.floor(w); bh = Math.round(bw / ratio); }
  return { w: bw + inset.w, h: bh + inset.h };
}

/** The largest fitting window, centred in `area` (maximize). */
export function maximizedFrame(fit: ContentFit, area: Rect): Rect {
  const size = fitWindow({ ...fit, prefer: area }, area);
  return { ...size, x: Math.round(area.x + (area.w - size.w) / 2), y: Math.round(area.y + (area.h - size.h) / 2) };
}

/** Snapped to one half of the desktop: against that screen edge, vertically centred. */
export function snappedFrame(fit: ContentFit, half: Rect, side: "left" | "right"): Rect {
  const size = fitWindow({ ...fit, prefer: half }, half);
  return { ...size, x: side === "left" ? half.x : half.x + half.w - size.w, y: Math.round(half.y + (half.h - size.h) / 2) };
}

/** A floating window takes the content's shape around its current centre, keeping its presence. */
export function refitFrame(fit: ContentFit, current: Rect, area: Rect): Rect {
  const size = fitWindow({ ...fit, prefer: fit.prefer ?? current }, area);
  return placeAround(size, { x: current.x + current.w / 2, y: current.y + current.h / 2 }, area);
}

export function placeAround(size: Size, centre: { x: number; y: number }, area: Rect): Rect {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    ...size,
    x: Math.round(clamp(centre.x - size.w / 2, area.x, area.x + area.w - size.w)),
    y: Math.round(clamp(centre.y - size.h / 2, area.y, area.y + area.h - size.h)),
  };
}

/** The content box of a window frame (frame minus inset). */
export function contentBox(frame: Size, inset: Size): Size {
  return { w: frame.w - inset.w, h: frame.h - inset.h };
}
