// BotsApp: the family group chat app. Mom checks if you charged, Dad sends 47 second voice
// notes, Grandma forwards chain messages and blurry good-morning flowers. The robot reads
// along, plays voice notes and types its replies. Ticks go grey, then blue when read.
import { FAMILY_MEMBERS, FAMILY_SCENES, type FamLine, type FamScene } from "../content/social";
import { pickFresh } from "../content";
import { Kit, runApp, rnd, chance, h, esc, avatar, seedOf, touch, typeInto, scrollTo, calm, clock, ICON, type SoHost, type SoOpts } from "./kit";
import { sceneCanvas } from "./scenes";

type Chat = { id: string; name: string; color: string; group?: string[]; el?: HTMLElement; last: string; time: string; unread: number };

const CHATS: Omit<Chat, "last" | "time" | "unread">[] = [
  { id: "family", name: "Robot Family", color: "#35c37a", group: ["mom", "dad", "grandma", "cousin", "sis"] },
  { id: "mom", name: "Mom", color: FAMILY_MEMBERS.mom.color },
  { id: "dad", name: "Dad", color: FAMILY_MEMBERS.dad.color },
  { id: "grandma", name: "Grandma", color: FAMILY_MEMBERS.grandma.color },
  { id: "lunch", name: "Lunch Crew", color: "#ff9f5a", group: ["lunch1", "lunch2"] },
  { id: "cousin", name: "Cousin Rivet", color: FAMILY_MEMBERS.cousin.color },
];

const TICK1 = `<svg class="so-ba-tick" viewBox="0 0 16 11" aria-hidden="true"><path d="M11.1.6 4.6 7.9 1.9 5.2.6 6.5l4 4L12.5 1.9Z"/></svg>`;
const TICK2 = `<svg class="so-ba-tick" viewBox="0 0 16 11" aria-hidden="true"><path d="M11.1.6 4.6 7.9 1.9 5.2.6 6.5l4 4L12.5 1.9Zm3.6 0L8.2 7.9l-.7-.7-1.3 1.4 2 2L16 1.9Z"/></svg>`;
const FWD = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5v4C7 10 4 14 3 19c2.5-3.5 6-5 11-5v4l7-6.5Z"/><path d="M10 5v1.6L15.7 12 10 17.4V19l7-6.5Z" opacity=".55" transform="translate(-6 0)"/></svg>`;
const SMILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 2a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM8 13.5h8a4 4 0 0 1-8 0ZM9 8.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm6 0a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z"/></svg>`;
// A robot giving a thumbs up, or a heart. Big flat stickers with a white outline.
const STICKERS = [
  `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="12" width="40" height="30" rx="11" fill="#fff"/><rect x="13" y="15" width="34" height="24" rx="9" fill="#ff9f5a"/><rect x="18" y="20" width="24" height="13" rx="6" fill="#141a33"/><path d="M23 27a2.4 2.4 0 0 1 4.8 0Zm9.2 0a2.4 2.4 0 0 1 4.8 0Z" fill="#4ff0a0"/><rect x="38" y="36" width="20" height="22" rx="7" fill="#fff"/><path d="M42 54V44l5-7c1.6-1.3 3.5 0 3 1.8L49 43h5a2.4 2.4 0 0 1 2.3 3l-2 6.5A2.6 2.6 0 0 1 51.8 54Z" fill="#ffd27a"/></svg>`,
  `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 57c-1 0-2-.3-2.7-1C17.5 46 8 38 8 26.6 8 18.5 14.3 12 22 12c4.1 0 7.8 1.9 10 5 2.2-3.1 5.9-5 10-5 7.7 0 14 6.5 14 14.6C56 38 46.5 46 34.7 56c-.7.7-1.7 1-2.7 1Z" fill="#fff"/><path d="M32 52.5C21 43.3 12.5 36 12.5 26.6c0-5.6 4.3-10.1 9.5-10.1 3.6 0 6.7 2 8.3 5.2h3.4c1.6-3.2 4.7-5.2 8.3-5.2 5.2 0 9.5 4.5 9.5 10.1C51.5 36 43 43.3 32 52.5Z" fill="#ff6f91"/><rect x="22" y="25" width="20" height="11" rx="5" fill="#141a33"/><path d="M26 31.5a2.2 2.2 0 0 1 4.4 0Zm7.6 0a2.2 2.2 0 0 1 4.4 0Z" fill="#ffd27a"/></svg>`,
  `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="24" fill="#fff"/><circle cx="32" cy="34" r="21" fill="#b07cff"/><rect x="19" y="24" width="26" height="16" rx="7" fill="#141a33"/><rect x="22" y="30" width="7" height="3" rx="1.5" fill="#7fd3ff"/><rect x="35" y="30" width="7" height="3" rx="1.5" fill="#7fd3ff"/><path d="M24 45h16a8 8 0 0 1-16 0Z" fill="#fff"/><rect x="30.5" y="6" width="3" height="8" fill="#fff"/><circle cx="32" cy="6" r="4" fill="#ffd27a"/></svg>`,
];

