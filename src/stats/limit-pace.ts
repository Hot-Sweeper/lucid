// Pace and reset timing for a subscription window, the way T3 Code's usage panel reads them.
// Even pace is where usage would be if it were spread evenly over the window: the elapsed
// share of the window. More than 5 points above it is ahead of pace, more than 5 below is under.

export type Pace = "ahead" | "on" | "under";

/** Elapsed share of the window (0 to 1), or null when T3 gave no reset time or duration. */
export function elapsedShare(resetsAt: string | null | undefined, windowMinutes: number | null | undefined, now = Date.now()): number | null {
  const end = resetsAt ? Date.parse(resetsAt) : NaN;
  if (!Number.isFinite(end) || !windowMinutes || windowMinutes <= 0) return null;
  const length = windowMinutes * 60000;
  return Math.max(0, Math.min(1, 1 - (end - now) / length));
}

export function pace(usedPercent: number, elapsed: number): Pace {
  const lead = usedPercent - elapsed * 100;
  return lead > 5 ? "ahead" : lead < -5 ? "under" : "on";
}

/** "2d 4h", "3h 12m", "8m". */
export function duration(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "resets in 2d 4h", or null without a reset time. */
export function resetCountdown(resetsAt: string | null | undefined, now = Date.now()): string | null {
  const end = resetsAt ? Date.parse(resetsAt) : NaN;
  if (!Number.isFinite(end)) return null;
  if (end <= now) return "resets now";
  if (end - now < 60000) return "resets in a moment";
  return `resets in ${duration(end - now)}`;
}

/** The bar chip's countdown: "4d 1h", "now", or null without a reset time. */
export function chipCountdown(resetsAt: string | null | undefined, now = Date.now()): string | null {
  const end = resetsAt ? Date.parse(resetsAt) : NaN;
  if (!Number.isFinite(end)) return null;
  if (end <= now) return "now";
  return end - now < 60000 ? "<1m" : duration(end - now);
}

/** The countdown in words for screen readers: "resets in 4 days 1 hour", or null. */
export function spokenCountdown(resetsAt: string | null | undefined, now = Date.now()): string | null {
  const end = resetsAt ? Date.parse(resetsAt) : NaN;
  if (!Number.isFinite(end)) return null;
  if (end <= now) return "resets now";
  if (end - now < 60000) return "resets in a moment";
  const s = (end - now) / 1000;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = d > 0 ? [unit(d, "day"), h ? unit(h, "hour") : ""] : h > 0 ? [unit(h, "hour"), m ? unit(m, "minute") : ""] : [unit(m, "minute")];
  return `resets in ${parts.filter(Boolean).join(" ")}`;
}

export const PACE_TEXT: Record<Pace, string> = { ahead: "ahead of pace", on: "on pace", under: "under pace" };

/** People read limits either way: how much is used (the bar fills up) or how much is left
 * (the bar counts down). Both views show the same reading. */
export type LimitView = "used" | "left";

/** What a limit card shows for a known reading: bar fill, pace mark position (both 0 to 100,
 * measured from the bar's start), the big number with its word, and the same as one phrase.
 * `used` is 0 to 100. */
export function limitReading(used: number, elapsed: number | null, view: LimitView) {
  const usedWhole = Math.round(used);
  if (view === "left") {
    const left = 100 - usedWhole;
    // Even pace leaves the unelapsed share of the window; the mark sits there on the countdown bar.
    return { fill: 100 - used, value: left, word: "left", mark: elapsed === null ? null : 100 - elapsed * 100, text: `${left}% left`,
      pace: elapsed === null ? "" : `Even pace would leave ${Math.round(100 - elapsed * 100)}% by now` };
  }
  return { fill: used, value: usedWhole, word: "used", mark: elapsed === null ? null : elapsed * 100, text: `${usedWhole}% used`,
    pace: elapsed === null ? "" : `Even pace would be ${Math.round(elapsed * 100)}% used by now` };
}

/** The trend arrow beside the number describes spending, so it never flips with the view:
 * rising when ahead of pace (burning fast), falling when under, level on pace. */
export const PACE_ARROW: Record<Pace, "trendUp" | "trendFlat" | "trendDown"> = { ahead: "trendUp", on: "trendFlat", under: "trendDown" };

export type LimitTone = "calm" | "warn" | "crit";

/** How a reading is going, independent of the view: critical from 90% used, warm when ahead of
 * pace or from 75% used, calm otherwise. Colour follows this, never the provider. */
export function limitTone(usedPercent: number, p: Pace | null): LimitTone {
  if (usedPercent >= 90) return "crit";
  return p === "ahead" || usedPercent >= 75 ? "warn" : "calm";
}
