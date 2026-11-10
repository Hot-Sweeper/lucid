// Chirp: the robot scrolls its timeline, likes and reposts, reads a context note under a
// wrong take, enjoys a ratio, and now and then writes a post of its own.
import { CHIRP_POSTS, CHIRP_TRENDS, CHIRP_MINE, type ChirpPost } from "../content/social";
import { pickFresh } from "../content";
import { Kit, runApp, rnd, chance, shuffle, h, avatar, seedOf, touch, typeInto, scrollTo, calm, fmtN, ICON, type SoHost, type SoOpts } from "./kit";
import { sceneCanvas } from "./scenes";
import "./chirp.css";
import { phoneKeyboard } from "./keyboard";

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.4" y="2.4" width="1.4" height="4.4" rx=".7"/><circle cx="11.1" cy="2.6" r="1.7"/><circle cx="11" cy="13.6" r="7.6"/><path d="M18 12 22.6 13.8 18 15.6Z"/><circle cx="14" cy="12" r="1.4" fill="#0d1120"/><path d="M5.6 14.4c2.1-.3 4 .8 4.6 2.7-2.1.6-4.1-.6-4.6-2.7Z" fill="#0d1120" opacity=".35"/></svg>`;
const NAV = ["Home", "Explore", "Notifications", "Messages", "Bookmarks", "Profile"];
const NAV_ICON = [
  `<path d="M12 3 2.5 10.5V21h7v-6h5v6h7V10.5Z"/>`,
  `<path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.5 1.5-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/>`,
  `<path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5v4.5l2 3.5h-17l2-3.5V9A6.5 6.5 0 0 1 12 2.5ZM9.5 19h5a2.5 2.5 0 0 1-5 0Z"/>`,
  `<path d="M3 5h18v14H3Zm2 2.3V17h14V7.3l-7 5Zm1.6-.3L12 10.9 17.4 7Z"/>`,
  `<path d="M6 2.5h12V22l-6-4-6 4Z"/>`,
  `<path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 10.5c4.4 0 8 2.4 8 6.5H4c0-4.1 3.6-6.5 8-6.5Z"/>`,
];
const VIEWS = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7" width="3" height="13" rx="1"/><rect x="17" y="3" width="3" height="17" rx="1"/></svg>`;
const NOTE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5v2h10V8Zm0 4v2h6v-2Z"/></svg>`;

type P = ChirpPost & { el?: HTMLElement; liked?: boolean };

export async function scrollChirp(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Chirp(k, body, opts).session(); });
}

const nextMine = () => mine();
const mine = pickFresh(CHIRP_MINE, "lucid:chirp-mine");

