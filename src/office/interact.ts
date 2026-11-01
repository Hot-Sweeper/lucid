import gsap from "gsap";
import { gameSound } from './sound';
import type { Walker } from "../world/walker";

// Little toys in the world: pick up a walking robot, carry it somewhere, or fling it and
// watch it tumble; poke it to say hi. Each robot's owner (park, hallway, shop) decides what
// it does after landing, usually walking back to what it was doing.

type Bounds = { x: number; y: number; w: number; h: number };
type Opts = {
  bounds?: () => Bounds | null;            // where it may land (in its parent's coordinates)
  onPoke?: () => void;                      // a plain click
  onGrab?: () => void;                      // picked up (before it starts dangling)
  onOpen?: () => void;                      // a double click
  onLanded?: () => void;                    // after a drag or a throw
};

const held = new WeakSet<Walker>();
export const isHeld = (w: Walker) => held.has(w);
export const whenFree = async (w: Walker) => { while (held.has(w)) await new Promise((r) => setTimeout(r, 120)); };

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const GRAB = ["Whoa!", "Hey!", "Put me down!", "I can fly?", "Wheee", "Careful, I'm fragile", "Where are we going?"];
const CARRY = ["Thanks for the lift.", "Nice view up here.", "This is not my floor.", "Okay. I live here now."];
const THROWN = ["WHEEE!", "AAAAH", "Was that necessary?", "Again! Again!", "My circuits...", "I saw my whole commit history", "10 out of 10 landing"];
const POKE = ["Hi!", "That tickles.", "Yes, CEO?", "Beep.", "I'm on break!", "Boop.", "Can I help you?", "*happy whirr*"];
const SPINNY = ["Everything is spinning.", "Which way is up?", "Need a reboot.", "Hold on, buffering."];

/** World zoom: how many screen pixels one world pixel is right now. */
function zoom(el: HTMLElement) {
  const root = el.closest(".world") as HTMLElement | null;
  if (!root || !root.offsetWidth) return 1;
  return root.getBoundingClientRect().width / root.offsetWidth;
}

