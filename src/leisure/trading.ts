// Botcoin Exchange: a crypto exchange for robots. Botcoin is the office's own fictional coin: its
// candles and price come from the office's real work (botcoin.ts), computed locally for real
// timeframes. Next to it sit fictional meme coins with made-up, very volatile prices that pump and
// get rugged. The robot draws trend lines on the
// chart, then trades with the usual human mistakes: buys after the green candle, panics at the
// first dip, types an extra zero, sells just before the moon. Orders, profit, liquidation and the
// wallet all follow the price on screen.
import { Kit, runApp, rnd, chance, pick, h, canvas, calm, typeInto, marker, type SoHost, type SoOpts } from "../social/kit";
import { botcoinCandles, botcoinCandle, botcoinPrice, INTERVAL_MS, INTERVALS, type Candle, type Interval } from "./botcoin";
import { chartPattern, PATTERNS, type ChartPoint } from "./trading-patterns";
import "./trading.css";

type Line = { a: [number, number]; b: [number, number]; col: string; label?: string };   // [candle time, price]
type Doodle = { strokes: ChartPoint[][]; revealed: number; color: string };
type Market = {
  sym: string; name: string; live: boolean; price: number; shown: number; candles: Candle[]; step: number;
  open: number; drift: number; vol: number; ticks: number; lines: Line[]; note: string; interval: Interval; el?: HTMLElement; doodle?: Doodle;
};
type Pos = { m: Market; side: 1 | -1; margin: number; lev: number; entry: number };

const GREEN = "#3fd49a", RED = "#ff5f7a", MUTE = "#8a90b0", BG = "#0d1022", GOLD = "#ffb45c";
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) * 1.73; };
const dec = (p: number) => (p >= 100 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 4 : 6);
const px = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: dec(p), maximumFractionDigits: dec(p) });
const usd = (n: number, d = 2) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const NOTES = ["to the moon", "support?", "trust me", "cup and handle", "this time is different", "it is a triangle", "buy here", "beep boop up only"];

// Botcoin's own coin: a copper coin with a little robot face.
const COIN = `<svg class="tb-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#f2a65a"/><circle cx="12" cy="12" r="8.4" fill="none" stroke="#ffd9ad" stroke-width="1.2"/><path d="M12 9.4V6.8" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="6.3" r="1.1" fill="#3a2414"/><rect x="7.4" y="9.2" width="9.2" height="7.2" rx="2.4" fill="#3a2414"/><circle cx="10.2" cy="12.8" r="1.1" fill="#ffd9ad"/><circle cx="13.8" cy="12.8" r="1.1" fill="#ffd9ad"/></svg>`;

// Fictional robot coins: made-up prices from a local random walk. Never presented as real.
const COINS: [string, string, number, number][] = [
  ["VOLT", "Voltcoin", 0.042, 0.012], ["BEEP", "Beepcoin", 0.0031, 0.016], ["SPRKT", "Sprocket Inu", 0.00021, 0.02],
  ["WHIRR", "Whirrcoin", 1.37, 0.01], ["ANTN", "Antennacoin", 0.088, 0.014],
];

export async function tradeOnBotcoinExchange(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new BotcoinExchange(k, body, opts).session(); });
}

