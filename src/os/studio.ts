// Studio: the robot watches the page it just changed being built like a person in a design tool.
// Each save is rendered from the project's files (or the dev server the robot started) in a
// sandboxed frame on its own origin (electron/studio.cjs); the playback engine there diffs it
// against the previous render. No model is asked anything, so this costs no tokens.
import type { WM } from "./wm";
import { renderFps, onRenderWake } from "../perf/render";
import { setDetailScene, clearDetailScene, type DetailShape } from "../perf/detail-scene";
import { StudioSchedule, type StudioCommand, type StudioPresence } from "./studio-schedule";
import "./studio.css";

type Session = { ok: true; id: string; origin: string; entry: string; kind: "static" | "server"; label: string };
type Api = { studioOpen(req: object): Promise<Session | { ok: false; reason: string }>; studioClose(id: string): Promise<unknown> };
export type StudioSave = {
  thread: string; root: string; file: string; server?: string | null;
  /** The saved page is new: its first render is built from a blank canvas. */
  created?: boolean;
  /** The run is still going (the engine waits briefly for a stylesheet that is not written yet). */
  working?: boolean;
  /** Show changes directly (catching up on an earlier part of the run). */
  still?: boolean;
  /** Playback speed while more real work waits. */
  pace?: () => number;
  /** The save can be shown: called before the Studio window opens. */
  onShow?: () => void;
};

// Bounded: at most three Studio frames in the office, dropped after a while unseen.
const MAX_FRAMES = 3, UNSEEN_MS = 90_000, SWEEP_MS = 15_000, TICK_MS = 250, READY_MS = 10_000, LONGEST_WAIT_MS = 24_000;
const framed = new Set<StudioApp>();
let sweepTimer = 0;
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Only messages from a Studio frame's own window count; a frame cannot forge another source.
function onMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== "object" || event.data.studio !== true) return;
  for (const app of framed) if (app.owns(event.source)) { app.receive(event.data); return; }
}
function track(app: StudioApp, on: boolean) {
  if (on) framed.add(app); else framed.delete(app);
  if (on && framed.size === 1) window.addEventListener("message", onMessage);
  if (!framed.size) { window.removeEventListener("message", onMessage); window.clearTimeout(sweepTimer); sweepTimer = 0; }
  else if (on && !sweepTimer) sweepTimer = window.setTimeout(sweep, SWEEP_MS);
}
function sweep() {
  sweepTimer = 0;
  for (const app of [...framed]) app.sweep();
  if (framed.size && !sweepTimer) sweepTimer = window.setTimeout(sweep, SWEEP_MS);
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const color = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : "#ffffff");

export class StudioApp {
  private schedule = new StudioSchedule();
  private session: Session | null = null;
  private view: HTMLElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private ready = false;
  private frameAt = 0;
  private lastLive = 0;
  private timer = 0;
  private stopWake: (() => void) | null = null;
  private waiters: { version: number; at: number; resolve: () => void }[] = [];
  private options: StudioSave | null = null;
  private sentPace = 1;
  private lent = false;
  private typing = false;
  private api: Api | undefined = (window as any).lucid;
  constructor(private wm: WM) {}

  /** Show a saved web file. Resolves when its render is on screen (or nobody can watch);
   * false when nothing in the project can be rendered, so the caller keeps its own preview. */
  async save(s: StudioSave): Promise<boolean> {
    if (!this.api?.studioOpen) return false;
    const epoch = this.wm.epoch;
    let opened: Session | { ok: false; reason: string };
    try { opened = await this.api.studioOpen({ thread: s.thread, root: s.root, file: s.file, server: s.server ?? null }); } catch { return false; }
    this.wm.check(epoch);
    if (!opened.ok) return false;
    if (this.session?.id !== opened.id) {
      this.dropFrame();
      if (this.session) void this.api.studioClose(this.session.id).catch(() => {});
      this.session = opened;
      this.schedule = new StudioSchedule();
    }
    s.onShow?.();
    const win = await this.wm.open("studio", `${opened.label}  Studio`);
    this.wm.check(epoch);
    this.mount(win.body);
    this.options = s;
    const version = this.schedule.save(!!s.created);
    this.ensureFrame();
    this.post({ type: "working", on: !!s.working });
    await new Promise<void>((resolve) => { this.waiters.push({ version, at: performance.now(), resolve }); this.pump(); });
    this.wm.check(epoch);
    return true;
  }

