import gsap from "gsap";
import type { SeatedRobot as Robot } from "../office/rig";
const SCREEN = { w: 820, h: 461 };
import { ICONS } from "./icons";

export class Cancelled extends Error {}

export type AppId = "files" | "editor" | "terminal" | "browser" | "chat" | "tool" | "game" | "harness" | "beats" | "social" | "notes";

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
};
const TITLES: Record<AppId, string> = { files: "Files", editor: "Code", terminal: "Terminal", browser: "Browser", chat: "Messages", tool: "Tools", game: "Games", harness: "Agents", beats: "BeatLab", social: "Botcord", notes: "Notes" };
const DOCK: AppId[] = ["files", "editor", "terminal", "browser", "chat", "notes", "harness", "tool", "beats", "social", "game"];

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
    const base = FRAMES[id];
    // windows never land in exactly the same spot twice
    const jx = Math.round((Math.random() - 0.5) * 50), jy = Math.round((Math.random() - 0.5) * 24);
    const f = { ...base, x: Math.max(4, Math.min(SCREEN.w - base.w - 4, base.x + jx)), y: Math.max(4, Math.min(SCREEN.h - 50 - base.h, base.y + jy)) };
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
    return w;
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
    const w = this.wins.get(id);
    if (!w || Math.random() > chance) return;
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
