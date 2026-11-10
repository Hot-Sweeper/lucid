import { officeColumns, officeDimensions, mountOfficeWidth, releaseOfficeWidth } from "./office-width";
import { currentTheme } from "../themes/registry";
import { setRobotModes } from "../world/robot-power";
import { LOD_PX, monitorPx } from "../perf/lod";
import type { RobotLook } from "./rig";
import { gameSound } from "./sound";
import { printerArt, printerStation } from "./printer";
import { subscriptionBatteries, needsCharge } from "./battery";
import type { Usage } from "../stats/stats";
import { chargingSize } from "../world/charging";
import gsap from "gsap";
import { setZoom, setCameraMoving } from "../world/budget";
import { canvasRobotsWanted, syncRobotCanvases } from "../world/robot-canvas";
import { watchSvgOpacity } from "../perf/svg-write";
import { GLIDE_MS, GLIDE_EASING, GLIDE_EASE, cubicBezier } from "../perf/ease";
import { Desk, UNIT_W, UNIT_H, shortTitle, type DeskServices } from "./desk";
import { drawFloor, drawWall, drawDecor, placeDecor, decorFootprint, DECOR } from "../decor/decor";
import { furniturePath, type Footprint } from "./navigation";
import { forestPlan } from "./forest-plan";
import { mountNativeContourCull } from "./outside-cull";
import { campusNight } from "./campus-light";
import { campusPlan, districtPlan } from "./campus-plan";
import { buildingState, type EnvironmentBuilding } from "./environments";
import { officePlan, hallRoute, hallPreference, inHall, type OfficePlan } from "./floor-plan";
import { buildingFootprint, footprintCovers } from "./building-footprint";
import { hasOfficeWork, hasOfficeDesk, reserveRoomSeats, remainingDeskExtras, snakeSeat, projectRoomSeats, reorderPhysicalSeats, layoutMeeting, layoutWaitingSpots, layoutSafeAt, addDeskPlace, FOLDED_OFFICE } from "./room-policy";
import type { RoomTheme } from "./decorate";
import { Park } from "./park";
import { Walker, SIT_HEAD, pause, type Facing } from "../world/walker";
import { makeInteractive, whenFree, isHeld } from "./interact";
import { GEOM, type Pt } from "./rig";
import { mountWeather, applySkyTint, type WeatherLayer, type Weather } from "../weather/effects";
import { outdoorLook, seasonPalette } from "../weather/season";
import { plainOutsideSvg, lookFor, groundsLayout, PARK_W, PARK_H, type Grounds } from "./outside";
import { groundWx, groundSig, isWet, puddleSpots, type Puddle } from "../weather/ground";
import { gearFor } from "../weather/gear";
import { ambientPlant } from "./ambient";
import { Roster, type RobotProfile } from "./roster";
import { updateOutside } from "./outside-zoom";
import { LandscapeTiles } from "./landscape-tiles";
import { planLandscape, landColors, type LandPlan } from "./landscape";
import { setRenderView } from "../perf/render";
import { beginSystem, endSystem } from "../perf/metrics";
import { cafeTiles, plankJoints } from "../perf/floor-paths";
import { vectorOwner, releaseVectors } from "../perf/shared-vector";
import { cacheStaticArt, updateStaticArt, invalidateStaticArt, destroyStaticArt } from "../perf/static-art";
import { orderedRooms, moveRoomOrder, movableRoom } from "./room-order";
import { mountTouchCamera } from "./touch-camera";
import { exposedScene } from "./exposed-scene";
import { wireDeskChatTargets } from "./desk-chat-targets";
import { icon } from "../ui/icons";



// The whole building, seen fake top-down: rooms laid out on a floor plan, one shared camera.
// Offices hold desks (one per thread). Desks live in one layer above the rooms, so a robot
// keeps its computer and state when it moves to another room.

export type WThread = {
  id: string; projectId: string; title: string; updatedAt: string; provider: string;
  ultra?: boolean; fast?: boolean; effort?: string;
  runStatus: string | null; pinned: boolean; settled: boolean; question: string | null; model: string | null;
  schedule?: { nextRunAt: string | null; everyMs: number | null } | null;
  folder?: string | null;
  /** A job the thread left running after its turn (electron/background-jobs.cjs), from systemd. */
  job?: { unit: string; name: string; state: "running" | "failed"; since?: string | null; reason?: string; result?: string; progress?: string } | null;
  branch?: string | null; lastStatus?: string | null; runStartedAt?: string | null; unseen?: boolean;
  coinPending?: boolean;
  completionPending?: boolean;
};
export type WProject = { id: string; title: string; root: string; icon: string | null; scratch: boolean };
export type WorldData = { nativeEnvironmentId?: string; environmentId?: string; projects: WProject[]; threads: WThread[]; models?: Record<string, string[]>; prices?: Record<string, { input: number; output: number }> };

export type OfficeLayout = {
  roomOrder: string[]; expandedRooms: string[]; collapsedRooms?: string[]; roomColumns?: Record<string, number>; hidden: string[];
  extra: Record<string, number>; homes: Record<string, string>;
  seats: Record<string, (string | null)[]>; themes: Record<string, RoomTheme>;
};
export type RoomKind = "main" | "project" | "freelance" | "break" | "queue" | "charging";
export type Room = { id: string; kind: RoomKind; title: string; icon: string | null; x: number; y: number; w: number; h: number; el: HTMLElement; threadIds: string[]; collapsed: boolean };
type PhysicalRoomPlan = { id: string; kind: RoomKind; title: string; icon: string | null; threads: (WThread | null)[]; slots: number; w: number; h: number; collapsed: boolean;
  /** The Add a desk placeholder stands at place `slots`; the floor reserves that place. */
  ghost?: boolean };

export interface RoomExtension {
  el: HTMLElement;
  setThreads(list: { id: string; provider: string; title: string; question?: string | null }[]): void;
  onSelect: (id: string) => void;
  /** A leaving robot reached the door (room coordinates); true when the hall walker takes it from there. */
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  onDeparture?: (id: string, walker: Walker) => void;
  /** The next time this robot joins, its walker starts at this point (room coordinates), where the hall walker stopped. */
  enterFrom?(id: string, at: Pt): void;
  destroy(): void;
}

const WALL_FACE = 110;   // north wall face height
const SLOT_W = UNIT_W + 20, SLOT_H = UNIT_H + 20;
const GAP = 40, HALL = 150;
const IN_FRONT = 300000;  // stacking bias for a walker getting into or out of a chair (desks raise themselves up to 100000 + y)
const WALK_SCALE = 0.42;   // every walking robot (hall, rooms, park) and the desk robots (seated.ts) share this size
const releaseRoomVectors=(el:HTMLElement)=>{releaseOfficeWidth(el);destroyStaticArt(el);for(const node of [el,...el.querySelectorAll<HTMLElement>("[data-vector-owner]")])if(node.dataset.vectorOwner)releaseVectors(node.dataset.vectorOwner)};

const LOUNGE = 230;      // extra floor below the desks for a rug, beanbags or a ping pong table
function officeSize(slots: number, lounge = 0, columns = 1) {
  return officeDimensions(slots, columns, SLOT_W, SLOT_H, lounge);
}
const columnsForRoom = (room: { w: number }) => officeColumns((room.w - 120) / SLOT_W);
/** Desk places the floor holds: every desk plus the Add a desk placeholder. Decor keeps clear of them. */
const floorSlots = (plan: PhysicalRoomPlan) => plan.slots + (plan.ghost ? 1 : 0);
/** Top-left corner of desk place `index` in world coordinates, following the snake. */
const slotOrigin = (room: { x: number; y: number; w: number }, index: number) => {
  const { c, row } = snakeSeat(index, columnsForRoom(room));
  return { x: room.x + 70 + c * SLOT_W, y: room.y + WALL_FACE + 40 + row * SLOT_H };
};
// The decorations a room asks for (all of them are free).
const usable = (t: RoomTheme | undefined) => (t?.decor ?? []).filter((d) => DECOR[d]);
const needsLounge = (t: RoomTheme | undefined) => usable(t).some((d) => DECOR[d].spot === "floor");

export class World {
  scene: HTMLElement;
  root: HTMLElement;
  rooms: Room[] = [];
  desks = new Map<string, Desk>();
  private coinHolds = new Set<string>();
  private completionHolds = new Set<string>();
  /** Settled, collected sessions whose desk stays until you remove it (main.ts keptDesks). */
  keptDesks = new Set<string>();
  setCompletionHolds(ids: Iterable<string>) { this.completionHolds = new Set(ids); }
  setCoinHolds(ids: Iterable<string>) {
    const next = new Set(ids);
    if (next.size === this.coinHolds.size && [...next].every(id => this.coinHolds.has(id))) return false;
    this.coinHolds = next;
    return true;
  }
  themes = new Map<string, RoomTheme>();
  park: Park;

