// Which agent harnesses the robot can drive, and how each one looks.
// Notes behind these choices live in RESEARCH.md. Marks are simplified shapes drawn here,
// except Claude and Codex, which reuse the logo files already in src/assets.
import { logoSvg } from "./logos";
import claudeLogo from "../assets/claude.svg";
import openaiLogo from "../assets/openai.svg";

export type HarnessKind =
  | "claude" | "codex" | "gemini" | "antigravity" | "opencode" | "pi" | "hermes"
  | "openclaw" | "cursor" | "grok" | "aider" | "copilot" | "amp" | "generic";

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
  /** Words shown while working (Claude's whimsical verbs, Gemini's phrases...). */
  verbs: string[];
  /** Placeholder text in the input when idle. */
  placeholder: string;
}

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const THEMES: Record<HarnessKind, Theme> = {
  claude: {
    kind: "claude", name: "Claude Code", app: "Claude", cmd: "claude", forms: ["cli", "app"], version: "v2.1.316",
    spin: ["·", "✢", "✳", "✶", "✻", "✽", "✽", "✻", "✶", "✳", "✢", "·"], spinMs: 110,
    verbs: ["Working", "Pondering", "Noodling", "Brewing", "Cogitating", "Percolating", "Combobulating", "Moseying", "Schlepping"],
    placeholder: "Try \"fix the failing test\"",
  },
  codex: {
    kind: "codex", name: "Codex", app: "Codex", cmd: "codex", forms: ["cli", "app"], version: "v0.166.0",
    spin: [], spinMs: 0, verbs: ["Working"], placeholder: "Ask Codex to do anything",
  },
  gemini: {
    kind: "gemini", name: "Gemini CLI", cmd: "gemini", forms: ["cli"], version: "v0.66.0",
    spin: BRAILLE, spinMs: 80,
    verbs: ["Reticulating splines", "Warming up the AI hamsters", "I'm Feeling Lucky", "Consulting the digital spirits", "Polishing the algorithms"],
    placeholder: "Type your message or @path/to/file",
  },
  antigravity: {
    kind: "antigravity", name: "Antigravity", app: "Antigravity", cmd: "agy", forms: ["app", "cli"], version: "2.0",
    spin: BRAILLE, spinMs: 80, verbs: ["Working"], placeholder: "Ask anything, @ to mention, / for workflows",
  },
  opencode: {
    kind: "opencode", name: "OpenCode", app: "OpenCode", cmd: "opencode", forms: ["cli", "app"], version: "1.4.2",
    spin: BRAILLE, spinMs: 80, verbs: ["Working"], placeholder: "Ask anything...",
  },
  pi: {
    kind: "pi", name: "pi", cmd: "pi", forms: ["cli"], version: "v0.71.0",
    spin: BRAILLE, spinMs: 80, verbs: ["Working..."], placeholder: "",
  },
  hermes: {
    kind: "hermes", name: "Hermes Agent", app: "Hermes", cmd: "hermes", forms: ["cli", "app"], version: "v0.9.0",
    spin: ["◜", "◠", "◝", "◞", "◡", "◟"], spinMs: 120,
    verbs: ["(｡•́︿•̀｡) pondering...", "(⊙_⊙) contemplating...", "(¬‿¬) deliberating...", "( •_•)> scheming..."],
    placeholder: "",
  },
  openclaw: {
    kind: "openclaw", name: "OpenClaw", app: "OpenClaw", cmd: "openclaw", forms: ["cli", "app"], version: "2026.10",
    spin: [], spinMs: 0, verbs: ["noodling…", "flibbertigibbeting…", "kerfuffling…", "conjuring…", "bamboozling…"],
    placeholder: "Message main",
  },
  cursor: {
    kind: "cursor", name: "Cursor", app: "Cursor", cmd: "agent", forms: ["app", "cli"], version: "2026.10.22",
    spin: ["⠀⠞", "⠠⠜", "⠰⠰", "⠘⠤", "⠘⠆", "⠘⠣", "⠰⠳", "⠠⠛"], spinMs: 250, verbs: ["Generating"],
    placeholder: "Plan, @ for context, / for commands",
  },
  grok: {
    kind: "grok", name: "Grok Build", cmd: "grok", forms: ["cli"], version: "0.4",
    spin: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"], spinMs: 80, verbs: ["Thinking…"], placeholder: "Type a message...",
  },
  aider: {
    kind: "aider", name: "Aider", cmd: "aider", forms: ["cli"], version: "v0.86.2",
    spin: ["█░░░░", "░█░░░", "░░█░░", "░░░█░", "░░░░█", "░░░█░", "░░█░░", "░█░░░"], spinMs: 110, verbs: ["Waiting for"],
    placeholder: "",
  },
  copilot: {
    kind: "copilot", name: "GitHub Copilot CLI", cmd: "copilot", forms: ["cli"], version: "v1.0.105",
    spin: ["∙", "◉", "◎", "◉"], spinMs: 180, verbs: ["Thinking"], placeholder: "Enter @ to mention files or / for commands",
  },
  amp: {
    kind: "amp", name: "Amp", app: "Amp", cmd: "amp", forms: ["cli", "app"], version: "",
    spin: BRAILLE, spinMs: 90, verbs: ["Working"], placeholder: "Plan, build, ship",
  },
  generic: {
    kind: "generic", name: "Agent", app: "Agent", cmd: "agent", forms: ["cli", "app"],
    spin: [], spinMs: 0, verbs: ["Working"], placeholder: "Send a message",
  },
};

