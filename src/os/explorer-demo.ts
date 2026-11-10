// Isolated check page for the robot Explorer and the "attach files in a message" hand-over.
// It runs the production FilesApp, window manager, T3 Code composer and send choreography against a
// real fixture folder on disk. The script that drives it (scripts/review/render-explorer-checks.cjs) supplies
// real directory listings, real file facts and recorded tool steps; nothing is uploaded or sent.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import { WM } from "./wm";
import { FilesApp } from "./explorer";
import { classify } from "./classify";
import { T3CodeApp } from "../harness/t3code";
import { attachmentsOf, sourcesFor, type RecordedItem } from "./attachment-source";
import { playSend, type DiskFact, type SendOutcome } from "./send-files";
import { listingProblem } from "./explorer-model";
import { setRenderView } from "../perf/render";

const style = document.createElement("style");
style.textContent = `
  body { overflow: hidden; background: #141a33; }
  #stage { padding: 10px; }
  .d-screen { position: relative; width: 820px; height: 461px; border-radius: 10px; overflow: hidden; transform-origin: 0 0; }
`;
document.head.appendChild(style);

type Fixture = {
  root: string;
  listings: Record<string, string>;
  glob: { base: string; output: string };
  search: { query: string; path: string; output: string };
  items: RecordedItem[];
  sendId: string;
  disk: DiskFact[];
  message: string;
  problems: { missing: { path: string; output: string }; denied: { path: string; output: string }; empty: { path: string }; long: { path: string } };
};

const counters = { sendMessage: 0, startThread: 0, saveAttachment: 0, statFiles: 0 };
const lucid = ((window as any).lucid ??= {});
lucid.threads = async () => [];
lucid.sendMessage = async () => { counters.sendMessage++; throw new Error("The check page never sends"); };
lucid.startThread = async () => { counters.startThread++; throw new Error("The check page never starts threads"); };
lucid.saveAttachment = async () => { counters.saveAttachment++; throw new Error("The check page never uploads"); };

const robotLog: string[] = [];
const robot = () => ({
  setPose(p: string) { robotLog.push(`pose:${p}`); }, mouseTo() {}, lookAt() {}, click() { robotLog.push("click"); }, pressKey(k: string) { if (k.length > 1) robotLog.push(`key:${k}`); }, setTyping() {},
}) as any;

let wm!: WM; let files!: FilesApp; let chat!: T3CodeApp; let fx!: Fixture;
const stage = document.getElementById("stage")!;

function mount(prefs: Record<string, unknown> = {}) {
  stage.replaceChildren();
  const el = document.createElement("div");
  el.className = "d-screen";
  stage.appendChild(el);
  wm = new WM(el, robot());
  wm.prefs = { launch: "dock", windows: "floating", tidiness: "tidy", ...prefs } as any;
  wm.speed = 1.6;
  files = new FilesApp(wm);
  chat = new T3CodeApp(wm, "user");
  chat.setInfo({ id: "own", title: "Share the evidence", projectTitle: "Fixture project", provider: "claudeAgent", model: "claude-opus-5-5", effort: "high" });
  return el;
}

const entriesOf = (dir: string) => {
  const act = classify(`Get-ChildItem -LiteralPath "${dir}"`, fx.listings[dir] || "", fx.root);
  if (act.kind !== "list") throw new Error("classify did not read the listing");
  return act;
};

const sendOutcome = (result: SendOutcome, delay = 700) => () => new Promise<SendOutcome>((r) => setTimeout(() => r(result), delay));
const stateOf = () => ({
  bubbles: document.querySelectorAll(".t3-msg").length,
  sentFiles: document.querySelectorAll(".t3-sentfiles .t3-sf").length,
  drafts: document.querySelectorAll(".t3-atts .t3-att").length,
  draftState: (document.querySelector(".t3-atts") as HTMLElement | null)?.dataset.state ?? null,
  failedText: document.querySelector(".t3-att .t3-attst")?.textContent ?? "",
  composerText: document.querySelector(".t3-typed")?.textContent ?? "",
});

