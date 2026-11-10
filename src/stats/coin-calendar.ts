// The coin ledger's numbers: coins earned per day (one coin per dollar of API-priced robot work),
// streaks, the user's own averages and personal records. Pure functions over the calendar that
// electron/coin-calendar.cjs keeps, plus the daily totals the wallet saved before it existed.
// Nothing here estimates: a day without a reading is a day without coins.

export type CalendarThread = { title: string; projectId: string | null; project: string | null };
export type CalendarDoc = { rev: number; days: Record<string, Record<string, number>>; threads: Record<string, CalendarThread> };
/** `threads` is null for an earlier daily total that has no per-thread breakdown. */
export type DayTotal = { day: string; coins: number; threads: Record<string, number> | null };
export type Days = Map<string, DayTotal>;
export type RecordKind = "day" | "week" | "streak";
export type PersonalRecord = { kind: RecordKind; current: number; best: number; usual: number | null; eligible: boolean; beaten: boolean; key: string };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Local noon, so adding days never trips over a daylight saving change. */
export const dayDate = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (key: string, n: number) => { const d = dayDate(key); d.setDate(d.getDate() + n); return dayKey(d); };
/** Weeks start on Monday. */
export const weekday = (key: string) => (dayDate(key).getDay() + 6) % 7;
export const weekStart = (key: string) => addDays(key, -weekday(key));

/** Thread readings win; the wallet's older whole-day totals fill days the calendar never saw. */
export function mergeDays(doc: Pick<CalendarDoc, "days"> | null, legacy: Record<string, unknown> = {}, perDollar = 1): Days {
  const days: Days = new Map();
  for (const [day, threads] of Object.entries(doc?.days ?? {})) {
    if (!DAY_KEY.test(day)) continue;
    const coins: Record<string, number> = {};
    let sum = 0;
    for (const [id, usd] of Object.entries(threads)) if (usd > 0) { coins[id] = round(usd * perDollar); sum += usd * perDollar; }
    if (sum > 0) days.set(day, { day, coins: round(sum), threads: coins });
  }
  for (const [day, usd] of Object.entries(legacy)) {
    if (!DAY_KEY.test(day) || typeof usd !== "number" || !(usd > 0) || days.has(day)) continue;
    days.set(day, { day, coins: round(usd * perDollar), threads: null });
  }
  return days;
}

const coinsOn = (days: Days, key: string) => days.get(key)?.coins ?? 0;
const sumRange = (days: Days, from: string, to: string) => { let s = 0; for (let k = from; k <= to; k = addDays(k, 1)) s += coinsOn(days, k); return round(s); };

export type Summary = {
  today: string; first: string | null; total: number; activeDays: number;
  todayCoins: number; bestDay: { day: string; coins: number } | null;
  /** Mean of the active days before today: the user's own normal day. */
  usualDay: number | null;
  streak: number; longestStreak: number;
  week: number; bestWeek: { start: string; coins: number } | null;
  /** What earlier weeks usually held by this weekday. Null until one full week is known. */
  usualByNow: number | null;
  records: PersonalRecord[];
};

