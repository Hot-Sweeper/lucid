// Official harness logos (from thesvg.org). One-colour logos take the colour of the text around
// them (white on dark panels, dark on light ones); colour logos keep their own colours.
import claude from "../assets/harness/claude.svg?raw";
import codex from "../assets/harness/codex.svg?raw";
import antigravity from "../assets/harness/antigravity.svg?raw";
import opencode from "../assets/harness/opencode.svg?raw";
import cursor from "../assets/harness/cursor.svg?raw";
import type { HarnessKind } from "./themes";

const RAW: Partial<Record<HarnessKind, string>> = { claude, codex, antigravity, opencode, cursor };
const MONO = new Set<HarnessKind>(["codex", "opencode", "cursor"]);

const clean = new Map<HarnessKind, string>();
/** The logo as inline SVG markup that fills its box, or null when there is none. */
export function logoSvg(kind: HarnessKind): string | null {
  const raw = RAW[kind];
  if (!raw) return null;
  let s = clean.get(kind);
  if (s) return s;
  s = raw
    .replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "").replace(/<title>[\s\S]*?<\/title>/g, "").trim();
  // the root element: no fixed size, and for one-colour logos the current text colour
  s = s.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    let a = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    if (MONO.has(kind)) a = a.replace(/\sfill="[^"]*"/g, "") + ' fill="currentColor"';
    return `<svg${a} width="100%" height="100%" aria-hidden="true" focusable="false">`;
  });
  if (MONO.has(kind)) s = s.replace(/\sfill="(white|black|#fff|#ffff|#ffffff|#000|#000000)"/gi, "");
  clean.set(kind, s);
  return s;
}

/** The logo as an image URL, coloured for a dark or a light background. */
export function logoUrl(kind: HarnessKind, bg: "dark" | "light" = "dark"): string | null {
  const s = logoSvg(kind);
  if (!s) return null;
  const svg = MONO.has(kind) ? s.replace('fill="currentColor"', `fill="${bg === "dark" ? "#ffffff" : "#1b1f45"}"`) : s;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
