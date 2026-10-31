// Der Bugger 2: Merchant of the Data Age. A renaissance trading sim for robots: haul chips,
// oil, silicon and copper between five towns of the Datenreich on a purse borrowed from
// Bank Medibit, ride out malware plagues, crashes and the Kaiser's tax daemon, and repay
// the loan by the last season or lose the wagon (and the mule-bot).
import "./games.css";
import "./bugger.css";
import {
  Scope, Session, Halt, mountFrame, addCanvas, fitCanvas, nap, think, chance, clamp, lerp, rng, reducedMotion,
  fillRR, circle, ellipse, poly, line, lin, rad, glow, withAlpha,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

// ECON START (pure economy and merchant brain, no DOM)
type Good = "chips" | "oil" | "silicon" | "copper";
type TownId = "danzip" | "koeln" | "nuern" | "augs" | "vened";
const GOODS: Good[] = ["chips", "oil", "silicon", "copper"];
const BASE: Record<Good, number> = { chips: 44, oil: 15, silicon: 22, copper: 30 };
const GOOD_NAME: Record<Good, string> = { chips: "Chips", oil: "Oil", silicon: "Silicon", copper: "Copper" };
const GUILD: Record<Good, string> = { chips: "Abacus makers", oil: "Lamplighters", silicon: "Glassblowers", copper: "Bell founders" };
interface TownDef { id: TownId; name: string; x: number; y: number; makes: Good | null; wants: Good | null }
const TOWNS: TownDef[] = [
  { id: "danzip", name: "Danzip", x: 0.7, y: 0.17, makes: "copper", wants: "silicon" },
  { id: "koeln", name: "Kölnsole", x: 0.2, y: 0.35, makes: "oil", wants: "chips" },
  { id: "nuern", name: "Nürnbug", x: 0.68, y: 0.46, makes: "chips", wants: "oil" },
  { id: "augs", name: "Augsbyte", x: 0.37, y: 0.64, makes: null, wants: null },
  { id: "vened", name: "Venedisk", x: 0.7, y: 0.86, makes: "silicon", wants: "copper" },
];
const TOWN = {} as Record<TownId, TownDef>;
for (const t of TOWNS) TOWN[t.id] = t;
const ROADS: [TownId, TownId][] = [
  ["danzip", "koeln"], ["danzip", "nuern"], ["koeln", "nuern"], ["koeln", "augs"], ["nuern", "augs"], ["augs", "vened"], ["nuern", "vened"],
];
const REF_W = 264, REF_H = 336;
const crates = (n: number) => `${n} crate${n === 1 ? "" : "s"}`;
const legLen = (a: TownId, b: TownId) => Math.hypot((TOWN[a].x - TOWN[b].x) * REF_W, (TOWN[a].y - TOWN[b].y) * REF_H);
function route(a: TownId, b: TownId): TownId[] {
  const dist = {} as Record<TownId, number>, prev = {} as Record<TownId, TownId | null>;
  const todo = new Set<TownId>(TOWNS.map((t) => t.id));
  for (const t of TOWNS) { dist[t.id] = Infinity; prev[t.id] = null; }
  dist[a] = 0;
  while (todo.size) {
    let u: TownId | null = null;
    for (const t of todo) if (u === null || dist[t] < dist[u]) u = t;
    todo.delete(u!);
    for (const [x, y] of ROADS) {
      const v = x === u ? y : y === u ? x : null;
      if (!v || !todo.has(v)) continue;
      const d = dist[u!] + legLen(u!, v);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const out: TownId[] = [b];
  while (out[0] !== a) out.unshift(prev[out[0]]!);
  return out;
}
const routeLen = (p: TownId[]) => p.slice(1).reduce((s, t, i) => s + legLen(p[i], t), 0);
const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
const seasonLabel = (s: number) => `${SEASON_NAMES[s % 4]} ${1501 + Math.floor(s / 4)}`;
const isWinter = (s: number) => s % 4 === 3;
const tollFor = (a: TownId, b: TownId, s: number) => Math.round((14 + routeLen(route(a, b)) * 0.3) * (isWinter(s) ? 1.35 : 1));

const CAP = 30, K = 0.007, SPREAD = 0.88, START = 1000, DEBT = 1900, SEASONS = 10;

interface Market { p: Record<Good, number>; tgt: Record<Good, number>; norm: Record<Good, number> }
interface World { r: () => number; season: number; m: Record<TownId, Market>; closed: Record<TownId, number>; fest: Record<TownId, number> }
const perGood = <T,>(f: (g: Good) => T): Record<Good, T> => ({ chips: f("chips"), oil: f("oil"), silicon: f("silicon"), copper: f("copper") });
const perTown = <T,>(f: (t: TownId) => T): Record<TownId, T> => ({ danzip: f("danzip"), koeln: f("koeln"), nuern: f("nuern"), augs: f("augs"), vened: f("vened") });

function makeWorld(seed: number): World {
  const r = rng(seed);
  const m = perTown((id) => {
    const t = TOWN[id];
    const norm = perGood((g) => BASE[g] * (t.makes === g ? 0.66 : t.wants === g ? 1.42 : id === "augs" ? 1.1 + r() * 0.12 : 0.9 + r() * 0.2));
    const tgt = perGood((g) => norm[g] * (0.88 + r() * 0.24));
    return { norm, tgt, p: perGood((g) => tgt[g] * (0.95 + r() * 0.1)) };
  });
  return { r, season: 0, m, closed: perTown(() => -1), fest: perTown(() => -1) };
}
const isClosed = (w: World, t: TownId) => w.season <= w.closed[t];
const sellMul = (w: World, t: TownId) => SPREAD * (w.fest[t] === w.season ? 1.3 : 1);
function tick(w: World) {
  w.season++;
  for (const t of TOWNS) {
    const mk = w.m[t.id];
    for (const g of GOODS) {
      mk.tgt[g] = lerp(mk.tgt[g], mk.norm[g], 0.3) * (1 + (w.r() - 0.5) * 0.26);
      mk.p[g] = lerp(mk.p[g], mk.tgt[g], 0.6) * (1 + (w.r() - 0.5) * 0.06);
    }
  }
}
const buyCost = (w: World, t: TownId, g: Good, q: number) => w.m[t].p[g] * q * (1 + (K * q) / 2);
const sellGain = (w: World, t: TownId, g: Good, q: number) => w.m[t].p[g] * sellMul(w, t) * q * (1 - (K * q) / 2);
function maxBuy(w: World, t: TownId, g: Good, budget: number, space: number) {
  let q = Math.min(space, Math.floor(budget / w.m[t].p[g]));
  while (q > 0 && buyCost(w, t, g, q) > budget) q--;
  return Math.max(0, q);
}

interface Me { coins: number; at: TownId; cargo: Record<Good, number>; paid: Record<Good, number>; broke: string; hist: number[] }
const makeMe = (): Me => ({ coins: START, at: "augs", cargo: perGood(() => 0), paid: perGood(() => 0), broke: "", hist: [START] });
const load = (me: Me) => GOODS.reduce((s, g) => s + me.cargo[g], 0);
function dropCargo(me: Me, g: Good, n: number) {
  n = Math.min(n, me.cargo[g]);
  if (n <= 0) return 0;
  me.paid[g] -= (me.paid[g] * n) / me.cargo[g];
  me.cargo[g] -= n;
  return n;
}
function doBuy(w: World, me: Me, g: Good, q: number) {
  const c = Math.round(buyCost(w, me.at, g, q));
  me.coins -= c; me.cargo[g] += q; me.paid[g] += c;
  w.m[me.at].p[g] *= 1 + K * q;
  return c;
}
function doSell(w: World, me: Me, g: Good, q: number) {
  const v = Math.round(sellGain(w, me.at, g, q));
  me.coins += v;
  dropCargo(me, g, q);
  w.m[me.at].p[g] *= 1 - K * q;
  return v;
}
/** Pay from the purse; if short, the collector takes crates at half their base value. */
function payOrSeize(me: Me, amount: number) {
  const paid = Math.min(me.coins, amount);
  me.coins -= paid;
  let owe = amount - paid, seized = 0;
  for (const g of GOODS) while (owe > 0 && me.cargo[g] > 0) { dropCargo(me, g, 1); owe -= BASE[g] * 0.5; seized++; }
  if (owe < 0) me.coins += Math.round(-owe);
  return { paid, seized, ok: owe <= 0 };
}
const worth = (w: World, me: Me) => Math.round(me.coins + GOODS.reduce((s, g) => s + me.cargo[g] * w.m[me.at].p[g] * SPREAD, 0));

interface Mind { skill: number; r: () => number; seen: Record<TownId, Record<Good, { p: number; s: number }>>; prior: Record<TownId, Record<Good, number>>; closed: Record<TownId, number> }
function makeMind(w: World, skill: number, seed: number): Mind {
  const r = rng(seed);
  const noise = 0.06 + 0.3 * (1 - skill);
  const prior = perTown((t) => perGood((g) => w.m[t].norm[g] * (1 + (r() - 0.5) * 2 * noise)));
  return { skill, r, prior, seen: perTown((t) => perGood((g) => ({ p: prior[t][g], s: -3 }))), closed: perTown(() => -1) };
}
function observe(mind: Mind, w: World, t: TownId) {
  for (const g of GOODS) mind.seen[t][g] = { p: w.m[t].p[g], s: w.season };
  if (isClosed(w, t)) mind.closed[t] = w.closed[t];
}
/** What the robot thinks a town pays: fresh sightings as seen, stale ones drift toward the rumour. */
function estP(mind: Mind, w: World, t: TownId, g: Good) {
  const s = mind.seen[t][g];
  const k = clamp((w.season - s.s) * 0.2 * (0.3 + mind.skill));
  return lerp(s.p, mind.prior[t][g], k);
}
function bestRun(mind: Mind, w: World, from: TownId) {
  let best = 0;
  for (const d of TOWNS) {
    if (d.id === from) continue;
    const toll = tollFor(from, d.id, w.season + 1);
    for (const g of GOODS) best = Math.max(best, (estP(mind, w, d.id, g) * SPREAD - estP(mind, w, from, g)) * 20 - toll);
  }
  return best;
}
function sellChoices(w: World, me: Me, mind: Mind, final: boolean): Good[] {
  const out: Good[] = [];
  if (isClosed(w, me.at)) return out;
  for (const g of GOODS) {
    const n = me.cargo[g];
    if (!n) continue;
    if (final) { out.push(g); continue; }
    const now = sellGain(w, me.at, g, n) / n;
    let best = 0;
    for (const d of TOWNS) {
      if (d.id === me.at || w.season + 1 <= mind.closed[d.id]) continue;
      best = Math.max(best, estP(mind, w, d.id, g) * SPREAD * (1 - (K * n) / 2) - (tollFor(me.at, d.id, w.season) / n) * 0.5);
    }
    let sell = now >= best * 0.9;
    // loss aversion: a sloppy merchant will not sell below what it paid
    if (sell && now < (me.paid[g] / n) * 0.97 && mind.r() > mind.skill + 0.15) sell = false;
    if (!sell && mind.r() < 0.15 * mind.skill) sell = true;
    if (sell) out.push(g);
  }
  return out;
}
interface Plan { dest: TownId; good: Good | null; qty: number; max: boolean; alt: TownId | null; value: number }
function planTrip(w: World, me: Me, mind: Mind, final: boolean): Plan {
  const sk = mind.skill, r = mind.r, here = me.at, open = !isClosed(w, here);
  const space = CAP - load(me);
  const reserve = final ? 0 : Math.round(lerp(0, 240, sk) * (0.8 + r() * 0.4));
  const opts: Plan[] = [];
  for (const d of TOWNS) {
    if (d.id === here || w.season + 1 <= mind.closed[d.id]) continue;
    const toll = tollFor(here, d.id, w.season);
    let held = 0;
    for (const g of GOODS) if (me.cargo[g]) held += estP(mind, w, d.id, g) * SPREAD * me.cargo[g] * (1 - (K * me.cargo[g]) / 2);
    let bestG: Good | null = null, bestQ = 0, bestP = 0, bestMax = false;
    if (open && space > 0) for (const g of GOODS) {
      const unit = w.m[here].p[g], sellU = estP(mind, w, d.id, g) * SPREAD;
      if (sellU <= unit * 1.02) continue;
      const qmax = maxBuy(w, here, g, me.coins - reserve - toll, space);
      if (qmax <= 0) continue;
      let q = qmax;
      if (sk > 0.45) q = Math.min(qmax, Math.max(1, Math.round((sellU - unit) / (K * (sellU + unit)))));
      // the market sells in lots of ten, or everything the purse and wagon allow
      const full = maxBuy(w, here, g, me.coins, space);
      let isMax = false;
      if (q >= full - 1) { q = full; isMax = true; }
      else {
        q = Math.max(10, Math.round(q / 10) * 10);
        while (q > 0 && buyCost(w, here, g, q) > me.coins - toll) q -= 10;
        if (q >= full) { q = full; isMax = true; }
      }
      if (q <= 0) continue;
      const prof = sellU * q * (1 - (K * q) / 2) - buyCost(w, here, g, q);
      if (prof > bestP) { bestP = prof; bestG = g; bestQ = q; bestMax = isMax; }
    }
    const onward = !final && sk > 0.4 ? 0.3 * sk * bestRun(mind, w, d.id) : 0;
    opts.push({ dest: d.id, good: bestG, qty: bestQ, max: bestMax, alt: null, value: bestP + held - toll + onward + (r() - 0.5) * 20 });
  }
  if (!opts.length) {
    const d = TOWNS.filter((t) => t.id !== here).sort((a, b) => tollFor(here, a.id, w.season) - tollFor(here, b.id, w.season))[0].id;
    return { dest: d, good: null, qty: 0, max: false, alt: null, value: 0 };
  }
  opts.sort((a, b) => b.value - a.value);
  const i = opts.length > 1 && r() < 0.06 + 0.26 * (1 - sk) ? 1 : 0;
  const p = opts[i];
  p.alt = opts[i === 0 ? 1 : 0]?.dest ?? null;
  return p;
}
const cheapestToll = (w: World, from: TownId) => Math.min(...TOWNS.filter((t) => t.id !== from).map((t) => tollFor(from, t.id, w.season)));

type EvKind = "tax" | "malware" | "crash" | "pirates" | "guild" | "festival" | "windfall";
interface Ev { kind: EvKind; title: string; text: string; good: boolean; hit: boolean }
const EV_W: [EvKind, number][] = [["tax", 18], ["malware", 17], ["crash", 14], ["pirates", 14], ["guild", 16], ["festival", 12], ["windfall", 9]];
function rollEvent(w: World, me: Me, mind: Mind, dest: TownId): Ev | null {
  const r = w.r;
  if (w.season < 1 || r() > 0.6) return null;
  let roll = r() * EV_W.reduce((s, e) => s + e[1], 0);
  let kind: EvKind = "tax";
  for (const [k, wt] of EV_W) { roll -= wt; if (roll <= 0) { kind = k; break; } }
  const learn = () => mind.r() < 0.45 + 0.55 * mind.skill;
  const anyTown = () => TOWNS[Math.floor(r() * TOWNS.length)];
  if (kind === "tax") {
    const levy = 90 + w.season * 20;
    const res = payOrSeize(me, levy);
    if (!res.ok) me.broke = "The tax daemon took the last crate and the purse";
    return {
      kind, good: false, hit: true, title: "The Kaiser's tax daemon",
      text: res.seized ? `Wants ${levy} Bitgulden. You were short, so it took ${crates(res.seized)}.` : `Collects ${levy} Bitgulden. It even prints a receipt.`,
    };
  }
  if (kind === "malware") {
    const t = r() < 0.4 ? TOWN[dest] : anyTown();
    w.closed[t.id] = w.season + 1;
    if (learn()) mind.closed[t.id] = w.closed[t.id];
    const lost = me.cargo.chips > 0 ? dropCargo(me, "chips", Math.ceil(me.cargo.chips * (0.3 + r() * 0.35))) : 0;
    return { kind, good: false, hit: t.id === dest || lost > 0, title: `Malware plague in ${t.name}`, text: `The gates stay sealed for two seasons.${lost ? ` ${lost} of your chips are bricked.` : ""}` };
  }
  if (kind === "crash") {
    const g = GOODS[Math.floor(r() * GOODS.length)];
    for (const t of TOWNS) { w.m[t.id].p[g] *= 0.55; w.m[t.id].tgt[g] *= 0.72; }
    if (learn()) for (const t of TOWNS) { mind.seen[t.id][g].p *= 0.55; }
    return { kind, good: false, hit: me.cargo[g] > 0, title: `${GOOD_NAME[g]} market crash`, text: `${GOOD_NAME[g]} prices halve across the Datenreich.` };
  }
  if (kind === "pirates") {
    if (!load(me)) return { kind, good: true, hit: false, title: "Packet pirates", text: "They find an empty wagon and leave a rude readme." };
    let lost = 0;
    for (const g of GOODS) lost += dropCargo(me, g, Math.floor(me.cargo[g] * (0.2 + r() * 0.15)));
    return { kind, good: false, hit: lost > 0, title: "Packet pirates on the road", text: lost ? `They make off with ${crates(lost)}.` : "They wave a cutlass and take nothing." };
  }
  if (kind === "guild") {
    const ts = TOWNS.filter((t) => t.wants);
    const t = ts[Math.floor(r() * ts.length)];
    const g = t.wants!;
    w.m[t.id].p[g] *= 1.55; w.m[t.id].tgt[g] *= 1.4;
    if (learn()) mind.seen[t.id][g] = { p: w.m[t.id].p[g], s: w.season };
    return { kind, good: true, hit: me.cargo[g] > 0, title: `Guild contract in ${t.name}`, text: `The ${GUILD[g]} pay a fat premium for ${g}.` };
  }
  if (kind === "festival") {
    const t = anyTown();
    w.fest[t.id] = w.season;
    return { kind, good: true, hit: t.id === dest, title: `Festival in ${t.name}`, text: "Every stall pays a third more this season." };
  }
  const g: Good = r() < 0.5 ? "copper" : "oil";
  const n = Math.min(CAP - load(me), 4 + Math.floor(r() * 5));
  if (n <= 0) return { kind, good: true, hit: false, title: "A crate by the roadside", text: "Sadly the wagon is already full." };
  me.cargo[g] += n;
  return { kind, good: true, hit: true, title: "A crate by the roadside", text: `Your mule-bot finds ${crates(n)} of ${g}. Finders keepers.` };
}
// ECON END

// ---- map art -------------------------------------------------------------------------------

const INK = "#4a2b16", PAPER = "#efdcb4";
const GOOD_COL: Record<Good, string> = { chips: "#6fc0a4", oil: "#d0a24a", silicon: "#cfd8df", copper: "#d97c4c" };
const GOOD_SVG: Record<Good, string> = {
  chips: `<svg viewBox="0 0 14 14"><rect x="1" y="4" width="12" height="1.4" rx=".7" fill="#4f9a82"/><rect x="1" y="8.6" width="12" height="1.4" rx=".7" fill="#4f9a82"/><rect x="3" y="2.5" width="8" height="9" rx="1.6" fill="#6fc0a4"/><rect x="5.2" y="5" width="3.6" height="4" rx=".6" fill="#24453b"/></svg>`,
  oil: `<svg viewBox="0 0 14 14"><rect x="3" y="1.5" width="8" height="11" rx="2" fill="#d0a24a"/><rect x="3" y="4.4" width="8" height="1.3" fill="#8e6a26"/><rect x="3" y="8.4" width="8" height="1.3" fill="#8e6a26"/></svg>`,
  silicon: `<svg viewBox="0 0 14 14"><path d="M7 1.5 L12.5 7 L7 12.5 L1.5 7 Z" fill="#cfd8df"/><path d="M7 1.5 L12.5 7 L7 7 Z" fill="#9fb0bd"/><path d="M1.5 7 L7 12.5 L7 7 Z" fill="#e9eef2"/></svg>`,
  copper: `<svg viewBox="0 0 14 14"><path d="M1.5 10.5 L3.5 5 L10.5 5 L12.5 10.5 Z" fill="#b8613a"/><path d="M3.5 5 L4.6 3 L9.4 3 L10.5 5 Z" fill="#e89a6e"/></svg>`,
};

type Pt = [number, number];
function smooth(c: Ctx, pts: Pt[]) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const z = pts[pts.length - 1];
  c.lineTo(z[0], z[1]);
}
function mountain(c: Ctx, x: number, y: number, s: number) {
  poly(c, [[x - 11 * s, y], [x, y - 14 * s], [x + 11 * s, y]], "#cdb07e");
  poly(c, [[x, y - 14 * s], [x + 11 * s, y], [x + 2 * s, y]], "#a98757");
  poly(c, [[x - 3.8 * s, y - 9.2 * s], [x, y - 14 * s], [x + 3.4 * s, y - 9.6 * s], [x + 1.2 * s, y - 10.4 * s], [x - 1.2 * s, y - 8.8 * s]], "#f6eedb");
  for (let k = 0; k < 3; k++) line(c, [[x + (3 + k * 2.4) * s, y - (8.5 - k * 2.2) * s], [x + (4.6 + k * 2.4) * s, y - 1.5 * s]], 0.6, withAlpha("#6e4c2a", 0.45));
}
function tree(c: Ctx, x: number, y: number, s: number, round: boolean) {
  if (round) {
    line(c, [[x, y], [x, y - 4 * s]], 1.1 * s, "#7a5530");
    circle(c, x, y - 6.5 * s, 4.2 * s, "#8b9459");
    circle(c, x + 1.4 * s, y - 5.6 * s, 2.6 * s, "#6f7a44");
  } else {
    poly(c, [[x - 4 * s, y], [x, y - 11 * s], [x + 4 * s, y]], "#7b8a4e");
    poly(c, [[x, y - 11 * s], [x + 4 * s, y], [x, y]], "#5e6c3b");
  }
}
function drawTownGlyph(c: Ctx, t: TownDef, x: number, y: number) {
  ellipse(c, x, y + 8.5, 19, 4, "rgba(96,60,26,0.18)");
  fillRR(c, x - 13, y - 2, 26, 10, 1.5, "#efdcb2");
  for (let i = 0; i < 6; i++) fillRR(c, x - 12.6 + i * 4.6, y - 4.4, 2.6, 3, 0.4, "#efdcb2");
  fillRR(c, x - 13, y + 5, 26, 3, 1, "#d8bf8e");
  c.beginPath(); c.roundRect(x - 2.6, y + 1.5, 5.2, 6.5, [2.6, 2.6, 0, 0]); c.fillStyle = "#5a3a22"; c.fill();
  for (const sx of [-15, 9]) {
    fillRR(c, x + sx, y - 8, 6, 16, 1, "#e5cd9e");
    poly(c, [[x + sx - 1.4, y - 8], [x + sx + 3, y - 15.5], [x + sx + 7.4, y - 8]], "#b0482e");
    fillRR(c, x + sx + 2.1, y - 4.5, 1.8, 3, 0.8, "#5a3a22");
  }
  fillRR(c, x - 3.2, y - 12, 6.4, 10, 1, "#ead5a8");
  poly(c, [[x - 4.2, y - 12], [x, y - 22], [x + 4.2, y - 12]], "#9c3c26");
  circle(c, x, y - 8, 1.3, "#5a3a22");
  line(c, [[x, y - 22], [x, y - 26]], 0.9, "#5a3a22");
  if (t.id === "augs") {
    // the bank town flies a gold pennant
    poly(c, [[x + 0.4, y - 26], [x + 7, y - 24.6], [x + 0.4, y - 23]], "#d8a83c");
  }
  c.font = `600 10px "Lexend Variable", system-ui, sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.lineJoin = "round"; c.lineWidth = 3.2; c.strokeStyle = "rgba(240,224,188,0.92)";
  c.strokeText(t.name, x, y + 18.5);
  c.fillStyle = INK;
  c.fillText(t.name, x, y + 18.5);
}
function compass(c: Ctx, x: number, y: number, R: number) {
  circle(c, x, y, R * 0.62, withAlpha("#7a5530", 0.12));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2, len = i % 2 ? R * 0.58 : R, wv = R * 0.2;
    const tip: Pt = [x + Math.cos(a) * len, y + Math.sin(a) * len];
    const l: Pt = [x + Math.cos(a - Math.PI / 2) * wv, y + Math.sin(a - Math.PI / 2) * wv];
    const rr: Pt = [x + Math.cos(a + Math.PI / 2) * wv, y + Math.sin(a + Math.PI / 2) * wv];
    poly(c, [[x, y], l, tip], i === 0 ? "#a8432c" : i % 2 ? "#b48a58" : "#5b3a20");
    poly(c, [[x, y], tip, rr], i === 0 ? "#cf6a4c" : i % 2 ? "#d6b07c" : "#8a6238");
  }
  circle(c, x, y, 1.8, PAPER);
  c.font = `700 9px "Lexend Variable", system-ui, sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#5b3a20";
  c.fillText("N", x, y - R - 6);
}

/** Road geometry: gently curved, sampled so the wagon can follow it. */
function roadPts(a: TownId, b: TownId, w: number, h: number): Pt[] {
  const i = ROADS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const [p, q] = ROADS[i][0] === a ? [TOWN[a], TOWN[b]] : [TOWN[b], TOWN[a]];
  const ax = p.x * w, ay = p.y * h, bx = q.x * w, by = q.y * h;
  const bend = [0.16, -0.12, 0.1, -0.14, 0.12, -0.1, 0.14][i];
  const len = Math.hypot(bx - ax, by - ay);
  const cx = (ax + bx) / 2 + (-(by - ay) / len) * len * bend, cy = (ay + by) / 2 + ((bx - ax) / len) * len * bend;
  const out: Pt[] = [];
  for (let k = 0; k <= 18; k++) {
    const u = k / 18;
    out.push([(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy + u * u * by]);
  }
  return ROADS[i][0] === a ? out : out.reverse();
}

function drawParchment(c: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed);
  const X = (v: number) => v * w, Y = (v: number) => v * h;
  c.fillStyle = lin(c, 0, 0, w, h, [[0, "#f2e0b8"], [0.55, "#ead4a5"], [1, "#dec392"]]);
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) ellipse(c, r() * w, r() * h, 8 + r() * 34, 5 + r() * 20, withAlpha("#a87b45", 0.02 + r() * 0.035));
  for (let i = 0; i < 80; i++) { const x = r() * w, y = r() * h; line(c, [[x, y], [x + 5 + r() * 12, y + (r() - 0.5) * 3]], 0.6, withAlpha("#8a6235", 0.07)); }

  // the northern sea, Danzip sits on its shore
  const north: Pt[] = [];
  for (let i = 0; i <= 14; i++) { const k = i / 14; north.push([X(0.34 + k * 0.68), Y(0.015 + Math.sin(k * Math.PI) * 0.04 + k * 0.1 + (r() - 0.5) * 0.012)]); }
  const south: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const k = i / 12; south.push([X(0.52 + k * 0.5), Y(1.02 - Math.pow(k, 0.75) * 0.24 + Math.sin(k * 9) * 0.008)]); }
  const sea = "#b3c4b2";
  for (const [coast, closeTo] of [[north, [[w + 2, -2], [X(0.34), -2]]], [south, [[w + 2, h + 2], [X(0.52), h + 2]]]] as [Pt[], Pt[]][]) {
    poly(c, [...coast, ...closeTo], sea);
    const dir = coast === north ? -1 : 1;
    for (let k = 3; k >= 1; k--) {
      smooth(c, coast.map(([x, y]) => [x, y + dir * k * 3.4] as Pt));
      c.lineWidth = 0.8; c.strokeStyle = withAlpha("#5f7f80", 0.12 * (4 - k)); c.stroke();
    }
    smooth(c, coast); c.lineWidth = 1.3; c.strokeStyle = "#6b8a86"; c.stroke();
  }
  const wave = (x: number, y: number) => {
    c.beginPath(); c.arc(x - 3, y, 3, Math.PI * 1.1, Math.PI * 1.9); c.arc(x + 3, y, 3, Math.PI * 1.1, Math.PI * 1.9);
    c.lineWidth = 0.8; c.strokeStyle = withAlpha("#557575", 0.55); c.stroke();
  };
  wave(X(0.52), Y(0.04)); wave(X(0.86), Y(0.06)); wave(X(0.72), Y(0.03));
  wave(X(0.9), Y(0.9)); wave(X(0.82), Y(0.96)); wave(X(0.97), Y(0.84));

  // rivers
  const river = (pts: Pt[]) => {
    smooth(c, pts.map(([x, y]) => [X(x), Y(y)] as Pt));
    c.lineCap = "round"; c.lineJoin = "round";
    c.lineWidth = 2.6; c.strokeStyle = "#7f9ea2"; c.stroke();
    c.lineWidth = 0.9; c.strokeStyle = "#b9cdc8"; c.stroke();
  };
  river([[0.3, 0.78], [0.26, 0.62], [0.12, 0.5], [0.13, 0.36], [0.08, 0.2], [0.05, -0.02]]);
  river([[-0.02, 0.57], [0.18, 0.56], [0.32, 0.55], [0.5, 0.58], [0.62, 0.55], [0.82, 0.6], [1.02, 0.57]]);

  // the Alps between Augsbyte and Venedisk, and some eastern hills
  const peaks: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) peaks.push([0.04 + i * 0.05 + (r() - 0.5) * 0.02, 0.8 + (i % 2) * 0.035 + (r() - 0.5) * 0.02, 0.8 + r() * 0.45]);
  for (let i = 0; i < 4; i++) peaks.push([0.84 + i * 0.045, 0.7 + (i % 2) * 0.03, 0.6 + r() * 0.3]);
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of peaks) mountain(c, X(x), Y(y), s);

  // woods, kept off towns and seas
  for (let i = 0; i < 70; i++) {
    const x = r(), y = 0.12 + r() * 0.62;
    if (y < 0.16 + x * 0.06 && x > 0.34) continue;
    if (TOWNS.some((t) => Math.hypot((t.x - x) * w, (t.y - y) * h) < 30)) continue;
    const cl = 1 + Math.floor(r() * 3), round = r() < 0.35;
    for (let k = 0; k < cl; k++) tree(c, X(x) + k * 4.5, Y(y) + (k % 2) * 2.5, 0.75 + r() * 0.3, round);
  }

  // roads
  c.setLineDash([4, 3]); c.lineCap = "round";
  for (const [a, b] of ROADS) {
    const pts = roadPts(a, b, w, h);
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineWidth = 1.8; c.strokeStyle = withAlpha("#8b5a32", 0.85); c.stroke();
  }
  c.setLineDash([]);
  compass(c, X(0.13), Y(0.94), 13);
  for (const t of TOWNS) drawTownGlyph(c, t, X(t.x), Y(t.y));
  // age the edges
  c.fillStyle = rad(c, w / 2, h / 2, Math.max(w, h) * 0.75, [[0.55, "rgba(120,72,30,0)"], [1, "rgba(120,72,30,0.32)"]]);
  c.fillRect(0, 0, w, h);
}

