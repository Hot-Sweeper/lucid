// The outdoors around the building, seen from above: grass, trees, a path from the
// entrance, and a small park next door with a pond, benches and lamps.

export const PARK_W = 1300;

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function tree(x: number, y: number, r: number, shade: number) {
  const greens = [["#3f8f5a", "#57a96f", "#78c48a"], ["#357f52", "#4c9c65", "#6db57d"], ["#4a9a5e", "#62b574", "#86cf94"]][shade % 3];
  return `<g>
    <ellipse cx="${x + r * 0.35}" cy="${y + r * 0.55}" rx="${r * 1.05}" ry="${r * 0.7}" fill="#1f3a22" opacity="0.28"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${greens[0]}"/>
    <circle cx="${x - r * 0.25}" cy="${y - r * 0.2}" r="${r * 0.72}" fill="${greens[1]}"/>
    <circle cx="${x - r * 0.38}" cy="${y - r * 0.38}" r="${r * 0.36}" fill="${greens[2]}"/>
  </g>`;
}
function bush(x: number, y: number, r: number) {
  return `<ellipse cx="${x + 4}" cy="${y + 5}" rx="${r * 1.1}" ry="${r * 0.7}" fill="#1f3a22" opacity="0.22"/>
    <circle cx="${x - r * 0.4}" cy="${y}" r="${r * 0.7}" fill="#4e9d62"/><circle cx="${x + r * 0.4}" cy="${y + 2}" r="${r * 0.65}" fill="#468f59"/><circle cx="${x}" cy="${y - r * 0.3}" r="${r * 0.62}" fill="#62b574"/>`;
}
function flowers(x: number, y: number, w: number, h: number, seed: number) {
  const r = rnd(seed);
  const cols = ["#ff6f91", "#ffd27a", "#b07cff", "#ffffff", "#ff9f5a"];
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#7a5a3a"/><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="#5b8f4e"/>`;
  for (let i = 0; i < (w * h) / 220; i++) s += `<circle cx="${x + 8 + r() * (w - 16)}" cy="${y + 7 + r() * (h - 14)}" r="${2.4 + r() * 1.6}" fill="${cols[Math.floor(r() * cols.length)]}"/>`;
  return s;
}
function bench(x: number, y: number) {
  return `<g transform="translate(${x} ${y}) scale(1.5) translate(${-x} ${-y})"><rect x="${x - 2}" y="${y + 20}" width="74" height="8" rx="4" fill="#2b1d10" opacity="0.2"/>
    <rect x="${x}" y="${y}" width="70" height="10" rx="3" fill="#a4723f"/><rect x="${x}" y="${y + 13}" width="70" height="10" rx="3" fill="#b9854c"/>
    <rect x="${x + 6}" y="${y - 2}" width="5" height="27" rx="2" fill="#3a3f4f"/><rect x="${x + 59}" y="${y - 2}" width="5" height="27" rx="2" fill="#3a3f4f"/></g>`;
}
function picnic(x: number, y: number) {
  let checks = "";
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) checks += `<rect x="${x + i * 30}" y="${y + j * 30}" width="30" height="30" fill="#ffffff" opacity="0.75"/>`;
  return `<g transform="rotate(-8 ${x + 60} ${y + 45})"><rect x="${x + 6}" y="${y + 8}" width="120" height="90" rx="6" fill="#1f3a22" opacity="0.18"/>
    <rect x="${x}" y="${y}" width="120" height="90" rx="6" fill="#e2626b"/>${checks}
    <rect x="${x + 72}" y="${y + 18}" width="34" height="24" rx="5" fill="#b9854c"/><rect x="${x + 76}" y="${y + 14}" width="26" height="6" rx="3" fill="#8a5f33"/>
    <circle cx="${x + 30}" cy="${y + 62}" r="9" fill="#ffd27a"/><circle cx="${x + 52}" cy="${y + 66}" r="7" fill="#ff9f5a"/></g>`;
}
function lamp(x: number, y: number) {
  return `<g><ellipse cx="${x}" cy="${y}" rx="70" ry="52" fill="#ffe6b0" style="opacity:calc(var(--lamp) * 0.32)"/>
    <circle cx="${x + 3}" cy="${y + 4}" r="9" fill="#1f2a1a" opacity="0.25"/><circle cx="${x}" cy="${y}" r="8" fill="#3a3f4f"/>
    <circle cx="${x}" cy="${y}" r="4.5" fill="#fff3c9" style="opacity:calc(0.35 + var(--lamp) * 0.65)"/></g>`;
}

