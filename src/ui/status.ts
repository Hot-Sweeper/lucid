import { icon, type IconName } from "./icons";
import "./status.css";

// The one status vocabulary. Every surface that shows a thread's operational state (thread
// rows, the folded rail, the chat header) uses these words, icons and colour tokens.
export type Status = "working" | "needs" | "done" | "settled";

export const STATUS: Record<Status, { label: string; icon: IconName }> = {
  working: { label: "Working", icon: "statusWorking" },
  needs: { label: "Needs you", icon: "statusNeeds" },
  done: { label: "Done", icon: "statusDone" },
  settled: { label: "Settled", icon: "statusSettled" },
};

/** The status icon alone, coloured by its token through `data-status`. */
export const statusIcon = (s: Status, size = 14) => icon(STATUS[s].icon, size, { cls: "status-icon" });

/**
 * Icon and word as one inline element. `detail` (why it needs you, what it is working on) goes
 * in the tooltip; `suffix` is appended to the visible word, for example an elapsed time.
 */
export function statusBadge(s: Status, o: { detail?: string; suffix?: string; cls?: string; size?: number } = {}): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const label = STATUS[s].label;
  const title = o.detail && o.detail !== label ? `${label}: ${o.detail}` : label;
  return `<span class="ui-status${o.cls ? ` ${o.cls}` : ""}" data-status="${s}" title="${esc(title)}">${statusIcon(s, o.size)}<span>${esc(label)}${o.suffix ? ` ${esc(o.suffix)}` : ""}</span></span>`;
}
