import type { RobotLook } from "./look";
import { brandFor, type BrandKind } from "./brand";
import { migrateLook, randomLook } from "./look";
import { compatibleWorkers } from "../office/worker-match";

// The team. Robots are persistent workers: hired once with a name, a look and habits,
// then assigned to threads. When a thread settles, its robot becomes free and the next
// thread of the same harness gets that robot instead of a brand new hire.

export type Game = "snake" | "flappy" | "dash" | "chess";
export type TasksStyle = "board" | "checklist" | "sticky";
// Office fans use Botword, Cellsheet or Slidedeck when bored and keep their favourites in the dock.
export type OfficeTaste = "none" | "writer" | "numbers" | "slides" | "suite";
// Pastime apps on the monitor, and the social apps a robot uses (desktop and phone). Each robot has its own mix.
export type FunApp = "doodle" | "crossword" | "solitaire" | "stocks" | "mail" | "lingo" | "vapor" | "trading";
export type SocialApp = "botsapp" | "telegrid" | "chirp" | "instabot" | "snapbot" | "shorts" | "spool" | "sparkplug";
// What a robot mostly does with free time. Gamers game, musicians make beats, chatters hang
// out with friends, watchers watch videos, chillers sip coffee and scroll.
export type Hobby = "gamer" | "musician" | "chatter" | "watcher" | "chiller";
export const HOBBY_LABEL: Record<Hobby, string> = { gamer: "Gamer", musician: "Makes beats", chatter: "Chatty", watcher: "Video binger", chiller: "Chiller" };
export interface Prefs {
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
  git: "cli" | "desktop";                          // commits and pushes in the terminal, or in the Git app
  office?: OfficeTaste;                            // which office apps it likes (none for most robots)
  apps?: FunApp[];                                 // favourite pastime apps (pinned in the dock)
  socials?: SocialApp[];                           // social apps it uses; it never opens the others
  socialsV?: number;                               // 2 once Spool and Sparkplug were offered to it
  leisure2?: boolean;                              // already offered Vapor and the Botcoin Exchange (older robots get them once, from their id)
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
  lastModel?: string | null;
  /** Left the floor for the staff wall. Kept with its history, never assigned work. */
  retired?: boolean;
  retiredAt?: number;
  /** Approved reports, newest last. Only approved work enters the persona. */
  approved?: number;
  log?: { at: string; title: string; project?: string; paper: string }[];
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
    spool: 0.3 + 0.35 * (H("watcher") + H("chiller")),
    sparkplug: 0.16 + 0.22 * H("chatter"),
  };
  const all = Object.keys(odds) as SocialApp[];
  let socials = all.map((a) => [a, r()] as const).filter(([a, x]) => x < odds[a]).sort((a, b) => a[1] - b[1]).map(([a]) => a);
  while (socials.length < 2) { const a = all[Math.floor(r() * all.length)]; if (!socials.includes(a)) socials.push(a); }
  socials = socials.slice(0, 5);
  const like: Record<FunApp, number> = {
    doodle: 1 + 1.5 * H("musician") + H("chiller"),
    crossword: 1 + H("chiller") + 0.5 * H("gamer"),
    solitaire: 1 + 1.5 * H("gamer"),
    stocks: 0.7 + 0.8 * H("watcher"),
    mail: 0.8 + H("chatter"),
    lingo: 1 + 0.6 * H("chatter") + 0.6 * H("watcher"),
    // games on Vapor for the gamers, charts and regret on the Botcoin Exchange for the watchers and the restless
    vapor: 0.35 + 2.4 * H("gamer") + 0.2 * H("watcher"),
    trading: 0.25 + 0.7 * H("watcher") + 0.5 * H("chiller") + 0.3 * H("musician"),
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
// Robots hired before Spool (web) and Sparkplug existed: the same odds decide, from their id.
function newSocials(have: SocialApp[], r: () => number, hobby: Hobby): SocialApp[] {
  const H = (k: Hobby) => (hobby === k ? 1 : 0);
  const out = [...have];
  if (!out.includes("spool") && r() < 0.3 + 0.35 * (H("watcher") + H("chiller"))) out.push("spool");
  if (!out.includes("sparkplug") && r() < 0.16 + 0.22 * H("chatter")) out.push("sparkplug");
  return out;
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
  private reservedPinned = new Set<string>();
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
      if (r.prefs?.socials && (r.prefs.socialsV ?? 1) < 2) { r.prefs.socials = newSocials(r.prefs.socials, seeded((r.id || r.name || "") + "socials2"), r.prefs.hobby); r.prefs.socialsV = 2; migrated = true; }
      if (r.prefs && !r.prefs.launch) {
        const x = idHash((r.id || r.name || "") + "habits");
        r.prefs.launch = x < 0.35 ? "spotlight" : "dock";
        r.prefs.switching = ((x * 7) % 1) < 0.45 ? "click" : ((x * 7) % 1) < 0.75 ? "dock" : "alttab";
        r.prefs.tidiness = ((x * 13) % 1) < 0.3 ? "tidy" : ((x * 13) % 1) < 0.7 ? "normal" : "messy";
      }
      if (r.prefs && !r.prefs.listens) { const x = idHash((r.id || r.name || "") + "music"); r.prefs.listens = x < 0.35 ? "always" : x < 0.7 ? "sometimes" : "never"; r.look.headphones = false; }
      // the game store was saved as "steam" before it became Vapor
      if (r.prefs?.apps?.includes("steam" as FunApp)) { r.prefs.apps = r.prefs.apps.map((a) => (a === ("steam" as FunApp) ? "vapor" : a)); migrated = true; }
      // robots hired before Vapor and the Botcoin Exchange: each gets (or does not get) them from its id, the same every launch
      if (r.prefs?.apps && !r.prefs.leisure2) {
        const rr = seeded((r.id || r.name || "") + "leisure2"), hb = r.prefs.hobby;
        if (!r.prefs.apps.includes("vapor") && rr() < 0.14 + (hb === "gamer" ? 0.5 : 0)) r.prefs.apps.push("vapor");
        if (!r.prefs.apps.includes("trading") && rr() < 0.1 + (hb === "watcher" ? 0.25 : hb === "chiller" ? 0.2 : 0)) r.prefs.apps.push("trading");
        r.prefs.leisure2 = true; migrated = true;
      }
      // retired habits: one code editor, one notes app, and the screen rule picks chat or T3 Code
      if (r.prefs) for (const k of ["editor", "notesApp", "chatApp", "t3"]) if (k in r.prefs) { delete (r.prefs as any)[k]; migrated = true; }
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
  /** The worker who did a thread's job, also after it moved on to other work or retired. */
  forJob(threadId: string) { return this.byThread(threadId) ?? this.robots.find((r) => r.done?.includes(threadId)) ?? null; }

  // Give every working thread a robot. Robots whose thread is settled or gone are free.
  // A free worker with the same harness and model takes the job; otherwise a new one is hired.
  assign(working: { id: string; provider: string; model?: string | null }[], settledIds: Set<string>, knownIds: Set<string>, pinned = new Set<string>()) {
    this.reservedPinned = pinned;
    const working_ = new Set(working.map((t) => t.id));
    for (const r of this.robots) {
      if (r.threadId && !working_.has(r.threadId) && !settledIds.has(r.threadId) && !knownIds.has(r.threadId)) r.threadId = null;
    }
    for (const t of working) {
      const assigned = this.byThread(t.id);
      if (assigned) { if (t.model) assigned.lastModel = t.model; continue; }
      const isFree = (r: RobotProfile) => !r.retired && (!r.threadId || (settledIds.has(r.threadId) && !pinned.has(r.threadId)));
      const free = compatibleWorkers(this.robots.filter(isFree), t.provider, t.model)[0];
      if (free) { if (free.threadId) (free.done ??= []).push(free.threadId); free.threadId = t.id; free.provider = t.provider; free.jobs++; }
      else this.robots.push(this.hire(t.id, t.provider));
      if (t.model) this.byThread(t.id)!.lastModel = t.model;
    }
    this.save();
  }

  // Settled threads keep their robot only if nobody reassigned it (it is chilling in the break room).
  restingFor(settled: { id: string; provider: string }[]) {
    const out: { thread: string; robot: RobotProfile }[] = [];
    for (const t of settled) {
      const r = this.byThread(t.id);
      if (r?.retired) continue;   // retired workers are on the staff wall, not in the break room
      if (r) out.push({ thread: t.id, robot: r });
      else if (!this.robots.some((x) => x.done?.includes(t.id))) out.push({ thread: t.id, robot: this.hireFor(t.id, t.provider) });
    }
    return out;
  }

  // The hiring screen picked someone for a new thread: a free teammate, or a fresh hire.
  assignRobot(threadId: string, robotId: string | null, provider: string, role: string | null = null, model?: string, resuming = false) {
    const assigned = this.byThread(threadId);
    if (assigned && (!robotId || assigned.id === robotId)) { assigned.provider = provider; assigned.brand = brandFor(provider); if (role !== null) assigned.role = role || null; if (model) assigned.lastModel = model; this.save(); return; }
    // A world refresh can discover the launch before its hiring callback returns.
    // Undo that automatic assignment so the explicitly chosen teammate gets the job.
    if (assigned) {
      if (resuming) { if (!assigned.done?.includes(threadId)) (assigned.done ??= []).push(threadId); assigned.threadId = null; }
      else { assigned.threadId = assigned.done?.pop() ?? null; assigned.jobs = Math.max(0, assigned.jobs - 1); }
    }
    let r = robotId ? this.robots.find((x) => x.id === robotId) ?? null : null;
    if (r) {
      if (r.threadId && r.threadId !== threadId) (r.done ??= []).push(r.threadId);
      const returning = resuming && r.done?.includes(threadId);
      if (returning) r.done = r.done?.filter(id => id !== threadId);
      r.threadId = threadId; r.provider = provider; r.brand = brandFor(provider); if (!returning) r.jobs++;
    } else { r = this.hire(threadId, provider); this.robots.push(r); }
    if (role !== null) r.role = role || null;
    if (model) r.lastModel = model;
    this.save();
  }

  /** An approved report joins its worker's record and persona. Each paper counts once. */
  recordApproval(robotId: string, entry: { paper: string; title: string; project?: string; at?: string }) {
    const r = this.robots.find((x) => x.id === robotId);
    if (!r || r.log?.some((e) => e.paper === entry.paper)) return false;
    (r.log ??= []).push({ at: entry.at ?? new Date().toISOString(), title: String(entry.title).slice(0, 120), project: entry.project?.slice(0, 60), paper: entry.paper });
    if (r.log.length > 40) r.log.splice(0, r.log.length - 40);
    r.approved = (r.approved ?? 0) + 1;
    this.save();
    return true;
  }

  /** Free workers only: change harness and model. Name, look, persona and history stay. */
  retrain(robotId: string, provider: string, model: string, settledIds: Set<string>) {
    const r = this.freeTeam(settledIds).find((x) => x.id === robotId);
    if (!r) throw Error("Only a free worker can be retrained. Wait until its job is collected.");
    r.provider = provider; r.brand = brandFor(provider); r.lastModel = model;
    this.save();
    return r;
  }

  /** Free workers only: leave the floor for the staff wall, with everything kept. */
  retire(robotId: string, settledIds: Set<string>) {
    const r = this.freeTeam(settledIds).find((x) => x.id === robotId);
    if (!r) throw Error("Only a free worker can retire. Wait until its job is collected.");
    r.retired = true; r.retiredAt = Date.now();
    this.save();
    return r;
  }

  /** Back from the staff wall to the floor. */
  rehire(robotId: string) {
    const r = this.robots.find((x) => x.id === robotId);
    if (!r?.retired) return null;
    r.retired = false; r.retiredAt = undefined;
    this.save();
    return r;
  }

  freeTeam(settledIds: Set<string>) {
    return this.robots.filter((r) => !r.retired && (!r.threadId || (settledIds.has(r.threadId) && !this.reservedPinned.has(r.threadId))));
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
        socialsV: 2,
      },
      hiredAt: Date.now(),
      threadId,
      jobs: 1,
    };
  }
}
