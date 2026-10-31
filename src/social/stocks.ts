// Ticker: a stock app full of made-up GPU and cooling companies. The robot flips between its
// watchlist, stares at the live chart, gasps at a dip and sometimes buys exactly one share.
import { Kit, runApp, rnd, chance, pick, h, canvas, calm, type SoHost, type SoOpts } from "./kit";
import "./stocks.css";

type Tick = { sym: string; name: string; price: number; open: number; hist: number[]; vol: number; el?: HTMLElement };
const NEWS = [
  "GPUX unveils a graphics card so big it ships with its own desk",
  "Fan Club Cooling reports record summer, thanks everyone",
  "Analysts: robots buying one share at a time is 'adorable'",
  "Tensor Works says next chip will be 'faster, probably'",
  "Wattson Power opens charging cafe, lines around the block",
  "Silicon Valley Sand denies sand shortage, points at beach",
  "VRAM Holdings: memory prices up, nobody remembers why",
];

export async function watchStocks(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Ticker(k, body).session(); });
}

class Ticker {
  root: HTMLElement;
  ticks: Tick[];
  cur!: Tick;
  ctx!: CanvasRenderingContext2D;
  cw = 0; chh = 0;
  owned = 0;

  constructor(private k: Kit, body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "so-st");
    body.appendChild(this.root);
    const mk = (sym: string, name: string, p: number, vol: number): Tick => {
      const hist: number[] = [];
      let v = p * rnd(0.92, 1.04);
      for (let i = 0; i < 80; i++) { v *= 1 + (Math.random() - 0.48) * vol; hist.push(v); }
      return { sym, name, price: v, open: hist[0], hist, vol };
    };
    this.ticks = [mk("GPUX", "GPU Express", 912, 0.012), mk("VRAM", "VRAM Holdings", 233, 0.015), mk("FANS", "Fan Club Cooling", 48, 0.02), mk("TNSR", "Tensor Works", 377, 0.011), mk("WATT", "Wattson Power", 64, 0.009), mk("SAND", "Silicon Valley Sand", 12, 0.025)];
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <aside class="so-st-list"><header>Watchlist</header></aside>
      <main class="so-st-main">
        <header class="so-st-head"><div><b class="sym"></b><span class="nm"></span></div><div class="so-st-px"><b></b><span></span></div></header>
        <div class="so-st-tf">${["1D", "1W", "1M", "1Y"].map((t, i) => `<span class="${i === 0 ? "on" : ""}">${t}</span>`).join("")}</div>
        <div class="so-st-chart"><canvas></canvas></div>
        <footer class="so-st-acts"><span class="so-st-own"></span><span class="so-st-buy">Buy</span></footer>
      </main>
      <div class="so-st-news"><div></div></div>`;
    const list = this.root.querySelector(".so-st-list")!;
    for (const t of this.ticks) {
      const el = h("div", "so-st-row", `<div><b>${t.sym}</b><small>${t.name}</small></div><div class="r"><b></b><span></span></div>`);
      t.el = el;
      list.appendChild(el);
      this.paintRow(t);
    }
    const chart = this.root.querySelector(".so-st-chart") as HTMLElement;
    this.cw = chart.clientWidth || 380; this.chh = chart.clientHeight || 200;
    this.ctx = canvas(chart.querySelector("canvas")!, this.cw, this.chh);
    const news = this.root.querySelector(".so-st-news div") as HTMLElement;
    news.textContent = [...NEWS, ...NEWS].join("     ·     ");
    if (!calm()) this.k.to(news, { x: () => -news.scrollWidth / 2, duration: 70, ease: "none", repeat: -1 });
    this.cur = this.ticks[0];
    this.select(this.cur);
    // prices move a little every beat, only while the app is open
    let last = 0;
    this.k.every((now) => {
      if (now - last < 700) return;
      last = now;
      for (const t of this.ticks) {
        t.price *= 1 + (Math.random() - 0.49) * t.vol * 0.6;
        t.hist.push(t.price); if (t.hist.length > 80) t.hist.shift();
        this.paintRow(t);
      }
      this.paintHead();
      this.drawChart();
    });
  }

  chg(t: Tick) { return ((t.price - t.open) / t.open) * 100; }
  paintRow(t: Tick) {
    const r = t.el!, c = this.chg(t);
    r.querySelector(".r b")!.textContent = t.price.toFixed(2);
    const s = r.querySelector(".r span") as HTMLElement;
    s.textContent = `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`;
    s.className = c >= 0 ? "up" : "dn";
  }
  paintHead() {
    const t = this.cur, c = this.chg(t);
    this.root.querySelector(".so-st-px b")!.textContent = `$${t.price.toFixed(2)}`;
    const s = this.root.querySelector(".so-st-px span") as HTMLElement;
    s.textContent = `${c >= 0 ? "+" : ""}${(t.price - t.open).toFixed(2)} (${c.toFixed(2)}%) today`;
    s.className = c >= 0 ? "up" : "dn";
    this.root.querySelector(".so-st-own")!.textContent = this.owned && t.sym === "VRAM" ? `You own ${this.owned} share${this.owned > 1 ? "s" : ""}` : "";
  }
  select(t: Tick) {
    this.cur = t;
    this.ticks.forEach((x) => x.el!.classList.toggle("on", x === t));
    this.root.querySelector(".so-st-head .sym")!.textContent = t.sym;
    this.root.querySelector(".so-st-head .nm")!.textContent = t.name;
    this.paintHead();
    this.drawChart();
  }
  drawChart() {
    const c = this.ctx, W = this.cw, H = this.chh, d = this.cur.hist;
    const lo = Math.min(...d), hi = Math.max(...d), pad = (hi - lo) * 0.15 || 1;
    const y = (v: number) => H - 8 - ((v - lo + pad) / (hi - lo + pad * 2)) * (H - 16);
    const x = (i: number) => (i / (d.length - 1)) * W;
    const up = d[d.length - 1] >= this.cur.open, col = up ? "#3ddc84" : "#ff5c6c";
    c.clearRect(0, 0, W, H);
    c.strokeStyle = "rgba(255,255,255,0.06)"; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, (H * i) / 4); c.lineTo(W, (H * i) / 4); c.stroke(); }
    c.setLineDash([3, 4]); c.strokeStyle = "rgba(255,255,255,0.25)"; c.beginPath(); c.moveTo(0, y(this.cur.open)); c.lineTo(W, y(this.cur.open)); c.stroke(); c.setLineDash([]);
    c.beginPath(); d.forEach((v, i) => (i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v))));
    c.lineWidth = 2; c.strokeStyle = col; c.lineJoin = "round"; c.stroke();
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, up ? "rgba(61,220,132,0.28)" : "rgba(255,92,108,0.28)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(x(d.length - 1), y(d[d.length - 1]), 3, 0, Math.PI * 2); c.fillStyle = col; c.fill();
  }

  async buy() {
    const vram = this.ticks.find((t) => t.sym === "VRAM")!;
    if (this.cur !== vram) { await this.k.click(vram.el!, 0.4); this.select(vram); await this.k.sleep(rnd(1200, 2000)); }
    await this.k.click(this.root.querySelector(".so-st-buy")!);
    const dlg = h("div", "so-st-dlg", `<b>Buy VRAM</b><p>1 share at $${vram.price.toFixed(2)}</p><div><span class="no">Cancel</span><span class="yes">Confirm</span></div>`);
    this.root.appendChild(dlg);
    if (!calm()) this.k.fromTo(dlg, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2 });
    this.k.host.react("focus");
    await this.k.sleep(rnd(1400, 2400));
    await this.k.click(dlg.querySelector(".yes")!);
    dlg.innerHTML = `<b>Order filled</b><p>You bought 1 share of VRAM. Big moves.</p>`;
    this.owned++;
    this.paintHead();
    this.k.host.react("cheer");
    await this.k.sleep(2000);
    dlg.remove();
  }

  async session() {
    await this.k.sleep(rnd(1500, 2500));
    let bought = false;
    while (this.k.left > 5000) {
      const t = pick(this.ticks.filter((x) => x !== this.cur));
      await this.k.click(t.el!, 0.4, 0.5);
      this.select(t);
      if (chance(0.35)) {
        const tf = [...this.root.querySelectorAll<HTMLElement>(".so-st-tf span")];
        const pickTf = tf[1 + Math.floor(Math.random() * 3)];
        await this.k.click(pickTf);
        tf.forEach((e) => e.classList.toggle("on", e === pickTf));
      }
      await this.k.sleep(rnd(3000, 6000));
      const c = this.chg(t);
      if (c < -2) this.k.host.react(chance(0.5) ? "surprised" : "shy");
      else if (c > 2) this.k.host.react("cheer");
      if (!bought && chance(0.3) && this.k.left > 12000) { bought = true; await this.buy(); }
    }
  }
}
