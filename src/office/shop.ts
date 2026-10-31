import gsap from "gsap";
import { FLOORS, WALLS, DECOR, DECOR_IDS, drawFloor, drawDecor, type FloorId, type WallId, type DecorId } from "../decor/decor";

// The company's coins and shop. A coin is a dollar: every dollar of API-priced work the robots
// do earns one coin, so nice things take days of real work. Boosts (night shift, a lucky hour,
// company level) and a daily reward add a little on top.

export const COINS_PER_DOLLAR = 1;
export type ShopKind = "decor" | "floor" | "wall";
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
  ...DECOR_IDS.map((id) => ({ id, key: `decor:${id}`, kind: "decor" as const, name: DECOR[id].name, price: seasonOf(id) ? SEASONAL_PRICE[id] ?? 40 : DECOR_PRICE[id] ?? 60, level: DECOR[id].unlockAt, season: seasonOf(id) })),
  ...(Object.keys(FLOORS) as FloorId[]).map((id) => ({ id, key: `floor:${id}`, kind: "floor" as const, name: FLOORS[id].name, price: FLOOR_PRICE[id], level: 0 })),
  ...(Object.keys(WALLS) as WallId[]).map((id) => ({ id, key: `wall:${id}`, kind: "wall" as const, name: WALLS[id].name, price: WALL_PRICE[id], level: 0 })),
];
export function currentSeason(d = new Date()): Season { const m = d.getMonth(); return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn"; }
export const seasonalNow = () => CATALOG.filter((c) => c.season === currentSeason());
const SEASON_END: Record<Season, string> = { spring: "the end of May", summer: "the end of August", autumn: "the end of November", winter: "the end of February" };
export const itemFor = (kind: ShopKind, id: string) => CATALOG.find((c) => c.kind === kind && c.id === id) ?? null;

export type WalletState = { ledger: Record<string, number>; spent: number; owned: string[]; v?: number; daily?: { last: string; streak: number } };

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
    const st: WalletState = { ledger: { ...s.ledger }, spent: s.spent ?? 0, owned: [...(s.owned ?? [])], v: s.v, daily: s.daily ? { ...s.daily } : undefined };
    // coins used to be 10 per dollar: spent coins convert at the same rate (rewards were stored in dollars already)
    if ((st.v ?? 1) < 2) { st.spent = Math.round(st.spent / 10); st.v = 2; this.set(st); }
    return st;
  }
  get earned() { return Math.floor(Object.values(this.state().ledger).reduce((a, b) => a + b, 0) * COINS_PER_DOLLAR); }
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
  get balance() { return this.earned - this.state().spent; }
  owns(key: string) { const it = CATALOG.find((c) => c.key === key); return !!it && (it.price === 0 || this.state().owned.includes(key)); }

  // Record what the robots spent. The first reading also credits the rest of the past week.
  observe(u: { windows: { today: { costUsd: number }; week: { costUsd: number } } }) {
    const s = this.state();
    const before = this.earned;
    const today = dayKey();
    if (!Object.keys(s.ledger).length) s.ledger.welcome = Math.max(0, u.windows.week.costUsd - u.windows.today.costUsd);
    // new work since the last reading, with the boost that is active right now
    const delta = Math.max(0, u.windows.today.costUsd - (s.ledger[today] ?? 0));
    const boost = boostNow(this.level);
    if (delta > 0 && boost.mult > 1 && s.ledger[today] != null) s.ledger[`bonus:boost:${today}`] = (s.ledger[`bonus:boost:${today}`] ?? 0) + delta * (boost.mult - 1);
    s.ledger[today] = Math.max(s.ledger[today] ?? 0, u.windows.today.costUsd);
    // the daily reward: a few coins for showing up, more for a streak
    let daily = 0;
    if (s.daily?.last !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const streak = s.daily?.last === dayKey(y) ? s.daily.streak + 1 : 1;
      daily = Math.min(5 + (streak - 1) * 2, 25);
      s.ledger[`bonus:daily:${today}`] = daily / COINS_PER_DOLLAR;
      s.daily = { last: today, streak };
    }
    this.set(s);
    if (daily) this.onDaily(daily, s.daily!.streak);
    const gained = this.earned - before;
    if (gained) this.onChange(this.balance, gained);
  }

  buy(key: string): boolean {
    const it = CATALOG.find((c) => c.key === key);
    if (!it || this.owns(key) || this.balance < it.price) return false;
    if (it.season && it.season !== currentSeason()) return false;   // seasonal things only sell in their season
    const s = this.state();
    s.spent += it.price;
    s.owned.push(key);
    this.set(s);
    this.onChange(this.balance, -it.price);
    return true;
  }
}

