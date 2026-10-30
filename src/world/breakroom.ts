import gsap from "gsap";
import { Walker } from "./walker";
import { JOKES, LAUGHS, WINDOW_THOUGHTS, shuffled } from "./jokes";
import { PAL, Paths, RoomStage, WALL, plantSvg, posterArt, windowArt, type Pt } from "./room";
import type { Facing } from "./walker";

// The break room, seen top-down: a kitchen counter on the north wall (fridge, sink, microwave,
// coffee machine), a dining table, a couch on a rug, three charging docks, a nap pod and a
// beanbag. Residents walk in through the door and live a little life loop: microwave a meal
// and eat it, make coffee, charge, nap, look out of the window, chat and tell robot jokes.

export type BreakThread = { id: string; provider: string; title: string; question?: string | null; model?: string | null; name?: string | null };

export interface RoomExtension {
  el: HTMLElement;
  setThreads(list: BreakThread[]): void;
  onSelect: (id: string) => void;
  destroy(): void;
}

const SCALE = 0.42;
const MAX = 8;
type Spot = { key: string; x: number; y: number; face: Facing; sit?: boolean; via?: Pt[]; taken: string | null };
type Kind = "microwave" | "coffee" | "charge" | "nap" | "window" | "fridge" | "chat";
const WEIGHTS: Record<Kind, number> = { microwave: 3, coffee: 3, charge: 2, nap: 1.5, window: 1.5, fridge: 0.8, chat: 3.2 };
const COOLDOWN: Record<Kind, number> = { microwave: 55, coffee: 35, charge: 60, nap: 75, window: 25, fridge: 45, chat: 18 };

type Resident = {
  id: string; w: Walker; alive: boolean; busy: boolean; nextAt: number; last: Kind | null;
  cool: Partial<Record<Kind, number>>; spot: Spot | null;
};

const DOCKS = [150, 260, 370];
const DOOR_IN = { x: 600, y: 750 }, DOOR_OUT = { x: 600, y: 860 };

export class BreakRoom implements RoomExtension {
  el: HTMLElement;
  onSelect: (id: string) => void = () => {};
  private stage: RoomStage;
  private paths: Paths;
  private spots: Record<string, Spot> = {};
  private res = new Map<string, Resident>();
  private timer = 0;
  private $: Record<string, SVGElement> = {};
  private anims: gsap.core.Animation[] = [];
  private joke = shuffled(JOKES);
  private laugh = shuffled(LAUGHS);
  private thought = shuffled(WINDOW_THOUGHTS);
  private busyThings = new Set<string>();
  // A robot that wants to chat waits at a chat spot; the next robot that frees up joins it.
  private host: { r: Resident; pair: [string, string]; guest: Resident | null; arrived: boolean; over: Promise<void>; end: () => void } | null = null;