export function makeInteractive(w: Walker, o: Opts = {}) {
  const el = w.el;
  el.classList.add("grabbable");
  let pokes = 0, pokeTimer = 0;
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("dblclick", (e) => { e.stopPropagation(); o.onOpen?.(); });
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const parent = el.parentElement as HTMLElement;
    const s = zoom(el);
    const local = (ev: PointerEvent) => { const r = parent.getBoundingClientRect(); return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s }; };
    const start = local(e), off = { x: w.x - start.x, y: w.y - start.y };
    let dragging = false;
    const trail: { x: number; y: number; t: number }[] = [];
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) < 5) return;
      if (!dragging) {
        dragging = true;
        held.add(w);
        o.onGrab?.();
        w.stop();
        w.calm();
        w.grabbed(true);   // legs dangle and kick, arms flail
        w.setExpression("surprised");
        gameSound.at('boop', el, .7);
        w.say(pick(GRAB), 1400);
        el.classList.add("held");
        gsap.to(el.style, { scale: 1.12, duration: 0.15 } as any);
      }
      // hanging from your cursor, swinging a little with the motion
      const nx = p.x + off.x, ny = p.y + off.y + 14;
      const dx = nx - w.x;
      w.setPos(nx, ny);
      el.style.rotate = `${Math.max(-25, Math.min(25, dx * 1.6))}deg`;
      trail.push({ x: nx, y: ny, t: performance.now() });
      if (trail.length > 6) trail.shift();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!dragging) {
        // a click: poke it (several quick pokes and it gets grumpy)
        pokes++;
        window.clearTimeout(pokeTimer);
        pokeTimer = window.setTimeout(() => (pokes = 0), 2500);
        w.hop();
        gameSound.at('poke', el, .8);
        w.poke();
        if (pokes >= 4) { w.setExpression("angry"); w.say(pick(["Okay, stop it.", "I will file a ticket.", "Rude.", "Poke limit reached."]), 1800); }
        else { w.setExpression(pick(["happy", "laugh", "shy"] as const)); w.say(pick(POKE), 1500); }
        window.setTimeout(() => w.setExpression("neutral"), 1600);
        o.onPoke?.();
        return;
      }
      // released: a gentle drop, or a throw if it was moving fast
      const a = trail[0], b = trail[trail.length - 1];
      const dt = a && b ? Math.max(16, b.t - a.t) : 100;
      const vx = a && b ? ((b.x - a.x) / dt) * 1000 : 0, vy = a && b ? ((b.y - a.y) / dt) * 1000 : 0;
      const speed = Math.hypot(vx, vy);
      const box = o.bounds?.() ?? null;
      const clampX = (x: number) => (box ? Math.max(box.x + 20, Math.min(box.x + box.w - 20, x)) : x);
      const clampY = (y: number) => (box ? Math.max(box.y + 40, Math.min(box.y + box.h - 10, y)) : y);
      const land = () => {
        el.classList.remove("held");
        held.delete(w);
        gameSound.at('boop', el, .55);
        o.onLanded?.();
      };
      if (speed > 500) {
        const end = { x: clampX(w.x + vx * 0.35), y: clampY(w.y + vy * 0.35 - 14) };
        const spin = { r: parseFloat(el.style.rotate) || 0, h: 0 };
        const turns = (vx >= 0 ? 1 : -1) * 360 * Math.min(3, Math.round(speed / 900) + 1);
        w.say(pick(THROWN), 1600);
        const from = { x: w.x, y: w.y };
        gsap.timeline({ onComplete: () => {
          el.style.rotate = "";
          gsap.to(el.style, { scale: 1, duration: 0.2 } as any);
          w.setExpression("sleepy");
          w.say(pick(SPINNY), 2000);
          // a little wobble before it gets its bearings back
          gsap.fromTo(el, { "--wob": 0 } as any, { "--wob": 1, duration: 1.4, onUpdate() { el.style.rotate = `${Math.sin((this as any).progress() * 18) * 9 * (1 - (this as any).progress())}deg`; }, onComplete: () => { el.style.rotate = ""; w.setExpression("neutral"); land(); } } as any);
        } })
          .to(spin, { r: spin.r + turns, duration: 0.7, ease: "power2.out", onUpdate: () => { el.style.rotate = `${spin.r}deg`; } }, 0)
          .to(spin, { h: 1, duration: 0.7, ease: "none", onUpdate: () => {
            const t = spin.h, arc = Math.sin(t * Math.PI) * Math.min(160, 40 + speed * 0.06);
            w.setPos(from.x + (end.x - from.x) * (1 - (1 - t) * (1 - t)), from.y + (end.y - from.y) * (1 - (1 - t) * (1 - t)) - arc);
          } }, 0)
          .to(spin, { h: 1, duration: 0.01 }, 0.7)
          .add(() => w.grabbed(false), 0.7);   // touchdown: squash, then a dizzy wobble
      } else {
        const end = { x: clampX(w.x), y: clampY(w.y - 14) };
        w.grabbed(false);
        gsap.to(w, { x: end.x, y: end.y, duration: 0.25, ease: "bounce.out", onUpdate: () => w.setPos(w.x, w.y) });
        el.style.rotate = "";
        gsap.to(el.style, { scale: 1, duration: 0.2 } as any);
        w.setExpression("happy");
        w.say(pick(CARRY), 1600);
        window.setTimeout(() => { w.setExpression("neutral"); land(); }, 700);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
}

/** A short floating word ("Quack!", "Splash!") at a spot in a layer. */
export function popWord(layer: HTMLElement, x: number, y: number, text: string, color = "#ffffff") {
  const t = document.createElement("div");
  t.className = "pop-word";
  t.textContent = text;
  t.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  layer.appendChild(t);
  gsap.fromTo(t, { y: 0, opacity: 0, scale: 0.6 }, { y: -40, opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" });
  gsap.to(t, { opacity: 0, y: -60, duration: 0.5, delay: 0.9, onComplete: () => t.remove() });
}

/** Water droplets bursting from a point. */
export function splash(layer: HTMLElement, x: number, y: number, n = 12) {
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    d.className = "drop";
    d.style.cssText = `left:${x}px;top:${y}px`;
    layer.appendChild(d);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 70;
    gsap.timeline({ onComplete: () => d.remove() })
      .to(d, { x: Math.cos(a) * v, y: Math.sin(a) * v, duration: 0.35, ease: "power2.out" })
      .to(d, { y: `+=${40 + Math.random() * 30}`, opacity: 0, duration: 0.4, ease: "power2.in" });
  }
}
