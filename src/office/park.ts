import { Walker, type Facing } from "../world/walker";
import { JOKES, LAUGHS, shuffled } from "../world/jokes";

// The park next to the building. Robots whose work finished a while ago (the break room only
// holds the most recent ones) spend their time out here: they stroll the paths, sit on the
// benches and chat, watch the pond and the fountain, and have a picnic.

export type ParkThread = { id: string; provider: string; title: string; model?: string | null; name?: string | null };
type Rect = { x: number; y: number; w: number; h: number };
type Spot = { key: string; x: number; y: number; face: Facing; kind: "bench" | "pond" | "fountain" | "picnic"; taken: string | null };
type Visitor = { t: ParkThread; w: Walker; spot: Spot | null; alive: boolean; busy: boolean };

const SCALE = 0.3;
const MAX = 6;
const wait = (s: number) => new Promise<void>((r) => window.setTimeout(r, s * 1000));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const PARK_THOUGHTS = ["Nice out today.", "The ducks are back.", "No merge conflicts out here.", "Fresh air. Well, fresh packets.", "I could get used to this.", "Is that a real tree or a sprite?"];

export class Park {
  layer: HTMLElement;
  onSelect: (id: string) => void = () => {};
  private vis = new Map<string, Visitor>();
  private spots: Spot[] = [];
  private geo: { park: Rect; door: { x: number; y: number } } | null = null;
  private joke = shuffled(JOKES);
  private dead = false;

