import { GAME_TITLES } from "../games/catalog";
// Vapor: the robots' game store and launcher, in the app's own style: a dusky indigo store
// with sales and a cart, a library with an INSTALL or PLAY button, a download that really runs
// its course. The robot browses, maybe buys something (or is declined), then installs and launches
// one of the games that really exist on its desktop. The caller starts that game.
import { Kit, runApp, rnd, chance, pick, h, esc, calm, scrollTo, type SoHost, type SoOpts } from "../social/kit";
import "./vapor.css";

export type VaporGame = { id: string; key: string | null; title: string; blurb: string; c: [string, string]; price: number; sale?: number; size: number; glyph: string };

// Shapes drawn on a 48 unit grid, white, soft. One per game.
const G = {
  cube: `<path d="M24 6 40 15v18L24 42 8 33V15Z" fill="#fff" opacity=".92"/><path d="M24 24 8 15m16 9 16-9m-16 9v18" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>`,
  eye: `<ellipse cx="24" cy="24" rx="17" ry="10" fill="#fff" opacity=".92"/><circle cx="24" cy="24" r="6" fill="#000" opacity=".7"/><circle cx="26" cy="22" r="1.8" fill="#fff"/>`,
  palm: `<path d="M23 42c0-9 1-15 3-21" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/><path d="M26 21c-7-1-11 1-14 5 6-3 10-3 14-2Zm0 0c6-4 11-3 14 1-5-2-9-2-14 0Zm0 0c-2-6-6-9-11-9 6 0 9 3 11 9Zm0 0c3-6 7-8 12-7-5 1-9 3-12 7Z" fill="#fff" opacity=".92"/>`,
  tentacle: `<path d="M10 40c0-12 8-8 8-18s10-12 14-6c3 5-4 8 0 13s6 11 6 11" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="26" cy="15" r="2.2" fill="#fff"/>`,
  bug: `<ellipse cx="24" cy="27" rx="10" ry="12" fill="#fff" opacity=".92"/><path d="M24 15v24M14 22 6 18m8 8-9 1m9 6-8 5m28-19 8-4m-8 8 9 1m-9 6 8 5M20 15l-3-6m11 6 3-6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  power: `<path d="M24 8v14" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M15 15a14 14 0 1 0 18 0" stroke="#fff" stroke-width="4.6" stroke-linecap="round" fill="none"/>`,
  tiles: `<rect x="8" y="8" width="14" height="14" rx="3" fill="#fff" opacity=".95"/><rect x="26" y="8" width="14" height="14" rx="3" fill="#fff" opacity=".6"/><rect x="8" y="26" width="14" height="14" rx="3" fill="#fff" opacity=".6"/><rect x="26" y="26" width="14" height="14" rx="3" fill="#fff" opacity=".95"/>`,
  drone: `<rect x="17" y="21" width="14" height="8" rx="4" fill="#fff"/><path d="M8 17h12m8 0h12M12 17v4m24-4v4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  dash: `<rect x="12" y="14" width="22" height="22" rx="4" fill="#fff"/><path d="M4 20h6M2 26h8M5 32h5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>`,
  snake: `<path d="M8 36h10V22h14V12h10" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="42" cy="12" r="2" fill="#000" opacity=".6"/>`,
  four: `<circle cx="14" cy="14" r="5.4" fill="#fff"/><circle cx="26" cy="14" r="5.4" fill="#fff" opacity=".5"/><circle cx="14" cy="26" r="5.4" fill="#fff" opacity=".5"/><circle cx="26" cy="26" r="5.4" fill="#fff"/><circle cx="38" cy="26" r="5.4" fill="#fff"/><circle cx="26" cy="38" r="5.4" fill="#fff" opacity=".5"/>`,
  knight: `<path d="M16 40h18l-2-8c4-3 6-8 5-14-3-5-9-8-16-6l-6 8 5 2-5 6c-1 4 0 8 1 12Z" fill="#fff" opacity=".94"/><circle cx="25" cy="16" r="1.6" fill="#000" opacity=".6"/>`,
  rocket: `<path d="M24 6c7 6 9 15 7 24H17c-2-9 0-18 7-24Z" fill="#fff"/><circle cx="24" cy="19" r="3.4" fill="#000" opacity=".45"/><path d="M17 26 10 33l7 1m14-8 7 7-7 1M21 36l3 7 3-7" fill="#fff" opacity=".8"/>`,
  sword: `<path d="M34 8 40 8 40 14 21 33 15 27Z" fill="#fff"/><path d="m13 29 6 6-5 5-3-3-3 3-3-3 3-3-3-3Z" fill="#fff" opacity=".7"/>`,
  farm: `<path d="M24 42V20" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M24 22c-8 0-11-5-11-10 7 0 11 3 11 10Zm0 6c8 0 11-5 11-10-7 0-11 3-11 10Z" fill="#fff" opacity=".92"/>`,
  portal: `<ellipse cx="17" cy="24" rx="6" ry="13" fill="none" stroke="#fff" stroke-width="4"/><ellipse cx="33" cy="24" rx="6" ry="13" fill="#fff" opacity=".9"/>`,
};

