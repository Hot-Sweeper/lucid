import { COMPUTERS, computerPreview, type ComputerId } from "./appearances";
import gsap from "gsap";
import { startCoinLedger, observeCoinLedger, collectCoinJob, collectible, formatCoins, roundCoins, type CoinLedger, type CoinSource } from "./coin-ledger";
import { gameSound } from "./sound";
import { FLOORS, WALLS, DECOR, DECOR_IDS, drawFloor, drawDecor, type FloorId, type WallId, type DecorId } from "../decor/decor";

// The company's coins and shop. A coin is a dollar: every dollar of API-priced work the robots
// do earns one coin, so nice things take days of real work. Boosts (night shift, a lucky hour,
// company level) and a daily reward add a little on top.

export const COINS_PER_DOLLAR = 1;
export type ShopKind = "decor" | "floor" | "wall" | "computer";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type ShopItem = { id: string; key: string; kind: ShopKind; name: string; price: number; level: number; season?: Season };

// prices in coins, which are dollars of work: small things take an hour or two, big ones days
const DECOR_PRICE: Partial<Record<DecorId, number>> = { plants: 8, rug: 20, posters: 30, coffee: 70, water: 60, bookshelf: 120, beanbags: 140, trophies: 220, neon: 300, arcade: 500, pingpong: 650, aquarium: 800 };
const FLOOR_PRICE: Record<FloorId, number> = { wood: 0, carpet: 40, tiles: 55, oak: 70, concrete: 85, terrazzo: 180 };
const WALL_PRICE: Record<WallId, number> = { warm: 0, cool: 20, mint: 30, lilac: 30, dusk: 55, brick: 110 };

