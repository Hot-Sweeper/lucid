// Instabot on the web: the desktop layout with the nav rail, a centred feed and suggestions.
// The robot scrolls, double clicks photos to like them (or clicks the heart), types comments
// that then show up under the post, and answers a friend in Messages (with typing dots).
import { INSTA_POSTS, INSTA_STORIES, INSTA_COMMENTS, INSTA_MY_COMMENTS, INSTA_DMS, type InstaPost } from "../content/social";
import { Kit, runApp, rnd, chance, pick, shuffle, h, avatar, seedOf, typeInto, calm, canvas, ICON, type SoHost, type SoOpts } from "./kit";
import { SCENES } from "./scenes";
import { theyType, dotsBubble } from "./typing";
import "./instaweb.css";

const COLS = ["#ff9f5a", "#4fb6ff", "#4ff0a0", "#b07cff", "#ff6f91", "#ffc94d"];
const col = (u: string) => COLS[seedOf(u) % COLS.length];
const I = {
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 10.5V21h7v-6h5v6h7V10.5Z"/></svg>`,
  explore: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 2a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm4.2 3.3-2.3 6.1-6.1 2.3 2.3-6.1Zm-4.2 3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>`,
  reels: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 5v11h14V8Zm5 2.5 5 3-5 3Z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h14V5Zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3Z"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h12V22l-6-4-6 4Zm2 2v13.6l4-2.7 4 2.7V4.5Z"/></svg>`,
};

type Post = InstaPost & { el: HTMLElement; ctx: CanvasRenderingContext2D; liked: boolean; n: number };

export async function browseInstaweb(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Instaweb(k, body, opts).session(); });
}

