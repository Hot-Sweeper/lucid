// Two-bone limb solvers. Poses only say where a hand (or foot) should be; these find the elbow
// (or knee). The seated robot solves its arms in 2D desk coordinates, the walker solves arms and
// legs in 3D body space and projects them into the view it is seen from.
import type { Pt } from "./rig";
import { clamp } from "../util/math";

/** Two-bone arm: shoulder s, hand target t. `out` (-1 left, 1 right) picks the elbow that hangs outward. Bones may stretch a little. */
/** Which way an elbow bent last frame, so it does not flip when both ways score about the same. */
export type ArmMemo = { side?: 1 | -1 };
const MIN_ELBOW = (40 * Math.PI) / 180;   // the elbow never closes tighter than this
export function solveArm(s: Pt, t: Pt, upper: number, fore: number, out: number, stretch = 1.25, down = 0.35, memo?: ArmMemo) {
  let dx = t.x - s.x, dy = t.y - s.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const k = clamp(d / (upper + fore - 0.5), 1, stretch);
  let U = upper * k, F = fore * k;
  const M = U + F - 0.5;
  if (d > M) { t = { x: s.x + (dx / d) * M, y: s.y + (dy / d) * M }; dx = t.x - s.x; dy = t.y - s.y; d = M; }
  // A hand close to the shoulder would fold the elbow into a hairpin: shorten both bones
  // instead (the arm reads as pointing toward or away from us), keeping the hand on target.
  const dMin = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(MIN_ELBOW));
  if (d < dMin) { const f = Math.max(0.35, d / dMin); U *= f; F *= f; }
  // Resolve the two elbow candidates in the hand direction and its perpendicular.
  // This is the same triangle as atan2/acos followed by four sin/cos calls, without
  // repeatedly converting each arm to angles and back on every body redraw.
  const nx = dx === 0 && dy === 0 ? 1 : dx / d, ny = dy / d;
  const ca = clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const along = U * ca, across = U * sa;
  const ex = s.x + nx * along, ey = s.y + ny * along;
  const e1 = { x: ex - ny * across, y: ey + nx * across };
  const e2 = { x: ex + ny * across, y: ey - nx * across };
  const score = (p: Pt) => (p.x - s.x) * out + (p.y - s.y) * down;
  const diff = score(e1) - score(e2);
  if (!memo) return { e: diff > 0 ? e1 : e2, t };
  // keep bending the same way unless the other way is clearly better (no sudden flips)
  const margin = (upper + fore) * 0.12;
  if (memo.side == null || (memo.side === 1 ? diff < -margin : diff > margin)) memo.side = diff > 0 ? 1 : -1;
  return { e: memo.side === 1 ? e1 : e2, t };
}

type V3 = { x: number; y: number; z: number };
export type { V3 };
/** Two bones from s to t in 3D; the joint bends toward `pole`. Bones may stretch a little. */
export function ik3(s: V3, t: V3, A: number, B: number, pole: V3, stretch = 1.15) {
  let dx = t.x - s.x, dy = t.y - s.y, dz = t.z - s.z;
  let L = Math.hypot(dx, dy, dz) || 0.001;
  const k = clamp(L / (A + B - 0.6), 1, stretch);
  A *= k; B *= k;
  const M = A + B - 0.6;
  if (L > M) { const f = M / L; dx *= f; dy *= f; dz *= f; L = M; }
  // never fold the elbow or knee tighter than about 40 degrees: shorten the bones instead
  const dMin = Math.sqrt(A * A + B * B - 2 * A * B * 0.766);
  if (L < dMin) { const f = Math.max(0.35, L / dMin); A *= f; B *= f; }
  const nx = dx / L, ny = dy / L, nz = dz / L;
  const ca = clamp((A * A + L * L - B * B) / (2 * A * L), -1, 1), sa = Math.sqrt(1 - ca * ca);
  const pd = pole.x * nx + pole.y * ny + pole.z * nz;
  let px = pole.x - nx * pd, py = pole.y - ny * pd, pz = pole.z - nz * pd;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) { px = 0; py = 1; pz = 0; } else { px /= pl; py /= pl; pz /= pl; }
  return {
    e: { x: s.x + A * (nx * ca + px * sa), y: s.y + A * (ny * ca + py * sa), z: s.z + A * (nz * ca + pz * sa) },
    h: { x: s.x + dx, y: s.y + dy, z: s.z + dz },
  };
}
