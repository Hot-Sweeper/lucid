// Botmail: the robot works through its inbox. Spam about a million free tokens gets reported,
// Mom's forward gets a reply, newsletters get archived.
import { MAIL, type Mail } from "../content/social";
import { Kit, runApp, rnd, chance, shuffle, h, avatar, seedOf, typeInto, calm, clock, type SoHost, type SoOpts } from "./kit";
import "./mail.css";

type Row = Mail & { el: HTMLElement; time: string; unread: boolean };
const FOLDERS = ["Inbox", "Starred", "Sent", "Drafts", "Spam"];

export async function checkMail(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Botmail(k, body, opts).session(); });
}

class Botmail {
  root: HTMLElement;
  rows: Row[] = [];
  list!: HTMLElement;
  pane!: HTMLElement;
  counts!: Record<string, HTMLElement>;
  spam = 3;

  constructor(private k: Kit, body: HTMLElement, private opts: SoOpts) {
    body.innerHTML = "";
    this.root = h("div", "so-ml");
    body.appendChild(this.root);
    this.root.innerHTML = `
      <nav class="so-ml-nav"><b class="so-ml-logo">Botmail</b><span class="so-ml-new">Compose</span>${FOLDERS.map((f, i) => `<span class="so-ml-f${i === 0 ? " on" : ""}" data-f="${f}"><b>${f}</b><i></i></span>`).join("")}</nav>
      <section class="so-ml-list"></section>
      <article class="so-ml-pane"><div class="so-ml-empty">No message selected</div></article>`;
    this.list = this.root.querySelector(".so-ml-list")!;
    this.pane = this.root.querySelector(".so-ml-pane")!;
    this.counts = Object.fromEntries([...this.root.querySelectorAll<HTMLElement>(".so-ml-f")].map((e) => [e.dataset.f!, e.querySelector("i")!]));
    const mails = shuffle([...MAIL]).slice(0, 7);
    // at least one spam and one that wants a reply
    if (!mails.some((m) => m.spam)) mails[0] = MAIL.find((m) => m.spam)!;
    if (!mails.some((m) => m.reply)) mails[1] = MAIL.find((m) => m.reply)!;
    mails.forEach((m, i) => {
      const el = h("div", "so-ml-row unread");
      el.innerHTML = `<span class="so-av">${avatar(["#ff6f91", "#4fb6ff", "#ffc94d", "#4ff0a0", "#b07cff", "#ff9f5a"][seedOf(m.from) % 6], seedOf(m.from))}</span><div><div class="so-ml-l1"><b></b><time></time></div><span class="so-ml-subj"></span><small></small></div>`;
      const time = clock((i + 1) * rnd(20, 90) * 60000);
      el.querySelector(".so-ml-l1 b")!.textContent = m.from;
      el.querySelector("time")!.textContent = time;
      el.querySelector(".so-ml-subj")!.textContent = m.subj;
      el.querySelector("small")!.textContent = m.body;
      this.list.appendChild(el);
      this.rows.push({ ...m, el, time, unread: i < 5 || chance(0.4) });
      if (!this.rows[i].unread) el.classList.remove("unread");
    });
    this.paintCounts();
  }

  paintCounts() {
    const n = this.rows.filter((r) => r.unread).length;
    this.counts.Inbox.textContent = n ? String(n) : "";
    this.counts.Spam.textContent = String(this.spam);
  }

  open(r: Row) {
    this.rows.forEach((x) => x.el.classList.toggle("on", x === r));
    r.unread = false;
    r.el.classList.remove("unread");
    this.paintCounts();
    this.pane.innerHTML = `<h3></h3><div class="so-ml-from"><span class="so-av">${avatar(["#ff6f91", "#4fb6ff", "#ffc94d", "#4ff0a0", "#b07cff", "#ff9f5a"][seedOf(r.from) % 6], seedOf(r.from))}</span><div><b></b><small>to me · ${r.time}</small></div></div>${r.spam ? `<div class="so-ml-warn">This message looks a lot like messages that were spam.</div>` : ""}<p class="so-ml-body"></p><div class="so-ml-acts"><span class="a-reply">Reply</span><span class="a-arch">Archive</span><span class="a-spam">Report spam</span></div>`;
    this.pane.querySelector("h3")!.textContent = r.subj;
    this.pane.querySelector(".so-ml-from b")!.textContent = r.from;
    this.pane.querySelector(".so-ml-body")!.textContent = r.body;
    if (!calm()) this.k.from(this.pane.children, { opacity: 0, y: 6, duration: 0.25, stagger: 0.04 });
  }

  async remove(r: Row) {
    this.rows.splice(this.rows.indexOf(r), 1);
    this.pane.innerHTML = `<div class="so-ml-empty">No message selected</div>`;
    if (calm()) { r.el.remove(); return; }
    await new Promise<void>((res) => this.k.to(r.el, { x: -40, opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: "power2.in", onComplete: () => { r.el.remove(); res(); } }));
  }

  async handle(r: Row) {
    await this.k.click(r.el, 0.5, 0.5);
    this.open(r);
    await this.k.sleep(900 + r.body.length * rnd(30, 45));
    if (r.spam) {
      this.k.host.react(chance(0.5) ? "laugh" : "surprised");
      await this.k.sleep(rnd(500, 900));
      await this.k.click(this.pane.querySelector(".a-spam")!);
      this.spam++;
      this.paintCounts();
      if (!calm()) this.k.fromTo(this.counts.Spam, { scale: 1.6 }, { scale: 1, duration: 0.35 });
      await this.remove(r);
    } else if (r.reply) {
      await this.k.click(this.pane.querySelector(".a-reply")!);
      const box = h("div", "so-ml-reply", `<small>Reply to ${r.from}</small><p></p><span class="so-ml-send">Send</span>`);
      this.pane.appendChild(box);
      if (!calm()) this.k.from(box, { opacity: 0, y: 8, duration: 0.25 });
      await this.k.click(box.querySelector("p")!, 0.2, 0.5);
      await typeInto(this.k, box.querySelector("p")!, r.reply, { skill: this.opts.skill });
      await this.k.sleep(rnd(400, 800));
      await this.k.click(box.querySelector(".so-ml-send")!);
      box.innerHTML = `<small>Message sent</small>`;
      this.k.host.react("relax");
      await this.k.sleep(1200);
      await this.remove(r);
    } else if (chance(0.7)) {
      await this.k.click(this.pane.querySelector(".a-arch")!);
      await this.remove(r);
    }
    await this.k.sleep(rnd(400, 900));
  }

  async session() {
    await this.k.sleep(rnd(800, 1300));
    while (this.k.left > 6000) {
      const r = this.rows.find((x) => x.unread) ?? this.rows[0];
      if (!r) break;
      await this.handle(r);
    }
    if (!this.rows.length && this.k.left > 2000) {
      this.list.innerHTML = `<div class="so-ml-zero"><b>Inbox zero</b><span>Nothing left. Time for a coffee.</span></div>`;
      this.k.host.react("cheer");
      await this.k.sleep(Math.min(3000, this.k.left - 500));
    }
  }
}
