import gsap from "gsap";
import { setZoom } from "../world/budget";
import { Desk, UNIT_W, UNIT_H, type DeskServices } from "./desk";
import { drawFloor, drawWall, drawDecor, placeDecor, decorFootprint, DECOR } from "../decor/decor";
import { furniturePath, type Footprint } from "./navigation";
import type { RoomTheme } from "./decorate";
import { Park } from "./park";
import { Walker, SIT_HEAD, pause, type Facing } from "../world/walker";
import { makeInteractive, whenFree } from "./interact";
import { GEOM, type Pt } from "./rig";
import { SHOP_W, SHOP_H, type ShopFront } from "./shopfront";
import { mountWeather, applySkyTint, type WeatherLayer, type Weather } from "../weather/effects";
import { outdoorLook, seasonPalette } from "../weather/season";
import { outsideSvg, backdropColor, groundsLayout, PARK_W, PARK_H, type Grounds } from "./outside";
import { groundWx, groundSig, isWet, puddleSpots, type Puddle } from "../weather/ground";
import { gearFor } from "../weather/gear";
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
  /** A leaving robot reached the door (room coordinates); true when the hall walker takes it from there. */
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  /** The next time this robot joins, its walker starts at this point (room coordinates), where the hall walker stopped. */
  enterFrom?(id: string, at: Pt): void;
  destroy(): void;
}

