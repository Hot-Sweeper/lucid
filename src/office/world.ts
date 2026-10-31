import gsap from "gsap";
import { Desk, UNIT_W, UNIT_H, type DeskServices } from "./desk";
import { drawFloor, drawWall, drawDecor, placeDecor, DECOR } from "../decor/decor";
import type { RoomTheme } from "./decorate";
import { Park } from "./park";
import { Walker } from "../world/walker";
import { makeInteractive, whenFree } from "./interact";
import { GEOM } from "./rig";
import { SHOP_W, SHOP_H, type ShopFront } from "./shopfront";
import { mountWeather, applySkyTint, type WeatherLayer, type Weather } from "../weather/effects";
import { outdoorLook, seasonPalette } from "../weather/season";
import { outsideSvg, PARK_W } from "./outside";
import { ambientPlant } from "./ambient";
import { Roster, type RobotProfile } from "./roster";

// The whole building, seen fake top-down: rooms laid out on a floor plan, one shared camera.
// Offices hold desks (one per thread). Desks live in one layer above the rooms, so a robot
// keeps its computer and state when it moves to another room.

export type WThread = {
  id: string; projectId: string; title: string; updatedAt: string; provider: string;
  runStatus: string | null; pinned: boolean; settled: boolean; question: string | null; model: string | null;
  schedule?: { nextRunAt: string | null; everyMs: number | null } | null;
  folder?: string | null;
  branch?: string | null; lastStatus?: string | null; runStartedAt?: string | null; unseen?: boolean;
};
export type WProject = { id: string; title: string; root: string; icon: string | null; scratch: boolean };
export type WorldData = { projects: WProject[]; threads: WThread[]; models?: Record<string, string[]>; prices?: Record<string, { input: number; output: number }>; shipped?: { total: number; today: number } };

export type RoomKind = "main" | "project" | "freelance" | "break" | "queue";
export type Room = { id: string; kind: RoomKind; title: string; icon: string | null; x: number; y: number; w: number; h: number; el: HTMLElement; threadIds: string[] };

export interface RoomExtension {
  el: HTMLElement;
  setThreads(list: { id: string; provider: string; title: string; question?: string | null }[]): void;
  onSelect: (id: string) => void;
  destroy(): void;
}

const WALL_FACE = 110;   // north wall face height
const COLS = 3;
const SLOT_W = UNIT_W + 20, SLOT_H = UNIT_H + 20;
const GAP = 40, HALL = 150;

const LOUNGE = 230;      // extra floor below the desks for a rug, beanbags or a ping pong table
function officeSize(slots: number, lounge = 0) {
  const cols = Math.min(COLS, Math.max(1, slots)), rows = Math.ceil(Math.max(1, slots) / COLS);
  return { w: 70 + cols * SLOT_W + 50, h: WALL_FACE + 40 + rows * SLOT_H + 30 + lounge, cols };
}
// Decorations the company has unlocked, out of what the room asks for.
// Things in a room only show once they are unlocked and bought.
let ownsItem: (key: string) => boolean = () => true;
const usable = (t: RoomTheme | undefined, level: number) => (t?.decor ?? []).filter((d) => DECOR[d] && DECOR[d].unlockAt <= level && ownsItem(`decor:${d}`));
const needsLounge = (t: RoomTheme | undefined, level: number) => usable(t, level).some((d) => DECOR[d].spot === "floor");

export class World {
  scene: HTMLElement;
  root: HTMLElement;
  rooms: Room[] = [];
  desks = new Map<string, Desk>();
  themes = new Map<string, RoomTheme>();
  set owns(f: (key: string) => boolean) { ownsItem = f; }
  park: Park;

  // --- robots walking between rooms --------------------------------------------------------
  // When a robot changes rooms it gets up and walks: out of its room's door, along the hall,
  // in through the other door. Until it arrives it is not shown at the destination.
  private topH = 0;
  private roomOf = new Map<string, string>();          // thread -> room id at the last update ("park" too)
  private transit = new Map<string, Walker>();
  private extLists: { brk: any[]; queue: any[]; park: any[] } = { brk: [], queue: [], park: [] };
  private get hallY() { return this.topH + HALL / 2; }
  private roomById(id: string) { return this.rooms.find((r) => r.id === id) ?? null; }
  // the door on the hall side of a room: [just outside in the hall, just inside the room]
  private door(r: Room): [{ x: number; y: number }, { x: number; y: number }] {
    if (r.y + r.h <= this.topH + 1) {   // top row: door in the south wall
      const x = r.x + r.w / 2;
      return [{ x, y: r.y + r.h + 34 }, { x, y: r.y + r.h - 40 }];
    }
    const x = r.x + r.w - 46;           // bottom row: door in the north wall, right corner
    return [{ x, y: r.y - 34 }, { x, y: r.y + WALL_FACE + 16 }];
  }
  // from a spot inside a room to the hall (walking around the desks, along the edges)
  private exitPath(r: Room, from: { x: number; y: number }) {
    const [out, inn] = this.door(r);
    const top = r.y + r.h <= this.topH + 1;
    const pts = top
      ? [{ x: from.x, y: r.y + r.h - 40 }, inn, out]
      : [{ x: from.x, y: r.y + r.h - 34 }, { x: inn.x, y: r.y + r.h - 34 }, inn, out];
    return [...pts, { x: out.x, y: this.hallY }];
  }
  private enterPath(r: Room, to: { x: number; y: number }) { return this.exitPath(r, to).reverse().slice(1).concat([to]); }
  private chairOf(d: Desk) { return { x: parseFloat(d.el.style.left) + GEOM.chair.x, y: parseFloat(d.el.style.top) + GEOM.chair.y + 50 }; }
  private entrance() { return { x: this.size.w - 6, y: this.hallY }; }

