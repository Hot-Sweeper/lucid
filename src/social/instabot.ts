// Instabot: a photo feed on the robot's phone. Stories along the top, drawn photos of robots at
// the beach and latte art, double-tap hearts, and now and then a few short clips.
import { INSTA_POSTS, INSTA_STORIES, INSTA_COMMENTS, INSTA_MY_COMMENTS, INSTA_DMS, type InstaPost } from "../content/social";
import { VIDEOS } from "../fun/videos";
import { Kit, runApp, rnd, chance, pick, shuffle, h, avatar, seedOf, touch, calm, fmtN, canvas, ICON, type SoHost, type SoOpts } from "./kit";
import { SCENES } from "./scenes";
import "./instabot.css";
import { typeInto } from "./kit";
import { phoneKeyboard } from "./keyboard";
import { theyType, dotsBubble } from "./typing";

const COLS = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#ffc94d"];
const nextComment = (() => { let bag: string[] = []; return () => { if (!bag.length) bag = shuffle([...INSTA_MY_COMMENTS]); return bag.pop()!; }; })();

const I = {
  heart: ICON.heart,
  talk: ICON.reply,
  send: ICON.send,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h12V22l-6-4-6 4Zm2 2v13.6l4-2.7 4 2.7V4.5Z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 10.5V21h7v-6h5v6h7V10.5Z"/></svg>`,
  reels: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 5v11h14V8Zm5 2.5 5 3-5 3Z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h14V5Zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3Z"/></svg>`,
  me: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 10.5c4.4 0 8 2.4 8 6.5H4c0-4.1 3.6-6.5 8-6.5Z"/></svg>`,
};

type Post = InstaPost & { el: HTMLElement; ctx: CanvasRenderingContext2D; liked: boolean };

export async function scrollInstabot(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Instabot(k, body, opts).session(); });
}

