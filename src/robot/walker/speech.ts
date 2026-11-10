// A walking robot's speech bubble: it floats over the robot's head, stays inside the walls of the
// room it is in, pops in and fades out, and shows translated flavor lines when asked to.
import gsap from "gsap";
import { flavorSpeech } from "../../localization-speech";

export class SpeechBubble {
  readonly el: HTMLDivElement;
  private fit: { bw: number; bh: number; pw: number; ph: number } | null = null;
  private timer: gsap.core.Tween | null = null;
  private locale?: ReturnType<typeof flavorSpeech>;

  /** `at` gives the bubble's anchor over the head, in the parent's coordinates. */
  constructor(parent: Element, flavor: boolean, private at: () => { x: number; top: number }) {
    this.el = document.createElement("div");
    this.el.className = "world-say";
    this.el.setAttribute("role", "status");
    this.el.innerHTML = "<p></p>";
    parent.appendChild(this.el);
    if (flavor) this.locale = flavorSpeech(text => {
      const p = this.el.querySelector("p")!;
      p.textContent = text;
      this.measure(p);
      this.place();
    });
  }

  /** Shows a line for `ms` (or a reading time), or hides the bubble with null. `voice` runs just before it appears. Returns whether a line is shown. */
  say(text: string | null, ms: number | undefined, think: boolean, voice: () => void) {
    this.timer?.kill();
    this.locale?.show(text);
    const b = this.el, p = b.querySelector("p")!;
    if (text) b.classList.toggle("think", think);
    if (!text) {
      if (b.classList.contains("on")) gsap.to(p, { opacity: 0, y: 6, duration: 0.2, ease: "power2.in", onComplete: () => b.classList.remove("on") });
      return false;
    }
    if (!this.locale) p.textContent = text;
    voice();
    const was = b.classList.contains("on");
    b.classList.add("on");
    // inside a room the bubble must stay within its walls (rooms clip what sticks out);
    // measured once here, not every frame
    this.measure(p);
    this.place();
    if (!was) gsap.fromTo(p, { opacity: 0, y: 8, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" });
    else gsap.fromTo(p, { scale: 0.96 }, { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
    const dur = ms ?? 1400 + text.length * 55;
    this.timer = gsap.delayedCall(dur / 1000, () => this.say(null, undefined, false, () => {}));
    return true;
  }

  /** Keeps a showing bubble over the head (called on the robot's drawn frames). */
  follow() { if (this.el.classList.contains("on")) this.place(); }

  private measure(p: HTMLElement) {
    const room = this.el.parentElement?.closest(".room") ? this.el.parentElement : null;
    this.fit = room ? { bw: p.offsetWidth, bh: p.offsetHeight, pw: room.clientWidth, ph: room.clientHeight } : null;
  }

  private place() {
    let { x, top } = this.at();
    const f = this.fit;
    if (f && f.pw > 0) {
      top = Math.max(top, f.bh + 8);                                   // not through the top wall
      x = Math.min(Math.max(x, f.bw / 2 + 8), f.pw - f.bw / 2 - 8);   // nor through the side walls
    }
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${top.toFixed(1)}px)`;
  }

  destroy() {
    this.locale?.destroy();
    this.timer?.kill();
    gsap.killTweensOf(this.el.firstElementChild);
    this.el.remove();
  }
}