  private walk(t: { id: string; provider: string; model?: string | null }, from: string, fromPt: { x: number; y: number } | null, to: string, delay: number) {
    const prev = this.transit.get(t.id);
    const start = prev ? { x: prev.x, y: prev.y } : null;
    prev?.destroy();
    const profile = this.roster.byThread(t.id);
    const w = new Walker(this.deskLayer, { id: t.id, provider: t.provider, name: profile?.name, model: t.model ?? undefined, scale: 0.42, look: profile?.look });
    w.el.classList.add("hall-walker");
    makeInteractive(w, { bounds: () => ({ x: 0, y: 0, w: this.size.w, h: this.size.h }), onOpen: () => this.onSelectThread(t.id) });
    this.transit.set(t.id, w);
    const fromRoom = this.roomById(from);
    // where it sets off: its old chair, its old room's door (break room, questions), or the park
    const path: { x: number; y: number }[] = [];
    if (start) path.push({ x: start.x, y: this.hallY });
    else if (fromRoom && fromPt) path.push(...this.exitPath(fromRoom, fromPt));
    else if (fromRoom) path.push(...this.door(fromRoom).slice(0, 1), { x: this.door(fromRoom)[0].x, y: this.hallY });
    else path.push(this.entrance());
    const first = start ?? (fromPt ?? path[0]);
    w.setPos(first.x, first.y);
    w.el.style.opacity = "0";
    const arrive = async () => {
      const toRoom = this.roomById(to);
      const desk = this.desks.get(t.id);
      if (desk && toRoom) path.push({ x: this.door(toRoom)[0].x, y: this.hallY }, ...this.enterPath(toRoom, this.chairOf(desk)));
      else if (toRoom) path.push({ x: this.door(toRoom)[0].x, y: this.hallY }, this.door(toRoom)[0]);
      else path.push(this.entrance());
      await w.walkPath(path);
      // picked up and dropped somewhere on the way: back to the hall, then on to where it was going
      const end = path[path.length - 1];
      for (let tries = 0; tries < 4 && this.transit.get(t.id) === w && Math.hypot(w.x - end.x, w.y - end.y) > 8; tries++) {
        await whenFree(w);
        const rest = path.slice(path.findIndex((p) => Math.abs(p.y - this.hallY) < 2 && Math.abs(p.x - end.x) < 400) >= 0 ? path.findIndex((p) => Math.abs(p.y - this.hallY) < 2 && Math.abs(p.x - end.x) < 400) : path.length - 1);
        await w.walkPath([{ x: w.x, y: this.hallY }, ...rest]);
      }
    };
    window.setTimeout(async () => {
      if (this.transit.get(t.id) !== w) return;
      gsap.to(w.el, { opacity: 1, duration: 0.25 });
      try { await arrive(); } catch { /* replaced */ }
      if (this.transit.get(t.id) !== w) return;
      this.transit.delete(t.id);
      w.destroy();
      // it has arrived: sit down at the desk, or join the room
      const desk = this.desks.get(t.id);
      if (desk) { desk.el.classList.remove("arriving"); gsap.fromTo(desk.el.querySelector(".robot-host"), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(1.6)" }); }
      this.pushExt();
    }, delay);
  }

  // break room, question line and park only show robots that are actually there
  private pushExt() {
    const here = (l: any[]) => l.filter((x) => !this.transit.has(x.id));
    this.ext.break?.setThreads(here(this.extLists.brk) as any);
    this.ext.queue?.setThreads(here(this.extLists.queue) as any);
    this.park.setThreads(here(this.extLists.park));
  }
  // the shop building between the office and the park
  private shopFront: ShopFront | null = null;
  shopRect: { x: number; y: number; w: number; h: number } | null = null;
  attachShop(sf: ShopFront) {
    this.shopFront = sf;
    const worldEl = this.root;
    worldEl.insertBefore(sf.el, worldEl.querySelector(".building-plate"));
    if (this.shopRect) sf.place(this.shopRect.x, this.shopRect.y);
  }
  // today's office event from the orchestrator, on the building's name sign
  eventName = "";
  paintEvent() {
    const b = this.root.querySelector(".building-plate b") as HTMLElement | null;
    if (!b) return;
    b.textContent = this.eventName ? `${this.building}  ·  Today: ${this.eventName}` : this.building;
  }
  showShop() { const r = this.shopRect; if (r) { this.unfocus(false); this.flyTo({ x: r.x - 60, y: r.y - 80, w: r.w + 120, h: r.h + 140 }, 20); } }
  // real weather and the season shape the outdoors and the light
  weather: Weather | null = null;
  private fx: WeatherLayer | null = null;
  private outArgs: Parameters<typeof outsideSvg>[0] | null = null;
  private lookSig = "";
  private outUrl = "";
  setWeather(w: Weather | null) {
    const was = this.weather?.kind;
    this.weather = w;
    if (was !== w?.kind && this.lastData) this.update(this.lastData);   // the park empties or fills
    this.redrawOutside();
    this.daylight();
  }
  private redrawOutside(force = false) {
    if (!this.outArgs) return;
    const look = outdoorLook(new Date(), this.weather);
    const sig = JSON.stringify(look);
    if (!force && sig === this.lookSig) return;
    this.lookSig = sig;
    // The outdoors is one big drawing with tens of thousands of shapes. As live page elements
    // they made every frame slow, so it is shown as a single image (its CSS animations still run).
    const layer = this.root.querySelector(".outside-layer") as HTMLElement;
    const svg = outsideSvg({ ...this.outArgs, ...look, layer: "still" }).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const css = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText).filter((t) => /\.outside|@keyframes|--lamp|--night/.test(t)); } catch { return []; } }).join("\n");
    const vars = getComputedStyle(this.root);
    const root = `svg{--lamp:${vars.getPropertyValue("--lamp") || 0};--night:${vars.getPropertyValue("--night") || 0};--wind:${vars.getPropertyValue("--wind") || 0.3}}`;
    // animating inside one huge image forces it to be redrawn every frame, so by default it
    // stays still; moving bits (water, lamps, wildlife) belong in small separate elements
    const animate = !!(window as any).__animOutside;
    const withCss = svg.replace(/(<svg[^>]*>)/, `$1<style>${root}\n${animate ? css : css.replace(/animation[^;}]*;?/g, "")}</style>`);
    if (this.outUrl) URL.revokeObjectURL(this.outUrl);
    this.outUrl = URL.createObjectURL(new Blob([withCss], { type: "image/svg+xml" }));
    layer.innerHTML = `<img class="outside-img" src="${this.outUrl}" alt="" draggable="false" style="display:block;width:100%;height:100%">` + outsideSvg({ ...this.outArgs, ...look, layer: "live" });
    this.scene.style.setProperty("--scene-ground", seasonPalette(look.season).ground);
  }
  level = 0;
  freeDesks: Desk[] = [];
  private roomLayer: HTMLElement;
  private deskLayer: HTMLElement;
  private cam = { x: 0, y: 0, s: 0.4 };
  private size = { w: 2000, h: 1600 };
  focusDesk: Desk | null = null;
  selected: Desk | null = null;
  onSelect: (d: Desk | null) => void = () => {};
  onSelectThread: (id: string) => void = () => {};
  onRooms: (rooms: Room[]) => void = () => {};
  ext: Partial<Record<"break" | "queue", RoomExtension>> = {};
  extFactory: Partial<Record<"break" | "queue", (host: HTMLElement, w: number, h: number) => RoomExtension>> = {};
  private lastKey = "";
  private placed = new Map<string, { room: string; pending?: { room: string; since: number } }>();
  private seats = new Map<string, (string | null)[]>();   // room id -> thread id per desk slot
  private slotDesks = new Map<string, Desk>();              // "room#index" -> desk standing there

  // A robot only changes rooms once the new state has lasted a while, so brief flickers
  // (a turn that shows as queued, a status refresh) never make desks jump around.
  private settleRoom(t: WThread, want: string) {
    const cur = this.placed.get(t.id);
    if (!cur) { this.placed.set(t.id, { room: want }); return want; }
    if (cur.room === want) { cur.pending = undefined; return want; }
    // questions and new work never wait: the robot heads over right away
    const urgent = want === "queue" || (t.runStatus === "running" && cur.room === "break");
    if (urgent) { this.placed.set(t.id, { room: want }); return want; }
    if (!cur.pending || cur.pending.room !== want) cur.pending = { room: want, since: Date.now() };
    if (Date.now() - cur.pending.since > 20000) { this.placed.set(t.id, { room: want }); return want; }
    return cur.room;
  }

  constructor(scene: HTMLElement, private services: DeskServices) {
    this.scene = scene;
    scene.innerHTML = `<div class="world"><div class="outside-layer"></div><div class="building-plate"><span class="bp-dot"></span><b></b></div><div class="hall"></div><div class="room-layer"></div><div class="night-shade"></div><div class="desk-layer"></div></div>`;
    // robots in the park walk on the grass above the outdoors, under the night tint
    const worldEl = scene.querySelector(".world") as HTMLElement;
    this.park = new Park(worldEl);
    worldEl.insertBefore(this.park.layer, worldEl.querySelector(".building-plate"));
    this.park.onSelect = (id) => this.onSelectThread(id);
    this.root = scene.querySelector(".world")!;
    this.roomLayer = scene.querySelector(".room-layer")!;
    this.deskLayer = scene.querySelector(".desk-layer")!;
    this.camera();
    this.daylight();
    setInterval(() => this.daylight(), 60000);
  }

  // --- layout -------------------------------------------------------------------
  update(data: WorldData) {
    this.lastData = data;
    const byProject = new Map(data.projects.map((p) => [p.id, p]));
    const queue: WThread[] = [], main: WThread[] = [], brk: WThread[] = [], rest: WThread[] = [];
    const perProject = new Map<string, WThread[]>();
    const freelance: WThread[] = [];
    for (const t of data.threads) {
      // A scheduled robot with a long wait until its next run spends it in the break room;
      // with a short wait it stays at its desk and kills time there.
      const wait = t.schedule?.nextRunAt ? Date.parse(t.schedule.nextRunAt) - Date.now() : null;
      const p = byProject.get(t.projectId);
      const home = this.homes.get(t.id) ?? (!p || p.scratch ? "freelance" : `p:${p.id}`);
      // A robot without work takes breaks: after 10 quiet minutes it spends about a third of
      // every half hour in the break room (each on its own rhythm), and comes back for work.
      const quietFor = Date.now() - Date.parse(t.updatedAt);
      const watched = this.focusDesk?.threadId === t.id || this.selected?.threadId === t.id;
      let rhythm = 0;
      for (const ch of t.id) rhythm = (rhythm * 31 + ch.charCodeAt(0)) % 997;
      const onBreak = !watched && !t.settled && !t.question && t.runStatus !== "running" && quietFor > 10 * 60 * 1000
        && (Math.floor(Date.now() / 60000) + rhythm) % 30 < 11;
      const want = t.question ? "queue"
        : onBreak ? "break"
        : this.homes.has(t.id) && !t.settled ? home
        : t.runStatus === "running" || t.pinned ? "main"
        : wait != null && wait > 15 * 60 * 1000 ? "break"
        : wait != null ? "main"
        : t.settled ? "break" : home;
      const room = this.settleRoom(t, want);
      if (room === "queue") queue.push(t);
      else if (room === "main") main.push(t);
      else if (room === "break") { if (!t.settled) brk.unshift(t); else brk.push(t); }   // visitors on a break get a spot first
      else if (room === "freelance") freelance.push(t);
      else {
        const pid = room.slice(2);
        if (!perProject.has(pid)) perProject.set(pid, []);
        perProject.get(pid)!.push(t);
      }
    }
    // Keep each robot in the seat it already has; newcomers take the first free seat.
    const seatOrder = (roomId: string, list: WThread[], max: number) => {
      const prev = this.seats.get(roomId) ?? [];
      // a robot hired at a specific desk sits exactly there
      const ps = this.pendingSeat;
      if (ps && ps.room === roomId && ps.threadId && list.some((t) => t.id === ps.threadId)) {
        while (prev.length <= ps.index) prev.push(null);
        const old = prev.indexOf(ps.threadId);
        if (old >= 0) prev[old] = null;
        prev[ps.index] = ps.threadId;
        this.pendingSeat = null;
      }
      const ids = new Set(list.map((t) => t.id));
      const seats: (string | null)[] = prev.map((id) => (id && ids.has(id) ? id : null));
      for (const t of list) {
        if (seats.includes(t.id)) continue;
        const free = seats.indexOf(null);
        if (free >= 0) seats[free] = t.id; else seats.push(t.id);
      }
      while (seats.length > max) { const i = seats.lastIndexOf(null); if (i >= 0) seats.splice(i, 1); else seats.pop(); }
      while (seats.length && seats[seats.length - 1] === null && seats.length > list.length) seats.pop();
      this.seats.set(roomId, seats);
      const byId = new Map(list.map((t) => [t.id, t]));
      return seats.map((id) => (id ? byId.get(id) ?? null : null));
    };
    type Plan = { id: string; kind: RoomKind; title: string; icon: string | null; threads: (WThread | null)[]; slots: number; w: number; h: number };
    const office = (id: string, kind: RoomKind, title: string, icon: string | null, threads: WThread[], min: number, max: number): Plan => {
      const extra = this.extra.get(id) ?? 0;
      const seated = seatOrder(id, threads.slice(0, max + extra), max + extra);
      const slots = Math.max(min + extra, Math.min(max + extra, seated.length));
      const { w, h } = officeSize(slots, needsLounge(this.themes.get(id), this.level) ? LOUNGE : 0);
      return { id, kind, title, icon, threads: seated as WThread[], slots, w, h };
    };
    const top: Plan[] = [
      { id: "queue", kind: "queue", title: "Questions for you", icon: null, threads: queue, slots: 0, w: 720, h: 800 },
      office("main", "main", "Main office", null, main, 3, 6),
      { id: "break", kind: "break", title: "Break room", icon: null, threads: brk.slice(0, 8), slots: 0, w: 1900, h: 800 },
    ];
    const bottom: Plan[] = [];
    for (const [pid, list] of perProject) {
      const p = byProject.get(pid)!;
      if (this.hidden.has(pid)) continue;
      bottom.push(office(`p:${pid}`, "project", p.title, p.icon, list, 2, 3));
    }
    if (!this.hidden.has("freelance")) bottom.push(office("freelance", "freelance", "Freelancers", null, freelance, 2, 3));

    // Floor plan: top row, a hallway, then project offices.
    const rooms: Room[] = [];
    let x = 0;
    const topH = Math.max(...top.map((r) => r.h));
    this.topH = topH;
    // Robots: working threads get one (reusing free teammates first), resting ones keep theirs.
    const working = [...queue, ...main, ...freelance, ...[...perProject.values()].flat()];
    this.roster.assign(working, new Set(brk.map((t) => t.id)), new Set(data.threads.map((t) => t.id)));
    const resting = this.roster.restingFor(brk.slice(0, 8));
    const restingIds = new Set(resting.map((r) => r.thread));
    const brkShown = brk.filter((t) => restingIds.has(t.id)).slice(0, 8);
    const idsOf = (r: Plan) => r.threads.filter((t): t is WThread => !!t).map((t) => t.id);
    for (const r of top) { rooms.push({ id: r.id, kind: r.kind, title: r.title, icon: r.icon, x, y: topH - r.h, w: r.w, h: r.h, el: null as any, threadIds: idsOf(r) }); x += r.w + GAP; }
    const topW = x - GAP;
    x = 0;
    const y2 = topH + HALL;
    for (const r of bottom) { rooms.push({ id: r.id, kind: r.kind, title: r.title, icon: r.icon, x, y: y2, w: r.w, h: r.h, el: null as any, threadIds: idsOf(r) }); x += r.w + GAP; }
    const bottomW = Math.max(0, x - GAP), bottomH = bottom.length ? Math.max(...bottom.map((r) => r.h)) : 0;
    this.size = { w: Math.max(topW, bottomW), h: y2 + bottomH };
    const plans = [...top, ...bottom];

    const key = rooms.map((r, i) => `${r.id}:${plans[i].slots}:${r.x}:${r.y}:${r.icon ? 1 : 0}:${r.title}:${JSON.stringify(this.themes.get(r.id) ?? null)}`).join("|") + `:L${this.level}:${[...this.themes.values()].map((t) => [...(t.decor ?? []), t.floor, t.wall].filter((k) => k).map((k) => (ownsItem(`decor:${k}`) || ownsItem(`floor:${k}`) || ownsItem(`wall:${k}`) ? 1 : 0)).join("")).join("")}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      for (const kind of ["break", "queue"] as const) { this.ext[kind]?.destroy(); delete this.ext[kind]; }
      this.roomLayer.innerHTML = "";
      rooms.forEach((r, i) => {
        const el = document.createElement("div");
        el.className = `room room-${r.kind}`;
        el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        const make = r.kind === "break" || r.kind === "queue" ? this.extFactory[r.kind] : undefined;
        if (make) {
          const ext = make(el, r.w, r.h);
          ext.onSelect = (id) => this.onSelectThread(id);
          this.ext[r.kind as "break" | "queue"] = ext;
        } else el.innerHTML = roomSvg(r, plans[i].slots, this.themes.get(r.id), this.level);
        this.roomLayer.appendChild(el);
        r.el = el;
      });
      const hall = this.root.querySelector(".hall") as HTMLElement;
      hall.style.cssText = `top:${topH}px;height:${HALL}px;width:${this.size.w}px`;
      // the outdoors: grass and trees around the building, a park beside the entrance
      // the shop sits just past the entrance, south of the path; the park lies beyond it
      const entY = topH + HALL / 2;
      this.shopRect = { x: this.size.w + 150, y: entY + 110, w: SHOP_W, h: SHOP_H };
      this.shopFront?.place(this.shopRect.x, this.shopRect.y);
      const park = { x: this.size.w + 150 + SHOP_W + 180, y: Math.max(-200, entY - 520), w: PARK_W, h: 1040 };
      const out = { ox: -2400, oy: -2200, w: park.x - this.size.w + PARK_W + this.size.w + 4800, h: Math.max(this.size.h, park.y + park.h) + 4400 };
      this.outdoor = { x: out.ox, y: out.oy, w: out.w, h: out.h, park };
      this.park.setGeometry(park, { x: this.size.w + 66, y: topH + HALL / 2 + 20 });
      const layer = this.root.querySelector(".outside-layer") as HTMLElement;
      layer.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
      this.outArgs = { ...out, building: { x: 0, y: 0, w: this.size.w, h: this.size.h }, entranceY: topH + HALL / 2, park,
        avoid: [{ x: this.shopRect.x - 20, y: this.shopRect.y - 60, w: SHOP_W + 40, h: SHOP_H + 80 }] };
      this.redrawOutside(true);
      const wr = { ...this.outdoor, entranceY: topH + HALL / 2 };
      if (this.fx) this.fx.resize(wr); else { this.fx = mountWeather(this.root, wr); this.apply(); }
      // the shop has a roof: keep it above the rain
      if (this.shopFront) this.root.insertBefore(this.shopFront.el, this.root.querySelector(".building-plate"));
      const shade = this.root.querySelector(".night-shade") as HTMLElement;
      shade.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px;right:auto;bottom:auto`;
      this.root.style.width = `${this.size.w}px`;
      this.root.style.height = `${this.size.h}px`;
      (this.root.querySelector(".building-plate b") as HTMLElement).textContent = this.building;
      this.paintEvent();
      // the room sign is the handle for office options
      for (const r of rooms) {
        if (r.kind !== "project" && r.kind !== "freelance" && r.kind !== "main") continue;
        const hit = document.createElement("button");
        hit.type = "button";
        hit.className = "room-sign-hit";
        hit.title = `${r.title} office options`;
        hit.setAttribute("aria-label", `${r.title} office options`);
        hit.addEventListener("click", (e) => { e.stopPropagation(); this.onRoomMenu(r, e.clientX, e.clientY); });
        r.el.appendChild(hit);
      }
      this.paintClock();
    } else rooms.forEach((r, i) => (r.el = this.rooms[i]?.el ?? r.el));
    this.rooms = rooms;

    // Desks: keep each thread's desk, slide it to its new slot, create or retire as needed.
    const slots: { key: string; x: number; y: number; t: WThread | null }[] = [];
    plans.forEach((p, i) => {
      if (!p.slots) return;
      const r = rooms[i];
      const { cols } = officeSize(p.slots);
      for (let k = 0; k < p.slots; k++) {
        const c = k % cols, row = Math.floor(k / cols);
        slots.push({ key: `${p.id}#${k}`, x: r.x + 70 + c * SLOT_W, y: r.y + WALL_FACE + 40 + row * SLOT_H, t: p.threads[k] ?? null });
      }
    });
    const wanted = new Set(slots.filter((s) => s.t).map((s) => s.t!.id));
    // where every robot is right now, so a robot changing rooms can walk over
    const chairsBefore = new Map<string, { x: number; y: number }>();
    for (const [id, d] of this.desks) chairsBefore.set(id, this.chairOf(d));
    const nowRoom = new Map<string, string>();
    for (const s of slots) if (s.t) nowRoom.set(s.t.id, s.key.split("#")[0]);
    brkShown.forEach((t) => nowRoom.set(t.id, "break"));
    queue.forEach((t) => nowRoom.set(t.id, "queue"));
    if (!["rain", "drizzle", "storm", "snow"].includes(this.weather?.kind ?? "")) brk.slice(8, 14).forEach((t) => { if (!nowRoom.has(t.id)) nowRoom.set(t.id, "park"); });
    const first = this.roomOf.size === 0;
    const moving: { t: WThread; from: string; to: string }[] = [];
    for (const t of data.threads) {
      const from = this.roomOf.get(t.id), to = nowRoom.get(t.id);
      if (!first && from && to && from !== to) moving.push({ t, from, to });
    }
    this.roomOf = nowRoom;
    this.addTiles(plans, rooms);
    for (const [id, d] of this.desks) if (!wanted.has(id)) { if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); this.allDesks.delete(d); this.desks.delete(id); for (const [k, v] of this.slotDesks) if (v === d) this.slotDesks.delete(k); }
    const slotKeys = new Set(slots.map((s) => s.key));
    for (const k of [...this.slotDesks.keys()]) if (!slotKeys.has(k)) this.slotDesks.delete(k);
    this.freeDesks = [];
    for (const s of slots) {
      let d: Desk | undefined;
      const here = this.slotDesks.get(s.key);
      if (s.t) {
        d = this.desks.get(s.t.id);
        if (!d) {
          // a newcomer takes the empty desk already standing in its seat
          d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
          d.assign({ id: s.t.id, title: s.t.title, provider: s.t.provider, model: s.t.model }, this.roster.byThread(s.t.id));
          d.folder = s.t.folder ?? null;
          this.desks.set(s.t.id, d);
        }
        // which room it sits in now, and in shared rooms which project it works on
        d.room = s.key.split("#")[0];
        const proj = byProject.get(s.t.projectId);
        d.setProject(d.room === "main" || d.room === "queue" ? (proj && !proj.scratch ? { title: proj.title, icon: proj.icon } : { title: "No project", icon: null }) : null);
      } else {
        d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
        if (d.threadId) d.assign(null);
        this.freeDesks.push(d);
      }
      this.slotDesks.set(s.key, d);
      if (d.threadId) d.el.classList.toggle("orch-desk", d.threadId === this.orchThread);
      const cur = { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) };
      if (Math.abs(cur.x - s.x) > 1 || Math.abs(cur.y - s.y) > 1) {
        d.el.style.left = `${s.x}px`; d.el.style.top = `${s.y}px`; d.baseZ = Math.round(s.y); d.lift("move", false);
      }
    }
    // desks whose seat disappeared are retired properly (their robot and computer stop)
    const inUse = new Set(this.slotDesks.values());
    for (const d of this.allDesks) if (!inUse.has(d)) { this.allDesks.delete(d); if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); }
    for (const m of moving) {
      const desk = this.desks.get(m.t.id);
      if (desk) desk.el.classList.add("arriving");
      // leaving a desk: get up at once; leaving the break room, questions or park: walk out of
      // that room by itself first, then come down the hall
      const fromDesk = chairsBefore.get(m.t.id) ?? null;
      const delay = fromDesk ? 0 : m.from === "park" ? 7000 : 3200;
      this.walk(m.t, m.from, fromDesk, m.to, delay);
    }
    // robots that finished longer ago than the break room's latest eight go out to the park
    const info = (t: WThread) => ({ id: t.id, provider: t.provider, title: t.title, model: t.model, name: this.roster.byThread(t.id)?.name, look: this.roster.byThread(t.id)?.look });
    // in rain, storms or snow nobody stays in the park
    const wet = ["rain", "drizzle", "storm", "snow"].includes(this.weather?.kind ?? "");
    this.park.wet = wet;
    this.extLists = { brk: brkShown.map(info), queue: queue.map((t) => ({ ...info(t), question: t.question })), park: wet ? [] : brk.slice(8, 14).map(info) };
    this.pushExt();
    this.onRooms(rooms);
  }

  private allDesks = new Set<Desk>();
  roster = new Roster();
  // "+" tiles: add a desk to an office.
  private addTiles(plans: { id: string; kind: RoomKind; slots: number }[], rooms: Room[]) {
    this.deskLayer.querySelectorAll(".add-desk").forEach((e) => e.remove());
    plans.forEach((p, i) => {
      if (!p.slots || p.kind === "queue" || p.kind === "break") return;
      const r = rooms[i];
      const { cols } = officeSize(p.slots);
      const k = p.slots, c = k % cols, row = Math.floor(k / cols);
      if (row > 0 && c === 0 && (this.extra.get(p.id) ?? 0) >= 6) return;
      const fits = c !== 0; // only inside the room's current width
      const b = document.createElement("button");
      b.type = "button";
      b.className = "add-desk";
      b.title = "Add a desk";
      b.setAttribute("aria-label", `Add a desk to ${r.title}`);
      b.innerHTML = `<span aria-hidden="true">+</span><i>Add a desk</i>`;
      const x = fits ? r.x + 70 + c * SLOT_W + 110 : r.x + r.w - 210;
      const y = fits ? r.y + WALL_FACE + 40 + row * SLOT_H + 120 : r.y + 26;
      b.classList.toggle("compact", !fits);
      b.style.cssText = `left:${x}px;top:${y}px`;
      b.addEventListener("click", (e) => { e.stopPropagation(); this.onAddDesk(p.id); });
      this.deskLayer.appendChild(b);
    });
  }

  // Desks outside the view are not painted at all; their robots keep working, nobody sees it.
  private cull = new IntersectionObserver((es) => { for (const e of es) (e.target as HTMLElement).classList.toggle("culled", !e.isIntersecting); }, { rootMargin: "120px" });

  private makeDesk(x: number, y: number) {
    const d = new Desk(this.deskLayer, x, y, this.services);
    this.cull.observe(d.el);
    d.director.attachDir = this.attachDir;
    d.director.childItems = (id, since) => (window as any).lucid.itemsSince(id, since);
    this.allDesks.add(d);
    d.el.addEventListener("click", (e) => {
      if (this.dragged) return;
      e.stopPropagation();
      if (d.threadId) { this.select(d); this.focusOn(d); }
      else this.onFreeDesk(d, [...this.slotDesks.entries()].find(([, v]) => v === d)?.[0] ?? "", e.clientX, e.clientY);
    });
    d.el.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!d.threadId) { this.onFreeDeskMenu(d, [...this.slotDesks.entries()].find(([, v]) => v === d)?.[0] ?? "", e.clientX, e.clientY); return; }
      this.select(d); this.onDeskMenu(d, e.clientX, e.clientY);
    });
    d.monitor.addEventListener("click", (e) => {
      if (this.dragged || !d.threadId) return;
      e.stopPropagation();
      this.select(d);
      // first click brings the desk close, a click on the monitor then fills the view with the screen
      if (this.focusDesk === d && this.focusMode === "desk") this.focusScreen(d); else this.focusOn(d);
    });
    return d;
  }

  select(d: Desk | null) {
    this.selected?.el.classList.remove("selected");
    this.selected = d;
    d?.el.classList.add("selected");
    this.onSelect(d);
  }

  deskFor(threadId: string) { return this.desks.get(threadId) ?? null; }

  // --- following a walking robot with the camera -----------------------------------
  // Click a robot that is walking around (break room, park, hallway, shop) and the camera
  // stays on it as it goes about its business. Panning, zooming or Esc lets go.
  private followEl: HTMLElement | null = null;
  private followChip: HTMLElement | null = null;
  private followTick = () => {
    const el = this.followEl;
    if (!el || !el.isConnected) {
      // it walked out of view into another room: pick it up again if it is somewhere else
      const id = el?.dataset.id;
      const again = id ? (this.root.querySelector(`.world-walker[data-id="${CSS.escape(id)}"]`) as HTMLElement | null) : null;
      if (again) { this.followEl = again; return; }
      const desk = id ? this.desks.get(id) : null;
      this.stopFollow();
      if (desk && !desk.el.classList.contains("arriving")) this.showDesk(desk);
      return;
    }
    const r = el.getBoundingClientRect(), s = this.scene.getBoundingClientRect();
    const cx = r.left + r.width / 2 - s.left, cy = r.top + r.height / 2 - s.top;
    const W = this.scene.clientWidth - this.panelWidth * 0, H = this.scene.clientHeight;
    const target = Math.max(0.9, Math.min(1.6, this.cam.s));
    if (Math.abs(this.cam.s - target) > 0.01) {
      const k = this.cam.s + (target - this.cam.s) * 0.08;
      this.cam.x = cx - ((cx - this.cam.x) / this.cam.s) * k; this.cam.y = cy - ((cy - this.cam.y) / this.cam.s) * k; this.cam.s = k;
    }
    this.cam.x += (W / 2 - cx) * 0.1;
    this.cam.y += (H * 0.55 - cy) * 0.1;
    this.apply();
    this.paintFollowChip();
  };
  follow(el: HTMLElement) {
    if (this.focusDesk) this.unfocus(false);
    this.select(null);
    gsap.killTweensOf(this.cam);
    this.followEl = el;
    gsap.ticker.remove(this.followTick);
    gsap.ticker.add(this.followTick);
    if (!this.followChip) {
      const c = document.createElement("div");
      c.className = "follow-chip";
      c.innerHTML = `<span class="fc-dot"></span><span class="fc-text"><b></b><i></i></span><button type="button" class="fc-chat">Chat</button><button type="button" class="fc-stop" aria-label="Stop following">Stop</button>`;
      c.querySelector(".fc-stop")!.addEventListener("click", () => this.stopFollow());
      c.querySelector(".fc-chat")!.addEventListener("click", () => { const id = this.followEl?.dataset.id; if (id) this.onFollowChat(id); });
      this.scene.parentElement!.appendChild(c);
      this.followChip = c;
    }
    this.followChip.hidden = false;
    this.paintFollowChip(true);
  }
  /** "Chat" on the follow chip: open the conversation of the robot being followed. */
  onFollowChat: (threadId: string) => void = () => {};
  stopFollow() {
    gsap.ticker.remove(this.followTick);
    this.followEl = null;
    if (this.followChip) this.followChip.hidden = true;
  }
  private chipSig = "";
  private paintFollowChip(force = false) {
    const c = this.followChip, el = this.followEl;
    if (!c || !el) return;
    const id = el.dataset.id || "";
    const robot = this.roster.byThread(id);
    const thread = this.lastData?.threads.find((t) => t.id === id);
    const where = el.closest(".room-break") ? "In the break room" : el.closest(".room-queue") ? "Waiting with a question" : el.closest(".park-layer") ? "In the park" : el.closest(".shopfront") ? "Running the shop" : "Walking";
    const bubble = (el.parentElement?.querySelector(`.world-say[data-for="${CSS.escape(id)}"]`) as HTMLElement | null)?.textContent || "";
    const name = id === "shopkeeper" ? "Shopkeeper" : robot?.name ?? "Robot";
    const sub = [where, thread?.title].filter(Boolean).join(" · ");
    const sig = name + sub + bubble;
    if (!force && sig === this.chipSig) return;
    this.chipSig = sig;
    c.querySelector("b")!.textContent = name;
    c.querySelector("i")!.textContent = sub;
    (c.querySelector(".fc-chat") as HTMLElement).hidden = !thread;
  }

  // --- camera -------------------------------------------------------------------
  private dragged = false;
  private camera() {
    const s = this.scene;
    s.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.stopFollow();
      const r = s.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const ns = Math.min(5, Math.max(0.08, this.cam.s * Math.exp(-e.deltaY * 0.0015)));
      const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s;
      gsap.killTweensOf(this.cam);
      this.cam.s = ns; this.cam.x = px - wx * ns; this.cam.y = py - wy * ns;
      this.apply();
      this.keepFocus();
    }, { passive: false });
    let start: { x: number; y: number; cx: number; cy: number } | null = null;
    s.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      start = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y };
      this.dragged = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.dragged && Math.hypot(dx, dy) < 5) return;
      if (!this.dragged) { this.dragged = true; s.classList.add("panning"); this.stopFollow(); }
      gsap.killTweensOf(this.cam);
      this.cam.x = start.cx + dx; this.cam.y = start.cy + dy;
      this.apply();
      this.keepFocus();
    });
    window.addEventListener("pointerup", () => { start = null; s.classList.remove("panning"); setTimeout(() => (this.dragged = false), 0); });
    s.addEventListener("click", (e) => {
      if (this.dragged || (e.target as HTMLElement).closest(".desk-unit")) return;
      // little things to click on in the world (fountain, pond)
      const r = this.root.getBoundingClientRect(), z = r.width / (this.root.offsetWidth || 1);
      if (this.park.hit((e.clientX - r.left) / z, (e.clientY - r.top) / z)) return;
      this.select(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.followEl) { e.preventDefault(); this.stopFollow(); return; }
      if (e.key === "Escape" && this.focusDesk) { e.preventDefault(); this.unfocus(); }
    });
    // clicking any walking robot (also one that was just thrown) makes the camera follow it
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".world-walker") as HTMLElement | null;
      if (el && !this.dragged) this.follow(el);
    }, true);
    new ResizeObserver(() => { this.sceneBox = null; this.apply(); }).observe(s);
  }

  private sceneBox: DOMRect | null = null;
  private far = false;
  private apply() {
    this.root.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    // the weather follows the camera without measuring the page (which is slow every frame)
    if (this.fx) { this.sceneBox ??= this.scene.getBoundingClientRect(); this.fx.setCamera(this.cam, this.sceneBox, this.size.w); }
    // zoomed far out the screens are too small to read: show their glow instead of drawing them
    const far = this.cam.s < 0.3;
    if (far !== this.far) { this.far = far; this.scene.classList.toggle("far", far); }
  }

  flyTo(rect: { x: number; y: number; w: number; h: number }, pad = 40, d = 1, insetRight = 0) {
    const W = this.scene.clientWidth - insetRight, H = this.scene.clientHeight;
    if (!W || !H) return;
    const s = Math.min((W - pad * 2) / rect.w, (H - pad * 2) / rect.h, 6);
    gsap.to(this.cam, { s, x: W / 2 - (rect.x + rect.w / 2) * s, y: H / 2 - (rect.y + rect.h / 2) * s, duration: d, ease: "power3.inOut", onUpdate: () => this.apply() });
  }
  onFocus: (d: Desk | null) => void = () => {};
  panelWidth = 0;
  hidden = new Set<string>();          // project ids whose office is hidden in Lucid
  extra = new Map<string, number>();   // room id -> desks added by hand
  homes = new Map<string, string>();   // thread id -> room it was hired into (it works there)
  pendingSeat: { room: string; index: number; threadId?: string } | null = null;
  onFreeDesk: (desk: Desk, room: string, x: number, y: number) => void = () => {};
  onAddDesk: (room: string) => void = () => {};
  onFreeDeskMenu: (desk: Desk, room: string, x: number, y: number) => void = () => {};
  lastData: WorldData | null = null;
  focusMode: "desk" | "screen" = "desk";
  onRoomMenu: (room: Room, x: number, y: number) => void = () => {};
  onDeskMenu: (desk: Desk, x: number, y: number) => void = () => {};
  building = "This PC";
  outdoor: { x: number; y: number; w: number; h: number; park: { x: number; y: number; w: number; h: number } } | null = null;
  orchThread = "";
  attachDir = "";

  overview() {
    this.unfocus(false);
    const p = this.outdoor?.park;
    const right = p ? p.x + p.w : this.size.w;
    this.flyTo({ x: -120, y: -170, w: right + 240, h: Math.max(this.size.h, p ? p.y + p.h : 0) + 290 }, 20);
  }
  showPark() { const p = this.outdoor?.park; if (p) { this.unfocus(false); this.flyTo({ x: p.x - 40, y: p.y - 40, w: p.w + 80, h: p.h + 80 }, 20); } }
  showRoom(id: string, insetRight = 0) {
    this.stopFollow();
    const r = this.rooms.find((q) => q.id === id);
    if (r) { this.unfocus(false); this.flyTo({ x: r.x, y: r.y, w: r.w, h: r.h }, 30, 1, insetRight); }
  }
  showDesk(d: Desk) {
    this.stopFollow();
    this.unfocus(false);
    this.flyTo({ x: parseFloat(d.el.style.left) - 20, y: parseFloat(d.el.style.top) - 40, w: UNIT_W + 40, h: UNIT_H + 60 }, 30);
  }

  // Bring a whole desk close (robot, desk and screen), with the chat beside it.
  // The chat stays open while you zoom and pan around a robot. It only closes once you zoom
  // well out (to about a third of the close-up) or move the robot's desk out of view.
  private keepFocus() {
    const d = this.focusDesk;
    if (!d) return;
    const r = d.el.getBoundingClientRect(), s = this.scene.getBoundingClientRect();
    const visW = Math.max(0, Math.min(r.right, s.right - this.panelWidth) - Math.max(r.left, s.left));
    const visH = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
    const shown = (visW * visH) / Math.max(1, r.width * r.height);
    const deskShare = r.width / Math.max(1, s.width - this.panelWidth);   // how much of the view the desk fills
    if (shown < 0.25 || deskShare < 0.12) this.unfocus(false);
  }

  focusOn(d: Desk) {
    this.stopFollow();
    this.focusDesk = d;
    this.focusMode = "desk";
    this.flyTo({ x: parseFloat(d.el.style.left) - 10, y: parseFloat(d.el.style.top) - 6, w: UNIT_W + 20, h: UNIT_H + 12 }, 18, 0.85, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  // Fill the view with the robot's screen.
  focusScreen(d: Desk) {
    this.focusDesk = d;
    this.focusMode = "screen";
    const m = GEOM.screen;
    this.flyTo({ x: parseFloat(d.el.style.left) + m.x, y: parseFloat(d.el.style.top) + m.y, w: m.w, h: m.h }, 22, 0.9, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  unfocus(fly = true) {
    const d = this.focusDesk;
    if (!d) return;
    this.focusDesk = null;
    this.scene.classList.remove("screen-mode");
    this.onFocus(null);
    if (fly) this.showDesk(d);
  }

  // --- daylight and the wall clock --------------------------------------------------
  daylight() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const S = (sky1: string, sky2: string, stars: number, lamp: number, night: number, city: number) => ({ sky1, sky2, stars, lamp, night, city });
    const v = h < 5 || h >= 21.5 ? S("#0b1030", "#262c62", 1, 1, 0.3, 1)
      : h < 6.5 ? S("#2c3466", "#f2a08a", 0.4, 0.8, 0.18, 0.6)
      : h < 8 ? S("#86b7e8", "#ffd2a8", 0, 0.4, 0.05, 0.2)
      : h < 17 ? S("#6fb2ee", "#d4ecfb", 0, 0.1, 0, 0)
      : h < 19 ? S("#7a7fd0", "#ffbc85", 0, 0.5, 0.05, 0.3)
      : S("#2a2f6a", "#e0708a", 0.5, 0.95, 0.2, 0.9);
    // rain greys the sky and dims the light, storms more so
    const t = applySkyTint(v, this.weather);
    const night = Math.min(1, v.night + t.dim);
    const st = this.root.style;
    st.setProperty("--sky1", t.sky1); st.setProperty("--sky2", t.sky2);
    st.setProperty("--stars", String(v.stars * t.stars)); st.setProperty("--lamp", String(Math.min(1, v.lamp + t.dim * 0.8)));
    st.setProperty("--night", String(night)); st.setProperty("--city", String(v.city));
    // the grass beyond the drawn outdoors darkens with the same night tint
    this.root.parentElement?.style.setProperty("--scene-night", String(night));
    const look = outdoorLook(now, this.weather);
    this.fx?.set(this.weather, { night: v.night, season: look.season, frozen: look.frozen });
    this.redrawOutside();
    this.paintClock();
  }

  private paintClock() {
    const now = new Date();
    const m = now.getMinutes(), hr = (now.getHours() % 12) + m / 60;
    this.root.querySelectorAll<SVGElement>(".clock-h").forEach((e) => e.setAttribute("transform", `rotate(${hr * 30})`));
    this.root.querySelectorAll<SVGElement>(".clock-m").forEach((e) => e.setAttribute("transform", `rotate(${m * 6})`));
  }
}

// --- room art (top-down) -----------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function monogram(title: string) {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}

function roomSvg(r: Room, slots: number, theme?: RoomTheme, level = 0) {
  const { w, h, kind, title, icon } = r;
  const pal = {
    main: { wall: "#ece6da", trim: "#d8cfbf", floor: "#c9a274", seam: "#b88f61", accent: "#ff9f5a" },
    project: { wall: "#e4e7ee", trim: "#cdd2dc", floor: "#bf9a70", seam: "#ab8660", accent: "#4fb6ff" },
    freelance: { wall: "#f0dfcb", trim: "#dcc4a8", floor: "#c98a6a", seam: "#b8775a", accent: "#ff6f91" },
    break: { wall: "#e6eadf", trim: "#d0d6c5", floor: "#c9a274", seam: "#b88f61", accent: "#4ff0a0" },
    queue: { wall: "#ebe4ef", trim: "#d6cddd", floor: "#c9a274", seam: "#b88f61", accent: "#b07cff" },
  }[kind];
  const uid = Math.random().toString(36).slice(2, 8);
  const T = 16; // wall top thickness
  // floor: planks seen from above (or terracotta tiles in the freelancer cafe)
  const floor = kind === "freelance"
    ? Array.from({ length: Math.ceil(w / 48) * Math.ceil(h / 48) }, (_, i) => { const cx = (i % Math.ceil(w / 48)) * 48, cy = WALL_FACE + Math.floor(i / Math.ceil(w / 48)) * 48; return `<rect x="${cx + 1}" y="${cy + 1}" width="46" height="46" rx="3" fill="${(i + Math.floor(i / Math.ceil(w / 48))) % 2 ? pal.floor : pal.seam}" opacity="0.9"/>`; }).join("")
    : Array.from({ length: Math.ceil((h - WALL_FACE) / 26) }, (_, i) => {
        const y = WALL_FACE + i * 26, off = (i * 97) % 180;
        return `<rect x="0" y="${y + 25}" width="${w}" height="1.2" fill="${pal.seam}" opacity="0.55"/>` +
          Array.from({ length: Math.ceil(w / 180) + 1 }, (_, k) => `<rect x="${k * 180 - off}" y="${y}" width="1.2" height="25" fill="${pal.seam}" opacity="0.5"/>`).join("");
      }).join("");
  // windows on the north wall face
  const windows: string[] = [];
  const hallDoor = kind === "project" || kind === "freelance";
  const nWin = Math.max(1, Math.floor((w - 240 - (hallDoor ? 60 : 0)) / 300));
  for (let i = 0; i < nWin; i++) {
    const wx = 200 + i * ((w - 260) / nWin), ww = Math.min(220, (w - 260) / nWin - 40);
    windows.push(`
      <rect x="${wx - 6}" y="${T + 14}" width="${ww + 12}" height="${WALL_FACE - T - 30}" rx="6" fill="${pal.trim}"/>
      <rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#sky${uid})"/>
      <g style="opacity:var(--stars)">${Array.from({ length: 7 }, (_, k) => `<circle cx="${wx + 8 + ((k * 61) % (ww - 16))}" cy="${T + 26 + ((k * 23) % 30)}" r="${k % 3 ? 1 : 1.6}" fill="#fff"/>`).join("")}</g>
      <rect x="${wx + ww / 2 - 2}" y="${T + 20}" width="4" height="${WALL_FACE - T - 42}" fill="${pal.trim}"/>
      <rect x="${wx - 10}" y="${WALL_FACE - 14}" width="${ww + 20}" height="6" rx="3" fill="${pal.trim}"/>`);
  }
  // pools of lamp light on the floor (they show at night)
  const lamps: string[] = [];
  for (let ly = WALL_FACE + 170; ly < h - 40; ly += 460)
    for (let lx = 230; lx < w - 60; lx += 420)
      lamps.push(`<ellipse cx="${lx}" cy="${ly}" rx="190" ry="150" fill="url(#pool${uid})" style="opacity:var(--lamp)"/>`);
  const signBox = kind !== "break" && kind !== "queue" ? `
    <g transform="translate(34 ${T + 10})">
      <rect width="140" height="${WALL_FACE - T - 24}" rx="10" fill="#ffffff" opacity="0.94"/>
      ${icon ? `<image href="${icon}" x="10" y="12" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="10" y="12" width="46" height="46" rx="12" fill="${pal.accent}"/><text x="33" y="42" text-anchor="middle" font-size="19" font-weight="600" fill="#fff" font-family="var(--font)">${esc(monogram(title))}</text>`}
      <foreignObject x="62" y="8" width="74" height="${WALL_FACE - T - 40}"><div xmlns="http://www.w3.org/1999/xhtml" class="room-name">${esc(title)}</div></foreignObject>
    </g>` : `<text x="40" y="${T + 52}" font-size="28" font-weight="600" fill="#3a3f4f" font-family="var(--font)">${esc(title)}</text>`;
  const clock = kind === "main" ? `
    <g transform="translate(${w - 80} ${T + 46})">
      <circle r="28" fill="#fff"/><circle r="24" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-1" y="-22" width="2" height="${i % 3 ? 3 : 6}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.8" y="-13" width="3.6" height="15" rx="1.8" fill="#3a3f4f"/>
      <rect class="clock-m" x="-1.2" y="-20" width="2.4" height="22" rx="1.2" fill="#3a3f4f"/>
      <circle r="2.6" fill="${pal.accent}"/>
    </g>` : "";
  const plant = (x: number, y: number, s = 1) => ambientPlant(x, y, s);
  const cafe = kind === "freelance" ? `
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="58" rx="8" fill="#6b4f3a"/>
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="10" rx="5" fill="#82634b"/>
    <rect x="${w - 300}" y="${WALL_FACE + 8}" width="56" height="34" rx="6" fill="#3a3f4f"/><rect x="${w - 292}" y="${WALL_FACE + 14}" width="20" height="10" rx="3" fill="#ff9f5a"/>
    <circle cx="${w - 200}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/><circle cx="${w - 160}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/>
    ${Array.from({ length: Math.floor(w / 46) }, (_, i) => `<circle cx="${20 + i * 46}" cy="${WALL_FACE + 14 + Math.sin(i * 0.9) * 6}" r="4" fill="#ffd27a" style="opacity:calc(0.5 + var(--lamp) * 0.5)"/>`).join("")}` : "";
  // the room's furnishing: placed around the desks, never on them
  let decorSvg: string | null = null;
  const items = usable(theme, level);
  if (items.length) {
    const { cols } = officeSize(Math.max(1, slots));
    const desks = Array.from({ length: slots }, (_, k) => ({ x: 70 + (k % cols) * SLOT_W, y: WALL_FACE + 40 + Math.floor(k / cols) * SLOT_H, w: UNIT_W, h: UNIT_H }));
    const avoid = [{ x: 30, y: T, w: 148, h: WALL_FACE - T }, ...(kind === "main" ? [{ x: w - 112, y: T, w: 64, h: 66 }] : []), ...(kind === "freelance" ? [{ x: w - 340, y: WALL_FACE - 10, w: 310, h: 70 }] : [])];
    decorSvg = placeDecor(items, w, h, WALL_FACE, desks, { avoid, wallTop: T }).map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("");
  }
  return /* svg */ `
  <svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <radialGradient id="pool${uid}"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.28"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>
    </defs>
    ${theme?.floor && ownsItem(`floor:${theme.floor}`) ? drawFloor(theme.floor, w, h, WALL_FACE) : `<rect y="${WALL_FACE}" width="${w}" height="${h - WALL_FACE}" fill="${pal.floor}"/>${floor}`}
    ${lamps.join("")}
    <rect y="${WALL_FACE}" width="${w}" height="18" fill="#000" opacity="0.07"/>
    ${theme?.wall && ownsItem(`wall:${theme.wall}`) ? drawWall(theme.wall, w, WALL_FACE) : `<rect width="${w}" height="${WALL_FACE}" fill="${pal.wall}"/><rect y="${WALL_FACE - 10}" width="${w}" height="10" fill="${pal.trim}"/>`}
    ${windows.join("")}
    ${signBox}${clock}${cafe}
    ${decorSvg ?? `${plant(w - 60, h - 70)}${plant(52, h - 70, 0.85)}`}
    <rect width="${w}" height="${T}" fill="#3a3f4f"/>
    <rect width="${T}" height="${h}" fill="#3a3f4f"/>
    <rect x="${w - T}" width="${T}" height="${h}" fill="#3a3f4f"/>
    <rect y="${h - T}" width="${w}" height="${T}" fill="#3a3f4f"/>
    <rect x="${w / 2 - 60}" y="${h - T}" width="120" height="${T}" fill="${pal.floor}"/>
    ${hallDoor ? `<rect x="${w - 74}" y="0" width="56" height="${WALL_FACE}" fill="#7a5236"/><rect x="${w - 69}" y="4" width="46" height="${WALL_FACE - 4}" fill="${pal.floor}"/><rect x="${w - 69}" y="${WALL_FACE - 14}" width="46" height="14" fill="#000" opacity="0.08"/>` : ""}
  </svg>`;
}