const word = (p: string, w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(p);

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
  if (/openclaw|clawdbot|moltbot/.test(p)) return "openclaw";
  if (/claude|anthropic/.test(p)) return "claude";
  if (/codex|openai|chatgpt/.test(p)) return "codex";
  if (/antigravity|^agy\b|\bagy\b|jetski/.test(p)) return "antigravity";
  if (/gemini|google/.test(p)) return "gemini";
  if (/opencode|open-code|\bsst\b/.test(p)) return "opencode";
  if (/hermes|nous/.test(p)) return "hermes";
  if (/cursor/.test(p)) return "cursor";
  if (/grok|\bxai\b|x\.ai/.test(p)) return "grok";
  if (/aider/.test(p)) return "aider";
  if (/copilot|github/.test(p)) return "copilot";
  if (word(p, "amp") || /ampcode|sourcegraph/.test(p)) return "amp";
  if (word(p, "pi") || /^pi[-_ ]|pi-?mono|pi-?agent|pi-?coding/.test(p)) return "pi";
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
// Simplified marks, drawn here, sized by CSS. Ids inside gradients are per harness and identical
// wherever they repeat, so duplicate definitions in one document are harmless.
const SVG = (body: string, vb = "0 0 24 24") => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

const MARKS: Partial<Record<HarnessKind, string>> = {
  gemini: SVG(`<defs><linearGradient id="hxg-gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4796E4"/><stop offset=".55" stop-color="#847ACE"/><stop offset="1" stop-color="#C3677F"/></linearGradient></defs><path fill="url(#hxg-gem)" d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5Z"/>`),
  antigravity: SVG(`<defs><linearGradient id="hxg-agy" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3186FF"/><stop offset=".35" stop-color="#00B95C"/><stop offset=".68" stop-color="#FFE432"/><stop offset="1" stop-color="#FC413D"/></linearGradient></defs><path fill="url(#hxg-agy)" d="M12 2C7.6 2 7.8 14.6 2.2 20.2c-1.3 1.4.3 2.2 1.6 1.3C8.6 18.2 8.3 13 12 13s3.4 5.2 8.2 8.5c1.3.9 2.9.1 1.6-1.3C16.2 14.6 16.4 2 12 2Z"/>`),
  opencode: SVG(`<rect x="5" y="2.5" width="14" height="19" rx="1" fill="#f1ecec"/><rect x="8.6" y="6.1" width="6.8" height="11.8" fill="#131010"/><rect x="8.6" y="12" width="6.8" height="5.9" fill="#5a5858"/>`),
  pi: SVG(`<rect x="3" y="4.5" width="18" height="4.4" rx=".6" fill="#e48a7a"/><rect x="6" y="8.4" width="4.2" height="11" rx=".6" fill="#4f8eb3"/><rect x="14" y="8.4" width="4.2" height="7.6" rx=".6" fill="#eab65d"/>`),
  hermes: SVG(`<rect x="11.1" y="3.8" width="1.8" height="18" rx=".9" fill="#ffd700"/><circle cx="12" cy="3.4" r="1.9" fill="#ffd700"/><path d="M11 6.2C8.6 4.4 5 4.6 2.6 6.6c2.2.1 4.4.9 6 2.4.7.6 1.6.3 2.4-.2Zm2 0c2.4-1.8 6-1.6 8.4.4-2.2.1-4.4.9-6 2.4-.7.6-1.6.3-2.4-.2Z" fill="#cd7f32"/><path d="M8.4 10.6c0 2 7.2 1.6 7.2 3.8s-7.2 1.8-7.2 4 3.6 1.9 3.6 1.9" fill="none" stroke="#ffbf00" stroke-width="1.5" stroke-linecap="round"/><path d="M15.6 10.6c0 2-7.2 1.6-7.2 3.8s7.2 1.8 7.2 4-3.6 1.9-3.6 1.9" fill="none" stroke="#b8860b" stroke-width="1.5" stroke-linecap="round"/>`),
  openclaw: SVG(`<defs><linearGradient id="hxg-claw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4d"/><stop offset="1" stop-color="#b42121"/></linearGradient></defs><ellipse cx="12" cy="14.2" rx="5.6" ry="7" fill="url(#hxg-claw)"/><path d="M5.6 9.6C2.4 9.2 1.4 5.6 3.4 3.4c.4 1.8 1.6 2.6 3 2.4-.2-1.4.4-2.6 1.6-3 .9 2.6.1 5.6-2.4 6.8Zm12.8 0c3.2-.4 4.2-4 2.2-6.2-.4 1.8-1.6 2.6-3 2.4.2-1.4-.4-2.6-1.6-3-.9 2.6-.1 5.6 2.4 6.8Z" fill="#ff5c5c"/><circle cx="9.8" cy="11.6" r="1.2" fill="#1a0b0b"/><circle cx="14.2" cy="11.6" r="1.2" fill="#1a0b0b"/>`),
  cursor: SVG(`<path d="M12 1.8 21 7v10l-9 5.2L3 17V7Z" fill="#edecec"/><path d="M12 1.8 21 7l-9 5.2Z" fill="#9b9a97"/><path d="M12 12.2 21 7v10Z" fill="#c8c7c4"/>`),
  grok: SVG(`<circle cx="12" cy="12" r="8.4" fill="none" stroke="#e1e1e1" stroke-width="2.2"/><path d="M5.2 19.6 19.4 4.4" stroke="#e1e1e1" stroke-width="2.4" stroke-linecap="round"/>`),
  aider: SVG(`<rect x="1.5" y="3.5" width="21" height="17" rx="3" fill="#0f1a0f"/><text x="12" y="16.6" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" font-weight="700" fill="#14b014">ai</text>`),
  copilot: SVG(`<path d="M12 3.5c-5 0-8.6 2.4-8.6 6.6v4.8c0 3.6 4 6.1 8.6 6.1s8.6-2.5 8.6-6.1v-4.8C20.6 5.9 17 3.5 12 3.5Z" fill="#d9dbe8"/><rect x="5.2" y="8.6" width="5.8" height="4.6" rx="2.2" fill="#24292f"/><rect x="13" y="8.6" width="5.8" height="4.6" rx="2.2" fill="#24292f"/><rect x="9.6" y="15.6" width="1.6" height="2.4" rx=".8" fill="#24292f"/><rect x="12.8" y="15.6" width="1.6" height="2.4" rx=".8" fill="#24292f"/>`),
  amp: SVG(`<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#0c2a2c"/><path d="M7 17.5 10.6 6.5h2.1L9.1 17.5Zm4.1 0 3.6-11h2.1l-3.6 11Zm4.1 0 2.2-6.8h2.1l-2.2 6.8Z" fill="#dfdfc1"/>`),
  generic: SVG(`<rect x="2.5" y="5" width="19" height="15" rx="4" fill="#ffc94d"/><rect x="11" y="1.8" width="2" height="4" rx="1" fill="#ffc94d"/><circle cx="8.7" cy="12.2" r="1.7" fill="#4a3304"/><circle cx="15.3" cy="12.2" r="1.7" fill="#4a3304"/><rect x="9.4" y="15.4" width="5.2" height="1.7" rx=".85" fill="#4a3304"/>`),
};

/** The harness mark as an element (an <img> for the bundled logos, inline SVG for the drawn ones). */
export function markEl(kind: HarnessKind, cls = "hx-mark"): HTMLElement {
  // official logos inline, so one-colour ones take the theme's text colour
  const official = logoSvg(kind);
  if (official) {
    const s = document.createElement("span");
    s.className = cls;
    s.dataset.k = kind;
    s.innerHTML = official;
    return s;
  }
  if (kind === "claude" || kind === "codex") {
    const img = document.createElement("img");
    img.className = cls;
    img.src = kind === "claude" ? claudeLogo : openaiLogo;
    img.alt = "";
    img.dataset.k = kind;
    return img;
  }
  const s = document.createElement("span");
  s.className = cls;
  s.dataset.k = kind;
  s.innerHTML = MARKS[kind] ?? MARKS.generic!;
  return s;
}
