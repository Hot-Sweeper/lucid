import gsap from "gsap";
import type { SeatedRobot as Robot } from "../office/rig";
const SCREEN = { w: 820, h: 461 };
import { ICONS } from "./icons";

export class Cancelled extends Error {}

export type AppId = "files" | "editor" | "terminal" | "browser" | "chat" | "tool" | "game" | "harness" | "beats" | "social" | "notes" | "tasks" | "calc" | "music";

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
};
const TITLES: Record<AppId, string> = { files: "Files", editor: "Code", terminal: "Terminal", browser: "Browser", chat: "Messages", tool: "Tools", game: "Games", harness: "Agents", beats: "BeatLab", social: "Botcord", notes: "Notes", tasks: "Tasks", calc: "Calculator", music: "Botify" };
const DOCK: AppId[] = ["files", "editor", "terminal", "browser", "music", "chat", "notes", "tasks", "calc", "harness", "tool", "beats", "social", "game"];

export type Win = { id: AppId; el: HTMLElement; body: HTMLElement; title: HTMLElement; lastUsed: number };

export class WM {
  root: HTMLElement;
  layer: HTMLElement;
  dock: HTMLElement;
  cursorEl: HTMLElement;
  wins = new Map<AppId, Win>();
  onCursor?: (x: number, y: number) => void;
  prefs: import("../office/roster").Prefs | null = null;
  robotName = "unit";
  speed = 1;
  epoch = 0;
  // An app can ask for a different window size before it opens (the Tasks checklist is narrower).
  frameHint: Partial<Record<AppId, Frame>> = {};
  private z = 10;
  private cursor = { x: SCREEN.w * 0.55, y: SCREEN.h * 0.5 };
  robot: Robot;

