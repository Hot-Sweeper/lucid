import { answerFor, type InputQuestion, type PendingRequest } from "./answer";
import "./delegate.css";
import type { WThread } from "./world";

// The orchestrator answers robots' questions for you. A new question goes to it first: Lucid
// sends it to the orchestrator's own T3 thread with your past answers, and it replies with an
// answer and how sure it is. Lucid sends that answer only when it is sure enough and the
// question is a safe kind; everything else comes to you, with its reason and its suggestion
// picked but not sent. Every answer you give (here or in T3 Code) becomes a new example for it.

export type Suggestion = Record<string, { picked: string[]; other: string | null }>;
export type Advice = {
  state: "deciding" | "asked" | "rule" | "failed" | "answered";
  reason: string;
  suggestion?: Suggestion;
  decision?: string;
  /** short, readable form of what it answered or suggests */
  answerText?: string;
};
export type Phase = "reading" | "answered" | "asked";
export type Decision = {
  requestId: string; at: string; threadId: string; title: string; project: string;
  questions: string; outcome: "answered" | "asked" | "failed" | "user"; answer?: string; suggestion?: string;
  reason: string; confidence?: number | null; userAnswer?: string; agreed?: boolean | null;
  /** what the answer card shows, kept so it survives a restart */
  advice?: Advice;
};
type Log = { auto: number; asked: number; log: Decision[] };
type Example = { q: string; options: string[]; answer: string | string[]; project: string; thread: string; count: number; last: string };
export type DelegateState = { threadId: string; auto?: boolean; threshold?: number; answersSince?: string; folded?: string };

