// Reads git and gh commands the agent ran (often chained: cd && git add && git commit && git push)
// into steps a person would do in a git app or on GitHub, and pulls facts out of their output.
import { unwrap, tokens } from "./classify";

export type GitStep =
  | { op: "add"; paths: string[]; all: boolean }
  | { op: "commit"; message: string; all: boolean; amend: boolean }
  | { op: "push"; remote: string; branch: string | null; upstream: boolean; force: boolean }
  | { op: "pull" | "fetch"; remote: string; branch: string | null }
  | { op: "merge"; branch: string }
  | { op: "checkout"; branch: string; create: boolean }
  | { op: "status" | "log" | "diff" | "other"; sub: string }
  | { op: "pr-create"; title: string | null; body: string | null; base: string | null; head: string | null; draft: boolean }
  | { op: "pr-merge"; number: number | null; method: "merge" | "squash" | "rebase" }
  | { op: "pr-view"; number: number | null };

export type GitPlan = { steps: GitStep[]; cwd: string | null; other: string[] };

/** Split a shell line on && ; || | and newlines, but never inside quotes. */
export function splitShell(cmd: string): string[] {
  const out: string[] = [];
  let cur = "", q: string | null = null, depth = 0;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i], n = cmd[i + 1];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"' && i + 1 < cmd.length) { cur += cmd[++i]; continue; }
      if (c === "`" && q === '"') continue;
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ((c === "&" && n === "&") || (c === "|" && n === "|"))) { out.push(cur); cur = ""; i++; continue; }
    if (depth === 0 && (c === ";" || c === "\n" || c === "|")) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// A commit message written as "$(cat <<'EOF' ... EOF)" (how Claude Code commits) or plain text.