  constructor(screen: HTMLElement, robot: Robot) {
    this.robot = robot;
    screen.innerHTML = `
      <div class="os">
        <div class="wallpaper"><img class="wall-logo" alt=""></div>
        <div class="win-layer"></div>
        <nav class="dock" aria-label="Apps">${DOCK.map((id) => `<div class="dock-item" data-app="${id}" title="${TITLES[id]}">${ICONS[id]}<i></i></div>`).join("")}</nav>
        <div class="toast-layer"></div>
        <div class="cursor" aria-hidden="true"><svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg></div>
      </div>`;
    this.root = screen.querySelector(".os")!;
    this.layer = screen.querySelector(".win-layer")!;
    this.dock = screen.querySelector(".dock")!;
    this.cursorEl = screen.querySelector(".cursor")!;
    gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y });
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
    this.robot.setPose("mouse");
    await new Promise<void>((resolve) => {
      gsap.to(p, {
        t: 1, duration: dur, ease: "power2.inOut",
        onUpdate: () => {
          const t = p.t, u = 1 - t;
          this.cursor.x = u * u * from.x + 2 * u * t * mx + t * t * x;
          this.cursor.y = u * u * from.y + 2 * u * t * my + t * t * y;
          gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y });
          // the physical mouse on the desk moves with the cursor, every frame
          this.robot.mouseTo(this.cursor.x / SCREEN.w, this.cursor.y / SCREEN.h);
          this.onCursor?.(this.cursor.x, this.cursor.y);
        },
        onComplete: () => resolve(),
      });
      this.robot.lookAt(x / SCREEN.w, y / SCREEN.h);
    });
    this.check(e);
  }

  // Element position in screen coordinates from layout, so it stays right even when
  // the monitor is angled in 3D or the camera zooms.
  pos(el: Element, ax = 0.5, ay = 0.5) {
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

  async open(id: AppId, title?: string): Promise<Win> {
    const e = this.epoch;
    let w = this.wins.get(id);
    if (w) {
      if (title) w.title.textContent = title;
      if (Number(w.el.style.zIndex) !== this.z) {
        await this.pointAt(w.el.querySelector(".win-bar")!, 0.6, 0.5, 380);
        await this.click();
        this.focus(id);
        if (this.covered(id) > 0.45 && Math.random() < 0.55) await this.dragTo(id, this.bestSpot(this.frameOf(w), id));
      }
      return w;
    }
    const dockItem = this.dock.querySelector(`[data-app="${id}"]`)!;
    if (Math.random() < 0.22) await this.launch(TITLES[id]);
    else {
      await this.pointAt(dockItem, 0.5, 0.5);
      await this.click();
    }
    this.check(e);
    this.trim(id);
    const base0 = this.frameHint[id] ?? FRAMES[id];
    // a little variety in size, then the spot that overlaps the open windows least
    const k = 0.92 + Math.random() * 0.12;
    const base = { ...base0, w: Math.min(SCREEN.w - 8, Math.round(base0.w * k)), h: Math.min(SCREEN.h - 58, Math.round(base0.h * (0.96 + Math.random() * 0.06))) };
    const f = this.wins.size ? this.bestSpot(base) : { ...base, ...this.jitter(base) };
    const el = document.createElement("section");
    el.className = `win app-${id}`;
    el.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`;
    el.innerHTML = `<header class="win-bar">${ICONS[id]}<span class="win-title"></span><span class="win-x" aria-hidden="true"></span></header><div class="win-body"></div>`;
    const titleEl = el.querySelector(".win-title") as HTMLElement;
    titleEl.textContent = title || TITLES[id];
    this.layer.appendChild(el);
    w = { id, el, body: el.querySelector(".win-body")!, title: titleEl, lastUsed: Date.now() };
    this.wins.set(id, w);
    this.focus(id);
    dockItem.classList.add("running");
    const d = this.pos(dockItem);
    gsap.fromTo(el,
      { opacity: 0, scale: 0.35, x: d.x - (f.x + f.w / 2), y: d.y - (f.y + f.h / 2) },
      { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.55 / this.speed, ease: "expo.out", transformOrigin: "50% 50%" });
    gsap.fromTo(el.querySelector(".win-body"), { opacity: 0 }, { opacity: 1, duration: 0.4 / this.speed, delay: 0.15 / this.speed });
    await this.sleep(260, e);
    // each robot has its own habit: some go full screen, some tile side by side, some let windows float
    const style = this.prefs?.windows ?? "floating";
    const small = id === "calc" || id === "chat" || id === "notes" || id === "tool";
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

  // --- placement -----------------------------------------------------------
  private frameOf(w: Win): Frame { return { x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight }; }
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
  async dragTo(id: AppId, to: Frame) {
    const w = this.wins.get(id);
    if (!w) return;
    const e = this.epoch;
    const bar = w.el.querySelector(".win-bar")!;
    await this.pointAt(bar, 0.35, 0.5, 340);
    const r = this.frameOf(w);
    const grab = { x: this.cursor.x - r.x, y: this.cursor.y - r.y };
    w.el.classList.add("dragging");
    this.robot.click();
    const move = this.moveTo(to.x + grab.x, to.y + grab.y, 520);
    const follow = () => { w.el.style.left = `${this.cursor.x - grab.x}px`; w.el.style.top = `${this.cursor.y - grab.y}px`; };
    gsap.ticker.add(follow);
    try { await move; } finally { gsap.ticker.remove(follow); w.el.classList.remove("dragging"); }
    this.check(e);
    if (to.w !== r.w || to.h !== r.h) gsap.to(w.el, { left: to.x, top: to.y, width: to.w, height: to.h, duration: 0.3 / this.speed, ease: "power2.out" });
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
    gsap.to(w.el, { left: half.x, top: half.y, width: half.w, height: half.h, duration: 0.32 / this.speed, ease: "power3.out" });
    // the window on the other side fills the rest, if there is one
    const other = [...this.wins.values()].filter((o) => o.id !== id).sort((a, b) => b.lastUsed - a.lastUsed)[0];
    if (other && Math.random() < 0.7) {
      const rest = { x: side === "left" ? Math.round(SCREEN.w / 2) + 2 : 4, y: 4, w: half.w, h: half.h };
      gsap.to(other.el, { left: rest.x, top: rest.y, width: rest.w, height: rest.h, duration: 0.36 / this.speed, ease: "power3.out", delay: 0.12 / this.speed });
    }
    await this.sleep(380);
  }
  // double-click the title bar: full screen
  async maximize(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    await this.pointAt(w.el.querySelector(".win-bar")!, 0.5, 0.5, 340);
    await this.click(true);
    gsap.to(w.el, { left: 4, top: 4, width: SCREEN.w - 8, height: SCREEN.h - 58, duration: 0.32 / this.speed, ease: "power3.out" });
    await this.sleep(360);
  }

  // Open an app by typing its name into the launcher, like a keyboard person would.
  private async launch(name: string) {
    const e = this.epoch;
    const bar = document.createElement("div");
    bar.className = "launcher";
    bar.innerHTML = `<span class="l-q"></span><span class="caret"></span>`;
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
    const r = { x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight };
    const nx = Math.max(4, Math.min(SCREEN.w - r.w - 4, r.x + (Math.random() - 0.5) * 220));
    const ny = Math.max(4, Math.min(SCREEN.h - 50 - r.h, r.y + (Math.random() - 0.5) * 70));
    const grab = { x: this.cursor.x - r.x, y: this.cursor.y - r.y };
    w.el.classList.add("dragging");
    this.robot.click();
    const move = this.moveTo(nx + grab.x, ny + grab.y, 600);
    const follow = () => { w.el.style.left = `${this.cursor.x - grab.x}px`; w.el.style.top = `${this.cursor.y - grab.y}px`; };
    gsap.ticker.add(follow);
    try { await move; } finally { gsap.ticker.remove(follow); w.el.classList.remove("dragging"); }
    this.check(e);
  }

  focus(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = String(++this.z);
    w.lastUsed = Date.now();
    for (const o of this.wins.values()) o.el.classList.toggle("focused", o === w);
  }

  touch(id: AppId) {
    const w = this.wins.get(id);
    if (w) w.lastUsed = Date.now();
  }

  // Keep the desk tidy: at most three windows, the least recently used one closes.
  private trim(keep: AppId) {
    const open = [...this.wins.values()].filter((w) => w.id !== keep).sort((a, b) => a.lastUsed - b.lastUsed);
    while (open.length >= 3) this.close(open.shift()!.id);
  }

  close(id: AppId) {
    const w = this.wins.get(id);
    if (!w) return;
    this.wins.delete(id);
    const dockItem = this.dock.querySelector(`[data-app="${id}"]`)!;
    dockItem.classList.remove("running");
    const f = w.el.getBoundingClientRect();
    void f;
    const d = this.pos(dockItem), c = this.pos(w.el);
    gsap.to(w.el, { opacity: 0, scale: 0.3, x: d.x - c.x, y: d.y - c.y, duration: 0.4, ease: "power3.in", onComplete: () => w.el.remove() });
  }

  closeAll() {
    for (const id of [...this.wins.keys()]) this.close(id);
  }

  async toast(text: string, icon: AppId = "chat") {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `${ICONS[icon]}<span></span>`;
    t.querySelector("span")!.textContent = text;
    this.root.querySelector(".toast-layer")!.appendChild(t);
    gsap.timeline({ onComplete: () => t.remove() })
      .fromTo(t, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "back.out(1.6)" })
      .to(t, { x: 30, opacity: 0, duration: 0.35, ease: "power2.in" }, "+=2.6");
  }

  reset() {
    this.epoch++;
    gsap.killTweensOf(this.cursor);
    for (const w of this.wins.values()) w.el.remove();
    this.wins.clear();
    for (const d of this.dock.querySelectorAll(".dock-item")) d.classList.remove("running");
    this.root.querySelector(".toast-layer")!.innerHTML = "";
  }
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
// window moves are optional: a reset (Cancelled) still has to stop the scene
function rethrow(err: unknown) { if (err instanceof Cancelled) throw err; }
