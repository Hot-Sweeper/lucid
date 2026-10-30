import gsap from "gsap";
import { Desk, UNIT_W, UNIT_H, type DeskServices } from "./desk";
import { GEOM } from "./rig";
import { Roster, type RobotProfile } from "./roster";

// The whole building, seen fake top-down: rooms laid out on a floor plan, one shared camera.
// Offices hold desks (one per thread). Desks live in one layer above the rooms, so a robot
// keeps its computer and state when it moves to another room.

export type WThread = {
  id: string; projectId: string; title: string; updatedAt: string; provider: string;
  runStatus: string | null; pinned: boolean; settled: boolean; question: string | null; model: string | null;
  schedule?: { nextRunAt: string | null; everyMs: number | null } | null;
  folder?: string | null;
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

function officeSize(slots: number) {
  const cols = Math.min(COLS, Math.max(1, slots)), rows = Math.ceil(Math.max(1, slots) / COLS);
  return { w: 70 + cols * SLOT_W + 50, h: WALL_FACE + 40 + rows * SLOT_H + 30, cols };
}

export class World {
  scene: HTMLElement;
  root: HTMLElement;
  rooms: Room[] = [];
  desks = new Map<string, Desk>();
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
    const urgent = want === "queue";
    if (urgent) { this.placed.set(t.id, { room: want }); return want; }
    if (!cur.pending || cur.pending.room !== want) cur.pending = { room: want, since: Date.now() };
    if (Date.now() - cur.pending.since > 20000) { this.placed.set(t.id, { room: want }); return want; }
    return cur.room;
  }

  constructor(scene: HTMLElement, private services: DeskServices) {
    this.scene = scene;
    scene.innerHTML = `<div class="world"><div class="building-plate"><span class="bp-dot"></span><b></b></div><div class="hall"></div><div class="room-layer"></div><div class="night-shade"></div><div class="desk-layer"></div></div>`;
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
      const want = t.question ? "queue"
        : this.homes.has(t.id) && !t.settled ? home
        : t.runStatus === "running" || t.pinned ? "main"
        : wait != null && wait > 15 * 60 * 1000 ? "break"
        : wait != null ? "main"
        : t.settled ? "break" : home;
      const room = this.settleRoom(t, want);
      if (room === "queue") queue.push(t);
      else if (room === "main") main.push(t);
      else if (room === "break") brk.push(t);
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
      const { w, h } = officeSize(slots);
      return { id, kind, title, icon, threads: seated as WThread[], slots, w, h };
    };
    const top: Plan[] = [
      { id: "queue", kind: "queue", title: "Questions for you", icon: null, threads: queue, slots: 0, w: 720, h: 800 },
      office("main", "main", "Main office", null, main, 3, 6),
      { id: "break", kind: "break", title: "Break room", icon: null, threads: brk.slice(0, 8), slots: 0, w: 1200, h: 800 },
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

    const key = rooms.map((r, i) => `${r.id}:${plans[i].slots}:${r.x}:${r.y}:${r.icon ? 1 : 0}:${r.title}`).join("|");
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
        } else el.innerHTML = roomSvg(r, plans[i].slots);
        this.roomLayer.appendChild(el);
        r.el = el;
      });
      const hall = this.root.querySelector(".hall") as HTMLElement;
      hall.style.cssText = `top:${topH}px;height:${HALL}px;width:${this.size.w}px`;
      this.root.style.width = `${this.size.w}px`;
      this.root.style.height = `${this.size.h}px`;
      (this.root.querySelector(".building-plate b") as HTMLElement).textContent = this.building;
      // the room sign is the handle for office options
      for (const r of rooms) {
        if (r.kind !== "project" && r.kind !== "freelance") continue;
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
    this.addTiles(plans, rooms);
    for (const [id, d] of this.desks) if (!wanted.has(id)) { if (this.selected === d) this.select(null); d.destroy(); this.allDesks.delete(d); this.desks.delete(id); for (const [k, v] of this.slotDesks) if (v === d) this.slotDesks.delete(k); }
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
          d.room = s.key.split("#")[0];
          this.desks.set(s.t.id, d);
        }
      } else {
        d = here && !here.threadId ? here : this.makeDesk(s.x, s.y);
        if (d.threadId) d.assign(null);
        this.freeDesks.push(d);
      }
      this.slotDesks.set(s.key, d);
      if (d.threadId) d.el.classList.toggle("orch-desk", d.threadId === this.orchThread);
      const cur = { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) };
      if (Math.abs(cur.x - s.x) > 1 || Math.abs(cur.y - s.y) > 1) {
        // a robot changing rooms leaves its old seat and shows up at the new one,
        // instead of its whole desk sliding across the building
        const move = () => { d!.el.style.left = `${s.x}px`; d!.el.style.top = `${s.y}px`; d!.baseZ = Math.round(s.y); d!.lift("move", false); };
        if (d.el.isConnected && d.el.style.opacity !== "0" && d.threadId) {
          gsap.timeline()
            .to(d.el, { opacity: 0, scale: 0.96, duration: 0.35, ease: "power2.in" })
            .add(move)
            .to(d.el, { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" });
        } else move();
      }
    }
    // desks whose seat disappeared are retired properly (their robot and computer stop)
    const inUse = new Set(this.slotDesks.values());
    for (const d of this.allDesks) if (!inUse.has(d)) { this.allDesks.delete(d); if (this.selected === d) this.select(null); d.destroy(); }
    this.ext.break?.setThreads(brkShown.map((t) => ({ id: t.id, provider: t.provider, title: t.title, model: t.model, name: this.roster.byThread(t.id)?.name })) as any);
    this.ext.queue?.setThreads(queue.map((t) => ({ id: t.id, provider: t.provider, title: t.title, question: t.question, model: t.model, name: this.roster.byThread(t.id)?.name })) as any);
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
      const x = fits ? r.x + 70 + c * SLOT_W + 110 : r.x + r.w - 150;
      const y = fits ? r.y + WALL_FACE + 40 + row * SLOT_H + 120 : r.y + 26;
      b.classList.toggle("compact", !fits);
      b.style.cssText = `left:${x}px;top:${y}px`;
      b.addEventListener("click", (e) => { e.stopPropagation(); this.onAddDesk(p.id); });
      this.deskLayer.appendChild(b);
    });
  }

  private makeDesk(x: number, y: number) {
    const d = new Desk(this.deskLayer, x, y, this.services);
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

  // --- camera -------------------------------------------------------------------
  private dragged = false;
  private camera() {
    const s = this.scene;
    s.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.focusDesk) this.unfocus(false);
      const r = s.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const ns = Math.min(5, Math.max(0.08, this.cam.s * Math.exp(-e.deltaY * 0.0015)));
      const wx = (px - this.cam.x) / this.cam.s, wy = (py - this.cam.y) / this.cam.s;
      gsap.killTweensOf(this.cam);
      this.cam.s = ns; this.cam.x = px - wx * ns; this.cam.y = py - wy * ns;
      this.apply();
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
      if (!this.dragged) { this.dragged = true; s.classList.add("panning"); if (this.focusDesk) this.unfocus(false); }
      gsap.killTweensOf(this.cam);
      this.cam.x = start.cx + dx; this.cam.y = start.cy + dy;
      this.apply();
    });
    window.addEventListener("pointerup", () => { start = null; s.classList.remove("panning"); setTimeout(() => (this.dragged = false), 0); });
    s.addEventListener("click", (e) => { if (!this.dragged && !(e.target as HTMLElement).closest(".desk-unit")) this.select(null); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.focusDesk) { e.preventDefault(); this.unfocus(); } });
    new ResizeObserver(() => this.apply()).observe(s);
  }

  private apply() {
    this.root.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.s})`;
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
  orchThread = "";
  attachDir = "";

  overview() { this.unfocus(false); this.flyTo({ x: 0, y: -110, w: this.size.w, h: this.size.h + 110 }, 24); }
  showRoom(id: string) {
    const r = this.rooms.find((q) => q.id === id);
    if (r) { this.unfocus(false); this.flyTo({ x: r.x, y: r.y, w: r.w, h: r.h }, 30); }
  }
  showDesk(d: Desk) {
    this.unfocus(false);
    this.flyTo({ x: parseFloat(d.el.style.left) - 20, y: parseFloat(d.el.style.top) - 40, w: UNIT_W + 40, h: UNIT_H + 60 }, 30);
  }

  // Bring a whole desk close (robot, desk and screen), with the chat beside it.
  focusOn(d: Desk) {
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
    const st = this.root.style;
    st.setProperty("--sky1", v.sky1); st.setProperty("--sky2", v.sky2);
    st.setProperty("--stars", String(v.stars)); st.setProperty("--lamp", String(v.lamp));
    st.setProperty("--night", String(v.night)); st.setProperty("--city", String(v.city));
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

function roomSvg(r: Room, slots: number) {
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
  const nWin = Math.max(1, Math.floor((w - 240) / 300));
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
  const plant = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="4" cy="10" rx="30" ry="12" fill="#2b1d10" opacity="0.15"/>
      <circle r="24" fill="#c86b4a"/><circle r="19" fill="#5a3b2a"/>
      <path d="M0 0 C-30 -10 -28 -34 -6 -40 C-8 -20 -4 -8 0 0 Z" fill="#3f9b6e"/>
      <path d="M0 0 C26 -14 34 -36 14 -44 C12 -24 6 -10 0 0 Z" fill="#53b884"/>
      <path d="M0 0 C-18 14 -38 6 -40 -12 C-20 -10 -8 -6 0 0 Z" fill="#46a877"/>
      <path d="M0 0 C20 10 38 0 40 -16 C22 -12 8 -6 0 0 Z" fill="#3a8f63"/></g>`;
  const cafe = kind === "freelance" ? `
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="58" rx="8" fill="#6b4f3a"/>
    <rect x="${w - 330}" y="${WALL_FACE - 6}" width="290" height="10" rx="5" fill="#82634b"/>
    <rect x="${w - 300}" y="${WALL_FACE + 8}" width="56" height="34" rx="6" fill="#3a3f4f"/><rect x="${w - 292}" y="${WALL_FACE + 14}" width="20" height="10" rx="3" fill="#ff9f5a"/>
    <circle cx="${w - 200}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/><circle cx="${w - 160}" cy="${WALL_FACE + 26}" r="14" fill="#f6ecdc"/>
    ${Array.from({ length: Math.floor(w / 46) }, (_, i) => `<circle cx="${20 + i * 46}" cy="${WALL_FACE + 14 + Math.sin(i * 0.9) * 6}" r="4" fill="#ffd27a" style="opacity:calc(0.5 + var(--lamp) * 0.5)"/>`).join("")}` : "";
  return /* svg */ `
  <svg class="room-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs>
      <linearGradient id="sky${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>
      <radialGradient id="pool${uid}"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.28"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>
    </defs>
    <rect y="${WALL_FACE}" width="${w}" height="${h - WALL_FACE}" fill="${pal.floor}"/>
    ${floor}
    ${lamps.join("")}
    <rect y="${WALL_FACE}" width="${w}" height="18" fill="#000" opacity="0.07"/>
    <rect width="${w}" height="${WALL_FACE}" fill="${pal.wall}"/>
    <rect y="${WALL_FACE - 10}" width="${w}" height="10" fill="${pal.trim}"/>
    ${windows.join("")}
    ${signBox}${clock}${cafe}
    ${plant(w - 60, h - 70)}${plant(52, h - 70, 0.85)}
    <rect width="${w}" height="${T}" fill="#3a3f4f"/>
    <rect width="${T}" height="${h}" fill="#3a3f4f"/>
    <rect x="${w - T}" width="${T}" height="${h}" fill="#3a3f4f"/>
    <rect y="${h - T}" width="${w}" height="${T}" fill="#3a3f4f"/>
    <rect x="${w / 2 - 60}" y="${h - T}" width="120" height="${T}" fill="${pal.floor}"/>
  </svg>`;
}