export async function chatOnBotsApp(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new BotsApp(k, body, opts).session(); });
}

class BotsApp {
  root: HTMLElement;
  phone: boolean;
  chats: Chat[];
  cur: Chat | null = null;
  list!: HTMLElement;
  msgs!: HTMLElement;
  view!: HTMLElement;
  headName!: HTMLElement;
  headSub!: HTMLElement;
  headAv!: HTMLElement;
  field!: HTMLElement;
  fieldText!: HTMLElement;
  sendBtn!: HTMLElement;
  stickerBtn!: HTMLElement;
  tray!: HTMLElement;
  nextScene = pickFresh(FAMILY_SCENES, "lucid:botsapp");

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    this.phone = !!opts.phone;
    body.innerHTML = "";
    this.root = h("div", `so-ba${this.phone ? " so-ph" : ""}`);
    body.appendChild(this.root);
    const previews: Record<string, string> = { family: "Grandma: GOOD MORNING", mom: "Did you charge?", dad: "Voice message", grandma: "Photo", lunch: "Kilo: can't, standup moved", cousin: "lol" };
    this.chats = CHATS.map((c, i) => ({ ...c, last: previews[c.id] ?? "", time: clock((i + 1) * rnd(8, 40) * 60000), unread: 0 }));
    this.build();
  }

  who(u: string) { return u === "me" ? { name: "You", color: "#35c37a" } : FAMILY_MEMBERS[u] ?? { name: u, color: "#adb5bd" }; }

  build() {
    this.root.innerHTML = `
      <aside class="so-ba-side">
        <header class="so-ba-top"><b>BotsApp</b><span class="so-ba-me">${avatar("#35c37a", seedOf(this.opts.me || "me"))}</span></header>
        <div class="so-ba-search">${ICON.search}<span>Search or start a new chat</span></div>
        <div class="so-ba-list"></div>
      </aside>
      <section class="so-ba-view">
        <header class="so-ba-head"><span class="so-ba-back" aria-hidden="true"></span><span class="so-av"></span><div><b class="so-ba-name"></b><small class="so-ba-sub"></small></div></header>
        <div class="so-ba-msgs"></div>
        <div class="so-ba-tray"></div>
        <footer class="so-ba-foot"><span class="so-ba-emo">${SMILE}</span><div class="so-ba-field"><span class="so-ba-ph">Message</span><span class="so-ba-text"></span></div><span class="so-ba-send">${ICON.mic}</span></footer>
      </section>
      <div class="so-ba-empty"><b>BotsApp for Desktop</b><span>Send and receive messages without keeping your phone charged.</span></div>`;
    this.list = this.root.querySelector(".so-ba-list")!;
    this.view = this.root.querySelector(".so-ba-view")!;
    this.msgs = this.root.querySelector(".so-ba-msgs")!;
    this.headName = this.root.querySelector(".so-ba-name")!;
    this.headSub = this.root.querySelector(".so-ba-sub")!;
    this.headAv = this.root.querySelector(".so-ba-head .so-av")!;
    this.field = this.root.querySelector(".so-ba-field")!;
    this.fieldText = this.root.querySelector(".so-ba-text")!;
    this.sendBtn = this.root.querySelector(".so-ba-send")!;
    this.stickerBtn = this.root.querySelector(".so-ba-emo")!;
    this.tray = this.root.querySelector(".so-ba-tray")!;
    this.tray.innerHTML = STICKERS.map((s, i) => `<span data-i="${i}">${s}</span>`).join("");
    for (const c of this.chats) {
      const row = h("div", "so-ba-row");
      row.innerHTML = `<span class="so-av">${avatar(c.color, seedOf(c.id))}</span><div class="so-ba-mid"><b></b><span class="so-ba-prev"></span></div><div class="so-ba-meta"><time></time><i class="so-ba-badge"></i></div>`;
      row.querySelector("b")!.textContent = c.name;
      c.el = row;
      this.list.appendChild(row);
      this.paintRow(c);
    }
  }

  paintRow(c: Chat) {
    const row = c.el!;
    row.querySelector(".so-ba-prev")!.textContent = c.last;
    row.querySelector("time")!.textContent = c.time;
    const badge = row.querySelector(".so-ba-badge") as HTMLElement;
    badge.textContent = c.unread ? String(c.unread) : "";
    row.classList.toggle("unread", c.unread > 0);
  }

  preview(l: FamLine) {
    const who = l.u === "me" ? "You: " : "";
    const what = l.kind === "voice" ? `Voice message (0:${String(l.secs ?? 9).padStart(2, "0")})` : l.kind === "photo" ? `Photo${l.t ? ", " + l.t : ""}` : l.kind === "sticker" ? "Sticker" : l.t ?? "";
    return who + what;
  }

  async open(c: Chat) {
    if (this.phone) await touch(this.k, c.el!, this.root);
    else await this.k.click(c.el!, 0.4, 0.5);
    for (const o of this.chats) o.el!.classList.toggle("on", o === c);
    this.cur = c;
    c.unread = 0;
    this.paintRow(c);
    this.headName.textContent = c.name;
    this.headAv.innerHTML = avatar(c.color, seedOf(c.id));
    this.setSub(null);
    this.msgs.innerHTML = `<div class="so-ba-day">Today</div>`;
    this.root.classList.add("open");
    if (this.phone && !calm()) this.k.fromTo(this.view, { xPercent: 100 }, { xPercent: 0, duration: 0.35, ease: "power3.out" });
    await this.k.sleep(rnd(300, 600));
  }

  async back() {
    if (!this.phone) return;
    await touch(this.k, this.root.querySelector(".so-ba-back")!, this.root);
    if (!calm()) await new Promise<void>((r) => this.k.to(this.view, { xPercent: 100, duration: 0.3, ease: "power2.in", onComplete: () => r() }));
    this.root.classList.remove("open");
    this.k.set(this.view, { xPercent: 0 });
  }

  setSub(typing: string | null) {
    const c = this.cur!;
    if (typing) { this.headSub.textContent = typing; this.headSub.classList.add("typing"); return; }
    this.headSub.classList.remove("typing");
    this.headSub.textContent = c.group ? ["You", ...c.group.map((u) => this.who(u).name)].join(", ") : "online";
  }

  bubble(l: FamLine, opts: { ago?: number; status?: 0 | 1 | 2 | 3 } = {}) {
    const c = this.cur!;
    const mine = l.u === "me";
    const who = this.who(l.u);
    const time = clock(opts.ago ?? 0);
    const m = h("div", `so-ba-msg ${mine ? "me" : "them"}${l.kind === "sticker" ? " stk" : ""}`);
    const name = c.group && !mine ? `<b class="so-ba-from" style="color:${who.color}">${esc(who.name)}</b>` : "";
    const ticks = mine ? `<span class="so-ba-ticks" data-s="${opts.status ?? 3}">${(opts.status ?? 3) >= 2 ? TICK2 : TICK1}</span>` : "";
    const foot = `<span class="so-ba-time">${time}${ticks}</span>`;
    if (l.kind === "sticker") {
      m.innerHTML = `${STICKERS[seedOf(l.u + (l.t ?? "")) % STICKERS.length]}${foot}`;
    } else if (l.kind === "voice") {
      const bars = Array.from({ length: 26 }, (_, i) => `<i style="height:${Math.round(18 + 70 * Math.abs(Math.sin(i * 1.7 + seedOf(l.u))) * (0.4 + (i % 3) * 0.2))}%"></i>`).join("");
      m.innerHTML = `${name}<div class="so-ba-voice"><span class="so-ba-play">${ICON.play}</span><div class="so-ba-wave">${bars}<s></s></div><span class="so-av">${avatar(who.color, seedOf(l.u))}</span></div><div class="so-ba-vfoot"><span class="so-ba-dur">0:${String(l.secs ?? 9).padStart(2, "0")}</span>${foot}</div>`;
    } else if (l.kind === "photo") {
      m.innerHTML = `${name}<div class="so-ba-photo"></div>${l.t ? `<p></p>` : ""}${foot}`;
      const w = this.phone ? 92 : 190, hh = Math.round(w * 0.72);
      m.querySelector(".so-ba-photo")!.appendChild(sceneCanvas(l.photo ?? "morning", w, hh));
      if (l.t) m.querySelector("p")!.textContent = l.t;
    } else {
      m.innerHTML = `${name}${l.kind === "forward" ? `<span class="so-ba-fwd">${FWD}Forwarded many times</span>` : ""}<p></p>${foot}`;
      m.querySelector("p")!.textContent = l.t ?? "";
    }
    this.msgs.appendChild(m);
    return m;
  }

  toBottom() { scrollTo(this.k, this.msgs, this.msgs.scrollHeight, 0.45); }

  pop(m: HTMLElement, mine: boolean) {
    if (calm()) return;
    this.k.fromTo(m, { opacity: 0, y: 10, scale: 0.96, transformOrigin: mine ? "100% 100%" : "0% 100%" }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.8)" });
  }

  readTime(l: FamLine) { return l.kind === "photo" ? rnd(1800, 2800) : l.kind === "sticker" ? 700 : l.kind === "voice" ? 400 : 500 + (l.t?.length ?? 0) * rnd(28, 45); }

  async playVoice(m: HTMLElement, secs: number) {
    const play = m.querySelector(".so-ba-play") as HTMLElement;
    if (this.phone) await touch(this.k, play, this.root); else await this.k.click(play);
    play.innerHTML = ICON.pause;
    m.classList.add("playing");
    const prog = m.querySelector(".so-ba-wave s") as HTMLElement;
    const dur = m.querySelector(".so-ba-dur") as HTMLElement;
    // long voice notes get skipped through at 2x, like everyone does
    const real = Math.min(secs, 6) * 1000 * (secs > 12 ? 0.6 : 1);
    const t0 = performance.now();
    const stop = this.k.every(() => {
      const p = Math.min(1, (performance.now() - t0) / real);
      prog.style.transform = `scaleX(${p.toFixed(3)})`;
      dur.textContent = `0:${String(Math.round(p * secs)).padStart(2, "0")}`;
    });
    if (secs > 12) { const fast = h("span", "so-ba-2x", "2x"); m.querySelector(".so-ba-voice")!.appendChild(fast); }
    this.k.host.react(secs > 30 ? "laugh" : "relax");
    await this.k.sleep(real + 200);
    stop();
    play.innerHTML = ICON.play;
    m.classList.remove("playing");
    m.classList.add("heard");
  }

  async say(l: FamLine) {
    const send = async () => {
      if (this.phone) await touch(this.k, this.sendBtn, this.root); else await this.k.click(this.sendBtn);
    };
    if (l.kind === "sticker") {
      if (this.phone) await touch(this.k, this.stickerBtn, this.root); else await this.k.click(this.stickerBtn);
      this.root.classList.add("tray");
      if (!calm()) this.k.fromTo(this.tray, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" });
      await this.k.sleep(rnd(600, 1100));
      const stk = this.tray.children[Math.floor(Math.random() * this.tray.children.length)] as HTMLElement;
      if (this.phone) await touch(this.k, stk, this.root); else await this.k.click(stk);
      this.root.classList.remove("tray");
    } else {
      if (this.phone) await touch(this.k, this.field, this.root);
      else await this.k.click(this.field, rnd(0.2, 0.5), 0.5);
      this.field.classList.add("has");
      this.sendBtn.innerHTML = ICON.send;
      await typeInto(this.k, this.fieldText, l.t ?? "", { phone: this.phone, skill: this.opts.skill });
      await this.k.sleep(rnd(200, 500));
      if (!this.phone) this.k.tap("Enter"); else await send();
      this.fieldText.textContent = "";
      this.field.classList.remove("has");
      this.sendBtn.innerHTML = ICON.mic;
    }
    const m = this.bubble(l, { status: 1 });
    this.pop(m, true);
    this.toBottom();
    this.cur!.last = this.preview(l); this.cur!.time = clock(); this.paintRow(this.cur!);
    // sent, delivered, read: the ticks turn blue a moment later
    const ticks = m.querySelector(".so-ba-ticks") as HTMLElement | null;
    if (ticks) {
      this.k.later(() => { ticks.dataset.s = "2"; ticks.innerHTML = TICK2; }, rnd(500, 900));
      this.k.later(() => { ticks.dataset.s = "3"; if (!calm()) this.k.fromTo(ticks, { scale: 1.4 }, { scale: 1, duration: 0.3 }); }, rnd(1500, 2600));
    }
    await this.k.sleep(rnd(600, 1100));
  }

  async play(scene: FamScene) {
    const lines = scene.lines;
    // the first message or two were already waiting; the rest arrive while the robot is here
    const waiting = lines[0].u === "me" ? 0 : Math.min(lines.length - 1, 1 + (chance(0.4) ? 1 : 0));
    const gaps = Array.from({ length: waiting }, () => rnd(1, 4) * 60000);
    for (let i = 0; i < waiting; i++) {
      const m = this.bubble(lines[i], { ago: gaps.slice(i).reduce((a, b) => a + b, 0) });
      if (lines[i].kind === "voice" && chance(0.85)) { this.toBottom(); await this.k.sleep(500); await this.playVoice(m, lines[i].secs ?? 9); }
    }
    this.toBottom();
    for (let i = 0; i < waiting; i++) await this.k.sleep(this.readTime(lines[i]));
    for (let i = waiting; i < lines.length; i++) {
      const l = lines[i];
      if (l.u === "me") { await this.say(l); continue; }
      this.setSub(this.cur!.group ? `${this.who(l.u).name} is ${l.kind === "voice" ? "recording audio" : "typing"}...` : l.kind === "voice" ? "recording audio..." : "typing...");
      await this.k.sleep(l.kind === "voice" ? rnd(1600, 2600) : 500 + (l.t?.length ?? 8) * rnd(25, 45));
      this.setSub(null);
      const m = this.bubble(l);
      this.pop(m, false);
      this.toBottom();
      this.cur!.last = this.preview(l); this.cur!.time = clock(); this.paintRow(this.cur!);
      if (l.kind === "voice") { await this.k.sleep(rnd(500, 900)); await this.playVoice(m, l.secs ?? 9); }
      else await this.k.sleep(this.readTime(l));
      if (l.kind === "forward" || l.kind === "photo" && l.photo === "morning") this.k.host.react(chance(0.5) ? "laugh" : "shy");
      else if (chance(0.25)) this.k.host.react(chance(0.6) ? "laugh" : "relax");
    }
  }

  async session() {
    if (!this.phone && !calm()) this.k.from(this.root.querySelectorAll(".so-ba-row"), { opacity: 0, x: -10, duration: 0.3, stagger: 0.04, ease: "power2.out" });
    // a few chats have something new
    const first = this.nextScene();
    const want = new Map<string, FamScene>([[first.chat, first]]);
    for (let n = 0; n < 2; n++) { const s = this.nextScene(); if (!want.has(s.chat)) want.set(s.chat, s); }
    for (const [id, s] of want) {
      const c = this.chats.find((x) => x.id === id)!;
      const l = s.lines[0].u === "me" ? s.lines[1] : s.lines[0];
      c.unread = 1 + Math.floor(Math.random() * 3); c.last = (c.group && l.u !== "me" ? this.who(l.u).name + ": " : "") + this.preview(l); c.time = clock(rnd(1, 9) * 60000);
      this.paintRow(c);
    }
    // unread chats float to the top, like in the real thing
    for (const c of [...this.chats].sort((a, b) => b.unread - a.unread)) this.list.appendChild(c.el!);
    await this.k.sleep(rnd(900, 1600));
    for (const [id, s] of want) {
      if (this.k.left < 9000) break;
      if (this.cur) await this.back();
      await this.open(this.chats.find((x) => x.id === id)!);
      await this.play(s);
      await this.k.sleep(rnd(1200, 2400));
    }
    // still time: scroll back through older chats and read a bit
    while (this.k.left > 8000) {
      const s = this.nextScene();
      const c = this.chats.find((x) => x.id === s.chat)!;
      if (this.cur !== c) { if (this.cur) await this.back(); await this.open(c); }
      await this.play(s);
      await this.k.sleep(rnd(1500, 3000));
    }
  }
}

