// Telegrid: channels, a huge tech group with a pinned message, and a bot that answers
// slash commands. The robot reads the news, watches the group scroll by and pokes the bot.
import { TG_CHANNELS, TG_GROUP, TG_BOT } from "../content/social";
import { Kit, runApp, rnd, chance, pick, shuffle, h, avatar, seedOf, touch, typeInto, scrollTo, calm, clock, fmtN, ICON, type SoHost, type SoOpts } from "./kit";
import { sceneCanvas } from "./scenes";
import "./telegrid.css";
import { theyType, headerTyping } from "./typing";
import { phoneKeyboard, type PhoneKeyboard } from "./keyboard";

type Row = { id: string; name: string; color: string; kind: "channel" | "group" | "bot"; sub: string; prev: string; unread: number; el?: HTMLElement };
const EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 8.6 4.2 9.8 6.3.3.5.3 1 0 1.4C20.6 14.8 17 19 12 19s-8.6-4.2-9.8-6.3a1.4 1.4 0 0 1 0-1.4C3.4 9.2 7 5 12 5Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>`;
const MEGA = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 4v15l-6-3.2H8.5l1 4.2H7l-1.2-4.2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h7Z"/><rect x="19.5" y="9" width="2" height="5" rx="1"/></svg>`;
const NAMECOL = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

export async function browseTelegrid(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Telegrid(k, body, opts).session(); });
}