  // --- robots walking between rooms --------------------------------------------------------
  // A robot that changes rooms gets up and walks: out through its room's door, along the hall,
  // in through the other door and down the aisles between the desks to its chair, where it sits
  // down and the desk robot takes over on the spot. The break room, the question line and the
  // park have walkers of their own: they hand a leaving robot over at their door and take an
  // arriving one over at the same point, so nobody pops in or out. New robots come in from
  // outside through the entrance; outdoors a robot walks in the park layer (under the night tint).
  readonly reports = new Map<string, { title: string; arrived: boolean; sent?: boolean; writing?: boolean; started?: boolean; response?: string; approved?: boolean }>();
  onReportArrived: (id: string) => void = () => {};
  queueReport(t: WThread, response = "", delivered = false) { this.reports.set(t.id, { title: t.title, arrived: delivered, writing: !delivered, response }); }
  /** An approved report sends its worker back to the desk, where the report waits to be collected. */
  setReportApproved(id: string, approved: boolean) {
    const report = this.reports.get(id);
    if (!report || !!report.approved === approved) return false;
    report.approved = approved;
    return true;
  }
  private topH = 0;
  private floorPlan: OfficePlan = officePlan([], []);
  private footprint = buildingFootprint([]);
  private viewIndoors = false;
  private geometryKey = "";
  private layoutRevision = 0;
  private routeWaiters = new Set<() => void>();
  private roomOf = new Map<string, string>();          // thread -> room id at the last update ("park" too)
  private transit = new Map<string, Walker>();
  /** Robots walking between rooms and buildings (world coordinates), for their footsteps. */
  soundWalkers() { return [...this.transit.values()].filter(w => w.el.isConnected).map(w => ({ el: w.el as HTMLElement, x: w.x, y: w.y, activity: w.activity })); }
  private trips = new Map<string, object>();           // the journey a robot in transit is on (a newer one replaces it)
  private known = new Map<string, WThread>();          // every thread at the last update, for robots whose thread went away
  private exits = new Map<string, { t: WThread; from: string; to: string | null }>();   // its source room owns the robot until the door handoff
  private parkDoor: Pt = { x: 0, y: 0 };
  private extLists: { brk: any[]; queue: any[]; charging: any[]; park: any[]; orch?: any } = { brk: [], queue: [], charging: [], park: [] };
  private bossPhases = new Map<string, {phase: "reading" | "answered" | "asked"; text?: string}>();
  private get hallY() { return this.topH + HALL / 2; }
  private roomById(id: string | null) { return id ? this.rooms.find((r) => r.id === id) ?? null : null; }
  // the door on the hall side of a room: [just outside in the hall, just inside the room]
  private door(r: Room): [Pt, Pt] {
    if (r.y + r.h <= this.topH + 1) {   // top row: door in the south wall
      const x = r.x + r.w / 2;
      return [{ x, y: r.y + r.h + 34 }, { x, y: r.y + r.h - 40 }];
    }
    const x = r.x + r.w - 46;           // project office: door in the north wall, right corner
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
  private wayOut(p: Pt): Pt[] | null {
    if (this.outside(p)) return [];
    if (inHall(this.floorPlan, p)) return [];
    const r = this.rooms.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);
    if (!r) return null;
    const [out, inn] = this.door(r);
    return [{ x: p.x, y: inn.y }, inn, out];
  }
  private wakeRoutes() { for (const wake of this.routeWaiters) wake(); }
  private waitForRoute(revision: number) {
    if (revision !== this.layoutRevision) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const wake = () => { this.routeWaiters.delete(wake); this.scene.removeEventListener("pointerup", wake); resolve(); };
      this.routeWaiters.add(wake);
      this.scene.addEventListener("pointerup", wake, { once: true });
    });
  }
  /** The whole way from `p` to where the robot is going (see `travel`). */
  private route(p: Pt, id: string, to: string | null) {
    const departure = this.wayOut(p), pts = departure ?? [];
    const toRoom = this.roomById(to);
    const owned = this.desks.get(id);
    const desk = toRoom && owned?.room === to ? owned : null;
    let blocked = departure === null;
    const throughHall = (target: Pt) => {
      const path = hallRoute(this.floorPlan, pts.at(-1) ?? p, target, hallPreference(id));
      if (path) pts.push(...path); else blocked = true;
    };
    const startOut = this.outside(p), endOut = !toRoom;   // the park, or away
    // Robots never queue outside the building for a fold. Their normal route already
    // leaves the changing office, and promotion waits only for that floor to clear.
    const meeting = this.physicalLayoutHeld && this.layoutParticipants.has(id) ? this.meetingSpots.get(id) ?? this.pendingMeeting : null;
    if (meeting && !meeting.outside) {
      if (startOut) pts.push(this.parkDoor, this.entrance());
      throughHall(meeting);
      return { pts, desk: null as Desk | null, deskAt: null as Pt | null, blocked, revision: this.layoutRevision, rendezvous: true };
    }
    // A resumed journey already inside its destination goes straight to the chair.
    // Sending it back through the hall creates long loops after layout changes.
    if (desk && toRoom && p.x >= toRoom.x && p.x <= toRoom.x + toRoom.w &&
        p.y >= toRoom.y + WALL_FACE && p.y <= toRoom.y + toRoom.h) {
      const deskAt = this.deskPos(desk), seat = this.seatAt(deskAt);
      const side = { x: seat.x + (p.x < seat.x ? -62 : 62), y: seat.y };
      const path = furniturePath(p, side, this.furniture(toRoom), this.walkBounds(toRoom));
      return { pts: path ? [...path, seat] : [], desk, deskAt, blocked: !path, revision: this.layoutRevision, rendezvous: false };
    }
    if (startOut && !endOut) pts.push(this.parkDoor, this.entrance());
    if (!startOut && endOut) { throughHall(this.entrance()); pts.push(this.parkDoor); }
    let deskAt: Pt | null = null;
    if (toRoom) {
      const [out, inn] = this.door(toRoom);
      throughHall(out);
      if (desk) { deskAt = this.deskPos(desk); pts.push(...this.toSeat(toRoom, deskAt)); }
      else pts.push(inn);
    } else if (to !== "park") pts.push({ x: this.parkDoor.x + 110, y: this.parkDoor.y });   // away down the path
    return { pts, desk, deskAt, blocked, revision: this.layoutRevision, rendezvous: false };
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
    this.prepareJourney(w);
    return w;
  }

  private prepareJourney(w: Walker, origin: () => Pt = () => ({ x: 0, y: 0 })) {
    w.shortcutView = () => {
      // Conservative during any camera motion: the compositor may be showing an
      // earlier camera position. Following a worker always preserves its full journey.
      if (this.followEl || this.glideSpan || this.cameraTween?.isActive() || this.dragged || this.zooming ||
          this.deskDragActive || this.slidingDesks.size || isHeld(w)) return null;
      const box = this.sceneBox;
      if (!box || box.width <= 0 || box.height <= 0 || this.cam.s <= 0) return null;
      // Coordinates in both transit layers are world coordinates. Include hats,
      // carried papers, antenna spring and a screen-space approach before entry.
      const s = this.cam.s, padX = 90, padY = 260 + 48 / s, offset = origin();
      const visibleWidth = box.width - this.journeyInsets.left - this.journeyInsets.right;
      if (visibleWidth <= 0) return null;
      return { x: (this.journeyInsets.left - this.cam.x) / s - padX - offset.x, y: -this.cam.y / s - padY - offset.y,
        w: visibleWidth / s + 2 * padX, h: box.height / s + 2 * padY };
    };
  }

  private prepareDeparture(id: string, w: Walker, origin?: () => Pt) {
    this.prepareJourney(w, origin);
    const t = this.lastData?.threads.find(t => t.id === id);
    w.setRunning(!!t && hasOfficeWork(t) && !t.question, this.isSprinting(id));
  }

  private sprinting = new Map<string, number>();
  /** A worker that was just hired sprints to its desk. The mark expires if it never gets there. */
  sprint(threadId: string) { this.sprinting.set(threadId, Date.now() + 90_000); }
  private isSprinting(id: string) {
    const until = this.sprinting.get(id);
    if (until && until < Date.now()) this.sprinting.delete(id);
    return !!until && until >= Date.now();
  }

  /** Walks a list of points; at the entrance the robot steps from the hall layer to the outdoors layer or back. */
  private async walkLegs(t: WThread, pts: Pt[], trip: object, revision = this.layoutRevision) {
    let i = 0;
    while (i < pts.length) {
      const w = this.transit.get(t.id);
      if (!w || this.trips.get(t.id) !== trip || revision !== this.layoutRevision) return;
      const out = this.outside(pts[i]);
      if (out !== (w.el.parentElement === this.park.layer)) {
        // through the entrance: the same robot, now drawn in the other layer
        this.spawn(t, { x: w.x, y: w.y }, w.facing, out);
        w.destroy();
        continue;
      }
      // Re-plan each leg against the actual furniture, including bought decorations.
      while (this.deskDragActive || this.slidingDesks.size) { await pause(0.1); if (this.trips.get(t.id) !== trip || revision !== this.layoutRevision) return; }
      const j = i + 1, from = { x: w.x, y: w.y }, goal = pts[i];
      const room = this.rooms.find((r) => ["main", "project", "freelance"].includes(r.kind) &&
        from.x >= r.x && from.x <= r.x + r.w && from.y >= r.y && from.y <= r.y + r.h &&
        goal.x >= r.x && goal.x <= r.x + r.w && goal.y >= r.y && goal.y <= r.y + r.h);
      const path = room ? furniturePath(from, goal, this.furniture(room), this.walkBounds(room)) : [goal];
      if (!path) return; // stay put and let travel retry, never walk through a blocked aisle
      const current = this.lastData?.threads.find((thread) => thread.id === t.id) ?? t;
      const sprint = !this.reports.has(t.id) && this.isSprinting(t.id) && !current.question;
      w.setRunning(sprint || this.reports.has(t.id) || hasOfficeWork(current) && !current.question && !!this.desks.get(t.id)?.el.classList.contains("arriving"), sprint);
      await w.walkPath(path, j < pts.length && this.outside(pts[j]) === out);
      if (this.transit.get(t.id) !== w || this.trips.get(t.id) !== trip || revision !== this.layoutRevision) return;
      const last = pts[j - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) > 8) return;   // picked up on the way: the caller plans again
      i = j;
    }
  }

  private furniture(r: Room): Footprint[] {
    if (r.collapsed) return [];
    const blocks: Footprint[] = [];
    for (const d of this.slotDesks.values()) if (d.room === r.id) {
      const p = this.deskPos(d);
      // The upright monitor occupies the north end of the workstation too.
      // Keep passing robots out of its screen instead of drawing them over it.
      blocks.push({ x: p.x + GEOM.monitor.x, y: p.y + GEOM.monitor.y, w: GEOM.monitor.w, h: GEOM.monitor.h });
      blocks.push({ x: p.x + 34, y: p.y + 180, w: 332, h: 88 }, { x: p.x + 164, y: p.y + 285, w: 72, h: 64 });
    }
    if (["main", "project", "freelance"].includes(r.kind)) {
      const f = printerStation(r.h).footprint;
      blocks.push({ ...f, x: r.x + f.x, y: r.y + f.y });
    }
    const plan = this.physicalPlans.find((p) => p.id === r.id);
    const slots = plan ? floorSlots(plan) : 0;
    // Walkers keep off the placeholder too, so a desk built there never lands on a route.
    if (plan?.ghost) { const g = slotOrigin(r, plan.slots); blocks.push({ x: g.x + 34, y: g.y + GEOM.monitor.y, w: 332, h: 264 }); }
    for (const p of officeDecor(r, slots, this.themes.get(r.id))) {
      const b = decorFootprint(p); if (b) blocks.push({ ...b, x: b.x + r.x, y: b.y + r.y });
    }
    if (!usable(this.themes.get(r.id)).length) blocks.push(
      { x: r.x + r.w - 82, y: r.y + r.h - 86, w: 44, h: 26 }, { x: r.x + 34, y: r.y + r.h - 84, w: 38, h: 24 });
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
    this.wakeRoutes();
    let w: Walker;
    if ("walker" in from) {
      w = from.walker; w.stop(); w.zBias = 0;
      gsap.killTweensOf(w.el); w.el.style.opacity = "1";
    }
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
        const revision = this.layoutRevision;
        await this.walkLegs(t, back.slice(0, 2), trip, revision);
        if (this.trips.get(t.id) !== trip || this.transit.get(t.id) !== w) return;
        w.zBias = 0;
        if (this.reports.has(t.id) && revision === this.layoutRevision) {
          const pickup = printerStation(r.h).pickup;
          const printer = { x: r.x + pickup.x, y: r.y + pickup.y };
          await this.walkLegs(t, [printer], trip, revision);
          if (this.trips.get(t.id) !== trip) return;
          if (Math.hypot(w.x - printer.x, w.y - printer.y) < 12) {
            w.face("left"); w.say("Printing report...", 1600);
            gameSound.at("servo", r.el, .6);
            const sheet = r.el.querySelector(".report-sheet");
            if (sheet) gsap.fromTo(sheet, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2 });
            await pause(1.4);
            if (this.trips.get(t.id) !== trip) return;
            gameSound.at("paper", r.el, .7);
            w.carryReport(`Report: ${t.title}`);
            if (sheet) gsap.set(sheet, { opacity: 0 });
            w.setRunning(true);
          }
        }
        if (revision === this.layoutRevision) await this.walkLegs(t, back.slice(2), trip, revision);
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
      if (plan.blocked) {
        await this.waitForRoute(plan.revision);
        const current = this.transit.get(t.id);
        if (!current || this.trips.get(t.id) !== trip) return;
        plan = this.route({ x: current.x, y: current.y }, t.id, to);
        continue;
      }
      // the last steps (beside the chair, into it) are drawn over the desk, whatever raised it
      const near = plan.desk ? 2 : 0, n = plan.pts.length;
      const w0 = this.transit.get(t.id);
      if (w0) w0.zBias = 0;
      await this.walkLegs(t, plan.pts.slice(0, n - near), trip, plan.revision);
      const at = this.transit.get(t.id), mid = plan.pts[n - near - 1];
      if (near && at && this.trips.get(t.id) === trip && plan.revision === this.layoutRevision && (!mid || Math.hypot(at.x - mid.x, at.y - mid.y) <= 8)) {
        at.zBias = IN_FRONT;
        await this.walkLegs(t, plan.pts.slice(n - near), trip, plan.revision);
      }
      const cur = this.transit.get(t.id);
      if (!cur || this.trips.get(t.id) !== trip) return;
      w = cur;
      const end = plan.pts[plan.pts.length - 1];
      if (plan.rendezvous) {
        await whenFree(w);
        if (this.transit.get(t.id) !== w || this.trips.get(t.id) !== trip) return;
        if (end && Math.hypot(w.x - end.x, w.y - end.y) > 8) {
          // A blocked aisle or an interrupted drag is not a completed handoff.
          // Yield before retrying so a failed leg cannot starve input and frames
          // with travel/update microtasks, and keep the existing actor and trip.
          await pause(0.1);
          if (this.transit.get(t.id) !== w || this.trips.get(t.id) !== trip) return;
          plan = this.route({ x: w.x, y: w.y }, t.id, to);
          continue;
        }
        this.reconcilePhysicalLayout();
        await Promise.resolve();
        if (this.trips.get(t.id) !== trip) return;
        if (plan.revision === this.layoutRevision && this.physicalLayoutHeld && (!end || Math.hypot(w.x - end.x, w.y - end.y) <= 8)) await this.waitForRoute(plan.revision);
        if (this.trips.get(t.id) !== trip) return;
        plan = this.route({ x: w.x, y: w.y }, t.id, to);
        continue;
      }
      const d = plan.desk, moved = !!d && (this.desks.get(t.id) !== d || !d.el.isConnected || Math.hypot(this.deskPos(d).x - plan.deskAt!.x, this.deskPos(d).y - plan.deskAt!.y) > 1);
      if (plan.revision === this.layoutRevision && !moved && (!end || Math.hypot(w.x - end.x, w.y - end.y) <= 8)) {
        if (d) {
          w.face("up"); w.do("sit");
          await pause(0.55);
          if (this.trips.get(t.id) !== trip) return;
          // A room may grow during the sitting animation, too. Keep the same trip
          // and walk to its current chair before revealing the seated actor.
          const seatMoved = this.desks.get(t.id) !== d || !d.el.isConnected || Math.hypot(this.deskPos(d).x - plan.deskAt!.x, this.deskPos(d).y - plan.deskAt!.y) > 1;
          if (plan.revision === this.layoutRevision && !seatMoved && !isHeld(w) && Math.hypot(w.x - end!.x, w.y - end!.y) <= 8) break;
          w.calm();
        } else break;
      }
      await whenFree(w);
      await pause(0.1);
      plan = this.route({ x: w.x, y: w.y }, t.id, to);
    }
    if (this.trips.get(t.id) !== trip) return;
    const desk = plan.desk && this.desks.get(t.id) === plan.desk ? plan.desk : null;
    const done = w;
    if (desk) {
      // It turns and sits; switch actors in the same frame, in the same chair.
      if (this.trips.get(t.id) !== trip) return;
      this.sprinting.delete(t.id);
      desk.setSeated(true);
      gameSound.at("servo", desk.el, .35);
      done.destroy();
    } else if (to && to !== "park") {
      // the room's own walker takes over just inside the door
      const r = this.roomById(to), ext = this.ext[to as "break" | "queue" | "charging"];
      if (r && ext?.enterFrom) ext.enterFrom(t.id, { x: done.x - r.x, y: done.y - r.y });
      done.destroy();
    } else if (to === "park") done.destroy();   // the park's own walker steps out of the same door
    else {
      await new Promise<void>((resolve) => gsap.to(done.el, { opacity: 0, duration: 0.4, onComplete: resolve }));
      if (this.trips.get(t.id) !== trip) return;
      done.destroy();
    }
    this.trips.delete(t.id);
    this.transit.delete(t.id);
    this.pushExt();
    this.reconcilePhysicalLayout();
  }

  /** A room's walker reached its door on the way out (world coordinates): the hall walker takes over. */
  private handOver(id: string, at: Pt, face: Facing) {
    const ex = this.exits.get(id);
    if (!ex) return false;
    this.exits.delete(id);
    void this.travel(ex.t, { at, face }, ex.to);
    return true;
  }

  /** A robot changes rooms (`to` null: its thread is gone and it leaves the building). */
  private move(t: WThread, from: string | null, to: string | null, seat: Pt | null) {
    const desk = to ? this.desks.get(t.id) : undefined;
    if (desk) desk.setSeated(false);
    const ex = this.exits.get(t.id);
    if (ex) { ex.t = t; ex.to = to; return; }                 // still walking out of its room: it goes on from the door
    const cur = this.transit.get(t.id);
    if (cur) { void this.travel(t, { walker: cur }, to); return; }
    if (seat) { void this.travel(t, { seat, room: from }, to); return; }
    if (from === "break" || from === "queue" || from === "charging" || from === "park") {
      // the room walks it to its door first and hands it over there (handOver)
      this.exits.set(t.id, { t, from, to });
      return;
    }
    const r = this.roomById(from);
    void this.travel(t, r ? { at: this.door(r)[1], face: "down" } : { outside: true }, to);
  }

  /** What the orchestrator is doing with a robot's question, shown at the questions desk. */
  bossDecision(threadId: string, phase: "reading" | "answered" | "asked" | null, text?: string) {
    if (phase) this.bossPhases.set(threadId, {phase, text});
    else this.bossPhases.delete(threadId);
    (this.ext.queue as any)?.decision?.(threadId, phase, text);
  }

  // break room, question line and park only show robots that are actually there
  private pushExt() {
    // Waiting for a source room is still a journey. Showing the destination now created
    // a second robot while the first was walking to its old room's door.
    const here = (l: any[]) => l.filter((x) => !this.transit.has(x.id) && !this.exits.has(x.id));
    this.ext.break?.setThreads(here(this.extLists.brk) as any);
    this.ext.charging?.setThreads(here(this.extLists.charging) as any);
    const line = this.ext.queue as any;
    if (line) line.onReportArrived = (id: string) => {
      const report = this.reports.get(id);
      if (report && !report.arrived) { report.arrived = true; this.onReportArrived(id); }
    };
    this.ext.queue?.setThreads(here(this.extLists.queue) as any);
    for (const [id, state] of this.bossPhases) {
      if (this.reports.has(id) || this.lastData?.threads.some(t => t.id === id && t.question)) line?.decision?.(id, state.phase, state.text);
      else this.bossPhases.delete(id);
    }
    (this.ext.queue as any)?.setPresence?.(this.orchPresence);
    (this.ext.queue as any)?.setBoss?.(this.extLists.orch && !this.transit.has(this.orchThread) && !this.exits.has(this.orchThread) ? this.extLists.orch : null);
    this.park.setThreads(here(this.extLists.park));
    for (const [id, ex] of this.exits) {
      const source = ex.from === "park" ? this.park.layer : this.ext[ex.from as "break" | "queue" | "charging"]?.el;
      if (source?.querySelector(`.world-walker[data-id="${CSS.escape(id)}"]`)) continue;
      // A culled/overflow robot or a rebuilt room has no source actor to hand over.
      // Only then may the hall create it. A slow or held robot must never time out.
      const r = this.roomById(ex.from);
      this.handOver(id, r ? this.door(r)[1] : this.parkDoor, "down");
    }
  }
  // today's office event from the orchestrator, on the building's name sign
  eventName = "";
  paintEvent() {
    const b = this.root.querySelector(".building-plate b") as HTMLElement | null;
    if (!b) return;
    b.textContent = this.eventName ? `${this.building}  ·  Today: ${this.eventName}` : this.building;
  }
  // real weather and the season shape the outdoors and the light
  weather: Weather | null = null;
  private fx: WeatherLayer | null = null;
  private outArgs: Parameters<typeof plainOutsideSvg>[0] | null = null;
  private lookSig = "";
  private forestAreas: {x:number;y:number;w:number;h:number}[] = [];
  private forestRoutes: {x:number;y:number;w:number;h:number}[] = [];
  private forestBounds: {x:number;y:number;w:number;h:number} | null = null;
  private forestSig = "";
  private sceneryCull: ReturnType<typeof mountNativeContourCull> | null = null;
  private sceneryView: {x:number;y:number;w:number;h:number;density:number} | null = null;
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
    const sig = JSON.stringify(look) + groundSig(g) + this.forestSig + (document.documentElement.dataset.theme ?? "");
    if (!force && sig === this.lookSig) return;
    this.lookSig = sig;
    // Finite static garden artwork, with no animated forest or extra cache owners.
    const layer = this.root.querySelector(".outside-layer") as HTMLElement;
    this.sceneryCull?.destroy(); this.sceneryCull = null; this.sceneryView = null;
    const bounds = this.forestBounds, base = this.outArgs;
    const width = bounds ? Math.max(base.ox+base.w,bounds.x+bounds.w)-base.ox : base.w;
    const height = bounds ? Math.max(base.oy+base.h,bounds.y+bounds.h)-base.oy : base.h;
    const { plan: land, parks } = this.landscapePlan(width, height);
    // The drawing reaches well past the woodland, so even the widest zoom shows forest, not a frame.
    const pad = Math.round(Math.max(1600, Math.max(width, height) * 0.4));
    layer.style.left = `${base.ox - pad}px`; layer.style.top = `${base.oy - pad}px`;
    layer.style.width = `${width + 2 * pad}px`; layer.style.height = `${height + 2 * pad}px`;
    // the connected computers' parks get the same furniture their robots use
    const own = base.park, otherParks = parks.filter(r => r.x !== own.x || r.y !== own.y);
    layer.innerHTML = plainOutsideSvg({ ...base, ox: base.ox - pad, oy: base.oy - pad, w: width + 2 * pad, h: height + 2 * pad, ...look, wx: g, glows: land.lamps, otherParks });
    // Terrain and woodland: reusable bitmap tiles under the overlay, kept across redraws.
    this.landscape ??= new LandscapeTiles();
    layer.prepend(this.landscape.el);
    const landLook = { ...lookFor({ ...look, wx: g }), frozen: look.frozen };
    this.landscape.setScene(land, landLook, { x: base.ox - pad, y: base.oy - pad }, { w: width + 2 * pad, h: height + 2 * pad });
    this.scene.style.setProperty("--scene-ground", landColors(landLook).edge);
    this.viewLandscape();
  }
  /** Click the woodland: the stream ripples where it was clicked, a tree drops leaves. */
  private landClick(x: number, y: number) {
    const plan = this.landPlan;
    if (!plan || this.viewIndoors) return false;
    const st = plan.stream;
    if (st) for (let i = 1; i < st.pts.length; i++) {
      const [ax, ay] = st.pts[i - 1], [bx, by] = st.pts[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) <= st.w / 2) { this.park.splashAt(x, y); return true; }
    }
    let best: { x: number; y: number; r: number } | null = null, bestD = Infinity;
    for (const t of plan.treeGrid.query({ x: x - 120, y: y - 120, w: 240, h: 240 })) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= t.r && d < bestD) { best = t; bestD = d; }
    }
    if (best) { this.park.rustleAt(x, y); return true; }
    return false;
  }
  private landscape: LandscapeTiles | null = null;
  private landPlan: LandPlan | null = null;
  private landSig = "";
  /** This office and each connected one, with its own park beside it, in world coordinates. */
  private campusDistricts() {
    type R = { x: number; y: number; w: number; h: number };
    const list: { building: R; park: R | null; door: number }[] = [];
    const add = (o: World, dx: number, dy: number) => {
      const m = (r: R | null | undefined) => r ? { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h } : null;
      list.push({ building: { x: dx, y: dy, w: o.size.w, h: o.size.h }, park: m(o.outdoor?.park), door: dy + o.topH + HALL / 2 });
    };
    add(this, 0, 0);
    for (const e of this.neighbors.values()) if (e.office) add(e.office, e.x, e.y);
    return list;
  }
  /** Woodland, paths and lawns for the current campus geometry; rebuilt only when that changes. */
  private landscapePlan(width: number, height: number) {
    const base = this.outArgs!;
    const districts = this.campusDistricts();
    // each building's walk: from its door along the building into its park
    const paved: [number, number][][] = [];
    for (const d of districts) {
      const b = d.building, p = d.park; if (!p) continue;
      const walkX = b.x + b.w + 64, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      paved.push([[b.x + b.w, d.door], [walkX, d.door], [walkX, pcy], [pcx, pcy]]);
    }
    const areas = this.forestAreas.length ? this.forestAreas : districts.flatMap(d => [d.building, ...(d.park ? [d.park] : [])]);
    const parks = districts.flatMap(d => d.park ? [d.park] : []);
    const bounds = { x: base.ox, y: base.oy, w: width, h: height };
    const sig = JSON.stringify([bounds, areas, paved, this.forestRoutes, parks]);
    if (sig !== this.landSig || !this.landPlan) { this.landSig = sig; this.landPlan = planLandscape({ bounds, areas, parks, paved, routes: this.forestRoutes }); }
    return { plan: this.landPlan, parks };
  }
  private viewLandscape() {
    if (!this.landscape || this.viewIndoors || this.hostWorld) return;
    const box = this.sceneBox ??= this.scene.getBoundingClientRect(), s = this.cam.s;
    if (!box.width || !box.height || !s) return;
    this.landscape.update({ x: -this.cam.x / s, y: -this.cam.y / s, w: box.width / s, h: box.height / s }, s * (window.devicePixelRatio || 1));
  }
  freeDesks: Desk[] = [];
  private roomLayer: HTMLElement;
  private deskLayer: HTMLElement;
  private cam = { x: 0, y: 0, s: 0.4 };
  private cameraTween: ReturnType<typeof gsap.to> | null = null;
  cameraState() { return { ...this.cam }; }
  restoreCamera(state: { x: number; y: number; s: number }) {
    this.stopCameraMotion(); Object.assign(this.cam, state); this.sceneBox = null;
    this.apply(); this.keepFocus();
  }
  private cancelCameraTween() {
    this.cameraTween?.kill(); this.cameraTween = null;
    cancelAnimationFrame(this.zoomGlideRaf); this.zoomGlideRaf = 0; this.zoomGlide = null;
    this.stopGlide();
  }
  /** Wheel glides run as a compositor animation of the world transform: Chromium rasterizes
   * the world once at the glide's sharpest scale and moves it on its compositor thread, so
   * the motion keeps the display rate however busy the page is. this.cam is the glide's goal. */
  private glideAnim: Animation | null = null;
  private glideSpan: { cam: { x: number; y: number; s: number }; box: DOMRect } | null = null;
  /** Where the running glide goes and when it started, on the clock its animation uses. */
  private glidePath: { from: { x: number; y: number; s: number }; to: { x: number; y: number; s: number }; start: number } | null = null;
  /** The camera as currently shown, including a running glide. The glide's position is worked
   * out from its own timing, never read back from the page: Chromium starts a compositor animation
   * a frame or two before the page hears about it, so the computed style still reports the old
   * start and a new notch would restart from there, flashing one frame of the older view. */
  private shownCam(now = performance.now()) {
    const g = this.glidePath;
    if (!this.glideAnim || !g) return { x: this.cam.x, y: this.cam.y, s: this.cam.s };
    const p = GLIDE_EASE(Math.min(1, Math.max(0, (now - g.start) / GLIDE_MS)));
    return { x: g.from.x + (g.to.x - g.from.x) * p, y: g.from.y + (g.to.y - g.from.y) * p, s: g.from.s + (g.to.s - g.from.s) * p };
  }
  /** Stop a glide where it is now (a drag or another camera move takes over). */
  private stopGlide() {
    cancelAnimationFrame(this.shelfPaintRaf); this.shelfPaintRaf = 0;
    const anim = this.glideAnim;
    if (!anim) return;
    const shown = this.shownCam();
    this.glideAnim = null; this.glideSpan = null; this.glidePath = null;
    anim.onfinish = null; anim.cancel();
    this.fx?.setGlide(null);
    this.restoreShelfClip();
    Object.assign(this.cam, shown);
    // The page still holds the glide's goal; without this a click mid-glide jumps there.
    this.root.style.transform = `translate(${shown.x}px, ${shown.y}px) scale(${shown.s})`;
    this.applySoon();
  }
  private glideTo(s: number, px: number, py: number) {
    // One timestamp for both the old glide's position and the new glide's start, set
    // explicitly so the compositor and this code agree on where the motion is.
    const start = performance.now();
    const from = this.shownCam(start);
    const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s;
    this.cam.s = s; this.cam.x = px - wx * s; this.cam.y = py - wy * s;
    this.clampCam();
    this.glideFrom(from, start);
  }
  /** Shelf toggles lay out once, then share the existing sharp camera glide. */
  resizeForShelf(layout: () => void, animate: boolean) {
    const from = this.shownCam();
    const oldWidth = this.scene.clientWidth;
    this.cancelCameraTween();
    this.shelfLayoutCommit = true;
    try { layout(); this.resizePresentation?.(); }
    finally { this.shelfLayoutCommit = false; }
    if (animate && !this.followEl && !document.hidden && !this.scene.inert) {
      // Keep the real office drawn underneath the opening shelf until it covers
      // the newly reserved column. No screenshot, stretching, or repeated reflow.
      const extra = Math.max(0, oldWidth - this.scene.clientWidth);
      if (extra) {
        this.shelfClip = { overflow: this.scene.style.overflow, clipPath: this.scene.style.clipPath };
        this.scene.style.overflow = "visible";
        this.scene.style.clipPath = `inset(0 -${extra}px 0 0)`;
      }
      this.glideFrom(from, performance.now(), oldWidth, true);
    } else this.apply();
  }
  private shelfLayoutCommit = false;
  private shelfPaintRaf = 0;
  private shelfClip: { overflow: string; clipPath: string } | null = null;
  private restoreShelfClip() {
    if (!this.shelfClip) return;
    Object.assign(this.scene.style, this.shelfClip); this.shelfClip = null;
  }
  private glideFrom(from: { x: number; y: number; s: number }, start = performance.now(), previousWidth = 0, shelf = false) {
    // GSAP attaches a cache with functions to cam. Only numeric camera data may
    // cross into the weather worker (or postMessage aborts this camera update).
    const to = { x: this.cam.x, y: this.cam.y, s: this.cam.s };
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    const view = (c: typeof to) => ({ x0: -c.x / c.s, y0: -c.y / c.s, x1: (Math.max(box.width, previousWidth) - c.x) / c.s, y1: (box.height - c.y) / c.s });
    const a = view(from), b = view(to), k = Math.max(from.s, to.s);
    const x0 = Math.min(a.x0, b.x0), y0 = Math.min(a.y0, b.y0), x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    this.glideSpan = { cam: { s: k, x: -x0 * k, y: -y0 * k }, box: new DOMRect(box.left, box.top, (x1 - x0) * k, (y1 - y0) * k) };
    const old = this.glideAnim;
    this.glideAnim = null;
    if (old) { old.onfinish = null; old.cancel(); }
    const t = (c: typeof to) => `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
    // fill "backwards": a compositor frame stamped just before `start` shows `from`, not the goal
    const anim = this.root.animate([{ transform: t(from) }, { transform: t(to) }], { duration: GLIDE_MS, easing: GLIDE_EASING, fill: "backwards" });
    // DocumentTimeline can have a different origin from performance.now() after
    // startup. Using the performance timestamp here delays the animation while
    // shownCam already advances, so later notches jump back to an older frame.
    anim.startTime = document.timeline.currentTime ?? start;
    this.glideAnim = anim;
    this.glidePath = { from, to, start };
    this.fx?.setGlide({ from, to, start: performance.timeOrigin + start, ms: GLIDE_MS });
    if (shelf) {
      // Commit the responsive shelf and camera layers before renewing cosmetic
      // scenery caches. Layout and the live transcript are already at full size.
      this.shelfPaintRaf = requestAnimationFrame(() => {
        this.shelfPaintRaf = requestAnimationFrame(() => { this.shelfPaintRaf = 0; this.apply(); });
      });
    } else this.apply();
    anim.onfinish = () => this.endGlide(anim);
  }
  private endGlide(anim: Animation) {
    if (this.glideAnim !== anim) return;
    cancelAnimationFrame(this.shelfPaintRaf); this.shelfPaintRaf = 0;
    this.glideAnim = null; this.glideSpan = null; this.glidePath = null;
    this.fx?.setGlide(null);
    this.restoreShelfClip();
    this.apply();
  }
  /** Wheel zoom eases toward its goal (time constant ~55 ms) around the pointer. */
  private zoomGlide: { s: number; px: number; py: number; last: number } | null = null;
  private zoomGlideRaf = 0;
  private glideZoom = (now: number) => {
    this.zoomGlideRaf = 0;
    const g = this.zoomGlide;
    if (!g) return;
    const dt = Math.min(50, Math.max(0, now - g.last)); g.last = now;
    const gap = Math.log(g.s / this.cam.s);
    const ns = Math.abs(gap) < 0.003 ? g.s : this.cam.s * Math.exp(gap * (1 - Math.exp(-dt / 55)));
    const wx = (g.px - this.cam.x) / this.cam.s, wy = (g.py - this.cam.y) / this.cam.s;
    this.cam.s = ns; this.cam.x = g.px - wx * ns; this.cam.y = g.py - wy * ns;
    this.clampCam();
    this.apply();
    if (ns === g.s || this.cam.s !== ns) this.zoomGlide = null; // arrived, or held at a zoom limit
    else this.zoomGlideRaf = requestAnimationFrame(this.glideZoom);
  };
  private size = { w: 2000, h: 1600 };
  focusDesk: Desk | null = null;
  selected: Desk | null = null;
  onSelect: (d: Desk | null) => void = () => {};
  onSelectThread: (id: string) => void = () => {};
  /** A robot was clicked twice: open its worker focus view. `id` is its thread. */
  onRobotFocus: (threadId: string, anchor: Element) => void = () => {};
  onRooms: (rooms: Room[]) => void = () => {};
  roomOrder: string[] = [];
  onRoomOrder: (order: string[]) => void = () => {};
  orderRooms<T extends { id: string }>(rooms: T[]) { return orderedRooms(rooms, this.roomOrder); }
  reorderRoom(id: string, before: string | null) {
    const current = this.orderRooms(this.rooms.filter((r) => movableRoom(r.id))).map((r) => r.id);
    const next = moveRoomOrder(this.roomOrder, current, id, before);
    if (!next) return false;
    this.roomOrder = next;
    if (this.lastData) this.update(this.lastData);
    this.onRoomOrder([...next]);
    return true;
  }
  ext: Partial<Record<"break" | "queue" | "charging", RoomExtension>> = {};
  extFactory: Partial<Record<"break" | "queue" | "charging", (host: HTMLElement, w: number, h: number) => RoomExtension>> = {};
  private chargingCapacity = 6;
  setUsage(usage: Usage) { if (!usage?.limits) return; subscriptionBatteries.setUsage(usage); if (this.lastData) this.update(this.lastData); }
  private lastKey = "";
  private hasLayout = false;
  private placed = new Map<string, { room: string; pending?: { room: string; since: number } }>();
  seats = new Map<string, (string | null)[]>();   // persistent reservations, including robots on a break
  private slotDesks = new Map<string, Desk>();              // "room#index" -> desk standing there
  expandedRooms = new Set<string>();
  collapsedRooms = new Set<string>();
  roomColumns = new Map<string, number>();
  setRoomColumns(id: string, value: number) {
    const columns = officeColumns(value);
    if (columns === officeColumns(this.roomColumns.get(id))) return;
    this.roomColumns.set(id, columns);
    const room = this.rooms.find(r => r.id === id);
    if (room) gameSound.at('switch', room.el, .7);
    if (this.lastData) this.update(this.lastData);
    this.onLayoutChange();
  }
  private revealedThread: string | null = null;
  private layoutHeld = false;
  private touchLayoutHeld = false;
  private touchLayoutPending = false;
  private touchLayoutIdle = 0;
  private touchLayoutTimer = 0;
  private roomTweens = new Map<HTMLElement, gsap.core.Tween>();
  private retiringRooms = new Set<HTMLElement>();
  private retiringRoomById = new Map<string, HTMLElement>();
  private finishRoomTransitions() {
    for (const tween of [...this.roomTweens.values()]) { tween.progress(1); tween.kill(); }
    this.roomTweens.clear();
  }
  private tweenRoom(el: HTMLElement, vars: gsap.TweenVars) {
    this.roomTweens.get(el)?.kill();
    const done = () => { this.roomTweens.delete(el); el.classList.remove('room-changing'); };
    el.classList.add('room-changing');
    const tween = gsap.to(el, { ...vars, duration: .34, ease: 'power3.out', overwrite: 'auto', onComplete: done, onInterrupt: done });
    this.roomTweens.set(el, tween);
  }
  private retireRoom(el: HTMLElement, animate: boolean) {
    this.roomTweens.get(el)?.kill(); this.cull.unobserve(el);
    const id = el.dataset.roomId || '';
    const previous = this.retiringRoomById.get(id); if (previous) this.roomTweens.get(previous)?.kill();
    const remove = () => { this.roomTweens.delete(el); this.retiringRooms.delete(el); if (this.retiringRoomById.get(id) === el) this.retiringRoomById.delete(id); releaseRoomVectors(el); el.remove(); };
    if (!animate) { remove(); return; }
    el.inert = true; el.setAttribute('aria-hidden', 'true'); delete el.dataset.roomId;
    el.classList.add('room-retiring'); this.retiringRooms.add(el); this.retiringRoomById.set(id, el);
    this.roomTweens.set(el, gsap.to(el, { opacity: 0, duration: .18, ease: 'power1.out', onComplete: remove, onInterrupt: remove }));
  }
  private physicalPlans: PhysicalRoomPlan[] = [];
  private physicalLayoutHeld = false;
  private layoutParticipants = new Set<string>();
  private pendingMeeting: ReturnType<typeof layoutMeeting> | null = null;
  private meetingSpots = new Map<string, ReturnType<typeof layoutMeeting>>();
  private layoutUpdateQueued = false;
  /** Source data may be unchanged while a delayed room change is becoming due. */
  get needsRefresh() {
    if (!this.hostWorld && [...this.neighbors.values()].some(entry => entry.office?.needsRefresh)) return true;
    return this.touchLayoutPending && !this.touchLayoutHeld || !!this.pendingSeat || this.physicalLayoutHeld || [...this.placed.values()].some(p => p.pending && Date.now() - p.pending.since > 20000);
  }
  isRoomExpanded(id: string) { return !this.collapsedRooms.has(id); }
  setRoomExpanded(id: string, expanded: boolean) {
    if (this.isRoomExpanded(id) === expanded) return;
    const room = this.rooms.find(r => r.id === id);
    if (room) gameSound.at(expanded ? 'open' : 'switch', room.el, .7);
    if (expanded) { this.expandedRooms.add(id); this.collapsedRooms.delete(id); }
    else { this.expandedRooms.delete(id); this.collapsedRooms.add(id); }
    if (this.lastData) this.update(this.lastData);
    this.onLayoutChange();
  }
  revealThread(id: string | null) {
    if (this.revealedThread === id) return;
    this.revealedThread = id;
    const t = this.lastData?.threads.find((t) => t.id === id);
    if (t) { const home = this.homeForThread(t, this.lastData!.projects); this.hidden.delete(home.startsWith("p:") ? home.slice(2) : home); }
    if (this.lastData) this.update(this.lastData);
  }
  setLayoutHeld(held: boolean) {
    const was = this.layoutHeld; this.layoutHeld = held;
    if (was && !held && this.lastData) this.update(this.lastData);
  }
  private cancelTouchLayoutFlush() {
    if (this.touchLayoutIdle) window.cancelIdleCallback?.(this.touchLayoutIdle);
    if (this.touchLayoutTimer) clearTimeout(this.touchLayoutTimer);
    this.touchLayoutIdle = this.touchLayoutTimer = 0;
  }
  private holdTouchLayout(held: boolean) {
    this.touchLayoutHeld = held;
    this.cancelTouchLayoutFlush();
    if (held || !this.touchLayoutPending) return;
    const flush = () => {
      this.touchLayoutIdle = this.touchLayoutTimer = 0;
      if (this.touchLayoutHeld || !this.touchLayoutPending || !this.lastData || this.layoutHeld || this.deskDragActive) return;
      this.update(this.lastData);
    };
    // Keep release responsive too. Reconcile the newest authoritative snapshot
    // after the final camera frame, without pausing real work or supervision.
    if (window.requestIdleCallback) this.touchLayoutIdle = window.requestIdleCallback(flush, { timeout: 120 });
    else this.touchLayoutTimer = window.setTimeout(flush, 32);
  }
  private homeForThread(t: WThread, projects: WProject[]) {
    const saved = this.homes.get(t.id), p = projects.find((p) => p.id === t.projectId);
    if (saved === "main" || saved === "freelance" || (saved?.startsWith("p:") && projects.some((p) => p.id === saved.slice(2)))) return saved;
    return !p || p.scratch ? "freelance" : `p:${p.id}`;
  }
  private reconcilePhysicalLayout(force = false) {
    if ((!this.physicalLayoutHeld && !force) || this.layoutUpdateQueued) return;
    this.layoutUpdateQueued = true;
    queueMicrotask(() => { this.layoutUpdateQueued = false; if (this.lastData) this.update(this.lastData); });
  }

  // A robot only changes rooms once the new state has lasted a while, so brief flickers
  // (a turn that shows as queued, a status refresh) never make desks jump around.
  private settleRoom(t: WThread, want: string) {
    const cur = this.placed.get(t.id);
    if (!cur) { this.placed.set(t.id, { room: want }); return want; }
    if (cur.room === want) { cur.pending = undefined; return want; }
    // questions and new work never wait: the robot heads over right away
    // and an answered robot that is working again leaves the question line at once
    const urgent = this.collapsedRooms.has(cur.room) || want === "charging" || cur.room === "charging" || want === "queue" || ((hasOfficeWork(t) || this.revealedThread === t.id) && (cur.room === "break" || cur.room === "queue")) || (want === "break" && !hasOfficeWork(t) && this.revealedThread !== t.id);
    if (urgent) { this.placed.set(t.id, { room: want }); return want; }
    if (!cur.pending || cur.pending.room !== want) cur.pending = { room: want, since: Date.now() };
    if (Date.now() - cur.pending.since > 20000) { this.placed.set(t.id, { room: want }); return want; }
    return cur.room;
  }

  constructor(scene: HTMLElement, private services: DeskServices, private hostWorld: World | null = null) {
    this.roster = hostWorld?.roster ?? new Roster();
    if (hostWorld) this.layoutArchive = hostWorld.layoutArchive;
    this.scene = scene;
    scene.innerHTML = `<div class="world"><div class="outside-layer"></div><div class="building-plate"><span class="bp-dot"></span><b></b></div><div class="hall"></div><div class="room-layer"></div><div class="night-shade"></div><div class="desk-layer"></div></div>`;
    // robots in the park walk on the grass above the outdoors, under the night tint
    const worldEl = scene.querySelector(".world") as HTMLElement;
    // Semi-transparent shading becomes fill/stroke opacity (perf/svg-write.ts): far fewer
    // effect groups for Chromium to sort into GPU layers on every frame.
    watchSvgOpacity(worldEl);
    this.park = new Park(worldEl);
    worldEl.insertBefore(this.park.layer, worldEl.querySelector(".building-plate"));
    this.park.onSelect = (id) => this.onSelectThread(id);
    this.park.onDeparture = (id, w) => this.prepareDeparture(id, w);
    this.park.onExit = (id, at, face) => this.handOver(id, at, face);
    this.root = scene.querySelector(".world")!;
    this.roomLayer = scene.querySelector(".room-layer")!;
    this.deskLayer = scene.querySelector(".desk-layer")!;
    if (!hostWorld) { this.mountTouchInput(); this.camera(); }
    document.addEventListener('visibilitychange', this.visibilityPresentation);
    if (!hostWorld) window.addEventListener('pagehide', () => document.removeEventListener('visibilitychange', this.visibilityPresentation), { once: true });
    this.daylight();
    if (!hostWorld) setInterval(() => this.daylight(), 60000);
    if (!hostWorld) window.addEventListener("lucid:interface-theme", () => this.daylight());
  }

  // --- layout -------------------------------------------------------------------
  update(data: WorldData) {
    if (!this.hostWorld) for (const entry of this.neighbors.values()) if (entry.office?.needsRefresh && entry.office.lastData) entry.office.update(entry.office.lastData);
    if (this.lastData?.environmentId !== data.environmentId || !this.lastData && this.hostWorld) {
      if (this.lastData) this.rememberLayout();
      // A visible neighbor may have newer layout choices than its last saved file.
      for (const entry of this.neighbors.values()) entry.office?.rememberLayout();
      this.applyOfficeLayout(this.layoutForEnvironment(data.environmentId));
    }
    data = { ...data, threads: data.threads.map(t => ({ ...t, coinPending: !data.environmentId && this.coinHolds.has(t.id), completionPending: this.completionHolds.has(t.id) && !t.settled, kept: !data.environmentId && !!t.settled && this.keptDesks.has(t.id), reviewPending: !data.environmentId && this.reports.has(t.id) && !t.settled })) };
    this.lastData = data;
    setRobotModes(data.threads, this.root);
    if (!this.hostWorld) subscriptionBatteries.setEnabled(!data.environmentId);
    for (const [id] of this.reports) {
      const t = data.threads.find(t => t.id === id);
      if (!t || t.pinned || t.settled || hasOfficeWork(t)) this.reports.delete(id);
    }
    if (this.hasLayout && this.touchLayoutHeld) { this.touchLayoutPending = true; return; }
    if (this.deskDragActive || this.layoutHeld) return; // no physical layout changes under any held drag
    this.touchLayoutPending = false;
    const seatsBefore = JSON.stringify([...this.seats]);
    const byProject = new Map(data.projects.map((p) => [p.id, p]));
    const byThread = new Map(data.threads.map((t) => [t.id, t]));
    const previousPhysical = new Map(this.physicalPlans.flatMap((p) => p.threads.flatMap((t) => t ? [[t.id, p.id] as const] : [])));
    const retiringIds = new Set([...this.desks].filter(([id, desk]) => {
      if (this.roomOf.get(id) !== desk.room) return false;
      const t = byThread.get(id);
      return !t || needsCharge(t) || (!!t.question && desk.room !== "queue") || this.collapsedRooms.has(desk.room) || !hasOfficeDesk(t, this.revealedThread) || this.homeForThread(t, data.projects) !== desk.room;
    }).map(([id]) => id));
    const indoorJourney = [...this.transit.values()].some((w) => !this.outside(w));
    // Park visitors walk to the park gate outside the building. Their exit never
    // touches office geometry, so it must not hold a fold or expansion.
    const indoorExits = [...this.exits].filter(([, ex]) => ex.from !== "park").map(([id]) => id);
    const wasHeld = this.physicalLayoutHeld;
    let holdPhysical = this.hasLayout && this.physicalPlans.length > 0 && (retiringIds.size > 0 || indoorJourney || indoorExits.length > 0 || this.layoutParticipants.size > 0);
    const classifiedRoom = new Map<string, string>();
    const queue: WThread[] = [], main: WThread[] = [], brk: WThread[] = [], charging: WThread[] = [], rest: WThread[] = [];
    const perProject = new Map<string, WThread[]>();
    const freelance: WThread[] = [];
    const heldPark: WThread[] = [];
    const residents = new Map<string, WThread[]>();
    let orchT: WThread | null = null;
    for (const t of data.threads) {
      const depleted = needsCharge(t);
      if (t.id === this.orchThread && !depleted) { orchT = t; continue; }
      const home = this.homeForThread(t, data.projects);
      // Keep historical reservations without keeping their computers and room floor alive.
      if (!residents.has(home)) residents.set(home, []);
      residents.get(home)!.push(t);
      const report = this.reports.get(t.id);
      if (report?.writing && this.collapsedRooms.has(home)) report.writing = false;
      // A worker with a report writes it at the desk, carries it to the orchestrator and waits in
      // its line until the review is decided. Approval sends it back to its desk to be collected.
      const want = depleted ? "charging" : t.question ? "queue" : this.collapsedRooms.has(home) && !this.reports.has(t.id) ? "break" : report ? (report.writing || report.approved ? home : "queue") : (t.coinPending || t.completionPending) && t.runStatus === 'completed' ? home : hasOfficeDesk(t, this.revealedThread) ? home : "break";
      // Existing actors finish their old-floor journey first. A newly started robot
      // waits in its current room until its physical desk can safely be opened.
      const currentRoom = this.roomOf.get(t.id) ?? null;
      const barrier = wasHeld && !retiringIds.has(t.id) && !this.transit.has(t.id) && !this.exits.has(t.id);
      const deferred = want !== "charging" && ((barrier && want !== currentRoom) || (holdPhysical && want !== "queue" && want !== "break" && !previousPhysical.has(t.id)));
      const room = deferred ? this.roomOf.get(t.id) ?? null : this.settleRoom(t, want);
      if (!room) continue;
      classifiedRoom.set(t.id, room);
      if (room === "queue") queue.push(t);
      else if (room === "charging") { if (!t.settled || this.roster.byThread(t.id)) charging.push(t); }
      else if (room === "main") main.push(t);
      else if (room === "break") { if (!t.settled) brk.unshift(t); else brk.push(t); }   // visitors on a break get a spot first
      else if (room === "freelance") freelance.push(t);
      else if (room === "park") heldPark.push(t);
      else {
        const pid = room.slice(2);
        if (!perProject.has(pid)) perProject.set(pid, []);
        perProject.get(pid)!.push(t);
      }
    }
    // Preserve session order; newcomers take free places and removals close the snake.
    const seatOrder = (roomId: string, list: WThread[]) => {
      const prev = [...(this.seats.get(roomId) ?? [])];
      const previousSeats = [...prev];
      // a robot hired at a specific desk sits exactly there
      const ps = this.pendingSeat;
      if (ps && ps.room === roomId && ps.threadId && list.some((t) => t.id === ps.threadId)) {
        // Physical desk k is reservation k, so the clicked desk is the seat.
        const index = Math.max(0, ps.index);
        while (prev.length <= index) prev.push(null);
        const old = prev.indexOf(ps.threadId);
        if (old >= 0) prev[old] = null;
        const displaced = prev[index];
        prev[index] = ps.threadId;
        // A quiet thread that held this place gives it up. Active work is never
        // under an empty desk, so nobody working is moved.
        const displacedThread = displaced && displaced !== ps.threadId ? list.find((t) => t.id === displaced) : undefined;
        if (displacedThread && hasOfficeDesk(displacedThread, this.revealedThread)) prev.push(displaced);
        this.pendingSeat = null;
      }
      let seats = reserveRoomSeats(prev, list, this.revealedThread);
      const extra = this.extra.get(roomId) ?? 0;
      if (extra > 0) this.extra.set(roomId, remainingDeskExtras(previousSeats, seats, extra));
      // Nothing of this room is on screen yet: pack its places once, so empty places
      // saved from old history never stretch the room.
      if (!this.physicalPlans.some((p) => p.id === roomId)) seats = seats.filter((id): id is string => !!id);
      // reserveRoomSeats closes gaps in order without replacing desk/session objects.
      this.seats.set(roomId, seats);
      const byId = new Map(list.map((t) => [t.id, t]));
      return seats.map((id) => (id ? byId.get(id) ?? null : null));
    };
    type Plan = PhysicalRoomPlan;
    const office = (id: string, kind: RoomKind, title: string, icon: string | null, threads: WThread[]): Plan => {
      const reserved = residents.get(id) ?? threads;
      seatOrder(id, reserved);
      const extra = this.extra.get(id) ?? 0;
      const projection = projectRoomSeats(this.seats.get(id)!, reserved, this.isRoomExpanded(id), this.revealedThread, extra, this.collapsedRooms.has(id));
      const { slots, collapsed } = projection;
      const ghost = addDeskPlace(projection.threads, collapsed) !== null;
      const { w, h } = collapsed ? FOLDED_OFFICE : officeSize(slots + (ghost ? 1 : 0), needsLounge(this.themes.get(id)) ? LOUNGE : 0, officeColumns(this.roomColumns.get(id)));
      return { id, kind, title, icon, threads: projection.threads, slots, w, h, collapsed, ghost };
    };
    let top: Plan[] = [
      { id: "queue", kind: "queue", title: "Questions for you", icon: null, threads: queue, slots: 0, w: 720, h: 800, collapsed: false },
      office("main", "main", "Main office", null, main),
      { id: "break", kind: "break", title: "Break room", icon: null, threads: brk.slice(0, 8), slots: 0, w: 1900, h: 800, collapsed: false },
    ];
    const standbyCharging = this.roster.robots.filter(r => (!r.threadId || !byThread.has(r.threadId) && !r.threadId.includes("::") && !data.environmentId) && subscriptionBatteries.get(r.provider).charging);
    this.chargingCapacity = Math.max(this.chargingCapacity, charging.length + standbyCharging.length);
    top.push({ id: "charging", kind: "charging", title: "Charging room", icon: null, threads: charging, slots: 0, ...chargingSize(this.chargingCapacity), collapsed: false });
    let bottom: Plan[] = [];
    for (const p of [...data.projects].filter((p) => !p.scratch).sort((a, b) => a.id.localeCompare(b.id))) {
      const pid = p.id, list = perProject.get(pid) ?? [];
      if (this.hidden.has(pid)) continue;
      bottom.push(office(`p:${pid}`, "project", p.title, p.icon, list));
    }
    if (!this.hidden.has("freelance")) bottom.push(office("freelance", "freelance", "Freelancers", null, freelance));
    bottom = this.orderRooms(bottom);
    const policyKey = (plans: Plan[]) => plans.map((p) => `${p.id}:${p.w}:${p.h}:${p.slots}:${p.slots ? p.threads.map((t) => t?.id ?? "").join(",") : ""}`).join("|");
    const desiredPlans = [...top, ...bottom];
    const physicalChange = policyKey(desiredPlans) !== policyKey(this.physicalPlans);
    // Source-room exits are registered by move() later in this update. Include
    // them now, before moving that room, or its door hands the robot over using
    // an animated old origin that no longer belongs to the current floor.
    const departingResidents = new Set([...classifiedRoom].filter(([id, destination]) => {
      const source = this.roomOf.get(id);
      return source !== destination && (source === 'break' || source === 'queue' || source === 'charging') &&
        !this.transit.has(id) && !this.exits.has(id);
    }).map(([id]) => id));
    if (this.hasLayout && departingResidents.size) holdPhysical = true;
    // Folding the main office must not move the entrance corridor out from under
    // its occupants. Keep that corridor for the folded state and its expansion,
    // so evacuation can finish in the hall instead of crossing the entire campus.
    const hallTop = this.collapsedRooms.has('main') ? this.topH : 0;
    const desiredFloor = officePlan(top, bottom, HALL, GAP, hallTop);
    const oldMeeting = this.pendingMeeting;
    const oldSpots = JSON.stringify([...this.meetingSpots]);
    if (holdPhysical && physicalChange) {
      for (const id of departingResidents) this.layoutParticipants.add(id);
      for (const id of retiringIds) this.layoutParticipants.add(id);
      for (const id of indoorExits) this.layoutParticipants.add(id);
      for (const [id, walker] of this.transit) if (!this.outside(walker)) this.layoutParticipants.add(id);
      for (const id of this.layoutParticipants) if (!this.transit.has(id) && !indoorExits.includes(id) && !retiringIds.has(id) && !departingResidents.has(id)) this.layoutParticipants.delete(id);
      this.pendingMeeting = layoutMeeting(this.floorPlan, desiredFloor, HALL);
      this.meetingSpots = layoutWaitingSpots(this.floorPlan, desiredFloor, [...this.layoutParticipants], HALL);
      const ready = [...this.layoutParticipants].every((id) => {
        const actor = this.transit.get(id);
        // Waiting spots guide evacuation, but reaching one is not a barrier.
        // Promote as soon as everyone clears the changing rooms, then re-plan
        // their existing journeys against the new floor instead of forming a line.
        return !!actor && !this.exits.has(id) && layoutSafeAt(actor, this.floorPlan, desiredFloor, HALL);
      });
      if (ready) holdPhysical = false;
    } else holdPhysical = false;
    this.physicalLayoutHeld = holdPhysical;
    if (!holdPhysical) { this.layoutParticipants.clear(); this.pendingMeeting = null; this.meetingSpots.clear(); }
    const meetingChanged = oldMeeting?.x !== this.pendingMeeting?.x || oldMeeting?.y !== this.pendingMeeting?.y || oldSpots !== JSON.stringify([...this.meetingSpots]);
    if (wasHeld !== holdPhysical || meetingChanged) {
      this.layoutRevision++;
      for (const walker of this.transit.values()) walker.stop();
      this.wakeRoutes();
    }
    if (holdPhysical) {
      const latest = new Map([...top, ...bottom].map((p) => [p.id, p]));
      const held = this.physicalPlans.map((p) => ({ ...p, title: latest.get(p.id)?.title ?? p.title, icon: latest.get(p.id)?.icon ?? p.icon,
        threads: p.threads.map((t) => t ? byThread.get(t.id) ?? t : null) }));
      top = held.filter((p) => p.kind === "queue" || p.kind === "main" || p.kind === "break" || p.kind === "charging");
      bottom = held.filter((p) => p.kind === "project" || p.kind === "freelance");
    }

    // Full-size project offices in stable columns, joined by real cross halls.
    const rooms: Room[] = [];
    const floorPlan = officePlan(top, bottom, HALL, GAP, holdPhysical ? this.topH : hallTop);
    const topH = floorPlan.topH;
    this.topH = topH;
    this.floorPlan = floorPlan;
    // Robots: working threads get one (reusing free teammates first), resting ones keep theirs.
    const working = [...queue, ...main, ...freelance, ...[...perProject.values()].flat(), ...charging.filter(t => !t.settled)];
    const otherBuildings = this.roster.robots.flatMap(r => r.threadId && (r.threadId.includes('::') ? r.threadId.split('::')[0] : '') !== (data.environmentId || '') ? [r.threadId] : []);
    this.roster.assign(working, new Set(brk.map((t) => t.id)), new Set([...data.threads.map(t => t.id), ...otherBuildings]), new Set(data.threads.filter(t => t.pinned).map(t => t.id)));
    const resting = this.roster.restingFor(brk.slice(0, 8));
    const restingIds = new Set(resting.map((r) => r.thread));
    const brkShown = brk.filter((t) => restingIds.has(t.id)).slice(0, 8);
    // Historical threads whose robot moved to another job are not park residents.
    const parkVisitors = [...new Map([...heldPark, ...brk.slice(8)]
      .filter(t => this.roster.byThread(t.id))
      .map(t => [t.id, t])).values()].slice(0, 6);
    const idsOf = (r: Plan) => r.threads.filter((t): t is WThread => !!t).map((t) => t.id);
    const plans = [...top, ...bottom];
    for (const r of plans) rooms.push({ id: r.id, kind: r.kind, title: r.title, icon: r.icon, ...floorPlan.rooms.get(r.id)!, el: null as any, threadIds: idsOf(r), collapsed: r.collapsed });
    this.physicalPlans = plans.map((p) => ({ ...p, threads: [...p.threads] }));
    this.size = floorPlan.size;
    const geometryKey = rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}`).join("|");
    if (geometryKey !== this.geometryKey) {
      this.geometryKey = geometryKey;
      this.footprint = buildingFootprint([...rooms, ...floorPlan.halls]);
      this.layoutRevision++;
      // Old waypoints can now lie inside a moved room. Stop at the same position;
      // each existing trip resumes through current corridors and furniture only.
      for (const walker of this.transit.values()) walker.stop();
      this.wakeRoutes();
    }

    const key = rooms.map((r, i) => `${r.id}:${floorSlots(plans[i])}:${r.w}:${r.h}:${r.x}:${r.y}:${r.icon ? 1 : 0}:${r.title}:${JSON.stringify(this.themes.get(r.id) ?? null)}`).join("|");
    if (key !== this.lastKey) {
      this.lastKey = key;
      // Keep unchanged artwork and residents alive while neighboring rooms move.
      const animate = this.hasLayout && !document.hidden && !this.scene.inert && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate) this.finishRoomTransitions();
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.room[data-room-id]');
      const focusedId = focused?.dataset.roomId;
      const focusedWidth = (document.activeElement as HTMLElement | null)?.closest('.office-width-controls, .office-width-handle') ? (document.activeElement as HTMLElement).className || (document.activeElement as HTMLElement).textContent : null;
      const focusedSize = (document.activeElement as HTMLElement | null)?.classList.contains('room-size-hit');
      const oldRooms = new Map(this.rooms.map((r) => [r.id, r]));
      rooms.forEach((r, i) => {
        const old = oldRooms.get(r.id);
        const signature = JSON.stringify([r.kind, r.title, r.icon, r.w, r.h, floorSlots(plans[i]), this.themes.get(r.id)]);
        const utility = r.kind === 'break' || r.kind === 'queue' || r.kind === 'charging';
        if (old && old.w === r.w && old.h === r.h && (utility || old.el.dataset.artSignature === signature)) {
          r.el = old.el;
          if (animate) this.tweenRoom(r.el, { left: r.x, top: r.y });
          else { this.roomTweens.get(r.el)?.kill(); gsap.set(r.el, { left: r.x, top: r.y }); }
          const ext = utility ? this.ext[r.kind as "break" | "queue" | "charging"] : undefined;
          if (ext) ext.onDeparture = (id, w) => this.prepareDeparture(id, w, () => ({ x: parseFloat(r.el.style.left), y: parseFloat(r.el.style.top) }));
          if (ext) ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + parseFloat(r.el.style.left), y: at.y + parseFloat(r.el.style.top) }, face);
          oldRooms.delete(r.id);
          return;
        }
        if (old) { if (r.kind === "charging") { this.ext.charging?.destroy(); delete this.ext.charging; } this.retireRoom(old.el, animate);oldRooms.delete(r.id); }
        const el = document.createElement("div");
        el.className = `room room-${r.kind}${r.collapsed ? " room-folded" : ""}`;
        el.dataset.roomId = r.id; el.dataset.artSignature = signature;
        el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        const make = r.kind === "break" || r.kind === "queue" || r.kind === "charging" ? this.extFactory[r.kind] : undefined;
        if (make) {
          const ext = make(el, r.w, r.h);
          ext.onSelect = (id) => this.onSelectThread(id);
          ext.onDeparture = (id, w) => this.prepareDeparture(id, w, () => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
          ext.onExit = (id, at, face) => this.handOver(id, { x: at.x + r.x, y: at.y + r.y }, face);
          this.ext[r.kind as "break" | "queue" | "charging"] = ext;
        } else {el.dataset.vectorOwner=vectorOwner("room");el.innerHTML=roomSvg(r,floorSlots(plans[i]),this.themes.get(r.id),el.dataset.vectorOwner)}
        this.roomLayer.appendChild(el);
        const art=el.querySelector<SVGSVGElement>(":scope > .room-art");if(art)cacheStaticArt(art);
        this.cull.observe(el);
        r.el = el;
        if (animate && old) {
          el.style.left = `${old.x}px`; el.style.top = `${old.y}px`; el.style.opacity = '.35';
          el.style.clipPath = `inset(0 ${Math.max(0, r.w - old.w)}px ${Math.max(0, r.h - old.h)}px 0)`;
          this.tweenRoom(el, { left: r.x, top: r.y, opacity: 1, clipPath: 'inset(0px 0px 0px 0px)' });
        }
      });
      for (const old of oldRooms.values()) this.retireRoom(old.el, animate);
      const hall = this.root.querySelector(".hall") as HTMLElement;
      hall.classList.add("hall-network");
      hall.style.cssText = `top:0;height:${this.size.h}px;width:${this.size.w}px`;
      hall.innerHTML = floorPlan.halls.map((h) => `<div class="hall-strip${h.axis === "y" ? " hall-strip-vertical" : ""}" style="left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px"></div>`).join("");
      // the outdoors: grass and trees around the building, a park beside the entrance
      this.layoutGrounds();
      // the room sign is the handle for office options
      for (const r of rooms) {
        if (r.kind !== "project" && r.kind !== "freelance" && r.kind !== "main") continue;
        if (r.el.querySelector(".room-sign-hit")) continue;
        const hit = document.createElement("button");
        hit.type = "button";
        hit.className = "room-sign-hit";
        hit.dataset.roomId = r.id;
        if (r.collapsed) hit.style.width = `${r.w - 120}px`;
        hit.title = this.hostWorld ? `Show ${r.title} office` : `${r.title}${r.collapsed ? ": open office or drag to rearrange" : ": office options or drag to rearrange"}`;
        hit.setAttribute("aria-label", `${r.title} office options`);
        hit.addEventListener("click", (e) => { e.stopPropagation(); this.onRoomMenu(this.rooms.find(room => room.id === r.id) ?? r, e.clientX, e.clientY); });
        r.el.appendChild(hit);
        const size = document.createElement('button'); size.type = 'button'; size.className = 'room-size-hit';
        size.dataset.roomId = r.id;
        size.innerHTML = `<span class="room-size-label"></span>${icon("chevronDown", 24)}`;
        size.addEventListener('click', event => { event.stopPropagation(); this.setRoomExpanded(r.id, !this.isRoomExpanded(r.id)); });
        size.addEventListener('pointerdown', event => event.stopPropagation());
        r.el.append(size);
        if (!r.collapsed) mountOfficeWidth(r.el, r.title, columnsForRoom(r), SLOT_W,
          held => this.setLayoutHeld(held), columns => this.setRoomColumns(r.id, columns));
        if (r.collapsed) {
          const open = document.createElement("button");
          open.type = "button"; open.className = "room-reopen-hit";
          open.setAttribute("aria-label", `Open ${r.title} office`); open.title = `Open ${r.title} office`;
          open.style.cssText = `position:absolute;left:${r.kind === "main" ? r.w / 2 - 34 : r.w - 78}px;top:${r.kind === "main" ? r.h - 68 : 12}px;width:68px;height:${r.kind === "main" ? 68 : 102}px;border:0;background:transparent;cursor:pointer`;
          open.addEventListener("click", (e) => { e.stopPropagation(); this.setRoomExpanded(r.id, true); this.showRoom(r.id); });
          r.el.appendChild(open);
        }
      }
      if (focusedId) rooms.find(r => r.id === focusedId)?.el.querySelector<HTMLElement>(focusedSize ? '.room-size-hit' : '.room-sign-hit')?.focus({ preventScroll: true });
      if (focusedId && focusedWidth) {
        const room = rooms.find(r => r.id === focusedId);
        [...(room?.el.querySelectorAll<HTMLButtonElement>('.office-width-controls button, .office-width-handle') ?? [])].find(b => b.className === focusedWidth || b.textContent === focusedWidth)?.focus({ preventScroll: true });
      }
      this.paintClock();
    } else rooms.forEach((r, i) => (r.el = this.rooms[i]?.el ?? r.el));
    this.rooms = rooms;
    for (const room of rooms) {
      const button = room.el.querySelector<HTMLButtonElement>('.room-size-hit'); if (!button) continue;
      const pinned = this.isRoomExpanded(room.id);
      button.setAttribute('aria-expanded', String(!room.collapsed)); button.setAttribute('aria-pressed', String(pinned));
      button.setAttribute('aria-label', `${pinned ? 'Collapse' : 'Expand'} ${room.title} office`);
      button.title = pinned ? 'Collapse office' : 'Expand office';
      button.classList.toggle('is-pinned', pinned);
      button.querySelector('.room-size-label')!.textContent = pinned ? 'Collapse' : 'Expand';
    }

    // Desks: keep each thread's desk, slide it to its new slot, create or retire as needed.
    const slots: { key: string; x: number; y: number; t: WThread | null }[] = [];
    plans.forEach((p, i) => {
      if (!p.slots) return;
      const r = rooms[i];
      const cols = columnsForRoom(rooms[i]);
      for (let k = 0; k < p.slots; k++) {
        // Keep the old floor safe for departing walkers, without keeping a settled
        // worker's computer and nameplate alive throughout the layout barrier.
        const occupant = p.threads[k];
        if (occupant?.settled && !hasOfficeDesk(occupant)) continue;
        const { c, row } = snakeSeat(k, cols);
        slots.push({ key: `${p.id}#${k}`, x: r.x + 70 + c * SLOT_W, y: r.y + WALL_FACE + 40 + row * SLOT_H, t: p.threads[k] ?? null });
      }
    });
    const wanted = new Set(slots.filter((s) => s.t).map((s) => s.t!.id));
    // where every robot is right now, so a robot changing rooms can walk over
    const desksBefore = new Map<string, Pt>();
    for (const [id, d] of this.desks) if (!d.el.classList.contains("arriving")) desksBefore.set(id, this.pendingPlacement?.id === id && this.pendingPlacement.origin ? this.pendingPlacement.origin : this.deskPos(d));
    const nowRoom = new Map<string, string>();
    for (const s of slots) if (s.t && classifiedRoom.get(s.t.id) === s.key.split("#")[0]) nowRoom.set(s.t.id, s.key.split("#")[0]);
    if (holdPhysical) for (const [id, room] of classifiedRoom) if ((room === "main" || room === "freelance" || room.startsWith("p:")) && previousPhysical.get(id) !== room) nowRoom.set(id, room);
    brkShown.forEach((t) => nowRoom.set(t.id, "break"));
    queue.forEach((t) => nowRoom.set(t.id, "queue"));
    charging.forEach((t) => nowRoom.set(t.id, "charging"));
    if (orchT) nowRoom.set(orchT.id, "queue");
    if (!this.outdoorsWet) parkVisitors.forEach((t) => { if (!nowRoom.has(t.id)) nowRoom.set(t.id, "park"); });
    const first = !this.hasLayout;
    this.drawBuildings();
    this.hasLayout = true;
    const moving: { t: WThread; from: string | null; to: string | null }[] = [];
    if (!first) {
      for (const t of data.threads) {
        if (t.id === this.orchThread && !this.roomOf.has(t.id) && !nowRoom.has(t.id)) continue;
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
    this.placeDeskGhosts(plans, rooms);
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
        d.setCompactTitle(shortTitle(s.t.title));
        // which room it sits in now, and in shared rooms which project it works on
        d.room = s.key.split("#")[0];
        const proj = byProject.get(s.t.projectId);
        d.setPinned(s.t.pinned);
        d.setProject(d.room === "main" || d.room === "queue" ? (proj && !proj.scratch ? { title: proj.title, icon: proj.icon } : { title: "No project", icon: null }) : null);
      } else {
        d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
        if (d.threadId) d.assign(null);
        this.freeDesks.push(d);
      }
      this.slotDesks.set(s.key, d);
      d.room = s.key.split("#")[0];
      d.el.dataset.slot = s.key;
      d.el.querySelector<HTMLButtonElement>('.empty-desk-remove')!.disabled = !this.canRemoveEmptyDesk(s.key);
      const appearance = this.themes.get(d.room);
      const computer = appearance?.computers?.[s.key] ?? appearance?.computer ?? "classic";
      d.el.dataset.computer = computer;
      if (d.threadId && (nowRoom.get(d.threadId) !== d.room || moving.some((m) => m.t.id === d!.threadId) || this.transit.has(d.threadId))) d.setSeated(false);
      if (d.threadId) d.el.classList.toggle("orch-desk", d.threadId === this.orchThread);
      const cur = { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) };
      if (Math.abs(cur.x - s.x) > 1 || Math.abs(cur.y - s.y) > 1) {
        this.slideDesk(d, s);
      }
    }
    this.playDeskBuild();
    // desks whose seat disappeared are retired properly (their robot and computer stop)
    const inUse = new Set(this.slotDesks.values());
    for (const d of this.allDesks) if (!inUse.has(d)) { this.allDesks.delete(d); if (this.selected === d) this.select(null); this.cull.unobserve(d.el); d.destroy(); }
    // leaving a desk: it gets up from its chair; leaving the break room, questions or park: that
    // room walks it to its door and hands it over there
    for (const m of moving) this.move(m.t, m.from, m.to, desksBefore.get(m.t.id) ?? null);
    for (const [id, walker] of this.transit) {
      const thread = byThread.get(id);
      walker.setRunning(!!thread && hasOfficeWork(thread) && !thread.question && !!this.desks.get(id)?.el.classList.contains("arriving"));
    }
    // robots that finished longer ago than the break room's latest eight go out to the park
    const info = (t: WThread) => ({ id: t.id, provider: t.provider, title: t.title, model: t.model, name: this.roster.byThread(t.id)?.name, look: this.roster.byThread(t.id)?.look });
    // in rain, storms or snow nobody stays in the park
    const wet = this.outdoorsWet;
    this.park.wet = wet;
    this.park.rainSoon = wet && !["rain", "drizzle", "storm", "snow"].includes(this.weather?.kind ?? "");
    const chargingList: (ReturnType<typeof info> & { battery: ReturnType<typeof subscriptionBatteries.get>; threadId?: string | null })[] = charging.map(t => ({ ...info(t), battery: subscriptionBatteries.get(t.provider) }));
    const occupiedRobots = new Set(charging.map(t => this.roster.byThread(t.id)?.id));
    for (const r of standbyCharging) if (!occupiedRobots.has(r.id)) chargingList.push({ id: `charging:${r.id}`, threadId: r.threadId, provider: r.provider, title: r.name, model: r.lastModel || null, name: r.name, look: r.look, battery: subscriptionBatteries.get(r.provider) });
    const chargingRoom = rooms.find(r => r.id === "charging");
    if (chargingRoom) chargingRoom.threadIds = chargingList.map(r => r.id);
    this.extLists = { brk: brkShown.map(info), queue: queue.map((t) => ({ ...info(t), question: t.question || (this.reports.has(t.id) ? `Report: ${t.title}` : null), report: this.reports.has(t.id) })), charging: chargingList, park: wet ? [] : parkVisitors.map(info), orch: orchT ? { ...info(orchT), running: orchT.runStatus === "running" } : null };
    this.pushExt();
    this.recull();
    this.onRooms(rooms);
    for (const [id, report] of this.reports) {
      const desk = this.desks.get(id);
      if (!report.writing || report.started || !desk || desk.el.classList.contains("arriving")) continue;
      report.started = true;
      void desk.director.writeReport(report.title, report.response || "").catch(() => {}).finally(() => {
        if (this.reports.get(id) !== report) return;
        report.writing = false;
        if (this.lastData) this.update(this.lastData);
      });
    }
    if (JSON.stringify([...this.seats]) !== seatsBefore) this.onLayoutChange();
    this.syncPlacementPreview();
    if (wasHeld && !holdPhysical) this.reconcilePhysicalLayout(true);
  }

  private parkPosition: Pt | null = null;
  private layoutGrounds() {
      const topH = this.topH, entY = topH + HALL / 2;
      const district = districtPlan({ id: "", ...this.size, entranceY: entY }, { w: PARK_W, h: PARK_H });
      // The same plan owns visible artwork, walking geometry and campus bounds.
      const park = district.park;
      // the grounds round it (grounds.ts): lawn, hedge and a tree belt that fades into the backdrop
      const building = { x: 0, y: 0, w: this.size.w, h: this.size.h };
      this.grounds = groundsLayout({ building, entranceY: entY, park });
      const cb = this.grounds.bounds;
      const out = { ox: cb.x, oy: cb.y, w: cb.w, h: cb.h };
      this.outdoor = { x: out.ox, y: out.oy, w: out.w, h: out.h, park };
      this.parkDoor = { x: this.size.w + 66, y: topH + HALL / 2 + 20 };
      this.park.setGeometry(park, this.parkDoor, undefined);
      const layer = this.root.querySelector(".outside-layer") as HTMLElement;
      layer.style.cssText = `left:${out.ox}px;top:${out.oy}px;width:${out.w}px;height:${out.h}px`;
      this.outArgs = { ...out, building, footprint: this.footprint, entranceY: entY, park, grounds: this.grounds };
      this.puddles = puddleSpots(this.grounds, building, park, entY);
      if (!this.hostWorld) this.redrawOutside(true);
      // the weather reaches well past the drawn grounds, so rain and cloud never stop at an edge
      const reach = Math.max(3000, cb.w * 0.6);
      const wr = { x: out.ox - reach, y: out.oy - reach, w: out.w + 2 * reach, h: out.h + 2 * reach, park, entranceY: topH + HALL / 2 };
      if (!this.hostWorld) { if (this.fx) this.fx.resize(wr); else { this.fx = mountWeather(this.root, wr); this.apply(); } }
      // puddles ripple in the rain, the paving shimmers in the heat, walkers leave prints in the snow
      this.fx?.setGround(this.puddles, [this.grounds.walk]);
      this.fx?.setSteppers(() => this.park.steppers());
      const shade = this.root.querySelector(".night-shade") as HTMLElement;
      shade.style.cssText = `left:0;top:0;width:${this.size.w}px;height:${this.size.h}px;right:auto;bottom:auto;background:none`;
      shade.innerHTML = `<svg width="${this.size.w}" height="${this.size.h}" aria-hidden="true"><path d="${this.footprint.path}" fill="#0b1030"/></svg>`;
      if (this.hostWorld) {
        let foundation = this.root.querySelector('.campus-foundation') as HTMLElement | null;
        if (!foundation) { foundation = document.createElement('div'); foundation.className = 'campus-foundation'; foundation.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none'; this.root.insertBefore(foundation,this.root.querySelector('.hall')); }
        foundation.innerHTML = `<svg width="${this.size.w}" height="${this.size.h}" style="overflow:visible" aria-hidden="true"><path d="${this.footprint.path}" fill="none" stroke="#a29174" stroke-width="82" stroke-linejoin="round"/><path d="${this.footprint.path}" fill="none" stroke="#d8c8a6" stroke-width="60" stroke-linejoin="round"/><path d="${this.footprint.path}" fill="#4a4f5c" stroke="#4a4f5c" stroke-width="26" stroke-linejoin="round"/></svg>`;
      }
      this.root.style.width = `${this.size.w}px`;
      this.root.style.height = `${this.size.h}px`;
      (this.root.querySelector(".building-plate b") as HTMLElement).textContent = this.building;
      this.paintEvent();
  }

  private allDesks = new Set<Desk>();
  roster: Roster;
  // The Add a desk placeholder: a faint ghost of the next workstation (room-policy addDeskPlace).
  // Unchanged ghosts keep their DOM node, focus and pending state across refreshes.
  private ghosts = new Map<string, { el: HTMLButtonElement; sig: string; pending: number | null; timer: number }>();
  private deskBuild: { key: string; since: number } | null = null;
  private deskBuildTween: gsap.core.Timeline | null = null;
  private placeDeskGhosts(plans: PhysicalRoomPlan[], rooms: Room[]) {
    const shown = new Set<string>();
    plans.forEach((p, i) => {
      const r = rooms[i];
      if (!p.ghost || r.collapsed || !["main", "project", "freelance"].includes(p.kind)) return;
      shown.add(p.id);
      const at = slotOrigin(r, p.slots), sig = [r.title, at.x, at.y, p.slots].join("|");
      let g = this.ghosts.get(p.id);
      if (g?.sig === sig) return;
      const fresh = !g;
      if (!g) { g = { el: this.makeDeskGhost(p.id), sig: "", pending: null, timer: 0 }; this.ghosts.set(p.id, g); }
      // The ghost moved on to a new place: the earlier add has landed, so presses count again.
      if (g.pending !== null && g.pending !== p.slots) this.settleGhost(g);
      g.sig = sig;
      g.el.setAttribute("aria-label", `Add a desk to ${r.title}`);
      // The hit area is the whole ghost: monitor and desk top of a real workstation.
      const left = at.x + 34, top = at.y + GEOM.monitor.y;
      if (fresh) g.el.style.cssText = `left:${left}px;top:${top}px;width:332px;height:264px`;
      g.el.style.zIndex = String(Math.round(at.y));
      // It slides with the desks and rooms around it, the way slideDesk moves a workstation.
      if (!fresh && !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(g.el, { left, top, duration: .3, ease: "power3.out", overwrite: "auto" });
      else if (!fresh) { gsap.killTweensOf(g.el); gsap.set(g.el, { left, top }); }
      this.cull.observe(g.el);
    });
    for (const [id, g] of this.ghosts) if (!shown.has(id)) { window.clearTimeout(g.timer); gsap.killTweensOf(g.el); this.cull.unobserve(g.el); g.el.remove(); this.ghosts.delete(id); }
  }
  private makeDeskGhost(room: string) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "desk-ghost"; b.title = "Add a desk";
    b.innerHTML = `<svg viewBox="0 0 332 264" width="332" height="264" aria-hidden="true" focusable="false">
      <g class="dg-frame"><rect x="21.5" y="1.5" width="289" height="169" rx="12"/><path d="M166 172v12"/><rect x="1.5" y="177.5" width="329" height="76" rx="8"/></g>
      <g class="dg-plus"><circle cx="166" cy="86" r="30"/><path d="M166 73v26M153 86h26"/></g>
    </svg><span aria-hidden="true">Add a desk</span>`;
    b.addEventListener("click", (e) => { e.stopPropagation(); this.addDeskFromGhost(room); });
    b.addEventListener("dblclick", (e) => e.stopPropagation());
    this.deskLayer.appendChild(b);
    return b;
  }
  private settleGhost(g: { el: HTMLButtonElement; pending: number | null; timer: number }) {
    window.clearTimeout(g.timer); g.timer = 0; g.pending = null;
    g.el.classList.remove("is-pending"); g.el.removeAttribute("aria-disabled");
  }
  private addDeskFromGhost(room: string) {
    const g = this.ghosts.get(room), plan = this.physicalPlans.find((p) => p.id === room);
    // Repeat presses wait until the pending desk stands (a held floor plan can delay it).
    if (!g || !plan?.ghost || g.pending !== null || g.el.disabled) return;
    const focused = document.activeElement === g.el, before = this.extra.get(room) ?? 0;
    g.pending = plan.slots; g.el.classList.add("is-pending"); g.el.setAttribute("aria-disabled", "true");
    this.deskBuild = { key: `${room}#${plan.slots}`, since: performance.now() };
    // The same path as every added desk: saved layout, reservations, safe floor-plan transition.
    this.onAddDesk(room);
    if (this.ghosts.get(room) === g && (this.extra.get(room) ?? 0) === before) {
      // Nothing was added here (a neighbouring building opens first, or a companion client).
      this.deskBuild = null;
      window.clearTimeout(g.timer); g.timer = window.setTimeout(() => this.settleGhost(g), 2500);
    }
    if (focused && !g.el.isConnected) this.rooms.find((r) => r.id === room)?.el.querySelector<HTMLElement>(".room-sign-hit")?.focus({ preventScroll: true });
  }
  /** The desk added from a ghost assembles where the ghost stood: top drops in, monitor rises. */
  private playDeskBuild() {
    const build = this.deskBuild;
    if (!build) return;
    if (performance.now() - build.since > 30000) { this.deskBuild = null; return; }
    const d = this.slotDesks.get(build.key);
    if (!d) return;   // a held floor plan opens the new desk later
    this.deskBuild = null;
    gameSound.at("build", d.el, .8);
    if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.deskBuildTween?.progress(1).kill();
    const table = d.el.querySelector<SVGSVGElement>(".desk-table"), parts = [table, d.monitor].filter((e): e is SVGSVGElement | HTMLElement => !!e);
    const ease = cubicBezier(.23, 1, .32, 1);
    const tl = gsap.timeline({ onComplete: () => done(), onInterrupt: () => done() });
    const done = () => { gsap.set(parts, { clearProps: "transform,transformOrigin,opacity" }); if (this.deskBuildTween === tl) this.deskBuildTween = null; };
    if (table) tl.fromTo(table, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: .22, ease }, 0);
    tl.fromTo(d.monitor, { scaleY: .15, opacity: 0, transformOrigin: "50% 100%" }, { scaleY: 1, opacity: 1, duration: .24, ease }, .13);
    this.deskBuildTween = tl;
  }

  // Desks and rooms outside the view are not painted at all; their robots keep working, nobody
  // sees it. Worked out from the camera every time it moves (a browser visibility observer can
  // miss a change and leave a desk hidden when it comes back into view).
  private cullSet = new Set<HTMLElement>();
  private cull = {
    observe: (el: HTMLElement) => { this.cullSet.add(el); this.recull(); },
    unobserve: (el: Element) => { this.cullSet.delete(el as HTMLElement); },
  };
  private presentationDirty = false;
  private resizePresentation: (() => void) | null = null;
  private visibilityPresentation = () => { if (document.hidden) this.finishRoomTransitions(); this.refreshPresentation(); };
  refreshPresentation() {
    if (!this.scene.inert && !document.hidden && this.presentationDirty) {
      this.presentationDirty = false;
      if (this.resizePresentation) this.resizePresentation(); else this.apply();
      return;
    }
    this.recull();
    this.syncBuildings();
  }
  private recull() {
    if (this.scene.inert || document.hidden) {
      this.presentationDirty = true;
      for (const d of this.allDesks) { setRenderView(d.screen, false, 276 * (this.cam.s || 1)); d.director.setPresentationVisible(false); }
      return;
    }
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
    for (const d of this.allDesks) {
      const left = this.cam.x + (parseFloat(d.el.style.left) + 54) * s;
      const top = this.cam.y + (parseFloat(d.el.style.top) + 4) * s;
      const inView = !this.scene.inert && !!d.threadId && left < box.width && left + 292 * s > 0 && top < box.height && top + 172 * s > 0;
      const shown = inView && !d.el.classList.contains("arriving");
      setRenderView(d.screen, shown, 276 * s, 820, inView);
      // far away the desk's monitor shows a simple sign instead of its unreadable panel
      const px = monitorPx(s);   // the monitor's width on screen, in device pixels (perf/lod.ts)
      const far = px < LOD_PX.full;   // where screens stop drawing apps in full
      if (d.el.classList.contains("lod-far") !== far) d.el.classList.toggle("lod-far", far);
      // farther still the monitor is a few pixels wide: its dock row is skipped (office.css)
      const tiny = px < LOD_PX.tiny;
      if (d.el.classList.contains("lod-tiny") !== tiny) d.el.classList.toggle("lod-tiny", tiny);
      d.director.setPresentationVisible(shown);
    }
    const vx = -this.cam.x / s, vy = -this.cam.y / s;
    this.viewIndoors = footprintCovers(this.footprint, { x: vx, y: vy, w: box.width / s, h: box.height / s });
    this.root.querySelector(".outside-live")?.classList.toggle("culled", this.viewIndoors);
    this.fitBubbles();
  }
  // A thought bubble opens to the right of the robot's head; when that side is off screen or under
  // the side chat, it opens to the left instead.
  private fitBubbles() {
    const box = this.sceneBox;
    if (!box) return;
    const s = this.cam.s, right = box.width - this.panelWidth - 8;
    for (const d of this.allDesks) {
      const b = d.bubble;
      if (!b.classList.contains("show")) continue;
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
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'empty-desk-remove';
    remove.title = 'Remove empty desk'; remove.setAttribute('aria-label', 'Remove empty desk');
    remove.innerHTML = icon("close");
    remove.addEventListener('pointerdown', e => e.stopPropagation());
    remove.addEventListener('dblclick', e => e.stopPropagation());
    remove.addEventListener('click', e => { e.stopPropagation(); this.onRemoveEmptyDesk(d.el.dataset.slot || ''); });
    d.el.append(remove);
    d.onPresenceChange = () => this.recull();
    this.cull.observe(d.el);
    d.onSay = () => this.fitBubbles();
    d.director.attachDir = this.attachDir;
    d.director.childItems = (id, since) => (window as any).lucid.itemsSince(id, since);
    this.allDesks.add(d);
    const chatClicks = wireDeskChatTargets(d.el, () => d.threadId, () => this.dragged,
      id => this.hostWorld ? this.onSelectThread(id) : this.onWatchChat(id));
    if (!this.hostWorld) this.wireDeskDrag(d);
    d.onRobotFocus = (anchor) => { if (d.threadId) this.onRobotFocus(d.threadId, anchor); };
    d.el.addEventListener("click", (e) => {
      if (this.dragged) return;
      e.stopPropagation();
      if (this.hostWorld && chatClicks.has(e)) return;
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
      if (this.hostWorld && chatClicks.has(e)) return;
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
      const cols = columnsForRoom(room);
      const positions = original.map((_, i) => { const { c, row } = snakeSeat(i, cols); return { x: room.x + 70 + c * SLOT_W, y: room.y + WALL_FACE + 40 + row * SLOT_H }; });
      let active = false, target = source, ended = false;
      let destination: string | null = null;
      let lastX = x0, lastY = y0, lastTiltX = x0;
      let preview: HTMLElement | null = null;
      const arrange = (index: number) => { const order = [...original]; order.splice(source, 1); order.splice(index, 0, d); return order; };
      const move = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!active) {
          active = this.deskDragActive = this.dragged = true;
          this.stopFollow(); this.cancelCameraTween();
          z = this.cam.s;
          for (const w of this.transit.values()) w.stop();
          for (const desk of original) gsap.killTweensOf(desk.el, "left,top");
          document.body.classList.add("desk-dragging"); window.getSelection()?.removeAllRanges();
          d.el.classList.add("desk-grabbed");
          preview = document.createElement("div"); preview.className = "desk-drop-preview"; preview.textContent = "Place desk here";
          this.deskLayer.appendChild(preview);
        }
        ev.preventDefault();
        lastX = ev.clientX; lastY = ev.clientY;
        const over = d.threadId && d.threadId !== this.orchThread ? this.threadDropZone(ev.clientX, ev.clientY) : null;
        const nextDestination = over && over !== room.id ? over : null;
        if (nextDestination !== destination) { destination = nextDestination; this.previewThreadDrop(destination, d.threadId); }
        const rawX = start.x + (ev.clientX - x0) / z, rawY = start.y + (ev.clientY - y0) / z;
        const x = d.threadId ? rawX : Math.max(room.x + 22, Math.min(room.x + room.w - UNIT_W - 22, rawX));
        const y = d.threadId ? rawY : Math.max(room.y + WALL_FACE + 12, Math.min(room.y + room.h - UNIT_H - 22, rawY));
        d.el.style.setProperty("--desk-tilt", `${Math.max(-2, Math.min(2, (ev.clientX - lastTiltX) * .12))}deg`);
        lastTiltX = ev.clientX;
        gsap.set(d.el, { left: x, top: y });
        preview!.hidden = !!destination;
        if (destination) return;
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
        const transfer = commit && destination && d.threadId;
        // A release in the hall cancels; another office uses the shared home assignment.
        const reorder = commit && !transfer && (!d.threadId || this.threadDropZone(lastX, lastY) === room.id);
        const order = reorder ? arrange(target) : original;
        order.forEach((desk, i) => { this.slotDesks.set(entries[i][0], desk); if (!(transfer && desk === d)) this.slideDesk(desk, positions[i]); });
        if (reorder) this.seats.set(d.room, reorderPhysicalSeats(this.seats.get(d.room) ?? [], original.map((desk) => desk.threadId), order.map((desk) => desk.threadId)));
        preview?.remove(); d.el.classList.remove("desk-grabbed"); document.body.classList.remove("desk-dragging");
        this.previewThreadDrop(null);
        this.deskDragActive = false;
        // Capture phase also suppresses monitor and toy click handlers on release.
        const eat = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
        const eatClick = () => {
          window.addEventListener("click", eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", eat, true), 0);
        };
        if (waitForRelease) window.addEventListener("pointerup", eatClick, { capture: true, once: true }); else eatClick();
        setTimeout(() => { this.dragged = false; }, 0);
        if (transfer && this.placeThread(transfer, destination!, start)) gameSound.play("switch");
        else {
          if (this.lastData) this.update(this.lastData);
          if (reorder) this.onLayoutChange();
        }
      };
      const up = (ev: PointerEvent) => { if (active) move(ev); finish(true); }, cancel = () => finish(false);
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
  private pendingPlacement: { id: string; room: string; origin?: Pt } | null = null;
  previewThreadDrop(roomId: string | null, threadId: string | null = null, pending = false) {
    const room = this.roomById(roomId);
    if (!room) { this.threadDropPreview?.remove(); this.threadDropPreview = null; return; }
    // Reuse one preview while tracking. Recreating it on every move restarts its
    // entrance animation and forces layout even when the destination is unchanged.
    let el = this.threadDropPreview;
    if (!el) {
      el = document.createElement("div"); el.className = "office-drop-preview";
      el.setAttribute("aria-hidden", "true");
      el.append(document.createElement("span"), document.createElement("div"));
      el.lastElementChild!.className = "office-drop-seat";
      this.deskLayer.appendChild(el); this.threadDropPreview = el;
    }
    const claims = this.lastData?.threads.filter(t => t.id === threadId || this.homeForThread(t, this.lastData!.projects) === room.id) ?? [];
    const seats = reserveRoomSeats(this.seats.get(room.id) ?? [], claims, threadId);
    const index = Math.max(0, threadId ? seats.indexOf(threadId) : seats.findIndex(id => !id));
    const cols = room.collapsed ? this.roomColumns.get(room.id) ?? 1 : columnsForRoom(room);
    const { c, row } = snakeSeat(index, cols);
    const x = 70 + c * SLOT_W, y = WALL_FACE + 40 + row * SLOT_H;
    const key = `${room.id}:${room.x}:${room.y}:${room.w}:${room.h}:${room.collapsed}:${index}:${pending}`;
    if (el.dataset.placement === key) return;
    el.dataset.placement = key;
    const label = el.firstElementChild as HTMLElement, seat = el.lastElementChild as HTMLElement;
    label.textContent = `${pending ? "Moving to" : "Move to"} ${room.title}${room.collapsed ? pending ? " (opening office)" : " (opens on drop)" : y + UNIT_H > room.h ? pending ? " (expanding office)" : " (room grows)" : ""}`;
    el.classList.toggle("placement-pending", pending);
    el.style.cssText = `left:${room.x + 16}px;top:${room.y + WALL_FACE}px;width:${room.w - 32}px;height:${room.h - WALL_FACE - 16}px`;
    seat.hidden = !!room.collapsed;
    seat.style.left = `${x - 16 + 24}px`; seat.style.top = `${y - WALL_FACE + 170}px`;
    seat.textContent = `Desk ${index + 1}`;
  }
  private syncPlacementPreview() {
    const p = this.pendingPlacement;
    if (!p) return;
    const t = this.lastData?.threads.find(t => t.id === p.id);
    if (!t || !hasOfficeDesk(t, this.revealedThread) || this.desks.get(p.id)?.room === p.room && !this.physicalLayoutHeld) {
      this.pendingPlacement = null; this.previewThreadDrop(null); return;
    }
    this.previewThreadDrop(p.room, p.id, true);
  }
  placeThread(id: string, roomId: string, origin?: Pt) {
    const room = this.roomById(roomId), t = this.lastData?.threads.find((t) => t.id === id);
    if (!room || !t || id === this.orchThread || !["main", "project", "freelance"].includes(room.kind)) return false;
    this.homes.set(id, roomId);
    this.revealedThread = id;
    this.expandedRooms.add(roomId); this.collapsedRooms.delete(roomId);
    for (const [r, seats] of this.seats) if (r !== roomId) this.seats.set(r, seats.map((seat) => seat === id ? null : seat));
    // User placement takes effect immediately. Questions can still take the robot to the queue.
    this.placed.set(id, { room: t.question ? "queue" : roomId });
    this.pendingPlacement = { id, room: roomId, origin };
    this.update(this.lastData!); this.syncPlacementPreview(); this.onLayoutChange();
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
  // Click a robot that is walking around (break room, park, hallway) and the camera
  // stays on it as it goes about its business. Panning, zooming or Esc lets go.
  private followEl: HTMLElement | null = null;
  private followTick = (_time: number, delta: number) => {
    if (document.hidden || this.scene.inert) return;
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
    // Match the original 60 Hz response at every display rate, with a bounded
    // catch-up after a slow frame rather than a large returning-camera jump.
    const steps = Math.min(3, Math.max(0, delta / (1000 / 60)));
    const move = 1 - Math.pow(.9, steps), zoom = 1 - Math.pow(.92, steps);
    if (Math.abs(this.cam.s - target) > 0.01) {
      const k = this.cam.s + (target - this.cam.s) * zoom;
      this.cam.x = cx - ((cx - this.cam.x) / this.cam.s) * k; this.cam.y = cy - ((cy - this.cam.y) / this.cam.s) * k; this.cam.s = k;
    }
    this.cam.x += (W / 2 - cx) * move;
    this.cam.y += (H * 0.55 - cy) * move;
    this.apply();
  };
  follow(el: HTMLElement) {
    this.frame = null;
    if (this.focusDesk) this.unfocus(false);
    this.select(null);
    this.cancelCameraTween();
    this.followEl = el;
    gsap.ticker.remove(this.followTick);
    gsap.ticker.add(this.followTick);
  }
  /** Open the conversation of a followed robot. */
  onFollowChat: (threadId: string) => void = () => {};
  /** You clicked another robot while a chat was open: the chat switches to it without moving the camera. */
  onWatchChat: (threadId: string) => void = () => {};
  stopFollow() {
    gsap.ticker.remove(this.followTick);
    this.followEl = null;
  }
  // --- camera -------------------------------------------------------------------
  private disposeTouchInput: (() => void) | null = null;
  private mountTouchInput() {
    this.disposeTouchInput?.();
    this.disposeTouchInput = mountTouchCamera(this.scene, {
      camera: () => this.cam,
      viewport: () => this.sceneBox ??= this.scene.getBoundingClientRect(),
      zoomBounds: () => this.cameraZoomBounds(),
      constrain: () => this.clampCam(),
      start: (kind) => { this.stopCameraMotion(); this.cancelOutsideWarm(); this.dragged = true; this.holdTouchLayout(true); },
      change: () => this.applySoon(),
      end: () => { this.dragged = false; this.holdTouchLayout(false); },
    });
  }
  /** Release owned touch input when an embedding removes its office scene. */
  destroyTouchInput() { this.disposeTouchInput?.(); this.disposeTouchInput = null; this.cancelTouchLayoutFlush(); this.cancelOutsideWarm(); this.touchLayoutHeld = this.touchLayoutPending = false; }
  /** Direct manipulation takes ownership from an earlier fly-to or followed actor. */
  stopCameraMotion() {
    this.stopFollow();
    this.frame = null;
    this.cancelCameraTween();
  }
  private dragged = false;
  private camera() {
    const s = this.scene;
    s.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      if (this.followEl) this.stopFollow();
      const smooth = !(e.deltaMode === 0 && Math.abs(e.deltaY) < 40);
      const pending = this.glideAnim ? this.cam.s : this.zoomGlide?.s ?? this.cam.s;
      this.cancelCameraTween(); // this.cam is now the visible position, not the old goal
      // Accumulate mouse notches only while continuing toward the pending goal.
      // Reversals and direct touchpad input take over from the visible position;
      // otherwise a smaller opposite delta can still move in the old direction.
      const continuing = Math.sign(pending - this.cam.s) === -Math.sign(e.deltaY);
      const base = smooth && continuing ? pending : this.cam.s;
      this.frame = null;
      const bounds = this.cameraZoomBounds();
      const ns = Math.min(bounds.max, Math.max(bounds.min, base * Math.exp(-e.deltaY * 0.0015)));
      // Camera transforms do not move the scene's viewport. Reuse its geometry
      // across high-rate wheel bursts; resizing and panel moves invalidate it.
      const r = this.sceneBox ??= s.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      // Touchpads send many small deltas and are already smooth; follow them directly.
      if (!smooth) {
        if (ns === this.cam.s) return;
        const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s;
        this.cam.s = ns; this.cam.x = px - wx * ns; this.cam.y = py - wy * ns;
        this.clampCam();
        this.applySoon();
        return;
      }
      // A mouse notch is a 20% jump; shown in one frame it reads as stutter. Glide there.
      this.glideTo(ns, px, py);
    }, { passive: false });
    let start: { id: number; button: number; x: number; y: number; cx: number; cy: number } | null = null;
    const endPan = (e?: PointerEvent) => {
      if (!start || e && e.pointerId !== start.id) return;
      const id = start.id;
      start = null;
      s.classList.remove("panning");
      try { if (s.hasPointerCapture(id)) s.releasePointerCapture(id); } catch { /* window already lost capture */ }
      setTimeout(() => (this.dragged = false), 0);
    };
    const beginPan = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (start || e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) {
        e.preventDefault(); e.stopPropagation();
        // Capture at the scene before desks/apps see middle-down. Crossing their
        // controls during a camera drag must not start hover, focus or app drags.
        try { s.setPointerCapture(e.pointerId); } catch { /* synthetic/offscreen pointer */ }
      }
      this.stopGlide(); // a drag takes over from where a wheel glide is now
      start = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y };
      this.dragged = false;
    };
    // the middle button pans too: claim it, or Chromium starts its own autoscroll and fights the pan
    s.addEventListener("mousedown", (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } }, true);
    s.addEventListener("pointerdown", (e) => { if (e.button === 1) beginPan(e); }, true);
    s.addEventListener("pointerdown", (e) => {
      if (e.button === 0) beginPan(e);
    });
    window.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!(e.buttons & (start.button === 1 ? 4 : 1))) { endPan(e); return; }
      if (start.button === 1) { e.preventDefault(); e.stopPropagation(); }
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.dragged && Math.hypot(dx, dy) < 5) return;
      if (!this.dragged) { this.dragged = true; s.classList.add("panning"); this.stopFollow(); this.frame = null; this.cancelCameraTween(); }
      this.cam.x = start.cx + dx; this.cam.y = start.cy + dy;
      this.applySoon();
    }, true);
    window.addEventListener("pointerup", endPan, true);
    window.addEventListener("pointercancel", endPan, true);
    s.addEventListener("lostpointercapture", endPan);
    window.addEventListener("blur", () => endPan());
    document.addEventListener("visibilitychange", () => { if (document.hidden) endPan(); });
    s.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } }, true);
    s.addEventListener("click", (e) => {
      if (this.dragged || (e.target as HTMLElement).closest(".desk-unit")) return;
      // little things to click on in the world (fountain, pond)
      const r = this.root.getBoundingClientRect(), z = r.width / (this.root.offsetWidth || 1);
      const wx = (e.clientX - r.left) / z, wy = (e.clientY - r.top) / z;
      if (this.park.hit(wx, wy) || this.landClick(wx, wy)) return;
      this.select(null);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.followEl) { e.preventDefault(); this.stopFollow(); return; }
      if (e.key === "Escape" && this.focusDesk) { e.preventDefault(); this.unfocus(); }
    });
    // clicking any walking robot (also one that was just thrown) makes the camera follow it
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".world-walker") as HTMLElement | null;
      if (!el || this.dragged) return;
      this.follow(el);
      const id = el.dataset.id;
      if (id) this.onWatchChat(id);
    }, true);
    // The sidebar and the chat sit beside the scene, so the scene is exactly the visible area. When a panel
    // changes width the view adapts to it: a framed view (a desk, a room, the whole building) is fitted to
    // the new area again, and a freely panned view keeps what is at its centre in the centre.
    let last = { w: s.clientWidth, h: s.clientHeight };
    this.resizePresentation = () => {
      if (this.scene.inert || document.hidden) { this.presentationDirty = true; return; }
      this.sceneBox = null;
      // Read geometry only on layout changes, never in a robot's frame loop.
      this.journeyInsets = exposedScene(s.getBoundingClientRect(),
        [...s.parentElement!.querySelectorAll<HTMLElement>(':scope > .panel, :scope > .side-rail, :scope > .chat-panel, :scope > .cp-tab')]
          .map(panel => panel.getBoundingClientRect()));
      const w = s.clientWidth, h = s.clientHeight;
      if (last.w && last.h && w && h && (w !== last.w || h !== last.h)) {
        if (this.frame) {
          this.cancelCameraTween();
          this.fit(this.frame.rect, this.frame.pad, w, h);
        } else if (!this.followEl) {
          this.cam.x += (w - last.w) / 2; this.cam.y += (h - last.h) / 2;
        }
      }
      last = { w, h };
      // A layout change (the chat opening, the sidebar folding, the window resizing) is not you
      // looking away, so it never drops the focused desk and folds its chat.
      if (!this.shelfLayoutCommit) this.apply();
    };
    this.layoutObserver?.disconnect();
    const layoutObserver = this.layoutObserver = new ResizeObserver(this.resizePresentation);
    layoutObserver.observe(s);
    for (const panel of s.parentElement!.querySelectorAll(':scope > .panel, :scope > .side-rail, :scope > .chat-panel, :scope > .cp-tab')) layoutObserver.observe(panel);
  }

  // Coalesce fast mouse input into one commit on the display's next animation frame.
  // Let each display frame consume the newest input without a separate 60 Hz deadline.
  // Camera, culling, bubbles and focus work run together at most once per display frame.
  private applyQueued = 0;
  private flushCamera = () => {
    this.applyQueued = 0;
    this.apply(); this.keepFocus();
  };
  private applySoon() {
    if (this.applyQueued) return;
    this.applyQueued = requestAnimationFrame(this.flushCamera);
  }
  private sceneBox: DOMRect | null = null;
  private journeyInsets = { left: 0, right: 0 };
  private layoutObserver: ResizeObserver | null = null;
  private near: boolean | null = null;
  private overviewLayers: boolean | null = null;
  private lastScale = 0;
  private lastX = 0;
  private lastY = 0;
  private zooming = false;
  /** Whether robots are on their canvases (zoomed out); flipping it switches them all at once. */
  private canvasRobots: boolean | null = null;
  private zoomEnd = 0;
  private rasterScale = 1;
  private resharpen = 0;
  private outsideWarmIdle = 0;
  private outsideWarmTimer = 0;
  private cancelOutsideWarm() {
    if (this.outsideWarmIdle) window.cancelIdleCallback?.(this.outsideWarmIdle);
    if (this.outsideWarmTimer) clearTimeout(this.outsideWarmTimer);
    this.outsideWarmIdle = this.outsideWarmTimer = 0;
  }
  private scheduleOutsideWarm() {
    if (this.outsideWarmIdle || this.outsideWarmTimer || this.dragged || this.zooming || this.scene.inert || document.hidden) return;
    const expected = { ...this.cam }, box = this.sceneBox ??= this.scene.getBoundingClientRect();
    const warm = () => {
      this.outsideWarmIdle = this.outsideWarmTimer = 0;
      if (this.dragged || this.zooming || this.scene.inert || document.hidden || !this.root.isConnected || expected.x !== this.cam.x || expected.y !== this.cam.y || expected.s !== this.cam.s || box !== this.sceneBox) return;
      updateOutside(this.root.querySelector('.outside-layer'), this.cam, box.width, box.height, 96, {x: box.left, y: box.top});
    };
    // Restore a useful pan reserve after settling, including under opaque floors.
    // Retained crops near an edge must not put their first renewal on a gesture.
    if (window.requestIdleCallback) this.outsideWarmIdle = window.requestIdleCallback(warm, { timeout: 500 });
    else this.outsideWarmTimer = window.setTimeout(warm, 80);
  }
  private cameraExtent() {
    const g = this.grounds?.bounds ?? { x: 0, y: 0, ...this.size };
    const f=this.forestBounds, x=Math.min(g.x,f?.x??g.x), y=Math.min(g.y,f?.y??g.y);
    return { x, y, w: Math.max(g.x+g.w,this.campusRight,f?f.x+f.w:0)-x, h:Math.max(g.y+g.h,this.campusHeight,f?f.y+f.h:0)-y };
  }
  private cameraZoomBounds() {
    const g = this.cameraExtent(), box = this.sceneBox ??= this.scene.getBoundingClientRect();
    return { min: Math.max(Number.EPSILON, Math.min(box.width / g.w, box.height / g.h) * .75), max: 5 };
  }
  private clampCam() {
    if (!this.grounds) return;
    const box = this.sceneBox ??= this.scene.getBoundingClientRect(), W = box.width, H = box.height;
    if (!W || !H) return;
    const c = this.cam, min = this.cameraZoomBounds().min;
    if (c.s < min) { const k = min / c.s; c.x = W / 2 - (W / 2 - c.x) * k; c.y = H / 2 - (H / 2 - c.y) * k; c.s = min; }
    const g = this.cameraExtent(), pad = Math.max(240, 100 / c.s);
    const fit = (t: number, size: number, lo: number, len: number) => len * c.s <= size ? (size - len * c.s) / 2 - lo * c.s : Math.min(-lo * c.s, Math.max(size - (lo + len) * c.s, t));
    c.x = fit(c.x, W, g.x - pad, g.w + 2 * pad);
    c.y = fit(c.y, H, g.y - pad, g.h + 2 * pad);
  }
  private apply() {
    if (this.hostWorld) { this.recull(); return; }
    if (this.scene.inert || document.hidden) { this.presentationDirty = true; return; }
    const started = beginSystem();
    this.clampCam();
    this.root.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
    const labelDetail = this.cam.s < 1.15 ? "compact" : "full";
    if (this.root.dataset.labelDetail !== labelDetail) this.root.dataset.labelDetail = labelDetail;
    // While the camera moves, the GPU slides and scales one frozen picture of the world
    // (see .world.zooming). Zooming in magnifies it, so it is redrawn every 1.12x, too
    // small a step to see as a resolution change; shrinking stays crisp longer (1.6x).
    // It is redrawn once more when the camera settles.
    if (this.cam.s !== this.lastScale || this.cam.x !== this.lastX || this.cam.y !== this.lastY) {
      this.lastScale = this.cam.s; this.lastX = this.cam.x; this.lastY = this.cam.y;
      if (!this.zooming) { this.zooming = true; setCameraMoving(true); this.rasterScale = this.cam.s; this.root.classList.add("zooming"); }
      // A compositor glide is rasterized by Chromium at its sharpest scale up front.
      else if (this.glideAnim) this.rasterScale = this.cam.s;
      else if (!this.resharpen && (this.cam.s / this.rasterScale > 1.12 || this.rasterScale / this.cam.s > 1.6)) this.redrawSharp();
      window.clearTimeout(this.zoomEnd);
      this.cancelOutsideWarm();
      // Settle only once a compositor glide is over: redrawing the world mid-glide makes
      // Chromium re-raster everything while it animates, and unready tiles flash blank.
      const settle = () => {
        // a glide whose finish event was missed must not keep the camera "moving" forever
        if (this.glideAnim?.playState === "finished") this.endGlide(this.glideAnim);
        if (this.glideAnim) { this.zoomEnd = window.setTimeout(settle, 40); return; }
        this.zooming = false; setCameraMoving(false); this.redrawSharp(); this.scheduleOutsideWarm();
        syncRobotCanvases(this.cam.s);   // resharpen robot canvases for the zoom it settled at
      };
      this.zoomEnd = window.setTimeout(settle, 180);
    }
    // During a compositor glide everything between its start and end view is shown, so
    // culling, terrain, scenery and weather prepare that whole span at its sharpest scale.
    const realCam = this.cam, realBox = this.sceneBox;
    if (this.glideSpan) { this.cam = this.glideSpan.cam; this.sceneBox = this.glideSpan.box; }
    try { this.applyView(); } finally { this.cam = realCam; this.sceneBox = realBox; }
    const robotsOnCanvas = canvasRobotsWanted(this.cam.s);
    if (robotsOnCanvas !== this.canvasRobots) { this.canvasRobots = robotsOnCanvas; syncRobotCanvases(this.cam.s); }
    // small looping details (steam, swaying plants, birds) only move when you are close enough to see them
    const near = this.cam.s >= 1;
    if (near !== this.near) { this.near = near; this.scene.classList.toggle("near", near); }
    // Far overview traces showed compositor layer-building dominating paint.
    // These SVG actors keep their full artwork and motion; only the unnecessary
    // permanent promotion hint changes within the existing distant-view band.
    const overview = this.cam.s < .3;
    if (overview !== this.overviewLayers) { this.overviewLayers = overview; this.root.classList.toggle('overview', overview); }
    endSystem("camera", started);
  }
  /** Everything that follows the visible area (this.cam and this.sceneBox). */
  private applyView() {
    this.recull();
    this.syncBuildings();
    if(this.sceneryCull && this.outArgs && !this.viewIndoors) {
      const box0 = this.sceneBox ??= this.scene.getBoundingClientRect();
      const view={x:-this.cam.x/this.cam.s-this.outArgs.ox,y:-this.cam.y/this.cam.s-this.outArgs.oy,w:box0.width/this.cam.s,h:box0.height/this.cam.s};
      const density=this.cam.s*(window.devicePixelRatio||1), previous=this.sceneryView;
      // A conservative guard band reuses exact paths during short pans. Only
      // newly exposed geometry or a density change needs another culling pass.
      if(!previous || previous.density!==density || view.x<previous.x || view.y<previous.y || view.x+view.w>previous.x+previous.w || view.y+view.h>previous.y+previous.h) {
        const pad=140/this.cam.s;
        this.sceneryView={x:view.x-pad,y:view.y-pad,w:view.w+2*pad,h:view.h+2*pad,density};
        this.sceneryCull.update(this.sceneryView,density);
      }
    }
    setZoom(this.cam.s, this.cam.x, this.cam.y);
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    // The footprint already proves every displayed pixel is behind opaque
    // office geometry. Keep the sharp ground cache parked until it is exposed;
    // drawing it underneath the floors can otherwise monopolize a pinch frame.
    if (!this.viewIndoors) updateOutside(this.root.querySelector(".outside-layer"), this.cam, box.width, box.height, 0, {x: box.left, y: box.top});
    else this.scheduleOutsideWarm();
    this.viewLandscape();
    updateStaticArt(this.cam,box.width,box.height,box.left,box.top);
    // the weather follows the camera without measuring the page (which is slow every frame)
    if (this.fx) { this.sceneBox ??= this.scene.getBoundingClientRect(); this.fx.setCamera(this.cam, this.sceneBox, this.size.w, this.viewIndoors ? this.size.h : undefined); }
  }

  /** Redraws the world at the current zoom. Chromium never re-rasterizes a promoted layer
   * (will-change: transform) when its scale changes, so robots promoted while zoomed out stay
   * pixelated when zoomed in. Dropping every promotion for one committed frame (.resharp)
   * makes Chromium paint them again at the current scale. */
  private redrawSharp() {
    cancelAnimationFrame(this.resharpen);
    this.rasterScale = this.cam.s;
    this.root.classList.remove("zooming");
    this.root.classList.add("resharp");
    // Two frames: the class change must be committed once before promotion returns.
    this.resharpen = requestAnimationFrame(() => {
      this.resharpen = requestAnimationFrame(() => {
        this.resharpen = 0;
        this.root.classList.remove("resharp");
        if (this.zooming) this.root.classList.add("zooming");
      });
    });
  }

  /** Moves the view at once (a side panel changing width keeps the office still on screen). */
  panBy(dx: number, dy = 0) { this.cam.x += dx; this.cam.y += dy; this.sceneBox = null; this.apply(); }

  /** The view the camera is fitted to (a desk, a room, the building); a resize fits it again. */
  private frame: { rect: { x: number; y: number; w: number; h: number }; pad: number } | null = null;
  private fitTarget(rect: { x: number; y: number; w: number; h: number }, pad: number, W: number, H: number) {
    const s = Math.min((W - pad * 2) / rect.w, (H - pad * 2) / rect.h, 6);
    return { s, x: W / 2 - (rect.x + rect.w / 2) * s, y: H / 2 - (rect.y + rect.h / 2) * s };
  }
  private fit(rect: { x: number; y: number; w: number; h: number }, pad: number, W: number, H: number) {
    Object.assign(this.cam, this.fitTarget(rect, pad, W, H));
  }

  flyTo(rect: { x: number; y: number; w: number; h: number }, pad = 40, d = 1, insetRight = 0) {
    const W = this.scene.clientWidth - insetRight, H = this.scene.clientHeight;
    if (!W || !H) return;
    this.stopFollow(); this.cancelCameraTween();
    this.frame = { rect, pad };
    this.cameraTween = gsap.to(this.cam, { ...this.fitTarget(rect, pad, W, H), duration: d, ease: "power3.inOut", onUpdate: () => this.apply() });
  }
  onFocus: (d: Desk | null) => void = () => {};
  panelWidth = 0;
  hidden = new Set<string>();          // project ids whose office is hidden in the app
  extra = new Map<string, number>();   // room id -> desks added by hand
  homes = new Map<string, string>();   // user-assigned home, independent of the robot's current activity
  pendingSeat: { room: string; index: number; threadId?: string } | null = null;
  /** The first empty desk in a room, or the next place after its last desk. */
  firstFreeDesk(room: string) {
    const plan = this.physicalPlans.find((p) => p.id === room && !p.collapsed);
    if (plan) { const free = plan.threads.slice(0, plan.slots).findIndex((t) => !t); return free >= 0 ? free : plan.slots; }
    const seats = this.seats.get(room) ?? [];
    const free = seats.indexOf(null);
    return free >= 0 ? free : seats.length;
  }
  canRemoveEmptyDesk(slot: string) {
    const [room, rawIndex] = slot.split("#"), index = Number(rawIndex);
    const plan = this.physicalPlans.find(p => p.id === room && !p.collapsed);
    const desk = this.slotDesks.get(slot);
    // Recheck the real desk and reservations, including a launch still in flight.
    return !!plan && !!desk && !desk.threadId && Number.isInteger(index) && index >= 0 && index < plan.slots
      && !plan.threads[index] && !this.seats.get(room)?.[index]
      && this.pendingSeat?.room !== room;
  }
  removeEmptyDesk(slot: string) {
    if (!this.canRemoveEmptyDesk(slot)) return false;
    const [room, rawIndex] = slot.split("#"), index = Number(rawIndex);
    const seats = this.seats.get(room);
    if (seats && index < seats.length) seats.splice(index, 1);
    this.extra.set(room, Math.max(0, (this.extra.get(room) ?? 0) - 1));
    return true;
  }
  emptyDeskSlots(room: string) {
    return [...this.slotDesks.keys()].filter(slot => slot.split('#')[0] === room && this.canRemoveEmptyDesk(slot));
  }
  removeEmptyDesks(room: string) {
    // Work backwards so splicing one free reservation cannot move a later target.
    const slots = this.emptyDeskSlots(room).sort((a,b) => Number(b.split('#')[1]) - Number(a.split('#')[1]));
    return slots.reduce((count, slot) => count + Number(this.removeEmptyDesk(slot)), 0);
  }
  isLastDesk(slot: string) {
    const [room, index] = slot.split("#");
    const plan = this.physicalPlans.find((p) => p.id === room);
    return !!plan && Number(index) === plan.slots - 1;
  }
  onFreeDesk: (desk: Desk, room: string, x: number, y: number) => void = () => {};
  onAddDesk: (room: string) => void = () => {};
  onRemoveEmptyDesk: (slot: string) => void = () => {};
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
  orchPresence: "awake" | "sleep" | "away" = "awake";
  attachDir = "";

  private layoutArchive: Record<string, OfficeLayout> = {};
  private rememberLayout() {
    if (!this.lastData) return;
    this.layoutArchive[this.lastData.environmentId || 'local'] = {
      roomOrder: [...this.roomOrder], expandedRooms: [...this.expandedRooms], collapsedRooms: [...this.collapsedRooms], roomColumns: Object.fromEntries(this.roomColumns), hidden: [...this.hidden],
      extra: Object.fromEntries(this.extra), homes: Object.fromEntries(this.homes),
      seats: Object.fromEntries(this.seats), themes: Object.fromEntries(this.themes),
    };
  }
  private layoutForEnvironment(environment?: string) {
    const key = environment || 'local';
    if (this.layoutArchive[key] || !environment) return this.layoutArchive[key];
    // Earlier releases stored all computers together. Retain their scoped edits
    // when creating the first independent record for this computer.
    const legacy = this.layoutArchive.local;
    if (!legacy) return undefined;
    const threadPrefix = `${environment}::`, projectPrefix = `p:${threadPrefix}`;
    const scoped = (id: string) => id.startsWith(projectPrefix);
    const entries = <T>(record: Record<string, T>, accept: (id: string) => boolean) => Object.fromEntries(Object.entries(record).filter(([id]) => accept(id)));
    const seats = entries(legacy.seats, scoped);
    for (const room of ['main', 'freelance']) {
      const previous = legacy.seats[room] ?? [];
      if (previous.some(id => id?.startsWith(threadPrefix))) seats[room] = previous.map(id => id?.startsWith(threadPrefix) ? id : null);
    }
    return this.layoutArchive[key] = {
      roomOrder: legacy.roomOrder.filter(scoped), expandedRooms: legacy.expandedRooms.filter(scoped), collapsedRooms: (legacy.collapsedRooms ?? []).filter(scoped),
      hidden: legacy.hidden.filter(id => id.startsWith(threadPrefix)),
      roomColumns: entries(legacy.roomColumns ?? {}, scoped),
      extra: entries(legacy.extra, scoped), themes: entries(legacy.themes, scoped),
      homes: entries(legacy.homes, id => id.startsWith(threadPrefix)), seats,
    };
  }
  private applyOfficeLayout(layout?: OfficeLayout) {
    this.roomOrder = [...(layout?.roomOrder ?? [])]; this.expandedRooms = new Set(layout?.expandedRooms ?? []); this.collapsedRooms = new Set(layout?.collapsedRooms ?? []);
    this.roomColumns = new Map(Object.entries(layout?.roomColumns ?? {}).map(([id, value]) => [id, officeColumns(value)]));
    this.hidden = new Set(layout?.hidden ?? []); this.extra = new Map(Object.entries(layout?.extra ?? {}));
    this.homes = new Map(Object.entries(layout?.homes ?? {})); this.seats = new Map(Object.entries(layout?.seats ?? {}));
    this.themes = new Map(Object.entries(layout?.themes ?? {}));
  }
  restoreLayouts(layouts: Record<string, OfficeLayout>) {
    Object.assign(this.layoutArchive, layouts);
    const current = this.layoutArchive[this.lastData?.environmentId || 'local'];
    if (current) this.applyOfficeLayout(current);
  }
  exportLayouts() {
    this.rememberLayout();
    for (const entry of this.neighbors.values()) entry.office?.rememberLayout();
    return this.layoutArchive;
  }

  private buildings: EnvironmentBuilding[] = [];
  private openBuilding: (id: string) => Promise<void> = async () => {};
  private loadBuilding: (id: string) => Promise<WorldData> = async () => { throw Error('Connection unavailable'); };
  private neighbors = new Map<string, { el: HTMLElement; office: World | null; x: number; y: number; busy: boolean; status: HTMLElement; open: HTMLButtonElement }>();
  onCampusChange: () => void = () => {};
  get campusDesks(): { id: string; desk: Desk; x: number; y: number }[] {
    return [...[...this.desks].map(([id, desk]) => ({ id, desk, x: 0, y: 0 })),
      ...[...this.neighbors.values()].flatMap(entry => entry.office ? [...entry.office.desks].map(([id, desk]) => ({ id, desk, x: parseFloat(entry.el.style.left) || entry.x, y: parseFloat(entry.el.style.top) || entry.y })) : [])];
  }
  activityDeskFor(id: string) { return this.deskFor(id) ?? this.campusDesks.find(row => row.id === id)?.desk ?? null; }
  private campusRight = 0;
  private campusHeight = 0;
  private campusTimer = 0;
  setBuildings(buildings: typeof this.buildings, open: (id: string) => Promise<void>, load: (id: string) => Promise<WorldData>) {
    this.buildings = buildings; this.openBuilding = open; this.loadBuilding = load; this.drawBuildings();
    if (!this.campusTimer) {
      this.campusTimer = window.setInterval(() => { if (!document.hidden && !this.scene.inert) void this.refreshBuildings(); }, 15000);
      window.addEventListener('pagehide', this.destroyBuildings, { once: true });
    }
    void this.refreshBuildings();
  }
  private destroyBuildings = () => {
    this.layoutObserver?.disconnect(); this.layoutObserver = null;
    this.finishRoomTransitions();
    window.clearInterval(this.campusTimer); this.campusTimer = 0;
    for (const entry of this.neighbors.values()) { entry.office?.rememberLayout(); entry.office?.destroyEmbedded(); this.roomTweens.get(entry.el)?.kill(); entry.el.remove(); }
    this.neighbors.clear();
    this.sceneryCull?.destroy(); this.sceneryCull=null;
  };
  private destroyEmbedded() {
    for (const room of this.rooms) releaseOfficeWidth(room.el);
    this.layoutObserver?.disconnect(); this.layoutObserver = null;
    document.removeEventListener('visibilitychange', this.visibilityPresentation);
    this.cancelCameraTween(); this.cancelOutsideWarm(); window.clearTimeout(this.zoomEnd); cancelAnimationFrame(this.resharpen); this.resharpen = 0;
    this.cancelTouchLayoutFlush();
    this.deskBuildTween?.progress(1).kill(); this.deskBuildTween = null;
    for (const g of this.ghosts.values()) { window.clearTimeout(g.timer); gsap.killTweensOf(g.el); }
    for (const walker of this.transit.values()) walker.destroy(); this.transit.clear(); this.trips.clear(); this.wakeRoutes();
    for (const d of this.allDesks) d.destroy(); this.allDesks.clear(); this.desks.clear();
    for (const extension of Object.values(this.ext)) extension?.destroy();
    this.park.destroy(); this.fx?.destroy();
    this.sceneryCull?.destroy(); this.sceneryCull=null;
    this.landscape?.destroy(); this.landscape = null;
    this.finishRoomTransitions();
    for (const room of this.rooms) releaseRoomVectors(room.el);
    this.root.remove();
  }
  private async refreshBuildings() {
    for (const [id, entry] of this.neighbors) {
      if (entry.busy || !this.buildings.find(b => b.id === id)?.canOpen) continue;
      entry.busy = true;
      try {
        const data = await this.loadBuilding(id);
        if (this.neighbors.get(id) !== entry) continue;
        if (!entry.office) {
          const host = document.createElement('div'); host.className = 'neighbor-office'; entry.el.append(host);
          const office = new World(host, this.services, this); office.scene = this.scene;
          office.building = this.buildings.find(b => b.id === id)!.label;
          office.extFactory = this.extFactory;
          office.onLayoutChange = () => { office.rememberLayout(); this.drawBuildings(); this.syncBuildings(); this.onLayoutChange(); };
          office.onRoomMenu = room => office.showRoom(room.id);
          office.onSelectThread = threadId => { void this.openBuilding(id).then(() => this.onSelectThread(threadId)).catch(error => { entry.status.textContent = error instanceof Error ? error.message : 'Could not open this session. Try again.'; }); };
          const openDesk = (desk: Desk, screen: boolean, slot = '', x = 0, y = 0) => {
            const threadId = desk.threadId, roomId = desk.room;
            entry.status.textContent = 'Opening computer...';
            void this.openBuilding(id).then(async () => {
              if (this.lastData?.environmentId !== data.environmentId) return;
              this.setRoomExpanded(roomId, true);
              if (threadId) this.onSelectThread(threadId);
              // Activating a building may still be evacuating the previous floor.
              // Retain the click until that computer exists in the active world.
              let target = threadId ? this.desks.get(threadId) : this.slotDesks.get(slot);
              for (let attempt = 0; !target && attempt < 150; attempt++) {
                await pause(.1);
                if (this.lastData?.environmentId !== data.environmentId) return;
                target = threadId ? this.desks.get(threadId) : this.slotDesks.get(slot);
              }
              if (!target) throw Error('This computer changed. Open its office and try again.');
              if (threadId) { this.select(target); if (screen) this.focusScreen(target); else this.focusOn(target); }
              else this.onFreeDesk(target, slot, x, y);
            }).catch(error => { entry.status.textContent = error instanceof Error ? error.message : 'Could not open this computer. Try again.'; });
          };
          office.onOpenDesk = (desk, screen) => openDesk(desk, screen);
          office.onFreeDesk = (desk, slot, x, y) => openDesk(desk, false, slot, x, y);
          office.onFreeDeskMenu = office.onFreeDesk;
          office.onRemoveEmptyDesk = slot => { void this.openBuilding(id).then(() => { if (this.lastData?.environmentId === data.environmentId) this.onRemoveEmptyDesk(slot); }).catch(error => { entry.status.textContent = String(error.message || error); }); };
          office.onAddDesk = room => { void this.openBuilding(id).then(() => this.onAddDesk(room)).catch(error => { entry.status.textContent = String(error.message || error); }); };
          entry.office = office;
        }
        entry.office.update(data);
        entry.el.dataset.projects = String(data.projects.length); entry.el.dataset.sessions = String(data.threads.length);
        entry.status.textContent = ''; entry.open.disabled = false;
        this.drawBuildings(); this.syncBuildings(); this.onCampusChange();
      } catch (error) {
        if (this.neighbors.get(id) === entry) entry.status.textContent = error instanceof Error ? error.message : 'Could not refresh this computer. Retrying shortly.';
      } finally { entry.busy = false; }
    }
  }
  private syncBuildings() {
    for (const entry of this.neighbors.values()) if (entry.office) {
      const office = entry.office;
      office.cam = { x: this.cam.x + (parseFloat(entry.el.style.left) || entry.x) * this.cam.s, y: this.cam.y + (parseFloat(entry.el.style.top) || entry.y) * this.cam.s, s: this.cam.s };
      office.sceneBox = this.sceneBox; office.journeyInsets = this.journeyInsets; office.root.classList.toggle('overview', this.cam.s < .3);
      office.recull();
    }
  }
  private drawBuildings() {
    if (this.hostWorld) return;
    const buildings = this.buildings.filter(b => this.lastData?.environmentId ? b.id !== this.lastData.environmentId : !b.local);
    const keep = new Set(buildings.map(b => b.id));
    for (const [id, entry] of this.neighbors) if (!keep.has(id)) { entry.office?.rememberLayout(); entry.office?.destroyEmbedded(); this.roomTweens.get(entry.el)?.kill(); entry.el.remove(); this.neighbors.delete(id); }
    const campus = campusPlan([
      { id: 'active', ...this.size, entranceY: this.topH + HALL / 2 },
      ...buildings.map(b => { const office = this.neighbors.get(b.id)?.office; return { id: b.id, outdoors: false, w: office?.size.w ?? 1400, h: office?.size.h ?? 800, entranceY: office ? office.topH + HALL / 2 : 400 }; }),
    ], { w: PARK_W, h: PARK_H });
    this.campusRight = campus.bounds.w; this.campusHeight = campus.bounds.h;
    let createdOffice = false;
    for (const building of buildings) {
      const district = campus.districts.get(building.id)!;
      const { x, y } = district.building;
      let entry = this.neighbors.get(building.id);
      if (!entry) {
        const el = document.createElement('section'); el.className = 'neighbor-building'; el.dataset.environment = building.id;
        const open = document.createElement('button'); open.type = 'button'; open.className = 'neighbor-open';
        const status = document.createElement('p'); status.className = 'neighbor-status'; status.setAttribute('role', 'status');
        const created = { el, office: null, x, y, busy: false, status, open }; entry = created;
        open.addEventListener('click', async () => { if (open.disabled) return; open.disabled = true; gameSound.at('open', open); try { await this.openBuilding(building.id); } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not open this computer. Try again.'; } finally { open.disabled = !this.buildings.find(b => b.id === building.id)?.canOpen; } });
        el.append(open, status); this.root.append(el); this.neighbors.set(building.id, entry); createdOffice = true;
      }
      entry.open.textContent = building.label; entry.open.disabled = !building.canOpen;
      // The sign follows T3's live state: offline, expired, not shared, or a failed connection.
      const quiet = building.canOpen && building.link !== 'failed' && building.status !== 'unreachable' && building.status !== 'expired';
      const note = !quiet ? buildingState(building) : entry.office ? '' : 'Reading projects and sessions from T3 Code';
      if (entry.status.textContent !== note) entry.status.textContent = note;
      entry.el.dataset.state = quiet ? 'open' : building.status === 'unreachable' || building.status === 'expired' ? 'offline' : 'closed';
      entry.open.title = building.reason || buildingState(building);
      entry.el.setAttribute('aria-label', `${building.label} office`);
      const moving = entry.el.style.left && (entry.x !== x || entry.y !== y);
      entry.x = x; entry.y = y;
      if (moving && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.tweenRoom(entry.el, { left: x, top: y, onUpdate: () => this.syncBuildings() });
      else if (!this.roomTweens.has(entry.el)) { entry.el.style.left = `${x}px`; entry.el.style.top = `${y}px`; }
      const office = entry.office;
      const width = office ? office.size.w : 1400;
      const height = district.bounds.h;
      entry.el.style.width = `${width}px`; entry.el.style.height = `${height}px`;

    }
    // Outdoor positions stay local to each computer, even when campus rows wrap.
    for (const { office } of [{ office: this }, ...[...this.neighbors.values()].filter(e => e.office).map(e => ({ office: e.office! }))]) {
      const position = districtPlan({ id: '', ...office.size, entranceY: office.topH + HALL / 2 }, { w: PARK_W, h: PARK_H }).park;
      if (office.parkPosition?.x !== position.x || office.parkPosition?.y !== position.y) { office.parkPosition = position; office.layoutGrounds(); }
    }
    // Every computer's district (building and park) stays clear of woodland.
    const districts = this.campusDistricts();
    const areas = districts.flatMap(d => [d.building, ...(d.park ? [d.park] : [])]);
    const routes = districts.flatMap(d => {
      const b = d.building, top = d.door - HALL / 2, out = [{ x: b.x + b.w - 40, y: top - 30, w: PARK_W + 350, h: 220 }];
      if (d.park) out.push({ x: d.park.x - 100, y: Math.min(top, d.park.y), w: d.park.w + 200, h: d.park.y + d.park.h - Math.min(top, d.park.y) });
      return out;
    });
    const signature = JSON.stringify([areas,routes]);
    if(signature!==this.forestSig){this.forestSig=signature;this.forestAreas=areas;this.forestRoutes=routes;this.forestBounds=forestPlan(areas,routes).bounds;this.redrawOutside(true);}
    if (createdOffice) void this.refreshBuildings();
  }

  overview() {
    this.unfocus(false);
    const g = this.cameraExtent();
    this.flyTo(g, 40);
  }
  showPark() { const p = this.outdoor?.park; if (p) { this.unfocus(false); this.flyTo({ x: p.x - 40, y: p.y - 40, w: p.w + 80, h: p.h + 80 }, 20); } }
  showRoom(id: string, insetRight = 0) {
    if (this.hostWorld) {
      if (this.rooms.find(r => r.id === id)?.collapsed) this.setRoomExpanded(id, true);
      const entry = [...this.hostWorld.neighbors.values()].find(e => e.office === this), room = this.rooms.find(r => r.id === id);
      if (entry && room) this.hostWorld.flyTo({ x: entry.x + room.x, y: entry.y + room.y, w: room.w, h: room.h }, 30, .45, insetRight);
      return;
    }
    if (this.rooms.find((r) => r.id === id)?.collapsed) this.setRoomExpanded(id, true);
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
    // Mid-glide the desk is still on its way into view.
    if (this.scene.inert || document.hidden || this.glidePath) return;
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

  /** Where the desk's project tag sits, in the desk's own coordinates (it is centred above the monitor and grows upward). */
  private tagFrame(d: Desk) {
    const el = d.el.querySelector(".desk-proj") as HTMLElement | null;
    const w = el && !el.hidden ? el.offsetWidth : 0, h = el && !el.hidden ? el.offsetHeight : 0;
    return { l: 200 - w / 2, r: 200 + w / 2, top: h ? Math.min(-32, 6 - h - 14) : -32 };
  }

  onOpenDesk: (d: Desk, screen: boolean) => void = () => {};
  focusOn(d: Desk) {
    if (this.hostWorld) { this.onOpenDesk(d, false); return; }
    this.stopFollow();
    this.focusDesk = d;
    this.focusMode = "desk";
    // the frame includes the project tag that sits above the monitor, however long its name is
    const tag = this.tagFrame(d), x0 = Math.min(-10, tag.l - 6), x1 = Math.max(UNIT_W + 10, tag.r + 6);
    this.flyTo({ x: parseFloat(d.el.style.left) + x0, y: parseFloat(d.el.style.top) + tag.top, w: x1 - x0, h: UNIT_H - tag.top + 6 }, 18, 0.85, this.panelWidth);
    this.scene.classList.add("screen-mode");
    this.onFocus(d);
  }

  // Fill the view with the robot's screen.
  focusScreen(d: Desk) {
    if (this.hostWorld) { this.onOpenDesk(d, true); return; }
    this.focusDesk = d;
    this.focusMode = "screen";
    const m = GEOM.screen;
    // keep the project tag above the monitor in view, all of it
    const tag = this.tagFrame(d), x0 = Math.min(m.x, tag.l - 6), x1 = Math.max(m.x + m.w, tag.r + 6), y0 = Math.min(m.y, tag.top);
    this.flyTo({ x: parseFloat(d.el.style.left) + x0, y: parseFloat(d.el.style.top) + y0, w: x1 - x0, h: m.y + m.h - y0 }, 22, 0.9, this.panelWidth);
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
  daylight(now = new Date()) {
    if (this.hostWorld) { this.paintClock(); return; }
    // The interface theme can lock the office to midnight (the wall clock keeps real time).
    const themed = currentTheme().world;
    if (themed.alwaysMidnight) { now = new Date(now); now.setHours(0, 30, 0, 0); }
    const h = now.getHours() + now.getMinutes() / 60;
    const S = (sky1: string, sky2: string, stars: number, lamp: number, night: number, city: number) => ({ sky1, sky2, stars, lamp, night, city });
    const v = h < 5 || h >= 21.5 ? S("#0b1030", "#262c62", 1, 1, 0.3, 1)
      : h < 6.5 ? S("#2c3466", "#f2a08a", 0.4, 0.8, 0.18, 0.6)
      : h < 8 ? S("#86b7e8", "#ffd2a8", 0, 0.4, 0.05, 0.2)
      : h < 17 ? S("#6fb2ee", "#d4ecfb", 0, 0.1, 0, 0)
      : h < 19 ? S("#7a7fd0", "#ffbc85", 0, 0.5, 0.05, 0.3)
      : S("#2a2f6a", "#e0708a", 0.5, 0.95, 0.2, 0.9);
    // rain greys the sky and dims the light, storms more so
    const darkness = campusNight(now, this.weather);
    const sky = themed.nightSky && darkness > .6 ? { ...v, ...themed.nightSky, lamp: 1, stars: 1 } : darkness > .6 ? { ...v, sky1: "#080e24", sky2: "#172039", lamp: 1, stars: 1 } : v;
    const t = applySkyTint(sky, this.weather);
    const night = Math.min(.9, darkness + t.dim);
    const st = this.root.style;
    st.setProperty("--sky1", t.sky1); st.setProperty("--sky2", t.sky2);
    st.setProperty("--stars", String(sky.stars * t.stars)); st.setProperty("--lamp", String(Math.min(1, sky.lamp + t.dim * 0.8)));
    st.setProperty("--night", String(night * .45)); st.setProperty("--outdoor-night", String(night));
    // A near-invisible shade still costs a full-screen blend every frame; skip it by day.
    this.root.classList.toggle("no-night-shade", night * .45 * .9 < .02);
    // a warm low sun at dawn and dusk, fading under cloud
    const dusk = h >= 5 && h < 8 ? Math.max(0, 1 - Math.abs(h - 6.6) / 1.5) : h >= 16.5 && h < 21 ? Math.max(0, 1 - Math.abs(h - 18.6) / 2.2) : 0;
    st.setProperty("--outdoor-dusk", (dusk * Math.max(0, 1 - t.dim * 2.5)).toFixed(2)); st.setProperty("--city", String(v.city));
    // the grass beyond the drawn outdoors darkens with the same night tint
    this.root.parentElement?.style.setProperty("--scene-night", String(night));
    const { look, g } = this.ground();
    this.fx?.set(this.weather, { night, season: look.season, frozen: look.frozen, ground: { puddles: g.puddles, hot: g.hot, prints: look.snowCover >= 0.3 } });
    // the real wind sways the trees (ambient.css), fog puts halos round the lamps, frost rims the windows
    const w = this.weather;
    st.setProperty("--wind", (w ? Math.min(1, Math.max(0.1, w.windKmh / 55, w.kind === "storm" ? 0.85 : 0)) : 0.2).toFixed(2));
    st.setProperty("--fog", w?.kind === "fog" ? "1" : "0");
    st.setProperty("--frost", g.frost ? "1" : "0");
    this.park.setGear(gearFor(w));
    for (const entry of this.neighbors.values()) entry.office?.park.setGear(gearFor(w));
    this.redrawOutside();
    this.paintClock();
    this.syncBuildings();
    invalidateStaticArt();
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

function officeDecor(r: Room, slots: number, theme?: RoomTheme) {
  const { w, h, kind } = r, T = 16, cols = columnsForRoom(r);
  const desks = Array.from({ length: slots }, (_, k) => { const { c, row } = snakeSeat(k, cols); return { x: 70 + c * SLOT_W, y: WALL_FACE + 40 + row * SLOT_H, w: UNIT_W, h: UNIT_H }; });
  const avoid = [{ x: 30, y: T, w: 148, h: WALL_FACE - T }, ...(kind === "main" ? [{ x: w - 112, y: T, w: 64, h: 66 }] : []), ...(kind === "freelance" ? [{ x: w - 430, y: WALL_FACE - 10, w: 310, h: 70 }] : [])];
  return placeDecor(usable(theme), w, h, WALL_FACE, desks, { avoid, wallTop: T });
}

function roomSvg(r: Room, slots: number, theme?: RoomTheme, owner?:string) {
  const { w, h, kind, title, icon } = r;
  const raw = {
    main: { wall: "#ece6da", trim: "#d8cfbf", floor: "#c9a274", seam: "#b88f61", accent: "#ff9f5a" },
    project: { wall: "#e4e7ee", trim: "#cdd2dc", floor: "#bf9a70", seam: "#ab8660", accent: "#4fb6ff" },
    freelance: { wall: "#f0dfcb", trim: "#dcc4a8", floor: "#c98a6a", seam: "#b8775a", accent: "#ff6f91" },
    break: { wall: "#e6eadf", trim: "#d0d6c5", floor: "#c9a274", seam: "#b88f61", accent: "#4ff0a0" },
    queue: { wall: "#ebe4ef", trim: "#d6cddd", floor: "#c9a274", seam: "#b88f61", accent: "#b07cff" },
    charging: { wall: "#e6eadf", trim: "#d0d6c5", floor: "#c49a6c", seam: "#b2875b", accent: "#4ff0a0" },
  }[kind];
  // Interface themes can restyle the default materials (themes/tokens.css, --wd-*); each room's
  // own colour stays the fallback. Purchased floors and walls keep their look.
  const tile = kind === "freelance";
  const pal = { ...raw, wall: `var(--wd-wall, ${raw.wall})`, trim: `var(--wd-trim, ${raw.trim})`,
    floor: tile ? `var(--wd-tile, ${raw.floor})` : `var(--wd-floor, ${raw.floor})`, seam: tile ? `var(--wd-tile-seam, ${raw.seam})` : `var(--wd-seam, ${raw.seam})` };
  if (r.collapsed) {
    const doorX = kind === "main" ? w / 2 - 30 : w - 74, doorY = kind === "main" ? h - 64 : 16;
    return `<svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <rect width="${w}" height="${h}" style="fill:${pal.floor}"/>
      <rect width="${w}" height="${WALL_FACE}" style="fill:${pal.wall}"/><rect width="${w}" height="16" style="fill:${pal.trim}"/>
      <rect x="16" y="16" width="${w - 32}" height="${WALL_FACE - 16}" style="fill:${pal.wall}"/>
      <rect x="30" y="26" width="${w - 140}" height="68" rx="8" style="fill:var(--wd-sign, #fff)" opacity="0.94"/>
      ${icon ? `<image href="${icon}" x="40" y="37" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="40" y="37" width="46" height="46" rx="10" fill="${pal.accent}"/><text x="63" y="68" text-anchor="middle" font-size="19" fill="#fff" font-family="var(--font)">${esc(monogram(title))}</text>`}
      <foreignObject x="98" y="35" width="${w - 218}" height="52"><div xmlns="http://www.w3.org/1999/xhtml" class="room-name">${esc(title)}</div></foreignObject>
      <rect x="${doorX - 4}" y="${doorY - 4}" width="68" height="${kind === "main" ? 68 : 102}" rx="4" style="fill:${pal.trim}"/>
      <rect x="${doorX}" y="${doorY}" width="60" height="${kind === "main" ? 64 : 94}" rx="3" fill="#887461"/>
      <rect x="${doorX + 7}" y="${doorY + 8}" width="46" height="${kind === "main" ? 43 : 72}" rx="2" fill="#9b8771"/>
      <circle cx="${doorX + 49}" cy="${doorY + 48}" r="3" fill="#ffd27a"/>
      <text x="26" y="147" font-size="18" fill="#554b42" font-family="var(--font)">Quiet office</text>
      <rect y="${h - 12}" width="${w}" height="12" style="fill:${pal.trim}"/>
    </svg>`;
  }
  const uid = Math.random().toString(36).slice(2, 8);
  const T = 16; // wall top thickness
  // floor: planks seen from above (or terracotta tiles in the freelancer cafe)
  const floor = kind === "freelance"
    ? cafeTiles(w, h, WALL_FACE, pal.floor, pal.seam,owner)
    : plankJoints(w, h, WALL_FACE, pal.seam,owner);
  // windows on the north wall face
  const windows: string[] = [];
  const hallDoor = kind === "project" || kind === "freelance";
  const nWin = Math.max(1, Math.floor((w - 240 - (hallDoor ? 60 : 0)) / 300));
  for (let i = 0; i < nWin; i++) {
    const wx = 200 + i * ((w - 260) / nWin), ww = Math.min(220, (w - 260) / nWin - 40);
    windows.push(`
      <rect x="${wx - 6}" y="${T + 14}" width="${ww + 12}" height="${WALL_FACE - T - 30}" rx="6" style="fill:${pal.trim}"/>
      <rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#sky${uid})"/>
      <g style="opacity:var(--stars)">${Array.from({ length: 7 }, (_, k) => `<circle cx="${wx + 8 + ((k * 61) % (ww - 16))}" cy="${T + 26 + ((k * 23) % 30)}" r="${k % 3 ? 1 : 1.6}" fill="#fff"/>`).join("")}</g>
      <g style="opacity:var(--frost, 0)"><rect x="${wx}" y="${T + 20}" width="${ww}" height="${WALL_FACE - T - 42}" rx="3" fill="url(#frost${uid})"/>
        <path d="M${wx + 3} ${T + 34}l9 -5l-4 -6M${wx + 10} ${T + 24}l6 7M${wx + ww - 4} ${WALL_FACE - 26}l-10 -4l3 -7M${wx + ww - 14} ${WALL_FACE - 23}l-4 -8" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.9"/></g>
      <rect x="${wx + ww / 2 - 2}" y="${T + 20}" width="4" height="${WALL_FACE - T - 42}" style="fill:${pal.trim}"/>
      <rect x="${wx - 10}" y="${WALL_FACE - 14}" width="${ww + 20}" height="6" rx="3" style="fill:${pal.trim}"/>`);
  }
  // pools of lamp light on the floor (they show at night)
  const lamps: string[] = [];
  for (let ly = WALL_FACE + 170; ly < h - 40; ly += 460)
    for (let lx = 230; lx < w - 60; lx += 420)
      lamps.push(`<ellipse cx="${lx}" cy="${ly}" rx="190" ry="150" fill="url(#pool${uid})" style="opacity:var(--lamp)"/>`);
  const signBox = kind !== "break" && kind !== "queue" ? `
    <g transform="translate(34 ${T + 10})">
      <rect width="140" height="${WALL_FACE - T - 24}" rx="10" style="fill:var(--wd-sign, #ffffff)" opacity="0.94"/>
      ${icon ? `<image href="${icon}" x="10" y="12" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="10" y="12" width="46" height="46" rx="12" fill="${pal.accent}"/><text x="33" y="42" text-anchor="middle" font-size="19" font-weight="600" fill="#fff" font-family="var(--font)">${esc(monogram(title))}</text>`}
      <foreignObject x="62" y="8" width="74" height="${WALL_FACE - T - 40}"><div xmlns="http://www.w3.org/1999/xhtml" class="room-name">${esc(title)}</div></foreignObject>
    </g>` : `<text x="40" y="${T + 52}" font-size="28" font-weight="600" style="fill:var(--wd-sign-ink, #3a3f4f)" font-family="var(--font)">${esc(title)}</text>`;
  const clock = kind === "main" ? `
    <g transform="translate(${w - 80} ${T + 46})">
      <circle r="28" fill="#fff"/><circle r="24" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-1" y="-22" width="2" height="${i % 3 ? 3 : 6}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.8" y="-13" width="3.6" height="15" rx="1.8" fill="#3a3f4f"/>
      <rect class="clock-m" x="-1.2" y="-20" width="2.4" height="22" rx="1.2" fill="#3a3f4f"/>
      <circle r="2.6" fill="${pal.accent}"/>
    </g>` : "";
  const plant = (x: number, y: number, s = 1) => ambientPlant(x, y, s);
  // the room's furnishing: placed around the desks, never on them
  let decorSvg: string | null = null;
  const items = usable(theme);
  if (items.length) {
    decorSvg = officeDecor(r, slots, theme).map((p) => drawDecor(p.id, p.x, p.y, p.scale)).join("");
  }
  return /* svg */ `
  <svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <radialGradient id="frost${uid}" r="0.75"><stop offset="0.45" stop-color="#eef6fb" stop-opacity="0"/><stop offset="0.85" stop-color="#eef6fb" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.95"/></radialGradient>
      <radialGradient id="pool${uid}"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.28"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>
    </defs>
    <g data-cache-live="floor">${theme?.floor ? drawFloor(theme.floor, w, h, WALL_FACE) : `<rect y="${WALL_FACE}" width="${w}" height="${h - WALL_FACE}" style="fill:${pal.floor}"/>${floor}`}</g>
    ${lamps.join("")}
    <rect y="${WALL_FACE}" width="${w}" height="18" fill="#000" opacity="0.07"/>
    ${theme?.wall ? drawWall(theme.wall, w, WALL_FACE) : `<rect width="${w}" height="${WALL_FACE}" style="fill:${pal.wall}"/><rect y="${WALL_FACE - 10}" width="${w}" height="10" style="fill:${pal.trim}"/>`}
    ${windows.join("")}
    ${signBox}${clock}
    ${["main", "project", "freelance"].includes(kind) ? printerArt(h, pal.accent) : ""}
    ${decorSvg ?? `${plant(w - 60, h - 70)}${plant(52, h - 70, 0.85)}`}
    <rect width="${w}" height="${T}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect width="${T}" height="${h}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect x="${w - T}" width="${T}" height="${h}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect y="${h - T}" width="${w}" height="${T}" style="fill:var(--wd-frame, #3a3f4f)"/>
    <rect x="${w / 2 - 60}" y="${h - T}" width="120" height="${T}" style="fill:${pal.floor}"/>
    ${hallDoor ? `<rect x="${w - 74}" y="0" width="56" height="${WALL_FACE}" fill="#7a5236"/><rect x="${w - 69}" y="4" width="46" height="${WALL_FACE - 4}" style="fill:${pal.floor}"/><rect x="${w - 69}" y="${WALL_FACE - 14}" width="46" height="14" fill="#000" opacity="0.08"/>` : ""}
  </svg>`;
}
