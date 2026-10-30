import type { FunHost, FunOpts, Outcome } from "./types";
import { Kit, runApp, rnd, irnd, chance, pick, h, rel, canvas } from "./util";

// BeatLab: a pattern-based beat studio. The robot programs drums in the channel
// rack, draws an 808 and a pluck in the piano roll, arranges patterns in the
// playlist and listens back. Purely visual: there is no sound.

type Note = { s: number; l: number; p: number; v: number };
type Pat = { n: number; name: string; color: string; steps: boolean[][]; notes: Note[][] };
type Block = { track: number; bar: number; pat: Pat; el: HTMLElement };
type View = "rack" | "roll" | "pl";

const CH = [
  { name: "Kick", short: "Kick", color: "#ff9f5a", f: 1.6, d: 9, a: 1 },
  { name: "Snare", short: "Snr", color: "#ff6f91", f: 15, d: 14, a: 0.7 },
  { name: "Clap", short: "Clap", color: "#f6ecdc", f: 23, d: 16, a: 0.6 },
  { name: "Hi Hat", short: "Hat", color: "#4fb6ff", f: 46, d: 26, a: 0.32 },
  { name: "808", short: "808", color: "#4ff0a0", f: 1.1, d: 3, a: 0.95 },
  { name: "Pluck", short: "Plk", color: "#b07cff", f: 7, d: 6, a: 0.55 },
];
const KICK = 0, SNARE = 1, CLAP = 2, HAT = 3, BASS = 4, LEAD = 5;
const LEN = 32, ROWS = 16, BARS = 8;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
const PAT_COLORS = ["#ff9f5a", "#4ff0a0", "#b07cff"];

const N = (s: number, l: number, p: number, v = 0.78): Note => ({ s, l, p, v });
type Style = { bpm: number; kick: number[]; snare: number[]; clap: number[]; hat: number[]; bass: Note[]; lead: Note[] };
const STYLES: Style[] = [
  { // half-time trap
    bpm: 140, kick: [0, 6, 10], snare: [8], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14],
    bass: [N(0, 5, 0), N(6, 3, 0), N(10, 6, 3), N(16, 5, 0), N(22, 3, 7), N(26, 6, 5)],
    lead: [N(0, 2, 15), N(2, 2, 14), N(4, 4, 12), N(8, 2, 10), N(10, 2, 12), N(12, 4, 7), N(16, 2, 15), N(18, 2, 14), N(20, 4, 12), N(24, 3, 8), N(28, 4, 7)],
  },
  { // four on the floor
    bpm: 126, kick: [0, 4, 8, 12], snare: [], clap: [4, 12], hat: [2, 6, 10, 14],
    bass: [N(2, 2, 0), N(6, 2, 0), N(10, 2, 3), N(14, 2, 5), N(18, 2, 0), N(22, 2, 0), N(26, 2, 7), N(30, 2, 5)],
    lead: [N(0, 1, 12), N(3, 1, 12), N(6, 2, 15), N(10, 1, 10), N(12, 2, 12), N(16, 1, 12), N(19, 1, 12), N(22, 2, 15), N(26, 1, 14), N(28, 3, 10)],
  },
  { // bouncy funk
    bpm: 130, kick: [0, 3, 7, 10], snare: [6, 14], clap: [4, 12], hat: [2, 6, 10, 14],
    bass: [N(0, 3, 0), N(3, 3, 0), N(7, 3, 5), N(10, 4, 3), N(16, 3, 0), N(19, 3, 0), N(23, 3, 7), N(26, 4, 5)],
    lead: [N(0, 1, 12), N(1, 1, 10), N(2, 2, 12), N(6, 2, 7), N(8, 1, 8), N(10, 2, 7), N(12, 4, 3), N(16, 1, 12), N(17, 1, 10), N(18, 2, 12), N(22, 2, 15), N(24, 2, 14), N(28, 4, 12)],
  },
];

const ICON = {
  flask: `<svg viewBox="0 0 24 24"><defs><linearGradient id="lbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb877"/><stop offset="1" stop-color="#ff6f91"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#lbg)"/><path d="M9.5 5h5v4.2l4 7.3c.6 1.1-.2 2.5-1.5 2.5h-10c-1.3 0-2.1-1.4-1.5-2.5l4-7.3z" fill="#f6ecdc"/><path d="M8.2 13.5h7.6l2.1 3.6c.3.6-.1 1.4-.8 1.4H7c-.7 0-1.1-.8-.8-1.4z" fill="#4ff0a0"/><circle cx="11" cy="16" r="1" fill="#f6ecdc"/></svg>`,
  play: `<svg class="life-bt-i-play" viewBox="0 0 12 12"><path d="M3 1.6v8.8c0 .5.5.8 1 .5l6.6-4.4c.4-.3.4-.8 0-1L4 1.1c-.5-.3-1 0-1 .5z"/></svg><svg class="life-bt-i-pause" viewBox="0 0 12 12"><rect x="2.4" y="1.5" width="2.6" height="9" rx="1"/><rect x="7" y="1.5" width="2.6" height="9" rx="1"/></svg>`,
  stop: `<svg viewBox="0 0 12 12"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.6"/></svg>`,
  rec: `<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.8"/></svg>`,
  pl: `<svg viewBox="0 0 16 16"><rect x="1" y="2.5" width="9" height="3" rx="1"/><rect x="5" y="6.5" width="10" height="3" rx="1"/><rect x="2.5" y="10.5" width="7" height="3" rx="1"/></svg>`,
  roll: `<svg viewBox="0 0 16 16"><rect x="1" y="1.5" width="3.5" height="13" rx="1"/><rect x="6.5" y="3" width="5" height="2.4" rx="1"/><rect x="8.5" y="7" width="6" height="2.4" rx="1"/><rect x="6" y="11" width="4" height="2.4" rx="1"/></svg>`,
  rack: `<svg viewBox="0 0 16 16"><rect x="1" y="2" width="4" height="3" rx="1"/><rect x="6" y="2" width="4" height="3" rx="1"/><rect x="11" y="2" width="4" height="3" rx="1"/><rect x="1" y="6.5" width="4" height="3" rx="1"/><rect x="6" y="6.5" width="4" height="3" rx="1"/><rect x="11" y="6.5" width="4" height="3" rx="1"/><rect x="1" y="11" width="4" height="3" rx="1"/><rect x="6" y="11" width="4" height="3" rx="1"/><rect x="11" y="11" width="4" height="3" rx="1"/></svg>`,
  mix: `<svg viewBox="0 0 16 16"><rect x="2" y="1.5" width="2" height="13" rx="1"/><rect x="7" y="1.5" width="2" height="13" rx="1"/><rect x="12" y="1.5" width="2" height="13" rx="1"/><rect x="0.8" y="9" width="4.4" height="3" rx="1.2"/><rect x="5.8" y="4" width="4.4" height="3" rx="1.2"/><rect x="10.8" y="7" width="4.4" height="3" rx="1.2"/></svg>`,
  trash: `<svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="2" rx="1"/><rect x="6" y="1.4" width="4" height="2" rx="1"/><path d="M4 6h8l-.7 7.2c-.1.8-.7 1.3-1.5 1.3H6.2c-.8 0-1.4-.5-1.5-1.3z"/></svg>`,
  pencil: `<svg viewBox="0 0 16 16"><path d="M10.8 2.2l3 3-7.9 7.9-3.7.8.8-3.7z"/></svg>`,
  brush: `<svg viewBox="0 0 16 16"><path d="M13.6 1.6c.5.4.4 1.1 0 1.6L8.4 9.4 6.6 7.6l5.4-5.8c.5-.5 1.1-.6 1.6-.2z"/><path d="M5.6 8.7l1.7 1.7c-.3 2.4-2.2 3.9-5.3 3.9.9-1 .9-2.2 1.2-3.3.3-1.2 1.2-2.1 2.4-2.3z"/></svg>`,
  erase: `<svg viewBox="0 0 16 16"><path d="M9.5 2.3l4.2 4.2c.4.4.4 1 0 1.4l-5.6 5.6H4.6L2.3 11.2c-.4-.4-.4-1 0-1.4l5.8-7.5c.4-.4 1-.4 1.4 0z"/></svg>`,
};