function drawWagon(c: Ctx, x: number, y: number, face: number, t: number, moving: boolean, cover: string) {
  c.save();
  c.translate(x, y);
  c.scale(face * 1.15, 1.15);
  const bob = moving ? Math.sin(t * 16) * 0.7 : 0;
  ellipse(c, 1, 6.5, 18, 2.8, "rgba(70,40,15,0.22)");
  line(c, [[-1, 0], [7, -1 + bob]], 1.2, "#5a3a20");
  for (let i = 0; i < 4; i++) {
    const lx = 7 + i * 2.6, ph = moving ? Math.sin(t * 16 + i * 1.7) * 1.6 : 0;
    line(c, [[lx, -1 + bob], [lx + ph, 5.6]], 1.3, "#5d6678");
  }
  fillRR(c, 6, -7 + bob, 11, 6.5, 2.2, "#9aa3b5");
  fillRR(c, 14, -12 + bob, 6.5, 5.5, 1.6, "#b6becd");
  glow(c, 18, -9.4 + bob, 4, "#ffcf5a", 0.5);
  circle(c, 18, -9.4 + bob, 1.1, "#ffcf5a");
  line(c, [[16, -12 + bob], [16.8, -15.4 + bob]], 0.8, "#5d6678");
  circle(c, 16.8, -15.8 + bob, 1, "#e8734a");
  fillRR(c, -16, -3, 15.5, 5, 1.5, "#7a4a28");
  c.beginPath(); c.moveTo(-15, -3); c.quadraticCurveTo(-8.2, -15.5, -1.4, -3); c.closePath(); c.fillStyle = "#f1e6cc"; c.fill();
  fillRR(c, -12.6, -8.2, 8.8, 2.4, 1.2, cover);
  for (const wx of [-12.5, -4]) {
    circle(c, wx, 3.2, 3.5, "#4a2e1a");
    const a = moving ? t * 9 : 0;
    line(c, [[wx - Math.cos(a) * 2.6, 3.2 - Math.sin(a) * 2.6], [wx + Math.cos(a) * 2.6, 3.2 + Math.sin(a) * 2.6]], 0.7, "#c9a46a");
    circle(c, wx, 3.2, 1, "#c9a46a");
  }
  c.restore();
}