class Instabot {
  root: HTMLElement;
  feed!: HTMLElement;
  w: number;
  posts: Post[] = [];
  live: Post | null = null;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    body.innerHTML = "";
    this.root = h("div", "so-ig so-ph");
    body.appendChild(this.root);
    this.w = body.clientWidth || 134;
    this.build();
    // only the photo on screen is drawn, and only while the app runs
    const t0 = performance.now();
    let last = 0;
    k.every((now) => {
      if (!this.live || now - last < 50 || calm()) return;
      last = now;
      const p = this.live;
      p.ctx.save(); (SCENES[p.scene] ?? SCENES.sunset)(p.ctx, this.w, this.w, (now - t0) / 1000); p.ctx.restore();
    });
  }

  build() {
    this.root.innerHTML = `
      <header class="so-ig-top"><b>Instabot</b><span>${I.heart}<i class="so-ig-dm">${I.send}</i></span></header>
      <div class="so-ig-feed">
        <div class="so-ig-stories">${INSTA_STORIES.map((s, i) => `<span class="so-ig-st${i === 0 ? " me" : ""}"><i>${avatar(["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#ffc94d"][seedOf(s) % 6], seedOf(s))}</i><small>${i === 0 ? "Your story" : s}</small></span>`).join("")}</div>
      </div>
      <nav class="so-ig-nav"><span class="on">${I.home}</span><span>${ICON.search}</span><span>${I.plus}</span><span class="so-ig-reels">${I.reels}</span><span>${I.me}</span></nav>
      <div class="so-ig-fx"></div>`;
    this.feed = this.root.querySelector(".so-ig-feed")!;
    for (const p of shuffle([...INSTA_POSTS]).slice(0, 6)) {
      const el = h("article", "so-ig-post");
      el.innerHTML = `<header><span class="so-av">${avatar(["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91"][seedOf(p.user) % 5], seedOf(p.user))}</span><b></b><i>...</i></header>
        <div class="so-ig-ph"><canvas></canvas></div>
        <div class="so-ig-acts"><span class="a-like">${I.heart}</span><span class="a-talk">${I.talk}</span><span>${I.send}</span><span class="a-save">${I.save}</span></div>
        <div class="so-ig-likes"><b></b> likes</div>
        <p class="so-ig-cap"><b></b> <span></span></p>
        <small class="so-ig-more"></small>`;
      el.querySelector("header b")!.textContent = p.user;
      el.querySelector(".so-ig-likes b")!.textContent = p.likes.toLocaleString("en-US");
      el.querySelector(".so-ig-cap b")!.textContent = p.user;
      el.querySelector(".so-ig-cap span")!.textContent = p.caption;
      el.querySelector(".so-ig-more")!.textContent = `View all ${3 + (seedOf(p.caption) % 40)} comments`;
      const ctx = canvas(el.querySelector("canvas")!, this.w, this.w);
      (SCENES[p.scene] ?? SCENES.sunset)(ctx, this.w, this.w, 1.5);
      this.feed.appendChild(el);
      this.posts.push({ ...p, el, ctx, liked: false });
    }
  }

  scrollTo(y: number, secs = 0.55) {
    const max = this.feed.scrollHeight - this.feed.clientHeight;
    const to = Math.max(0, Math.min(max, y));
    if (calm()) { this.feed.scrollTop = to; return Promise.resolve(); }
    return new Promise<void>((r) => this.k.to(this.feed, { scrollTop: to, duration: secs, ease: "power2.out", onComplete: () => r() }));
  }

  async doubleTap(p: Post) {
    const ph = p.el.querySelector(".so-ig-ph") as HTMLElement;
    await touch(this.k, ph, this.root, "doubleTap");
    const big = h("span", "so-ig-big", I.heart);
    ph.appendChild(big);
    if (calm()) this.k.later(() => big.remove(), 700);
    else this.k.tl({ onComplete: () => big.remove() })
      .fromTo(big, { scale: 0, opacity: 1, rotation: rnd(-15, 15) }, { scale: 1.1, duration: 0.3, ease: "back.out(3)" })
      .to(big, { scale: 1, duration: 0.1 })
      .to(big, { scale: 0.2, y: -20, opacity: 0, duration: 0.35, ease: "power2.in" }, "+=0.35");
    if (!p.liked) {
      p.liked = true;
      const like = p.el.querySelector(".a-like") as HTMLElement;
      like.classList.add("on");
      p.el.querySelector(".so-ig-likes b")!.textContent = (p.likes + 1).toLocaleString("en-US");
      if (!calm()) this.k.fromTo(like.querySelector("svg"), { scale: 0.5 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
    }
    await this.k.sleep(700);
  }

  async feedRead() {
    for (const p of this.posts) {
      if (this.k.left < 4000) return;
      (this.k.host as SoHost).thumb?.("swipe");
      await this.scrollTo(p.el.offsetTop - 2);
      this.live = p;
      await this.k.sleep(rnd(1800, 3200));
      if (chance(0.5)) await this.doubleTap(p);
      if (chance(0.22) && this.k.left > 14000) await this.comment(p);
      if (chance(0.25)) this.k.host.react(chance(0.5) ? "relax" : "cheer");
      // a peek at the caption below
      await this.scrollTo(p.el.offsetTop + this.w * 0.5, 0.4);
      await this.k.sleep(rnd(900, 1600));
      if (chance(0.15)) {
        const save = p.el.querySelector(".a-save") as HTMLElement;
        await touch(this.k, save, this.root);
        save.classList.add("on");
      }
    }
  }

  async story() {
    await this.scrollTo(0, 0.4);
    const items = [...this.root.querySelectorAll<HTMLElement>(".so-ig-st:not(.me)")];
    const start = Math.floor(Math.random() * 3);
    await touch(this.k, items[start], this.root);
    const view = h("div", "so-ig-story");
    view.innerHTML = `<div class="so-ig-bars">${[0, 1, 2].map(() => `<i><s></s></i>`).join("")}</div><header><span class="so-av"></span><b></b></header><canvas></canvas><p></p><footer><span>Send message</span>${I.heart}${I.send}</footer>`;
    this.root.appendChild(view);
    if (!calm()) this.k.fromTo(view, { scale: 0.2, opacity: 0, transformOrigin: "30% 12%" }, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" });
    const hgt = this.root.clientHeight || 284;
    const ctx = canvas(view.querySelector("canvas")!, this.w, hgt);
    const scenes = shuffle(Object.keys(SCENES).filter((s) => !["morning", "meme", "split"].includes(s)));
    for (let i = 0; i < 3; i++) {
      const who = INSTA_STORIES[1 + ((start + i) % (INSTA_STORIES.length - 1))];
      view.querySelector("header .so-av")!.innerHTML = avatar(["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#ffc94d"][seedOf(who) % 6], seedOf(who));
      view.querySelector("header b")!.textContent = `${who}  ${1 + i * 3}h`;
      view.querySelector("p")!.textContent = pick(["good morning", "this view", "lunch break", "feeling cute", "guess where", "best day"]);
      const kind = scenes[i];
      const t0 = performance.now(), dur = rnd(2600, 3600);
      const bar = view.querySelectorAll<HTMLElement>(".so-ig-bars s")[i];
      const stop = this.k.every((now) => {
        const p = Math.min(1, (now - t0) / dur);
        bar.style.transform = `scaleX(${p.toFixed(3)})`;
        ctx.save(); (SCENES[kind])(ctx, this.w, hgt, calm() ? 1.5 : (now - t0) / 1000); ctx.restore();
      });
      await this.k.sleep(dur);
      stop();
      bar.style.transform = "scaleX(1)";
      if (i < 2) await touch(this.k, view.querySelector("canvas")!, this.root);
    }
    if (!calm()) await new Promise<void>((r) => this.k.to(view, { y: hgt, duration: 0.3, ease: "power2.in", onComplete: () => r() }));
    view.remove();
  }

  async reels() {
    const btn = this.root.querySelector(".so-ig-reels") as HTMLElement;
    await touch(this.k, btn, this.root);
    const view = h("div", "so-ig-reel");
    view.innerHTML = `<canvas></canvas><div class="so-ig-rside"><span>${I.heart}<b></b></span><span>${I.talk}<b></b></span><span>${I.send}</span></div><div class="so-ig-rinfo"><span class="so-av"></span><b></b><p></p></div><header>Reels</header>`;
    this.root.appendChild(view);
    const hgt = this.root.clientHeight || 284;
    const ctx = canvas(view.querySelector("canvas")!, this.w, hgt);
    const clips = shuffle([...VIDEOS]).slice(0, 2 + Math.floor(Math.random() * 2));
    for (const v of clips) {
      if (this.k.left < 3000) break;
      const user = v.post?.user ?? v.channel.toLowerCase().replace(/\s+/g, ".");
      view.querySelector(".so-ig-rinfo .so-av")!.innerHTML = avatar(v.color ?? "#ff9f5a", seedOf(user));
      view.querySelector(".so-ig-rinfo b")!.textContent = user;
      view.querySelector(".so-ig-rinfo p")!.textContent = v.post?.caption ?? v.title;
      const likes = 2000 + (seedOf(v.id) % 90000);
      view.querySelector(".so-ig-rside span b")!.textContent = fmtN(likes);
      view.querySelectorAll(".so-ig-rside span b")[1].textContent = fmtN(Math.round(likes / 40));
      const t0 = performance.now();
      const stop = this.k.every((now) => { ctx.save(); v.draw(ctx, this.w, hgt, (now - t0) / 1000); ctx.restore(); });
      await this.k.sleep(rnd(3500, 6000));
      if (v.post?.funny && chance(0.6)) this.k.host.react("laugh");
      stop();
      (this.k.host as SoHost).thumb?.("swipe");
      if (!calm()) await new Promise<void>((r) => this.k.fromTo(ctx.canvas, { y: 0 }, { y: -hgt * 0.15, duration: 0.18, ease: "power2.in", onComplete: () => { this.k.set(ctx.canvas, { y: 0 }); r(); } }));
    }
    view.remove();
    await touch(this.k, this.root.querySelector(".so-ig-nav span")!, this.root);
  }

  // Comments: a sheet slides up, the robot types one on its keyboard and posts it.
  async comment(p: Post) {
    await touch(this.k, p.el.querySelector(".a-talk")!, this.root);
    const sheet = h("div", "so-ig-sheet");
    const others = shuffle([...INSTA_COMMENTS]).slice(0, 3);
    sheet.innerHTML = `<i class="so-ig-grab"></i><header>Comments</header><div class="so-ig-cms">${others.map((t, i) => { const u = INSTA_STORIES[1 + ((i + seedOf(p.user)) % (INSTA_STORIES.length - 1))]; return `<div class="so-ig-cm"><span class="so-av">${avatar(COLS[seedOf(u) % 6], seedOf(u))}</span><p><b>${u}</b> ${t}</p></div>`; }).join("")}</div>
      <footer><span class="so-av">${avatar("#35c37a", seedOf(this.opts.me || "me"))}</span><div class="so-ig-in"><span class="so-ig-ph">Add a comment...</span><span class="so-ig-tx"></span></div><b class="so-ig-pbtn">Post</b></footer>`;
    this.root.appendChild(sheet);
    if (!calm()) await new Promise<void>((r) => this.k.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, duration: 0.32, ease: "power3.out", onComplete: () => r() }));
    await this.k.sleep(rnd(700, 1300));
    const input = sheet.querySelector(".so-ig-in") as HTMLElement, tx = sheet.querySelector(".so-ig-tx") as HTMLElement;
    const foot = sheet.querySelector("footer") as HTMLElement;
    await touch(this.k, input, this.root);
    const kb = phoneKeyboard(this.k, this.root, { accent: "#5a7dff" });
    await kb.open({ ret: "send", lift: [foot] });
    input.classList.add("has");
    const text = nextComment();
    await typeInto(this.k, tx, text, { phone: true, skill: this.opts.skill, kb });
    await this.k.sleep(rnd(250, 500));
    const post = sheet.querySelector(".so-ig-pbtn") as HTMLElement;
    post.classList.add("on");
    if (chance(0.5)) await kb.enter(); else await touch(this.k, post, this.root);
    tx.textContent = ""; input.classList.remove("has"); post.classList.remove("on");
    const mine = h("div", "so-ig-cm me", `<span class="so-av">${avatar("#35c37a", seedOf(this.opts.me || "me"))}</span><p><b></b> <span></span></p>`);
    mine.querySelector("b")!.textContent = (this.opts.me || "you").toLowerCase();
    mine.querySelector("p span")!.textContent = text;
    sheet.querySelector(".so-ig-cms")!.appendChild(mine);
    if (!calm()) this.k.from(mine, { opacity: 0, y: 6, duration: 0.3, ease: "power2.out" });
    const more = p.el.querySelector(".so-ig-more") as HTMLElement;
    more.textContent = more.textContent!.replace(/\d+/, (n) => String(Number(n) + 1));
    await kb.close();
    await this.k.sleep(rnd(1200, 2000));
    (this.k.host as SoHost).thumb?.("swipe");
    if (!calm()) await new Promise<void>((r) => this.k.to(sheet, { yPercent: 100, duration: 0.25, ease: "power2.in", onComplete: () => r() }));
    sheet.remove();
  }

  // Direct messages: a friend shares something, typing dots, the robot answers on its keyboard.
  async dms() {
    await this.scrollTo(0, 0.4);
    await touch(this.k, this.root.querySelector(".so-ig-dm")!, this.root);
    const dm = pick(INSTA_DMS);
    const view = h("div", "so-ig-dmv");
    view.innerHTML = `<header><span class="so-ig-bk"></span><span class="so-av">${avatar(COLS[seedOf(dm.user) % 6], seedOf(dm.user))}</span><div><b></b><small>Active now</small></div></header>
      <div class="so-ig-dmm"></div>
      <footer><div class="so-ig-in"><span class="so-ig-ph">Message...</span><span class="so-ig-tx"></span></div></footer>`;
    view.querySelector("header b")!.textContent = dm.user;
    this.root.appendChild(view);
    if (!calm()) this.k.fromTo(view, { xPercent: 100 }, { xPercent: 0, duration: 0.32, ease: "power3.out" });
    const list = view.querySelector(".so-ig-dmm") as HTMLElement, foot = view.querySelector("footer") as HTMLElement;
    const input = view.querySelector(".so-ig-in") as HTMLElement, tx = view.querySelector(".so-ig-tx") as HTMLElement;
    const add = (u: "me" | "them", t: string) => {
      const m = h("div", `so-ig-dmb ${u}`);
      m.textContent = t;
      list.appendChild(m);
      if (!calm()) this.k.fromTo(m, { opacity: 0, scale: 0.85, transformOrigin: u === "me" ? "100% 100%" : "0% 100%" }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" });
    };
    await this.k.sleep(rnd(600, 1000));
    const kb = phoneKeyboard(this.k, view, { accent: "#5a7dff" });
    for (const l of dm.lines) {
      if (this.k.left < 3000) break;
      if (l.u === "them") {
        await this.k.sleep(rnd(300, 700));
        await theyType(this.k, l.t, () => dotsBubble(this.k, list, "so-ig-dmb them dots"));
        add("them", l.t);
        await this.k.sleep(500 + l.t.length * rnd(30, 45));
        if (chance(0.3)) this.k.host.react(chance(0.5) ? "laugh" : "shy");
      } else {
        if (!kb.up) await touch(this.k, input, view);
        await kb.open({ ret: "send", lift: [foot, list] });
        input.classList.add("has");
        await typeInto(this.k, tx, l.t, { phone: true, skill: this.opts.skill, kb });
        await this.k.sleep(rnd(200, 400));
        await kb.enter();
        tx.textContent = ""; input.classList.remove("has");
        add("me", l.t);
        await this.k.sleep(rnd(500, 900));
      }
    }
    await kb.close();
    await this.k.sleep(rnd(1000, 1600));
    await touch(this.k, view.querySelector(".so-ig-bk")!, view);
    if (!calm()) await new Promise<void>((r) => this.k.to(view, { xPercent: 100, duration: 0.25, ease: "power2.in", onComplete: () => r() }));
    view.remove();
  }

  async session() {
    await this.k.sleep(rnd(600, 1000));
    if (chance(0.35)) await this.dms();
    if (chance(0.6)) await this.story();
    await this.feedRead();
    if (this.k.left > 12000) await this.reels();
    if (this.k.left > 15000 && chance(0.5)) await this.dms();
    while (this.k.left > 6000) { await this.scrollTo(0, 0.8); await this.feedRead(); }
  }
}