export function summarize(days: Days, today: string): Summary {
  const keys = [...days.keys()].filter(k => k <= today).sort();
  const first = keys[0] ?? null;
  let total = 0, bestDay: Summary["bestDay"] = null, bestBefore = 0, beforeCount = 0, beforeSum = 0;
  for (const k of keys) {
    const c = coinsOn(days, k);
    total += c;
    if (!bestDay || c > bestDay.coins) bestDay = { day: k, coins: c };
    if (k < today) { beforeCount++; beforeSum += c; bestBefore = Math.max(bestBefore, c); }
  }
  // Streak: consecutive days with coins, ending today, or yesterday while today is still open.
  const todayCoins = coinsOn(days, today);
  let streak = 0;
  for (let k = todayCoins > 0 ? today : addDays(today, -1); coinsOn(days, k) > 0; k = addDays(k, -1)) streak++;
  const streakStart = addDays(today, todayCoins > 0 ? 1 - streak : -streak);
  let longestBefore = 0, run = 0;
  if (first) for (let k = first; k < streakStart; k = addDays(k, 1)) { run = coinsOn(days, k) > 0 ? run + 1 : 0; longestBefore = Math.max(longestBefore, run); }
  // Weeks: this week so far against earlier weeks, both full and up to the same weekday.
  const thisWeek = weekStart(today), wd = weekday(today);
  const week = sumRange(days, thisWeek, today);
  let bestWeek: Summary["bestWeek"] = null, sameDaySum = 0, fullWeeks = 0, weeksWithCoins = 0;
  if (first) {
    const firstWeek = weekStart(first);
    for (let w = firstWeek; w < thisWeek; w = addDays(w, 7)) {
      const coins = sumRange(days, w, addDays(w, 6));
      if (coins > 0) weeksWithCoins++;
      if (!bestWeek || coins > bestWeek.coins) bestWeek = { start: w, coins };
      // The week tracking began in is partial, so it does not shape the usual pace.
      if (w > firstWeek || first === firstWeek) { fullWeeks++; sameDaySum += sumRange(days, w, addDays(w, wd)); }
    }
  }
  const usualDay = beforeCount ? round(beforeSum / beforeCount) : null;
  const usualByNow = fullWeeks ? round(sameDaySum / fullWeeks) : null;
  const records: PersonalRecord[] = [
    // A record needs some history to mean something: a few working days, two weeks, a two-day streak.
    { kind: "day", current: todayCoins, best: round(bestBefore), usual: usualDay, eligible: beforeCount >= 3 && bestBefore > 0, beaten: todayCoins > bestBefore, key: today },
    { kind: "week", current: week, best: bestWeek?.coins ?? 0, usual: usualByNow, eligible: weeksWithCoins >= 2, beaten: week > (bestWeek?.coins ?? 0), key: thisWeek },
    { kind: "streak", current: streak, best: longestBefore, usual: null, eligible: longestBefore >= 2, beaten: todayCoins > 0 && streak > longestBefore, key: `${streakStart}:${streak}` },
  ];
  for (const r of records) r.beaten = r.eligible && r.beaten;
  return { today, first, total: round(total), activeDays: keys.length, todayCoins, bestDay, usualDay, streak, longestStreak: Math.max(longestBefore, streak), week, bestWeek, usualByNow, records };
}

/** Heat levels 1 to 4 rank a day among the user's own days with coins (quartiles), so light and heavy use both fill the scale. */
export function heatScale(days: Days): (coins: number) => 0 | 1 | 2 | 3 | 4 {
  const values = [...days.values()].map(d => d.coins).filter(c => c > 0).sort((a, b) => a - b);
  return coins => {
    if (coins <= 0 || !values.length) return 0;
    let lo = 0, hi = values.length; // days with no more coins than this one
    while (lo < hi) { const mid = (lo + hi) >> 1; if (values[mid] <= coins) lo = mid + 1; else hi = mid; }
    return Math.min(4, Math.max(1, Math.ceil(lo / values.length * 4))) as 1 | 2 | 3 | 4;
  };
}

export type Share = { id: string; name: string; coins: number; detail?: string };
export type Breakdown = { projects: Share[]; robots: Share[]; threads: Share[]; total: number; unattributed: number };

/** Coins by project, robot and thread between two days (inclusive). `robotOf` maps a thread to its worker. */
export function breakdown(days: Days, threads: Record<string, CalendarThread>, from: string, to: string, robotOf: (threadId: string) => { id: string; name: string } | null): Breakdown {
  const projects = new Map<string, Share>(), robots = new Map<string, Share>(), perThread = new Map<string, Share>();
  let total = 0, unattributed = 0;
  const add = (map: Map<string, Share>, id: string, name: string, coins: number, detail?: string) => {
    const s = map.get(id) ?? { id, name, coins: 0, detail };
    s.coins = round(s.coins + coins); map.set(id, s);
  };
  for (const d of days.values()) {
    if (d.day < from || d.day > to) continue;
    total += d.coins;
    if (!d.threads) { unattributed += d.coins; continue; }
    for (const [id, coins] of Object.entries(d.threads)) {
      const meta = threads[id], robot = robotOf(id);
      add(projects, meta?.projectId ?? "none", meta?.project ?? "No project", coins);
      add(robots, robot?.id ?? "none", robot?.name ?? "No robot on record", coins);
      add(perThread, id, meta?.title ?? "Untitled thread", coins, [robot?.name, meta?.project].filter(Boolean).join(", "));
    }
  }
  const sorted = (m: Map<string, Share>) => [...m.values()].sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name));
  return { projects: sorted(projects), robots: sorted(robots), threads: sorted(perThread), total: round(total), unattributed: round(unattributed) };
}
