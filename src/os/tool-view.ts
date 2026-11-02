// One presentation for operations that have no desktop app of their own (T3 Code attachment and
// project calls, other MCP tools). A tool becomes a small view model from what the event really
// carries: its arguments, its reported outcome, and metadata another real event supplied. The
// view only states what is known. It never invents file names, previews, counts or progress.
// This module has no imports so it can be exercised without a browser.

export type ToolPhase = "pending" | "done" | "failed";
export type ToolBrand = "t3" | "generic";

/** Real facts about an uploaded file, taken from the tool arguments or an earlier real event. */
export interface FileFacts { name: string; mime?: string; size?: number; kind?: string }

export interface ToolState { status?: string; output?: unknown }

export interface ToolView {
  brand: ToolBrand;
  /** Window title: the app the operation belongs to. */
  app: string;
  phase: ToolPhase;
  headline: string;
  subject: { file?: FileFacts; label?: string; hint?: string } | null;
  /** The tool's own words when it reported something short and readable. */
  note: string;
  /** Technical details, shown quietly below the outcome. */
  facts: { label: string; value: string; mono: boolean }[];
}

export type UploadLookup = (attachmentId: string) => FileFacts | null;

const FAILED = /^(failed|error|errored|cancelled|canceled|interrupted|declined|denied|rejected|timed.?out)$/i;
const RUNNING = /^(running|pending|in.?progress|started|queued|streaming)$/i;
const SECRET_KEY = /token|secret|password|passwd|authorization|api.?key|credential|cookie/i;

export function prettyTool(name: string) {
  const m = name.match(/^mcp__(.+?)__(.+)$/) || name.match(/^([\w-]+)\.(.+)$/);
  const words = (s: string) => s.replace(/[_-]+/g, " ").trim();
  if (m) return { app: words(m[1]).replace(/^t3 code$/i, "T3 Code").replace(/\b\w/g, (c) => c.toUpperCase()), action: words(m[2]) };
  return { app: "Tool", action: words(name) };
}

export const toolBase = (name: string) => name.replace(/^mcp__.+?__/, "").replace(/^[\w-]+\./, "");
export const isT3Tool = (name: string) => /^mcp__t3[-_]code__/i.test(name) || /^t3[-_]code\./i.test(name);

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (s: string) => s.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();

/** One unit and one decimal everywhere, so sizes read the same in every row. */
export function formatSize(bytes: number | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** Middle ellipsis for identifiers, so both ends stay recognisable. */
export function shortId(id: string, keep = 8) {
  const s = String(id);
  return s.length <= keep * 2 + 1 ? s : `${s.slice(0, keep)}…${s.slice(-4)}`;
}

const MIME_LABEL: Record<string, string> = {
  "image/png": "PNG image", "image/jpeg": "JPEG image", "image/gif": "GIF image", "image/webp": "WebP image",
  "application/pdf": "PDF document", "text/plain": "Text file", "application/json": "JSON file", "text/markdown": "Markdown file",
  "text/csv": "CSV file", "application/zip": "ZIP archive",
};
export function fileKindLabel(f: FileFacts) {
  const mime = (f.mime || "").toLowerCase();
  if (MIME_LABEL[mime]) return MIME_LABEL[mime];
  if (mime.startsWith("image/")) return `${mime.slice(6).toUpperCase()} image`;
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("text/")) return "Text file";
  return f.kind === "image" ? "Image" : "File";
}
export function fileExt(name: string) {
  const m = String(name).match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toUpperCase() : "";
}

function record(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : null; } catch { return null; } }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Readable text of a tool result, whatever shape the harness reported it in. */
export function outputText(o: any): string {
  if (o == null) return "";
  if (typeof o === "string") return o;
  if (Array.isArray(o.content)) return o.content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean).join("\n");
  if (typeof o.content === "string") return o.content;
  if (typeof o.output === "string") return o.output;
  if (typeof o.stdout === "string") return [o.stdout, o.stderr].filter(Boolean).join("\n");
  if (typeof o.message === "string") return o.message;
  if (typeof o.error === "string") return o.error;
  return "";
}

/** Structured result: `structuredContent`, or the text when it is a JSON object. */
export function outputRecord(o: any): Record<string, unknown> | null {
  return record(o?.structuredContent) ?? record(outputText(o)) ?? (o && typeof o === "object" && !Array.isArray(o) && !o.content ? record(o) : null);
}

export function phaseOf(state: ToolState | undefined): ToolPhase {
  const s = String(state?.status ?? "");
  if (FAILED.test(s)) return "failed";
  const out: any = state?.output;
  if (out && typeof out === "object" && (out.isError === true || out.is_error === true)) return "failed";
  if (!s || RUNNING.test(s)) return "pending";
  return "done";
}

