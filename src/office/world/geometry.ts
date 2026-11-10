// Floor geometry of an office building: wall and desk place sizes, the hall, how many desk
// columns a room has and where desk place `index` stands on the snake.
import { officeColumns, officeDimensions, releaseOfficeWidth } from "../office-width";
import { Desk, UNIT_W, UNIT_H } from "../desk";
import { DECOR } from "../../decor/decor";
import { snakeSeat } from "../room-policy";
import type { RoomTheme } from "../decorate";
import { vectorOwner, releaseVectors } from "../../perf/shared-vector";
import { destroyStaticArt } from "../../perf/static-art";
import type { PhysicalRoomPlan } from "./types";

export const WALL_FACE = 110;   // north wall face height
export const SLOT_W = UNIT_W + 20, SLOT_H = UNIT_H + 20;
export const GAP = 40, HALL = 150;
export const IN_FRONT = 300000;  // stacking bias for a walker getting into or out of a chair (desks raise themselves up to 100000 + y)
export const WALK_SCALE = 0.42;   // every walking robot (hall, rooms, park) and the desk robots (seated.ts) share this size
export const releaseRoomVectors=(el:HTMLElement)=>{releaseOfficeWidth(el);destroyStaticArt(el);for(const node of [el,...el.querySelectorAll<HTMLElement>("[data-vector-owner]")])if(node.dataset.vectorOwner)releaseVectors(node.dataset.vectorOwner)};

export const LOUNGE = 230;      // extra floor below the desks for a rug, beanbags or a ping pong table
export function officeSize(slots: number, lounge = 0, columns = 1) {
  return officeDimensions(slots, columns, SLOT_W, SLOT_H, lounge);
}
export const columnsForRoom = (room: { w: number }) => officeColumns((room.w - 120) / SLOT_W);
/** Desk places the floor holds: every desk plus the Add a desk placeholder. Decor keeps clear of them. */
export const floorSlots = (plan: PhysicalRoomPlan) => plan.slots + (plan.ghost ? 1 : 0);
/** Top-left corner of desk place `index` in world coordinates, following the snake. */
export const slotOrigin = (room: { x: number; y: number; w: number }, index: number) => {
  const { c, row } = snakeSeat(index, columnsForRoom(room));
  return { x: room.x + 70 + c * SLOT_W, y: room.y + WALL_FACE + 40 + row * SLOT_H };
};
// The decorations a room asks for (all of them are free).
export const usable = (t: RoomTheme | undefined) => (t?.decor ?? []).filter((d) => DECOR[d]);
export const needsLounge = (t: RoomTheme | undefined) => usable(t).some((d) => DECOR[d].spot === "floor");
