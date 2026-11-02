import { inlineChatImage } from "./chat-media";

export type ReviewVerdict = {
  report: string; decision: "approve" | "changes" | "manual" | "pending";
  summary: string; visualChanged: boolean; checks: string[]; before: string[]; after: string[];
  feedback: string; humanChecks: { question: string; instructions: string }[];
};
export type ChatReviewPaper = {
  id: string; threadId: string; title: string;
  images: { source: string; path: string; name: string; label: string }[];
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === "string");

// Presentation is deliberately stricter than ingestion: only standalone, complete
// payloads from the saved review conversation qualify. Fences and examples stay code.
export function reviewReportId(text: string): string | null {
  if (text.length > 256 * 1024 || !text.trimStart().startsWith("{")) return null;
  return text.slice(0, 4096).match(/"report"\s*:\s*"([a-f0-9]{24})"/)?.[1] ?? null;
}
export function parseReviewVerdict(text: string): ReviewVerdict | null {
  if (!reviewReportId(text)) return null;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || !/^[a-f0-9]{24}$/.test(v.report)
      || !["approve", "changes", "manual", "pending"].includes(v.decision)
      || typeof v.summary !== "string" || !v.summary.trim() || typeof v.visualChanged !== "boolean"
      || !strings(v.checks) || !strings(v.before) || !strings(v.after) || typeof v.feedback !== "string"
      || !Array.isArray(v.humanChecks) || !v.humanChecks.every((c: any) => c && typeof c.question === "string" && c.question.trim() && typeof c.instructions === "string")) return null;
    return v;
  } catch { return null; }
}

export function renderChatReview(text: string, streaming: boolean, paper: ChatReviewPaper, prose: (text: string) => string): string | null {
  if (reviewReportId(text) !== paper.id) return null;
  if (streaming) return `<section class="cp-review" aria-label="Review"><p class="cp-review-progress">Review in progress<span class="caret" aria-hidden="true"></span></p></section>`;
  const v = parseReviewVerdict(text);
  if (!v) return null;
  const outcome = v.humanChecks.length ? "Needs your review" : { approve: "Review approved", changes: "Changes requested", manual: "Needs your review", pending: "Review on hold" }[v.decision];
  const section = (label: string, content: string) => `<section><h4>${label}</h4>${content}</section>`;
  const list = (values: string[]) => `<ul>${values.filter(s => s.trim()).map(s => `<li>${prose(s)}</li>`).join("")}</ul>`;
  const captures = (label: string, paths: string[]) => paths.filter(s => s.trim()).map((source, i) => {
    const saved = paper.images.find(image => image.source === source || image.path === source);
    const name = `${label}${paths.length > 1 ? ` ${i + 1}` : ""}`;
    return `<figure><figcaption>${name}</figcaption>${inlineChatImage(saved?.path || source, name)}</figure>`;
  }).join("");
  const images = captures("Before", v.before) + captures("After", v.after);
  const url = new URL(location.href); url.searchParams.set("thread", paper.threadId); url.hash = "";
  return `<article class="cp-review" aria-label="Settlement review">
    <h3>${outcome}</h3><div class="cp-review-summary">${prose(v.summary)}</div>
    ${v.feedback.trim() ? section(v.decision === "pending" ? "What is needed" : "Next steps", prose(v.feedback)) : ""}
    ${v.humanChecks.length ? section("Questions for you", `<ol>${v.humanChecks.map(c => `<li><strong>${esc(c.question)}</strong>${c.instructions.trim() ? prose(c.instructions) : ""}</li>`).join("")}</ol><button type="button" class="ghost" data-review-open="${paper.id}" data-review-questions>Answer questions</button>`) : ""}
    ${v.checks.some(s => s.trim()) ? section("Checks and findings", list(v.checks)) : ""}
    ${images ? section(v.before.length && v.after.length ? "Before &amp; after" : "Captures", `<div class="cp-review-images">${images}</div>`) : ""}
    <nav class="cp-review-links" aria-label="Report links"><button type="button" class="ghost" data-review-open="${paper.id}">Open saved report</button><a href="${esc(url.href)}" data-review-thread="${paper.id}">Source conversation${paper.title ? `: ${esc(paper.title)}` : ""}</a></nav>
    <details class="cp-review-original"><summary>Original response</summary><div class="md-code"><div class="md-code-head"><span>JSON</span><button type="button" class="md-copy">Copy</button></div><pre><code>${esc(text)}</code></pre></div></details>
  </article>`;
}
