// Helpers for the robot's drawing and animation code.
import gsap from "gsap";

/** Waits on the GSAP clock, so robot scripts pause and speed up with every other animation. */
export const wait = (seconds: number) => new Promise<void>((r) => gsap.delayedCall(seconds, r));

/** Every `data-<attr>` element under root, by its value: the parts a robot animates. */
export function bind(root: Element, attr = "r") {
  const out: Record<string, SVGElement> = {};
  for (const n of root.querySelectorAll(`[data-${attr}]`)) out[(n as SVGElement).dataset[attr]!] = n as SVGElement;
  return out;
}
