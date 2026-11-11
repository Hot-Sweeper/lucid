// Stand-alone page for the Limits cards (dev/limits.html) with every state on fixed readings:
// credits, stale and unknown windows, high usage, both views and the Night blue and OLED themes.
// Using a reset here only answers from a local fake; nothing reaches T3.
import "@fontsource-variable/lexend";
import "../styles.css";
import "../themes/registry";
import "../ui/controls.css";
import "../office/limits-section.css";
import { mountLimits } from "./limits";
import type { Usage } from "./stats";
import type { LimitView } from "./limit-pace";

const now = Date.now(), at = (ms: number) => new Date(now + ms).toISOString();
const day = 86400000, hour = 3600000;
const win = (id: string, label: string, usedPercent: number | null, extra = {}) => ({ id, label, labelIsComplete: true, usedPercent, windowMinutes: 10080, resetsAt: at(4 * day + hour + 60000), ...extra });
const usage = {
  updatedAt: at(0), errors: [], windows: {} as Usage["windows"],
  limitSource: { source: "T3 Code", status: "current", detail: "" },
  limits: {
    "t3:codex": { harness: "codex", instanceId: "codex", name: "Codex", source: "T3 Code", observedAt: at(0), primary: null, secondary: null,
      resetCredits: { availableCount: 1, nextExpiresAt: at(20 * day) },
      windows: [win("codex:5h", "5 hour", 93, { windowMinutes: 300, resetsAt: at(2 * hour) }), win("codex:weekly", "Weekly", 74)] },
    "t3:claudeAgent": { harness: "claude", instanceId: "claudeAgent", name: "Claude", source: "T3 Code", observedAt: at(0), primary: null, secondary: null,
      resetCredits: { availableCount: 2, nextExpiresAt: null },
      windows: [win("claude:weekly", "Weekly", 29, { resetsAt: at(4 * day + 8 * hour) }), win("claude:fable", "Weekly · Fable", 0, { resetsAt: at(4 * day + 8 * hour) }),
        win("claude:old", "Daily", 40, { windowMinutes: 1440, stale: true, staleReason: "T3 reading is out of date" }), win("claude:none", "Monthly", null, { windowMinutes: 43200 })] },
  },
} as unknown as Usage;

let view: LimitView = new URLSearchParams(location.search).get("view") === "used" ? "used" : "left";
const fake = { useResetCredit: async () => ({ outcome: "reset", message: "Demo only: no reset was used." }), canManageProviders: async () => false };
const panes = ["narrow", "wide"].map((id) => {
  const host = document.getElementById(id)!;
  const box = document.createElement("div"), note = document.createElement("p");
  box.className = "lim-groups"; note.className = "lim-source";
  host.classList.add("sidebar-limits"); host.append(box, note);
  return mountLimits(box, note, fake, { destroyed: () => false, refresh() {} });
});
const paint = () => panes.forEach((p) => p.render(usage, view));
const bar = document.getElementById("bar")!;
const button = (label: string, fn: () => void) => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = label; b.onclick = fn; bar.append(b); };
button("Used", () => { view = "used"; paint(); });
button("Left", () => { view = "left"; paint(); });
for (const theme of ["night", "oled"]) button(theme === "night" ? "Night blue" : "OLED", () => { document.documentElement.dataset.theme = theme; });
paint();
