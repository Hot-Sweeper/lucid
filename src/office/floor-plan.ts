// The service rooms share the entrance hall. Project offices grow down stable columns,
// each with its own spine and a cross hall at every north-facing door.
export type PlanPoint = { x: number; y: number };
export type PlanRoom = { id: string; w: number; h: number };
export type PlanRect = { x: number; y: number; w: number; h: number };
export type HallStrip = PlanRect & { axis: "x" | "y"; column: number | null };
export type OfficePlan = {
  rooms: Map<string, PlanRect>;
  halls: HallStrip[];
  size: { w: number; h: number };
  topH: number;
  hallY: number;
};

export function officePlan(top: PlanRoom[], offices: PlanRoom[], hall = 150, gap = 40, minimumTopH = 0): OfficePlan {
  const rooms = new Map<string, PlanRect>();
  const topH = Math.max(0, minimumTopH, ...top.map((r) => r.h));
  let topW = 0;
  for (const r of top) { rooms.set(r.id, { x: topW, y: topH - r.h, w: r.w, h: r.h }); topW += r.w + gap; }
  topW = Math.max(0, topW - gap);
  // Choose the column count from actual room dimensions. A fixed three-column
  // tail leaves most of a wide service wing empty and makes quiet offices distant.
  const candidate = (count: number) => {
    const columns = Array.from({ length: count }, () => ({ x: 0, w: 0, bottom: topH }));
    offices.forEach((r, i) => { const c = columns[i % count]; c.w = Math.max(c.w, r.w); c.bottom += hall + r.h; });
    let right = 0;
    for (const c of columns) { c.x = right; right += c.w + hall; }
    const width = Math.max(topW, right), height = Math.max(topH + hall, ...columns.map(c => c.bottom));
    return { columns, width, score: Math.max(width / 1.65, height) ** 2 + width * height * .2 };
  };
  const choices = Array.from({ length: Math.max(1, Math.min(8, offices.length)) }, (_, i) => candidate(offices.length ? i + 1 : 0));
  const { columns, width } = choices.reduce((best, c) => c.score < best.score ? c : best);
  for (const c of columns) c.bottom = topH;
  const halls: HallStrip[] = [{ x: 0, y: topH, w: width, h: hall, axis: "x", column: null }];
  offices.forEach((r, i) => {
    const column = i % columns.length, c = columns[column];
    // The first cross hall is the entrance hall itself. Later ones are real floor,
    // connected to the same spine, never a straight shortcut through another office.
    if (c.bottom > topH) halls.push({ x: c.x, y: c.bottom, w: c.w + hall, h: hall, axis: "x", column });
    rooms.set(r.id, { x: c.x, y: c.bottom + hall, w: r.w, h: r.h });
    c.bottom += hall + r.h;
  });
  for (let column = 0; column < columns.length; column++) {
    const c = columns[column];
    halls.push({ x: c.x + c.w, y: topH, w: hall, h: c.bottom - topH, axis: "y", column });
  }
  return { rooms, halls, size: { w: width, h: Math.max(topH + hall, ...columns.map((c) => c.bottom)) }, topH, hallY: topH + hall / 2 };
}

const contains = (r: PlanRect, p: PlanPoint) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const inHall = (plan: OfficePlan, p: PlanPoint) => plan.halls.some((r) => contains(r, p));

type HallAnchor = { column: number | null; points: PlanPoint[]; join: PlanPoint };
// A stable preference uses the hall width without moving the door endpoints.
export function hallPreference(id: string): PlanPoint {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return { x: ((hash >>> 0) % 1009) / 504 - 1, y: ((hash >>> 12) % 1013) / 506 - 1 };
}
function anchor(plan: OfficePlan, p: PlanPoint, preference: PlanPoint): HallAnchor | null {
  const across = (start: number, width: number, bias: number) => start + width / 2 + Math.max(-1, Math.min(1, bias)) * Math.max(0, width / 2 - 30);
  const primary = plan.halls[0];
  if (primary && contains(primary, p)) {
    const join = { x: p.x, y: across(primary.y, primary.h, preference.y) };
    return { column: null, points: [join], join };
  }
  const spine = plan.halls.find((r) => r.axis === "y" && contains(r, p));
  if (spine) {
    const join = { x: across(spine.x, spine.w, preference.x), y: p.y };
    return { column: spine.column, points: [join], join };
  }
  const branch = plan.halls.find((r) => r.axis === "x" && contains(r, p));
  if (!branch) return null;
  const trunk = plan.halls.find((r) => r.axis === "y" && r.column === branch.column)!;
  const join = { x: across(trunk.x, trunk.w, preference.x), y: across(branch.y, branch.h, preference.y) };
  return { column: branch.column, points: [{ x: p.x, y: join.y }, join], join };
}

// Route on the corridor tree with a preferred position across each strip. Returned legs stay on physical hall floor.
// A point outside that floor has no route; callers wait/replan instead of cutting walls.
export function hallRoute(plan: OfficePlan, from: PlanPoint, to: PlanPoint, preference: PlanPoint = { x: 0, y: 0 }): PlanPoint[] | null {
  const a = anchor(plan, from, preference), b = anchor(plan, to, preference);
  if (!a || !b) return null;
  const primary = plan.halls[0];
  const hallY = primary.y + primary.h / 2 + Math.max(-1, Math.min(1, preference.y)) * Math.max(0, primary.h / 2 - 30);
  const points = [from, ...a.points];
  if (a.column !== b.column || a.column === null) points.push({ x: a.join.x, y: hallY }, { x: b.join.x, y: hallY });
  points.push(...b.points.toReversed(), to);
  const result: PlanPoint[] = [];
  for (const p of points) {
    const last = result.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = result.at(-2);
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) result.pop();
    result.push(p);
  }
  return result.slice(1);
}

/**
 * Where a point on the old floor stands on the new one: it moves with the room or hall strip it
 * was on (rooms by id, hall strips by axis, column and order), kept `inset` inside that floor. A
 * user's desk move changes the floor at once, so robots walking there are carried along instead
 * of being left inside a wall or on floor that no longer exists.
 */
export function carryPoint(p: PlanPoint, old: OfficePlan, next: OfficePlan, inset = 30): PlanPoint {
  const keep = (r: PlanRect, q: PlanPoint) => ({
    x: Math.max(r.x + Math.min(inset, r.w / 2), Math.min(r.x + r.w - Math.min(inset, r.w / 2), q.x)),
    y: Math.max(r.y + Math.min(inset, r.h / 2), Math.min(r.y + r.h - Math.min(inset, r.h / 2), q.y)),
  });
  const shift = (from: PlanRect, to: PlanRect) => keep(to, { x: p.x - from.x + to.x, y: p.y - from.y + to.y });
  for (const [id, r] of old.rooms) if (contains(r, p)) { const to = next.rooms.get(id); return to ? shift(r, to) : p; }
  const index = old.halls.findIndex((h) => contains(h, p));
  if (index < 0) return p;
  const strip = old.halls[index];
  const peers = (plan: OfficePlan, h: HallStrip) => plan.halls.filter((q) => q.axis === h.axis && q.column === h.column);
  const to = index === 0 ? next.halls[0] : peers(next, strip)[peers(old, strip).indexOf(strip)];
  if (to) return shift(strip, to);
  // The strip is gone (the offices reflowed into fewer columns): the nearest hall floor.
  let best = p, distance = Infinity;
  for (const h of next.halls) { const q = keep(h, p), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < distance) { distance = d; best = q; } }
  return best;
}
