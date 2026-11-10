// A room's static artwork: floor, walls, windows, sign, clock and decorations, as one SVG.
import { printerArt } from "../printer";
import { UNIT_W, UNIT_H } from "../desk";
import { drawFloor, drawWall, drawDecor, placeDecor } from "../../decor/decor";
import { snakeSeat } from "../room-policy";
import type { RoomTheme } from "../decorate";
import { ambientPlant } from "../ambient";
import { cafeTiles, plankJoints } from "../../perf/floor-paths";
import { icon } from "../../ui/icons";
import type { Room } from "./types";
import { WALL_FACE, SLOT_W, SLOT_H, columnsForRoom, usable } from "./geometry";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function monogram(title: string) {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}

export function officeDecor(r: Room, slots: number, theme?: RoomTheme) {
  const { w, h, kind } = r, T = 16, cols = columnsForRoom(r);
  const desks = Array.from({ length: slots }, (_, k) => { const { c, row } = snakeSeat(k, cols); return { x: 70 + c * SLOT_W, y: WALL_FACE + 40 + row * SLOT_H, w: UNIT_W, h: UNIT_H }; });
  const avoid = [{ x: 30, y: T, w: 148, h: WALL_FACE - T }, ...(kind === "main" ? [{ x: w - 112, y: T, w: 64, h: 66 }] : []), ...(kind === "freelance" ? [{ x: w - 430, y: WALL_FACE - 10, w: 310, h: 70 }] : [])];
  return placeDecor(usable(theme), w, h, WALL_FACE, desks, { avoid, wallTop: T });
}

