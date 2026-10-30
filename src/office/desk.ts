import gsap from "gsap";
import { WM } from "../os/wm";
import { Director, type ThreadInfo } from "../director";
import { GEOM, UNIT, type DeskRig, type Pt, type SeatedRobot } from "./rig";
import { StubRobot } from "./stub-robot";
import { logoFor } from "./brand";
import { WALLPAPERS, type RobotProfile } from "./roster";

// One workstation, seen fake top-down: the desk surface from above, the monitor and the
// robot as upright figures. The robot sits south of the desk with its back to us, the
// monitor's real screen (the robot's own desktop) faces us. Desks are the repeatable unit
// of an office: one desk per thread.

export const UNIT_W = UNIT.w;
export const UNIT_H = UNIT.h;
export const SCREEN_W = 820;
export const SCREEN_H = 461;

export interface DeskStage {
  say(text: string | null, kind?: "think" | "speak"): void;
  setPlan(steps: { text: string; status: string }[]): void;
  setGlow(color: string): void;
  sleepy(on: boolean): void;
  readonly phoneScreen?: HTMLElement;
}

export interface DeskServices {
  peek(url: string): Promise<any>;
  image(path: string): Promise<string | null>;
  readText(path: string): Promise<string | null>;
}

export type RobotFactory = (host: HTMLElement, rig: DeskRig) => SeatedRobot;
let robotFactory: RobotFactory = (host, rig) => new StubRobot(host, rig);
export function useRobot(f: RobotFactory) { robotFactory = f; }

// Keyboard layout: rows top to bottom, columns left to right, like a real keyboard seen from above.
const ROWS = ["1234567890-=", "qwertyuiop[]", "asdfghjkl;'\n", "zxcvbnm,./\u0001\u0002"];
const KEY_ALIASES: Record<string, string> = { Enter: "\n", ArrowLeft: "\u0001", ArrowDown: "\u0001", ArrowRight: "\u0002", ArrowUp: "\u0002", Backspace: "=", Tab: "q", Space: " " };

export class Desk implements DeskStage {
  el: HTMLElement;
  monitor: HTMLElement;
  screen: HTMLElement;
  robot: SeatedRobot;
  wm: WM;
  director: Director;
  threadId: string | null = null;
  info: ThreadInfo | null = null;
  onActivity: (t: string) => void = () => {};
  activity = "";
  private keys = new Map<string, SVGRectElement>();
  private keyCenters = new Map<string, Pt & { hand: "left" | "right" }>();
  private zTimer = 0;

  constructor(parent: HTMLElement, x: number, y: number, services: DeskServices) {
    const el = document.createElement("div");
    el.className = "desk-unit empty";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `
      ${this.tableSvg()}
      <div class="desk-glow"></div>
      <div class="monitor"><div class="screen"></div><div class="screen-glare"></div></div>
      <ol class="desk-notes" aria-label="Plan"></ol>
      <div class="robot-host"></div>
      <div class="desk-plate"><img alt=""><span></span></div>
      <div class="phone-held"><div class="phone-screen"></div></div>
      <div class="bubble" role="status"></div>`;
    parent.appendChild(el);
    this.el = el;
    this.monitor = el.querySelector(".monitor")!;
    this.screen = el.querySelector(".screen")!;
    gsap.set(el.querySelector(".phone-held"), { scale: 0.3, transformOrigin: "0 0" });
    this.indexKeys();
    this.robot = robotFactory(el.querySelector(".robot-host") as HTMLElement, this.rig());
    this.wm = new WM(this.screen, this.robot);
    this.director = new Director(this.wm, this.robot, this, services.peek, services.image, services.readText);
    this.director.onActivity = (t) => { this.activity = t; this.onActivity(t); };
    this.baseZ = Math.round(y);
    el.style.zIndex = String(this.baseZ);
  }

  // Desks are stacked by their row, so a desk further down covers the one above it.
  // While something rises above the desk (a bubble, z letters, a held phone) the desk
  // comes to the front so nothing gets hidden behind a neighbor.
  baseZ = 0;
  private lifts = new Set<string>();
  lift(reason: string, on: boolean) {
    if (on) this.lifts.add(reason); else this.lifts.delete(reason);
    this.el.style.zIndex = String(this.lifts.size ? 100000 + this.baseZ : this.baseZ);
  }

