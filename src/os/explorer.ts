import gsap from "gsap";
import "./explorer.css";
import type { WM } from "./wm";
import { esc, typeInto } from "./typing";
import type { Entry, Hit } from "./classify";
import { fmtSize } from "./classify";
import { iconFor, kindOf, typeLabel, type FileKind } from "./file-kinds";
import {
  FolderModel, ancestry, collapseCrumbs, crumbsFor, fmtBytes, fmtDate, isAbsolutePath, isInside, joinPath, nameOf, normPath, parentOf, pathKey, route,
  type ExplorerItem, type Problem,
} from "./explorer-model";

/**
 * The file browser on a robot's computer. It looks and behaves like the one people use: an address bar,
 * a folder tree, a details list and a preview side. Everything on screen comes from what the agent
 * really did (listings, matched paths, search hits, files it attached), so a folder the agent never
 * opened is shown as the items seen so far and never as a made-up listing.
 */

const ARROW = {
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.6 5.4 8 12l6.6 6.6 1.6-1.6L11.2 12l5-5Z"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 5.4 8 7l5 5-5 5 1.4 1.6L16 12Z"/></svg>`,
  up: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.6 5.4 14.2 7 15.8l5-5 5 5 1.6-1.6Z"/></svg>`,
  chev: `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.2 2.4 7.8 6 4.2 9.6 3.4 8.8 6.2 6 3.4 3.2Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M10.5 4a6.5 6.5 0 1 0 4 11.6l4.4 4.4 1.4-1.4-4.4-4.4A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"/></svg>`,
  twist: `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.6 4.4h4.8L6 8Z"/></svg>`,
};

const MAX_ROWS = 150;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export type ListOptions = { instant?: boolean; problem?: Problem | null; select?: string | null };
export type RevealFile = { path: string; name: string; bytes?: number; modified?: number; preview?: boolean };
export type RevealedFile = { row: HTMLElement; name: string; kind: FileKind; bytes?: number; thumb: string | null };

type History = { stack: string[]; at: number };

export class FilesApp {
  private model = new FolderModel();
  private cur: string | null = null;
  private root: string | null = null;
  private hist: History = { stack: [], at: -1 };
  private mode: "folder" | "search" = "folder";
  private tweens = new Set<gsap.core.Tween>();
  private previews = new Map<string, string>();
  constructor(private wm: WM) {}

  /** Forget everything the agent has shown so far (a new session at this desk). */
  reset() {
    this.model.clear();
    this.cur = null; this.hist = { stack: [], at: -1 }; this.mode = "folder"; this.previews.clear();
    for (const t of this.tweens) t.kill();
    this.tweens.clear();
  }