// The games that exist on the robots' desktops have a `key` (the idle activity that plays them). The rest are store-only.
export const VAPOR_GAMES: VaporGame[] = [
  { id: "blockcraft", key: "blockcraft", title: GAME_TITLES.blockcraft, blurb: "Dig down, build up, pat the static bunnies.", c: ["#3a8f86", "#1d2f45"], price: 19.99, size: 1.4, glyph: G.cube },
  { id: "nightshift", key: "nightshift", title: GAME_TITLES.nightshift, blurb: "Keep the racks cool. Something keeps unplugging them.", c: ["#5a1a2e", "#0d0d1c"], price: 14.99, sale: 0.5, size: 2.1, glyph: G.eye },
  { id: "island", key: "island", title: GAME_TITLES.island, blurb: "A point and click about a courier bot relighting a lighthouse.", c: ["#1fa6a0", "#223a6b"], price: 9.99, size: 0.9, glyph: G.palm },
  { id: "botcom", key: "botcom", title: GAME_TITLES.botcom, blurb: "Turn based diver tactics: patch the cable, calm the crabs.", c: ["#25507a", "#0b1a2e"], price: 29.99, sale: 0.25, size: 6.8, glyph: G.tentacle },
  { id: "bugger", key: "bugger", title: GAME_TITLES.bugger, blurb: "Trade cargo between ports, repay the bank, and dodge packet pirates.", c: ["#a33a1e", "#2a1210"], price: 24.99, sale: 0.6, size: 3.3, glyph: G.bug },
  { id: "boot", key: "boot", title: GAME_TITLES.boot, blurb: "A first-person romp down the call stack. Clear out the bugs.", c: ["#3a3f99", "#12163a"], price: 7.99, size: 0.6, glyph: G.power },
  { id: "bitmerge", key: "bitmerge", title: GAME_TITLES.bitmerge, blurb: "Slide matching parts together. Build a mainframe or lose an evening.", c: ["#e0a53a", "#8a4a1a"], price: 3.99, size: 0.1, glyph: G.tiles },
  { id: "flappy", key: "flappy", title: GAME_TITLES.flappy, blurb: "One button. Many server racks.", c: ["#58b8e8", "#2b5ea8"], price: 2.99, size: 0.1, glyph: G.drone },
  { id: "dash", key: "dash", title: GAME_TITLES.dash, blurb: "Hop the cones on one wheel, reach the flag.", c: ["#7a4ae0", "#2a1a66"], price: 4.99, size: 0.2, glyph: G.dash },
  { id: "snake", key: "snake", title: GAME_TITLES.snake, blurb: "It is a snake. It eats. It grows.", c: ["#3fb86a", "#14503a"], price: 0.99, size: 0.05, glyph: G.snake },
  { id: "connect4", key: "connect4", title: GAME_TITLES.connect4, blurb: "Gravity does half the work.", c: ["#e8483a", "#7a1a2a"], price: 1.99, size: 0.1, glyph: G.four },
  { id: "chess", key: "chess", title: GAME_TITLES.chess, blurb: "Sixty four squares, no refunds.", c: ["#8a6a4a", "#2a2018"], price: 4.99, size: 0.1, glyph: G.knight },
  // store only
  { id: "patchpunk", key: null, title: "Patchpunk 3077", blurb: "The patch notes are longer than the game.", c: ["#f2e03a", "#c43a8a"], price: 59.99, sale: 0.65, size: 70, glyph: G.sword },
  { id: "halfcharged", key: null, title: "Half-Charged 3", blurb: "Release date: when it is ready.", c: ["#e87a1e", "#3a1e0c"], price: 59.99, size: 40, glyph: G.portal },
  { id: "lagspire", key: null, title: "Lagspire", blurb: "Everything is fine until the connection drops.", c: ["#b9a26a", "#2a2418"], price: 49.99, sale: 0.4, size: 48, glyph: G.knight },
  { id: "cloudrow", key: null, title: "Cloudrow Farm", blurb: "Grow cabbages on a rack in the cloud.", c: ["#5fcf7a", "#2a7a5a"], price: 14.99, size: 0.7, glyph: G.farm },
  { id: "thrust", key: null, title: "Thrust Issues", blurb: "Launch things into orbit, mostly by accident.", c: ["#4a9ae8", "#1a2a5a"], price: 39.99, sale: 0.5, size: 8.4, glyph: G.rocket },
];

