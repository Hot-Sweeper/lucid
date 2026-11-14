import "./project-icon.css";
import { esc } from "../util/html";

// One project identity everywhere, like the thread sidebar: a project's own icon, otherwise a
// two-letter monogram on a tile tinted by the project's name; "No project" is a dashed square,
// never a monogram. Interface surfaces use `projectIcon` / `projectChip` (HTML); the room signs
// draw the same mark into their SVG with `projectIconSvg`.

/** A project as shown: its title and icon. Null is "No project" (no project or T3's scratch one). */
export type ProjectMark = { title: string; icon?: string | null } | null;
export const NO_PROJECT = "No project";

/** The mark for a T3 project record: scratch and missing projects are "No project". */
export function projectMark(p: { title: string; icon?: string | null; scratch?: boolean } | null | undefined): ProjectMark {
  return !p || p.scratch || !p.title ? null : { title: p.title, icon: p.icon ?? null };
}

/** Finds a project by id in a list and turns it into its mark. */
export function projectMarkOf(projects: readonly { id: string; title: string; icon?: string | null; scratch?: boolean }[] | undefined, id: string | null | undefined): ProjectMark {
  return projectMark(id ? projects?.find((p) => p.id === id) : null);
}

export const projectName = (m: ProjectMark) => m ? m.title : NO_PROJECT;

/** Two letters: the first letters of the first two words (camelCase counts as words), else the first two letters. */
export function projectMonogram(title: string) {
  const words = title.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** A stable hue for a project's monogram tile, from its name. */
export function projectHue(title: string) {
  let h = 2166136261;
  for (const ch of title.toLowerCase()) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0) % 360;
}

/** The mark alone as HTML (decorative: the name is always written next to it). */
export function projectIcon(m: ProjectMark, size = 16, cls = "") {
  const c = `proj-icon${cls ? ` ${cls}` : ""}`, s = `--pi:${size}px`;
  if (!m) return `<span class="${c} proj-none" style="${s}" aria-hidden="true"></span>`;
  if (m.icon) return `<img class="${c} proj-img" style="${s}" src="${esc(m.icon)}" alt="" draggable="false">`;
  return `<span class="${c} proj-mono" style="${s};--pi-hue:${projectHue(m.title)}" aria-hidden="true">${esc(projectMonogram(m.title))}</span>`;
}

/** The mark followed by the project's name, as the sidebar rows show it. */
export function projectChip(m: ProjectMark, size = 16, cls = "") {
  return `<span class="proj-chip${m ? "" : " is-none"}${cls ? ` ${cls}` : ""}">${projectIcon(m, size)}<span class="proj-name">${esc(projectName(m))}</span></span>`;
}

/** The same mark inside an SVG (room signs), top left at x, y. `ink` colours the dashed square. */
export function projectIconSvg(m: ProjectMark, x: number, y: number, size: number, ink = "var(--wd-sign-ink, #3a3f4f)") {
  const r = Math.round(size * 0.26);
  if (!m) {
    const i = size * 0.12, w = size - i * 2;
    return `<rect x="${x + i}" y="${y + i}" width="${w}" height="${w}" rx="${Math.round(w * 0.22)}" fill="none" stroke-width="${(size / 16).toFixed(2)}" stroke-dasharray="${(size / 8).toFixed(2)} ${(size / 11).toFixed(2)}" style="stroke:${ink}" opacity="0.55"/>`;
  }
  if (m.icon) return `<image href="${esc(m.icon)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  const hue = projectHue(m.title);
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" style="fill:oklch(var(--pi-tile-l, 0.36) var(--pi-tile-c, 0.08) ${hue})"/>`
    + `<text x="${x + size / 2}" y="${y + size * 0.66}" text-anchor="middle" font-size="${Math.round(size * 0.41)}" font-weight="700" font-family="var(--font)" style="fill:oklch(var(--pi-ink-l, 0.87) var(--pi-ink-c, 0.1) ${hue})">${esc(projectMonogram(m.title))}</text>`;
}
