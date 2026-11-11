/** Where a pointer at the edge of `view` sits for a target outside it: on the line from the view's
 *  centre toward the target, clamped to the view's border. Null when the target is in view. */
export function edgePoint(x: number, y: number, view: { left: number; top: number; right: number; bottom: number }, slack = 0) {
  const { left, top, right, bottom } = view;
  if (right <= left || bottom <= top) return null;
  if (x >= left - slack && x <= right + slack && y >= top - slack && y <= bottom + slack) return null;
  const cx = (left + right) / 2, cy = (top + bottom) / 2, dx = x - cx, dy = y - cy;
  const t = Math.min(dx ? (dx > 0 ? right - cx : left - cx) / dx : Infinity, dy ? (dy > 0 ? bottom - cy : top - cy) / dy : Infinity);
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}

/** The scale that keeps a mark of `size` world pixels at least `minPx` on screen at camera zoom `s`. */
export const markScale = (s: number, size: number, minPx: number) => Math.max(1, minPx / (size * (s || 1)));
