import { officeColumns } from "./office-width";
import { Walker, Roster, type Pt } from "../robot";
import { subscriptionBatteries } from "./battery";
import type { Usage } from "../stats/stats";
import gsap from "gsap";
import { watchSvgOpacity } from "../perf/svg-write";
import { GLIDE_MS, GLIDE_EASING, GLIDE_EASE } from "../perf/ease";
import { Desk, type DeskServices } from "./desk";
import type { EnvironmentBuilding } from "./environments";
import { officePlan, type OfficePlan } from "./floor-plan";
import { buildingFootprint } from "./building-footprint";
import { hasOfficeWork, layoutMeeting } from "./room-policy";
import type { RoomTheme } from "./decorate";
import { Park } from "./park";
import type { WeatherLayer, Weather } from "../weather/effects";
import { plainOutsideSvg, type Grounds } from "./outside";
import type { Puddle } from "../weather/ground";
import { LandscapeTiles } from "./landscape-tiles";
import type { LandPlan } from "./landscape";
import { mixin } from "../util/mixin";
import { WorldRouting } from "./world/routing";
import { WorldJourneys } from "./world/journeys";
import { WorldOutdoors } from "./world/outdoors";
import { WorldRooms } from "./world/rooms";
import { WorldLayout } from "./world/layout-pass";
import { WorldDesks } from "./world/desks";
import { WorldDeskDrag } from "./world/desk-drag";
import { WorldCameraView } from "./world/camera-view";
import { WorldCameraInput } from "./world/camera-input";
import { WorldCameraFocus } from "./world/camera-focus";
import { WorldCampus } from "./world/campus";
import type { WThread, WorldData, Room, RoomKind, RoomExtension, PhysicalRoomPlan, OfficeLayout } from "./world/types";
import { HALL } from "./world/geometry";
export type { WThread, WProject, WorldData, OfficeLayout, RoomKind, Room, RoomExtension } from "./world/types";

// The whole building, seen fake top-down: rooms laid out on a floor plan, one shared camera.
// Offices hold desks (one per thread). Desks live in one layer above the rooms, so a robot
// keeps its computer and state when it moves to another room.
//
// World is one class whose behaviour lives in focused files under world/ (routing, journeys,
// outdoors, rooms, the layout pass, desks, desk dragging, camera view, input and focus, and the
// campus). Each file holds a class of methods typed with `this: World`; mixin() below copies them
// onto World, and the interface merge gives World their types. This file keeps the state they
// share, the constructor, settling a thread into its room, empty desks and saved layouts.

export interface World extends WorldRouting, WorldJourneys, WorldOutdoors, WorldRooms, WorldLayout, WorldDesks, WorldDeskDrag, WorldCameraView, WorldCameraInput, WorldCameraFocus, WorldCampus {}

export class World {
  scene: HTMLElement;
  root: HTMLElement;
  rooms: Room[] = [];
  desks = new Map<string, Desk>();
  coinHolds = new Set<string>();
  completionHolds = new Set<string>();
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
  topH = 0;
  floorPlan: OfficePlan = officePlan([], []);
  footprint = buildingFootprint([]);
  viewIndoors = false;
  geometryKey = "";
  layoutRevision = 0;
  routeWaiters = new Set<() => void>();
  roomOf = new Map<string, string>();          // thread -> room id at the last update ("park" too)
  transit = new Map<string, Walker>();
  trips = new Map<string, object>();           // the journey a robot in transit is on (a newer one replaces it)
  known = new Map<string, WThread>();          // every thread at the last update, for robots whose thread went away
  exits = new Map<string, { t: WThread; from: string; to: string | null }>();   // its source room owns the robot until the door handoff
  parkDoor: Pt = { x: 0, y: 0 };
  extLists: { brk: any[]; queue: any[]; charging: any[]; park: any[]; orch?: any } = { brk: [], queue: [], charging: [], park: [] };
  bossPhases = new Map<string, {phase: "reading" | "answered" | "asked"; text?: string}>();
  get hallY() { return this.topH + HALL / 2; }

  sprinting = new Map<string, number>();