  constructor(host: HTMLElement, readonly w: number, readonly h: number) {
    this.stage = new RoomStage(host, w, h, { wall: "#e6eadf", trim: "#d0d6c5", floor: PAL.floor, seam: PAL.seam, accent: PAL.mint }, wallArt(), "world-break");
    this.el = this.stage.el;
    this.furnish();
    const S = (key: string, x: number, y: number, face: Facing, extra: Partial<Spot> = {}) => (this.spots[key] = { key, x, y, face, taken: null, ...extra });
    S("microwave", 372, 216, "up"); S("coffee", 470, 216, "up"); S("fridge", 80, 228, "up");
    S("window1", 730, 196, "up"); S("window2", 930, 196, "up");
    S("seatN1", 300, 376, "down", { sit: true }); S("seatN2", 420, 376, "down", { sit: true });
    S("seatS1", 300, 502, "up", { sit: true }); S("seatS2", 420, 502, "up", { sit: true });
    S("couch1", 812, 402, "down", { sit: true }); S("couch2", 912, 402, "down", { sit: true });
    DOCKS.forEach((x, i) => S(`dock${i}`, x, 716, "down", { via: [{ x: x + 52, y: 748 }] }));
    S("pod", 1090, 716, "down", { sit: true, via: [{ x: 990, y: 700 }, { x: 1090, y: 762 }] });
    S("beanbag", 1112, 452, "down", { sit: true });
    S("chatA1", 556, 296, "right"); S("chatA2", 650, 296, "left");
    S("chatB1", 700, 626, "right"); S("chatB2", 792, 626, "left");
    this.paths = new Paths({
      n1: { x: 120, y: 252 }, n2: { x: 380, y: 252 }, n3: { x: 600, y: 252 }, n4: { x: 830, y: 252 }, n5: { x: 1050, y: 252 },
      w1: { x: 190, y: 566 }, w2: { x: 430, y: 566 }, c1: { x: 600, y: 566 }, door: DOOR_IN,
      r1: { x: 680, y: 452 }, e1: { x: 860, y: 640 }, e2: { x: 1050, y: 600 },
    }, [["n1", "n2"], ["n2", "n3"], ["n3", "n4"], ["n4", "n5"], ["n1", "w1"], ["w1", "w2"], ["w2", "c1"], ["c1", "n3"], ["c1", "door"], ["c1", "r1"], ["r1", "n3"], ["c1", "e1"], ["r1", "e1"], ["e1", "e2"], ["e2", "n5"]]);
    this.idleMachines();
    this.timer = window.setInterval(() => this.tick(), 400);
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
      const w = new Walker(this.stage.layer, { id: t.id, provider: t.provider, model: t.model ?? undefined, name: t.name ?? t.title, scale: SCALE });
      w.setPos(DOOR_OUT.x + (i % 2 ? 14 : -14), DOOR_OUT.y + i * 30);
      w.face("up");
      w.el.addEventListener("click", (e) => { e.stopPropagation(); this.onSelect(t.id); });
      const res: Resident = { id: t.id, w, alive: true, busy: true, nextAt: 0, last: null, cool: {}, spot: null };
      this.res.set(t.id, res);
      // stagger arrivals so they don't all squeeze through the door at once
      gsap.delayedCall(i * 1.1, async () => {
        if (!res.alive) return;
        await w.walkTo(DOOR_IN.x, DOOR_IN.y);
        res.busy = false;
        res.nextAt = performance.now() + 300;
      });
    });
  }

  private async leave(r: Resident) {
    r.alive = false;
    this.release(r);
    r.w.say(null);
    r.w.calm();
    r.w.hold("none", "none");
    await r.w.walkPath(this.paths.route({ x: r.w.x, y: r.w.y }, DOOR_IN));
    await r.w.walkTo(DOOR_OUT.x, DOOR_OUT.y + 30);
    r.w.destroy();
    if (this.res.get(r.id) === r) this.res.delete(r.id);
  }

  private tick() {
    const now = performance.now();
    for (const r of this.res.values()) {
      if (!r.alive || r.busy || now < r.nextAt) continue;
      void this.live(r);
    }
  }

  private free(key: string) { const s = this.spots[key]; return s && !s.taken; }
  private reserve(r: Resident, key: string) { this.release(r); const s = this.spots[key]; s.taken = r.id; r.spot = s; return s; }
  private release(r: Resident) { if (r.spot && r.spot.taken === r.id) r.spot.taken = null; r.spot = null; }
  private freeOf(keys: string[]) { const f = keys.filter((k) => this.free(k)); return f.length ? f[Math.floor(Math.random() * f.length)] : null; }

  private async goTo(r: Resident, s: Spot) {
    const route = this.paths.route({ x: r.w.x, y: r.w.y }, s.via?.[0] ?? s);
    if (s.via) route.pop();
    await r.w.walkPath([...route, ...(s.via ?? []), { x: s.x, y: s.y }]);
    if (!r.alive) return;
    r.w.face(s.face);
  }

  private async live(r: Resident) {
    r.busy = true;
    const now = performance.now() / 1000;
    const ok = (k: Kind) => k !== r.last && (r.cool[k] ?? 0) <= now;
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
    const partner = [...this.res.values()].find((o) => o !== r && o.alive && !o.busy && (o.cool.chat ?? 0) <= now && o.last !== "chat");
    if (ok("chat") && !this.host && this.chatSpots()) options.push("chat");
    let kind: Kind | null = null;
    const total = options.reduce((s, k) => s + WEIGHTS[k], 0);
    let roll = Math.random() * total;
    for (const k of options) { roll -= WEIGHTS[k]; if (roll <= 0) { kind = k; break; } }
    try {
      if (!kind) { await this.wander(r); }
      else {
        r.last = kind;
        r.cool[kind] = now + COOLDOWN[kind];
        if (kind === "chat" && partner) {
          partner.busy = true;
          partner.last = "chat";
          partner.cool.chat = now + COOLDOWN.chat;
          await this.chat(r, partner);
          this.done(partner);
        } else if (kind === "chat") {
          await this.hostChat(r);
        } else {
          const run = ({ microwave: this.microwave, coffee: this.coffee, charge: this.charge, nap: this.nap, window: this.lookOut, fridge: this.fridge } as Record<string, (r: Resident) => Promise<void>>)[kind];
          await run.call(this, r);
        }
      }
    } catch { /* a resident that left mid-activity just stops */ }
    this.done(r);
  }

  private done(r: Resident) {
    if (!r.alive) return;
    r.busy = false;
    r.nextAt = performance.now() + 400 + Math.random() * 1200;
  }

  private wait(sec: number, r: Resident) {
    return new Promise<void>((res, rej) => gsap.delayedCall(sec, () => (r.alive ? res() : rej(new Error("left")))));
  }

  private async stand(r: Resident) {
    if (r.spot?.sit) { r.w.calm(); await this.wait(0.35, r); }
  }

  // ---- activities ---------------------------------------------------------------------------------
  private async wander(r: Resident) {
    const p = { x: 520 + Math.random() * 200, y: 300 + Math.random() * 60 };
    this.release(r);
    await r.w.walkPath(this.paths.route({ x: r.w.x, y: r.w.y }, p));
    r.w.face(Math.random() < 0.5 ? "down" : "up");
    r.w.do("idle");
    await this.wait(2 + Math.random() * 2, r);
  }

  private async microwave(r: Resident) {
    await this.stand(r);
    const seatKey = this.freeOf(["seatN1", "seatN2", "seatS1", "seatS2"])!;
    const seat = this.spots[seatKey];
    seat.taken = r.id;
    await this.goTo(r, this.reserve(r, "microwave"));
    seat.taken = r.id;
    r.w.poke();
    await this.wait(0.3, r);
    const secs = 7 + Math.floor(Math.random() * 4);
    const cook = this.runMicrowave(secs);
    r.w.do("wait");
    await this.wait(secs + 0.2, r);
    await cook;
    r.w.do("idle");
    r.w.hop();
    r.w.hold("bowl", "spoon");
    await this.wait(0.5, r);
    this.release(r);
    r.spot = seat;
    await this.goTo(r, seat);
    r.w.do("sit", { keep: true });
    await this.wait(0.7, r);
    r.w.do("eat");
    if (Math.random() < 0.5) gsap.delayedCall(2, () => r.alive && r.w.activity === "eat" && r.w.say(pickOne(["Leftover pixels. Still good.", "Mmm, fresh bytes.", "Five stars, would reheat."])));
    await this.wait(9 + Math.random() * 6, r);
    r.w.calm();
    r.w.hold("none", "none");
  }

  private async coffee(r: Resident) {
    await this.stand(r);
    await this.goTo(r, this.reserve(r, "coffee"));
    r.w.poke();
    await this.wait(0.3, r);
    r.w.do("idle");
    await this.brew();
    r.w.hold("none", "mug");
    await this.wait(0.4, r);
    const where = this.freeOf(["window1", "window2", "couch1", "couch2"]);
    if (where) {
      const s = this.reserve(r, where);
      await this.goTo(r, s);
      if (s.sit) { r.w.do("sit", { keep: true }); await this.wait(0.6, r); }
    }
    r.w.do("drink");
    if (Math.random() < 0.4) gsap.delayedCall(2.5, () => r.alive && r.w.say(pickOne(["Coffee: the original bootloader.", "Ahh. Warm fans.", "Caffeine loaded."])));
    await this.wait(8 + Math.random() * 5, r);
    r.w.calm();
    r.w.hold("none", "none");
  }

  private async charge(r: Resident) {
    await this.stand(r);
    const key = this.freeOf(DOCKS.map((_, i) => `dock${i}`))!;
    await this.goTo(r, this.reserve(r, key));
    const i = Number(key.slice(4));
    r.w.do("charge");
    this.dock(i, true);
    await this.wait(16 + Math.random() * 8, r).finally(() => this.dock(i, false));
    r.w.hop();
    r.w.setExpression("happy");
    await this.wait(0.8, r);
    r.w.setExpression("neutral");
  }

  private async nap(r: Resident) {
    await this.stand(r);
    const key = this.freeOf(["pod", "beanbag"])!;
    await this.goTo(r, this.reserve(r, key));
    r.w.do("sit");
    await this.wait(0.8, r);
    r.w.do("nap");
    if (key === "pod") gsap.to(this.$.podGlow, { opacity: 0.9, duration: 1.5 });
    await this.wait(14 + Math.random() * 8, r).finally(() => { if (key === "pod") gsap.to(this.$.podGlow, { opacity: 0.25, duration: 1 }); });
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
    r.w.do("idle");
    if (Math.random() < 0.55) gsap.delayedCall(1.5, () => r.alive && r.w.say(this.thought()));
    await this.wait(6 + Math.random() * 4, r);
  }

  private async fridge(r: Resident) {
    await this.stand(r);
    await this.goTo(r, this.reserve(r, "fridge"));
    r.w.poke();
    gsap.to(this.$.fridgeDoor, { scaleX: 0.12, duration: 0.45, ease: "power2.out", transformOrigin: "0% 50%" });
    gsap.to(this.$.fridgeLight, { opacity: 1, duration: 0.3 });
    await this.wait(1.6, r);
    r.w.say(pickOne(["Out of RAM again.", "Who ate my cookies? Browser cookies.", "Still no snacks with extra cache."]));
    await this.wait(1.4, r);
    gsap.to(this.$.fridgeDoor, { scaleX: 1, duration: 0.4, ease: "power2.in" });
    gsap.to(this.$.fridgeLight, { opacity: 0, duration: 0.3, delay: 0.3 });
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
    await h.over;
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

  private async converse(a: Resident, b: Resident, sit: boolean) {
    const sa = { sit };
    if (sa.sit) { a.w.do("sit"); b.w.do("sit"); await this.wait(0.6, a); }
    else { a.w.face(a.spot?.face ?? "right"); b.w.face(b.spot?.face ?? "left"); }
    const talk = (r: Resident) => r.w.do(r.spot?.sit ? "sit" : "talk");
    const listen = (r: Resident) => r.w.do(r.spot?.sit ? "sit" : "listen");
    const rounds = 1 + Math.floor(Math.random() * 2);
    let [x, y] = [a, b];
    for (let i = 0; i < rounds; i++) {
      const [setup, punch] = this.joke();
      talk(x); listen(y);
      x.w.say(setup, 2400);
      await this.wait(2.6, x);
      talk(y); listen(x);
      y.w.say(punch, 2600);
      await this.wait(2.8, y);
      x.w.do("laugh", { keep: true });
      x.w.say(this.laugh(), 1300);
      if (Math.random() < 0.6) { y.w.do("laugh", { keep: true }); }
      await this.wait(1.9, x);
      if (sa.sit) { x.w.do("sit"); y.w.do("sit"); }
      [x, y] = [y, x];
    }
    a.w.calm(); b.w.calm();
    this.release(a); this.release(b);
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
    this.anims.push(gsap.to(this.$.plantA, { rotation: 2, transformOrigin: "50% 100%", duration: 3.2, yoyo: true, repeat: -1, ease: "sine.inOut" }));
    this.anims.push(gsap.to(this.$.podGlow, { opacity: 0.25, duration: 0.1 }));
    for (let i = 0; i < 3; i++) this.$[`dockFill${i}`].setAttribute("width", "0");
  }

  private runMicrowave(secs: number) {
    this.busyThings.add("microwave");
    const $ = this.$;
    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({ onComplete: () => { this.busyThings.delete("microwave"); resolve(); } });
      tl.to($.mwGlow, { opacity: 1, duration: 0.3 })
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
    }).then(() => { const d = new Date(); $.mwDigits.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; gsap.set($.mwDigits, { opacity: 1 }); });
  }

  private brew() {
    const $ = this.$;
    return new Promise<void>((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to($.cmLight, { fill: PAL.mint, duration: 0.2 })
        .fromTo($.cmStream, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.4 })
        .fromTo($.cmCup, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.2)
        .fromTo($.cmSteam.children, { y: 6, opacity: 0 }, { y: -18, opacity: 0.8, duration: 1.2, stagger: 0.3, repeat: 1, ease: "sine.out" }, 0.6)
        .to($.cmStream, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.3 }, 3.2)
        .to($.cmLight, { fill: "#ff9f5a", duration: 0.2 }, 3.4)
        .to($.cmCup, { opacity: 0, duration: 0.2 }, 3.6)
        .to($.cmSteam.children, { opacity: 0, duration: 0.3 }, 3.6);
    });
  }

  private dock(i: number, on: boolean) {
    const fill = this.$[`dockFill${i}`], cable = this.$[`dockCable${i}`], glow = this.$[`dockGlow${i}`];
    gsap.killTweensOf(fill);
    if (on) {
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
    const keep = (svg: SVGSVGElement) => { for (const n of svg.querySelectorAll("[data-b]")) this.$[(n as SVGElement).dataset.b!] = n as SVGElement; };
    // rug and floor pads (flat on the floor)
    keep(st.prop(0, WALL, this.w, this.h - WALL, 1, /* svg */ `
      <ellipse cx="860" cy="${470 - WALL}" rx="210" ry="118" fill="#ff6f91" opacity="0.28"/>
      <ellipse cx="860" cy="${470 - WALL}" rx="180" ry="96" fill="#ff9f5a" opacity="0.22"/>
      <ellipse cx="860" cy="${470 - WALL}" rx="120" ry="58" fill="#ffd27a" opacity="0.18"/>
      ${DOCKS.map((x) => `<ellipse cx="${x}" cy="${716 - WALL}" rx="38" ry="13" fill="#3a3f4f" opacity="0.55"/><ellipse cx="${x}" cy="${714 - WALL}" rx="30" ry="9" fill="${PAL.mint}" opacity="0.18"/>`).join("")}
      ${DOCKS.map((x, i) => `<ellipse data-b="dockGlow${i}" cx="${x}" cy="${714 - WALL}" rx="34" ry="11" fill="${PAL.mint}" opacity="0"/>`).join("")}
      <ellipse cx="1090" cy="${760 - WALL}" rx="80" ry="16" fill="#2b1d10" opacity="0.14"/>`));
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
    // tall plant by the kitchen, plant in corners
    keep(st.prop(552, 70, 90, 110, 182, `<g data-b="plantA">${plantSvg(1)}</g>`));
    st.prop(1104, 116, 90, 104, 220, plantSvg(0.95));
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
    // nap pod: shell behind the sleeper, rim in front
    keep(st.prop(1006, 552, 168, 180, 640, /* svg */ `
      <ellipse cx="84" cy="96" rx="80" ry="92" fill="#e9edf3"/>
      <ellipse cx="84" cy="104" rx="64" ry="76" fill="#2c3352"/>
      <ellipse data-b="podGlow" cx="84" cy="104" rx="60" ry="72" fill="${PAL.blue}" opacity="0.25"/>
      <ellipse cx="84" cy="150" rx="56" ry="22" fill="#4fb6ff" opacity="0.35"/>
      <rect x="40" y="18" width="50" height="5" rx="2.5" fill="#fff" opacity="0.6"/>
      <circle cx="84" cy="30" r="4" fill="${PAL.mint}"/>`));
    st.prop(1006, 700, 168, 76, 760, /* svg */ `
      <path d="M4 8 Q84 52 164 8 L164 40 Q84 84 4 40 Z" fill="#dfe4ec"/>
      <path d="M4 8 Q84 52 164 8" stroke="#fff" stroke-width="4" fill="none" opacity="0.7"/>
      <ellipse cx="84" cy="66" rx="70" ry="8" fill="#2b1d10" opacity="0.15"/>`);
    // beanbag
    st.prop(1056, 412, 112, 64, 440, /* svg */ `
      <ellipse cx="56" cy="54" rx="54" ry="8" fill="#2b1d10" opacity="0.18"/>
      <path d="M8 42 C2 14 28 2 56 4 C86 2 110 16 104 42 C100 56 14 58 8 42 Z" fill="${PAL.orange}"/>
      <path d="M22 30 C26 18 44 12 60 14" stroke="#ffc08a" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  }

  destroy() {
    window.clearInterval(this.timer);
    for (const a of this.anims) a.kill();
    for (const r of this.res.values()) { r.alive = false; r.w.destroy(); }
    this.res.clear();
    gsap.killTweensOf(Object.values(this.$));
    this.stage.destroy();
  }
}

function brandKind(provider: string) {
  const p = provider.toLowerCase();
  return p.includes("claude") ? "claude" : p.includes("codex") || p.includes("openai") ? "codex" : p.includes("grok") ? "grok" : "generic";
}
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function wallArt() {
  const pal = { wall: "#e6eadf", trim: "#d0d6c5", floor: PAL.floor, seam: PAL.seam, accent: PAL.mint };
  return /* svg */ `
    <rect x="130" y="22" width="190" height="44" rx="6" fill="#c9b49a"/>
    <rect x="134" y="26" width="88" height="36" rx="4" fill="#d9c6ac"/><rect x="228" y="26" width="88" height="36" rx="4" fill="#d9c6ac"/>
    <rect x="212" y="40" width="5" height="10" rx="2.5" fill="#8f7658"/><rect x="233" y="40" width="5" height="10" rx="2.5" fill="#8f7658"/>
    <rect x="428" y="30" width="96" height="5" rx="2.5" fill="#c9b49a"/>
    ${[0, 1, 2].map((i) => `<rect x="${436 + i * 28}" y="${18}" width="16" height="13" rx="4" fill="${[PAL.blue, PAL.pink, PAL.mint][i]}"/>`).join("")}
    ${posterArt(560, 24, 72, 66, "#2c3352", "#ffffff", ["There is", "no place", "like", "127.0.0.1"])}
    ${windowArt(660, 150, pal)}
    ${windowArt(860, 150, pal)}
    <g transform="translate(1044 54)">
      <circle r="22" fill="#fff"/><circle r="18.5" fill="#f6f2ea"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="-0.8" y="-17" width="1.6" height="${i % 3 ? 2.5 : 4.5}" fill="#3a3f4f" transform="rotate(${i * 30})"/>`).join("")}
      <rect class="clock-h" x="-1.5" y="-10" width="3" height="12" rx="1.5" fill="#3a3f4f" transform="rotate(300)"/>
      <rect class="clock-m" x="-1" y="-15" width="2" height="17" rx="1" fill="#3a3f4f" transform="rotate(60)"/>
      <circle r="2.2" fill="${PAL.mint}"/>
    </g>
    ${posterArt(1078, 22, 92, 70, "#ffe08a", "#3a3f4f", ["Have you tried", "turning it off", "and on again?"])}`;
}
