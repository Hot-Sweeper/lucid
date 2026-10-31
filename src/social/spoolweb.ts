// Spool on the web: the desktop version of the short clip feed. One vertical video in the
// middle with the action column beside it, the mouse wheel (or the arrow key) moves to the
// next clip, a double click likes it with a heart burst, and the comments open on the right
// where the robot reads, likes a comment and now and then types its own.
import { VIDEOS, type VideoDef } from "../fun/videos";
import { TUBE_COMMENTS, BOTCORD_USERS } from "../content";
import { TUBE_MY_COMMENTS } from "../content/social";
import { Kit, runApp, rnd, chance, pick, shuffle, h, avatar, seedOf, typeInto, calm, canvas, fmtN, ICON, type SoHost, type SoOpts } from "./kit";
import "./spoolweb.css";

const COLS = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#ffc94d"];
const I = {
  mark: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ff6f91"/><path d="M12 2a10 10 0 0 1 10 10H12Z" fill="#7fd3ff"/><circle cx="12" cy="12" r="3.4" fill="#141a33"/></svg>`,
  talk: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c5.1 0 9.3 3.5 9.3 7.9s-4.2 7.9-9.3 7.9c-1 0-2-.1-2.9-.4l-3.9 2.1c-.6.3-1.3-.2-1.2-.9l.5-3.3c-1.8-1.4-2.8-3.3-2.8-5.4 0-4.4 4.2-7.9 9.3-7.9z"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h12V22l-6-4-6 4Z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 3.6c0-.8.9-1.2 1.5-.7l7.2 6.6c.4.4.4 1 0 1.4l-7.2 6.6c-.6.5-1.5.1-1.5-.7v-3.4c-4.7 0-7.9 1.5-10.3 4.8-.4.5-1.2.2-1.1-.4.9-5.7 4.4-9.5 11.4-10.2V3.6z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 10.5V21h7v-6h5v6h7V10.5Z"/></svg>`,
  people: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm7.5 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM9 13.5c4 0 7 2 7 5.5H2c0-3.5 3-5.5 7-5.5Zm8 .5c3 .2 5 1.9 5 5h-4c0-2-.4-3.6-1-5Z"/></svg>`,
  live: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h13a2 2 0 0 1 2 2v1.5l4-2.5v10l-4-2.5V16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.3 4.9 5.7 5.7 5.7-5.7 1.4 1.4-5.7 5.7 5.7 5.7-1.4 1.4-5.7-5.7-5.7 5.7-1.4-1.4 5.7-5.7-5.7-5.7Z"/></svg>`,
};

type Clip = { v: VideoDef; el: HTMLElement; ctx: CanvasRenderingContext2D; t0: number; likes: number; liked: boolean; user: string };

export async function scrollSpoolWeb(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new SpoolWeb(k, body, opts).session(); });
}

