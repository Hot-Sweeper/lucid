export type ScreenDetail = 'full' | 'lines' | 'shapes' | 'icon';
// Projected monitor width in device pixels (the physical monitor is 276 units wide), the same
// distances as src/perf/lod.ts (LOD_PX), kept here without imports so checks can load it alone.
// Full text survives until it is too small to read (13 px app text at about 7 device px);
// overview icons arrive before individual message shapes disappear. The same cutoffs apply in
// both directions, so a wheel step and its inverse always restore the same view.
export const SCREEN_DETAIL_WIDTHS = { icon: 190, shapes: 300, lines: 440 } as const;
/** `width`: the monitor's width in page pixels; compared in device pixels. */
export function screenDetail(width: number, _previous?: ScreenDetail): ScreenDetail {
  const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  // Normalize subpixel floating point noise after inverse wheel multipliers.
  const pixels = Math.round(width * ratio * 100) / 100;
  if (pixels < SCREEN_DETAIL_WIDTHS.icon) return 'icon';
  if (pixels < SCREEN_DETAIL_WIDTHS.shapes) return 'shapes';
  if (pixels < SCREEN_DETAIL_WIDTHS.lines) return 'lines';
  return 'full';
}