const WALL_FACE = 110;   // north wall face height
const COLS = 3;
const SLOT_W = UNIT_W + 20, SLOT_H = UNIT_H + 20;
const GAP = 40, HALL = 150;
const IN_FRONT = 300000;  // stacking bias for a walker getting into or out of a chair (desks raise themselves up to 100000 + y)
const WALK_SCALE = 0.42;   // every walking robot (hall, rooms, park) and the desk robots (seated.ts) share this size

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
  // A robot that changes rooms gets up and walks: out through its room's door, along the hall,
  // in through the other door and down the aisles between the desks to its chair, where it sits
  // down and the desk robot takes over on the spot. The break room, the question line and the
  // park have walkers of their own: they hand a leaving robot over at their door and take an
  // arriving one over at the same point, so nobody pops in or out. New robots come in from
  // outside through the entrance; outdoors a robot walks in the park layer (under the night tint).
  private topH = 0;
  private roomOf = new Map<string, string>();          // thread -> room id at the last update ("park" too)
  private transit = new Map<string, Walker>();
  private trips = new Map<string, object>();           // the journey a robot in transit is on (a newer one replaces it)
  private known = new Map<string, WThread>();          // every thread at the last update, for robots whose thread went away
  private exits = new Map<string, { t: WThread; to: string | null; timer: number }>();   // waiting for its room to hand it over at the door
  private parkDoor: Pt = { x: 0, y: 0 };
  private extLists: { brk: any[]; queue: any[]; park: any[]; orch?: any } = { brk: [], queue: [], park: [] };
  private get hallY() { return this.topH + HALL / 2; }
  private roomById(id: string | null) { return id ? this.rooms.find((r) => r.id === id) ?? null : null; }
  // the door on the hall side of a room: [just outside in the hall, just inside the room]
  private door(r: Room): [Pt, Pt] {
    if (r.y + r.h <= this.topH + 1) {   // top row: door in the south wall
      const x = r.x + r.w / 2;
      return [{ x, y: r.y + r.h + 34 }, { x, y: r.y + r.h - 40 }];
    }
    const x = r.x + r.w - 46;           // bottom row: door in the north wall, right corner
    return [{ x, y: r.y - 34 }, { x, y: r.y + WALL_FACE + 16 }];
  }
  private entrance() { return { x: this.size.w - 6, y: this.hallY }; }
  /** Where a walker sits so its head is where the desk robot's head is (desk at `d`, world coordinates). */
  private seatAt(d: Pt) { return { x: d.x + GEOM.chair.x, y: d.y + GEOM.head.y - 2 + SIT_HEAD * WALK_SCALE }; }
  private deskPos(d: Desk) { return { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) }; }
  // Plan from the door around actual floor footprints, then approach the chair from its side.
  private toSeat(r: Room, d: Pt): Pt[] {
    const [, inn] = this.door(r);
    const seat = this.seatAt(d), side = { x: seat.x + (inn.x < seat.x ? -1 : 1) * 62, y: seat.y };
    const path = furniturePath(inn, side, this.furniture(r), this.walkBounds(r));
    return [inn, ...(path ?? [side]), seat]; // walkLegs checks again; a blocked route waits
  }
  private walkBounds(r: Room): Footprint { return { x: r.x + 20, y: r.y + WALL_FACE + 10, w: r.w - 40, h: r.h - WALL_FACE - 30 }; }
  private outside(p: Pt) { return p.x > this.size.w; }
  /** From any point to the hall (nothing when it is already outdoors), through the room's door. */
  private wayOut(p: Pt): Pt[] {
    if (this.outside(p)) return [];
    if (p.y >= this.topH - 10 && p.y <= this.topH + HALL + 10) return [{ x: p.x, y: this.hallY }];
    const r = this.rooms.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);
    if (!r) return [{ x: p.x, y: this.hallY }];
    const [out, inn] = this.door(r);
    return [{ x: p.x, y: inn.y }, inn, out, { x: out.x, y: this.hallY }];
  }
  /** The whole way from `p` to where the robot is going (see `travel`). */
  private route(p: Pt, id: string, to: string | null): { pts: Pt[]; desk: Desk | null; deskAt: Pt | null } {
    const pts = this.wayOut(p);
    const toRoom = this.roomById(to);
    const owned = this.desks.get(id);
    const desk = toRoom && owned?.room === to ? owned : null;
    const startOut = this.outside(p), endOut = !toRoom;   // the park, or away
    if (startOut && !endOut) pts.push(this.parkDoor, this.entrance());
    if (!startOut && endOut) pts.push(this.entrance(), this.parkDoor);
    let deskAt: Pt | null = null;
    if (toRoom) {
      const [out, inn] = this.door(toRoom);
      pts.push({ x: out.x, y: this.hallY }, out);
      if (desk) { deskAt = this.deskPos(desk); pts.push(...this.toSeat(toRoom, deskAt)); }
      else pts.push(inn);
    } else if (to !== "park") pts.push({ x: this.parkDoor.x + 110, y: this.parkDoor.y });   // away down the path
    return { pts, desk, deskAt };
  }

  private spawn(t: { id: string; provider: string; model?: string | null }, at: Pt, face: Facing, outdoors = this.outside(at)) {
    const profile = this.roster.byThread(t.id);
    const out = outdoors;
    const w = new Walker(out ? this.park.layer : this.deskLayer, { id: t.id, provider: t.provider, name: profile?.name, model: t.model ?? undefined, scale: WALK_SCALE, look: profile?.look });
    w.el.classList.add("hall-walker");
    makeInteractive(w, { bounds: () => (out ? this.outdoor : null) ?? { x: 0, y: 0, w: this.size.w, h: this.size.h }, onOpen: () => this.onSelectThread(t.id) });
    w.setPos(at.x, at.y);
    w.face(face);
    this.transit.set(t.id, w);
    return w;
  }

  /** Walks a list of points; at the entrance the robot steps from the hall layer to the outdoors layer or back. */
  private async walkLegs(t: WThread, pts: Pt[], trip: object) {
    let i = 0;
    while (i < pts.length) {
      const w = this.transit.get(t.id);
      if (!w || this.trips.get(t.id) !== trip) return;
      const out = this.outside(pts[i]);
      if (out !== (w.el.parentElement === this.park.layer)) {
        // through the entrance: the same robot, now drawn in the other layer
        this.spawn(t, { x: w.x, y: w.y }, w.facing, out);
        w.destroy();
        continue;
      }
      // Re-plan each leg against the actual furniture, including bought decorations.
      while (this.deskDragActive || this.slidingDesks.size) { await pause(0.1); if (this.trips.get(t.id) !== trip) return; }
      const j = i + 1, from = { x: w.x, y: w.y }, goal = pts[i];
      const room = this.rooms.find((r) => ["main", "project", "freelance"].includes(r.kind) &&
        from.x >= r.x && from.x <= r.x + r.w && from.y >= r.y && from.y <= r.y + r.h &&
        goal.x >= r.x && goal.x <= r.x + r.w && goal.y >= r.y && goal.y <= r.y + r.h);
      const path = room ? furniturePath(from, goal, this.furniture(room), this.walkBounds(room)) : [goal];
      if (!path) return; // stay put and let travel retry, never walk through a blocked aisle
      await w.walkPath(path);
      if (this.transit.get(t.id) !== w || this.trips.get(t.id) !== trip) return;
      const last = pts[j - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) > 8) return;   // picked up on the way: the caller plans again
      i = j;
    }
  }

  private furniture(r: Room): Footprint[] {
    const blocks: Footprint[] = [];
    for (const d of this.slotDesks.values()) if (d.room === r.id) {
      const p = this.deskPos(d);
      blocks.push({ x: p.x + 34, y: p.y + 180, w: 332, h: 88 }, { x: p.x + 164, y: p.y + 285, w: 72, h: 64 });
    }
    const slots = this.seats.get(r.id)?.length ?? 0;
    for (const p of officeDecor(r, slots, this.themes.get(r.id), this.level)) {
      const b = decorFootprint(p); if (b) blocks.push({ ...b, x: b.x + r.x, y: b.y + r.y });
    }
    if (!usable(this.themes.get(r.id), this.level).length) blocks.push(
      { x: r.x + r.w - 82, y: r.y + r.h - 86, w: 44, h: 26 }, { x: r.x + 34, y: r.y + r.h - 84, w: 38, h: 24 });
    if (r.kind === "freelance") blocks.push({ x: r.x + r.w - 420, y: r.y + WALL_FACE - 6, w: 290, h: 58 });
    return blocks;
  }

  /**
   * One robot's walk to `to` (a room id, "park", or null: it leaves the building). It sets off
   * from its chair (`seat`: where its desk stood), from the point a room handed it over at,
   * from wherever it is walking right now, or from outside (a new robot).
   */
  private async travel(t: WThread, from: { seat: Pt; room: string | null } | { at: Pt; face: Facing } | { outside: true } | { walker: Walker }, to: string | null) {
    const trip = {};
    this.trips.set(t.id, trip);
    let w: Walker;
    if ("walker" in from) { w = from.walker; w.stop(); w.zBias = 0; }
    else if ("seat" in from) {
      // the desk robot gets up: its walking self takes over, sitting in the same chair
      w = this.spawn(t, this.seatAt(from.seat), "up");
      w.sitNow();
      w.zBias = IN_FRONT;   // over its desk until it is out of the chair
      await pause(0.25);
      if (this.trips.get(t.id) !== trip) return;
      w.calm();
      await pause(0.35);
      const r = this.roomById(from.room);
      if (r) {
        // out of the chair the way it came in: a step to the side, then down the aisles to the door
        const back = this.toSeat(r, from.seat).reverse();
        await this.walkLegs(t, back.slice(0, 2), trip);
        if (this.trips.get(t.id) !== trip || this.transit.get(t.id) !== w) return;
        w.zBias = 0;
        await this.walkLegs(t, back.slice(2), trip);
        if (this.trips.get(t.id) !== trip) return;
        w = this.transit.get(t.id) ?? w;
      } else w.zBias = 0;
    } else if ("at" in from) w = this.spawn(t, from.at, from.face);
    else {
      w = this.spawn(t, { x: this.parkDoor.x + 110, y: this.parkDoor.y }, "left");
      gsap.fromTo(w.el, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }
    let plan = this.route({ x: w.x, y: w.y }, t.id, to);
    while (this.trips.get(t.id) === trip) {
      if (this.trips.get(t.id) !== trip) return;
      // the last steps (beside the chair, into it) are drawn over the desk, whatever raised it
      const near = plan.desk ? 2 : 0, n = plan.pts.length;
      const w0 = this.transit.get(t.id);
      if (w0) w0.zBias = 0;
      await this.walkLegs(t, plan.pts.slice(0, n - near), trip);
      const at = this.transit.get(t.id), mid = plan.pts[n - near - 1];
      if (near && at && this.trips.get(t.id) === trip && (!mid || Math.hypot(at.x - mid.x, at.y - mid.y) <= 8)) {
        at.zBias = IN_FRONT;
        await this.walkLegs(t, plan.pts.slice(n - near), trip);
      }
      const cur = this.transit.get(t.id);
      if (!cur || this.trips.get(t.id) !== trip) return;
      w = cur;
      const end = plan.pts[plan.pts.length - 1];
      const d = plan.desk, moved = !!d && (this.desks.get(t.id) !== d || !d.el.isConnected || Math.hypot(this.deskPos(d).x - plan.deskAt!.x, this.deskPos(d).y - plan.deskAt!.y) > 1);
      if (!moved && (!end || Math.hypot(w.x - end.x, w.y - end.y) <= 8)) break;
      await whenFree(w);
      await pause(0.1);
      plan = this.route({ x: w.x, y: w.y }, t.id, to);
    }
    if (this.trips.get(t.id) !== trip) return;
    const desk = plan.desk && this.desks.get(t.id) === plan.desk ? plan.desk : null;
    const done = w;
    if (desk) {
      // it turns to the desk and sits down; the desk robot fades in on the same spot
      done.face("up");
      done.do("sit");
      await pause(0.55);
      if (this.trips.get(t.id) !== trip) return;
      desk.el.classList.remove("arriving");
      gsap.to(done.el, { opacity: 0, duration: 0.25, onComplete: () => done.destroy() });
    } else if (to && to !== "park") {
      // the room's own walker takes over just inside the door
      const r = this.roomById(to), ext = this.ext[to as "break" | "queue"];
      if (r && ext?.enterFrom) ext.enterFrom(t.id, { x: done.x - r.x, y: done.y - r.y });
      done.destroy();
    } else if (to === "park") done.destroy();   // the park's own walker steps out of the same door
    else gsap.to(done.el, { opacity: 0, duration: 0.4, onComplete: () => done.destroy() });
    this.trips.delete(t.id);
    this.transit.delete(t.id);
    this.pushExt();
  }

  /** A room's walker reached its door on the way out (world coordinates): the hall walker takes over. */
  private handOver(id: string, at: Pt, face: Facing) {
    const ex = this.exits.get(id);
    if (!ex) return false;
    window.clearTimeout(ex.timer);
    this.exits.delete(id);
    void this.travel(ex.t, { at, face }, ex.to);
    return true;
  }

  /** A robot changes rooms (`to` null: its thread is gone and it leaves the building). */
  private move(t: WThread, from: string | null, to: string | null, seat: Pt | null) {
    const desk = to ? this.desks.get(t.id) : undefined;
    if (desk) desk.el.classList.add("arriving");
    const ex = this.exits.get(t.id);
    if (ex) { ex.t = t; ex.to = to; return; }                 // still walking out of its room: it goes on from the door
    const cur = this.transit.get(t.id);
    if (cur) { void this.travel(t, { walker: cur }, to); return; }
    if (seat) { void this.travel(t, { seat, room: from }, to); return; }
    if (from === "break" || from === "queue" || from === "park") {
      // the room walks it to its door first and hands it over there (handOver)
      const timer = window.setTimeout(() => {
        const e = this.exits.get(t.id);
        if (!e) return;
        const host = from === "park" ? this.park.layer : this.ext[from]?.el;
        // A slow exit is still the same robot. Never replace it at the door on a timer.
        if (host && [...host.querySelectorAll<HTMLElement>(".world-walker")].some((el) => el.dataset.id === t.id)) return;
        this.exits.delete(t.id);
        // It was never on show in the source room, so it enters through the outside path.
        void this.travel(e.t, { outside: true }, e.to);
      }, 15000);
      this.exits.set(t.id, { t, to, timer });
      return;
    }
    const r = this.roomById(from);
    void this.travel(t, r ? { at: this.door(r)[1], face: "down" } : { outside: true }, to);
  }

  // break room, question line and park only show robots that are actually there
  private pushExt() {
    const here = (l: any[]) => l.filter((x) => !this.transit.has(x.id));
    this.ext.break?.setThreads(here(this.extLists.brk) as any);
    this.ext.queue?.setThreads(here(this.extLists.queue) as any);
    (this.ext.queue as any)?.setBoss?.(this.extLists.orch ?? null);   // the orchestrator sits behind the questions desk
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
  /** Rain, snow or a storm now, or rain within 20 minutes: nobody stays outside. */
  get outdoorsWet() {
    const w = this.weather;
    return ["rain", "drizzle", "storm", "snow"].includes(w?.kind ?? "") || (w?.rainSoonMin != null && w.rainSoonMin <= 20);
  }
  // When it last rained and how hard: the puddles dry up over the next 20 minutes (remembered across launches).
  private dry: { at: number; level: number } | null = (() => { try { return JSON.parse(localStorage.getItem("lucid:wx:dry") || "null"); } catch { return null; } })();
  private puddles: Puddle[] = [];
  /** How the weather leaves the ground right now (puddles, frost, heat, snowmen). */
  ground() {
    const look = outdoorLook(new Date(), this.weather);
    return { look, g: groundWx(this.weather, look.snowCover, this.dry) };
  }
  setWeather(w: Weather | null) {
    const was = `${this.weather?.kind}|${this.outdoorsWet}`;
    if (isWet(w) || isWet(this.weather)) {
      // still raining, or it just stopped: the puddles start drying from now
      this.dry = { at: Date.now(), level: isWet(w) ? (w!.kind === "drizzle" ? 0.5 : 1) : this.dry?.level ?? 1 };
      try { localStorage.setItem("lucid:wx:dry", JSON.stringify(this.dry)); } catch { /* private mode */ }
    }
    this.weather = w;
    if (was !== `${w?.kind}|${this.outdoorsWet}` && this.lastData) this.update(this.lastData);   // the park empties or fills
    this.redrawOutside();
    this.daylight();
  }
  private redrawOutside(force = false) {
    if (!this.outArgs) return;
    const { look, g } = this.ground();
    // puddles, frost and heat are part of the drawing, in coarse steps, so it is redrawn only when they change class
    const sig = JSON.stringify(look) + groundSig(g);
    if (!force && sig === this.lookSig) return;
    this.lookSig = sig;
    // The outdoors (the grounds, the walk and the park) is one drawing of a few thousand shapes.
    // As live page elements they would make every frame slow, so it is shown as a single image;
    // only the small "live" layer (lamps, animals, swaying trees) stays page elements.
    const layer = this.root.querySelector(".outside-layer") as HTMLElement;
    const svg = outsideSvg({ ...this.outArgs, ...look, wx: g, puddles: this.puddles, layer: "still" }).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const css = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText).filter((t) => /\.outside|@keyframes|--lamp|--night/.test(t)); } catch { return []; } }).join("\n");
    const vars = getComputedStyle(this.root);
    const root = `svg{--lamp:${vars.getPropertyValue("--lamp") || 0};--night:${vars.getPropertyValue("--night") || 0};--wind:${vars.getPropertyValue("--wind") || 0.3}}`;
    // animating inside one huge image forces it to be redrawn every frame, so by default it
    // stays still; moving bits (water, lamps, wildlife) belong in small separate elements
    const animate = !!(window as any).__animOutside;
    const withCss = svg.replace(/(<svg[^>]*>)/, `$1<style>${root}\n${animate ? css : css.replace(/animation[^;}]*;?/g, "")}</style>`);
    if (this.outUrl) URL.revokeObjectURL(this.outUrl);
    this.outUrl = URL.createObjectURL(new Blob([withCss], { type: "image/svg+xml" }));
    (window as any).__outBytes = withCss.length;   // debug: size of the still image
    layer.innerHTML = `<img class="outside-img" src="${this.outUrl}" alt="" draggable="false" style="display:block;width:100%;height:100%">` + outsideSvg({ ...this.outArgs, ...look, wx: g, layer: "live" });
    // the scene behind the drawing has the backdrop's colour, so the soft edge never shows
    this.scene.style.setProperty("--scene-ground", backdropColor({ ...look, wx: g }));
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
  private hasLayout = false;
  private placed = new Map<string, { room: string; pending?: { room: string; since: number } }>();
  seats = new Map<string, (string | null)[]>();   // persistent reservations, including robots on a break
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
    this.park.onExit = (id, at, face) => this.handOver(id, at, face);
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
    if (this.deskDragActive) return; // live refresh must never replace a desk under the pointer
    const seatsBefore = JSON.stringify([...this.seats]);
    const byProject = new Map(data.projects.map((p) => [p.id, p]));
    const queue: WThread[] = [], main: WThread[] = [], brk: WThread[] = [], rest: WThread[] = [];
    const perProject = new Map<string, WThread[]>();
    const freelance: WThread[] = [];
    const residents = new Map<string, WThread[]>();
    let orchT: WThread | null = null;
    for (const t of data.threads) {
      if (t.id === this.orchThread) { orchT = t; continue; }   // no desk: it has the chair in the questions room
      // A scheduled robot with a long wait until its next run spends it in the break room;
      // with a short wait it stays at its desk and kills time there.
      const wait = t.schedule?.nextRunAt ? Date.parse(t.schedule.nextRunAt) - Date.now() : null;
      const p = byProject.get(t.projectId);
      const savedHome = this.homes.get(t.id);
      const home = savedHome === "main" || savedHome === "freelance" || (savedHome?.startsWith("p:") && byProject.has(savedHome.slice(2)))
        ? savedHome : (!p || p.scratch ? "freelance" : `p:${p.id}`);
      // A break changes where the robot is, never who owns its furniture.
      if (!t.settled || t.runStatus === "running" || t.pinned || this.homes.has(t.id) || this.seats.get(home)?.includes(t.id)) {
        if (!residents.has(home)) residents.set(home, []);
        residents.get(home)!.push(t);
      }
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
        : t.runStatus === "running" || t.pinned ? home
        : wait != null && wait > 15 * 60 * 1000 ? "break"
        : wait != null ? home
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
    const seatOrder = (roomId: string, list: WThread[]) => {
      const prev = [...(this.seats.get(roomId) ?? [])];
      // a robot hired at a specific desk sits exactly there
      const ps = this.pendingSeat;
      if (ps && ps.room === roomId && ps.threadId && list.some((t) => t.id === ps.threadId)) {
        while (prev.length <= ps.index) prev.push(null);
        const old = prev.indexOf(ps.threadId);
        if (old >= 0) prev[old] = null;
        const displaced = prev[ps.index];
        prev[ps.index] = ps.threadId;
        if (displaced && displaced !== ps.threadId) prev.push(displaced);
        this.pendingSeat = null;
      }
      const ids = new Set(list.map((t) => t.id));
      const seen = new Set<string>();
      const seats: (string | null)[] = prev.map((id) => {
        if (!id || !ids.has(id) || seen.has(id)) return null;
        seen.add(id); return id;
      });
      for (const t of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
        if (seats.includes(t.id)) continue;
        const free = seats.indexOf(null);
        if (free >= 0) seats[free] = t.id; else seats.push(t.id);
      }
      // Keep holes and trailing slots. Compacting them silently changes everyone else's seat.
      this.seats.set(roomId, seats);
      const byId = new Map(list.map((t) => [t.id, t]));
      return seats.map((id) => (id ? byId.get(id) ?? null : null));
    };
    type Plan = { id: string; kind: RoomKind; title: string; icon: string | null; threads: (WThread | null)[]; slots: number; w: number; h: number };
    const office = (id: string, kind: RoomKind, title: string, icon: string | null, threads: WThread[], min: number): Plan => {
      const extra = this.extra.get(id) ?? 0;
      const seated = seatOrder(id, residents.get(id) ?? threads);
      const slots = Math.max(min + extra, seated.length);
      while (this.seats.get(id)!.length < slots) this.seats.get(id)!.push(null);
      const { w, h } = officeSize(slots, needsLounge(this.themes.get(id), this.level) ? LOUNGE : 0);
      return { id, kind, title, icon, threads: seated, slots, w, h };
    };
    const top: Plan[] = [
      { id: "queue", kind: "queue", title: "Questions for you", icon: null, threads: queue, slots: 0, w: 720, h: 800 },
      office("main", "main", "Main office", null, main, 3),
      { id: "break", kind: "break", title: "Break room", icon: null, threads: brk.slice(0, 8), slots: 0, w: 1900, h: 800 },
    ];
    const bottom: Plan[] = [];
    for (const p of [...data.projects].filter((p) => !p.scratch).sort((a, b) => a.id.localeCompare(b.id))) {
      const pid = p.id, list = perProject.get(pid) ?? [];
      if (this.hidden.has(pid)) continue;
      bottom.push(office(`p:${pid}`, "project", p.title, p.icon, list, 2));
    }
    if (!this.hidden.has("freelance")) bottom.push(office("freelance", "freelance", "Freelancers", null, freelance, 2));

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
      // Preserve room residents and their running journeys when another office changes size.
      const oldRooms = new Map(this.rooms.map((r) => [r.id, r]));
      rooms.forEach((r, i) => {
        const old = oldRooms.get(r.id);
        if ((r.kind === "break" || r.kind === "queue") && old && old.w === r.w && old.h === r.h) {
          r.el = old.el;
          gsap.to(r.el, { left: r.x, top: r.y, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.3, ease: "power3.out", overwrite: "auto" });
          const ext = this.ext[r.kind];
          if (ext) ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + parseFloat(r.el.style.left), y: at.y + parseFloat(r.el.style.top) }, face);
          oldRooms.delete(r.id);
          return;
        }
        if (old) { this.cull.unobserve(old.el); old.el.remove(); oldRooms.delete(r.id); }
        const el = document.createElement("div");
        el.className = `room room-${r.kind}`;
        el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        const make = r.kind === "break" || r.kind === "queue" ? this.extFactory[r.kind] : undefined;
        if (make) {
          const ext = make(el, r.w, r.h);
          ext.onSelect = (id) => this.onSelectThread(id);
          ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + r.x, y: at.y + r.y }, face);
          this.ext[r.kind as "break" | "queue"] = ext;
        } else el.innerHTML = roomSvg(r, plans[i].slots, this.themes.get(r.id), this.level);
        this.roomLayer.appendChild(el);
        this.cull.observe(el);
        r.el = el;
      });
      for (const old of oldRooms.values()) { this.cull.unobserve(old.el); old.el.remove(); }
      const hall = this.root.querySelector(".hall") as HTMLElement;
      hall.style.cssText = `top:${topH}px;height:${HALL}px;width:${this.size.w}px`;
      // the outdoors: grass and trees around the building, a park beside the entrance
      // the shop sits just past the entrance, south of the path; the park lies beyond it
      const entY = topH + HALL / 2;
      this.shopRect = { x: this.size.w + 190, y: entY + 190, w: SHOP_W, h: SHOP_H };
      this.shopFront?.place(this.shopRect.x, this.shopRect.y);
      // the park's middle stays level with the entrance (or with y 320 for a short building)
      const park = { x: this.size.w + 190 + SHOP_W + 260, y: Math.max(320, entY) - PARK_H / 2, w: PARK_W, h: PARK_H };
      // the grounds round it (grounds.ts): lawn, hedge and a tree belt that fades into the backdrop
      const building = { x: 0, y: 0, w: this.size.w, h: this.size.h };
      this.grounds = groundsLayout({ building, entranceY: entY, park, shop: this.shopRect });
      const cb = this.grounds.bounds;
      const out = { ox: cb.x, oy: cb.y, w: cb.w, h: cb.h };
      this.outdoor = { x: out.ox, y: out.oy, w: out.w, h: out.h, park };
      this.parkDoor = { x: this.size.w + 66, y: topH + HALL / 2 + 20 };
      this.park.setGeometry(park, this.parkDoor);
      const layer = this.root.querySelector(".outside-layer") as HTMLElement;
      layer.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
      this.outArgs = { ...out, building, entranceY: entY, park, shop: this.shopRect, grounds: this.grounds };
      this.puddles = puddleSpots(this.grounds, building, park, entY);
      this.redrawOutside(true);
      // the weather reaches well past the drawn grounds, so rain and cloud never stop at an edge
      const reach = Math.max(3000, cb.w * 0.6);
      const wr = { x: out.ox - reach, y: out.oy - reach, w: out.w + 2 * reach, h: out.h + 2 * reach, park, entranceY: topH + HALL / 2 };
      if (this.fx) this.fx.resize(wr); else { this.fx = mountWeather(this.root, wr); this.apply(); }
      // puddles ripple in the rain, the paving shimmers in the heat, walkers leave prints in the snow
      this.fx.setGround(this.puddles, [this.grounds.walk]);
      this.fx.setSteppers(() => this.park.steppers());
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
    const desksBefore = new Map<string, Pt>();
    for (const [id, d] of this.desks) if (!d.el.classList.contains("arriving")) desksBefore.set(id, this.deskPos(d));
    const nowRoom = new Map<string, string>();
    const atWork = new Set([...main, ...freelance, ...[...perProject.values()].flat()].map((t) => t.id));
    for (const s of slots) if (s.t && atWork.has(s.t.id)) nowRoom.set(s.t.id, s.key.split("#")[0]);
    brkShown.forEach((t) => nowRoom.set(t.id, "break"));
    queue.forEach((t) => nowRoom.set(t.id, "queue"));
    if (!this.outdoorsWet) brk.slice(8, 14).forEach((t) => { if (!nowRoom.has(t.id)) nowRoom.set(t.id, "park"); });
    const first = !this.hasLayout;
    this.hasLayout = true;
    const moving: { t: WThread; from: string | null; to: string | null }[] = [];
    if (!first) {
      for (const t of data.threads) {
        if (t.id === this.orchThread) continue;   // the orchestrator has the chair in the questions room (boss.ts)
        const from = this.roomOf.get(t.id) ?? null, to = nowRoom.get(t.id) ?? null;
        if (from !== to) moving.push({ t, from, to });   // a new robot comes in from outside; one with no place left goes out
      }
      for (const [id, from] of this.roomOf) {
        const t = this.known.get(id);
        if (!nowRoom.has(id) && t && id !== this.orchThread && !data.threads.some((x) => x.id === id)) moving.push({ t, from, to: null });   // its thread is gone
      }
    }
    this.known = new Map(data.threads.map((t) => [t.id, t]));
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
      d.room = s.key.split("#")[0];
      d.el.dataset.slot = s.key;
      if (d.threadId && (nowRoom.get(d.threadId) !== d.room || moving.some((m) => m.t.id === d!.threadId) || this.transit.has(d.threadId))) d.el.classList.add("arriving");
      if (d.threadId) d.el.classList.toggle("orch-desk", d.threadId === this.orchThread);
      const cur = { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) };
      if (Math.abs(cur.x - s.x) > 1 || Math.abs(cur.y - s.y) > 1) {
        this.slideDesk(d, s);
      }
    }
    // desks whose seat disappeared are retired properly (their robot and computer stop)
    const inUse = new Set(this.slotDesks.values());
    for (const d of this.allDesks) if (!inUse.has(d)) { this.allDesks.delete(d); if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); }
    // leaving a desk: it gets up from its chair; leaving the break room, questions or park: that
    // room walks it to its door and hands it over there
    for (const m of moving) this.move(m.t, m.from, m.to, desksBefore.get(m.t.id) ?? null);
    // robots that finished longer ago than the break room's latest eight go out to the park
    const info = (t: WThread) => ({ id: t.id, provider: t.provider, title: t.title, model: t.model, name: this.roster.byThread(t.id)?.name, look: this.roster.byThread(t.id)?.look });
    // in rain, storms or snow nobody stays in the park
    const wet = this.outdoorsWet;
    this.park.wet = wet;
    this.park.rainSoon = wet && !["rain", "drizzle", "storm", "snow"].includes(this.weather?.kind ?? "");
    this.extLists = { brk: brkShown.map(info), queue: queue.map((t) => ({ ...info(t), question: t.question })), park: wet ? [] : brk.slice(8, 14).map(info), orch: orchT ? { ...info(orchT), running: orchT.runStatus === "running" } : null };
    this.pushExt();
    this.onRooms(rooms);
    if (JSON.stringify([...this.seats]) !== seatsBefore) this.onLayoutChange();
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

  // Desks and rooms outside the view are not painted at all; their robots keep working, nobody
  // sees it. Worked out from the camera every time it moves (a browser visibility observer can
  // miss a change and leave a desk hidden when it comes back into view).
  private cullSet = new Set<HTMLElement>();
  private cull = {
    observe: (el: HTMLElement) => { this.cullSet.add(el); this.recull(); },
    unobserve: (el: Element) => { this.cullSet.delete(el as HTMLElement); },
  };
  private recull() {
    const box = this.sceneBox ?? (this.sceneBox = this.scene.getBoundingClientRect());
    const s = this.cam.s || 1, m = 160 / s;
    const x0 = -this.cam.x / s - m, y0 = -this.cam.y / s - m, x1 = x0 + box.width / s + 2 * m, y1 = y0 + box.height / s + 2 * m;
    for (const el of this.cullSet) {
      if (!el.isConnected) { this.cullSet.delete(el); continue; }
      const st = el.style, desk = el.classList.contains("desk-unit");
      const l = parseFloat(st.left) || 0, t = parseFloat(st.top) || 0;
      const w = desk ? UNIT_W : parseFloat(st.width) || 0, h = desk ? UNIT_H : parseFloat(st.height) || 0;
      const out = l + w < x0 || l > x1 || t + h < y0 || t > y1;
      if (out !== el.classList.contains("culled")) el.classList.toggle("culled", out);
    }
    this.fitBubbles();
  }
  // A thought bubble opens to the right of the robot's head; when that side is off screen or under
  // the side chat, it opens to the left instead.
  private fitBubbles() {
    const box = this.sceneBox;
    if (!box) return;
    const s = this.cam.s, right = box.width - this.panelWidth - 8;
    for (const d of this.allDesks) {
      const b = d.el.querySelector(".bubble.show") as HTMLElement | null;
      if (!b) continue;
      const left = parseFloat(d.el.style.left) || 0, BW = 234;  // bubble width with its padding
      const l0 = this.cam.x + (left + 248) * s, r0 = l0 + BW * s;          // opening to the right
      const r1 = this.cam.x + (left + 400 - 248) * s, l1 = r1 - BW * s;    // opening to the left
      let flip = false, shift = 0;
      if (r0 > right) {
        if (l1 >= 8) flip = true;
        // zoomed in close neither side fits: slide it along until it is all in view
        else shift = Math.max(0, Math.min((r0 - right) / s, (l0 - 8) / s));
      }
      if (flip !== b.classList.contains("flip")) b.classList.toggle("flip", flip);
      const want = shift ? `${(248 - shift).toFixed(0)}px` : "";
      if (b.style.left !== want) b.style.left = want;
    }
  }

  private makeDesk(x: number, y: number) {
    const d = new Desk(this.deskLayer, x, y, this.services);
    this.cull.observe(d.el);
    d.onSay = () => this.fitBubbles();
    d.director.attachDir = this.attachDir;
    d.director.childItems = (id, since) => (window as any).lucid.itemsSince(id, since);
    this.allDesks.add(d);
    this.wireDeskDrag(d);
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

  onLayoutChange: () => void = () => {};
  private deskDragActive = false;
  private slidingDesks = new Set<Desk>();
  private slideDesk(d: Desk, at: Pt) {
    d.baseZ = Math.round(at.y);
    for (const w of this.transit.values()) w.stop();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.killTweensOf(d.el, "left,top"); gsap.set(d.el, { left: at.x, top: at.y }); d.lift("move", false); return;
    }
    gsap.to(d.el, { left: at.x, top: at.y, duration: 0.3,
      ease: "power3.out", overwrite: "auto", onUpdate: () => { d.baseZ = Math.round(this.deskPos(d).y); d.lift("move", false); },
      onComplete: () => { this.slidingDesks.delete(d); }, onInterrupt: () => { this.slidingDesks.delete(d); } });
    this.slidingDesks.add(d);
  }

  private wireDeskDrag(d: Desk) {
    d.el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(".screen, .poke, button, input, textarea")) return;
      const entries = [...this.slotDesks].filter(([key]) => key.split("#")[0] === d.room).sort((a, b) => Number(a[0].split("#")[1]) - Number(b[0].split("#")[1]));
      const original = entries.map(([, desk]) => desk), source = original.indexOf(d);
      if (source < 0) return;
      e.stopPropagation(); e.preventDefault();
      try { d.el.setPointerCapture(e.pointerId); } catch { /* synthetic/offscreen pointer */ }
      const start = this.deskPos(d), x0 = e.clientX, y0 = e.clientY;
      let z = this.cam.s;
      const room = this.roomById(d.room)!;
      const { cols } = officeSize(entries.length);
      const positions = original.map((_, i) => ({ x: room.x + 70 + (i % cols) * SLOT_W, y: room.y + WALL_FACE + 40 + Math.floor(i / cols) * SLOT_H }));
      let active = false, target = source, ended = false;
      let preview: HTMLElement | null = null;
      const arrange = (index: number) => { const order = [...original]; order.splice(source, 1); order.splice(index, 0, d); return order; };
      const move = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!active) {
          active = this.deskDragActive = this.dragged = true;
          this.stopFollow(); gsap.killTweensOf(this.cam);
          z = this.cam.s;
          for (const w of this.transit.values()) w.stop();
          for (const desk of original) gsap.killTweensOf(desk.el, "left,top");
          document.body.classList.add("desk-dragging"); window.getSelection()?.removeAllRanges();
          d.el.classList.add("desk-grabbed");
          preview = document.createElement("div"); preview.className = "desk-drop-preview"; preview.textContent = "Place desk here";
          this.deskLayer.appendChild(preview);
        }
        ev.preventDefault();
        const x = Math.max(room.x + 22, Math.min(room.x + room.w - UNIT_W - 22, start.x + (ev.clientX - x0) / z));
        const y = Math.max(room.y + WALL_FACE + 12, Math.min(room.y + room.h - UNIT_H - 22, start.y + (ev.clientY - y0) / z));
        gsap.set(d.el, { left: x, top: y });
        let next = target, distance = Infinity;
        positions.forEach((p, i) => { const dist = Math.hypot(x - p.x, y - p.y); if (dist < distance) { distance = dist; next = i; } });
        if (next !== target) { target = next; arrange(target).forEach((desk, i) => { if (desk !== d) this.slideDesk(desk, positions[i]); }); }
        preview!.style.left = `${positions[target].x + 24}px`; preview!.style.top = `${positions[target].y + 170}px`;
      };
      const finish = (commit: boolean, waitForRelease = false) => {
        if (ended) return;
        ended = true;
        d.el.removeEventListener("pointermove", move); d.el.removeEventListener("pointerup", up);
        d.el.removeEventListener("pointercancel", cancel); d.el.removeEventListener("lostpointercapture", cancel);
        window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel);
        try { d.el.releasePointerCapture(e.pointerId); } catch {}
        if (!active) return;
        const order = commit ? arrange(target) : original;
        order.forEach((desk, i) => { this.slotDesks.set(entries[i][0], desk); this.slideDesk(desk, positions[i]); });
        if (commit) this.seats.set(d.room, order.map((desk) => desk.threadId));
        preview?.remove(); d.el.classList.remove("desk-grabbed"); document.body.classList.remove("desk-dragging");
        this.deskDragActive = false;
        // Capture phase also suppresses monitor and toy click handlers on release.
        const eat = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
        const eatClick = () => {
          window.addEventListener("click", eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", eat, true), 0);
        };
        if (waitForRelease) window.addEventListener("pointerup", eatClick, { capture: true, once: true }); else eatClick();
        setTimeout(() => { this.dragged = false; }, 0);
        if (this.lastData) this.update(this.lastData);
        if (commit) this.onLayoutChange();
      };
      const up = () => finish(true), cancel = () => finish(false);
      const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(false, true); } };
      d.el.addEventListener("pointermove", move); d.el.addEventListener("pointerup", up);
      d.el.addEventListener("pointercancel", cancel); d.el.addEventListener("lostpointercapture", cancel);
      window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
    });
  }

  private threadDropPreview: HTMLElement | null = null;
  threadDropZone(x: number, y: number): string | null {
    const rect = this.scene.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const at = { x: (x - rect.left - this.cam.x) / this.cam.s, y: (y - rect.top - this.cam.y) / this.cam.s };
    return this.rooms.find((r) => ["main", "project", "freelance"].includes(r.kind) && at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h)?.id ?? null;
  }
  previewThreadDrop(roomId: string | null) {
    this.threadDropPreview?.remove(); this.threadDropPreview = null;
    const room = this.roomById(roomId);
    if (!room) return;
    const el = document.createElement("div"); el.className = "office-drop-preview"; el.textContent = `Move to ${room.title}`;
    el.style.cssText = `left:${room.x + 16}px;top:${room.y + WALL_FACE}px;width:${room.w - 32}px;height:${room.h - WALL_FACE - 16}px`;
    this.deskLayer.appendChild(el); this.threadDropPreview = el;
  }
  placeThread(id: string, roomId: string) {
    const room = this.roomById(roomId), t = this.lastData?.threads.find((t) => t.id === id);
    if (!room || !t || id === this.orchThread || !["main", "project", "freelance"].includes(room.kind)) return false;
    this.homes.set(id, roomId);
    for (const [r, seats] of this.seats) if (r !== roomId) this.seats.set(r, seats.map((seat) => seat === id ? null : seat));
    // User placement takes effect immediately. Questions can still take the robot to the queue.
    this.placed.set(id, { room: t.question ? "queue" : roomId });
    this.update(this.lastData!); this.onLayoutChange();
    return true;
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
    const r = el.getBoundingClientRect(), s = (this.sceneBox ??= this.scene.getBoundingClientRect());
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
    const where = el.closest(".room-break") ? "In the break room" : el.closest(".room-queue") ? (id === this.orchThread ? "At your desk" : "Waiting with a question") : el.closest(".park-layer") ? "In the park" : el.closest(".shopfront") ? "Running the shop" : "Walking";
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
      this.applySoon();
    }, { passive: false });
    let start: { x: number; y: number; cx: number; cy: number } | null = null;
    // the middle button pans too: claim it, or Chromium starts its own autoscroll and fights the pan
    s.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    s.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();
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
      this.applySoon();
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

  // Mice report movement up to 1000 times a second; the camera is drawn once per frame, so the
  // work (camera, culling, bubbles, focus check) runs at most once per frame too.
  private applyQueued = 0;
  private applySoon() {
    if (this.applyQueued) return;
    this.applyQueued = requestAnimationFrame(() => { this.applyQueued = 0; this.apply(); this.keepFocus(); });
  }
  private sceneBox: DOMRect | null = null;
  private near: boolean | null = null;
  private lastScale = 0;
  private lastX = 0;
  private lastY = 0;
  private zooming = false;
  private zoomEnd = 0;
  private far = false;
  // The camera stays on the grounds: it cannot zoom out past the whole drawing, and the view never
  // drifts off it (when the view is wider or taller than the grounds, they stay centred that way).
  private clampCam() {
    const g = this.grounds?.bounds;
    if (!g) return;
    const box = (this.sceneBox ??= this.scene.getBoundingClientRect());
    const W = box.width, H = box.height;
    if (!W || !H) return;
    // zooming out stops when the lawn and a strip of woods fill the view; the rest of the woods is only there for wide windows
    const l = this.grounds!.lawn, pad = 260;
    const c = this.cam, min = Math.max(Math.min(W / g.w, H / g.h), Math.min(W / (l.w + 2 * pad), H / (l.h + 2 * pad)));
    if (c.s < min) { const k = min / c.s; c.x = W / 2 - (W / 2 - c.x) * k; c.y = H / 2 - (H / 2 - c.y) * k; c.s = min; }
    const fit = (t: number, size: number, lo: number, len: number) =>
      len * c.s <= size ? (size - len * c.s) / 2 - lo * c.s : Math.min(-lo * c.s, Math.max(size - (lo + len) * c.s, t));
    c.x = fit(c.x, W, g.x, g.w);
    c.y = fit(c.y, H, g.y, g.h);
  }
  private apply() {
    this.clampCam();
    this.root.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    this.recull();
    // While the zoom changes, the world is scaled as one finished picture instead of being redrawn
    // at every step (that redraw kept the graphics process busy most of the time); it is redrawn
    // sharp a moment after the zoom settles.
    // Panning too: a moving picture is just slid by the graphics card (and stays sharp), instead
    // of the whole office being repainted every frame.
    if (this.cam.s !== this.lastScale || this.cam.x !== this.lastX || this.cam.y !== this.lastY) {
      this.lastScale = this.cam.s; this.lastX = this.cam.x; this.lastY = this.cam.y;
      if (!this.zooming) { this.zooming = true; this.root.classList.add("zooming"); }
      window.clearTimeout(this.zoomEnd);
      this.zoomEnd = window.setTimeout(() => { this.zooming = false; this.root.classList.remove("zooming"); }, 180);
    }
    setZoom(this.cam.s, this.cam.x, this.cam.y);
    // the weather follows the camera without measuring the page (which is slow every frame)
    if (this.fx) { this.sceneBox ??= this.scene.getBoundingClientRect(); this.fx.setCamera(this.cam, this.sceneBox, this.size.w); }
    // zoomed far out the screens are too small to read: show their glow instead of drawing them
    const far = this.cam.s < 0.3;
    if (far !== this.far) { this.far = far; this.scene.classList.toggle("far", far); }
    // small looping details (steam, swaying plants, birds) only move when you are close enough to see them
    const near = this.cam.s >= 0.6;
    if (near !== this.near) { this.near = near; this.scene.classList.toggle("near", near); }
  }

  /** Moves the view at once (a side panel changing width keeps the office still on screen). */
  panBy(dx: number, dy = 0) { this.cam.x += dx; this.cam.y += dy; this.sceneBox = null; this.apply(); }

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
  homes = new Map<string, string>();   // user-assigned home, independent of the robot's current activity
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
  /** The office's grounds: lawn, walk, plaza and the drawn outdoor bounds the camera stays within. */
  grounds: Grounds | null = null;
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
    // worked out from the camera, without measuring the page (that forced a full layout per mouse move)
    const s = this.sceneBox ?? (this.sceneBox = this.scene.getBoundingClientRect());
    const c = this.cam, dl = parseFloat(d.el.style.left) || 0, dt = parseFloat(d.el.style.top) || 0;
    const left = s.left + c.x + dl * c.s, top = s.top + c.y + dt * c.s, w = UNIT_W * c.s, h = UNIT_H * c.s;
    const r = { left, top, right: left + w, bottom: top + h, width: w, height: h };
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
    // the frame includes the project tag that sits above the monitor
    this.flyTo({ x: parseFloat(d.el.style.left) - 10, y: parseFloat(d.el.style.top) - 32, w: UNIT_W + 20, h: UNIT_H + 38 }, 18, 0.85, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  // Fill the view with the robot's screen.
  focusScreen(d: Desk) {
    this.focusDesk = d;
    this.focusMode = "screen";
    const m = GEOM.screen;
    const tag = Math.max(0, m.y + 32);   // keep the project tag above the monitor in view
    this.flyTo({ x: parseFloat(d.el.style.left) + m.x, y: parseFloat(d.el.style.top) + m.y - tag, w: m.w, h: m.h + tag }, 22, 0.9, this.panelWidth);
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
    const { look, g } = this.ground();
    this.fx?.set(this.weather, { night: v.night, season: look.season, frozen: look.frozen, ground: { puddles: g.puddles, hot: g.hot, prints: look.snowCover >= 0.3 } });
    // the real wind sways the trees (ambient.css), fog puts halos round the lamps, frost rims the windows
    const w = this.weather;
    st.setProperty("--wind", (w ? Math.min(1, Math.max(0.1, w.windKmh / 55, w.kind === "storm" ? 0.85 : 0)) : 0.2).toFixed(2));
    st.setProperty("--fog", w?.kind === "fog" ? "1" : "0");
    st.setProperty("--frost", g.frost ? "1" : "0");
    this.park.setGear(gearFor(w));
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

function officeDecor(r: Room, slots: number, theme?: RoomTheme, level = 0) {
  const { w, h, kind } = r, T = 16, { cols } = officeSize(Math.max(1, slots));
  const desks = Array.from({ length: slots }, (_, k) => ({ x: 70 + (k % cols) * SLOT_W, y: WALL_FACE + 40 + Math.floor(k / cols) * SLOT_H, w: UNIT_W, h: UNIT_H }));
  const avoid = [{ x: 30, y: T, w: 148, h: WALL_FACE - T }, ...(kind === "main" ? [{ x: w - 112, y: T, w: 64, h: 66 }] : []), ...(kind === "freelance" ? [{ x: w - 430, y: WALL_FACE - 10, w: 310, h: 70 }] : [])];
  return placeDecor(usable(theme, level), w, h, WALL_FACE, desks, { avoid, wallTop: T });
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
      <g style="opacity:var(--frost, 0)"><rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#frost${uid})"/>
        <path d="M${wx + 3} ${T + 34}l9 -5l-4 -6M${wx + 10} ${T + 24}l6 7M${wx + ww - 4} ${WALL_FACE - 26}l-10 -4l3 -7M${wx + ww - 14} ${WALL_FACE - 23}l-4 -8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.9"/></g>
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
    <g transform="translate(-90 0)">
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="58" rx="8" fill="#6b4f3a"/>
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="10" rx="5" fill="#82634b"/>
    <rect x="${w - 300}" y="${WALL_FACE + 8}" width="56" height="34" rx="6" fill="#3a3f4f"/><rect x="${w - 292}" y="${WALL_FACE + 14}" width="20" height="10" rx="3" fill="#ff9f5a"/>
    <circle cx="${w - 200}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/><circle cx="${w - 160}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/></g>
    ${Array.from({ length: Math.floor(w / 46) }, (_, i) => `<circle cx="${20 + i * 46}" cy="${WALL_FACE + 14 + Math.sin(i * 0.9) * 6}" r="4" fill="#ffd27a" style="opacity:calc(0.5 + var(--lamp) * 0.5)"/>`).join("")}` : "";
  // the room's furnishing: placed around the desks, never on them
  let decorSvg: string | null = null;
  const items = usable(theme, level);
  if (items.length) {
    decorSvg = officeDecor(r, slots, theme, level).map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("");
  }
  return /* svg */ `
  <svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <radialGradient id="frost${uid}" r="0.75"><stop offset="0.45" stop-color="#eef6fb" stop-opacity="0"/><stop offset="0.85" stop-color="#eef6fb" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.95"/></radialGradient>
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
