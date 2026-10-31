import gsap from "gsap";
import { Anims, type Pt, type RoomStage } from "./room";

// A ping pong table seen from above, its net, a little flip scoreboard behind it and the ball.
// The ball flies in arcs over the table with a shadow underneath: its screen position is the
// shadow point lifted by its height. Rallies are played by the break room, which tells the
// table where the paddles are; the table only knows how a ball moves.

const W = 300, D = 124;           // table top
const FRONT = 14, LEGS = 14;      // front face and leg height below the top
const LIFT = 16;                  // the table top is this much above the floor

type Seg = { x: number; sy: number; h: number; peak: number; d: number; ease?: string };
type BallState = { x: number; sy: number; h: number };

export class PingPong {
  /** Player spots at the left and right ends (feet). */
  readonly ends: [Pt, Pt];
  readonly net: number;
  readonly x0: number;
  readonly x1: number;
  private top: number;
  private ball: HTMLDivElement;
  private shadow: HTMLDivElement;
  private digits: SVGTextElement[];
  private cards: SVGGElement[];
  private b: BallState = { x: 0, sy: 0, h: 0 };
  private anims = new Anims();

  constructor(private stage: RoomStage, readonly cx: number, readonly cy: number, private bounds: { x0: number; x1: number; y0: number; y1: number }) {
    this.x0 = cx - W / 2; this.x1 = cx + W / 2; this.net = cx;
    this.top = cy - D / 2;
    this.ends = [{ x: this.x0 - 36, y: cy + 4 }, { x: this.x1 + 36, y: cy + 4 }];
    // drawn behind the players (they stand at the ends and lean over it)
    stage.prop(this.x0 - 6, this.top - 6, W + 12, D + FRONT + LEGS + 16, this.top + 4, /* svg */ `
      <ellipse cx="${W / 2 + 6}" cy="${D + FRONT + LEGS + 8}" rx="${W / 2 + 4}" ry="9" fill="#2b1d10" opacity="0.18"/>
      ${[24, W - 16].map((x) => `<rect x="${x}" y="${D + 6}" width="9" height="${FRONT + LEGS + 2}" rx="3" fill="#252a38"/>`).join("")}
      <rect x="${W / 2 + 2}" y="${D + 8}" width="8" height="${FRONT + LEGS}" rx="3" fill="#252a38"/>
      <rect x="6" y="${D}" width="${W}" height="${FRONT + 6}" rx="5" fill="#1f4f8a"/>
      <rect x="6" y="6" width="${W}" height="${D}" rx="5" fill="#2f6fb8"/>
      <rect x="10" y="9" width="${W - 8}" height="${D - 6}" rx="3" fill="#3478c4"/>
      <rect x="8" y="8" width="${W - 4}" height="3" rx="1.5" fill="#f4f7ff" opacity="0.9"/>
      <rect x="8" y="${D + 1}" width="${W - 4}" height="3" rx="1.5" fill="#f4f7ff" opacity="0.9"/>
      <rect x="8" y="8" width="3" height="${D - 4}" rx="1.5" fill="#f4f7ff" opacity="0.9"/>
      <rect x="${W + 1}" y="8" width="3" height="${D - 4}" rx="1.5" fill="#f4f7ff" opacity="0.9"/>
      <rect x="10" y="${6 + D / 2 - 0.8}" width="${W - 8}" height="1.6" fill="#f4f7ff" opacity="0.7"/>
      <rect x="40" y="16" width="90" height="4" rx="2" fill="#ffffff" opacity="0.12"/>
      <rect x="${W / 2 + 3}" y="-2" width="6" height="${D + 14}" rx="2" fill="#f0f3fa" opacity="0.85"/>
      <rect x="${W / 2 + 4}" y="-2" width="4" height="${D + 14}" rx="2" fill="#c9d0e0" opacity="0.6"/>
      <rect x="${W / 2 + 1}" y="-6" width="10" height="9" rx="3" fill="#252a38"/>
      <rect x="${W / 2 + 1}" y="${D + 8}" width="10" height="9" rx="3" fill="#252a38"/>`);
    // scoreboard behind the net: two flip cards
    const sb = stage.prop(cx - 40, this.top - 64, 80, 62, this.top - 4, /* svg */ `
      <rect x="18" y="44" width="5" height="16" rx="2" fill="#3a3f4f"/><rect x="57" y="44" width="5" height="16" rx="2" fill="#3a3f4f"/>
      <rect x="4" y="4" width="72" height="44" rx="8" fill="#3a3f4f"/>
      <rect x="4" y="4" width="72" height="5" rx="2.5" fill="#4a5063"/>
      ${[0, 1].map((i) => `<g data-pp="card${i}"><rect x="${10 + i * 33}" y="12" width="27" height="30" rx="4" fill="#fffaf3"/>
        <rect x="${10 + i * 33}" y="26.5" width="27" height="1" fill="#d8cfbf"/>
        <text data-pp="digit${i}" x="${23.5 + i * 33}" y="34" text-anchor="middle" font-family="var(--mono)" font-size="17" font-weight="700" fill="#2d3142">0</text></g>`).join("")}
      <circle cx="40" cy="27" r="2" fill="#ff9f5a"/>`);
    this.digits = [0, 1].map((i) => sb.querySelector(`[data-pp="digit${i}"]`) as SVGTextElement);
    this.cards = [0, 1].map((i) => sb.querySelector(`[data-pp="card${i}"]`) as SVGGElement);
    this.shadow = document.createElement("div");
    this.shadow.className = "world-ppshadow";
    this.ball = document.createElement("div");
    this.ball.className = "world-ppball";
    stage.layer.append(this.shadow, this.ball);
    this.show(false);
  }