// Draw the whole outdoor area. The building occupies (bx, by, bw, bh) in world coordinates;
// the outdoor svg is placed at (ox, oy) and is (w x h) big.
export function outsideSvg(o: { ox: number; oy: number; w: number; h: number; building: { x: number; y: number; w: number; h: number }; entranceY: number; park: { x: number; y: number; w: number; h: number } }) {
  const { ox, oy, w, h, building: b, park: p } = o;
  const X = (x: number) => x - ox, Y = (y: number) => y - oy;
  const r = rnd(7);
  let grass = "";
  for (let i = 0; i < (w * h) / 5200; i++) {
    const x = r() * w, y = r() * h;
    grass += `<path d="M${x} ${y} l2 -6 l2 6" stroke="#5f9c55" stroke-width="1.6" fill="none" opacity="${0.35 + r() * 0.3}" stroke-linecap="round"/>`;
  }
  // trees around the building, never on it, the path or the park
  const blocked = (x: number, y: number, pad: number) =>
    (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) ||
    (x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) ||
    (y > o.entranceY - 120 && y < o.entranceY + 120 && x > b.x + b.w - 40 && x < p.x + 40);
  let trees = "";
  const rt = rnd(42);
  for (let i = 0, n = Math.round((w * h) / 52000); i < n; i++) {
    const x = ox + rt() * w, y = oy + rt() * h, rr = 34 + rt() * 34;
    if (blocked(x, y, rr + 60)) continue;
    trees += rt() < 0.25 ? bush(X(x), Y(y), rr * 0.6) : tree(X(x), Y(y), rr, Math.floor(rt() * 3));
  }
  // the park: pond, paths, benches, lamps, flower beds, a few big trees
  const pcx = X(p.x + p.w / 2), pcy = Y(p.y + p.h / 2);
  const park = `
    <rect x="${X(p.x)}" y="${Y(p.y)}" width="${p.w}" height="${p.h}" rx="60" fill="#7fbf6a"/>
    <rect x="${X(p.x) + 14}" y="${Y(p.y) + 14}" width="${p.w - 28}" height="${p.h - 28}" rx="50" fill="#86c871"/>
    <path d="M${X(p.x)} ${Y(o.entranceY)} C ${pcx - 300} ${Y(o.entranceY)} ${pcx - 200} ${pcy} ${pcx} ${pcy}" stroke="#e6d6b4" stroke-width="44" fill="none" stroke-linecap="round"/>
    <path d="M${pcx} ${Y(p.y) + 40} L${pcx} ${Y(p.y + p.h) - 40}" stroke="#e6d6b4" stroke-width="36" fill="none" stroke-linecap="round"/>
    <ellipse cx="${pcx + 260}" cy="${pcy - 120}" rx="190" ry="120" fill="#6aa9c9"/>
    <ellipse cx="${pcx + 260}" cy="${pcy - 120}" rx="172" ry="104" fill="#7cc1de"/>
    <path class="pond-shine" d="M${pcx + 170} ${pcy - 170} q40 -14 80 0" stroke="#e8f8ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M${pcx + 300} ${pcy - 90} q30 -10 60 0" stroke="#e8f8ff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>
    <circle cx="${pcx + 330}" cy="${pcy - 140}" r="16" fill="#5aa85c"/><circle cx="${pcx + 200}" cy="${pcy - 90}" r="12" fill="#5aa85c"/>
    <circle cx="${pcx}" cy="${pcy}" r="70" fill="#d8c8a6"/><circle cx="${pcx}" cy="${pcy}" r="52" fill="#8fc9e2"/><circle cx="${pcx}" cy="${pcy}" r="16" fill="#d8c8a6"/>
    <circle class="fountain" cx="${pcx}" cy="${pcy}" r="8" fill="#ffffff" opacity="0.85"/>
    ${bench(pcx - 150, pcy - 110)}${bench(pcx + 80, pcy + 110)}${bench(pcx - 150, pcy + 120)}
    ${flowers(pcx - 330, pcy + 170, 190, 46, 3)}${flowers(pcx + 120, pcy - 300, 160, 40, 5)}
    ${picnic(pcx - 380, pcy + 300)}${flowers(pcx + 160, pcy + 330, 210, 44, 9)}
    ${bush(pcx - 470, pcy + 230, 40)}${bush(pcx - 200, pcy + 420, 34)}${bush(pcx + 420, pcy + 220, 38)}${bush(pcx + 470, pcy + 260, 30)}
    ${lamp(pcx - 60, pcy - 170)}${lamp(pcx + 60, pcy + 190)}${lamp(X(p.x) + 120, Y(o.entranceY) - 60)}
    ${tree(X(p.x) + 110, Y(p.y) + 110, 64, 0)}${tree(X(p.x + p.w) - 120, Y(p.y + p.h) - 120, 70, 1)}${tree(pcx - 320, pcy - 200, 58, 2)}${tree(X(p.x + p.w) - 110, Y(p.y) + 300, 54, 0)}`;
  // the building: thick outer wall, a shadow, an entrance with steps toward the park
  const bx = X(b.x), by = Y(b.y);
  const shell = `
    <rect x="${bx + 24}" y="${by + 34}" width="${b.w}" height="${b.h}" rx="14" fill="#1f2a1a" opacity="0.32"/>
    <rect x="${bx - 22}" y="${by - 22}" width="${b.w + 44}" height="${b.h + 44}" rx="16" fill="#4a4f5c"/>
    <rect x="${bx - 14}" y="${by - 14}" width="${b.w + 28}" height="${b.h + 28}" rx="12" fill="#5d6373"/>
    <rect x="${bx + b.w - 4}" y="${Y(o.entranceY) - 60}" width="40" height="120" fill="#b9a27e"/>
    <rect x="${bx + b.w + 36}" y="${Y(o.entranceY) - 70}" width="60" height="140" rx="10" fill="#d8c8a6"/>
    <rect x="${bx + b.w + 96}" y="${Y(o.entranceY) - 22}" width="${X(p.x) - bx - b.w - 96}" height="44" fill="#e6d6b4"/>`;
  return `<svg class="outside" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <rect width="${w}" height="${h}" fill="#78b066"/>
    ${grass}
    ${shell}
    ${park}
    ${trees}
  </svg>`;
}
