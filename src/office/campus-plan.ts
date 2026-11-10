import type { PlanRect } from './floor-plan';

export type CampusBuilding = { id: string; w: number; h: number; entranceY: number; outdoors?: boolean };
export type CampusDistrict = { building: PlanRect; park: PlanRect; bounds: PlanRect };

/** Keep each computer's outdoor life beside its own entrance at full artwork scale. */
export function districtPlan(building: CampusBuilding, park: { w: number; h: number }): CampusDistrict {
  const x = building.w + 180;
  const y = Math.max(0, building.entranceY - park.h / 2);
  const parkRect = { x, y, ...park };
  return {
    building: { x: 0, y: 0, w: building.w, h: building.h }, park: parkRect,
    bounds: building.outdoors === false ? { x: 0, y: 0, w: building.w, h: building.h } : { x: 0, y: 0, w: x + park.w, h: Math.max(building.h, parkRect.y + park.h) },
  };
}

/** Ordered shelf packing: compare row widths, balancing overview scale and unused land.
 * Geometry depends on content, never on camera zoom or a panel opening. */
export function campusPlan(buildings: CampusBuilding[], park: { w: number; h: number }, gap = 180) {
  const districts = buildings.map(b => ({ id: b.id, plan: districtPlan(b, park) }));
  if (!districts.length) return { districts: new Map<string, CampusDistrict>(), bounds: { x: 0, y: 0, w: 0, h: 0 } };
  const area = districts.reduce((sum, d) => sum + d.plan.bounds.w * d.plan.bounds.h, 0);
  const widest = Math.max(...districts.map(d => d.plan.bounds.w));
  const ideal = Math.sqrt(area * 1.6);
  const widths = new Set([widest, ideal, ideal * .8, ideal * 1.2]);
  let prefix = 0;
  for (const d of districts) { prefix += d.plan.bounds.w + (prefix ? gap : 0); widths.add(prefix); }
  let best: { districts: Map<string, CampusDistrict>; bounds: PlanRect; score: number } | null = null;
  for (const width of widths) {
    let x = 0, y = 0, rowH = 0, right = 0;
    const placed = new Map<string, CampusDistrict>();
    for (const d of districts) {
      if (x && x + d.plan.bounds.w > Math.max(width, widest)) { x = 0; y += rowH + gap; rowH = 0; }
      const move = (r: PlanRect) => ({ ...r, x: r.x + x, y: r.y + y });
      placed.set(d.id, { building: move(d.plan.building), park: move(d.plan.park), bounds: move(d.plan.bounds) });
      right = Math.max(right, x + d.plan.bounds.w); rowH = Math.max(rowH, d.plan.bounds.h); x += d.plan.bounds.w + gap;
    }
    const h = y + rowH;
    // The dominant term maximizes the scale of a fitted landscape overview.
    const score = Math.max(right / 1.6, h) ** 2 + (right * h - area) * .15;
    if (!best || score < best.score) best = { districts: placed, bounds: { x: 0, y: 0, w: right, h }, score };
  }
  return { districts: best!.districts, bounds: best!.bounds };
}
