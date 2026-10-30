// Small syntax highlighter: good enough to make code read as code on the robot's screen.

const KW = new Set(
  ("abstract as async await break case catch class const continue def default del do elif else enum except export extends false " +
    "finally fn for from func function go if impl import in interface is lambda let match mod mut new nil none not null or pass " +
    "package private protected pub public raise return self static struct super switch this throw true try type typeof use var void " +
    "while with yield True False None").split(" "),
);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function langOf(path: string) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (["py", "sh", "bash", "ps1", "rb", "toml", "yaml", "yml", "r"].includes(ext)) return "hash";
  if (["md", "txt", "log", "csv"].includes(ext)) return "text";
  if (["json"].includes(ext)) return "json";
  if (["html", "xml", "svg", "vue"].includes(ext)) return "markup";
  if (["css", "scss"].includes(ext)) return "css";
  return "c";
}

export function highlight(line: string, lang: string): string {
  if (lang === "text") {
    if (/^\s*#{1,6}\s/.test(line)) return `<span class="t-h">${esc(line)}</span>`;
    return esc(line).replace(/`([^`]+)`/g, '<span class="t-s">`$1`</span>');
  }
  const comment = lang === "hash" ? /#.*$/ : lang === "markup" ? /<!--.*$/ : /\/\/.*$|\/\*.*?(\*\/|$)/;
  let out = "";
  let i = 0;
  const re = new RegExp(
    [
      `(?<c>${comment.source})`,
      `(?<s>"(?:[^"\\\\]|\\\\.)*"?|'(?:[^'\\\\]|\\\\.)*'?|\`[^\`]*\`?)`,
      `(?<n>\\b\\d[\\d_.]*\\b)`,
      lang === "markup" ? `(?<tag></?[A-Za-z][\\w-]*)` : `(?<w>[A-Za-z_$][\\w$]*)(?<call>\\s*\\()?`,
      lang === "css" ? `(?<prop>[a-z-]+(?=\\s*:))` : `(?<x>$^)`,
    ].join("|"),
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[0] === "") { re.lastIndex++; continue; }
    out += esc(line.slice(i, m.index));
    const g = m.groups!;
    if (g.c) out += `<span class="t-c">${esc(g.c)}</span>`;
    else if (g.s) out += `<span class="t-s">${esc(g.s)}</span>`;
    else if (g.n) out += `<span class="t-n">${esc(g.n)}</span>`;
    else if (g.tag) out += `<span class="t-k">${esc(g.tag)}</span>`;
    else if (g.prop) out += `<span class="t-f">${esc(g.prop)}</span>`;
    else if (g.w) {
      const cls = KW.has(g.w) ? "t-k" : g.call ? "t-f" : /^[A-Z]/.test(g.w) ? "t-t" : "";
      out += cls ? `<span class="${cls}">${esc(g.w)}</span>` : esc(g.w);
      if (g.call) out += esc(g.call);
    } else out += esc(m[0]);
    i = m.index + m[0].length;
  }
  return out + esc(line.slice(i));
}