function drawEvIcon(c: Ctx, kind: EvKind) {
  const red = "#a8432c", ink = "#4a2b16";
  if (kind === "tax") {
    for (let i = 0; i < 4; i++) { ellipse(c, 18, 27 - i * 5, 10, 4, "#a8802c"); ellipse(c, 18, 25.5 - i * 5, 10, 4, "#dcae48"); }
    ellipse(c, 18, 10.5, 5, 1.8, "#a8802c");
  } else if (kind === "malware") {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(c, [[18 + s * 5, 15 + i * 5], [18 + s * 12, 12 + i * 7]], 1.6, ink);
    line(c, [[16, 9], [12, 3]], 1.3, ink); line(c, [[20, 9], [24, 3]], 1.3, ink);
    ellipse(c, 18, 21, 7.5, 10, red);
    circle(c, 18, 10.5, 5, "#7e2e1d");
    circle(c, 16, 10, 1.3, PAPER); circle(c, 20, 10, 1.3, PAPER);
    line(c, [[18, 13], [18, 30]], 1, "#7e2e1d");
  } else if (kind === "crash") {
    line(c, [[4, 9], [12, 14], [17, 11], [26, 26]], 3, red);
    poly(c, [[30, 30], [21, 28], [28, 21]], red);
    line(c, [[4, 31], [32, 31]], 1.2, withAlpha(ink, 0.5));
  } else if (kind === "pirates") {
    line(c, [[9, 4], [9, 33]], 2, ink);
    c.beginPath(); c.moveTo(10, 5); c.quadraticCurveTo(20, 2, 31, 7); c.lineTo(31, 21); c.quadraticCurveTo(20, 17, 10, 20); c.closePath(); c.fillStyle = "#2f2219"; c.fill();
    fillRR(c, 15, 8, 11, 8, 2.5, PAPER);
    circle(c, 18.3, 11.5, 1.4, "#2f2219"); circle(c, 22.7, 11.5, 1.4, "#2f2219");
  } else if (kind === "guild") {
    circle(c, 18, 18, 10, "#8a6238");
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; fillRR(c, 18 + Math.cos(a) * 11 - 2.5, 18 + Math.sin(a) * 11 - 2.5, 5, 5, 1, "#8a6238"); }
    circle(c, 18, 18, 4.5, "#efdcb2");
  } else if (kind === "festival") {
    c.beginPath(); c.moveTo(2, 8); c.quadraticCurveTo(18, 18, 34, 8); c.lineWidth = 1; c.strokeStyle = ink; c.stroke();
    const cols = ["#a8432c", "#d8a83c", "#5f8a6a", "#a8432c", "#d8a83c"];
    for (let i = 0; i < 5; i++) { const x = 5 + i * 6.5, y = 9 + Math.sin((i / 4) * Math.PI) * 4.5; poly(c, [[x, y], [x + 5, y], [x + 2.5, y + 8]], cols[i]); }
    for (let i = 0; i < 3; i++) circle(c, 9 + i * 9, 28, 2.4, cols[i + 1]);
  } else {
    fillRR(c, 7, 9, 22, 20, 2, "#9a6a3a");
    line(c, [[8, 10], [28, 28]], 2, "#6e4624"); line(c, [[28, 10], [8, 28]], 2, "#6e4624");
    fillRR(c, 7, 9, 22, 3, 1, "#b8844e");
  }
}

