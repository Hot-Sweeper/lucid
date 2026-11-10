// Robot species: which body colours, glow and logo a harness gets, plus its display name.
// Unknown harnesses get the generic robot with a chip instead of a logo.
import openaiLogo from "../assets/openai.svg";
import claudeLogo from "../assets/claude.svg";
import grokLogo from "../assets/harness/grok.svg";
import opencodeLogo from "../assets/harness/opencode.svg";
import geminiLogo from "../assets/harness/gemini.svg";
import antigravityLogo from "../assets/harness/antigravity.svg";
import museLogo from "../assets/harness/muse.svg";
import { harnessKind } from "../harness/themes";
import { logoUrl } from "../harness/logos";

export type BrandKind = "codex" | "claude" | "grok" | "gemini" | "antigravity" | "opencode" | "muse" | "generic";

// Which robot species and logo a harness gets. Unknown harnesses get the generic robot.
export function brandFor(provider: string | null | undefined): BrandKind {
  const p = (provider || "").toLowerCase();
  if (p.includes("claude")) return "claude";
  if (p.includes("codex") || p.includes("openai")) return "codex";
  if (p.includes("grok")) return "grok";
  if (p.includes("gemini")) return "gemini";
  if (p.includes("antigravity")) return "antigravity";
  if (p.includes("opencode") || p.includes("open-code")) return "opencode";
  if (p.includes("muse")) return "muse";
  return provider ? "generic" : "codex";
}

/** The harness's official logo as an image URL, coloured for a dark (default) or light background. */
export function logoFor(provider: string | null | undefined, bg: "dark" | "light" = "dark"): string | null {
  const k = provider ? harnessKind(provider) : "codex";
  return logoUrl(k, bg) ?? (brandFor(provider) === "claude" ? claudeLogo : null);
}

export function harnessName(provider: string | null | undefined): string {
  const b = brandFor(provider);
  if (b === "claude") return "Claude";
  if (b === "codex") return "Codex";
  if (b === "grok") return "Grok";
  if (b === "gemini") return "Gemini";
  if (b === "antigravity") return "Antigravity";
  if (b === "opencode") return "OpenCode";
  if (b === "muse") return "Muse Code";
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Agent";
}

/** A species' colours. `mode` says how its logo is drawn: tinted through a mask, as the image itself, or a chip. */
export type Palette = {
  shell: string; shade: string; deep: string; glow: string; visor: string; logo: string; rim: string;
  src: string | null; mode: "mask" | "image" | "chip";
};

export const PALETTES: Record<BrandKind, Palette> = {
  codex: { shell: "#eef0f8", shade: "#c9cee3", deep: "#98a0c2", glow: "#7cf2ff", visor: "#10142c", logo: "#98a0c2", rim: "#8fd8ff", src: openaiLogo, mode: "mask" },
  claude: { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ff9d6c", visor: "#1d1410", logo: "#d97757", rim: "#8fd8ff", src: claudeLogo, mode: "image" },
  grok: { shell: "#2e2f36", shade: "#1b1c21", deep: "#4b4d57", glow: "#ffffff", visor: "#060608", logo: "#e8e9ee", rim: "#cfd6ff", src: grokLogo, mode: "mask" },
  opencode: { shell: "#c9d3e6", shade: "#9eabc6", deep: "#6d7b9b", glow: "#4ff0a0", visor: "#121a2e", logo: "#6d7b9b", rim: "#8fd8ff", src: opencodeLogo, mode: "mask" },
  gemini: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#7b93d6", glow: "#4285f4", visor: "#121a2e", logo: "#4285f4", rim: "#8fd8ff", src: geminiLogo, mode: "mask" },
  antigravity: { shell: "#f0e6ff", shade: "#d4c2f0", deep: "#8a6bbf", glow: "#9b59b6", visor: "#1a1028", logo: "#9b59b6", rim: "#d8b4fe", src: antigravityLogo, mode: "mask" },
  muse: { shell: "#e8f0fe", shade: "#c2d3f5", deep: "#0467DF", glow: "#0467DF", visor: "#101828", logo: "#0467DF", rim: "#8fd8ff", src: museLogo, mode: "image" },
  generic: { shell: "#c9d3e6", shade: "#9eabc6", deep: "#6d7b9b", glow: "#4ff0a0", visor: "#121a2e", logo: "#6d7b9b", rim: "#8fd8ff", src: null, mode: "chip" },
};
