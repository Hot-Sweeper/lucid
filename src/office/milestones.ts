import gsap from "gsap";
import { runsFor } from "./progress";
import { coinIcon } from "./shop";

// Milestones: a road of level rewards plus achievements earned from real work. Each one pays
// coins once, celebrates when reached, and shows what is next.

export type Stats = {
  shipped: number; today: number; level: number; robots: number; projects: number;
  spentUsd: number; coinsEarned: number; itemsOwned: number; hats: number; nightRuns: boolean;
};
type Milestone = { id: string; title: string; detail: string; coins: number; group: "Shipping" | "Team" | "Company" | "Fun"; done: (s: Stats) => boolean; progress?: (s: Stats) => [number, number] };

const ship = (n: number, title: string, coins: number): Milestone => ({ id: `ship-${n}`, title, detail: `${n.toLocaleString()} runs shipped`, coins, group: "Shipping", done: (s) => s.shipped >= n, progress: (s) => [Math.min(s.shipped, n), n] });

export const MILESTONES: Milestone[] = [
  ship(10, "First steps", 50), ship(50, "Getting the hang of it", 100), ship(100, "Triple digits", 200), ship(250, "Assembly line", 400),
  ship(500, "Shipping machine", 800), ship(1000, "One thousand merges", 1500), ship(2500, "Industrial revolution", 3000),
  { id: "day-25", title: "Busy day", detail: "25 runs shipped in one day", coins: 150, group: "Shipping", done: (s) => s.today >= 25, progress: (s) => [Math.min(s.today, 25), 25] },
  { id: "day-100", title: "Unstoppable", detail: "100 runs shipped in one day", coins: 600, group: "Shipping", done: (s) => s.today >= 100, progress: (s) => [Math.min(s.today, 100), 100] },
  { id: "night", title: "Night shift", detail: "Robots worked while the office was dark", coins: 120, group: "Shipping", done: (s) => s.nightRuns },
  { id: "team-5", title: "Small team", detail: "5 robots on the team", coins: 100, group: "Team", done: (s) => s.robots >= 5, progress: (s) => [Math.min(s.robots, 5), 5] },
  { id: "team-15", title: "Growing company", detail: "15 robots on the team", coins: 400, group: "Team", done: (s) => s.robots >= 15, progress: (s) => [Math.min(s.robots, 15), 15] },
  { id: "proj-3", title: "Juggler", detail: "Work going on in 3 projects", coins: 150, group: "Team", done: (s) => s.projects >= 3, progress: (s) => [Math.min(s.projects, 3), 3] },
  { id: "proj-8", title: "Conglomerate", detail: "Work going on in 8 projects", coins: 500, group: "Team", done: (s) => s.projects >= 8, progress: (s) => [Math.min(s.projects, 8), 8] },
  { id: "spend-100", title: "Investor", detail: "$100 of AI work at API prices", coins: 100, group: "Company", done: (s) => s.spentUsd >= 100, progress: (s) => [Math.min(Math.round(s.spentUsd), 100), 100] },
  { id: "spend-1000", title: "Big spender", detail: "$1,000 of AI work at API prices", coins: 600, group: "Company", done: (s) => s.spentUsd >= 1000, progress: (s) => [Math.min(Math.round(s.spentUsd), 1000), 1000] },
  { id: "coins-10k", title: "Coin collector", detail: "Earn 10,000 coins", coins: 300, group: "Company", done: (s) => s.coinsEarned >= 10000, progress: (s) => [Math.min(s.coinsEarned, 10000), 10000] },
  { id: "shop-5", title: "Interior designer", detail: "Own 5 things from the shop", coins: 150, group: "Fun", done: (s) => s.itemsOwned >= 5, progress: (s) => [Math.min(s.itemsOwned, 5), 5] },
  { id: "hats-5", title: "Hat day", detail: "5 robots wearing hats", coins: 100, group: "Fun", done: (s) => s.hats >= 5, progress: (s) => [Math.min(s.hats, 5), 5] },
];

// What each level unlocks, for the level road.
export const LEVEL_REWARDS: Record<number, string> = {
  1: "Posters", 2: "Coffee machine, top hat, rainbow sticker", 3: "Water cooler, propeller cap, heart eyes", 4: "Bookshelf, jetpack, planet sticker",
  5: "Beanbags, wizard hat", 6: "Trophy shelf, cape", 7: "Bigger offices", 8: "Arcade cabinet, crown", 9: "Neon sign", 10: "Aquarium, ping pong table",
};

/** Newly reached milestones (not yet celebrated). */
export function check(stats: Stats, seen: Set<string>) { return MILESTONES.filter((m) => !seen.has(m.id) && m.done(stats)); }

export function celebrateMilestone(m: Milestone) {
  const el = document.createElement("div");
  el.className = "ms-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="ms-badge" aria-hidden="true">★</span><div><b></b><span></span></div><em>${coinIcon(14)} +${m.coins}</em>`;
  el.querySelector("b")!.textContent = `Milestone: ${m.title}`;
  (el.querySelector("div span") as HTMLElement).textContent = m.detail;
  document.body.appendChild(el);
  gsap.timeline({ onComplete: () => el.remove() })
    .fromTo(el, { opacity: 0, y: -16, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(2)" })
    .to(el, { opacity: 0, y: -8, duration: 0.35, delay: 4.2 });
}

export function openMilestones(stats: Stats, seen: Set<string>) {
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap";
  const groups = ["Shipping", "Team", "Company", "Fun"] as const;
  const road = Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => {
    const state = stats.level >= lv ? "done" : stats.level + 1 === lv ? "next" : "";
    return `<li class="ms-lv ${state}"><span class="ms-dot">${lv}</span><div><b>Level ${lv}</b><span>${LEVEL_REWARDS[lv] ?? ""}</span><i>${runsFor(lv).toLocaleString()} runs</i></div></li>`;
  }).join("");
  const card = (m: Milestone) => {
    const got = seen.has(m.id) || m.done(stats);
    const [a, b] = m.progress?.(stats) ?? [got ? 1 : 0, 1];
    return `<li class="ms-card ${got ? "got" : ""}"><span class="ms-badge" aria-hidden="true">${got ? "★" : "☆"}</span><div><b>${m.title}</b><span>${m.detail}</span>${!got && m.progress ? `<div class="ms-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${b}" aria-valuenow="${a}"><i style="width:${Math.round((a / b) * 100)}%"></i></div><small>${a.toLocaleString()} / ${b.toLocaleString()}</small>` : ""}</div><em>${coinIcon(12)} ${m.coins}</em></li>`;
  };
  const got = MILESTONES.filter((m) => seen.has(m.id) || m.done(stats)).length;
  wrap.innerHTML = `<div class="dialog ms" role="dialog" aria-modal="true" aria-labelledby="ms-title">
    <header class="ms-head"><div><h2 id="ms-title">Milestones</h2><p>${got} of ${MILESTONES.length} reached. Each one pays coins once.</p></div></header>
    <div class="ms-body">
      <section><h3>Level road</h3><ol class="ms-road">${road}</ol></section>
      <section class="ms-cards">${groups.map((g) => `<h3>${g}</h3><ul>${MILESTONES.filter((m) => m.group === g).map(card).join("")}</ul>`).join("")}</section>
    </div>
    <div class="dialog-actions"><button type="button" class="primary" data-a="close">Done</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="close"]')) close(); });
  gsap.fromTo(wrap.querySelector(".dialog"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
  (wrap.querySelector('[data-a="close"]') as HTMLElement).focus();
}