/** A reason worth showing: the tool's own message, one line, no JSON dumps or stack traces. */
export function readableNote(o: any, limit = 160) {
  const rec = outputRecord(o);
  const fromRec = rec && (typeof rec.message === "string" ? rec.message : typeof rec.error === "string" ? rec.error : typeof (rec.error as any)?.message === "string" ? (rec.error as any).message : "");
  const raw = String(fromRec || (rec ? "" : outputText(o)) || "");
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t || /^[\[{]/.test(t) || /\n\s+at\s/.test(raw)) return "";
  if (t.length > limit) t = t.slice(0, limit - 1).trimEnd() + "…";
  return t;
}

/** The identifier a prepare-upload call handed back, if its result carries one. */
export function uploadIdOf(o: any): string {
  const rec = outputRecord(o);
  const id = rec?.attachmentId ?? (rec?.attachment as any)?.id ?? rec?.id;
  if (typeof id === "string") return id;
  const m = outputText(o).match(/"attachmentId"\s*:\s*"([^"]+)"/);
  return m ? m[1] : "";
}

function fileFromUpload(u: any): FileFacts | null {
  if (!u || typeof u !== "object" || typeof u.name !== "string" || !u.name.trim()) return null;
  return { name: u.name, mime: typeof u.mimeType === "string" ? u.mimeType : undefined, size: typeof u.sizeBytes === "number" ? u.sizeBytes : undefined, kind: typeof u.type === "string" ? u.type : undefined };
}

/**
 * Looks through real events for what the thread said about an upload: the arguments of the call that
 * prepared it (matched through the identifier its result returned) or of a call that sent it.
 */
export function findUpload(items: Iterable<{ type: string; data: any }>, attachmentId: string): FileFacts | null {
  if (!attachmentId) return null;
  for (const it of items) {
    if (it.type !== "dynamic_tool") continue;
    const name = String(it.data?.toolName || "");
    if (/t3_attachment_prepare_upload$/.test(name) && uploadIdOf(it.data?.output) === attachmentId) {
      const f = fileFromUpload(record(it.data?.input)?.upload);
      if (f) return f;
    }
    if (/t3_thread_send_attachments$/.test(name)) {
      const list = record(it.data?.input)?.attachments;
      if (Array.isArray(list)) for (const a of list) if (a && a.id === attachmentId) { const f = fileFromUpload(a); if (f) return f; }
    }
  }
  return null;
}

const LABELS: Record<string, string> = { attachmentid: "Upload", threadid: "Thread", projectid: "Project", environmentid: "Environment", worktreeid: "Worktree", requestid: "Request" };
const label = (key: string) => LABELS[key.toLowerCase()] ?? sentence(words(key));

function valueText(v: unknown) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function rowsOf(input: unknown, skip: string[] = [], max = 4) {
  const rec = record(input);
  if (!rec) return [];
  return Object.entries(rec).filter(([k, v]) => !skip.includes(k) && v != null && v !== "").slice(0, max).map(([k, v]) => {
    const secret = SECRET_KEY.test(k);
    const raw = secret ? "Hidden" : valueText(v);
    const id = /id$/i.test(k) && typeof v === "string";
    return { label: label(k), value: id ? shortId(raw) : raw, full: raw, mono: !secret };
  });
}

interface Wording { pending: string; done: string; failed: string }
const T3_WORDING: Record<string, Wording> = {
  t3_attachment_prepare_upload: { pending: "Preparing upload", done: "Upload ready", failed: "Upload could not be prepared" },
  t3_attachment_discard: { pending: "Discarding upload", done: "Upload discarded", failed: "Upload could not be discarded" },
};

/** What the robot is doing while the call runs, for its activity label. */
export function toolActivity(name: string): string {
  const w = isT3Tool(name) ? T3_WORDING[toolBase(name)] : undefined;
  return w ? w.pending : `Using ${prettyTool(name).action}`;
}

export function describeTool(name: string, input: unknown, state: ToolState | undefined, uploads?: UploadLookup): ToolView {
  const t3 = isT3Tool(name);
  const { app, action } = prettyTool(name);
  const base = toolBase(name);
  const phase = phaseOf(state);
  const note = phase === "failed" ? readableNote(state?.output) : phase === "done" ? readableNote(state?.output, 120) : "";
  const wording = t3 ? T3_WORDING[base] : undefined;
  const generic = sentence(base.replace(/^t3[_-]/, "").replace(/[_-]+/g, " ").trim() || action || "operation");
  const headline = wording ? wording[phase] : phase === "failed" ? `${generic} failed` : generic;
  const view: ToolView = { brand: t3 ? "t3" : "generic", app: t3 ? "T3 Code" : app, phase, headline, subject: null, note, facts: [] };
  const inRec = record(input);
  if (base === "t3_attachment_prepare_upload") {
    const f = fileFromUpload(inRec?.upload);
    view.subject = f ? { file: f } : { label: "Upload" };
    const id = uploadIdOf(state?.output);
    if (id) view.facts.push({ label: "Upload", value: shortId(id), mono: true });
  } else if (base === "t3_attachment_discard") {
    const id = typeof inRec?.attachmentId === "string" ? inRec.attachmentId : "";
    const f = id && uploads ? uploads(id) : null;
    view.subject = f ? { file: f } : { label: "Unsent upload", hint: "File details were not reported" };
    if (id) view.facts.push({ label: "Upload", value: shortId(id), mono: true });
  } else {
    for (const r of rowsOf(input)) view.facts.push({ label: r.label, value: r.value, mono: r.mono });
  }
  return view;
}

