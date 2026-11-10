// Ambient work (robot bodies, monitor screens) runs only on "beat" display frames, at most
// AMBIENT_HZ times a second. Chromium regroups the page's layers on any frame with a repaint;
// at 144 Hz that cost landed on every frame. Now every other frame carries only camera motion,
// which the compositor moves cheaply, while ambient work stays spread across the beat frames.
export const AMBIENT_HZ = 72;
/** While nothing is touched and the camera rests (world/budget.ts calm mode), ambient work
 * runs on fewer frames: one in five at 144 Hz instead of every other. */
export const CALM_HZ = 30;
/** Calm and the window not focused (Lucid open beside other work). */
export const CALM_AWAY_HZ = 15;
let rate = AMBIENT_HZ;
export function setAmbientRate(hz: number) { rate = hz; }
/** When the beat after `frameTime` starts (same clock as frame timestamps). */
export function nextBeat(frameTime: number) { return (Math.floor(frameTime * rate / 1000) + 1) * 1000 / rate; }
let lastFrame = NaN, lastBeat = NaN, beatFrame = true;
/** Is this display frame a beat frame? `frameTime` is the frame's shared timestamp. */
export function ambientBeat(frameTime = frameNow()) {
  if (frameTime === lastFrame) return beatFrame;
  const beat = Math.floor(frameTime * rate / 1000);
  beatFrame = beat !== lastBeat;
  lastBeat = beat; lastFrame = frameTime;
  return beatFrame;
}
/** The current frame's timestamp, identical for every callback in one display frame. */
export function frameNow() {
  const t = typeof document !== "undefined" ? document.timeline?.currentTime : null;
  return typeof t === "number" ? t : performance.now();
}
