import gsap from "gsap";
import type { DeskRig, Expression, Pose, Reaction, SeatedRobot, Pt } from "./rig";
import { GEOM } from "./rig";
import { brandFor } from "./brand";

// A simple stand-in seated robot (back view) used until the full character art is wired in.
// It implements the whole SeatedRobot contract so desks and computers can be tested.
const COLORS: Record<string, [string, string, string]> = {
  codex: ["#f2f4fa", "#c9cee3", "#7cf2ff"],
  claude: ["#f6ecdc", "#e2cfb4", "#ffa477"],
  grok: ["#2a2a2e", "#151517", "#ffffff"],
  generic: ["#c9d3e6", "#9aa7c2", "#4ff0a0"],
};

export class StubRobot implements SeatedRobot {
  el: SVGSVGElement;
  brandName = "codex";
  currentPose: Pose = "rest";
  private L: Pt; private R: Pt;
  private $: Record<string, SVGElement> = {};

  constructor(host: HTMLElement, private desk: DeskRig) {
    host.insertAdjacentHTML("beforeend", `
      <svg class="robot" viewBox="0 0 400 440" aria-hidden="true">
        <path data-s="armL" stroke-width="16" stroke-linecap="round" fill="none"/>
        <path data-s="armR" stroke-width="16" stroke-linecap="round" fill="none"/>
        <circle data-s="handL" r="9"/><circle data-s="handR" r="9"/>
        <ellipse data-s="body" cx="${GEOM.chair.x}" cy="${GEOM.shoulders.left.y + 18}" rx="48" ry="30"/>
        <rect data-s="head" x="${GEOM.head.x - 36}" y="${GEOM.head.y - 32}" width="72" height="64" rx="26"/>
        <rect x="${GEOM.chair.x - 44}" y="${GEOM.chair.y}" width="88" height="44" rx="16" fill="#3c4150"/>
      </svg>`);
    this.el = host.lastElementChild as SVGSVGElement;
    for (const n of this.el.querySelectorAll("[data-s]")) this.$[(n as SVGElement).dataset.s!] = n as SVGElement;
    this.L = { ...desk.homeLeft }; this.R = { ...desk.homeRight };
    this.setBrand("codex");
    gsap.ticker.add(this.frame);
  }

  setBrand(provider: string) {
    this.brandName = brandFor(provider);
    const [shell, shade] = COLORS[this.brandName] || COLORS.generic;
    this.$.head.setAttribute("fill", shell);
    this.$.body.setAttribute("fill", shade);
    for (const k of ["armL", "armR"]) this.$[k].setAttribute("stroke", shade);
    for (const k of ["handL", "handR"]) this.$[k].setAttribute("fill", shell);
  }
  setPose(p: Pose) {
    this.currentPose = p;
    if (p === "type") { gsap.to(this.L, { ...this.desk.homeLeft, duration: 0.3 }); gsap.to(this.R, { ...this.desk.homeRight, duration: 0.3 }); }
    if (p === "rest" || p === "sleep" || p === "idle") { gsap.to(this.L, { x: GEOM.shoulders.left.x + 6, y: GEOM.shoulders.left.y - 30, duration: 0.6 }); gsap.to(this.R, { x: GEOM.shoulders.right.x - 6, y: GEOM.shoulders.right.y - 30, duration: 0.6 }); }
  }
  setTyping(on: boolean) { if (on) this.setPose("type"); }
  pressKey(key: string) {
    this.desk.pressKey(key);
    const k = this.desk.keyPos(key);
    if (!k) return;
    gsap.to(k.hand === "left" ? this.L : this.R, { x: k.x, y: k.y, duration: 0.07, overwrite: "auto" });
  }
  tap(key = " ") { this.pressKey(key); }
  click() {}
  mouseTo(nx: number, ny: number) {
    const m = this.desk.mouse;
    const p = { x: m.x + (nx - 0.5) * 24, y: m.y + (ny - 0.5) * 16 };
    this.desk.moveMouse(p);
    if (this.currentPose === "mouse" || this.currentPose === "read") { this.R.x = p.x; this.R.y = p.y; }
  }
  nudgeMouse(nx: number, ny: number) { this.mouseTo(nx, ny); }
  lookAt() {}
  setExpression(_e: Expression) {}
  react(_k: Reaction) {}
  wake() { this.setPose("rest"); }
  async drink() {
    const m = this.desk.mug, lip = { x: GEOM.head.x + 22, y: GEOM.head.y - 20 };
    const p = { x: m.x, y: m.y };
    await gsap.to(this.R, { x: m.x, y: m.y, duration: 0.5, ease: "power2.inOut" });
    await gsap.to(p, { x: lip.x, y: lip.y, duration: 0.6, ease: "power2.inOut", onUpdate: () => { this.desk.moveMug(p, -20); this.R.x = p.x; this.R.y = p.y; } });
    await gsap.to({}, { duration: 0.6 });
    await gsap.to(p, { x: m.x, y: m.y, duration: 0.6, ease: "power2.inOut", onUpdate: () => { this.desk.moveMug(p, 0); this.R.x = p.x; this.R.y = p.y; } });
    this.desk.moveMug(null);
  }
  async holdPhone(on: boolean) {
    const hold = { x: GEOM.head.x + 30, y: GEOM.head.y - 132 };
    if (on) {
      await gsap.to(this.L, { x: this.desk.phoneRest.x, y: this.desk.phoneRest.y, duration: 0.45, ease: "power2.inOut" });
      this.desk.showPhone(hold, -6);
      gsap.to(this.L, { x: hold.x + 6, y: hold.y + 92, duration: 0.45, ease: "power2.inOut" });
      gsap.to(this.R, { x: hold.x + 40, y: hold.y + 92, duration: 0.45, ease: "power2.inOut" });
    } else {
      this.desk.showPhone(null);
      this.setPose("rest");
    }
  }
  swipe() {}
  destroy() { gsap.ticker.remove(this.frame); this.el.remove(); }

  private frame = () => {
    const s = GEOM.shoulders;
    this.$.armL.setAttribute("d", `M${s.left.x} ${s.left.y} L${this.L.x} ${this.L.y}`);
    this.$.armR.setAttribute("d", `M${s.right.x} ${s.right.y} L${this.R.x} ${this.R.y}`);
    this.$.handL.setAttribute("cx", String(this.L.x)); this.$.handL.setAttribute("cy", String(this.L.y));
    this.$.handR.setAttribute("cx", String(this.R.x)); this.$.handR.setAttribute("cy", String(this.R.y));
  };
}
