// What the Explorer knows about the folders a robot walks through, and nothing more.
// Every folder and file in the model comes from a real tool result: a listing, a search hit,
// a matched path or a file the agent attached. A folder the agent never listed stays unlisted,
// so the Explorer shows the items seen so far instead of inventing the rest of its contents.

export type ExplorerItem = { name: string; path: string; dir: boolean; size?: string; bytes?: number; modified?: number };

/** Both slash styles, no trailing slash, drive letters in capitals. */
export function normPath(p: string) {
  let s = String(p || "").replace(/\\/g, "/").replace(/\/{2,}/g, (m, i) => (i === 0 ? m : "/"));
  s = s.replace(/^([a-z]):/, (_m, d: string) => d.toUpperCase() + ":");
  if (s.length > 1 && !/^[A-Za-z]:\/?$/.test(s)) s = s.replace(/\/+$/, "");
  if (/^[A-Za-z]:$/.test(s)) s += "/";
  return s;
}

const winLike = (p: string) => /^[A-Za-z]:\//.test(p) || p.startsWith("//");
/** Windows paths ignore case; others do not. */
export const pathKey = (p: string) => { const n = normPath(p); return winLike(n) ? n.toLowerCase() : n; };

export function isAbsolutePath(p: string) {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");
}

export function joinPath(base: string, rel: string) {
  if (!base) return normPath(rel);
  return normPath(`${normPath(base).replace(/\/$/, "")}/${rel.replace(/\\/g, "/").replace(/^\.?\//, "")}`);
}

export function parentOf(p: string) {
  const n = normPath(p);
  if (/^[A-Za-z]:\/$/.test(n) || n === "/") return null;
  const i = n.lastIndexOf("/");
  if (i < 0) return null;
  if (i === 0) return "/";
  const head = n.slice(0, i);
  return /^[A-Za-z]:$/.test(head) ? head + "/" : head;
}

export function nameOf(p: string) {
  const n = normPath(p);
  if (/^[A-Za-z]:\/$/.test(n)) return n.slice(0, 2);
  if (n === "/") return "/";
  return n.slice(n.lastIndexOf("/") + 1) || n;
}

export function isInside(child: string, parent: string) {
  const c = pathKey(child), p = pathKey(parent).replace(/\/$/, "");
  return c === p || c.startsWith(p + "/");
}

/** Folder paths from the top of `p` down to `p` itself. */
export function ancestry(p: string) {
  const chain: string[] = [];
  for (let cur: string | null = normPath(p); cur; cur = parentOf(cur)) chain.unshift(cur);
  return chain;
}

export type Crumb = { label: string; path: string };

/** Address bar segments. Inside the project root they start at the root's name; elsewhere at the drive. */
export function crumbsFor(path: string, root: string | null): Crumb[] {
  const chain = ancestry(path);
  const base = root && isInside(path, root) ? chain.findIndex((c) => pathKey(c) === pathKey(root)) : 0;
  return chain.slice(Math.max(0, base)).map((p) => ({ label: nameOf(p), path: p }));
}

/** Long paths keep their first and last segments; the middle becomes one entry that lists what it hides. */
export function collapseCrumbs(crumbs: Crumb[], max = 4): { shown: Crumb[]; hidden: Crumb[] } {
  if (crumbs.length <= max) return { shown: crumbs, hidden: [] };
  const tail = Math.max(2, max - 1);
  return { shown: [crumbs[0], ...crumbs.slice(-tail)], hidden: crumbs.slice(1, crumbs.length - tail) };
}

