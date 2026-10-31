import gsap from "gsap";
import { FLOORS, WALLS, DECOR, DECOR_IDS, drawFloor, drawDecor, type FloorId, type WallId, type DecorId } from "../decor/decor";

// Furnishing an office: pick a floor, a wall colour and decorations. Every change shows in the
// room right away; things unlock as the company grows.

export type RoomTheme = { floor?: FloorId; wall?: WallId; decor?: DecorId[] };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let open: { close(): void } | null = null;

export function openDecorate(o: { title: string; theme: RoomTheme; level: number; onChange: (t: RoomTheme) => void }) {
  open?.close();
  const theme: RoomTheme = { ...o.theme, decor: [...(o.theme.decor ?? [])] };
  const el = document.createElement("aside");
  el.className = "decorate";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `Decorate ${o.title}`);
  const floorSw = (id: FloorId) => `<svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">${drawFloor(id, 64, 40, 0)}</svg>`;
  const itemPic = (id: DecorId) => {
    const wall = DECOR[id].spot === "wall";
    return `<svg viewBox="-70 ${wall ? -100 : -110} 140 130" width="70" height="65" aria-hidden="true">${drawDecor(id, 0, wall ? 20 : 0, id === "pingpong" || id === "rug" ? 0.5 : 0.75)}</svg>`;
  };
  el.innerHTML = `
    <header><div><h2>Decorate</h2><p>${esc(o.title)}</p></div><button type="button" class="dc-x" aria-label="Done">Done</button></header>
    <section><h3>Floor</h3><div class="dc-sw" data-k="floor">
      ${(Object.keys(FLOORS) as FloorId[]).map((id) => `<button type="button" data-v="${id}" title="${esc(FLOORS[id].name)}" aria-label="${esc(FLOORS[id].name)}">${floorSw(id)}</button>`).join("")}
    </div></section>
    <section><h3>Walls</h3><div class="dc-sw" data-k="wall">
      ${(Object.keys(WALLS) as WallId[]).map((id) => `<button type="button" data-v="${id}" title="${esc(WALLS[id].name)}" aria-label="${esc(WALLS[id].name)}"><span style="background:${WALLS[id].face};box-shadow:inset 0 -8px 0 ${WALLS[id].trim}"></span></button>`).join("")}
    </div></section>
    <section><h3>Things</h3><p class="dc-hint">More unlock as your company levels up. Things that do not fit in the room are left out.</p><div class="dc-items">
      ${DECOR_IDS.map((id) => {
        const locked = DECOR[id].unlockAt > o.level;
        return `<button type="button" data-d="${id}" ${locked ? "disabled" : ""} aria-pressed="false">${itemPic(id)}<b>${esc(DECOR[id].name)}</b>${locked ? `<small>Level ${DECOR[id].unlockAt}</small>` : ""}</button>`;
      }).join("")}
    </div></section>`;
  document.body.appendChild(el);
  const paint = () => {
    el.querySelectorAll<HTMLElement>(".dc-sw").forEach((g) => {
      const cur = g.dataset.k === "floor" ? theme.floor : theme.wall;
      g.querySelectorAll<HTMLElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur)));
    });
    el.querySelectorAll<HTMLElement>("[data-d]").forEach((b) => b.setAttribute("aria-pressed", String(theme.decor!.includes(b.dataset.d as DecorId))));
  };
  paint();
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".dc-x")) return close();
    const sw = t.closest(".dc-sw button") as HTMLElement | null;
    if (sw) {
      const k = (sw.parentElement as HTMLElement).dataset.k as "floor" | "wall";
      (theme as any)[k] = (theme as any)[k] === sw.dataset.v ? undefined : sw.dataset.v;
    }
    const it = t.closest("[data-d]") as HTMLButtonElement | null;
    if (it && !it.disabled) {
      const id = it.dataset.d as DecorId;
      theme.decor = theme.decor!.includes(id) ? theme.decor!.filter((x) => x !== id) : [...theme.decor!, id];
      gsap.fromTo(it.querySelector("svg"), { y: 0 }, { y: -5, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
    }
    if (sw || it) { paint(); o.onChange({ ...theme, decor: [...theme.decor!] }); }
  });
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  function close() {
    window.removeEventListener("keydown", onKey, true);
    open = null;
    gsap.to(el, { x: 30, opacity: 0, duration: 0.2, ease: "power2.in", onComplete: () => el.remove() });
  }
  open = { close };
  gsap.fromTo(el, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power3.out" });
  (el.querySelector(".dc-x") as HTMLElement).focus();
}
