/** reviewPending: the worker took its report to the orchestrator; its desk waits for it. */
export type ActivityThread = { id: string; runStatus: string | null; question?: string | null; settled?: boolean; pinned?: boolean; coinPending?: boolean; completionPending?: boolean; reviewPending?: boolean; kept?: boolean; manager?: { projectId: string; role: string } };
const ACTIVE = new Set(["running", "queued", "queue", "waiting", "starting", "preparing", "pending", "waitingforapproval", "awaitingapproval", "approvalpending", "awaitinginput", "waitingforinput", "waitingforuser"]);

export function hasOfficeWork(thread: ActivityThread) {
  return !!thread.question || ACTIVE.has((thread.runStatus ?? "").toLowerCase().replace(/[\s_-]/g, ""));
}

// A turn ending does not end its session. Keep the workstation until the user
// settles the session; settled history remains readable without occupying a desk.
export function hasOfficeDesk(thread: ActivityThread, revealed: string | null = null) {
  if ((thread.coinPending || thread.completionPending || thread.reviewPending) && thread.runStatus === 'completed') return true;
  if (thread.pinned && thread.manager) return true;
  // collected work keeps its desk until you remove it (new work may take that desk first)
  if (thread.settled && thread.kept) return true;
  return !thread.settled;
}

// Reservation order follows the room's snake path. Removing a workstation shifts
// later workstations forward in the same order, including running work. The desk
// and its session stay mounted; only their physical position changes.
type SeatClaim = string | ActivityThread;
const claimId = (claim: SeatClaim) => typeof claim === "string" ? claim : claim.id;
const needsDesk = (claim: SeatClaim, revealed: string | null) => typeof claim === "string" || hasOfficeDesk(claim, revealed);

export function reserveRoomSeats(previous: (string | null)[], claims: SeatClaim[], revealed: string | null = null) {
  const byId = new Map(claims.map((c) => [claimId(c), c]));
  const seen = new Set<string>();
  const seats = previous.map((id) => {
    const claim = id ? byId.get(id) : undefined;
    if (!id || !claim || seen.has(id) || !needsDesk(claim, revealed)) return null;
    seen.add(id); return id;
  });
  // a kept desk (settled, collected work) is the first place new work takes
  const soft = (id: string | null) => { const c = id ? byId.get(id) : undefined; return !!c && typeof c !== "string" && !!c.settled && !!c.kept; };
  const idle = (id: string | null) => !id || !needsDesk(byId.get(id)!, revealed) || soft(id);
  for (const id of [...byId.keys()].sort()) {
    if (seen.has(id)) continue;
    const claim = byId.get(id)!;
    // History without current work does not take a place, and a kept desk is never re-created
    // once new work has taken it.
    if (!needsDesk(claim, revealed) || soft(id)) continue;
    const free = seats.findIndex(idle);
    if (free >= 0) { if (seats[free]) seen.delete(seats[free]!); seats[free] = id; }
    else seats.push(id);
    seen.add(id);
  }
  return compactSeats(seats.map((id) => (id && needsDesk(byId.get(id)!, revealed) ? id : null)), byId);
}

/** Close gaps without swapping the last desk ahead of its neighbours. */
function compactSeats(seats: (string | null)[], byId: Map<string, SeatClaim>) {
  // A string claim is a desk reserved by a launch that has not returned a thread
  // yet. Wait for that handoff before changing the promised physical places.
  if (seats.some(id => id && typeof byId.get(id) === "string")) return seats;
  const occupied = seats.filter((id): id is string => id !== null);
  return seats.map((_, index) => occupied[index] ?? null);
}

/** Adjacent reservation indices meet at the row ends instead of jumping across. */
export function snakeSeat(index: number, columns: number) {
  const row = Math.floor(index / columns), offset = index % columns;
  return { c: row % 2 ? columns - 1 - offset : offset, row };
}

/** Hiring into deliberately added capacity uses that spare, instead of cloning it. */
export function remainingDeskExtras(previous: (string | null)[], next: (string | null)[], extra: number) {
  const occupied = (seats: (string | null)[]) => seats.filter(Boolean).length;
  return Math.max(0, extra - Math.max(0, occupied(next) - occupied(previous)));
}

export function projectRoomSeats<T extends ActivityThread>(reservations: (string | null)[], threads: T[], expanded: boolean, revealed: string | null, extra = 0, folded = false) {
  if (folded) return { threads: [] as (T | null)[], slots: 0, collapsed: true };
  const byId = new Map(threads.map((t) => [t.id, t]));
  const placed = reservations.map((id) => {
    const t = id ? byId.get(id) : undefined;
    return t && hasOfficeDesk(t, revealed) ? t : null;
  });
  let last = -1;
  placed.forEach((t, i) => { if (t) last = i; });
  // Reservations have already closed gaps in snake order. Trim only their empty
  // tail here; deliberate extra capacity is added after the occupied places.
  // Vacant furniture is explicit. An unused office keeps its Add a desk control,
  // without manufacturing a starter workstation after every removal or restart.
  const slots = last + 1 + (expanded ? Math.max(0, extra) : 0);
  const physical: (T | null)[] = Array.from({ length: slots }, (_, i) => placed[i] ?? null);
  return { threads: physical, slots, collapsed: false };
}

