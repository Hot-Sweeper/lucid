// A project's own colors and mark, for its managers: the project icon (or a monogram tile
// like the thread list's when there is none) and an accent color sampled from that icon.
// Sampling is asynchronous and cached; callers get a stable fallback until it is ready.

const MONO: [string, string][] = [["#5a2340", "#ff9fc6"], ["#233a5a", "#8fc4ff"], ["#2d4a32", "#8fe0a0"], ["#4a3a1d", "#ffd27a"], ["#3d2a5a", "#c7a6ff"], ["#5a3323", "#ffb08a"]];
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function monogramFor(title: string) {
  const letters = (title.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).map(w => w[0]).join("") || title || "P").slice(0, 2).toUpperCase();
  const [bg, fg] = MONO[hash(title) % MONO.length];
  return { letters, bg, fg, url: "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/><text x="16" y="21.5" text-anchor="middle" font-family="Lexend, sans-serif" font-weight="700" font-size="${letters.length > 1 ? 13 : 16}" fill="${fg}">${esc(letters)}</text></svg>`) };
}

const accents = new Map<string, string | null>();
const pending = new Set<string>();
let onReady: () => void = () => {};
/** Called once when sampled accents become available, so robots can be redrawn. */
export function whenProjectColors(f: () => void) { onReady = f; }

function sample(url: string) {
  if (pending.has(url) || accents.has(url) || typeof Image === "undefined") return;
  pending.add(url);
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    pending.delete(url);
    try {
      const c = document.createElement("canvas"); c.width = c.height = 24;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        const max = Math.max(R, G, B), min = Math.min(R, G, B);
        // The logo's own color: opaque, saturated pixels, not white, black or transparency.
        if (A < 160 || max < 50 || max - min < 40) continue;
        r += R; gg += G; b += B; n++;
      }
      accents.set(url, n >= 6 ? "#" + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join("") : null);
    } catch { accents.set(url, null); }   // unreadable image: keep the fallback
    onReady();
  };
  img.onerror = () => { pending.delete(url); accents.set(url, null); };
  img.src = url;
}

/** Crest image and accent color for a project. */
export function projectBrand(p: { title: string; icon?: string | null }) {
  const mono = monogramFor(p.title || "Project");
  if (p.icon) sample(p.icon);
  return { crest: p.icon || mono.url, accent: (p.icon && accents.get(p.icon)) || mono.fg };
}