class BotcoinExchange {
  root: HTMLElement;
  ctx!: CanvasRenderingContext2D;
  cw = 0; chh = 0;
  markets: Market[] = [];
  cur!: Market;
  balance = 1000;
  pos: Pos | null = null;
  lev = pick([10, 20, 25]);   // left over from the last session
  mark!: (x: number, y: number) => HTMLElement;
  dirty = true;
  sideAt = 0;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    body.innerHTML = "";
    this.root = h("div", "tb");
    body.appendChild(this.root);
    this.root.innerHTML = `
      <aside class="tb-mk"><div class="tb-brand">${COIN}<b>Botcoin Exchange</b></div><header>Office coin</header><div class="tb-grp" data-grp="office"></div><header class="tb-fic">Fictional coins</header><div class="tb-grp" data-grp="fic"></div></aside>
      <main class="tb-main">
        <header class="tb-head"><div class="tb-pair"><b></b><small></small></div><span class="tb-px"></span><span class="tb-chg"></span></header>
        <div class="tb-bar"><nav class="tb-tf">${INTERVALS.map((t, i) => `<span data-tf="${t}" class="${i === 0 ? "on" : ""}">${t}</span>`).join("")}</nav>
          <nav class="tb-tools"><span class="tb-tool" data-tool="doodle">Doodle</span><span class="tb-tool" data-tool="line">Line</span><span class="tb-tool" data-tool="text">Note</span></nav></div>
        <div class="tb-chart"><canvas role="img" aria-label="Market candles and robot chart doodles"></canvas></div><div class="tb-analysis" hidden><span>Robot doodle</span><b></b><span class="tb-analysis-copy"></span></div>
      </main>
      <aside class="tb-order">
        <div class="tb-sides"><span class="on" data-side="1">Buy</span><span data-side="-1">Sell</span></div>
        <label>Margin (USD)<div class="tb-in" data-f="size">100</div></label>
        <label>Leverage<div class="tb-in tb-lev" data-f="lev"><b>${this.lev}x</b><i>v</i></div></label>
        <div class="tb-levs" hidden>${[1, 3, 5, 10, 20, 25, 50].map((l) => `<span data-l="${l}">${l}x</span>`).join("")}</div>
        <div class="tb-cost"></div>
        <div class="tb-go tb-long" data-act="open">Buy / Long</div>
        <div class="tb-wallet"><span>Wallet</span><b></b></div>
        <div class="tb-pos"><header>Position</header><div class="tb-pos-b"><span class="tb-none">No open position</span></div></div>
      </aside>
      <div class="tb-toasts"></div>`;
    const chart = this.root.querySelector(".tb-chart") as HTMLElement;
    this.cw = chart.clientWidth || 440; this.chh = chart.clientHeight || 290;
    this.ctx = canvas(chart.querySelector("canvas")!, this.cw, this.chh);
    this.mark = marker(chart);
    // the markets: Botcoin first, then the made-up coins
    const botc: Market = { sym: "BOTC", name: "Botcoin", live: true, price: 0, shown: 0, candles: [], step: INTERVAL_MS["1m"], open: 0, drift: 0, vol: 0, ticks: 0, lines: [], note: "Rises when the office ships work", interval: "1m" };
    this.markets.push(botc);
    this.chart(botc, "1m");
    for (const [sym, name, p0, vol] of COINS) {
      const m: Market = { sym, name, live: false, price: 0, shown: 0, candles: [], step: 1, open: 0, drift: 0, vol, ticks: 0, lines: [], note: "Fictional coin, made-up prices", interval: "1m" };
      this.seed(m, p0 * rnd(0.6, 1.6));
      this.markets.push(m);
    }
    this.markets.forEach((m) => {
      const el = h("div", "tb-m", `<div><b>${m.live ? COIN : ""}${m.sym}/USD</b><small>${m.name}</small></div><span></span>`);
      m.el = el;
      this.root.querySelector(`[data-grp="${m.live ? "office" : "fic"}"]`)!.appendChild(el);
    });
    this.cur = botc;
    this.select(botc);
    this.syncSide();
    // the simulated markets run while the app is open; the chart is redrawn when something changed, not every frame
    let acc = 0;
    k.every((_now, dt) => {
      acc += dt;
      while (acc >= 0.25) { acc -= 0.25; for (const m of this.markets) if (m.live) this.follow(m); else this.tick(m, 0.25); }
      if (this.dirty) { this.dirty = false; this.paint(); }
    });
  }

  // --- data -----------------------------------------------------------------------
  /** A made-up history for a fictional coin, ending at `price`. */
  private seed(m: Market, price: number) {
    let p = price / rnd(0.8, 1.25);
    const step = (v: number) => { p *= 1 + gauss() * v; return p; };
    m.candles = [];
    for (let i = 0; i < 80; i++) {
      const o = step(m.vol * 0.5), a = step(m.vol * 0.5), b = step(m.vol * 0.5), c = step(m.vol * 0.5);
      m.candles.push({ t: i, o, h: Math.max(o, a, b, c), l: Math.min(o, a, b, c), c });
    }
    const f = price / m.candles[m.candles.length - 1].c;
    for (const c of m.candles) { c.o *= f; c.h *= f; c.l *= f; c.c *= f; }
    m.price = m.shown = price;
    m.open = m.candles[0].o;
  }

  /** Botcoin's chart for a timeframe. */
  private chart(m: Market, interval: Interval) {
    m.interval = interval;
    m.step = INTERVAL_MS[interval];
    m.lines = [];
    m.doodle = undefined;
    m.candles = botcoinCandles(interval);
    m.price = m.shown = m.candles[m.candles.length - 1].c;
    m.open = m.candles[0].o;
    if (this.cur === m) this.select(m);
  }

  /** Botcoin follows the clock: the open candle takes the current price, a new one opens on time. */
  private follow(m: Market) {
    const now = Date.now();
    let c = m.candles[m.candles.length - 1];
    if (now >= c.t + m.step) {
      m.candles.push(botcoinCandle(Math.floor(now / m.step) * m.step, m.step, now));
      m.candles.shift();
      m.open = m.candles[0].o;
      c = m.candles[m.candles.length - 1];
    }
    const p = botcoinPrice(now);
    m.price = m.shown = p; c.c = p; c.h = Math.max(c.h, p); c.l = Math.min(c.l, p);
    if (m === this.cur) this.dirty = true;
    this.checkLiquidation();
  }

  // simulated markets: a random walk the story can push around
  private tick(m: Market, dt: number) {
    m.ticks++;
    m.price *= 1 + (m.drift / 100) * dt + gauss() * m.vol;
    m.price = Math.max(m.price, 1e-7);
    let c = m.candles[m.candles.length - 1];
    if (m.ticks % 7 === 0) {
      m.candles.push({ t: c.t + 1, o: m.price, h: m.price, l: m.price, c: m.price });
      m.candles.shift();
      c = m.candles[m.candles.length - 1];
    }
    m.shown = m.price;
    c.c = m.price; c.h = Math.max(c.h, m.price); c.l = Math.min(c.l, m.price);
    if (m === this.cur) this.dirty = true;
    this.checkLiquidation();
    if (performance.now() - this.sideAt > 900) { this.sideAt = performance.now(); this.paintSide(); }
  }

  // --- the position -----------------------------------------------------------------
  private pnl() { const q = this.pos; return q ? q.margin * q.lev * q.side * (q.m.shown / q.entry - 1) : 0; }
  private liqPrice() { const q = this.pos!; return q.entry * (1 - (q.side * 0.9) / q.lev); }

  private checkLiquidation() {
    const q = this.pos;
    if (!q || this.pnl() > -q.margin * 0.9) return;
    this.balance -= q.margin;
    this.pos = null;
    this.toast("Position liquidated", `Lost ${usd(q.margin)} of margin`, RED);
    this.k.host.react("angry");
    this.dirty = true;
    this.paintPos();
  }

  // --- drawing ----------------------------------------------------------------------
  private range(m: Market) {
    let lo = Infinity, hi = -Infinity;
    for (const c of m.candles) { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; }
    const pad = (hi - lo) * 0.12 || hi * 0.001 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }
  private plotH() { return this.chh - 16; }
  private xOf(t: number, m = this.cur) { const c0 = m.candles[0].t; return 6 + (((t - c0) / m.step + 0.5) / m.candles.length) * (this.cw - 66); }
  private yOf(p: number, r: { lo: number; hi: number }) { return 6 + (1 - (p - r.lo) / (r.hi - r.lo)) * (this.plotH() - 12); }
  private pOfY(y: number, r: { lo: number; hi: number }) { return r.lo + (1 - (y - 6) / (this.plotH() - 12)) * (r.hi - r.lo); }

  private paint() {
    const m = this.cur;
    if (!m.candles.length) return;
    const c = this.ctx, W = this.cw, H = this.chh, r = this.range(m), PH = this.plotH();
    c.clearRect(0, 0, W, H);
    c.font = "9px 'JetBrains Mono Variable', monospace"; c.textBaseline = "middle"; c.textAlign = "left"; c.lineCap = "round"; c.lineJoin = "round";
    // grid and price axis
    c.strokeStyle = "rgba(255,255,255,0.045)"; c.lineWidth = 1; c.fillStyle = MUTE;
    for (let i = 1; i < 5; i++) { const y = (PH * i) / 5; c.beginPath(); c.moveTo(0, y); c.lineTo(W - 56, y); c.stroke(); c.fillText(px(this.pOfY(y, r)), W - 52, y); }
    const n = m.candles.length, plotW = W - 66, bw = Math.max(2, (plotW / n) * 0.6);
    const up = m.candles[n - 1].c >= m.candles[0].o;
    // a soft area under the closes
    c.beginPath();
    m.candles.forEach((cd, i) => { const x = this.xOf(cd.t), y = this.yOf(cd.c, r); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.lineTo(this.xOf(m.candles[n - 1].t), PH); c.lineTo(this.xOf(m.candles[0].t), PH); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, PH); g.addColorStop(0, up ? "rgba(63,212,154,0.14)" : "rgba(255,95,122,0.14)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fill();
    // candles: thin rounded wicks, rounded bodies, no outlines
    for (const cd of m.candles) {
      const x = this.xOf(cd.t), col = cd.c >= cd.o ? GREEN : RED;
      c.strokeStyle = col; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, this.yOf(cd.h, r)); c.lineTo(x, this.yOf(cd.l, r)); c.stroke();
      const y0 = this.yOf(cd.o, r), y1 = this.yOf(cd.c, r), top = Math.min(y0, y1), hh = Math.max(1.4, Math.abs(y1 - y0));
      c.fillStyle = col;
      c.beginPath(); c.roundRect(x - bw / 2, top, bw, hh, Math.min(1.6, bw / 2)); c.fill();
    }
    // clock times under Botcoin's chart
    if (m.live) {
      c.fillStyle = MUTE; c.textAlign = "center";
      for (let i = 1; i < 5; i++) { const cd = m.candles[Math.floor((n * i) / 5)]; c.fillText(hhmm(cd.t), this.xOf(cd.t), H - 6); }
      c.textAlign = "left";
    }
    // lines the robot drew
    for (const ln of m.lines) {
      const x0 = this.xOf(ln.a[0]), y0 = this.yOf(ln.a[1], r), x1 = this.xOf(ln.b[0]), y1 = this.yOf(ln.b[1], r);
      c.strokeStyle = ln.col; c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      if (ln.label) { c.fillStyle = ln.col; c.font = "600 10px 'Lexend Variable', sans-serif"; c.fillText(ln.label, Math.max(4, Math.min(x1 - 30, W - 150)), y1 - 9); c.font = "9px 'JetBrains Mono Variable', monospace"; }
    }
    // These are deliberate joke annotations. The underlying prices stay untouched.
    if (m.doodle) {
      c.save(); c.beginPath(); c.rect(0, 0, W - 64, PH); c.clip();
      c.strokeStyle = m.doodle.color; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
      let segment = 0;
      for (const stroke of m.doodle.strokes) for (let i = 1; i < stroke.length; i++) {
        const amount = Math.min(1, Math.max(0, m.doodle.revealed - segment++));
        if (!amount) continue;
        const a = stroke[i-1], b = stroke[i];
        c.beginPath(); c.moveTo(this.xOf(a[0]), this.yOf(a[1], r));
        c.lineTo(this.xOf(a[0] + (b[0]-a[0])*amount), this.yOf(a[1] + (b[1]-a[1])*amount, r)); c.stroke();
      }
      c.restore();
    }
    // entry and liquidation of the open position
    if (this.pos && this.pos.m === m) {
      const q = this.pos, ey = this.yOf(q.entry, r), ly = this.yOf(this.liqPrice(), r);
      c.setLineDash([4, 4]); c.lineWidth = 1;
      c.strokeStyle = GOLD; c.beginPath(); c.moveTo(0, ey); c.lineTo(W - 56, ey); c.stroke();
      if (ly > 0 && ly < PH) { c.strokeStyle = RED; c.beginPath(); c.moveTo(0, ly); c.lineTo(W - 56, ly); c.stroke(); c.fillStyle = RED; c.fillText("liq", 4, ly - 6); }
      c.setLineDash([]);
    }
    // the last price
    const py = this.yOf(m.shown, r), last = m.candles[n - 1], col = last.c >= last.o ? GREEN : RED;
    c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(0, py); c.lineTo(W - 56, py); c.stroke(); c.setLineDash([]);
    c.fillStyle = col; c.beginPath(); c.roundRect(W - 58, py - 7, 58, 14, 3); c.fill();
    c.fillStyle = BG; c.font = "600 9px 'JetBrains Mono Variable', monospace"; c.fillText(px(m.shown), W - 54, py);
    this.paintHead();
    this.paintPos();
  }

  private paintHead() {
    const m = this.cur, chg = m.open ? (m.shown / m.open - 1) * 100 : 0, last = m.candles[m.candles.length - 1];
    const pxEl = this.root.querySelector(".tb-px") as HTMLElement, ch = this.root.querySelector(".tb-chg") as HTMLElement;
    pxEl.textContent = m.shown ? `$${px(m.shown)}` : "";
    pxEl.style.color = last && last.c >= last.o ? GREEN : RED;
    ch.textContent = m.shown ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "";
    ch.style.color = chg >= 0 ? GREEN : RED;
    (this.root.querySelector(".tb-wallet b") as HTMLElement).textContent = usd(this.balance);
    this.paintCost();
  }

  private paintSide() {
    for (const m of this.markets) {
      if (!m.el || !m.open) continue;
      const chg = (m.shown / m.open - 1) * 100, s = m.el.querySelector("span") as HTMLElement;
      s.textContent = `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`;
      s.style.color = chg >= 0 ? GREEN : RED;
    }
  }

  private select(m: Market) {
    this.cur = m;
    this.markets.forEach((x) => x.el?.classList.toggle("on", x === m));
    (this.root.querySelector(".tb-pair b") as HTMLElement).textContent = `${m.sym}/USD`;
    (this.root.querySelector(".tb-pair small") as HTMLElement).textContent = m.note;
    (this.root.querySelector(".tb-tf") as HTMLElement).style.visibility = m.live ? "visible" : "hidden";
    this.root.querySelectorAll<HTMLElement>("[data-tf]").forEach((e) => e.classList.toggle("on", e.dataset.tf === m.interval));
    this.paintSide();
    this.dirty = true;
  }

  private sizeNow() { return Math.max(0, Number((this.root.querySelector('[data-f="size"]') as HTMLElement).textContent!.replace(/[^\d.]/g, "")) || 0); }
  private paintCost() {
    const mg = this.sizeNow(), n = mg * this.lev;
    (this.root.querySelector(".tb-cost") as HTMLElement).textContent = mg ? `Position size ${usd(n, 0)}` : "";
  }

  private paintPos() {
    const b = this.root.querySelector(".tb-pos-b") as HTMLElement, q = this.pos;
    if (!q) { if (!b.querySelector(".tb-none")) b.innerHTML = `<span class="tb-none">No open position</span>`; return; }
    const pnl = this.pnl(), pct = (pnl / q.margin) * 100;
    if (!b.querySelector(".tb-pr")) b.innerHTML = `<div class="tb-pr"><b></b><small></small><div class="tb-pl"></div><small class="tb-lq"></small><span class="tb-close" data-act="close">Close position</span></div>`;
    (b.querySelector("b") as HTMLElement).textContent = `${q.side > 0 ? "Long" : "Short"} ${q.m.sym} ${q.lev}x`;
    (b.querySelector("small") as HTMLElement).textContent = `Entry ${px(q.entry)}`;
    const pl = b.querySelector(".tb-pl") as HTMLElement;
    pl.textContent = `${usd(pnl)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
    pl.style.color = pnl >= 0 ? GREEN : RED;
    (b.querySelector(".tb-lq") as HTMLElement).textContent = `Liquidation ${px(this.liqPrice())}`;
  }

  private syncSide() {
    const q = this.root.querySelector(".tb-go") as HTMLElement;
    const long = this.root.querySelector(".tb-sides .on")!.getAttribute("data-side") === "1";
    q.className = `tb-go ${long ? "tb-long" : "tb-short"}`;
    q.textContent = long ? "Buy / Long" : "Sell / Short";
  }

  private toast(title: string, text: string, col: string) {
    const t = h("div", "tb-toast", `<b></b><span></span>`);
    (t.querySelector("b") as HTMLElement).textContent = title;
    (t.querySelector("span") as HTMLElement).textContent = text;
    t.style.borderLeftColor = col;
    this.root.querySelector(".tb-toasts")!.appendChild(t);
    if (!calm()) this.k.fromTo(t, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: "power2.out" });
    this.k.later(() => { if (!calm()) this.k.to(t, { opacity: 0, duration: 0.3, onComplete: () => t.remove() }); else t.remove(); }, 3600);
  }

  // --- what the robot does --------------------------------------------------------------
  private async phase(ms: number, drift: number, vol?: number) {
    this.cur.drift = drift;
    if (vol) this.cur.vol = vol;
    await this.k.sleep(ms);
  }

  private async openMarket(m: Market) {
    if (this.cur === m) return;
    await this.k.click(m.el!, 0.4, 0.5);
    this.select(m);
    await this.k.sleep(rnd(500, 900));
  }

  private async pickTimeframe(tf: Interval) {
    const el = this.root.querySelector(`[data-tf="${tf}"]`) as HTMLElement;
    await this.k.click(el);
    el.classList.add("on");
    this.chart(this.cur, tf);
    await this.k.sleep(rnd(500, 900));
  }

  private async pickTool(tool: string) {
    const el = this.root.querySelector(`[data-tool="${tool}"]`) as HTMLElement;
    await this.k.click(el);
    this.root.querySelectorAll(".tb-tool").forEach((e) => e.classList.toggle("on", e === el));
  }

  /** Draws a trend line the way a trader does: pick the tool, click one candle, drag to another. */
  private async trendLine(rising: boolean) {
    const k = this.k, m = this.cur;
    await this.pickTool("line");
    const r = this.range(m), n = m.candles.length;
    const i0 = 8 + Math.floor(Math.random() * 14), i1 = n - 4;
    const c0 = m.candles[i0], c1 = m.candles[i1];
    const pa = rising ? c0.l : c0.h, pb = rising ? c1.l : c1.h;
    const ln: Line = { a: [c0.t, pa], b: [c0.t, pa], col: rising ? GOLD : "#7aa2ff" };
    m.lines.push(ln);
    await k.point(this.mark(this.xOf(c0.t), this.yOf(pa, r)), 0, 0, 520);
    await k.host.click();
    // the line grows with the cursor
    const secs = k.moveSecs(Math.hypot(this.xOf(c1.t) - this.xOf(c0.t), this.yOf(pb, r) - this.yOf(pa, r)), 760);
    const seg = { v: 0 };
    const tw = k.to(seg, { v: 1, duration: secs, ease: "power2.inOut", onUpdate: () => { ln.b = [c0.t + (c1.t - c0.t) * seg.v, pa + (pb - pa) * seg.v]; this.dirty = true; } });
    await k.point(this.mark(this.xOf(c1.t), this.yOf(pb, r)), 0, 0, 760);
    tw.progress(1);
    ln.b = [c1.t, pb];
    this.dirty = true;
    await k.sleep(rnd(500, 900));
    if (chance(0.55)) {
      // and a note on it
      await this.pickTool("text");
      const note = pick(NOTES);
      await k.point(this.mark(this.xOf(c1.t) - 40, this.yOf(pb, r) - 26), 0, 0, 480);
      await k.host.click();
      ln.label = "";
      for (const ch of note) { ln.label += ch; k.tap(ch); this.dirty = true; await k.sleep(rnd(45, 95)); }
      await k.sleep(rnd(600, 1100));
    }
    this.root.querySelectorAll(".tb-tool").forEach((e) => e.classList.remove("on"));
  }

  /** The robot confidently draws complete nonsense with its one existing cursor. */
  private async memeAnalysis() {
    const k = this.k, m = this.cur;
    if (!m.candles.length) return;
    const caption = this.root.querySelector<HTMLElement>('.tb-analysis')!;
    caption.hidden = false;
    const copy = caption.querySelector<HTMLElement>('.tb-analysis-copy')!; copy.textContent = '';
    const chart = this.root.querySelector<HTMLElement>('.tb-chart')!;
    this.cw = chart.clientWidth; this.chh = chart.clientHeight;
    this.ctx = canvas(chart.querySelector('canvas')!, this.cw, this.chh);
    const kind = pick(PATTERNS), r = this.range(m), W = this.cw - 66, H = this.plotH() - 12;
    // The god-candle joke points at an actual candle, never a fabricated price spike.
    const green = m.candles.filter(c => c.c > c.o);
    const biggest = (green.length ? green : m.candles).reduce((a,b) => Math.abs(b.c-b.o)>Math.abs(a.c-a.o)?b:a);
    const anchor: ChartPoint = [(this.xOf(biggest.t)-6)/W, (this.yOf((biggest.h+biggest.l)/2,r)-6)/H];
    const pattern = chartPattern(kind, anchor);
    const first = m.candles[0].t;
    const doodle: Doodle = { strokes:pattern.strokes.map(stroke=>stroke.map(([x,y])=>[first+(x*m.candles.length-.5)*m.step, r.hi-y*(r.hi-r.lo)] as ChartPoint)), revealed:0, color:GOLD };
    // Keep the real candle at the center of its halo, even near the plot's edge.
    if (kind === 'god-candle') {
      const dx = biggest.t - (first+(Math.max(.08,Math.min(.92,anchor[0]))*m.candles.length-.5)*m.step);
      const dy = (biggest.h+biggest.l)/2 - (r.hi-Math.max(.24,Math.min(.84,anchor[1]))*(r.hi-r.lo));
      doodle.strokes.forEach(stroke=>stroke.forEach(p=>{p[0]+=dx;p[1]+=dy;}));
    }
    await this.pickTool('doodle');
    m.lines = []; m.doodle = doodle;
    caption.querySelector('b')!.textContent = pattern.title;
    // The fixed-height caption keeps the plot stable while the verdict is typed.
    this.dirty = true;
    k.host.react('focus');
    try {
      const total = doodle.strokes.reduce((n,s)=>n+s.length-1,0);
      if (calm()) { doodle.revealed = total; this.dirty = true; }
      else {
        let completed = 0;
        for (const stroke of doodle.strokes) {
          const a = stroke[0];
          await k.point(this.mark(this.xOf(a[0]),this.yOf(a[1],r)),0,0,360); await k.click();
          for (let i=1;i<stroke.length;i++) {
            const a=stroke[i-1],b=stroke[i];
            const x=this.xOf(b[0]),y=this.yOf(b[1],r);
            const duration=k.moveSecs(Math.hypot(x-this.xOf(a[0]),y-this.yOf(a[1],r)),340);
            const tween=k.to(doodle,{revealed:++completed,duration,ease:'none',onUpdate:()=>{this.dirty=true;}});
            await k.point(this.mark(x,y),0,0,340); tween.progress(1); this.dirty=true;
          }
        }
      }
      if (calm()) copy.textContent=pattern.verdict;
      else await typeInto(k,copy,pattern.verdict,{skill:1});
      k.host.react('cheer');
      await k.sleep(1100);
    } finally { this.root.querySelectorAll('.tb-tool').forEach(e=>e.classList.remove('on')); }
  }

  private async setSide(side: 1 | -1) {
    const el = this.root.querySelector(`[data-side="${side}"]`) as HTMLElement;
    if (el.classList.contains("on")) return;
    await this.k.click(el);
    this.root.querySelectorAll(".tb-sides span").forEach((e) => e.classList.toggle("on", e === el));
    this.syncSide();
  }

  private async setLeverage(l: number) {
    if (l === this.lev) return;
    const k = this.k, box = this.root.querySelector(".tb-lev") as HTMLElement, pop = this.root.querySelector(".tb-levs") as HTMLElement;
    await k.click(box);
    pop.hidden = false;
    await k.sleep(rnd(350, 700));
    await k.click(pop.querySelector(`[data-l="${l}"]`)!);
    pop.hidden = true;
    this.lev = l;
    (box.querySelector("b") as HTMLElement).textContent = `${l}x`;
    this.paintCost();
  }

  private async typeSize(text: string) {
    const el = this.root.querySelector('[data-f="size"]') as HTMLElement;
    await this.k.click(el);
    el.classList.add("on");
    el.textContent = "";
    await typeInto(this.k, el, text, { skill: 0.9 });
    el.classList.remove("on");
    this.paintCost();
  }

  private async open(side: 1 | -1) {
    const k = this.k, m = this.cur;
    if (this.pos) return false;
    await this.setSide(side);
    const margin = this.sizeNow();
    await k.click(this.root.querySelector('[data-act="open"]')!);
    if (margin > this.balance) {
      this.toast("Order rejected", "Insufficient balance for this margin", RED);
      k.host.react("shy");
      return false;
    }
    this.pos = { m, side, margin, lev: this.lev, entry: m.shown };
    this.toast(side > 0 ? "Long opened" : "Short opened", `${usd(margin * this.lev, 0)} at ${px(m.shown)}`, side > 0 ? GREEN : RED);
    this.dirty = true;
    this.paintPos();
    return true;
  }

  private async close() {
    const k = this.k;
    if (!this.pos) return 0;
    await k.click(this.root.querySelector('[data-act="close"]')!);
    if (!this.pos) return 0;           // it was liquidated in the meantime
    const pnl = this.pnl();
    this.balance += pnl;
    this.pos = null;
    this.toast("Position closed", `${pnl >= 0 ? "Made" : "Lost"} ${usd(Math.abs(pnl))}`, pnl >= 0 ? GREEN : RED);
    this.dirty = true;
    this.paintPos();
    this.paintHead();
    return pnl;
  }

  /** Stares at the position until something makes it act: a dip, a bit of profit, or boredom. */
  private async hold(maxMs: number, panicPct: number, takePct: number) {
    const k = this.k, t0 = performance.now();
    let worried = false;
    while (this.pos && performance.now() - t0 < maxMs) {
      await k.sleep(300);
      if (!this.pos) return "liquidated";
      const pct = (this.pnl() / this.pos.margin) * 100;
      if (pct < panicPct / 2 && !worried) { worried = true; k.host.react("shy"); }
      if (pct <= panicPct) return "panic";
      if (pct >= takePct) return "profit";
    }
    return this.pos ? "bored" : "liquidated";
  }

  // --- the sessions -------------------------------------------------------------------
  async session() {
    const k = this.k, botc = this.markets[0];
    await k.sleep(rnd(500, 900));
    this.paintSide();
    // Botcoin half of the time, otherwise one of the made-up coins
    const m = chance(0.5) ? pick(this.markets.slice(1)) : botc;
    await k.sleep(rnd(900, 1500));
    await this.openMarket(m);
    if (m.live && chance(0.55)) await this.pickTimeframe(pick(["5m", "15m", "1h"] as Interval[]));
    await k.sleep(rnd(600, 1100));
    if (chance(0.85)) await this.memeAnalysis();
    else await this.trendLine(chance(0.7));
    if (m.live) await this.tradeBotcoin(m);
    else await this.tradeMeme(m);
    m.drift = 0;
    await k.sleep(rnd(2000, 3500));
  }

  /** Botcoin: the robot jumps in after a green candle with too much leverage and then reacts to what the price does. */
  private async tradeBotcoin(m: Market) {
    const k = this.k;
    k.host.react("focus");
    await k.sleep(rnd(900, 1600));
    const green = m.candles[m.candles.length - 1].c >= m.candles[m.candles.length - 2].c;
    if (chance(0.3)) {
      // meant 200, typed one zero too many: the exchange says no, it fixes it
      await this.typeSize("2000");
      await this.open(1);
      await k.sleep(rnd(900, 1500));
    }
    await this.typeSize(pick(["100", "150", "200", "300"]));
    await this.setLeverage(pick([25, 50, 50]));
    // after a green candle it buys (the top); after a red one it often still does, "the dip"
    await this.open(green || chance(0.6) ? 1 : -1);
    if (!this.pos) return;
    const why = await this.hold(32000, -1.5, 1.5);
    if (why === "liquidated") return;
    if (why === "panic") k.host.react("shy");
    await k.sleep(rnd(300, 700));
    const pnl = await this.close();
    if (why === "panic" || pnl < 0) k.host.react("angry");
    else if (why === "profit") k.host.react("cheer");
    else k.host.react("relax");
  }

  /** A fictional coin: pumps, rugs and dips on made-up prices, with the same human mistakes. */
  private async tradeMeme(m: Market) {
    const k = this.k;
    const story = pick(["rug", "rug", "panic", "hodl", "early"] as const);
    await this.phase(rnd(1200, 2000), rnd(-0.5, 1.5));
    k.host.react("focus");
    if (story === "rug") {
      // everybody is talking about it: it buys the top, at ten times
      await this.phase(5600, 7, m.vol * 1.1);
      k.host.react("surprised");
      await k.sleep(rnd(500, 900));
      await this.typeSize(pick(["200", "300", "500"]));
      await this.setLeverage(10);
      await this.open(1);
      await this.phase(2000, 1.5);
      // and the liquidity is pulled
      this.toast("Liquidity removed", `${m.sym} lost most of its value in seconds`, RED);
      await this.phase(2200, -52, m.vol * 1.3);
      if (this.pos) { k.host.react("shy"); await k.sleep(rnd(400, 800)); await this.close(); }
      await this.phase(3500, 0.5);
      k.host.react("angry");
    } else if (story === "panic") {
      await this.phase(3000, 3, m.vol);
      await this.typeSize("250");
      await this.setLeverage(5);
      await this.open(1);
      await this.phase(5200, -6, m.vol * 1.2);
      k.host.react("shy");
      await k.sleep(rnd(300, 700));
      await this.close();
      // the bottom was right there
      await this.phase(7000, 9, m.vol * 1.2);
      k.host.react("angry");
    } else if (story === "hodl") {
      await this.typeSize("150");
      await this.setLeverage(3);
      await this.open(1);
      await this.phase(6200, -5, m.vol * 1.2);
      k.host.react("shy");
      // it does not touch anything this time
      await this.phase(8000, 6, m.vol);
      k.host.react("cheer");
      await k.sleep(rnd(900, 1500));
      await this.close();
    } else {
      await this.typeSize("200");
      await this.setLeverage(5);
      await this.open(1);
      await this.phase(4000, 3.5, m.vol);
      await this.close();
      // out it goes, then the price takes off
      await this.phase(7000, 14, m.vol * 1.3);
      k.host.react("angry");
    }
  }
}
