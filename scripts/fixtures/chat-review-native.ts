import { ChatPanel } from "../../src/office/chat-panel";
import { showReport } from "../../src/office/report";
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../../src/styles.css";
import "../../src/office/office.css";
import "../../src/office/panels.css";
import "../../src/office/managers.css";

let chat: any, input: any, messages: any[] = [], papers: any[] = [];
const writes: any[] = [], opened: string[] = [];
const checks: string[] = [];
const check = (value: unknown, label: string) => { if (!value) throw Error(label); checks.push(label); };
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const message = (id: string, text: string, streaming = false) => ({ id, role: "assistant", at: "2026-11-02T21:20:19.555Z", streaming, attachments: [], text });
const list = () => chat.el.querySelector(".cp-list") as HTMLElement;
async function set(next: any[]) { messages = next; await chat.refresh(); }
async function setup(data: any) {
  input = data; papers = [input.real, input.visual];
  (window as any).lucid = {
    reportsList: async () => papers,
    reportsManual: async (...args: any[]) => { writes.push(args); return { humanAnswers: { 0: { answer: args[2].answer } } }; },
  };
  chat = new ChatPanel(document.getElementById("app")!, {
    conversation: async () => messages, sendMessage: async () => { throw Error("No live sends"); },
    saveAttachment: async () => { throw Error("No saves"); }, reviewPapers: async () => papers,
    openReview: (p, questions) => { void showReport(p.threadId, p.title, () => opened.push(p.threadId), p.id, id => opened.push(id), questions); },
    openReviewThread: p => { opened.push(p.threadId); },
  });
  chat.el.classList.add("open"); chat.desk = { threadId: "review", planSteps: [] };
  chat.el.querySelector(".cp-who b").textContent = "Orchestrator";
  chat.el.querySelector(".cp-who span").textContent = "Lucid";
  chat.el.querySelector(".cp-logo").hidden = true;
  chat.el.querySelector(".cp-view").hidden = true;
  chat.setManager(null);
  chat.setStatus("Idle", "idle");
  await set([message("example", JSON.stringify(input.example))]); list().scrollTop = 0;
  await document.fonts.ready;
}
async function example() {
  check(chat.el.querySelector(".cp-review h3")?.textContent === "Review on hold", "Supplied example renders truthful hold");
  check(chat.el.querySelector(".cp-review-original code").textContent === messages[0].text && !chat.el.querySelector(".cp-review-original").open, "Original response stays exact and collapsed");
  check(JSON.stringify(input.example) === messages[0].text, "Source message text is unchanged");
  chat.el.querySelector("[data-review-thread]").click();
  check(opened[0] === input.real.threadId, "Source link opens actual source conversation");
  chat.el.querySelector("[data-review-open]").click(); await wait();
  check(document.querySelector(".settlement-paper")?.textContent?.includes(input.real.title), "Saved report opens actual production report dialog");
  document.querySelector<HTMLButtonElement>("[data-close]")!.click();
}
async function visual() { await set([message("visual", JSON.stringify(input.visual.verdict))]); list().scrollTop = 0; }
async function captures() {
  chat.el.querySelector(".cp-review-images").scrollIntoView({ block: "center" }); await wait(250);
  const images = [...chat.el.querySelectorAll(".cp-review-images img")] as HTMLImageElement[];
  check(images.length > 1 && images.every(i => i.complete && i.naturalWidth > 0), "Genuine archived before/after captures decode through production protocol");
}
let imageButton: HTMLButtonElement, imageHeight = 0;
async function preview() {
  imageHeight = chat.el.querySelector(".cp-review-images").getBoundingClientRect().height;
  imageButton = chat.el.querySelector(".cp-review-images button"); imageButton.focus(); imageButton.click(); await wait(100);
  check(chat.el.querySelector(".cp-zoom").open && chat.el.querySelector(".cp-zoom img").naturalWidth > 0, "Capture opens actual in-product preview");
}
async function closePreview() {
  chat.el.querySelector(".cp-zoom").close(); await wait();
  check(document.activeElement === imageButton, "Preview restores keyboard focus");
  check(Math.abs(chat.el.querySelector(".cp-review-images").getBoundingClientRect().height - imageHeight) < 1, "Image preview preserves reserved capture geometry");
}
function narrow() { check(list().scrollWidth <= list().clientWidth + 1, "Content fits 360px chat"); }
async function regression() {
  const raw = JSON.stringify(input.example), fence = String.fromCharCode(96).repeat(3);
  for (const [label, text, role] of [["prose", "Ordinary **prose**", "assistant"], ["code", fence + "json\n" + raw + "\n" + fence, "assistant"], ["user", raw, "user"], ["unrelated", JSON.stringify({ ...input.example, report: "111111111111111111111111" }), "assistant"], ["partial", raw.slice(0, 90), "assistant"], ["trailing", raw + " trailing text", "assistant"]]) {
    const html = chat.render({ ...message(label, text), role });
    check(!html.includes('class="cp-review"'), label + " remains ordinary message content");
  }
  await set([message("stream", raw.slice(0, 90), true)]);
  check(chat.el.querySelector(".cp-review-progress")?.textContent.includes("Review in progress"), "Known partial report streams calmly");
  await set([message("stream", raw, true)]);
  check(!!chat.el.querySelector(".cp-review-progress"), "Complete JSON waits for stream completion");
  await set([message("stream", raw)]);
  check(chat.el.querySelector(".cp-review h3").textContent === "Review on hold", "Completed stream becomes report");
  const unsafe = { ...input.example, summary: '<img src=x onerror="window.injected=true"><script>window.injected=true</script>', before: ["javascript:alert(1)"], after: ["C:/missing-chat-review-capture.png"] };
  await set([message("unsafe", JSON.stringify(unsafe))]); await wait(100);
  check(!(window as any).injected && !chat.el.querySelector(".cp-review [onerror],.cp-review script"), "Report prose remains sanitized");
  check(chat.el.querySelectorAll(".cp-review-images .cp-media-unavailable").length === 2 && !chat.el.querySelector(".cp-review-images img"), "Unsafe and missing captures have readable fallbacks");
  const loader = chat.api.reviewPapers; chat.reviewPapers.clear(); chat.reviewLookups.clear();
  chat.api.reviewPapers = async () => { throw Error("Fixture report history unavailable"); };
  await set([message("lookup-failure", raw)]);
  check(!chat.el.querySelector(".cp-review") && chat.el.querySelector(".cp-text").textContent.includes('"humanChecks"'), "History lookup failure preserves original message");
  chat.api.reviewPapers = loader; await chat.refresh();
  check(!!chat.el.querySelector(".cp-review"), "Successful history retry renders unchanged message");
  const savedPapers = papers;
  papers = []; chat.reviewPapers.clear(); chat.reviewLookups.clear();
  await set([message("awaiting-saved-report", raw)]);
  check(!chat.el.querySelector(".cp-review"), "Verdict without a saved paper retains ordinary rendering");
  papers = savedPapers; await chat.refresh();
  check(!!chat.el.querySelector(".cp-review"), "Later saved paper formats the unchanged verdict without reopening chat");
  await longReport();
  list().scrollTop = 300; const anchor = chat.shown.get("history-8"), top = anchor.getBoundingClientRect().top, scroll = list().scrollTop;
  const original = chat.shown.get("long"); original.querySelector("details").open = true; await chat.refresh();
  check(original === chat.shown.get("long") && original.querySelector("details").open, "Unchanged refresh retains report node and disclosure");
  await set([...messages, { ...message("new", "Later response"), at: "2026-11-02T15:02:00Z" }]);
  check(Math.abs(anchor.getBoundingClientRect().top - top) < 1 && Math.abs(list().scrollTop - scroll) < 1, "New replies preserve older reader position");
  chat.renderHistory([{ ...message("older", "Loaded earlier history"), at: "2026-11-02T11:00:00Z" }, ...messages], true);
  check(Math.abs(anchor.getBoundingClientRect().top - top) < 1, "Prepending older history preserves reader anchor");
  original.querySelector("details").open = false; original.scrollIntoView({ block: "start" }); narrow();
}
async function longReport() {
  const long = { ...input.example, summary: Array(5).fill(input.example.summary).join("\n\n"), checks: Array.from({ length: 18 }, (_, i) => "Check " + (i + 1) + ": " + input.example.checks[i % 4]), feedback: Array(3).fill(input.example.feedback).join("\n\n") };
  const history = Array.from({ length: 24 }, (_, i) => ({ ...message("history-" + i, "Earlier conversation " + i + " with readable history."), at: new Date(Date.UTC(2026, 10, 2, 12, i)).toISOString() }));
  await set([...history, { ...message("long", JSON.stringify(long)), at: "2026-11-02T15:00:00Z" }]);
  chat.shown.get("long").scrollIntoView({ block: "start" });
}
async function human() {
  const manual = { ...input.real, id: "222222222222222222222222", status: "manual-review", verdict: { ...input.example, report: "222222222222222222222222", decision: "manual", humanChecks: [{ question: "Fixture only: can you confirm your physical device?", instructions: "Synthetic workflow check, not an actual pending user request." }] } };
  papers.push(manual); await set([message("manual", JSON.stringify(manual.verdict))]);
  chat.el.querySelector("[data-review-questions]").focus(); chat.el.querySelector("[data-review-questions]").click(); await wait();
  check(document.activeElement?.matches("[data-human-answer]") && (document.activeElement as HTMLSelectElement).value === "" && writes.length === 0, "Answer questions focuses unanswered actual questionnaire, with no fabricated answer");
}
async function answerAndStale() {
  const select = document.querySelector<HTMLSelectElement>("[data-human-answer]")!;
  select.value = "unable"; select.dispatchEvent(new Event("change")); await wait();
  check(writes.length === 1 && writes[0][1] === "human-answer" && writes[0][2].answer === "unable", "Existing human-answer action receives only explicit fixture selection");
  document.querySelector<HTMLButtonElement>("[data-close]")!.click();
  let resolve!: (p: any[]) => void; chat.reviewPapers.clear(); chat.reviewLookups.clear();
  chat.api.reviewPapers = () => new Promise(r => { resolve = r; });
  messages = [message("stale", JSON.stringify(input.example))]; const pending = chat.refresh(); await wait();
  chat.clearTranscript(); chat.desk = { threadId: "other", planSteps: [] }; resolve(papers); await pending;
  check(chat.reviewPapers.size === 0 && !chat.el.querySelector(".cp-review"), "Late report lookup cannot populate another conversation");
}
(window as any).fixture = { setup, example, visual, captures, preview, closePreview, narrow, regression, longReport, human, answerAndStale, checks };
