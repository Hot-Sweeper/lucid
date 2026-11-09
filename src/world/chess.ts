import gsap from "gsap";
import { Anims, type Pt, type RoomStage } from "./room";
import { gameSound } from "../office/sound";

// A small chess table seen from above with an upright set of pieces. White sits on the left,
// so the ranks run left to right (rank 1 at the left) and the a-file is at the top.
// Games are real: famous games in UCI notation, checked move by move with a chess library.

export type ChessGame = { name: string; quip: string; moves: string[]; result: "mate" | "resign"; winner: "w" | "b" };

const g = (name: string, quip: string, result: ChessGame["result"], winner: ChessGame["winner"], moves: string): ChessGame =>
  ({ name, quip, result, winner, moves: moves.split(" ") });

export const GAMES: ChessGame[] = [
  // Morphy vs. Duke Karl and Count Isouard, Paris 1858
  g("Opera Game", "Morphy at the opera, 1858. Classic.", "mate", "w",
    "e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8"),
  // Legal vs. Saint Brie, Paris 1750: the queen is bait
  g("Legal's Mate", "Gave up the queen on purpose. Respect.", "mate", "w",
    "e2e4 e7e5 g1f3 d7d6 f1c4 c8g4 b1c3 g7g6 f3e5 g4d1 c4f7 e8e7 c3d5"),
  // Reti vs. Tartakower, Vienna 1910
  g("Reti vs. Tartakower", "Queen sacrifice, double check. Vienna 1910 vibes.", "mate", "w",
    "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 g8f6 d1d3 e7e5 d4e5 d8a5 c1d2 a5e5 e1c1 f6e4 d3d8 e8d8 d2g5 d8c7 g5d8"),
  // Anderssen vs. Kieseritzky, London 1851
  g("Immortal Game", "Gave away both rooks. The Immortal Game!", "mate", "w",
    "e2e4 e7e5 f2f4 e5f4 f1c4 d8h4 e1f1 b7b5 c4b5 g8f6 g1f3 h4h6 d2d3 f6h5 f3h4 h6g5 h4f5 c7c6 g2g4 h5f6 h1g1 c6b5 h2h4 g5g6 h4h5 g6g5 d1f3 f6g8 c1f4 g5f6 b1c3 f8c5 c3d5 f6b2 f4d6 c5g1 e4e5 b2a1 f1e2 b8a6 f5g7 e8d8 f3f6 g8f6 d6e7"),
  // Anderssen vs. Dufresne, Berlin 1852
  g("Evergreen Game", "That was the Evergreen Game, move for move.", "mate", "w",
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4 c5b4 c2c3 b4a5 d2d4 e5d4 e1g1 d4d3 d1b3 d8f6 e4e5 f6g6 f1e1 g8e7 c1a3 b7b5 b3b5 a8b8 b5a4 a5b6 b1d2 c8b7 d2e4 g6f5 c4d3 f5h5 e4f6 g7f6 e5f6 h8g8 a1d1 h5f3 e1e7 c6e7 a4d7 e8d7 d3f5 d7e8 f5d7 e8f8 a3e7"),
  // Deep Blue vs. Kasparov, game 6, New York 1997
  g("Deep Blue vs. Kasparov", "A machine beat Kasparov with that. 1997.", "resign", "w",
    "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 b8d7 e4g5 g8f6 f1d3 e7e6 g1f3 h7h6 g5e6 d8e7 e1g1 f7e6 d3g6 e8d8 c1f4 b7b5 a2a4 c8b7 f1e1 f6d5 f4g3 d8c8 a4b5 c6b5 d1d3 b7c6 g6f5 e6f5 e1e7 f8e7 c2c4"),
  // Edward Lasker vs. Thomas, London 1912: the king walks to g1
  g("Lasker vs. Thomas", "The king walked all the way to g1!", "mate", "w",
    "d2d4 e7e6 g1f3 f7f5 b1c3 g8f6 c1g5 f8e7 g5f6 e7f6 e2e4 f5e4 c3e4 b7b6 f3e5 e8g8 f1d3 c8b7 d1h5 d8e7 h5h7 g8h7 e4f6 h7h6 e5g4 h6g5 h2h4 g5f4 g2g3 f4f3 d3e2 f3g2 h1h2 g2g1 e1d2"),
  // Rotlewi vs. Rubinstein, Lodz 1907: black wins
  g("Rotlewi vs. Rubinstein", "Rubinstein, 1907. Black's whole army attacked.", "resign", "b",
    "d2d4 d7d5 g1f3 e7e6 e2e3 c7c5 c2c4 b8c6 b1c3 g8f6 d4c5 f8c5 a2a3 a7a6 b2b4 c5d6 c1b2 e8g8 d1d2 d8e7 f1d3 d5c4 d3c4 b7b5 c4d3 f8d8 d2e2 c8b7 e1g1 c6e5 f3e5 d6e5 f2f4 e5c7 e3e4 a8c8 e4e5 c7b6 g1h1 f6g4 d3e4 e7h4 g2g3 c8c3 g3h4 d8d2 e2d2 b7e4 d2g2 c3h3"),
];

const SQ = 13;                       // square size
const TW = 168, TD = 132;            // table top
const BX = (TW - SQ * 8) / 2, BY = 14;
const PAD = 18;                      // room above the table top for upright pieces

type Piece = { el: SVGGElement; type: string; white: boolean };

const PIECE: Record<string, string> = {
  p: `<path d="M-2.6 -1 L-1.5 -5 L1.5 -5 L2.6 -1 Z" fill="B"/><circle cy="-6.6" r="2.2" fill="B"/>`,
  r: `<path d="M-3 -1 L-2.6 -8 L2.6 -8 L3 -1 Z" fill="B"/><rect x="-3.4" y="-10.4" width="1.9" height="2.8" rx="0.4" fill="B"/><rect x="-0.95" y="-10.4" width="1.9" height="2.8" rx="0.4" fill="B"/><rect x="1.5" y="-10.4" width="1.9" height="2.8" rx="0.4" fill="B"/>`,
  n: `<path d="M-3 -1 L-2.6 -5.4 Q-3 -9.6 0.4 -11.2 L1.4 -10 Q4 -9 3.6 -6.6 L1 -7.2 L2.6 -1 Z" fill="B"/><circle cx="0.6" cy="-8.6" r="0.7" fill="S"/>`,
  b: `<path d="M-2.8 -1 L-1.6 -4.4 Q-3.2 -7 0 -10.6 Q3.2 -7 1.6 -4.4 L2.8 -1 Z" fill="B"/><circle cy="-11.2" r="1" fill="B"/><path d="M0.4 -8.8 L1.6 -7" stroke="S" stroke-width="0.8" stroke-linecap="round"/>`,
  q: `<path d="M-3 -1 L-1.8 -6.4 L-3.6 -10.2 L-1.3 -8.2 L0 -11.8 L1.3 -8.2 L3.6 -10.2 L1.8 -6.4 L3 -1 Z" fill="B"/><circle cy="-12.2" r="0.9" fill="B"/>`,
  k: `<path d="M-3.1 -1 L-1.9 -8 L1.9 -8 L3.1 -1 Z" fill="B"/><ellipse cy="-9" rx="2.8" ry="1.7" fill="B"/><rect x="-0.65" y="-14.2" width="1.3" height="4.4" rx="0.5" fill="B"/><rect x="-1.9" y="-13" width="3.8" height="1.3" rx="0.5" fill="B"/>`,
};

function pieceSvg(type: string, white: boolean) {
  const body = white ? "#fbf4e6" : "#30365a", shade = white ? "#cbbd9e" : "#1a1e33", hi = white ? "#ffffff" : "#59628f";
  const flip = type === "n" && !white ? ` transform="scale(-1 1)"` : "";
  return `<ellipse cy="-0.4" rx="3.9" ry="1.5" fill="${shade}"/><g${flip}>${PIECE[type].replace(/"B"/g, `"${body}"`).replace(/"S"/g, `"${shade}"`)}</g>
    <rect x="-2.2" y="-6" width="0.9" height="4" rx="0.45" fill="${hi}" opacity="0.6"/>`;
}

export class ChessTable {
  /** Seats: white on the left facing right, black on the right facing left, two spectator spots behind. */
  readonly seats: { w: Pt; b: Pt; watch: Pt[] };
  private ox: number;
  private oy: number;
  private svg: SVGSVGElement;
  private layer: SVGGElement;
  private marks: SVGRectElement[];
  private board = new Map<string, Piece>();
  private all: Piece[] = [];
  private taken = { w: 0, b: 0 };
  private anims = new Anims();

  constructor(stage: RoomStage, readonly cx: number, readonly cy: number) {
    this.ox = cx - TW / 2 - 6;
    this.oy = cy - TD / 2 - PAD;
    this.seats = { w: { x: cx - TW / 2 - 18, y: cy + 10 }, b: { x: cx + TW / 2 + 18, y: cy + 10 }, watch: [{ x: cx - 46, y: cy - TD / 2 - 16 }, { x: cx + 46, y: cy - TD / 2 - 16 }] };
    // stools under the players (drawn behind them)
    for (const s of [this.seats.w, this.seats.b]) stage.prop(s.x - 22, s.y - 34, 44, 40, s.y - 6, /* svg */ `
      <ellipse cx="22" cy="36" rx="18" ry="4" fill="#2b1d10" opacity="0.18"/>
      <rect x="18" y="10" width="8" height="26" rx="3" fill="#6b4f3a"/>
      <ellipse cx="22" cy="10" rx="19" ry="7" fill="#8a5fd6"/><ellipse cx="22" cy="8" rx="16" ry="5" fill="#a27cf0"/>`);
    let squares = "";
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++)
      squares += `<rect x="${BX + r * SQ}" y="${BY + f * SQ}" width="${SQ}" height="${SQ}" fill="${(f + r) % 2 ? "#f1dcb5" : "#b58863"}"/>`;
    // the table sits behind the seated players, so their reaching arms are drawn over it
    this.svg = stage.prop(this.ox, this.oy, TW + 12, TD + PAD + 40, cy - TD / 2 + 4, /* svg */ `
      <g transform="translate(6 ${PAD})">
        <ellipse cx="${TW / 2}" cy="${TD + 30}" rx="${TW / 2 - 4}" ry="7" fill="#2b1d10" opacity="0.18"/>
        <rect x="16" y="${TD}" width="9" height="28" rx="3" fill="#6b4f3a"/><rect x="${TW - 25}" y="${TD}" width="9" height="28" rx="3" fill="#6b4f3a"/>
        <rect x="0" y="${TD - 6}" width="${TW}" height="18" rx="6" fill="#8f6a4a"/>
        <rect x="0" y="0" width="${TW}" height="${TD}" rx="8" fill="#b48a5e"/>
        <rect x="6" y="3" width="${TW - 12}" height="3" rx="1.5" fill="#fff" opacity="0.22"/>
        <rect x="${BX - 4}" y="${BY - 4}" width="${SQ * 8 + 8}" height="${SQ * 8 + 8}" rx="3" fill="#6b4a32"/>
        ${squares}
        <g data-c="marks"><rect width="${SQ}" height="${SQ}" fill="#ffe066" opacity="0"/><rect width="${SQ}" height="${SQ}" fill="#ffe066" opacity="0"/><rect width="${SQ}" height="${SQ}" fill="#ff6f91" opacity="0"/></g>
        <g data-c="pieces"></g>
      </g>`);
    this.layer = this.svg.querySelector('[data-c="pieces"]') as SVGGElement;
    this.marks = [...this.svg.querySelectorAll('[data-c="marks"] rect')] as SVGRectElement[];
  }

  private at(sq: string): Pt {
    const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    return { x: BX + r * SQ + SQ / 2, y: BY + f * SQ + SQ / 2 + 4 };
  }

  /** Floor point over a square (where a hand reaches to). */
  reach(sq: string): Pt { const p = this.at(sq); return { x: this.ox + 6 + p.x, y: this.oy + PAD + p.y }; }

  private add(type: string, white: boolean, sq: string) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
    el.innerHTML = pieceSvg(type, white);
    this.layer.appendChild(el);
    const p = { el, type, white };
    gsap.set(el, this.at(sq));
    this.board.set(sq, p);
    this.all.push(p);
    return p;
  }

  /** Pieces further down the board are drawn in front. */
  private sort() {
    const ys = this.all.map((p) => ({ p, y: Number(gsap.getProperty(p.el, "y")) })).sort((a, b) => a.y - b.y);
    for (const { p } of ys) this.layer.appendChild(p.el);
  }

  /** Clear the board and set up a new game, pieces dropping onto their squares. */
  setup() {
    this.anims.kill();
    this.layer.innerHTML = "";
    this.board.clear();
    this.all = [];
    this.taken = { w: 0, b: 0 };
    for (const m of this.marks) m.setAttribute("opacity", "0");
    const back = "rnbqkbnr";
    for (let f = 0; f < 8; f++) {
      const file = "abcdefgh"[f];
      this.add(back[f], true, `${file}1`); this.add("p", true, `${file}2`);
      this.add("p", false, `${file}7`); this.add(back[f], false, `${file}8`);
    }
    this.sort();
    return this.anims.run(gsap.from(this.all.map((p) => p.el), { opacity: 0, y: "-=8", duration: 0.3, stagger: 0.02, ease: "back.out(2)" }));
  }

  /** Play a UCI move: slide the piece, take a captured one off to the side, castle, promote. */
  async move(uci: string) {
    const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
    const p = this.board.get(from);
    if (!p) return { capture: false };
    let victimSq = to;
    // en passant: a pawn moving diagonally onto an empty square
    if (p.type === "p" && from[0] !== to[0] && !this.board.get(to)) victimSq = `${to[0]}${from[1]}`;
    const victim = this.board.get(victimSq);
    this.board.delete(from);
    if (victim) this.board.delete(victimSq);
    this.board.set(to, p);
    this.mark(from, to);
    const dest = this.at(to);
    const lift = gsap.timeline()
      .to(p.el, { y: "-=5", duration: 0.14, ease: "power2.out" })
      .to(p.el, { x: dest.x, y: dest.y - 5, duration: 0.45, ease: "power2.inOut" })
      .to(p.el, { y: dest.y, duration: 0.14, ease: "power2.in" });
    this.layer.appendChild(p.el);
    await this.anims.run(lift);
    gameSound.at(victim ? 'chess-take' : 'chess', p.el, .9);
    if (victim) void this.capture(victim);
    // castling: the rook jumps over
    if (p.type === "k" && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
      const rank = from[1], short = to[0] === "g";
      const rf = `${short ? "h" : "a"}${rank}`, rt = `${short ? "f" : "d"}${rank}`;
      const rook = this.board.get(rf);
      if (rook) {
        this.board.delete(rf); this.board.set(rt, rook);
        const d = this.at(rt);
        await this.anims.run(gsap.timeline().to(rook.el, { y: "-=6", duration: 0.12 }).to(rook.el, { x: d.x, y: d.y - 6, duration: 0.35, ease: "power2.inOut" }).to(rook.el, { y: d.y, duration: 0.12 }));
        gameSound.at('chess', rook.el, .8);
      }
    }
    if (promo) {
      p.type = promo;
      p.el.innerHTML = pieceSvg(promo, p.white);
      this.anims.add(gsap.fromTo(p.el, { scale: 1.6, transformOrigin: "50% 100%" }, { scale: 1, duration: 0.4, ease: "back.out(3)" }));
    }
    this.sort();
    return { capture: !!victim, piece: p.type };
  }

  /** A captured piece hops off the board to the capturer's side of the table edge. */
  private capture(v: Piece) {
    const byWhite = !v.white;
    const n = byWhite ? this.taken.w++ : this.taken.b++;
    const row = Math.floor(n / 9), col = n % 9;
    const x = byWhite ? 8 + col * 8 : TW - 8 - col * 8;
    const y = row ? 9 : TD - 3;
    return this.anims.run(gsap.timeline()
      .to(v.el, { y: "-=10", scale: 0.85, duration: 0.18, ease: "power2.out", transformOrigin: "50% 100%" })
      .to(v.el, { x, y: y - 8, duration: 0.4, ease: "power2.inOut" })
      .to(v.el, { y, duration: 0.15, ease: "bounce.out" })
      .add(() => this.sort()));
  }

  private mark(a: string, b: string) {
    [a, b].forEach((sq, i) => {
      const p = this.at(sq);
      const m = this.marks[i];
      m.setAttribute("x", String(p.x - SQ / 2)); m.setAttribute("y", String(p.y - 4 - SQ / 2));
      m.setAttribute("opacity", "0.45");
    });
  }

  private king(white: boolean) {
    for (const [sq, p] of this.board) if (p.type === "k" && p.white === white) return { sq, p };
    return null;
  }

  /** The mated king's square lights up. */
  flashKing(white: boolean) {
    const k = this.king(white);
    if (!k) return;
    const p = this.at(k.sq), m = this.marks[2];
    m.setAttribute("x", String(p.x - SQ / 2)); m.setAttribute("y", String(p.y - 4 - SQ / 2));
    this.anims.add(gsap.fromTo(m, { opacity: 0 }, { opacity: 0.75, duration: 0.25, yoyo: true, repeat: 5, ease: "sine.inOut" }));
  }

  /** The loser tips over their king. */
  tip(white: boolean) {
    const k = this.king(white);
    if (!k) return Promise.resolve();
    return this.anims.run(gsap.timeline()
      .to(k.p.el, { rotation: white ? -12 : 12, duration: 0.3, ease: "sine.inOut", transformOrigin: "50% 100%" })
      .to(k.p.el, { rotation: white ? 84 : -84, duration: 0.45, ease: "bounce.out" }));
  }

  /** Sweep the pieces off the board after a game. */
  clear() {
    return this.anims.run(gsap.to(this.all.map((p) => p.el), { opacity: 0, y: "-=6", duration: 0.25, stagger: 0.01 }));
  }

  destroy() { this.anims.kill(); gsap.killTweensOf(this.all.map((p) => p.el)); }
}
