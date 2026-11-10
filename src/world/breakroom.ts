import gsap from "gsap";
import { Walker, type Facing, type RobotLook } from "../robot";
import { conversation, line, musing, thought, type LineKind } from "../lines";
import { makeInteractive, whenFree } from "../office/interact";
import { Anims, PAL, Paths, RoomStage, WALL, plantSvg, posterArt, reducedMotion, windowArt, type Pt } from "./room";
import { PingPong } from "./pingpong";
import { ChessTable, GAMES, type ChessGame } from "./chess";
import { Arcade, type GameEvent } from "./arcade";
import { MovieCorner, type Beat } from "./movie";
import { gameSound, type GameCue } from "../office/sound";

// The break room, seen top-down. West: a kitchen counter on the north wall (fridge, sink,
// microwave, coffee machine), a dining table, three charging docks and a nap pod. Middle: a
// couch on a rug under the windows, a beanbag, and the door in the south wall. East, the games
// wing: a ping pong table, a chess table, a TV with a game console and a couch, and a movie
// corner with a roll-down screen, beanbags, a projector and a popcorn machine.
// Residents walk in through the door and live a little life loop: microwave a meal and eat it,
// make coffee, charge, nap, look out of the window, chat and tell robot jokes, and play games
// together. Group games use a host and join pattern: the host recruits free robots (pulling
// ones that are only idling) and waits for them; anyone leaving ends the game cleanly.
// The room is laid out for 1900 x 800; the games wing hugs the east wall, the door is at w / 2.

export type BreakThread = { id: string; provider: string; title: string; question?: string | null; model?: string | null; name?: string | null; look?: RobotLook };

export interface RoomExtension {
  el: HTMLElement;
  setThreads(list: BreakThread[]): void;
  onSelect: (id: string) => void;
  /** A leaving robot reached the door (room coordinates); true when the hall walker takes it from there. */
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  onDeparture?: (id: string, walker: Walker) => void;
  /** The next time this robot joins, its walker starts at this point (room coordinates), where the hall walker stopped. */
  enterFrom?(id: string, at: Pt): void;
  destroy(): void;
}

const SCALE = 0.42;
const MAX = 8;
type Spot = { key: string; x: number; y: number; face: Facing; sit?: boolean; via?: Pt[]; taken: string | null };
export type GroupKind = "pingpong" | "chess" | "console" | "movie";
type Kind = "microwave" | "coffee" | "charge" | "nap" | "window" | "fridge" | "chat" | GroupKind;
const WEIGHTS: Record<Kind, number> = { microwave: 3, coffee: 3, charge: 2, nap: 1.5, window: 1.5, fridge: 0.8, chat: 3.2, pingpong: 2.4, chess: 1.6, console: 2.4, movie: 1.5 };
const COOLDOWN: Record<Kind, number> = { microwave: 55, coffee: 35, charge: 60, nap: 75, window: 25, fridge: 45, chat: 18, pingpong: 80, chess: 140, console: 70, movie: 160 };
/** After a game ends, how long its corner rests before anyone starts it again (seconds). */
const REST: Record<GroupKind, number> = { pingpong: 15, chess: 25, console: 15, movie: 90 };
const GROUPS: GroupKind[] = ["pingpong", "chess", "console", "movie"];

type Resident = {
  id: string; w: Walker; alive: boolean; busy: boolean; nextAt: number; last: Kind | null;
  cool: Partial<Record<Kind, number>>; spot: Spot | null;
  /** Idling (wandering, at the window): a group game may pull it away. */
  soft: boolean;
  /** Invited to a group game; joins it as soon as it is free. */
  pull: Group | null;
  /** Cuts the current idle wait short when pulled. */
  interrupt: (() => void) | null;
  group: Group | null;
  /** Hanging from the cursor (picked up or thrown). */
  held: boolean;
  /** Cancels whatever it is waiting on (picked up, pulled into a game). */
  stops: Set<(e: Error) => void>;
  /** What it settled down to do, so it can go back to it after being thrown around. */
  doing: Doing | null;
  resume: Doing | null;
  /** Who it is chatting with. */
  mate: Resident | null;
};
type Doing = { kind: "eat" | "drink" | "charge" | "nap" | "window"; key: string };

const ENDED = new Error("group ended");
const GRABBED = new Error("picked up");

