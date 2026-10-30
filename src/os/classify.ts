// Turn a raw shell command (as Codex or Claude ran it) into something a human
// would do on a desktop: browse a folder, search, open a file, or use a terminal.

export type Entry = { name: string; dir: boolean; size?: string; path?: string };
export type Hit = { file: string; line?: number; text: string };

export type Action =
  | { kind: "list"; path: string; entries: Entry[] }
  | { kind: "search"; query: string; path: string; hits: Hit[] }
  | { kind: "read"; path: string; lines: string[]; start: number }
  | { kind: "terminal"; command: string };

// Strip shell wrappers like `"...powershell.exe" -Command "..."` or `bash -lc '...'`.
export function unwrap(input: string): string {
  let s = input.trim();
  const ps = s.match(/^"?[^"]*?(?:powershell|pwsh)(?:\.exe)?"?\s+(?:-NoLogo\s+|-NoProfile\s+|-NonInteractive\s+)*-Command\s+([\s\S]*)$/i);
  if (ps) s = ps[1].trim();
  const sh = s.match(/^(?:\/usr\/bin\/|\/bin\/)?(?:bash|zsh|sh)\s+-l?c\s+([\s\S]*)$/);
  if (sh) s = sh[1].trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  return s.replace(/\\"/g, '"').trim();
}

// Split respecting quotes.
export function tokens(cmd: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const firstSegment = (cmd: string) => cmd.split(/\s*(?:\|\||&&|;|\|)\s*/)[0].trim();

function argsWithoutFlags(t: string[], valueFlags: string[] = []) {
  const res: string[] = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (a.startsWith("-")) {
      if (valueFlags.includes(a.toLowerCase())) i++;
      continue;
    }
    res.push(a);
  }
  return res;
}

const lines = (s: string) => s.replace(/\r/g, "").split("\n");

function parseListing(out: string): Entry[] {
  const res: Entry[] = [];
  for (const raw of lines(out)) {
    const l = raw.trimEnd();
    if (!l.trim() || /^\s*(Directory:|Mode\s+LastWriteTime|----|total \d+)/i.test(l)) continue;
    // PowerShell Get-ChildItem table row
    let m = l.match(/^([dla-][a-z-]{4,5})\s+\S+\s+\S+(?:\s+[AP]M)?\s+(\d+)?\s*(.+)$/i);
    if (m) { res.push({ name: m[3].trim(), dir: m[1].startsWith("d"), size: m[2] ? fmtSize(+m[2]) : undefined }); continue; }
    // ls -l row
    m = l.match(/^([dl-])[rwxsStT-]{9}[.+@]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/);
    if (m) { if (m[3] !== "." && m[3] !== "..") res.push({ name: m[3], dir: m[1] === "d", size: fmtSize(+m[2]) }); continue; }
    const name = l.trim();
    const dir = /[\\/]$/.test(name);
    const base = name.replace(/[\\/]$/, "");
    const short = base.split(/[\\/]/).pop() || base;
    res.push({ name: short, dir: dir || (!/\.[a-z0-9]{1,6}$/i.test(short) && !short.startsWith(".")), path: base });
  }
  return res.slice(0, 400);
}

function parseHits(out: string): Hit[] {
  const res: Hit[] = [];
  let current = "";
  for (const raw of lines(out)) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    let m = l.match(/^((?:[A-Za-z]:)?[^:]+):(\d+):(.*)$/);
    if (m) { res.push({ file: m[1], line: +m[2], text: m[3] }); continue; }
    m = l.match(/^(\d+)[:-](.*)$/);
    if (m && current) { res.push({ file: current, line: +m[1], text: m[2] }); continue; }
    m = l.match(/^((?:[A-Za-z]:)?[^:]+\.[A-Za-z0-9]{1,8}):(.*)$/);
    if (m) { res.push({ file: m[1], text: m[2] }); continue; }
    current = l.trim();
  }
  return res.slice(0, 300);
}

