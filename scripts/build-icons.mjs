#!/usr/bin/env node
// App icons from the brand mark (src/ui/brand-mark.ts). Writes build/icons/icon.svg (the master),
// PNGs at every size Linux, Windows and macOS ask for, icon.ico and icon.icns.
// Needs rsvg-convert (librsvg) for the PNGs; .ico and .icns are packed here from those PNGs.
// The outputs are committed, so packaging never needs librsvg. Run this again after changing the
// mark: node scripts/build-icons.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The package is CommonJS, so load the mark's ES module source through a data URL.
const markSource = stripTypeScriptTypes(readFileSync(join(root, "src", "ui", "brand-mark.ts"), "utf8"));
const { brandMark } = await import("data:text/javascript," + encodeURIComponent(markSource));
const out = join(root, "build", "icons");
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

// The in-app mark follows the theme accent through a CSS variable; an app icon needs fixed colors.
// The 24-unit mark is centred on a 1024 canvas at 80% (824 px), the size of the macOS icon grid.
export function iconSvg() {
  const mark = brandMark(24)
    .replace(/style="stop-color: var\(--accent, (#[0-9a-f]{6})\)"/i, 'stop-color="$1"')
    .replace(/ class="brand-mark"| aria-hidden="true"| focusable="false"/g, "")
    .replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(62.55 62.55) scale(37.45)">
    ${mark}
  </g>
</svg>
`;
}

// ICO with PNG entries (Windows Vista and later).
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(([size, data], i) => {
    const at = 6 + 16 * i;
    head[at] = size >= 256 ? 0 : size; head[at + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map(([, data]) => data)]);
}

// ICNS with PNG entries: OSType, then the pixel size it holds (the @2x types hold double).
const ICNS_TYPES = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024], ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]];
function icns(entries) {
  const chunks = entries.map(([type, data]) => {
    const head = Buffer.alloc(8); head.write(type, 0, "latin1"); head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8); head.write("icns", 0, "latin1");
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

const has = (tool, args = ["--version"]) => { try { execFileSync(tool, args, { stdio: "ignore" }); return true; } catch { return false; } };

function main() {
  mkdirSync(out, { recursive: true });
  const svg = join(out, "icon.svg");
  writeFileSync(svg, iconSvg());
  if (!has("rsvg-convert")) throw Error("rsvg-convert (librsvg) is needed to draw the PNG sizes.");
  for (const size of SIZES) execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", join(out, `${size}x${size}.png`), svg]);
  copyFileSync(join(out, "1024x1024.png"), join(out, "icon.png"));
  const png = (s) => readFileSync(join(out, `${s}x${s}.png`));
  writeFileSync(join(out, "icon.ico"), ico([16, 24, 32, 48, 64, 128, 256].map((s) => [s, png(s)])));
  writeFileSync(join(out, "icon.icns"), icns(ICNS_TYPES.map(([type, s]) => [type, png(s)])));
  console.log(`Icons written to ${out}: ${SIZES.length} PNG sizes, icon.ico and icon.icns.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
