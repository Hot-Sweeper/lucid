import gsap from "gsap";
import { Walker } from "../world/walker";
import { CATALOG, itemPreview, coinIcon, seasonalNow, type Wallet, type ShopItem } from "./shop";
import { seasonFor } from "../weather/season";

// The shop building beside the office, seen from above like the rooms: a striped awning over
// the door, shelves of furniture with price tags, a table with this season's specials, and a
// shopkeeper behind the counter. Clicking anywhere inside opens the shop.

export const SHOP_W = 680, SHOP_H = 420;
const WALL = 96;   // north wall face, with the shop window and the door
const T = 14;      // wall thickness seen from above

const KEEPER_LINES: Record<string, string[]> = {
  spring: ["Tulips just came in!", "Spring sale on kites.", "Fresh flowers, fresh code."],
  summer: ["Stay cool, grab a fan!", "Palm trees, half the bugs.", "Beach posters, no sand."],
  autumn: ["Pumpkins are in!", "Cozy season. Wreaths are back.", "Leaves fall, prices too."],
  winter: ["Trees and lights for the office!", "Snow globes, very calming.", "Warm lights, warm builds."],
};

export class ShopFront {
  el: HTMLElement;
  onOpen: () => void = () => {};
  private keeper: Walker | null = null;
  private timer = 0;
  private rect = { x: 0, y: 0 };
  private sig = "";

