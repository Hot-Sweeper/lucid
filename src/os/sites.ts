// Real pages for the robot's browser. GitHub, Hugging Face and Wikipedia get their own
// recognisable layouts filled with live public data (no tokens); every other site is read
// through `peek` into a plain article. Nothing on these pages is a real link: it is a picture
// of a page on a robot's monitor, so links are drawn as styled text.
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { esc } from "./typing";
import { parseDiff } from "./classify";

export type Result = { url: string; title: string; snippet?: string };
export type PageView = { title: string; html: string; site: "github" | "hf" | "wiki" | "web" | "search" | "raw" | "local" | "shot"; url: string; kind?: string };
export type PrFile = { path: string; adds: number; dels: number; status?: string; patch?: string };
export type PrData = {
  repo: string; number: number | null; title: string; state: "open" | "merged" | "closed" | "draft"; user: string;
  base: string; head: string; commits: number | null; body: string; files: PrFile[];
  checks: { name: string; ok: boolean | null }[]; comments: { user: string; body: string; when?: string }[];
  additions?: number; deletions?: number; created?: string;
};
/** `real`: show the page as a browser draws it (a page the robot is testing), `html`: HTML the robot wrote. */
type LoadOpts = { title?: string; text?: string; prState?: PrData["state"]; real?: boolean; html?: string };

// --- fetching ------------------------------------------------------------------
const lucid = () => (window as any).lucid;
async function sf<T = any>(url: string, as: "json" | "text" | "raw" | "image" = "json"): Promise<T | null> {
  try {
    const api = lucid();
    if (api?.siteFetch) { const r = await api.siteFetch(url, as); return r?.ok ? (r.data as T) : null; }
    const res = await fetch(url, { headers: { accept: as === "raw" ? "application/vnd.github.raw" : "application/json" } });
    if (!res.ok) return null;
    return (as === "json" ? await res.json() : await res.text()) as T;
  } catch { return null; }
}
export async function webSearch(query: string): Promise<Result[] | null> {
  try { const r = await lucid()?.webSearch?.(query); return r?.ok ? r.results : null; } catch { return null; }
}
const GH = "https://api.github.com";

// --- small helpers ---------------------------------------------------------------
export function hostOf(url: string) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
export function urlKey(url: string) {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase(); } catch { return url.trim().toLowerCase(); }
}
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
export function fmtNum(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}
export function ago(iso?: string | null) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const s = Math.max(1, (Date.now() - t) / 1000);
  const [n, u] = s < 3600 ? [Math.round(s / 60), "minute"] : s < 86400 ? [Math.round(s / 3600), "hour"] : s < 86400 * 30 ? [Math.round(s / 86400), "day"] : s < 86400 * 365 ? [Math.round(s / 86400 / 30), "month"] : [Math.round(s / 86400 / 365), "year"];
  return n <= 0 ? "just now" : `${n} ${u}${n === 1 ? "" : "s"} ago`;
}

// Favicons are coloured letters; the big three keep their own colours.
const FAV_COLORS = ["#4f7dff", "#ff7a59", "#2fb380", "#b15cff", "#ff5c8a", "#d99a1e", "#1aa3b8", "#6b7290"];
export function favHtml(url: string, kind?: "search") {
  if (kind === "search") return `<span class="fav fav-q" aria-hidden="true"><i></i></span>`;
  const h = hostOf(url);
  if (/github(usercontent)?\.com$/.test(h)) return `<span class="fav" style="background:#1f2328;color:#fff">G</span>`;
  if (/huggingface\.co$/.test(h)) return `<span class="fav" style="background:#ffd21e;color:#3a2a00">H</span>`;
  if (/wikipedia\.org$/.test(h)) return `<span class="fav fav-serif" style="background:#fff;color:#202122">W</span>`;
  if (!h || /^(127\.|localhost|0\.0\.0\.0)/.test(h)) return `<span class="fav" style="background:#2fb380;color:#fff">L</span>`;
  const parts = h.split(".").filter((p) => !/^(www|docs|en|m|developer|developers|api|blog|help|support|code|registry|raw)$/.test(p));
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0] || h;
  let x = 0;
  for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="fav" style="background:${FAV_COLORS[x % FAV_COLORS.length]};color:#fff">${esc((name[0] || "?").toUpperCase())}</span>`;
}

// Markdown (READMEs, model cards, PR bodies) to safe HTML: no images, no live links.
const marked = new Marked({ gfm: true, breaks: false });
function md(text: string, max = 7000) {
  // no YAML front matter, and no emoji pictographs on the robot's screen
  const src = String(text || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace(/\p{Extended_Pictographic}️?/gu, "").slice(0, max);
  const html = DOMPurify.sanitize(marked.parse(src, { async: false }) as string, { FORBID_TAGS: ["img", "picture", "video", "audio", "iframe", "svg", "source", "style", "form", "input", "button"], FORBID_ATTR: ["style", "id"] });
  const t = document.createElement("template");
  t.innerHTML = html;
  for (const a of Array.from(t.content.querySelectorAll("a"))) { const s = document.createElement("span"); s.className = "lnk"; s.innerHTML = a.innerHTML; a.replaceWith(s); }
  for (const p of Array.from(t.content.querySelectorAll("p, li, h1, h2, h3, h4"))) if (!p.textContent?.trim() && !p.querySelector("code")) p.remove();
  const div = document.createElement("div");
  div.appendChild(t.content);
  return div.innerHTML;
}

// --- icons (small, page-sized) --------------------------------------------------------
const S = (d: string, extra = "") => `<svg class="gi" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
export const GH_MARK = `<svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`;
export const IC = {
  folder: `<svg class="gi" viewBox="0 0 16 16" aria-hidden="true"><path fill="#54aeff" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>`,
  file: `<svg class="gi" viewBox="0 0 16 16" aria-hidden="true"><path fill="#8c959f" d="M3.5 1h6.2L13 4.3V15H3.5Z"/><path fill="#fff" d="M4.7 2.2h4.4v2.9H12v8.7H4.7Z"/></svg>`,
  pr: S(`<circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><path d="M4 5.2v5.6M12 10.8V6.5a2 2 0 0 0-2-2H7.6M9.2 2.9 7.6 4.5l1.6 1.6"/>`),
  merged: S(`<circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="8.5" r="1.7"/><path d="M4 5.2v5.6M4.6 5.2c.9 2 2.9 3.3 5.7 3.3"/>`),
  prClosed: S(`<circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><path d="M4 5.2v5.6M12 7.5v3.3M10.3 2.3l3.4 3.4M13.7 2.3l-3.4 3.4"/>`),
  issue: S(`<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="1" fill="currentColor"/>`),
  issueDone: S(`<circle cx="8" cy="8" r="6.2"/><path d="m5.4 8.2 1.8 1.8 3.5-3.6"/>`),
  check: S(`<path d="m3 8.5 3.2 3.2L13 4.8"/>`),
  x: S(`<path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"/>`),
  dot: `<svg class="gi" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.5" fill="currentColor"/></svg>`,
  star: S(`<path d="m8 1.6 1.9 4 4.4.6-3.2 3.1.8 4.4L8 11.6l-3.9 2.1.8-4.4L1.7 6.2l4.4-.6Z"/>`),
  fork: S(`<circle cx="4.5" cy="3" r="1.6"/><circle cx="11.5" cy="3" r="1.6"/><circle cx="8" cy="13" r="1.6"/><path d="M4.5 4.6v1.2c0 1 .8 1.8 1.8 1.8h3.4c1 0 1.8-.8 1.8-1.8V4.6M8 7.6v3.8"/>`),
  eye: S(`<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/>`),
  branch: S(`<circle cx="4.5" cy="3" r="1.6"/><circle cx="4.5" cy="13" r="1.6"/><circle cx="11.5" cy="5" r="1.6"/><path d="M4.5 4.6v6.8M11.5 6.6c0 2.6-2 3.4-7 4.4"/>`),
  book: S(`<path d="M3 2.5h8.5v11H4.2A1.2 1.2 0 0 1 3 12.3Zm0 9.8c0-.7.5-1.2 1.2-1.2h7.3"/>`),
  heart: S(`<path d="M8 13.5S2 9.8 2 5.8A3 3 0 0 1 8 4.3a3 3 0 0 1 6 1.5c0 4-6 7.7-6 7.7Z"/>`),
  down: S(`<path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M3 13.5h10"/>`),
  search: S(`<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>`),
  comment: S(`<path d="M2 3.5h12v7.5H7.5L4.5 13.5V11H2Z"/>`),
  caret: S(`<path d="m4.5 6 3.5 3.5L11.5 6"/>`),
};
const HF_MARK = `<svg class="hf-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="11" r="9" fill="#ffd21e"/><circle cx="8.7" cy="9.4" r="1.3" fill="#3a2a00"/><circle cx="15.3" cy="9.4" r="1.3" fill="#3a2a00"/><path d="M8 12.6c.9 2.3 2.4 3.3 4 3.3s3.1-1 4-3.3Z" fill="#3a2a00"/><ellipse cx="5.6" cy="16.6" rx="2.6" ry="2.1" fill="#ff9d0b"/><ellipse cx="18.4" cy="16.6" rx="2.6" ry="2.1" fill="#ff9d0b"/></svg>`;