  // today's office event from the orchestrator, on the building's name sign
  eventName = "";
  // real weather and the season shape the outdoors and the light
  weather: Weather | null = null;
  fx: WeatherLayer | null = null;
  outArgs: Parameters<typeof plainOutsideSvg>[0] | null = null;
  lookSig = "";
  forestAreas: {x:number;y:number;w:number;h:number}[] = [];
  forestRoutes: {x:number;y:number;w:number;h:number}[] = [];
  forestBounds: {x:number;y:number;w:number;h:number} | null = null;
  forestSig = "";
  /** Rain, snow or a storm now, or rain within 20 minutes: nobody stays outside. */
  get outdoorsWet() {
    const w = this.weather;
    return ["rain", "drizzle", "storm", "snow"].includes(w?.kind ?? "") || (w?.rainSoonMin != null && w.rainSoonMin <= 20);
  }
  // When it last rained and how hard: the puddles dry up over the next 20 minutes (remembered across launches).
  dry: { at: number; level: number } | null = (() => { try { return JSON.parse(localStorage.getItem("lucid:wx:dry") || "null"); } catch { return null; } })();
  puddles: Puddle[] = [];
  landscape: LandscapeTiles | null = null;
  landPlan: LandPlan | null = null;
  landSig = "";
  freeDesks: Desk[] = [];
  roomLayer: HTMLElement;
  deskLayer: HTMLElement;
  cam = { x: 0, y: 0, s: 0.4 };
  cameraTween: ReturnType<typeof gsap.to> | null = null;
  cancelCameraTween() {
    this.cameraTween?.kill(); this.cameraTween = null;
    this.stopGlide();
  }
  /** Wheel glides run as a compositor animation of the world transform: Chromium rasterizes
   * the world once at the glide's sharpest scale and moves it on its compositor thread, so
   * the motion keeps the display rate however busy the page is. this.cam is the glide's goal. */
  glideAnim: Animation | null = null;
  glideSpan: { cam: { x: number; y: number; s: number }; box: DOMRect } | null = null;
  /** Where the running glide goes and when it started, on the clock its animation uses. */
  glidePath: { from: { x: number; y: number; s: number }; to: { x: number; y: number; s: number }; start: number } | null = null;
  /** The camera as currently shown, including a running glide. The glide's position is worked
   * out from its own timing, never read back from the page: Chromium starts a compositor animation
   * a frame or two before the page hears about it, so the computed style still reports the old
   * start and a new notch would restart from there, flashing one frame of the older view. */
  shownCam(now = performance.now()) {
    const g = this.glidePath;
    if (!this.glideAnim || !g) return { x: this.cam.x, y: this.cam.y, s: this.cam.s };
    const p = GLIDE_EASE(Math.min(1, Math.max(0, (now - g.start) / GLIDE_MS)));
    return { x: g.from.x + (g.to.x - g.from.x) * p, y: g.from.y + (g.to.y - g.from.y) * p, s: g.from.s + (g.to.s - g.from.s) * p };
  }
  /** Stop a glide where it is now (a drag or another camera move takes over). */
  stopGlide() {
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
  glideTo(s: number, px: number, py: number) {
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
  shelfLayoutCommit = false;
  shelfPaintRaf = 0;
  shelfClip: { overflow: string; clipPath: string } | null = null;
  restoreShelfClip() {
    if (!this.shelfClip) return;
    Object.assign(this.scene.style, this.shelfClip); this.shelfClip = null;
  }
  glideFrom(from: { x: number; y: number; s: number }, start = performance.now(), previousWidth = 0, shelf = false) {
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
  endGlide(anim: Animation) {
    if (this.glideAnim !== anim) return;
    cancelAnimationFrame(this.shelfPaintRaf); this.shelfPaintRaf = 0;
    this.glideAnim = null; this.glideSpan = null; this.glidePath = null;
    this.fx?.setGlide(null);
    this.restoreShelfClip();
    this.apply();
  }
  // ---- rooms, layout preferences and callbacks ------------------------------------------------

  size = { w: 2000, h: 1600 };
  focusDesk: Desk | null = null;
  selected: Desk | null = null;
  onSelectThread: (id: string) => void = () => {};
  /** A robot was clicked twice: open its worker focus view. `id` is its thread. */
  onRobotFocus: (threadId: string, anchor: Element) => void = () => {};
  onRooms: (rooms: Room[]) => void = () => {};
  roomOrder: string[] = [];
  onRoomOrder: (order: string[]) => void = () => {};
  ext: Partial<Record<"break" | "queue" | "charging", RoomExtension>> = {};
  extFactory: Partial<Record<"break" | "queue" | "charging", (host: HTMLElement, w: number, h: number) => RoomExtension>> = {};
  chargingCapacity = 6;
  setUsage(usage: Usage) { if (!usage?.limits) return; subscriptionBatteries.setUsage(usage); if (this.lastData) this.update(this.lastData); }
  lastKey = "";
  hasLayout = false;
  placed = new Map<string, { room: string; pending?: { room: string; since: number } }>();
  seats = new Map<string, (string | null)[]>();   // persistent reservations, including robots on a break
  slotDesks = new Map<string, Desk>();              // "room#index" -> desk standing there
  expandedRooms = new Set<string>();
  collapsedRooms = new Set<string>();
  roomColumns = new Map<string, number>();
  revealedThread: string | null = null;
  layoutHeld = false;
  touchLayoutHeld = false;
  touchLayoutPending = false;
  touchLayoutIdle = 0;
  touchLayoutTimer = 0;
  roomTweens = new Map<HTMLElement, gsap.core.Tween>();
  retiringRooms = new Set<HTMLElement>();
  retiringRoomById = new Map<string, HTMLElement>();
  physicalPlans: PhysicalRoomPlan[] = [];
  physicalLayoutHeld = false;
  layoutParticipants = new Set<string>();
  pendingMeeting: ReturnType<typeof layoutMeeting> | null = null;
  meetingSpots = new Map<string, ReturnType<typeof layoutMeeting>>();
  layoutUpdateQueued = false;
  /** Source data may be unchanged while a delayed room change is becoming due. */
  get needsRefresh() {
    if (!this.hostWorld && [...this.neighbors.values()].some(entry => entry.office?.needsRefresh)) return true;
    return this.touchLayoutPending && !this.touchLayoutHeld || !!this.pendingSeat || this.physicalLayoutHeld || [...this.placed.values()].some(p => p.pending && Date.now() - p.pending.since > 20000);
  }

  // A robot only changes rooms once the new state has lasted a while, so brief flickers
  // (a turn that shows as queued, a status refresh) never make desks jump around.
  settleRoom(t: WThread, want: string) {
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

  constructor(scene: HTMLElement, readonly services: DeskServices, readonly hostWorld: World | null = null) {
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

  /** A linked computer's office, embedded in this one's campus (campus.ts). */
  neighborOffice(host: HTMLElement) { return new World(host, this.services, this); }

  parkPosition: Pt | null = null;

  allDesks = new Set<Desk>();
  roster: Roster;
  // The Add a desk placeholder: a faint ghost of the next workstation (room-policy addDeskPlace).
  // Unchanged ghosts keep their DOM node, focus and pending state across refreshes.
  ghosts = new Map<string, { el: HTMLButtonElement; sig: string; pending: number | null; timer: number }>();
  deskBuild: { key: string; since: number } | null = null;
  deskBuildTween: gsap.core.Timeline | null = null;

  // Desks and rooms outside the view are not painted at all; their robots keep working, nobody
  // sees it. Worked out from the camera every time it moves (a browser visibility observer can
  // miss a change and leave a desk hidden when it comes back into view).
  cullSet = new Set<HTMLElement>();
  cull = {
    observe: (el: HTMLElement) => { this.cullSet.add(el); this.recull(); },
    unobserve: (el: Element) => { this.cullSet.delete(el as HTMLElement); },
  };
  presentationDirty = false;
  resizePresentation: (() => void) | null = null;
  visibilityPresentation = () => { if (document.hidden) this.finishRoomTransitions(); this.refreshPresentation(); };

  onLayoutChange: () => void = () => {};
  deskDragActive = false;
  slidingDesks = new Set<Desk>();

  threadDropPreview: HTMLElement | null = null;
  pendingPlacement: { id: string; room: string; origin?: Pt } | null = null;

  // --- following a walking robot with the camera -----------------------------------
  // Click a robot that is walking around (break room, park, hallway) and the camera
  // stays on it as it goes about its business. Panning, zooming or Esc lets go.
  followEl: HTMLElement | null = null;
  followTick = (_time: number, delta: number) => {
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
  /** Open the conversation of a followed robot. */
  onFollowChat: (threadId: string) => void = () => {};
  /** You clicked another robot while a chat was open: the chat switches to it without moving the camera. */
  onWatchChat: (threadId: string) => void = () => {};
  // --- camera -------------------------------------------------------------------
  disposeTouchInput: (() => void) | null = null;
  dragged = false;

  // Coalesce fast mouse input into one commit on the display's next animation frame.
  // Let each display frame consume the newest input without a separate 60 Hz deadline.
  // Camera, culling, bubbles and focus work run together at most once per display frame.
  applyQueued = 0;
  flushCamera = () => {
    this.applyQueued = 0;
    this.apply(); this.keepFocus();
  };
  sceneBox: DOMRect | null = null;
  journeyInsets = { left: 0, right: 0 };
  layoutObserver: ResizeObserver | null = null;
  near: boolean | null = null;
  overviewLayers: boolean | null = null;
  lastScale = 0;
  lastX = 0;
  lastY = 0;
  zooming = false;
  /** Whether robots are on their canvases (zoomed out); flipping it switches them all at once. */
  canvasRobots: boolean | null = null;
  zoomEnd = 0;
  rasterScale = 1;
  resharpen = 0;
  outsideWarmIdle = 0;
  outsideWarmTimer = 0;

  /** Moves the view at once (a side panel changing width keeps the office still on screen). */

  /** The view the camera is fitted to (a desk, a room, the building); a resize fits it again. */
  frame: { rect: { x: number; y: number; w: number; h: number }; pad: number } | null = null;

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

  layoutArchive: Record<string, OfficeLayout> = {};
  rememberLayout() {
    if (!this.lastData) return;
    this.layoutArchive[this.lastData.environmentId || 'local'] = {
      roomOrder: [...this.roomOrder], expandedRooms: [...this.expandedRooms], collapsedRooms: [...this.collapsedRooms], roomColumns: Object.fromEntries(this.roomColumns), hidden: [...this.hidden],
      extra: Object.fromEntries(this.extra), homes: Object.fromEntries(this.homes),
      seats: Object.fromEntries(this.seats), themes: Object.fromEntries(this.themes),
    };
  }
  layoutForEnvironment(environment?: string) {
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
  applyOfficeLayout(layout?: OfficeLayout) {
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

  buildings: EnvironmentBuilding[] = [];
  openBuilding: (id: string) => Promise<void> = async () => {};
  loadBuilding: (id: string) => Promise<WorldData> = async () => { throw Error('Connection unavailable'); };
  neighbors = new Map<string, { el: HTMLElement; office: World | null; x: number; y: number; busy: boolean; status: HTMLElement; open: HTMLButtonElement }>();
  onCampusChange: () => void = () => {};
  get campusDesks(): { id: string; desk: Desk; x: number; y: number }[] {
    return [...[...this.desks].map(([id, desk]) => ({ id, desk, x: 0, y: 0 })),
      ...[...this.neighbors.values()].flatMap(entry => entry.office ? [...entry.office.desks].map(([id, desk]) => ({ id, desk, x: parseFloat(entry.el.style.left) || entry.x, y: parseFloat(entry.el.style.top) || entry.y })) : [])];
  }
  campusRight = 0;
  campusHeight = 0;
  campusTimer = 0;
  destroyBuildings = () => {
    this.layoutObserver?.disconnect(); this.layoutObserver = null;
    this.finishRoomTransitions();
    window.clearInterval(this.campusTimer); this.campusTimer = 0;
    for (const entry of this.neighbors.values()) { entry.office?.rememberLayout(); entry.office?.destroyEmbedded(); this.roomTweens.get(entry.el)?.kill(); entry.el.remove(); }
    this.neighbors.clear();
  };

  onOpenDesk: (d: Desk, screen: boolean) => void = () => {};

}

// --- room art (top-down) -----------------------------------------------------------------

mixin(World, WorldRouting, WorldJourneys, WorldOutdoors, WorldRooms, WorldLayout, WorldDesks, WorldDeskDrag, WorldCameraView, WorldCameraInput, WorldCameraFocus, WorldCampus);
