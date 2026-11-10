import { Walker, type Facing } from "../world/walker";
import { JOKES, LAUGHS, shuffled } from "../world/jokes";
import { dailyConvo, dailyLine } from "./daily";
import { CONVOS, THOUGHTS, pickFresh } from "../content";
import { makeInteractive, whenFree } from "./interact";
import { ParkToys, type ParkToyKind } from './park-toys';
import { dress, type Gear } from "../weather/gear";
import { PARK_K as K } from "./grounds";
import type { RobotLook } from "./rig";

// The park next to the building. Robots whose work finished a while ago (the break room only
// holds the most recent ones) spend their time out here: they stroll the paths, sit on the
// benches and chat, watch the pond and the fountain, and have a picnic.

export type ParkThread = { id: string; provider: string; title: string; model?: string | null; name?: string | null; look: RobotLook };
type Rect = { x: number; y: number; w: number; h: number };
type Spot = { key: string; x: number; y: number; face: Facing; kind: "bench" | "pond" | "fountain" | "picnic"; taken: string | null };
type Visitor = { t: ParkThread; w: Walker; spot: Spot | null; alive: boolean; busy: boolean };

const SCALE = 0.42;   // same size as in the break room and the hallway
const MAX = 6;
const wait = (s: number) => new Promise<void>((r) => window.setTimeout(r, s * 1000));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
// lots of lines, shown without repeats until they run out (remembered across launches)
const nextConvo = pickFresh(CONVOS, "lucid:park:convos");
const nextThought = pickFresh(THOUGHTS.filter((t) => !t.place || t.place === "park" || t.place === "bench"), "lucid:park:thoughts");
const PARK_THOUGHTS = ["Nice out today.", "The ducks are back.", "No merge conflicts out here.", "Fresh air. Well, fresh packets.", "I could get used to this.", "Is that a real tree or a sprite?"];