class SpoolWeb {
  root: HTMLElement;
  stage!: HTMLElement;
  panel!: HTMLElement;
  cur!: Clip;
  order: VideoDef[];
  idx = 0;
  vw = 170;
  vh = 302;
  me: string;
  open = false;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.me = (opts.me || "pip").toLowerCase();
    body.innerHTML = "";
    this.root = h("div", "so-sw");
    body.appendChild(this.root);
    this.order = shuffle([...VIDEOS]);
    this.build();
    k.every((now) => {
      const c = this.cur;
      if (!c) return;
      c.ctx.save(); c.v.draw(c.ctx, this.vw, this.vh, calm() ? 2 : (now - c.t0) / 1000); c.ctx.restore();
    });
  }

  build() {
    const follows = shuffle([...BOTCORD_USERS]).slice(0, 4);
    this.root.innerHTML = `
      <header class="so-sw-top"><span class="so-sw-logo">${I.mark}<b>Spool</b></span><span class="so-sw-search"><span>Search</span>${ICON.search}</span><span class="so-sw-up">Upload</span><span class="so-av">${avatar("#35c37a", seedOf(this.me))}</span></header>
      <nav class="so-sw-nav">
        <span class="on">${I.home}For You</span><span>${I.people}Following</span><span>${ICON.search}Explore</span><span>${I.live}LIVE</span>
        <h6>Following accounts</h6>${follows.map((u) => `<span class="so-sw-acc"><i class="so-av">${avatar(COLS[seedOf(u) % 6], seedOf(u))}</i>${u}</span>`).join("")}
      </nav>
      <main class="so-sw-main"><div class="so-sw-stage"></div></main>
      <aside class="so-sw-panel"><header><b>Comments</b><span class="so-sw-n"></span><span class="so-sw-x">${I.x}</span></header><div class="so-sw-cms"></div>
        <footer><div class="so-sw-in"><span class="so-sw-ph">Add comment...</span><span class="so-sw-tx"></span></div><b class="so-sw-post">Post</b></footer></aside>
      <div class="so-sw-fx"></div>`;
    this.stage = this.root.querySelector(".so-sw-stage")!;
    this.panel = this.root.querySelector(".so-sw-panel")!;
    this.cur = this.clip(this.order[0]);
  }

  clip(v: VideoDef): Clip {
    const user = v.post?.user ?? v.channel.toLowerCase().replace(/\s+/g, ".");
    const likes = 2000 + (seedOf(v.id) % 400000);
    const el = h("div", "so-sw-clip");
    el.innerHTML = `<div class="so-sw-vid"><canvas></canvas><div class="so-sw-cap"><b></b><p></p><small>original sound</small></div><div class="so-sw-prog"><i></i></div></div>
      <div class="so-sw-acts">
        <span class="so-sw-av"><i class="so-av">${avatar(v.color ?? COLS[seedOf(user) % 6], seedOf(user))}</i><s>+</s></span>
        <span class="a-like"><i>${ICON.heart}</i><b>${fmtN(likes)}</b></span>
        <span class="a-talk"><i>${I.talk}</i><b>${fmtN(Math.round(likes / 60))}</b></span>
        <span><i>${I.save}</i><b>${fmtN(Math.round(likes / 25))}</b></span>
        <span><i>${I.share}</i><b>${fmtN(Math.round(likes / 90))}</b></span>
      </div>`;
    el.querySelector(".so-sw-cap b")!.textContent = `@${user}`;
    el.querySelector(".so-sw-cap p")!.textContent = v.post?.caption ?? v.title;
    this.stage.appendChild(el);
    const ctx = canvas(el.querySelector("canvas")!, this.vw, this.vh);
    const c: Clip = { v, el, ctx, t0: performance.now(), likes, liked: false, user };
    const bar = el.querySelector(".so-sw-prog i") as HTMLElement;
    // the progress bar runs on a transform, set once per loop (no per frame writes)
    if (!calm()) this.k.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: v.loop, ease: "none", repeat: -1 });
    return c;
  }

  /** Next clip: the wheel or the down arrow, the stage slides up like the real site. */
  async next() {
    if (chance(0.6)) { (this.k.host as SoHost).scroll?.(); await this.k.point(this.cur.el.querySelector(".so-sw-vid")!, 0.5, rnd(0.4, 0.6)); }
    else this.k.tap("ArrowDown");
    this.idx = (this.idx + 1) % this.order.length;
    const old = this.cur;
    const n = this.clip(this.order[this.idx]);
    const dist = old.el.offsetHeight + 12;
    if (calm()) { old.el.remove(); }
    else {
      this.k.set(n.el, { y: dist });
      await new Promise<void>((r) => {
        this.k.to(old.el, { y: -dist, duration: 0.55, ease: "expo.inOut", onComplete: () => old.el.remove() });
        this.k.to(n.el, { y: 0, duration: 0.55, ease: "expo.inOut", onComplete: () => r() });
      });
    }
    this.cur = n;
    if (this.open) this.fillComments();
  }

  likeIcon(c: Clip) {
    if (c.liked) return;
    c.liked = true;
    c.likes++;
    const btn = c.el.querySelector(".a-like") as HTMLElement;
    btn.classList.add("on");
    btn.querySelector("b")!.textContent = fmtN(c.likes);
    if (!calm()) this.k.fromTo(btn.querySelector("svg"), { scale: 0.5 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
  }

  /** A double click on the video: a heart bursts where the cursor is. */
  async doubleClick() {
    const vid = this.cur.el.querySelector(".so-sw-vid") as HTMLElement;
    const ax = rnd(0.3, 0.7), ay = rnd(0.3, 0.6);
    await this.k.point(vid, ax, ay);
    await this.k.host.click();
    await this.k.host.click();
    const heart = h("span", "so-sw-burst", ICON.heart);
    vid.appendChild(heart);
    heart.style.left = `${this.vw * ax}px`;
    heart.style.top = `${this.vh * ay}px`;
    if (calm()) this.k.later(() => heart.remove(), 700);
    else {
      this.k.tl({ onComplete: () => heart.remove() })
        .fromTo(heart, { scale: 0, rotation: rnd(-25, 25), opacity: 1 }, { scale: 1.15, duration: 0.3, ease: "back.out(2.5)" })
        .to(heart, { scale: 1, duration: 0.12 })
        .to(heart, { y: -40, opacity: 0, scale: 1.3, duration: 0.45, ease: "power2.in" }, "+=0.25");
    }
    this.likeIcon(this.cur);
    await this.k.sleep(500);
  }

  fillComments() {
    const v = this.cur.v;
    const list = this.panel.querySelector(".so-sw-cms") as HTMLElement;
    const texts = [...(v.comments ?? []), ...shuffle([...TUBE_COMMENTS])].slice(0, 6);
    list.innerHTML = texts.map((t, i) => {
      const u = BOTCORD_USERS[(seedOf(v.id) + i * 7) % BOTCORD_USERS.length];
      return `<div class="so-sw-cm"><i class="so-av">${avatar(COLS[seedOf(u) % 6], seedOf(u))}</i><div><b></b><p></p><small>${1 + i}d ago<span>Reply</span></small></div><span class="so-sw-cl"><i>${ICON.heart}</i><b>${fmtN(3 + (seedOf(t) % 900))}</b></span></div>`;
    }).join("");
    list.querySelectorAll(".so-sw-cm").forEach((el, i) => {
      el.querySelector("b")!.textContent = BOTCORD_USERS[(seedOf(v.id) + i * 7) % BOTCORD_USERS.length];
      el.querySelector("p")!.textContent = texts[i];
    });
    this.panel.querySelector(".so-sw-n")!.textContent = `${fmtN(Math.round(this.cur.likes / 60))}`;
  }

  async comments() {
    await this.k.click(this.cur.el.querySelector(".a-talk")!);
    this.fillComments();
    if (!this.open) {
      this.open = true;
      this.root.classList.add("cms");
      if (!calm()) await new Promise<void>((r) => this.k.fromTo(this.panel, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power2.out", onComplete: () => r() }));
    }
    const list = this.panel.querySelector(".so-sw-cms") as HTMLElement;
    const items = [...list.querySelectorAll<HTMLElement>(".so-sw-cm")];
    for (const c of items.slice(0, 2 + Math.floor(Math.random() * 2))) {
      await this.k.point(c, 0.35, 0.5, 500);
      await this.k.sleep(rnd(700, 1300));
    }
    if (chance(0.6)) {
      // like someone's comment: the little heart fills and counts up
      const c = pick(items.slice(0, 3));
      const like = c.querySelector(".so-sw-cl") as HTMLElement;
      await this.k.click(like);
      like.classList.add("on");
      const b = like.querySelector("b")!;
      b.textContent = String(Number(b.textContent) + 1 || b.textContent);
      if (!calm()) this.k.fromTo(like.querySelector("svg"), { scale: 0.4 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      await this.k.sleep(rnd(500, 900));
    }
    if (chance(0.55) && this.k.left > 12000) {
      const box = this.panel.querySelector(".so-sw-in") as HTMLElement, tx = box.querySelector(".so-sw-tx") as HTMLElement;
      const post = this.panel.querySelector(".so-sw-post") as HTMLElement;
      await this.k.click(box, 0.3, 0.5);
      box.classList.add("has");
      const text = pick(TUBE_MY_COMMENTS);
      await typeInto(this.k, tx, text, { skill: this.opts.skill });
      post.classList.add("on");
      await this.k.sleep(rnd(250, 500));
      if (chance(0.5)) this.k.tap("Enter"); else await this.k.click(post);
      tx.textContent = ""; box.classList.remove("has"); post.classList.remove("on");
      const mine = h("div", "so-sw-cm me", `<i class="so-av">${avatar("#35c37a", seedOf(this.me))}</i><div><b></b><p></p><small>now<span>Reply</span></small></div><span class="so-sw-cl"><i>${ICON.heart}</i><b>0</b></span>`);
      mine.querySelector("b")!.textContent = this.me;
      mine.querySelector("p")!.textContent = text;
      list.prepend(mine);
      list.scrollTop = 0;
      if (!calm()) this.k.from(mine, { opacity: 0, y: -8, duration: 0.3, ease: "power2.out" });
      await this.k.sleep(rnd(1200, 2000));
    }
    if (chance(0.5)) {
      await this.k.click(this.panel.querySelector(".so-sw-x")!);
      this.open = false;
      if (!calm()) await new Promise<void>((r) => this.k.to(this.panel, { x: 40, opacity: 0, duration: 0.22, onComplete: () => r() }));
      this.root.classList.remove("cms");
      this.k.set(this.panel, { x: 0, opacity: 1 });
    }
  }

  async session() {
    await this.k.sleep(rnd(600, 1000));
    while (this.k.left > 5000) {
      const funny = !!this.cur.v.post?.funny;
      const watch = rnd(3000, 6500);
      const t0 = performance.now();
      let liked = false;
      while (performance.now() - t0 < watch) {
        if (!liked && performance.now() - t0 > watch * 0.4 && chance(0.4)) { liked = true; await this.doubleClick(); }
        if (funny && chance(0.04)) this.k.host.react("laugh");
        await this.k.sleep(250);
      }
      if (chance(0.25) && this.k.left > 14000) await this.comments();
      else if (!liked && chance(0.12)) { await this.k.click(this.cur.el.querySelector(".a-like")!); this.likeIcon(this.cur); }
      await this.next();
      if (chance(0.15)) this.k.host.react("relax");
    }
  }
}