export async function makeBeat(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  return runApp(body, host, opts, (k) => new Studio(k, body).session());
}

class Studio {
  root: HTMLElement;
  els: Record<string, HTMLElement> = {};
  rack: { row: HTMLElement; led: HTMLElement; name: HTMLElement; steps: HTMLElement[]; prev: HTMLElement; vol: HTMLElement; pan: HTMLElement }[] = [];
  posLeds: HTMLElement[] = [];
  views!: Record<View, HTMLElement>;
  viewBtns!: Record<View | "mix", HTMLElement>;
  strips: { meters: { cover: HTMLElement; peak: HTMLElement }[]; cap: HTMLElement; val: number }[] = [];
  patItems: HTMLElement[] = [];
  lanes: HTMLElement[] = [];
  keys: HTMLElement[] = [];
  noteEls = new Map<Note, HTMLElement>();
  prevEls = new Map<Note, HTMLElement>();
  blocks: Block[] = [];

  pats: Pat[] = [];
  cur!: Pat;
  style: Style = pick(STYLES);
  view: View = "rack";
  rollCh = LEAD;
  bpm = 140;
  playing = false;
  mode: "pat" | "song" = "pat";
  t0 = 0;
  step = -1;
  pos = 0; // fractional step position
  now16 = -1;

  levels = new Array(7).fill(0);
  peaks = new Array(7).fill(0);
  flashes = new Map<HTMLElement, number>();
  imps: { f: number; d: number; a: number; t: number; ph: number }[] = [];
  scope!: CanvasRenderingContext2D;
  scopeW = 70; scopeH = 22;

