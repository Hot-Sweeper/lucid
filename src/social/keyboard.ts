// The robot's on-screen phone keyboard. Slides up when a field is focused, keys press (with
// the magnified key preview) as the robot thumb-types the real text, the suggestion bar
// guesses words and is sometimes used, and it slides away when the message is sent.
// One component for every phone app: chats, comments, search and captions.
import { Kit, rnd, chance, h, calm, type SoHost } from "./kit";
import "./chatkit.css";

export type ReturnLabel = "send" | "search" | "go" | "return" | "done" | "post";

const LETTERS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NUMBERS = ["1234567890", "-/:;()$&@\"", ".,?!'"];
// Keys right next to each other on the letter layout, for the odd slip of the thumb.
const NEAR: Record<string, string> = {};
LETTERS.forEach((row, r) => [...row].forEach((c, i) => { NEAR[c] = (row[i - 1] ?? "") + (row[i + 1] ?? "") + (LETTERS[r + 1]?.[i] ?? "") + (LETTERS[r - 1]?.[i] ?? ""); }));

const COMMON = ("the to and you it is that for on are with this be have was not but what all so just like can my your if do at out up about get " +
  "go me one no we know they love good time how yes see now think really lol okay thanks thank sure maybe today tomorrow later great nice cool fun " +
  "haha omg wow same need want back home work coffee charge charging battery update robot morning night soon here there where when why who would " +
  "could should never always every new best happy sorry please still been going doing looking little long beautiful amazing").split(" ");
const NEXT = ["I", "the", "you", "so", "and", "it", "lol", "that", "is", "to", "we", "haha", "ok", "my", "a", "in"];

