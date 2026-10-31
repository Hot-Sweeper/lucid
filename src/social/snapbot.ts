// Snapbot: the front camera shows the robot's own face, it flips through silly AR filters
// (dog ears, a flower crown, shades, hearts), snaps one, sends it to keep its streaks alive,
// and peeks at the friend map.
import { SNAP_FRIENDS, SNAP_CAPTIONS } from "../content/social";
import { circle, ellipse, fillRR, lin, poly, withAlpha, shade } from "../fun/draw";
import { Kit, runApp, rnd, chance, pick, shuffle, h, avatar, seedOf, touch, typeInto, calm, canvas, ICON, type SoHost, type SoOpts } from "./kit";
import "./snapbot.css";

type Ctx = CanvasRenderingContext2D;
type Filter = "none" | "dog" | "flowers" | "shades" | "hearts";
const FILTERS: Filter[] = ["none", "dog", "flowers", "shades", "hearts"];
const BODY = ["#ff9f5a", "#4fb6ff", "#b07cff", "#4ff0a0", "#ff6f91", "#ffc94d"];

const NAV = {
  map: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>`,
  cam: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4h7l1.5 2.5H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>`,
  people: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm7.5 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM9 13.5c4 0 7 2 7 5.5H2c0-3.5 3-5.5 7-5.5Zm8 .5c3 .2 5 1.9 5 5h-4c0-2-.4-3.6-1-5Z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15c0 .8.9 1.3 1.6.8l11-7.5c.6-.4.6-1.2 0-1.6l-11-7.5C7.9 3.2 7 3.7 7 4.5Z"/></svg>`,
};

export async function snapOnSnapbot(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Snapbot(k, body, opts).session(); });
}

class Snapbot {
  root: HTMLElement;
  w: number;
  hh: number;
  cam!: HTMLCanvasElement;
  ctx!: Ctx;
  filter: Filter = "none";
  live = true;
  body: string;
  carousel!: HTMLElement;
  t0 = performance.now();

  constructor(private k: Kit, el: HTMLElement, private opts: SoOpts) {
    el.innerHTML = "";
    this.root = h("div", "so-sn so-ph");
    el.appendChild(this.root);
    this.w = el.clientWidth || 134;
    this.hh = el.clientHeight || 284;
    this.body = BODY[seedOf(opts.me || "robot") % BODY.length];
    this.build();
    k.every((now) => { if (this.live) this.draw((now - this.t0) / 1000); });
  }

  build() {
    this.root.innerHTML = `
      <canvas class="so-sn-cam"></canvas>
      <div class="so-sn-ui">
        <header><span class="so-av">${avatar(this.body, seedOf(this.opts.me || "robot"))}</span><span class="so-sn-ic">${ICON.search}</span><span class="so-sn-sp"></span><span class="so-sn-ic flip"><i></i></span></header>
        <div class="so-sn-car">${FILTERS.map((f) => `<span class="f-${f}" data-f="${f}"><i></i></span>`).join("")}</div>
        <span class="so-sn-shut"></span>
        <nav>${[NAV.map, NAV.chat, NAV.cam, NAV.people, NAV.play].map((s, i) => `<span class="${i === 2 ? "on" : ""}">${s}</span>`).join("")}</nav>
      </div>
      <div class="so-sn-flash"></div>`;
    this.cam = this.root.querySelector(".so-sn-cam")!;
    this.ctx = canvas(this.cam, this.w, this.hh);
    this.carousel = this.root.querySelector(".so-sn-car")!;
    this.draw(0);
  }

