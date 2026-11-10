// The antenna's damped spring, shared by both robots. It follows the head's tilt and position a
// little late, overshoots and settles, stretches when the head drops and bounces when kicked
// (a kick adds to `phiV` or `tvy`). Units are v0 units and degrees.
import { clamp } from "../util/math";

export type AntennaSpring = { phi: number; phiV: number; tx: number; tvx: number; ty: number; tvy: number };
/** The seated and the walking robot are tuned a little differently. `snap` re-centres after a teleport. */
export type AntennaTune = {
  k1: number; c1: number; k2: number; c2: number;
  reach: number; lean: number; maxLag: number;
  drop: number; minStretch: number; maxStretch: number;
  snap?: number;
};

/** Advances the spring toward the head's rotation and position; returns the antenna's lag angle and stretch. */
export function stepAntenna(sp: AntennaSpring, k: AntennaTune, dt: number, rot: number, headX: number, headY: number) {
  sp.phiV += (k.k1 * (rot - sp.phi) - k.c1 * sp.phiV) * dt; sp.phi += sp.phiV * dt;
  sp.tvx += (k.k2 * (headX - sp.tx) - k.c2 * sp.tvx) * dt; sp.tx += sp.tvx * dt;
  sp.tvy += (k.k2 * (headY - sp.ty) - k.c2 * sp.tvy) * dt; sp.ty += sp.tvy * dt;
  if (k.snap) {
    if (Math.abs(sp.tx - headX) > k.snap) sp.tx = headX;
    if (Math.abs(sp.ty - headY) > k.snap) sp.ty = headY;
  }
  const lag = clamp(sp.phi - rot + ((sp.tx - headX) / k.reach) * 57.3 * k.lean, -k.maxLag, k.maxLag);
  const stretch = clamp(1 + (headY - sp.ty) / k.drop, k.minStretch, k.maxStretch);
  return { lag, stretch };
}
