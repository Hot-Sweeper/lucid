export type ScreenDetail = 'full' | 'lines' | 'shapes' | 'icon';
// Projected monitor width in CSS pixels (the physical monitor is 276 units wide).
// Full text survives until it is too small to read; overview icons arrive before
// individual message shapes disappear. The same cutoffs apply in both directions.
export const SCREEN_DETAIL_WIDTHS = { icon: 160, shapes: 245, lines: 340 } as const;
export function screenDetail(width: number, _previous?: ScreenDetail): ScreenDetail {
  // Normalize subpixel floating point noise after inverse wheel multipliers.
  const pixels = Math.round(width * 100) / 100;
  if (pixels < SCREEN_DETAIL_WIDTHS.icon) return 'icon';
  if (pixels < SCREEN_DETAIL_WIDTHS.shapes) return 'shapes';
  if (pixels < SCREEN_DETAIL_WIDTHS.lines) return 'lines';
  return 'full';
}
