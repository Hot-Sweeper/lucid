import gsap from "gsap";
import { reducedMotion } from "../../util/dom";
import type { Walker } from "./walker";

// The handoff between two real workers when a thread moves to another harness: standing side by
// side, facing each other, they high five and a few sparks fly between their hands. The office
// (world/harness-swap.ts) walks them there and away; this is only the gesture. `parent` is the
// layer both walkers stand in.

export function highFive(parent: Element, a: Walker, b: Walker): Promise<void> {
  const spark = document.createElement("div");
  spark.className = "world-spark";
  spark.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
  parent.appendChild(spark);
  const top = Math.min(a.y, b.y) - Math.max(a.height, b.height) * 0.62;
  gsap.set(spark, { x: (a.x + b.x) / 2, y: top, opacity: 0, zIndex: Math.round(Math.max(a.y, b.y)) + 300001 });
  a.highFive(); b.highFive();
  return new Promise<void>((resolve) => {
    const done = () => { spark.remove(); resolve(); };
    if (reducedMotion()) { done(); return; }
    gsap.timeline({ delay: 0.32, onComplete: done, onInterrupt: done })
      .to(spark, { opacity: 1, duration: 0.05 })
      .fromTo(spark.children, { scale: 0.2, opacity: 1 }, { scale: 1.2, opacity: 0, duration: 0.55, ease: "power2.out" }, 0);
  });
}