/**
 * Snake place of the Add a desk placeholder, or null when there is none. It stands at the
 * next place only while every physical desk is taken (an empty office counts: place 0). A
 * vacant desk already offers that place, so a second empty one would be redundant.
 */
export function addDeskPlace(physical: readonly unknown[], folded = false) {
  return !folded && physical.every(Boolean) ? physical.length : null;
}

/** Physical desk k is reservation k. */
export function physicalSeatIndices(_reservations: (string | null)[], physical: (string | null)[]) {
  return physical.map((_, i) => i);
}

export function reorderPhysicalSeats(reservations: (string | null)[], before: (string | null)[], after: (string | null)[]) {
  const result = [...reservations];
  before.forEach((_, i) => { while (result.length <= i) result.push(null); result[i] = after[i] ?? null; });
  return result;
}

export const FOLDED_OFFICE = { w: 420, h: 180 };

export function layoutMeeting(old: { topH: number; size: { w: number } }, next: { topH: number; size: { w: number } }, hall = 150) {
  const low = Math.max(old.topH, next.topH) + 40, high = Math.min(old.topH, next.topH) + hall - 40;
  if (low <= high) return { x: Math.min(old.size.w, next.size.w) / 2, y: (low + high) / 2, outside: false };
  // No shared hall floor, for example a much taller main office. Leave by the
  // old entrance and wait beyond both buildings before using the new entrance.
  return { x: Math.max(old.size.w, next.size.w) + 140, y: old.topH + hall / 2, outside: true };
}

/** Separate, stable waiting places on floor that survives the layout change. */
export function layoutWaitingSpots(old: { topH: number; size: { w: number } }, next: { topH: number; size: { w: number } }, ids: string[], hall = 150) {
  const meeting = layoutMeeting(old, next, hall), width = Math.min(old.size.w, next.size.w);
  const spacing = 76, capacity = Math.max(0, Math.floor((width - 80) / spacing) + 1);
  const outside = meeting.outside || ids.length > capacity;
  const start = outside ? Math.max(old.size.w, next.size.w) + 140 : (width - (ids.length - 1) * spacing) / 2;
  return new Map([...ids].sort().map((id, i) => [id, {
    x: start + i * spacing, y: outside ? old.topH + hall / 2 : meeting.y + (((i * 0.61803398875 + 0.25) % 1) * 2 - 1) * Math.max(0, (Math.min(old.topH, next.topH) + hall - Math.max(old.topH, next.topH)) / 2 - 40), outside,
  }]));
}

/** A robot can keep walking after promotion once its body clears both floor plans. */
export function layoutClearAt(point: { x: number; y: number }, old: { topH: number; size: { w: number } }, next: { topH: number; size: { w: number } }, hall = 150) {
  if (point.x > Math.max(old.size.w, next.size.w) + 40) return true;
  return point.x >= 40 && point.x <= Math.min(old.size.w, next.size.w) - 40 &&
    point.y >= Math.max(old.topH, next.topH) + 40 &&
    point.y <= Math.min(old.topH, next.topH) + hall - 40;
}

type FloorRect = { x: number; y: number; w: number; h: number };
type FullFloor = { topH: number; size: { w: number }; rooms: Map<string, FloorRect>; halls: FloorRect[] };
/**
 * A layout change can be promoted while this robot stands here. Only floor that
 * actually changes matters: a robot in a surviving hall or in an unchanged room
 * keeps valid footing, so it never has to queue outside before an office folds.
 */
export function layoutSafeAt(point: { x: number; y: number }, old: FullFloor, next: FullFloor, hall = 150, body = 40) {
  if (layoutClearAt(point, old, next, hall)) return true;
  const within = (r: FloorRect, pad: number) => point.x > r.x - pad && point.x < r.x + r.w + pad && point.y > r.y - pad && point.y < r.y + r.h + pad;
  for (const id of new Set([...old.rooms.keys(), ...next.rooms.keys()])) {
    const a = old.rooms.get(id), b = next.rooms.get(id);
    if (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) continue;
    if (a && within(a, body) || b && within(b, body)) return false;
  }
  const onFloor = (plan: FullFloor) => [...plan.rooms.values(), ...plan.halls].some((r) => within(r, 0));
  return onFloor(old) === onFloor(next);
}
