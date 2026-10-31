import type { RobotLook } from "./rig";
import { brandFor, type BrandKind } from "./brand";

// The team. Robots are persistent workers: hired once with a name, a look and habits,
// then assigned to threads. When a thread settles, its robot becomes free and the next
// thread of the same harness gets that robot instead of a brand new hire.

export type Editor = "studio" | "pad" | "vim";
export type Game = "snake" | "flappy" | "dash" | "chess";
export type TasksStyle = "board" | "checklist" | "sticky";
// What a robot mostly does with free time. Gamers game, musicians make beats, chatters hang
// out with friends, watchers watch videos, chillers sip coffee and scroll.
export type Hobby = "gamer" | "musician" | "chatter" | "watcher" | "chiller";
export const HOBBY_LABEL: Record<Hobby, string> = { gamer: "Gamer", musician: "Makes beats", chatter: "Chatty", watcher: "Video binger", chiller: "Chiller" };
export interface Prefs {
  editor: Editor;
  wallpaper: number;                  // index into WALLPAPERS
  games: Record<Game, number>;        // how much it likes each game
  phone: "clips" | "tube";            // short vertical clips, or long videos on the monitor
  subagents: "cli" | "app";           // how it drives helper agents
  music: number;                      // how often it makes beats when bored (0..1)
  social: number;                     // how often it hangs out in chat (0..1)
  mug: string;
  tasks: TasksStyle;                  // its to-do list: a task board app, a checklist app, or only sticky notes on the desk
  hobby: Hobby;                       // its main pastime
  windows: "fullscreen" | "tiler" | "floating";   // how it likes its windows
  listens: "always" | "sometimes" | "never";      // music while it works (headphones on)
}
export interface RobotProfile {
  id: string;
  name: string;
  brand: BrandKind;
  provider: string;
  look: RobotLook;
  prefs: Prefs;
  hiredAt: number;
  threadId: string | null;
  jobs: number;
  done?: string[];
  role?: string | null;
}

export const WALLPAPERS = [
  "radial-gradient(120% 90% at 30% 10%, #3a3f99 0%, #24286b 45%, #161a45 100%)",
  "radial-gradient(120% 90% at 70% 0%, #ff9f5a 0%, #b4507a 45%, #2b1d4a 100%)",
  "linear-gradient(160deg, #1d6b68 0%, #19404f 50%, #0f2033 100%)",
  "radial-gradient(110% 80% at 20% 90%, #4ff0a0 0%, #1f7a6a 35%, #12233a 100%)",
  "linear-gradient(200deg, #b07cff 0%, #5a3fa0 45%, #1b1640 100%)",
  "radial-gradient(120% 100% at 50% 110%, #ffcf7a 0%, #e0708a 40%, #2a2f6a 100%)",
];
const ACCENTS = ["#ff9f5a", "#4ff0a0", "#4fb6ff", "#ff6f91", "#b07cff", "#ffd27a"];
const MUGS = ["#ff8a65", "#4fb6ff", "#4ff0a0", "#ffd27a", "#b07cff", "#f6ecdc"];
const NAMES = [
  "Pip", "Bolt", "Nova", "Widget", "Sprocket", "Echo", "Byte", "Cog", "Juno", "Pixel", "Ratchet", "Volt",
  "Mochi", "Tinker", "Orbit", "Quill", "Zip", "Nimbus", "Rivet", "Ada", "Lumen", "Patch", "Gizmo", "Kilo",
];

const KEY = "lucid:roster:v1";
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const tasksFrom = (x: number): TasksStyle => (x < 0.45 ? "board" : x < 0.85 ? "checklist" : "sticky");
// Robots hired before this habit existed get one from their id, so it stays the same every launch.
function idHash(id: string) {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}
function tasksFor(id: string) { return tasksFrom(idHash(id)); }
const hobbyFrom = (x: number): Hobby => (x < 0.3 ? "gamer" : x < 0.45 ? "musician" : x < 0.65 ? "chatter" : x < 0.85 ? "watcher" : "chiller");
// Older robots get a hobby from their existing habits, so their personality stays recognisable.
function hobbyFor(p: Prefs, id: string): Hobby {
  if (p.music >= 0.8) return "musician";
  if (p.social >= 0.8) return "chatter";
  const g = p.games ? Math.max(...Object.values(p.games)) : 0;
  if (g >= 1.6) return "gamer";
  if (p.phone === "tube") return "watcher";
  return hobbyFrom((idHash(id + "hobby") * 7) % 1);
}

export class Roster {
  robots: RobotProfile[] = [];

