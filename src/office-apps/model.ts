// The document model the office apps show, the same shape electron/office.cjs returns,
// plus the small helpers around it: which app a file belongs to, spotting documents a
// command wrote, text fallbacks (csv, diffs), and a tiny formula evaluator for the sheet.
import { parseDiff } from "../os/classify";

export type Run = { t: string; b?: boolean; i?: boolean; u?: boolean };
export type Block =
  | { kind: "h"; level: number; text: string; runs?: Run[]; align?: string; sub?: boolean }
  | { kind: "p"; text: string; runs?: Run[]; align?: string; quote?: boolean }
  | { kind: "li"; text: string; ordered: boolean; level: number; runs?: Run[]; align?: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "img" };
export type WordDoc = { kind: "word"; name: string; blocks: Block[]; truncated?: boolean };

export type Cell = { v: string; n?: number; f?: string; fmt?: "pct" | "date" | "fixed2" | "money" } | null;
export type SheetDoc = { kind: "sheet"; name: string; sheets: string[]; active: number; rows: Cell[][]; cols: number; totalRows: number; chart?: string; chartTitle?: string; chartCols?: number[]; chartCat?: number };

export type Para = { text: string; lvl: number; bold?: boolean; bullet?: false | "num" };
export type Box = { x: number; y: number; w: number; h: number };
export type SlideEl = { kind: "title" | "subtitle" | "body" | "text" | "shape" | "pic"; box?: Box; paras?: Para[]; prst?: string; fill?: string; src?: string; center?: boolean };
export type Slide = { title: string; els: SlideEl[]; notes?: string; bg?: string };
export type DeckDoc = { kind: "deck"; name: string; aspect: number; slides: Slide[]; totalSlides: number };

export type OfficeDoc = WordDoc | SheetDoc | DeckDoc;
export type OfficeApp = "botword" | "cellsheet" | "slidedeck";
export type ReadResult = { ok: true; doc: OfficeDoc } | { ok: false; error: string };

