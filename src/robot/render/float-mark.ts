// Little marks that float off a robot (a sleeper's "z", a sigh's puff) as compositor animations.
// They were GSAP tweens writing inline styles on every frame, so each one made Chromium regroup
// the whole campus into layers on every frame; transform and opacity animations run on the
// compositor instead. Far out they are a few pixels wide and are not drawn at all.
import { farCamera } from "../../perf/budget";

export type MarkPose = { x: number; y: number; scale: number; rotation?: number; opacity: number };
export type MarkStep = { at: number; pose: Partial<MarkPose>; ease?: string };
/** GSAP's eases in CSS form, so the marks move as before. */
export const MARK_EASE = { sineOut: "cubic-bezier(0.61, 1, 0.88, 1)", sineIn: "cubic-bezier(0.12, 0, 0.39, 0)", sineInOut: "cubic-bezier(0.37, 0, 0.63, 1)", power2Out: "cubic-bezier(0.33, 1, 0.68, 1)" } as const;

/** Whether marks would be too small to see at this zoom. */
export const marksTooSmall = () => farCamera();

const transform = (p: MarkPose) => `translate(${p.x}px, ${p.y}px) rotate(${p.rotation ?? 0}deg) scale(${p.scale})`;

/** Floats `el` from `start` through timed transform and opacity steps (seconds), then removes it.
 * Transform and opacity keep separate timelines, as the GSAP timelines they replace did. */
export function floatMark(el: HTMLElement, start: MarkPose, moves: MarkStep[], fades: MarkStep[]) {
  const total = Math.max(...[...moves, ...fades].map(s => s.at)) || 1;
  const track = (steps: MarkStep[], key: "transform" | "opacity") => {
    let pose = { ...start };
    const frames: Keyframe[] = [{ offset: 0, [key]: key === "transform" ? transform(pose) : String(pose.opacity) }];
    for (const step of steps) {
      pose = { ...pose, ...step.pose };
      // A step eases from the previous keyframe: CSS puts the easing on the keyframe it leaves.
      frames[frames.length - 1].easing = step.ease ?? "linear";
      frames.push({ offset: step.at / total, [key]: key === "transform" ? transform(pose) : String(pose.opacity) });
    }
    if (frames[frames.length - 1].offset !== 1) frames.push({ offset: 1, [key]: frames[frames.length - 1][key] });
    return frames;
  };
  el.style.transform = transform(start); el.style.opacity = String(start.opacity);
  const options = { duration: total * 1000, fill: "forwards" as const };
  const motion = el.animate(track(moves, "transform"), options);
  el.animate(track(fades, "opacity"), options);
  motion.onfinish = () => el.remove();
  return motion;
}

/** Fades marks out where they are and removes them (the robot woke up). */
export function dropMarks(marks: Iterable<Element>) {
  for (const el of marks) {
    if (!(el instanceof HTMLElement)) continue;
    const opacity = getComputedStyle(el).opacity;
    for (const a of el.getAnimations()) if (a.effect && (a.effect as KeyframeEffect).getKeyframes().some(k => "opacity" in k)) a.cancel();
    el.animate([{ opacity }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = () => el.remove();
  }
}
