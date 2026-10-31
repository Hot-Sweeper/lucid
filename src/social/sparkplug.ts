// Sparkplug: robot dating, very wholesome. Profile cards with portraits of robots and their
// bios ("Looking for someone who won't mind my fan noise"), swipes with a real card throw,
// now and then "It's a match!", and then a shy little chat. Phone and desktop web layouts.
import { SPARK_PROFILES, SPARK_CHATS, type SparkProfile } from "../content/social";
import { portraitSvg, randomLook, seeded } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import { Kit, runApp, rnd, chance, pick, shuffle, h, esc, touch, typeInto, calm, marker, type SoHost, type SoOpts } from "./kit";
import { phoneKeyboard, type PhoneKeyboard } from "./keyboard";
import { theyType, dotsBubble } from "./typing";
import "./sparkplug.css";

const BRANDS = ["codex", "claude", "grok", "generic"] as const;
const BACKS = [["#ffd1dc", "#ffb38a"], ["#bfe3ff", "#d9c7ff"], ["#c8f5dc", "#9fe3d0"], ["#ffe6a8", "#ffbf9a"], ["#e3d4ff", "#ffc2e0"], ["#cfe0ff", "#a8f0e0"]];
const ICO = {
  bolt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 2 5 13.4h5.6L9.4 22 19 9.8h-5.8Z"/></svg>`,
  nope: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.3 4.2 5.7 5.7 5.7-5.7 2.1 2.1-5.7 5.7 5.7 5.7-2.1 2.1-5.7-5.7-5.7 5.7-2.1-2.1 5.7-5.7-5.7-5.7Z"/></svg>`,
  like: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2c-.4 0-.8-.1-1.1-.4C6.1 16.9 2.5 13.6 2.5 9.3 2.5 6.2 4.9 3.8 7.9 3.8c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.6-8.4 11.5-.3.3-.7.4-1.1.4z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7Z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>`,
  me: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 10.5c4.4 0 8 2.4 8 6.5H4c0-4.1 3.6-6.5 8-6.5Z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"/></svg>`,
};

/** A robot's portrait, the same for the same name every time. */
function face(name: string, size: number, bust = true) {
  const r = seeded("spark" + name);
  return portraitSvg(randomLook(r), PALETTES[BRANDS[Math.floor(r() * 4)]], { size, bust, cls: "so-sp-face" });
}

type Card = { p: SparkProfile; el: HTMLElement };

export async function swipeSparkplug(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Sparkplug(k, body, opts).session(); });
}