  /** Floor line of a player's end (where the ball's shadow runs). */
  row(side: 0 | 1) { return this.ends[side].y - 6; }

  setScore(a: number, b: number, animate = true) {
    [a, b].forEach((v, i) => {
      const t = this.digits[i];
      if (t.textContent === String(v)) return;
      if (!animate) { t.textContent = String(v); return; }
      this.anims.add(gsap.timeline()
        .to(this.cards[i], { scaleY: 0, transformOrigin: "50% 50%", duration: 0.12, ease: "power2.in" })
        .add(() => (t.textContent = String(v)))
        .to(this.cards[i], { scaleY: 1, duration: 0.25, ease: "back.out(3)" }));
    });
  }

  show(on: boolean) {
    this.ball.style.display = this.shadow.style.display = on ? "" : "none";
  }

  /** Put the ball at a floor point lifted by height h. */
  private place(x: number, sy: number, h: number) {
    const s = this.b;
    s.x = x; s.sy = sy; s.h = h;
    // past the table the shadow falls to the floor, LIFT lower on screen (h is then -LIFT on the floor)
    const over = x > this.x0 - 2 && x < this.x1 + 2 && sy > this.top - 4 && sy < this.top + D + 4;
    const g = over ? 0 : LIFT;
    const z = over ? Math.max(this.top + 6, Math.round(sy) + 40) : Math.round(sy + g) + (h > -LIFT + 4 ? 40 : 2);
    const lift = h + g;   // height above whatever is under the ball
    this.shadow.style.transform = `translate(${x.toFixed(1)}px, ${(sy + g).toFixed(1)}px) scale(${Math.max(0.45, 1 - lift / 120).toFixed(2)})`;
    this.shadow.style.opacity = String(Math.max(0.12, 0.42 - lift / 220));
    this.shadow.style.zIndex = String(z - 1);
    this.ball.style.transform = `translate(${x.toFixed(1)}px, ${(sy - h).toFixed(1)}px)`;
    this.ball.style.zIndex = String(z);
  }

  /** Fly through a list of segments; each one is a parabolic hop on top of a straight line. */
  private fly(segs: Seg[]) {
    const tl = gsap.timeline();
    let from = { ...this.b };
    for (const sg of segs) {
      const a = { ...from }, p = { u: 0 };
      tl.to(p, {
        u: 1, duration: sg.d, ease: sg.ease ?? "none",
        onUpdate: () => {
          const u = p.u;
          this.place(a.x + (sg.x - a.x) * u, a.sy + (sg.sy - a.sy) * u, a.h + (sg.h - a.h) * u + sg.peak * 4 * u * (1 - u));
        },
      });
      from = { x: sg.x, sy: sg.sy, h: sg.h };
    }
    return this.anims.run(tl);
  }

  /** The ball appears in a hand. */
  hold(hand: Pt, row: number) { this.show(true); this.place(hand.x, row, row - hand.y); }
  hide() { this.show(false); }

  /** Toss straight up from the hand before serving. */
  toss(hand: Pt, row: number) {
    this.hold(hand, row);
    const h = row - hand.y;
    return this.fly([{ x: hand.x, sy: row, h, peak: 34, d: 0.5, ease: "none" }]);
  }

