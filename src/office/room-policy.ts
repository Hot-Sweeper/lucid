export type ActivityThread = { id: string; runStatus: string | null; question?: string | null; settled?: boolean; pinned?: boolean; coinPending?: boolean; completionPending?: boolean; manager?: { projectId: string; role: string } };
const ACTIVE = new Set(["running", "queued", "queue", "waiting", "starting", "preparing", "pending", "waitingforapproval", "awaitingapproval", "approvalpending", "awaitinginput", "waitingforinput", "waitingforuser"]);

export function hasOfficeWork(thread: ActivityThread) {
  return !!thread.question || ACTIVE.has((thread.runStatus ?? "").toLowerCase().replace(/[\s_-]/g, ""));
}

// History is readable without occupying a workstation. Only an explicitly assigned
// persistent manager retains a desk when idle or settled.
export function hasOfficeDesk(thread: ActivityThread, revealed: string | null = null) {
  if ((thread.coinPending || thread.completionPending) && thread.runStatus === 'completed') return true;
  if (thread.pinned && thread.manager) return true;
  return !thread.settled && (hasOfficeWork(thread) || thread.id === revealed);
}

// Desks are fixed places. Reservation index k is physical desk k, so clearing,
// hiring or finishing work never moves another desk. A collected (settled) job
// releases its reservation; a quiet unsettled thread keeps its spot until a new
// job needs a desk, and then that job takes the first empty place.
type SeatClaim = string | ActivityThread;
const claimId = (claim: SeatClaim) => typeof claim === "string" ? claim : claim.id;
const keepsReservation = (claim: SeatClaim) => typeof claim === "string" || !claim.settled || !!(claim.pinned && claim.manager) || !!((claim.coinPending || claim.completionPending) && claim.runStatus === "completed");
const needsDesk = (claim: SeatClaim, revealed: string | null) => typeof claim === "string" || hasOfficeDesk(claim, revealed);

export function reserveRoomSeats(previous: (string | null)[], claims: SeatClaim[], revealed: string | null = null) {
  const byId = new Map(claims.map((c) => [claimId(c), c]));
  const seen = new Set<string>();
  const seats = previous.map((id) => {
    const claim = id ? byId.get(id) : undefined;
    if (!id || !claim || seen.has(id) || !keepsReservation(claim)) return null;
    seen.add(id); return id;
  });
  const idle = (id: string | null) => !id || !needsDesk(byId.get(id)!, revealed);
  for (const id of [...byId.keys()].sort()) {
    if (seen.has(id)) continue;
    const claim = byId.get(id)!;
    // History without current work does not take a place.
    if (!needsDesk(claim, revealed)) continue;
    const free = seats.findIndex(idle);
    if (free >= 0) { if (seats[free]) seen.delete(seats[free]!); seats[free] = id; }
    else seats.push(id);
    seen.add(id);
  }
  return seats;
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
  // Interior empty desks stay where they are. Only trailing empty places fold away,
  // so the room may shrink at its end but never shuffles.
  const slots = Math.max(1, last + 1) + (expanded ? Math.max(0, extra) : 0);
  const physical: (T | null)[] = Array.from({ length: slots }, (_, i) => placed[i] ?? null);
  return { threads: physical, slots, collapsed: false };
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