const skel = (n = 6) => `<div class="pg-skel">${Array.from({ length: n }, (_, i) => `<i style="width:${[92, 70, 84, 60, 88, 48][i % 6]}%"></i>`).join("")}</div>`;
export const loadingHtml = () => skel();

// --- GitHub ---------------------------------------------------------------------
function ghTop(crumbs: string, extra = "") {
  return `<header class="gh-top">${GH_MARK}<span class="gh-crumb">${crumbs}</span>${extra}<span class="gh-sbox">${IC.search}<span>Type <kbd>/</kbd> to search</span></span></header>`;
}
function ghRepoHead(o: string, r: string, tab: "code" | "issues" | "pulls" | "actions", counts: { issues?: number; pulls?: number } = {}, pub = true) {
  const t = (k: string, label: string, icon: string, n?: number) => `<span class="${tab === k ? "on" : ""}">${icon}${label}${n ? `<i>${fmtNum(n)}</i>` : ""}</span>`;
  return ghTop(`${IC.book}<span class="lnk">${esc(o)}</span><em>/</em><b class="lnk">${esc(r)}</b>`, pub ? `<span class="gh-vis">Public</span>` : "") +
    `<nav class="gh-nav">${t("code", "Code", S('<path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>'))}${t("issues", "Issues", IC.issue, counts.issues)}${t("pulls", "Pull requests", IC.pr, counts.pulls)}${t("actions", "Actions", S('<circle cx="8" cy="8" r="6.2"/><path d="M6.6 5.6v4.8L10.4 8Z"/>'))}</nav>`;
}

