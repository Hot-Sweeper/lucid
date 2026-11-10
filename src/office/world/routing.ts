// Where robots can walk: the hall, room doors, seats and desk places, routes through the hall and
// around furniture, and the way out to the park.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { SIT_HEAD, GEOM, type Pt } from "../../robot";
import { printerStation } from "../printer";
import { Desk } from "../desk";
import { decorFootprint } from "../../decor/decor";
import { furniturePath, type Footprint } from "../navigation";
import { hallRoute, hallPreference, inHall } from "../floor-plan";
import type { World } from "../world";
import type { Room } from "./types";
import { WALL_FACE, WALK_SCALE, floorSlots, slotOrigin, usable } from "./geometry";
import { officeDecor } from "./room-art";

export class WorldRouting {
  roomById(this: World, id: string | null) { return id ? this.rooms.find((r) => r.id === id) ?? null : null; }

  // the door on the hall side of a room: [just outside in the hall, just inside the room]
  door(this: World, r: Room): [Pt, Pt] {
    if (r.y + r.h <= this.topH + 1) {   // top row: door in the south wall
      const x = r.x + r.w / 2;
      return [{ x, y: r.y + r.h + 34 }, { x, y: r.y + r.h - 40 }];
    }
    const x = r.x + r.w - 46;           // project office: door in the north wall, right corner
    return [{ x, y: r.y - 34 }, { x, y: r.y + WALL_FACE + 16 }];
  }

  entrance(this: World) { return { x: this.size.w - 6, y: this.hallY }; }

  /** Where a walker sits so its head is where the desk robot's head is (desk at `d`, world coordinates). */
  seatAt(this: World, d: Pt) { return { x: d.x + GEOM.chair.x, y: d.y + GEOM.head.y - 2 + SIT_HEAD * WALK_SCALE }; }

  deskPos(this: World, d: Desk) { return { x: parseFloat(d.el.style.left), y: parseFloat(d.el.style.top) }; }

  // Plan from the door around actual floor footprints, then approach the chair from its side.
  toSeat(this: World, r: Room, d: Pt): Pt[] {
    const [, inn] = this.door(r);
    const seat = this.seatAt(d), side = { x: seat.x + (inn.x < seat.x ? -1 : 1) * 62, y: seat.y };
    const path = furniturePath(inn, side, this.furniture(r), this.walkBounds(r));
    return [inn, ...(path ?? [side]), seat]; // walkLegs checks again; a blocked route waits
  }

  walkBounds(this: World, r: Room): Footprint { return { x: r.x + 20, y: r.y + WALL_FACE + 10, w: r.w - 40, h: r.h - WALL_FACE - 30 }; }

  outside(this: World, p: Pt) { return p.x > this.size.w; }

  /** From any point to the hall (nothing when it is already outdoors), through the room's door. */
  wayOut(this: World, p: Pt): Pt[] | null {
    if (this.outside(p)) return [];
    if (inHall(this.floorPlan, p)) return [];
    const r = this.rooms.find((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h);
    if (!r) return null;
    const [out, inn] = this.door(r);
    return [{ x: p.x, y: inn.y }, inn, out];
  }

  /** The whole way from `p` to where the robot is going (see `travel`). */
  route(this: World, p: Pt, id: string, to: string | null) {
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

  furniture(this: World, r: Room): Footprint[] {
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
}
