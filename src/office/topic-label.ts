// Short world labels that fit by meaning instead of by chopping. A T3 thread title becomes a
// topic of a few whole words for a desk nameplate: the full title when it fits, otherwise the
// words that say the most (product names, the thing being worked on) without the leading verb,
// articles, filler and generic nouns. Words are only dropped, never rewritten, so the title keeps
// its language. Deterministic, cached per title and width, and never adds an ellipsis.

export type Measure = (text: string) => number;
export type Fit = { text: string; fits: boolean };

const set = (words: string) => new Set(words.split(" "));
// Leading verbs of task titles (English imperatives, German imperatives and infinitives).
const VERBS = set("fix fixes add adds implement improve make polish run create update build refactor debug investigate set get clean remove rename move write review check test design redesign help support enable handle show use troubleshoot free speed tidy rework rewrite finish complete prepare restore resolve repair migrate port replace upgrade convert integrate explore research find plan wire hook tune optimize optimise simplify unify split merge extract document translate localize audit verify ensure allow stop prevent keep let try install configure setup launch ship release publish deploy draft generate render sync behebe beheben füge hinzufügen verbessere verbessern erstelle erstellen repariere reparieren aktualisiere aktualisieren baue bauen prüfe prüfen teste testen entferne entfernen optimiere optimieren überarbeite überarbeiten richte einrichten passe anpassen mache machen setze umsetzen implementiere implementieren");
const PARTICLES = set("up out down off back over");
const STOP = set("the a an this that these those my our your its their some any very really just der die das den dem des ein eine einen einem einer eines dieser diese dieses mein meine unser unsere sehr");
// Clause separators keep two kept clauses apart; prepositions join words inside a clause.
const CLAUSE = set("and or & + , ; : / vs und oder sowie");
const PREP = set("for of on in to with from via by into at about after before without using inside under over across between per as für von mit im in am an auf aus bei zum zur zu nach über unter vom durch ohne gegen");
// Words that rarely tell two threads apart.
const GENERIC = set("bug bugs issue issues problem problems error errors fix fixes failure failures improvement improvements change changes update updates tweak tweaks stuff things behavior behaviour setup support polish cleanup work task tasks fehler probleme problem verbesserung verbesserungen anpassung anpassungen änderung änderungen aufgabe aufgaben");
const FILLER = set("herr frau mr mrs ms dr full new minor small quick better proper various several more remaining overall general basic simple initial final native current existing entire whole extra additional major other possible all neue neuen neues neuer kleine kleinen bessere besseren alle weitere weiteren");
const NOT_ADVERB = set("daily weekly monthly yearly hourly early family italy july reply apply supply only holy fly ally rally jelly belly bully assembly anomaly butterfly firefly");

type Unit = { text: string; score: number; clause: number; index: number };
type Token = { text: string; kind: "word" | "clause" | "prep" | "colon"; aside?: boolean };

const strong = (w: string) => /\d/.test(w) || /[a-z][A-Z]/.test(w) || /^[A-Z][A-Z0-9]+$/.test(w);
const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}&+]/gu, "");
const adverb = (w: string) => /^[a-z]{4,}ly$/i.test(w) && !NOT_ADVERB.has(w.toLowerCase());