  reset() {
    this.dropFrame();
    if (this.view) { clearDetailScene(this.view); this.view = null; }
    if (this.session) void this.api?.studioClose(this.session.id).catch(() => {});
    this.session = null;
    this.options = null;
    this.schedule = new StudioSchedule();
  }

  owns(source: MessageEventSource | null) { return !!source && source === this.frame?.contentWindow; }

  receive(m: any) {
    switch (m.type) {
      case "ready":
        this.ready = true;
        this.sentPace = 1;
        this.post({ type: "working", on: !!this.options?.working });
        break;
      case "settled": this.schedule.settle(num(m.version)); break;
      case "playback": if (m.on) this.lendPointer(); else this.returnPointer(); break;
      case "pointer": this.follow(num(m.x), num(m.y)); break;
      case "press": if (this.lent) this.wm.robot.click(); break;
      case "typing": this.setTyping(!!m.on && this.lent); break;
      case "scene": this.scene(m.scene); break;
    }
    this.pump();
  }

  /** The window closed or nobody looked for a while: release the frame and its renderer. */
  sweep() {
    if (!this.view?.isConnected) { this.dropFrame(); return; }
    if (this.schedule.live(this.presence())) { this.lastLive = performance.now(); return; }
    if (this.schedule.idle && !this.waiters.length && performance.now() - this.lastLive > UNSEEN_MS) this.dropFrame();
  }

  private mount(body: HTMLElement) {
    if (this.view && body.contains(this.view)) return;
    // A reopened window is a new body: a moved iframe would reload anyway.
    this.dropFrame();
    if (this.view) clearDetailScene(this.view);
    this.view = document.createElement("div");
    this.view.className = "studio";
    this.view.inert = true; // a robot's screen: never in the keyboard focus order
    body.replaceChildren(this.view);
  }

  private ensureFrame() {
    if (this.frame || !this.view || !this.session) return;
    while (framed.size >= MAX_FRAMES) [...framed].sort((a, b) => a.lastLive - b.lastLive)[0].dropFrame();
    const frame = document.createElement("iframe");
    frame.className = "studio-frame";
    // Its own origin keeps it away from the app and its bridge; no forms, popups or navigation out.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.referrerPolicy = "no-referrer";
    frame.tabIndex = -1;
    frame.title = "Studio canvas";
    const { origin, entry, label } = this.session;
    frame.src = `${origin}/__studio/host.html?entry=${encodeURIComponent(entry)}&label=${encodeURIComponent(label)}`;
    this.view.append(frame);
    this.frame = frame;
    this.ready = false;
    this.frameAt = this.lastLive = performance.now();
    this.schedule.frameLost();
    track(this, true);
    this.stopWake ??= onRenderWake(() => this.pump());
  }

  private dropFrame() {
    if (!this.frame) { this.release(); return; }
    this.returnPointer();
    this.frame.remove();
    this.frame = null;
    this.ready = false;
    this.schedule.frameLost();
    track(this, false);
    this.release();
  }
  private release() {
    this.stopWake?.(); this.stopWake = null;
    window.clearTimeout(this.timer); this.timer = 0;
    for (const w of this.waiters.splice(0)) w.resolve();
  }

  private presence(): StudioPresence {
    const view = this.view;
    const host = view?.closest<HTMLElement>(".screen, .phone-screen");
    return {
      seated: this.wm.operatorPresent && this.wm.presentationVisible,
      shown: !!view?.isConnected && renderFps(view) > 0,
      sharp: !host?.dataset.screenDetail,
      still: !!this.options?.still || reducedMotion(),
    };
  }