async function ghRepo(o: string, r: string, sub: string[], url: string): Promise<PageView | null> {
  const isTree = sub[0] === "tree" && sub.length >= 2;
  const ref = isTree ? sub[1] : "";
  const dir = isTree ? sub.slice(2).join("/") : "";
  const [repo, contents, readme, commits] = await Promise.all([
    sf<any>(`${GH}/repos/${o}/${r}`),
    sf<any[]>(`${GH}/repos/${o}/${r}/contents/${dir}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`),
    dir ? Promise.resolve(null) : sf<string>(`${GH}/repos/${o}/${r}/readme`, "raw"),
    sf<any[]>(`${GH}/repos/${o}/${r}/commits?per_page=1${ref ? `&sha=${encodeURIComponent(ref)}` : ""}`),
  ]);
  if (!repo?.full_name) return null;
  const branch = ref || repo.default_branch || "main";
  const items = Array.isArray(contents) ? [...contents].sort((a, b) => Number(b.type === "dir") - Number(a.type === "dir") || a.name.localeCompare(b.name)) : [];
  const c = commits?.[0];
  const commitRow = c ? `<div class="gh-lastc"><span class="gh-av">${esc((c.author?.login || c.commit?.author?.name || "?")[0].toUpperCase())}</span><b>${esc(c.author?.login || c.commit?.author?.name || "")}</b><span class="gh-cmsg">${esc(String(c.commit?.message || "").split("\n")[0])}</span><span class="gh-muted">${esc(c.sha.slice(0, 7))} · ${esc(ago(c.commit?.committer?.date))}</span></div>` : "";
  const rows = items.slice(0, 16).map((x) => `<div class="gh-frow">${x.type === "dir" ? IC.folder : IC.file}<span class="lnk">${esc(x.name)}</span></div>`).join("");
  const more = items.length > 16 ? `<div class="gh-frow gh-muted">${items.length - 16} more</div>` : "";
  const topics = (repo.topics || []).slice(0, 8).map((t: string) => `<span class="gh-topic">${esc(t)}</span>`).join("");
  const html = `<div class="gh">${ghRepoHead(repo.owner?.login || o, repo.name || r, "code", { issues: repo.open_issues_count }, !repo.private)}
    <div class="gh-cols">
      <main>
        <div class="gh-bbar"><span class="gh-btn">${IC.branch}${esc(branch)}${IC.caret}</span>${dir ? `<span class="gh-path">${esc(dir)}</span>` : ""}<span class="gh-sp"></span><span class="gh-btn gh-green">Code${IC.caret}</span></div>
        <div class="gh-files">${commitRow}${rows}${more}</div>
        ${readme ? `<article class="gh-readme"><div class="gh-rh">${IC.book}README</div><div class="md">${md(readme)}</div></article>` : ""}
      </main>
      <aside class="gh-about">
        <h4>About</h4>
        <p>${esc(repo.description || "No description, website, or topics provided.")}</p>
        ${repo.homepage ? `<p class="lnk gh-home">${esc(shortUrl(repo.homepage))}</p>` : ""}
        ${topics ? `<div class="gh-topics">${topics}</div>` : ""}
        <ul class="gh-stats">
          ${repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? `<li>${S('<path d="M8 2v12M3 5h10M4.5 5 2.5 9.5h4ZM11.5 5l-2 4.5h4Z"/>')}${esc(repo.license.spdx_id)} license</li>` : ""}
          <li>${IC.star}<b>${fmtNum(repo.stargazers_count)}</b> stars</li>
          <li>${IC.eye}<b>${fmtNum(repo.subscribers_count ?? repo.watchers_count)}</b> watching</li>
          <li>${IC.fork}<b>${fmtNum(repo.forks_count)}</b> forks</li>
        </ul>
        ${repo.language ? `<h4>Languages</h4><p><span class="gh-lang" style="background:${langColor(repo.language)}"></span>${esc(repo.language)}</p>` : ""}
      </aside>
    </div></div>`;
  return { title: `${repo.full_name}${repo.description ? `: ${repo.description}` : ""}`, html, site: "github", url, kind: "repo" };
}

const LANG: Record<string, string> = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5", Rust: "#dea584", Go: "#00add8", "C++": "#f34b7d", C: "#555555", Java: "#b07219", Swift: "#f05138", Kotlin: "#a97bff", Ruby: "#701516", Shell: "#89e051", HTML: "#e34c26", CSS: "#663399", "Jupyter Notebook": "#da5b0b", Zig: "#ec915c", Lua: "#000080", Dart: "#00b4ab", "C#": "#178600", PHP: "#4f5d95", Vue: "#41b883", Svelte: "#ff3e00", MDX: "#fcb32c" };
const langColor = (l: string) => LANG[l] || "#8c959f";

async function ghFile(o: string, r: string, ref: string, path: string, url: string): Promise<PageView | null> {
  const text = await sf<string>(`https://raw.githubusercontent.com/${o}/${r}/${ref}/${path}`, "text");
  if (text == null) return null;
  const lines = text.replace(/\r/g, "").split("\n").slice(0, 400);
  const body = /\.md$/i.test(path) ? `<div class="md gh-mdfile">${md(text)}</div>` : `<div class="gh-code">${lines.map((l, i) => `<div><b>${i + 1}</b><span>${esc(l) || " "}</span></div>`).join("")}</div>`;
  const html = `<div class="gh">${ghRepoHead(o, r, "code")}<div class="gh-one"><div class="gh-bbar"><span class="gh-btn">${IC.branch}${esc(ref)}${IC.caret}</span><span class="gh-path">${esc(path)}</span></div><div class="gh-filebox"><div class="gh-fh"><span class="on">Code</span><span>Blame</span><span class="gh-muted">${lines.length} lines</span></div>${body}</div></div></div>`;
  return { title: `${r}/${path} at ${ref} · ${o}/${r}`, html, site: "github", url, kind: "file" };
}

async function ghTrending(url: string): Promise<PageView | null> {
  const html = await sf<string>("https://github.com/trending" + (new URL(url).pathname.replace(/^\/trending/, "") || ""), "text");
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("article.Box-row")).slice(0, 12).map((a) => {
    const name = (a.querySelector("h2 a")?.getAttribute("href") || "").replace(/^\//, "");
    const [o, r] = name.split("/");
    const desc = a.querySelector("p")?.textContent?.trim() || "";
    const lang = a.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || "";
    const links = Array.from(a.querySelectorAll("a.Link--muted")).map((x) => x.textContent?.trim() || "");
    const today = a.querySelector(".float-sm-right")?.textContent?.trim() || "";
    return `<div class="gh-trow"><div class="gh-tname">${IC.book}<span class="lnk">${esc(o)} / <b>${esc(r)}</b></span><span class="gh-btn gh-star">${IC.star}Star</span></div>${desc ? `<p>${esc(desc)}</p>` : ""}<div class="gh-tmeta">${lang ? `<span><i class="gh-lang" style="background:${langColor(lang)}"></i>${esc(lang)}</span>` : ""}${links[0] ? `<span>${IC.star}${esc(links[0])}</span>` : ""}${links[1] ? `<span>${IC.fork}${esc(links[1])}</span>` : ""}${today ? `<span class="gh-today">${IC.star}${esc(today)}</span>` : ""}</div></div>`;
  });
  if (!rows.length) return null;
  const page = `<div class="gh">${ghTop(`<b>Trending</b>`)}<div class="gh-one"><div class="gh-thead"><h1>Trending</h1><p>See what the GitHub community is most excited about today.</p></div><div class="gh-tlist"><div class="gh-ttabs"><span class="on">Repositories</span><span>Developers</span></div>${rows.join("")}</div></div></div>`;
  return { title: "Trending repositories on GitHub today", html: page, site: "github", url, kind: "trending" };
}