function cleanMessage(m: string) {
  const here = m.match(/^\$\(cat <<-?'?"?(\w+)'?"?\s*\n([\s\S]*?)\n\s*\1\s*\)?\s*$/);
  if (here) m = here[2];
  return m.replace(/\\n/g, "\n").trim();
}

function flagValue(t: string[], names: string[]): string | null {
  for (let i = 0; i < t.length; i++) {
    for (const n of names) {
      if (t[i] === n) return t[i + 1] ?? null;
      if (t[i].startsWith(n + "=")) return t[i].slice(n.length + 1);
    }
  }
  return null;
}

function gitStep(t: string[]): GitStep | null {
  // drop global options: git -C path, git -c key=value, --no-pager
  let i = 1;
  while (i < t.length && t[i].startsWith("-")) { i += t[i] === "-C" || t[i] === "-c" ? 2 : 1; }
  const sub = (t[i] || "").toLowerCase();
  const rest = t.slice(i + 1);
  const pos = rest.filter((x) => !x.startsWith("-"));
  switch (sub) {
    case "add": return { op: "add", paths: pos.filter((p) => p !== "." && p !== "--"), all: rest.some((x) => /^(-A|--all|\.|-u)$/.test(x)) || pos.includes(".") };
    case "commit": {
      const msgs: string[] = [];
      let all = false, amend = false;
      for (let k = 0; k < rest.length; k++) {
        const a = rest[k];
        if (a === "--amend") amend = true;
        else if (a === "--all") all = true;
        else if (/^--message=/.test(a)) msgs.push(a.slice(10));
        else if (a === "--message") msgs.push(rest[++k] || "");
        else if (/^-[a-zA-Z]+$/.test(a)) {
          if (a.includes("a")) all = true;
          if (a.endsWith("m")) msgs.push(rest[++k] || "");
          else if (a.includes("m")) msgs.push(a.slice(a.indexOf("m") + 1));
        }
      }
      return { op: "commit", message: msgs.map(cleanMessage).filter(Boolean).join("\n\n"), all, amend };
    }
    case "push": {
      const [remote = "origin", ref = null] = pos;
      return { op: "push", remote, branch: ref, upstream: rest.some((x) => x === "-u" || x === "--set-upstream"), force: rest.some((x) => /^(-f|--force|--force-with-lease.*)$/.test(x)) };
    }
    case "pull": case "fetch": return { op: sub, remote: pos[0] || "origin", branch: pos[1] || null };
    case "merge": return pos[0] && !rest.includes("--abort") ? { op: "merge", branch: pos[0] } : { op: "other", sub };
    case "checkout": case "switch": {
      const create = flagValue(rest, ["-b", "-B", "-c", "-C", "--create"]);
      if (create) return { op: "checkout", branch: create, create: true };
      if (pos.length === 1 && !rest.includes("--") && !/\.[a-z0-9]{1,5}$/i.test(pos[0])) return { op: "checkout", branch: pos[0], create: false };
      return { op: "other", sub };
    }
    case "status": case "log": case "diff": return { op: sub, sub };
    default: return { op: "other", sub };
  }
}

function ghStep(t: string[]): GitStep | null {
  if (t[1] !== "pr") return null;
  const verb = t[2];
  const rest = t.slice(3);
  const num = rest.find((x) => /^#?\d+$/.test(x) || /\/pull\/\d+/.test(x));
  const number = num ? Number(num.replace(/^.*\/pull\//, "").replace(/^#/, "")) : null;
  if (verb === "create" || verb === "new") {
    return { op: "pr-create", title: flagValue(rest, ["--title", "-t"]), body: flagValue(rest, ["--body", "-b"]) && cleanMessage(flagValue(rest, ["--body", "-b"])!), base: flagValue(rest, ["--base", "-B"]), head: flagValue(rest, ["--head", "-H"]), draft: rest.includes("--draft") || rest.includes("-d") };
  }
  if (verb === "merge") return { op: "pr-merge", number, method: rest.includes("--squash") || rest.includes("-s") ? "squash" : rest.includes("--rebase") || rest.includes("-r") ? "rebase" : "merge" };
  if (verb === "view" || verb === "checks" || verb === "status") return { op: "pr-view", number };
  return null;
}

/** The git/gh steps in a command, or null when it has none. `other` lists non-git parts. */
export function gitPlan(input: string): GitPlan | null {
  const command = unwrap(input);
  if (!/(^|[\s;&|(])(git|gh)(\.exe)?\s/.test(command)) return null;
  const steps: GitStep[] = [];
  const other: string[] = [];
  let cwd: string | null = null;
  for (const seg of splitShell(command)) {
    const t = tokens(seg);
    const head = (t[0] || "").toLowerCase().replace(/\.exe$/, "");
    if (head === "cd" || head === "set-location" || head === "pushd") { cwd = t[1] || cwd; continue; }
    if (head === "git") { const s = gitStep(t); if (s) steps.push(s); continue; }
    if (head === "gh") { const s = ghStep(t); if (s) steps.push(s); else other.push(seg); continue; }
    // quiet helpers around git do not make the command something else
    if (/^(echo|printf|head|tail|true|sleep|write-output|write-host|out-null|select-object|sort|grep|wc|cat)$/.test(head)) continue;
    other.push(seg);
  }
  return steps.length ? { steps, cwd, other } : null;
}

/** Steps that look like real git work in an app (not just looking around). */
export const isGitWork = (s: GitStep) => ["commit", "push", "pull", "fetch", "merge", "checkout", "pr-create", "pr-merge"].includes(s.op);

export type GitFacts = {
  commit: { branch: string; hash: string; subject: string } | null;
  pushedTo: string | null;        // remote URL from "To https://github.com/..."
  pushRef: string | null;         // "office -> main"
  prUrl: string | null;           // a pull request link: /pull/123 or /pull/new/branch
  prNumber: number | null;        // from a /pull/123 link or gh's "Merged pull request #123"
  repo: string | null;            // owner/name from any GitHub URL in the output
  stat: { path: string; adds: number; dels: number }[];
  upToDate: boolean;
  merged: boolean;
};

export function gitFacts(output: string): GitFacts {
  const out = (output || "").replace(/\r/g, "");
  const c = out.match(/^\[([^\s\]]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m);
  const to = out.match(/^To (\S+)/m);
  const ref = out.match(/^\s+[+*=!-]?\s*(?:[0-9a-f]{7,}\.{2,3}[0-9a-f]{7,}|\[new branch\]|\[up to date\])\s+(\S+ -> \S+)/m);
  const pr = out.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(?:new\/[^\s'"]+|\d+)/);
  const repo = (pr?.[0] || to?.[1] || out.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/)?.[0] || "").match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/);
  const stat: GitFacts["stat"] = [];
  for (const m of out.matchAll(/^ (\S.*?)\s+\|\s+(\d+) ?(\+*)(-*)$/gm)) {
    // the bar is scaled, the number is the real count of changed lines
    const total = Number(m[2]), p = m[3].length, d = m[4].length;
    const adds = p + d ? Math.round((total * p) / (p + d)) : 0;
    stat.push({ path: m[1].trim(), adds, dels: total - adds });
  }
  return {
    commit: c ? { branch: c[1], hash: c[2], subject: c[3] } : null,
    pushedTo: to ? to[1] : null,
    pushRef: ref ? ref[1] : null,
    prUrl: pr ? pr[0] : null,
    prNumber: Number(pr?.[0].match(/\/pull\/(\d+)/)?.[1] || out.match(/pull request #(\d+)/i)?.[1]) || null,
    repo: repo ? `${repo[1]}/${repo[2]}` : null,
    stat: stat.slice(0, 40),
    upToDate: /Everything up-to-date|Already up to date/i.test(out),
    merged: /Merged pull request|was already merged|Merge made by|Fast-forward/i.test(out),
  };
}

// Colours for git and gh output in the terminal (input is one escaped line of HTML).
export function colorGitLine(line: string): string {
  if (/^\[[^\]]+ [0-9a-f]{7,}\]/.test(line)) return `<span class="g-commit">${line}</span>`;
  if (/^(On branch|Your branch|HEAD detached)/.test(line)) return `<span class="g-dim">${line}</span>`;
  if (/^\s*(modified:|new file:|deleted:|renamed:)/.test(line)) return `<span class="g-mod">${line}</span>`;
  if (/^( ?M|M |A |D | D|R |\?\?) /.test(line)) return line.replace(/^(\s?\S{1,2})/, (m) => `<span class="${/D/.test(m) ? "g-del" : /\?/.test(m) ? "g-new" : "g-mod"}">${m}</span>`);
  if (/^remote:/.test(line)) return `<span class="g-dim">${line.replace(/(https:\/\/\S+)/g, '<u class="g-url">$1</u>')}</span>`;
  if (/^To /.test(line)) return `<span class="g-dim">To</span> <u class="g-url">${line.slice(3)}</u>`;
  if (/^\s+([0-9a-f]{7,}\.\.\.?[0-9a-f]{7,}|\* \[new branch\])/.test(line)) return line.replace(/(\S+ -&gt; \S+)/, '<span class="g-branch">$1</span>');
  if (/^\s\S.*\|\s+\d+ ?\+*-*$/.test(line)) return line.replace(/(\++)/, '<span class="g-add">$1</span>').replace(/(-+)$/, '<span class="g-del">$1</span>');
  if (/^[0-9a-f]{7,} /.test(line)) return line.replace(/^([0-9a-f]{7,})/, '<span class="g-hash">$1</span>');
  if (/^\+(?!\+\+)/.test(line)) return `<span class="g-add">${line}</span>`;
  if (/^-(?!--)/.test(line)) return `<span class="g-del">${line}</span>`;
  if (/^(Fast-forward|Merge made by|Switched to|Already up to date|Everything up-to-date)/.test(line)) return `<span class="g-ok">${line}</span>`;
  if (/^[✓!]/.test(line) || /https:\/\/github\.com\/\S+\/pull\/\d+/.test(line)) return line.replace(/(https:\/\/\S+)/g, '<u class="g-url">$1</u>');
  return line;
}
