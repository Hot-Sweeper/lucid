// Session high-water marks survive reloads, retries and shrinking log windows.
// Each native session has one owner, so parent and helper robots cannot both earn it.
export type CoinSource = { key: string; threadId: string; title: string; status: string | null; costUsd: number | null };
export type CoinJob = { title: string; dollars: number; coins: number; ready: boolean };
export type CoinLedger = { baseline: Record<string, number | null>; jobs: Record<string, CoinJob>; legacyEarned: number; collected: number };
export const roundCoins = (n: number) => Math.round(n * 1e6) / 1e6;
export const collectible = (job: CoinJob) => job.ready ? Math.floor((job.coins + 1e-8) * 100) / 100 : 0;
export const formatCoins = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function startCoinLedger(sources: CoinSource[], legacyEarned: number): CoinLedger {
  return { baseline: Object.fromEntries(sources.map(s => [s.key, validCost(s.costUsd) ? s.costUsd : null])), jobs: {}, legacyEarned, collected: 0 };
}
const validCost = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function observeCoinLedger(ledger: CoinLedger, sources: CoinSource[], multiplier: number) {
  for (const source of sources) {
    const job = ledger.jobs[source.threadId];
    if (job) { job.title = source.title; job.ready = source.status === 'completed'; }
    if (!validCost(source.costUsd)) continue;
    const prior = ledger.baseline[source.key];
    // An existing session whose price/logs were missing at migration is baselined
    // when it becomes available. Already credited history is never paid twice.
    const delta = prior === null ? 0 : Math.max(0, source.costUsd - (prior ?? 0));
    ledger.baseline[source.key] = Math.max(prior ?? 0, source.costUsd);
    if (delta <= 0) continue;
    const next = ledger.jobs[source.threadId] ??= { title: source.title, dollars: 0, coins: 0, ready: false };
    next.dollars = roundCoins(next.dollars + delta);
    next.coins = roundCoins(next.coins + delta * multiplier);
    next.ready = source.status === 'completed';
  }
}

export function collectCoinJob(ledger: CoinLedger, id: string) {
  const job = ledger.jobs[id], coins = job ? collectible(job) : 0;
  if (!job || coins <= 0) return null;
  const dollars = job.dollars * coins / job.coins;
  job.coins = roundCoins(job.coins - coins);
  job.dollars = roundCoins(job.dollars - dollars);
  ledger.collected = roundCoins(ledger.collected + coins);
  // Retain sub-cent earnings so many small jobs still add up.
  if (!job.coins && !job.dollars) delete ledger.jobs[id];
  return { coins, dollars };
}