class Sparkplug {
  root: HTMLElement;
  phone: boolean;
  deck!: HTMLElement;
  main!: HTMLElement;
  side: HTMLElement | null = null;
  queue: SparkProfile[];
  cards: Card[] = [];
  likes = 0;
  matched = 0;
  kb: PhoneKeyboard | null = null;
  me: string;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.phone = !!opts.phone;
    this.me = opts.me || "Pip";
    body.innerHTML = "";
    this.root = h("div", `so-sp${this.phone ? " so-ph" : ""}`);
    body.appendChild(this.root);
    this.queue = shuffle(SPARK_PROFILES.filter((p) => p.name !== this.me));
    this.build();
  }

  build() {
    const logo = `<span class="so-sp-logo">${ICO.bolt}<b>sparkplug</b></span>`;
    if (this.phone) {
      this.root.innerHTML = `
        <header class="so-sp-top"><span class="so-sp-ic">${ICO.me}</span>${logo}<span class="so-sp-ic">${ICO.chat}</span></header>
        <div class="so-sp-main"><div class="so-sp-deck"></div>
          <nav class="so-sp-btns"><span class="b-nope">${ICO.nope}</span><span class="b-star">${ICO.star}</span><span class="b-like">${ICO.like}</span></nav></div>`;
    } else {
      this.root.innerHTML = `
        <aside class="so-sp-side">
          <header class="so-sp-mine"><span class="so-sp-av">${face(this.me, 30, false)}</span><b>My profile</b>${logo}</header>
          <div class="so-sp-tabs"><span class="on">Matches</span><span>Messages</span></div>
          <div class="so-sp-matches"><div class="so-sp-mgrid"></div><p class="so-sp-hint">Start swiping to get matches</p></div>
        </aside>
        <div class="so-sp-main"><div class="so-sp-deck"></div>
          <nav class="so-sp-btns"><span class="b-nope">${ICO.nope}</span><span class="b-star">${ICO.star}</span><span class="b-like">${ICO.like}</span></nav></div>`;
      this.side = this.root.querySelector(".so-sp-side");
    }
    this.main = this.root.querySelector(".so-sp-main")!;
    this.deck = this.root.querySelector(".so-sp-deck")!;
    for (let i = 0; i < 3; i++) this.addCard();
  }

  addCard() {
    const p = this.queue.shift();
    if (!p) return;
    this.queue.push(p);
    const [a, b] = BACKS[Math.abs(hash(p.name)) % BACKS.length];
    const el = h("article", "so-sp-card");
    el.style.background = `linear-gradient(170deg, ${a}, ${b})`;
    el.innerHTML = `<div class="so-sp-photo">${face(p.name, this.phone ? 130 : 230)}</div>
      <span class="so-sp-stamp like">LIKE</span><span class="so-sp-stamp nope">NOPE</span>
      <div class="so-sp-info"><h3><b></b> <span></span></h3><small>${ICO.pin}<i></i></small><p></p><div class="so-sp-tags">${p.tags.map((t) => esc(t)).join(" &middot; ")}</div></div>`;
    el.querySelector("h3 b")!.textContent = p.name;
    el.querySelector("h3 span")!.textContent = p.age;
    el.querySelector("small i")!.textContent = p.dist;
    el.querySelector("p")!.textContent = p.bio;
    this.deck.prepend(el);
    this.cards.push({ p, el });
    this.stack();
  }

  // the top card full size, the ones under it peeking out a little smaller
  stack() {
    this.cards.forEach((c, i) => {
      const s = 1 - Math.min(i, 2) * 0.04;
      if (calm() || i === 0) this.k.set(c.el, { scale: s, y: Math.min(i, 2) * (this.phone ? 4 : 8) });
      else this.k.to(c.el, { scale: s, y: Math.min(i, 2) * (this.phone ? 4 : 8), duration: 0.3, ease: "power2.out" });
    });
  }

  async tap(el: Element, ax = 0.5, ay = 0.5) { if (this.phone) await touch(this.k, el, this.root); else await this.k.click(el, ax, ay); }

  /** One swipe: drag the card a bit (the stamp fades in), then throw it off screen. */
  async swipe(right: boolean) {
    const c = this.cards[0];
    const stamp = c.el.querySelector(right ? ".so-sp-stamp.like" : ".so-sp-stamp.nope") as HTMLElement;
    const w = this.deck.clientWidth || 120, dir = right ? 1 : -1;
    const how = this.phone ? (chance(0.65) ? "drag" : "button") : pick(["drag", "button", "button", "key"] as const);
    if (how === "drag") {
      if (this.phone) {
        (this.k.host as SoHost).thumb?.("swipe");
        await touch(this.k, c.el, this.root, "swipe");
        if (!calm()) await new Promise<void>((r) => { this.k.to(c.el, { x: dir * w * 0.35, rotation: dir * 8, duration: 0.28, ease: "power1.out", onComplete: () => r() }); this.k.to(stamp, { opacity: 1, duration: 0.25 }); });
      } else {
        // grab the card with the mouse and drag it to the side; the card follows the cursor
        await this.k.point(c.el, 0.5, 0.45);
        const at = marker(this.deck);
        const to = at(this.deck.clientWidth / 2 + dir * w * 0.42, this.deck.clientHeight * 0.45);
        c.el.classList.add("held");
        if (!calm()) { this.k.to(c.el, { x: dir * w * 0.42, rotation: dir * 9, duration: this.k.moveSecs(w * 0.42, 600), ease: "power2.inOut" }); this.k.to(stamp, { opacity: 1, duration: 0.3 }); }
        await this.k.point(to, 0.5, 0.5, 600);
        to.remove();
      }
    } else if (how === "key") {
      this.k.tap(right ? "ArrowRight" : "ArrowLeft");
      this.k.set(stamp, { opacity: 1 });
      await this.k.sleep(120);
    } else {
      const btn = this.root.querySelector(right ? ".b-like" : ".b-nope") as HTMLElement;
      await this.tap(btn);
      btn.classList.add("hit");
      this.k.later(() => btn.classList.remove("hit"), 260);
      if (!calm()) this.k.to(stamp, { opacity: 1, duration: 0.15 });
      else this.k.set(stamp, { opacity: 1 });
      await this.k.sleep(120);
    }
    // the throw
    this.cards.shift();
    const gone = c.el;
    if (calm()) gone.remove();
    else this.k.to(gone, { x: dir * w * 1.7, y: rnd(-20, 30), rotation: dir * rnd(22, 34), opacity: 0.6, duration: 0.42, ease: "power2.in", onComplete: () => gone.remove() });
    this.addCard();
    await this.k.sleep(380);
    return c.p;
  }

  async look(p: SparkProfile) {
    // reading the bio, as one does
    await this.k.sleep(rnd(1400, 2400) + p.bio.length * rnd(15, 28));
    if (chance(0.3)) this.k.host.react(chance(0.6) ? "laugh" : "shy");
  }

  async session() {
    if (!calm()) this.k.from(this.deck, { scale: 0.92, opacity: 0, duration: 0.4, ease: "back.out(1.6)" });
    await this.k.sleep(rnd(700, 1200));
    while (this.k.left > 9000) {
      const p = this.cards[0].p;
      await this.look(p);
      const right = chance(0.5);
      await this.swipe(right);
      if (right) this.likes++;
      // a match now and then; the first like after a few swipes is a sure one, so it shows up
      if (right && this.k.left > 20000 && (chance(0.35) || (this.likes >= 2 && !this.matched))) {
        this.matched++;
        await this.match(p);
      }
      if (!this.phone && right) this.addMatchThumb(p, false);
    }
    await this.kb?.close();
  }

  addMatchThumb(p: SparkProfile, chat: boolean) {
    const grid = this.side?.querySelector(".so-sp-mgrid");
    if (!grid || grid.querySelector(`[data-n="${p.name}"]`)) return;
    this.side!.querySelector(".so-sp-hint")?.remove();
    const t = h("span", `so-sp-mt${chat ? " new" : ""}`, `${face(p.name, 52, false)}<b></b>`);
    t.dataset.n = p.name;
    t.querySelector("b")!.textContent = p.name;
    grid.prepend(t);
    if (!calm()) this.k.from(t, { scale: 0.4, opacity: 0, duration: 0.35, ease: "back.out(2)" });
  }

  async match(p: SparkProfile) {
    this.k.host.react("surprised");
    const ov = h("div", "so-sp-match");
    ov.innerHTML = `<div class="so-sp-mtitle">It's a match!</div><p></p>
      <div class="so-sp-pair"><span>${face(this.me, this.phone ? 64 : 110)}</span><span>${face(p.name, this.phone ? 64 : 110)}</span></div>
      <div class="so-sp-say"><span class="so-sp-sayph">Say something nice...</span><span class="so-sp-saytx"></span><b>Send</b></div>
      <span class="so-sp-keep">Keep swiping</span>`;
    ov.querySelector("p")!.textContent = `You and ${p.name} liked each other.`;
    (this.phone ? this.root : this.main).appendChild(ov);
    if (!calm()) {
      this.k.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      this.k.fromTo(ov.querySelector(".so-sp-mtitle"), { scale: 0.3, rotation: -8 }, { scale: 1, rotation: -4, duration: 0.6, ease: "back.out(2.6)" });
      const [a, b] = [...ov.querySelectorAll(".so-sp-pair span")];
      this.k.fromTo(a, { x: -60, rotation: -30, opacity: 0 }, { x: 0, rotation: -8, opacity: 1, duration: 0.55, ease: "back.out(1.6)", delay: 0.15 });
      this.k.fromTo(b, { x: 60, rotation: 30, opacity: 0 }, { x: 0, rotation: 8, opacity: 1, duration: 0.55, ease: "back.out(1.6)", delay: 0.15 });
      for (let i = 0; i < 14; i++) {
        const s = h("i", "so-sp-spark");
        ov.appendChild(s);
        const ang = (i / 14) * Math.PI * 2;
        this.k.fromTo(s, { x: 0, y: 0, scale: 1, opacity: 1 }, { x: Math.cos(ang) * rnd(40, 90), y: Math.sin(ang) * rnd(30, 70), scale: 0.2, opacity: 0, duration: 0.9, ease: "expo.out", delay: 0.2 });
      }
    }
    this.k.host.react("cheer");
    await this.k.sleep(rnd(1800, 2600));
    const script = pick(SPARK_CHATS);
    // say hi right away, or keep swiping and write later from the messages
    if (script[0].u === "me" && chance(0.8)) {
      const say = ov.querySelector(".so-sp-say") as HTMLElement, tx = ov.querySelector(".so-sp-saytx") as HTMLElement;
      await this.tap(say, 0.3);
      say.classList.add("has");
      if (this.phone) { this.kb = phoneKeyboard(this.k, this.root, { accent: "#ff6f91" }); ov.classList.add("kbup"); await this.kb.open({ ret: "send" }); }
      await typeInto(this.k, tx, script[0].t, { phone: this.phone, skill: this.opts.skill, kb: this.kb ?? undefined });
      await this.k.sleep(rnd(250, 500));
      if (this.phone) { await this.kb!.enter(); await this.kb!.close(); } else this.k.tap("Enter");
      await this.k.sleep(200);
      await this.fade(ov);
      await this.chat(p, script, 1);
    } else {
      await this.tap(ov.querySelector(".so-sp-keep")!);
      await this.fade(ov);
      if (script[0].u === "them" && this.k.left > 18000 && chance(0.7)) {
        await this.k.sleep(rnd(800, 1400));
        await this.chat(p, script, 0);
      }
    }
  }

  async fade(el: HTMLElement) {
    if (!calm()) await new Promise<void>((r) => this.k.to(el, { opacity: 0, duration: 0.25, onComplete: () => r() }));
    el.remove();
  }

  /** The chat with a match: their typing dots, the robot's answers. `from` lines were already sent. */
  async chat(p: SparkProfile, lines: { u: "me" | "them"; t: string }[], from: number) {
    const view = h("div", "so-sp-chat");
    view.innerHTML = `<header><span class="so-sp-bk"></span><span class="so-sp-cav">${face(p.name, this.phone ? 20 : 30, false)}</span><div><b></b><small>Matched today</small></div></header>
      <div class="so-sp-msgs"><p class="so-sp-day">You matched with ${esc(p.name)}</p></div>
      <footer><div class="so-sp-field"><span class="so-sp-fph">Type a message</span><span class="so-sp-ftx"></span></div><b class="so-sp-send">Send</b></footer>`;
    view.querySelector("header b")!.textContent = p.name;
    (this.phone ? this.root : this.main).appendChild(view);
    if (!calm()) this.k.fromTo(view, { xPercent: 100 }, { xPercent: 0, duration: 0.32, ease: "power3.out" });
    if (!this.phone) this.addMatchThumb(p, true);
    const list = view.querySelector(".so-sp-msgs") as HTMLElement, foot = view.querySelector("footer") as HTMLElement;
    const field = view.querySelector(".so-sp-field") as HTMLElement, tx = view.querySelector(".so-sp-ftx") as HTMLElement;
    const send = view.querySelector(".so-sp-send") as HTMLElement;
    const add = (u: "me" | "them", t: string) => {
      const m = h("div", `so-sp-b ${u}`);
      if (u === "them") m.innerHTML = `<span class="so-sp-bav">${face(p.name, this.phone ? 12 : 18, false)}</span>`;
      m.appendChild(h("span", "so-sp-bt")).textContent = t;
      list.appendChild(m);
      if (!calm()) this.k.fromTo(m, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" });
      list.scrollTop = list.scrollHeight;
    };
    for (let i = 0; i < from; i++) add(lines[i].u, lines[i].t);
    await this.k.sleep(rnd(600, 1000));
    const kb = this.phone ? phoneKeyboard(this.k, view, { accent: "#ff6f91" }) : null;
    for (let i = from; i < lines.length; i++) {
      if (this.k.left < 4000) break;
      const l = lines[i];
      if (l.u === "them") {
        await this.k.sleep(rnd(400, 900));
        await theyType(this.k, l.t, () => { const off = dotsBubble(this.k, list, "so-sp-b them dots", `<span class="so-sp-bav">${face(p.name, this.phone ? 12 : 18, false)}</span>`); list.scrollTop = list.scrollHeight; return off; });
        add("them", l.t);
        await this.k.sleep(600 + l.t.length * rnd(30, 45));
        if (chance(0.4)) this.k.host.react(chance(0.5) ? "shy" : "laugh");
      } else {
        if (kb) { if (!kb.up) await touch(this.k, field, view); await kb.open({ ret: "send", lift: [foot, list] }); }
        else await this.k.click(field, 0.3);
        field.classList.add("has");
        send.classList.add("on");
        await typeInto(this.k, tx, l.t, { phone: this.phone, skill: this.opts.skill, kb: kb ?? undefined });
        await this.k.sleep(rnd(200, 450));
        if (kb) await kb.enter(); else if (chance(0.5)) this.k.tap("Enter"); else await this.k.click(send);
        tx.textContent = ""; field.classList.remove("has"); send.classList.remove("on");
        add("me", l.t);
        await this.k.sleep(rnd(600, 1000));
      }
    }
    await kb?.close();
    await this.k.sleep(rnd(1500, 2400));
    await this.tap(view.querySelector(".so-sp-bk")!);
    if (!calm()) await new Promise<void>((r) => this.k.to(view, { xPercent: 100, duration: 0.25, ease: "power2.in", onComplete: () => r() }));
    view.remove();
  }
}

function hash(s: string) { let x = 7; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return x; }