const byId = (id: string) => VAPOR_GAMES.find((g) => g.id === id)!;
const price = (g: VaporGame) => +(g.price * (1 - (g.sale ?? 0))).toFixed(2);
const usd = (n: number) => `$${n.toFixed(2)}`;
const gb = (n: number) => (n < 1 ? `${Math.round(n * 1024)} MB` : `${n.toFixed(1)} GB`);

const art = (g: VaporGame, cls = "") => `<div class="sb-art ${cls}" style="background:linear-gradient(135deg, ${g.c[0]}, ${g.c[1]})"><svg viewBox="0 0 48 48" aria-hidden="true">${g.glyph}</svg></div>`;
// A soft vapor puff with a spark: three rising curls over a rounded cloud.
const LOGO = `<svg class="sb-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 20.5a4 4 0 0 1-.6-8 5.2 5.2 0 0 1 9.9-1.4 3.9 3.9 0 0 1 1.7 7.5c-.4 1.2-1.5 1.9-2.8 1.9Z" fill="#cfd6ff"/><path d="M8.2 9.6c-1-1.4-.2-2.6.6-3.4.7-.7.9-1.6.4-2.5M12 8.6c-.8-1.2-.2-2.2.5-2.9" stroke="#cfd6ff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".7"/><path d="m18.6 2.6.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z" fill="#ffb38a"/><circle cx="9.4" cy="16.4" r="1" fill="#252b52"/><circle cx="13.4" cy="16.4" r="1" fill="#252b52"/></svg>`;

export type VaporOpts = SoOpts & { want?: (key: string) => number };

/** Browses the store, maybe buys something, installs and launches a game. Resolves with the activity key of the game it launched, or null. */
export async function useVapor(body: HTMLElement, host: SoHost, opts: VaporOpts): Promise<{ launch: string | null }> {
  const out: { launch: string | null } = { launch: null };
  await runApp(body, host, opts, async (k) => { out.launch = await new Vapor(k, body, opts).session(); });
  return out;
}

class Vapor {
  root: HTMLElement;
  page!: HTMLElement;
  owned = new Set<string>();
  installed = new Set<string>();
  cart: VaporGame | null = null;
  view: "store" | "library" = "store";

