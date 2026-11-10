// Git, drawn in the app's own simple style, for robots that prefer an app to the terminal: the
// changed files with a diff, the commit box, push, pull and fetch with real progress (each waits
// for the real command), a branch menu and a merge dialog. Remotes are named as git names them.
import gsap from "gsap";
import type { WM } from "./wm";
import { esc, el, typeInto } from "./typing";
import { parseDiff, baseName } from "./classify";
import { IC } from "./sites";
import "./web.css";

export type DeskFile = { path: string; status: "new" | "modified" | "deleted"; diff?: string; adds?: number; dels?: number };
export type Done = { ok: boolean; output: string };

const STATUS_ICON: Record<DeskFile["status"], string> = { new: "+", modified: "", deleted: "-" };

export class GitDeskApp {
  private ahead = 0;
  private branch = "";
  private repo = "";
  constructor(private wm: WM) {}

  private async ensure(repo: string, branch: string) {
    const w = await this.wm.open("gitdesk", "Git");
    if (!w.body.querySelector(".gd")) {
      w.body.innerHTML = `
        <div class="gd">
          <div class="gd-bar">
            <div class="gd-seg gd-repo">${IC.book}<span><small>Repository</small><b class="v"></b></span>${IC.caret}</div>
            <div class="gd-seg gd-branch">${IC.branch}<span><small>Branch</small><b class="v"></b></span>${IC.caret}</div>
            <div class="gd-seg gd-sync"><span class="gd-sico"></span><span><small class="k"></small><b class="v"></b></span><i class="gd-prog"></i></div>
          </div>
          <div class="gd-main">
            <div class="gd-side">
              <div class="gd-tabs"><span class="on" data-tab="changes">Changes<i class="n"></i></span><span data-tab="history">History</span></div>
              <div class="gd-list"></div>
              <div class="gd-commit">
                <div class="gd-in gd-sum" data-ph="Commit message"></div>
                <div class="gd-in gd-desc" data-ph="Details"></div>
                <div class="gd-go">Commit to <b></b></div>
                <div class="gd-last"></div>
              </div>
            </div>
            <div class="gd-diff"><div class="gd-dh"></div><div class="gd-db"></div></div>
          </div>
        </div>`;
      this.ahead = 0;
    }
    this.repo = repo || this.repo || "repository";
    this.branch = branch || this.branch || "main";
    const gd = w.body.querySelector(".gd") as HTMLElement;
    (gd.querySelector(".gd-repo .v") as HTMLElement).textContent = this.repo;
    (gd.querySelector(".gd-branch .v") as HTMLElement).textContent = this.branch;
    (gd.querySelector(".gd-go b") as HTMLElement).textContent = this.branch;
    if (!gd.dataset.sync) this.sync(gd, "fetch");
    return gd;
  }

  /** The sync button: fetch, push with commits waiting, pull, or push a new branch. */
  private sync(gd: HTMLElement, mode: "fetch" | "push" | "pull" | "publish" | "busy", label?: string) {
    gd.dataset.sync = mode;
    const seg = gd.querySelector(".gd-sync") as HTMLElement;
    seg.classList.toggle("busy", mode === "busy");
    const k = seg.querySelector(".k") as HTMLElement, v = seg.querySelector(".v") as HTMLElement, ico = seg.querySelector(".gd-sico") as HTMLElement;
    const up = `<svg class="gi" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M4 7l4-4 4 4"/></svg>`;
    const down = `<svg class="gi" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M4 9l4 4 4-4"/></svg>`;
    const spin = `<svg class="gi" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M12 1.8v2.6H9.4"/></svg>`;
    if (mode === "push") { ico.innerHTML = up; k.textContent = "Push"; v.innerHTML = `${this.ahead ? `<i class="gd-badge">${this.ahead}</i>` : ""}to origin`; }
    else if (mode === "pull") { ico.innerHTML = down; k.textContent = "Pull"; v.textContent = label || "from origin"; }
    else if (mode === "publish") { ico.innerHTML = up; k.textContent = "Push branch"; v.textContent = "New on origin"; }
    else if (mode === "busy") { ico.innerHTML = spin; k.textContent = label || "Pushing"; v.textContent = "Waiting for origin"; }
    else { ico.innerHTML = spin; k.textContent = "Fetch"; v.textContent = label || "from origin"; }
  }