  // The robot's own face, filling the front camera, with whatever filter is on.
  draw(t: number) {
    const c = this.ctx, w = this.w, H = this.hh;
    const bob = calm() ? 0 : Math.sin(t * 1.3) * 2.5, sway = calm() ? 0 : Math.sin(t * 0.8) * 2;
    c.save();
    c.fillStyle = lin(c, 0, 0, 0, H, [[0, "#d9c7ff"], [1, "#9fb8ff"]]); c.fillRect(0, 0, w, H);
    fillRR(c, w * 0.62, H * 0.08, w * 0.3, H * 0.2, 4, "#fff5e6");
    fillRR(c, w * 0.65, H * 0.1, w * 0.24, H * 0.16, 2, "#ffd27a");
    c.fillStyle = "#8a7dd6"; c.fillRect(0, H * 0.68, w, H);
    const s = w / 30, hx = w / 2 + sway, hy = H * 0.44 + bob;
    const body = this.body, dark = shade(body, -0.3), lite = shade(body, 0.25);
    // shoulders and neck
    fillRR(c, hx - 15 * s, hy + 8 * s, 30 * s, 20 * s, 7 * s, lin(c, hx - 15 * s, 0, hx + 15 * s, 0, [[0, lite], [1, body]]));
    fillRR(c, hx - 3 * s, hy + 5 * s, 6 * s, 5 * s, 1.5 * s, dark);
    // antenna
    c.fillStyle = dark; c.fillRect(hx + 3 * s, hy - 15 * s, 1.2 * s, 5 * s);
    circle(c, hx + 3.6 * s, hy - 15.5 * s, 1.8 * s, "#ff6f91");
    // head and visor
    fillRR(c, hx - 11.5 * s, hy - 10 * s, 23 * s, 17 * s, 6 * s, lin(c, hx - 11 * s, hy - 10 * s, hx + 11 * s, hy + 7 * s, [[0, lite], [1, body]]));
    fillRR(c, hx - 9 * s, hy - 7 * s, 18 * s, 10 * s, 4 * s, "#141a33");
    const blink = !calm() && (t % 3.7) < 0.12;
    const happy = this.filter !== "none";
    for (const ex of [-3.8, 3.8]) {
      if (blink) fillRR(c, hx + ex * s - 1.8 * s, hy - 2.2 * s, 3.6 * s, 0.8 * s, 0.4 * s, "#4ff0a0");
      else if (happy) { c.beginPath(); c.arc(hx + ex * s, hy - 1 * s, 1.9 * s, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 1.1 * s; c.lineCap = "round"; c.strokeStyle = "#4ff0a0"; c.stroke(); }
      else { circle(c, hx + ex * s, hy - 2 * s, 2.6 * s, withAlpha("#4ff0a0", 0.3)); circle(c, hx + ex * s, hy - 2 * s, 1.8 * s, "#4ff0a0"); }
    }
    this.overlay(c, hx, hy, s, t);
    c.restore();
  }

  overlay(c: Ctx, hx: number, hy: number, s: number, t: number) {
    const f = this.filter;
    if (f === "dog") {
      for (const side of [-1, 1]) {
        c.save(); c.translate(hx + side * 8 * s, hy - 9 * s); c.rotate(side * (0.45 + (calm() ? 0 : Math.sin(t * 3) * 0.06)));
        ellipse(c, 0, -5 * s, 3.4 * s, 6.5 * s, 0, "#8b5a2b"); ellipse(c, 0, -4.5 * s, 1.9 * s, 4.6 * s, 0, "#e3a87a"); c.restore();
      }
      ellipse(c, hx, hy + 3.4 * s, 3 * s, 2.1 * s, 0, "#2b1a10");
      circle(c, hx - 0.8 * s, hy + 2.8 * s, 0.7 * s, withAlpha("#ffffff", 0.6));
      if (!calm() && (t % 2.4) > 1.4) { fillRR(c, hx - 1.8 * s, hy + 5 * s, 3.6 * s, 4.5 * s, 1.8 * s, "#ff6f91"); }
    } else if (f === "flowers") {
      const cols = ["#ff6f91", "#ffd27a", "#b07cff", "#ff9f5a", "#7fd3ff", "#ff6f91", "#ffd27a"];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.12 + (i / 6) * 0.76), x = hx + Math.cos(a) * 12 * s, y = hy - 3 * s + Math.sin(a) * 9 * s;
        for (let p = 0; p < 5; p++) { const b = (p / 5) * Math.PI * 2 + t * 0.2; circle(c, x + Math.cos(b) * 1.6 * s, y + Math.sin(b) * 1.6 * s, 1.4 * s, cols[i]); }
        circle(c, x, y, 1 * s, "#fff5c2");
        if (i % 2) ellipse(c, x + 2.2 * s, y + 1.4 * s, 1.6 * s, 0.7 * s, 0.6, "#3fc489");
      }
    } else if (f === "shades") {
      fillRR(c, hx - 9.5 * s, hy - 4.2 * s, 8.6 * s, 4.8 * s, 1.6 * s, "#0b0b12");
      fillRR(c, hx + 0.9 * s, hy - 4.2 * s, 8.6 * s, 4.8 * s, 1.6 * s, "#0b0b12");
      fillRR(c, hx - 1 * s, hy - 3.4 * s, 2 * s, 0.9 * s, 0.4 * s, "#0b0b12");
      poly(c, [[hx - 8 * s, hy - 3.6 * s], [hx - 5.5 * s, hy - 3.6 * s], [hx - 7.4 * s, hy - 0.4 * s]], withAlpha("#ffffff", 0.35));
      poly(c, [[hx + 2.4 * s, hy - 3.6 * s], [hx + 4.9 * s, hy - 3.6 * s], [hx + 3 * s, hy - 0.4 * s]], withAlpha("#ffffff", 0.35));
    } else if (f === "hearts") {
      circle(c, hx - 7 * s, hy + 2.6 * s, 1.8 * s, withAlpha("#ff6f91", 0.55));
      circle(c, hx + 7 * s, hy + 2.6 * s, 1.8 * s, withAlpha("#ff6f91", 0.55));
      for (let i = 0; i < 6; i++) {
        const a = t * 0.9 + (i / 6) * Math.PI * 2, x = hx + Math.cos(a) * 15 * s, y = hy - 4 * s + Math.sin(a) * 4 * s - (i % 2) * 3 * s;
        heart(c, x, y, 1.6 * s * (0.8 + (i % 3) * 0.2), i % 2 ? "#ff6f91" : "#ff9fb4");
      }
    }
  }

  async pickFilter(f: Filter) {
    const item = this.carousel.querySelector(`[data-f="${f}"]`) as HTMLElement;
    await touch(this.k, item, this.root, "swipe");
    this.carousel.querySelectorAll("span").forEach((s) => s.classList.toggle("on", s === item));
    const shift = this.w / 2 - (item.offsetLeft + item.offsetWidth / 2);
    if (calm()) this.carousel.style.transform = `translateX(${shift}px)`;
    else this.k.to(this.carousel, { x: shift, duration: 0.3, ease: "power2.out" });
    this.filter = f;
    if (!calm()) this.k.fromTo(this.cam, { filter: "brightness(1.3)" }, { filter: "brightness(1)", duration: 0.35 });
    await this.k.sleep(rnd(1100, 2000));
    if (f !== "none" && chance(0.4)) this.k.host.react(chance(0.5) ? "laugh" : "shy");
  }

  async snap() {
    await touch(this.k, this.root.querySelector(".so-sn-shut")!, this.root);
    const flash = this.root.querySelector(".so-sn-flash") as HTMLElement;
    if (!calm()) this.k.fromTo(flash, { opacity: 0.95 }, { opacity: 0, duration: 0.45, ease: "power2.out" });
    this.live = false;
    this.root.classList.add("taken");
    const bar = h("div", "so-sn-cap");
    const txt = h("span");
    bar.appendChild(txt);
    const send = h("span", "so-sn-send", `<b>Send To</b>${ICON.send}`);
    this.root.append(bar, send);
    await this.k.sleep(rnd(700, 1200));
    if (chance(0.75)) {
      await touch(this.k, this.cam, this.root);
      bar.classList.add("on");
      await typeInto(this.k, txt, pick(SNAP_CAPTIONS), { phone: true, skill: this.opts.skill });
      await this.k.sleep(rnd(400, 800));
    }
    await touch(this.k, send, this.root);
    await this.sendTo();
    bar.remove(); send.remove();
    this.root.classList.remove("taken");
    this.live = true;
  }

  async sendTo() {
    const list = h("div", "so-sn-list");
    list.innerHTML = `<header>Send To...</header><h5>Best Friends</h5>${SNAP_FRIENDS.map((f) => `<div class="so-sn-fr"><span class="so-av">${avatar(f.color, seedOf(f.name))}</span><b></b><span class="so-sn-st">${ICON.fire}<i>${f.streak}</i></span><span class="so-sn-chk"></span></div>`).join("")}<footer><span class="so-sn-go">Send ${ICON.send}</span></footer>`;
    list.querySelectorAll(".so-sn-fr b").forEach((b, i) => (b.textContent = SNAP_FRIENDS[i].name));
    this.root.appendChild(list);
    if (!calm()) this.k.fromTo(list, { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: "power3.out" });
    await this.k.sleep(rnd(500, 900));
    const rows = [...list.querySelectorAll<HTMLElement>(".so-sn-fr")];
    // streak friends first: nobody wants to lose a 412 day streak
    const chosen = [rows[0], ...shuffle(rows.slice(1)).slice(0, 1 + Math.floor(Math.random() * 2))];
    for (const r of chosen) { await touch(this.k, r, this.root); r.classList.add("on"); await this.k.sleep(rnd(250, 500)); }
    const go = list.querySelector(".so-sn-go") as HTMLElement;
    list.classList.add("ready");
    await touch(this.k, go, this.root);
    for (const r of chosen) {
      const n = r.querySelector(".so-sn-st i") as HTMLElement;
      n.textContent = String(Number(n.textContent) + 1);
      r.classList.add("sent");
      if (!calm()) this.k.fromTo(r.querySelector(".so-sn-st svg"), { scale: 1.8 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
      await this.k.sleep(260);
    }
    go.innerHTML = "Sent";
    this.k.host.react("cheer");
    await this.k.sleep(rnd(1400, 2000));
    if (!calm()) await new Promise<void>((r) => this.k.to(list, { yPercent: 100, duration: 0.25, ease: "power2.in", onComplete: () => r() }));
    list.remove();
  }

  async map() {
    await touch(this.k, this.root.querySelector(".so-sn-ui nav span")!, this.root);
    this.live = false;
    const view = h("div", "so-sn-map");
    view.innerHTML = `<canvas></canvas><header>Map</header>`;
    this.root.appendChild(view);
    const W = this.w * 2, H = this.hh * 1.6;
    const c = canvas(view.querySelector("canvas")!, W, H);
    c.fillStyle = "#e8eef2"; c.fillRect(0, 0, W, H);
    ellipse(c, W * 0.8, H * 0.2, W * 0.25, H * 0.14, 0.3, "#9fd3f5");
    fillRR(c, W * 0.1, H * 0.6, W * 0.3, H * 0.22, 12, "#bfe6b0");
    for (let i = 0; i < 9; i++) { c.fillStyle = "#ffffff"; c.fillRect(0, (i * H) / 9 + 10, W, 6); c.fillRect((i * W) / 9 + 14, 0, 6, H); }
    c.fillStyle = "#ffe08a"; c.fillRect(0, H * 0.45, W, 9); c.fillRect(W * 0.52, 0, 9, H);
    for (let i = 0; i < 14; i++) fillRR(c, (i * 97) % (W - 30) + 8, (i * 61) % (H - 30) + 8, 18, 14, 3, "#d5dde6");
    const pins = SNAP_FRIENDS.map((f, i) => ({ f, x: W * (0.2 + ((i * 0.37) % 0.6)), y: H * (0.25 + ((i * 0.23) % 0.5)) }));
    for (const p of pins) {
      const pin = h("span", "so-sn-pin", `${avatar(p.f.color, seedOf(p.f.name))}<b></b>`);
      pin.querySelector("b")!.textContent = p.f.name.split(" ")[0];
      pin.style.left = `${p.x}px`; pin.style.top = `${p.y}px`;
      view.appendChild(pin);
    }
    const all = [view.querySelector("canvas")!, ...view.querySelectorAll(".so-sn-pin")];
    if (!calm()) {
      this.k.from(view.querySelectorAll(".so-sn-pin"), { scale: 0, duration: 0.4, stagger: 0.08, ease: "back.out(2.5)", delay: 0.3 });
      this.k.fromTo(all, { x: -W * 0.15, y: -H * 0.1 }, { x: -W * 0.45, y: -H * 0.3, duration: 7, ease: "sine.inOut" });
    } else this.k.set(all, { x: -W * 0.3, y: -H * 0.2 });
    await this.k.sleep(rnd(5000, 7000));
    view.remove();
    this.live = true;
  }

  async session() {
    await this.k.sleep(rnd(800, 1400));
    for (let round = 0; this.k.left > 9000; round++) {
      const tries = shuffle(FILTERS.filter((f) => f !== "none")).slice(0, 2 + Math.floor(Math.random() * 2));
      for (const f of tries) await this.pickFilter(f);
      await this.snap();
      if (round === 0 && chance(0.6) && this.k.left > 12000) await this.map();
      await this.pickFilter("none");
    }
  }
}

function heart(c: Ctx, x: number, y: number, r: number, col: string) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  c.fillStyle = col; c.fill();
}
