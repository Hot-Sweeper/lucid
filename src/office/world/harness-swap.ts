// A thread moved to another harness: its job passes to a real worker of that harness (Roster.takeOver)
// while the thread keeps its desk. The new robot walks in like any worker coming to a desk (from the
// room it rested in, or from outside), the previous robot stands up, they high five, the previous
// robot walks off and the new one sits down at the same computer. Reduced motion, hidden windows,
// desks out of view and robots away from their desk swap at once. T3 is never waited on: this
// only follows the roster, which is already saved.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { Walker, wait as pause, highFive, harnessName, type Facing, type Pt, type RobotProfile, type WorkerSwap } from "../../robot";
import { line, eventLine } from "../../lines";
import { reducedMotion } from "../../util/dom";
import gsap from "gsap";
import type { Desk } from "../desk";
import type { World } from "../world";
import type { WThread } from "./types";
import { IN_FRONT, WALK_SCALE } from "./geometry";

/** A running swap; cancelling it hands the desk straight to the new worker. */
export type SwapRun = { cancelled: boolean; outgoing: { walker: Walker; robot: RobotProfile } | null };

export class WorldHarnessSwap {
  /** Shows a roster swap: the normal scene where the desk is in view, otherwise at once. */
  swapWorker(this: World, t: WThread, swap: WorkerSwap) {
    const desk = this.desks.get(t.id);
    const running = this.swaps.get(t.id);
    if (running) this.cancelSwap(t.id, running);
    const still = reducedMotion() || document.hidden || this.scene.inert || !desk || desk.folded || !!this.hostWorld
      || desk.el.classList.contains("arriving") || desk.el.classList.contains("culled")
      || this.transit.has(t.id) || this.exits.has(t.id) || !this.roomById(desk.room);
    if (still) { this.finishSwap(t, swap.to); return; }
    void this.playSwap(t, desk, swap);
  }

  /** The new worker takes the desk at once (a quick fade where it is visible). */
  finishSwap(this: World, t: WThread, to: RobotProfile, fade = true) {
    const desk = this.desks.get(t.id);
    if (desk) {
      desk.setWorker(to, t.provider, t.model);
      const host = desk.el.querySelector<HTMLElement>(".robot-host");
      if (fade && host && !document.hidden && !desk.el.classList.contains("culled")) gsap.fromTo(host, { opacity: 0 }, { opacity: 1, duration: .16, ease: "power1.out", clearProps: "opacity" });
    }
    const walking = this.transit.get(t.id);
    if (walking) { walking.setBrand(t.provider); walking.setLook(to.look); }
    this.onWorkerSwap(t.id);
  }

  cancelSwap(this: World, id: string, run: SwapRun) {
    run.cancelled = true;
    this.swaps.delete(id);
    for (const [previous, entry] of this.swapArrivals) if (entry.id === id) { this.swapArrivals.delete(previous); entry.resolve(null); }
    if (run.outgoing) this.walkOff(run.outgoing.walker, id, run.outgoing.robot);
    run.outgoing = null;
  }

