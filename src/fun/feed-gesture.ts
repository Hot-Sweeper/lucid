// The thumb gesture behind the phone feeds' clip changes, as plain time functions so the motion
// stays right at any frame rate (and can be checked headlessly). Units: one screen height.

/** Thumb travel over the drag, 0..1 in, 0..1 out: it presses gently, speeds up and lets go still moving. */
export const flick = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (1.6 - 0.6 * t); };
/** A drag that eases in and out, ending at rest. */
export const hesitate = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** flick's slope at release (the derivative at t = 1). */
export const FLICK_RELEASE = 1.4;

export type Spring = { omega: number; zeta: number };
/** Carrying on to the next clip after a flick: a little momentum, about one percent past, no wobble. */
export const COMMIT: Spring = { omega: 18, zeta: 0.82 };
/** Changing its mind: back to the same clip without overshoot. */
export const RETURN: Spring = { omega: 16, zeta: 1 };

/** Position of a damped spring released at x0 with velocity v0 (per second), `t` seconds later. */
export function spring(t: number, x0: number, v0: number, target: number, { omega, zeta }: Spring) {
  const e0 = x0 - target;
  const decay = Math.exp(-zeta * omega * t);
  if (zeta >= 1) return target + decay * (e0 + (v0 + omega * e0) * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return target + decay * (e0 * Math.cos(wd * t) + ((v0 + zeta * omega * e0) / wd) * Math.sin(wd * t));
}

/** Seconds until the spring is within 0.2 percent of its target. */
export const settleTime = ({ omega, zeta }: Spring) => Math.log(500) / (zeta * omega) + (zeta >= 1 ? 0.12 : 0);

/**
 * One swipe: the content follows the thumb one to one for `dragMs`, then a spring takes over from
 * the release position and speed. Returns the offset (0 current clip, 1 next clip) at `ms` since
 * the press, and the total duration.
 */
export function swipeMotion(travel: number, dragMs: number, commit: boolean) {
  // A real flick lets go at speed; a thumb that changes its mind slows down and stops first.
  const drag = commit ? flick : hesitate;
  const release = commit ? (travel * FLICK_RELEASE) / (dragMs / 1000) : 0;
  const shape = commit ? COMMIT : RETURN;
  const total = dragMs + settleTime(shape) * 1000;
  const at = (ms: number) => ms < dragMs ? drag(ms / dragMs) * travel
    : ms >= total ? (commit ? 1 : 0)
    : spring((ms - dragMs) / 1000, travel, release, commit ? 1 : 0, shape);
  return { at, total };
}