/** The title as one clean line: no markdown, quotes, ellipses or trailing punctuation. */
export function cleanTitle(title: string) {
  return String(title ?? "").normalize("NFC").replace(/…|\.{3,}/g, " ").replace(/[`*_#>]/g, "").replace(/\s+/g, " ")
    .replace(/^["'“”„‚‘’«»\s]+|["'“”„‚‘’«»\s]+$/g, "").replace(/[\s.,;:!?\-–—]+$/, "").trim();
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let depth = 0;   // inside (asides) or [tags]
  for (const raw of text.split(" ")) {
    // trailing commas and semicolons separate clauses, a lone dash too; a colon ends a prefix ("Sidebar: ...")
    const m = /^(.*?)([,;:]+)?$/.exec(raw)!;
    const opens = /^[([]/.test(m[1]), closes = /[)\]]$/.test(m[1]);
    if (opens) depth++;
    const word = m[1].replace(/^[([("'“„‘]+|[)\]"'”“’]+$/g, "").replace(/(?<=\w)\.[a-z0-9]{1,4}$/, "");
    if (/^[-–—|]+$/.test(word)) out.push({ text: ",", kind: "clause" });
    else if (word) {
      const k = key(word);
      out.push({ text: word, kind: CLAUSE.has(k) || CLAUSE.has(word) ? "clause" : PREP.has(k) ? "prep" : "word", aside: depth > 0 });
    }
    if (closes) depth = Math.max(0, depth - 1);
    if (m[2]) out.push({ text: m[2][0], kind: m[2][0] === ":" ? "colon" : "clause" });
  }
  return out;
}

/** Scored content words of a task title, in order, with the leading verb and stop words removed. */
function units(text: string, task: boolean): { units: Unit[]; tokens: Token[] } {
  let tokens = tokenize(text);
  // A verb at the start of the title or of a later clause ("Fix X and Improve Y") is the task, not the topic.
  if (task) tokens = tokens.filter((t, i) => {
    if (t.kind !== "word") return true;
    // the token before, skipping [tags] and (asides)
    const prev = tokens.slice(0, i).reverse().find((p) => !p.aside), k = key(t.text);
    const clauseStart = !prev || prev.kind === "clause" || prev.kind === "colon";
    if (clauseStart && VERBS.has(k) && tokens.slice(i + 1).some((n) => n.kind === "word")) { (t as any).drop = true; return false; }
    if (prev && (prev as any).drop && PARTICLES.has(k)) { (t as any).drop = true; return false; }
    return true;
  });
  // German titles often end with the infinitive ("Fehler im Login beheben").
  const words = tokens.filter((t) => t.kind === "word");
  if (task && words.length > 1 && VERBS.has(key(words[words.length - 1].text)) && /en$/.test(words[words.length - 1].text)) tokens = tokens.filter((t) => t !== words[words.length - 1]);
  tokens = tokens.filter((t) => !(t.kind === "word" && STOP.has(key(t.text))));
  // A lone number belongs to the word before it ("Hall 7").
  const merged: Token[] = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (t.kind === "word" && /^\d+[a-z]?$/i.test(t.text) && last?.kind === "word") last.text += ` ${t.text}`;
    else merged.push({ ...t });
  }
  tokens = merged;
  const list: Unit[] = [];
  const runs = new Map<number, Unit[]>();   // prepositional phrases of the first clause
  let clause = 0, run = -1, phrase = true;
  const opening: Unit[] = [];
  tokens.forEach((t, index) => {
    if (t.kind === "clause") { clause++; run = -1; phrase = false; return; }
    // after a prefix ("Sidebar: Thread order") the opening phrase starts again
    if (t.kind === "colon") { if (clause === 0) { run = -1; phrase = true; opening.length = 0; } return; }
    if (t.kind === "prep") { if (clause === 0) { run = index; phrase = false; } return; }
    const k = key(t.text.split(" ")[0]);
    let score = t.aside ? .3 : GENERIC.has(k) ? .5 : FILLER.has(k) || adverb(t.text) ? .4 : 1;
    if (score === 1 && strong(t.text)) score += 1;
    if (clause > 0) score *= .5;
    const u = { text: t.text, score, clause, index };
    list.push(u);
    if (score >= 1 && run >= 0) runs.set(run, [...runs.get(run) ?? [], u]);
    if (score >= 1 && clause === 0 && phrase) opening.push(u);
  });
  // The first real word anchors the topic, the last real word of the opening phrase is its head
  // noun, and the last real word after a preposition is that phrase's object ("for Hall 7").
  const real = list.filter((u) => u.score >= 1 && u.clause === 0);
  if (real[0]) real[0].score += 1;
  const head = opening[opening.length - 1];
  if (head && head !== real[0]) head.score += 1.5;
  // (a name right after the preposition is the object itself: "on CachyOS KDE")
  for (const words of runs.values()) (strong(words[0].text) ? words[0] : words[words.length - 1]).score += .5;
  return { units: list, tokens };
}

/** Joins kept units: a preposition between two kept words of a clause stays, clauses keep their separator. */
function join(kept: Unit[], tokens: Token[]) {
  let s = "";
  kept.forEach((u, i) => {
    if (i) {
      const between = tokens.slice(kept[i - 1].index + 1, u.index);
      const sep = [...between].reverse().find((t) => t.kind === "clause");
      const colon = between.some((t) => t.kind === "colon");
      const prep = between.length && between[between.length - 1].kind === "prep" ? between[between.length - 1] : null;
      s += sep ? (sep.text === "," || sep.text === ";" ? ", " : ` ${sep.text} `) : colon ? ": " : prep ? ` ${prep.text} ` : " ";
    }
    s += u.text;
  });
  return s;
}

const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * The best topic for a width: the clean title if it fits, otherwise the highest scoring
 * combination of up to `maxWords` whole words that fits. `fits` is false only when even the
 * single most meaningful word is wider than `max` (one very long compound word).
 */
export function topicLabel(title: string, max: number, measure: Measure = estimateWidth, o: { task?: boolean; maxWords?: number } = {}): Fit {
  const clean = cleanTitle(title);
  if (!clean || measure(clean) <= max) return { text: clean, fits: true };
  const { units: all, tokens } = units(clean, o.task !== false);
  if (!all.length) return { text: clean, fits: false };
  // "fix the website header" stays lowercase; "Fix the website header" gives "Website header".
  const capital = /^\P{L}*\p{Lu}/u.test(clean);
  const finish = (s: string) => capital && /^\p{Ll}+(?=\s|$)/u.test(s) ? upperFirst(s) : s;
  // Search the 12 most meaningful words (in title order) for the best combination that fits.
  // Filler ("Full", "Natively") only ever appears with the whole title.
  const pool = all.filter((u) => u.score > .4 || all.every((v) => v.score <= .4)).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 12).sort((a, b) => a.index - b.index);
  const maxWords = Math.min(o.maxWords ?? 4, pool.length);
  let best: { text: string; score: number; gaps: number } | null = null;
  const pick: Unit[] = [];
  const visit = (from: number) => {
    if (pick.length) {
      const text = finish(join(pick, tokens));
      if (measure(text) <= max) {
        const score = pick.reduce((n, u) => n + u.score, 0);
        const gaps = pick.reduce((n, u, i) => n + (i && pool.indexOf(u) !== pool.indexOf(pick[i - 1]) + 1 ? 1 : 0), 0);
        if (!best || score > best.score + 1e-9 || Math.abs(score - best.score) < 1e-9 && gaps < best.gaps) best = { text, score, gaps };
      } else return;   // adding more words never makes it narrower
    }
    if (pick.length === maxWords) return;
    for (let i = from; i < pool.length; i++) { pick.push(pool[i]); visit(i + 1); pick.pop(); }
  };
  visit(0);
  const found = best as { text: string; score: number } | null;
  if (found && found.score >= 1) return { text: found.text, fits: true };
  // The meaningful word is wider than the plate: split a compound written with hyphens, dots or camel case.
  const top = [...all].sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const parts = top.text.split(/[-_./]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean);
  if (parts.length > 1) {
    const sub = topicLabel(parts.join(" "), max, measure, { task: false, maxWords: 3 });
    if (sub.fits) return { text: finish(sub.text), fits: true };
  }
  return found ? { text: found.text, fits: true } : { text: finish(top.text), fits: false };
}

// ---- measuring --------------------------------------------------------------------------

// Lexend at 600 and 12px, approximate advance widths. Used until the font has loaded and by the checks.
const NARROW = /[ijlI.,:;'!|ı]/, SPACE = /\s/, WIDE = /[mwMW]/, CAPS = /\p{Lu}/u, DIGIT = /\d/;
export function estimateWidth(text: string, px = 12) {
  let w = 0;
  for (const ch of text) w += SPACE.test(ch) ? 3.4 : NARROW.test(ch) ? 3.6 : WIDE.test(ch) ? 10.4 : CAPS.test(ch) ? 8.6 : DIGIT.test(ch) ? 7.4 : 6.9;
  return w * px / 12;
}

let ctx: CanvasRenderingContext2D | null | undefined;
/** Canvas measurement in a CSS font such as `600 12px "Lexend Variable"`, estimated until that font is ready. */
export function textMeasure(font: string): Measure {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
  return (text) => {
    if (typeof document === "undefined") return estimateWidth(text, px);
    if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d");
    if (!ctx || !document.fonts?.check(font, text)) { void document.fonts?.load(font, text); return estimateWidth(text, px); }
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

const cache = new Map<string, Fit>();
/** topicLabel with real font metrics, cached per font, width and title once the font is loaded. */
export function fitTopic(title: string, max: number, font: string, o: { task?: boolean; maxWords?: number } = {}): Fit {
  const id = `${font}|${max}|${o.task !== false}|${o.maxWords ?? 4}|${title}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const fit = topicLabel(title, max, textMeasure(font), o);
  if (typeof document !== "undefined" && document.fonts?.check(font)) {
    if (cache.size > 600) cache.delete(cache.keys().next().value!);
    cache.set(id, fit);
  }
  return fit;
}