// Seasonal things are only sold in their season (bought ones stay yours all year).
const SEASONAL_PRICE: Record<string, number> = { pumpkins: 30, leafwreath: 18, xmastree: 120, stringlights: 45, snowglobe: 35, tulips: 25, kite: 18, deskfan: 35, palm: 60, beachposter: 18 };
const seasonOf = (id: string) => (DECOR as any)[id]?.season as Season | undefined;
export const CATALOG: ShopItem[] = [
  ...Object.entries(COMPUTERS).map(([id, c]) => ({ id, key: `computer:${id}`, kind: "computer" as const, name: c.name, price: c.price, level: 0 })),
  ...DECOR_IDS.map((id) => ({ id, key: `decor:${id}`, kind: "decor" as const, name: DECOR[id].name, price: seasonOf(id) ? SEASONAL_PRICE[id] ?? 40 : DECOR_PRICE[id] ?? 60, level: DECOR[id].unlockAt, season: seasonOf(id) })),
  ...(Object.keys(FLOORS) as FloorId[]).map((id) => ({ id, key: `floor:${id}`, kind: "floor" as const, name: FLOORS[id].name, price: FLOOR_PRICE[id], level: 0 })),
  ...(Object.keys(WALLS) as WallId[]).map((id) => ({ id, key: `wall:${id}`, kind: "wall" as const, name: WALLS[id].name, price: WALL_PRICE[id], level: 0 })),
];
export function currentSeason(d = new Date()): Season { const m = d.getMonth(); return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn"; }
export const seasonalNow = () => CATALOG.filter((c) => c.season === currentSeason());
export const itemFor = (kind: ShopKind, id: string) => CATALOG.find((c) => c.kind === kind && c.id === id) ?? null;

export type WalletState = { ledger: Record<string, number>; spent: number; owned: string[]; v?: number; daily?: { last: string; streak: number }; collection?: CoinLedger };

// --- boosts: temporary coin multipliers -------------------------------------------------------
export type Boost = { mult: number; label: string; until?: number };
const hashDay = (d: string) => { let h = 7; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** The lucky hour for a day: somewhere between 9:00 and 21:00, different every day. */
export function luckyHour(d = new Date()) { return 9 + (hashDay(dayKey(d)) % 13); }
export function boostNow(level = 0, d = new Date()): Boost {
  const h = d.getHours();
  let mult = 1, label = "";
  if (h === luckyHour(d)) { mult = 2; label = "Lucky hour"; }
  else if (h >= 22 || h < 6) { mult = 1.5; label = "Night shift"; }
  const lv = 1 + Math.max(0, level) * 0.03;   // company level: +3% each
  return { mult: Math.round(mult * lv * 100) / 100, label: label || (level > 0 ? `Level ${level} bonus` : "") };
}

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Wallet {
  onChange: (balance: number, gained: number) => void = () => {};
  /** A daily reward was paid: coins and the streak length. */
  onDaily: (coins: number, streak: number) => void = () => {};
  level = 0;
  constructor(private get: () => WalletState | undefined, private set: (s: WalletState) => void) {}

  private state(): WalletState {
    const s = this.get();
    if (!s) return { ledger: {}, spent: 0, owned: [], v: 2 };
    const st: WalletState = { ledger: { ...s.ledger }, spent: s.spent ?? 0, owned: [...(s.owned ?? [])], v: s.v, daily: s.daily ? { ...s.daily } : undefined, collection: s.collection ? structuredClone(s.collection) : undefined };
    // coins used to be 10 per dollar: spent coins convert at the same rate (rewards were stored in dollars already)
    if ((st.v ?? 1) < 2) { st.spent = Math.round(st.spent / 10); st.v = 2; this.set(st); }
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
    } else observeCoinLedger(s.collection, sources, boostNow(this.level).mult * COINS_PER_DOLLAR);
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
  collectAll() {
    const s = this.state();
    if (!s.collection) return 0;
    let coins = 0, dollars = 0;
    for (const id of Object.keys(s.collection.jobs)) {
      const payout = collectCoinJob(s.collection, id);
      if (payout) { coins += payout.coins; dollars += payout.dollars; }
    }
    if (!coins) return 0;
    s.ledger['work:collected'] = (s.ledger['work:collected'] ?? 0) + dollars;
    this.set(s);
    coins = roundCoins(coins);
    this.onChange(this.balance, coins);
    return coins;
  }
  /** Dollars of AI work at API prices (rewards excluded). */
  get spentUsd() { return Object.entries(this.state().ledger).filter(([k]) => !k.startsWith("bonus:")).reduce((a, [, v]) => a + v, 0); }
  /** Pay out a one-time reward (milestones). */
  grant(key: string, coins: number) {
    const s = this.state();
    if (s.ledger[`bonus:${key}`] != null) return;
    s.ledger[`bonus:${key}`] = coins / COINS_PER_DOLLAR;
    this.set(s);
    this.onChange(this.balance, coins);
  }
  get balance() { return roundCoins(this.earned - this.state().spent); }
  owns(key: string) { const it = CATALOG.find((c) => c.key === key); return !!it && (it.price === 0 || this.state().owned.includes(key)); }

  // Record what the robots spent. The first reading also credits the rest of the past week.
  observe(u: { windows: { today: { costUsd: number }; week: { costUsd: number } } }) {
    const s = this.state();
    const before = this.earned;
    const today = dayKey();
    // the week before today counts once, as a welcome; restored if the ledger ever lost it
    const pastDays = Object.keys(s.ledger).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k !== today);
    if (!s.collection && s.ledger.welcome == null && !pastDays) s.ledger.welcome = Math.max(0, u.windows.week.costUsd - u.windows.today.costUsd);
    // new work since the last reading, with the boost that is active right now
    const delta = Math.max(0, u.windows.today.costUsd - (s.ledger[today] ?? 0));
    const boost = boostNow(this.level);
    if (!s.collection) {
      if (delta > 0 && boost.mult > 1 && s.ledger[today] != null) s.ledger[`bonus:boost:${today}`] = (s.ledger[`bonus:boost:${today}`] ?? 0) + delta * (boost.mult - 1);
      s.ledger[today] = Math.max(s.ledger[today] ?? 0, u.windows.today.costUsd);
    }
    // the daily reward: a few coins for showing up, more for a streak
    let daily = 0;
    if (s.daily?.last !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const streak = s.daily?.last === dayKey(y) ? s.daily.streak + 1 : 1;
      daily = Math.min(5 + (streak - 1) * 2, 25);
      s.ledger[`bonus:daily:${today}`] = daily / COINS_PER_DOLLAR;
      s.daily = { last: today, streak };
    }
    if (JSON.stringify(s) !== JSON.stringify(this.get())) this.set(s);
    if (daily) this.onDaily(daily, s.daily!.streak);
    const gained = this.earned - before;
    if (gained) this.onChange(this.balance, gained);
  }

  buy(key: string): boolean { return !this.owns(key) && this.buyMany([key]); }

  /** Theme collections are one transaction: never spend half a bundle's price. */
  buyMany(keys: string[]): boolean {
    const items = [...new Set(keys)].map(key => CATALOG.find(c => c.key === key));
    if (items.some(it => !it || it.level > this.level || it.season && it.season !== currentSeason() && !this.owns(it.key))) return false;
    const missing = items.filter((it): it is ShopItem => !!it && !this.owns(it.key));
    const price = missing.reduce((n, it) => n + it.price, 0);
    if (this.balance < price) return false;
    if (!missing.length) return true;
    const s = this.state();
    s.spent = roundCoins(s.spent + price);
    s.owned.push(...missing.map(it => it.key));
    this.set(s);
    this.onChange(this.balance, -price);
    return true;
  }

}

export const coinIcon = (size = 16) => `<svg class="coin-ico" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#e8a93a"/><circle cx="10" cy="10" r="7" fill="#ffd27a"/><path d="M10 5.5v9M7.6 7.6h3.6a1.6 1.6 0 0 1 0 3.2H8.8a1.6 1.6 0 0 0 0 3.2h3.6" stroke="#c8861f" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

export function itemPreview(it: ShopItem, w = 96, h = 72) {
  if (it.kind === "computer") return computerPreview(it.id as ComputerId, w, h);
  if (it.kind === "floor") return `<svg viewBox="0 0 96 72" width="${w}" height="${h}" aria-hidden="true">${drawFloor(it.id as FloorId, 96, 72, 0)}</svg>`;
  if (it.kind === "wall") { const c = WALLS[it.id as WallId]; return `<svg viewBox="0 0 96 72" width="${w}" height="${h}" aria-hidden="true"><rect width="96" height="58" fill="${c.face}"/><rect y="52" width="96" height="8" fill="${c.trim}"/><rect y="60" width="96" height="12" fill="#c9a274"/></svg>`; }
  const wall = DECOR[it.id as DecorId].spot === "wall";
  const big = it.id === "pingpong" || it.id === "rug";
  return `<svg viewBox="-70 ${wall ? -100 : -110} 140 130" width="${w}" height="${h}" aria-hidden="true">${drawDecor(it.id as DecorId, 0, wall ? 20 : 0, big ? 0.5 : 0.75)}</svg>`;
}

// Keep the existing entry point and wallet, load the center storefront on demand.
let storeLoading: Promise<void> | null = null;
export function openShop(o: import("./storefront").StoreOptions) {
  if (storeLoading) return storeLoading;
  storeLoading = import("./storefront").then(({ openStorefront }) => openStorefront(o)).finally(() => { storeLoading = null; });
  return storeLoading;
}

// A little shower of coins flying out of an element (a purchase, or coins earned).
export function coinBurst(from: Element, n = 7) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "coin-fly";
    c.innerHTML = coinIcon(14);
    c.style.left = `${r.left + r.width / 2 - 7}px`;
    c.style.top = `${r.top + r.height / 2 - 7}px`;
    document.body.appendChild(c);
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
    gsap.timeline({ onComplete: () => c.remove() })
      .to(c, { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, rotation: Math.random() * 360, duration: 0.45, ease: "power2.out" })
      .to(c, { y: "+=40", opacity: 0, duration: 0.4, ease: "power2.in" });
  }
}
