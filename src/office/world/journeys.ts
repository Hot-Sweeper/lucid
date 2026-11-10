// Robots moving between rooms: spawning walkers, the walk itself (legs through the hall, waiting for
// the layout to settle), handing over to a room's own walker, sprints to a new desk and the boss desk.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { line } from "../../lines";
import { Walker, wait as pause, type Facing, type Pt } from "../../robot";
import { gameSound } from "../sound";
import { printerStation } from "../printer";
import gsap from "gsap";
import { furniturePath } from "../navigation";
import { hasOfficeWork } from "../room-policy";
import { makeInteractive, whenFree, isHeld } from "../interact";
import type { World } from "../world";
import type { WThread } from "./types";
import { IN_FRONT, WALK_SCALE } from "./geometry";

export class WorldJourneys {
  /** Robots walking between rooms and buildings (world coordinates), for their footsteps. */
  soundWalkers(this: World) { return [...this.transit.values()].filter(w => w.el.isConnected).map(w => ({ el: w.el as HTMLElement, x: w.x, y: w.y, activity: w.activity })); }

  wakeRoutes(this: World) { for (const wake of this.routeWaiters) wake(); }

  waitForRoute(this: World, revision: number) {
    if (revision !== this.layoutRevision) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const wake = () => { this.routeWaiters.delete(wake); this.scene.removeEventListener("pointerup", wake); resolve(); };
      this.routeWaiters.add(wake);
      this.scene.addEventListener("pointerup", wake, { once: true });
    });
  }

  spawn(this: World, t: { id: string; provider: string; model?: string | null }, at: Pt, face: Facing, outdoors = this.outside(at)) {
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

  prepareJourney(this: World, w: Walker, origin: () => Pt = () => ({ x: 0, y: 0 })) {
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

  prepareDeparture(this: World, id: string, w: Walker, origin?: () => Pt) {
    this.prepareJourney(w, origin);
    const t = this.lastData?.threads.find(t => t.id === id);
    w.setRunning(!!t && hasOfficeWork(t) && !t.question, this.isSprinting(id));
  }

  /** A worker that was just hired sprints to its desk. The mark expires if it never gets there. */
  sprint(this: World, threadId: string) { this.sprinting.set(threadId, Date.now() + 90_000); }

  isSprinting(this: World, id: string) {
    const until = this.sprinting.get(id);
    if (until && until < Date.now()) this.sprinting.delete(id);
    return !!until && until >= Date.now();
  }

  /** Walks a list of points; at the entrance the robot steps from the hall layer to the outdoors layer or back. */
  async walkLegs(this: World, t: WThread, pts: Pt[], trip: object, revision = this.layoutRevision) {
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

  /**
   * One robot's walk to `to` (a room id, "park", or null: it leaves the building). It sets off
   * from its chair (`seat`: where its desk stood), from the point a room handed it over at,
   * from wherever it is walking right now, or from outside (a new robot).
   */
  async travel(this: World, t: WThread, from: { seat: Pt; room: string | null } | { at: Pt; face: Facing } | { outside: true } | { walker: Walker }, to: string | null) {
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
            w.face("left"); w.say(line("printing", w), 1600);
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
  handOver(this: World, id: string, at: Pt, face: Facing) {
    const ex = this.exits.get(id);
    if (!ex) return false;
    this.exits.delete(id);
    void this.travel(ex.t, { at, face }, ex.to);
    return true;
  }

  /** A robot changes rooms (`to` null: its thread is gone and it leaves the building). */
  move(this: World, t: WThread, from: string | null, to: string | null, seat: Pt | null) {
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
  bossDecision(this: World, threadId: string, phase: "reading" | "answered" | "asked" | null, text?: string) {
    if (phase) this.bossPhases.set(threadId, {phase, text});
    else this.bossPhases.delete(threadId);
    (this.ext.queue as any)?.decision?.(threadId, phase, text);
  }

  // break room, question line and park only show robots that are actually there
  pushExt(this: World) {
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
}