export class Park {
  layer: HTMLElement;
  onSelect: (id: string) => void = () => {};
  /** A leaving robot reached the building door; true when the world's walker takes it from there. */
  onExit: ((id: string, at: { x: number; y: number }, face: Facing) => boolean) | null = null;
  onDeparture?: (id: string, walker: Walker) => void;
  private vis = new Map<string, Visitor>();
  private spots: Spot[] = [];
  private geo: { park: Rect; door: { x: number; y: number }; routeY?: number } | null = null;
  private joke = shuffled(JOKES);
  private dead = false;
  private toys: ParkToys;
  private reactionAt = -2000;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "park-layer";
    parent.appendChild(this.layer);
    this.toys = new ParkToys(this.layer, (kind, at) => this.reactToToy(kind, at));
    this.layer.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".world-walker") as HTMLElement | null;
      if (el?.dataset.id) { e.stopPropagation(); this.onSelect(el.dataset.id); }
    });
  }

  // Where the park and the building door are, in world coordinates. If the building grows the
  // park moves with it. Visitors keep their physical position and re-plan their walk.
  setGeometry(park: Rect, door: { x: number; y: number }, routeY?: number) {
    const prev = this.geo;
    this.geo = { park: { ...park }, door: { ...door }, routeY };
    this.toys.setGeometry(park);
    const cx = park.x + park.w / 2, cy = park.y + park.h / 2;
    // the park is drawn on a plan K times smaller than the world: offsets below are plan units
    const at = (dx: number, dy: number) => ({ x: cx + dx * K, y: cy + dy * K });
    const bench = (bx: number, by: number, k: string): Spot[] => [
      { key: `${k}a`, ...at(bx + 36, by + 30), face: "down", kind: "bench", taken: null },
      { key: `${k}b`, ...at(bx + 70, by + 30), face: "down", kind: "bench", taken: null },
    ];
    const old = new Map(this.spots.map((s) => [s.key, s.taken]));
    this.spots = [
      ...bench(-150, -110, "b1"), ...bench(80, 110, "b2"), ...bench(-150, 120, "b3"),
      { key: "pond1", ...at(210, 26), face: "up", kind: "pond", taken: null },
      { key: "pond2", ...at(320, 30), face: "up", kind: "pond", taken: null },
      { key: "pond3", ...at(40, -150), face: "right", kind: "pond", taken: null },
      { key: "fount", ...at(-20, 100), face: "up", kind: "fountain", taken: null },
      { key: "pic1", ...at(-345, 362), face: "right", kind: "picnic", taken: null },
      { key: "pic2", ...at(-282, 352), face: "left", kind: "picnic", taken: null },
    ];
    for (const s of this.spots) s.taken = old.get(s.key) ?? null;
    for (const v of this.vis.values()) if (v.spot) v.spot = this.spots.find((s) => s.key === v.spot!.key) ?? null;
    if (prev && (prev.park.x !== park.x || prev.park.y !== park.y)) {
      for (const v of this.vis.values()) v.w.stop();
    }
  }

  setThreads(list: ParkThread[]) {
    if (!this.geo) return;
    const want = list.slice(0, MAX);
    const ids = new Set(want.map((t) => t.id));
    for (const v of [...this.vis.values()]) if (!ids.has(v.t.id)) void this.leave(v);
    const arrivals: { visitor: Visitor; arriving: boolean }[] = [];
    for (const t of want) {
      const existing = this.vis.get(t.id);
      if (existing) {
        existing.t = t;
        existing.w.setLook(t.look);
        existing.w.el.title = t.name ? `${t.name}: ${t.title}` : t.title;
        continue;
      }
      const w = new Walker(this.layer, { flavorSpeech: true, id: t.id, provider: t.provider, name: t.name ?? undefined, model: t.model ?? undefined, scale: SCALE, look: t.look });
      w.el.title = t.name ? `${t.name}: ${t.title}` : t.title;
      dress(w.el, this.gear);
      const v: Visitor = { t, w, spot: null, alive: true, busy: false };
      makeInteractive(w, { bounds: () => this.geo?.park ?? null, onOpen: () => this.onSelect(t.id), onLanded: () => { this.release(v); } });
      this.vis.set(t.id, v);
      // on first load everyone is already out here; later arrivals walk over from the door
      const first = this.vis.size <= want.length && !this.started;
      if (first) { const s = this.freeSpot(); const p = s ?? this.strollPoint(); w.setPos(p.x, p.y); if (s) this.take(v, s); }
      else w.setPos(this.geo.door.x, this.geo.door.y);
      arrivals.push({ visitor: v, arriving: !first });
    }
    if (want.length) this.started = true;
    // Reserve every startup spot before activity loops can release any of them.
    for (const { visitor, arriving } of arrivals) void this.life(visitor, arriving);
  }
  private started = false;
  /** Bad weather: the park empties, everyone goes back into the building. */
  wet = false;
  /** Dry for now, but rain is on its way. */
  rainSoon = false;
  /** What everyone out here wears for the weather (umbrella, scarf, sun hat), see weather/gear.ts. */
  private gear: Gear = null;
  private leaving = new Set<Walker>();
  setGear(g: Gear) {
    this.gear = g;
    for (const v of this.vis.values()) dress(v.w.el, g);
    for (const w of this.leaving) dress(w.el, g);   // caught by the rain on the way in: up go the umbrellas
  }
  /** Everyone walking about out here (for footprints in the snow). */
  steppers() {
    const out: { id: string; x: number; y: number }[] = [];
    for (const v of this.vis.values()) out.push({ id: v.t.id, x: v.w.x, y: v.w.y });
    for (const w of this.leaving) out.push({ id: w.id, x: w.x, y: w.y });
    return out;
  }
  /** Actual park activity and world positions, for the shared spatial sound budget. */
  soundActors(): { el: HTMLElement; x: number; y: number; activity: string; moving?: boolean }[] {
    return [...this.vis.values()].map(({ w }) => ({ el: w.el as HTMLElement, x: w.x, y: w.y, activity: w.activity }))
      .concat([...this.leaving].map(w => ({ el: w.el as HTMLElement, x: w.x, y: w.y, activity: w.activity })));
  }
  /** Where the park's own sounds live: the water, the trees, the pond edge and the meadow.
   *  The soundscape picks who sings there from the time of day and the weather. */
  soundZones(): { kind: 'water' | 'birds' | 'pond' | 'meadow'; x: number; y: number }[] {
    if (!this.geo || this.dead) return [];
    const p = this.geo.park, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return [
      { kind: 'water', x: cx + 260 * K, y: cy - 120 * K },
      { kind: 'birds', x: cx - 320 * K, y: cy - 200 * K },
      { kind: 'birds', x: cx + 340 * K, y: cy + 230 * K },
      { kind: 'pond', x: cx + 270 * K, y: cy - 40 * K },
      { kind: 'meadow', x: cx - 260 * K, y: cy + 300 * K },
    ];
  }

  private freeSpot(kind?: Spot["kind"]) {
    const free = this.spots.filter((s) => !s.taken && (!kind || s.kind === kind));
    return free.length ? pick(free) : null;
  }
  private take(v: Visitor, s: Spot) { this.release(v); s.taken = v.t.id; v.spot = s; }
  private release(v: Visitor) { if (v.spot && v.spot.taken === v.t.id) v.spot.taken = null; v.spot = null; }
  // Walk like a person in a park: onto the nearest path, along the paths (around the fountain,
  // never across the pond, benches or beds), and only the last few steps over the grass.
  private route(from: { x: number; y: number }, to: { x: number; y: number }) {
    const p = this.geo!.park, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const R = 92 * K;                               // stay this far from the fountain's middle
    const yTop = p.y + 40 * K, yBot = p.y + p.h - 40 * K, xLeft = p.x + 20;
    // nearest point on the paths: the east-west path (y = cy, west of the fountain) or the north-south one (x = cx)
    const onPath = (q: { x: number; y: number }) => {
      const h = { seg: "h" as const, x: Math.max(xLeft, Math.min(cx - R, q.x)), y: cy };
      const vy = Math.max(yTop, Math.min(yBot, q.y));
      const v = { seg: "v" as const, x: cx, y: Math.abs(vy - cy) < R ? cy + (vy < cy ? -R : R) : vy };
      return Math.hypot(q.x - h.x, q.y - h.y) <= Math.hypot(q.x - v.x, q.y - v.y) ? h : v;
    };
    const a = onPath(from), b = onPath(to);
    const pts: { x: number; y: number }[] = [a];
    if (a.seg !== b.seg) {
      // switch paths around the fountain ring, on the side we are heading to
      const side = (a.seg === "v" ? a.y : b.y) < cy ? -1 : 1;
      if (a.seg === "h") pts.push({ x: cx - R, y: cy }, { x: cx - R * 0.7, y: cy + side * R * 0.7 }, { x: cx, y: cy + side * R });
      else pts.push({ x: cx, y: cy + side * R }, { x: cx - R * 0.7, y: cy + side * R * 0.7 }, { x: cx - R, y: cy });
    } else if (a.seg === "v" && (a.y - cy) * (b.y - cy) < 0) {
      // north to south on the same path: go around the fountain on the west side
      const s1 = a.y < cy ? -1 : 1;
      pts.push({ x: cx, y: cy + s1 * R }, { x: cx - R, y: cy }, { x: cx, y: cy - s1 * R });
    }
    pts.push(b, to);
    return pts;
  }
  // walk there; if someone picks it up on the way, it gets its bearings and sets off again
  private async go(v: Visitor, to: { x: number; y: number }, departing = false) {
    let geometry = this.geo;
    while (!this.dead && (v.alive || (departing && this.leaving.has(v.w)))) {
      await whenFree(v.w);
      if (geometry && this.geo && geometry !== this.geo) {
        to = { x: to.x + this.geo.park.x - geometry.park.x, y: to.y + this.geo.park.y - geometry.park.y };
        geometry = this.geo;
      }
      await v.w.walkPath(this.route({ x: v.w.x, y: v.w.y }, to));
      if (Math.hypot(v.w.x - to.x, v.w.y - to.y) < 8) return;
    }
  }

  // Existing world-coordinate click routing also reaches keyboard-backed park toys.
  hit(x: number, y: number) {
    return this.toys.hit(x, y);
  }
  /** Water or a tree elsewhere in the world was clicked (forest stream, woodland). */
  splashAt(x: number, y: number) { this.toys.splashAt(x, y); }
  rustleAt(x: number, y: number) { this.toys.rustleAt(x, y); }
  private reactToToy(kind: ParkToyKind, at: { x: number; y: number }) {
    const now = performance.now();
    if (this.dead || document.hidden || now - this.reactionAt < 1800) return;
    const nearby = [...this.vis.values()].filter(v => v.alive && !v.busy && Math.hypot(v.w.x - at.x, v.w.y - at.y) < 450)
      .sort((a, b) => Math.hypot(a.w.x - at.x, a.w.y - at.y) - Math.hypot(b.w.x - at.x, b.w.y - at.y))[0];
    if (!nearby) return;
    this.reactionAt = now;
    const lines: Record<ParkToyKind, string[]> = {
      tree: ['Tiny bird, big opinions.', 'The tree says hi.', 'Leaf me out of this.'],
      bush: ['Something rustled!', 'I thought that was my phone.', 'Hello, tiny forest friend.'],
      pond: ['The ducks have feedback.', 'Quack to you too.', 'That duck is the manager.'],
      fountain: ['My waterproofing has limits.', 'A little splash break.', 'Refreshing!'],
      flowers: ['Careful, they are growing.', 'A bouquet of good commits.', 'Tiny flowers, tiny happy circuits.'],
    };
    nearby.w.say(pick(lines[kind]), 2100);
    // A reaction never replaces the visitor's walk, conversation or current props.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) nearby.w.hop();
  }

  private strollPoint() {
    const p = this.geo!.park, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return pick([
      { x: cx, y: p.y + (110 + Math.random() * 120) * K }, { x: cx, y: p.y + p.h - (130 + Math.random() * 120) * K },
      { x: cx - (220 + Math.random() * 200) * K, y: cy + 4 }, { x: cx + 6, y: cy + (160 + Math.random() * 120) * K },
    ]);
  }

  private async life(v: Visitor, arriving: boolean) {
    const g = this.geo!;
    if (arriving) { await v.w.walkPath([...(g.routeY === undefined ? [] : [{ x: g.door.x, y: g.routeY }]), { x: g.park.x + 30, y: g.routeY ?? g.door.y }]); await this.go(v, this.strollPoint()); }
    while (v.alive && !this.dead) {
      try { await this.activity(v); } catch { /* left mid-way */ }
      if (!v.alive || this.dead) return;
      await wait(1 + Math.random() * 2);
    }
  }

  private async activity(v: Visitor) {
    const r = Math.random();
    const kind: Spot["kind"] | "stroll" = r < 0.36 ? "bench" : r < 0.56 ? "pond" : r < 0.68 ? "fountain" : r < 0.82 ? "picnic" : "stroll";
    const s = kind === "stroll" ? null : this.freeSpot(kind);
    if (!s) {
      this.release(v);
      await this.go(v, this.strollPoint());
      if (v.alive) await this.go(v, this.strollPoint());
      if (Math.random() < 0.3) v.w.say((Math.random() < 0.3 ? dailyLine(v.w.name) : null) ?? nextThought().text, 2800);
      return;
    }
    this.take(v, s);
    await this.go(v, { x: s.x, y: s.y });
    if (!v.alive) return;
    v.w.face(s.face);
    const stay = 10 + Math.random() * 16;
    if (s.kind === "bench" || s.kind === "picnic") {
      v.w.do(s.kind === "picnic" && Math.random() < 0.6 ? "eat" : "sit");
      // two robots on the same bench or blanket tell each other jokes
      const mate = [...this.vis.values()].find((o) => o !== v && o.spot && o.spot.kind === s.kind && o.spot.key.slice(0, 2) === s.key.slice(0, 2) && !o.busy);
      if (mate && Math.random() < 0.7) {
        v.busy = mate.busy = true;
        // today's chatter from the orchestrator first now and then, otherwise a classic
        const lines = (Math.random() < 0.35 ? dailyConvo() : null) ?? (Math.random() < 0.8 ? [...nextConvo().lines] : this.joke());
        for (let i = 0; i < lines.length; i++) {
          const who = i % 2 === 0 ? v : mate;
          if (!v.alive || !mate.alive) break;
          who.w.say(lines[i], 2400 + lines[i].length * 25);
          await wait(2.6 + lines[i].length * 0.025);
        }
        if (v.alive) { v.w.do("laugh", { keep: true }); v.w.say(pick(LAUGHS), 1600); }
        v.busy = mate.busy = false;
      }
    } else if (s.kind === "pond") {
      v.w.do("idle");
      if (Math.random() < 0.35) { await wait(2); if (v.alive) v.w.say((Math.random() < 0.3 ? dailyLine(v.w.name) : null) ?? nextThought().text, 2800); }
    } else {
      v.w.do("wave");
      await wait(1.5);
      if (v.alive) v.w.do("idle");
    }
    await wait(stay);
    if (v.alive) v.w.calm();
  }

  private async leave(v: Visitor) {
    if (!v.alive) return;
    v.alive = false;
    this.release(v);
    this.vis.delete(v.t.id);
    this.leaving.add(v.w);
    v.w.calm();
    v.w.say(this.rainSoon ? pick(["Rain's coming, pack up!", "Those clouds look wet.", "Grab the blanket, rain!", "Inside before it pours!"])
      : this.wet ? pick(["It's raining, inside!", "Nope, too wet.", "My circuits hate rain.", "Race you to the door!"]) : "Back to work!", 1600);
    this.onDeparture?.(v.t.id, v.w);
    const g = this.geo;
    if (g) {
      await this.go(v, { x: g.park.x + 30, y: g.routeY ?? g.door.y }, true).catch(() => {});
      if (this.dead) return;
      await v.w.walkPath([...(g.routeY === undefined ? [] : [{ x: g.door.x, y: g.routeY }]), g.door]).catch(() => {});
    }
    if (this.dead) return;
    this.leaving.delete(v.w);
    if (!this.dead) this.onExit?.(v.t.id, { x: v.w.x, y: v.w.y }, v.w.facing);
    v.w.destroy();
  }

  destroy() {
    this.dead = true;
    this.toys.destroy();
    for (const v of this.vis.values()) { v.alive = false; v.w.destroy(); }
    this.vis.clear();
    for (const walker of this.leaving) walker.destroy();
    this.leaving.clear();
    this.layer.remove();
  }
}
