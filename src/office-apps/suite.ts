// The office suite as the director sees it: given a document the agent wrote, read its real
// content, work out what is new since the robot last saw it, and play it in the right app.
// When a file can not be read it falls back to what the event carries (a csv or rtf diff),
// or just opens and saves the file without making up content.
import type { WM } from "../os/wm";
import { baseName } from "../os/classify";
import { Botword } from "./botword";
import { Cellsheet } from "./cellsheet";
import { Slidedeck } from "./slidedeck";
import { blockText, diffRows, officeKind, sheetFromText, wordFromText, type Block, type DeckDoc, type OfficeApp, type OfficeDoc, type ReadResult, type SheetDoc, type Slide, type WordDoc } from "./model";
import "./office.css";

export const OFFICE_GLOW: Record<OfficeApp, string> = { botword: "#6f8dff", cellsheet: "#3fd08a", slidedeck: "#ff9a6a" };
const APP_NAME: Record<OfficeApp, string> = { botword: "Botword", cellsheet: "Cellsheet", slidedeck: "Slidedeck" };

/** What the robot is doing, for the activity line. */
export function officeActivity(path: string, op?: string) {
  const k = officeKind(path);
  if (!k) return `Editing ${baseName(path)}`;
  const verb = op === "add" ? (k === "botword" ? "Writing" : k === "cellsheet" ? "Filling in" : "Building") : k === "cellsheet" ? "Updating" : "Editing";
  return `${verb} ${baseName(path)} in ${APP_NAME[k]}`;
}

type Reader = (path: string) => Promise<ReadResult | null | undefined>;
const ipcReader: Reader = async (p) => (window as any).lucidDocs?.read?.(p) ?? null;
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Longest common subsequence: for each item of b, the index of its match in a (or -1). */
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): number[] {
  const n = a.length, m = b.length;
  if (n * m > 400000) return b.map((y, j) => (j < n && eq(a[j], y) ? j : -1));
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = b.map(() => -1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { out[j] = i; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}
const sig = (x: unknown) => JSON.stringify(x);
const blockSig = (b: Block) => sig(b.kind === "table" ? b.rows : b.kind === "img" ? "img" : [b.kind, b.text]);
const slideSig = (s: Slide) => sig([s.title, s.els.map((e) => [e.kind, (e.paras || []).map((p) => p.text), e.fill, e.src?.length]), s.notes]);

/** op: add or update; diff: the event's unified diff; text: the file text it carried; added: text an edit put in. */
export type ShowInput = { op?: string; diff?: string; text?: string | null; added?: string; instant?: boolean };

export class OfficeSuite {
  word: Botword; sheet: Cellsheet; deck: Slidedeck;
  /** The last version of each document the robot showed, so the next edit only types what changed. */
  private seen = new Map<string, OfficeDoc>();
  constructor(private wm: WM, private read: Reader = ipcReader) {
    this.word = new Botword(wm);
    this.sheet = new Cellsheet(wm);
    this.deck = new Slidedeck(wm);
  }

  reset() { this.seen.clear(); }

  /** Play a document the agent wrote or changed. Returns false when it is not an office file. */
  async show(path: string, o: ShowInput = {}): Promise<boolean> {
    const kind = officeKind(path);
    if (!kind) return false;
    const key = path.replace(/\\/g, "/").toLowerCase();
    const name = baseName(path);
    const res = await withTimeout(this.read(path).catch(() => null), 7000);
    this.wm.check(this.wm.epoch);
    let doc: OfficeDoc | null = res && res.ok ? res.doc : null;
    let fromDiff: Set<number> | null = null;
    // text formats can still be shown from what the event carried
    if (!doc && (kind === "cellsheet" || /\.rtf$/i.test(path))) {
      let text = o.text ?? null;
      if (!text && o.diff) { const d = diffRows(o.diff); text = d.text; if (o.op !== "add") fromDiff = d.rows; }
      if (text) doc = kind === "cellsheet" ? sheetFromText(name, text) : wordFromText(name, text);
    } else if (doc && kind === "cellsheet" && o.diff && o.op !== "add" && !this.seen.has(key)) fromDiff = diffRows(o.diff).rows;
    if (!doc) {
      const app = kind === "botword" ? this.word : kind === "cellsheet" ? this.sheet : this.deck;
      await app.saving(name, { instant: o.instant });
      return true;
    }
    if (doc.name !== name) doc = { ...doc, name } as OfficeDoc;
    const before = this.seen.get(key) ?? null;
    this.seen.set(key, doc);
    const fresh = !before && (o.op === "add" || o.op === undefined);
    if (doc.kind === "word") {
      const prev = before?.kind === "word" ? before : null;
      const added = o.added?.trim();
      const typed = fresh ? "all" : prev ? lcs(prev.blocks.map(blockSig), (doc as WordDoc).blocks.map(blockSig), (a, b) => a === b).map((m) => m < 0)
        : added ? (doc as WordDoc).blocks.map((b) => { const t = blockText(b).trim(); return t.length > 2 && added.includes(t); }) : "none";
      await this.word.show(doc as WordDoc, { instant: o.instant, typed, changed: !!prev });
    } else if (doc.kind === "sheet") {
      const prev = before?.kind === "sheet" ? before : null;
      let typed: "all" | "none" | Set<string> = fresh && !fromDiff ? "all" : "none";
      if (prev) {
        typed = new Set<string>();
        const rows = Math.max(prev.rows.length, doc.rows.length);
        for (let r = 0; r < rows; r++) for (let c = 0; c < 12; c++) { const a = prev.rows[r]?.[c], b = (doc as SheetDoc).rows[r]?.[c]; if (b && sig([a?.v, a?.f]) !== sig([b.v, b.f])) typed.add(`${r},${c}`); }
      } else if (o.added?.trim() && !fromDiff) {
        // an edit without a diff: the rows whose values all sit on one of the lines it put in
        const lines = o.added.split(/\r?\n/).filter((l) => l.trim());
        typed = new Set<string>();
        (doc as SheetDoc).rows.forEach((row, r) => {
          const vals = row.filter(Boolean).map((c) => c!.v);
          if (vals.length && lines.some((l) => vals.every((v) => l.includes(v)))) row.forEach((cell, c) => { if (cell) (typed as Set<string>).add(`${r},${c}`); });
        });
      } else if (fromDiff) {
        typed = new Set<string>();
        for (const r of fromDiff) (doc as SheetDoc).rows[r]?.forEach((cell, c) => { if (cell) (typed as Set<string>).add(`${r},${c}`); });
      }
      await this.sheet.show(doc as SheetDoc, { instant: o.instant, typed, before: prev, changed: !!prev || !!fromDiff });
    } else {
      const prev = before?.kind === "deck" ? before : null;
      let typed: "all" | "none" | Map<number, Slide | null> = fresh ? "all" : "none";
      if (prev) {
        const d = doc as DeckDoc;
        const match = lcs(prev.slides.map(slideSig), d.slides.map(slideSig), (a, b) => a === b);
        const used = new Set(match.filter((m) => m >= 0));
        typed = new Map();
        d.slides.forEach((s, j) => {
          if (match[j] >= 0) return;
          // same title as a slide that is gone: that slide was edited; otherwise it is new
          const k = prev.slides.findIndex((p, i) => !used.has(i) && p.title === s.title && !!s.title);
          if (k >= 0) used.add(k);
          (typed as Map<number, Slide | null>).set(j, k >= 0 ? prev.slides[k] : null);
        });
      }
      await this.deck.show(doc as DeckDoc, { instant: o.instant, typed });
    }
    return true;
  }
}
