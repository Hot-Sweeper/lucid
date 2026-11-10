import { startCoinLedger, observeCoinLedger, collectCoinJob, collectible, roundCoins, type CoinLedger, type CoinSource } from "./coin-ledger";

// Coins show what the robots' work cost: one coin for every dollar of API-priced work.
// Each session's coins wait on its desk until the work is collected (coin-ledger.ts).
// The saved state is kept whole, older fields included, for the coin calendar.

export const COINS_PER_DOLLAR = 1;
/** `celebrated`: the last personal record of each kind the ledger celebrated (src/stats/coin-calendar.ts). */
export type WalletState = { ledger: Record<string, number>; spent?: number; v?: number; collection?: CoinLedger; celebrated?: Record<string, string>; [legacy: string]: unknown };

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Wallet {
  onChange: (balance: number, gained: number) => void = () => {};
  constructor(private get: () => WalletState | undefined, private set: (s: WalletState) => void) {}

  private state(): WalletState {
    const s = this.get();
    if (!s) return { ledger: {}, spent: 0, v: 2 };
    const st: WalletState = { ...structuredClone(s), ledger: { ...s.ledger }, spent: s.spent ?? 0 };
    // coins used to be 10 per dollar: spent coins convert at the same rate (rewards were stored in dollars already)
    if ((st.v ?? 1) < 2) { st.spent = Math.round((st.spent ?? 0) / 10); st.v = 2; this.set(st); }
    return st;
  }
  get earned() {
    const s = this.state();
    if (s.collection) return roundCoins(s.collection.legacyEarned + s.collection.collected + Object.entries(s.ledger).filter(([k]) => k.startsWith('bonus:')).reduce((sum, [, n]) => sum + n, 0));
    return Math.floor(Object.values(s.ledger).reduce((a, b) => a + b, 0) * COINS_PER_DOLLAR);
  }
  get rewards() { return Object.entries(this.state().collection?.jobs ?? {}).filter(([, job]) => collectible(job) > 0).map(([id, job]) => ({ id, ...job, amount: collectible(job) })); }
  observeSources(sources: CoinSource[]) {
    const s = this.state();
    if (!s.collection) {
      const bonuses = Object.entries(s.ledger).filter(([k]) => k.startsWith('bonus:')).reduce((sum, [, n]) => sum + n, 0);
      s.collection = startCoinLedger(sources, this.earned - bonuses);
    } else observeCoinLedger(s.collection, sources, COINS_PER_DOLLAR);
    if (JSON.stringify(s) !== JSON.stringify(this.get())) this.set(s);
  }
  collect(id: string) {
    const s = this.state();
    if (!s.collection) return 0;
    const payout = collectCoinJob(s.collection, id);
    if (!payout) return 0;
    s.ledger['work:collected'] = (s.ledger['work:collected'] ?? 0) + payout.dollars;
    this.set(s);
    this.onChange(this.balance, payout.coins);
    return payout.coins;
  }
  /** Whole-day totals saved before the coin calendar existed, for its backfill. */
  get dailyHistory() { return Object.fromEntries(Object.entries(this.state().ledger).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))); }
  celebrated(kind: string) { return this.state().celebrated?.[kind] ?? null; }
  markCelebrated(kind: string, key: string) { const s = this.state(); s.celebrated = { ...s.celebrated, [kind]: key }; this.set(s); }
  get balance() { return roundCoins(this.earned - (this.state().spent ?? 0)); }

  // Before the per-session ledger existed, coins followed the daily spend. The first reading
  // also credits the rest of the past week once.
  observe(u: { windows: { today: { costUsd: number }; week: { costUsd: number } } }) {
    const s = this.state();
    if (s.collection) return;
    const before = this.earned;
    const today = dayKey();
    const pastDays = Object.keys(s.ledger).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k !== today);
    if (s.ledger.welcome == null && !pastDays) s.ledger.welcome = Math.max(0, u.windows.week.costUsd - u.windows.today.costUsd);
    s.ledger[today] = Math.max(s.ledger[today] ?? 0, u.windows.today.costUsd);
    if (JSON.stringify(s) !== JSON.stringify(this.get())) this.set(s);
    const gained = this.earned - before;
    if (gained) this.onChange(this.balance, gained);
  }
}

export const coinIcon = (size = 16) => `<svg class="coin-ico" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#e8a93a"/><circle cx="10" cy="10" r="7" fill="#ffd27a"/><path d="M10 5.5v9M7.6 7.6h3.6a1.6 1.6 0 0 1 0 3.2H8.8a1.6 1.6 0 0 0 0 3.2h3.6" stroke="#c8861f" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