class Telegrid {
  root: HTMLElement;
  phone: boolean;
  rows: Row[];
  cur: Row | null = null;
  list!: HTMLElement;
  view!: HTMLElement;
  msgs!: HTMLElement;
  pinned!: HTMLElement;
  field!: HTMLElement;
  fieldText!: HTMLElement;
  foot!: HTMLElement;
  kb: PhoneKeyboard | null = null;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.phone = !!opts.phone;
    body.innerHTML = "";
    this.root = h("div", `so-tg${this.phone ? " so-ph" : ""}`);
    body.appendChild(this.root);
    this.rows = [
      ...TG_CHANNELS.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: "channel" as const, sub: `${fmtN(c.subs)} subscribers`, prev: c.posts[0].t, unread: 0 })),
      { id: "group", name: TG_GROUP.name, color: "#7bc862", kind: "group", sub: `${TG_GROUP.members.toLocaleString("en-US")} members, ${Math.round(900 + Math.random() * 600).toLocaleString("en-US")} online`, prev: "mod_unit: read the pins", unread: 0 },
      { id: "bot", name: TG_BOT.name, color: "#a695e7", kind: "bot", sub: "bot", prev: "/status", unread: 0 },
    ];
    for (const r of this.rows) r.unread = r.kind === "bot" ? 0 : r.kind === "group" ? 120 + Math.floor(Math.random() * 900) : 1 + Math.floor(Math.random() * 6);
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <aside class="so-tg-side">
        <header class="so-tg-top"><span class="so-tg-burger"><i></i><i></i><i></i></span><div class="so-tg-search">${ICON.search}<span>Search</span></div></header>
        <div class="so-tg-list"></div>
      </aside>
      <section class="so-tg-view">
        <header class="so-tg-head"><span class="so-tg-back" aria-hidden="true"></span><span class="so-av"></span><div><b></b><small></small></div></header>
        <div class="so-tg-pin">${ICON.pin}<div><b>Pinned message</b><span></span></div></div>
        <div class="so-tg-msgs"></div>
        <footer class="so-tg-foot"><div class="so-tg-field"><span class="so-tg-ph">Write a message...</span><span class="so-tg-text"></span></div><span class="so-tg-send">${ICON.send}</span></footer>
      </section>
      <div class="so-tg-empty"><span>Select a chat to start messaging</span></div>`;
    this.list = this.root.querySelector(".so-tg-list")!;
    this.view = this.root.querySelector(".so-tg-view")!;
    this.msgs = this.root.querySelector(".so-tg-msgs")!;
    this.pinned = this.root.querySelector(".so-tg-pin")!;
    this.field = this.root.querySelector(".so-tg-field")!;
    this.fieldText = this.root.querySelector(".so-tg-text")!;
    this.foot = this.root.querySelector(".so-tg-foot")!;
    this.pinned.querySelector("span")!.textContent = TG_GROUP.pinned;
    for (const r of this.rows) {
      const el = h("div", `so-tg-row k-${r.kind}`);
      el.innerHTML = `<span class="so-av">${avatar(r.color, seedOf(r.id))}</span><div class="so-tg-mid"><b>${r.kind === "channel" ? MEGA : ""}<span></span></b><span class="so-tg-prev"></span></div><div class="so-tg-meta"><time>${clock(rnd(2, 90) * 60000)}</time><i></i></div>`;
      el.querySelector("b span")!.textContent = r.name;
      r.el = el;
      this.list.appendChild(el);
      this.paint(r);
    }
  }

  paint(r: Row) {
    r.el!.querySelector(".so-tg-prev")!.textContent = r.prev.split("\n")[0];
    const b = r.el!.querySelector(".so-tg-meta i") as HTMLElement;
    b.textContent = r.unread ? fmtN(r.unread) : "";
    b.style.visibility = r.unread ? "visible" : "hidden";
    b.classList.toggle("muted", r.kind === "group");
  }

  async tapEl(el: Element, ax = 0.5) { if (this.phone) await touch(this.k, el, this.root); else await this.k.click(el, ax, 0.5); }

  async open(r: Row) {
    if (this.cur && this.phone) await this.back();
    await this.tapEl(r.el!, 0.4);
    for (const o of this.rows) o.el!.classList.toggle("on", o === r);
    this.cur = r;
    r.unread = 0;
    this.paint(r);
    const head = this.root.querySelector(".so-tg-head")!;
    head.querySelector(".so-av")!.innerHTML = avatar(r.color, seedOf(r.id));
    head.querySelector("b")!.textContent = r.name;
    head.querySelector("small")!.textContent = r.sub;
    this.root.classList.toggle("pin", r.kind === "group");
    this.root.classList.toggle("chan", r.kind === "channel");
    this.msgs.innerHTML = "";
    this.root.classList.add("open");
    if (this.phone && !calm()) this.k.fromTo(this.view, { xPercent: 100 }, { xPercent: 0, duration: 0.32, ease: "power3.out" });
    await this.k.sleep(rnd(300, 600));
  }

  async back() {
    await this.kb?.close();
    await this.tapEl(this.root.querySelector(".so-tg-back")!);
    this.root.classList.remove("open");
  }

  /** Telegram shows who is typing right under the chat name. */
  async typing(text: string, who?: string) {
    const sub = this.root.querySelector(".so-tg-head small") as HTMLElement;
    await theyType(this.k, text, () => headerTyping(sub, who ? `${who} is typing` : "typing"));
  }

  bottom() { scrollTo(this.k, this.msgs, this.msgs.scrollHeight, 0.5); }
  pop(el: HTMLElement) { if (!calm()) this.k.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }); }

  post(c: (typeof TG_CHANNELS)[number], p: (typeof TG_CHANNELS)[number]["posts"][number], ago: number) {
    const el = h("div", "so-tg-msg post");
    el.innerHTML = `<b class="so-tg-from" style="color:${c.color}"></b>${p.img ? `<div class="so-tg-img"></div>` : ""}<p></p><span class="so-tg-foot2">${EYE}${fmtN(p.views)}<time>${clock(ago)}</time></span>`;
    el.querySelector(".so-tg-from")!.textContent = c.name;
    el.querySelector("p")!.textContent = p.t;
    if (p.img) { const w = this.phone ? 104 : 250; el.querySelector(".so-tg-img")!.appendChild(sceneCanvas(p.img, w, Math.round(w * 0.56))); }
    this.msgs.appendChild(el);
    return el;
  }

  line(u: string, t: string, mine = false, ago = 0) {
    const el = h("div", `so-tg-msg${mine ? " me" : ""}`);
    el.innerHTML = `${mine ? "" : `<span class="so-av">${avatar(NAMECOL[seedOf(u) % NAMECOL.length], seedOf(u))}</span>`}<div class="so-tg-bub">${mine ? "" : `<b class="so-tg-from" style="color:${NAMECOL[seedOf(u) % NAMECOL.length]}"></b>`}<p></p><time>${clock(ago)}</time></div>`;
    if (!mine) el.querySelector(".so-tg-from")!.textContent = u;
    el.querySelector("p")!.textContent = t;
    this.msgs.appendChild(el);
    return el;
  }

  async send(text: string) {
    if (!this.kb?.up) await this.tapEl(this.field, 0.3);
    if (this.phone) {
      this.kb = phoneKeyboard(this.k, this.root, { accent: "#3390ec" });
      await this.kb.open({ ret: "send", lift: [this.foot, this.msgs] });
    }
    this.field.classList.add("has");
    await typeInto(this.k, this.fieldText, text, { phone: this.phone, skill: this.opts.skill, kb: this.kb ?? undefined });
    await this.k.sleep(rnd(200, 400));
    if (this.phone) { if (chance(0.6)) await this.kb!.enter(); else await touch(this.k, this.root.querySelector(".so-tg-send")!, this.root); this.kb!.reset(); } else this.k.tap("Enter");
    this.fieldText.textContent = "";
    this.field.classList.remove("has");
    const m = this.line("me", text, true);
    this.pop(m);
    this.bottom();
    this.cur!.prev = text; this.paint(this.cur!);
  }

  async channel(id: string) {
    const c = TG_CHANNELS.find((x) => x.id === id)!;
    await this.open(this.rows.find((r) => r.id === id)!);
    const posts = shuffle([...c.posts]).slice(0, this.phone ? 3 : 4);
    posts.forEach((p, i) => this.post(c, p, (posts.length - i) * rnd(20, 70) * 60000));
    this.msgs.scrollTop = 0;
    // read top to bottom, a post at a time
    for (const el of [...this.msgs.children] as HTMLElement[]) {
      scrollTo(this.k, this.msgs, el.offsetTop - 8, 0.7);
      await this.k.sleep(900 + (el.textContent?.length ?? 40) * rnd(30, 45));
      if (chance(0.2)) this.k.host.react(c.id === "memes" ? "laugh" : "surprised");
      if (this.k.left < 4000) return;
    }
  }

  async group() {
    const r = this.rows.find((x) => x.id === "group")!;
    await this.open(r);
    const lines = TG_GROUP.lines;
    let i = Math.floor(Math.random() * 6);
    for (let n = 0; n < 4; n++) { const [u, t] = lines[(i + n) % lines.length]; this.line(u, t, false, (4 - n) * 60000); }
    i += 4;
    this.msgs.scrollTop = this.msgs.scrollHeight;
    await this.k.sleep(rnd(1500, 2500));
    if (!this.phone) { await this.k.click(this.pinned, 0.3); this.pinned.classList.add("flash"); this.k.later(() => this.pinned.classList.remove("flash"), 900); await this.k.sleep(rnd(1200, 1800)); }
    const count = 4 + Math.floor(Math.random() * 4);
    for (let n = 0; n < count && this.k.left > 5000; n++) {
      const [u, t] = lines[i++ % lines.length];
      await this.k.sleep(rnd(300, 1200));
      await this.typing(t, u);
      const m = this.line(u, t);
      this.pop(m);
      this.bottom();
      r.prev = `${u}: ${t}`;
      if (u === "new_bot_42" && chance(0.8)) { await this.k.sleep(rnd(600, 1200)); await this.send("welcome! the coffee is free and the wifi is fast"); }
      else if (chance(0.15)) this.k.host.react("laugh");
    }
  }

  async bot() {
    await this.open(this.rows.find((x) => x.id === "bot")!);
    this.line(TG_BOT.name, "Hi! I'm BuildBot. Try /status, /joke or /coffee.", false, 3600000);
    const picks = shuffle([...TG_BOT.commands]).slice(0, 2);
    for (const [cmd, reply] of picks) {
      if (this.k.left < 5000) return;
      await this.k.sleep(rnd(700, 1300));
      await this.send(cmd);
      await this.typing(reply, undefined);
      const m = this.line(TG_BOT.name, reply);
      // the bot's inline buttons
      const kb = h("div", "so-tg-kb");
      for (const b of ["Again", "Menu", "Thanks"]) kb.appendChild(h("span", "", b));
      m.querySelector(".so-tg-bub")!.appendChild(kb);
      this.pop(m);
      this.bottom();
      await this.k.sleep(800 + reply.length * 35);
      if (cmd === "/joke") this.k.host.react("laugh");
      if (chance(0.5)) {
        const btn = kb.children[2] as HTMLElement;
        await this.tapEl(btn);
        btn.classList.add("on");
        await this.typing("You're welcome. Have a nice break!");
        const ok = this.line(TG_BOT.name, "You're welcome. Have a nice break!");
        this.pop(ok);
        this.bottom();
        await this.k.sleep(1200);
      }
    }
  }

  async session() {
    if (!calm()) this.k.from(this.list.children, { opacity: 0, x: -8, duration: 0.25, stagger: 0.04 });
    await this.k.sleep(rnd(800, 1400));
    const plan: (() => Promise<void>)[] = shuffle([
      () => this.channel(pick(["ainews", "oc", "memes"])),
      () => this.group(),
      () => this.bot(),
    ]);
    plan.unshift(() => this.channel("ainews"));
    for (const step of plan) {
      if (this.k.left < 7000) break;
      await step();
      await this.k.sleep(rnd(900, 1800));
    }
    while (this.k.left > 9000) { await this.channel(pick(["oc", "memes", "ainews"])); await this.k.sleep(rnd(1000, 2000)); }
  }
}
