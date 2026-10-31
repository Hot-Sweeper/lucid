import gsap from "gsap";
import type { SeatedRobot as Robot } from "../office/rig";
const SCREEN = { w: 820, h: 461 };
import { ICONS } from "./icons";
import { wakeRender, renderFps } from "../perf/render";

export class Cancelled extends Error {}

export type AppId = "files" | "editor" | "terminal" | "browser" | "chat" | "tool" | "game" | "harness" | "beats" | "social" | "notes" | "tasks" | "calc" | "music" | "weather" | "gitdesk" | "botword" | "cellsheet" | "slidedeck" | "botsapp" | "telegrid" | "chirp" | "doodle" | "crossword" | "solitaire" | "stocks" | "mail" | "lingo" | "t3code" | "instaweb" | "spoolweb" | "sparkplug" | "photos" | "player" | "codex" | "steam" | "trading";

type Frame = { x: number; y: number; w: number; h: number };
const FRAMES: Record<AppId, Frame> = {
  files: { x: 14, y: 14, w: 400, h: 360 },
  editor: { x: 176, y: 12, w: 630, h: 384 },
  terminal: { x: 24, y: 196, w: 500, h: 208 },
  browser: { x: 40, y: 12, w: 740, h: 390 },
  chat: { x: 538, y: 26, w: 268, h: 372 },
  tool: { x: 470, y: 228, w: 330, h: 170 },
  game: { x: 190, y: 14, w: 440, h: 392 },
  harness: { x: 110, y: 22, w: 600, h: 356 },
  beats: { x: 40, y: 12, w: 740, h: 390 },
  social: { x: 40, y: 12, w: 740, h: 390 },
  notes: { x: 470, y: 30, w: 330, h: 300 },
  tasks: { x: 112, y: 16, w: 596, h: 380 },
  calc: { x: 560, y: 60, w: 236, h: 330 },
  music: { x: 110, y: 18, w: 600, h: 386 },
  weather: { x: 470, y: 40, w: 320, h: 260 },
  gitdesk: { x: 70, y: 14, w: 680, h: 384 },
  botword: { x: 70, y: 10, w: 680, h: 396 },
  cellsheet: { x: 40, y: 10, w: 740, h: 396 },
  slidedeck: { x: 50, y: 10, w: 720, h: 396 },
  botsapp: { x: 90, y: 16, w: 620, h: 380 },
  telegrid: { x: 80, y: 14, w: 640, h: 384 },
  chirp: { x: 100, y: 10, w: 620, h: 392 },
  doodle: { x: 110, y: 14, w: 600, h: 380 },
  crossword: { x: 160, y: 20, w: 500, h: 360 },
  solitaire: { x: 110, y: 10, w: 600, h: 392 },
  stocks: { x: 110, y: 18, w: 600, h: 370 },
  mail: { x: 80, y: 12, w: 660, h: 384 },
  lingo: { x: 200, y: 12, w: 420, h: 384 },
  instaweb: { x: 60, y: 10, w: 700, h: 392 },
  spoolweb: { x: 60, y: 10, w: 700, h: 392 },
  sparkplug: { x: 70, y: 12, w: 680, h: 390 },
  t3code: { x: 60, y: 10, w: 700, h: 396 },
  photos: { x: 470, y: 228, w: 330, h: 170 },
  player: { x: 150, y: 14, w: 520, h: 340 },
codex: { x: 70, y: 12, w: 680, h: 396 },
  steam: { x: 50, y: 10, w: 720, h: 398 },
  trading: { x: 40, y: 10, w: 740, h: 398 },
};
const TITLES: Record<AppId, string> = { files: "Files", editor: "Code", terminal: "Terminal", browser: "Browser", chat: "Messages", tool: "Tools", game: "Games", harness: "Agents", beats: "BeatLab", social: "Botcord", notes: "Notes", tasks: "Tasks", calc: "Calculator", music: "Botify", weather: "Weather", gitdesk: "GitHub Desktop", botword: "Botword", cellsheet: "Cellsheet", slidedeck: "Slidedeck", botsapp: "BotsApp", telegrid: "Telegrid", chirp: "Chirp", doodle: "Sketchpad", crossword: "Crossbot", solitaire: "Solitaire", stocks: "Ticker", mail: "Botmail", lingo: "Lingobot", instaweb: "Instabot", spoolweb: "Spool", sparkplug: "Sparkplug", t3code: "T3 Code", photos: "Photos", player: "Player", codex: "Codex", steam: "Steambot", trading: "Tradebot" };
const DOCK: AppId[] = ["files", "editor", "terminal", "browser", "gitdesk", "music", "t3code", "notes", "tasks", "calc", "weather", "harness", "tool", "beats", "social", "game", "botword", "cellsheet", "slidedeck", "botsapp", "telegrid", "chirp", "mail", "doodle", "crossword", "solitaire", "stocks", "lingo", "instaweb", "spoolweb", "sparkplug", "photos", "player", "codex", "steam", "trading"];