const EXT: Record<string, OfficeApp> = {
  docx: "botword", doc: "botword", rtf: "botword", odt: "botword",
  xlsx: "cellsheet", xls: "cellsheet", csv: "cellsheet", tsv: "cellsheet",
  pptx: "slidedeck", ppt: "slidedeck", key: "slidedeck",
};
const EXT_RE = /(?:^|[\s"'`=(,:;>\[{])((?:[A-Za-z]:)?[^\s"'`=(),;<>|*?\[\]{}]*?[\w\-)\]]\.(?:docx|doc|rtf|odt|xlsx|xls|csv|tsv|pptx|ppt|key))(?=$|[\s"'`),;:\]}.!])/gi;

const QUOTED_RE = /["'`]([^"'`\r\n<>|*?]{1,200}\.(?:docx|doc|rtf|odt|xlsx|xls|csv|tsv|pptx|ppt|key))["'`]/gi;

export const extOf =(p: string) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
/** Which office app opens this file, or null for anything else. */
export function officeKind(path: string | null | undefined): OfficeApp | null {
  return path ? EXT[extOf(String(path))] ?? null : null;
}

// Signs that a command writes a document rather than just mentioning one.
const WRITERS = /python-docx|from docx|import docx|docx\.Document|Document\(|openpyxl|xlsxwriter|to_excel|to_csv|ExcelWriter|python-pptx|from pptx|import pptx|Presentation\(|pandoc|soffice|libreoffice|--convert-to|unoconv|exceljs|xlsx\.write|writeFile(?:Sync)?\(|SheetJS|Packer\.to|officegen|pptxgen|docxtpl|csv\.writer|DictWriter|Export-Csv|Out-File|Set-Content|\.save\(|\.SaveAs|>\s*["']?[^\s|&;]+\.(?:csv|tsv|rtf)\b/i;
const SAID = /\b(saved|wrote|written|writing|created|generated|exported|output|built|updated|saving|converted?)\b/i;

/**
 * Documents a command (or its output) obviously wrote: report.xlsx from a pandas script,
 * a deck from python-pptx, a csv redirect. Returns file names as written, at most three.
 */
export function officeTargets(command: string, output = ""): string[] {
  const cmd = String(command || "").slice(0, 20000), out = String(output || "").slice(-20000);
  const found: string[] = [];
  const add = (s: string) => { const f = s.replace(/^["'`]|["'`]$/g, ""); if (officeKind(f) && !found.some((x) => x.toLowerCase() === f.toLowerCase())) found.push(f); };
  // files a script only opens (read_excel("data.xlsx"), load_workbook(...)) are inputs, unless it also saves to them
  const name = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const opened = new Set([...cmd.matchAll(/(?:read_excel|read_csv|read_table|load_workbook|Document|Presentation|readFile(?:Sync)?|open)\(\s*[rRfF]?["'`]([^"'`]+)["'`]/g)].map((m) => name(m[1])));
  const saved = new Set([...cmd.matchAll(/(?:save|to_excel|to_csv|SaveAs|writeFile(?:Sync)?|ExcelWriter|open)\(\s*[rRfF]?["'`]([^"'`]+)["'`](?:\s*,\s*["'](?:w|wb|a)["'])?/g)].filter((m) => !/^open\(/.test(m[0]) || /,\s*["'](?:w|wb|a)["']/.test(m[0])).map((m) => name(m[1])));
  // soffice --convert-to docx notes.odt writes notes.docx (the named file is the input)
  const conv = cmd.match(/--convert-to\s+["']?([a-z]+)/i);
  // names in quotes first (they may contain spaces), then bare ones that are not part of a quoted name
  const names = (text: string) => {
    const quoted = [...text.matchAll(QUOTED_RE)].map((m) => m[1]);
    const bare = [...text.matchAll(EXT_RE)].map((m) => m[1]).filter((b) => !quoted.some((q) => q !== b && q.endsWith(b)));
    return [...quoted, ...bare];
  };
  if (conv) { for (const f of names(cmd)) add(f.replace(/\.[a-z0-9]+$/i, `.${conv[1].toLowerCase()}`)); }
  else if (WRITERS.test(cmd)) for (const f of names(cmd)) { const n = name(f); if (!opened.has(n) || saved.has(n)) add(f); }
  // "Saved report.xlsx", "Wrote 12 rows to out/summary.csv", "convert a.odt -> a.docx"
  for (const line of out.split(/\r?\n/)) {
    if (!SAID.test(line)) continue;
    const tail = line.includes("->") ? line.slice(line.lastIndexOf("->") + 2) : line;
    for (const f of names(tail)) add(f);
  }
  // A plain reader (cat, head, Get-Content) without a writer is not a new document.
  return found.slice(0, 3);
}

/** A file name the agent used, made absolute against the thread's folder. */
export function resolveIn(file: string, root: string | null) {
  const f = file.replace(/^~[\\/]/, "");
  if (/^[a-zA-Z]:[\\/]|^[\\/]/.test(f) || !root) return f;
  return `${root.replace(/[\\/]+$/, "")}/${f.replace(/^\.[\\/]/, "")}`;
}

// --- text fallbacks --------------------------------------------------------------------------
export function sheetFromText(name: string, text: string): SheetDoc {
  const sep = /\.tsv$/i.test(name) ? "\t" : ((text.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ";" : ",");
  const rows: Cell[][] = [];
  let totalRows = 0, cols = 0;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line && totalRows && rows.length === totalRows) { totalRows++; continue; }
    totalRows++;
    if (rows.length >= 30) continue;
    const cells: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"' && !cur) q = true;
      else if (ch === sep) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row = cells.slice(0, 12).map((v): Cell => (v === "" ? null : /^\s*-?(\d+(\.\d+)?|\.\d+)\s*$/.test(v) ? { v: v.trim(), n: Number(v) } : { v }));
    cols = Math.max(cols, row.length);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();
  return { kind: "sheet", name, sheets: [name.replace(/\.[^.]+$/, "")], active: 0, rows, cols, totalRows };
}

/** Rows a unified diff added to a csv (0-based row numbers), with the file text the diff shows. */
export function diffRows(diff: string): { rows: Set<number>; text: string | null } {
  const hunks = parseDiff(diff);
  const rows = new Set<number>();
  const lines: string[] = [];
  for (const h of hunks) {
    let n = h.newStart - 1;
    for (const l of h.lines) {
      if (l.kind === "-") continue;
      if (l.kind === "+") rows.add(n);
      lines[n] = l.text;
      n++;
    }
  }
  for (let i = 0; i < lines.length; i++) if (lines[i] == null) lines[i] = "";
  return { rows, text: lines.length ? lines.join("\n") : null };
}

/** Plain paragraphs from text (an rtf diff, a markdown-ish doc): headings from # lines, bullets from - lines. */
export function wordFromText(name: string, text: string): WordDoc {
  const rtf = /^\s*\{\\rtf/.test(text) || /\.rtf$/i.test(name);
  let s = text;
  if (rtf) {
    s = s.replace(/\{\\(?:\*|fonttbl|colortbl|stylesheet|info)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
      .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(par|line)\b ?/g, "\n").replace(/\\tab\b ?/g, "\t")
      .replace(/\\[a-z]+-?\d* ?/gi, "").replace(/\\([{}\\])/g, "$1").replace(/[{}]/g, "");
  }
  const blocks: Block[] = [];
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { if (blocks.length && blocks[blocks.length - 1].kind !== "p") continue; if (blocks.length && (blocks[blocks.length - 1] as any).text === "") continue; blocks.push({ kind: "p", text: "" }); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (h && !rtf) blocks.push({ kind: "h", level: h[1].length, text: h[2] });
    else if (li) blocks.push({ kind: "li", ordered: /\d/.test(li[1]), level: Math.min(3, Math.floor((line.length - line.trimStart().length) / 2)), text: li[2] });
    else blocks.push({ kind: "p", text: line.trim() });
    if (blocks.length >= 400) break;
  }
  while (blocks.length && blocks[blocks.length - 1].kind === "p" && !(blocks[blocks.length - 1] as any).text) blocks.pop();
  return { kind: "word", name, blocks };
}

// --- spreadsheet maths -------------------------------------------------------------------------
export const colName = (c: number) => { let s = ""; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const parseRef = (ref: string) => {
  const m = ref.replace(/\$/g, "").match(/^([A-Z]{1,3})(\d+)$/i);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  return { r: Number(m[2]) - 1, c: c - 1 };
};

/** Evaluate a simple formula (=SUM(B2:B9), =C2-B2, =ROUND(AVERAGE(B2:B9),1)) or return undefined. */
export function evaluate(formula: string, get: (r: number, c: number) => number | string | null | undefined): number | undefined {
  const src = formula.replace(/^=/, "");
  if (/!/.test(src)) return undefined;   // other sheets: not shown
  let i = 0;
  const peek = () => src[i];
  const ws = () => { while (src[i] === " ") i++; };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const range = (a: string, b: string): (number | null)[] => {
    const p = parseRef(a), q = parseRef(b);
    if (!p || !q) throw 0;
    const out: (number | null)[] = [];
    for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push(num(get(r, c)));
    return out;
  };
  const FN: Record<string, (args: (number | null)[][]) => number> = {
    SUM: (a) => a.flat().reduce<number>((s, x) => s + (x ?? 0), 0),
    AVERAGE: (a) => { const v = a.flat().filter((x): x is number => x != null); if (!v.length) throw 0; return v.reduce((s, x) => s + x, 0) / v.length; },
    MIN: (a) => Math.min(...a.flat().filter((x): x is number => x != null)),
    MAX: (a) => Math.max(...a.flat().filter((x): x is number => x != null)),
    COUNT: (a) => a.flat().filter((x) => x != null).length,
    ROUND: (a) => { const p = 10 ** (a[1]?.[0] ?? 0); return Math.round((a[0]?.[0] ?? 0) * p) / p; },
    ABS: (a) => Math.abs(a[0]?.[0] ?? 0),
  };
  FN.AVG = FN.AVERAGE;
  function args(): (number | null)[][] {
    const out: (number | null)[][] = [];
    ws();
    if (peek() === ")") { i++; return out; }
    for (;;) {
      ws();
      const m = src.slice(i).match(/^(\$?[A-Z]{1,3}\$?\d+):(\$?[A-Z]{1,3}\$?\d+)/i);
      if (m) { i += m[0].length; out.push(range(m[1], m[2])); }
      else out.push([expr()]);
      ws();
      if (peek() === ",") { i++; continue; }
      if (peek() === ")") { i++; return out; }
      throw 0;
    }
  }
  function atom(): number {
    ws();
    const ch = peek();
    if (ch === "(") { i++; const v = expr(); ws(); if (peek() !== ")") throw 0; i++; return v; }
    if (ch === "-") { i++; return -atom(); }
    if (ch === "+") { i++; return atom(); }
    const n = src.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?%?/i);
    if (n) { i += n[0].length; return n[0].endsWith("%") ? Number(n[0].slice(0, -1)) / 100 : Number(n[0]); }
    const f = src.slice(i).match(/^([A-Z][A-Z0-9.]*)\(/i);
    if (f) { i += f[0].length; const fn = FN[f[1].toUpperCase()]; if (!fn) throw 0; return fn(args()); }
    const r = src.slice(i).match(/^\$?[A-Z]{1,3}\$?\d+/i);
    if (r) { i += r[0].length; const p = parseRef(r[0])!; return num(get(p.r, p.c)) ?? 0; }
    throw 0;
  }
  function pow(): number { let v = atom(); ws(); while (peek() === "^") { i++; v = v ** atom(); ws(); } return v; }
  function term(): number { let v = pow(); ws(); while (peek() === "*" || peek() === "/") { const op = src[i++]; const w = pow(); v = op === "*" ? v * w : v / w; ws(); } return v; }
  function expr(): number { let v = term(); ws(); while (peek() === "+" || peek() === "-") { const op = src[i++]; const w = term(); v = op === "+" ? v + w : v - w; ws(); } return v; }
  try {
    const v = expr();
    ws();
    return i === src.length && Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** A cell's number formatted the way the sheet would show it. */
export function showNumber(n: number, fmt?: string) {
  if (fmt === "pct") return `${(n * 100).toFixed(Math.abs(n * 100) % 1 ? 1 : 0)}%`;
  if (fmt === "date" && n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  if (fmt === "fixed2") return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === "money") return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Number.isInteger(n)) return String(n);
  const s = Math.abs(n) >= 1000 ? n.toFixed(1) : n.toFixed(Math.abs(n) < 1 ? 3 : 2);
  return s.replace(/\.?0+$/, "");
}

/** Plain text of a block, for word counts. */
export const blockText = (b: Block) => (b.kind === "table" ? b.rows.flat().join(" ") : b.kind === "img" ? "" : b.text);
export const words = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
