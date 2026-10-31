import gsap from "gsap";
import { FLOORS, WALLS, DECOR, DECOR_IDS, drawFloor, drawDecor, type FloorId, type WallId, type DecorId } from "../decor/decor";
import { itemFor, coinIcon, coinBurst, currentSeason, type Wallet, type ShopKind } from "./shop";

// Furnishing an office: pick a floor, a wall colour and decorations. Every change shows in the
// room right away; things unlock as the company grows.

export type RoomTheme = { floor?: FloorId; wall?: WallId; decor?: DecorId[] };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let open: { close(): void } | null = null;

export function openDecorate(o: { title: string; theme: RoomTheme; level: number; wallet?: Wallet; onChange: (t: RoomTheme) => void }) {
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
    <section><h3>Things</h3><p class="dc-hint">Buy with coins, more unlock as your company levels up. Things that do not fit in the room are left out.</p><div class="dc-items">
      ${DECOR_IDS.map((id) => `<button type="button" data-d="${id}" aria-pressed="false">${itemPic(id)}<b>${esc(DECOR[id].name)}</b><small class="dc-tag"></small></button>`).join("")}
    </div></section>
    <p class="dc-bal" aria-live="polite"></p>`;
  document.body.appendChild(el);
  const owns = (kind: ShopKind, id: string) => !o.wallet || o.wallet.owns(`${kind}:${id}`);
  const price = (kind: ShopKind, id: string) => itemFor(kind, id)?.price ?? 0;
  // buy on the spot if it is affordable; returns whether the thing is now owned
  const ensure = (kind: ShopKind, id: string, from: Element) => {
    if (owns(kind, id)) return true;
    if (!o.wallet?.buy(`${kind}:${id}`)) {
      gsap.fromTo(from, { x: 0 }, { x: 5, duration: 0.06, yoyo: true, repeat: 5, ease: "none", clearProps: "x" });
      return false;
    }
    coinBurst(from);
    return true;
  };
  const paint = () => {
    el.querySelectorAll<HTMLElement>(".dc-sw").forEach((g) => {
      const cur = g.dataset.k === "floor" ? theme.floor : theme.wall;
      g.querySelectorAll<HTMLElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur)));
    });
    el.querySelectorAll<HTMLElement>("[data-d]").forEach((b) => {
      const id = b.dataset.d as DecorId;
      const sea = itemFor("decor", id)?.season;
      const offSeason = !!sea && sea !== currentSeason() && !owns("decor", id);
      const locked = DECOR[id].unlockAt > o.level || offSeason, own = owns("decor", id);
      b.setAttribute("aria-pressed", String(own && theme.decor!.includes(id)));
      (b as HTMLButtonElement).disabled = locked;
      b.classList.toggle("for-sale", !locked && !own);
      (b.querySelector(".dc-tag") as HTMLElement).innerHTML = offSeason ? `In ${sea}` : locked ? `Level ${DECOR[id].unlockAt}` : own ? "" : `${coinIcon(12)}${price("decor", id).toLocaleString()}`;
    });
    el.querySelectorAll<HTMLElement>(".dc-sw button").forEach((b) => {
      const k = (b.parentElement as HTMLElement).dataset.k as "floor" | "wall";
      const own = owns(k, b.dataset.v!);
      b.classList.toggle("for-sale", !own);
      b.title = `${k === "floor" ? FLOORS[b.dataset.v as FloorId].name : WALLS[b.dataset.v as WallId].name}${own ? "" : `, ${price(k, b.dataset.v!)} coins`}`;
    });
    if (o.wallet) (el.querySelector(".dc-bal") as HTMLElement).innerHTML = `${coinIcon(14)} ${o.wallet.balance.toLocaleString()} coins to spend`;
  };
  paint();
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".dc-x")) return close();
    const sw = t.closest(".dc-sw button") as HTMLElement | null;
    if (sw) {
      const k = (sw.parentElement as HTMLElement).dataset.k as "floor" | "wall";
      if (!ensure(k, sw.dataset.v!, sw)) return;
      (theme as any)[k] = (theme as any)[k] === sw.dataset.v ? undefined : sw.dataset.v;
    }
    const it = t.closest("[data-d]") as HTMLButtonElement | null;
    if (it && !it.disabled) {
      const id = it.dataset.d as DecorId;
      const had = owns("decor", id);
      if (!ensure("decor", id, it)) return;
      theme.decor = had && theme.decor!.includes(id) ? theme.decor!.filter((x) => x !== id) : [...new Set([...theme.decor!, id])];
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