  async playSwap(this: World, t: WThread, desk: Desk, swap: WorkerSwap) {
    const id = t.id, run: SwapRun = { cancelled: false, outgoing: null };
    this.swaps.set(id, run);
    const room = this.roomById(desk.room)!;
    const live = () => !run.cancelled && this.swaps.get(id) === run && this.desks.get(id) === desk && !desk.folded;
    let trip: object | null = null;
    // Something changed underneath (another layout, a newer harness change, the desk went away):
    // the new worker keeps the job and carries on to wherever the thread now is.
    const abandon = () => {
      const mine = this.swaps.get(id) === run;
      if (mine) this.cancelSwap(id, run);
      if (!mine) return;
      if (this.desks.get(id)?.profile !== swap.to) this.finishSwap(t, swap.to);
      const walker = this.transit.get(id);
      if (trip && walker && this.trips.get(id) === trip) void this.travel(t, { walker }, this.roomOf.get(id) ?? null);
    };
    // The previous robot says why, in the same words as every harness change.
    desk.say(eventLine({ kind: "moved", from: harnessName(swap.from.provider), to: harnessName(t.provider) }, swap.from.name), "speak");
    window.setTimeout(() => { if (this.swaps.get(id) === run) desk.say(null); }, 2600);
    // 1. The new worker comes over: out of the room it rested in when it was visible there,
    //    otherwise in from outside. Off-screen stretches are shortened like every journey.
    const start = await this.swapEntrance(id, swap.previous);
    if (!live()) return abandon();
    trip = {};
    this.trips.set(id, trip);
    let incoming = start ? this.spawn(t, start.at, start.face) : this.spawn(t, { x: this.parkDoor.x + 110, y: this.parkDoor.y }, "left");
    if (!start) gsap.fromTo(incoming.el, { opacity: 0 }, { opacity: 1, duration: .4 });
    let side: Pt | null = null;
    for (let tries = 0; tries < 40 && !side; tries++) {
      if (!live() || this.trips.get(id) !== trip) return abandon();
      incoming = this.transit.get(id) ?? incoming;
      const plan = this.route({ x: incoming.x, y: incoming.y }, id, room.id);
      if (plan.blocked) { await this.waitForRoute(plan.revision); continue; }
      if (plan.desk !== desk || plan.folded || plan.pts.length < 2) return abandon();
      const goal = plan.pts[plan.pts.length - 2];
      await this.walkLegs(t, plan.pts.slice(0, -1), trip, plan.revision);
      incoming = this.transit.get(id) ?? incoming;
      if (plan.revision === this.layoutRevision && Math.hypot(incoming.x - goal.x, incoming.y - goal.y) <= 8) side = goal;
      else await pause(.1);
    }
    if (!side || !live() || this.trips.get(id) !== trip) return abandon();
    // 2. The previous worker stands up from the same chair and steps back beside it.
    const seat = this.seatAt(this.deskPos(desk)), dir = side.x < seat.x ? -1 : 1;
    incoming.zBias = IN_FRONT; incoming.face(dir < 0 ? "right" : "left");
    const outgoing = new Walker(this.deskLayer, { id: `swap-out:${id}`, provider: swap.from.provider, name: swap.from.name, model: swap.from.lastModel ?? undefined, scale: WALK_SCALE, look: swap.from.look });
    outgoing.el.classList.add("hall-walker");
    outgoing.setPos(seat.x, seat.y); outgoing.face("up"); outgoing.sitNow(); outgoing.zBias = IN_FRONT;
    run.outgoing = { walker: outgoing, robot: swap.from };
    desk.say(null);
    desk.setSeated(false);
    // The computer is the new worker's from now on; it is shown seated when it sits down.
    desk.setWorker(swap.to, t.provider, t.model);
    this.onWorkerSwap(id);
    await pause(.25); if (!live()) return abandon();
    outgoing.calm();
    await pause(.3); if (!live()) return abandon();
    const meet = { x: seat.x - dir * 6, y: seat.y + 64 };
    await Promise.all([outgoing.walkTo(meet.x, meet.y), incoming.walkTo(seat.x + dir * 88, meet.y)]);
    if (!live() || this.trips.get(id) !== trip) return abandon();
    outgoing.face(dir < 0 ? "left" : "right"); incoming.face(dir < 0 ? "right" : "left");
    // 3. A high five: the work is in the thread, so nothing here claims a result.
    outgoing.say(line("handoffBye", swap.from.name), 1300);
    await highFive(this.deskLayer, outgoing, incoming);
    if (!live()) return abandon();
    incoming.say(line("handoffGotIt", swap.to.name), 1100); incoming.setExpression("happy");
    await pause(.45); if (!live()) return abandon();
    incoming.setExpression("neutral");
    // 4. The previous worker goes on its way; the new one sits down and takes over the computer.
    run.outgoing = null;
    this.walkOff(outgoing, id, swap.from);
    this.swaps.delete(id);
    // back beside the chair the way it came, then into it through the shared journey
    await incoming.walkTo(side.x, side.y);
    if (this.trips.get(id) !== trip) return;
    await this.travel(t, { walker: incoming }, room.id);
  }

  /** Where the new worker sets off: the door of the room it rested in, once that room walked it there. */
  async swapEntrance(this: World, id: string, previous: string | null): Promise<{ at: Pt; face: Facing } | null> {
    if (!previous || !this.exits.has(previous)) return null;
    return new Promise((resolve) => {
      const entry = { id, resolve: (at: Pt | null, face: Facing = "down") => { window.clearTimeout(timer); resolve(at ? { at, face } : null); } };
      // A room that never hands it over (rebuilt, culled) falls back to coming in from outside.
      const timer = window.setTimeout(() => { if (this.swapArrivals.get(previous) === entry) { this.swapArrivals.delete(previous); entry.resolve(null); } }, 15000);
      this.swapArrivals.set(previous, entry);
    });
  }

  /** The previous worker leaves like any free worker: out through the building's entrance. */
  walkOff(this: World, w: Walker, id: string, robot: RobotProfile) {
    const key = `swap-out:${id}`;
    this.transit.set(key, w);
    this.prepareJourney(w);
    w.zBias = 0;
    const leaving: WThread = { id: key, projectId: "", title: "", updatedAt: "", provider: robot.provider, runStatus: null, pinned: false, settled: true, question: null, model: robot.lastModel ?? null, robot };
    void this.travel(leaving, { walker: w }, null);
  }
}