  private pump() {
    window.clearTimeout(this.timer); this.timer = 0;
    if (!this.frame) return;
    const p = this.presence(), now = performance.now();
    if (this.schedule.live(p)) this.lastLive = now;
    if (this.ready) {
      for (const command of this.schedule.next(p)) this.send(command);
      const pace = Math.round(Math.min(6, Math.max(1, this.options?.pace?.() ?? 1)) * 2) / 2;
      if (pace !== this.sentPace) { this.sentPace = pace; this.post({ type: "pace", pace }); }
    }
    for (const w of [...this.waiters]) {
      const late = now - w.at > LONGEST_WAIT_MS;
      if (late && this.schedule.playing) this.post({ type: "finish" });
      if (late || this.schedule.done(w.version, p) || !this.ready && now - this.frameAt > READY_MS) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve();
      }
    }
    // Poll only while something waits or plays; camera and window changes also wake it.
    if (!this.schedule.idle || this.waiters.length) this.timer = window.setTimeout(() => this.pump(), TICK_MS);
  }

  private send(command: StudioCommand) {
    if (command.type === "motion" && !command.on) this.returnPointer();
    // An animated render starts from where the robot's pointer is now.
    const cursor = command.type === "render" && command.animate ? this.fromScreen(this.wm.cursorPoint.x, this.wm.cursorPoint.y) : null;
    this.post(cursor ? { ...command, cursor } : command);
  }

  private post(message: object) {
    // Targeted by window identity; the content (versions, positions) is not secret.
    if (this.ready) this.frame?.contentWindow?.postMessage(message, "*");
  }

  // Frame coordinates (CSS px of the iframe) to screen coordinates of the robot's desktop and back.
  private geometry() {
    const frame = this.frame;
    if (!frame) return null;
    const root = this.wm.root.getBoundingClientRect(), box = frame.getBoundingClientRect();
    if (!root.width || !frame.clientWidth) return null;
    return { k: this.wm.width / root.width, left: box.left - root.left, top: box.top - root.top, s: box.width / frame.clientWidth };
  }
  private fromScreen(x: number, y: number) {
    const g = this.geometry();
    return g ? { x: (x / g.k - g.left) / g.s, y: (y / g.k - g.top) / g.s } : null;
  }
  private follow(x: number, y: number) {
    const g = this.lent ? this.geometry() : null;
    if (g) this.wm.placeCursor((g.left + x * g.s) * g.k, (g.top + y * g.s) * g.k);
  }

  // One visible pointer: the robot's desktop cursor waits while the Studio cursor works.
  private lendPointer() {
    if (this.lent) return;
    this.lent = true;
    this.wm.cursorEl.classList.add("is-lent");
    this.wm.robot.setPose("mouse");
  }
  private returnPointer() {
    this.setTyping(false);
    if (!this.lent) return;
    this.lent = false;
    this.wm.cursorEl.classList.remove("is-lent");
  }
  private setTyping(on: boolean) {
    if (on === this.typing) return;
    this.typing = on;
    this.wm.robot.setTyping(on);
  }

  // The distant monitor tiers draw this instead of the cross-origin frame.
  private scene(raw: any) {
    if (!this.view || !raw || !Array.isArray(raw.shapes)) return;
    const shapes: DetailShape[] = raw.shapes.slice(0, 550).map((s: any) => ({
      x: num(s?.x), y: num(s?.y), w: num(s?.w), h: num(s?.h), color: color(s?.color),
      radius: num(s?.radius), text: s?.text === true, opacity: s?.opacity == null ? undefined : num(s.opacity),
    }));
    setDetailScene(this.view, { width: num(raw.width), height: num(raw.height), background: color(raw.background), shapes });
  }
}
