/** Distance from each waypoint to the end. Routes are immutable while walking. */
export function routeSuffixLengths(points: readonly { x: number; y: number }[]) {
  const tails = new Float64Array(points.length);
  for (let i = points.length - 2; i >= 0; i--) {
    tails[i] = tails[i + 1] + Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return tails;
}