export function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** 2026-11-02 22:47, the same everywhere in the Explorer. */
export function fmtDate(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type Problem = "missing" | "denied";

/** Why a listing came back empty, when the tool said so. Anything else is an honestly empty folder. */
export function listingProblem(output: string): Problem | null {
  const t = String(output || "");
  if (/access (?:to the path .+ )?is denied|permission denied|unauthorizedaccess|operation not permitted|EACCES|EPERM/i.test(t)) return "denied";
  if (/cannot find (?:path|the path)|no such file or directory|does not exist|not found|ENOENT|cannot access .+: no such|the system cannot find/i.test(t)) return "missing";
  return null;
}

const byKind = (a: ExplorerItem, b: ExplorerItem) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export class FolderModel {
  private kids = new Map<string, Map<string, ExplorerItem>>();
  private listed = new Set<string>();
  private problems = new Map<string, Problem>();

  clear() { this.kids.clear(); this.listed.clear(); this.problems.clear(); }

  private bucket(dir: string) {
    const k = pathKey(dir);
    let m = this.kids.get(k);
    if (!m) { m = new Map(); this.kids.set(k, m); }
    return m;
  }

  /** A path the agent touched: its folders appear in the tree, the item in its own folder. */
  see(path: string, dir: boolean, extra: Partial<ExplorerItem> = {}) {
    const n = normPath(path);
    const parent = parentOf(n);
    if (!parent) return;
    // every folder above is a folder, and appears under its own parent
    const chain = ancestry(parent);
    for (let i = 1; i < chain.length; i++) {
      const up = chain[i - 1], me = chain[i];
      const b = this.bucket(up);
      if (!b.has(pathKey(me))) b.set(pathKey(me), { name: nameOf(me), path: me, dir: true });
    }
    const b = this.bucket(parent);
    const prev = b.get(pathKey(n));
    b.set(pathKey(n), { ...prev, name: nameOf(n), path: n, dir, ...extra });
  }

  /** A real directory listing: complete, replacing what was merely seen. */
  list(dir: string, entries: { name: string; dir: boolean; size?: string; bytes?: number; modified?: number }[]) {
    const d = normPath(dir);
    this.see(d, true);
    const b = this.bucket(d);
    const seenBefore = new Map(b);
    b.clear();
    for (const e of entries) {
      const full = joinPath(d, e.name);
      const old = seenBefore.get(pathKey(full));
      b.set(pathKey(full), { ...old, name: e.name, path: full, dir: e.dir, size: e.size ?? old?.size, bytes: e.bytes ?? old?.bytes, modified: e.modified ?? old?.modified });
    }
    this.listed.add(pathKey(d));
    this.problems.delete(pathKey(d));
  }

  problem(dir: string, kind: Problem) {
    this.see(normPath(dir), true);
    this.problems.set(pathKey(dir), kind);
    this.kids.delete(pathKey(dir));
    this.listed.delete(pathKey(dir));
  }

  problemOf(dir: string) { return this.problems.get(pathKey(dir)) ?? null; }
  isListed(dir: string) { return this.listed.has(pathKey(dir)); }
  children(dir: string): ExplorerItem[] { return [...(this.kids.get(pathKey(dir))?.values() ?? [])].sort(byKind); }
  folders(dir: string) { return this.children(dir).filter((c) => c.dir); }
  find(path: string): ExplorerItem | null {
    const p = parentOf(path);
    return p ? this.kids.get(pathKey(p))?.get(pathKey(path)) ?? null : null;
  }
  update(path: string, extra: Partial<ExplorerItem>) {
    const it = this.find(path);
    if (it) Object.assign(it, extra);
  }
}

export type Step = { via: "up" | "down"; path: string };

/** The clicks from `from` to `to`: one jump up to the shared folder, then one step per folder down. */
export function route(from: string | null, to: string): Step[] {
  const target = normPath(to);
  if (!from) return [];
  const here = normPath(from);
  if (pathKey(here) === pathKey(target)) return [];
  const a = ancestry(here), b = ancestry(target);
  let shared = 0;
  while (shared < a.length && shared < b.length && pathKey(a[shared]) === pathKey(b[shared])) shared++;
  const steps: Step[] = [];
  if (shared < a.length && shared > 0) steps.push({ via: "up", path: b[shared - 1] ?? a[shared - 1] });
  for (let i = shared; i < b.length; i++) steps.push({ via: "down", path: b[i] });
  if (!shared) steps.splice(0, steps.length, ...b.map((path) => ({ via: "down" as const, path })));
  return steps;
}
