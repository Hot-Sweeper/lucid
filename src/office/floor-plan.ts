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

export function officePlan(top: PlanRoom[], offices: PlanRoom[], hall = 150, gap = 40): OfficePlan {
  const rooms = new Map<string, PlanRect>();
  const topH = Math.max(0, ...top.map((r) => r.h));
  let topW = 0;
  for (const r of top) { rooms.set(r.id, { x: topW, y: topH - r.h, w: r.w, h: r.h }); topW += r.w + gap; }
  topW = Math.max(0, topW - gap);
  const columns = Array.from({ length: Math.min(3, offices.length) }, () => ({ x: 0, w: 0, bottom: topH }));
  offices.forEach((r, i) => { const c = columns[i % columns.length]; c.w = Math.max(c.w, r.w); });
  let right = 0;
  for (const c of columns) { c.x = right; right += c.w + hall; }
  const width = Math.max(topW, right);
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
function anchor(plan: OfficePlan, p: PlanPoint): HallAnchor | null {
  const primary = plan.halls[0];
  if (primary && contains(primary, p)) {
    const join = { x: p.x, y: plan.hallY };
    return { column: null, points: [join], join };
  }
  const spine = plan.halls.find((r) => r.axis === "y" && contains(r, p));
  if (spine) {
    const join = { x: spine.x + spine.w / 2, y: p.y };
    return { column: spine.column, points: [join], join };
  }
  const branch = plan.halls.find((r) => r.axis === "x" && contains(r, p));
  if (!branch) return null;
  const trunk = plan.halls.find((r) => r.axis === "y" && r.column === branch.column)!;
  const join = { x: trunk.x + trunk.w / 2, y: branch.y + branch.h / 2 };
  return { column: branch.column, points: [{ x: p.x, y: join.y }, join], join };
}

// Shortest route on the corridor tree. Returned legs stay on physical hall floor.
// A point outside that floor has no route; callers wait/replan instead of cutting walls.
export function hallRoute(plan: OfficePlan, from: PlanPoint, to: PlanPoint): PlanPoint[] | null {
  const a = anchor(plan, from), b = anchor(plan, to);
  if (!a || !b) return null;
  const points = [from, ...a.points];
  if (a.column !== b.column || a.column === null) points.push({ x: a.join.x, y: plan.hallY }, { x: b.join.x, y: plan.hallY });
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
