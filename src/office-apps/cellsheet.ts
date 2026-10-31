// Cellsheet: a spreadsheet in the robot's computer. Column letters and row numbers, a name box
// and formula bar, a selected cell, sheet tabs and a status bar with Sum and Average. The robot
// clicks cells and types the real values and formulas; results recalculate with a little flash,
// and a simple chart of the numbers pops in.
import gsap from "gsap";
import type { WM } from "../os/wm";
import { esc } from "../os/typing";
import { colName, evaluate, parseRef, showNumber, type Cell, type SheetDoc } from "./model";
import { GL, flash, openTab, paceFor, press, reduced, ribbon, save, setTab, typeWith } from "./common";

const COLS = 12, MIN_ROWS = 22, MAX_ROWS = 30;
const LIVE_CELLS = 30;
const REF_COLORS = ["#4f7cff", "#e0457b", "#8a5cf6", "#e08a1e"];
type ShowOpts = { instant?: boolean; typed?: "all" | "none" | Set<string>; before?: SheetDoc | null; changed?: boolean };
type UI = { root: HTMLElement; grid: HTMLElement; table: HTMLTableElement; nameBox: HTMLElement; fx: HTMLElement; mode: HTMLElement; stats: HTMLElement; status: HTMLElement; tabs: HTMLElement };

const key = (r: number, c: number) => `${r},${c}`;
const isNum = (c: Cell) => !!c && typeof c.n === "number" && Number.isFinite(c.n);

export class Cellsheet {
  private cells: Cell[][] = [];
  private shown = new Map<string, string>();
  private sel = { r: 0, c: 0 };
  constructor(private wm: WM) {}

  private async ensure(name: string): Promise<UI> {
    const w = await this.wm.open("cellsheet", `${name}  Cellsheet`);
    if (!w.body.querySelector(".cs")) {
      w.body.innerHTML = `
        <div class="oa cs">
          ${ribbon(["File", "Home", "Insert", "Formulas", "Data", "View"], "Home")}
          <div class="cs-fbar"><span class="cs-name">A1</span><span class="cs-fx" aria-hidden="true">fx</span><span class="cs-formula"></span></div>
          <div class="cs-grid"><table class="cs-table"></table></div>
          <div class="cs-foot"><div class="cs-sheets"></div><span class="cs-mode">Ready</span><span class="cs-stats"></span><span class="oa-save"></span></div>
        </div>`;
      w.body.querySelector(".oa-tools")!.innerHTML = `
        <div class="oa-pane" data-pane="Home">
          <div class="oa-group"><span class="oa-field">Lexend</span><span class="oa-field sm">10</span></div>
          <div class="oa-group"><span class="oa-btn"><b>B</b></span><span class="oa-btn"><i>I</i></span><span class="oa-btn" title="Align left">${GL.left}</span><span class="oa-btn" title="Center">${GL.center}</span></div>
          <div class="oa-group"><span class="oa-field wide">General</span><span class="oa-btn" title="Percent">${GL.percent}</span></div>
          <div class="oa-group"><span class="oa-tool cs-sum">${GL.sum}<span>AutoSum</span></span><span class="oa-tool">${GL.sort}<span>Sort</span></span></div>
        </div>
        <div class="oa-pane" data-pane="Insert" hidden><span class="oa-tool cs-chartbtn">${GL.chart}<span>Chart</span></span><span class="oa-tool">${GL.table}<span>Table</span></span><span class="oa-tool">${GL.picture}<span>Picture</span></span></div>
        <div class="oa-pane" data-pane="Formulas" hidden><span class="oa-tool">${GL.sum}<span>AutoSum</span></span><span class="oa-tool txt">Math</span><span class="oa-tool txt">Lookup</span></div>
        <div class="oa-pane" data-pane="Data" hidden><span class="oa-tool">${GL.sort}<span>Sort</span></span><span class="oa-tool txt">Filter</span></div>
        <div class="oa-pane" data-pane="File" hidden></div><div class="oa-pane" data-pane="View" hidden></div>`;
    }
    const root = w.body.querySelector(".cs") as HTMLElement;
    return {
      root, grid: root.querySelector(".cs-grid")!, table: root.querySelector(".cs-table")!, nameBox: root.querySelector(".cs-name")!,
      fx: root.querySelector(".cs-formula")!, mode: root.querySelector(".cs-mode")!, stats: root.querySelector(".cs-stats")!,
      status: root.querySelector(".oa-save")!, tabs: root.querySelector(".cs-sheets")!,
    };
  }

