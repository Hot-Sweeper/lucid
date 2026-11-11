import "./icons.css";

// The interface icon set: one 16 unit grid, a 1.5px stroke at every size (non-scaling), round
// caps and joins, 2 unit corners on boxes. Robot computer apps keep their own art in src/os/icons.ts.
// Dots are zero-length strokes ("M8 11.5h.01"), so they share the stroke's weight.

/** Gear outline generated once: 8 teeth with flat tops, joined by round joins. */
function gear(): string {
  const teeth = 8, outer = 6.4, inner = 4.9, half = Math.PI / teeth;
  const pt = (r: number, a: number) => `${(8 + r * Math.cos(a)).toFixed(2)} ${(8 + r * Math.sin(a)).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth - Math.PI / 2;
    d += `${i ? "L" : "M"}${pt(inner, a - half * 0.62)}L${pt(outer, a - half * 0.34)}L${pt(outer, a + half * 0.34)}L${pt(inner, a + half * 0.62)}`;
  }
  return `<path d="${d}Z"/><circle cx="8" cy="8" r="2.1"/>`;
}

const PATHS = {
  // window and panels
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  minimize: '<path d="M4 8h8"/>',
  maximize: '<rect x="4" y="4" width="8" height="8" rx="1.5"/>',
  restore: '<rect x="3.5" y="5.5" width="7" height="7" rx="1.5"/><path d="M5.5 5.5V5A1.5 1.5 0 0 1 7 3.5h4A1.5 1.5 0 0 1 12.5 5v4a1.5 1.5 0 0 1-1.5 1.5h-.5"/>',
  sidebarHide: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10M10.5 6.5 9 8l1.5 1.5"/>',
  sidebarShow: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10M9 6.5l1.5 1.5L9 9.5"/>',
  chatHide: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M10 3v10M5.5 6.5 7 8 5.5 9.5"/>',
  chatShow: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M10 3v10M7 6.5 5.5 8 7 9.5"/>',
  pin: '<g class="pin-body"><path d="M6 2.5h4l-.5 3.8 2.3 2.2H4.2l2.3-2.2z"/><path d="M8 8.5v5"/></g>',
  // actions
  settings: gear(),
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.4a1.8 1.8 0 0 1 3.5.5c0 1.2-1.8 1.4-1.8 2.6M8 11.4h.01"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 13.5 13.5"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  check: '<path d="M3.5 8.5 6.5 11.5 12.5 5"/>',
  edit: '<path d="M10.5 3.5l2 2L6 12H4v-2z"/>',
  steer: '<path d="M3 4.5v3a2 2 0 0 0 2 2h7.5M9.5 6.5l3 3-3 3"/>',
  attach: '<path d="M10.8 5.2 6.3 9.7a1.3 1.3 0 0 0 1.8 1.8l4.8-4.8a2.6 2.6 0 0 0-3.6-3.6L4.3 8.1a3.8 3.8 0 0 0 5.4 5.4l4-4"/>',
  send: '<path d="M8 13V3.5M4 7.5l4-4 4 4"/>',
  returnUp: '<path d="M4 6l4-4 4 4M8 2v9a3 3 0 0 1-3 3H3"/>',
  grip: '<path d="M6 3.5h.01M10 3.5h.01M6 8h.01M10 8h.01M6 12.5h.01M10 12.5h.01" stroke-width="2"/>',
  more: '<path d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2"/>',
  // direction
  chevronDown: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  chevronUp: '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
  chevronRight: '<path d="M6.5 4.5 10 8l-3.5 3.5"/>',
  chevronLeft: '<path d="M9.5 4.5 6 8l3.5 3.5"/>',
  arrowLeft: '<path d="M7 3.5 2.5 8 7 12.5M2.5 8h11"/>',
  arrowRight: '<path d="M9 3.5 13.5 8 9 12.5M13.5 8h-11"/>',
  // things
  screen: '<rect x="2" y="2.5" width="12" height="8.5" rx="2"/><path d="M6 13.5h4M8 11v2.5"/>',
  studio: '<rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 6h12M10 6v7.5"/>',
  chat: '<path d="M5.5 3h5A3.5 3.5 0 0 1 14 6.5v1A3.5 3.5 0 0 1 10.5 11H7l-3.5 2.5V6.5A3.5 3.5 0 0 1 5.5 3z"/><path d="M6.5 6.5h3.5M6.5 8.5h2"/>',
  terminal: '<path d="M3 4.5 6 8l-3 3.5M8.5 12H13"/>',
  pencilLine: '<path d="M3 13l.7-2.8 6.8-6.8a1.4 1.4 0 0 1 2 2l-6.8 6.9z"/>',
  tool: '<path d="M6 2.5h4v3h3v4h-3v4H6v-4H3v-4h3z"/>',
  agent: '<rect x="3" y="4.5" width="10" height="8" rx="2.5"/><path d="M8 2v2.5M6.2 8.5h.01M9.8 8.5h.01" />',
  warning: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3h.01"/>',
  users: '<circle cx="6" cy="5" r="2.2"/><path d="M2 13v-1.5a4 4 0 0 1 8 0V13M11 3a2.2 2.2 0 0 1 0 4.4M12.5 9.5a3.5 3.5 0 0 1 1.5 2.9V13"/>',
  bolt: '<path d="M9 1.5 3 9.5h4.5L7 14.5l6-8H8.5z"/>',
  coin: '<circle cx="8" cy="8" r="6"/><path d="M10 5.7H7.2a1.3 1.3 0 0 0 0 2.6h1.6a1.3 1.3 0 0 1 0 2.6H6M8 4.5v7"/>',
  checkSquare: '<path d="M3.5 7.5l2.5 2.5L13.5 2.5M13.5 8v4a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5h6"/>',
  file: '<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13M6.5 8.5h4M6.5 11h3"/>',
  image: '<rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="6" cy="6.5" r="1.3"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2.5-3.5 3 4"/>',
  checklist: '<rect x="3" y="2" width="10" height="12.5" rx="2"/><path d="M5.5 6l1 1 2-2M5.5 10l1 1 2-2M10 6.3h1M10 10.3h1"/>',
  play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9" stroke-width="2.5"/>',
  volume: '<path d="M7.5 3.5 4.5 6H2.5v4h2l3 2.5zM10.5 6a3 3 0 0 1 0 4M12.5 4a6 6 0 0 1 0 8"/>',
  muted: '<path d="M7.5 3.5 4.5 6H2.5v4h2l3 2.5zM10.5 6.5l3 3M13.5 6.5l-3 3"/>',
  fullscreen: '<path d="M5.5 2.5h-3v3M10.5 2.5h3v3M2.5 10.5v3h3M13.5 10.5v3h-3"/>',
  fullscreenExit: '<path d="M2.5 5.5h3v-3M10.5 2.5v3h3M5.5 13.5v-3h-3M13.5 10.5h-3v3"/>',
  // status vocabulary (src/ui/status.ts)
  statusWorking: '<circle cx="8" cy="8" r="6.5" stroke-dasharray="2.6 2.2"/>',
  statusNeeds: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5.2v3.3M8 10.8h.01"/>',
  statusDone: '<circle cx="8" cy="8" r="6.5"/><path d="m6 8 1.33 1.33 2.67-2.67"/>',
  statusSettled: '<path d="M2.5 4.5h11v2.5h-11zM3.5 7v4.5A1.5 1.5 0 0 0 5 13h6a1.5 1.5 0 0 0 1.5-1.5V7M6.5 9.5h3"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** An interface icon as SVG markup. Decorative by default; pass a label for a meaningful image. */
export function icon(name: IconName, size = 16, o: { cls?: string; label?: string } = {}): string {
  const a11y = o.label ? `role="img" aria-label="${o.label.replace(/"/g, "&quot;")}"` : 'aria-hidden="true"';
  return `<svg class="ui-icon${o.cls ? ` ${o.cls}` : ""}" data-icon="${name}" viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${a11y}>${PATHS[name]}</svg>`;
}
