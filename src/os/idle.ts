import gsap from "gsap";
import { WM, Cancelled } from "./wm";
import { CalcApp, IDLE_SUMS } from "./calc";
import type { SeatedRobot as Robot } from "../office/rig";
import type { DeskStage as Stage } from "../office/desk";
import { playSnake, playFlappy, playDash, watchPhoneFeed, watchTube, browseTensorHub, type FunHost } from "../fun";
import "../fun/fun.css";
import { makeBeat } from "../life/beats";
import { hangOutInChat } from "../life/chat";
import "../life/life.css";

// What the robot does when there is no work: tidy the desktop, play a game,
// and finally lock the screen and doze off. Any new work stops it at once.

const T = {
  tidyAfter: 4000,
  gameAfter: 1200,
  gameFor: 90000,
  lockAfterMs: 9 * 60 * 1000,
};

export class IdleLife {
  token = 0;
  private active = false;
  private stopGame: (() => void) | null = null;
  private lockEl: HTMLElement | null = null;
  private clockTimer = 0;
  private phoneUp = false;
  onActivity: (t: string) => void = () => {};

  /** The robot's web browser, set by the director, for surfing when bored. */
  browser: { visit(target: string): Promise<void>; act(caption: string, title?: string, url?: string): Promise<void> } | null = null;

  constructor(private wm: WM, private robot: Robot, private stage: Stage) {
    const scale = Number(new URLSearchParams(location.search).get("idleScale") || localStorage.getItem("lucid:idleScale") || 1);
    if (scale > 0 && scale !== 1) for (const k of Object.keys(T) as (keyof typeof T)[]) T[k] *= scale;
  }

  get isActive() { return this.active; }

  begin(opts: { locked?: boolean } = {}) {
    if (this.active) return;
    this.active = true;
    const tok = ++this.token;
    this.run(tok, opts).catch((err) => { if (!(err instanceof Cancelled)) console.error("idle failed", err); });
  }

  // Stop instantly (new work or another thread). Cancels anything mid-animation.
  stop() {
    if (!this.active) return;
    this.active = false;
    this.token++;
    this.wm.epoch++;
    this.stopGame?.();
    this.stopGame = null;
    if (this.phoneUp) { this.phoneUp = false; void this.robot.holdPhone(false); }
    if (this.wm.isOpen("game")) this.wm.close("game");
    this.unlock();
    this.stage.sleepy(false);
    this.robot.wake();
  }

  private alive(tok: number) {
    if (tok !== this.token) throw new Cancelled();
  }