  /** A good shot from hand a to hand b. Serves bounce on both halves, rallies on the far half. */
  shot(a: Pt, b: Pt, rowA: number, rowB: number, dur: number, serve = false) {
    const dir = b.x > a.x ? 1 : -1;
    const ha = rowA - a.y, hb = rowB - b.y;
    const far = this.net + dir * (45 + Math.random() * 80);
    const mid = rowA + (rowB - rowA) * 0.7 + (Math.random() - 0.5) * 30;
    this.place(a.x, rowA, ha);
    if (serve) {
      const own = this.net - dir * (60 + Math.random() * 40);
      return this.fly([
        { x: own, sy: rowA + (mid - rowA) * 0.3, h: 0, peak: 10, d: dur * 0.3 },
        { x: far, sy: mid, h: 0, peak: 22, d: dur * 0.42 },
        { x: b.x, sy: rowB, h: hb, peak: 12, d: dur * 0.28 },
      ]);
    }
    return this.fly([
      { x: far, sy: mid, h: 0, peak: 26 + Math.random() * 14, d: dur * 0.64 },
      { x: b.x, sy: rowB, h: hb, peak: 12, d: dur * 0.36 },
    ]);
  }

  /** A miss. `net`: into the net; `long`: over the end; `pass`: past a whiffing receiver. Resolves with where the ball stops. */
  async miss(kind: "net" | "long" | "pass", a: Pt, b: Pt, rowA: number, rowB: number, dur: number): Promise<Pt> {
    const dir = b.x > a.x ? 1 : -1;
    const ha = rowA - a.y;
    this.place(a.x, rowA, ha);
    const bx = this.bounds;
    const rest = (x: number, y: number) => ({ x: Math.min(bx.x1, Math.max(bx.x0, x)), y: Math.min(bx.y1, Math.max(bx.y0, y)) });
    let end: Pt;
    if (kind === "net") {
      const sy = rowA + (rowB - rowA) * 0.45;
      const edge = dir > 0 ? this.x0 + 4 : this.x1 - 4;
      end = rest(edge - dir * (60 + Math.random() * 70), sy + LIFT + (Math.random() - 0.3) * 90);
      await this.fly([
        { x: this.net - dir * 4, sy, h: 9, peak: 18, d: dur * 0.5 },
        { x: this.net - dir * 16, sy, h: 0, peak: 5, d: 0.22 },
        { x: this.net - dir * 44, sy, h: 0, peak: 4, d: 0.25 },
        { x: edge, sy: sy + 4, h: 0, peak: 0, d: 0.7, ease: "power1.in" },
        { x: edge - dir * 22, sy: sy + 8, h: -LIFT, peak: 4, d: 0.22 },
      ]);
      await this.roll(end, 0.9);
      return end;
    }
    if (kind === "long") {
      const edge = dir > 0 ? this.x1 : this.x0;
      const land = { x: edge + dir * (70 + Math.random() * 40), sy: rowB + (Math.random() - 0.4) * 70 };
      end = rest(land.x + dir * (40 + Math.random() * 60), land.sy + LIFT + (Math.random() - 0.5) * 80);
      await this.fly([
        { x: land.x, sy: land.sy, h: -LIFT, peak: 54, d: dur * 1.1 },
        { x: land.x + dir * 34, sy: land.sy + 6, h: -LIFT, peak: 16, d: 0.32 },
        { x: land.x + dir * 54, sy: land.sy + 9, h: -LIFT, peak: 6, d: 0.22 },
      ]);
      await this.roll(end, 1);
      return end;
    }
    const far = this.net + dir * (60 + Math.random() * 60);
    const mid = rowA + (rowB - rowA) * 0.7;
    const past = { x: b.x + dir * 70, sy: rowB + (Math.random() - 0.5) * 40 };
    end = rest(past.x + dir * (40 + Math.random() * 50), past.sy + LIFT + (Math.random() - 0.5) * 90);
    await this.fly([
      { x: far, sy: mid, h: 0, peak: 30, d: dur * 0.62 },
      { x: past.x, sy: past.sy, h: -LIFT, peak: 22, d: dur * 0.6 },
      { x: past.x + dir * 26, sy: past.sy + 4, h: -LIFT, peak: 9, d: 0.26 },
    ]);
    await this.roll(end, 0.9);
    return end;
  }

  /** Roll along the floor to a floor point. */
  private roll(to: Pt, d: number) {
    const a = { ...this.b }, p = { u: 0 }, ty = to.y - LIFT;
    return this.anims.run(gsap.to(p, { u: 1, duration: d, ease: "power2.out", onUpdate: () => this.place(a.x + (to.x - a.x) * p.u, a.sy + (ty - a.sy) * p.u, -LIFT) }));
  }

  /** Throw the ball from one hand to another, over the table. */
  pass(a: Pt, b: Pt, rowA: number, rowB: number) {
    this.place(a.x, rowA, rowA - a.y);
    this.show(true);
    return this.fly([{ x: b.x, sy: rowB, h: rowB - b.y, peak: 60, d: 0.85 }]);
  }

  /** Where the ball is on the floor. */
  get at(): Pt { return { x: this.b.x, y: this.b.sy + LIFT }; }

  destroy() {
    this.anims.kill();
    gsap.killTweensOf(this.cards);
    this.ball.remove();
    this.shadow.remove();
  }
}