  constructor(private k: Kit, body: HTMLElement, private opts: VaporOpts) {
    body.innerHTML = "";
    this.root = h("div", "sb");
    body.appendChild(this.root);
    // what it already owns: a handful of the playable games, some installed already
    const playable = VAPOR_GAMES.filter((g) => g.key);
    const mine = [...playable].sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 3));
    for (const g of mine) { this.owned.add(g.id); if (chance(0.55)) this.installed.add(g.id); }
    // at least one game is ready to play
    if (!this.installed.size) this.installed.add(mine[0].id);
    this.root.innerHTML = `
      <header class="sb-top"><span class="sb-brand">${LOGO}<b>Vapor</b></span>
        <nav><span data-tab="store" class="on">Store</span><span data-tab="library">Library</span><span>Community</span></nav>
        <span class="sb-cart" hidden>Cart (<i>1</i>)</span></header>
      <div class="sb-page"></div>`;
    this.page = this.root.querySelector(".sb-page")!;
  }

  private tab(v: "store" | "library") { return this.root.querySelector(`[data-tab="${v}"]`) as HTMLElement; }

  private paintTabs() {
    this.root.querySelectorAll<HTMLElement>("[data-tab]").forEach((e) => e.classList.toggle("on", e.dataset.tab === this.view));
  }

  // --- the store ------------------------------------------------------------------
  private special(g: VaporGame) {
    const sale = g.sale ? `<span class="sb-off">-${Math.round(g.sale * 100)}%</span><s>${usd(g.price)}</s>` : "";
    return `<div class="sb-sp" data-g="${g.id}">${art(g)}<div class="sb-sp-t"><b>${esc(g.title)}</b><small>${esc(g.blurb)}</small></div><div class="sb-pr">${sale}<b>${usd(price(g))}</b></div></div>`;
  }

  private showStore() {
    this.view = "store";
    this.paintTabs();
    const sale = VAPOR_GAMES.filter((g) => g.sale);
    const feature = pick(sale);
    const rest = VAPOR_GAMES.filter((g) => g !== feature).sort(() => Math.random() - 0.5);
    this.page.innerHTML = `<div class="sb-store">
      <section class="sb-hero" data-g="${feature.id}">${art(feature, "big")}<div class="sb-hero-t"><small>Special offer</small><h2>${esc(feature.title)}</h2><p>${esc(feature.blurb)}</p>
        <div class="sb-buyrow"><span class="sb-off">-${Math.round((feature.sale ?? 0) * 100)}%</span><s>${usd(feature.price)}</s><b>${usd(price(feature))}</b></div></div></section>
      <h3>Specials</h3>
      <div class="sb-list">${rest.slice(0, 7).map((g) => this.special(g)).join("")}</div></div>`;
  }

  private async browseStore() {
    const k = this.k;
    this.showStore();
    k.host.react("focus");
    await k.sleep(rnd(900, 1500));
    await k.point(this.page.querySelector(".sb-hero")!, rnd(0.3, 0.7), 0.5, 520);
    await k.sleep(rnd(700, 1400));
    // scroll down the specials, looking at a few
    const rows = [...this.page.querySelectorAll<HTMLElement>(".sb-sp")];
    scrollTo(k, this.page, 150, 0.8);
    await k.sleep(900);
    const pickRow = pick(rows.filter((r) => byId(r.dataset.g!).sale) .concat(rows.slice(0, 2)));
    await k.point(pickRow, 0.5, 0.5, 520);
    const g = byId(pickRow.dataset.g!);
    pickRow.classList.add("hot");
    await k.sleep(rnd(900, 1700));
    if (g.sale && g.sale >= 0.5) k.host.react("surprised");
    if (!chance(0.65) || this.owned.has(g.id)) { pickRow.classList.remove("hot"); scrollTo(k, this.page, 0, 0.7); return; }
    // open it, then: wishlist it, or put it in the cart
    await k.click(pickRow);
    await this.gamePage(g);
  }

  private async gamePage(g: VaporGame) {
    const k = this.k;
    this.page.innerHTML = `<div class="sb-gp">${art(g, "big")}<div class="sb-gp-t"><h2>${esc(g.title)}</h2><p>${esc(g.blurb)}</p>
      <div class="sb-buyrow">${g.sale ? `<span class="sb-off">-${Math.round(g.sale * 100)}%</span><s>${usd(g.price)}</s>` : ""}<b>${usd(price(g))}</b><span class="sb-green" data-act="cart">Add to cart</span><span class="sb-wish" data-act="wish">Add to your wishlist</span></div></div></div>`;
    this.page.scrollTop = 0;
    await k.sleep(rnd(900, 1600));
    if (chance(0.4)) {
      // just a wishlist for now
      const w = this.page.querySelector('[data-act="wish"]') as HTMLElement;
      await k.click(w);
      w.textContent = "On your wishlist";
      w.classList.add("on");
      await k.sleep(1100);
      return;
    }
    const add = this.page.querySelector('[data-act="cart"]') as HTMLElement;
    await k.click(add);
    this.cart = g;
    add.textContent = "In cart";
    add.classList.add("on");
    const cart = this.root.querySelector(".sb-cart") as HTMLElement;
    cart.hidden = false;
    if (!calm()) k.fromTo(cart, { scale: 1.3 }, { scale: 1, duration: 0.35, ease: "back.out(2.4)" });
    await k.sleep(rnd(700, 1200));
    await k.click(cart);
    await this.checkout(g);
  }

  private async checkout(g: VaporGame) {
    const k = this.k;
    const declined = chance(0.3);
    const dlg = h("div", "sb-dlg", `<div class="sb-card"><h3>Shopping cart</h3><div class="sb-line">${art(g, "sm")}<b>${esc(g.title)}</b><span>${usd(price(g))}</span></div>
      <div class="sb-line sb-total"><b>Estimated total</b><span>${usd(price(g))}</span></div><div class="sb-btns"><span class="sb-green" data-act="buy">Purchase for myself</span></div></div>`);
    this.root.appendChild(dlg);
    if (!calm()) k.fromTo(dlg.firstElementChild, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power2.out" });
    k.host.react("focus");
    await k.sleep(rnd(900, 1600));
    await k.click(dlg.querySelector('[data-act="buy"]')!);
    const card = dlg.firstElementChild as HTMLElement;
    if (declined) {
      card.innerHTML = `<h3>Payment declined</h3><p>The card on file was declined: insufficient funds. Add funds to your wallet and try again.</p><div class="sb-btns"><span class="sb-blue" data-act="ok">OK</span></div>`;
      k.host.react("shy");
      await k.sleep(rnd(1400, 2200));
      await k.click(card.querySelector('[data-act="ok"]')!);
      dlg.remove();
      return;
    }
    card.innerHTML = `<h3>Thank you for your purchase</h3><p>${esc(g.title)} is in your library.</p><div class="sb-btns"><span class="sb-blue" data-act="ok">Close</span></div>`;
    this.owned.add(g.id);
    k.host.react("cheer");
    await k.sleep(rnd(1200, 1800));
    await k.click(card.querySelector('[data-act="ok"]')!);
    dlg.remove();
    (this.root.querySelector(".sb-cart") as HTMLElement).hidden = true;
  }

  // --- the library ----------------------------------------------------------------
  private showLibrary(selected: VaporGame | null) {
    this.view = "library";
    this.paintTabs();
    const games = VAPOR_GAMES.filter((g) => this.owned.has(g.id)).sort((a, b) => a.title.localeCompare(b.title));
    this.page.innerHTML = `<div class="sb-lib">
      <aside><div class="sb-search">Search</div><div class="sb-hd">Games</div>
        ${games.map((g) => `<div class="sb-gi${this.installed.has(g.id) ? " in" : ""}" data-g="${g.id}"><span class="sb-ic" style="background:linear-gradient(135deg, ${g.c[0]}, ${g.c[1]})"></span><b>${esc(g.title)}</b></div>`).join("")}</aside>
      <main class="sb-detail"></main></div>`;
    this.page.scrollTop = 0;
    if (selected) this.showDetail(selected);
    else (this.page.querySelector(".sb-detail") as HTMLElement).innerHTML = `<div class="sb-empty">Pick a game from your library</div>`;
  }

  private showDetail(g: VaporGame) {
    this.root.querySelectorAll<HTMLElement>(".sb-gi").forEach((e) => e.classList.toggle("sel", e.dataset.g === g.id));
    const inst = this.installed.has(g.id);
    (this.page.querySelector(".sb-detail") as HTMLElement).innerHTML = `${art(g, "hero")}
      <div class="sb-act"><span class="${inst ? "sb-green" : "sb-blue"} sb-go" data-act="go">${inst ? "PLAY" : "INSTALL"}</span><span class="sb-meta">${inst ? "Ready to play" : `${gb(g.size)} to download`}</span></div>
      <p class="sb-blurb">${esc(g.blurb)}</p>
      <div class="sb-prog" hidden><div class="sb-bar"><i></i></div><div class="sb-pl"><span class="sb-st"></span><span class="sb-sp2"></span></div></div>`;
  }

  private async download(g: VaporGame, label: string) {
    const k = this.k, d = this.page.querySelector(".sb-detail") as HTMLElement;
    const go = d.querySelector(".sb-go") as HTMLElement, prog = d.querySelector(".sb-prog") as HTMLElement;
    const bar = prog.querySelector(".sb-bar i") as HTMLElement, st = prog.querySelector(".sb-st") as HTMLElement, sp = prog.querySelector(".sb-sp2") as HTMLElement;
    go.textContent = "Cancel";
    go.className = "sb-gray sb-go";
    prog.hidden = false;
    // the download runs for a few seconds; the speed wobbles, the bar always matches the bytes so far
    const secs = Math.min(9, 3 + g.size * 0.7) * rnd(0.85, 1.15), size = Math.max(g.size, 0.05) * 1024;
    let done = 0, last = performance.now();
    while (done < size) {
      await k.sleep(120);
      const now = performance.now(), dt = (now - last) / 1000;
      last = now;
      const rate = (size / secs) * rnd(0.6, 1.4);
      done = Math.min(size, done + rate * dt);
      bar.style.transform = `scaleX(${(done / size).toFixed(4)})`;
      st.textContent = `${label} ${Math.floor((done / size) * 100)}%`;
      sp.textContent = `${(rate).toFixed(1)} MB/s`;
    }
    prog.hidden = true;
  }

  private async playGame(g: VaporGame): Promise<boolean> {
    const k = this.k, d = this.page.querySelector(".sb-detail") as HTMLElement;
    let go = d.querySelector(".sb-go") as HTMLElement;
    if (!this.installed.has(g.id)) {
      await k.click(go);
      await this.download(g, "Downloading");
      this.installed.add(g.id);
      this.root.querySelector(`.sb-gi[data-g="${g.id}"]`)?.classList.add("in");
      this.showDetail(g);
      k.host.react("cheer");
      await k.sleep(rnd(500, 1000));
      go = d.querySelector(".sb-go") as HTMLElement;
    }
    // some launches need an update first
    if (chance(0.25)) {
      await k.click(go);
      await k.sleep(500);
      await this.download({ ...g, size: 0.25 + Math.random() * 0.6 }, "Updating");
      go = d.querySelector(".sb-go") as HTMLElement;
      go.textContent = "PLAY";
      go.className = "sb-green sb-go";
      await k.sleep(rnd(400, 900));
    }
    await k.click(d.querySelector(".sb-go")!);
    const go2 = d.querySelector(".sb-go") as HTMLElement;
    go2.textContent = "Launching";
    go2.className = "sb-gray sb-go";
    await k.sleep(rnd(900, 1400));
    go2.textContent = "STOP";
    go2.className = "sb-red sb-go";
    (d.querySelector(".sb-meta") as HTMLElement).textContent = "Running";
    d.querySelector(".sb-blurb")!.insertAdjacentHTML("afterend", `<p class="sb-last">Last played: today</p>`);
    return true;
  }

  async session(): Promise<string | null> {
    const k = this.k;
    await k.sleep(rnd(500, 900));
    if (chance(0.7)) await this.browseStore();
    // to the library
    await k.click(this.tab("library"));
    const playable = VAPOR_GAMES.filter((g) => g.key && this.owned.has(g.id));
    const w = (g: VaporGame) => (this.opts.want?.(g.key!) ?? 1) * (this.installed.has(g.id) ? 1.6 : 1);
    let total = playable.reduce((n, g) => n + w(g), 0), x = Math.random() * total;
    const target = playable.find((g) => (x -= w(g)) <= 0) ?? playable[0];
    this.showLibrary(null);
    await k.sleep(rnd(700, 1300));
    // now and then the wrong game first: it clicked the one above or below
    const items = [...this.root.querySelectorAll<HTMLElement>(".sb-gi")];
    const ix = items.findIndex((e) => e.dataset.g === target.id);
    if (items.length > 2 && chance(0.25)) {
      const wrong = items[ix + (ix > 0 ? -1 : 1)];
      await k.click(wrong, 0.4);
      this.showDetail(byId(wrong.dataset.g!));
      await k.sleep(rnd(700, 1200));
    }
    await k.click(items[ix], 0.4);
    this.showDetail(target);
    await k.sleep(rnd(600, 1100));
    return (await this.playGame(target)) ? target.key : null;
  }
}

/** The hosted game really ended, so its library page must stop saying Running. */
export function markVaporStopped(body: HTMLElement) {
  const button = body.querySelector<HTMLElement>(".sb-go");
  if (button?.textContent === "STOP") { button.textContent = "PLAY"; button.className = "sb-green sb-go"; }
  const meta = body.querySelector<HTMLElement>(".sb-meta");
  if (meta?.textContent === "Running") meta.textContent = "Last played: today";
}
