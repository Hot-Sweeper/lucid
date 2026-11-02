import { gameSound } from "../office/sound";
import { setSvgAttribute } from "../perf/svg-write";

/** Model identity is derived from live model data, never persisted as an outfit choice. */
export function modelStickerKind(model: string | null | undefined) {
  const words = (model ?? "").toLowerCase().split(/[^a-z0-9]+/);
  return (["luna", "sol", "terra", "astra", "opus", "sonnet", "haiku"] as const).find(kind => words.includes(kind)) ?? null;
}

export function modelStickerSvg(model: string | null | undefined): string {
  const kind = modelStickerKind(model);
  if (!kind) return "";
  const ink = "#2f3a5c", gold = "#ffd27a";
  const icons = {
    luna: `<circle r="11" fill="${ink}"/><path d="M3 -8 A8.5 8.5 0 1 0 6 6 A7 7 0 0 1 3 -8Z" fill="${gold}"/><circle cx="6" cy="-5" r="1.2" fill="#fff"/>`,
    sol: `<g stroke="#d68a36" stroke-width="2" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45})" d="M0 -8V-11"/>`).join("")}</g><circle r="5.5" fill="${gold}" stroke="#d68a36" stroke-width="1.5"/>`,
    terra: `<path d="M-7 7 Q-12 -7 9 -9 Q12 10 -7 7Z" fill="#66b89b"/><path d="M-8 9L5 -5M-3 3L-4 -3M1 -1L6 0" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`,
    astra: `<circle r="11" fill="${ink}"/><path d="M-7 4L-2 -6L7 -2L3 7Z" fill="none" stroke="#b9acf0" stroke-width="1.2"/>${[[-7, 4], [-2, -6], [7, -2], [3, 7]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${gold}"/>`).join("")}`,
    opus: `<path d="M-7 -8Q-10 5 0 7Q10 5 7 -8M-7 -6H7M-4 -5V4M0 -5V6M4 -5V4M-5 9H5" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/><circle cx="-7" cy="-8" r="2" fill="#d68a36"/><circle cx="7" cy="-8" r="2" fill="#d68a36"/>`,
    sonnet: `<path d="M-7 7Q-8 -7 8 -9Q11 4 -3 5Z" fill="#b9acf0"/><path d="M-8 9L5 -5M-4 4H2M-1 0L-2 -5" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`,
    haiku: `${Array.from({ length: 5 }, (_, i) => `<ellipse cy="-5" rx="3.6" ry="5.5" transform="rotate(${i * 72})" fill="#eaa1b8"/>`).join("")}<circle r="3" fill="${gold}"/>`,
  };
  // Different paper cuts help distinguish families even before the symbol is readable.
  const cuts = {
    luna: `<circle r="13"/>`,
    sol: `<path d="M0 -14L4 -11L10 -11L11 -5L14 0L11 5L10 11L4 11L0 14L-4 11L-10 11L-11 5L-14 0L-11 -5L-10 -11L-4 -11Z"/>`,
    terra: `<path d="M-10 11Q-18 -13 11 -13Q18 14 -10 11Z"/>`,
    astra: `<path d="M0 -15L5 -8L13 -7L10 1L13 9L4 10L0 15L-5 9L-13 8L-10 0L-13 -9L-4 -10Z"/>`,
    opus: `<rect x="-12" y="-13" width="24" height="27" rx="6"/>`,
    sonnet: `<path d="M-12 13Q-15 -10 10 -14Q17 8 -6 11Z"/>`,
    haiku: Array.from({ length: 5 }, (_, i) => `<ellipse cy="-6" rx="7" ry="8" transform="rotate(${i * 72})"/>`).join(""),
  };
  return `<g fill="#fbf5e9" stroke="${ink}" stroke-opacity=".15" stroke-width="1">${cuts[kind]}</g>${icons[kind]}`;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Uses the actor's existing visibility-gated frame, with no timers or independent tweens. */
export class ModelSticker {
  private nodes: SVGElement[];
  private art: SVGElement[] = [];
  private kind: ReturnType<typeof modelStickerKind> | undefined;
  private applied = 0;
  private sounding = false;
  constructor(private root: Element) {
    this.nodes = [...root.querySelectorAll<SVGElement>(".model-sticker")];
  }
  set(model: string | null | undefined) {
    const kind = modelStickerKind(model);
    if (kind === this.kind) return;
    const changed = this.kind !== undefined;
    this.kind = kind;
    const svg = modelStickerSvg(model);
    this.art = [];
    for (const node of this.nodes) {
      node.innerHTML = svg ? `<title>${kind!.charAt(0).toUpperCase() + kind!.slice(1)}</title><g>${svg}</g>` : "";
      node.style.display = svg ? "" : "none";
      if (svg) this.art.push(node.lastElementChild as SVGElement);
    }
    this.applied = changed && kind && !document.hidden && !reduced() ? performance.now() : 0;
    this.sounding = !!this.applied;
  }
  step(now: number) {
    if (!this.applied) return;
    const p = Math.min(1, Math.max(0, (now - this.applied) / 460));
    // No catch-up sound when a hidden/offscreen actor returns later.
    if (this.sounding && p < .35) gameSound.at("clip", this.root, .35);
    this.sounding = false;
    const done = p === 1 || reduced();
    const curl = done ? 0 : Math.pow(1 - p, 3);
    for (const art of this.art) setSvgAttribute(art, "transform", `translate(0 ${(-5 * curl).toFixed(2)}) rotate(${(-22 * curl).toFixed(2)}) scale(1 ${(1 - .45 * curl).toFixed(3)})`);
    if (done) this.applied = 0;
  }
}