async function ghIssue(o: string, r: string, n: number, url: string): Promise<PageView | null> {
  const [is, comments] = await Promise.all([sf<any>(`${GH}/repos/${o}/${r}/issues/${n}`), sf<any[]>(`${GH}/repos/${o}/${r}/issues/${n}/comments?per_page=4`)]);
  if (!is?.title) return null;
  const done = is.state === "closed";
  const badge = done ? `<span class="gh-state ${is.state_reason === "not_planned" ? "closed-np" : "merged"}">${IC.issueDone}Closed</span>` : `<span class="gh-state open">${IC.issue}Open</span>`;
  const labels = (is.labels || []).slice(0, 5).map((l: any) => `<span class="gh-label" style="--c:#${esc(l.color || "8c959f")}">${esc(l.name)}</span>`).join("");
  const html = `<div class="gh">${ghRepoHead(o, r, "issues", { issues: undefined })}<div class="gh-one gh-pr">
    <h1>${esc(is.title)} <span class="gh-num">#${n}</span></h1>
    <div class="gh-prmeta">${badge}<span><b>${esc(is.user?.login || "")}</b> opened this issue ${esc(ago(is.created_at))} · ${is.comments} comment${is.comments === 1 ? "" : "s"}</span></div>
    <div class="gh-cols gh-prcols"><div class="gh-timeline">
      ${comment(is.user?.login, is.body || "No description provided.", is.created_at, true)}
      ${(comments || []).map((c) => comment(c.user?.login, c.body, c.created_at)).join("")}
    </div><aside class="gh-side"><h5>Assignees</h5><p class="gh-muted">${(is.assignees || []).map((a: any) => esc(a.login)).join(", ") || "No one assigned"}</p><h5>Labels</h5><div class="gh-labels">${labels || '<p class="gh-muted">None yet</p>'}</div></aside></div></div></div>`;
  return { title: `${is.title} · Issue #${n} · ${o}/${r}`, html, site: "github", url, kind: "issue" };
}

function comment(user: string | undefined, body: string, when?: string, first = false) {
  return `<div class="gh-cmt${first ? " first" : ""}"><span class="gh-av">${esc((user || "?")[0].toUpperCase())}</span><div class="gh-cbox"><div class="gh-ch"><b>${esc(user || "")}</b> commented ${esc(ago(when) || "")}</div><div class="md">${md(body || "", 1800)}</div></div></div>`;
}

