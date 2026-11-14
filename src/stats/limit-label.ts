// Human names for subscription limit windows, shared by the Limits panel and the charging room.
// T3 sends finished labels ("Weekly", "Weekly · Fable", "Monthly spend"); local logs and older
// builds may send raw keys ("seven_day_overage_included"). A raw key is never shown as is.

type Labelled = { label?: string | null; labelIsComplete?: boolean; windowMinutes: number | null };

const ACRONYMS = new Set(["gpt", "api", "ai", "gpu", "cpu", "id"]);

/** "Weekly", "5 hour", "2 day", or "Limit" when the window length is unknown. */
export function windowName(minutes: number | null | undefined): string {
  if (minutes === 300) return "5 hour";
  if (minutes === 10080) return "Weekly";
  if (!minutes) return "Limit";
  if (minutes % 1440 === 0) return `${minutes / 1440} day`;
  if (minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

// A key rather than a label: underscores, or no capital letter anywhere ("seven day sonnet").
const isRaw = (s: string) => s.includes("_") || !/[A-Z]/.test(s);

/** Sentence case with known acronyms: "codex mini" becomes "Codex mini", "gpt 5" "GPT 5". */
function sentence(words: string[]): string {
  return words.map((w, i) => ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

// Leading window words of a raw key and the name they stand for.
const LEADS: [string[], string][] = [
  [["seven", "day"], "Weekly"], [["7", "day"], "Weekly"], [["7d"], "Weekly"], [["weekly"], "Weekly"], [["week"], "Weekly"],
  [["five", "hour"], "5 hour"], [["5", "hour"], "5 hour"], [["5h"], "5 hour"], [["session"], "5 hour"],
  [["monthly"], "Monthly"], [["month"], "Monthly"], [["daily"], "Daily"],
];

function humanize(raw: string, minutes: number | null | undefined): string {
  let words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s_:·-]+/).filter(Boolean);
  let window = "";
  for (const [lead, name] of LEADS) {
    if (lead.every((w, i) => words[i]?.toLowerCase() === w)) { window = name; words = words.slice(lead.length); break; }
  }
  // A trailing window word repeats what the lead or the duration already says.
  while (words.length && /^(weekly|limit|window)$/i.test(words[words.length - 1])) words.pop();
  const name = window || (minutes ? windowName(minutes) : "");
  const scope = words.length ? sentence(words) : "";
  return name && scope ? `${name} · ${scope}` : scope || name || "Limit";
}

/** The label a limit window is shown with: T3's own wording when it is a finished label, else the
 * window length and its scope ("Weekly · Opus"), never a raw key. */
export function limitLabel(l: Labelled): string {
  const label = (l.label || "").trim();
  const window = windowName(l.windowMinutes);
  if (!label) return window;
  if (isRaw(label)) return humanize(label, l.windowMinutes);
  if (l.labelIsComplete || label.toLowerCase() === window.toLowerCase()) return label;
  // A local reading names only its scope ("Fable"); the window length comes first, like T3.
  return window === "Limit" ? label : `${window} · ${label}`;
}
