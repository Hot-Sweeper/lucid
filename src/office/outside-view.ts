export type OutsideRect = { x: number; y: number; w: number; h: number };

/** Bound both axes and the actual rounded pixel allocation, including portrait grounds. */
export function outsideOverviewDensity(width: number, height: number, maxAxis = 3200, maxPixels = 6_000_000) {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height)) return 0;
  const limit = Math.min(1, maxAxis / width, maxAxis / height, Math.sqrt(maxPixels / (width * height)));
  const fits = (density: number) => {
    const w = Math.max(1, Math.ceil(width * density)), h = Math.max(1, Math.ceil(height * density));
    return w <= maxAxis && h <= maxAxis && w * h <= maxPixels;
  };
  if (fits(limit)) return limit;
  // ceil() can put the nominal square-root budget one row over its limit.
  let low = 0, high = limit;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
  return low;
}

/** Camera's viewport in the grounds SVG's original local coordinates. */
export function outsideView(cam: { x: number; y: number; s: number }, width: number, height: number, left: number, top: number): OutsideRect | null {
  if (!(cam.s > 0) || !(width > 0) || !(height > 0)) return null;
  return { x: -cam.x / cam.s - left, y: -cam.y / cam.s - top, w: width / cam.s, h: height / cam.s };
}

/** Source crop and screen destination, with no world-sized display surface. */
export function outsideProjection(source: OutsideRect, view: OutsideRect, scale: number) {
  const x = Math.max(source.x, view.x), y = Math.max(source.y, view.y);
  const right = Math.min(source.x + source.w, view.x + view.w), bottom = Math.min(source.y + source.h, view.y + view.h);
  if (right <= x || bottom <= y) return null;
  return { sx: x - source.x, sy: y - source.y, sw: right - x, sh: bottom - y,
    dx: (x - view.x) * scale, dy: (y - view.y) * scale, dw: (right - x) * scale, dh: (bottom - y) * scale };
}
