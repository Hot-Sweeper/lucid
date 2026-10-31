import gsap from "gsap";
import type { WM, Win } from "./wm";
import { ICONS } from "./icons";
import { baseName, relPath, type Entry, type Hit } from "./classify";
import { esc, typeInto } from "./typing";

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "") || (p.startsWith("/") ? "/" : "");
const key = (p: string) => /^(?:[a-z]:|[\\/]{2})/i.test(p) ? norm(p).toLowerCase() : norm(p);
const parent = (p: string) => {
  const path = norm(p), split = path.lastIndexOf("/");
  return split < 0 ? path : path.slice(0, split) || "/";
};
const absolute = (p: string, base: string) => {
  const prefix = norm(base);
  const full = /^(?:[a-z]:|[\\/])/i.test(p) ? norm(p) : `${prefix}${prefix.endsWith("/") ? "" : "/"}${norm(p)}`;
  const leading = full.startsWith("//") ? "//" : full.startsWith("/") ? "/" : "";
  const parts: string[] = [];
  for (const part of full.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === ".." && parts.length && !/^[a-z]:$/i.test(parts.at(-1)!)) parts.pop();
    else if (part !== "..") parts.push(part);
  }
  return leading + parts.join("/");
};
const glyph = (path: string) => `<svg class="fe-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const arrow = glyph("M12 4 6 10l6 6");
const searchIcon = glyph("M13.5 13.5 18 18M15 8.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0");
const kind = (e: Entry) => {
  if (e.dir) return "Folder";
  const ext = e.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const types: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", cjs: "JavaScript", mjs: "JavaScript", json: "JSON", css: "Stylesheet", html: "HTML", md: "Markdown", png: "Image", jpg: "Image", svg: "SVG image", mp4: "Video", mp3: "Audio", wav: "Audio", pdf: "PDF", zip: "Archive" };
  return ext ? types[ext] || `${ext.toUpperCase()} file` : "File";
};
type Folder = { path: string; root: string | null; entries: Entry[]; scroll: number; selected: string };

// A view of the files the agent actually listed. Navigation reuses known listings;
// it never invents directory contents or performs extra filesystem operations.
export class FilesApp {
  private path = "";
  private root: string | null = null;
  private folders = new Map<string, Folder>();
  private history: string[] = [];
  private historyAt = -1;
  constructor(private wm: WM) {}

  private async ensure() {
    const w = await this.wm.open("files");
    if (!w.body.querySelector(".files")) {
      this.path = ""; this.root = null; this.folders.clear();
      this.history = []; this.historyAt = -1;
      w.body.innerHTML = `<div class="files">
        <div class="fe-toolbar"><div class="fe-navigation">
          <button type="button" data-nav="back" title="Back" aria-label="Back">${arrow}</button>
          <button type="button" data-nav="forward" title="Forward" aria-label="Forward">${arrow}</button>
          <button type="button" data-nav="up" title="Up one folder" aria-label="Up one folder">${glyph("M4 12 10 6l6 6M10 6v12")}</button>
        </div><div class="fe-address" title="Folder path">${ICONS.folder}<div class="fe-crumbs"></div></div>
        <div class="fe-search">${searchIcon}<span class="fe-query"></span></div></div>
        <div class="fe-layout"><nav class="fe-sidebar" aria-label="Folders"></nav><section class="fe-main">
          <div class="fe-columns"><span>Name</span><span>Type</span><span>Size</span></div>
          <div class="fe-list" role="list" aria-label="Files"></div>
        </section></div><footer class="fe-status" aria-live="polite"></footer></div>`;
      w.body.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const nav = target.closest<HTMLButtonElement>("[data-nav]");
        if (nav && !nav.disabled) {
          if (nav.dataset.nav === "up") this.visit(w, parent(this.path));
          else {
            this.save(w);
            this.historyAt += nav.dataset.nav === "back" ? -1 : 1;
            this.restore(w, this.history[this.historyAt]);
          }
          return;
        }
        const folder = target.closest<HTMLButtonElement>("[data-folder]");
        if (folder && !folder.disabled) this.visit(w, folder.dataset.folder!);
        const row = target.closest<HTMLElement>(".fe-row");
        if (row) this.select(w, row);
      });
      w.body.addEventListener("dblclick", (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(".fe-row[data-dir=true]");
        if (row && this.folders.has(key(row.dataset.path!))) this.visit(w, row.dataset.path!);
      });
    }
    return w;
  }

  private save(w: Win) {
    const folder = this.folders.get(key(this.path));
    if (folder && !w.body.querySelector(".files.searching")) {
      folder.scroll = w.body.querySelector(".fe-list")!.scrollTop;
      folder.selected = w.body.querySelector<HTMLElement>(".fe-row.selected")?.dataset.path || "";
    }
  }

  private visit(w: Win, path: string) {
    this.save(w);
    if (key(this.history[this.historyAt] || "") !== key(path)) {
      this.history = this.history.slice(0, this.historyAt + 1);
      this.history.push(path);
      this.historyAt = this.history.length - 1;
    }
    this.restore(w, path);
  }

  private restore(w: Win, path: string) {
    const folder = this.folders.get(key(path));
    if (!folder) return;
    this.path = folder.path; this.root = folder.root;
    w.body.querySelector(".files")!.classList.remove("searching");
    const query = w.body.querySelector(".fe-query")!;
    query.textContent = "";
    this.chrome(w);
    const list = w.body.querySelector<HTMLElement>(".fe-list")!;
    const sorted = [...folder.entries].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    list.innerHTML = sorted.map((entry) => {
      const full = absolute(entry.path || entry.name, entry.path && /[\\/]/.test(entry.path) ? this.root || path : path);
      const location = key(parent(full)) !== key(path) ? relPath(parent(full), this.root) : "";
      return `<div class="fe-row${key(folder.selected) === key(full) ? " selected" : ""}" role="listitem" data-path="${esc(full)}" data-dir="${entry.dir}" title="${esc(full)}">
        <div class="fe-name">${entry.dir ? ICONS.folder : ICONS.file}<span><span class="fe-filename">${esc(entry.name)}</span>${location ? `<small>${esc(location)}</small>` : ""}</span></div>
        <span class="fe-type">${esc(kind(entry))}</span><span class="fe-size">${entry.dir ? "" : esc(entry.size || "")}</span></div>`;
    }).join("") || `<p class="fe-empty">This folder is empty</p>`;
    list.scrollTop = folder.scroll;
    w.body.querySelector(".fe-status")!.textContent = `${sorted.length} ${sorted.length === 1 ? "item" : "items"}`;
  }

  private chrome(w: Win) {
    const paths: string[] = [];
    let cursor = this.path;
    for (let i = 0; cursor && i < 12; i++) {
      paths.unshift(cursor);
      if (key(cursor) === key(this.root || "") || parent(cursor) === cursor || !cursor.includes("/")) break;
      cursor = parent(cursor);
    }
    const crumbs = w.body.querySelector<HTMLElement>(".fe-crumbs")!;
    crumbs.innerHTML = paths.map((p) => `<button type="button" data-folder="${esc(p)}" ${!this.folders.has(key(p)) ? "disabled" : ""} title="${esc(p)}">${esc(baseName(p))}</button>`).join('<span aria-hidden="true">›</span>');
    crumbs.scrollLeft = crumbs.scrollWidth;
    w.body.querySelector(".fe-address")!.setAttribute("title", this.path);
    w.body.querySelector(".fe-search")!.setAttribute("title", `Search ${baseName(this.path)}`);
    w.body.querySelector<HTMLElement>(".fe-query")!.dataset.placeholder = `Search ${baseName(this.path)}`;
    const sidebar = w.body.querySelector(".fe-sidebar")!;
    sidebar.innerHTML = `<div class="fe-side-title">Folders</div>` + paths.map((p, i) => `<button type="button" data-folder="${esc(p)}" style="--depth:${Math.min(i, 4)}" ${!this.folders.has(key(p)) ? "disabled" : ""} class="${key(p) === key(this.path) ? "current" : ""}" title="${esc(p)}">${ICONS.folder}<span>${esc(baseName(p))}</span></button>`).join("");
    for (const [name, disabled] of [["back", this.historyAt <= 0], ["forward", this.historyAt >= this.history.length - 1], ["up", !this.folders.has(key(parent(this.path)))]] as const) {
      w.body.querySelector<HTMLButtonElement>(`[data-nav=${name}]`)!.disabled = disabled;
    }
  }

  private select(w: Win, row: HTMLElement) {
    w.body.querySelectorAll(".fe-row.selected").forEach((r) => r.classList.remove("selected"));
    row.classList.add("selected");
    w.body.querySelector(".fe-status")!.textContent = `${baseName(row.dataset.path!)} selected`;
  }

  private async point(w: Win, row: HTMLElement, open = false) {
    const list = w.body.querySelector<HTMLElement>(".fe-list")!;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      await new Promise<void>((resolve) => gsap.to(list, { scrollTop: Math.max(0, top - list.clientHeight / 3), duration: 0.25 / this.wm.speed, onComplete: resolve }));
    }
    await this.wm.pointAt(row.querySelector(".fe-name") || row, 0.4, 0.5, 320);
    this.select(w, row);
    await this.wm.click(open);
  }

  async list(path: string, entries: Entry[], root: string | null) {
    const wm = this.wm, epoch = wm.epoch;
    const w = await this.ensure();
    const nextPath = absolute(path || root || ".", root || "");
    const changed = key(nextPath) !== key(this.path) || !!w.body.querySelector(".files.searching");
    if (changed && this.path) {
      const folder = [...w.body.querySelectorAll<HTMLElement>(".fe-row[data-dir=true]")].find((r) => key(r.dataset.path!) === key(nextPath));
      if (folder) await this.point(w, folder, true);
      else {
        const address = w.body.querySelector<HTMLElement>(".fe-address")!;
        await wm.pointAt(address, 0.55, 0.5, 300); await wm.click();
        address.classList.add("editing");
        try { await typeInto(wm, address.querySelector(".fe-crumbs")!, nextPath, { budgetMs: 700 }); wm.robot.pressKey("Enter"); }
        finally { address.classList.remove("editing"); }
      }
    }
    wm.check(epoch);
    this.save(w);
    const previous = this.folders.get(key(nextPath));
    this.folders.set(key(nextPath), { path: nextPath, root, entries, scroll: previous?.scroll || 0, selected: previous?.selected || "" });
    this.visit(w, nextPath);
    const list = w.body.querySelector<HTMLElement>(".fe-list")!;
    gsap.fromTo(list, { opacity: 0.55 }, { opacity: 1, duration: 0.18 });
    wm.robot.setPose("read");
    // Read the visible rows. Do not scroll to the bottom after every listing.
    const row = [...list.querySelectorAll<HTMLElement>(".fe-row")].find((r) => r.offsetTop - list.offsetTop >= list.scrollTop);
    if (row) { await wm.pointAt(row.querySelector(".fe-name")!, 0.45, 0.5, 300); await wm.sleep(240, epoch); }
  }

  async search(query: string, path: string, hits: Hit[], root: string | null) {
    const wm = this.wm, epoch = wm.epoch;
    const w = await this.ensure(); this.save(w);
    this.path = absolute(path || root || ".", root || ""); this.root = root;
    this.chrome(w);
    const files = w.body.querySelector(".files")!;
    const box = w.body.querySelector<HTMLElement>(".fe-search")!;
    await wm.pointAt(box, 0.5, 0.5, 300); await wm.click();
    box.classList.add("active");
    w.body.querySelector(".fe-status")!.textContent = "Searching";
    try { await typeInto(wm, box.querySelector(".fe-query")!, query, { budgetMs: 900 }); }
    finally { box.classList.remove("active"); }
    wm.check(epoch); files.classList.add("searching");
    const groups = new Map<string, Hit[]>();
    for (const hit of hits) {
      const full = absolute(hit.file, root || this.path);
      if (!groups.has(full)) groups.set(full, []);
      groups.get(full)!.push(hit);
    }
    // Match raw text first and escape each segment, so source text never becomes markup.
    let pattern: RegExp | null = null;
    try { if (query) pattern = new RegExp(query, "gi"); } catch { /* unsupported search syntax stays readable */ }
    const mark = (text: string) => {
      let from = 0, html = "";
      for (const match of pattern ? text.matchAll(pattern) : []) {
        if (!match[0]) continue;
        html += esc(text.slice(from, match.index)) + `<mark>${esc(match[0])}</mark>`;
        from = match.index + match[0].length;
      }
      return html + esc(text.slice(from));
    };
    const list = w.body.querySelector<HTMLElement>(".fe-list")!;
    list.innerHTML = [...groups].map(([full, matches]) => `<div class="fe-result">
      <div class="fe-row" role="listitem" data-path="${esc(full)}" title="${esc(full)}"><div class="fe-name">${ICONS.file}<span><span class="fe-filename">${esc(baseName(full))}</span><small>${esc(relPath(parent(full), root))}</small></span></div><span class="fe-matches">${matches.length} ${matches.length === 1 ? "match" : "matches"}</span></div>
      <div class="fe-snippets">${matches.slice(0, 3).map((h) => `<div class="fe-hit" title="${esc(h.text)}"><b>${h.line || ""}</b><code>${mark(h.text.trim().slice(0, 220))}</code></div>`).join("")}${matches.length > 3 ? `<small>${matches.length - 3} more matches</small>` : ""}</div></div>`).join("") || `<p class="fe-empty">No matches for &quot;${esc(query)}&quot;</p>`;
    list.scrollTop = 0;
    w.body.querySelector(".fe-status")!.textContent = `${hits.length} ${hits.length === 1 ? "match" : "matches"} in ${groups.size} ${groups.size === 1 ? "file" : "files"}`;
    gsap.fromTo(list, { opacity: 0.5 }, { opacity: 1, duration: 0.2 });
    wm.robot.setPose("read");
    await wm.sleep(350, epoch);
  }

  // Only open a listed file when it really is the next file the agent reads.
  async openFile(path: string, root: string | null) {
    if (!this.wm.isFront("files")) return;
    const w = this.wm.wins.get("files");
    if (!w) return;
    const full = absolute(path, root || this.path);
    const row = [...w.body.querySelectorAll<HTMLElement>(".fe-row:not([data-dir=true])")].find((r) => key(r.dataset.path!) === key(full));
    if (row) await this.point(w, row, true);
  }
}