export type Win = { id: AppId; el: HTMLElement; body: HTMLElement; title: HTMLElement; lastUsed: number };

export class WM {
  root: HTMLElement;
  layer: HTMLElement;
  dock: HTMLElement;
  cursorEl: HTMLElement;
  wins = new Map<AppId, Win>();
  onCursor?: (x: number, y: number) => void;
  private _prefs: import("../office/roster").Prefs | null = null;
  get prefs() { return this._prefs; }
  set prefs(p) { this._prefs = p; if (this.dock) this.renderDock(false); }
  robotName = "unit";
  speed = 1;
  epoch = 0;
  // An app can ask for a different window size before it opens (the Tasks checklist is narrower).
  frameHint: Partial<Record<AppId, Frame>> = {};
  private z = 10;
  private cursor = { x: SCREEN.w * 0.55, y: SCREEN.h * 0.5 };
  robot: Robot;
  private clockTimer = 0;
  private cursorX!: (x: number) => void;
  private cursorY!: (y: number) => void;
  private movingWindows = new Map<Win, number>();

  constructor(screen: HTMLElement, robot: Robot) {
    this.robot = robot;
    screen.innerHTML = `
      <div class="os">
        <div class="wallpaper"><img class="wall-logo" alt=""></div>
        <div class="win-layer"></div>
        <nav class="dock" aria-label="Apps"></nav>
        <div class="os-clock" aria-hidden="true"></div>
        <div class="toast-layer"></div>
        <div class="cursor" aria-hidden="true"><svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg></div>
      </div>`;
    this.root = screen.querySelector(".os")!;
    this.layer = screen.querySelector(".win-layer")!;
    this.dock = screen.querySelector(".dock")!;
    this.renderDock(false);
    this.cursorEl = screen.querySelector(".cursor")!;
    gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y });
    this.cursorX = gsap.quickSetter(this.cursorEl, "x", "px") as (x: number) => void;
    this.cursorY = gsap.quickSetter(this.cursorEl, "y", "px") as (y: number) => void;
    // the clock in the corner shows the real time
    const clock = this.root.querySelector(".os-clock") as HTMLElement;
    const paint = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
    paint();
    this.clockTimer = window.setInterval(() => { if (this.root.isConnected) paint(); }, 15000);
  }

  setWallpaper(css: string) {
    (this.root.querySelector(".wallpaper") as HTMLElement).style.background = css;
  }

  setWallpaperLogo(src: string) {
    (this.root.querySelector(".wall-logo") as HTMLImageElement).src = src;
  }

  // --- timing --------------------------------------------------------------
  check(epoch: number) {
    if (epoch !== this.epoch) throw new Cancelled();
  }
  async sleep(ms: number, epoch = this.epoch) {
    await new Promise((r) => setTimeout(r, ms / this.speed));
    this.check(epoch);
  }

  // --- cursor --------------------------------------------------------------
  async moveTo(x: number, y: number, ms = 520) {
    const e = this.epoch;
    const from = { ...this.cursor };
    const dist = Math.hypot(x - from.x, y - from.y);
    const dur = Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))) / this.speed;
    // Slight arc so the cursor moves like a hand on a mouse, not a robot arm on rails.
    const bend = (Math.random() - 0.5) * Math.min(80, dist * 0.25);
    const mx = (from.x + x) / 2 - ((y - from.y) / (dist || 1)) * bend, my = (from.y + y) / 2 + ((x - from.x) / (dist || 1)) * bend;
    const p = { t: 0 };
    let paintedAt = 0;
    const paint = () => { this.cursorX(this.cursor.x); this.cursorY(this.cursor.y); };
    this.robot.setPose("mouse");
    await new Promise<void>((resolve) => {
      gsap.to(p, {
        t: 1, duration: dur, ease: "power2.inOut",
        onUpdate: () => {
          const t = p.t, u = 1 - t;
          this.cursor.x = u * u * from.x + 2 * u * t * mx + t * t * x;
          this.cursor.y = u * u * from.y + 2 * u * t * my + t * t * y;
          const now = performance.now(), fps = renderFps(this.root);
          if (!fps || now - paintedAt < 1000 / fps - 1) return;
          paintedAt = now; paint();
          // the physical mouse on the desk moves with the cursor, every frame
          this.robot.mouseTo(this.cursor.x / SCREEN.w, this.cursor.y / SCREEN.h);
          this.onCursor?.(this.cursor.x, this.cursor.y);
        },
        onComplete: () => { paint(); this.robot.mouseTo(this.cursor.x / SCREEN.w, this.cursor.y / SCREEN.h); resolve(); },
      });
      this.robot.lookAt(x / SCREEN.w, y / SCREEN.h);
    });
    this.check(e);
  }

  // Element position in screen coordinates from layout, so it stays right even when
  // the monitor is angled in 3D or the camera zooms.
  pos(el: Element, ax = 0.5, ay = 0.5) {
    // Measure where the thing really is on screen (this includes CSS transforms such as the
    // centred dock), so the cursor lands on exactly what the robot then clicks.
    const s = this.root.getBoundingClientRect();
    if (s.width > 0) {
      const r = el.getBoundingClientRect(), k = s.width / SCREEN.w;
      return { x: (r.left - s.left + r.width * ax) / k, y: (r.top - s.top + r.height * ay) / k };
    }
    const h = el as HTMLElement;
    let x = 0, y = 0;
    let cur: HTMLElement | null = h;
    while (cur && cur !== this.root) {
      x += cur.offsetLeft; y += cur.offsetTop;
      const parent = cur.offsetParent as HTMLElement | null;
      let a: HTMLElement | null = cur.parentElement;
      while (a && a !== parent && a !== this.root) { x -= a.scrollLeft; y -= a.scrollTop; a = a.parentElement; }
      if (parent && parent !== this.root) { x -= parent.scrollLeft; y -= parent.scrollTop; }
      cur = parent;
    }
    if (!(h instanceof HTMLElement)) {
      // SVG elements: fall back to measured geometry relative to the root
      const r = el.getBoundingClientRect(), s = this.root.getBoundingClientRect();
      const k = s.width / SCREEN.w || 1;
      return { x: (r.left - s.left + r.width * ax) / k, y: (r.top - s.top + r.height * ay) / k };
    }
    return { x: x + h.offsetWidth * ax, y: y + h.offsetHeight * ay };
  }

  async pointAt(el: Element, ax = 0.5, ay = 0.5, ms?: number) {
    const p = this.pos(el, ax, ay);
    await this.moveTo(p.x, p.y, ms);
  }

  async click(double = false) {
    const e = this.epoch;
    const ring = document.createElement("span");
    ring.className = "click-ring";
    ring.style.left = this.cursor.x + "px";
    ring.style.top = this.cursor.y + "px";
    this.root.appendChild(ring);
    gsap.fromTo(ring, { scale: 0.2, opacity: 0.8 }, { scale: 1.6, opacity: 0, duration: 0.45, ease: "power2.out", onComplete: () => ring.remove() });
    gsap.fromTo(this.cursorEl, { scale: 1 }, { scale: 0.82, duration: 0.07, yoyo: true, repeat: double ? 3 : 1, transformOrigin: "0 0" });
    this.robot.click();
    await this.sleep(double ? 200 : 110, e);
  }

  // --- windows -------------------------------------------------------------
  isOpen(id: AppId) { return this.wins.has(id); }
  /** Size of the screen the windows live on. */
  get width() { return SCREEN.w; }
  get height() { return SCREEN.h - 50; }

  /** `clicked`: the robot already clicked something that opens the app (a notification), so it skips its usual way there. */
  async open(id: AppId, title?: string, clicked = false): Promise<Win> {
    // The old Messages app is the T3 Code window now: one messaging app, never two
    if (id === "chat") id = "t3code";
    // Two callers can ask for the same app while its window is still opening (it takes a moment
    // to click the icon). The second one waits for that window instead of opening a twin.
    const pending = this.opening.get(id);
    if (pending) {
      const w = await pending;
      if (title) w.title.textContent = title;
      return w;
    }
    // A game is a specific application. Do not search for the shared window slot
    // "Games", or click a shortcut still named after a different game.
    const newGame = id === "game" && !!title && title !== this.titleOf(id);
    if (id === "game" && title) this.brandApp(id, { title });
    const p = this.openNow(id, title, clicked, newGame);
    this.opening.set(id, p);
    try { return await p; } finally { if (this.opening.get(id) === p) this.opening.delete(id); }
  }
  private opening = new Map<AppId, Promise<Win>>();

  private async openNow(id: AppId, title?: string, clicked = false, newGame = false): Promise<Win> {
    const e = this.epoch;
    let w = this.wins.get(id);
    if (w) {
      if (newGame && !clicked) { await this.launch(id); this.check(e); }
      if (newGame) w.body.replaceChildren();
      if (title) w.title.textContent = title;
      if (clicked) this.focus(id);
      else if (Number(w.el.style.zIndex) !== this.z) {
        // bring it back the way this robot usually does: click the window, its dock icon, or Alt+Tab
        const how = this.habit(this.prefs?.switching ?? "click", { click: 0.15, dock: 0.15, alttab: 0.12 });
        if (how === "alttab") await this.altTab(id);
        else if (how === "dock") { await this.pointAt(this.dock.querySelector(`[data-app="${id}"]`)!, 0.5, 0.5); await this.click(); }
        else { await this.pointAt(w.el.querySelector(".win-bar")!, 0.6, 0.5, 380); await this.click(); }
        this.focus(id);
        if (this.covered(id) > 0.45 && Math.random() < 0.55) await this.dragTo(id, this.bestSpot(this.frameOf(w), id));
      }
      return w;
    }
    // open it the way this robot usually does, now and then the other way; apps that are not in
    // the dock can only be found with Spotlight
    const pinnedItem = this.dock.querySelector(`[data-app="${id}"]`) as HTMLElement | null;
    if (clicked) { /* already on its way */ }
    else if (newGame || !pinnedItem || this.habit(this.prefs?.launch ?? "dock", { dock: 0.2, spotlight: 0.2 }) === "spotlight") await this.launch(id);
    else {
      await this.pointAt(pinnedItem, 0.5, 0.5);
      // the dock may have shifted while the cursor travelled: land on the icon itself
      await this.pointAt(pinnedItem, 0.5, 0.5, 90);
      await this.click();
    }
    this.check(e);
    this.trim(id);
    const base0 = this.frameHint[id] ?? FRAMES[id];
    // a little variety in size, then the spot that overlaps the open windows least
    const k = 0.92 + Math.random() * 0.12;
    const base = { ...base0, w: Math.min(SCREEN.w - 8, Math.round(base0.w * k)), h: Math.min(SCREEN.h - 58, Math.round(base0.h * (0.96 + Math.random() * 0.06))) };
    // tidy robots find free space; messy ones drop windows wherever, often on top of others
    const messy = this.prefs?.tidiness === "messy" && Math.random() < 0.7;
    const f = this.wins.size && !messy ? this.bestSpot(base) : { ...base, ...this.jitter(base) };
    const el = document.createElement("section");
    el.className = `win app-${id} render-opening`;
    el.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`;
    el.innerHTML = `<header class="win-bar">${this.iconOf(id)}<span class="win-title"></span><span class="win-x" aria-hidden="true"></span></header><div class="win-body"></div>`;
    const titleEl = el.querySelector(".win-title") as HTMLElement;
    titleEl.textContent = title || this.titleOf(id);
    this.layer.appendChild(el);
    w = { id, el, body: el.querySelector(".win-body")!, title: titleEl, lastUsed: Date.now() };
    this.wins.set(id, w);
    this.focus(id);
    const dockItem = this.showInDock(id);
    dockItem.classList.add("running");
    const d = this.pos(dockItem);
    gsap.fromTo(el,
      { opacity: 0, scale: 0.35, x: d.x - (f.x + f.w / 2), y: d.y - (f.y + f.h / 2) },
      { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.55 / this.speed, ease: "expo.out", transformOrigin: "50% 50%", onComplete: () => { el.classList.remove("render-opening"); this.syncOcclusion(); } });
    gsap.fromTo(el.querySelector(".win-body"), { opacity: 0 }, { opacity: 1, duration: 0.4 / this.speed, delay: 0.15 / this.speed });
    await this.sleep(260, e);
    // each robot has its own habit: some go full screen, some tile side by side, some let windows float
    const style = this.prefs?.windows ?? "floating";
    const small = id === "calc" || id === "notes" || id === "tool" || id === "photos";
    const r = Math.random();
    if (style === "fullscreen" && !small && r < 0.6) await this.maximize(id).catch(rethrow);
    else if (this.wins.size >= 2 && r < (style === "tiler" ? 0.35 : style === "fullscreen" ? 0.05 : 0.05)) await this.snap(id, f.x + f.w / 2 < SCREEN.w / 2 ? "left" : "right").catch(rethrow);
    return w;
  }

  // Bored hands: drag a selection box over the empty desktop, once or a few times.
  async fidget(times = 1 + Math.floor(Math.random() * 3)) {
    const e = this.epoch;
    const H = SCREEN.h - 50;
    for (let n = 0; n < times; n++) {
      const x0 = 30 + Math.random() * (SCREEN.w - 260), y0 = 20 + Math.random() * (H - 160);
      const x1 = Math.min(SCREEN.w - 10, x0 + 60 + Math.random() * 220), y1 = Math.min(H - 6, y0 + 40 + Math.random() * 130);
      await this.moveTo(x0, y0, 380);
      this.check(e);
      const box = document.createElement("div");
      box.className = "sel-box";
      this.layer.prepend(box);
      this.robot.click();
      const paint = () => {
        const l = Math.min(x0, this.cursor.x), t = Math.min(y0, this.cursor.y);
        box.style.cssText = `left:${l}px;top:${t}px;width:${Math.abs(this.cursor.x - x0)}px;height:${Math.abs(this.cursor.y - y0)}px`;
      };
      gsap.ticker.add(paint);
      try {
        await this.moveTo(x1, y1, 420 + Math.random() * 300);
        if (Math.random() < 0.5) await this.moveTo(x1 - 40 - Math.random() * 80, y1 + 10 - Math.random() * 60, 300);
      } finally {
        gsap.ticker.remove(paint);
        gsap.to(box, { opacity: 0, duration: 0.18, onComplete: () => box.remove() });
      }
      await this.sleep(150 + Math.random() * 250, e);
    }
  }

  // --- app names and icons --------------------------------------------------
  // Most apps have a fixed name and icon; the harness app takes the name and logo of the
  // harness the robot actually uses (Claude, Codex, OpenCode...), in the dock, Spotlight,
  // the window bar and the app switcher.
  private appTitles: Partial<Record<AppId, string>> = {};
  private appIcons: Partial<Record<AppId, string>> = {};
  titleOf(id: AppId) { return this.appTitles[id] ?? TITLES[id]; }
  iconOf(id: AppId) { return this.appIcons[id] ?? ICONS[id]; }
  brandApp(id: AppId, o: { title?: string; icon?: string }) {
    if (o.title) this.appTitles[id] = o.title;
    if (o.icon) this.appIcons[id] = o.icon;
    const item = this.dock?.querySelector(`[data-app="${id}"]`) as HTMLElement | null;
    if (item) {
      item.title = this.titleOf(id);
      const old = item.firstElementChild;
      const tmp = document.createElement("div");
      tmp.innerHTML = this.iconOf(id);
      if (old && tmp.firstElementChild && old.tagName.toLowerCase() !== "i") old.replaceWith(tmp.firstElementChild);
    }
  }

  // --- the dock: pinned apps, plus whatever is open right now ------------------
  // Everyone has the basics; a robot also pins what it uses a lot (games for gamers, music for
  // music lovers, its task app). Other apps show up while they are open and leave when closed.
  pinned(): AppId[] {
    const p = this.prefs, pins = new Set<AppId>(["files", "editor", "terminal", "browser", "t3code"]);
    if (p?.hobby === "gamer") pins.add("game");
    if (p?.hobby === "musician") pins.add("beats");
    if (p?.hobby === "chatter") pins.add("social");
    if (p?.listens === "always") pins.add("music");
    if (p?.tasks === "board" || p?.tasks === "checklist") pins.add("tasks");
    // robots that like office apps keep their favourites in the dock
    if (p?.office === "writer" || p?.office === "suite") pins.add("botword");
    if (p?.office === "numbers" || p?.office === "suite") pins.add("cellsheet");
    if (p?.office === "slides" || p?.office === "suite") pins.add("slidedeck");
    // favourite pastime apps, and the messengers and feeds it uses most, live in the dock too
    for (const a of p?.apps ?? []) pins.add(a);
    const web: Record<string, AppId> = { botsapp: "botsapp", telegrid: "telegrid", chirp: "chirp", instabot: "instaweb", spool: "spoolweb", sparkplug: "sparkplug" };
    for (const a of (p?.socials ?? []).slice(0, 2)) if (web[a]) pins.add(web[a]);
    return DOCK.filter((id) => pins.has(id));
  }
  private dockItem(id: AppId) {
    const el = document.createElement("div");
    el.className = "dock-item";
    el.dataset.app = id;
    el.title = this.titleOf(id);
    el.innerHTML = `${this.iconOf(id)}<i></i>`;
    return el;
  }
  private renderDock(animate: boolean) {
    const want = [...this.pinned(), ...[...this.wins.keys()].filter((id) => !this.pinned().includes(id))];
    const have = new Map([...this.dock.querySelectorAll<HTMLElement>(".dock-item")].map((el) => [el.dataset.app as AppId, el]));
    for (const [id, el] of have) if (!want.includes(id)) el.remove();
    want.forEach((id) => {
      let el = have.get(id);
      if (!el) { el = this.dockItem(id); if (animate) gsap.from(el, { width: 0, opacity: 0, scale: 0.4, duration: 0.3, ease: "back.out(2)" }); }
      el.classList.toggle("running", this.wins.has(id));
      this.dock.appendChild(el);
    });
  }
  private showInDock(id: AppId) {
    let el = this.dock.querySelector(`[data-app="${id}"]`) as HTMLElement | null;
    if (!el) {
      el = this.dockItem(id);
      this.dock.appendChild(el);
      gsap.from(el, { width: 0, opacity: 0, scale: 0.4, duration: 0.3, ease: "back.out(2)" });
    }
    return el;
  }
  private leaveDock(id: AppId) {
    if (this.wins.has(id) || this.pinned().includes(id)) return;
    const el = this.dock.querySelector(`[data-app="${id}"]`) as HTMLElement | null;
    if (el) gsap.to(el, { width: 0, opacity: 0, scale: 0.4, marginLeft: -7, duration: 0.25, ease: "power2.in", onComplete: () => el.remove() });
  }

  /** Organised robots close windows they have not touched in a while; messy ones never do. */
  async closeStale() {
    const t = this.prefs?.tidiness ?? "normal";
    if (t === "messy") return;
    const maxAge = t === "tidy" ? 45000 : 150000;
    const top = Math.max(...[...this.wins.values()].map((w) => Number(w.el.style.zIndex) || 0));
    const stale = [...this.wins.values()].filter((w) => Date.now() - w.lastUsed > maxAge && Number(w.el.style.zIndex) !== top).sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (!stale) return;
    const e = this.epoch;
    await this.pointAt(stale.el.querySelector(".win-x")!, 0.5, 0.5, 380);
    await this.click();
    this.check(e);
    this.close(stale.id);
  }

  // --- placement -----------------------------------------------------------
  private frameOf(w: Win): Frame {
    // The window manager owns these coordinates. Reading layout after a tween's writes
    // forced style/layout across the entire office, even for a distant robot's cursor.
    const s = w.el.style;
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  }
  private jitter(b: Frame) {
    const H = SCREEN.h - 50;
    return { x: Math.max(4, Math.min(SCREEN.w - b.w - 4, b.x + Math.round((Math.random() - 0.5) * 60))), y: Math.max(4, Math.min(H - b.h, b.y + Math.round((Math.random() - 0.5) * 30))) };
  }
  // how much of a window is hidden under windows in front of it (0..1)
  private covered(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return 0;
    const f = this.frameOf(w), z = Number(w.el.style.zIndex);
    let hidden = 0;
    for (const o of this.wins.values()) if (o !== w && Number(o.el.style.zIndex) > z) hidden += overlap(f, this.frameOf(o));
    return Math.min(1, hidden / (f.w * f.h));
  }
  // The spot for a window of this size that overlaps the others least, preferring its usual
  // place a little, with some randomness so the desktop never looks the same twice.
  private bestSpot(size: Frame, skip?: AppId): Frame {
    const H = SCREEN.h - 50;
    const others = [...this.wins.values()].filter((o) => o.id !== skip).map((o) => this.frameOf(o));
    const xs = new Set<number>([4, SCREEN.w - size.w - 4, Math.round((SCREEN.w - size.w) / 2)]);
    const ys = new Set<number>([4, H - size.h, Math.round((H - size.h) / 2)]);
    for (let i = 1; i < 8; i++) xs.add(Math.round(4 + ((SCREEN.w - size.w - 8) * i) / 8));
    for (let i = 1; i < 4; i++) ys.add(Math.round(4 + ((H - size.h - 4) * i) / 4));
    let best: Frame = { ...size }, bestScore = Infinity;
    for (const x of xs) for (const y of ys) {
      if (x < 4 || y < 4 || x + size.w > SCREEN.w - 4 || y + size.h > H) continue;
      const f = { x, y, w: size.w, h: size.h };
      const cover = others.reduce((s, o) => s + overlap(f, o), 0) / (size.w * size.h);
      const score = cover * 100 + Math.hypot(x - size.x, y - size.y) / 60 + Math.random() * 9;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }
  // grab the title bar and drag the window to a new frame (resizing on drop if needed)
  private beginWindowMove(w: Win) {
    this.movingWindows.set(w, (this.movingWindows.get(w) ?? 0) + 1);
    // The old opaque rectangle is no longer a valid cover while it moves. Resume
    // underlying apps now, so dragging/maximizing never exposes an empty body.
    this.syncOcclusion();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      const count = (this.movingWindows.get(w) ?? 1) - 1;
      if (count > 0) this.movingWindows.set(w, count); else this.movingWindows.delete(w);
      this.syncOcclusion();
    };
  }
  private animateFrame(w: Win, to: Frame | { left: string; top: string; width: string; height: string }, duration: number, delay = 0, ease = "power3.out") {
    const end = this.beginWindowMove(w);
    const frame = "left" in to ? to : { left: to.x, top: to.y, width: to.w, height: to.h };
    return gsap.to(w.el, { ...frame, duration: duration / this.speed, delay: delay / this.speed, ease, onComplete: end, onInterrupt: end });
  }
  async dragTo(id: AppId, to: Frame) {
    const w = this.wins.get(id);
    if (!w) return;
    const e = this.epoch;
    const bar = w.el.querySelector(".win-bar")!;
    await this.pointAt(bar, 0.35, 0.5, 340);
    const r = this.frameOf(w);
    const grab = { x: this.cursor.x - r.x, y: this.cursor.y - r.y };
    w.el.classList.add("dragging");
    const endMove = this.beginWindowMove(w);
    this.robot.click();
    const move = this.moveTo(to.x + grab.x, to.y + grab.y, 520);
    const follow = () => { w.el.style.left = `${this.cursor.x - grab.x}px`; w.el.style.top = `${this.cursor.y - grab.y}px`; };
    gsap.ticker.add(follow);
    try { await move; } finally { gsap.ticker.remove(follow); w.el.classList.remove("dragging"); endMove(); }
    this.check(e);
    if (to.w !== r.w || to.h !== r.h) this.animateFrame(w, to, 0.3, 0, "power2.out");
  }
  // drag to a screen edge: the window snaps to that half, like on a real desktop
  async snap(id: AppId, side: "left" | "right") {
    const H = SCREEN.h - 50;
    const half = { x: side === "left" ? 4 : Math.round(SCREEN.w / 2) + 2, y: 4, w: Math.round(SCREEN.w / 2) - 6, h: H - 4 };
    await this.dragTo(id, { ...half, w: this.frameOf(this.wins.get(id)!).w, h: this.frameOf(this.wins.get(id)!).h, x: side === "left" ? 2 : SCREEN.w - this.frameOf(this.wins.get(id)!).w - 2 });
    const w = this.wins.get(id);
    if (!w) return;
    const flash = document.createElement("div");
    flash.className = "snap-hint";
    flash.style.cssText = `left:${half.x}px;top:${half.y}px;width:${half.w}px;height:${half.h}px`;
    this.layer.appendChild(flash);
    gsap.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.15, yoyo: true, repeat: 1, onComplete: () => flash.remove() });
    this.animateFrame(w, half, 0.32);
    // the window on the other side fills the rest, if there is one
    const other = [...this.wins.values()].filter((o) => o.id !== id).sort((a, b) => b.lastUsed - a.lastUsed)[0];
    if (other && Math.random() < 0.7) {
      const rest = { x: side === "left" ? Math.round(SCREEN.w / 2) + 2 : 4, y: 4, w: half.w, h: half.h };
      this.animateFrame(other, rest, 0.36, 0.12);
    }
    await this.sleep(380);
  }
  // double-click the title bar: full screen
  private unmax = new Map<AppId, { left: string; top: string; width: string; height: string }>();
  async maximize(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    this.unmax.set(id, { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height });
    await this.pointAt(w.el.querySelector(".win-bar")!, 0.5, 0.5, 340);
    await this.click(true);
    this.animateFrame(w, { x: 4, y: 4, w: SCREEN.w - 8, h: SCREEN.h - 58 }, 0.32);
    await this.sleep(360);
  }

  /** Double-click the title bar again: back to where the window was. */
  async unmaximize(id: AppId) {
    const w = this.wins.get(id), was = this.unmax.get(id);
    if (!w || !was) return;
    this.unmax.delete(id);
    await this.pointAt(w.el.querySelector(".win-bar")!, 0.5, 0.5, 300);
    await this.click(true);
    this.animateFrame(w, was, 0.3);
    await this.sleep(340);
  }

  // Open an app by typing its name into the launcher, like a keyboard person would.
  private async launch(id: AppId) {
    const name = this.titleOf(id);
    const e = this.epoch;
    const bar = document.createElement("div");
    bar.className = "launcher";
    bar.innerHTML = `<div class="l-search"><span class="l-q"></span><span class="caret"></span></div><div class="l-result" hidden>${this.iconOf(id)}<span></span><small>Open</small></div>`;
    const result = bar.querySelector<HTMLElement>(".l-result")!;
    result.querySelector("span")!.textContent = name;
    this.root.appendChild(bar);
    gsap.fromTo(bar, { opacity: 0, y: -10, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "power2.out" });
    this.robot.setTyping(true);
    this.robot.pressKey(" ");
    const q = bar.querySelector(".l-q") as HTMLElement;
    try {
      for (const ch of name.toLowerCase()) {
        await this.sleep(70 + Math.random() * 70, e);
        q.textContent += ch;
        this.robot.pressKey(ch);
        result.hidden = (q.textContent?.length || 0) < 2;
      }
      await this.sleep(160, e);
      this.robot.pressKey("Enter");
    } finally {
      this.robot.setTyping(false);
      gsap.to(bar, { opacity: 0, y: -6, duration: 0.2, onComplete: () => bar.remove() });
    }
  }

  // Now and then a window gets dragged somewhere else on the screen.
  async maybeShuffle(id: AppId, chance = 0.18) {
    const w0 = this.wins.get(id);
    if (!w0 || Math.random() > chance) return;
    const pick = Math.random();
    if (pick < 0.35) return this.dragTo(id, this.bestSpot(this.frameOf(w0), id));
    if (pick < 0.5 && this.wins.size >= 2) return this.snap(id, Math.random() < 0.5 ? "left" : "right");
    const w = w0;
    const e = this.epoch;
    const bar = w.el.querySelector(".win-bar")!;
    await this.pointAt(bar, 0.4, 0.5, 360);
    const r = this.frameOf(w);
    const nx = Math.max(4, Math.min(SCREEN.w - r.w - 4, r.x + (Math.random() - 0.5) * 220));
    const ny = Math.max(4, Math.min(SCREEN.h - 50 - r.h, r.y + (Math.random() - 0.5) * 70));
    const grab = { x: this.cursor.x - r.x, y: this.cursor.y - r.y };
    w.el.classList.add("dragging");
    const endMove = this.beginWindowMove(w);
    this.robot.click();
    const move = this.moveTo(nx + grab.x, ny + grab.y, 600);
    const follow = () => { w.el.style.left = `${this.cursor.x - grab.x}px`; w.el.style.top = `${this.cursor.y - grab.y}px`; };
    gsap.ticker.add(follow);
    try { await move; } finally { gsap.ticker.remove(follow); w.el.classList.remove("dragging"); endMove(); }
    this.check(e);
  }

  focus(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = String(++this.z);
    w.lastUsed = Date.now();
    for (const o of this.wins.values()) o.el.classList.toggle("focused", o === w);
    this.syncOcclusion();
  }

  private syncOcclusion() {
    for (const w of this.wins.values()) {
      const f = this.frameOf(w), z = Number(w.el.style.zIndex);
      let hidden = false;
      for (const other of this.wins.values()) {
        if (other === w || Number(other.el.style.zIndex) <= z) continue;
        // An opening window is still translucent and scaled. Its final rectangle
        // must not hide the real app underneath before the opening finishes.
        if (other.el.classList.contains("render-opening") || this.movingWindows.has(other)) continue;
        const o = this.frameOf(other);
        if (o.x <= f.x && o.y <= f.y && o.x + o.w >= f.x + f.w && o.y + o.h >= f.y + f.h) { hidden = true; break; }
      }
      const state = hidden ? "1" : "0";
      if (w.el.dataset.renderHidden !== state) {
        w.el.dataset.renderHidden = state;
        w.el.classList.toggle("render-hidden", hidden);
      }
    }
    wakeRender();
  }

  touch(id: AppId) {
    const w = this.wins.get(id);
    if (w) w.lastUsed = Date.now();
  }

  // Keep the desk tidy: at most three windows, the least recently used one closes.
  // Tidy robots keep two windows, most keep three, messy ones let five or six pile up.
  private trim(keep: AppId) {
    const max = this.prefs?.tidiness === "tidy" ? 2 : this.prefs?.tidiness === "messy" ? 5 + (Math.random() < 0.5 ? 1 : 0) : 3;
    const open = [...this.wins.values()].filter((w) => w.id !== keep).sort((a, b) => a.lastUsed - b.lastUsed);
    while (open.length >= max) this.close(open.shift()!.id);
  }

  /** The robot's usual way, or now and then another one (odds per alternative). */
  private habit<T extends string>(usual: T, others: Record<string, number>): T {
    for (const [alt, p] of Object.entries(others)) if (alt !== usual && Math.random() < p) return alt as T;
    return usual;
  }

  // Alt+Tab: a strip of window previews, cycling to the one it wants.
  private async altTab(id: AppId) {
    const e = this.epoch;
    const order = [...this.wins.values()].sort((a, b) => b.lastUsed - a.lastUsed);
    const strip = document.createElement("div");
    strip.className = "alttab";
    strip.innerHTML = order.map((w) => `<div class="at-item" data-id="${w.id}">${this.iconOf(w.id)}<span></span></div>`).join("");
    order.forEach((w, i) => { (strip.children[i].querySelector("span") as HTMLElement).textContent = w.title.textContent || this.titleOf(w.id); });
    this.root.appendChild(strip);
    gsap.fromTo(strip, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.15 });
    const target = Math.max(1, order.findIndex((w) => w.id === id));
    try {
      for (let i = 1; i <= target; i++) {
        this.robot.pressKey("Tab");
        strip.querySelectorAll(".at-item").forEach((x, k) => x.classList.toggle("on", k === i % order.length));
        await this.sleep(220, e);
      }
      await this.sleep(200, e);
    } finally {
      gsap.to(strip, { opacity: 0, duration: 0.12, onComplete: () => strip.remove() });
    }
  }

  close(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    this.wins.delete(id);
    this.syncOcclusion();
    const dockItem = (this.dock.querySelector(`[data-app="${id}"]`) as HTMLElement | null) ?? this.dock;
    dockItem.classList.remove("running");
    const d = this.pos(dockItem), c = this.pos(w.el);
    gsap.to(w.el, { opacity: 0, scale: 0.3, x: d.x - c.x, y: d.y - c.y, duration: 0.4, ease: "power3.in", onComplete: () => { w.el.remove(); this.leaveDock(id); } });
  }

  closeAll() {
    for (const id of [...this.wins.keys()]) this.close(id);
  }

  /** A notification slides in at the top right. `stay` keeps it up that many seconds (so the robot can click it). */
  toast(text: string, icon: AppId = "t3code", stay = 2.6) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `${this.iconOf(icon)}<span></span>`;
    t.querySelector("span")!.textContent = text;
    this.root.querySelector(".toast-layer")!.appendChild(t);
    gsap.timeline({ onComplete: () => t.remove() })
      .fromTo(t, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "back.out(1.6)" })
      .to(t, { x: 30, opacity: 0, duration: 0.35, ease: "power2.in" }, `+=${stay}`);
    return t;
  }

  /** A clicked notification goes away at once. */
  dismissToast(t: HTMLElement) {
    gsap.killTweensOf(t);
    gsap.to(t, { opacity: 0, scale: 0.94, duration: 0.18, onComplete: () => t.remove() });
  }

  /** The window is open and on top of all others. */
  isFront(id: AppId) {
    const w = this.wins.get(id);
    return !!w && Number(w.el.style.zIndex) === this.z;
  }

  reset() {
    this.epoch++;
    gsap.killTweensOf(this.cursor);
    for (const w of this.wins.values()) w.el.remove();
    this.wins.clear();
    this.opening.clear();
    this.renderDock(false);
    this.root.querySelector(".toast-layer")!.innerHTML = "";
  }

  destroy() { clearInterval(this.clockTimer); this.reset(); }
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
// window moves are optional: a reset (Cancelled) still has to stop the scene
function rethrow(err: unknown) { if (err instanceof Cancelled) throw err; }