export function roomSvg(r: Room, slots: number, theme?: RoomTheme, owner?:string) {
  const { w, h, kind, title, icon } = r;
  const raw = {
    main: { wall: "#ece6da", trim: "#d8cfbf", floor: "#c9a274", seam: "#b88f61", accent: "#ff9f5a" },
    project: { wall: "#e4e7ee", trim: "#cdd2dc", floor: "#bf9a70", seam: "#ab8660", accent: "#4fb6ff" },
    freelance: { wall: "#f0dfcb", trim: "#dcc4a8", floor: "#c98a6a", seam: "#b8775a", accent: "#ff6f91" },
    break: { wall: "#e6eadf", trim: "#d0d6c5", floor: "#c9a274", seam: "#b88f61", accent: "#4ff0a0" },
    queue: { wall: "#ebe4ef", trim: "#d6cddd", floor: "#c9a274", seam: "#b88f61", accent: "#b07cff" },
    charging: { wall: "#e6eadf", trim: "#d0d6c5", floor: "#c49a6c", seam: "#b2875b", accent: "#4ff0a0" },
  }[kind];
  // Interface themes can restyle the default materials (themes/tokens.css, --wd-*); each room's
  // own colour stays the fallback. Purchased floors and walls keep their look.
  const tile = kind === "freelance";
  const pal = { ...raw, wall: `var(--wd-wall, ${raw.wall})`, trim: `var(--wd-trim, ${raw.trim})`,
    floor: tile ? `var(--wd-tile, ${raw.floor})` : `var(--wd-floor, ${raw.floor})`, seam: tile ? `var(--wd-tile-seam, ${raw.seam})` : `var(--wd-seam, ${raw.seam})` };
  if (r.collapsed) {
    const doorX = kind === "main" ? w / 2 - 30 : w - 74, doorY = kind === "main" ? h - 64 : 16;
    return `<svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <rect width="${w}" height="${h}" style="fill:${pal.floor}"/>
      <rect width="${w}" height="${WALL_FACE}" style="fill:${pal.wall}"/><rect width="${w}" height="16" style="fill:${pal.trim}"/>
      <rect x="16" y="16" width="${w - 32}" height="${WALL_FACE - 16}" style="fill:${pal.wall}"/>
      <rect x="30" y="26" width="${w - 140}" height="68" rx="8" style="fill:var(--wd-sign, #fff)" opacity="0.94"/>
      ${icon ? `<image href="${icon}" x="40" y="37" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="40" y="37" width="46" height="46" rx="10" fill="${pal.accent}"/><text x="63" y="68" text-anchor="middle" font-size="19" fill="#fff" font-family="var(--font)">${esc(monogram(title))}</text>`}
      <foreignObject x="98" y="35" width="${w - 218}" height="52"><div xmlns="http://www.w3.org/1999/xhtml" class="room-name">${esc(title)}</div></foreignObject>
      <rect x="${doorX - 4}" y="${doorY - 4}" width="68" height="${kind === "main" ? 68 : 102}" rx="4" style="fill:${pal.trim}"/>
      <rect x="${doorX}" y="${doorY}" width="60" height="${kind === "main" ? 64 : 94}" rx="3" fill="#887461"/>
      <rect x="${doorX + 7}" y="${doorY + 8}" width="46" height="${kind === "main" ? 43 : 72}" rx="2" fill="#9b8771"/>
      <circle cx="${doorX + 49}" cy="${doorY + 48}" r="3" fill="#ffd27a"/>
      <text x="26" y="147" font-size="18" fill="#554b42" font-family="var(--font)">Quiet office</text>
      <rect y="${h - 12}" width="${w}" height="12" style="fill:${pal.trim}"/>
    </svg>`;
  }
  const uid = Math.random().toString(36).slice(2, 8);
  const T = 16; // wall top thickness
  // floor: planks seen from above (or terracotta tiles in the freelancer cafe)
  const floor = kind === "freelance"
    ? cafeTiles(w, h, WALL_FACE, pal.floor, pal.seam,owner)
    : plankJoints(w, h, WALL_FACE, pal.seam,owner);
  // windows on the north wall face
  const windows: string[] = [];
  const hallDoor = kind === "project" || kind === "freelance";
  const nWin = Math.max(1, Math.floor((w - 240 - (hallDoor ? 60 : 0)) / 300));
  for (let i = 0; i < nWin; i++) {
    const wx = 200 + i * ((w - 260) / nWin), ww = Math.min(220, (w - 260) / nWin - 40);
    windows.push(`
      <rect x="${wx - 6}" y="${T + 14}" width="${ww + 12}" height="${WALL_FACE - T - 30}" rx="6" style="fill:${pal.trim}"/>
      <rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#sky${uid})"/>
      <g style="opacity:var(--stars)">${Array.from({ length: 7 }, (_, k) => `<circle cx="${wx + 8 + ((k * 61) % (ww - 16))}" cy="${T + 26 + ((k * 23) % 30)}" r="${k % 3 ? 1 : 1.6}" fill="#fff"/>`).join("")}</g>
      <g style="opacity:var(--frost, 0)"><rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#frost${uid})"/>
        <path d="M${wx + 3} ${T + 34}l9 -5l-4 -6M${wx + 10} ${T + 24}l6 7M${wx + ww - 4} ${WALL_FACE - 26}l-10 -4l3 -7M${wx + ww - 14} ${WALL_FACE - 23}l-4 -8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.9"/></g>
      <rect x="${wx + ww / 2 - 2}" y="${T + 20}" width="4" height="${WALL_FACE - T - 42}" style="fill:${pal.trim}"/>
      <rect x="${wx - 10}" y="${WALL_FACE - 14}" width="${ww + 20}" height="6" rx="3" style="fill:${pal.trim}"/>`);
  }
  // pools of lamp light on the floor (they show at night)
  const lamps: string[] = [];
  for (let ly = WALL_FACE + 170; ly < h - 40; ly += 460)
    for (let lx = 230; lx < w - 60; lx += 420)
      lamps.push(`<ellipse cx="${lx}" cy="${ly}" rx="190" ry="150" fill="url(#pool${uid})" style="opacity:var(--lamp)"/>`);
  const signBox = kind !== "break" && kind !== "queue" ? `
    <g transform="translate(34 ${T + 10})">
      <rect width="140" height="${WALL_FACE - T - 24}" rx="10" style="fill:var(--wd-sign, #ffffff)" opacity="0.94"/>
      ${icon ? `<image href="${icon}" x="10" y="12" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="10" y="12" width="46" height="46" rx="12" fill="${pal.accent}"/><text x="33" y="42" text-anchor="middle" font-size="19" font-weight="600" fill="#fff" font-family="var(--font)">${esc(monogram(title))}</text>`}
      <foreignObject x="62" y="8" width="74" height="${WALL_FACE - T - 40}"><div xmlns="http://www.w3.org/1999/xhtml" class="room-name">${esc(title)}</div></foreignObject>
    </g>` : `<text x="40" y="${T + 52}" font-size="28" font-weight="600" style="fill:var(--wd-sign-ink, #3a3f4f)" font-family="var(--font)">${esc(title)}</text>`;
  const clock = kind === "main" ? `
    <g transform="translate(${w - 80} ${T + 46})">
      <circle r="28" fill="#fff"/><circle r="24" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-1" y="-22" width="2" height="${i % 3 ? 3 : 6}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.8" y="-13" width="3.6" height="15" rx="1.8" fill="#3a3f4f"/>
      <rect class="clock-m" x="-1.2" y="-20" width="2.4" height="22" rx="1.2" fill="#3a3f4f"/>
      <circle r="2.6" fill="${pal.accent}"/>
    </g>` : "";
  const plant = (x: number, y: number, s = 1) => ambientPlant(x, y, s);
  // the room's furnishing: placed around the desks, never on them
  let decorSvg: string | null = null;
  const items = usable(theme);
  if (items.length) {
    decorSvg = officeDecor(r, slots, theme).map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("");
  }
  return /* svg */ `
  <svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <radialGradient id="frost${uid}" r="0.75"><stop offset="0.45" stop-color="#eef6fb" stop-opacity="0"/><stop offset="0.85" stop-color="#eef6fb" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.95"/></radialGradient>
      <radialGradient id="pool${uid}"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.28"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>
    </defs>
    <g data-cache-live="floor">${theme?.floor ? drawFloor(theme.floor, w, h, WALL_FACE) : `<rect y="${WALL_FACE}" width="${w}" height="${h - WALL_FACE}" style="fill:${pal.floor}"/>${floor}`}</g>
    ${lamps.join("")}
    <rect y="${WALL_FACE}" width="${w}" height="18" fill="#000" opacity="0.07"/>
    ${theme?.wall ? drawWall(theme.wall, w, WALL_FACE) : `<rect width="${w}" height="${WALL_FACE}" style="fill:${pal.wall}"/><rect y="${WALL_FACE - 10}" width="${w}" height="10" style="fill:${pal.trim}"/>`}
    ${windows.join("")}
    ${signBox}${clock}
    ${["main", "project", "freelance"].includes(kind) ? printerArt(h, pal.accent) : ""}
    ${decorSvg ?? `${plant(w - 60, h - 70)}${plant(52, h - 70, 0.85)}`}
    <rect width="${w}" height="${T}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect width="${T}" height="${h}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect x="${w - T}" width="${T}" height="${h}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect y="${h - T}" width="${w}" height="${T}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect x="${w / 2 - 60}" y="${h - T}" width="120" height="${T}" style="fill:${pal.floor}"/>
    ${hallDoor ? `<rect x="${w - 74}" y="0" width="56" height="${WALL_FACE}" fill="#7a5236"/><rect x="${w - 69}" y="4" width="46" height="${WALL_FACE - 4}" style="fill:${pal.floor}"/><rect x="${w - 69}" y="${WALL_FACE - 14}" width="46" height="14" fill="#000" opacity="0.08"/>` : ""}
  </svg>`;
}
