// Botcoin, the robots' office coin: a fictional price computed on this computer from the office's
// real work. Finished and settled sessions and the coins earned each day nudge it up, quiet days
// drift sideways, and a little playful noise keeps the chart alive. No network requests. The same
// moment always has the same price, so every robot screen shows the same chart.

export const INTERVALS = ["1m", "5m", "15m", "1h"] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MS: Record<Interval, number> = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000 };
export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type OfficeThread = { settled?: boolean; runStatus?: string | null; updatedAt?: string | null };

const BASE = 1024;
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MEMORY = 45 * DAY;                 // old work fades slowly, so a quiet day is close to flat
const SHIPPED = 0.004, COINS = 0.006;    // log-price nudge per finished session, per log of a day's coins
// Playful noise: [period, amplitude] octaves of smooth value noise.
const OCTAVES: [number, number][] = [[40000, 0.0012], [6 * MIN, 0.003], [45 * MIN, 0.007], [6 * HOUR, 0.012], [2 * DAY, 0.02]];

type Bump = { at: number; span: number; w: number };
let bumps: Bump[] = [];

/** The office's real work: each finished or settled session once, at its last update, and the
 *  coins earned per day (`YYYY-MM-DD` keys, as the wallet records them). */
export function observeOfficeActivity(threads: readonly OfficeThread[], coinsByDay: Record<string, unknown> = {}) {
  const next: Bump[] = [];
  for (const t of threads) {
    if (!t.settled && t.runStatus !== "completed") continue;
    const at = Date.parse(t.updatedAt ?? "");
    if (Number.isFinite(at)) next.push({ at, span: 30 * MIN, w: SHIPPED });
  }
  for (const [day, coins] of Object.entries(coinsByDay)) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || typeof coins !== "number" || !(coins > 0)) continue;
    const at = new Date(`${day}T00:00:00`).getTime();
    if (Number.isFinite(at)) next.push({ at, span: DAY, w: COINS * Math.log1p(coins) });
  }
  bumps = next.sort((a, b) => a.at - b.at);
}

function activity(t: number) {
  let sum = 0;
  for (const b of bumps) {
    if (b.at >= t) break;
    const f = Math.min(1, (t - b.at) / b.span), ramp = f * f * (3 - 2 * f);
    sum += b.w * ramp * Math.exp(-Math.max(0, t - b.at - b.span) / MEMORY);
  }
  return sum;
}

// A stable pseudo-random value in [-1, 1] for an integer lattice point.
function hash(n: number, seed: number) {
  let x = Math.imul((n | 0) ^ seed, 0x27d4eb2d);
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 2147483648 - 1;
}

function noise(t: number) {
  let sum = 0;
  OCTAVES.forEach(([period, amp], k) => {
    const x = t / period, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), seed = 0x9e3779b1 * (k + 1);
    sum += amp * (hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * u);
  });
  return sum;
}

/** Botcoin's price at a moment. */
export function botcoinPrice(t = Date.now()) {
  return BASE * Math.exp(activity(t) + noise(t));
}

/** The last `count` candles of a timeframe, the newest still open at `now`. */
export function botcoinCandles(interval: Interval, count = 80, now = Date.now()): Candle[] {
  const step = INTERVAL_MS[interval], last = Math.floor(now / step) * step, out: Candle[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(botcoinCandle(last - i * step, step, now));
  return out;
}

/** One candle starting at `t`, sampled up to `now` when it is still open. */
export function botcoinCandle(t: number, step: number, now = Date.now()): Candle {
  const end = Math.min(t + step, now), o = botcoinPrice(t);
  let h = o, l = o, c = o;
  for (let s = 1; s <= 8; s++) { c = botcoinPrice(t + ((end - t) * s) / 8); if (c > h) h = c; if (c < l) l = c; }
  return { t, o, h, l, c };
}
