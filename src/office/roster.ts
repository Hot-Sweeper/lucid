import type { RobotLook } from "./rig";
import { brandFor, type BrandKind } from "./brand";
import { migrateLook, randomLook } from "../world/look";

// The team. Robots are persistent workers: hired once with a name, a look and habits,
// then assigned to threads. When a thread settles, its robot becomes free and the next
// thread of the same harness gets that robot instead of a brand new hire.

export type Editor = "studio" | "pad" | "vim";
export type Game = "snake" | "flappy" | "dash" | "chess";
export type TasksStyle = "board" | "checklist" | "sticky";
// Office fans use Botword, Cellsheet or Slidedeck when bored and keep their favourites in the dock.
export type OfficeTaste = "none" | "writer" | "numbers" | "slides" | "suite";
// Pastime apps on the monitor, and the social apps a robot uses (desktop and phone). Each robot has its own mix.
export type FunApp = "doodle" | "crossword" | "solitaire" | "stocks" | "mail" | "lingo";
export type SocialApp = "botsapp" | "telegrid" | "chirp" | "instabot" | "snapbot" | "shorts";
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
  launch: "dock" | "spotlight";                    // how it usually opens apps
  switching: "click" | "dock" | "alttab";          // how it usually gets back to an open window
  tidiness: "tidy" | "normal" | "messy";           // how many windows it lets pile up
  git: "cli" | "desktop";                          // commits and pushes in the terminal, or in a GitHub Desktop style app
  office?: OfficeTaste;                            // which office apps it likes (none for most robots)
  apps?: FunApp[];                                 // favourite pastime apps (pinned in the dock)
  socials?: SocialApp[];                           // social apps it uses; it never opens the others
  t3?: T3Channel;                                  // which T3 Code build it runs its thread in
}
/** T3 Code release channel: the stable app or T3 Code (Nightly). */
export type T3Channel = "stable" | "nightly";
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
/** The T3 Code build a robot uses, from its id: the same every launch, and about half the office on each. */
export function t3ChannelFor(id: string): T3Channel { return idHash(id + "t3code") < 0.5 ? "nightly" : "stable"; }
const officeFrom = (x: number): OfficeTaste => (x < 0.6 ? "none" : x < 0.72 ? "writer" : x < 0.83 ? "numbers" : x < 0.92 ? "slides" : "suite");
// A robot's interests: two or three pastime apps and two to four social apps, nudged by its hobby.
// \`r\` is Math.random for new hires, or a generator seeded from the id so old robots migrate the same way every launch.
export function interestsFrom(r: () => number, hobby: Hobby): { apps: FunApp[]; socials: SocialApp[] } {
  const H = (k: Hobby) => (hobby === k ? 1 : 0);
  const odds: Record<SocialApp, number> = {
    botsapp: 0.5 + 0.3 * H("chatter"),
    telegrid: 0.28 + 0.2 * H("gamer"),
    chirp: 0.38 + 0.25 * H("chiller"),
    instabot: 0.32 + 0.2 * (H("chiller") + H("chatter")),
    snapbot: 0.22 + 0.25 * H("chatter"),
    shorts: 0.3 + 0.4 * H("watcher"),
  };
  const all = Object.keys(odds) as SocialApp[];
  let socials = all.map((a) => [a, r()] as const).filter(([a, x]) => x < odds[a]).sort((a, b) => a[1] - b[1]).map(([a]) => a);
  while (socials.length < 2) { const a = all[Math.floor(r() * all.length)]; if (!socials.includes(a)) socials.push(a); }
  socials = socials.slice(0, 4);
  const like: Record<FunApp, number> = {
    doodle: 1 + 1.5 * H("musician") + H("chiller"),
    crossword: 1 + H("chiller") + 0.5 * H("gamer"),
    solitaire: 1 + 1.5 * H("gamer"),
    stocks: 0.7 + 0.8 * H("watcher"),
    mail: 0.8 + H("chatter"),
    lingo: 1 + 0.6 * H("chatter") + 0.6 * H("watcher"),
  };
  const apps: FunApp[] = [];
  const want = r() < 0.3 ? 3 : 2;
  while (apps.length < want) {
    const pool = (Object.keys(like) as FunApp[]).filter((a) => !apps.includes(a));
    let x = r() * pool.reduce((t, a) => t + like[a], 0);
    apps.push(pool.find((a) => (x -= like[a]) <= 0) ?? pool[0]);
  }
  return { apps, socials };
}
function seeded(key: string) {
  let a = 7;
  for (const ch of key) a = Math.imul(a ^ ch.charCodeAt(0), 0x5bd1e995) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
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
  /** The office's roster, for dialogs that are opened without one (the hiring screen). */
  static current: Roster | null = null;
  robots: RobotProfile[] = [];
  // A look and name picked in the hiring screen for a robot that is not hired yet.
  private draft: { brand: BrandKind; look: RobotLook; name: string } | null = null;

  private saveTimer = 0;
  constructor() {
    Roster.current = this;
    const api = (window as any).lucid;
    try { this.robots = JSON.parse(api?.rosterLoad?.() || localStorage.getItem(KEY) || "[]"); } catch { this.robots = []; }
    let migrated = false;
    for (const r of this.robots) {
      if (r.prefs && !r.prefs.tasks) r.prefs.tasks = tasksFor(r.id || r.name || "");
      if (r.prefs && !r.prefs.hobby) r.prefs.hobby = hobbyFor(r.prefs, r.id || r.name || "");
      if (r.prefs && !r.prefs.git) { r.prefs.git = idHash((r.id || r.name || "") + "git") < 0.45 ? "desktop" : "cli"; migrated = true; }
      if (r.prefs && !r.prefs.office) { r.prefs.office = officeFrom(idHash((r.id || r.name || "") + "office")); migrated = true; }
      if (r.prefs && !r.prefs.socials) { Object.assign(r.prefs, interestsFrom(seeded((r.id || r.name || "") + "interests"), r.prefs.hobby)); migrated = true; }
      if (r.prefs && !r.prefs.launch) {
        const x = idHash((r.id || r.name || "") + "habits");
        r.prefs.launch = x < 0.35 ? "spotlight" : "dock";
        r.prefs.switching = ((x * 7) % 1) < 0.45 ? "click" : ((x * 7) % 1) < 0.75 ? "dock" : "alttab";
        r.prefs.tidiness = ((x * 13) % 1) < 0.3 ? "tidy" : ((x * 13) % 1) < 0.7 ? "normal" : "messy";
      }
      if (r.prefs && !r.prefs.listens) { const x = idHash((r.id || r.name || "") + "music"); r.prefs.listens = x < 0.35 ? "always" : x < 0.7 ? "sometimes" : "never"; r.look.headphones = false; }
      if (r.prefs && !r.prefs.t3) { r.prefs.t3 = t3ChannelFor(r.id || r.name || ""); migrated = true; }
      if (r.prefs && !r.prefs.windows) { const x = idHash((r.id || r.name || "") + "win"); r.prefs.windows = x < 0.25 ? "fullscreen" : x < 0.6 ? "tiler" : "floating"; }
      // Robots hired before hats and builds existed get their extras from their id: unique, and the same every launch.
      if (!r.look) r.look = {};
      if (r.look.build === undefined) { r.look = migrateLook(r.look, r.id || r.name || ""); migrated = true; }
    }
    if (migrated) this.save();
  }

  /** Saves a new look (from the customize dialog). */
  setLook(id: string, look: RobotLook) {
    const r = this.robots.find((x) => x.id === id);
    if (!r) return;
    r.look = { ...look, headphones: r.look?.headphones ?? false };
    this.save();
  }

  rename(id: string, name: string) {
    const r = this.robots.find((x) => x.id === id), n = name.trim().slice(0, 32);
    if (!r || !n) return;
    r.name = n;
    this.save();
  }

  /** The next fresh hire of this harness gets this look and name (null clears it). */
  prepareHire(provider: string | null, look?: RobotLook, name?: string) {
    this.draft = provider && look ? { brand: brandFor(provider), look, name: (name ?? "").trim().slice(0, 32) } : null;
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
    const draft = this.draft && this.draft.brand === brandFor(provider) ? this.draft : null;
    if (draft) this.draft = null;
    const name = draft?.name || (free.length ? pick(free) : `${pick(NAMES)} ${this.robots.length + 1}`);
    const w = () => Math.round((0.2 + Math.random()) * 10) / 10;
    const hobby = hobbyFrom(Math.random());
    const id = `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id,
      name,
      brand: brandFor(provider),
      provider,
      look: { ...(draft?.look ?? randomLook()), headphones: false },   // headphones go on when the music starts
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
        hobby,
        windows: pick(["fullscreen", "tiler", "tiler", "floating", "floating"] as const),
        listens: pick(["always", "sometimes", "sometimes", "never", "never"] as const),
        launch: pick(["dock", "dock", "spotlight"] as const),
        switching: pick(["click", "click", "dock", "alttab"] as const),
        tidiness: pick(["tidy", "normal", "normal", "messy"] as const),
        git: Math.random() < 0.45 ? "desktop" : "cli",
        office: officeFrom(Math.random()),
        ...interestsFrom(Math.random, hobby),
        t3: t3ChannelFor(id),
      },
      hiredAt: Date.now(),
      threadId,
      jobs: 1,
    };
  }
}