type Api = {
  pendingRequests(id: string): Promise<PendingRequest[]>;
  requestContext(id: string): Promise<{ title: string; project: string; user: string; robot: string }>;
  repliesSince(id: string, since: string): Promise<{ messages: { at: string; streaming: boolean; text: string }[]; runStatus: string | null; exists: boolean }>;
  resolvedSince(since: string): Promise<{ id: string; threadId: string; title: string; project: string; at: string; kind: string; questions: { id: string; question: string; options: string[] }[]; answers: Record<string, string | string[]> | null; decision: string | null; prompt: string }[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
  orchAnswers(): Promise<{ examples: Example[] }>;
  orchRecord(list: unknown[]): Promise<number>;
  orchDecisions(): Promise<Log>;
  orchLog(d: Decision): Promise<Log>;
};
type T3 = { respond(o: { threadId: string; requestId: string; answers?: Record<string, string | string[]>; decision?: string }): Promise<unknown> };

const WAIT_MS = 150_000;       // how long a decision may take before the question comes to you
const FRESH_MS = 20 * 60_000;  // questions already waiting this long when Lucid sees them stay yours
const FOLD_EVERY = 5;          // new answers before the orchestrator folds them into memory.md

// Things that are always yours to decide, whatever the orchestrator thinks.
const NEVER: [RegExp, string][] = [
  [/\b(pay|paid|payment|purchase|buy|price|pricing|cost|billing|invoice|subscription|subscribe|refund|credit card|wallet|budget|charge)\b|[$€£]\s?\d/i, "money"],
  [/\b(password|passphrase|passcode|(access|auth|api|bearer|github|npm|refresh|session) ?token|api[ -]?key|secret|credential|ssh key|private key|2fa|otp|oauth|auth code)s?\b/i, "credentials"],
  [/\b(publish|release|deploy|go live|production|npm publish|git push|push to (main|master|origin|remote)|pull request|merge (the|this|it)|open a pr|create a pr|upload|tweet|post (it|this|publicly))\b/i, "publishing"],
  [/\b(e-?mail|send (a |the |an )?(message|mail|dm|text|reply|invite)|notify|slack|discord|sms|whatsapp|invite|contact (him|her|them|the))\b/i, "sending messages to people"],
  [/\b(delete|erase|wipe|drop (table|database)|truncate|destroy|purge|overwrite|irreversible|permanent(ly)?|cannot be undone|can't be undone|force[- ]push|reset --hard|rm -rf)\b/i, "something that cannot be undone"],
];
// Commands that change or remove things outside a normal edit: never approved for you.
const RISKY_COMMAND = /(^|[\s;&|(])(rm|rmdir|rd|del|erase|Remove-Item|mv|move|Move-Item|chmod|chown|icacls|sudo|su|dd|mkfs|format|diskpart|shutdown|reboot|kill|taskkill|Stop-Process|reg|curl|wget|Invoke-WebRequest|iwr|scp|ssh|ftp)(\s|$)|git\s+(push|reset|clean|checkout\s+--|restore|branch\s+-D|rebase|filter-branch|gc|stash\s+(drop|clear))|npm\s+(publish|unpublish)|docker\s+(rm|rmi|prune|system\s+prune)|kubectl\s+delete|\b(drop|delete\s+from|truncate)\b|>\s*[^&|\s]|\|\s*(sh|bash|pwsh|powershell|iex)\b/i;
const AUTO_APPROVE_KINDS = new Set(["command", "file-read", "file-change"]);

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
const clip = (s: string, n: number) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const say = (a: string | string[]) => (Array.isArray(a) ? a.join(", ") : a);
const tagOf = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return "Q-" + (h >>> 0).toString(36); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function textOf(r: PendingRequest) {
  return r.type === "input"
    ? r.questions.map((q) => [q.header, q.question, ...q.options.map((o) => `${o.label} ${o.description}`)].join(" ")).join(" ")
    : `${r.requestKind} ${r.prompt} ${r.detail}`;
}
/** Why a request is always yours (null when the orchestrator may answer it). */
export function alwaysYours(r: PendingRequest): string | null {
  for (const [re, what] of NEVER) if (re.test(textOf(r))) return `It is about ${what}, so it always comes to you.`;
  if (r.type === "approval") {
    if (!AUTO_APPROVE_KINDS.has(r.requestKind)) return "Requests like this always come to you.";
    if (r.requestKind === "command" && RISKY_COMMAND.test(r.prompt)) return "This command could remove, move or send things, so it always comes to you.";
  }
  return null;
}

export class Delegate {
  /** advice per request id, for the answer card */
  advice = new Map<string, Advice>();
  onPhase: (threadId: string, phase: Phase | null, text?: string) => void = () => {};
  onChange: () => void = () => {};
  log: Log = { auto: 0, asked: 0, log: [] };
  private seen = new Set<string>();        // request ids already handled (or left to you)
  private queue: { r: PendingRequest; t: WThread }[] = [];
  private working = false;
  private learning = false;
  private phases = new Map<string, Phase>();
  private scope = new URLSearchParams(location.search).get("autoScope");
  private started = Date.now();
  private ready: Promise<void>;
  private projects = new Map<string, string>();

  constructor(private api: Api, private t3: T3 | undefined, private get: () => DelegateState | null, private set: (patch: Partial<DelegateState>) => void) {
    this.ready = this.api.orchDecisions().then((l) => {
      this.log = l;
      for (const d of l.log) { this.seen.add(d.requestId); if (d.advice && (d.outcome === "asked" || d.outcome === "failed")) this.advice.set(d.requestId, d.advice); }
      this.onChange();
    }).catch(() => {});
    window.setInterval(() => void this.learn(), 20_000);
    window.setTimeout(() => void this.learn(), 8_000);
  }

  // only Lucid's own window answers (a page another tool opens with the same build does not)
  private appWindow = new URLSearchParams(location.search).has("app");
  get on() { const s = this.get(); return this.appWindow && !!s && s.auto !== false; }
  get threshold() { return this.get()?.threshold ?? 0.8; }
  phaseOf(threadId: string) { return this.phases.get(threadId) ?? null; }

  private inScope(projectId: string) {
    if (!this.scope) return true;
    return (this.projects.get(projectId) ?? "") === this.scope;
  }

  /** Called with every world refresh: new questions go to the orchestrator first. */
  async observe(threads: WThread[], projects: { id: string; title: string }[]) {
    for (const p of projects) this.projects.set(p.id, p.title);
    const s = this.get();
    if (!s) return;
    await this.ready;
    for (const t of threads) {
      if (!t.question || t.id === s.threadId || !this.inScope(t.projectId)) continue;
      let list: PendingRequest[];
      try { list = await this.api.pendingRequests(t.id); } catch { continue; }
      for (const r of list) {
        if (this.seen.has(r.id) || !r.answerable) continue;
        this.seen.add(r.id);
        // waiting since before Lucid opened: that one was already yours
        if (Date.now() - Date.parse(r.at) > FRESH_MS && Date.parse(r.at) < this.started) continue;
        if (!this.on) continue;
        this.queue.push({ r, t });
      }
    }
    // answered or gone: the robot's scene ends with the request
    for (const [id, ph] of this.phases) {
      const t = threads.find((x) => x.id === id);
      if (!t || !t.question) { this.phases.delete(id); if (ph !== "answered") this.onPhase(id, null); }
    }
    void this.work();
  }

  private phase(threadId: string, p: Phase | null, text?: string) {
    if (p) this.phases.set(threadId, p); else this.phases.delete(threadId);
    this.onPhase(threadId, p, text);
  }

  private async work() {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const { r, t } = this.queue.shift()!;
        try { await this.decide(r, t); } catch (err) { console.error("orchestrator decision failed", err); }
      }
    } finally { this.working = false; }
  }

  private async record(d: Decision) {
    const a = this.advice.get(d.requestId);
    if (a && (d.outcome === "asked" || d.outcome === "failed")) d = { ...d, advice: a };
    try { this.log = await this.api.orchLog(d); } catch {}
    this.onChange();
  }

  private async decide(r: PendingRequest, t: WThread) {
    const s = this.get();
    if (!s || !this.on) return;
    const base = { requestId: r.id, at: new Date().toISOString(), threadId: t.id, title: t.title, project: this.projects.get(t.projectId) ?? "", questions: clip(r.type === "input" ? r.questions.map((q) => q.question || q.header).join(" / ") : r.prompt || r.requestKind, 200) };
    // 1. some things are never answered for you; no model call needed
    const rule = alwaysYours(r);
    if (rule) {
      this.advice.set(r.id, { state: "rule", reason: rule });
      this.phase(t.id, "asked");
      await this.record({ ...base, outcome: "asked", reason: rule, confidence: null });
      return;
    }
    // 2. ask the orchestrator in its own thread
    const fail = async (reason: string) => {
      this.advice.set(r.id, { state: "failed", reason });
      this.phase(t.id, "asked");
      await this.record({ ...base, outcome: "failed", reason, confidence: null });
    };
    let probe;
    try { probe = await this.api.repliesSince(s.threadId, new Date().toISOString()); } catch { probe = null; }
    if (!probe?.exists) return fail("Its thread in T3 is gone, so it could not look at this.");
    const tag = tagOf(r.id);
    let message: string;
    try { message = await this.prompt(tag, r, t); } catch { return fail("Lucid could not read this robot's thread."); }
    this.advice.set(r.id, { state: "deciding", reason: "" });
    this.phase(t.id, "reading");
    const since = new Date(Date.now() - 1000).toISOString();
    try { await this.api.sendMessage({ threadId: s.threadId, message }); } catch { return fail("Lucid could not send the question to it."); }
    const reply = await this.awaitReply(s.threadId, since, tag);
    if (typeof reply === "string") return fail(reply);
    // 3. still waiting for an answer? (you may have answered it meanwhile)
    let still: PendingRequest | undefined;
    try { still = (await this.api.pendingRequests(t.id)).find((x) => x.id === r.id); } catch {}
    const verdict = this.judge(r, reply);
    if (!still) {
      this.advice.delete(r.id);
      this.phase(t.id, null);
      await this.record({ ...base, outcome: "user", reason: "You answered before it decided.", confidence: verdict.confidence, suggestion: verdict.answerText });
      return;
    }
    if (!verdict.send) {
      this.advice.set(r.id, { state: "asked", reason: verdict.reason, suggestion: verdict.suggestion, decision: verdict.decision, answerText: verdict.answerText });
      this.phase(t.id, "asked");
      await this.record({ ...base, outcome: "asked", reason: verdict.reason, confidence: verdict.confidence, suggestion: verdict.answerText });
      return;
    }
    // 4. sure and safe: send it
    try {
      if (!this.t3) throw new Error("not connected");
      await this.t3.respond({ threadId: t.id, requestId: r.id, ...(verdict.answers ? { answers: verdict.answers } : { decision: verdict.decision }) });
    } catch (err: any) {
      this.advice.set(r.id, { state: "failed", reason: `Lucid could not send its answer (${clip(err?.message || "T3 did not answer", 80)}).`, suggestion: verdict.suggestion, decision: verdict.decision, answerText: verdict.answerText });
      this.phase(t.id, "asked");
      await this.record({ ...base, outcome: "failed", reason: "Its answer could not be sent.", confidence: verdict.confidence, suggestion: verdict.answerText });
      return;
    }
    this.advice.set(r.id, { state: "answered", reason: verdict.reason, answerText: verdict.answerText });
    this.phase(t.id, "answered", verdict.answerText);
    await this.record({ ...base, outcome: "answered", reason: verdict.reason, confidence: verdict.confidence, answer: verdict.answerText });
  }

  private async prompt(tag: string, r: PendingRequest, t: WThread) {
    const ctx = await this.api.requestContext(t.id);
    let examples: Example[] = [];
    try { examples = (await this.api.orchAnswers()).examples; } catch {}
    const ask = words(textOf(r));
    const project = this.projects.get(t.projectId) ?? ctx.project;
    const ranked = examples
      .map((e) => { let n = 0; for (const w of words(e.q)) if (ask.has(w)) n++; return { e, n: n + (e.project === project ? 0.5 : 0) + Math.min(e.count, 5) * 0.1 }; })
      .filter((x) => x.n >= 1).sort((a, b) => b.n - a.n).slice(0, 10)
      .map(({ e }) => `- "${clip(e.q, 140)}" -> ${clip(say(e.answer), 80)}${e.count > 1 ? ` (${e.count} times)` : ""}${e.project ? ` [${e.project}]` : ""}`);
    const head = `Lucid decision ${tag}. A robot asked the user something. Decide for the user only if memory.md or the past answers below clearly cover it.
Reply with only this JSON, nothing else, no tools, no file reads:`;
    const robot = `Robot thread: "${clip(ctx.title || t.title, 90)}" in project "${clip(project || "none", 50)}".
${ctx.user ? `The user last told it: "${clip(ctx.user, 300)}"\n` : ""}${ctx.robot ? `It last said: "${clip(ctx.robot, 400)}"\n` : ""}`;
    const past = `Past answers by the user that may be related:\n${ranked.join("\n") || "- (none yet)"}`;
    const rules = `confidence: 0 to 1, how sure you are the user would choose exactly this (below 0.5 when your notes do not cover it). reason: one short line. sensitive: true if it touches money, credentials, publishing, messaging people, deleting data or anything irreversible.`;
    if (r.type === "input") {
      const qs = r.questions.map((q, i) => `${i + 1}. ${clip(q.question || q.header, 300)} (${q.multiSelect ? "pick any" : "pick one"}${q.allowCustomAnswer ? ", own words allowed in other" : ""})\n   options: ${q.options.map((o) => `"${clip(o.label, 60)}"${o.description ? ` (${clip(o.description, 80)})` : ""}`).join(", ") || "(none, answer in other)"}`).join("\n");
      return `${head}
{"request":"${tag}","answers":[{"q":1,"pick":["<option label>"],"other":"","confidence":0.0,"reason":"","sensitive":false}]}
${rules}

${robot}Questions:
${qs}

${past}`;
    }
    return `${head}
{"request":"${tag}","decision":"accept or decline","confidence":0.0,"reason":"","sensitive":false}
${rules}

${robot}It asks for approval (${r.requestKind}):
${clip(r.prompt, 600)}${r.detail ? `\nWhy: ${clip(r.detail, 200)}` : ""}

${past}`;
  }

  /** The orchestrator's JSON reply, or a plain reason why there is none. */
  private async awaitReply(orchId: string, since: string, tag: string): Promise<any | string> {
    const end = Date.now() + WAIT_MS;
    let sawRun = false;
    while (Date.now() < end) {
      await wait(2000);
      let st;
      try { st = await this.api.repliesSince(orchId, since); } catch { continue; }
      if (!st.exists) return "Its thread in T3 is gone.";
      for (const m of [...st.messages].reverse()) {
        if (m.streaming || !m.text.includes(tag)) continue;
        const json = parseReply(m.text, tag);
        if (json) return json;
        return "Its reply was not in the shape Lucid asked for.";
      }
      if (st.runStatus === "running" || st.runStatus === "queued" || st.runStatus === "starting") sawRun = true;
      else if (sawRun && (st.runStatus === "failed" || st.runStatus === "interrupted" || st.runStatus === "cancelled")) return "Its run in T3 stopped before it answered.";
    }
    return "It did not answer within two and a half minutes.";
  }

  /** Turn the reply into answers T3 accepts, and decide whether to send them. */
  judge(r: PendingRequest, j: any): { send: boolean; reason: string; confidence: number | null; answers?: Record<string, string | string[]>; decision?: string; suggestion?: Suggestion; answerText?: string } {
    const min = this.threshold;
    if (r.type === "approval") {
      const decision = String(j.decision || "").toLowerCase() === "accept" ? "accept" : String(j.decision || "").toLowerCase() === "decline" ? "decline" : null;
      const conf = num(j.confidence);
      const reason = clip(String(j.reason || ""), 160) || "No reason given.";
      if (!decision) return { send: false, reason: "Its answer did not say approve or deny.", confidence: conf };
      const text = decision === "accept" ? "Approve" : "Deny";
      if (j.sensitive) return { send: false, reason: `It flagged this as sensitive: ${reason}`, confidence: conf, decision, answerText: text };
      // denying stops the robot's plan: that stays your call
      if (decision === "decline") return { send: false, reason: `It would deny this: ${reason}`, confidence: conf, decision, answerText: text };
      if (conf < min) return { send: false, reason, confidence: conf, decision, answerText: text };
      return { send: true, reason, confidence: conf, decision, answerText: text };
    }
    const list: any[] = Array.isArray(j.answers) ? j.answers : [];
    const answers: Record<string, string | string[]> = {};
    const suggestion: Suggestion = {};
    const texts: string[] = [];
    let low: { conf: number; reason: string } | null = null;
    let problem: string | null = null;
    let sensitive: string | null = null;
    let reasons: string[] = [];
    r.questions.forEach((q: InputQuestion, i) => {
      const a = list.find((x) => Number(x?.q) === i + 1) ?? (r.questions.length === 1 ? list[0] : null);
      if (!a) { problem ??= "It did not answer every question."; return; }
      const conf = num(a.confidence);
      const reason = clip(String(a.reason || ""), 160);
      if (reason) reasons.push(reason);
      // its own doubt comes first: an empty pick with low confidence is "not sure", not a broken reply
      if (!low || conf < low.conf) low = { conf, reason };
      if (a.sensitive) sensitive ??= reason || "it touches something sensitive";
      const picks = (Array.isArray(a.pick) ? a.pick : a.pick ? [a.pick] : []).map((x: unknown) => String(x));
      const picked: string[] = [];
      for (const p of picks) {
        const o = q.options.find((o) => o.label.toLowerCase() === p.toLowerCase().trim()) ?? q.options.find((o) => (o.value ?? "").toLowerCase() === p.toLowerCase().trim());
        if (o) picked.push(o.value ?? o.label); else problem ??= `"${clip(p, 40)}" is not one of the choices.`;
      }
      const other = q.allowCustomAnswer && String(a.other || "").trim() ? clip(String(a.other), 300) : null;
      if (!q.multiSelect && picked.length > 1) problem ??= "It picked several choices where only one is allowed.";
      suggestion[q.id] = { picked: q.multiSelect ? picked : picked.slice(0, 1), other };
      const ans = answerFor(q, q.multiSelect ? picked : picked.slice(0, 1), other);
      if (ans === null) { problem ??= "It left a question unanswered."; return; }
      answers[q.id] = ans;
      const labels = (Array.isArray(ans) ? ans : [ans]).map((v) => q.options.find((o) => (o.value ?? o.label) === v)?.label ?? v);
      texts.push(clip(labels.join(", "), 60));
    });
    const answerText = texts.join("; ") || undefined;
    const all = reasons[0] || "No reason given.";
    const lowest = low as { conf: number; reason: string } | null;
    const conf = lowest ? lowest.conf : null;
    if (sensitive) return { send: false, reason: `It flagged this as sensitive: ${sensitive}`, confidence: conf, suggestion, answerText };
    if (!lowest || lowest.conf < min) return { send: false, reason: lowest?.reason || problem || all, confidence: conf, suggestion, answerText };
    if (problem) return { send: false, reason: problem, confidence: conf, suggestion, answerText };
    return { send: true, reason: all, confidence: conf, answers, suggestion, answerText };
  }

  // --- learning from your answers -----------------------------------------------------------

  private async learn() {
    const s = this.get();
    if (!s || this.learning) return;
    this.learning = true;
    try {
      await this.ready;
      const since = s.answersSince ?? new Date(Date.now() - 3 * 86400_000).toISOString();
      const list = await this.api.resolvedSince(since);
      if (!list.length) return;
      const mine = new Map(this.log.log.map((d) => [d.requestId, d]));
      const examples: unknown[] = [];
      for (const r of list) {
        if (r.threadId === s.threadId || (this.scope && r.project !== this.scope)) continue;
        const d = mine.get(r.id);
        if (d?.outcome === "answered") continue;   // its own answer, not yours
        let given = "";
        if (r.answers) {
          for (const q of r.questions) {
            const a = r.answers[q.id];
            if (a == null || (Array.isArray(a) && !a.length)) continue;
            examples.push({ requestId: r.id, qid: q.id, q: q.question, options: q.options, answer: a, project: r.project, thread: r.title, at: r.at });
            given += (given ? "; " : "") + say(a);
          }
        } else if (r.decision) {
          const yes = r.decision.startsWith("accept");
          examples.push({ requestId: r.id, qid: "decision", q: `Approve: ${clip(r.prompt || r.kind, 160)}`, options: ["Approve", "Deny"], answer: yes ? "Approve" : "Deny", project: r.project, thread: r.title, at: r.at });
          given = yes ? "Approve" : "Deny";
        }
        // a question it passed to you: note what you picked, and whether it guessed right
        if (d && given && d.userAnswer == null) {
          const agreed = d.suggestion ? d.suggestion.toLowerCase() === given.toLowerCase() : null;
          await this.record({ ...d, userAnswer: clip(given, 120), agreed });
        }
      }
      const fresh = examples.length ? await this.api.orchRecord(examples) : 0;
      this.set({ answersSince: list[list.length - 1].at });
      if (fresh) await this.fold();
    } catch (err) {
      console.error("orchestrator learning failed", err);
    } finally { this.learning = false; }
  }

  // Now and then the orchestrator turns your recent answers into lasting notes in memory.md.
  private async fold() {
    const s = this.get();
    if (!s) return;
    const all = (await this.api.orchAnswers()).examples;
    const since = s.folded ?? "";
    const fresh = all.filter((e) => e.last > since);
    if (fresh.length < FOLD_EVERY) return;
    const lines = fresh.slice(-20).map((e) => `- "${clip(e.q, 140)}" -> ${clip(say(e.answer), 80)}${e.count > 1 ? ` (${e.count} times)` : ""}${e.project ? ` [${e.project}]` : ""}`).join("\n");
    await this.api.sendMessage({ threadId: s.threadId, message: `Questions the user answered recently (all are in answers.json). Fold lasting patterns into memory.md under "Answering questions", skip one-offs, and reply with one line:\n\n${lines}` });
    this.set({ folded: fresh.reduce((m, e) => (e.last > m ? e.last : m), since) });
  }
}

function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }

/** The JSON object with this tag from a reply that may wrap it in prose or a code fence. */
export function parseReply(text: string, tag: string): any | null {
  const at = text.indexOf(tag);
  for (let start = text.lastIndexOf("{", at); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { const j = JSON.parse(text.slice(start, i + 1)); if (j && j.request === tag) return j; } catch {}
        break;
      }
    }
  }
  return null;
}