/** Full-length values for tooltips, in the same order as `facts`. */
export function factTitles(name: string, input: unknown, state: ToolState): string[] {
  const base = toolBase(name);
  if (isT3Tool(name) && T3_WORDING[base]) {
    const rec = record(input);
    const id = base === "t3_attachment_discard" ? rec?.attachmentId : uploadIdOf(state?.output);
    return typeof id === "string" && id ? [id] : [];
  }
  return rowsOf(input).map((r) => r.full);
}

// --- markup ------------------------------------------------------------------------------------
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const svg = (d: string, cls = "tv-i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const GLYPH = {
  clip: svg(`<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5"/>`),
  file: svg(`<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>`),
  image: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>`),
  done: svg(`<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`, "tv-i tv-state-i"),
  failed: svg(`<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>`, "tv-i tv-state-i"),
  pending: `<svg class="tv-i tv-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`,
};

function tile(f: FileFacts | undefined) {
  if (!f) return `<span class="tv-tile" aria-hidden="true">${GLYPH.clip}</span>`;
  const image = (f.mime || "").startsWith("image/") || f.kind === "image";
  const ext = fileExt(f.name);
  return `<span class="tv-tile${image ? " img" : ""}" aria-hidden="true">${image ? GLYPH.image : GLYPH.file}${ext && !image ? `<b>${esc(ext)}</b>` : ""}</span>`;
}

export function toolViewHtml(v: ToolView, titles: string[] = []): string {
  const s = v.subject;
  const sub = s?.file ? [fileKindLabel(s.file), formatSize(s.file.size)].filter(Boolean).join(" · ") : s?.hint || "";
  const subject = s ? `<div class="tv-subject">${tile(s.file)}<div class="tv-text"><b class="tv-name" title="${esc(s.file?.name || s.label || "")}">${esc(s.file?.name || s.label || "")}</b>${sub ? `<span class="tv-sub">${esc(sub)}</span>` : ""}</div></div>` : "";
  const note = v.note ? `<p class="tv-note">${esc(v.note)}</p>` : "";
  const facts = v.facts.length ? `<dl class="tv-facts">${v.facts.map((f, i) => `<dt>${esc(f.label)}</dt><dd${f.mono ? ' class="mono"' : ""} title="${esc(titles[i] || f.value)}">${esc(f.value)}</dd>`).join("")}</dl>` : "";
  return `<div class="tv-head"><span class="tv-state" role="img" aria-label="${v.phase === "pending" ? "In progress" : v.phase === "done" ? "Completed" : "Failed"}">${GLYPH[v.phase]}</span><h3>${esc(v.headline)}</h3></div>${subject}${note}${facts}`;
}

/** What changed between two renders, so a repeat of the same state leaves the screen untouched. */
export const toolViewKey = (v: ToolView) => JSON.stringify([v.phase, v.headline, v.subject, v.note, v.facts]);

/** A view on screen that can follow its item: `refresh` reports whether it is still waiting on an outcome. */
export interface WatchedView { refresh(): boolean; live(): boolean }

/**
 * Keeps on-screen tool views tied to their items after the scene that drew them has moved on (its
 * wait timed out, or newer work cut it short). A real update to the item repaints the view in place.
 * A view whose window was replaced or destroyed is dropped and never repainted, so a late result of
 * one call cannot overwrite what another call is showing.
 */
export class ToolViewWatch {
  private views = new Map<string, WatchedView>();
  get size() { return this.views.size; }
  add(id: string, view: WatchedView) {
    for (const [key, v] of this.views) if (!v.live()) this.views.delete(key);
    this.views.set(id, view);
  }
  /** The item changed. Returns whether a view followed it. */
  update(id: string): boolean {
    const view = this.views.get(id);
    if (!view) return false;
    if (!view.live()) { this.views.delete(id); return false; }
    if (!view.refresh()) this.views.delete(id);
    return true;
  }
  clear() { this.views.clear(); }
}
