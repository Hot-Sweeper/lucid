import { portraitSvg } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import { brandFor } from "./brand";
import type { RobotLook } from "./rig";

export const reportPortrait = (provider: string, look: RobotLook = {}, size = 116) => portraitSvg(look, PALETTES[brandFor(provider)], { size, bust: true, cls: "paper-robot" });

const paths = {
  crew: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2"/>',
  energy: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  coin: '<ellipse cx="12" cy="12" rx="9" ry="10"/><path d="M15 8h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9m3-11v14"/>',
  check: '<path d="m5 12 4 4L20 5M20 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10"/>',
  paper: '<path d="M5 2h10l4 4v16H5zM14 2v5h5M8 12h8m-8 4h6"/>',
  image: '<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m3 18 5-5 4 4 4-7 6 8"/>',
  back: '<path d="m10 5-7 7 7 7m-7-7h18"/>',
  next: '<path d="m14 5 7 7-7 7m7-7H3"/>',
};
export function reportIcon(name: keyof typeof paths) { return `<svg class="paper-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`; }