  get phoneScreen() { return this.el.querySelector(".phone-screen") as HTMLElement; }

  profile: RobotProfile | null = null;
  folder: string | null = null;
  room = "";
  private model: string | null = null;

  assign(thread: { id: string; title: string; provider: string; model?: string | null } | null, profile: RobotProfile | null = null) {
    if (this.threadId === (thread?.id ?? null)) return;
    this.director.reset();
    this.threadId = thread?.id ?? null;
    this.profile = profile;
    this.model = thread?.model ?? null;
    this.el.classList.toggle("empty", !thread);
    if (thread) {
      this.robot.setBrand(thread.provider);
      this.robot.setModel?.(this.model);
      if (profile) {
        this.robot.setLook?.(profile.look);
        this.wm.prefs = profile.prefs;
        this.wm.robotName = profile.name;
        this.wm.setWallpaper(WALLPAPERS[profile.prefs.wallpaper % WALLPAPERS.length]);
        const mug = this.el.querySelector("[data-d=mug] rect") as SVGRectElement | null;
        mug?.setAttribute("fill", profile.prefs.mug);
      }
      const logo = logoFor(thread.provider);
      if (logo) this.wm.setWallpaperLogo(logo);
    }
    this.label(thread?.title ?? "Free desk", thread?.provider ?? null);
  }

  private label(title: string, provider: string | null) {
    const plate = this.el.querySelector(".desk-plate") as HTMLElement;
    const img = plate.querySelector("img") as HTMLImageElement;
    const logo = logoFor(provider);
    img.hidden = !logo;
    if (logo) img.src = logo;
    const who = this.profile ? this.profile.name : "";
    plate.querySelector("span")!.innerHTML = who ? `<b></b> <i></i>` : `<i></i>`;
    if (who) plate.querySelector("b")!.textContent = who;
    plate.querySelector("i")!.textContent = title;
    plate.title = [who, title, this.model].filter(Boolean).join("\n");
  }

  setInfo(info: ThreadInfo) {
    this.info = info;
    if (info.title) this.label(info.title, info.provider);
    if (this.robot.brandName !== info.provider) this.robot.setBrand(info.provider);
    const model = (info as any).model as string | null | undefined;
    if (model && model !== this.model) { this.model = model; this.robot.setModel?.(model); }
    const logo = logoFor(info.provider);
    if (logo) this.wm.setWallpaperLogo(logo);
    this.director.setInfo(info);
  }