  constructor(parent: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "park-layer";
    parent.appendChild(this.layer);
    this.layer.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest(".world-walker") as HTMLElement | null;
      if (el?.dataset.id) { e.stopPropagation(); this.onSelect(el.dataset.id); }
    });
  }

  // Where the park and the building door are, in world coordinates. If the building grows the
  // park moves with it, and so does everyone in it.
  setGeometry(park: Rect, door: { x: number; y: number }) {
    const prev = this.geo;
    this.geo = { park: { ...park }, door: { ...door } };
    const cx = park.x + park.w / 2, cy = park.y + park.h / 2;
    const bench = (bx: number, by: number, k: string): Spot[] => [
      { key: `${k}a`, x: bx + 36, y: by + 30, face: "down", kind: "bench", taken: null },
      { key: `${k}b`, x: bx + 70, y: by + 30, face: "down", kind: "bench", taken: null },
    ];
    const old = new Map(this.spots.map((s) => [s.key, s.taken]));
    this.spots = [
      ...bench(cx - 150, cy - 110, "b1"), ...bench(cx + 80, cy + 110, "b2"), ...bench(cx - 150, cy + 120, "b3"),
      { key: "pond1", x: cx + 210, y: cy + 26, face: "up", kind: "pond", taken: null },
      { key: "pond2", x: cx + 320, y: cy + 30, face: "up", kind: "pond", taken: null },
      { key: "pond3", x: cx + 40, y: cy - 150, face: "right", kind: "pond", taken: null },
      { key: "fount", x: cx - 20, y: cy + 100, face: "up", kind: "fountain", taken: null },
      { key: "pic1", x: cx - 345, y: cy + 362, face: "right", kind: "picnic", taken: null },
      { key: "pic2", x: cx - 282, y: cy + 352, face: "left", kind: "picnic", taken: null },
    ];
    for (const s of this.spots) s.taken = old.get(s.key) ?? null;
    for (const v of this.vis.values()) if (v.spot) v.spot = this.spots.find((s) => s.key === v.spot!.key) ?? null;
    if (prev && (prev.park.x !== park.x || prev.park.y !== park.y)) {
      const dx = park.x - prev.park.x, dy = park.y - prev.park.y;
      for (const v of this.vis.values()) { v.w.stop(); v.w.setPos(v.w.x + dx, v.w.y + dy); }
    }
  }

  setThreads(list: ParkThread[]) {
    if (!this.geo) return;
    const want = list.slice(0, MAX);
    const ids = new Set(want.map((t) => t.id));
    for (const v of [...this.vis.values()]) if (!ids.has(v.t.id)) void this.leave(v);
    for (const t of want) {
      if (this.vis.has(t.id)) continue;
      const w = new Walker(this.layer, { id: t.id, provider: t.provider, name: t.name ?? undefined, model: t.model ?? undefined, scale: SCALE });
      w.el.title = t.name ? `${t.name}: ${t.title}` : t.title;
      const v: Visitor = { t, w, spot: null, alive: true, busy: false };
      this.vis.set(t.id, v);
      // on first load everyone is already out here; later arrivals walk over from the door
      const first = this.vis.size <= want.length && !this.started;
      if (first) { const s = this.freeSpot(); const p = s ?? this.strollPoint(); w.setPos(p.x, p.y); if (s) this.take(v, s); }
      else w.setPos(this.geo.door.x, this.geo.door.y);
      void this.life(v, !first);
    }
    this.started = true;
  }
  private started = false;

  private freeSpot(kind?: Spot["kind"]) {
    const free = this.spots.filter((s) => !s.taken && (!kind || s.kind === kind));
    return free.length ? pick(free) : null;
  }
  private take(v: Visitor, s: Spot) { this.release(v); s.taken = v.t.id; v.spot = s; }
  private release(v: Visitor) { if (v.spot && v.spot.taken === v.t.id) v.spot.taken = null; v.spot = null; }
  private strollPoint() {
    const p = this.geo!.park, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return pick([
      { x: cx, y: p.y + 110 + Math.random() * 120 }, { x: cx, y: p.y + p.h - 130 - Math.random() * 120 },
      { x: cx - 220 - Math.random() * 200, y: cy + 4 }, { x: cx + 6, y: cy + 160 + Math.random() * 120 },
    ]);
  }

  private async life(v: Visitor, arriving: boolean) {
    const g = this.geo!;
    if (arriving) await v.w.walkPath([{ x: g.park.x + 30, y: g.door.y }, this.strollPoint()]);
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
      const a = this.strollPoint(), b = this.strollPoint();
      await v.w.walkPath([a, b]);
      if (Math.random() < 0.3) v.w.say(pick(PARK_THOUGHTS), 2600);
      return;
    }
    this.take(v, s);
    await v.w.walkTo(s.x, s.y);
    if (!v.alive) return;
    v.w.face(s.face);
    const stay = 10 + Math.random() * 16;
    if (s.kind === "bench" || s.kind === "picnic") {
      v.w.do(s.kind === "picnic" && Math.random() < 0.6 ? "eat" : "sit");
      // two robots on the same bench or blanket tell each other jokes
      const mate = [...this.vis.values()].find((o) => o !== v && o.spot && o.spot.kind === s.kind && o.spot.key.slice(0, 2) === s.key.slice(0, 2) && !o.busy);
      if (mate && Math.random() < 0.7) {
        v.busy = mate.busy = true;
        const [a, b] = this.joke();
        v.w.say(a, 2600); await wait(2.8);
        if (v.alive && mate.alive) { mate.w.say(b, 3000); await wait(3.2); }
        if (v.alive) { v.w.do("laugh", { keep: true }); v.w.say(pick(LAUGHS), 1600); }
        v.busy = mate.busy = false;
      }
    } else if (s.kind === "pond") {
      v.w.do("idle");
      if (Math.random() < 0.35) { await wait(2); if (v.alive) v.w.say(pick(PARK_THOUGHTS), 2600); }
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
    v.w.calm();
    v.w.say("Back to work!", 1400);
    const g = this.geo;
    if (g) await v.w.walkPath([{ x: g.park.x + 30, y: g.door.y }, g.door]).catch(() => {});
    v.w.destroy();
  }

  destroy() {
    this.dead = true;
    for (const v of this.vis.values()) { v.alive = false; v.w.destroy(); }
    this.vis.clear();
    this.layer.remove();
  }
}