const SHIFT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 1.8 8.6h3.4v5.2h5.6V8.6h3.4Z"/></svg>`;
const BKSP = `<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M7 2.5h10.5A1.5 1.5 0 0 1 19 4v8a1.5 1.5 0 0 1-1.5 1.5H7L1.5 8Zm3.4 2.9-1 1L11 8l-1.6 1.6 1 1L12 9l1.6 1.6 1-1L13 8l1.6-1.6-1-1L12 7Z"/></svg>`;
const EMO = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6a6.4 6.4 0 1 1 0 12.8A6.4 6.4 0 0 1 8 1.6Zm0 1.4a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM5 9h6a3 3 0 0 1-6 0Zm1-3.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>`;

type Geo = { x: number; y: number; w: number; h: number };
type Layer = "abc" | "num";

const boards = new WeakMap<HTMLElement, PhoneKeyboard>();

/** The keyboard of this phone app (one per app screen, made on first use). */
export function phoneKeyboard(k: Kit, root: HTMLElement, o: { dark?: boolean; accent?: string } = {}) {
  let kb = boards.get(root);
  if (!kb || !kb.el.isConnected) { kb = new PhoneKeyboard(root, o); boards.set(root, kb); }
  kb.k = k;
  return kb;
}

export class PhoneKeyboard {
  el: HTMLElement;
  k!: Kit;
  up = false;
  private pop: HTMLElement;
  private popTxt: HTMLElement;
  private sug: HTMLElement[];
  private keys = new Map<string, HTMLElement>();    // "abc:q", "num:1", "fn:shift" ...
  private geo = new Map<HTMLElement, Geo>();
  private size = { w: 134, h: 284, kb: 120 };
  private layer: Layer = "abc";
  private shift = false;
  private lift: HTMLElement[] = [];

  constructor(private root: HTMLElement, o: { dark?: boolean; accent?: string }) {
    const row = (chars: string, layer: Layer) => [...chars].map((c) => `<span class="k" data-k="${layer}:${c}">${c === "\"" ? "&quot;" : c}</span>`).join("");
    this.el = h("div", `so-kb${o.dark ? " dark" : ""}`);
    if (o.accent) this.el.style.setProperty("--kb-acc", o.accent);
    this.el.innerHTML = `
      <div class="so-kb-sug"><span></span><span></span><span></span></div>
      <div class="so-kb-lay abc">
        <div class="so-kb-row">${row(LETTERS[0], "abc")}</div>
        <div class="so-kb-row r2">${row(LETTERS[1], "abc")}</div>
        <div class="so-kb-row r3"><span class="k fn" data-k="fn:shift">${SHIFT}</span>${row(LETTERS[2], "abc")}<span class="k fn" data-k="abc:bksp">${BKSP}</span></div>
        <div class="so-kb-row r4"><span class="k fn" data-k="abc:123">123</span><span class="k fn" data-k="abc:emo">${EMO}</span><span class="k sp" data-k="abc: ">space</span><span class="k ret" data-k="abc:ret"></span></div>
      </div>
      <div class="so-kb-lay num">
        <div class="so-kb-row">${row(NUMBERS[0], "num")}</div>
        <div class="so-kb-row">${row(NUMBERS[1], "num")}</div>
        <div class="so-kb-row r3"><span class="k fn" data-k="num:sym">#+=</span><span class="so-kb-gap"></span>${row(NUMBERS[2], "num")}<span class="so-kb-gap"></span><span class="k fn" data-k="num:bksp">${BKSP}</span></div>
        <div class="so-kb-row r4"><span class="k fn" data-k="num:abc">ABC</span><span class="k fn" data-k="num:emo">${EMO}</span><span class="k sp" data-k="num: ">space</span><span class="k ret" data-k="num:ret"></span></div>
      </div>
      <span class="so-kb-pop" aria-hidden="true"><b></b></span>`;
    for (const el of this.el.querySelectorAll<HTMLElement>("[data-k]")) this.keys.set(el.dataset.k!, el);
    this.pop = this.el.querySelector(".so-kb-pop")!;
    this.popTxt = this.pop.querySelector("b")!;
    this.sug = [...this.el.querySelectorAll<HTMLElement>(".so-kb-sug span")];
    root.appendChild(this.el);
  }

  /** Slides up, lifting the app's field (and message list) with it. */
  async open(o: { ret?: ReturnLabel; lift?: (HTMLElement | null | undefined)[] } = {}) {
    const label = o.ret ?? "return";
    for (const r of this.el.querySelectorAll<HTMLElement>(".ret")) { r.textContent = label; r.classList.toggle("act", label !== "return"); r.classList.remove("on"); }
    this.setLayer("abc");
    this.setShift(false);
    this.suggest(["", "", ""]);
    this.lift = (o.lift ?? []).filter((x): x is HTMLElement => !!x);
    if (this.up) return;
    this.up = true;
    this.el.classList.add("on");
    // one layout read per opening: the key positions for the thumb and the key preview
    this.measure();
    const k = this.k, hgt = this.size.kb;
    if (calm()) { k.set(this.el, { y: 0 }); k.set(this.lift, { y: -hgt }); return; }
    k.fromTo(this.el, { y: hgt }, { y: 0, duration: 0.34, ease: "power3.out" });
    if (this.lift.length) k.to(this.lift, { y: -hgt, duration: 0.34, ease: "power3.out" });
    await k.sleep(300);
  }

  /** Slides away again. */
  async close() {
    if (!this.up) return;
    this.up = false;
    const k = this.k, hgt = this.size.kb;
    (k.host as SoHost).thumbAt?.(-1, -1);
    if (calm()) { this.el.classList.remove("on"); k.set(this.lift, { y: 0 }); return; }
    if (this.lift.length) k.to(this.lift, { y: 0, duration: 0.28, ease: "power2.inOut" });
    await new Promise<void>((r) => k.to(this.el, { y: hgt, duration: 0.28, ease: "power2.in", onComplete: () => r() }));
    this.el.classList.remove("on");
  }

  get height() { return this.size.kb; }

  private measure() {
    this.size = { w: this.root.offsetWidth || 134, h: this.root.offsetHeight || 284, kb: this.el.offsetHeight || 120 };
    const top = this.size.h - this.size.kb;
    // both layers, so a switch never needs another read
    const lays = [...this.el.querySelectorAll<HTMLElement>(".so-kb-lay")];
    for (const l of lays) l.style.display = "flex";
    // offsets are relative to the keyboard itself (the nearest positioned box)
    for (const el of this.keys.values()) this.geo.set(el, { x: el.offsetLeft, y: top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    for (const s of this.sug) this.geo.set(s, { x: s.offsetLeft, y: top + s.offsetTop, w: s.offsetWidth, h: s.offsetHeight });
    for (const l of lays) l.style.display = "";
  }

  private setLayer(l: Layer) {
    this.layer = l;
    this.el.classList.toggle("nums", l === "num");
  }
  private setShift(on: boolean) {
    this.shift = on;
    this.el.classList.toggle("caps", on);
    this.keys.get("fn:shift")!.classList.toggle("on", on);
  }

  private suggest(words: string[]) {
    this.sug.forEach((s, i) => { s.textContent = words[i] ?? ""; s.classList.remove("hit"); });
  }

  /** Presses a key: it darkens, letters pop a magnified preview, the thumb goes there. */
  private async hit(el: HTMLElement, preview?: string, ms = rnd(80, 135)) {
    const k = this.k;
    k.check();
    const g = this.geo.get(el);
    if (g) (k.host as SoHost).thumbAt?.((g.x + g.w / 2) / this.size.w, (g.y + g.h / 2) / this.size.h);
    el.classList.add("down");
    if (preview && g) {
      this.popTxt.textContent = preview;
      this.pop.style.transform = `translate(${(g.x + g.w / 2).toFixed(1)}px, ${(g.y - this.size.h + this.size.kb).toFixed(1)}px)`;
      this.pop.classList.add("on");
    }
    k.later(() => { el.classList.remove("down"); if (preview) this.pop.classList.remove("on"); }, Math.min(ms, 120));
    await k.sleep(ms);
  }

  private keyFor(ch: string): { el: HTMLElement; layer: Layer } | null {
    if (ch === " ") return { el: this.keys.get(`${this.layer}: `)!, layer: this.layer };
    const lo = ch.toLowerCase();
    const a = this.keys.get(`abc:${lo}`);
    if (a) return { el: a, layer: "abc" };
    const n = this.keys.get(`num:${ch}`);
    if (n) return { el: n, layer: "num" };
    return null;
  }

  /** Types one character on the real keys, switching layers and shift as a person would. */
  private async press(field: HTMLElement, ch: string) {
    const key = this.keyFor(ch);
    if (!key) { field.textContent += ch; await this.k.sleep(rnd(90, 140)); return; }
    if (key.layer !== this.layer && ch !== " ") {
      await this.hit(this.keys.get(this.layer === "abc" ? "abc:123" : "num:abc")!, undefined, rnd(140, 220));
      this.setLayer(key.layer);
    }
    const upper = ch !== ch.toLowerCase();
    if (upper && !this.shift) { await this.hit(this.keys.get("fn:shift")!, undefined, rnd(110, 170)); this.setShift(true); }
    const shown = ch === " " ? undefined : ch;
    await this.hit(key.el, shown);
    field.textContent += ch;
    if (this.shift && upper) this.setShift(false);
    // like on a real phone, a space after punctuation flips back to letters
    if (ch === " " && this.layer === "num") this.setLayer("abc");
    for (const r of this.el.querySelectorAll<HTMLElement>(".ret")) r.classList.add("on");
  }

  private async backspace(field: HTMLElement) {
    await this.hit(this.keys.get(`${this.layer}:bksp`)!, undefined, rnd(120, 200));
    field.textContent = field.textContent!.slice(0, -1);
  }

  /**
   * Types `text` into `field` key by key. Now and then the thumb slips and fixes it with
   * backspace, and now and then the robot takes the word from the suggestion bar instead.
   */
  async type(field: HTMLElement, text: string, o: { skill?: number; keep?: boolean } = {}) {
    const skill = o.skill ?? 0.7;
    if (!o.keep) field.textContent = "";
    let i = 0;
    while (i < text.length) {
      this.k.check();
      const ch = text[i];
      const start = i === 0 || text[i - 1] === " ";
      const word = wordAt(text, i);
      const typed = word ? text.slice(word.from, i) : "";
      // the suggestion bar: a guess for the word being typed, or the next word
      if (word && (start ? chance(0.22) : typed.length >= 2 && word.to - word.from >= 4 && chance(0.3))) {
        const w = text.slice(word.from, word.to);
        this.suggest(start ? spread(w, NEXT) : [`"${typed}"`, w, complete(typed, w)[0] ?? typed + "s"]);
        if (chance(0.75)) {
          await this.k.sleep(rnd(160, 320));
          const slot = this.sug.find((s) => s.textContent === w)!;
          slot.classList.add("hit");
          await this.hit(slot, undefined, rnd(150, 230));
          field.textContent += w.slice(typed.length);
          i = word.to;
          if (text[i] === " ") { field.textContent += " "; i++; }
          this.suggest(spread("", NEXT));
          continue;
        }
      } else if (word && !start) {
        const opts = complete(typed, "");
        this.suggest([`"${typed}"`, opts[0] ?? typed + "s", opts[1] ?? typed + "ing"]);
      } else if (ch === " " || start) this.suggest(spread("", NEXT));
      // a slip of the thumb onto the next key over, then backspace
      const near = NEAR[ch.toLowerCase()];
      if (near && i > 1 && chance(0.05 * (1.4 - skill))) {
        const wrong = near[Math.floor(Math.random() * near.length)];
        await this.press(field, ch === ch.toUpperCase() ? wrong.toUpperCase() : wrong);
        await this.k.sleep(rnd(200, 380));
        await this.backspace(field);
      }
      await this.press(field, ch);
      if (/[.,?!]/.test(ch)) await this.k.sleep(rnd(100, 240));
      i++;
    }
    this.suggest(spread("", NEXT));
  }

  /** Taps the return key (labelled send, search or go). */
  async enter() {
    await this.hit(this.keys.get(`${this.layer}:ret`)!, undefined, rnd(140, 220));
    for (const r of this.el.querySelectorAll<HTMLElement>(".ret")) r.classList.remove("on");
    this.suggest(["", "", ""]);
  }

  /** Cleared field: the return key greys out again. */
  reset() { for (const r of this.el.querySelectorAll<HTMLElement>(".ret")) r.classList.remove("on"); }
}

function wordAt(text: string, i: number) {
  if (!/[A-Za-z']/.test(text[i] ?? "")) return null;
  let from = i, to = i;
  while (from > 0 && /[A-Za-z']/.test(text[from - 1])) from--;
  while (to < text.length && /[A-Za-z']/.test(text[to])) to++;
  return { from, to };
}

function complete(typed: string, skip: string) {
  const lo = typed.toLowerCase();
  return COMMON.filter((w) => w.startsWith(lo) && w !== lo && w !== skip.toLowerCase()).slice(0, 2).map((w) => (typed[0] === typed[0]?.toUpperCase() && typed[0] !== typed[0]?.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w));
}

/** Three suggestions with `w` (if given) in the middle, the most likely slot. */
function spread(w: string, pool: string[]) {
  const others = pool.filter((x) => x.toLowerCase() !== w.toLowerCase()).sort(() => Math.random() - 0.5).slice(0, w ? 2 : 3);
  return w ? [others[0] ?? "I", w, others[1] ?? "the"] : others;
}