/** A pull request from GitHub's API, or null when the repo is private or the API is out of requests. */
export async function prFromApi(repo: string, n: number): Promise<PrData | null> {
  const [p, files, comments] = await Promise.all([
    sf<any>(`${GH}/repos/${repo}/pulls/${n}`),
    sf<any[]>(`${GH}/repos/${repo}/pulls/${n}/files?per_page=30`),
    sf<any[]>(`${GH}/repos/${repo}/issues/${n}/comments?per_page=3`),
  ]);
  if (!p?.title) return null;
  const runs = p.head?.sha ? await sf<any>(`${GH}/repos/${repo}/commits/${p.head.sha}/check-runs?per_page=8`) : null;
  return {
    repo, number: n, title: p.title, state: p.merged ? "merged" : p.state === "closed" ? "closed" : p.draft ? "draft" : "open",
    user: p.user?.login || "", base: p.base?.ref || "main", head: p.head?.ref || "", commits: p.commits ?? null, body: p.body || "",
    files: (files || []).map((f) => ({ path: f.filename, adds: f.additions, dels: f.deletions, status: f.status, patch: f.patch })),
    checks: (runs?.check_runs || []).map((c: any) => ({ name: c.name, ok: c.conclusion ? c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral" : null })),
    comments: (comments || []).map((c) => ({ user: c.user?.login || "", body: c.body || "", when: c.created_at })),
    additions: p.additions, deletions: p.deletions, created: p.created_at,
  };
}

const STATE_LABEL: Record<PrData["state"], string> = { open: "Open", merged: "Merged", closed: "Closed", draft: "Draft" };
export function stateBadge(s: PrData["state"]) {
  return `<span class="gh-state ${s}">${s === "merged" ? IC.merged : s === "closed" ? IC.prClosed : IC.pr}${STATE_LABEL[s]}</span>`;
}

function diffHtml(patch: string) {
  const out: string[] = [];
  for (const h of parseDiff(patch).slice(0, 4)) {
    let o = h.oldStart, nn = h.newStart;
    out.push(`<div class="gh-dl hunk"><b></b><b></b><span>@@ -${h.oldStart} +${h.newStart} @@</span></div>`);
    for (const l of h.lines.slice(0, 40)) {
      if (l.kind === " ") out.push(`<div class="gh-dl"><b>${o++}</b><b>${nn++}</b><span> ${esc(l.text)}</span></div>`);
      else if (l.kind === "-") out.push(`<div class="gh-dl del"><b>${o++}</b><b></b><span>-${esc(l.text)}</span></div>`);
      else out.push(`<div class="gh-dl add"><b></b><b>${nn++}</b><span>+${esc(l.text)}</span></div>`);
    }
  }
  return out.join("");
}

function mergeBox(d: PrData) {
  if (d.state === "merged") return `<div class="gh-mbox merged" data-state="merged"><span class="gh-mi">${IC.merged}</span><div><b>Pull request successfully merged and closed</b><p>You're all set: the <code>${esc(d.head)}</code> branch can be safely deleted.</p></div></div>`;
  if (d.state === "closed") return `<div class="gh-mbox closed" data-state="closed"><span class="gh-mi">${IC.prClosed}</span><div><b>Closed with unmerged commits</b><p>This pull request is closed.</p></div></div>`;
  const checks = d.checks.length ? (() => {
    const bad = d.checks.filter((c) => c.ok === false).length, pend = d.checks.filter((c) => c.ok == null).length;
    const head = bad ? `${bad} failing check${bad === 1 ? "" : "s"}` : pend ? `Some checks haven't completed yet` : `All checks have passed`;
    return `<div class="gh-checks"><div class="gh-chead ${bad ? "bad" : pend ? "pend" : "ok"}">${bad ? IC.x : pend ? IC.dot : IC.check}<b>${head}</b><span class="gh-muted">${d.checks.length} check${d.checks.length === 1 ? "" : "s"}</span></div>${d.checks.slice(0, 5).map((c) => `<div class="gh-crow ${c.ok === false ? "bad" : c.ok == null ? "pend" : "ok"}">${c.ok === false ? IC.x : c.ok == null ? IC.dot : IC.check}<span>${esc(c.name)}</span></div>`).join("")}</div>`;
  })() : "";
  return `<div class="gh-mbox" data-state="ready">${checks}<div class="gh-mready"><span class="gh-mi ok">${IC.check}</span><div><b>${d.state === "draft" ? "This pull request is still a work in progress" : "No conflicts with base branch"}</b><p>Merging can be performed automatically.</p></div></div><div class="gh-mact"><span class="gh-btn gh-green gh-merge">Merge pull request</span><span class="gh-btn gh-green gh-mcaret">${IC.caret}</span><span class="gh-muted">You can also merge this with the command line.</span></div><div class="gh-mconfirm"><div class="gh-in gh-mtitle">${esc(`Merge pull request #${d.number ?? ""} from ${d.head}`)}</div><div class="gh-mrow"><span class="gh-btn gh-green gh-confirm">Confirm merge</span><span class="gh-btn">Cancel</span></div></div></div>`;
}

export function prHtml(d: PrData) {
  const [o, r] = (d.repo || "/").split("/");
  const files = d.files.slice(0, 12);
  const adds = d.additions ?? files.reduce((s, f) => s + f.adds, 0), dels = d.deletions ?? files.reduce((s, f) => s + f.dels, 0);
  const verb = d.state === "merged" ? "merged" : "wants to merge";
  const fileList = files.map((f) => `<div class="gh-pfile" data-path="${esc(f.path)}"><div class="gh-pfh">${IC.caret}<span>${esc(f.path)}</span><span class="gh-sp"></span><em class="a">+${f.adds}</em><em class="d">-${f.dels}</em></div>${f.patch ? `<div class="gh-diff">${diffHtml(f.patch)}</div>` : ""}</div>`).join("");
  const html = `<div class="gh">${ghRepoHead(o || "", r || "", "pulls")}<div class="gh-one gh-pr">
    <h1>${esc(d.title)}${d.number ? ` <span class="gh-num">#${d.number}</span>` : ""}</h1>
    <div class="gh-prmeta">${stateBadge(d.state)}<span><b>${esc(d.user)}</b> <span class="gh-verb">${verb}</span>${d.commits ? ` ${d.commits} commit${d.commits === 1 ? "" : "s"}` : ""} into <code>${esc(d.base)}</code> from <code>${esc(d.head)}</code></span></div>
    <nav class="gh-prtabs"><span class="on" data-pane="conv">${IC.comment}Conversation<i>${d.comments.length}</i></span>${d.commits ? `<span>Commits<i>${d.commits}</i></span>` : ""}${d.checks.length ? `<span>Checks<i>${d.checks.length}</i></span>` : ""}<span data-pane="files">Files changed<i>${d.files.length}</i></span><span class="gh-sp"></span><em class="a">+${adds}</em><em class="d">-${dels}</em></nav>
    <div class="gh-pane on" data-pane="conv"><div class="gh-cols gh-prcols"><div class="gh-timeline">
      ${comment(d.user, d.body || "No description provided.", d.created, true)}
      ${d.comments.map((c) => comment(c.user, c.body, c.when)).join("")}
      ${mergeBox(d)}
    </div><aside class="gh-side"><h5>Reviewers</h5><p class="gh-muted">No reviews</p><h5>Files</h5><p class="gh-muted">${d.files.length} changed</p></aside></div></div>
    <div class="gh-pane" data-pane="files">${fileList || '<p class="gh-muted">No file changes are known for this pull request.</p>'}</div>
  </div></div>`;
  return html;
}

export function compareHtml(d: PrData) {
  const [o, r] = (d.repo || "/").split("/");
  const files = d.files.slice(0, 10).map((f) => `<div class="gh-pfh">${IC.file}<span>${esc(f.path)}</span><span class="gh-sp"></span><em class="a">+${f.adds}</em><em class="d">-${f.dels}</em></div>`).join("");
  return `<div class="gh">${ghRepoHead(o || "", r || "", "pulls")}<div class="gh-one gh-cmp">
    <h2>Open a pull request</h2>
    <p class="gh-muted">Create a new pull request by comparing changes across two branches.</p>
    <div class="gh-cmpbar">${IC.branch}<span class="gh-btn">base: <b>${esc(d.base)}</b>${IC.caret}</span><span class="gh-arrow">&larr;</span><span class="gh-btn">compare: <b>${esc(d.head)}</b>${IC.caret}</span></div>
    <div class="gh-cmpform"><span class="gh-av">${esc((d.user || "?")[0].toUpperCase())}</span><div class="gh-cbox"><div class="gh-in gh-ptitle" data-ph="Title"></div><div class="gh-in gh-pbody" data-ph="Add a description"></div><div class="gh-mrow"><span class="gh-sp"></span><span class="gh-btn gh-green gh-create">Create pull request</span></div></div></div>
    ${files ? `<div class="gh-cmpfiles"><div class="gh-rh">Showing <b>${d.files.length} changed file${d.files.length === 1 ? "" : "s"}</b></div>${files}</div>` : ""}
  </div></div>`;
}

/** Flip a rendered PR page to merged (the badge turns purple, the merge box says so). */
export function setPrMerged(page: HTMLElement, d: PrData) {
  const badge = page.querySelector(".gh-state");
  if (badge) badge.outerHTML = stateBadge("merged");
  const verb = page.querySelector(".gh-verb");
  if (verb) verb.textContent = "merged";
  const box = page.querySelector(".gh-mbox");
  if (box) box.outerHTML = mergeBox({ ...d, state: "merged" });
}

async function ghPull(o: string, r: string, n: number, url: string, opts: LoadOpts): Promise<PageView | null> {
  const d = await prFromApi(`${o}/${r}`, n);
  if (!d) return null;
  if (opts.prState) d.state = opts.prState;
  return { title: `${d.title} by ${d.user} · Pull Request #${n} · ${o}/${r}`, html: prHtml(d), site: "github", url, kind: "pr" };
}

async function github(url: string, opts: LoadOpts): Promise<PageView | null> {
  const u = new URL(url);
  const p = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!p.length || p[0] === "trending") return ghTrending(url);
  if (p.length < 2 || /^(settings|orgs|topics|search|features|pricing|login|marketplace|sponsors|explore|notifications|collections)$/.test(p[0])) return null;
  const [o, r, ...sub] = p;
  if (sub[0] === "pull" && /^\d+$/.test(sub[1] || "")) return ghPull(o, r, Number(sub[1]), url, opts);
  if (sub[0] === "issues" && /^\d+$/.test(sub[1] || "")) return ghIssue(o, r, Number(sub[1]), url);
  if (sub[0] === "blob" && sub.length >= 3) return ghFile(o, r, sub[1], sub.slice(2).join("/"), url);
  if (!sub.length || sub[0] === "tree") return ghRepo(o, r, sub, url);
  return null;
}

async function rawGithub(url: string): Promise<PageView | null> {
  const text = await sf<string>(url, "text");
  if (text == null) return null;
  return { title: url.split("/").pop() || url, html: `<pre class="raw">${esc(text.slice(0, 60000))}</pre>`, site: "raw", url };
}

// --- Hugging Face -------------------------------------------------------------------
const HFA = "https://huggingface.co/api";
function hfTop(active: "models" | "datasets" | "spaces" | "docs" = "models") {
  const n = (k: string, l: string) => `<span class="${k === active ? "on" : ""}">${l}</span>`;
  return `<header class="hf-top">${HF_MARK}<b class="hf-word">Hugging Face</b><span class="hf-sbox">${IC.search}<span>Search models, datasets, users...</span></span><nav>${n("models", "Models")}${n("datasets", "Datasets")}${n("spaces", "Spaces")}${n("docs", "Docs")}</nav></header>`;
}
const PIPE_COLOR: Record<string, string> = { "text-generation": "#e05a5a", "image-text-to-text": "#e05a5a", "text-to-image": "#d4589c", "feature-extraction": "#5a8ee0", "sentence-similarity": "#5a8ee0", "automatic-speech-recognition": "#2fb380", "text-to-speech": "#2fb380", "text-to-audio": "#2fb380", "image-classification": "#d99a1e" };
const pipeName = (p: string) => p.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

async function hfRepo(kind: "models" | "datasets", id: string, sub: string[], url: string): Promise<PageView | null> {
  const api = await sf<any>(`${HFA}/${kind}/${id}`);
  if (!api?.id) return null;
  const files = sub[0] === "tree" || sub[0] === "blob";
  const rawBase = kind === "datasets" ? `https://huggingface.co/datasets/${id}` : `https://huggingface.co/${id}`;
  const card = files ? null : await sf<string>(`${rawBase}/raw/main/README.md`, "text");
  const [author, name] = String(api.id).split("/");
  const pipe = api.pipeline_tag ? `<span class="hf-tag hf-pipe" style="--c:${PIPE_COLOR[api.pipeline_tag] || "#7c6cf0"}">${esc(pipeName(api.pipeline_tag))}</span>` : "";
  const LABEL: Record<string, string> = { license: "License", dataset: "Dataset", base_model: "Base model", task_categories: "Tasks", modality: "Modalities", language: "Languages", size_categories: "Size", format: "Formats", library: "Libraries" };
  const tags = (api.tags || []).filter((t: string) => !/^(region:|endpoints_compatible|deploy:|arxiv:|doi:|autotrain|has_space|task_ids:|source_datasets:|annotations_creators:|language_creators:|multilinguality:)/.test(t) && t !== api.pipeline_tag).slice(0, 9)
    .map((t: string) => {
      const m = t.match(/^([a-z_]+):(.+)$/);
      const label = m ? LABEL[m[1]] || m[1].replace(/_/g, " ") : "";
      const v = m ? m[2].replace(/^(adapter|finetune|quantized|merge):/, "") : t;
      return `<span class="hf-tag">${label ? `<em>${esc(label)}:</em> ` : ""}${esc(v)}</span>`;
    }).join("");
  const dir = sub[0] === "tree" ? sub.slice(2).join("/") : "";
  const sib: string[] = (api.siblings || []).map((s: any) => s.rfilename).filter((f: string) => !dir || f.startsWith(dir + "/"));
  const entries = [...new Set(sib.map((f) => { const rest = dir ? f.slice(dir.length + 1) : f; return rest.includes("/") ? rest.split("/")[0] + "/" : rest; }))].sort((a, b) => Number(b.endsWith("/")) - Number(a.endsWith("/")) || a.localeCompare(b)).slice(0, 18);
  const body = files
    ? `<div class="hf-files"><div class="hf-fhead">${IC.branch}<b>main</b>${dir ? `<span>/ ${esc(dir)}</span>` : ""}</div>${entries.map((f) => `<div class="hf-frow">${f.endsWith("/") ? IC.folder : IC.file}<span>${esc(f.replace(/\/$/, ""))}</span></div>`).join("") || '<p class="hf-muted">No files</p>'}</div>`
    : `<article class="md hf-card">${card ? md(card) : `<p class="hf-muted">No ${kind === "datasets" ? "dataset" : "model"} card</p>`}</article>`;
  const side = kind === "models"
    ? `<div class="hf-stat"><small>Downloads last month</small><b>${(api.downloads ?? 0).toLocaleString("en-US")}</b></div>${api.library_name ? `<div class="hf-stat"><small>Library</small><b>${esc(api.library_name)}</b></div>` : ""}${api.lastModified ? `<div class="hf-stat"><small>Updated</small><b>${esc(ago(api.lastModified))}</b></div>` : ""}`
    : `<div class="hf-stat"><small>Downloads last month</small><b>${(api.downloads ?? 0).toLocaleString("en-US")}</b></div>${api.cardData?.size_categories?.[0] ? `<div class="hf-stat"><small>Size</small><b>${esc(api.cardData.size_categories[0])}</b></div>` : ""}`;
  const html = `<div class="hf">${hfTop(kind)}<div class="hf-head">
      <div class="hf-title">${kind === "datasets" ? `<span class="hf-kind">Datasets:</span>` : ""}<span class="hf-author">${esc(author)}</span><em>/</em><b>${esc(name)}</b><span class="hf-like">${IC.heart}like<i>${fmtNum(api.likes)}</i></span></div>
      <div class="hf-tags">${pipe}${tags}</div>
      <nav class="hf-tabs"><span class="${files ? "" : "on"}">${kind === "datasets" ? "Dataset card" : "Model card"}</span>${kind === "datasets" ? "<span>Data Studio</span>" : ""}<span class="${files ? "on" : ""}">Files and versions</span><span>Community</span></nav>
    </div><div class="hf-cols"><main>${body}</main><aside>${side}</aside></div></div>`;
  return { title: `${api.id} · Hugging Face`, html, site: "hf", url, kind };
}

async function hfList(kind: "models" | "datasets", url: string): Promise<PageView | null> {
  const list = await sf<any[]>(`${HFA}/${kind}?sort=trendingScore&limit=14`);
  if (!list?.length) return null;
  const rows = list.map((m) => `<div class="hf-mrow"><span class="hf-av" style="background:${FAV_COLORS[(m.id.charCodeAt(0) + m.id.length) % FAV_COLORS.length]}">${esc(m.id[0].toUpperCase())}</span><div><b>${esc(m.id)}</b><p>${m.pipeline_tag ? `${esc(pipeName(m.pipeline_tag))} · ` : ""}${m.lastModified || m.createdAt ? `Updated ${esc(ago(m.lastModified || m.createdAt))} · ` : ""}${IC.down}${fmtNum(m.downloads)} · ${IC.heart}${fmtNum(m.likes)}</p></div></div>`).join("");
  const html = `<div class="hf">${hfTop(kind)}<div class="hf-list"><div class="hf-lhead"><h1>${kind === "models" ? "Models" : "Datasets"}</h1><span class="hf-sort">Sort: Trending${IC.caret}</span></div><div class="hf-grid">${rows}</div></div></div>`;
  return { title: `${kind === "models" ? "Models" : "Datasets"} · Hugging Face`, html, site: "hf", url, kind: "list" };
}

async function huggingface(url: string): Promise<PageView | null> {
  const u = new URL(url);
  const p = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!p.length || (p[0] === "models" && p.length === 1)) return hfList("models", url);
  if (p[0] === "datasets" && p.length === 1) return hfList("datasets", url);
  if (p[0] === "datasets" && p.length >= 3) return hfRepo("datasets", `${p[1]}/${p[2]}`, p.slice(3), url);
  if (/^(spaces|docs|blog|papers|learn|posts|settings|login|join|pricing|enterprise|collections|organizations|tasks)$/.test(p[0])) return null;
  if (p.length >= 2) {
    if (p[2] === "raw" || p[2] === "resolve") return null;
    if (p[2] === "blob" && p.length >= 5) {
      const text = await sf<string>(`https://huggingface.co/${p[0]}/${p[1]}/raw/${p.slice(3).join("/")}`, "text");
      if (text != null) return { title: `${p.slice(4).join("/")} · ${p[0]}/${p[1]}`, html: `<div class="hf">${hfTop()}<pre class="raw hf-raw">${esc(text.slice(0, 40000))}</pre></div>`, site: "hf", url };
    }
    return hfRepo("models", `${p[0]}/${p[1]}`, p.slice(2), url);
  }
  return null;
}

// --- Wikipedia --------------------------------------------------------------------
function inline(node: Node): string {
  let s = "";
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) s += esc(c.textContent || "");
    else if (c.nodeType === 1) {
      const e = c as HTMLElement, tag = e.tagName.toLowerCase();
      if (tag === "sup" || tag === "style" || e.classList.contains("mw-ref") || e.classList.contains("reference") || e.classList.contains("noprint")) return;
      if (tag === "a") s += `<span class="wl">${inline(e)}</span>`;
      else if (tag === "b" || tag === "strong") s += `<b>${inline(e)}</b>`;
      else if (tag === "i" || tag === "em") s += `<i>${inline(e)}</i>`;
      else if (tag === "br") s += " ";
      else s += inline(e);
    }
  });
  return s;
}

