// The agent harnesses T3 Code can drive, and how each one looks. Anything else (other T3
// drivers, unknown providers) is the generic console. Notes behind these choices live in RESEARCH.md.
import { logoSvg } from "./logos";

export type HarnessKind = "claude" | "codex" | "antigravity" | "opencode" | "cursor" | "generic";

/** A terminal TUI or a desktop GUI app. */
export type Flavor = "cli" | "app";

export interface Theme {
  kind: HarnessKind;
  /** Product name, e.g. "Claude Code". */
  name: string;
  /** Desktop app name when there is a GUI, e.g. "Claude". */
  app?: string;
  /** Command typed in a terminal when there is a CLI, e.g. "claude". */
  cmd?: string;
  /** Forms the harness exists in, the first is its main one. */
  forms: Flavor[];
  version?: string;
  /** Spinner frames for the working line; empty means a blinking dot. */
  spin: string[];
  spinMs: number;
  /** Words shown while working (Claude's whimsical verbs...). */
  verbs: string[];
  /** Placeholder text in the input when idle. */
  placeholder: string;
}

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const THEMES: Record<HarnessKind, Theme> = {
  claude: {
    kind: "claude", name: "Claude Code", app: "Claude", cmd: "claude", forms: ["cli", "app"], version: "v2.1.316",
    // U+2733 is emoji-capable. Request text presentation on both visits so the
    // spinner stays clay-colored instead of flashing a green emoji tile.
    spin: ["·", "✢", "✳\uFE0E", "✶", "✻", "✽", "✽", "✻", "✶", "✳\uFE0E", "✢", "·"], spinMs: 110,
    verbs: ["Working", "Pondering", "Noodling", "Brewing", "Cogitating", "Percolating", "Combobulating", "Moseying", "Schlepping"],
    placeholder: "Try \"fix the failing test\"",
  },
  codex: {
    kind: "codex", name: "Codex", app: "Codex", cmd: "codex", forms: ["cli", "app"], version: "v0.166.0",
    spin: [], spinMs: 0, verbs: ["Working"], placeholder: "Ask Codex to do anything",
  },
  antigravity: {
    kind: "antigravity", name: "Antigravity", app: "Antigravity", cmd: "agy", forms: ["app", "cli"], version: "2.0",
    spin: BRAILLE, spinMs: 80, verbs: ["Working"], placeholder: "Ask anything, @ to mention, / for workflows",
  },
  opencode: {
    kind: "opencode", name: "OpenCode", app: "OpenCode", cmd: "opencode", forms: ["cli", "app"], version: "1.4.2",
    spin: BRAILLE, spinMs: 80, verbs: ["Working"], placeholder: "Ask anything...",
  },
  cursor: {
    kind: "cursor", name: "Cursor", app: "Cursor", cmd: "agent", forms: ["app", "cli"], version: "2026.10.22",
    spin: ["⠀⠞", "⠠⠜", "⠰⠰", "⠘⠤", "⠘⠆", "⠘⠣", "⠰⠳", "⠠⠛"], spinMs: 250, verbs: ["Generating"],
    placeholder: "Plan, @ for context, / for commands",
  },
  generic: {
    kind: "generic", name: "Agent", app: "Agent", cmd: "agent", forms: ["cli", "app"],
    spin: [], spinMs: 0, verbs: ["Working"], placeholder: "Send a message",
  },
};

/**
 * Map provider instance ids, driver names, tool names or labels onto a harness.
 * Liberal on purpose: "claudeAgent", "claude-code", "anthropic" are all Claude Code.
 * Pass several hints; the first that matches a known harness wins.
 */
export function harnessKind(...hints: (string | null | undefined)[]): HarnessKind {
  for (const h of hints) {
    const k = matchKind(h);
    if (k !== "generic") return k;
  }
  return "generic";
}