class Chirp {
  root: HTMLElement;
  phone: boolean;
  feed!: HTMLElement;
  composer!: HTMLElement;
  compText!: HTMLElement;
  postBtn!: HTMLElement;
  tabs!: HTMLElement[];
  me: string;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.phone = !!opts.phone;
    this.me = opts.me || "robot";
    body.innerHTML = "";
    this.root = h("div", `so-cp${this.phone ? " so-ph" : ""}`);
    body.appendChild(this.root);
    this.build();
  }

  build() {
    const nav = NAV.map((n, i) => `<span class="so-cp-nav${i === 0 ? " on" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[i]}</svg><b>${n}</b></span>`).join("");
    this.root.innerHTML = `
      <nav class="so-cp-rail"><span class="so-cp-logo">${LOGO}</span>${nav}<span class="so-cp-postbig">Post</span></nav>
      <main class="so-cp-main">
        <header class="so-cp-head"><span class="so-av so-cp-meav">${avatar("#ff9f5a", seedOf(this.me))}</span><span class="so-cp-logo sm">${LOGO}</span><div class="so-cp-tabs"><span class="on">For you</span><span>Following</span></div></header>
        <div class="so-cp-feed">
          <div class="so-cp-comp"><span class="so-av">${avatar("#ff9f5a", seedOf(this.me))}</span><div class="so-cp-cin"><span class="so-cp-ph">What's buzzing?</span><span class="so-cp-ct"></span></div><span class="so-cp-send">Post</span></div>
        </div>
        <span class="so-cp-fab">+</span>
        <footer class="so-cp-bar">${NAV_ICON.slice(0, 4).map((p, i) => `<svg class="${i === 0 ? "on" : ""}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`).join("")}</footer>
      </main>
      <aside class="so-cp-side">
        <div class="so-cp-search">${ICON.search}<span>Search</span></div>
        <section class="so-cp-trends"><h4>Buzzing now</h4>${CHIRP_TRENDS.map(([cat, t]) => `<div><small>${cat} · Trending</small><b></b><small>${fmtN(Math.round(2000 + seedOf(t) % 90000))} posts</small></div>`).join("")}</section>
      </aside>`;
    this.root.querySelectorAll(".so-cp-trends b").forEach((b, i) => (b.textContent = CHIRP_TRENDS[i][1]));
    this.feed = this.root.querySelector(".so-cp-feed")!;
    this.composer = this.root.querySelector(".so-cp-comp")!;
    this.compText = this.root.querySelector(".so-cp-ct")!;
    this.postBtn = this.root.querySelector(".so-cp-send")!;
    this.tabs = [...this.root.querySelectorAll<HTMLElement>(".so-cp-tabs span")];
    this.fill();
  }

  fill() {
    this.feed.querySelectorAll(".so-cp-post").forEach((e) => e.remove());
    const posts: P[] = shuffle(CHIRP_POSTS.map((p) => ({ ...p })));
    // always one wrong take with a note and one ratio in view, early on
    const noted = posts.findIndex((p) => p.note), ratio = posts.findIndex((p) => p.ratio);
    const order = [...posts.slice(0, 1), posts[noted], ...posts.slice(1, 3), posts[ratio], ...posts.slice(3)].filter((p, i, a) => a.indexOf(p) === i).slice(0, this.phone ? 7 : 8);
    for (const p of order) this.feed.appendChild(this.render(p));
  }

  render(p: P, ago?: string) {
    const el = h("article", "so-cp-post");
    const time = ago ?? `${1 + (seedOf(p.t) % 11)}h`;
    el.innerHTML = `<span class="so-av">${avatar(["#4fb6ff", "#ff6f91", "#4ff0a0", "#b07cff", "#ffc94d", "#ff9f5a"][seedOf(p.handle) % 6], seedOf(p.handle))}</span>
      <div class="so-cp-col">
        <div class="so-cp-who"><b></b><span></span></div>
        <p class="so-cp-txt"></p>
        ${p.img ? `<div class="so-cp-img"></div>` : ""}
        ${p.note ? `<div class="so-cp-note"><b>${NOTE}Other robots added context</b><p></p></div>` : ""}
        <div class="so-cp-acts">
          <span class="a-rep">${ICON.reply}<i>${fmtN(p.replies)}</i></span>
          <span class="a-rt">${ICON.repost}<i>${fmtN(p.reposts)}</i></span>
          <span class="a-like">${ICON.heart}<i>${fmtN(p.likes)}</i></span>
          <span class="a-views">${VIEWS}<i>${fmtN(p.likes * 31 + 120)}</i></span>
        </div>
      </div>`;
    el.querySelector(".so-cp-who b")!.textContent = p.name;
    el.querySelector(".so-cp-who span")!.textContent = `@${p.handle} · ${time}`;
    el.querySelector(".so-cp-txt")!.textContent = p.t;
    if (p.note) el.querySelector(".so-cp-note p")!.textContent = p.note;
    if (p.img) { const w = this.phone ? 96 : 300; el.querySelector(".so-cp-img")!.appendChild(sceneCanvas(p.img, w, Math.round(w * 0.46))); }
    if (p.ratio) {
      const r = h("div", "so-cp-reply");
      r.innerHTML = `<span class="so-av">${avatar("#4ff0a0", seedOf(p.ratio.handle))}</span><div class="so-cp-col"><div class="so-cp-who"><b></b><span></span></div><small class="so-cp-rto"></small><p class="so-cp-txt"></p><div class="so-cp-acts"><span class="a-like hot">${ICON.heart}<i>${fmtN(p.ratio.likes)}</i></span></div></div>`;
      r.querySelector("b")!.textContent = p.ratio.name;
      r.querySelector(".so-cp-who span")!.textContent = `@${p.ratio.handle} · 1h`;
      r.querySelector(".so-cp-rto")!.textContent = `Replying to @${p.handle}`;
      r.querySelector("p")!.textContent = p.ratio.t;
      (r as HTMLElement & { _p?: P })._p = { ...p.ratio, reposts: 0, replies: 0 };
      el.appendChild(r);
      el.classList.add("has-reply");
    }
    p.el = el;
    (el as HTMLElement & { _p?: P })._p = p;
    return el;
  }

  async tap(el: Element, ax = 0.5) { if (this.phone) await touch(this.k, el, this.root); else await this.k.click(el, ax, 0.5); }

  async like(el: HTMLElement) {
    const p = (el as HTMLElement & { _p?: P })._p!;
    const btn = el.querySelector(".so-cp-acts .a-like") as HTMLElement;
    await this.tap(btn, 0.25);
    if (p.liked) return;
    p.liked = true;
    btn.classList.add("on");
    btn.querySelector("i")!.textContent = fmtN(p.likes + 1);
    if (!calm()) {
      this.k.fromTo(btn.querySelector("svg"), { scale: 0.4 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
      for (let i = 0; i < 6; i++) {
        const dot = h("b", "so-cp-dot");
        btn.appendChild(dot);
        const a = (i / 6) * Math.PI * 2;
        this.k.fromTo(dot, { x: 0, y: 0, opacity: 1 }, { x: Math.cos(a) * 10, y: Math.sin(a) * 10, opacity: 0, duration: 0.45, ease: "power2.out", onComplete: () => dot.remove() });
      }
    }
  }

  async repost(el: HTMLElement) {
    const p = (el as HTMLElement & { _p?: P })._p!;
    const btn = el.querySelector(".so-cp-acts .a-rt") as HTMLElement;
    await this.tap(btn, 0.25);
    btn.classList.add("on");
    btn.querySelector("i")!.textContent = fmtN(p.reposts + 1);
    if (!calm()) this.k.fromTo(btn.querySelector("svg"), { rotation: -180 }, { rotation: 0, duration: 0.5, ease: "power2.out" });
  }

  async write() {
    scrollTo(this.k, this.feed, 0, 0.6);
    await this.k.sleep(700);
    if (this.phone) { await touch(this.k, this.root.querySelector(".so-cp-fab")!, this.root); this.root.classList.add("composing"); }
    else await this.k.click(this.composer.querySelector(".so-cp-cin")!, 0.3);
    this.composer.classList.add("has");
    const text = nextMine();
    const kb = this.phone ? phoneKeyboard(this.k, this.root, { dark: true, accent: "#5b8cff" }) : undefined;
    await kb?.open({ ret: "return" });
    await typeInto(this.k, this.compText, text, { phone: this.phone, skill: this.opts.skill, kb });
    await this.k.sleep(rnd(500, 1000));
    await this.tap(this.postBtn);
    await kb?.close();
    this.compText.textContent = "";
    this.composer.classList.remove("has");
    this.root.classList.remove("composing");
    const p: P = { name: this.me, handle: this.me.toLowerCase().replace(/\s+/g, ""), t: text, likes: 0, reposts: 0, replies: 0 };
    const el = this.render(p, "now");
    el.classList.add("mine");
    this.composer.after(el);
    if (!calm()) this.k.from(el, { height: 0, opacity: 0, duration: 0.4, ease: "power2.out", clearProps: "height" });
    // the likes trickle in while it watches, a little proud
    const likeEl = el.querySelector(".a-like i") as HTMLElement;
    let n = 0;
    for (let i = 0; i < 5; i++) {
      await this.k.sleep(rnd(700, 1400));
      n += 1 + Math.floor(Math.random() * (i + 2));
      likeEl.textContent = String(n);
      if (!calm()) this.k.fromTo(likeEl, { y: -4, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.25 });
    }
    this.k.host.react(n > 12 ? "cheer" : "relax");
  }

  async read() {
    const posts = [...this.feed.querySelectorAll<HTMLElement>(".so-cp-post:not(.mine)")];
    for (const el of posts) {
      if (this.k.left < 5000) return;
      scrollTo(this.k, this.feed, el.offsetTop - (this.phone ? 4 : 8), this.phone ? 0.45 : 0.6);
      if (this.phone) (this.k.host as SoHost).thumb?.("swipe");
      else (this.k.host as SoHost).scroll?.();
      const p = (el as HTMLElement & { _p?: P })._p!;
      await this.k.sleep(900 + p.t.length * rnd(28, 40) + (p.img ? 900 : 0));
      if (p.note) {
        await this.k.sleep(rnd(1500, 2300));
        this.k.host.react(chance(0.5) ? "laugh" : "surprised");
      } else if (p.ratio) {
        const r = el.querySelector(".so-cp-reply") as HTMLElement;
        scrollTo(this.k, this.feed, r.offsetTop + el.offsetTop - 40, 0.5);
        await this.k.sleep(rnd(1400, 2000));
        this.k.host.react("laugh");
        if (chance(0.6)) await this.like(r);
      } else if (chance(0.35)) await this.like(el);
      if (!p.note && chance(0.12)) await this.repost(el);
    }
  }

  async session() {
    await this.k.sleep(rnd(700, 1200));
    if (chance(0.3)) {
      await this.tap(this.tabs[1]);
      this.tabs.forEach((t, i) => t.classList.toggle("on", i === 1));
      this.fill();
      await this.k.sleep(rnd(600, 900));
    }
    const writes = chance(0.45);
    await this.read();
    if (writes && this.k.left > 12000) await this.write();
    while (this.k.left > 8000) {
      // pull to refresh: new posts load in
      scrollTo(this.k, this.feed, 0, 0.5);
      await this.k.sleep(800);
      this.fill();
      if (!calm()) this.k.from(this.feed.querySelectorAll(".so-cp-post"), { opacity: 0, duration: 0.3, stagger: 0.04 });
      await this.read();
    }
  }
}