const api = {
  counters, robotLog,
  async init(fixture: Fixture, prefs: Record<string, unknown> = {}) { fx = fixture; mount(prefs); (window as any).__phase = "ready"; },

  /** The Explorer walks down the real tree, one listing per folder, the way a shell result arrives. */
  async walk(dirs: string[]) {
    for (const dir of dirs) {
      const act = entriesOf(dir);
      await files.list(act.path, act.entries, fx.root);
      await wm.sleep(250);
    }
    return { folder: document.querySelector(".fx-crumbs")?.textContent, rows: document.querySelectorAll(".fx-row").length };
  },
  async glob() {
    const lines = fx.glob.output.split(/\r?\n/).filter(Boolean);
    await files.matches(fx.glob.base, lines, fx.root);
    return { folder: document.querySelector(".fx-crumbs")?.textContent, selected: document.querySelector(".fx-row.sel .n")?.textContent ?? null };
  },
  async search() {
    const act = classify(`rg ${JSON.stringify(fx.search.query)}`, fx.search.output, fx.root);
    if (act.kind !== "search") throw new Error("classify did not read the search");
    await files.search(fx.search.query, fx.search.path, act.hits, fx.root);
    return { hitFiles: document.querySelectorAll(".fx-hit-file").length, selected: document.querySelector(".fx-row.sel .n")?.textContent ?? null };
  },
  async problems() {
    const p = fx.problems;
    await files.list(p.missing.path, [], fx.root, { problem: listingProblem(p.missing.output) });
    const missing = document.querySelector(".fx-empty")?.textContent ?? "";
    await wm.sleep(300);
    await files.list(p.denied.path, [], fx.root, { problem: listingProblem(p.denied.output) });
    const denied = document.querySelector(".fx-empty")?.textContent ?? "";
    await wm.sleep(300);
    await files.list(p.empty.path, [], fx.root, { problem: null });
    const empty = document.querySelector(".fx-empty")?.textContent ?? "";
    await wm.sleep(300);
    await files.list(p.long.path, [{ name: "a-file-whose-name-is-deliberately-long-so-the-row-must-truncate-and-offer-the-full-name-in-a-tooltip.json", dir: false, size: "2.1 KB" }], fx.root);
    return { missing, denied, empty, crumbs: document.querySelector(".fx-crumbs")?.textContent, title: (document.querySelector(".fx-row .n") as HTMLElement | null)?.parentElement?.getAttribute("title") ?? "" };
  },

  /** The agent sends its files: folder opened, files selected, dragged to the message box, sent. */
  async attach(result: SendOutcome, opts: { instant?: boolean; delay?: number } = {}) {
    const input = fx.items.find((i) => i.id === fx.sendId)!.data.input;
    const sources = sourcesFor(attachmentsOf(input), fx.items, fx.root);
    const outcome = sendOutcome(result, opts.delay ?? 900);
    const r = await playSend({ wm, files, chat, root: fx.root, sources, disk: fx.disk, text: () => fx.message, outcome, instant: opts.instant });
    return { result: r, sources: sources.map((s) => ({ name: s.attachment.name, path: s.path, how: s.how })), ...stateOf() };
  },
  state: stateOf,
  sources() {
    const input = fx.items.find((i) => i.id === fx.sendId)!.data.input;
    return sourcesFor(attachmentsOf(input), fx.items, fx.root);
  },

  /** The same screen at the camera distances where text becomes lines, shapes and a single icon. */
  tier(width: number) {
    const screen = wm.root.parentElement as HTMLElement;
    screen.style.transform = `scale(${width / 820})`;
    setRenderView(wm.root, true, width);
    return width;
  },
  async legacy() {
    const modules = import.meta.glob("./legacy-files-before.ts");
    const load = Object.values(modules)[0];
    if (!load) return null;
    const { LegacyFilesApp } = (await load()) as any;
    const old = new LegacyFilesApp(wm);
    for (const dir of [fx.root, ...Object.keys(fx.listings).filter((d) => d !== fx.root).slice(0, 2)]) {
      const act = entriesOf(dir);
      await old.list(act.path, act.entries, fx.root);
      await wm.sleep(250);
    }
    return true;
  },
};
(window as any).__demo = api;
(window as any).__phase = "loaded";
