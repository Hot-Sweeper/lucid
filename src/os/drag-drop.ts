import gsap from "gsap";
import type { WM } from "./wm";
import { esc } from "./typing";
import { gameSound } from "../office/sound";

export type CarriedFile = { name: string; icon: string; thumb?: string | null };

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Pick up what is selected in a list and carry it to a drop target. The mouse button goes down on
 * the file, a drag image follows the cursor, the target lights up while the cursor is over it, and
 * the image lands in it on release. Nothing is sent from here: it only draws the hand-over, and
 * everything it touches is put back if the robot is interrupted halfway.
 */
export async function carryFiles(wm: WM, rows: HTMLElement[], files: CarriedFile[], target: HTMLElement, o: { hint?: string; targetPoint?: [number, number] } = {}) {
  if (!rows.length || !files.length) return;
  const e = wm.epoch;
  const reduced = calm();
  const first = files[0];
  const art = first.thumb ? `<img alt="" src="${esc(first.thumb)}">` : first.icon;
  const ghost = document.createElement("div");
  ghost.className = "fx-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.innerHTML = `<span class="gi">${art}</span>${files.length > 1 ? `<span class="gc">${files.length}</span>` : ""}<span class="gt"><span class="gn">${esc(files.length > 1 ? `${first.name} and ${files.length - 1} more` : first.name)}</span><span class="gh">${esc(o.hint || "Add to message")}</span></span>`;
  const topLeft = wm.pos(target, 0, 0), bottomRight = wm.pos(target, 1, 1);
  const inside = (x: number, y: number) => x >= topLeft.x && x <= bottomRight.x && y >= topLeft.y && y <= bottomRight.y;
  let lit = false;
  const follow = () => {
    if (!wm.operatorPresent || !wm.presentationVisible) return;
    const c = wm.cursorPoint;
    gsap.set(ghost, { x: c.x + 12, y: c.y + 10 });
    const over = inside(c.x, c.y);
    if (over !== lit) { lit = over; target.classList.toggle("drop", over); }
  };
  let attached = false;
  try {
    await wm.pointAt(rows[0], 0.3, 0.5, 320);
    wm.check(e);
    // mouse button down on the file
    gsap.to(wm.cursorEl, { scale: 0.84, duration: 0.06, transformOrigin: "0 0" });
    wm.robot.click();
    rows.forEach((r) => r.classList.add("dragging"));
    wm.root.appendChild(ghost);
    attached = true;
    gsap.set(ghost, { x: wm.cursorPoint.x + 12, y: wm.cursorPoint.y + 10 });
    if (!reduced) gsap.from(ghost, { opacity: 0, scale: 0.85, duration: 0.14, transformOrigin: "0 0" });
    gsap.ticker.add(follow);
    await wm.sleep(90, e);
    const [ax, ay] = o.targetPoint ?? [0.5, 0.4];
    await wm.pointAt(target, ax, ay, 640);
    wm.check(e);
    follow();
    await wm.sleep(110, e);
    // release
    gsap.to(wm.cursorEl, { scale: 1, duration: 0.08, transformOrigin: "0 0" });
    wm.robot.click();
    try { gameSound.at("paper", target, 0.7); } catch { /* sound is optional */ }
    if (reduced) ghost.style.opacity = "0";
    else await new Promise<void>((r) => gsap.to(ghost, { scale: 0.55, opacity: 0, duration: 0.2, ease: "power2.in", transformOrigin: "0 0", onComplete: () => r() }));
  } finally {
    gsap.ticker.remove(follow);
    gsap.killTweensOf(ghost);
    if (attached) ghost.remove();
    gsap.to(wm.cursorEl, { scale: 1, duration: 0.05, transformOrigin: "0 0" });
    rows.forEach((r) => r.classList.remove("dragging"));
    target.classList.remove("drop");
  }
}
