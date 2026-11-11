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

export const PACE_TEXT: Record<Pace, string> = { ahead: "ahead of pace", on: "on pace", under: "under pace" };

/** People read limits either way: how much is used (the bar fills up) or how much is left
 * (the bar counts down). Both views show the same reading. */
export type LimitView = "used" | "left";

/** What a limit row shows for a known reading: bar fill, pace mark position (both 0 to 100,
 * measured from the bar's start) and the percentage words. `used` is 0 to 100. */
export function limitReading(used: number, elapsed: number | null, view: LimitView) {
  const usedWhole = Math.round(used);
  if (view === "left") {
    const left = 100 - usedWhole;
    // Even pace leaves the unelapsed share of the window; the mark sits there on the countdown bar.
    return { fill: 100 - used, value: left, mark: elapsed === null ? null : 100 - elapsed * 100, text: `${left}% left`,
      pace: elapsed === null ? "" : `Even pace would leave ${Math.round(100 - elapsed * 100)}% by now` };
  }
  return { fill: used, value: usedWhole, mark: elapsed === null ? null : elapsed * 100, text: `${usedWhole}% used`,
    pace: elapsed === null ? "" : `Even pace would be ${Math.round(elapsed * 100)}% used by now` };
}