  constructor(private k: Kit, private body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "life-bt");
    body.appendChild(this.root);
    this.build();
    for (let i = 0; i < 3; i++) this.pats.push(this.newPat(i));
    this.cur = this.pats[0];
    this.paintRack(false);
    this.k.every((now, dt) => this.frame(now, dt));
  }

  newPat(i: number): Pat {
    return { n: i + 1, name: `Pattern ${i + 1}`, color: PAT_COLORS[i], steps: CH.map(() => new Array(16).fill(false)), notes: CH.map(() => []) };
  }

  // --- DOM ------------------------------------------------------------------------
  build() {
    const r = this.root;
    r.innerHTML = `
      <header class="life-bt-top">
        <div class="life-bt-brand">${ICON.flask}<span>BeatLab</span></div>
        <div class="life-bt-tp">
          <span class="life-bt-btn life-bt-play">${ICON.play}</span>
          <span class="life-bt-btn life-bt-stop">${ICON.stop}</span>
          <span class="life-bt-btn life-bt-rec">${ICON.rec}</span>
        </div>
        <div class="life-bt-mode"><span class="life-bt-m-pat on">Pat</span><span class="life-bt-m-song">Song</span></div>
        <div class="life-bt-lcd life-bt-bpm"><b>140</b><s>.000</s></div>
        <div class="life-bt-lcd life-bt-time">1:01:00</div>
        <canvas class="life-bt-scope"></canvas>
        <div class="life-bt-patsel"><i></i><span>Pattern 1</span></div>
        <div class="life-bt-hint"></div>
        <nav class="life-bt-views">
          <span class="life-bt-btn" data-v="pl">${ICON.pl}</span>
          <span class="life-bt-btn" data-v="roll">${ICON.roll}</span>
          <span class="life-bt-btn on" data-v="rack">${ICON.rack}</span>
          <span class="life-bt-btn on" data-v="mix">${ICON.mix}</span>
        </nav>
      </header>
      <div class="life-bt-main">
        <div class="life-bt-work">
          <section class="life-bt-view life-bt-rack">
            <div class="life-bt-vhead"><span class="life-bt-vt">Channel rack</span><span class="life-bt-swing"><span class="life-bt-knob"><i></i></span>Swing</span><span class="life-bt-btn life-bt-clear">${ICON.trash}</span></div>
            <div class="life-bt-row life-bt-posrow"><i></i><span></span><span></span><span></span><div class="life-bt-steps"></div></div>
            <div class="life-bt-rows"></div>
          </section>
          <section class="life-bt-view life-bt-roll">
            <div class="life-bt-vhead"><span class="life-bt-tool on">${ICON.pencil}</span><span class="life-bt-tool">${ICON.brush}</span><span class="life-bt-tool">${ICON.erase}</span><span class="life-bt-vt">Piano roll</span><span class="life-bt-rch"><i></i><span></span></span></div>
            <div class="life-bt-rruler"></div>
            <div class="life-bt-rbody"><div class="life-bt-keys"></div><div class="life-bt-grid"><div class="life-bt-rbg"></div><div class="life-bt-notes"></div><i class="life-bt-ph"></i></div></div>
            <div class="life-bt-vel"><div class="life-bt-velin"></div></div>
          </section>
          <section class="life-bt-view life-bt-pl">
            <div class="life-bt-vhead"><span class="life-bt-vt">Playlist</span><span class="life-bt-dim">Arrangement</span></div>
            <div class="life-bt-plbody">
              <div class="life-bt-plpats"></div>
              <div class="life-bt-pllabels"></div>
              <div class="life-bt-plarea"><div class="life-bt-plruler"></div><div class="life-bt-lanes"></div><i class="life-bt-ph"></i></div>
            </div>
          </section>
        </div>
        <aside class="life-bt-mix">
          <div class="life-bt-vhead"><span class="life-bt-vt">Mixer</span></div>
          <div class="life-bt-strips"></div>
        </aside>
      </div>`;
    const q = (s: string) => r.querySelector(s) as HTMLElement;
    for (const [key, sel] of Object.entries({
      play: ".life-bt-play", stop: ".life-bt-stop", rec: ".life-bt-rec", mPat: ".life-bt-m-pat", mSong: ".life-bt-m-song",
      bpm: ".life-bt-bpm", bpmVal: ".life-bt-bpm b", time: ".life-bt-time", patsel: ".life-bt-patsel", hint: ".life-bt-hint",
      clear: ".life-bt-clear", swing: ".life-bt-swing .life-bt-knob", rows: ".life-bt-rows", notes: ".life-bt-notes", grid: ".life-bt-grid",
      rollPh: ".life-bt-roll .life-bt-ph", vel: ".life-bt-velin", rch: ".life-bt-rch", plarea: ".life-bt-plarea", plPh: ".life-bt-plarea .life-bt-ph",
      work: ".life-bt-work",
    })) this.els[key] = q(sel);
    this.views = { rack: q(".life-bt-rack"), roll: q(".life-bt-roll"), pl: q(".life-bt-pl") };
    this.viewBtns = { pl: q('[data-v="pl"]'), roll: q('[data-v="roll"]'), rack: q('[data-v="rack"]'), mix: q('[data-v="mix"]') };
    this.k.set([this.views.roll, this.views.pl], { autoAlpha: 0 });

    this.scope = canvas(q(".life-bt-scope") as HTMLCanvasElement, this.scopeW, this.scopeH);

    // channel rack rows
    const stepsHtml = Array.from({ length: 16 }, (_, i) => `<b class="life-bt-step g${(i >> 2) & 1}"><i></i><u></u></b>`).join("");
    q(".life-bt-posrow .life-bt-steps").innerHTML = Array.from({ length: 16 }, () => `<em></em>`).join("");
    this.posLeds = [...r.querySelectorAll<HTMLElement>(".life-bt-posrow em")];
    CH.forEach((c, i) => {
      const row = h("div", "life-bt-row", `<i class="life-bt-led"></i><span class="life-bt-knob life-bt-vol"><i></i></span><span class="life-bt-knob life-bt-pan"><i></i></span><span class="life-bt-name">${c.name}</span><div class="life-bt-steps">${stepsHtml}</div><div class="life-bt-prev"></div>`);
      row.style.setProperty("--c", c.color);
      this.els.rows.appendChild(row);
      this.rack.push({
        row, led: row.querySelector(".life-bt-led")!, name: row.querySelector(".life-bt-name")!, prev: row.querySelector(".life-bt-prev")!,
        steps: [...row.querySelectorAll<HTMLElement>(".life-bt-step")], vol: row.querySelector(".life-bt-vol i")!, pan: row.querySelector(".life-bt-pan i")!,
      });
      this.k.set(row.querySelector(".life-bt-vol i"), { rotation: rnd(30, 70) });
      this.k.set(row.querySelector(".life-bt-pan i"), { rotation: pick([0, 0, -30, 25]) });
    });

    // piano roll
    const keys = r.querySelector(".life-bt-keys")!;
    for (let p = ROWS - 1; p >= 0; p--) {
      const key = h("i", BLACK.has(p % 12) ? "life-bt-key b" : "life-bt-key", p % 12 === 0 ? `<span>C</span>` : "");
      keys.appendChild(key);
      this.keys[p] = key;
    }
    (r.querySelector(".life-bt-rbg") as HTMLElement).innerHTML = Array.from({ length: ROWS }, (_, i) => `<i class="${BLACK.has((ROWS - 1 - i) % 12) ? "b" : ""}"></i>`).join("");
    (r.querySelector(".life-bt-rruler") as HTMLElement).innerHTML = Array.from({ length: 8 }, (_, i) => `<span>${i % 4 === 0 ? 1 + i / 4 : ""}</span>`).join("");

    // playlist
    const pp = r.querySelector(".life-bt-plpats")!;
    for (let i = 0; i < 3; i++) {
      const it = h("div", "life-bt-plpat", `<i style="background:${PAT_COLORS[i]}"></i><span>${["Drums", "808", "Pluck"][i]}</span>`);
      pp.appendChild(it);
      this.patItems.push(it);
    }
    const labels = r.querySelector(".life-bt-pllabels")!, lanes = r.querySelector(".life-bt-lanes")!;
    for (let t = 0; t < 5; t++) {
      labels.appendChild(h("span", "", `Track ${t + 1}`));
      const lane = h("div", "life-bt-lane");
      lanes.appendChild(lane);
      this.lanes.push(lane);
    }
    (r.querySelector(".life-bt-plruler") as HTMLElement).innerHTML = Array.from({ length: BARS }, (_, i) => `<span>${i + 1}</span>`).join("");

    // mixer
    const strips = r.querySelector(".life-bt-strips")!;
    ["Mst", ...CH.map((c) => c.short)].forEach((name, i) => {
      const s = h("div", "life-bt-strip" + (i === 0 ? " master" : ""), `<span class="life-bt-knob life-bt-pan"><i></i></span><div class="life-bt-mtr"><b><s></s><em></em></b><b><s></s><em></em></b></div><div class="life-bt-fader"><i></i></div><span class="life-bt-sn">${name}</span>`);
      s.style.setProperty("--c", i === 0 ? "#f6ecdc" : CH[i - 1].color);
      strips.appendChild(s);
      const val = i === 0 ? 0.8 : rnd(0.62, 0.8);
      const cap = s.querySelector(".life-bt-fader i") as HTMLElement;
      cap.style.top = `${(1 - val) * 100}%`;
      this.strips.push({ meters: [...s.querySelectorAll(".life-bt-mtr b")].map((b) => ({ cover: b.querySelector("s") as HTMLElement, peak: b.querySelector("em") as HTMLElement })), cap, val });
    });
    this.setPatSel(0, false);
  }

  hint(t: string) { this.els.hint.textContent = t; }

  // --- rendering -------------------------------------------------------------------
  paintStep(c: number, i: number, anim: boolean) {
    const el = this.rack[c].steps[i], lit = el.querySelector("i")!;
    const on = this.cur.steps[c][i];
    el.classList.toggle("lit", on);
    if (!anim) { this.k.set(lit, { opacity: on ? 1 : 0, scale: 1 }); return; }
    if (on) {
      this.k.fromTo(lit, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(3)" });
      this.k.fromTo(el, { scale: 1.16 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.45)" });
    } else {
      this.k.to(lit, { opacity: 0, scale: 0.35, duration: 0.26, ease: "power2.in" });
      this.k.fromTo(el, { x: -1.5 }, { x: 0, duration: 0.3, ease: "elastic.out(1.2, 0.3)" });
    }
  }

  paintRack(anim: boolean) {
    CH.forEach((_, c) => {
      const prev = this.cur.notes[c].length > 0;
      this.rack[c].row.classList.toggle("has-prev", prev);
      this.renderPrev(c);
      for (let i = 0; i < 16; i++) this.paintStep(c, i, false);
    });
    if (anim) this.k.fromTo(this.els.rows.querySelectorAll(".life-bt-steps, .life-bt-prev"), { opacity: 0.2, x: 6 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out", stagger: 0.035 });
  }

  renderPrev(c: number) {
    const box = this.rack[c].prev;
    box.innerHTML = "";
    const ns = this.cur.notes[c];
    if (!ns.length) return;
    const lo = Math.min(...ns.map((n) => n.p)), hi = Math.max(...ns.map((n) => n.p));
    for (const n of ns) {
      const el = h("i");
      const y = hi === lo ? 0.5 : 1 - (n.p - lo) / (hi - lo);
      el.style.cssText = `left:${(n.s / LEN) * 100}%;width:calc(${(n.l / LEN) * 100}% - 1px);top:${8 + y * 66}%`;
      box.appendChild(el);
      this.prevEls.set(n, el);
    }
  }

  setPatSel(i: number, anim = true) {
    const p = this.pats[i] || this.newPat(i);
    const sel = this.els.patsel;
    (sel.querySelector("i") as HTMLElement).style.background = PAT_COLORS[i];
    (sel.querySelector("span") as HTMLElement).textContent = `Pattern ${p.n}`;
    if (anim) this.k.fromTo(sel.querySelector("span"), { y: -6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "expo.out" });
  }

  async showView(v: View) {
    if (this.view === v) return;
    const a = this.views[this.view], b = this.views[v];
    this.view = v;
    for (const key of ["pl", "roll", "rack"] as const) this.viewBtns[key].classList.toggle("on", key === v);
    const tl = this.k.tl();
    tl.to(a, { autoAlpha: 0, scale: 0.985, duration: 0.22, ease: "power2.in" })
      .fromTo(b, { autoAlpha: 0, scale: 1.02, y: 6 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: "expo.out" }, 0.12);
    if (v === "rack") this.paintRack(true);
    await this.k.sleep(380);
  }

  async goView(v: View) {
    const keys: Record<View, string> = { pl: "F5", roll: "F7", rack: "F6" };
    this.hint(({ pl: "Playlist", roll: "Piano roll", rack: "Channel rack" })[v]);
    if (chance(0.35)) { await this.k.sleep(rnd(150, 300)); this.k.tap(keys[v]); }
    else await this.k.click(this.viewBtns[v], 0.5, 0.5, 420);
    await this.showView(v);
  }

  // --- transport -----------------------------------------------------------------
  get stepMs() { return 60000 / this.bpm / 4; }

  play(mode: "pat" | "song") {
    this.mode = mode;
    this.playing = true;
    this.t0 = performance.now();
    this.step = -1;
    this.els.play.classList.add("on");
    this.els.mPat.classList.toggle("on", mode === "pat");
    this.els.mSong.classList.toggle("on", mode === "song");
    this.k.fromTo(this.els.play, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
  }

  stop() {
    this.playing = false;
    this.els.play.classList.remove("on");
    this.setNow(-1);
    this.pos = 0;
    this.els.time.textContent = "1:01:00";
    this.k.fromTo(this.els.stop, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
  }

  async togglePlay(mode: "pat" | "song" = "pat") {
    if (chance(0.7)) { this.hint("Play"); await this.k.sleep(rnd(120, 260)); this.k.tap(" "); }
    else await this.k.click(this.els.play, 0.5, 0.5, 380);
    if (this.playing) this.stop(); else this.play(mode);
  }

  setNow(i: number) {
    if (this.now16 === i) return;
    if (this.now16 >= 0) {
      this.posLeds[this.now16].classList.remove("on");
      for (const r of this.rack) r.steps[this.now16].classList.remove("now");
    }
    this.now16 = i;
    if (i >= 0) {
      this.posLeds[i].classList.add("on");
      for (const r of this.rack) r.steps[i].classList.add("now");
    }
  }

  flash(el: HTMLElement, v = 1) { this.flashes.set(el, v); }

  trigger(c: number, v: number) {
    this.flash(this.rack[c].led);
    const lvl = Math.min(1, 0.55 + 0.4 * v + rnd(-0.05, 0.08));
    this.levels[c + 1] = Math.max(this.levels[c + 1], lvl * this.strips[c + 1].val * 1.2);
    this.levels[0] = Math.max(this.levels[0], Math.min(1, lvl * 0.9 + 0.1));
    this.imps.push({ f: CH[c].f, d: CH[c].d, a: CH[c].a * v, t: performance.now(), ph: rnd(0, 6) });
    if (this.imps.length > 10) this.imps.shift();
  }

  hitPat(p: Pat, i32: number, visual: boolean) {
    for (let c = 0; c < CH.length; c++) {
      const ns = p.notes[c];
      if (ns.length) {
        for (const n of ns) if (n.s === i32) {
          this.trigger(c, n.v);
          if (visual) {
            const pe = this.prevEls.get(n); if (pe) this.flash(pe);
            const ne = this.noteEls.get(n); if (ne) this.flash(ne);
            if (this.view === "roll" && c === this.rollCh) this.flash(this.keys[n.p]);
          }
        }
      } else if (p.steps[c][i32 % 16]) {
        this.trigger(c, c === HAT && i32 % 4 ? 0.7 : 1);
        if (visual) this.flash(this.rack[c].steps[i32 % 16]);
      }
    }
  }

  onStep(s: number) {
    if (this.mode === "pat") {
      this.setNow(s % 16);
      this.hitPat(this.cur, s % LEN, true);
    } else {
      const g = s % (BARS * 16), bar = Math.floor(g / 16);
      for (const b of this.blocks) {
        if (bar < b.bar || bar >= b.bar + 2) continue;
        const local = g - b.bar * 16;
        this.hitPat(b.pat, local, false);
        if (local % 4 === 0) this.flash(b.el, local % 16 === 0 ? 1 : 0.45);
      }
    }
  }

  frame(now: number, dt: number) {
    if (this.playing) {
      const s = Math.floor((now - this.t0) / this.stepMs);
      if (s - this.step > 3) this.step = s - 1;
      while (this.step < s) this.onStep(++this.step);
      this.pos = (now - this.t0) / this.stepMs;
      const total = this.mode === "pat" ? LEN : BARS * 16;
      const g = this.pos % total;
      const bar = Math.floor(g / 16) + 1, st = Math.floor(g % 16) + 1, tick = Math.floor((g % 1) * 24);
      this.els.time.textContent = `${bar}:${String(st).padStart(2, "0")}:${String(tick).padStart(2, "0")}`;
      if (this.view === "roll") this.els.rollPh.style.transform = `translateX(${((this.pos % LEN) / LEN) * this.els.grid.clientWidth}px)`;
      if (this.view === "pl" && this.mode === "song") this.els.plPh.style.transform = `translateX(${(g / (BARS * 16)) * (this.els.plarea.clientWidth - 0)}px)`;
    }
    this.els.rollPh.style.opacity = this.playing && this.view === "roll" ? "1" : "0";
    this.els.plPh.style.opacity = this.playing && this.mode === "song" ? "1" : "0";

    // flashes decay
    for (const [el, v] of this.flashes) {
      const nv = v - dt * 4.2;
      if (nv <= 0) { el.style.removeProperty("--f"); this.flashes.delete(el); }
      else { el.style.setProperty("--f", nv.toFixed(3)); this.flashes.set(el, nv); }
    }

    // meters
    for (let i = 0; i < 7; i++) {
      this.levels[i] *= Math.exp(-dt * (i === 0 ? 5 : 7));
      if (this.levels[i] > this.peaks[i]) this.peaks[i] = this.levels[i];
      else this.peaks[i] = Math.max(0, this.peaks[i] - dt * 0.35);
      const st = this.strips[i];
      st.meters.forEach((m, j) => {
        const l = Math.min(1, this.levels[i] * (j ? 0.94 : 1));
        m.cover.style.transform = `scaleY(${1 - l})`;
        m.peak.style.transform = `translateY(${(1 - this.peaks[i]) * 100}%)`;
        m.peak.style.opacity = this.peaks[i] > 0.04 ? "1" : "0";
      });
    }

    // oscilloscope: a filled, mirrored waveform from recent hits
    const ctx = this.scope, W = this.scopeW, H = this.scopeH;
    ctx.clearRect(0, 0, W, H);
    const live = this.imps.filter((m) => (now - m.t) / 1000 < 1.2);
    this.imps = live;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(79,240,160,0.9)"); g.addColorStop(1, "rgba(79,182,255,0.9)");
    ctx.fillStyle = g;
    ctx.beginPath();
    const ys: number[] = [];
    for (let x = 0; x <= W; x += 1) {
      let y = 0;
      for (const m of live) {
        const age = (now - m.t) / 1000 + x / W * 0.05;
        y += m.a * Math.exp(-age * m.d) * Math.sin((x / W) * m.f * Math.PI * 2 + m.ph + now / 90);
      }
      ys.push(Math.max(-1, Math.min(1, y)) * H * 0.42);
    }
    ctx.moveTo(0, H / 2);
    ys.forEach((y, x) => ctx.lineTo(x, H / 2 - Math.abs(y) - 0.6));
    for (let x = W; x >= 0; x--) ctx.lineTo(x, H / 2 + Math.abs(ys[x]) + 0.6);
    ctx.closePath();
    ctx.fill();
  }

  // --- robot actions --------------------------------------------------------------
  async toggleStep(c: number, i: number, quick = false) {
    this.hint(`${CH[c].name}, step ${i + 1}`);
    await this.k.click(this.rack[c].steps[i], rnd(0.35, 0.65), rnd(0.35, 0.65), quick ? rnd(220, 320) : rnd(320, 520));
    this.cur.steps[c][i] = !this.cur.steps[c][i];
    this.paintStep(c, i, true);
    await this.k.sleep(quick ? rnd(40, 110) : rnd(90, 260));
  }

  async program(c: number, steps: number[]) {
    const order = chance(0.8) ? steps : [...steps].reverse();
    for (const i of order) if (!this.cur.steps[c][i]) await this.toggleStep(c, i, c === HAT);
  }

  async setTempo(bpm: number) {
    this.hint("Tempo");
    await this.k.click(this.els.bpm, 0.4, 0.5, 520);
    const b = this.els.bpmVal;
    this.k.fromTo(this.els.bpm, { scale: 1 }, { scale: 1.05, duration: 0.15, yoyo: true, repeat: 1 });
    this.els.bpm.classList.add("edit");
    b.textContent = "";
    await this.k.sleep(rnd(200, 360));
    for (const d of String(bpm)) {
      this.k.tap(d);
      b.textContent += d;
      await this.k.sleep(rnd(110, 230));
    }
    this.k.tap("Enter");
    this.els.bpm.classList.remove("edit");
    this.bpm = bpm;
    if (this.playing) this.t0 = performance.now() - (this.step + 1) * this.stepMs;
    await this.k.sleep(rnd(250, 450));
  }

  async selectPattern(i: number) {
    this.hint("Pattern");
    await this.k.click(this.els.patsel, 0.6, 0.5, 450);
    await this.k.sleep(rnd(120, 220));
    this.cur = this.pats[i];
    this.setPatSel(i);
    if (this.view === "rack") this.paintRack(true);
    await this.k.sleep(rnd(300, 500));
  }

  async clearPattern() {
    this.hint("Clear pattern");
    await this.k.click(this.els.clear, 0.5, 0.5, 480);
    const lit: HTMLElement[] = [];
    this.cur.steps.forEach((row, c) => row.forEach((on, i) => { if (on) lit.push(this.rack[c].steps[i]); row[i] = false; }));
    lit.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    for (const el of lit) el.classList.remove("lit");
    this.k.to(lit.map((el) => el.querySelector("i")), { opacity: 0, scale: 0.2, duration: 0.28, ease: "power2.in", stagger: 0.025 });
    this.k.fromTo(this.els.rows, { x: -3 }, { x: 0, duration: 0.5, ease: "elastic.out(1.4, 0.25)" });
    await this.k.sleep(600 + lit.length * 25);
  }

  async listen(ms: number, mood: "relax" | "focus" = "relax") {
    this.k.host.react(mood);
    await this.k.sleep(ms);
  }

  async knobFiddle() {
    const c = irnd(0, CH.length - 1);
    const knob = chance(0.5) ? this.rack[c].vol : this.rack[c].pan;
    if (this.view !== "rack") return;
    this.hint(knob === this.rack[c].vol ? `${CH[c].name} volume` : `${CH[c].name} panning`);
    await this.k.point(knob.parentElement!, 0.5, 0.5, 420);
    await this.k.click();
    await this.k.to(knob, { rotation: `+=${rnd(-50, 50)}`, duration: 0.6, ease: "power2.inOut" });
    await this.k.sleep(rnd(150, 300));
  }

  async faderMove() {
    const i = irnd(1, 6), st = this.strips[i];
    const slot = st.cap.parentElement!;
    this.hint(`Insert ${i}, volume`);
    await this.k.point(st.cap, 0.5, 0.5, 520);
    await this.k.click();
    const nv = Math.max(0.35, Math.min(0.92, st.val + rnd(-0.18, 0.12)));
    const marker = h("i", "life-bt-mark");
    marker.style.top = `${(1 - nv) * 100}%`;
    slot.appendChild(marker);
    const dist = Math.abs(nv - st.val) * slot.clientHeight;
    const secs = this.k.moveSecs(dist, 500);
    await Promise.all([this.k.point(marker, 0.5, 0.5, 500), this.k.to(st.cap, { top: `${(1 - nv) * 100}%`, duration: secs, ease: "power2.inOut" })]);
    marker.remove();
    st.val = nv;
    await this.k.sleep(rnd(200, 400));
  }

  // --- piano roll -----------------------------------------------------------------
  noteName(p: number, c: number) { return `${NAMES[p % 12]}${(c === BASS ? 1 : 4) + Math.floor(p / 12)}`; }

  makeNoteEl(n: Note, c: number) {
    const el = h("div", "life-bt-note", `<span>${this.noteName(n.p, c)}</span>`);
    el.style.cssText = `left:${(n.s / LEN) * 100}%;width:calc(${(n.l / LEN) * 100}% - 1px);top:${((ROWS - 1 - n.p) / ROWS) * 100}%;height:${100 / ROWS}%`;
    this.els.notes.appendChild(el);
    this.noteEls.set(n, el);
    const stem = h("i", "life-bt-stem");
    stem.style.cssText = `left:${(n.s / LEN) * 100}%;height:${n.v * 100}%`;
    this.els.vel.appendChild(stem);
    (el as any)._stem = stem;
    return el;
  }

  openRollFor(c: number) {
    this.rollCh = c;
    this.els.notes.innerHTML = "";
    this.els.vel.innerHTML = "";
    this.noteEls.clear();
    const rch = this.els.rch;
    (rch.querySelector("i") as HTMLElement).style.background = CH[c].color;
    (rch.querySelector("span") as HTMLElement).textContent = CH[c].name;
    this.views.roll.style.setProperty("--c", CH[c].color);
    for (const n of this.cur.notes[c]) this.makeNoteEl(n, c);
    (this.keys[0].querySelector("span") as HTMLElement).textContent = c === BASS ? "C1" : "C4";
    (this.keys[12].querySelector("span") as HTMLElement).textContent = c === BASS ? "C2" : "C5";
  }

  async addNote(c: number, n: Note) {
    const el = this.makeNoteEl(n, c), stem = (el as any)._stem as HTMLElement;
    this.k.set([el, stem], { opacity: 0 });
    this.hint(this.noteName(n.p, c));
    await this.k.click(el, Math.min(0.5, 6 / Math.max(8, el.clientWidth)), 0.5, rnd(280, 460));
    this.cur.notes[c].push(n);
    this.flash(this.keys[n.p]);
    this.k.fromTo(el, { opacity: 0, scaleX: 0.15, x: -5, transformOrigin: "0% 50%" }, { opacity: 1, scaleX: 1, x: 0, duration: 0.45, ease: "expo.out" });
    this.k.fromTo(stem, { opacity: 0, scaleY: 0, transformOrigin: "50% 100%" }, { opacity: 1, scaleY: 1, duration: 0.5, ease: "back.out(2)", delay: 0.05 });
    await this.k.sleep(rnd(80, 220));
  }

  async removeNote(c: number, n: Note) {
    const el = this.noteEls.get(n)!, stem = (el as any)._stem as HTMLElement;
    this.hint(`Delete ${this.noteName(n.p, c)}`);
    await this.k.click(el, 0.4, 0.5, 380);
    this.cur.notes[c] = this.cur.notes[c].filter((x) => x !== n);
    this.noteEls.delete(n);
    this.k.to(el, { scale: 0.2, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: () => el.remove() });
    this.k.to(stem, { scaleY: 0, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: () => stem.remove() });
    await this.k.sleep(rnd(200, 400));
  }

  async resizeNote(c: number, n: Note, newLen: number) {
    const el = this.noteEls.get(n);
    if (!el) return;
    this.hint(`Resize ${this.noteName(n.p, c)}`);
    await this.k.point(el, 0.97, 0.5, 420);
    await this.k.sleep(rnd(120, 220));
    const marker = h("i", "life-bt-mark");
    marker.style.cssText = `left:${((n.s + newLen) / LEN) * 100}%;top:${((ROWS - 1 - n.p + 0.5) / ROWS) * 100}%`;
    this.els.notes.appendChild(marker);
    const dist = Math.abs(newLen - n.l) * (this.els.grid.clientWidth / LEN);
    await Promise.all([
      this.k.point(marker, 0.5, 0.5, 520),
      this.k.to(el, { width: `calc(${(newLen / LEN) * 100}% - 1px)`, duration: this.k.moveSecs(dist, 520), ease: "power2.inOut" }),
    ]);
    marker.remove();
    n.l = newLen;
    await this.k.click();
    this.k.fromTo(el, { scaleY: 1.25 }, { scaleY: 1, duration: 0.35, ease: "back.out(3)" });
    await this.k.sleep(rnd(200, 380));
  }

  async drawPart(c: number, notes: Note[]) {
    this.openRollFor(c);
    await this.goView("roll");
    this.k.host.react("focus");
    const fresh = notes.map((n) => ({ ...n, v: Math.min(1, n.v + rnd(-0.12, 0.15)) }));
    let wrong: Note | null = null;
    for (const n of fresh) {
      if (!wrong && chance(0.14)) {
        // a sour note: placed, heard, deleted
        wrong = { ...n, p: Math.max(0, Math.min(ROWS - 1, n.p + pick([1, -1]))) };
        await this.addNote(c, wrong);
        await this.k.sleep(rnd(400, 700));
        await this.removeNote(c, wrong);
      }
      const shorter = chance(0.25) && n.l > 1;
      await this.addNote(c, shorter ? { ...n, l: n.l - 1 } : n);
    }
    // stretch the notes that came out short
    for (const n of this.cur.notes[c]) {
      const orig = fresh.find((x) => x.s === n.s && x.p === n.p);
      if (orig && orig.l > n.l && chance(0.75)) await this.resizeNote(c, n, orig.l);
    }
    if (!this.playing) await this.togglePlay("pat");
    await this.listen(rnd(3500, 6500));
    if (chance(0.5)) {
      // nudge one note longer and listen again
      const n = pick(this.cur.notes[c]);
      const room = Math.min(...this.cur.notes[c].filter((x) => x.s > n.s && x.p === n.p).map((x) => x.s), LEN) - n.s;
      if (room > n.l) { await this.resizeNote(c, n, Math.min(room, n.l + irnd(1, 2))); await this.listen(rnd(2000, 3500)); }
    }
  }

  // --- playlist ------------------------------------------------------------------
  placeBlockEl(track: number, bar: number, pat: Pat) {
    const el = h("div", "life-bt-blk", `<span>${["Drums", "808", "Pluck"][pat.n - 1]}</span><canvas></canvas>`);
    el.style.cssText = `left:${(bar / BARS) * 100}%;width:calc(${(2 / BARS) * 100}% - 2px)`;
    el.style.setProperty("--c", pat.color);
    this.lanes[track].appendChild(el);
    const cv = el.querySelector("canvas") as HTMLCanvasElement;
    const w = Math.max(10, el.clientWidth - 8), hh = Math.max(6, el.clientHeight - 18);
    const ctx = canvas(cv, w, hh);
    ctx.fillStyle = "rgba(20,26,51,0.55)";
    pat.steps.forEach((row, c) => row.forEach((on, i) => { if (on) for (const half of [0, 1]) ctx.fillRect(((i + half * 16) / LEN) * w, (c / 4) * hh * 0.9, Math.max(1.5, w / LEN - 1), hh / 6); }));
    pat.notes.forEach((ns) => {
      if (!ns.length) return;
      const lo = Math.min(...ns.map((n) => n.p)), hi = Math.max(...ns.map((n) => n.p));
      for (const n of ns) ctx.fillRect((n.s / LEN) * w, (hi === lo ? 0.5 : 1 - (n.p - lo) / (hi - lo)) * (hh - 2), Math.max(2, (n.l / LEN) * w - 1), 2);
    });
    return el;
  }

  async dragBlock(patIdx: number, track: number, bar: number, fromList: boolean) {
    const pat = this.pats[patIdx];
    const el = this.placeBlockEl(track, bar, pat);
    this.k.set(el, { opacity: 0 });
    const area = this.views.pl;
    if (fromList) {
      const item = this.patItems[patIdx];
      this.hint(`${["Drums", "808", "Pluck"][patIdx]}, drag to playlist`);
      await this.k.click(item, 0.4, 0.5, 480);
      const a = rel(item, area), b = rel(el, area);
      const ghost = h("div", "life-bt-blk life-bt-ghost", `<span>${["Drums", "808", "Pluck"][patIdx]}</span>`);
      ghost.style.cssText = `left:${a.x}px;top:${a.y}px;width:${b.w}px;height:${b.h}px`;
      ghost.style.setProperty("--c", pat.color);
      area.appendChild(ghost);
      this.k.fromTo(ghost, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 0.85, duration: 0.25, ease: "back.out(2)" });
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      await Promise.all([
        this.k.point(el, 0.12, 0.5, 600),
        this.k.to(ghost, { left: b.x, top: b.y, duration: this.k.moveSecs(dist, 600), ease: "power2.inOut" }),
      ]);
      await this.k.click();
      ghost.remove();
    } else {
      this.hint(`Track ${track + 1}, bar ${bar + 1}`);
      await this.k.click(el, 0.15, 0.5, rnd(300, 460));
    }
    this.k.fromTo(el, { opacity: 0, scale: 0.85, transformOrigin: "0% 50%" }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.4)" });
    this.blocks.push({ track, bar, pat, el });
    await this.k.sleep(rnd(120, 260));
  }

  async arrange() {
    await this.goView("pl");
    this.k.host.react("focus");
    const used = this.pats.map((p, i) => ({ p, i })).filter(({ p }) => p.steps.some((r) => r.some(Boolean)) || p.notes.some((n) => n.length));
    const plan: { i: number; t: number; bar: number }[] = [];
    const lead = used.find((u) => u.i === 2), drums = used.find((u) => u.i === 0), bass = used.find((u) => u.i === 1);
    if (lead) plan.push({ i: 2, t: 2, bar: 0 }, { i: 2, t: 2, bar: 2 });
    if (drums) plan.push({ i: 0, t: 0, bar: 2 }, { i: 0, t: 0, bar: 4 });
    if (bass) plan.push({ i: 1, t: 1, bar: 4 });
    if (lead) plan.push({ i: 2, t: 2, bar: 4 }, { i: 2, t: 2, bar: 6 });
    if (drums) plan.push({ i: 0, t: 0, bar: 6 });
    if (bass) plan.push({ i: 1, t: 1, bar: 6 });
    const seen = new Set<number>();
    for (const s of plan) {
      if (this.blocks.some((b) => b.track === s.t && b.bar === s.bar)) continue;
      await this.dragBlock(s.i, s.t, s.bar, !seen.has(s.i));
      seen.add(s.i);
    }
    if (this.playing) await this.togglePlay();
    this.hint("Song mode");
    await this.k.click(this.els.mSong, 0.5, 0.5, 520);
    this.els.mPat.classList.remove("on");
    this.els.mSong.classList.add("on");
    await this.k.sleep(rnd(200, 400));
    await this.togglePlay("song");
  }

  async clearPlaylist() {
    const els = this.blocks.map((b) => b.el);
    this.blocks = [];
    this.k.to(els, { opacity: 0, scale: 0.8, duration: 0.3, ease: "power2.in", stagger: 0.03, onComplete: () => els.forEach((e) => e.remove()) });
    await this.k.sleep(400);
  }

  // --- the session ------------------------------------------------------------------
  async newProject(first: boolean) {
    if (!first) {
      if (this.playing) await this.togglePlay();
      if (this.view !== "rack") await this.goView("rack");
      await this.clearPlaylist();
      this.pats = [0, 1, 2].map((i) => this.newPat(i));
      this.cur = this.pats[0];
      this.setPatSel(0);
      this.paintRack(true);
      let next = pick(STYLES);
      while (next === this.style) next = pick(STYLES);
      this.style = next;
      this.els.mPat.classList.add("on");
      this.els.mSong.classList.remove("on");
    }
    await this.k.sleep(rnd(500, 900));
    if (this.bpm !== this.style.bpm) await this.setTempo(this.style.bpm);
  }

  async drums() {
    const s = this.style;
    this.k.host.react("focus");
    await this.program(KICK, s.kick);
    if (s.snare.length && chance(0.8)) await this.program(SNARE, s.snare);
    await this.program(CLAP, s.clap);
    if (!this.playing) await this.togglePlay("pat");
    await this.listen(rnd(1200, 2400), "focus");
    const half = Math.ceil(s.hat.length * rnd(0.4, 0.7));
    await this.program(HAT, s.hat.slice(0, half));
    // a step it ends up not liking
    if (chance(0.55)) {
      const c = pick([KICK, CLAP, HAT]);
      const free = Array.from({ length: 16 }, (_, i) => i).filter((i) => !this.cur.steps[c][i]);
      const i = pick(free);
      await this.toggleStep(c, i);
      await this.k.sleep(rnd(1400, 2600));
      this.k.host.react(pick(["shy", "surprised"] as const));
      await this.toggleStep(c, i);
    }
    await this.program(HAT, s.hat.slice(half));
    if (chance(0.5)) await this.knobFiddle();
    await this.listen(rnd(3500, 6000));
  }

  async bass() {
    await this.selectPattern(1);
    if (chance(0.5)) {
      await this.drawPart(BASS, this.style.bass);
      await this.goView("rack");
    } else {
      this.k.host.react("focus");
      await this.program(BASS, [...new Set(this.style.bass.map((n) => n.s % 16))].sort((a, b) => a - b));
      if (!this.playing) await this.togglePlay("pat");
      await this.listen(rnd(2500, 4000));
    }
  }

  async lead() {
    await this.selectPattern(2);
    await this.drawPart(LEAD, this.style.lead);
    if (chance(0.5)) await this.goView("rack");
  }

  async session() {
    let first = true, raged = false;
    while (true) {
      await this.newProject(first);
      first = false;
      await this.drums();
      if (!raged && chance(0.3)) {
        // not feeling it: wipe the drums and do them again
        raged = true;
        if (this.playing) await this.togglePlay();
        this.k.host.react("angry");
        await this.k.sleep(rnd(500, 900));
        await this.clearPattern();
        await this.k.sleep(rnd(600, 1000));
        this.style = { ...pick(STYLES), bpm: this.bpm };
        await this.drums();
      }
      if (chance(0.4)) await this.faderMove();
      this.k.host.react("cheer");
      await this.bass();
      await this.lead();
      if (chance(0.5)) await this.faderMove();
      await this.arrange();
      await this.listen(BARS * 16 * this.stepMs * rnd(0.9, 1.6));
      this.k.host.react("cheer");
      await this.k.sleep(rnd(1500, 2500));
    }
  }
}