/** A floor footprint (x0, y0)-(x1, y1) that nobody walks through. */
type Block = { name: string; x0: number; y0: number; x1: number; y1: number };
// A robot's feet are wide but shallow from up here: keep this far from a footprint.
const RX = 16, RY = 8;
const inside = (b: Block, p: Pt) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
/** Does the segment a-b cross the rectangle (Liang-Barsky)? */
function hits(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

/** One running group game: who plays, who watches, and timers that stop when it ends. */
class Group {
  alive = true;
  open = true;                 // still taking players
  players: Resident[] = [];
  extras: Resident[] = [];     // spectators
  recruits = new Set<Resident>();
  arrived = new Set<Resident>();
  lostOne = false;             // someone left in the middle
  started = false;             // the movie is rolling: it goes on without whoever leaves
  onArrive: (r: Resident) => void = () => {};
  readonly done: Promise<void>;
  private finish!: () => void;
  private stops = new Set<(e: Error) => void>();
  private calls = new Set<gsap.core.Tween>();

  constructor(readonly kind: GroupKind, readonly host: Resident, readonly seats: string[], readonly extraSeats: string[]) {
    this.done = new Promise((r) => (this.finish = r));
  }

  /** Wait inside the game; rejects as soon as the game ends. */
  wait(sec: number) {
    if (!this.alive) return Promise.reject(ENDED);
    return new Promise<void>((res, rej) => {
      const c = gsap.delayedCall(sec, () => { this.calls.delete(c); this.stops.delete(rej); res(); });
      this.calls.add(c);
      this.stops.add(rej);
    });
  }

  /** Await a walk or an animation, but bail out if the game ends meanwhile. */
  until<T>(p: Promise<T>) {
    if (!this.alive) return Promise.reject(ENDED);
    return new Promise<T>((res, rej) => {
      this.stops.add(rej);
      p.then((v) => { this.stops.delete(rej); if (this.alive) res(v); else rej(ENDED); }, (e) => { this.stops.delete(rej); rej(e); });
    });
  }

  /** Run something later, unless the game is over by then. */
  later(sec: number, fn: () => void) {
    const c = gsap.delayedCall(sec, () => { this.calls.delete(c); if (this.alive) fn(); });
    this.calls.add(c);
  }

  /** Still here and part of this game. */
  has(r: Resident) { return r.alive && r.group === this; }
  get here() { return this.players.filter((r) => this.has(r) && this.arrived.has(r)); }

  end() {
    if (!this.alive) return;
    this.alive = false;
    for (const c of this.calls) c.kill();
    this.calls.clear();
    for (const s of this.stops) s(ENDED);
    this.stops.clear();
    this.finish();
  }
}

const DOCKS = [150, 260, 370];
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class BreakRoom implements RoomExtension {
  el: HTMLElement;
  onSelect: (id: string) => void = () => {};
  onExit?: (id: string, at: Pt, face: Facing) => boolean;
  onDeparture?: (id: string, walker: Walker) => void;
  private entries = new Map<string, Pt>();
  private opened = false;   // had residents before (later arrivals walk in through the door)
  enterFrom(id: string, at: Pt) { this.entries.set(id, { ...at }); }
  /** Where robots walk in (just inside the door) and appear from (outside it). */
  readonly doorIn: Pt;
  readonly doorOut: Pt;
  private stage: RoomStage;
  private paths: Paths;
  /** Floor footprints of the furniture: nobody walks through these. */
  private blocks: Block[] = [];
  private spots: Record<string, Spot> = {};
  private res = new Map<string, Resident>();
  private timer = 0;
  private $: Record<string, SVGElement> = {};
  private anims: gsap.core.Animation[] = [];   // idle loops, paused while the room is empty
  private fx = new Anims();                       // machines at work
  private calls = new Set<gsap.core.Tween>();
  private busyThings = new Set<string>();
  // A robot that wants to chat waits at a chat spot; the next robot that frees up joins it.
  private host: { r: Resident; pair: [string, string]; guest: Resident | null; arrived: boolean; over: Promise<void>; end: () => void } | null = null;
  private groups: Partial<Record<GroupKind, Group>> = {};
  private rested: Partial<Record<GroupKind, number>> = {};
  private force: GroupKind | null = null;
  private lastGame: ChessGame | null = null;
  private nextGame: ChessGame | null = null;
  private pp!: PingPong;
  private chessT!: ChessTable;
  private arcade!: Arcade;
  private movie!: MovieCorner;
  private dead = false;

  /** Actual resident poses and positions for the camera's spatial sound mix. */
  soundActors() {
    return [...this.res.values()].filter(r => r.alive).map(r => ({ el: r.w.el, x: r.w.x, y: r.w.y, activity: r.w.activity }));
  }
  soundMedia() {
    return [
      { el: this.arcade.el, x: this.arcade.cx, y: WALL - 24, kind: 'tv' as const, playing: this.arcade.isPlaying, powered: this.arcade.powered, game: this.arcade.game },
      { el: this.movie.el, x: this.movie.cx, y: 110, kind: 'movie' as const, playing: this.movie.isPlaying, powered: this.movie.isPlaying },
    ];
  }
  setTvPowered(powered: boolean) { this.arcade.setPowered(powered, true); }
  setMovieScreenRaised(raised: boolean) { this.movie.setScreenRaised(raised, true); }

  private mediaReaction(kind: 'console' | 'movie', restored: boolean) {
    const group = this.groups[kind];
    if (!group?.alive) return;
    const viewers = group.players.filter(r => r.alive && !r.held && group.arrived.has(r));
    const kindOf: LineKind = kind === 'console' ? restored ? 'consoleBack' : 'consoleCut' : restored ? 'movieBack' : 'movieCut';
    viewers.slice(0, 2).forEach((r, index) => this.later(index * .24, () => {
      if (this.dead || !group.has(r) || r.held) return;
      r.w.setExpression(restored ? 'happy' : 'surprised'); r.w.hop();
      if (!index) r.w.say(line(kindOf, r.w), 1800);
      this.later(1.9, () => { if (!this.dead && group.has(r) && !r.held) r.w.setExpression('neutral'); });
    }));
  }

  constructor(host: HTMLElement, readonly w: number, readonly h: number) {
    this.doorIn = { x: w / 2, y: h - 50 };
    this.doorOut = { x: w / 2, y: h + 60 };
    this.stage = new RoomStage(host, w, h, { wall: "#e6eadf", trim: "#d0d6c5", floor: PAL.floor, seam: PAL.seam, accent: PAL.mint }, wallArt(w), "world-break");
    this.el = this.stage.el;
    this.furnish();
    const gx = (x: number) => x + w - 1900;   // the games wing hugs the east wall
    const S = (key: string, x: number, y: number, face: Facing, extra: Partial<Spot> = {}) => (this.spots[key] = { key, x, y, face, taken: null, ...extra });
    // Seats are entered and left through their `via` points, so nobody walks through a chair back,
    // a couch arm or a table to sit down.
    S("microwave", 372, 216, "up"); S("coffee", 470, 216, "up"); S("fridge", 80, 228, "up");
    S("window1", 730, 196, "up"); S("window2", 930, 196, "up");
    // dining chairs: the north ones from the gap between them, the south ones from below
    S("seatN1", 300, 374, "down", { sit: true, via: [{ x: 360, y: 300 }, { x: 360, y: 374 }] });
    S("seatN2", 420, 374, "down", { sit: true, via: [{ x: 360, y: 300 }, { x: 360, y: 374 }] });
    S("seatS1", 300, 502, "up", { sit: true, via: [{ x: 360, y: 590 }, { x: 360, y: 502 }] });
    S("seatS2", 420, 502, "up", { sit: true, via: [{ x: 360, y: 590 }, { x: 360, y: 502 }] });
    // couch: along the gap between the couch and the coffee table
    S("couch1", 812, 402, "down", { sit: true, via: [{ x: 752, y: 438 }, { x: 812, y: 438 }] });
    S("couch2", 912, 402, "down", { sit: true, via: [{ x: 968, y: 438 }, { x: 912, y: 438 }] });
    DOCKS.forEach((x, i) => S(`dock${i}`, x, 716, "down", { via: [{ x: x + 55, y: 748 }] }));
    S("pod", 550, 716, "down", { sit: true, via: [{ x: 666, y: 744 }, { x: 550, y: 764 }] });
    S("beanbag", 1040, 466, "down", { sit: true, via: [{ x: 1040, y: 516 }] });
    S("chatA1", 556, 296, "right"); S("chatA2", 650, 296, "left");
    S("chatB1", 700, 626, "right"); S("chatB2", 792, 626, "left");
    // games wing
    const [ppA, ppB] = this.pp.ends;
    S("ppA", ppA.x, ppA.y, "right"); S("ppB", ppB.x, ppB.y, "left");
    const cs = this.chessT.seats;
    S("chessW", cs.w.x, cs.w.y, "right", { sit: true, via: [{ x: cs.w.x - 8, y: cs.w.y - 70 }] });
    S("chessB", cs.b.x, cs.b.y, "left", { sit: true, via: [{ x: cs.b.x + 8, y: cs.b.y - 70 }] });
    S("chessS1", cs.watch[0].x, cs.watch[0].y, "down"); S("chessS2", cs.watch[1].x, cs.watch[1].y, "down");
    // the game couch faces the TV: step in from behind it (its north side)
    const [g1, g2] = this.arcade.seats;
    S("gameP1", g1.x, g1.y, "up", { sit: true, via: [{ x: g1.x, y: g1.y - 66 }] });
    S("gameP2", g2.x, g2.y, "up", { sit: true, via: [{ x: g2.x, y: g2.y - 66 }] });
    S("gameS", this.arcade.watch.x, this.arcade.watch.y, "up");
    this.movie.seats.forEach((s, i) => S(`movie${i}`, s.x, s.y, "up", { sit: true, via: [{ x: s.x, y: s.y + 48 }] }));
    S("popcorn", this.movie.popcornSpot.x, this.movie.popcornSpot.y, "up");
    this.blocks = this.footprints();
    const D = this.doorIn;
    // Walkways: rows along the kitchen (y 250), behind the dining chairs and docks (y 590), across
    // the lounge (y 560), in front of the couch (y 438) and through the games wing, kept clear of
    // every footprint (checked by `clear`).
    this.paths = new Paths({
      n1: { x: 110, y: 250 }, n2: { x: 360, y: 250 }, n3: { x: 600, y: 250 }, n4: { x: 830, y: 250 }, n5: { x: 1050, y: 262 },
      w1: { x: 205, y: 590 }, w2: { x: 315, y: 590 }, w3: { x: 425, y: 590 },
      c1: { x: 690, y: 560 }, d1: { x: D.x, y: 560 }, door: D, e1: { x: 860, y: 640 },
      r1: { x: 680, y: 438 }, f1: { x: 752, y: 438 }, f2: { x: 968, y: 438 },
      k1: { x: gx(1112), y: 282 }, a2: { x: gx(1362), y: 282 }, m1: { x: gx(1112), y: 532 },
      m2: { x: gx(1290), y: 462 }, m3: { x: gx(1480), y: 470 }, m4: { x: gx(1584), y: 534 }, v2: { x: gx(1722), y: 548 }, m5: { x: gx(1852), y: 548 },
    }, [["n1", "n2"], ["n2", "n3"], ["n3", "n4"], ["n4", "n5"], ["n1", "w1"], ["w1", "w2"], ["w2", "w3"], ["w3", "c1"], ["c1", "d1"], ["d1", "door"],
      ["n3", "r1"], ["r1", "c1"], ["r1", "f1"], ["f1", "f2"], ["f2", "d1"], ["c1", "e1"], ["d1", "e1"], ["e1", "door"],
      ["n5", "k1"], ["k1", "a2"], ["k1", "m1"], ["d1", "m1"], ["m1", "m2"], ["m2", "m3"], ["m3", "m4"], ["m4", "v2"], ["v2", "m5"]],
    (a, b) => this.clear(a, b));
    this.idleMachines();
    this.timer = window.setInterval(() => this.tick(), 400);
  }

  // ---- walkways ----------------------------------------------------------------------------------
  /** Floor footprints of everything that stands on the floor (seats included: they are entered through their via points). */
  private footprints(): Block[] {
    const gx = (x: number) => x + this.w - 1900;
    const B = (name: string, x0: number, y0: number, x1: number, y1: number): Block => ({ name, x0, y0, x1, y1 });
    const pp = this.pp, ch = this.chessT, ar = this.arcade, mv = this.movie;
    return [
      B("kitchen", 0, 0, 556, 192), B("plant", 556, 140, 640, 190),
      ...[300, 420].flatMap((x) => [B("chairN", x - 32, 330, x + 32, 382), B("chairS", x - 32, 488, x + 32, 548)]),
      B("table", 226, 384, 474, 478),
      B("couch", 716, 318, 1004, 416), B("coffeeTable", 790, 458, 934, 514), B("beanbag", 988, 432, 1094, 490),
      ...DOCKS.map((x) => B("dock", x - 18, 646, x + 18, 686)),
      B("pod", 470, 640, 630, 772), B("plantSW", 34, 758, 106, 800),
      B("tv", gx(1138), 0, gx(1342), 202), B("gameCouch", ar.cx - 106, ar.seats[0].y - 40, ar.cx + 106, ar.seats[0].y + 38),
      B("popcorn", mv.popcornSpot.x - 30, 330, mv.popcornSpot.x + 30, mv.popcornSpot.y - 18),
      ...mv.seats.map((s) => B("movieBag", s.x - 36, s.y - 28, s.x + 36, s.y + 16)),
      B("projector", mv.cx - 23, mv.seats[0].y + 42, mv.cx + 23, mv.seats[0].y + 104),
      B("screen", mv.cx - 190, 0, mv.cx + 190, 222),
      B("pingpong", pp.x0 + 4, pp.cy - 60, pp.x1 - 4, pp.cy + 96), B("scoreboard", pp.cx - 38, pp.cy - 82, pp.cx + 38, pp.cy - 60),
      B("chess", ch.cx - 82, ch.cy - 62, ch.cx + 82, ch.cy + 68),
      B("stool", ch.seats.w.x - 22, ch.seats.w.y - 26, ch.seats.w.x + 22, ch.seats.w.y + 8), B("stool", ch.seats.b.x - 22, ch.seats.b.y - 26, ch.seats.b.x + 22, ch.seats.b.y + 8),
    ];
  }

  /** Can a robot walk straight from a to b? Footprints that hold either end (a seat it sits on or walks to) do not count. */
  private clear(a: Pt, b: Pt) {
    for (const k of this.blocks) {
      if (inside(k, a) || inside(k, b)) continue;
      if (hits(a, b, k.x0 - RX, k.y0 - RY, k.x1 + RX, k.y1 + RY)) return false;
    }
    return true;
  }

  /** The closest point outside every footprint (a robot dropped onto the couch climbs off it). */
  private freePoint(p: Pt): Pt {
    const ok = (q: Pt) => q.x > 30 && q.x < this.w - 30 && q.y > WALL + 92 && q.y < this.h - 24 &&
      !this.blocks.some((k) => q.x > k.x0 - RX - 3 && q.x < k.x1 + RX + 3 && q.y > k.y0 - RY - 3 && q.y < k.y1 + RY + 3);
    if (ok(p)) return p;
    for (let r = 8; r < 400; r += 8)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7 };
        if (ok(q)) return q;
      }
    return { ...this.doorIn };
  }

  /** The walk from where a robot stands to a point: off its seat (through the seat's via), along the walkways, straight when it can. */
  private plan(from: Pt, to: Pt, toVia: Pt[] = []): Pt[] {
    const out: Pt[] = [];
    // sitting or standing on a spot with a via: leave the way it came in
    const at = Object.values(this.spots).find((s) => s.via && Math.hypot(s.x - from.x, s.y - from.y) < 4);
    let p = from;
    if (at?.via) { for (const v of [...at.via].reverse()) out.push(v); p = at.via[0]; }
    const entry = toVia[0] ?? to;
    // dropped in a pocket (behind the movie beanbags, between the docks): find a way out first
    if (!this.clear(p, entry) && !this.paths.reaches(p)) { const esc = this.escape(p); out.push(...esc); p = esc[esc.length - 1] ?? p; }
    if (this.clear(p, entry) && Math.hypot(entry.x - p.x, entry.y - p.y) < 260) out.push(entry);
    else out.push(...this.paths.route(p, entry));
    out.push(...toVia.slice(1));
    if (toVia.length) out.push(to);
    return out;
  }

  /** Breadth-first search over a coarse grid from p to the nearest point that sees a walkway node. */
  private escape(p: Pt): Pt[] {
    const C = 10, cols = Math.ceil(this.w / C), rows = Math.ceil(this.h / C);
    const open = (q: Pt) => q.x > 24 && q.x < this.w - 24 && q.y > WALL + 80 && q.y < this.h - 20 &&
      !this.blocks.some((k) => q.x > k.x0 - RX && q.x < k.x1 + RX && q.y > k.y0 - RY && q.y < k.y1 + RY);
    const cell = (i: number) => ({ x: (i % cols) * C + C / 2, y: Math.floor(i / cols) * C + C / 2 });
    const start = Math.floor(p.y / C) * cols + Math.floor(p.x / C);
    const prev = new Map<number, number>([[start, -1]]);
    const q = [start];
    for (let h = 0; h < q.length && h < 16000; h++) {
      const i = q[h], c = h ? cell(i) : p;
      if (h && this.paths.reaches(c)) {
        const chain: Pt[] = [];
        for (let k = i; k !== start; k = prev.get(k)!) chain.unshift(cell(k));
        return chain;
      }
      const cx = i % cols, cy = Math.floor(i / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy, j = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || prev.has(j)) continue;
        const n = cell(j);
        if (!open(n) || !this.clear(c, n)) continue;
        prev.set(j, i);
        q.push(j);
      }
    }
    return [];
  }

  // ---- residents ------------------------------------------------------------------------------
  setThreads(list: BreakThread[]) {
    const want = list.slice(0, MAX);
    const ids = new Set(want.map((t) => t.id));
    for (const [id, r] of this.res) if (!ids.has(id) && r.alive) void this.leave(r);
    want.forEach((t, i) => {
      const r = this.res.get(t.id);
      if (r) {
        if (r.w.brand !== brandKind(t.provider)) r.w.setBrand(t.provider);
        if ((t.model ?? "") !== r.w.model) r.w.setModel(t.model);
        if (t.name && t.name !== r.w.name) r.w.setName(t.name);
        return;
      }
      const w = new Walker(this.stage.layer, { flavorSpeech: true, id: t.id, provider: t.provider, model: t.model ?? undefined, name: t.name ?? t.title, scale: SCALE, look: (t as any).look });
      // a robot that just walked down the hall carries on from where it stopped
      const entry = this.entries.get(t.id);
      this.entries.delete(t.id);
      // when the app opens, everyone is already in here, spread over the floor
      const here = !entry && !this.opened ? this.freePoint({ x: 280 + ((i * 397) % Math.max(1, this.w - 560)), y: 420 + (i % 3) * 110 }) : null;
      if (entry) w.setPos(entry.x, entry.y);
      else if (here) w.setPos(here.x, here.y);
      else w.setPos(this.doorOut.x + (i % 2 ? 14 : -14), this.doorOut.y + i * 30);
      w.face("up");
      const res: Resident = { id: t.id, w, alive: true, busy: true, nextAt: 0, last: null, cool: {}, spot: null, soft: false, pull: null, interrupt: null, group: null, held: false, stops: new Set(), doing: null, resume: null, mate: null };
      // a toy: pick it up, carry it, fling it; double-click opens its thread
      makeInteractive(w, {
        bounds: () => ({ x: 20, y: WALL + 52, w: this.w - 40, h: this.h - WALL - 64 }),
        onGrab: () => this.grab(res),
        onOpen: () => this.onSelect(t.id),
        onLanded: () => this.landed(res),
      });
      this.res.set(t.id, res);
      // stagger arrivals so they don't all squeeze through the door at once
      this.later(entry || here ? 0 : i * 1.1, async () => {
        if (!res.alive) return;
        if (!here) await w.walkTo(this.doorIn.x, this.doorIn.y);
        res.busy = false;
        res.nextAt = performance.now() + 300;
      });
    });
    if (want.length) this.opened = true;
    this.pauseIdle(want.length === 0);
  }

  /** Start a group game as soon as a resident is free (for the demo page). `game` picks a chess game by name. */
  play(kind: GroupKind, opts: { game?: string } = {}) {
    this.force = kind;
    this.rested[kind] = 0;
    if (kind === "chess") this.nextGame = GAMES.find((x) => x.name === opts.game) ?? null;
  }

  private async leave(r: Resident) {
    r.alive = false;
    r.interrupt = null;
    if (r.pull) { r.pull.recruits.delete(r); r.pull = null; }
    if (r.group) this.lost(r.group, r);
    this.release(r);
    r.w.say(null);
    r.w.calm();
    r.w.hold("none", "none");
    r.w.mashRate = 1;
    for (const s of [...r.stops]) s(ENDED);
    await whenFree(r.w);
    r.held = false;
    this.onDeparture?.(r.id, r.w);
    await r.w.walkPath(this.plan({ x: r.w.x, y: r.w.y }, this.doorIn));
    // at the door the hall walker takes over on the same spot; otherwise it walks out by itself
    if (this.dead || !this.onExit?.(r.id, { x: r.w.x, y: r.w.y }, r.w.facing)) await r.w.walkTo(this.doorOut.x, this.doorOut.y + 30);
    r.w.destroy();
    if (this.res.get(r.id) === r) this.res.delete(r.id);
  }

  /** A member walked out (its thread went back to work). Two-player games end; the movie goes on. */
  private lost(g: Group, r: Resident) {
    g.recruits.delete(r);
    g.arrived.delete(r);
    if (g.extras.includes(r)) { g.extras = g.extras.filter((x) => x !== r); return; }
    if (g.kind === "movie" && (r !== g.host || g.started)) {
      g.players = g.players.filter((x) => x !== r);
      if (!g.players.some((x) => x.alive)) g.end();
      return;
    }
    g.lostOne = true;
    g.end();
  }

  private tick() {
    const now = performance.now();
    for (const r of this.res.values()) {
      if (!r.alive || r.busy || r.held || now < r.nextAt) continue;
      void this.live(r);
    }
  }

  private free(key: string) { const s = this.spots[key]; return s && !s.taken; }
  private reserve(r: Resident, key: string) { this.release(r); const s = this.spots[key]; s.taken = r.id; r.spot = s; return s; }
  private release(r: Resident) { if (r.spot && r.spot.taken === r.id) r.spot.taken = null; r.spot = null; }
  private freeOf(keys: string[]) { const f = keys.filter((k) => this.free(k)); return f.length ? f[Math.floor(Math.random() * f.length)] : null; }

  private async goTo(r: Resident, s: Spot) {
    await this.walk(r, { x: s.x, y: s.y }, s.via ?? []);
    if (!r.alive) return;
    r.w.face(s.face);
  }

  /** Walk along the walkways; throws if the robot is picked up on the way. */
  private async walk(r: Resident, to: Pt, via: Pt[] = []) {
    if (r.held) throw GRABBED;
    await r.w.walkPath(this.plan({ x: r.w.x, y: r.w.y }, to, via));
    if (r.held) throw GRABBED;
  }

  /** Robots that could join a game now: free, or only idling. */
  private available(except: Resident) {
    return [...this.res.values()].filter((o) => o !== except && o.alive && !o.held && !o.group && !o.pull && (!o.busy || o.soft) && this.host?.r !== o && this.host?.guest !== o);
  }

  private async live(r: Resident) {
    r.busy = true;
    const now = performance.now() / 1000;
    // thrown around in the middle of something: go back to it if the spot is still free
    const back = r.resume;
    r.resume = null;
    if (back && this.free(back.key) && !r.pull) {
      try { await this.resumeDoing(r, back); } catch { /* picked up again, or left */ }
      r.doing = null;
      this.done(r);
      return;
    }
    const ok = (k: Kind) => k !== r.last && (r.cool[k] ?? 0) <= now;
    // invited to a game, or a game nearby has room
    const invited = r.pull;
    if (invited) {
      r.pull = null;
      invited.recruits.delete(r);
      if (invited.alive) { await this.joinGroup(invited, r).catch(() => {}); this.done(r); return; }
    }
    for (const kind of GROUPS) {
      const g = this.groups[kind];
      if (!g || !g.alive || !ok(kind)) continue;
      const seat = g.open && g.seats.some((k) => this.free(k));
      const watch = g.extraSeats.some((k) => this.free(k));
      if ((seat && Math.random() < (kind === "movie" ? 0.7 : 0.5)) || (watch && Math.random() < 0.3)) {
        await this.joinGroup(g, r).catch(() => {});
        this.done(r);
        return;
      }
    }
    const h = this.host;
    if (h && h.r !== r && h.r.alive && !h.guest && ok("chat") && Math.random() < 0.85) {
      h.guest = r;
      r.last = "chat";
      r.cool.chat = now + COOLDOWN.chat;
      try { await this.joinChat(r, h); } catch { /* left */ }
      this.done(r);
      return;
    }
    const options: Kind[] = [];
    if (ok("microwave") && this.free("microwave") && this.freeOf(["seatN1", "seatN2", "seatS1", "seatS2"])) options.push("microwave");
    if (ok("coffee") && this.free("coffee")) options.push("coffee");
    if (ok("charge") && this.freeOf(DOCKS.map((_, i) => `dock${i}`))) options.push("charge");
    if (ok("nap") && this.freeOf(["pod", "beanbag"])) options.push("nap");
    if (ok("window") && this.freeOf(["window1", "window2"])) options.push("window");
    if (ok("fridge") && this.free("fridge")) options.push("fridge");
    const partner = [...this.res.values()].find((o) => o !== r && o.alive && !o.busy && !o.held && !o.pull && (o.cool.chat ?? 0) <= now && o.last !== "chat");
    if (ok("chat") && !this.host && this.chatSpots()) options.push("chat");
    // two or more robots free (this one included): a group game can start
    const others = this.available(r).length;
    const startable = (k: GroupKind) => !this.groups[k] && (k !== 'console' || this.arcade.powered) && (this.rested[k] ?? 0) <= now && others >= 1;
    for (const k of GROUPS) if (ok(k) && startable(k)) options.push(k);
    let kind: Kind | null = null;
    if (this.force && startable(this.force)) { kind = this.force; this.force = null; }
    const total = options.reduce((s, k) => s + WEIGHTS[k], 0);
    let roll = Math.random() * total;
    if (!kind) for (const k of options) { roll -= WEIGHTS[k]; if (roll <= 0) { kind = k; break; } }
    try {
      if (!kind) { await this.wander(r); }
      else {
        r.last = kind;
        r.cool[kind] = now + COOLDOWN[kind];
        if ((GROUPS as Kind[]).includes(kind)) {
          await this.runGroup(kind as GroupKind, r);
        } else if (kind === "chat" && partner) {
          partner.busy = true;
          partner.last = "chat";
          partner.cool.chat = now + COOLDOWN.chat;
          try { await this.chat(r, partner); } finally { this.done(partner); }
        } else if (kind === "chat") {
          await this.hostChat(r);
        } else {
          const run = ({ microwave: this.microwave, coffee: this.coffee, charge: this.charge, nap: this.nap, window: this.lookOut, fridge: this.fridge } as Record<string, (r: Resident) => Promise<void>>)[kind];
          await run.call(this, r);
        }
      }
    } catch { /* a resident that left mid-activity (or was pulled into a game, or picked up) just stops */ }
    r.doing = null;
    r.soft = false;
    r.interrupt = null;
    this.done(r);
  }

  private done(r: Resident) {
    if (!r.alive) return;
    r.busy = false;
    r.group = null;
    r.soft = false;
    r.nextAt = performance.now() + (r.pull ? 0 : 400 + Math.random() * 1200);
  }

  /** A delayed call that destroy() can cancel. */
  private later(sec: number, fn: () => void) {
    const c = gsap.delayedCall(sec, () => { this.calls.delete(c); fn(); });
    this.calls.add(c);
    return c;
  }

  private wait(sec: number, r: Resident) {
    return new Promise<void>((res, rej) => {
      if (r.held) { rej(GRABBED); return; }
      const stop = (e: Error) => { c.kill(); this.calls.delete(c); r.stops.delete(stop); if (r.interrupt === pulled) r.interrupt = null; rej(e); };
      const pulled = () => stop(new Error("pulled"));
      const c = this.later(sec, () => { r.stops.delete(stop); if (r.interrupt === pulled) r.interrupt = null; if (r.alive) res(); else rej(new Error("left")); });
      r.stops.add(stop);
      if (r.soft) { if (r.pull) pulled(); else r.interrupt = pulled; }
    });
  }

  /** Await something that is not a wait (a machine, another robot) but stop if picked up. */
  private until<T>(r: Resident, p: Promise<T>) {
    if (r.held) return Promise.reject(GRABBED);
    return new Promise<T>((res, rej) => {
      const stop = (e: Error) => { r.stops.delete(stop); rej(e); };
      r.stops.add(stop);
      p.then((v) => { if (!r.stops.has(stop)) return; r.stops.delete(stop); res(v); }, (e) => { r.stops.delete(stop); rej(e); });
    });
  }

  // ---- toys: picked up and thrown -------------------------------------------------------------------
  /** Picked up: whatever it was doing stops cleanly (a two-player game ends, a chat breaks off). */
  private grab(r: Resident) {
    if (!r.alive) return;
    r.held = true;
    r.resume = r.doing;
    r.doing = null;
    r.w.grabbed(true);
    r.interrupt = null;
    if (r.pull) { r.pull.recruits.delete(r); r.pull = null; }
    const g = r.group;
    if (g) { this.lost(g, r); r.group = null; }
    if (this.host?.r === r) this.host.end();
    this.release(r);
    for (const s of [...r.stops]) s(GRABBED);
    r.w.say(null);
    r.w.hold("none", "none");
    r.w.mashRate = 1;
    // a chat partner is left talking to nobody
    const m = r.mate;
    if (m && m.alive) { r.mate = null; m.mate = null; for (const s of [...m.stops]) s(new Error("partner left")); this.later(0.4, () => m.alive && !m.held && m.w.say(line("partnerLeft", m.w), 1600)); }
  }

  /** Put down again: off any furniture it landed on, then back to what it was doing (or something new). */
  private landed(r: Resident) {
    r.w.grabbed(false);
    if (!r.alive) return;
    const p = this.freePoint({ x: r.w.x, y: r.w.y });
    const settle = async () => {
      // landed on a table or the couch: hop off it rather than walk through it
      if (Math.hypot(p.x - r.w.x, p.y - r.w.y) > 2) {
        r.w.hop();
        await new Promise<void>((res) => gsap.to(r.w, { x: p.x, y: p.y, duration: 0.42, ease: "power1.inOut", onUpdate: () => r.w.setPos(r.w.x, r.w.y), onComplete: res }));
      }
      if (!r.alive || r.held) return;
      r.held = false;
      r.busy = false;
      r.group = null;
      r.nextAt = performance.now() + 900;
    };
    r.held = false;
    r.busy = true;
    void settle();
  }

  private async stand(r: Resident) {
    if (r.spot?.sit) { r.w.calm(); await this.wait(0.35, r); }
  }

  // ---- activities ---------------------------------------------------------------------------------
  private async wander(r: Resident) {
    r.soft = true;
    this.release(r);
    // somewhere open in the room
    let p = { x: 520 + Math.random() * 200, y: 300 + Math.random() * 60 };
    for (let i = 0; i < 8; i++) {
      const q = { x: 140 + Math.random() * (this.w - 280), y: WALL + 150 + Math.random() * (this.h - WALL - 230) };
      if (this.freePoint(q) === q) { p = q; break; }
    }
    p = this.freePoint(p);
    await this.walk(r, p);
    r.w.face(Math.random() < 0.5 ? "down" : "up");
    r.w.do("idle");
    if (Math.random() < 0.25) this.later(1.2, () => r.alive && !r.held && r.w.activity === "idle" && r.w.say(musing(r.w).text, 2600, true));
    await this.wait(2 + Math.random() * 2, r);
  }

  /** Something to say over a meal or a coffee: its own or today's news sometimes, a remark that
   *  fits its hobby, or a passing thought. */
  private aside(r: Resident, kind: "meal" | "coffee") {
    const m = musing(r.w);
    if (m.spoken) { r.w.say(m.text); return; }
    if (Math.random() < 0.5) r.w.say(line(kind, r.w)); else r.w.say(m.text, undefined, Math.random() < 0.5);
  }

  private async microwave(r: Resident) {
    await this.stand(r);
    const seatKey = this.freeOf(["seatN1", "seatN2", "seatS1", "seatS2"])!;
    const seat = this.spots[seatKey];
    seat.taken = r.id;
    try {
      await this.goTo(r, this.reserve(r, "microwave"));
      seat.taken = r.id;
      r.w.poke();
      await this.wait(0.3, r);
      const secs = 7 + Math.floor(Math.random() * 4);
      const cook = this.runMicrowave(secs);
      r.w.do("wait");
      await this.wait(secs + 0.2, r);
      await this.until(r, cook);
      r.w.do("idle");
      r.w.hop();
      r.w.hold("bowl", "spoon");
      await this.wait(0.5, r);
      this.release(r);
      r.spot = seat;
      await this.goTo(r, seat);
      await this.eatAt(r, seat, 9 + Math.random() * 6);
    } finally {
      if (seat.taken === r.id && r.spot !== seat) seat.taken = null;
    }
  }

  private async eatAt(r: Resident, seat: Spot, secs: number) {
    r.w.hold("bowl", "spoon");
    r.w.do("sit", { keep: true });
    await this.wait(0.7, r);
    r.w.do("eat", { keep: true });
    r.doing = { kind: "eat", key: seat.key };
    if (Math.random() < 0.5) this.later(2.4, () => r.alive && r.w.activity === "eat" && this.aside(r, "meal"));
    await this.wait(secs, r);
    r.doing = null;
    r.w.calm();
    r.w.hold("none", "none");
  }

  private async coffee(r: Resident) {
    await this.stand(r);
    await this.goTo(r, this.reserve(r, "coffee"));
    r.w.poke();
    await this.wait(0.3, r);
    r.w.do("idle");
    await this.until(r, this.brew());
    r.w.hold("none", "mug");
    await this.wait(0.4, r);
    const where = this.freeOf(["window1", "window2", "couch1", "couch2"]);
    if (where) {
      const s = this.reserve(r, where);
      await this.goTo(r, s);
      await this.drinkAt(r, s, 8 + Math.random() * 5);
    } else await this.drinkAt(r, null, 8 + Math.random() * 5);
  }

  private async drinkAt(r: Resident, s: Spot | null, secs: number) {
    r.w.hold("none", "mug");
    if (s?.sit) { r.w.do("sit", { keep: true }); await this.wait(0.6, r); }
    r.w.do("drink", { keep: true });
    if (s) r.doing = { kind: "drink", key: s.key };
    if (Math.random() < 0.4) this.later(2.5, () => r.alive && r.w.activity === "drink" && this.aside(r, "coffee"));
    else if (s && !s.sit && Math.random() < 0.5) this.later(4, () => r.alive && r.w.activity === "drink" && r.w.say(thought(r.w, "window"), 2800, true));
    await this.wait(secs, r);
    r.doing = null;
    r.w.calm();
    r.w.hold("none", "none");
  }

  private async charge(r: Resident) {
    await this.stand(r);
    const key = this.freeOf(DOCKS.map((_, i) => `dock${i}`))!;
    await this.goTo(r, this.reserve(r, key));
    await this.chargeAt(r, key, 16 + Math.random() * 8);
  }

  private async chargeAt(r: Resident, key: string, secs: number) {
    const i = Number(key.slice(4));
    r.w.do("charge");
    r.doing = { kind: "charge", key };
    this.dock(i, true);
    await this.wait(secs, r).finally(() => this.dock(i, false));
    r.doing = null;
    r.w.calm();
    r.w.hop();
    r.w.setExpression("happy");
    await this.wait(0.8, r);
    r.w.setExpression("neutral");
  }

  private async nap(r: Resident) {
    await this.stand(r);
    const key = this.freeOf(["pod", "beanbag"])!;
    await this.goTo(r, this.reserve(r, key));
    await this.napAt(r, key, 14 + Math.random() * 8);
  }

  private async napAt(r: Resident, key: string, secs: number) {
    r.w.do("sit");
    await this.wait(0.8, r);
    r.w.do("nap");
    r.doing = { kind: "nap", key };
    if (key === "pod") gsap.to(this.$.podGlow, { opacity: 0.9, duration: 1.5 });
    // dreams, now and then
    if (Math.random() < 0.6) this.later(4 + Math.random() * 4, () => r.alive && r.w.activity === "nap" && r.w.say(thought(r.w, "nappod"), 3200, true));
    await this.wait(secs, r).finally(() => { if (key === "pod" && !this.dead) gsap.to(this.$.podGlow, { opacity: 0.25, duration: 1 }); });
    r.doing = null;
    r.w.do("sit");
    r.w.setExpression("surprised");
    r.w.hop();
    await this.wait(0.7, r);
    r.w.setExpression("neutral");
  }

  private async lookOut(r: Resident) {
    await this.stand(r);
    const key = this.freeOf(["window1", "window2"])!;
    await this.goTo(r, this.reserve(r, key));
    await this.windowAt(r, key, 6 + Math.random() * 4);
  }

  private async windowAt(r: Resident, key: string, secs: number) {
    r.soft = true;
    r.w.do("idle");
    r.doing = { kind: "window", key };
    if (Math.random() < 0.6) this.later(1.5, () => r.alive && !r.group && !r.held && r.w.say(musing(r.w, "window").text, undefined, true));
    await this.wait(secs, r);
    r.doing = null;
  }

  /** Back to what it was doing before it got picked up. */
  private async resumeDoing(r: Resident, d: Doing) {
    const s = this.reserve(r, d.key);
    if (Math.random() < 0.6) r.w.say(line("back", r.w), 1400);
    if (d.kind === "eat") r.w.hold("bowl", "spoon");
    if (d.kind === "drink") r.w.hold("none", "mug");
    await this.goTo(r, s);
    if (d.kind === "eat") await this.eatAt(r, s, 5 + Math.random() * 4);
    else if (d.kind === "drink") await this.drinkAt(r, s, 5 + Math.random() * 3);
    else if (d.kind === "charge") await this.chargeAt(r, d.key, 8 + Math.random() * 6);
    else if (d.kind === "nap") await this.napAt(r, d.key, 8 + Math.random() * 6);
    else await this.windowAt(r, d.key, 4 + Math.random() * 3);
  }

  private async fridge(r: Resident) {
    await this.stand(r);
    await this.goTo(r, this.reserve(r, "fridge"));
    r.w.poke();
    const close = () => {
      if (this.dead) return;
      gsap.to(this.$.fridgeDoor, { scaleX: 1, duration: 0.4, ease: "power2.in", onComplete: () => this.machine("fridge-close", this.$.fridgeLight) });
      gsap.to(this.$.fridgeLight, { opacity: 0, duration: 0.3, delay: 0.3 });
    };
    this.machine("fridge-open", this.$.fridgeLight, .9);
    gsap.to(this.$.fridgeDoor, { scaleX: 0.12, duration: 0.45, ease: "power2.out", transformOrigin: "0% 50%" });
    gsap.to(this.$.fridgeLight, { opacity: 1, duration: 0.3 });
    try {
      r.w.do("idle");
      await this.wait(1.6, r);
      r.w.say(Math.random() < 0.7 ? thought(r.w, "fridge") : line("fridge", r.w));
      await this.wait(1.6, r);
    } finally { close(); }
    await this.wait(0.8, r);
  }

  private chatSpots(): [string, string] | null {
    const pairs: [string, string][] = [["chatA1", "chatA2"], ["chatB1", "chatB2"], ["couch1", "couch2"]];
    const free = pairs.filter(([a, b]) => this.free(a) && this.free(b));
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  private async hostChat(r: Resident) {
    const pair = this.chatSpots();
    if (!pair) return;
    await this.stand(r);
    let end = () => {};
    const over = new Promise<void>((res) => (end = res));
    const h = (this.host = { r, pair, guest: null as Resident | null, arrived: false, over, end });
    this.spots[pair[1]].taken = "guest";
    try {
      const sa = this.reserve(r, pair[0]);
      await this.goTo(r, sa);
      r.w.do(sa.sit ? "sit" : "idle");
      for (let t = 0; t < 12 && !h.arrived; t += 0.5) {
        if (!h.guest && t > 9) break;
        await this.wait(0.5, r);
      }
      if (h.arrived && h.guest) await this.converse(r, h.guest, sa.sit ?? false);
    } finally {
      if (this.spots[pair[1]].taken === "guest") this.spots[pair[1]].taken = null;
      if (this.host === h) this.host = null;
      h.end();
    }
  }

  private async joinChat(g: Resident, h: NonNullable<BreakRoom["host"]>) {
    await this.stand(g);
    const s = this.spots[h.pair[1]];
    this.release(g);
    s.taken = g.id;
    g.spot = s;
    await this.goTo(g, s);
    if (s.sit) g.w.do("sit");
    h.arrived = true;
    await this.until(g, h.over);
    if (g.spot === s) this.release(g);
  }

  private async chat(a: Resident, b: Resident) {
    const pair = this.chatSpots();
    if (!pair) return;
    await Promise.all([this.stand(a), this.stand(b)]);
    const sa = this.reserve(a, pair[0]), sb = this.reserve(b, pair[1]);
    await Promise.all([this.goTo(a, sa), this.goTo(b, sb)]);
    await this.converse(a, b, sa.sit ?? false);
  }

  /** A conversation from the content pack (or today's pack, or a classic joke); a laugh at the end. */
  private async converse(a: Resident, b: Resident, sit: boolean) {
    a.mate = b; b.mate = a;
    try {
      if (sit) { a.w.do("sit"); b.w.do("sit"); await this.wait(0.6, a); }
      else { a.w.face(a.spot?.face ?? "right"); b.w.face(b.spot?.face ?? "left"); }
      // side by side on the couch they turn their heads to each other
      a.w.lookToward(b.w.x); b.w.lookToward(a.w.x);
      const lines = conversation();
      for (let i = 0; i < lines.length; i++) {
        const x = i % 2 ? b : a, y = i % 2 ? a : b;
        x.w.do("talk", { keep: true });
        y.w.do("listen", { keep: true });
        x.w.lookToward(y.w.x); y.w.lookToward(x.w.x);
        x.w.say(lines[i], 2100 + lines[i].length * 30);
        await this.wait(2.3 + lines[i].length * 0.03, x);
      }
      // whoever heard the last line laughs; the other one often joins in
      const last = lines.length % 2 ? b : a, other = last === a ? b : a;
      last.w.do("laugh", { keep: true });
      last.w.say(line("laugh", last.w), 1300);
      if (Math.random() < 0.6) this.later(0.25, () => other.alive && !other.held && other.w.do("laugh", { keep: true }));
      await this.wait(2.1, last);
    } finally {
      a.mate = null; b.mate = null;
    }
    for (const r of [a, b]) if (r.alive && !r.held) { r.w.calm(); r.w.lookToward(null); }
    this.release(a); this.release(b);
  }

  // ---- group games: hosting, recruiting, joining -----------------------------------------------------
  private async runGroup(kind: GroupKind, host: Resident) {
    const seats = { pingpong: ["ppA", "ppB"], chess: Math.random() < 0.5 ? ["chessW", "chessB"] : ["chessB", "chessW"], console: ["gameP1", "gameP2"], movie: ["movie1", "movie2", "movie0", "movie3"] }[kind];
    const extras = { pingpong: [], chess: ["chessS1", "chessS2"], console: ["gameS"], movie: [] }[kind];
    if (!seats.every((k) => this.free(k) || kind === "movie")) return;
    const g = new Group(kind, host, seats, extras);
    this.groups[kind] = g;
    host.group = g;
    g.players.push(host);
    try {
      await this.stand(host);
      await ({ pingpong: this.pingpong, chess: this.chess, console: this.console, movie: this.movieNight } as Record<GroupKind, (g: Group) => Promise<void>>)[kind].call(this, g);
    } catch { /* the game ended early */ }
    finally {
      const all = [...g.players, ...g.extras];
      for (const r of g.recruits) if (r.pull === g) r.pull = null;
      g.end();
      if (this.groups[kind] === g) delete this.groups[kind];
      this.rested[kind] = performance.now() / 1000 + REST[kind];
      if (!this.dead) {
        this.resetCorner(kind);
        const stay = all.filter((r) => r.alive && r.group === g);
        if (g.lostOne && stay.length && kind !== "movie") stay[0].w.say(line("quitGame", stay[0].w));
        for (const r of stay) { r.w.calm(); r.w.hold("none", "none"); r.w.mashRate = 1; this.release(r); }
      }
    }
  }

  /** Put a game's corner back to rest. */
  private resetCorner(kind: GroupKind) {
    if (kind === "pingpong") this.pp.hide();
    else if (kind === "console") this.arcade.standby();
    else if (kind === "chess") void this.chessT.setup();
    else void this.movie.stop();
  }

  /** Invite up to `n` robots that are free or only idling. */
  private recruit(g: Group, n: number) {
    const pool = this.available(g.host).sort((a, b) => Number(a.busy) - Number(b.busy) || Math.random() - 0.5);
    for (const o of pool.slice(0, n)) {
      o.pull = g;
      g.recruits.add(o);
      if (o.busy) o.interrupt?.();
      else o.nextAt = 0;
    }
  }

  /** The host walks to its seat. */
  private async seatHost(g: Group) {
    const key = g.seats.find((k) => this.free(k))!;
    const s = this.reserve(g.host, key);
    await g.until(this.goTo(g.host, s));
    g.arrived.add(g.host);
  }

  /** Wait until `need` players sit down; invite more while waiting. Resolves false on timeout. */
  private async gather(g: Group, need: number, timeout: number) {
    for (let t = 0; t < timeout; t += 0.4) {
      if (g.here.length >= need) return true;
      const coming = g.players.length + g.recruits.size;
      if (coming < need && t > 1) this.recruit(g, need - coming);
      await g.wait(0.4);
    }
    return g.here.length >= need;
  }

  private async joinGroup(g: Group, r: Resident) {
    const now = performance.now() / 1000;
    const key = (g.open && g.seats.find((k) => this.free(k))) || g.extraSeats.find((k) => this.free(k));
    if (!key || !g.alive) return;
    // claim the seat now: while it stands up someone else (the host) could take it, and two
    // robots would end up on one seat
    const spotNow = r.spot;
    this.spots[key].taken = r.id;
    const extra = g.extraSeats.includes(key);
    r.group = g;
    (extra ? g.extras : g.players).push(r);
    r.last = g.kind;
    r.cool[g.kind] = now + COOLDOWN[g.kind];
    try { await this.stand(r); } catch (err) { if (this.spots[key].taken === r.id) this.spots[key].taken = null; throw err; }
    if (spotNow && spotNow.taken === r.id) spotNow.taken = null;
    const s = this.reserve(r, key);
    if (!extra && Math.random() < 0.4) r.w.say(line("joinGame", r.w), 1200);
    await g.until(this.goTo(r, s));
    g.arrived.add(r);
    g.onArrive(r);
    if (extra) {
      // spectators watch for a while, then wander off
      await Promise.race([this.until(r, g.done), this.wait(20 + Math.random() * 20, r)]);
      g.extras = g.extras.filter((x) => x !== r);
      g.arrived.delete(r);
      if (r.alive) { r.w.calm(); this.release(r); }
      return;
    }
    await this.until(r, g.done);
  }

  /** Small helper: an animation as a promise the game can abandon. */
  private anim(g: Group, a: gsap.core.Animation) {
    return g.until(new Promise<void>((res) => { a.eventCallback("onComplete", () => res()); }));
  }

  // ---- ping pong -------------------------------------------------------------------------------------
  private async pingpong(g: Group) {
    const host = g.host;
    host.w.say(line("pingpongInvite", host.w), 1800);
    this.recruit(g, 1);
    await this.seatHost(g);
    host.w.do("ready");
    if (!(await this.gather(g, 2, 16))) { host.w.say(line("pingpongAlone", host.w), 1800); await g.wait(1.5); return; }
    g.open = false;
    let P = this.ppOrder(g);
    for (const p of P) { p.w.face(p.spot!.face); p.w.do("ready"); }
    await g.wait(0.6);
    for (let game = 0; game < 2; game++) {
      const score = [0, 0];
      this.pp.setScore(0, 0);
      let serves = 0, server: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
      const skill = [0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4];
      while (score[0] < 5 && score[1] < 5) {
        const { won, fetcher } = await this.rally(g, P, server, skill);
        score[won]++;
        this.pp.setScore(score[0], score[1]);
        const W = P[won], L = P[won ? 0 : 1];
        if (Math.random() < 0.3) W.w.say(line("point", W.w), 1200);
        else if (Math.random() < 0.3) L.w.say(line("salty", L.w), 1500);
        if (score[0] < 5 && score[1] < 5) await this.fetchBall(g, fetcher);
        else this.pp.hide();
        if (++serves % 2 === 0) server = server ? 0 : 1;
        await g.wait(0.6);
      }
      const won = score[0] >= 5 ? 0 : 1;
      const W = P[won], L = P[won ? 0 : 1];
      W.w.do("cheer");
      W.w.say(line("pingpongWin", W.w), 2000);
      if (Math.random() < 0.5) {
        L.w.do("sulk");
        await g.wait(0.8);
        L.w.say(line("salty", L.w), 2000);
        await g.wait(2.6);
      } else {
        // good sports: meet at the net for a high five
        await g.wait(1.2);
        const ny = this.pp.cy + 116;
        await g.until(Promise.all([P[0].w.walkPath([{ x: P[0].w.x, y: ny }, { x: this.pp.net - 22, y: ny }]), P[1].w.walkPath([{ x: P[1].w.x, y: ny }, { x: this.pp.net + 22, y: ny }])]));
        P[0].w.face("right"); P[1].w.face("left");
        P[0].w.calm(); P[1].w.calm();
        P[0].w.highFive(); P[1].w.highFive();
        L.w.say(line("goodLoser", L.w), 1600);
        await g.wait(1.6);
        await g.until(Promise.all(P.map((p) => p.w.walkPath([{ x: p.w.x, y: ny }, { x: p.spot!.x, y: ny }, { x: p.spot!.x, y: p.spot!.y }]))));
      }
      if (game === 1 || Math.random() < 0.55) break;
      // rematch: swap ends, walking around the table
      L.w.say(line("switchSides", L.w), 1600);
      const [a, b] = P;
      const sa = a.spot!, sb = b.spot!;
      this.release(a); this.release(b);
      sb.taken = a.id; a.spot = sb; sa.taken = b.id; b.spot = sa;
      const y1 = this.pp.cy + 114, y2 = this.pp.cy + 134;
      await g.until(Promise.all([
        a.w.walkPath([{ x: a.w.x, y: y1 }, { x: sb.x, y: y1 }, { x: sb.x, y: sb.y }]),
        b.w.walkPath([{ x: b.w.x, y: y2 }, { x: sa.x, y: y2 }, { x: sa.x, y: sa.y }]),
      ]));
      P = this.ppOrder(g);
      for (const p of P) { p.w.face(p.spot!.face); p.w.do("ready"); }
      await g.wait(0.8);
    }
    await g.wait(1.2);
  }

  private ppOrder(g: Group): [Resident, Resident] {
    const [a, b] = g.here;
    return a.spot?.key === "ppA" ? [a, b] : [b, a];
  }

  /** One rally. Resolves with the side that won the point and who has to fetch the ball. */
  private async rally(g: Group, P: [Resident, Resident], server: 0 | 1, skill: number[]): Promise<{ won: 0 | 1; fetcher: Resident }> {
    const pp = this.pp;
    const row = (k: number) => pp.row(k as 0 | 1);
    const S = P[server];
    S.w.do("ready");
    await g.wait(0.5 + Math.random() * 0.5);
    g.later(0.28, () => S.w.swing(0.22));
    await g.until(pp.toss(S.w.handPoint(), row(server)));
    let from = server, hits = 0, dur = 1.0;
    for (;;) {
      const to = from ? 0 : 1;
      const A = P[from], B = P[to];
      const a = A.w.handPoint();
      const b = { x: B.w.x - (a.x - A.w.x), y: B.w.y + (a.y - A.w.y) };
      const pMiss = hits === 0 ? 0.05 : Math.min(0.55, (0.06 + hits * 0.035) / skill[to]);
      if (Math.random() < pMiss) {
        const kind = Math.random() < 0.55 ? "pass" : Math.random() < 0.5 ? "net" : "long";
        if (kind === "pass") g.later(dur * 0.95, () => B.w.whiff());
        const rest = await g.until(pp.miss(kind, a, b, row(from), row(to), dur));
        const loser = kind === "pass" ? to : from;
        if (kind === "net" && Math.random() < 0.5) A.w.say(line("net", A.w), 1200);
        if (kind === "pass" && Math.random() < 0.4) B.w.say(line("pass", B.w), 1200);
        // whoever is on the side the ball rolled to fetches it
        return { won: loser ? 0 : 1, fetcher: rest.x < pp.net ? P[0] : P[1] };
      }
      g.later(Math.max(0, dur - 0.2), () => B.w.swing(0.2));
      await g.until(pp.shot(a, b, row(from), row(to), dur, hits === 0));
      hits++;
      from = to;
      dur = Math.max(0.42, dur - 0.05);
    }
  }

  private async fetchBall(g: Group, r: Resident) {
    const at = this.pp.at, home = r.spot!;
    await g.wait(0.3);
    r.w.calm();
    const side = r.w.x < at.x ? -1 : 1;
    const stand = this.freePoint({ x: at.x + side * 18, y: at.y });
    await g.until(this.walk(r, stand));
    r.w.face(stand.x < at.x ? "right" : "left");
    await this.anim(g, r.w.pickUp());
    this.pp.hide();
    r.w.hold("ball", "paddle");
    if (Math.random() < 0.25) r.w.say(line("fetchBall", r.w), 1300);
    await g.until(this.walk(r, { x: home.x, y: home.y }));
    r.w.face(home.face);
    r.w.do("ready");
  }

  // ---- chess ----------------------------------------------------------------------------------------
  private async chess(g: Group) {
    const host = g.host, t = this.chessT;
    g.onArrive = (r) => { if (g.extras.includes(r)) { r.w.face("down"); r.w.do("listen"); } };
    host.w.say(line("chessInvite", host.w), 1800);
    this.recruit(g, 1);
    await this.seatHost(g);
    host.w.do("sit");
    if (!(await this.gather(g, 2, 16))) { host.w.say(line("chessAlone", host.w), 1600); await g.wait(1.5); return; }
    g.open = false;
    const [p, q] = g.here;
    const W = p.spot?.key === "chessW" ? p : q, B = W === p ? q : p;
    W.w.do("sit"); B.w.do("sit");
    await g.until(t.setup());
    const pool = GAMES.filter((x) => x !== this.lastGame);
    const game = this.nextGame ?? pickOne(pool);
    this.nextGame = null;
    this.lastGame = game;
    const spectators = () => g.extras.filter((r) => g.has(r) && g.arrived.has(r));
    for (let i = 0; i < game.moves.length; i++) {
      const mover = i % 2 ? B : W, other = i % 2 ? W : B;
      const book = i < 8;
      let think = book ? 0.6 + Math.random() * 0.8 : 1.2 + Math.random() * 2.4;
      if (!book && Math.random() < 0.25) {
        mover.w.do("think", { seated: true });
        think += 1.5;
      }
      if (!book && Math.random() < 0.12) mover.w.say(line("chessThink", mover.w), 1600, true);
      await g.wait(think);
      if (mover.w.activity === "think") { mover.w.do("sit"); await g.wait(0.3); }
      mover.w.poke();
      await g.wait(0.18);
      const res = await g.until(t.move(game.moves[i]));
      if (res.capture) {
        if (Math.random() < 0.3) other.w.say(line("captured", other.w), 1200);
        for (const s of spectators()) if (Math.random() < 0.5) { s.w.say(line("spectate", s.w), 1100); s.w.hop(); }
      }
      if (Math.random() < 0.1) other.w.do("think", { seated: true });
      else if (other.w.activity !== "sit") other.w.do("sit");
    }
    const winner = game.winner === "w" ? W : B, loser = winner === W ? B : W, loserWhite = loser === W;
    if (game.result === "mate") {
      winner.w.say(line("checkmate", winner.w), 1800);
      t.flashKing(loserWhite);
      await g.wait(1.6);
    } else {
      loser.w.do("think", { seated: true });
      await g.wait(1.8);
      loser.w.do("sit");
      loser.w.say(line("resign", loser.w), 1800);
      await g.wait(0.8);
    }
    loser.w.poke();
    await g.wait(0.2);
    await g.until(t.tip(loserWhite));
    await g.wait(0.6);
    const watcher = spectators()[0];
    (watcher ?? winner).w.say(game.quip, 2600);
    if (watcher) watcher.w.do("cheer");
    await g.wait(1.4);
    W.w.calm(); B.w.calm();
    await g.wait(0.4);
    if (Math.random() < 0.65) {
      W.w.face("right"); B.w.face("left");
      W.w.shake(); B.w.shake();
      loser.w.say(line("chessGG", loser.w), 1600);
    } else {
      winner.w.do("cheer");
      loser.w.do("sulk");
      loser.w.say(line("chessExcuse", loser.w), 1800);
    }
    await g.wait(2.6);
  }

  // ---- game console ---------------------------------------------------------------------------------
  private async console(g: Group) {
    const host = g.host;
    g.onArrive = (r) => { if (g.extras.includes(r)) { r.w.face("up"); r.w.do("idle"); } };
    host.w.say(line("kartInvite", host.w), 1800);
    this.recruit(g, 1);
    await this.seatHost(g);
    host.w.do("sit");
    if (!(await this.gather(g, 2, 16))) { host.w.say(line("kartAlone", host.w), 1500); await g.wait(1.5); return; }
    g.open = false;
    const [p, q] = g.here;
    const P: [Resident, Resident] = p.spot?.key === "gameP1" ? [p, q] : [q, p];
    for (const r of P) r.w.do("play", { seated: true });
    await g.until(this.arcade.boot());
    const rounds = Math.random() < 0.45 ? 2 : 1;
    for (let round = 0; round < rounds; round++) {
      const watcher = () => g.extras.find((r) => g.has(r) && g.arrived.has(r));
      const ev = (e: GameEvent) => {
        if (!g.alive) return;
        const by = P[e.by], vs = P[e.by ? 0 : 1];
        if (e.type === "hit" || e.type === "big" || e.type === "boost") {
          by.w.mashRate = 2.5;
          g.later(0.7, () => (by.w.mashRate = 1));
        }
        if (e.type === "big" && Math.random() < 0.5) vs.w.say(line("kartHit", vs.w), 1100);
        if (e.type === "spin" && Math.random() < 0.6) by.w.say(line("kartSpin", by.w), 1200);
        if (e.type === "overtake" && Math.random() < 0.4) by.w.say(line("kartPass", by.w), 1000);
        const wt = watcher();
        if (wt && (e.type === "big" || e.type === "spin") && Math.random() < 0.5) { wt.w.do("laugh", { keep: true }); g.later(1.6, () => wt.w.activity === "laugh" && wt.w.do("idle")); }
      };
      const brands: [typeof p.w.brand, typeof p.w.brand] = [P[0].w.brand, P[1].w.brand];
      const won = await g.until(Math.random() < 0.5 ? this.arcade.fight(brands, ev) : this.arcade.race(brands, ev));
      const W = P[won], L = P[won ? 0 : 1];
      W.w.do("cheer");
      W.w.say(line("kartWin", W.w), 1800);
      if (Math.random() < 0.6) {
        L.w.do("sulk", { seated: true });
        await g.wait(0.6);
        L.w.say(line("kartExcuse", L.w), 2000);
      } else {
        L.w.do("laugh", { seated: true });
      }
      const wt = watcher();
      if (wt) { wt.w.do(Math.random() < 0.5 ? "laugh" : "cheer"); }
      await g.wait(3);
      if (round + 1 < rounds) {
        L.w.say(line("kartRematch", L.w), 1400);
        for (const r of P) r.w.do("play", { seated: true });
        await g.wait(1);
      }
    }
    this.arcade.standby();
    await g.wait(0.8);
  }

  // ---- movie night ----------------------------------------------------------------------------------
  private async movieNight(g: Group) {
    const host = g.host, mv = this.movie;
    host.w.say(line("movieInvite", host.w), 2000);
    this.recruit(g, 3);
    // popcorn first
    const pop = this.reserve(host, "popcorn");
    await g.until(this.goTo(host, pop));
    host.w.poke();
    await g.until(mv.popcorn());
    host.w.hold("popcorn", "none");
    host.w.hop();
    const watch = (r: Resident) => { if (g.has(r)) r.w.do("watch", { keep: true }); };
    g.onArrive = (r) => { r.w.do("sit"); g.later(0.6, () => watch(r)); };
    await this.seatHost(g);
    host.w.do("sit", { keep: true });
    g.later(0.6, () => watch(host));
    if (!(await this.gather(g, 2, 18))) { host.w.say(line("movieAlone", host.w), 1600); await g.wait(1.5); return; }
    await g.wait(1);
    g.started = true;
    await g.until(mv.start());
    const viewers = () => g.players.filter((r) => g.has(r) && g.arrived.has(r));
    let sleeper: Resident | null = null;
    const awake = () => viewers().filter((r) => r !== sleeper);
    const beat = (b: Beat) => {
      if (!g.alive) return;
      if (mv.isPlaying) this.machine(({ gasp: "movie-gasp", scare: "movie-scare", laugh: "movie-laugh", aww: "movie-aww", credits: "movie-credits" } as const)[b], mv.el, .9);
      const vs = awake();
      if (b === "gasp" || b === "scare") {
        vs.forEach((r, i) => g.later(i * 0.08, () => { if (!g.has(r)) return; r.w.flinch(); g.later(1.4, () => g.has(r) && r.w.setExpression("neutral")); }));
        const loud = pickOne(vs);
        if (loud) loud.w.say(line(b === "scare" ? "movieScare" : "movieGasp", loud.w), 1300);
      } else if (b === "laugh") {
        vs.forEach((r) => { r.w.do("laugh", { seated: true, keep: true }); g.later(1.9, () => watch(r)); });
        const one = pickOne(vs);
        if (one) one.w.say(line("movieLaugh", one.w), 1500);
      } else if (b === "aww") {
        vs.slice(0, 2).forEach((r, i) => g.later(i * 0.5, () => { if (!g.has(r)) return; r.w.setExpression("happy"); r.w.say(line("movieAww", r.w), 1300); g.later(2, () => g.has(r) && r.w.setExpression("neutral")); }));
      } else if (b === "credits") {
        g.open = false;
        if (sleeper && g.has(sleeper)) {
          const s = sleeper;
          sleeper = null;
          s.w.do("sit", { keep: true });
          s.w.setExpression("surprised");
          s.w.hop();
          s.w.say(line("movieWake", s.w), 2000);
          g.later(1.6, () => { if (g.has(s)) { s.w.setExpression("neutral"); watch(s); } });
        }
        g.later(2.6, () => { const c = pickOne(awake()); if (c) c.w.say(line("movieReview", c.w), 2200); });
      }
    };
    const film = mv.play(beat);
    let ended = false;
    void film.then(() => (ended = true));
    // during the film: someone dozes off, neighbours steal popcorn
    for (let t = 0; !ended; t += 1) {
      await g.wait(1);
      const vs = viewers();
      if (!vs.length) break;
      if (t === 15 && !sleeper && vs.length > 1) {
        sleeper = pickOne(vs.filter((r) => r.w.activity === "watch")) ?? null;
        if (sleeper) sleeper.w.do("nap", { keep: true });
      }
      const holder = vs.find((r) => r === host);
      if (holder && t % 6 === 3) {
        const near = vs.filter((r) => r !== holder && r !== sleeper && Math.abs(r.w.x - holder.w.x) < 90 && r.w.activity === "watch");
        const n = pickOne(near);
        if (n) n.w.reachOver(holder.w.x < n.w.x ? -1 : 1);
      }
    }
    await g.until(film);
    await g.wait(0.6);
    void mv.stop();
    for (const r of viewers()) { r.w.calm(); r.w.setExpression("neutral"); }
    await g.wait(1.2);
  }

  // ---- machines ---------------------------------------------------------------------------------------
  private idleMachines() {
    const clock = () => {
      if (this.busyThings.has("microwave")) return;
      const d = new Date();
      this.$.mwDigits.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    clock();
    this.anims.push(gsap.to({}, { duration: 20, repeat: -1, onRepeat: clock }));
    if (!reducedMotion()) this.anims.push(gsap.to(this.$.plantA, { rotation: 2, transformOrigin: "50% 100%", duration: 3.2, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    gsap.set(this.$.podGlow, { opacity: 0.25 });
    for (let i = 0; i < 3; i++) this.$[`dockFill${i}`].setAttribute("width", "0");
  }

  /** A machine or prop sounds from where it stands, only while the room is really in use. */
  private machine(cue: GameCue, at: Element, level = 1) { if (!this.dead) gameSound.at(cue, at, level); }

  /** Nobody in the room: decorative loops stop. */
  private pauseIdle(idle: boolean) { for (const a of this.anims) a.paused(idle); }

  private runMicrowave(secs: number) {
    this.busyThings.add("microwave");
    const $ = this.$;
    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({ onComplete: () => { this.busyThings.delete("microwave"); resolve(); } });
      // door shut, two keypad beeps, the hum while it turns, three dings at the end
      const sound = (cue: GameCue, at: number, level = 1) => tl.call(() => this.machine(cue, $.mwGlow, level), [], at);
      sound("mw-door", 0, .9); sound("mw-beep", .2, .7);
      for (let s = .45; s < secs - .2; s += .95) sound("mw-hum", s, .8);
      sound("mw-ding", secs, 1);
      tl.to($.mwGlow, { opacity: 1, duration: 0.3 }, 0)
        .to($.mwRun, { opacity: 1, duration: 0.25, yoyo: true, repeat: secs * 2 - 1, ease: "steps(1)" }, 0)
        .to({ a: 0 }, { a: Math.PI * 2 * (secs / 4), duration: secs, ease: "none", onUpdate() {
          const a = (this.targets()[0] as { a: number }).a;
          $.mwDot.setAttribute("cx", (36 + Math.cos(a) * 14).toFixed(1));
          $.mwDot.setAttribute("cy", (58 + Math.sin(a) * 3.5).toFixed(1));
        } }, 0);
      for (let s = secs; s >= 0; s--) tl.add(() => ($.mwDigits.textContent = `0:${String(s).padStart(2, "0")}`), secs - s);
      tl.add(() => ($.mwDigits.textContent = "End"), secs)
        .to($.mwGlow, { opacity: 0, duration: 0.3 }, secs)
        .fromTo($.mwDing, { opacity: 1, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1.4, duration: 0.7, ease: "power2.out" }, secs)
        .to($.mwDigits, { opacity: 0, duration: 0.15, yoyo: true, repeat: 3, ease: "steps(1)" }, secs + 0.1)
        .to({}, { duration: 0.4 });
      this.fx.add(tl);
    }).then(() => { const d = new Date(); $.mwDigits.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; gsap.set($.mwDigits, { opacity: 1 }); });
  }

  private brew() {
    const $ = this.$;
    return new Promise<void>((resolve) => {
      this.fx.add(gsap.timeline({ onComplete: resolve })
        .call(() => this.machine("grind", $.cmLight, .8), [], 0)
        .call(() => this.machine("pour", $.cmStream, .9), [], 1.1)
        .call(() => this.machine("pour", $.cmStream, .75), [], 2.4)
        .to($.cmLight, { fill: PAL.mint, duration: 0.2 }, 0)
        .fromTo($.cmStream, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.4 })
        .fromTo($.cmCup, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.2)
        .fromTo($.cmSteam.children, { y: 6, opacity: 0 }, { y: -18, opacity: 0.8, duration: 1.2, stagger: 0.3, repeat: 1, ease: "sine.out" }, 0.6)
        .to($.cmStream, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.3 }, 3.2)
        .to($.cmLight, { fill: "#ff9f5a", duration: 0.2 }, 3.4)
        .to($.cmCup, { opacity: 0, duration: 0.2 }, 3.6)
        .to($.cmSteam.children, { opacity: 0, duration: 0.3 }, 3.6));
    });
  }

  private dock(i: number, on: boolean) {
    if (this.dead) return;
    const fill = this.$[`dockFill${i}`], cable = this.$[`dockCable${i}`], glow = this.$[`dockGlow${i}`];
    gsap.killTweensOf(fill);
    if (on) {
      this.machine("charge", glow, .8);
      gsap.to(cable, { opacity: 1, duration: 0.3 });
      gsap.to(glow, { opacity: 0.7, duration: 0.5 });
      gsap.fromTo(fill, { attr: { width: 3 } }, { attr: { width: 22 }, duration: 18, ease: "none" });
    } else {
      gsap.to(cable, { opacity: 0, duration: 0.3 });
      gsap.to(glow, { opacity: 0, duration: 0.5 });
      gsap.to(fill, { attr: { width: 0 }, duration: 0.6 });
    }
  }

  // ---- furniture ------------------------------------------------------------------------------------------
  private furnish() {
    const st = this.stage;
    const gx = (x: number) => x + this.w - 1900;
    const keep = (svg: SVGSVGElement) => { for (const n of svg.querySelectorAll("[data-b]")) this.$[(n as SVGElement).dataset.b!] = n as SVGElement; };
    // rug and floor pads (flat on the floor)
    keep(st.prop(0, WALL, this.w, this.h - WALL, 1, /* svg */ `
      <ellipse cx="860" cy="${470 - WALL}" rx="210" ry="118" fill="#ff6f91" opacity="0.28"/>
      <ellipse cx="860" cy="${470 - WALL}" rx="180" ry="96" fill="#ff9f5a" opacity="0.22"/>
      <ellipse cx="860" cy="${470 - WALL}" rx="120" ry="58" fill="#ffd27a" opacity="0.18"/>
      <rect x="${gx(1118)}" y="${262 - WALL}" width="244" height="150" rx="18" fill="#3c6f9e" opacity="0.55"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${gx(1130)}" y="${276 + i * 26 - WALL}" width="220" height="7" rx="3.5" fill="#5a8fc0" opacity="0.6"/>`).join("")}
      ${DOCKS.map((x) => `<ellipse cx="${x}" cy="${716 - WALL}" rx="38" ry="13" fill="#3a3f4f" opacity="0.55"/><ellipse cx="${x}" cy="${714 - WALL}" rx="30" ry="9" fill="${PAL.mint}" opacity="0.18"/>`).join("")}
      ${DOCKS.map((x, i) => `<ellipse data-b="dockGlow${i}" cx="${x}" cy="${714 - WALL}" rx="34" ry="11" fill="${PAL.mint}" opacity="0"/>`).join("")}
      <ellipse cx="550" cy="${760 - WALL}" rx="80" ry="16" fill="#2b1d10" opacity="0.14"/>`));
    // fridge
    keep(st.prop(30, 16, 96, 172, 186, /* svg */ `
      <ellipse cx="48" cy="168" rx="46" ry="5" fill="#2b1d10" opacity="0.18"/>
      <rect x="4" y="2" width="88" height="164" rx="12" fill="#c9d0dc"/>
      <rect x="8" y="4" width="80" height="158" rx="10" fill="#e9edf3"/>
      <rect data-b="fridgeLight" x="10" y="60" width="76" height="98" rx="6" fill="#fff6d8" opacity="0"/>
      <g data-b="fridgeDoor">
        <rect x="8" y="58" width="80" height="104" rx="9" fill="#dfe4ec"/>
        <rect x="74" y="74" width="5" height="34" rx="2.5" fill="#9aa3b5"/>
        <rect x="18" y="72" width="26" height="30" rx="2" fill="#fff59a" transform="rotate(-5 31 87)"/>
        <rect x="21" y="80" width="18" height="2" rx="1" fill="#c9a43a"/><rect x="21" y="86" width="14" height="2" rx="1" fill="#c9a43a"/>
        <circle cx="52" cy="122" r="5" fill="${PAL.pink}"/><circle cx="34" cy="134" r="5" fill="${PAL.blue}"/><rect x="44" y="138" width="12" height="9" rx="2" fill="${PAL.mint}"/>
      </g>
      <rect x="8" y="4" width="80" height="50" rx="9" fill="#e3e8ef"/>
      <rect x="74" y="20" width="5" height="22" rx="2.5" fill="#9aa3b5"/>
      <rect x="14" y="8" width="54" height="3" rx="1.5" fill="#fff" opacity="0.7"/>`));
    // counter with sink
    st.prop(124, 96, 420, 86, 182, /* svg */ `
      <rect x="0" y="62" width="420" height="22" rx="4" fill="#9c7f62"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${8 + i * 82}" y="66" width="76" height="14" rx="3" fill="#b0927a"/><rect x="${42 + i * 82}" y="70" width="8" height="2.5" rx="1.2" fill="#7a5f47"/>`).join("")}
      <rect x="0" y="12" width="420" height="54" rx="6" fill="#e9dfcf"/>
      <rect x="0" y="12" width="420" height="5" rx="2.5" fill="#f6efe3"/>
      <rect x="40" y="24" width="78" height="34" rx="9" fill="#b9c3cf"/><rect x="46" y="28" width="66" height="26" rx="7" fill="#8f9bab"/>
      <rect x="74" y="6" width="8" height="22" rx="4" fill="#9aa3b5"/><rect x="66" y="4" width="24" height="7" rx="3.5" fill="#b9c3cf"/>
      <rect x="140" y="30" width="44" height="26" rx="4" fill="#d9b48a" transform="rotate(-6 162 43)"/>
      <circle cx="172" cy="40" r="7" fill="${PAL.pink}"/><circle cx="160" cy="46" r="6" fill="${PAL.mint}"/>`);
    // microwave on the counter
    keep(st.prop(330, 66, 92, 80, 184, /* svg */ `
      <ellipse cx="46" cy="76" rx="44" ry="4" fill="#2b1d10" opacity="0.2"/>
      <rect x="2" y="6" width="88" height="68" rx="10" fill="#3a3f4f"/>
      <rect x="2" y="6" width="88" height="6" rx="3" fill="#4a5063"/>
      <rect x="8" y="16" width="56" height="52" rx="6" fill="#1b1f2e"/>
      <rect data-b="mwGlow" x="8" y="16" width="56" height="52" rx="6" fill="#ffd27a" opacity="0"/>
      <ellipse cx="36" cy="58" rx="20" ry="5" fill="#9aa3b5" opacity="0.6"/><circle data-b="mwDot" cx="50" cy="58" r="4" fill="#ff9f5a"/>
      <rect x="12" y="20" width="18" height="3" rx="1.5" fill="#fff" opacity="0.18"/>
      <rect x="68" y="16" width="18" height="12" rx="3" fill="#10142c"/>
      <text data-b="mwDigits" x="77" y="25.5" text-anchor="middle" font-family="var(--mono)" font-size="7.5" font-weight="700" fill="${PAL.mint}">12:00</text>
      <circle data-b="mwRun" cx="77" cy="36" r="3" fill="#ff9f5a" opacity="0.25"/>
      ${[0, 1, 2].map((i) => `<rect x="70" y="${44 + i * 8}" width="14" height="5" rx="2.5" fill="#4a5063"/>`).join("")}
      <g data-b="mwDing" opacity="0"><path d="M46 2 L46 -8 M20 6 L12 -2 M72 6 L80 -2" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/></g>`));
    // coffee machine
    keep(st.prop(440, 52, 64, 96, 185, /* svg */ `
      <ellipse cx="32" cy="92" rx="30" ry="4" fill="#2b1d10" opacity="0.2"/>
      <rect x="6" y="10" width="52" height="80" rx="9" fill="#3a3f4f"/>
      <rect x="10" y="2" width="44" height="18" rx="6" fill="#4a5063"/>
      <rect x="14" y="4" width="36" height="5" rx="2.5" fill="#6b4b3a"/>
      <rect x="12" y="26" width="40" height="12" rx="4" fill="#10142c"/>
      <circle data-b="cmLight" cx="20" cy="32" r="3" fill="#ff9f5a"/>
      <rect x="27" y="30" width="20" height="3" rx="1.5" fill="#4a5063"/>
      <rect x="24" y="42" width="16" height="8" rx="3" fill="#2a2e3b"/>
      <rect data-b="cmStream" x="30.5" y="50" width="3" height="20" rx="1.5" fill="#6b3f2a"/>
      <g data-b="cmCup"><rect x="21" y="66" width="22" height="18" rx="5" fill="#ffffff"/><ellipse cx="32" cy="67" rx="10" ry="3" fill="#6b3f2a"/></g>
      <rect x="12" y="84" width="40" height="4" rx="2" fill="#2a2e3b"/>
      <g data-b="cmSteam"><path d="M28 58 q-5 -8 0 -16 q5 -8 0 -16" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/>
        <path d="M36 58 q5 -8 0 -16 q-5 -8 0 -16" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0"/></g>`));
    // tall plant by the kitchen, plant in the corner
    keep(st.prop(552, 70, 90, 110, 182, `<g data-b="plantA">${plantSvg(1)}</g>`));
    st.prop(22, 688, 90, 104, 790, plantSvg(1));
    // dining table: chairs north (behind diners facing down), table, chairs south (in front of diners facing up)
    const chairN = (x: number) => st.prop(x - 34, 316, 68, 62, 350, `
      <rect x="10" y="2" width="48" height="34" rx="9" fill="#a8774f"/><rect x="15" y="6" width="38" height="24" rx="7" fill="#c08a5c"/>
      <rect x="4" y="34" width="60" height="24" rx="8" fill="#b07f55"/><rect x="8" y="36" width="52" height="8" rx="4" fill="#c99668"/>`);
    const chairS = (x: number) => st.prop(x - 34, 484, 68, 66, 540, `
      <rect x="4" y="2" width="60" height="22" rx="8" fill="#b07f55"/>
      <rect x="10" y="20" width="48" height="40" rx="9" fill="#a8774f"/><rect x="15" y="24" width="38" height="28" rx="7" fill="#c08a5c"/>
      <rect x="20" y="28" width="22" height="3" rx="1.5" fill="#fff" opacity="0.15"/>`);
    chairN(300); chairN(420);
    st.prop(222, 376, 256, 104, 474, /* svg */ `
      <ellipse cx="128" cy="100" rx="126" ry="6" fill="#2b1d10" opacity="0.18"/>
      <rect x="4" y="76" width="248" height="20" rx="7" fill="#b48a5e"/>
      <rect x="4" y="4" width="248" height="84" rx="10" fill="#d7b48a"/>
      <rect x="12" y="8" width="232" height="3" rx="1.5" fill="#fff" opacity="0.25"/>
      <ellipse cx="78" cy="22" rx="26" ry="10" fill="#f4efe6" opacity="0.8"/><ellipse cx="198" cy="22" rx="26" ry="10" fill="#f4efe6" opacity="0.8"/>
      <ellipse cx="78" cy="68" rx="26" ry="10" fill="#f4efe6" opacity="0.8"/><ellipse cx="198" cy="68" rx="26" ry="10" fill="#f4efe6" opacity="0.8"/>
      <ellipse cx="138" cy="46" rx="18" ry="9" fill="#e1c39c"/><circle cx="132" cy="42" r="6" fill="${PAL.orange}"/><circle cx="143" cy="44" r="6" fill="${PAL.pink}"/><circle cx="137" cy="48" r="5" fill="${PAL.mint}"/>`);
    chairS(300); chairS(420);
    // couch on the rug (seated robots are drawn in front of it), coffee table in front
    st.prop(716, 312, 288, 112, 360, /* svg */ `
      <ellipse cx="144" cy="104" rx="140" ry="7" fill="#2b1d10" opacity="0.18"/>
      <rect x="4" y="4" width="280" height="56" rx="20" fill="#8a5fd6"/>
      <rect x="14" y="10" width="126" height="40" rx="14" fill="#a27cf0"/><rect x="148" y="10" width="126" height="40" rx="14" fill="#a27cf0"/>
      <rect x="24" y="48" width="240" height="50" rx="12" fill="#b07cff"/>
      <rect x="30" y="52" width="110" height="10" rx="5" fill="#c49cff"/><rect x="148" y="52" width="110" height="10" rx="5" fill="#c49cff"/>
      <rect x="0" y="34" width="34" height="70" rx="14" fill="#8a5fd6"/><rect x="254" y="34" width="34" height="70" rx="14" fill="#8a5fd6"/>
      <rect x="4" y="36" width="24" height="8" rx="4" fill="#a27cf0"/><rect x="258" y="36" width="24" height="8" rx="4" fill="#a27cf0"/>
      <rect x="44" y="18" width="30" height="24" rx="8" fill="${PAL.orange}" transform="rotate(-10 59 30)"/>`);
    st.prop(788, 458, 148, 58, 512, /* svg */ `
      <ellipse cx="74" cy="54" rx="72" ry="4" fill="#2b1d10" opacity="0.18"/>
      <rect x="4" y="36" width="140" height="14" rx="6" fill="#8f6a4a"/>
      <rect x="4" y="4" width="140" height="40" rx="10" fill="#b48a5e"/>
      <rect x="20" y="12" width="40" height="26" rx="3" fill="#f6efe3" transform="rotate(-8 40 25)"/><rect x="26" y="18" width="24" height="3" rx="1.5" fill="${PAL.blue}" transform="rotate(-8 40 25)"/>
      <rect x="92" y="10" width="16" height="16" rx="5" fill="${PAL.mint}"/><ellipse cx="100" cy="11" rx="7" ry="2.5" fill="#6b3f2a"/>
      <circle cx="124" cy="26" r="7" fill="${PAL.pink}" opacity="0.8"/>`);
    // charging docks: pillar behind each pad, cable to the robot's back
    DOCKS.forEach((x, i) => keep(st.prop(x - 60, 584, 120, 140, 650, /* svg */ `
      <rect x="44" y="6" width="32" height="86" rx="10" fill="#3a3f4f"/>
      <rect x="48" y="10" width="24" height="4" rx="2" fill="#4a5063"/>
      <rect x="49" y="20" width="22" height="30" rx="5" fill="#10142c"/>
      <path d="M61 24 L55 36 L60 36 L58 46 L66 32 L61 32 Z" fill="${PAL.mint}" opacity="0.5"/>
      <rect x="47" y="56" width="26" height="12" rx="3" fill="#10142c"/>
      <rect data-b="dockFill${i}" x="49" y="58" width="0" height="8" rx="2" fill="${PAL.mint}"/>
      <circle cx="60" cy="80" r="5" fill="#2a2e3b"/>
      <path data-b="dockCable${i}" d="M60 80 C60 100 86 98 78 116" stroke="#2a2e3b" stroke-width="5" fill="none" stroke-linecap="round" opacity="0"/>
      <ellipse cx="60" cy="94" rx="20" ry="5" fill="#2b1d10" opacity="0.18"/>`)));
    // nap pod next to the docks (the resting corner): shell behind the sleeper, rim in front
    keep(st.prop(466, 552, 168, 180, 640, /* svg */ `
      <ellipse cx="84" cy="96" rx="80" ry="92" fill="#e9edf3"/>
      <ellipse cx="84" cy="104" rx="64" ry="76" fill="#2c3352"/>
      <ellipse data-b="podGlow" cx="84" cy="104" rx="60" ry="72" fill="${PAL.blue}" opacity="0.25"/>
      <ellipse cx="84" cy="150" rx="56" ry="22" fill="#4fb6ff" opacity="0.35"/>
      <rect x="40" y="18" width="50" height="5" rx="2.5" fill="#fff" opacity="0.6"/>
      <circle cx="84" cy="30" r="4" fill="${PAL.mint}"/>`));
    st.prop(466, 700, 168, 76, 760, /* svg */ `
      <path d="M4 8 Q84 52 164 8 L164 40 Q84 84 4 40 Z" fill="#dfe4ec"/>
      <path d="M4 8 Q84 52 164 8" stroke="#fff" stroke-width="4" fill="none" opacity="0.7"/>
      <ellipse cx="84" cy="66" rx="70" ry="8" fill="#2b1d10" opacity="0.15"/>`);
    // beanbag between the lounge and the games
    st.prop(984, 426, 112, 64, 454, /* svg */ `
      <ellipse cx="56" cy="54" rx="54" ry="8" fill="#2b1d10" opacity="0.18"/>
      <path d="M8 42 C2 14 28 2 56 4 C86 2 110 16 104 42 C100 56 14 58 8 42 Z" fill="${PAL.orange}"/>
      <path d="M22 30 C26 18 44 12 60 14" stroke="#ffc08a" stroke-width="6" fill="none" stroke-linecap="round"/>`);
    // the games wing
    this.arcade = new Arcade(st, gx(1240), WALL);
    this.movie = new MovieCorner(st, gx(1655), gx(1440));
    this.arcade.onPowerChange = powered => this.mediaReaction('console', powered);
    this.movie.onScreenChange = raised => this.mediaReaction('movie', !raised);
    this.pp = new PingPong(st, gx(1270), 622, { x0: gx(1000), x1: gx(1530), y0: 566, y1: 770 });
    this.chessT = new ChessTable(st, gx(1700), 650);
    void this.chessT.setup();
  }

  destroy() {
    this.dead = true;
    window.clearInterval(this.timer);
    for (const g of Object.values(this.groups)) g?.end();
    for (const a of this.anims) a.kill();
    this.fx.kill();
    for (const c of this.calls) c.kill();
    this.calls.clear();
    for (const r of this.res.values()) { r.alive = false; r.w.destroy(); }
    this.res.clear();
    gsap.killTweensOf(Object.values(this.$));
    this.pp.destroy();
    this.chessT.destroy();
    this.arcade.destroy();
    this.movie.destroy();
    this.stage.destroy();
  }
}

