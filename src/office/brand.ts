import openaiLogo from "../assets/openai.svg";
import claudeLogo from "../assets/claude.svg";

export type BrandKind = "codex" | "claude" | "grok" | "generic";

// Which robot species and logo a harness gets. Unknown harnesses get the generic robot.
export function brandFor(provider: string | null | undefined): BrandKind {
  const p = (provider || "").toLowerCase();
  if (p.includes("claude")) return "claude";
  if (p.includes("codex") || p.includes("openai")) return "codex";
  if (p.includes("grok")) return "grok";
  return provider ? "generic" : "codex";
}

export function logoFor(provider: string | null | undefined): string | null {
  const b = brandFor(provider);
  return b === "claude" ? claudeLogo : b === "codex" ? openaiLogo : null;
}

export function harnessName(provider: string | null | undefined): string {
  const b = brandFor(provider);
  if (b === "claude") return "Claude";
  if (b === "codex") return "Codex";
  if (b === "grok") return "Grok";
  return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Agent";
}