  // --- values ---------------------------------------------------------------------------
  private value(r: number, c: number, seen = new Set<string>()): number | string | null {
    const cell = this.cells[r]?.[c];
    if (!cell) return null;
    if (cell.f) {
      const k = key(r, c);
      if (seen.has(k)) return null;
      seen.add(k);
      const v = evaluate(cell.f, (rr, cc) => this.value(rr, cc, seen));
      seen.delete(k);
      if (v !== undefined) return v;
      return isNum(cell) ? cell.n! : cell.v || null;
    }
    return isNum(cell) ? cell.n! : cell.v;
  }
  private display(r: number, c: number) {
    const cell = this.cells[r]?.[c];
    if (!cell) return "";
    const v = this.value(r, c);
    if (typeof v === "number") return showNumber(v, cell.fmt);
    if (v == null || v === "") return cell.f && !cell.v ? "" : cell.v;
    return String(v);
  }
  private td(ui: UI, r: number, c: number) { return ui.table.querySelector(`td[data-k="${key(r, c)}"]`) as HTMLElement | null; }

  /** Write every cell's shown value; returns the cells whose value changed (for the recalc flash). */
  private refresh(ui: UI, skip?: string) {
    const changed: HTMLElement[] = [];
    for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS; c++) {
      const k = key(r, c);
      if (k === skip) continue;
      const s = this.display(r, c);
      if ((this.shown.get(k) ?? "") === s) continue;
      const td = this.td(ui, r, c);
      if (!td) continue;
      const had = this.shown.has(k) && this.shown.get(k) !== "";
      this.shown.set(k, s);
      td.textContent = s;
      td.classList.toggle("num", typeof this.value(r, c) === "number");
      if (had && this.cells[r]?.[c]?.f) changed.push(td);
    }
    return changed;
  }

  private build(ui: UI, doc: SheetDoc, rows: number) {
    // column widths from the content, like a sheet someone sized by hand
    const widths = Array.from({ length: COLS }, (_, c) => {
      let len = 0;
      for (const row of doc.rows) { const cell = row[c]; if (cell) len = Math.max(len, (cell.f && !cell.v ? 6 : cell.v.length)); }
      return len ? Math.max(48, Math.min(136, Math.round(len * 6.3 + 14))) : 58;
    });
    const header = doc.rows[0] && doc.rows[0].some(Boolean) && doc.rows[0].every((c) => !c || !isNum(c)) && doc.rows.slice(1).some((r) => r.some(isNum));
    ui.table.innerHTML = `<colgroup><col style="width:30px">${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>
      <thead><tr><th class="cs-corner"></th>${widths.map((_, c) => `<th data-c="${c}">${colName(c)}</th>`).join("")}</tr></thead>
      <tbody>${Array.from({ length: rows }, (_, r) => `<tr><th data-r="${r}">${r + 1}</th>${widths.map((_, c) => `<td data-k="${key(r, c)}"${header && r === 0 ? ' class="hdr"' : ""}></td>`).join("")}</tr>`).join("")}</tbody>`;
    ui.table.style.width = `${30 + widths.reduce((a, b) => a + b, 0)}px`;
    this.shown.clear();
    ui.tabs.innerHTML = doc.sheets.slice(0, 6).map((s, i) => `<span class="cs-sheet${i === doc.active ? " on" : ""}" title="${esc(s)}">${esc(s)}</span>`).join("") + `<span class="cs-sheet add" aria-hidden="true">+</span>`;
  }

  private select(ui: UI, r: number, c: number, r2 = r, c2 = c) {
    this.sel = { r, c };
    ui.table.querySelectorAll(".sel, .in-range").forEach((x) => x.classList.remove("sel", "in-range"));
    ui.table.querySelectorAll("th.hl").forEach((x) => x.classList.remove("hl"));
    const [r0, r1, c0, c1] = [Math.min(r, r2), Math.max(r, r2), Math.min(c, c2), Math.max(c, c2)];
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) this.td(ui, rr, cc)?.classList.add(rr === r && cc === c ? "sel" : "in-range");
    for (let cc = c0; cc <= c1; cc++) ui.table.querySelector(`th[data-c="${cc}"]`)?.classList.add("hl");
    for (let rr = r0; rr <= r1; rr++) ui.table.querySelector(`th[data-r="${rr}"]`)?.classList.add("hl");
    ui.nameBox.textContent = r0 === r1 && c0 === c1 ? `${colName(c)}${r + 1}` : `${colName(c0)}${r0 + 1}:${colName(c1)}${r1 + 1}`;
    const cell = this.cells[r]?.[c];
    ui.fx.textContent = cell ? cell.f || cell.v : "";
    // Sum, Average and Count of the selection, like the status bar of a real sheet
    const nums: number[] = [];
    let count = 0;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) { const v = this.value(rr, cc); if (v != null && v !== "") count++; if (typeof v === "number") nums.push(v); }
    ui.stats.textContent = count > 1 && nums.length ? `Average: ${showNumber(nums.reduce((a, b) => a + b, 0) / nums.length)}   Count: ${count}   Sum: ${showNumber(nums.reduce((a, b) => a + b, 0))}` : "";
    // keep the selection in view
    const td = this.td(ui, r, c);
    if (td) {
      const g = ui.grid;
      if (td.offsetTop + td.offsetHeight > g.scrollTop + g.clientHeight - 4) g.scrollTop = td.offsetTop + td.offsetHeight - g.clientHeight + 24;
      else if (td.offsetTop - 18 < g.scrollTop) g.scrollTop = Math.max(0, td.offsetTop - 40);
      if (td.offsetLeft + td.offsetWidth > g.scrollLeft + g.clientWidth) g.scrollLeft = td.offsetLeft + td.offsetWidth - g.clientWidth + 20;
      else if (td.offsetLeft - 30 < g.scrollLeft) g.scrollLeft = Math.max(0, td.offsetLeft - 30);
    }
  }

  // Coloured boxes around the ranges a formula refers to, while it is being typed.
  private refBoxes(ui: UI, text: string) {
    ui.grid.querySelectorAll(".cs-ref").forEach((x) => x.remove());
    let i = 0;
    for (const m of text.matchAll(/(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/gi)) {
      const a = parseRef(m[1]), b = m[2] ? parseRef(m[2]) : a;
      if (!a || !b) continue;
      const t0 = this.td(ui, Math.min(a.r, b.r), Math.min(a.c, b.c)), t1 = this.td(ui, Math.max(a.r, b.r), Math.max(a.c, b.c));
      if (!t0 || !t1) continue;
      const box = document.createElement("div");
      box.className = "cs-ref";
      box.style.cssText = `left:${t0.offsetLeft}px;top:${t0.offsetTop}px;width:${t1.offsetLeft + t1.offsetWidth - t0.offsetLeft}px;height:${t1.offsetTop + t1.offsetHeight - t0.offsetTop}px;--rc:${REF_COLORS[i++ % REF_COLORS.length]}`;
      ui.grid.appendChild(box);
    }
  }

  private async typeCell(ui: UI, r: number, c: number, cell: Cell, cps: number) {
    const wm = this.wm;
    const td = this.td(ui, r, c);
    if (!td || !cell) return;
    const text = cell.f || (isNum(cell) && cell.fmt ? showNumber(cell.n!, cell.fmt) : cell.v);
    ui.mode.textContent = "Enter";
    td.classList.add("editing");
    td.classList.toggle("num", false);
    try {
      await typeWith(wm, text, cps, (n, caret) => {
        const s = esc(text.slice(0, n)) + (caret ? '<span class="caret"></span>' : "");
        td.innerHTML = s;
        ui.fx.innerHTML = s;
        if (cell.f) this.refBoxes(ui, text.slice(0, n));
      });
    } finally {
      td.classList.remove("editing");
      ui.grid.querySelectorAll(".cs-ref").forEach((x) => x.remove());
      ui.mode.textContent = "Ready";
    }
    this.commit(ui, r, c, cell);
  }

  /** A cell gets its new content: it and everything that depends on it recalculates, with a flash. */
  private commit(ui: UI, r: number, c: number, cell: Cell) {
    (this.cells[r] ??= [])[c] = cell;
    const k = key(r, c);
    this.shown.delete(k);
    const td = this.td(ui, r, c);
    if (td) td.textContent = "";
    const changed = this.refresh(ui);
    if (td && cell?.f) flash(td, "rgba(47, 179, 122, 0.45)", 1.1);
    for (const x of changed) if (x !== td) flash(x, "rgba(47, 179, 122, 0.4)", 1.2);
  }

  // Groups of formulas that are the same pattern down a column (=C2-B2, =C3-B3...): typed once, filled down.
  private fillGroups(cells: [number, number, Cell][]) {
    const norm = (f: string, r: number) => f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, _a, col, abs, row) => (abs ? m : `${col}{${Number(row) - 1 - r}}`));
    const groups: [number, number, Cell][][] = [];
    for (const it of cells) {
      const [r, c, cell] = it;
      const g = groups.find((g) => { const [lr, lc, lcell] = g[g.length - 1]; return lc === c && lr === r - 1 && norm(lcell!.f!, lr) === norm(cell!.f!, r); });
      if (g) g.push(it); else groups.push([it]);
    }
    return groups;
  }

  async show(doc: SheetDoc, o: ShowOpts = {}) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const ui = await this.ensure(doc.name);
    const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, doc.rows.length + 4));
    this.build(ui, doc, rows);
    setTab(ui.root, "Home");
    ui.status.textContent = "";
    ui.grid.scrollTop = 0; ui.grid.scrollLeft = 0;
    // which cells the robot fills in
    const all: [number, number, Cell][] = [];
    doc.rows.forEach((row, r) => row.forEach((cell, c) => { if (cell && c < COLS && r < MAX_ROWS && (cell.v !== "" || cell.f)) all.push([r, c, cell]); }));
    const typedSet = o.typed === "all" ? new Set(all.map(([r, c]) => key(r, c))) : o.typed instanceof Set ? o.typed : new Set<string>();
    // start from what was there before (the old file, or nothing for the cells being typed)
    this.cells = doc.rows.map((row, r) => row.map((cell, c) => (typedSet.has(key(r, c)) && !instant ? o.before?.rows[r]?.[c] ?? null : cell)));
    this.refresh(ui);
    this.select(ui, 0, 0);
    if (doc.totalRows > MAX_ROWS) ui.stats.textContent = `Showing the first ${MAX_ROWS} of ${doc.totalRows.toLocaleString("en-US")} rows`;
    if (instant) {
      this.cells = doc.rows.map((r) => [...r]);
      this.refresh(ui);
      this.chart(ui, doc, true);
      await save(wm, ui.status, true);
      await wm.sleep(350, e);
      return;
    }
    const todo = all.filter(([r, c]) => typedSet.has(key(r, c)));
    if (!todo.length) {
      // it changed but we can not tell which cells: look over the sheet, then save
      wm.robot.setPose("read");
      const look = all.filter(([, , cell]) => cell?.f || isNum(cell)).sort(() => Math.random() - 0.5).slice(0, 3);
      for (const [r, c] of look) { const td = this.td(ui, r, c); if (!td) continue; await wm.pointAt(td, 0.5, 0.5, 340); await wm.click(); this.select(ui, r, c); await wm.sleep(380, e); }
      await this.chart(ui, doc, true);
      await save(wm, ui.status);
      return;
    }
    const values = todo.filter(([, , cell]) => !cell?.f), formulas = todo.filter(([, , cell]) => cell?.f);
    const chars = todo.slice(0, LIVE_CELLS).reduce((s, [, , cell]) => s + (cell!.f || cell!.v).length + 2, 0);
    const cps = paceFor(chars, 2, 12) * 0.9;
    let live = LIVE_CELLS - Math.min(8, formulas.length);
    // values first: clicked, typed, Tab across a row, Enter down to the next
    let at: { r: number; c: number } | null = null, rowStart = 0;
    const goTo = async (r: number, c: number) => {
      if (at && r === at.r && c === at.c + 1) wm.robot.pressKey("Tab");
      else if (at && r === at.r + 1 && c === rowStart) wm.robot.pressKey("Enter");
      else {
        const td = this.td(ui, r, c);
        if (td) { this.select(ui, r, c); await wm.pointAt(td, 0.45, 0.55, 320); await wm.click(); }
        rowStart = c;
      }
      this.select(ui, r, c);
      at = { r, c };
    };
    const rest: [number, number, Cell][] = [];
    for (const [r, c, cell] of values) {
      wm.check(e);
      if (live <= 0) { rest.push([r, c, cell]); continue; }
      await goTo(r, c);
      await this.typeCell(ui, r, c, cell, cps);
      live--;
      if (o.changed) flash(this.td(ui, r, c), "rgba(255, 214, 102, 0.6)", 1.6);
    }
    if (rest.length) {
      // the rest arrives row by row, like a paste
      wm.robot.pressKey("Control"); wm.robot.pressKey("v");
      const byRow = new Map<number, [number, number, Cell][]>();
      for (const it of rest) { if (!byRow.has(it[0])) byRow.set(it[0], []); byRow.get(it[0])!.push(it); }
      for (const [r, list] of byRow) {
        wm.check(e);
        for (const [rr, c, cell] of list) this.commit(ui, rr, c, cell);
        this.select(ui, r, list[0][1], r, list[list.length - 1][1]);
        for (const [rr, c] of list) flash(this.td(ui, rr, c), "rgba(79, 124, 255, 0.28)", 0.8);
        await wm.sleep(60, e);
      }
    }
    // then the formulas: typed (or AutoSum), and patterns filled down with Ctrl+D
    let autosums = 2;
    for (const g of this.fillGroups(formulas)) {
      wm.check(e);
      const [r, c, cell] = g[0];
      const sum = /^=SUM\(([A-Z]{1,3}\d+):([A-Z]{1,3}\d+)\)$/i.exec(cell!.f!);
      if (sum && autosums-- > 0) {
        await goTo(r, c);
        await press(wm, ui.root.querySelector(".cs-sum"));
        const td = this.td(ui, r, c)!;
        td.classList.add("editing");
        td.textContent = cell!.f!;
        ui.fx.textContent = cell!.f!;
        this.refBoxes(ui, cell!.f!);
        await wm.sleep(520, e);
        wm.robot.pressKey("Enter");
        td.classList.remove("editing");
        ui.grid.querySelectorAll(".cs-ref").forEach((x) => x.remove());
        this.commit(ui, r, c, cell);
      } else {
        await goTo(r, c);
        await this.typeCell(ui, r, c, cell, cps);
      }
      if (g.length >= 2) {
        // select the column down to the last one, Ctrl+D
        const last = g[g.length - 1];
        const lt = this.td(ui, last[0], last[1]);
        if (lt) { await wm.pointAt(this.td(ui, r, c)!, 0.5, 0.5, 260); this.robot(); await wm.pointAt(lt, 0.5, 0.5, 420); }
        this.select(ui, r, c, last[0], c);
        wm.robot.pressKey("Control"); wm.robot.pressKey("d");
        await wm.sleep(160, e);
        for (const [rr, cc, cl] of g.slice(1)) { this.commit(ui, rr, cc, cl); await wm.sleep(35, e); }
        at = null;
      }
      this.select(ui, g[g.length - 1][0], c);
    }
    this.cells = doc.rows.map((r) => [...r]);
    for (const x of this.refresh(ui)) flash(x, "rgba(47, 179, 122, 0.4)", 1.2);
    // a sheet that was already open keeps its chart (redrawn with the new numbers)
    await this.chart(ui, doc, !!o.before);
    await save(wm, ui.status);
    await wm.sleep(400, e);
  }
  private robot() { this.wm.robot.click(); }

  // --- the chart -------------------------------------------------------------------------------
  /** Labels and up to two number series from the sheet (total rows left out), or null without numbers. */
  private series(doc: SheetDoc) {
    const rows = doc.rows;
    const header = rows[0] && rows[0].every((c) => !c || !isNum(c)) ? 0 : -1;
    const body = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => i > header && r.some(Boolean) && !/^(total|totals|sum|grand total|average|avg|mean)$/i.test((r.find((c) => c && !isNum(c))?.v || "").trim()));
    if (body.length < 2) return null;
    const cols = Math.max(0, ...rows.map((r) => r.length));
    const numCols: number[] = [];
    let labelCol = -1;
    for (let c = 0; c < cols; c++) {
      const vals = body.map(({ i }) => this.value(i, c));
      const n = vals.filter((v) => typeof v === "number").length;
      if (n >= Math.max(2, body.length * 0.7)) numCols.push(c);
      else if (labelCol < 0 && vals.filter((v) => typeof v === "string" && v).length >= body.length * 0.6) labelCol = c;
    }
    // a first column of 1, 2, 3 (week numbers) labels the rest
    if (labelCol < 0 && numCols.length >= 2 && body.every(({ i }, k) => this.value(i, numCols[0]) === Number(this.value(body[0].i, numCols[0])) + k)) labelCol = numCols.shift()!;
    // the file's own chart says what it plots
    if (doc.chartCols?.length) { numCols.splice(0, numCols.length, ...doc.chartCols.filter((c) => body.some(({ i }) => typeof this.value(i, c) === "number"))); if (doc.chartCat != null) labelCol = doc.chartCat; }
    if (!numCols.length) return null;
    const take = numCols.slice(0, doc.chart === "pie" ? 1 : 2);
    return {
      labels: body.slice(0, 12).map(({ i }, k) => (labelCol >= 0 ? String(this.value(i, labelCol) ?? "") : String(k + 1))),
      series: take.map((c) => ({ name: header === 0 ? rows[0][c]?.v || colName(c) : colName(c), values: body.slice(0, 12).map(({ i }) => Number(this.value(i, c)) || 0) })),
      range: { r0: Math.max(0, header), r1: body[Math.min(11, body.length - 1)].i, c0: Math.min(labelCol < 0 ? take[0] : labelCol, ...take), c1: Math.max(labelCol, ...take) },
    };
  }

  private async chart(ui: UI, doc: SheetDoc, instant: boolean) {
    ui.grid.querySelector(".cs-chart")?.remove();
    const s = this.series(doc);
    if (!s) return;
    const wm = this.wm;
    if (!instant) {
      // select the data, Insert, Chart
      const a = this.td(ui, s.range.r0, s.range.c0), b = this.td(ui, s.range.r1, s.range.c1);
      if (a && b) { await wm.pointAt(a, 0.3, 0.5, 340); wm.robot.click(); this.select(ui, s.range.r0, s.range.c0, s.range.r1, s.range.c1); await wm.pointAt(b, 0.7, 0.5, 520); this.select(ui, s.range.r0, s.range.c0, s.range.r1, s.range.c1); }
      await openTab(wm, ui.root, "Insert");
      await press(wm, ui.root.querySelector(".cs-chartbtn"));
      setTab(ui.root, "Home");
    }
    const kind = doc.chart === "line" || doc.chart === "area" || doc.chart === "scatter" ? "line" : doc.chart === "pie" || doc.chart === "doughnut" ? "pie" : "bar";
    const box = document.createElement("div");
    box.className = "cs-chart";
    const title = doc.chartTitle || (s.series.length === 1 ? s.series[0].name : `${s.series[0].name} and ${s.series[1].name}`);
    box.innerHTML = `<div class="cs-ct"></div>${this.svg(kind, s)}${s.series.length > 1 || kind === "pie" ? `<div class="cs-legend">${(kind === "pie" ? s.labels.slice(0, 6) : s.series.map((x) => x.name)).map((n, i) => `<span><i style="background:${PAL[i % PAL.length]}"></i>${esc(n)}</span>`).join("")}</div>` : ""}`;
    box.querySelector(".cs-ct")!.textContent = title;
    // to the right of the data when there is room, else over the lower right of the grid
    let lastCol = 0;
    doc.rows.forEach((r) => r.forEach((cell, c) => { if (cell && (cell.v !== "" || cell.f)) lastCol = Math.max(lastCol, c); }));
    const right = lastCol + 2 < COLS ? this.td(ui, 1, lastCol + 2) : null;
    const W = 250, H = 168;
    let left = right ? right.offsetLeft : 0;
    if (!right || left + W > ui.table.offsetWidth) left = Math.max(40, ui.grid.clientWidth - W - 16 + ui.grid.scrollLeft);
    const tdTop = this.td(ui, 1, 0)?.offsetTop ?? 20;
    box.style.cssText = `left:${left}px;top:${tdTop}px;width:${W}px;height:${H}px`;
    ui.grid.appendChild(box);
    if (left + W > ui.grid.scrollLeft + ui.grid.clientWidth) ui.grid.scrollLeft = left + W - ui.grid.clientWidth + 12;
    if (instant || reduced()) return;
    gsap.fromTo(box, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.6)", transformOrigin: "50% 50%" });
    const bars = box.querySelectorAll(".bar"), lines = box.querySelectorAll(".line"), slices = box.querySelectorAll(".slice");
    if (bars.length) gsap.from(bars, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.5, stagger: 0.03, ease: "power2.out", delay: 0.15 });
    if (lines.length) gsap.from(lines, { strokeDashoffset: 600, strokeDasharray: 600, duration: 0.8, ease: "power2.out", delay: 0.15 });
    if (slices.length) gsap.from(slices, { opacity: 0, duration: 0.25, stagger: 0.05, delay: 0.15 });
    await wm.sleep(900);
  }

  private svg(kind: "bar" | "line" | "pie", s: NonNullable<ReturnType<Cellsheet["series"]>>) {
    const W = 236, H = 118, L = 26, B = 16, T = 4;
    const vals = s.series.flatMap((x) => x.values);
    if (kind === "pie") {
      const v = s.series[0].values.map((x) => Math.max(0, x)), tot = v.reduce((a, b) => a + b, 0) || 1;
      let a0 = -Math.PI / 2;
      const cx = W / 2, cy = H / 2 + 2, R = 50;
      return `<svg viewBox="0 0 ${W} ${H}" class="cs-svg">${v.map((x, i) => {
        const a1 = a0 + (x / tot) * Math.PI * 2;
        const p = `M${cx},${cy} L${(cx + R * Math.cos(a0)).toFixed(1)},${(cy + R * Math.sin(a0)).toFixed(1)} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${(cx + R * Math.cos(a1)).toFixed(1)},${(cy + R * Math.sin(a1)).toFixed(1)} Z`;
        a0 = a1;
        return `<path class="slice" d="${p}" fill="${PAL[i % PAL.length]}"/>`;
      }).join("")}</svg>`;
    }
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const span = max - min || 1;
    const y = (v: number) => T + (H - T - B) * (1 - (v - min) / span);
    const n = s.labels.length, slot = (W - L - 4) / n;
    const ticks = [min, min + span / 2, max];
    let g = ticks.map((t) => `<line x1="${L}" x2="${W - 2}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/><text x="${L - 3}" y="${(y(t) + 2.5).toFixed(1)}" class="ax" text-anchor="end">${esc(compact(t))}</text>`).join("");
    g += s.labels.map((lab, i) => `<text x="${(L + slot * (i + 0.5)).toFixed(1)}" y="${H - 4}" class="ax" text-anchor="middle">${esc(lab.length > 7 ? lab.slice(0, 6) + "…" : lab)}</text>`).join("");
    if (kind === "line") {
      g += s.series.map((ser, k) => `<polyline class="line" fill="none" stroke="${PAL[k]}" stroke-width="2" points="${ser.values.map((v, i) => `${(L + slot * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    } else {
      const bw = Math.max(3, (slot * 0.72) / s.series.length);
      g += s.series.map((ser, k) => ser.values.map((v, i) => {
        const x = L + slot * i + slot * 0.14 + k * bw, y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        return `<rect class="bar" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}" rx="1" fill="${PAL[k]}"/>`;
      }).join("")).join("");
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="cs-svg">${g}</svg>`;
  }

  /** The file could not be read: the sheet opens and saves without inventing numbers. */
  async saving(name: string, o: { instant?: boolean } = {}) {
    const ui = await this.ensure(name);
    this.cells = [];
    this.build(ui, { kind: "sheet", name, sheets: [name.replace(/\.[^.]+$/, "")], active: 0, rows: [], cols: 0, totalRows: 0 }, MIN_ROWS);
    this.select(ui, 0, 0);
    ui.stats.textContent = "Preview not available for this file";
    await save(this.wm, ui.status, o.instant);
    await this.wm.sleep(o.instant ? 300 : 700);
  }
}

const PAL = ["#5a6cf0", "#ff9f5a", "#2fb37a", "#e0457b", "#8a5cf6", "#35c3ae"];
function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return showNumber(Math.round(n * 10) / 10);
}