function brandKind(provider: string) {
  const p = provider.toLowerCase();
  return p.includes("claude") ? "claude" : p.includes("codex") || p.includes("openai") ? "codex" : p.includes("grok") ? "grok" : "generic";
}

function wallArt(w: number) {
  const pal = { wall: "#e6eadf", trim: "#d0d6c5", floor: PAL.floor, seam: PAL.seam, accent: PAL.mint };
  const gx = (x: number) => x + w - 1900;
  return /* svg */ `
    <rect x="130" y="22" width="190" height="44" rx="6" fill="#c9b49a"/>
    <rect x="134" y="26" width="88" height="36" rx="4" fill="#d9c6ac"/><rect x="228" y="26" width="88" height="36" rx="4" fill="#d9c6ac"/>
    <rect x="212" y="40" width="5" height="10" rx="2.5" fill="#8f7658"/><rect x="233" y="40" width="5" height="10" rx="2.5" fill="#8f7658"/>
    <rect x="428" y="30" width="96" height="5" rx="2.5" fill="#c9b49a"/>
    ${[0, 1, 2].map((i) => `<rect x="${436 + i * 28}" y="${18}" width="16" height="13" rx="4" fill="${[PAL.blue, PAL.pink, PAL.mint][i]}"/>`).join("")}
    ${posterArt(560, 24, 72, 66, "#2c3352", "#ffffff", ["There is", "no place", "like", "127.0.0.1"])}
    ${windowArt(660, 150, pal)}
    ${windowArt(860, 150, pal)}
    <g transform="translate(1062 54)">
      <circle r="22" fill="#fff"/><circle r="18.5" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-0.8" y="-17" width="1.6" height="${i % 3 ? 2.5 : 4.5}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.5" y="-10" width="3" height="12" rx="1.5" fill="#3a3f4f" transform="rotate(300)"/>
      <rect class="clock-m" x="-1" y="-15" width="2" height="17" rx="1" fill="#3a3f4f" transform="rotate(60)"/>
      <circle r="2.2" fill="${PAL.mint}"/>
    </g>
    ${posterArt(gx(1350), 22, 92, 70, "#ffe08a", "#3a3f4f", ["Have you tried", "turning it off", "and on again?"])}
    ${windowArt(gx(1560), 190, pal)}`;
}
