import { sharedVector } from "./shared-vector";

// Reuse the original native rect geometry. Native SVG instances preserve the
// renderer's exact fractional-edge behavior without image resampling or tiles.
export function plankJoints(w: number, h: number, top: number, seam: string, owner?:string) {
  const shapes: string[] = [];
  for (let i = 0; i < Math.ceil((h - top) / 26); i++) {
    const y = top + i * 26, off = (i * 97) % 180;
    shapes.push(`<rect x="0" y="${y+25}" width="${w}" height="1.2" fill="${seam}" opacity="0.55"/>`);
    for (let k = 0; k < Math.ceil(w / 180) + 1; k++) {
      const x = k * 180 - off;
      shapes.push(`<rect x="${x}" y="${y}" width="1.2" height="25" fill="${seam}" opacity="0.5"/>`);
    }
  }
  const markup=shapes.join("");return owner?sharedVector(markup,owner):markup;
}

export function cafeTiles(w: number, h: number, top: number, floor: string, seam: string, owner?:string) {
  const shapes: string[] = [], cols = Math.ceil(w / 48);
  for (let i = 0; i < cols * Math.ceil(h / 48); i++) {
    const row = Math.floor(i / cols), col = i % cols, x = col * 48 + 1, y = top + row * 48 + 1;
    // Row-major indices change parity with room width; grid coordinates do not.
    shapes.push(`<rect x="${x}" y="${y}" width="46" height="46" rx="3" fill="${(col+row)%2?floor:seam}" opacity="0.9"/>`);
  }
  const markup=shapes.join("");return owner?sharedVector(markup,owner):markup;
}