function matchKind(hint: string | null | undefined): HarnessKind {
  const p = String(hint || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (!p) return "generic";
  if (/claude|anthropic/.test(p)) return "claude";
  if (/codex|openai|chatgpt/.test(p)) return "codex";
  if (/antigravity|^agy\b|\bagy\b|jetski/.test(p)) return "antigravity";
  if (/opencode|open-code|\bsst\b/.test(p)) return "opencode";
  if (/cursor/.test(p)) return "cursor";
  if (/\bgpt-|^o\d/.test(p)) return "codex";
  return "generic";
}

/** The robot's habit (terminal or desktop app) when the harness has that form, otherwise the form it does have. */
export function resolveFlavor(kind: HarnessKind, pref?: Flavor | null): Flavor {
  const forms = THEMES[kind].forms;
  return pref && forms.includes(pref) ? pref : forms[0];
}

/** "claude-opus-5-5" becomes "Opus 5.5", "gpt-5.6-sol" becomes "GPT-5.6 Sol". */
export function prettyModel(id?: string | null): string {
  if (!id) return "";
  let m = String(id).trim().replace(/^[\w.-]+\//, "").replace(/-\d{8}$/, "").replace(/\[1m\]$/i, "");
  const claude = m.match(/^claude-(?:(\d+)-(\d+)-)?([a-z]+)(?:-(\d+)(?:-(\d+))?)?$/i);
  if (claude) {
    const name = claude[3][0].toUpperCase() + claude[3].slice(1);
    const v = claude[4] ? [claude[4], claude[5]].filter(Boolean).join(".") : [claude[1], claude[2]].filter(Boolean).join(".");
    return v ? `${name} ${v}` : name;
  }
  if (/^(opus|sonnet|haiku|fable)$/i.test(m)) return m[0].toUpperCase() + m.slice(1).toLowerCase();
  const gpt = m.match(/^gpt-([\d.]+)(?:-(.+))?$/i);
  if (gpt) return `GPT-${gpt[1]}${gpt[2] ? " " + titleWords(gpt[2]) : ""}`;
  m = titleWords(m);
  return m;
}

function titleWords(s: string) {
  return s.split(/[-_\s]+/).filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.length <= 2 && /^[a-z]+$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ").replace(/(\d) (\d)/g, "$1.$2");
}

/** Normalised effort: low, medium, high, xhigh, max, ultra, minimal or off. */
export function normEffort(e?: string | null): string {
  const v = String(e || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (!v) return "";
  if (v === "none" || v === "off" || v === "disabled") return "off";
  if (v === "extrahigh" || v === "xhigh") return "xhigh";
  if (v === "med") return "medium";
  if (v === "ultrathink") return "max";
  return v;
}

/** "xhigh" reads "Extra high" in GUIs and stays "xhigh" in terminals. */
export function effortWord(e: string | undefined, gui: boolean): string {
  const v = normEffort(e);
  if (!v) return "";
  if (!gui) return v;
  if (v === "xhigh") return "Extra high";
  if (v === "off") return "Off";
  return v[0].toUpperCase() + v.slice(1);
}

/** Model vendor, used where a harness shows it next to the model ("(anthropic) claude-opus-5-5"). */
export function modelVendor(model?: string | null): string {
  const m = String(model || "").toLowerCase();
  if (!m) return "";
  if (m.includes("/")) return m.split("/")[0];
  if (/claude|opus|sonnet|haiku|fable/.test(m)) return "anthropic";
  if (/^gpt|^o\d|codex/.test(m)) return "openai";
  if (/gemini/.test(m)) return "google";
  if (/grok/.test(m)) return "xai";
  if (/kimi/.test(m)) return "moonshot";
  if (/qwen/.test(m)) return "qwen";
  return "";
}

// --- marks ---------------------------------------------------------------------------------
// Every driven harness has its official logo (logos.ts). Only the generic console uses this
// drawn robot face.
const GENERIC_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="15" rx="4" fill="#ffc94d"/><rect x="11" y="1.8" width="2" height="4" rx="1" fill="#ffc94d"/><circle cx="8.7" cy="12.2" r="1.7" fill="#4a3304"/><circle cx="15.3" cy="12.2" r="1.7" fill="#4a3304"/><rect x="9.4" y="15.4" width="5.2" height="1.7" rx=".85" fill="#4a3304"/></svg>`;

/** The harness mark as an inline SVG element, so one-colour logos take the theme's text colour. */
export function markEl(kind: HarnessKind, cls = "hx-mark"): HTMLElement {
  const s = document.createElement("span");
  s.className = cls;
  s.dataset.k = kind;
  s.innerHTML = logoSvg(kind) ?? GENERIC_MARK;
  return s;
}
