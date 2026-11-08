import { DeskPlanWidget } from "./desk-plan";
import { managerLook } from "../world/look";
import gsap from "gsap";
import { gameSound } from './sound';
import { WM } from "../os/wm";
import { Director, type ThreadInfo } from "../director";
import { GEOM, PHONE_SCALE, UNIT, type DeskRig, type Pt, type SeatedRobot } from "./rig";
import { StubRobot } from "./stub-robot";
import { emptyChairSvg } from "../world/seated";
import { playHandoff } from "../world/handoff";
import { logoFor, brandFor } from "./brand";
import { WALLPAPERS, HOBBY_LABEL, type RobotProfile } from "./roster";
import { releaseRenderView } from "../perf/render";
import { DeferredRobot } from "../perf/deferred-robot";
import type { KeyRect } from "../perf/keyboard-path";
import { sharedVector, vectorOwner, releaseVectors } from "../perf/shared-vector";
import { cacheStaticArt } from "../perf/static-art";

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
  bubble: HTMLElement;
  robot: SeatedRobot;
  /** Opens the worker's focus view (set by the world). */
  onRobotFocus: ((anchor: Element) => void) | null = null;
  private deferredRobot: DeferredRobot;
  wm: WM;
  private planWidget: DeskPlanWidget;
  director: Director;
  threadId: string | null = null;
  info: ThreadInfo | null = null;
  onActivity: (t: string) => void = () => {};
  activity = "";
  lastKeyAt = 0;
  private keys = new Map<string, KeyRect>();
  private pressedKeys = new Map<string, { el: SVGRectElement; animation: Animation; timer: number }>();
  private vectorOwner = vectorOwner("desk");
  private disposeStaticArt: () => void = () => {};
  private keyCenters = new Map<string, Pt & { hand: "left" | "right" }>();
  private zTimer = 0;

  constructor(parent: HTMLElement, x: number, y: number, services: DeskServices) {
    const el = document.createElement("div");
    el.className = "desk-unit empty";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const mgrClip = `mgr-clip-${Math.random().toString(36).slice(2, 9)}`;
    el.innerHTML = `
      ${this.tableSvg()}
      <div class="desk-glow"></div>
      <svg class="mgr-dress" hidden aria-hidden="true" viewBox="0 0 400 380">
        <rect x="34" y="250" width="332" height="22" rx="6" fill="#4a2f22"/><rect x="34" y="250" width="332" height="3" rx="1.5" fill="#e0b25a"/>
        <rect x="34" y="180" width="332" height="2.5" rx="1.25" fill="#e0b25a" opacity=".85"/>
        <circle cx="200" cy="262" r="15" fill="#1d1f2b" stroke="#e0b25a" stroke-width="2.5"/><clipPath id="${mgrClip}"><circle cx="200" cy="262" r="11.5"/></clipPath><image x="188.5" y="250.5" width="23" height="23" clip-path="url(#${mgrClip})" preserveAspectRatio="xMidYMid meet"/>
        <rect x="372" y="98" width="3" height="92" rx="1.5" fill="#c9a24e"/><ellipse cx="373.5" cy="190" rx="9" ry="3.5" fill="#3a3f4f"/>
        <path d="M375 100 L398 112 L375 124 Z" fill="var(--mgr-accent)"/>
      </svg>
      <div class="monitor"><div class="screen"></div><div class="screen-glare"></div></div>
      <ol class="desk-notes" aria-label="Plan"></ol>
      <div class="robot-host"></div>
      <button type="button" class="poke poke-head" aria-label="Open robot chat" style="left:${GEOM.head.x - 34}px;top:${GEOM.head.y - 46}px"></button>
      <button type="button" class="poke poke-mug" aria-label="Hand it its coffee" style="left:${GEOM.mug.x - 16}px;top:${GEOM.mug.y - 20}px"></button>
      <button type="button" class="poke poke-phone" aria-label="Buzz its phone" style="left:${GEOM.phoneRest.x - 16}px;top:${GEOM.phoneRest.y - 24}px"></button>
      <div class="desk-plate"><img alt=""><span></span></div>
      <div class="desk-proj" hidden><img alt=""><span class="dp-mono"></span><b></b></div>
      <div class="phone-held"><div class="phone-screen"></div></div>
      <div class="bubble" role="status"></div>`;
    parent.appendChild(el);
    this.el = el;
    this.monitor = el.querySelector(".monitor")!;
    this.screen = el.querySelector(".screen")!;
    this.bubble = el.querySelector(".bubble")!;
    gsap.set(el.querySelector(".phone-held"), { scale: PHONE_SCALE, transformOrigin: "0 0" });
    const robotHost = el.querySelector(".robot-host") as HTMLElement;
    this.deferredRobot = new DeferredRobot(robotHost, () => robotFactory(robotHost, this.rig()));
    this.robot = this.deferredRobot;
    this.disposeStaticArt = cacheStaticArt(el.querySelector<SVGSVGElement>(".desk-table")!);
    this.wireToys();
    this.wm = new WM(this.screen, this.robot);
    this.planWidget = new DeskPlanWidget(this.el.querySelector(".desk-notes")!, this.wm);
    this.director = new Director(this.wm, this.robot, this, services.peek, services.image, services.readText);
    this.director.onActivity = (t) => { this.activity = t; this.onActivity(t); };
    this.syncPresence();
    this.baseZ = Math.round(y);
    el.style.zIndex = String(this.baseZ);
  }

  // Desks are stacked by their row, so a desk further down covers the one above it.
  // While something rises above the desk (a bubble, z letters, a held phone) the desk
  // comes to the front so nothing gets hidden behind a neighbor.
  baseZ = 0;
  /** A bubble opened (the world checks it fits on screen). */
  onSay: () => void = () => {};
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

  /** Called in the same frame as the walking/seated actor changes. */
  onPresenceChange: () => void = () => {};
  setSeated(here: boolean) {
    const wasHere = !this.el.classList.contains('arriving');
    this.el.classList.toggle("arriving", !here);
    this.syncPresence();
    if (wasHere !== here) this.onPresenceChange();
  }

  private syncPresence() {
    const here = !!this.threadId && !this.el.classList.contains("arriving") && !this.handoffBusy;
    if (!here) this.clearKeys();
    this.director.setPresent(here);
  }

  assign(thread: { id: string; title: string; provider: string; model?: string | null } | null, profile: RobotProfile | null = null) {
    if (this.threadId === (thread?.id ?? null)) return;
    this.planWidget.close(false);
    this.director.reset();
    this.clearKeys();
    this.threadId = thread?.id ?? null;
    this.managerProject = null;
    this.managerSig = '';
    this.el.classList.remove("manager");
    this.managerSig = ""; this.managerProject = null;
    this.profile = profile;
    this.model = thread?.model ?? null;
    this.el.classList.toggle("empty", !thread);
    this.handoffBusy = false;
    this.lastBrand = null;
    this.syncPresence();
    if (thread) {
      this.deferredRobot.mount();
      this.robot.setBrand(thread.provider);
      this.robot.setModel?.(this.model);
      if (profile) {
        this.robot.setLook?.(profile.look);
        this.wm.prefs = profile.prefs;
        this.wm.robotName = profile.name;
        this.wm.setWallpaper(WALLPAPERS[profile.prefs.wallpaper % WALLPAPERS.length]);
        (this.el.querySelector("[data-d=mug]") as SVGGElement | null)?.style.setProperty("--mug", profile.prefs.mug);
      }
      const logo = logoFor(thread.provider);
      if (logo) this.wm.setWallpaperLogo(logo);
    } else this.deferredRobot.destroy();
    this.label(thread?.title ?? "Free desk", thread?.provider ?? null);
  }

  private labelSig = "";
  private managerProject: { title: string; icon: string | null; role?: string } | null = null;
  private managerSig = '';
  setManagerProject(p: { title: string; icon: string | null; role?: string; crest?: string; accent?: string } | null) {
    const sig = JSON.stringify(p);
    if (sig === this.managerSig) return;
    this.managerSig = sig;
    this.managerProject = p;
    this.el.classList.toggle("manager", !!p);
    // A manager wears its project's crown on the dark finish; side screens frame its desk.
    if (this.profile && this.threadId) this.robot.setLook?.(p ? managerLook(this.profile.look, p.crest ?? p.icon, p.accent) : this.profile.look);
    // The manager's desk: walnut front with a gold edge, the project medallion and pennant.
    const dress = this.el.querySelector<SVGSVGElement>(".mgr-dress")!;
    dress.toggleAttribute("hidden", !p);   // an SVG element has no .hidden property
    if (p) {
      dress.style.setProperty("--mgr-accent", p.accent || "#ffd27a");
      for (const img of dress.querySelectorAll<SVGImageElement>("image")) img.setAttribute("href", p.crest || p.icon || "");
    }
    this.label(this.el.querySelector(".desk-plate i")?.textContent || "", this.info?.provider ?? null);
  }
  private label(title: string, provider: string | null) {
    const who = this.profile ? (this.profile.role ? `${this.profile.name}, ${this.profile.role}` : this.profile.name) : "";
    const sig = JSON.stringify([title, provider, who, this.model, this.profile?.prefs.hobby, this.managerProject]);
    if (sig === this.labelSig) return;
    this.labelSig = sig;
    const plate = this.el.querySelector(".desk-plate") as HTMLElement;
    const img = plate.querySelector("img") as HTMLImageElement;
    const logo = this.managerProject ? this.managerProject.icon : logoFor(provider, "light");
    img.hidden = !logo;
    img.onerror = () => { img.hidden = true; };
    if (logo) img.src = logo;
    plate.querySelector("span")!.innerHTML = who ? `<b></b> <i></i>` : `<i></i>`;
    if (who) plate.querySelector("b")!.textContent = who;
    if (this.managerProject && who) plate.querySelector('b')!.textContent = `${who}, ${this.managerProject.role || 'Manager'}`;
    plate.querySelector("i")!.textContent = title;
    plate.title = [this.managerProject ? `${this.managerProject.title} manager` : "", who, title, this.model, this.profile?.prefs.hobby ? `Free time: ${HOBBY_LABEL[this.profile.prefs.hobby]}` : ""].filter(Boolean).join("\n");
  }

  setInfo(info: ThreadInfo) {
    this.info = info;
    if (info.title) this.label(info.title, info.provider);
    // The handoff scene plays only when this same conversation really moves to another harness
    // between two updates (Claude to Codex, say). Anything else just quietly fixes the look.
    if (info.id && info.id !== this.threadId) return;
    const to = brandFor(info.provider);
    const before = this.lastBrand;
    this.lastBrand = to;
    if (!this.handoffBusy) {
      if (before && before !== to) void this.handoff(before, info.provider, (info as any).model ?? null);
      else if (this.robot.brandName !== to) this.robot.setBrand(info.provider);
    }
    const model = (info as any).model as string | null | undefined;
    if (model && model !== this.model) { this.model = model; this.robot.setModel?.(model); }
    const logo = logoFor(info.provider);
    if (logo) this.wm.setWallpaperLogo(logo);
    this.director.setInfo(info);
  }

  // The thread moved to another harness: the old robot explains the work to the new one,
  // then the new one takes the chair.
  private handoffBusy = false;
  private lastBrand: string | null = null;   // the harness this conversation was on at the last update
  private async handoff(from: string, to: string, model: string | null) {
    this.handoffBusy = true;
    this.syncPresence();
    const tid = this.threadId;
    const host = this.el.querySelector(".robot-host") as HTMLElement;
    const name = this.profile?.name;
    gsap.to(host, { opacity: 0, duration: 0.3 });
    this.lift("handoff", true);
    const nice = (p: string) => ({ claude: "Claude", codex: "Codex", grok: "Grok" } as Record<string, string>)[brandFor(p)] ?? "another agent";
    this.say(`This chat moved from ${nice(from)} to ${nice(to)}. ${nice(from)} hands over the work.`, "speak");
    try {
      await playHandoff(this.el, { provider: from, model: this.model ?? undefined, name }, { provider: to, model: model ?? undefined }, { x: UNIT.w / 2, y: UNIT.h - 10 });
    } catch (e) { console.error("handoff failed", e); }
    if (this.threadId === tid) {
      this.robot.setBrand(to);
      if (model) { this.model = model; this.robot.setModel?.(model); }
    }
    gsap.to(host, { opacity: 1, duration: 0.3 });
    this.say(null);
    this.lift("handoff", false);
    this.handoffBusy = false;
    this.syncPresence();
  }

  // Little desk toys: poke the robot, nudge its coffee, buzz its phone.
  private pokes = 0;
  private pokeTimer = 0;
  private wireToys() {
    const lines = ["Hey!", "I'm working here!", "Yes, CEO?", "That tickles.", "Boop.", "Almost done, promise.", "Did you need something?"];
    const grumpy = ["Okay, okay!", "Stop poking me.", "I will tell HR.", "Poke limit reached."];
    const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
    this.el.querySelector(".poke-head")!.addEventListener("click", (e) => {
      stop(e);
      if (!this.threadId) return;
      gameSound.play('poke');
      this.pokes++;
      window.clearTimeout(this.pokeTimer);
      this.pokeTimer = window.setTimeout(() => (this.pokes = 0), 3000);
      const angry = this.pokes >= 4;
      this.robot.react(angry ? "angry" : (["surprised", "laugh", "shy"] as const)[Math.floor(Math.random() * 3)]);
      this.say((angry ? grumpy : lines)[Math.floor(Math.random() * (angry ? grumpy : lines).length)], "speak");
      window.setTimeout(() => this.say(null), 1800);
    });
    this.el.querySelector(".poke-mug")!.addEventListener("click", (e) => { stop(e); if (this.threadId) { gameSound.play('coffee'); void this.robot.drink(); } });
    this.el.querySelector(".poke-phone")!.addEventListener("click", (e) => {
      stop(e);
      if (this.threadId) gameSound.play('phone');
      const ph = this.el.querySelector("[data-d=phone]") as SVGGElement | null;
      if (ph) gsap.fromTo(ph, { x: -2 }, { x: 2, duration: 0.05, repeat: 9, yoyo: true, clearProps: "x" });
      if (this.threadId) { this.robot.react("surprised"); this.say(["Bzzz!", "Who is texting me?", "Probably spam."][Math.floor(Math.random() * 3)], "speak"); window.setTimeout(() => this.say(null), 1600); }
    });
  }

  // In shared rooms (the main office) a sign over the monitor says which project it works on.
  private projSig = "";
  setProject(p: { title: string; icon: string | null } | null) {
    const sig = p ? `${p.title}|${p.icon ?? ""}` : "";
    if (sig === this.projSig) return;
    this.projSig = sig;
    const el = this.el.querySelector(".desk-proj") as HTMLElement;
    el.hidden = !p;
    if (!p) return;
    const img = el.querySelector("img") as HTMLImageElement, mono = el.querySelector(".dp-mono") as HTMLElement;
    img.hidden = !p.icon;
    if (p.icon) img.src = p.icon;
    mono.hidden = !!p.icon;
    mono.textContent = p.title.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    (el.querySelector("b") as HTMLElement).textContent = p.title;
    el.title = `Working on ${p.title}`;
  }

  // --- DeskStage -------------------------------------------------------------
  say(text: string | null, kind: "think" | "speak" = "think") {
    const b = this.bubble;
    if (!text) {
      if (b.classList.contains("show")) gsap.to(b, { opacity: 0, y: 8, scale: 0.96, duration: 0.25, ease: "power2.in", onComplete: () => { b.classList.remove("show"); this.lift("bubble", false); } });
      return;
    }
    this.lift("bubble", true);
    const was = b.classList.contains("show");
    b.className = `bubble show ${kind}`;
    b.innerHTML = `<p></p><span class="tail a"></span><span class="tail b"></span>`;
    b.querySelector("p")!.textContent = text;
    this.onSay();
    if (!was) gsap.fromTo(b, { opacity: 0, y: 12, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" });
  }

  planSteps: { text: string; status: string }[] = [];
  // Inspect the live plan on the monitor without disturbing the robot's desktop.
  setPlan(steps: { text: string; status: string }[]) {
    this.planSteps = steps.map((s) => ({ ...s }));
    this.planWidget.update(steps);
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
        .to(z, { x: GEOM.monitor.x + GEOM.monitor.w + 14 + Math.random() * 26, y: GEOM.head.y - 120, scale: 1.4, rotation: 12, duration: 3.2, ease: "sine.inOut" }, 0)
        .to(z, { opacity: 0, duration: 1, ease: "sine.in" }, 2.2);
    };
    spawn();
    this.zTimer = window.setInterval(spawn, 1700);
  }

  // --- the robot's reach ---------------------------------------------------------
  private pressKey(key: string) {
    if (!this.wm.operatorPresent) return;
    const name=this.norm(key),geometry=this.keys.get(name);
    if(!geometry)return;
    this.lastKeyAt = performance.now();
    this.el.dispatchEvent(new CustomEvent("lucid:desk-key", { bubbles: true }));
    let active=this.pressedKeys.get(name);
    if(!active){
      const el=document.createElementNS("http://www.w3.org/2000/svg","rect");
      el.dataset.key=name;for(const [key,value]of Object.entries({x:geometry.x,y:geometry.y,width:geometry.w,height:geometry.h,rx:geometry.r}))el.setAttribute(key,String(value));el.setAttribute("fill","#9fe8ff");
      this.el.querySelector(".keys")!.appendChild(el);
      const animation=el.animate([{opacity:0},{opacity:1}],{duration:120,fill:"both"});
      active={el,animation,timer:0};this.pressedKeys.set(name,active);
      animation.onfinish=()=>{if(animation.playbackRate<0){el.remove();this.pressedKeys.delete(name)}};
    }else{
      window.clearTimeout(active.timer);active.animation.playbackRate=1;active.animation.play();
    }
    const pressed=active;
    pressed.timer=window.setTimeout(()=>{pressed.animation.reverse()},110);
  }
  private clearKeys(){for(const k of this.pressedKeys.values()){window.clearTimeout(k.timer);k.animation.cancel();k.el.remove()}this.pressedKeys.clear()}

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
        me.pressKey(key);
      },
      homeLeft: { ...me.keyCenters.get("f")! },
      homeRight: { ...me.keyCenters.get("j")! },
      mouse: { ...mouse },
      moveMouse(p: Pt, turn = 0) { if (me.wm.operatorPresent) mouseG.setAttribute("transform", `translate(${(p.x - mouse.x).toFixed(2)} ${(p.y - mouse.y).toFixed(2)}) rotate(${turn.toFixed(1)} ${mouse.x} ${mouse.y})`); },
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
        const geometry={x:Number(x.toFixed(1)),y:Number(y.toFixed(1)),w:Number((colW-2.4).toFixed(1)),h:Number((rowH-1.6).toFixed(1)),r:1.6};
        this.keys.set(ch,geometry);keys.push(`<rect x="${geometry.x}" y="${geometry.y}" width="${geometry.w}" height="${geometry.h}" rx="${geometry.r}" fill="#5a6177"/>`);
      });
    });
    const sy = kb.y + 2 + 4 * rowH + 0.6;
    this.keyCenters.set(" ", { x: kb.x + kb.w / 2, y: sy + 2.5, hand: "right" });
    const space={x:kb.x+colW*3,y:sy,w:colW*6,h:5,r:2};this.keys.set(" ",space);keys.push(`<rect x="${space.x}" y="${space.y}" width="${space.w}" height="${space.h}" rx="${space.r}" fill="#5a6177"/>`);
    return /* svg */ `
    <svg class="desk-table" viewBox="0 0 ${UNIT.w} ${UNIT.h}" aria-hidden="true">
      ${sharedVector(`
      <ellipse cx="${t.x + t.w / 2}" cy="${t.y + t.h + t.front + 8}" rx="${t.w / 2 + 6}" ry="12" fill="#2b1d10" opacity="0.18"/>
      <rect x="${t.x}" y="${t.y + t.h - 4}" width="${t.w}" height="${t.front + 4}" rx="6" fill="#b48a5e"/>
      <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="8" fill="#d7b48a"/>
      <rect x="${t.x + 6}" y="${t.y + 4}" width="${t.w - 12}" height="3" rx="1.5" fill="#fff" opacity="0.25"/>
      <ellipse cx="${st.x}" cy="${st.base}" rx="30" ry="9" fill="#4a5063"/>
      <ellipse cx="${st.x}" cy="${st.base - 2}" rx="24" ry="6" fill="#5a6177"/>
      <rect x="${st.x - 7}" y="${st.top}" width="14" height="${st.base - st.top - 2}" fill="#3a3f4f"/>
      <g class="papers"><rect x="96" y="194" width="38" height="30" rx="3" fill="#f4f1ea" transform="rotate(-7 115 209)"/><rect x="100" y="197" width="38" height="30" rx="3" fill="#fbf9f4" transform="rotate(5 119 212)"/></g>
      <rect x="${kb.x - 5}" y="${kb.y - 3}" width="${kb.w + 10}" height="${kb.h + 7}" rx="7" fill="#2e3242"/>
      `,this.vectorOwner)}
      <g class="keys">${sharedVector(keys.join(""),this.vectorOwner,"key")}</g>
      <rect x="${m.x - 24}" y="${m.y - 22}" width="48" height="44" rx="10" fill="#4a5063" opacity="0.55"/>
      <g data-d="mouse"><ellipse cx="${m.x}" cy="${m.y}" rx="9" ry="12" fill="#2e3242"/><ellipse cx="${m.x}" cy="${m.y - 3}" rx="6" ry="7" fill="#4a5063"/><rect x="${m.x - 0.75}" y="${m.y - 11}" width="1.5" height="6" fill="#2e3242"/></g>
      <g data-d="phone"><rect x="${ph.x - 11}" y="${ph.y - 19}" width="22" height="38" rx="5" fill="#22263a"/><rect x="${ph.x - 9}" y="${ph.y - 16}" width="18" height="32" rx="3" fill="#353b58"/></g>
      <g data-d="mug" class="mug" style="--mug:#ff8a65">
        <ellipse cx="${mug.x + 3}" cy="${mug.y + 6}" rx="13" ry="5" fill="#2b1d10" opacity="0.2"/>
        <path class="mug-handle" d="M${mug.x + 8} ${mug.y - 7} q9 0 9 6 q0 6 -9 6" stroke-width="3.6" stroke-linecap="round" fill="none"/>
        <rect class="mug-body" x="${mug.x - 10}" y="${mug.y - 12}" width="20" height="20" rx="5"/>
        <rect class="mug-shade" x="${mug.x + 3}" y="${mug.y - 9}" width="7" height="17" rx="3.5"/>
        <rect x="${mug.x - 7}" y="${mug.y - 7}" width="2.6" height="11" rx="1.3" fill="#fff" opacity="0.35"/>
        <ellipse cx="${mug.x}" cy="${mug.y - 11}" rx="9" ry="4" fill="#5a2b1e"/>
        <ellipse cx="${mug.x - 2}" cy="${mug.y - 12}" rx="3" ry="1.2" fill="#8a4a32"/>
        <g class="mug-steam"><path d="M${mug.x - 3} ${mug.y - 16} q-3 -5 0 -9 q3 -4 0 -9" /><path d="M${mug.x + 3} ${mug.y - 15} q-3 -5 0 -9 q3 -4 0 -8" /></g>
      </g>
      ${sharedVector(emptyChairSvg(),this.vectorOwner,"empty-chair")}
    </svg>`;
  }

  destroy() {
    this.planWidget.destroy();
    this.disposeStaticArt();
    this.clearKeys();
    this.director.reset();
    this.robot.destroy();
    this.wm.destroy();
    releaseVectors(this.vectorOwner);
    releaseRenderView(this.screen);
    window.clearInterval(this.zTimer);
    this.el.remove();
  }
}
