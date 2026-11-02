// A compact cabinet in the left aisle, clear of the room sign and the first monitor.
export function printerStation(roomHeight: number) {
  const scale = roomHeight < 250 ? 0.48 : 1;
  return { x: 22, y: 122, scale, pickup: { x: 100, y: 266 }, footprint: { x: 22, y: 164, w: 88, h: 54 } };
}

export function printerArt(roomHeight: number, accent: string) {
  const p = printerStation(roomHeight);
  return `<g data-cache-live class="office-printer" transform="translate(${p.x} ${p.y}) scale(${p.scale})">
    <ellipse cx="44" cy="95" rx="48" ry="7" fill="#3a2b26" opacity=".14"/>
    <rect x="5" y="55" width="78" height="36" rx="5" fill="#9b7050"/>
    <rect x="10" y="62" width="32" height="22" rx="3" fill="#bb8d65"/><rect x="46" y="62" width="32" height="22" rx="3" fill="#bb8d65"/>
    <path d="M23 66h8m25 0h8" stroke="#6f503d" stroke-width="3" stroke-linecap="round"/>
    <rect x="0" y="48" width="88" height="10" rx="4" fill="#e1b181"/><rect x="4" y="49" width="80" height="2" rx="1" fill="#fff4db" opacity=".6"/>
    <rect x="8" y="14" width="72" height="36" rx="7" fill="#50576b"/>
    <rect x="12" y="12" width="64" height="23" rx="6" fill="#e2dfed"/>
    <rect x="23" y="0" width="42" height="19" rx="2" fill="#fffaf3"/><path d="M29 6h29m-29 5h20" stroke="#aaa3b7" stroke-width="2"/>
    <rect x="17" y="35" width="43" height="6" rx="2" fill="#303747"/>
    <rect x="64" y="24" width="7" height="4" rx="1" fill="${accent}"/>
    <g class="report-sheet" opacity="0"><rect x="20" y="39" width="36" height="20" rx="1" fill="#fffaf3"/><path d="M25 44h25m-25 5h20m-20 5h14" stroke="#aaa3b7" stroke-width="1.5"/></g>
  </g>`;
}