  // --- DeskStage -------------------------------------------------------------
  say(text: string | null, kind: "think" | "speak" = "think") {
    const b = this.el.querySelector(".bubble") as HTMLElement;
    if (!text) {
      if (b.classList.contains("show")) gsap.to(b, { opacity: 0, y: 8, scale: 0.96, duration: 0.25, ease: "power2.in", onComplete: () => { b.classList.remove("show"); this.lift("bubble", false); } });
      return;
    }
    this.lift("bubble", true);
    const was = b.classList.contains("show");
    b.className = `bubble show ${kind}`;
    b.innerHTML = `<p></p><span class="tail a"></span><span class="tail b"></span>`;
    b.querySelector("p")!.textContent = text;
    if (!was) gsap.fromTo(b, { opacity: 0, y: 12, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" });
  }

  // Plan steps as sticky notes stuck to the side of the monitor.
  setPlan(steps: { text: string; status: string }[]) {
    const list = this.el.querySelector(".desk-notes") as HTMLElement;
    const existing = Array.from(list.children) as HTMLElement[];
    steps.slice(0, 4).forEach((st, i) => {
      let li = existing[i];
      if (!li) {
        li = document.createElement("li");
        li.innerHTML = `<span class="check" aria-hidden="true"></span><span class="t"></span>`;
        list.appendChild(li);
        gsap.fromTo(li, { opacity: 0, y: -12, rotation: -8 }, { opacity: 1, y: 0, rotation: i % 2 ? 3 : -3, duration: 0.6, ease: "back.out(2)", delay: i * 0.08 });
      }
      li.querySelector(".t")!.textContent = st.text;
      li.title = st.text;
      const done = st.status === "completed";
      if (done && !li.classList.contains("done")) {
        li.classList.add("done");
        gsap.fromTo(li.querySelector(".check"), { scale: 0 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
      }
      li.classList.toggle("active", st.status === "running" || st.status === "in_progress");
    });
    existing.slice(steps.length).forEach((li) => gsap.to(li, { opacity: 0, y: 12, duration: 0.3, onComplete: () => li.remove() }));
  }

  setGlow(color: string) {
    gsap.to(this.el.querySelector(".desk-glow"), { "--glow": color, duration: 1.2, ease: "sine.inOut" } as any);
  }

  sleepy(on: boolean) {
    window.clearInterval(this.zTimer);
    this.zTimer = 0;
    this.lift("zz", on);
    if (!on) {
      this.el.querySelectorAll(".zz").forEach((z) => gsap.to(z, { opacity: 0, duration: 0.3, onComplete: () => z.remove() }));
      return;
    }
    const spawn = () => {
      const z = document.createElement("span");
      z.className = "zz";
      z.textContent = "z";
      z.setAttribute("aria-hidden", "true");
      this.el.appendChild(z);
      gsap.set(z, { x: GEOM.head.x + 18, y: GEOM.head.y - 46, scale: 0.6, opacity: 0, rotation: -10 });
      gsap.timeline({ onComplete: () => z.remove() })
        .to(z, { opacity: 0.9, duration: 0.6, ease: "sine.out" })
        .to(z, { x: GEOM.head.x + 60 + Math.random() * 24, y: GEOM.head.y - 130, scale: 1.4, rotation: 12, duration: 3.2, ease: "sine.inOut" }, 0)
        .to(z, { opacity: 0, duration: 1, ease: "sine.in" }, 2.2);
    };
    spawn();
    this.zTimer = window.setInterval(spawn, 1700);
  }

  // --- the robot's reach ---------------------------------------------------------
  private indexKeys() {
    for (const k of this.el.querySelectorAll<SVGRectElement>("[data-key]")) this.keys.set(k.dataset.key!, k);
  }

  private norm(key: string) {
    if (KEY_ALIASES[key]) return KEY_ALIASES[key];
    return key.length === 1 ? key.toLowerCase() : key;
  }

  private rig(): DeskRig {
    const me = this;
    const mouseG = this.el.querySelector("[data-d=mouse]") as SVGGElement;
    const mugG = this.el.querySelector("[data-d=mug]") as SVGGElement;
    const phoneG = this.el.querySelector("[data-d=phone]") as SVGGElement;
    const held = this.el.querySelector(".phone-held") as HTMLElement;
    const { mouse, mug, phoneRest } = GEOM;
    return {
      keyPos(key: string) {
        const k = me.norm(key);
        return me.keyCenters.get(k) ?? me.keyCenters.get(" ") ?? null;
      },
      pressKey(key: string) {
        const el = me.keys.get(me.norm(key));
        if (!el) return;
        el.classList.add("down");
        setTimeout(() => el.classList.remove("down"), 110);
      },
      homeLeft: { ...me.keyCenters.get("f")! },
      homeRight: { ...me.keyCenters.get("j")! },
      mouse: { ...mouse },
      moveMouse(p: Pt) { mouseG.setAttribute("transform", `translate(${(p.x - mouse.x).toFixed(1)} ${(p.y - mouse.y).toFixed(1)})`); },
      mug: { ...mug },
      moveMug(p: Pt | null, tilt = 0) {
        mugG.setAttribute("transform", p ? `translate(${(p.x - mug.x).toFixed(1)} ${(p.y - mug.y).toFixed(1)}) rotate(${tilt} ${mug.x} ${mug.y})` : "");
      },
      phoneRest: { ...phoneRest },
      showPhone(at: Pt | null, tilt = 0) {
        phoneG.style.opacity = at ? "0" : "1";
        held.classList.toggle("on", !!at);
        me.lift("phone", !!at);
        if (at) gsap.set(held, { x: at.x, y: at.y, rotation: tilt });
      },
    };
  }

  private tableSvg() {
    const t = GEOM.table, kb = GEOM.keyboard, m = GEOM.mouse, mug = GEOM.mug, ph = GEOM.phoneRest, st = GEOM.stand;
    const rowH = (kb.h - 8) / 4, colW = kb.w / 12;
    const keys: string[] = [];
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const x = kb.x + c * colW + 1.2, y = kb.y + 2 + r * rowH + 0.8;
        this.keyCenters.set(ch, { x: x + colW / 2 - 1.2, y: y + rowH / 2 - 0.8, hand: c < 6 ? "left" : "right" });
        keys.push(`<rect class="key" data-key="${ch === "\n" ? "\n" : ch.replace(/"/g, "&quot;")}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(colW - 2.4).toFixed(1)}" height="${(rowH - 1.6).toFixed(1)}" rx="1.6"/>`);
      });
    });
    const sy = kb.y + 2 + 4 * rowH + 0.6;
    this.keyCenters.set(" ", { x: kb.x + kb.w / 2, y: sy + 2.5, hand: "right" });
    keys.push(`<rect class="key" data-key=" " x="${kb.x + colW * 3}" y="${sy}" width="${colW * 6}" height="5" rx="2"/>`);
    return /* svg */ `
    <svg class="desk-table" viewBox="0 0 ${UNIT.w} ${UNIT.h}" aria-hidden="true">
      <ellipse cx="${t.x + t.w / 2}" cy="${t.y + t.h + t.front + 8}" rx="${t.w / 2 + 6}" ry="12" fill="#2b1d10" opacity="0.18"/>
      <rect x="${t.x}" y="${t.y + t.h - 4}" width="${t.w}" height="${t.front + 4}" rx="6" fill="#b48a5e"/>
      <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="8" fill="#d7b48a"/>
      <rect x="${t.x + 6}" y="${t.y + 4}" width="${t.w - 12}" height="3" rx="1.5" fill="#fff" opacity="0.25"/>
      <ellipse cx="${st.x}" cy="${st.base}" rx="30" ry="9" fill="#4a5063"/>
      <ellipse cx="${st.x}" cy="${st.base - 2}" rx="24" ry="6" fill="#5a6177"/>
      <rect x="${st.x - 7}" y="${st.top}" width="14" height="${st.base - st.top - 2}" fill="#3a3f4f"/>
      <g class="papers"><rect x="96" y="194" width="38" height="30" rx="3" fill="#f4f1ea" transform="rotate(-7 115 209)"/><rect x="100" y="197" width="38" height="30" rx="3" fill="#fbf9f4" transform="rotate(5 119 212)"/></g>
      <rect x="${kb.x - 5}" y="${kb.y - 3}" width="${kb.w + 10}" height="${kb.h + 7}" rx="7" fill="#2e3242"/>
      <g class="keys">${keys.join("")}</g>
      <rect x="${m.x - 24}" y="${m.y - 22}" width="48" height="44" rx="10" fill="#4a5063" opacity="0.55"/>
      <g data-d="mouse"><ellipse cx="${m.x}" cy="${m.y}" rx="9" ry="12" fill="#2e3242"/><ellipse cx="${m.x}" cy="${m.y - 3}" rx="6" ry="7" fill="#4a5063"/><rect x="${m.x - 0.75}" y="${m.y - 11}" width="1.5" height="6" fill="#2e3242"/></g>
      <g data-d="phone"><rect x="${ph.x - 11}" y="${ph.y - 19}" width="22" height="38" rx="5" fill="#22263a"/><rect x="${ph.x - 9}" y="${ph.y - 16}" width="18" height="32" rx="3" fill="#353b58"/></g>
      <g data-d="mug" class="mug">
        <ellipse cx="${mug.x + 3}" cy="${mug.y + 6}" rx="13" ry="5" fill="#2b1d10" opacity="0.2"/>
        <path d="M${mug.x + 9} ${mug.y - 4} q8 0 8 6 q0 6 -8 6" stroke="#e8673c" stroke-width="3.5" fill="none"/>
        <rect x="${mug.x - 10}" y="${mug.y - 12}" width="20" height="20" rx="5" fill="#ff8a65"/>
        <ellipse cx="${mug.x}" cy="${mug.y - 11}" rx="9" ry="4" fill="#5a2b1e"/>
        <ellipse cx="${mug.x - 2}" cy="${mug.y - 12}" rx="3" ry="1.2" fill="#8a4a32"/>
      </g>
    </svg>`;
  }

  destroy() {
    this.director.reset();
    this.robot.destroy();
    window.clearInterval(this.zTimer);
    this.el.remove();
  }
}
