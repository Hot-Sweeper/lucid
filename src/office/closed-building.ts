// A linked computer whose offices are not open to us yet (connecting, offline, not shared) is
// seen from above with its roof on: nothing inside is shown until a real read succeeds.
// Same top-down vocabulary and frame as the rooms (room-art.ts).

export const CLOSED_BUILDING = { w: 1200, h: 560 };

/** `lit`: the skylights glow while the computer is reachable; dark when it is offline. */
export function closedBuildingSvg(lit: boolean) {
  const { w, h } = CLOSED_BUILDING, T = 16, ridge = h / 2;
  const rows: string[] = [];
  // Tile courses running away from the ridge on both slopes.
  for (let y = T + 26; y < h - T - 8; y += 26) if (Math.abs(y - ridge) > 14) rows.push(`<rect x="${T}" y="${y}" width="${w - 2 * T}" height="3" fill="#000" opacity="${y < ridge ? 0.1 : 0.16}"/>`);
  const skylight = (x: number, y: number) => `
    <rect x="${x - 6}" y="${y - 6}" width="132" height="76" rx="6" fill="#d8cfbf"/>
    <rect x="${x}" y="${y}" width="120" height="64" rx="3" fill="${lit ? "url(#cb-sky)" : "#262b42"}"/>
    ${lit ? `<rect x="${x}" y="${y}" width="120" height="64" rx="3" fill="#ffe6b0" style="opacity:calc(.25 + var(--lamp, 0) * .5)"/>` : ""}
    <rect x="${x + 58}" y="${y}" width="4" height="64" fill="#d8cfbf"/>`;
  return `<svg class="closed-building-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs><linearGradient id="cb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1, #9fd3ff)"/><stop offset="1" style="stop-color:var(--sky2, #dff1ff)"/></linearGradient></defs>
    <rect x="10" y="14" width="${w}" height="${h}" rx="6" fill="#000" opacity="0.14"/>
    <rect width="${w}" height="${h}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect x="${T}" y="${T}" width="${w - 2 * T}" height="${ridge - T}" fill="#c4825f"/>
    <rect x="${T}" y="${ridge}" width="${w - 2 * T}" height="${h - ridge - T}" fill="#ab6f51"/>
    ${rows.join("")}
    <rect x="${T}" y="${ridge - 7}" width="${w - 2 * T}" height="14" fill="#8a5640"/>
    ${skylight(150, ridge - 108)}${skylight(w - 290, ridge - 108)}${skylight(150, ridge + 44)}${skylight(w - 290, ridge + 44)}
    <g transform="translate(${w / 2} ${ridge})">
      <rect x="-5" y="-86" width="10" height="86" rx="3" fill="#5b5f72"/>
      <path d="M-38 -96 a40 30 0 0 0 76 0 z" fill="#e4e7ee" stroke="#5b5f72" stroke-width="4"/>
      <circle cy="-112" r="9" fill="${lit ? "#ffb98a" : "#6c6f80"}"/>
    </g>
    <rect x="${w / 2 - 90}" y="${h - 46}" width="180" height="40" rx="6" fill="#d8cfbf"/>
    <rect x="${w / 2 - 60}" y="${h - T}" width="120" height="${T}" fill="#887461"/>
  </svg>`;
}
