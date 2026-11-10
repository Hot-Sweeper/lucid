import gsap from "gsap";
import { Walker } from "./walker";
import { line } from "../lines";

// A handoff: when a thread switches harness, the old robot stands next to the new one and
// explains the work (gestures and a few speech bubbles) while the new one nods along. A little
// high five, then the old robot walks off. About 8 seconds. `at` is the point between the two
// robots' feet, in the parent's coordinates (desk-unit coordinates work).

export type HandoffRobot = { provider: string; model?: string; name?: string };

export function playHandoff(parent: Element, from: HandoffRobot, to: HandoffRobot, at: { x: number; y: number }, scale = 0.48): Promise<void> {
  const gap = 46 * (scale / 0.48);
  const oldR = new Walker(parent, { id: "handoff-from", provider: from.provider, model: from.model, name: from.name, scale });
  const newR = new Walker(parent, { id: "handoff-to", provider: to.provider, model: to.model, name: to.name, scale });
  oldR.setPos(at.x - gap, at.y);
  oldR.face("right");
  newR.setPos(at.x + gap * 4, at.y + 4);
  newR.face("left");
  gsap.set([oldR.el, newR.el], { opacity: 0 });

  const spark = document.createElement("div");
  spark.className = "world-spark";
  spark.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
  parent.appendChild(spark);
  gsap.set(spark, { x: at.x, y: at.y - newR.height * 0.62, opacity: 0 });

  return new Promise<void>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => { oldR.destroy(); newR.destroy(); spark.remove(); resolve(); },
    });
    tl.to(oldR.el, { opacity: 1, duration: 0.35 }, 0)
      .add(() => { oldR.do("idle"); oldR.say(line("handoffHi", from.name), 900); }, 0.1)
      .to(newR.el, { opacity: 1, duration: 0.3 }, 0.1)
      .add(() => { void newR.walkTo(at.x + gap, at.y).then(() => { newR.face("left"); newR.do("listen"); }); }, 0.1)
      // Flavor only: the real work stays in the thread, so nothing here claims a result.
      .add(() => { oldR.do("explain"); oldR.say(line("handoffBrief", from.name), 1300); }, 1.25)
      .add(() => oldR.say(line("handoffBrief", from.name), 1300), 2.6)
      .add(() => { newR.say(line("handoffGotIt", to.name), 900); newR.setExpression("happy"); }, 4.2)
      .add(() => { oldR.do("idle"); oldR.say(line("handoffBye", from.name), 1000); }, 5.6)
      .add(() => { oldR.highFive(); newR.do("idle"); newR.highFive(); }, 6.3)
      .add(() => {
        gsap.timeline()
          .to(spark, { opacity: 1, duration: 0.05 })
          .fromTo(spark.children, { scale: 0.2, opacity: 1 }, { scale: 1.2, opacity: 0, duration: 0.55, ease: "power2.out" }, 0);
        oldR.setExpression("happy");
      }, 6.62)
      .add(() => {
        oldR.setExpression("neutral");
        void oldR.walkTo(at.x - gap * 6, at.y + 8);
        newR.face("down");
        newR.hop();
      }, 7.1)
      .to(oldR.el, { opacity: 0, duration: 0.7 }, 7.7)
      .to(newR.el, { opacity: 0, duration: 0.35 }, 8.2);
  });
}