export function fmtSize(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function classify(input: string, output: string, cwd: string): Action {
  const command = unwrap(input);
  const seg = firstSegment(command);
  const t = tokens(seg);
  const head = (t[0] || "").toLowerCase();
  const out = output || "";

  // File listings
  if (/^(ls|dir|get-childitem|gci|tree)$/.test(head) || (head === "rg" && t.includes("--files")) || head === "fd" || (head === "find" && !/-exec/.test(seg))) {
    const a = argsWithoutFlags(t, ["-path", "-literalpath", "-filter", "-include", "-exclude", "-depth", "-g", "--glob", "-name", "-type", "-maxdepth"]);
    const pathFlag = t.findIndex((x) => /^-(literal)?path$/i.test(x));
    const path = pathFlag > 0 ? t[pathFlag + 1] : a.find((x) => !x.includes("*")) || cwd;
    return { kind: "list", path, entries: parseListing(out) };
  }

  // Content search
  if (/^(rg|grep|egrep|select-string|sls|findstr|ag)$/.test(head) || (head === "git" && t[1] === "grep")) {
    const a = argsWithoutFlags(t, ["-g", "--glob", "-t", "--type", "-e", "-a", "-b", "-c", "-m", "--max-count", "-path", "-include", "-context"]);
    const pat = t.findIndex((x) => /^-pattern$/i.test(x));
    const query = pat > 0 ? t[pat + 1] : (head === "git" ? a[1] : a[0]) || "";
    const path = (head === "git" ? a[2] : a[1]) || cwd;
    return { kind: "search", query, path, hits: parseHits(out) };
  }

  // Reading a file
  if (/^(cat|type|get-content|gc|head|tail|nl|less|more|bat)$/.test(head) || (head === "sed" && t[1] === "-n")) {
    const a = argsWithoutFlags(t, ["-n", "-totalcount", "-tail", "-head", "-encoding", "-first", "-last"]);
    let start = 1;
    if (head === "sed") {
      const range = (t[2] || "").match(/^(\d+)(?:,(\d+))?p$/);
      if (range) start = +range[1];
      a.shift();
    }
    const path = a[a.length - 1] || "";
    let ls = lines(out);
    if (ls.length && ls[ls.length - 1] === "") ls.pop();
    // `nl -ba` or `cat -n` style prefixes
    if (ls.length && ls.slice(0, 5).every((l) => /^\s*\d+\t/.test(l) || !l)) {
      const first = ls[0].match(/^\s*(\d+)\t/);
      if (first) start = +first[1];
      ls = ls.map((l) => l.replace(/^\s*\d+\t/, ""));
    }
    if (path) return { kind: "read", path, lines: ls.slice(0, 1500), start };
  }

  return { kind: "terminal", command };
}

export type Hunk = { oldStart: number; newStart: number; lines: { kind: " " | "+" | "-"; text: string }[] };

export function parseDiff(diff: string): Hunk[] {
  // No hunk headers: the whole text is a new file's content.
  if (!/^@@ /m.test(diff || "")) {
    const body = lines(diff || "");
    if (body.length && body[body.length - 1] === "") body.pop();
    return body.length ? [{ oldStart: 0, newStart: 1, lines: body.map((text) => ({ kind: "+" as const, text })) }] : [];
  }
  const hunks: Hunk[] = [];
  let h: Hunk | null = null;
  for (const l of lines(diff || "")) {
    const m = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (m) { h = { oldStart: +m[1], newStart: +m[2], lines: [] }; hunks.push(h); continue; }
    if (/^(---|\+\+\+|diff --git|index )/.test(l)) continue;
    if (!h) { h = { oldStart: 1, newStart: 1, lines: [] }; hunks.push(h); }
    const k = l[0];
    if (k === "+" || k === "-" || k === " ") h.lines.push({ kind: k, text: l.slice(1) });
    else if (l === "\\ No newline at end of file") continue;
    else if (l === "") h.lines.push({ kind: " ", text: "" });
  }
  return hunks.filter((x) => x.lines.length);
}

export function baseName(p: string) {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
}

export function relPath(p: string, root: string | null) {
  if (!root) return p;
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const np = norm(p), nr = norm(root).replace(/\/$/, "");
  if (np.startsWith(nr + "/")) return p.slice(nr.length + 1).replace(/\\/g, "/");
  return p.replace(/\\/g, "/");
}