  private tween(target: gsap.TweenTarget, vars: gsap.TweenVars) {
    const t = gsap.to(target, { ...vars, onComplete: () => { this.tweens.delete(t); vars.onComplete?.(); } });
    this.tweens.add(t);
    return t;
  }
  private fade(from: Element[], to: gsap.TweenVars) {
    if (!from.length) return;
    if (calm()) { gsap.set(from, { opacity: 1, y: 0, x: 0 }); return; }
    const t = gsap.fromTo(from, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: 0.24, ease: "power2.out", stagger: Math.min(0.02, 0.4 / from.length), clearProps: "transform", ...to, onComplete: () => this.tweens.delete(t) });
    this.tweens.add(t);
  }

  // --- window ----------------------------------------------------------------------------------
  private async ensure() {
    const w = await this.wm.open("files");
    if (!w.body.querySelector(".fx")) {
      w.body.innerHTML = `
        <div class="fx" data-view="folder">
          <div class="fx-bar">
            <span class="fx-btn" data-act="back" role="img" aria-label="Back" aria-disabled="true">${ARROW.back}</span>
            <span class="fx-btn" data-act="forward" role="img" aria-label="Forward" aria-disabled="true">${ARROW.forward}</span>
            <span class="fx-btn" data-act="up" role="img" aria-label="Up one folder" aria-disabled="true">${ARROW.up}</span>
            <div class="fx-address" role="navigation" aria-label="Path"><div class="fx-crumbs"></div><div class="fx-typed" hidden></div></div>
            <div class="fx-search">${ARROW.search}<span class="q"></span></div>
          </div>
          <div class="fx-body">
            <nav class="fx-tree" aria-label="Folders"></nav>
            <div class="fx-main">
              <div class="fx-cols"><span class="c-n">Name</span><span class="c-m">Date modified</span><span class="c-t">Type</span><span class="c-s">Size</span></div>
              <div class="fx-list" role="listbox" aria-label="Items"></div>
            </div>
            <aside class="fx-side" aria-label="Details"></aside>
          </div>
          <footer class="fx-status"><span class="fx-count"></span><span class="fx-sel"></span></footer>
        </div>`;
      // a window that was closed and opened again starts from scratch, but the model keeps what was seen
      this.cur = null; this.hist = { stack: [], at: -1 }; this.mode = "folder";
    }
    return w;
  }

  private q<T extends HTMLElement>(w: HTMLElement, sel: string) { return w.querySelector(sel) as T; }

  // --- rendering -------------------------------------------------------------------------------
  private rowHtml(it: ExplorerItem, open = false) {
    const kind = kindOf(it.name, it.dir);
    const size = it.dir ? "" : it.size || (it.bytes != null ? fmtBytes(it.bytes) : "");
    return `<div class="fx-row" role="option" aria-selected="false" data-path="${esc(it.path)}" data-dir="${it.dir ? 1 : 0}" title="${esc(it.path)}">${iconFor(kind, open)}<span class="n">${esc(it.name)}</span><span class="m">${it.modified ? esc(fmtDate(it.modified)) : ""}</span><span class="t">${esc(typeLabel(it.name, it.dir))}</span><span class="s">${esc(size)}</span></div>`;
  }

  private renderCrumbs(w: HTMLElement, path: string, trail?: string) {
    const all = crumbsFor(path, this.root);
    const { shown, hidden } = collapseCrumbs(all, 4);
    const parts: string[] = [];
    shown.forEach((c, i) => {
      if (i === 1 && hidden.length) parts.push(`<span class="fx-crumb fx-more" title="${esc(hidden.map((h) => h.label).join(" / "))}">…</span>`);
      parts.push(`<span class="fx-crumb${!trail && i === shown.length - 1 ? " last" : ""}" data-path="${esc(c.path)}" title="${esc(c.path)}">${esc(c.label)}</span>`);
    });
    const el = this.q(w, ".fx-crumbs");
    el.innerHTML = parts.join(`<i class="fx-chev" aria-hidden="true">${ARROW.chev}</i>`) + (trail ? `<i class="fx-chev" aria-hidden="true">${ARROW.chev}</i><span class="fx-crumb last">${esc(trail)}</span>` : "");
    this.q(w, ".fx-address").setAttribute("aria-label", `Path: ${all.map((c) => c.label).join(" / ")}`);
  }

  private renderTree(w: HTMLElement, path: string) {
    const chain = crumbsFor(path, this.root).map((c) => c.path);
    const rows: string[] = [];
    const walk = (dir: string, depth: number) => {
      const onPath = chain.some((c) => pathKey(c) === pathKey(dir));
      const here = pathKey(dir) === pathKey(path);
      rows.push(`<div class="fx-t${here ? " on" : ""}" data-path="${esc(dir)}" style="--d:${Math.min(depth, 4)}" title="${esc(dir)}"><i class="tw${onPath ? " open" : ""}">${this.model.folders(dir).length ? ARROW.twist : ""}</i>${iconFor("folder", onPath)}<span class="n">${esc(nameOf(dir))}</span></div>`);
      if (!onPath || depth > 7) return;
      for (const f of this.model.folders(dir).slice(0, 24)) walk(f.path, depth + 1);
    };
    if (chain.length) walk(chain[0], 0);
    const tree = this.q(w, ".fx-tree");
    const html = rows.join("");
    if (tree.dataset.sig !== html) { tree.dataset.sig = html; tree.innerHTML = html; }
    const on = tree.querySelector(".on") as HTMLElement | null;
    if (on) {
      const top = on.offsetTop, h = on.offsetHeight;
      if (top < tree.scrollTop) tree.scrollTop = top - 4;
      else if (top + h > tree.scrollTop + tree.clientHeight) tree.scrollTop = top + h - tree.clientHeight + 4;
    }
  }

  private renderStatus(w: HTMLElement, path: string, shownCount: number, extra = "") {
    const listed = this.model.isListed(path);
    const total = this.model.children(path).length;
    const count = this.mode === "search" ? plural(shownCount, "result") : listed ? plural(total, "item") : `${plural(total, "item")} seen`;
    this.q(w, ".fx-count").textContent = extra || count;
  }

  private setButtons(w: HTMLElement) {
    const set = (act: string, on: boolean) => this.q(w, `[data-act="${act}"]`).setAttribute("aria-disabled", String(!on));
    set("back", this.hist.at > 0);
    set("forward", this.hist.at < this.hist.stack.length - 1);
    set("up", !!this.cur && !!parentOf(this.cur));
  }

  private emptyHtml(path: string) {
    const p = this.model.problemOf(path);
    if (p === "missing") return `<div class="fx-empty"><b>This folder was not found</b><span>${esc(path)}</span></div>`;
    if (p === "denied") return `<div class="fx-empty"><b>Access to this folder is denied</b><span>${esc(path)}</span></div>`;
    return `<div class="fx-empty"><b>This folder is empty</b></div>`;
  }

  /** Draw a folder: address, tree, list, status and side. */
  private show(w: HTMLElement, path: string, o: { push?: boolean; animate?: boolean; select?: string | null } = {}) {
    const fx = this.q(w, ".fx");
    this.mode = "folder";
    fx.dataset.view = "folder";
    this.q(w, ".fx-cols .c-s").textContent = "Size";
    const target = normPath(path);
    if (o.push !== false && (!this.cur || pathKey(this.cur) !== pathKey(target))) {
      this.hist.stack = this.hist.stack.slice(0, this.hist.at + 1);
      this.hist.stack.push(target); this.hist.at = this.hist.stack.length - 1;
    }
    this.cur = target;
   
    this.renderCrumbs(w, target);
    this.renderTree(w, target);
    const list = this.q(w, ".fx-list");
    const kids = this.model.children(target);
    const shown = kids.slice(0, MAX_ROWS);
    list.innerHTML = kids.length
      ? shown.map((k) => this.rowHtml(k)).join("") + (kids.length > shown.length ? `<div class="fx-more-rows">${plural(kids.length - shown.length, "more item")}</div>` : "")
      : this.emptyHtml(target);
    list.scrollTop = 0;
    this.q(w, ".fx-search .q").textContent = "";
    w.querySelector(".fx-search")?.classList.remove("active");
    this.renderStatus(w, target, kids.length);
    this.q(w, ".fx-sel").textContent = "";
    this.renderSide(w, null);
    this.setButtons(w);
    if (o.animate !== false) this.fade(Array.from(list.children), {});
    if (o.select) this.select(w, o.select, false);
  }

  private select(w: HTMLElement, path: string | null, scroll = true) {
    const list = this.q(w, ".fx-list");
    list.querySelector(".sel")?.classList.remove("sel");
    list.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    const row = path ? this.rowOf(w, path) : null;
    if (row) {
      row.classList.add("sel"); row.setAttribute("aria-selected", "true");
      if (scroll) {
        const top = row.offsetTop, h = row.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top - 4;
        else if (top + h > list.scrollTop + list.clientHeight) list.scrollTop = top + h - list.clientHeight + 4;
      }
    }
    const item = path ? this.model.find(path) : null;
    this.renderSide(w, item);
    const sel = this.q(w, ".fx-sel");
    sel.textContent = item ? [item.name, item.dir ? "" : item.size || (item.bytes != null ? fmtBytes(item.bytes) : "")].filter(Boolean).join(", ") : "";
  }

  private rowOf(w: HTMLElement, path: string) {
    const key = pathKey(path);
    return Array.from(w.querySelectorAll<HTMLElement>(".fx-list [data-path]")).find((r) => pathKey(r.dataset.path || "") === key) ?? null;
  }

  private renderSide(w: HTMLElement, item: ExplorerItem | null) {
    const side = this.q(w, ".fx-side");
    const here = this.cur ? this.model.find(this.cur) : null;
    if (!item) {
      const name = this.cur ? nameOf(this.cur) : "";
      const count = this.cur ? this.model.children(this.cur).length : 0;
      side.innerHTML = `<div class="fx-big">${iconFor("folder", true)}</div><b class="fx-name" title="${esc(this.cur || "")}">${esc(name)}</b><dl><dt>Type</dt><dd>File folder</dd><dt>${this.cur && this.model.isListed(this.cur) ? "Items" : "Seen"}</dt><dd>${count}</dd>${here?.modified ? `<dt>Modified</dt><dd>${esc(fmtDate(here.modified))}</dd>` : ""}</dl>`;
      return;
    }
    const kind = kindOf(item.name, item.dir);
    const url = this.previews.get(pathKey(item.path));
    const art = !item.dir && kind === "image" && url
      ? `<div class="fx-thumb"><span class="ph">${iconFor(kind)}</span><img alt="${esc(item.name)}" src="${esc(url)}"></div>`
      : `<div class="fx-big">${iconFor(kind, false)}</div>`;
    side.innerHTML = `${art}<b class="fx-name" title="${esc(item.path)}">${esc(item.name)}</b><dl><dt>Type</dt><dd>${esc(typeLabel(item.name, item.dir))}</dd>${item.dir ? "" : `<dt>Size</dt><dd>${esc(item.size || (item.bytes != null ? fmtBytes(item.bytes) : "Unknown"))}</dd>`}${item.modified ? `<dt>Modified</dt><dd>${esc(fmtDate(item.modified))}</dd>` : ""}</dl>`;
    const img = side.querySelector("img");
    if (img) {
      img.addEventListener("load", () => side.querySelector(".fx-thumb")?.classList.add("ready"), { once: true });
      img.addEventListener("error", () => { img.remove(); }, { once: true });
    }
  }

  // --- the walk ---------------------------------------------------------------------------------
  private startFolder(target: string) {
    // the project folder when the target is inside it, otherwise the top of the target's own disk
    return this.root && isInside(target, this.root) ? normPath(this.root) : ancestry(target)[0];
  }

  private async clickAt(el: Element | null, double = false, ax = 0.3, ay = 0.5) {
    if (!el) return;
    const wm = this.wm;
    await wm.pointAt(el, ax, ay, 340);
    el.classList.add("hover");
    await wm.click(double);
    el.classList.remove("hover");
  }

  /** Walk the open window from the folder it shows to `target`, clicking the way a person would. */
  private async travel(w: HTMLElement, target: string, o: { instant?: boolean; select?: string | null }) {
    const wm = this.wm, e = wm.epoch;
    const want = normPath(target);
    if (!this.cur) {
      const start = this.startFolder(want);
      this.show(w, start, { animate: false });
    }
    if (o.instant) { this.show(w, want, { animate: false, select: o.select }); return; }
    const steps = route(this.cur, want);
    if (steps.length > 5) {
      // a long way: type the path into the address bar, as people do
      const bar = this.q(w, ".fx-address");
      await this.clickAt(bar, false, 0.5, 0.5);
      const typed = this.q(w, ".fx-typed");
      bar.classList.add("editing"); typed.hidden = false; this.q(w, ".fx-crumbs").hidden = true;
      await typeInto(wm, typed, want.replace(/\//g, "\\"), { budgetMs: 900 });
      wm.robot.pressKey("Enter");
      await wm.sleep(120, e);
      typed.hidden = true; this.q(w, ".fx-crumbs").hidden = false; bar.classList.remove("editing");
      this.show(w, want, { select: o.select });
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      wm.check(e);
      const s = steps[i];
      if (s.via === "up") {
        const parent = this.cur ? parentOf(this.cur) : null;
        const crumb = Array.from(w.querySelectorAll<HTMLElement>(".fx-crumb[data-path]")).find((c) => pathKey(c.dataset.path || "") === pathKey(s.path));
        if (parent && pathKey(parent) === pathKey(s.path) && Math.random() < 0.5) await this.clickAt(this.q(w, '[data-act="up"]'), false, 0.5, 0.5);
        else if (crumb) await this.clickAt(crumb, false, 0.5, 0.5);
        else await this.clickAt(this.q(w, '[data-act="up"]'), false, 0.5, 0.5);
        this.show(w, s.path);
        await wm.sleep(120, e);
        continue;
      }
      if (!this.cur || !parentOf(s.path) || pathKey(parentOf(s.path)!) !== pathKey(this.cur)) {
        // not one folder below the one shown (another disk, say): the address bar takes it there
        this.show(w, s.path, { select: i === steps.length - 1 ? o.select : null });
        continue;
      }
      const row = this.rowOf(w, s.path);
      const node = Array.from(w.querySelectorAll<HTMLElement>(".fx-t")).find((t) => pathKey(t.dataset.path || "") === pathKey(s.path));
      const useTree = (!row || Math.random() < 0.3) && node;
      if (useTree) await this.clickAt(node!, false, 0.5, 0.5);
      else if (row) {
        // scroll the folder into view before aiming at it
        const list = this.q(w, ".fx-list");
        if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight || row.offsetTop < list.scrollTop) list.scrollTop = Math.max(0, row.offsetTop - 30);
        await this.clickAt(row, true, 0.3, 0.5);
        row.classList.add("sel");
      }
      this.show(w, s.path, { select: i === steps.length - 1 ? o.select : null });
      await wm.sleep(140, e);
    }
    if (!steps.length && o.select) this.select(w, o.select);
  }

  // --- what robots do ---------------------------------------------------------------------------
  /** A folder listing the agent really received. */
  async list(path: string, entries: Entry[], root: string | null, o: ListOptions = {}) {
    // recursive tools list paths in many folders: those are matches, not one folder
    const here = pathKey(this.resolve(path, root));
    const owners = new Set(entries.filter((x) => x.path).map((x) => { const f = this.resolve(isAbsolutePath(x.path!) ? x.path! : joinPath(this.resolve(path, root), x.path!), root); return pathKey(parentOf(f) ?? f); }));
    if (owners.size > 1 || (owners.size === 1 && !owners.has(here))) {
      return this.matches(path, entries.map((x) => x.path || x.name), root, o);
    }
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    this.root = root ? normPath(root) : this.root;
    const base = this.resolve(path, root);
    if (o.problem) this.model.problem(base, o.problem);
    else this.model.list(base, entries.map((x) => ({ name: x.name.replace(/[\\/]+$/, ""), dir: x.dir, size: x.size })));
    await this.travel(w.body, base, { instant: o.instant, select: o.select });
    if (o.instant) return;
    await this.skim(w.body, e);
  }

  /** Paths a glob or recursive listing matched: the folders that hold them open up, the first match is selected. */
  async matches(base: string, paths: string[], root: string | null, o: ListOptions = {}) {
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    this.root = root ? normPath(root) : this.root;
    const from = this.resolve(base, root);
    const full = paths.map((p) => this.resolve(isAbsolutePath(p) ? p : joinPath(from, p), root));
    for (const p of full) this.model.see(p, /[\\/]$/.test(p) ? true : kindOf(nameOf(p)) === "folder");
    if (!full.length) {
      if (!this.model.isListed(from)) this.model.list(from, []);
      await this.travel(w.body, from, { instant: o.instant });
      return;
    }
    const folders: string[] = [];
    for (const p of full) { const d = parentOf(p); if (d && !folders.some((f) => pathKey(f) === pathKey(d))) folders.push(d); }
    const visit = folders.slice(0, o.instant ? 1 : 2);
    for (let i = 0; i < visit.length; i++) {
      const first = full.find((p) => parentOf(p) && pathKey(parentOf(p)!) === pathKey(visit[i])) ?? null;
      await this.travel(w.body, visit[i], { instant: o.instant, select: first });
      if (!o.instant) {
        if (first) { const row = this.rowOf(w.body, first); if (row) { await this.clickAt(row, false, 0.3, 0.5); this.select(w.body, first); } }
        await wm.sleep(i === visit.length - 1 ? 260 : 160, e);
      }
    }
  }

  /** Search the current folder: the box is clicked, the words typed and results come back as files with their matching lines. */
  async search(query: string, path: string, hits: Hit[], root: string | null, o: { instant?: boolean } = {}) {
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    this.root = root ? normPath(root) : this.root;
    const base = this.resolve(path, root);
    if (!this.cur) this.show(w.body, base, { animate: false });
    else if (!o.instant && pathKey(this.cur) !== pathKey(base)) await this.travel(w.body, base, {});
    else if (pathKey(this.cur) !== pathKey(base)) this.show(w.body, base, { animate: false });
    const fx = this.q(w.body, ".fx");
    const box = this.q(w.body, ".fx-search");
    if (!o.instant) {
      await wm.pointAt(box, 0.6, 0.5);
      await wm.click();
    }
    box.classList.add("active");
    const q = this.q(w.body, ".fx-search .q");
    if (o.instant) q.textContent = query; else await typeInto(wm, q, query, { budgetMs: 900 });
    // fold the hits into the model: files show up in their folders
    const byFile = new Map<string, Hit[]>();
    for (const h of hits) {
      const full = this.resolve(isAbsolutePath(h.file) ? h.file : joinPath(base, h.file), root);
      this.model.see(full, false);
      if (!byFile.has(full)) byFile.set(full, []);
      byFile.get(full)!.push(h);
    }
    let re: RegExp | null = null;
    try { re = query ? new RegExp(query.replace(/\\b/g, ""), "gi") : null; } catch { re = null; }
    const mark = (t: string) => {
      const s = esc(t.trim().slice(0, 160));
      if (!re) return s;
      try { return s.replace(re, (m) => `<mark>${m}</mark>`); } catch { return s; }
    };
    this.mode = "search";
    fx.dataset.view = "search";
    this.q(w.body, ".fx-cols .c-s").textContent = "Matches";
    this.renderCrumbs(w.body, base, "Search results");
    const list = this.q(w.body, ".fx-list");
    list.innerHTML = byFile.size
      ? [...byFile.entries()].map(([f, hs]) => {
          const it = this.model.find(f) ?? { name: nameOf(f), path: f, dir: false };
          const rel = parentOf(f) && isInside(f, base) ? f.slice(normPath(base).replace(/\/$/, "").length + 1, f.length - it.name.length - 1) : parentOf(f) || "";
          return `<div class="fx-row fx-hit-file" role="option" aria-selected="false" data-path="${esc(f)}" data-dir="0" title="${esc(f)}">${iconFor(kindOf(it.name))}<span class="n">${esc(it.name)}<small>${esc(rel)}</small></span><span class="s">${hs.length}</span></div>`
            + hs.slice(0, 3).map((h) => `<div class="fx-hit">${h.line ? `<b>${h.line}</b>` : "<b></b>"}<code>${mark(h.text)}</code></div>`).join("");
        }).join("")
      : `<div class="fx-empty"><b>No matches for “${esc(query)}”</b>${hits.length === 0 ? `<span>${esc(base)}</span>` : ""}</div>`;
    list.scrollTop = 0;
    this.renderStatus(w.body, base, byFile.size);
    this.renderSide(w.body, null);
    this.renderTree(w.body, base);
    if (!o.instant) this.fade(Array.from(list.children), {});
    wm.robot.setPose("read");
    if (!o.instant) {
      const files = Array.from(list.querySelectorAll<HTMLElement>(".fx-hit-file"));
      for (const f of files.slice(0, 3)) { await wm.pointAt(f, 0.3, 0.5, 260); f.classList.add("hover"); await wm.sleep(230, e); f.classList.remove("hover"); }
      const pick = files[0];
      if (pick) { await this.clickAt(pick, false, 0.3, 0.5); this.select(w.body, pick.dataset.path || null, false); await wm.sleep(300, e); }
    }
    box.classList.remove("active");
  }

  /**
   * An attached file: its folder is walked to, the file selected and its row returned so the
   * robot can pick it up. Facts such as size and time come from the disk, never from guesses.
   */
  async reveal(file: RevealFile, root: string | null, o: { instant?: boolean; thumbUrl?: string | null } = {}): Promise<RevealedFile> {
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    this.root = root ? normPath(root) : this.root;
    const full = normPath(file.path);
    const dir = parentOf(full) ?? full;
    this.model.see(full, false, { bytes: file.bytes, modified: file.modified, size: file.bytes != null ? fmtSize(file.bytes) : undefined });
    this.model.update(full, { bytes: file.bytes, modified: file.modified, size: file.bytes != null ? fmtSize(file.bytes) : undefined });
    if (o.thumbUrl) this.previews.set(pathKey(full), o.thumbUrl);
    await this.travel(w.body, dir, { instant: o.instant, select: full });
    const row = this.rowOf(w.body, full)!;
    if (!o.instant) {
      wm.robot.setPose("mouse");
      await this.clickAt(row, false, 0.3, 0.5);
      this.select(w.body, full);
      await wm.sleep(280, e);
    } else this.select(w.body, full);
    return { row, name: file.name, kind: kindOf(file.name), bytes: file.bytes, thumb: o.thumbUrl ?? null };
  }

  /** Further files in the folder that is open (the next one to attach): select without walking. */
  async selectIn(path: string, extend = false) {
    const w = await this.ensure();
    const row = this.rowOf(w.body, path);
    if (!row) return null;
    await this.clickAt(row, false, 0.3, 0.5);
    if (!extend) this.select(w.body, path);
    else { row.classList.add("sel"); row.setAttribute("aria-selected", "true"); }
    return row;
  }

  /** The folder the window shows, and whether the wanted file is in its list right now. */
  holds(path: string) {
    const w = this.wm.wins.get("files");
    return !!(w && this.cur && this.rowOf(w.body, path));
  }

  private resolve(p: string, root: string | null) {
    const n = normPath(p || root || "");
    if (isAbsolutePath(n)) return n;
    return root ? joinPath(root, n) : n;
  }

  /** Look over the list the way a person does: a few rows hover, long lists scroll. */
  private async skim(w: HTMLElement, e: number) {
    const wm = this.wm;
    const list = this.q(w, ".fx-list");
    const rows = Array.from(list.querySelectorAll<HTMLElement>(".fx-row")).slice(0, 8);
    for (const r of rows.filter((_, i) => i % 3 === 0)) {
      await wm.pointAt(r, 0.35, 0.5, 300);
      r.classList.add("hover");
      await wm.sleep(170, e);
      r.classList.remove("hover");
    }
    if (list.children.length > 12) {
      wm.robot.setPose("read");
      const dur = Math.min(2.5, list.children.length * 0.05);
      this.tween(list, { scrollTop: list.scrollHeight, duration: dur / wm.speed, ease: "power1.inOut" });
      await wm.sleep(Math.min(2500, list.children.length * 50), e);
    }
  }
}