  private wait(ms: number, tok: number) {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (tok !== this.token) return reject(new Cancelled());
        if (Date.now() - start >= ms) return resolve();
        setTimeout(tick, Math.min(250, ms));
      };
      tick();
    });
  }

  private async run(tok: number, opts: { locked?: boolean }) {
    this.wm.speed = 1;
    if (opts.locked) {
      await this.tidy(tok, true);
      return this.lock(tok);
    }
    this.onActivity("Waiting for a task");
    await this.wait(T.tidyAfter, tok);
    await this.tidy(tok, false);
    this.robot.setPose("rest");
    await this.wait(T.gameAfter, tok);
    const startedAt = Date.now();
    const recent: string[] = [];
    // A bored afternoon: weighted picks, shaped by the robot's own preferences,
    // never the same thing twice in a row. After a while it locks up and naps.
    while (Date.now() - startedAt < T.lockAfterMs) {
      this.alive(tok);
      const act = this.pick(recent);
      recent.unshift(act);
      recent.length = Math.min(recent.length, 3);
      await this.doActivity(act, tok);
      this.alive(tok);
      this.robot.setPose("rest");
      this.onActivity("Waiting for a task");
      if (Math.random() < 0.3) { this.robot.setPose("mouse"); await this.wm.fidget(); this.alive(tok); this.robot.setPose("rest"); }
      await this.wait(600 + Math.random() * 1000, tok);
    }
    await this.lock(tok);
  }

  private pick(recent: string[]) {
    const p = this.wm.prefs;
    const g = p?.games ?? { snake: 1, flappy: 1, dash: 1, chess: 1 };
    // The robot's hobby dominates; beats are only for robots that actually like making music.
    const hobby = p?.hobby ?? "chiller";
    const H = (k: string) => (hobby === k ? 1 : 0);
    const games = 0.35 + 2.2 * H("gamer");
    const weights: Record<string, number> = {
      snake: games * g.snake, flappy: games * g.flappy, dash: games * g.dash, chess: games * 0.8 * g.chess,
      phone: (p?.phone === "tube" ? 0.4 : 1) * (0.6 + 1.6 * H("chiller") + 1.2 * H("watcher")),
      tube: (p?.phone === "tube" ? 1 : 0.4) * (0.4 + 2.4 * H("watcher")),
      tensorhub: 0.05 + 0.1 * H("watcher"),
      coffee: 0.6 + 0.8 * H("chiller"), stretch: 0.3 + 0.3 * H("chiller"), messages: 0.4,
      beats: H("musician") ? 2.6 : (p?.music ?? 0) >= 0.8 ? 0.25 : 0,
      social: 0.25 * (p?.social ?? 0.4) + 2.4 * H("chatter"),
      browse: this.browser ? 0.7 + 0.9 * H("chiller") + 0.4 * H("watcher") : 0,
      calc: 0.3,
    };
    for (const r of recent) if (weights[r] != null) weights[r] *= r === recent[0] ? 0 : 0.25;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { x -= w; if (x <= 0) return k; }
    return "coffee";
  }

  // The fun pack talks to the robot through this host.
  private host(tok: number): FunHost {
    const me = this;
    return {
      sleep: (ms) => me.wait(ms, tok),
      pointAt: (el, ax, ay, ms) => me.wm.pointAt(el, ax, ay, ms),
      click: () => me.wm.click(),
      tap: (key) => me.robot.tap(key),
      react: (kind) => me.robot.react(kind),
      get stopped() { return tok !== me.token; },
      thumb: () => me.robot.swipe(),
      scroll: () => {},
    };
  }

  private async doActivity(act: string, tok: number) {
    const host = this.host(tok);
    const skill = 0.35 + Math.random() * 0.5;
    const game = async (title: string, play: (b: HTMLElement, h: FunHost, o: { maxMs: number; skill?: number }) => Promise<{ result: string }>) => {
      this.onActivity(`Playing ${title} while it waits`);
      const w = await this.wm.open("game", title);
      this.alive(tok);
      w.body.innerHTML = "";
      this.stopGame = () => { w.body.innerHTML = ""; };
      const out = await play(w.body, host, { maxMs: T.gameFor * (0.6 + Math.random() * 0.6), skill });
      this.alive(tok);
      if (out.result === "ragequit") {
        // slam it shut
        this.onActivity(`Rage quit ${title}`);
        this.robot.react("angry");
        this.wm.close("game");
        await this.wait(2200, tok);
      } else {
        await this.closeWin("game", tok);
      }
    };
    switch (act) {
      case "snake": return game("Snake", playSnake);
      case "flappy": return game("Flappy Drone", playFlappy);
      case "dash": return game("Dash", playDash);
      case "chess": {
        this.onActivity("Playing chess while it waits");
        await this.playChess(tok);
        return this.closeWin("game", tok);
      }
      case "phone": {
        const screen = this.stage.phoneScreen;
        if (!screen) return;
        this.onActivity("Scrolling clips on its phone");
        await this.robot.holdPhone(true);
        this.phoneUp = true;
        screen.innerHTML = "";
        try { await watchPhoneFeed(screen, host, { maxMs: 40000 + Math.random() * 50000 }); }
        finally { if (tok === this.token) { await this.robot.holdPhone(false); this.phoneUp = false; } }
        return;
      }
      case "tube": {
        this.onActivity("Watching robot videos");
        const w = await this.wm.open("browser", "BotTube");
        this.alive(tok);
        w.body.innerHTML = "";
        await watchTube(w.body, host, { maxMs: 50000 + Math.random() * 50000 });
        return this.closeWin("browser", tok);
      }
      case "tensorhub": {
        this.onActivity("Browsing something it should not");
        const w = await this.wm.open("browser", "TensorHub");
        this.alive(tok);
        w.body.innerHTML = "";
        await browseTensorHub(w.body, host, { maxMs: 18000 + Math.random() * 12000 });
        this.alive(tok);
        this.wm.close("browser"); // closed fast, nobody saw anything
        this.robot.react("shy");
        return this.wait(1500, tok);
      }
      case "beats": {
        this.onActivity("Making a beat in BeatLab");
        const w = await this.wm.open("beats", "BeatLab");
        this.alive(tok);
        await makeBeat(w.body, host, { maxMs: 60000 + Math.random() * 60000 });
        return this.closeWin("beats" as any, tok);
      }
      case "social": {
        this.onActivity("Hanging out with robot friends");
        const w = await this.wm.open("social", "Botcord");
        this.alive(tok);
        await hangOutInChat(w.body, host, { maxMs: 40000 + Math.random() * 50000, me: this.wm.robotName });
        return this.closeWin("social" as any, tok);
      }
      case "browse":
        if (!this.browser) return;
        return this.browse(tok);
      case "calc": {
        const [what, sum] = IDLE_SUMS[Math.floor(Math.random() * IDLE_SUMS.length)];
        this.onActivity(what);
        await new CalcApp(this.wm).compute(sum, what);
        this.alive(tok);
        await this.wait(1200, tok);
        return this.closeWin("calc" as any, tok);
      }
      case "coffee":
        this.onActivity("Sipping coffee");
        return this.robot.drink();
      case "stretch":
        this.onActivity("Stretching");
        this.robot.setPose("stretch");
        return this.wait(2600, tok);
      case "messages": {
        this.onActivity("Checking for new messages");
        await this.wm.open("chat");
        this.alive(tok);
        this.robot.setPose("read");
        await this.wait(1800, tok);
        return this.closeWin("chat", tok);
      }
    }
  }

  // Surfing the real web: a few pages, some searches, a click into something interesting.
  private async browse(tok: number) {
    const b = this.browser!;
    const SITES: [string, string][] = [
      ["Reading a random Wikipedia article", "https://en.wikipedia.org/wiki/Special:Random"],
      ["Reading about cozy software", "https://en.wikipedia.org/wiki/Calm_technology"],
      ["Catching up on tech news", "https://lobste.rs/"],
      ["Reading about robots", "https://en.wikipedia.org/wiki/Robot"],
      ["Reading about the history of AI", "https://en.wikipedia.org/wiki/History_of_artificial_intelligence"],
      ["Brushing up on CSS animations", "https://developer.mozilla.org/en-US/docs/Web/CSS/animation"],
      ["Reading about the Turing test", "https://en.wikipedia.org/wiki/Turing_test"],
      ["Reading about Conway's Game of Life", "https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life"],
    ];
    const SEARCHES = ["how to center a div", "best mechanical keyboard for robots", "is it normal to dream in json", "why is my build green but i feel nothing", "cozy desk setup ideas", "how many tokens is a sandwich", "do androids dream of electric sheep summary"];
    const order = [...SITES].sort(() => Math.random() - 0.5);
    const pages = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pages; i++) {
      this.alive(tok);
      if (i === 1 && Math.random() < 0.6) {
        this.onActivity("Googling something");
        await b.visit(SEARCHES[Math.floor(Math.random() * SEARCHES.length)]);
        this.alive(tok);
      }
      const [what, url] = order[i];
      this.onActivity(what);
      await b.visit(url);
      this.alive(tok);
      if (Math.random() < 0.45) { await b.act("Click a link", undefined, url); this.alive(tok); }
      if (Math.random() < 0.25) this.robot.react(Math.random() < 0.5 ? "laugh" : "surprised");
      await this.wait(1500 + Math.random() * 2500, tok);
    }
    return this.closeWin("browser", tok);
  }

  private async closeWin(id: "game" | "browser" | "chat" | "beats" | "social" | "calc", tok: number) {
    const w = this.wm.wins.get(id);
    if (!w) return;
    await this.wm.pointAt(w.el.querySelector(".win-x")!, 0.5, 0.5, 380);
    this.alive(tok);
    await this.wm.click();
    this.wm.close(id);
  }

  // Close windows one by one, like clearing a desk at the end of the day.
  private async tidy(tok: number, quick: boolean) {
    const wins = [...this.wm.wins.values()].sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
    for (const w of wins) {
      this.alive(tok);
      if (!quick) {
        await this.wm.pointAt(w.el.querySelector(".win-x")!, 0.5, 0.5, 420);
        await this.wm.click();
      }
      this.wm.close(w.id);
      await this.wait(quick ? 60 : 380, tok);
    }
    this.stage.say(null);
  }

  // --- lock screen ---------------------------------------------------------------
  private async lock(tok: number) {
    this.alive(tok);
    this.onActivity("Resting");
    const el = document.createElement("div");
    el.className = "lock";
    el.innerHTML = `<div class="lock-time"></div><div class="lock-date"></div><p class="lock-hint">Waiting for a new task</p>`;
    this.wm.root.appendChild(el);
    this.lockEl = el;
    const paint = () => {
      const now = new Date();
      el.querySelector(".lock-time")!.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      el.querySelector(".lock-date")!.textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    };
    paint();
    this.clockTimer = window.setInterval(paint, 1000);
    gsap.timeline()
      .fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "sine.out" })
      .fromTo(el.querySelector(".lock-time"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "expo.out" }, 0.2)
      .fromTo(el.querySelectorAll(".lock-date, .lock-hint"), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "expo.out", stagger: 0.1 }, 0.35);
    gsap.to(this.wm.cursorEl, { opacity: 0, duration: 0.6 });
    await this.wait(1200, tok);
    this.robot.setPose("sleep");
    this.stage.sleepy(true);
  }

  private unlock() {
    window.clearInterval(this.clockTimer);
    gsap.to(this.wm.cursorEl, { opacity: 1, duration: 0.3 });
    const el = this.lockEl;
    this.lockEl = null;
    if (!el) return;
    gsap.to(el, { yPercent: -100, opacity: 0.4, duration: 0.55, ease: "power3.in", onComplete: () => el.remove() });
  }

  // --- chess -----------------------------------------------------------------------
  // Morphy vs. Duke Karl and Count Isouard, Paris 1858, the "Opera Game". The robot plays white.
  // Real short games, move by move. The robot takes a random side, so sometimes it gets mated.
  private static GAMES: { name: string; moves: string[]; winner: "white" | "black" }[] = [
    { name: "the Opera Game", winner: "white", moves: "e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8".split(" ") },
    { name: "Scholar's Mate", winner: "white", moves: "e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7".split(" ") },
    { name: "Fool's Mate", winner: "black", moves: "f2f3 e7e5 g2g4 d8h4".split(" ") },
    { name: "Legal's Mate", winner: "white", moves: "e2e4 e7e5 g1f3 d7d6 f1c4 c8g4 b1c3 g7g6 f3e5 g4d1 c4f7 e8e7 c3d5".split(" ") },
    { name: "the Blackburne Shilling trap", winner: "black", moves: "e2e4 e7e5 g1f3 b8c6 f1c4 c6d4 f3e5 d8g5 e5f7 g5g2 h1f1 g2e4 c4e2 d4f3".split(" ") },
  ];

  private async playChess(tok: number) {
    const w = await this.wm.open("game", "Chess");
    this.alive(tok);
    const glyph: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
    const G = IdleLife.GAMES[Math.floor(Math.random() * IdleLife.GAMES.length)];
    const robotWhite = Math.random() < 0.6;
    w.body.innerHTML = `<div class="game chess"><div class="game-head"><span>Chess</span><span class="score">Robot plays ${robotWhite ? "white" : "black"}</span></div><div class="board-wrap"><div class="board"></div></div></div>`;
    const board = w.body.querySelector(".board") as HTMLElement;
    const status = w.body.querySelector(".score") as HTMLElement;
    let sq = "";
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) sq += `<i class="${(r + f) % 2 ? "l" : "d"}" data-sq="${"abcdefgh"[f]}${r + 1}"></i>`;
    board.innerHTML = sq;
    const size = board.clientWidth / 8;
    const at = (s: string) => ({ x: ("abcdefgh".indexOf(s[0])) * size, y: (8 - Number(s[1])) * size });
    const pieces = new Map<string, HTMLElement>();
    const place = (s: string, type: string, white: boolean) => {
      const p = document.createElement("span");
      p.className = `pc ${white ? "w" : "b"}`;
      p.textContent = glyph[type] + "︎";
      p.style.width = p.style.height = `${size}px`;
      p.style.fontSize = `${size * 0.78}px`;
      board.appendChild(p);
      gsap.set(p, at(s));
      pieces.set(s, p);
    };
    const back = "rnbqkbnr";
    for (let f = 0; f < 8; f++) {
      const file = "abcdefgh"[f];
      place(`${file}1`, back[f], true); place(`${file}2`, "p", true);
      place(`${file}7`, "p", false); place(`${file}8`, back[f], false);
    }
    gsap.from(board.querySelectorAll(".pc"), { opacity: 0, y: "-=10", duration: 0.35, stagger: 0.012, ease: "power2.out" });
    this.robot.setPose("mouse");
    const mark = (a: string, b: string) => {
      board.querySelectorAll("i.last").forEach((e) => e.classList.remove("last"));
      board.querySelector(`[data-sq="${a}"]`)!.classList.add("last");
      board.querySelector(`[data-sq="${b}"]`)!.classList.add("last");
    };
    const move = async (from: string, to: string, robot: boolean) => {
      const p = pieces.get(from);
      if (!p) return;
      const victim = pieces.get(to);
      if (robot) {
        await this.wm.pointAt(board.querySelector(`[data-sq="${from}"]`)!, 0.5, 0.5, 420);
        this.robot.click();
        p.classList.add("lift");
        const target = board.querySelector(`[data-sq="${to}"]`)!;
        const t = this.wm.pos(target);
        const moving = this.wm.moveTo(t.x, t.y, 520);
        gsap.to(p, { ...at(to), duration: 0.5, ease: "power2.inOut" });
        await moving;
        p.classList.remove("lift");
        this.robot.click();
      } else {
        await gsap.to(p, { ...at(to), duration: 0.55, ease: "power3.inOut" });
      }
      if (victim) {
        pieces.delete(to);
        gsap.to(victim, { scale: 0.2, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => victim.remove() });
      }
      pieces.delete(from);
      pieces.set(to, p);
      gsap.fromTo(p, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
      mark(from, to);
    };
    const moves = G.moves;
    const ROOK: Record<string, [string, string]> = { e1c1: ["a1", "d1"], e1g1: ["h1", "f1"], e8c8: ["a8", "d8"], e8g8: ["h8", "f8"] };
    for (let i = 0; i < moves.length; i++) {
      this.alive(tok);
      const m = moves[i], from = m.slice(0, 2), to = m.slice(2, 4);
      const whiteMove = i % 2 === 0, mine = whiteMove === robotWhite;
      const king = pieces.get(from)?.textContent?.startsWith("♚");
      if (!mine) { status.textContent = "Opponent is thinking"; await this.wait(700 + Math.random() * 900, tok); }
      else { status.textContent = "Robot's move"; this.robot.setPose("read"); await this.wait(600 + Math.random() * 1400, tok); this.robot.setPose("mouse"); }
      await move(from, to, mine);
      if (king && ROOK[m]) await move(ROOK[m][0], ROOK[m][1], false); // castling: the rook follows
    }
    const won = (G.winner === "white") === robotWhite;
    status.textContent = won ? `Checkmate! The robot wins (${G.name})` : `Checkmated by ${G.name}`;
    gsap.fromTo(status, { scale: 1.2 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    if (won) this.robot.setPose("celebrate");
    else { this.robot.react(Math.random() < 0.5 ? "angry" : "shy"); }
    await this.wait(won ? 5000 : 3000, tok);
  }
}