  constructor(parent: HTMLElement, private wallet: Wallet, private level: () => number) {
    this.el = document.createElement("div");
    this.el.className = "shopfront";
    this.el.setAttribute("role", "button");
    this.el.setAttribute("tabindex", "0");
    this.el.setAttribute("aria-label", "Shop: buy furniture, floors, walls and seasonal things");
    this.el.innerHTML = `<div class="sf-art"></div><div class="sf-keeper"></div>`;
    parent.appendChild(this.el);
    this.el.addEventListener("click", () => { this.keeper?.say(this.line(), 2200); this.keeper?.do("wave"); this.onOpen(); });
    this.el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.onOpen(); } });
  }

  place(x: number, y: number) {
    this.rect = { x, y };
    this.el.style.cssText = `left:${x}px;top:${y}px;width:${SHOP_W}px;height:${SHOP_H}px`;
    this.render();
  }

  private line() { return pick(KEEPER_LINES[seasonFor()] ?? ["Welcome in!"]); }

  // Redraw when what is for sale changes (a purchase, a new level, a new season).
  render() {
    const sig = `${this.wallet.balance >= 0 ? Math.floor(this.wallet.balance / 50) : 0}:${this.level()}:${seasonFor()}:${CATALOG.filter((c) => this.wallet.owns(c.key)).length}`;
    if (sig === this.sig && this.el.firstChild) return;
    this.sig = sig;
    const decor = CATALOG.filter((c) => c.kind === "decor" && !c.season);
    const seasonal = seasonalNow();
    const tag = (it: ShopItem, x: number, y: number) => {
      const owned = this.wallet.owns(it.key), locked = it.level > this.level();
      const label = owned ? "Owned" : locked ? `Lv ${it.level}` : `${it.price}`;
      const w = owned ? 40 : locked ? 30 : 12 + String(it.price).length * 6;
      return `<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="0" width="${w}" height="13" rx="6.5" fill="${owned ? "#3fbf86" : locked ? "#4a5063" : "#ffd27a"}"/>
        ${!owned && !locked ? `<circle cx="${-w / 2 + 7}" cy="6.5" r="3.6" fill="#e8a93a"/>` : ""}
        <text x="${!owned && !locked ? 3 : 0}" y="9.6" text-anchor="middle" font-size="8.5" font-weight="600" fill="${owned || locked ? "#fff" : "#3a2508"}" font-family="var(--font)">${label}</text></g>`;
    };
    const item = (it: ShopItem, x: number, y: number, size: number) =>
      `<g transform="translate(${x - size / 2} ${y - size * 0.75})" class="${this.wallet.owns(it.key) ? "sf-owned" : ""}">${itemPreview(it, size, size * 0.75)}</g>${tag(it, x, y + 2)}`;
    // shelves along the west and east walls, display tables in the middle
    const west = decor.slice(0, 6), east = decor.slice(6, 12);
    // each shelf holds two columns of three, with room for the price tags
    const SW = 150;
    const shelf = (x: number, items: ShopItem[]) => `
      <rect x="${x}" y="${WALL + 14}" width="${SW}" height="${SHOP_H - WALL - 40}" rx="6" fill="#8a5f3a"/>
      <rect x="${x + 4}" y="${WALL + 18}" width="${SW - 8}" height="${SHOP_H - WALL - 48}" rx="4" fill="#b47f4f"/>
      ${[0, 1, 2].map((r) => `<rect x="${x + 4}" y="${WALL + 98 + r * 92}" width="${SW - 8}" height="4" fill="#8a5f3a" opacity="0.6"/>`).join("")}
      ${items.map((it, i) => item(it, x + 40 + (i % 2) * 70, WALL + 78 + Math.floor(i / 2) * 92, 56)).join("")}`;
    const sx = SHOP_W / 2;
    const season = seasonFor();
    const SEASON_COL: Record<string, string> = { spring: "#ff9fc6", summer: "#ffd27a", autumn: "#ff9f5a", winter: "#9fd8ff" };
    const display = seasonal.length
      ? seasonal.slice(0, 3).map((it, i) => item(it, sx - 90 + i * 90, WALL + 112, 70)).join("")
      : `<text x="${sx}" y="${WALL + 96}" text-anchor="middle" font-size="11" fill="#5a3b2a" font-family="var(--font)">New things soon</text>`;
    (this.el.querySelector(".sf-art") as HTMLElement).innerHTML = /* svg */ `
    <svg viewBox="0 0 ${SHOP_W} ${SHOP_H}" width="${SHOP_W}" height="${SHOP_H}" aria-hidden="true">
      <rect x="${sx - 28}" y="-92" width="56" height="96" fill="#e6d6b4"/>
      <rect x="18" y="26" width="${SHOP_W}" height="${SHOP_H}" rx="12" fill="#1f2a1a" opacity="0.3"/>
      <rect width="${SHOP_W}" height="${SHOP_H}" rx="10" fill="#3a3f4f"/>
      <!-- floor: warm checker tiles -->
      <defs><pattern id="sf-tile" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="#efe1c6"/><rect width="18" height="18" fill="#e4d2b0"/><rect x="18" y="18" width="18" height="18" fill="#e4d2b0"/></pattern></defs>
      <rect x="${T}" y="${WALL}" width="${SHOP_W - T * 2}" height="${SHOP_H - WALL - T}" fill="url(#sf-tile)"/>
      <rect x="${T}" y="${WALL}" width="${SHOP_W - T * 2}" height="14" fill="#000" opacity="0.07"/>
      <!-- north wall face: big shop window and the door -->
      <rect x="${T}" y="${T}" width="${SHOP_W - T * 2}" height="${WALL - T}" fill="#f6efe2"/>
      <rect x="${T}" y="${WALL - 9}" width="${SHOP_W - T * 2}" height="9" fill="#e2d4bb"/>
      <rect x="40" y="${T + 22}" width="150" height="${WALL - T - 40}" rx="5" fill="#cfe3f2"/><rect x="40" y="${T + 22}" width="150" height="${WALL - T - 40}" rx="5" fill="url(#sf-sky)"/>
      <rect x="${SHOP_W - 190}" y="${T + 22}" width="150" height="${WALL - T - 40}" rx="5" fill="url(#sf-sky)"/>
      <linearGradient id="sf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <rect x="${sx - 34}" y="${T + 16}" width="68" height="${WALL - T - 16}" rx="4" fill="#7a5236"/>
      <rect x="${sx - 28}" y="${T + 22}" width="56" height="${WALL - T - 24}" rx="3" fill="#a9d3ea" opacity="0.8"/>
      <circle cx="${sx + 20}" cy="${T + 56}" r="2.6" fill="#ffd27a"/>
      <!-- the striped awning over the door, with the shop's name -->
      <g class="sf-awning">${Array.from({ length: 12 }, (_, i) => `<path d="M${sx - 132 + i * 22} ${-6} h22 v20 q-11 9 -22 0 Z" fill="${i % 2 ? "#ffffff" : "#ff6f61"}"/>`).join("")}</g>
      <rect x="${sx - 74}" y="-30" width="148" height="26" rx="8" fill="#2a2f55"/>
      <text x="${sx}" y="-12.5" text-anchor="middle" font-size="14" font-weight="700" fill="#ffd27a" font-family="var(--font)">Lucid Supply</text>
      <!-- shelves and the seasonal display -->
      ${shelf(T + 10, west)}${shelf(SHOP_W - T - 10 - SW, east)}
      <rect x="${sx - 140}" y="${WALL + 34}" width="280" height="120" rx="12" fill="${SEASON_COL[season]}" opacity="0.28"/>
      <rect x="${sx - 132}" y="${WALL + 42}" width="264" height="104" rx="10" fill="#c99a68"/>
      <rect x="${sx - 132}" y="${WALL + 42}" width="264" height="10" rx="5" fill="#dcb07c"/>
      <g transform="translate(${sx} ${WALL + 40})"><rect x="-58" y="-11" width="116" height="20" rx="10" fill="${SEASON_COL[season]}"/>
        <text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="#3a2508" font-family="var(--font)">${season[0].toUpperCase() + season.slice(1)} specials</text></g>
      ${display}
      <!-- counter and register near the back -->
      <rect x="${sx - 110}" y="${SHOP_H - 96}" width="220" height="38" rx="8" fill="#6b4f3a"/>
      <rect x="${sx - 110}" y="${SHOP_H - 96}" width="220" height="9" rx="4.5" fill="#86654b"/>
      <rect x="${sx + 50}" y="${SHOP_H - 112}" width="36" height="24" rx="5" fill="#3a3f4f"/><rect x="${sx + 55}" y="${SHOP_H - 108}" width="18" height="8" rx="2" fill="#8ef0b4"/>
      <g transform="translate(${sx - 72} ${SHOP_H - 100})">${coinIcon(18).replace("<svg", '<svg x="0" y="0"')}</g>
    </svg>`;
    if (!this.keeper) {
      this.keeper = new Walker(this.el.querySelector(".sf-keeper")!, { id: "shopkeeper", provider: "generic", name: "Shopkeeper", scale: 0.34 });
      this.keeper.setPos(SHOP_W / 2 - 20, SHOP_H - 28);
      this.keeper.face("up");
      this.loop();
    }
  }

  // The shopkeeper restocks shelves, waves and calls out the specials.
  private loop() {
    const k = this.keeper!;
    const home = { x: SHOP_W / 2 - 20, y: SHOP_H - 28 };   // behind the counter
    const step = async () => {
      if (!this.keeper) return;
      const r = Math.random();
      try {
        if (r < 0.35) {
          const left = Math.random() < 0.5;
          // round the counter to a shelf, tidy it, come back
          await k.walkPath([{ x: left ? SHOP_W / 2 - 150 : SHOP_W / 2 + 150, y: SHOP_H - 28 }, { x: left ? 200 : SHOP_W - 200, y: WALL + 120 + Math.random() * 150 }]);
          k.face(left ? "left" : "right");
          k.do("explain");
          await new Promise((res) => window.setTimeout(res, 2500));
          k.calm();
          await k.walkPath([{ x: left ? SHOP_W / 2 - 150 : SHOP_W / 2 + 150, y: SHOP_H - 28 }, home]);
          k.face("up");
        } else if (r < 0.55) {
          k.face("up"); k.do("wave"); k.say(this.line(), 2400);
        } else k.face(Math.random() < 0.5 ? "down" : "up");
      } catch { /* destroyed */ }
      this.timer = window.setTimeout(step, 6000 + Math.random() * 9000);
    };
    this.timer = window.setTimeout(step, 3000);
  }

  destroy() {
    window.clearTimeout(this.timer);
    this.keeper?.destroy();
    this.keeper = null;
    this.el.remove();
  }
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
void gsap;
