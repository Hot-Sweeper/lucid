import gsap from "gsap";
import { FLOORS, WALLS, DECOR, DECOR_IDS, drawFloor, drawDecor, type FloorId, type WallId, type DecorId } from "../decor/decor";

// The company's coins and shop. Coins come from what the robots spend: every dollar of
// API-priced usage earns 10 coins. They buy furniture, floors and wall colours, which you
// then place in any office through Decorate.

export const COINS_PER_DOLLAR = 10;
export type ShopKind = "decor" | "floor" | "wall";
export type ShopItem = { id: string; key: string; kind: ShopKind; name: string; price: number; level: number };

const DECOR_PRICE: Record<DecorId, number> = { plants: 40, rug: 80, posters: 120, coffee: 250, water: 220, bookshelf: 400, beanbags: 450, trophies: 700, neon: 900, arcade: 1400, pingpong: 1800, aquarium: 2200 };
const FLOOR_PRICE: Record<FloorId, number> = { wood: 0, carpet: 200, tiles: 250, oak: 300, concrete: 350, terrazzo: 600 };
const WALL_PRICE: Record<WallId, number> = { warm: 0, cool: 100, mint: 150, lilac: 150, dusk: 250, brick: 400 };

export const CATALOG: ShopItem[] = [
  ...DECOR_IDS.map((id) => ({ id, key: `decor:${id}`, kind: "decor" as const, name: DECOR[id].name, price: DECOR_PRICE[id], level: DECOR[id].unlockAt })),
  ...(Object.keys(FLOORS) as FloorId[]).map((id) => ({ id, key: `floor:${id}`, kind: "floor" as const, name: FLOORS[id].name, price: FLOOR_PRICE[id], level: 0 })),
  ...(Object.keys(WALLS) as WallId[]).map((id) => ({ id, key: `wall:${id}`, kind: "wall" as const, name: WALLS[id].name, price: WALL_PRICE[id], level: 0 })),
];
export const itemFor = (kind: ShopKind, id: string) => CATALOG.find((c) => c.kind === kind && c.id === id) ?? null;

export type WalletState = { ledger: Record<string, number>; spent: number; owned: string[] };

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Wallet {
  onChange: (balance: number, gained: number) => void = () => {};
  constructor(private get: () => WalletState | undefined, private set: (s: WalletState) => void) {}

  private state(): WalletState {
    const s = this.get();
    return s ? { ledger: { ...s.ledger }, spent: s.spent ?? 0, owned: [...(s.owned ?? [])] } : { ledger: {}, spent: 0, owned: [] };
  }
  get earned() { return Math.floor(Object.values(this.state().ledger).reduce((a, b) => a + b, 0) * COINS_PER_DOLLAR); }
  get balance() { return this.earned - this.state().spent; }
  owns(key: string) { const it = CATALOG.find((c) => c.key === key); return !!it && (it.price === 0 || this.state().owned.includes(key)); }

  // Record what the robots spent. The first reading also credits the rest of the past week.
  observe(u: { windows: { today: { costUsd: number }; week: { costUsd: number } } }) {
    const s = this.state();
    const before = this.earned;
    const today = dayKey();
    if (!Object.keys(s.ledger).length) s.ledger.welcome = Math.max(0, u.windows.week.costUsd - u.windows.today.costUsd);
    s.ledger[today] = Math.max(s.ledger[today] ?? 0, u.windows.today.costUsd);
    this.set(s);
    const gained = this.earned - before;
    if (gained) this.onChange(this.balance, gained);
  }

  buy(key: string): boolean {
    const it = CATALOG.find((c) => c.key === key);
    if (!it || this.owns(key) || this.balance < it.price) return false;
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
  const tabs: [ShopKind, string][] = [["decor", "Furniture"], ["floor", "Floors"], ["wall", "Walls"]];
  let tab: ShopKind = "decor";
  wrap.innerHTML = `
    <div class="dialog shop" role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <header class="shop-head">
        <div><h2 id="shop-title">Shop</h2><p>Your robots earn ${COINS_PER_DOLLAR} coins for every dollar of work. Place what you buy with Decorate on any office sign.</p></div>
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
    grid.innerHTML = CATALOG.filter((c) => c.kind === tab).map((it) => {
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
    tab = b.dataset.t as ShopKind;
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