async function wikipedia(url: string): Promise<PageView | null> {
  const u = new URL(url);
  const host = u.hostname;
  let title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, "")).replace(/ /g, "_");
  if (!u.pathname.startsWith("/wiki/") || !title) return null;
  if (/^Special:Random$/i.test(title)) {
    const r = await sf<any>(`https://${host}/api/rest_v1/page/random/summary`);
    if (!r?.titles?.canonical) return null;
    title = r.titles.canonical;
  }
  if (/^(Special|Talk|User|Wikipedia|File|Help|Portal|Category|Template):/i.test(title)) return null;
  const [html, sum] = await Promise.all([sf<string>(`https://${host}/api/rest_v1/page/html/${encodeURIComponent(title)}`, "text"), sf<any>(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`)]);
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const display = sum?.title || doc.querySelector("title")?.textContent || title.replace(/_/g, " ");
  // infobox: the side table most articles open with (only the one in the lead section)
  const lead = doc.querySelector("body > section");
  const ib = lead?.querySelector("table.infobox") || null;
  let box = "";
  if (ib) {
    const rows: string[] = [];
    for (const tr of Array.from(ib.querySelectorAll("tr"))) {
      const th = tr.querySelector("th"), td = tr.querySelector("td");
      if (th && td && rows.length < 10) { const v = inline(td).trim(); if (v && v.length < 160) rows.push(`<tr><th>${inline(th)}</th><td>${v}</td></tr>`); }
    }
    const cap = ib.querySelector("caption, .infobox-above")?.textContent?.trim() || display;
    const src = ib.querySelector("img")?.getAttribute("src") || sum?.thumbnail?.source || "";
    const img = src ? await sf<string>(src.startsWith("//") ? "https:" + src : src, "image") : null;
    if (rows.length || img) box = `<aside class="wk-ib"><div class="wk-ibc">${esc(cap)}</div>${img ? `<div class="wk-img"><img alt="" src="${img}"></div>` : ""}<table>${rows.join("")}</table></aside>`;
  }
  if (!box && sum?.thumbnail?.source) {
    // no infobox: the lead picture with its caption, like the article's first thumbnail
    const img = await sf<string>(sum.thumbnail.source, "image");
    const cap = lead?.querySelector("figure figcaption");
    if (img) box = `<aside class="wk-ib wk-thumb"><div class="wk-img"><img alt="" src="${img}"></div>${cap ? `<p>${inline(cap)}</p>` : sum.description ? `<p>${esc(sum.description)}</p>` : ""}</aside>`;
  }
  const sections = Array.from(doc.querySelectorAll("body > section"));
  const toc: string[] = [];
  const parts: string[] = [];
  let paras = 0;
  sections.forEach((sec, i) => {
    const h = sec.querySelector(":scope > h2, :scope > div > h2, :scope > .mw-heading > h2");
    const name = h?.textContent?.trim() || "";
    if (i > 0 && (!name || /^(See also|References|Notes|External links|Further reading|Bibliography|Sources|Citations|Footnotes)$/i.test(name))) return;
    if (name) { if (!toc.includes(name)) toc.push(name); if (paras < 16) parts.push(`<h2>${esc(name)}</h2>`); }
    for (const p of Array.from(sec.querySelectorAll(":scope > p")).slice(0, i === 0 ? 4 : 2)) {
      const t = inline(p).trim();
      if (t.length > 40 && paras < 16) { parts.push(`<p>${t}</p>`); paras++; }
    }
  });
  if (!paras) return null;
  const page = `<div class="wk"><header class="wk-top"><span class="wk-logo">W</span><span class="wk-word">WIKIPEDIA<small>The Free Encyclopedia</small></span><span class="wk-sbox">${IC.search}<span>Search Wikipedia</span></span></header>
    <div class="wk-main"><nav class="wk-toc"><b>Contents</b><span class="on">(Top)</span>${toc.slice(0, 12).map((t) => `<span>${esc(t)}</span>`).join("")}</nav>
    <article><h1>${esc(display)}</h1><div class="wk-tabs"><span class="on">Article</span><span>Talk</span><span class="wk-sp"></span><span class="on">Read</span><span>Edit</span><span>View history</span></div>
    <p class="wk-from">From Wikipedia, the free encyclopedia</p>${box}${parts.join("")}</article></div></div>`;
  return { title: `${display} - Wikipedia`, html: page, site: "wiki", url: `https://${host}/wiki/${encodeURIComponent(title)}`, kind: "article" };
}

// --- everything else --------------------------------------------------------------
function plainArticle(url: string, res: any): PageView {
  const label = hostOf(url) || url;
  if (res?.ok && (res.title || res.blocks?.length)) {
    return {
      title: res.title || label, site: "web", url,
      html: `<article class="b-article"><p class="b-host">${esc(label)}</p><h1>${esc(res.title || label)}</h1>${res.description ? `<p class="b-desc">${esc(res.description)}</p>` : ""}${(res.blocks || []).map((x: any) => x.tag === "pre" ? `<pre>${esc(x.text)}</pre>` : x.tag.startsWith("h") ? `<h2>${esc(x.text)}</h2>` : `<p>${esc(x.text)}</p>`).join("")}</article>`,
    };
  }
  return { title: label, site: "web", url, html: `<div class="b-search"><div class="b-q">${esc(label)}</div><p class="muted">${esc(res?.error ? "This page could not be loaded here." : "Opened this page.")}</p></div>` };
}

/** What a local page (an app the agent is building) shows: the preview tool's own text, or a fetch. */
function localPage(url: string, title: string | undefined, text: string): PageView {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
  return { title: title || shortUrl(url), site: "local", url, html: `<article class="b-article b-local"><h1>${esc(title || lines[0] || shortUrl(url))}</h1>${lines.slice(title ? 0 : 1).map((l) => `<p>${esc(l)}</p>`).join("")}</article>` };
}

/** The page as a real browser draws it, from a hidden window in the main process; null when that is not possible. */
async function realPage(url: string, opts: LoadOpts): Promise<PageView | null> {
  const api = lucid();
  if (!api?.shot) return null;
  const r = await api.shot(opts.html != null ? { html: opts.html } : { url }).catch(() => null);
  if (!r?.ok || !r.image) return null;
  const title = r.title || opts.title || (opts.html != null ? "Preview" : hostOf(url));
  return {
    title, site: "shot", url: opts.html != null ? url : (r.url || url),
    html: `<div class="b-shot"><img src="${r.image}" alt="${esc(title)}" width="${r.width}" height="${r.height}" draggable="false"></div>`,
  };
}

/** Load any URL into a page view: a site layout with real data when we know the site, else a plain read. */
export async function loadPage(url: string, peek: (url: string) => Promise<any>, opts: LoadOpts = {}): Promise<PageView> {
  const h = hostOf(url);
  if (opts.real || opts.html != null) {
    const v = await realPage(url, opts);
    if (v) return v;
  }
  if (opts.html != null) return localPage(url, opts.title, "This page could not be drawn here.");
  if (opts.text) return localPage(url, opts.title, opts.text);
  try {
    let v: PageView | null = null;
    if (h === "github.com") v = await github(url, opts);
    else if (h === "raw.githubusercontent.com") v = await rawGithub(url);
    else if (h === "huggingface.co") v = await huggingface(url);
    else if (/\.wikipedia\.org$/.test(h)) v = await wikipedia(url);
    if (v) return v;
  } catch (err) { console.warn("site page failed", url, err); }
  const res = /^https?:/.test(url) ? await peek(url).catch(() => null) : null;
  const v = plainArticle(url, res);
  // known sites still get their own header when only the plain text could be read
  if (h === "github.com" && res?.ok) { const p = new URL(url).pathname.split("/").filter(Boolean); v.html = `<div class="gh">${p.length >= 2 ? ghRepoHead(p[0], p[1], "code") : ghTop(esc(p[0] || ""))}<div class="gh-one">${v.html}</div></div>`; v.site = "github"; }
  else if (h === "huggingface.co" && res?.ok) { v.html = `<div class="hf">${hfTop()}<div class="hf-one">${v.html}</div></div>`; v.site = "hf"; }
  else if (opts.title && !res?.ok) v.title = opts.title;
  return v;
}

// --- search results -------------------------------------------------------------------
export function cleanQuery(q: string) {
  // Codex writes site filters as "site.example.com"; show them the way they were meant
  return String(q || "").replace(/(^|\s)site\.([\w-]+\.[\w.\/-]+)/g, "$1site:$2").replace(/\s+/g, " ").trim();
}

export function searchHtml(query: string, results: Result[] | null) {
  const rows = (results || []).slice(0, 8).map((r) => {
    let crumb = shortUrl(r.url);
    try { const u = new URL(r.url); crumb = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? " › " + u.pathname.split("/").filter(Boolean).slice(0, 3).map(decodeURIComponent).join(" › ") : ""}`; } catch {}
    return `<li class="se-r" data-key="${esc(urlKey(r.url))}"><div class="se-src">${favHtml(r.url)}<span><b>${esc(siteName(r.url))}</b><small>${esc(crumb)}</small></span></div><h3>${esc(r.title || shortUrl(r.url))}</h3>${r.snippet ? `<p>${esc(r.snippet)}</p>` : ""}</li>`;
  }).join("");
  const none = results === null ? `<p class="se-none">The results could not be loaded here.</p>` : `<p class="se-none">No results to show.</p>`;
  return `<div class="se"><div class="se-top"><div class="se-box">${IC.search}<span class="se-q">${esc(query)}</span></div></div><ol class="se-list">${rows || none}</ol></div>`;
}

function siteName(url: string) {
  const h = hostOf(url);
  if (h === "github.com") return "GitHub";
  if (h === "huggingface.co") return "Hugging Face";
  if (/wikipedia\.org$/.test(h)) return "Wikipedia";
  const p = h.split(".");
  return p.length > 1 ? p[p.length - 2].replace(/^\w/, (c) => c.toUpperCase()) : h;
}