// --- the list of recent decisions ------------------------------------------------------------

const escH = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function ago(iso: string) {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString();
}
function outcomeLine(d: Decision) {
  const sure = d.confidence != null ? ` (${Math.round(d.confidence * 100)}% sure)` : "";
  if (d.outcome === "answered") return `<p class="dl-out"><b>Sent: ${escH(d.answer ?? "")}</b>${sure}</p><p class="dl-why">${escH(d.reason)}</p>`;
  if (d.outcome === "user") return `<p class="dl-out">You answered before it decided.${d.suggestion ? ` It would have said ${escH(d.suggestion)}${sure}.` : ""}</p>`;
  const head = d.outcome === "failed" ? `Asked you: it could not decide.` : `Asked you${sure}.`;
  const sug = d.suggestion ? ` Its suggestion: ${escH(d.suggestion)}.` : "";
  const you = d.userAnswer != null ? `<p class="dl-you">You picked ${escH(d.userAnswer)}${d.agreed === true ? ", the same as its suggestion." : d.agreed === false ? "." : "."}</p>` : `<p class="dl-you">Waiting for your answer.</p>`;
  return `<p class="dl-out"><b>${head}</b>${sug}</p><p class="dl-why">${escH(d.reason)}</p>${you}`;
}

export function showDecisions(dg: Delegate, setThreshold: (v: number) => void) {
  const steps = [0.7, 0.8, 0.9, 0.95];
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap";
  const list = dg.log.log.slice(0, 40);
  wrap.innerHTML = `<div class="dialog notebook decisions" role="dialog" aria-modal="true" aria-labelledby="dl-title">
    <h2 id="dl-title">Questions it handled</h2>
    <p class="nb-sub">Answers it sent cannot be taken back. Anything it was not sure about, or that touches money, credentials, publishing, messages to people or things that cannot be undone, comes to you.</p>
    <div class="dl-sure"><span id="dl-sure-l">Answers on its own when at least</span><div class="chips" role="radiogroup" aria-labelledby="dl-sure-l">${steps.map((v) => `<button type="button" role="radio" aria-checked="${Math.abs(v - dg.threshold) < 0.001}" data-v="${v}">${Math.round(v * 100)}% sure</button>`).join("")}</div></div>
    <div class="nb-body dl-list">${list.length ? list.map((d) => `<article class="dl-item">
      <p class="dl-head"><span class="dl-robot">${escH(d.title)}${d.project ? ` <span class="dl-proj">${escH(d.project)}</span>` : ""}</span><time datetime="${escH(d.at)}">${ago(d.at)}</time></p>
      <p class="dl-q">${escH(d.questions)}</p>${outcomeLine(d)}</article>`).join("") : "<p class=\"dl-empty\">No questions yet. When a robot asks something, it goes to the Orchestrator first and shows up here.</p>"}</div>
    <div class="dialog-actions"><button type="button" class="primary" data-a="close">Close</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => { window.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLButtonElement>(".dl-sure button[data-v]");
    if (chip) {
      setThreshold(Number(chip.dataset.v));
      wrap.querySelectorAll<HTMLButtonElement>(".dl-sure button").forEach((b) => b.setAttribute("aria-checked", String(b === chip)));
      return;
    }
    if (t === wrap || t.closest('[data-a="close"]')) close();
  });
  (wrap.querySelector('[data-a="close"]') as HTMLElement).focus();
}
