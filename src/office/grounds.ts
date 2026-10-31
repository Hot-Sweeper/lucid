// The office's own grounds, as plain geometry (no drawing): a lawn round the building, the
// paved walk from the entrance past the shop into the park, a small round plaza north of the
// walk, a hedge round it all, a strip of meadow and then woodland: the grounds are a clearing
// in a forest whose canopy fades into the backdrop at the edge of the drawing.
// Everything is in world coordinates and depends only on where the building, shop and park are.

export type Rect = { x: number; y: number; w: number; h: number };

export type Grounds = {
  /** The whole drawn outdoors (lawn, hedge, meadow, woodland and the soft fade at its edge). */
  bounds: Rect;
  /** The mown lawn inside the hedge. */
  lawn: Rect;
  /** The paved walk from the entrance to the park. */
  walk: Rect;
  /** The shop's paved forecourt, opening off the walk. */
  forecourt: Rect | null;
  /** The round plaza north of the walk and the short path up to it. */
  plaza: { x: number; y: number; r: number } | null;
  plazaPath: Rect | null;
};

/** Lawn between the buildings and the hedge. */
export const MARGIN = 240;
/** Meadow between the hedge and the woodland. */
export const MEADOW = 90;
/** Woodland beyond the meadow, at least this deep on every side. */
export const WOODS = 340;
/** Width of the soft edge where the woodland fades into the backdrop. */
export const FADE = 200;
/** The drawing is never flatter than this (width / height), so a zoomed-out view is filled with woodland, not backdrop. */
const ASPECT = 1.55;

export function groundsLayout(o: { building: Rect; entranceY: number; park: Rect; shop?: Rect | null }): Grounds {
  const { building: b, park: p } = o;
  const shop = o.shop ?? null;
  const ey = o.entranceY;
  const x0 = Math.min(b.x, p.x) - MARGIN, x1 = Math.max(b.x + b.w, p.x + p.w) + MARGIN;
  const y0 = Math.min(b.y, p.y) - MARGIN;
  const y1 = Math.max(b.y + b.h, p.y + p.h, shop ? shop.y + shop.h + 60 : -Infinity) + MARGIN;
  const lawn = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const e = MEADOW + WOODS;
  const bw = lawn.w + 2 * e, bh = Math.max(lawn.h + 2 * e, Math.round(bw / ASPECT));
  const bounds = { x: x0 - e, y: Math.round(y0 + lawn.h / 2 - bh / 2), w: bw, h: bh };
  const walk = { x: b.x + b.w + 36, y: ey - 62, w: p.x - (b.x + b.w + 36) + 40, h: 124 };
  const forecourt = shop ? { x: shop.x - 30, y: walk.y + walk.h - 30, w: shop.w + 60, h: shop.y - (walk.y + walk.h) + 50 } : null;
  // the plaza sits on the lawn north of the walk, halfway between the building and the park
  const gx = Math.round((b.x + b.w + p.x) / 2);
  const room = walk.y - y0;
  const plaza = room > 460 ? { x: gx, y: walk.y - Math.min(330, room / 2), r: 130 } : null;
  const plazaPath = plaza ? { x: gx - 30, y: plaza.y, w: 60, h: walk.y - plaza.y + 10 } : null;
  return { bounds, lawn, walk, forecourt, plaza, plazaPath };
}
