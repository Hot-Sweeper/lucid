import claudeLogo from "../assets/claude.svg";
import { harnessKind } from "../harness/themes";
import { logoUrl } from "../harness/logos";

export type BrandKind = "codex" | "claude" | "grok" | "generic";

// Which robot species and logo a harness gets. Unknown harnesses get the generic robot.
export function brandFor(provider: string | null | undefined): BrandKind {
  const p = (provider || "").toLowerCase();
  if (p.includes("claude")) return "claude";
  if (p.includes("codex") || p.includes("openai")) return "codex";
  if (p.includes("grok")) return "grok";
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
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Agent";
}
