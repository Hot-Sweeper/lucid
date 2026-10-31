import { Marked } from "marked";
import DOMPurify from "dompurify";
import { highlight } from "../os/highlight";
import { logoFor } from "./brand";
import { stripRefs } from "./thread-ref";

export type ChatMessage = {
  id: string; role: string; at: string; streaming: boolean; text: string; run?: string | null; queue?: number | null;
  attachments: { type: string; name: string; mime: string; size: number; path: string | null }[];
  // queued messages only: their run, the live turn they can be steered into, and what T3 allows
  queueRunId?: string; steerTarget?: string | null; queueFixed?: boolean; queueGuest?: boolean;
};

export const fileUrl = (p: string) => `lucid-file://local/${encodeURIComponent(p)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Messages render as real Markdown, like in T3 Code: headings, lists, tables, quotes,
// highlighted code blocks with a copy button, and links (web links open in the browser,
// file paths show as file chips). Everything goes through DOMPurify.
const FENCE: Record<string, string> = { ts: "c", tsx: "c", js: "c", jsx: "c", typescript: "c", javascript: "c", rust: "c", go: "c", java: "c", c: "c", cpp: "c", cs: "c", py: "hash", python: "hash", sh: "hash", bash: "hash", shell: "hash", powershell: "hash", ps1: "hash", yaml: "hash", yml: "hash", toml: "hash", json: "json", html: "markup", xml: "markup", svg: "markup", css: "css", scss: "css", md: "text", markdown: "text", text: "text", txt: "text" };
const mdParser = new Marked({ gfm: true, breaks: true });
mdParser.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const l = (lang || "").trim().split(/\s+/)[0].toLowerCase();
      const body = text.replace(/\n$/, "").split("\n").map((line) => highlight(line, FENCE[l] ?? "c")).join("\n");
      return `<div class="md-code"><div class="md-code-head"><span>${esc(l || "code")}</span><button type="button" class="md-copy">Copy</button></div><pre><code>${body}</code></pre></div>`;
    },
    link(this: any, { href, tokens }: { href: string; tokens: any[] }) {
      const inner = this.parser.parseInline(tokens);
      if (/^(https?:|mailto:)/i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      return `<span class="md-file" title="${esc(href)}">${inner}</span>`;
    },
    table(this: any, token: any) {
      const head = token.header.map((c: any) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
      const rows = token.rows.map((r: any[]) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
      return `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    },
  },
});
export function chatMarkdown(text: string) {
  const html = mdParser.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
// Time of day for today's messages; older ones also get their date so equal times never look alike.
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  if (!Number.isFinite(d.getTime())) return "";
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${t}`;
};

export function renderChatMessage(m: ChatMessage) {
    let body = m.text;
    const sent: string[] = [];
    const at = m.role === "user" ? body.match(/\n*Attached:\n((?:- (?:image|file): .+(?:\n|$))+)\s*$/) : null;
    if (at) {
      body = body.slice(0, at.index).trim();
      for (const line of at[1].trim().split("\n")) {
        const mm = line.match(/^- (image|file): (.+)$/);
        if (!mm) continue;
        const p = mm[2].trim(), name = p.split(/[\\/]/).pop()!.replace(/^\d+-/, "");
        sent.push(mm[1] === "image" ? `<figure class="cp-att"><img src="${fileUrl(p)}" alt="${esc(name)}" loading="lazy"></figure>`
          : `<div class="cp-file" title="${esc(p)}"><span>${esc(name)}</span><i>file</i></div>`);
      }
    }
    // threads you referenced show as small chips, not as the block the agent reads
    if (m.role === "user" && body.includes("<referenced_thread ")) {
      const rr = stripRefs(body);
      body = rr.body;
      for (const r of rr.refs.reverse()) {
        const logo = logoFor(r.harness);
        sent.unshift(`<div class="cp-file cp-reffile" title="${esc(`${r.title}, ${r.project}`)}">${logo ? `<img src="${logo}" alt="">` : ""}<span>${esc(r.title)}</span><i>${esc(r.project)}</i></div>`);
      }
    }
    m = { ...m, text: body };
    const atts = sent.join("") + m.attachments.map((a) => {
      if (a.type === "image" && a.path) return `<figure class="cp-att"><img src="${fileUrl(a.path)}" alt="${esc(a.name)}" loading="lazy"></figure>`;
      return `<div class="cp-file" title="${esc(a.name)}"><span>${esc(a.name)}</span><i>${Math.max(1, Math.round((a.size || 0) / 1024))} KB</i></div>`;
    }).join("");
    const state = m.role === "user" && m.run === "running" ? `<em class="cp-live">It is working on this</em>` : "";
    return `${atts ? `<div class="cp-atts">${atts}</div>` : ""}${m.text ? `<div class="cp-text">${chatMarkdown(m.text)}${m.streaming ? '<span class="caret"></span>' : ""}</div>` : ""}${state}<time>${when(m.at)}</time>`;
  }