function drawSeal(c: Ctx, win: boolean) {
  const base = win ? "#c4952f" : "#a8432c", dark = win ? "#8e6a1e" : "#7a2c1c";
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; circle(c, 24 + Math.cos(a) * 17, 24 + Math.sin(a) * 17, 4.5, base); }
  circle(c, 24, 24, 18, base);
  circle(c, 24, 24, 13, dark);
  circle(c, 24, 24, 11.5, base);
  // a little tower in the wax
  fillRR(c, 19, 22, 10, 8, 1, dark);
  poly(c, [[18, 22], [24, 14], [30, 22]], dark);
  if (!win) line(c, [[10, 9], [22, 22], [19, 27], [34, 40]], 2.2, "#f4e4bf");
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---- the game ------------------------------------------------------------------------------

export async function playDerBugger(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const f = mountFrame(body, scope, "Der Bugger 2: Merchant of the Data Age", "db");
    const S = new Session(host, opts, { base: 0.32, step: 0.15, calm: 0.1 });
    const calm = reducedMotion();
    const W = f.w, H = f.h, SIDE = 176, MW = W - SIDE;
    const { ctx } = addCanvas(f.stage, MW, H, "gm-db-map");
    const bg = document.createElement("canvas");
    const bctx = fitCanvas(bg, MW, H);
    const tx = (t: TownId) => TOWN[t].x * MW, ty = (t: TownId) => TOWN[t].y * H;

    f.stage.insertAdjacentHTML("beforeend", `
      ${TOWNS.map((t) => `<i class="gm-db-spot" data-t="${t.id}" style="left:${Math.round(tx(t.id) - 16)}px;top:${Math.round(ty(t.id) - 18)}px"></i>`).join("")}
      <div class="gm-db-side" style="width:${SIDE}px">
        <div class="gm-db-town"><b></b><span></span></div>
        <div class="gm-db-table">
          <div class="gm-db-th"><span></span><span>Ware</span><span>Buy</span><span>Sell</span><span>Hold</span></div>
          ${GOODS.map((g) => `<div class="gm-db-row" data-g="${g}"><i class="gm-db-ico">${GOOD_SVG[g]}</i><span>${GOOD_NAME[g]}</span><b class="gm-db-buy"></b><b class="gm-db-sell"></b><em></em></div>`).join("")}
        </div>
        <div class="gm-db-acts">
          <div class="gm-db-btn" data-a="buy10">Buy 10</div><div class="gm-db-btn" data-a="buymax">Buy max</div>
          <div class="gm-db-btn" data-a="sell10">Sell 10</div><div class="gm-db-btn" data-a="sellall">Sell all</div>
        </div>
        <div class="gm-db-hold"><span>Wagon</span><i class="gm-db-bar">${GOODS.map((g) => `<u data-g="${g}" style="background:${GOOD_COL[g]}"></u>`).join("")}</i><b></b></div>
        <div class="gm-db-ledger">
          <div class="gm-db-coins"><b></b><span>Bitgulden</span></div>
          <div class="gm-db-debt"></div>
          <canvas class="gm-db-spark"></canvas>
          <div class="gm-db-entry"></div>
          <div class="gm-db-entry"></div>
        </div>
      </div>
      <div class="gm-db-ev" style="left:${Math.round(MW / 2 - 119)}px;top:${Math.round(H * 0.36)}px"><canvas></canvas><div><b></b><span></span></div></div>
      <div class="gm-db-sheet"><div class="gm-db-paper"></div></div>`);
    const q = <T extends Element = HTMLElement>(s: string) => f.stage.querySelector(s) as T;
    const spots = perTown((t) => q(`.gm-db-spot[data-t="${t}"]`));
    const townB = q(".gm-db-town b"), townS = q(".gm-db-town span"), townEl = q(".gm-db-town");
    const rows = perGood((g) => q(`.gm-db-row[data-g="${g}"]`));
    const btn = (a: string) => q(`.gm-db-btn[data-a="${a}"]`);
    const holdB = q(".gm-db-hold b");
    const holdU = perGood((g) => q(`.gm-db-bar u[data-g="${g}"]`));
    const coinsB = q(".gm-db-coins b"), debtEl = q(".gm-db-debt");
    const entries = [...f.stage.querySelectorAll(".gm-db-entry")] as HTMLElement[];
    const sparkC = q<HTMLCanvasElement>(".gm-db-spark");
    const SPW = SIDE - 32, SPH = 24;
    const spark = fitCanvas(sparkC, SPW, SPH);
    const evEl = q(".gm-db-ev"), evB = q(".gm-db-ev b"), evS = q(".gm-db-ev span");
    const evC = fitCanvas(q<HTMLCanvasElement>(".gm-db-ev canvas"), 36, 36);
    const sheet = q(".gm-db-sheet"), paper = q(".gm-db-paper");

    // Lexend should be in before the map labels are baked into the parchment
    try {
      await Promise.race([document.fonts.load(`600 10px "Lexend Variable"`), new Promise<void>((r) => { const id = window.setTimeout(r, 600); scope.add(() => window.clearTimeout(id)); })]);
    } catch { /* bake with the fallback face */ }
    if (host.stopped) throw new Halt();
    drawParchment(bctx, MW, H, 1501);

    // ---- live state shared by the drawing loop ----
    let w = makeWorld(1), me = makeMe();
    let hover: TownId | null = null, pick: TownId | null = null;
    let preview: Pt[] | null = null;
    const wagon = { x: 0, y: 0, face: 1, pts: null as Pt[] | null, cum: [] as number[], t0: 0, dur: 1, moving: false };
    const dust: { x: number; y: number; a: number; r: number }[] = [];
    const park = (t: TownId) => { wagon.x = tx(t) + 34; wagon.y = ty(t) + 3; wagon.face = 1; wagon.pts = null; wagon.moving = false; };
    const coverColor = () => {
      let best: Good | null = null;
      for (const g of GOODS) if (me.cargo[g] && (!best || me.cargo[g] > me.cargo[best])) best = g;
      return best ? GOOD_COL[best] : "#d9c9a6";
    };
    const tint = ["rgba(150,190,90,0.05)", "rgba(255,210,120,0.04)", "rgba(200,110,40,0.07)", "rgba(235,242,255,0.2)"];

    scope.raf((t, dt) => {
      ctx.drawImage(bg, 0, 0, MW, H);
      ctx.fillStyle = tint[w.season % 4];
      ctx.fillRect(0, 0, MW, H);
      if (preview) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = calm ? 0 : -t * 22;
        ctx.beginPath(); preview.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineCap = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "#a8432c"; ctx.stroke();
        ctx.restore();
      }
      for (const town of TOWNS) {
        const x = tx(town.id), y = ty(town.id);
        if (town.id === hover || town.id === pick) {
          // a cartographer's ring around the town under consideration
          ctx.beginPath(); ctx.arc(x, y - 4, 23, 0, Math.PI * 2);
          ctx.lineWidth = town.id === pick ? 2.2 : 1.6;
          ctx.strokeStyle = town.id === pick ? "#a8432c" : withAlpha("#5a3a22", 0.6);
          ctx.stroke();
        }
        // the spire antenna blinks
        const on = calm || Math.sin(t * 3 + town.x * 9) > -0.2;
        circle(ctx, x, y - 26.6, 1.5, on ? "#e8734a" : "#7a4a28");
        if (isClosed(w, town.id)) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(x, y - 3, 21, 0, Math.PI * 2);
          ctx.lineWidth = 1.6; ctx.strokeStyle = withAlpha("#a8432c", 0.85); ctx.stroke();
          ctx.restore();
          const bx = x + 15, by = y - 18, wig = calm ? 0 : Math.sin(t * 9) * 0.8;
          for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(ctx, [[bx + s * 2.5, by - 2 + i * 2.6], [bx + s * (5.8 + (i === 1 ? wig : 0)), by - 3.5 + i * 3.4]], 1, "#7e2e1d");
          ellipse(ctx, bx, by, 3.4, 4.6, "#a8432c");
          circle(ctx, bx, by - 4.8, 2.3, "#7e2e1d");
        }
        if (w.fest[town.id] === w.season) {
          for (let i = 0; i < 5; i++) {
            const fx = x - 14 + i * 7, fy = y - 31 + Math.sin((i / 4) * Math.PI) * 3 + (calm ? 0 : Math.sin(t * 4 + i) * 0.6);
            poly(ctx, [[fx, fy], [fx + 5, fy], [fx + 2.5, fy + 5.5]], ["#a8432c", "#d8a83c", "#5f8a6a"][i % 3]);
          }
        }
      }
      // wagon
      if (wagon.pts) {
        const k = clamp((performance.now() / 1000 - wagon.t0) / wagon.dur);
        const e = 0.5 - Math.cos(k * Math.PI) / 2;
        const total = wagon.cum[wagon.cum.length - 1], at = e * total;
        let i = 1;
        while (i < wagon.cum.length - 1 && wagon.cum[i] < at) i++;
        const a = wagon.pts[i - 1], b = wagon.pts[i];
        const u = clamp((at - wagon.cum[i - 1]) / Math.max(0.001, wagon.cum[i] - wagon.cum[i - 1]));
        wagon.x = lerp(a[0], b[0], u); wagon.y = lerp(a[1], b[1], u) + 2;
        if (Math.abs(b[0] - a[0]) > 0.3) wagon.face = b[0] > a[0] ? 1 : -1;
        wagon.moving = k < 1;
        if (!calm && wagon.moving && Math.random() < dt * 14) dust.push({ x: wagon.x - wagon.face * 18, y: wagon.y + 5, a: 1, r: 1.5 + Math.random() * 1.5 });
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.a -= dt * 1.6; d.r += dt * 5; d.y -= dt * 3;
        if (d.a <= 0) { dust.splice(i, 1); continue; }
        circle(ctx, d.x, d.y, d.r, withAlpha("#b8935e", 0.35 * d.a));
      }
      drawWagon(ctx, wagon.x, wagon.y, wagon.face, t, wagon.moving, coverColor());
    });

    // ---- panel rendering ----
    const prev = new Map<HTMLElement, string>();
    const setNum = (el: HTMLElement, s: string, flash = true) => {
      const was = prev.get(el);
      if (was === s) return;
      prev.set(el, s);
      el.textContent = s;
      if (flash && was !== undefined && !calm) scope.fromTo(el, { color: "#e9bd5c" }, { color: "", duration: 0.8, ease: "sine.out", clearProps: "color" });
    };
    const renderTown = () => {
      const t = TOWN[me.at];
      townB.textContent = t.name;
      const closed = isClosed(w, me.at);
      townEl.classList.toggle("gm-closed", closed);
      townS.textContent = closed ? "Gates sealed: malware plague" : t.makes ? `Makes ${t.makes}, wants ${t.wants}` : "Bank town, pays well for all";
    };
    const renderTable = () => {
      const closed = isClosed(w, me.at);
      for (const g of GOODS) {
        const row = rows[g];
        setNum(row.querySelector(".gm-db-buy") as HTMLElement, closed ? "-" : String(Math.round(w.m[me.at].p[g])));
        setNum(row.querySelector(".gm-db-sell") as HTMLElement, closed ? "-" : String(Math.round(w.m[me.at].p[g] * sellMul(w, me.at))));
        setNum(row.querySelector("em") as HTMLElement, String(me.cargo[g]), false);
      }
      const n = load(me);
      holdB.textContent = `${n}/${CAP}`;
      for (const g of GOODS) holdU[g].style.width = `${(me.cargo[g] / CAP) * 100}%`;
    };
    const coinShow = { v: START };
    const renderCoins = () => {
      scope.to(coinShow, { v: me.coins, duration: calm ? 0.01 : 0.6, ease: "power2.out", onUpdate: () => { coinsB.textContent = fmt(coinShow.v); } });
      coinsB.classList.toggle("gm-low", me.coins < 150);
    };
    const renderSpark = () => {
      const sw = SPW, sh = SPH, hist = me.hist;
      spark.clearRect(0, 0, sw, sh);
      const top = Math.max(DEBT * 1.25, ...hist);
      const X = (i: number) => 2 + (i / SEASONS) * (sw - 4), Y = (v: number) => sh - 3 - (clamp(v / top) * (sh - 6));
      fillRR(spark, 0, 0, sw, sh, 4, "#2a1c13");
      spark.save(); spark.setLineDash([3, 3]);
      line(spark, [[2, Y(DEBT)], [sw - 2, Y(DEBT)]], 1, withAlpha("#ef8a6a", 0.75));
      spark.restore();
      if (hist.length > 1) {
        spark.beginPath(); hist.forEach((v, i) => (i ? spark.lineTo(X(i), Y(v)) : spark.moveTo(X(i), Y(v))));
        spark.lineTo(X(hist.length - 1), sh - 2); spark.lineTo(X(0), sh - 2); spark.closePath();
        spark.fillStyle = withAlpha("#e9bd5c", 0.16); spark.fill();
        line(spark, hist.map((v, i) => [X(i), Y(v)] as Pt), 1.6, "#e9bd5c");
      }
      circle(spark, X(hist.length - 1), Y(hist[hist.length - 1]), 2.4, "#f3e5c4");
    };
    const log: [string, number | null][] = [];
    const entry = (what: string, amount: number | null = null) => {
      log.unshift([what, amount]);
      log.length = 2;
      log.forEach((l, i) => {
        const el = entries[i];
        if (!l) { el.innerHTML = ""; return; }
        el.innerHTML = `<span></span>${l[1] !== null ? `<b class="${l[1] >= 0 ? "gm-plus" : "gm-minus"}">${l[1] >= 0 ? "+" : "-"}${fmt(Math.abs(l[1]))}</b>` : ""}`;
        (el.firstChild as HTMLElement).textContent = l[0];
        el.classList.toggle("gm-old", i > 0);
      });
      if (!calm) scope.fromTo(entries[0], { x: -6, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
    };
    const header = (trip: number) => f.setScore(`${seasonLabel(w.season)}   ${Math.min(trip, SEASONS)}/${SEASONS}`);
    const renderAll = () => { renderTown(); renderTable(); renderCoins(); renderSpark(); debtEl.innerHTML = `Owed to Bank Medibit <b>${fmt(DEBT)}</b>`; };

    // ---- the robot's hands ----
    let pc = clamp((opts.maxMs - 9000) / (SEASONS * 7000), 0.5, 1.15);
    const beat = (ms: number) => nap(host, ms * pc);
    const flash = (el: HTMLElement) => { el.classList.remove("gm-flash"); void el.offsetWidth; el.classList.add("gm-flash"); };
    const press = async (el: HTMLElement, ms = 340) => {
      el.classList.add("gm-hot");
      await host.pointAt(el, 0.5, 0.5, ms * pc);
      await host.click();
      el.classList.remove("gm-hot");
      flash(el);
    };
    const select = async (g: Good) => {
      for (const x of GOODS) rows[x].classList.toggle("gm-sel", x === g);
      rows[g].classList.add("gm-hot");
      await host.pointAt(rows[g], 0.3, 0.5, 340 * pc);
      await host.click();
      rows[g].classList.remove("gm-hot");
      await beat(think(S.skill, 160));
    };
    const unselect = () => { for (const x of GOODS) rows[x].classList.remove("gm-sel"); };
    const sellAll = async (g: Good) => {
      await select(g);
      await press(btn("sellall"), 300);
      const n = me.cargo[g];
      const paid = me.paid[g];
      const v = doSell(w, me, g, n);
      renderTable(); renderCoins();
      entry(`Sold ${n} ${g}`, v);
      if (v - paid > 500 && chance(0.5)) host.react("cheer");
      else if (v < paid * 0.8) host.react(chance(0.5) ? "angry" : "shy");
      await beat(think(S.skill, 380));
    };
    const buy = async (g: Good, qty: number, max: boolean) => {
      await select(g);
      let spent = 0, got = 0;
      if (max) {
        await press(btn("buymax"), 300);
        spent += doBuy(w, me, g, qty); got += qty;
        renderTable(); renderCoins();
      } else {
        for (let n = 0; n < qty; n += 10) {
          await press(btn("buy10"), n ? 160 : 300);
          spent += doBuy(w, me, g, 10); got += 10;
          renderTable(); renderCoins();
          await beat(120);
        }
      }
      entry(`Bought ${got} ${g}`, -spent);
      await beat(think(S.skill, 320));
    };
    const showEvent = async (ev: Ev) => {
      evB.textContent = ev.title;
      evS.textContent = ev.text;
      evEl.classList.toggle("gm-good", ev.good);
      evC.clearRect(0, 0, 36, 36);
      drawEvIcon(evC, ev.kind);
      evEl.style.visibility = "visible";
      if (calm) scope.fromTo(evEl, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      else scope.fromTo(evEl, { opacity: 0, y: -14, rotation: -3 }, { opacity: 1, y: 0, rotation: -1, duration: 0.5, ease: "back.out(2)" });
      await beat(500);
      host.react(ev.good ? (ev.hit ? "cheer" : "laugh") : ev.hit ? (chance(0.5) ? "angry" : "surprised") : "surprised");
      renderTable(); renderCoins();
      await beat(1700 + Math.min(900, ev.text.length * 12));
      scope.to(evEl, { opacity: 0, y: calm ? 0 : 8, duration: 0.3, ease: "sine.in", onComplete: () => { evEl.style.visibility = "hidden"; } });
      await beat(250);
    };
    const travel = async (dest: TownId) => {
      const path = route(me.at, dest);
      const pts: Pt[] = [];
      for (let i = 1; i < path.length; i++) {
        const leg = roadPts(path[i - 1], path[i], MW, H);
        pts.push(...(i > 1 ? leg.slice(1) : leg));
      }
      pts.unshift([wagon.x, wagon.y - 2]);
      pts.push([tx(dest) + 34, ty(dest) + 1]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const dur = (0.9 + cum[cum.length - 1] / 170) * pc;
      Object.assign(wagon, { pts, cum, t0: performance.now() / 1000, dur, moving: true });
      if (chance(0.3)) host.react("relax");
      await nap(host, dur * 1000 + 60);
      park(dest);
    };
    const pickDest = async (p: Plan) => {
      host.react("focus");
      if (p.alt && chance(0.55 - S.skill * 0.25)) {
        hover = p.alt;
        await host.pointAt(spots[p.alt], 0.5, 0.5, 420 * pc);
        await beat(think(S.skill, 420));
      }
      hover = p.dest;
      await host.pointAt(spots[p.dest], 0.5, 0.5, 420 * pc);
      await beat(think(S.skill, 260));
      await host.click();
      hover = null; pick = p.dest;
      const path = route(me.at, p.dest);
      const pts: Pt[] = [];
      for (let i = 1; i < path.length; i++) pts.push(...roadPts(path[i - 1], path[i], MW, H));
      preview = pts;
      await beat(450);
    };
    const showSheet = (html: string, seal: boolean | null) => {
      paper.innerHTML = html;
      if (seal !== null) {
        const c = document.createElement("canvas");
        c.className = "gm-db-seal";
        paper.insertBefore(c, paper.firstChild);
        drawSeal(fitCanvas(c, 48, 48), seal);
      }
      sheet.classList.add("gm-on");
      scope.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: 0.35 });
      if (!calm) scope.fromTo(paper, { y: 16, scale: 0.94 }, { y: 0, scale: 1, duration: 0.55, ease: "back.out(1.8)" });
    };
    const hideSheet = () => scope.to(sheet, { opacity: 0, duration: 0.35, onComplete: () => sheet.classList.remove("gm-on") });

    // ---- one full game: ten seasons on Bank Medibit's money ----
    const playOne = async (): Promise<{ win: boolean; score: number }> => {
      const seed = Math.floor(Math.random() * 1e9);
      w = makeWorld(seed);
      me = makeMe();
      const mind = makeMind(w, S.skill, seed + 7);
      log.length = 0; for (const el of entries) el.innerHTML = "";
      park(me.at); preview = null; pick = null; hover = null; unselect();
      coinShow.v = START;
      observe(mind, w, me.at);
      renderAll(); header(0);
      showSheet(`<b class="gm-db-title">Der Bugger 2</b><span class="gm-db-sub">Merchant of the Data Age</span><p>Bank Medibit lends you ${fmt(START)} Bitgulden.<br>Repay <b>${fmt(DEBT)}</b> by ${seasonLabel(SEASONS)}<br>or the bank takes the wagon.</p>`, null);
      await beat(2600);
      hideSheet();
      await beat(500);
      entry("Loan from Bank Medibit", START);

      let trip = 1;
      for (; trip <= SEASONS; trip++) {
        const t0 = performance.now();
        if (S.left < 9500) break;
        const final = trip === SEASONS;
        host.react("focus");
        for (const g of sellChoices(w, me, mind, false)) await sellAll(g);
        if (!load(me) && me.coins < cheapestToll(w, me.at)) { me.broke = "Stranded with no coin for the tolls"; break; }
        const p = planTrip(w, me, mind, final);
        if (p.good && p.qty > 0) await buy(p.good, p.qty, p.max);
        unselect();
        await pickDest(p);
        const toll = tollFor(me.at, p.dest, w.season);
        const paid = payOrSeize(me, toll);
        entry(isWinter(w.season) ? "Winter tolls" : `Tolls to ${TOWN[p.dest].name}`, -toll);
        renderCoins(); renderTable();
        if (!paid.ok) { me.broke = "The toll keepers took everything"; break; }
        await travel(p.dest);
        preview = null; pick = null;
        tick(w);
        header(trip);
        const ev = rollEvent(w, me, mind, p.dest);
        me.at = p.dest;
        observe(mind, w, me.at);
        renderTown(); renderTable();
        if (ev) await showEvent(ev);
        me.hist.push(worth(w, me));
        renderSpark(); renderCoins();
        if (me.broke) break;
        if (isClosed(w, me.at)) { host.react("surprised"); entry(`${TOWN[me.at].name} is quarantined`); }
        await beat(400);
        // keep the whole run inside the time budget
        const spent = (performance.now() - t0) / pc, left = SEASONS - trip;
        if (left > 0) pc = clamp((S.left - 8000) / (left * spent), 0.4, 1.15);
      }
      if (!me.broke) {
        if (trip <= SEASONS) entry("Bank Medibit calls the loan early");
        if (!isClosed(w, me.at)) {
          for (const g of GOODS) if (me.cargo[g]) await sellAll(g);
        } else if (load(me)) {
          const v = Math.round(GOODS.reduce((s, g) => s + me.cargo[g] * BASE[g] * 0.4, 0));
          for (const g of GOODS) dropCargo(me, g, me.cargo[g]);
          me.coins += v;
          entry("Bank takes the crates cheap", v);
          renderTable(); renderCoins();
        }
        me.hist[me.hist.length - 1] = me.coins;
        renderSpark();
        await beat(500);
      }
      const win = !me.broke && me.coins >= DEBT;
      const net = me.coins - DEBT;
      unselect();
      if (win) {
        const title = net >= 1500 ? "Patrician of the Data Age" : net >= 600 ? "Guild Councillor" : "Free Merchant";
        showSheet(`<b class="gm-db-title gm-good">${title}</b><p>Bank Medibit is repaid ${fmt(DEBT)} Bitgulden.<br>Your own fortune: <b>${fmt(net)}</b> Bitgulden.</p>`, true);
        entry("Loan repaid", -DEBT);
      } else {
        const why = me.broke || `Short by ${fmt(-net)} Bitgulden at the reckoning`;
        showSheet(`<b class="gm-db-title gm-bad">Bankrupt</b><p>${why}.<br>The bank takes the wagon and the mule&#8209;bot.</p>`, false);
      }
      return { win, score: Math.max(0, net) };
    };

    // closing beats shrink so the game always returns inside its budget
    const tail = (ms: number) => nap(host, Math.max(0, Math.min(ms, S.left - 250)));
    for (;;) {
      const r = await playOne();
      if (r.win) {
        host.react("cheer");
        await tail(3200);
        return { result: "win", score: r.score };
      }
      host.react(chance(0.5) ? "angry" : "surprised");
      await tail(2400);
      S.rounds++;
      const next = S.afterLoss(0.2);
      if (next === "ragequit") { host.react("angry"); await tail(600); return { result: "ragequit", score: 0 }; }
      if (next === "lose" || S.left < 70000) { host.react(chance(0.5) ? "relax" : "shy"); await tail(1200); return { result: "lose", score: 0 }; }
      hideSheet();
      await nap(host, 600);
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