class Instaweb {
  root: HTMLElement;
  feed!: HTMLElement;
  page!: HTMLElement;
  posts: Post[] = [];
  live: Post | null = null;
  me: string;
  size = 236;
  bag: string[] = [];

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.me = (opts.me || "pip").toLowerCase();
    body.innerHTML = "";
    this.root = h("div", "so-iw");
    body.appendChild(this.root);
    this.build();
    const t0 = performance.now();
    let last = 0;
    // only the photo in view moves, a few times a second
    k.every((now) => {
      if (!this.live || now - last < 60 || calm()) return;
      last = now;
      const p = this.live;
      p.ctx.save(); (SCENES[p.scene] ?? SCENES.sunset)(p.ctx, this.size, this.size, (now - t0) / 1000); p.ctx.restore();
    });
  }

  build() {
    const nav: [string, string][] = [["Home", I.home], ["Search", ICON.search], ["Explore", I.explore], ["Reels", I.reels], ["Messages", ICON.send], ["Notifications", ICON.heart], ["Create", I.plus], ["Profile", avatar("#35c37a", seedOf(this.me))]];
    this.root.innerHTML = `
      <nav class="so-iw-rail"><b class="so-iw-logo">Instabot</b>${nav.map(([n, svg], i) => `<span class="so-iw-nav${i === 0 ? " on" : ""}" data-n="${n}"><i>${svg}</i>${n}</span>`).join("")}</nav>
      <div class="so-iw-page">
        <div class="so-iw-feed">
          <div class="so-iw-stories">${INSTA_STORIES.slice(1).map((s) => `<span><i>${avatar(col(s), seedOf(s))}</i><small>${s}</small></span>`).join("")}</div>
        </div>
        <aside class="so-iw-side">
          <div class="so-iw-meline"><span class="so-av">${avatar("#35c37a", seedOf(this.me))}</span><div><b></b><small>Robot</small></div><a>Switch</a></div>
          <h5>Suggested for you</h5>
          ${shuffle(["gizmo.cooks", "rivet.rides", "nimbus.sky", "quill.writes"]).map((u) => `<div class="so-iw-sug"><span class="so-av">${avatar(col(u), seedOf(u))}</span><div><b>${u}</b><small>Followed by ${pick(INSTA_STORIES.slice(1))}</small></div><a>Follow</a></div>`).join("")}
        </aside>
      </div>`;
    this.root.querySelector(".so-iw-meline b")!.textContent = this.me;
    this.page = this.root.querySelector(".so-iw-page")!;
    this.feed = this.root.querySelector(".so-iw-feed")!;
    for (const p of shuffle([...INSTA_POSTS]).slice(0, 5)) {
      const el = h("article", "so-iw-post");
      const n = 3 + (seedOf(p.caption) % 40);
      el.innerHTML = `<header><span class="so-av">${avatar(col(p.user), seedOf(p.user))}</span><b></b><small>${1 + (seedOf(p.user) % 9)}h</small><i>...</i></header>
        <div class="so-iw-ph"><canvas></canvas></div>
        <div class="so-iw-acts"><span class="a-like">${ICON.heart}</span><span class="a-talk">${ICON.reply}</span><span>${ICON.send}</span><span class="a-save">${I.save}</span></div>
        <div class="so-iw-likes"><b></b> likes</div>
        <p class="so-iw-cap"><b></b> <span></span></p>
        <small class="so-iw-more"></small>
        <div class="so-iw-cms"></div>
        <div class="so-iw-add"><div class="so-iw-in"><span class="so-iw-ph2">Add a comment...</span><span class="so-iw-tx"></span></div><b class="so-iw-pbtn">Post</b></div>`;
      el.querySelector("header b")!.textContent = p.user;
      el.querySelector(".so-iw-likes b")!.textContent = p.likes.toLocaleString("en-US");
      el.querySelector(".so-iw-cap b")!.textContent = p.user;
      el.querySelector(".so-iw-cap span")!.textContent = p.caption;
      el.querySelector(".so-iw-more")!.textContent = `View all ${n} comments`;
      const ctx = canvas(el.querySelector("canvas")!, this.size, this.size);
      (SCENES[p.scene] ?? SCENES.sunset)(ctx, this.size, this.size, 1.5);
      this.feed.appendChild(el);
      this.posts.push({ ...p, el, ctx, liked: false, n });
    }
  }

  scroll(y: number, secs = 0.7) {
    (this.k.host as SoHost).scroll?.();
    const max = this.page.scrollHeight - this.page.clientHeight;
    const to = Math.max(0, Math.min(max, y));
    if (calm()) { this.page.scrollTop = to; return Promise.resolve(); }
    return new Promise<void>((r) => this.k.to(this.page, { scrollTop: to, duration: secs, ease: "power2.inOut", onComplete: () => r() }));
  }

  likeOn(p: Post) {
    if (p.liked) return;
    p.liked = true;
    const like = p.el.querySelector(".a-like") as HTMLElement;
    like.classList.add("on");
    p.el.querySelector(".so-iw-likes b")!.textContent = (p.likes + 1).toLocaleString("en-US");
    if (!calm()) this.k.fromTo(like.querySelector("svg"), { scale: 0.5 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
  }

  async doubleClick(p: Post) {
    const ph = p.el.querySelector(".so-iw-ph") as HTMLElement;
    await this.k.point(ph, rnd(0.35, 0.65), rnd(0.35, 0.6));
    await this.k.host.click();
    await this.k.host.click();
    const big = h("span", "so-iw-big", ICON.heart);
    ph.appendChild(big);
    if (calm()) this.k.later(() => big.remove(), 700);
    else this.k.tl({ onComplete: () => big.remove() })
      .fromTo(big, { scale: 0, opacity: 1, rotation: rnd(-15, 15) }, { scale: 1.1, duration: 0.3, ease: "back.out(3)" })
      .to(big, { scale: 1, duration: 0.1 })
      .to(big, { scale: 0.2, y: -24, opacity: 0, duration: 0.35, ease: "power2.in" }, "+=0.35");
    this.likeOn(p);
    await this.k.sleep(600);
  }

  async comment(p: Post) {
    const box = p.el.querySelector(".so-iw-in") as HTMLElement, tx = p.el.querySelector(".so-iw-tx") as HTMLElement;
    const post = p.el.querySelector(".so-iw-pbtn") as HTMLElement;
    await this.scroll(p.el.offsetTop + p.el.offsetHeight - this.page.clientHeight + 10, 0.6);
    await this.k.click(box, 0.3, 0.5);
    box.classList.add("has");
    if (!this.bag.length) this.bag = shuffle([...INSTA_MY_COMMENTS]);
    const text = this.bag.pop()!;
    await typeInto(this.k, tx, text, { skill: this.opts.skill });
    post.classList.add("on");
    await this.k.sleep(rnd(300, 600));
    if (chance(0.5)) this.k.tap("Enter"); else await this.k.click(post);
    tx.textContent = ""; box.classList.remove("has"); post.classList.remove("on");
    const c = h("p", "so-iw-cm", `<b></b> <span></span>`);
    c.querySelector("b")!.textContent = this.me;
    c.querySelector("span")!.textContent = text;
    p.el.querySelector(".so-iw-cms")!.appendChild(c);
    if (!calm()) this.k.from(c, { opacity: 0, y: 5, duration: 0.3, ease: "power2.out" });
    p.n++;
    p.el.querySelector(".so-iw-more")!.textContent = `View all ${p.n} comments`;
    await this.k.sleep(rnd(900, 1500));
  }

  async feedRead() {
    for (const p of this.posts) {
      if (this.k.left < 5000) return;
      await this.scroll(p.el.offsetTop - 6);
      this.live = p;
      await this.k.sleep(rnd(1600, 2800));
      if (chance(0.4)) await this.doubleClick(p);
      else if (chance(0.25)) { await this.k.click(p.el.querySelector(".a-like")!); this.likeOn(p); }
      await this.scroll(p.el.offsetTop + this.size * 0.55, 0.5);
      await this.k.sleep(rnd(800, 1500));
      if (chance(0.3) && this.k.left > 12000) await this.comment(p);
      if (chance(0.2)) this.k.host.react(chance(0.5) ? "relax" : "cheer");
    }
  }

  async messages() {
    const nav = this.root.querySelector('[data-n="Messages"]') as HTMLElement;
    await this.k.click(nav, 0.3, 0.5);
    this.root.querySelectorAll(".so-iw-nav").forEach((n) => n.classList.toggle("on", n === nav));
    const dm = pick(INSTA_DMS);
    const others = shuffle(INSTA_DMS.filter((d) => d !== dm)).slice(0, 3);
    const view = h("div", "so-iw-dm");
    const row = (u: string, prev: string) => `<div class="so-iw-dmr" data-u="${u}"><span class="so-av">${avatar(col(u), seedOf(u))}</span><div><b>${u}</b><small>${prev}</small></div></div>`;
    view.innerHTML = `<div class="so-iw-dml"><header>${this.me}</header>${[dm, ...others].map((d) => row(d.user, d === dm ? "Active now" : pick(INSTA_COMMENTS))).join("")}</div>
      <section class="so-iw-dmc"><header><span class="so-av">${avatar(col(dm.user), seedOf(dm.user))}</span><div><b>${dm.user}</b><small>Active now</small></div></header><div class="so-iw-dmm"></div>
        <footer><div class="so-iw-dmin"><span class="so-iw-ph2">Message...</span><span class="so-iw-tx"></span></div></footer></section>`;
    this.root.appendChild(view);
    if (!calm()) this.k.from(view, { opacity: 0, duration: 0.25 });
    const target = view.querySelector(`[data-u="${dm.user}"]`) as HTMLElement;
    await this.k.sleep(rnd(500, 900));
    await this.k.click(target, 0.3, 0.5);
    target.classList.add("on");
    view.classList.add("open");
    const list = view.querySelector(".so-iw-dmm") as HTMLElement, box = view.querySelector(".so-iw-dmin") as HTMLElement, tx = box.querySelector(".so-iw-tx") as HTMLElement;
    const add = (u: "me" | "them", t: string) => {
      const m = h("div", `so-iw-b ${u}`);
      m.textContent = t;
      list.appendChild(m);
      if (!calm()) this.k.fromTo(m, { opacity: 0, scale: 0.85, transformOrigin: u === "me" ? "100% 100%" : "0% 100%" }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" });
    };
    for (const l of dm.lines) {
      if (this.k.left < 4000) break;
      if (l.u === "them") {
        await this.k.sleep(rnd(400, 900));
        await theyType(this.k, l.t, () => dotsBubble(this.k, list, "so-iw-b them dots"));
        add("them", l.t);
        await this.k.sleep(600 + l.t.length * rnd(28, 42));
        if (chance(0.3)) this.k.host.react("laugh");
      } else {
        await this.k.click(box, 0.3, 0.5);
        box.classList.add("has");
        await typeInto(this.k, tx, l.t, { skill: this.opts.skill });
        await this.k.sleep(rnd(200, 400));
        this.k.tap("Enter");
        tx.textContent = ""; box.classList.remove("has");
        add("me", l.t);
        await this.k.sleep(rnd(500, 900));
      }
    }
    await this.k.sleep(rnd(1200, 2000));
    const home = this.root.querySelector('[data-n="Home"]') as HTMLElement;
    await this.k.click(home, 0.3, 0.5);
    this.root.querySelectorAll(".so-iw-nav").forEach((n) => n.classList.toggle("on", n === home));
    view.remove();
  }

  async session() {
    if (!calm()) this.k.from(this.feed.querySelectorAll(".so-iw-post"), { opacity: 0, y: 12, duration: 0.35, stagger: 0.06, ease: "power2.out" });
    await this.k.sleep(rnd(700, 1200));
    if (chance(0.3)) await this.messages();
    await this.feedRead();
    if (this.k.left > 16000 && chance(0.6)) await this.messages();
    while (this.k.left > 7000) { await this.scroll(0, 0.9); await this.feedRead(); }
  }
}

export type { Kit };