export const coinIcon = (size = 16) => `<svg class="coin-ico" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#e8a93a"/><circle cx="10" cy="10" r="7" fill="#ffd27a"/><path d="M10 5.5v9M7.6 7.6h3.6a1.6 1.6 0 0 1 0 3.2H8.8a1.6 1.6 0 0 0 0 3.2h3.6" stroke="#c8861f" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function itemPreview(it: ShopItem, w = 96, h = 72) {
  if (it.kind === "floor") return `<svg viewBox="0 0 96 72" width="${w}" height="${h}" aria-hidden="true">${drawFloor(it.id as FloorId, 96, 72, 0)}</svg>`;
  if (it.kind === "wall") { const c = WALLS[it.id as WallId]; return `<svg viewBox="0 0 96 72" width="${w}" height="${h}" aria-hidden="true"><rect width="96" height="58" fill="${c.face}"/><rect y="52" width="96" height="8" fill="${c.trim}"/><rect y="60" width="96" height="12" fill="#c9a274"/></svg>`; }
  const wall = DECOR[it.id as DecorId].spot === "wall";
  const big = it.id === "pingpong" || it.id === "rug";
  return `<svg viewBox="-70 ${wall ? -100 : -110} 140 130" width="${w}" height="${h}" aria-hidden="true">${drawDecor(it.id as DecorId, 0, wall ? 20 : 0, big ? 0.5 : 0.75)}</svg>`;
}

// The shop window.
export function openShop(o: { wallet: Wallet; level: number; onBought?: (it: ShopItem) => void }) {
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap shop-wrap";
  type Tab = ShopKind | "season";
  const season = currentSeason();
  const tabs: [Tab, string][] = [["season", `${season[0].toUpperCase()}${season.slice(1)} specials`], ["decor", "Furniture"], ["floor", "Floors"], ["wall", "Walls"]];
  let tab: Tab = "season";
  wrap.innerHTML = `
    <div class="dialog shop" role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <header class="shop-head">
        <div><h2 id="shop-title">Shop</h2><p>One coin for every dollar of AI work at API prices, so big things take a few days. Today's lucky hour (double coins) starts at ${luckyHour()}:00. Place what you buy with Decorate on any office sign.</p></div>
        <div class="shop-bal" aria-live="polite">${coinIcon(20)}<b></b></div>
      </header>
      <div class="shop-tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${k === tab}">${n}</button>`).join("")}</div>
      <div class="shop-grid" role="tabpanel"></div>
      <div class="dialog-actions"><button type="button" class="primary" data-a="close">Done</button></div>
    </div>`;
  document.body.appendChild(wrap);
  const grid = wrap.querySelector(".shop-grid") as HTMLElement;
  const bal = wrap.querySelector(".shop-bal b") as HTMLElement;
  const paint = () => {
    bal.textContent = o.wallet.balance.toLocaleString();
    const list = tab === "season" ? CATALOG.filter((c) => c.season === season) : CATALOG.filter((c) => c.kind === tab && !c.season);
    const note = tab === "season" ? `<p class="shop-note">${list.length ? `Only sold until ${SEASON_END[season]}. What you buy stays yours all year.` : "The seasonal things are on their way."}</p>` : "";
    grid.innerHTML = note + list.map((it) => {
      const owned = o.wallet.owns(it.key), locked = it.level > o.level, short = it.price - o.wallet.balance;
      const action = owned ? `<span class="shop-owned">${it.price ? "Owned" : "Free"}</span>`
        : locked ? `<span class="shop-lock">Level ${it.level}</span>`
        : `<button type="button" class="shop-buy" data-k="${it.key}" ${short > 0 ? "disabled" : ""}>${coinIcon(14)}${it.price.toLocaleString()}</button>${short > 0 ? `<small>${short.toLocaleString()} more</small>` : ""}`;
      return `<article class="shop-item ${owned ? "is-owned" : ""} ${locked ? "is-locked" : ""}"><div class="shop-pic">${itemPreview(it)}</div><b>${esc(it.name)}</b><div class="shop-act">${action}</div></article>`;
    }).join("");
  };
  paint();
  wrap.querySelector(".shop-tabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-t]") as HTMLElement | null;
    if (!b) return;
    tab = b.dataset.t as Tab;
    wrap.querySelectorAll(".shop-tabs [data-t]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    paint();
  });
  grid.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".shop-buy") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const it = CATALOG.find((c) => c.key === b.dataset.k)!;
    const card = b.closest(".shop-item") as HTMLElement;
    if (!o.wallet.buy(it.key)) return;
    coinBurst(b);
    paint();
    const fresh = [...grid.querySelectorAll(".shop-item")].find((x) => x.querySelector("b")?.textContent === it.name) as HTMLElement | undefined;
    if (fresh) gsap.fromTo(fresh, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: "back.out(2.4)" });
    void card;
    o.onBought?.(it);
  });
  const close = () => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="close"]')) close(); });
  gsap.fromTo(wrap.querySelector(".dialog"), { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.6)" });
  (wrap.querySelector('[data-a="close"]') as HTMLElement).focus();
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