  private saveTimer = 0;
  constructor() {
    const api = (window as any).lucid;
    try { this.robots = JSON.parse(api?.rosterLoad?.() || localStorage.getItem(KEY) || "[]"); } catch { this.robots = []; }
    for (const r of this.robots) {
      if (r.prefs && !r.prefs.tasks) r.prefs.tasks = tasksFor(r.id || r.name || "");
      if (r.prefs && !r.prefs.hobby) r.prefs.hobby = hobbyFor(r.prefs, r.id || r.name || "");
      if (r.prefs && !r.prefs.listens) { const x = idHash((r.id || r.name || "") + "music"); r.prefs.listens = x < 0.35 ? "always" : x < 0.7 ? "sometimes" : "never"; r.look.headphones = false; }
      if (r.prefs && !r.prefs.windows) { const x = idHash((r.id || r.name || "") + "win"); r.prefs.windows = x < 0.25 ? "fullscreen" : x < 0.6 ? "tiler" : "floating"; }
    }
  }

  private save() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const json = JSON.stringify(this.robots);
      const api = (window as any).lucid;
      if (api?.rosterSave) void api.rosterSave(json); else localStorage.setItem(KEY, json);
    }, 400);
  }

  byThread(threadId: string) { return this.robots.find((r) => r.threadId === threadId) ?? null; }

  // Give every working thread a robot. Robots whose thread is settled or gone are free
  // and get reused for new threads of the same harness before anyone new is hired.
  assign(working: { id: string; provider: string }[], settledIds: Set<string>, knownIds: Set<string>) {
    const working_ = new Set(working.map((t) => t.id));
    for (const r of this.robots) {
      if (r.threadId && !working_.has(r.threadId) && !settledIds.has(r.threadId) && !knownIds.has(r.threadId)) r.threadId = null;
    }
    for (const t of working) {
      if (this.byThread(t.id)) continue;
      const brand = brandFor(t.provider);
      const free = this.robots.find((r) => r.brand === brand && (!r.threadId || settledIds.has(r.threadId)));
      if (free) { if (free.threadId) (free.done ??= []).push(free.threadId); free.threadId = t.id; free.provider = t.provider; free.jobs++; }
      else this.robots.push(this.hire(t.id, t.provider));
    }
    this.save();
  }

  // Settled threads keep their robot only if nobody reassigned it (it is chilling in the break room).
  restingFor(settled: { id: string; provider: string }[]) {
    const out: { thread: string; robot: RobotProfile }[] = [];
    for (const t of settled) {
      const r = this.byThread(t.id);
      if (r) out.push({ thread: t.id, robot: r });
      else if (!this.robots.some((x) => x.done?.includes(t.id))) out.push({ thread: t.id, robot: this.hireFor(t.id, t.provider) });
    }
    return out;
  }

  // The hiring screen picked someone for a new thread: a free teammate, or a fresh hire.
  assignRobot(threadId: string, robotId: string | null, provider: string, role: string | null = null) {
    let r = robotId ? this.robots.find((x) => x.id === robotId) ?? null : null;
    if (r) {
      if (r.threadId && r.threadId !== threadId) (r.done ??= []).push(r.threadId);
      r.threadId = threadId; r.provider = provider; r.jobs++;
    } else { r = this.hire(threadId, provider); this.robots.push(r); }
    if (role !== null) r.role = role || null;
    this.save();
  }

  freeTeam(settledIds: Set<string>) {
    return this.robots.filter((r) => !r.threadId || settledIds.has(r.threadId));
  }

  hireFor(threadId: string, provider: string) {
    const r = this.byThread(threadId) ?? this.hire(threadId, provider);
    if (!this.robots.includes(r)) { this.robots.push(r); this.save(); }
    return r;
  }

  private hire(threadId: string, provider: string): RobotProfile {
    const used = new Set(this.robots.map((r) => r.name));
    const free = NAMES.filter((n) => !used.has(n));
    const name = free.length ? pick(free) : `${pick(NAMES)} ${this.robots.length + 1}`;
    const w = () => Math.round((0.2 + Math.random()) * 10) / 10;
    return {
      id: `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      brand: brandFor(provider),
      provider,
      look: {
        accent: pick(ACCENTS),
        antennaTip: pick(["ball", "ball", "star", "heart", "ring"] as const),
        headphones: false,   // they put them on when the music starts
        sticker: pick(["none", "none", "bolt", "star", "heart", "smile"] as const),
      },
      prefs: {
        editor: pick(["studio", "studio", "pad", "vim"] as const),
        wallpaper: Math.floor(Math.random() * WALLPAPERS.length),
        games: { snake: w(), flappy: w(), dash: w(), chess: w() },
        phone: Math.random() < 0.6 ? "clips" : "tube",
        subagents: Math.random() < 0.55 ? "cli" : "app",
        music: Math.round(Math.random() * 10) / 10,
        social: Math.round(Math.random() * 10) / 10,
        mug: pick(MUGS),
        tasks: tasksFrom(Math.random()),
        hobby: hobbyFrom(Math.random()),
        windows: pick(["fullscreen", "tiler", "tiler", "floating", "floating"] as const),
        listens: pick(["always", "sometimes", "sometimes", "never", "never"] as const),
      },
      hiredAt: Date.now(),
      threadId,
      jobs: 1,
    };
  }
}