  private fileRow(f: DeskFile) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
    return `<div class="gd-row" data-path="${esc(f.path)}" title="${esc(f.path)}"><span class="gd-cb on"></span><span class="gd-p"><em>${esc(dir)}</em>${esc(baseName(f.path))}</span><span class="gd-st ${f.status}">${STATUS_ICON[f.status]}</span></div>`;
  }

  private showDiff(gd: HTMLElement, f: DeskFile | null) {
    const head = gd.querySelector(".gd-dh") as HTMLElement, body = gd.querySelector(".gd-db") as HTMLElement;
    gd.querySelectorAll(".gd-row").forEach((r) => r.classList.toggle("sel", !!f && (r as HTMLElement).dataset.path === f.path));
    if (!f) { head.textContent = ""; body.innerHTML = ""; return; }
    head.innerHTML = `<span>${esc(f.path)}</span>`;
    const hunks = f.diff ? parseDiff(f.diff) : [];
    if (!hunks.length) {
      body.innerHTML = `<div class="gd-nodiff">${f.status === "deleted" ? "This file was deleted." : f.adds != null ? `${f.adds} added, ${f.dels ?? 0} removed lines` : "The diff for this file is not shown here."}</div>`;
      return;
    }
    const rows: string[] = [];
    let n = 0;
    for (const h of hunks) {
      let o = h.oldStart, nn = h.newStart;
      rows.push(`<div class="gd-dl hunk"><b></b><b></b><span>@@ -${h.oldStart} +${h.newStart} @@</span></div>`);
      for (const l of h.lines) {
        if (++n > 140) break;
        if (l.kind === " ") rows.push(`<div class="gd-dl"><b>${o++}</b><b>${nn++}</b><span>${esc(l.text) || " "}</span></div>`);
        else if (l.kind === "-") rows.push(`<div class="gd-dl del"><b>${o++}</b><b></b><span>${esc(l.text) || " "}</span></div>`);
        else rows.push(`<div class="gd-dl add"><b></b><b>${nn++}</b><span>${esc(l.text) || " "}</span></div>`);
      }
    }
    body.innerHTML = rows.join("");
    body.scrollTop = 0;
  }

  private emptyState(gd: HTMLElement, extra = "") {
    (gd.querySelector(".gd-list") as HTMLElement).innerHTML = "";
    (gd.querySelector(".gd-tabs .n") as HTMLElement).textContent = "";
    (gd.querySelector(".gd-dh") as HTMLElement).textContent = "";
    (gd.querySelector(".gd-db") as HTMLElement).innerHTML = `<div class="gd-empty"><b>Working tree clean</b><p>Nothing to commit.</p>${extra}</div>`;
  }

  /** Review the changed files, write the summary and commit. */
  async commit(o: { repo: string; branch: string; files: DeskFile[]; message: string; instant?: boolean; done?: Promise<Done> }) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const gd = await this.ensure(o.repo, o.branch);
    const files = o.files.slice(0, 40);
    const list = gd.querySelector(".gd-list") as HTMLElement;
    list.innerHTML = `<div class="gd-all"><span class="gd-cb on"></span>${files.length} changed file${files.length === 1 ? "" : "s"}</div>` + files.map((f) => this.fileRow(f)).join("");
    (gd.querySelector(".gd-tabs .n") as HTMLElement).textContent = files.length ? String(files.length) : "";
    const go = gd.querySelector(".gd-go") as HTMLElement;
    go.innerHTML = `Commit ${files.length > 1 ? `${files.length} files ` : ""}to <b>${esc(this.branch)}</b>`;
    const [summary, ...rest] = (o.message || "Update files").split("\n");
    const desc = rest.join("\n").replace(/\n*Co-Authored-By:.*$/gim, "").trim();
    const sum = gd.querySelector(".gd-sum") as HTMLElement, dsc = gd.querySelector(".gd-desc") as HTMLElement;
    if (instant) {
      this.showDiff(gd, files.find((f) => f.diff) || files[0] || null);
      sum.textContent = summary;
    } else {
      gsap.fromTo(list.children, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.03 });
      // look over a file or two before committing
      const look = [...files.filter((f) => f.diff), ...files.filter((f) => !f.diff)].slice(0, files.length > 2 ? 2 : 1);
      for (const f of look) {
        const row = list.querySelector(`.gd-row[data-path="${CSS.escape(f.path)}"]`) as HTMLElement;
        await wm.pointAt(row, 0.4, 0.5, 320); await wm.click();
        this.showDiff(gd, f);
        wm.robot.setPose("read");
        const db = gd.querySelector(".gd-db") as HTMLElement;
        gsap.to(db, { scrollTop: Math.min(db.scrollHeight - db.clientHeight, 220), duration: 1.4 / wm.speed, ease: "power1.inOut", delay: 0.3 / wm.speed });
        await wm.sleep(1500, e);
      }
      await wm.pointAt(sum, 0.3, 0.5, 320); await wm.click();
      sum.classList.add("editing");
      await typeInto(wm, sum, summary.slice(0, 120), { budgetMs: 1400 });
      sum.classList.remove("editing");
      if (desc) {
        await wm.pointAt(dsc, 0.3, 0.3, 280); await wm.click();
        dsc.classList.add("editing");
        await typeInto(wm, dsc, desc.slice(0, 160), { budgetMs: 1000 });
        dsc.classList.remove("editing");
      }
      await wm.pointAt(go, 0.5, 0.5, 320); await wm.click();
      go.classList.add("pressed");
      await wm.sleep(350, e);
      go.classList.remove("pressed");
    }
    // a commit on its own waits for the real result (a failed commit keeps its files)
    if (o.done) {
      const r = await o.done;
      wm.check(e);
      if (!r.ok) { await this.error(gd, r.output, instant); return; }
    }
    if (!instant) {
      gsap.to(list.querySelectorAll(".gd-row, .gd-all"), { opacity: 0, x: -10, duration: 0.25, stagger: 0.02 });
      await wm.sleep(300, e);
    }
    sum.textContent = ""; dsc.textContent = "";
    this.ahead++;
    (gd.querySelector(".gd-last") as HTMLElement).innerHTML = `<span>Committed</span><em>${esc(summary.slice(0, 60))}</em>`;
    this.emptyState(gd, `<div class="gd-sugg"><b>${this.ahead} commit${this.ahead === 1 ? "" : "s"} ahead of origin</b><p>Ready to push.</p><span class="gd-btn">Push</span></div>`);
    this.sync(gd, "push");
    await wm.sleep(instant ? 200 : 600, e);
  }

  /** Push: the button waits for the real push, then shows what happened. */
  async push(o: { repo: string; branch: string; publish?: boolean; done: Promise<Done>; instant?: boolean; prUrl?: (out: string) => string | null }) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const gd = await this.ensure(o.repo, o.branch);
    if (o.publish && !this.ahead) this.sync(gd, "publish");
    else if (gd.dataset.sync !== "push") this.sync(gd, "push");
    const seg = gd.querySelector(".gd-sync") as HTMLElement;
    if (!instant) { await wm.pointAt(seg, 0.4, 0.5, 340); await wm.click(); }
    this.sync(gd, "busy", o.publish ? "Pushing branch" : "Pushing");
    const r = await o.done;
    wm.check(e);
    if (!r.ok) { this.sync(gd, "push"); await this.error(gd, r.output, instant); return; }
    this.ahead = 0;
    this.sync(gd, "fetch");
    const pr = o.prUrl?.(r.output);
    const pushed = (r.output.match(/^\s+\S+\.\.\S+\s+(\S+ -> \S+)/m) || r.output.match(/\[new branch\]\s+(\S+ -> \S+)/m))?.[1];
    this.emptyState(gd, pr ? `<div class="gd-sugg"><b>Pushed ${esc(this.branch)}</b><p>The remote offers a pull request for this branch.</p><span class="gd-btn gd-go-btn">Open pull request</span></div>` : pushed ? `<p class="gd-note">Pushed ${esc(pushed)}</p>` : "");
    (gd.querySelector(".gd-last") as HTMLElement).innerHTML = "";
    await wm.sleep(instant ? 200 : 900, e);
  }

  /** Fetch or pull, waiting for the real command. */
  async fetch(o: { repo: string; branch: string; pull: boolean; done: Promise<Done>; instant?: boolean }) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const gd = await this.ensure(o.repo, o.branch);
    if (o.pull) this.sync(gd, "pull");
    const seg = gd.querySelector(".gd-sync") as HTMLElement;
    if (!instant) { await wm.pointAt(seg, 0.4, 0.5, 340); await wm.click(); }
    this.sync(gd, "busy", o.pull ? "Pulling" : "Fetching");
    const r = await o.done;
    wm.check(e);
    if (!r.ok) { this.sync(gd, "fetch"); await this.error(gd, r.output, instant); return; }
    this.sync(gd, "fetch");
    const files = (r.output.match(/(\d+) files? changed/) || [])[1];
    this.emptyState(gd, o.pull ? `<p class="gd-note">${/Already up to date/i.test(r.output) ? "Already up to date with origin." : files ? `Pulled ${files} changed file${files === "1" ? "" : "s"} from origin.` : "Pulled from origin."}</p>` : "");
    await wm.sleep(instant ? 200 : 800, e);
  }

  /** The branch dropdown: switch to a branch, or type a new name and create it. */
  async branchTo(o: { repo: string; branch: string; to: string; create: boolean; known?: string[]; instant?: boolean }) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const gd = await this.ensure(o.repo, o.branch);
    const seg = gd.querySelector(".gd-branch") as HTMLElement;
    if (!instant) {
      await wm.pointAt(seg, 0.4, 0.5, 340); await wm.click();
      const names = [...new Set([this.branch, ...(o.known || [])])].filter((b) => b && b !== o.to).slice(0, 5);
      const drop = el(`<div class="gd-drop"><div class="gd-in gd-filter" data-ph="Filter"></div><div class="gd-dsec">Recent branches</div>${names.map((b) => `<div class="gd-ditem${b === this.branch ? " cur" : ""}">${IC.branch}${esc(b)}</div>`).join("")}${o.create ? "" : `<div class="gd-ditem tgt">${IC.branch}${esc(o.to)}</div>`}<div class="gd-dnew">New branch</div></div>`);
      gd.appendChild(drop);
      gsap.fromTo(drop, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2 });
      if (o.create) {
        const f = drop.querySelector(".gd-filter") as HTMLElement;
        await typeInto(wm, f, o.to, { budgetMs: 900 });
        drop.querySelectorAll(".gd-ditem, .gd-dsec").forEach((x) => x.remove());
        const nb = drop.querySelector(".gd-dnew") as HTMLElement;
        nb.innerHTML = `Create new branch <b>${esc(o.to)}</b>`;
        nb.classList.add("hot");
        await wm.pointAt(nb, 0.4, 0.5, 300); await wm.click();
      } else {
        const tgt = drop.querySelector(".gd-ditem.tgt") as HTMLElement;
        await wm.pointAt(tgt, 0.4, 0.5, 300); await wm.click();
      }
      await wm.sleep(200, e);
      gsap.to(drop, { opacity: 0, duration: 0.15, onComplete: () => drop.remove() });
    }
    this.branch = o.to;
    (gd.querySelector(".gd-branch .v") as HTMLElement).textContent = o.to;
    (gd.querySelector(".gd-go b") as HTMLElement).textContent = o.to;
    if (o.create) this.sync(gd, "publish");
    await wm.sleep(instant ? 150 : 500, e);
  }

  /** Merge: pick the other branch and merge it into the current one. */
  async merge(o: { repo: string; branch: string; from: string; done: Promise<Done>; instant?: boolean }) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const gd = await this.ensure(o.repo, o.branch);
    const dlg = el(`<div class="gd-modal"><div class="gd-dlg"><h4>Merge into <b>${esc(this.branch)}</b></h4><div class="gd-in gd-filter" data-ph="Filter"></div><div class="gd-dsec">Other branches</div><div class="gd-ditem tgt">${IC.branch}${esc(o.from)}</div><p class="gd-mnote"></p><div class="gd-mbtn">Merge</div></div></div>`);
    gd.appendChild(dlg);
    if (!instant) {
      gsap.fromTo(dlg.firstElementChild, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.25 });
      const tgt = dlg.querySelector(".tgt") as HTMLElement;
      await wm.pointAt(tgt, 0.4, 0.5, 340); await wm.click();
      tgt.classList.add("sel");
      (dlg.querySelector(".gd-mnote") as HTMLElement).innerHTML = `Merging <b>${esc(o.from)}</b> into <b>${esc(this.branch)}</b>`;
      const btn = dlg.querySelector(".gd-mbtn") as HTMLElement;
      btn.innerHTML = `Merge <b>${esc(o.from)}</b> into <b>${esc(this.branch)}</b>`;
      await wm.pointAt(btn, 0.5, 0.5, 320); await wm.click();
      btn.classList.add("pressed");
    }
    const r = await o.done;
    wm.check(e);
    dlg.remove();
    if (!r.ok) { await this.error(gd, r.output, instant); return; }
    this.ahead++;
    this.sync(gd, "push");
    this.emptyState(gd, `<p class="gd-note">Merged <b>${esc(o.from)}</b> into <b>${esc(this.branch)}</b></p>`);
    await wm.sleep(instant ? 200 : 1000, e);
  }

  /** History tab: recent commits (from the command's own log output). */
  async history(o: { repo: string; branch: string; commits: { hash: string; subject: string }[]; instant?: boolean }) {
    const wm = this.wm, e = wm.epoch;
    const gd = await this.ensure(o.repo, o.branch);
    const tab = gd.querySelector('[data-tab="history"]') as HTMLElement;
    if (!o.instant) { await wm.pointAt(tab, 0.5, 0.5, 300); await wm.click(); }
    gd.querySelectorAll(".gd-tabs [data-tab]").forEach((x) => x.classList.toggle("on", x === tab));
    (gd.querySelector(".gd-list") as HTMLElement).innerHTML = o.commits.slice(0, 14).map((c) => `<div class="gd-row gd-hrow"><span class="gd-p">${esc(c.subject)}<em>${esc(c.hash)}</em></span></div>`).join("");
    wm.robot.setPose("read");
    await wm.sleep(o.instant ? 200 : 1600, e);
    gd.querySelectorAll(".gd-tabs [data-tab]").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.tab === "changes"));
  }

  private async error(gd: HTMLElement, output: string, instant: boolean) {
    const lines = output.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !/^hint:/i.test(l)).slice(0, 4);
    const dlg = el(`<div class="gd-modal"><div class="gd-dlg gd-err"><h4>Error</h4><p></p><div class="gd-mbtn">Close</div></div></div>`);
    (dlg.querySelector("p") as HTMLElement).textContent = lines.join("\n") || "The command failed.";
    gd.appendChild(dlg);
    this.wm.robot.react("surprised");
    await this.wm.sleep(instant ? 400 : 2200);
    if (!instant) { await this.wm.pointAt(dlg.querySelector(".gd-mbtn")!, 0.5, 0.5, 300); await this.wm.click(); }
    dlg.remove();
  }
}
