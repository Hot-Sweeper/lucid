// T3 Code on the robot's monitor: the app its thread really lives in. Two builds exist, T3 Code
// (stable) and T3 Code (Nightly); robots run the one the user runs (see installedT3Channel). Layout, colours and
// wording follow the T3 Code web UI as bundled in the desktop app (late October 2026 nightly):
// a sidebar with the wordmark, search and thread rows; the thread with your messages, work rows
// ("Ran npm test", "Edited app.ts +12 -3"), "Working for 12s" and "Worked for 1m 2s"; and the
// composer with its model and effort. Nightly paints the night sky artwork behind the sidebar header.
// Notes and sources: RESEARCH.md, "T3 Code".
import gsap from "gsap";
import type { AppId } from "../os/wm";
import { CHAT_TITLE } from "../brand";
import { harnessKind, prettyModel, effortWord } from "./themes";
import { logoSvg } from "./logos";
import { ICONS } from "../os/icons";
import "./t3code.css";
import { scheduleLayout } from "./layout";
import { presentationFrame, renderFps } from "../perf/render";
import { watchClock } from "../perf/clock";

export type T3Channel = "stable" | "nightly";

/** Official T3 mark, the path from T3 Code's own T3Wordmark component. */
const T3_PATH = "M33.4509 93V47.56H15.5309V37H64.3309V47.56H46.4109V93H33.4509ZM86.7253 93.96C82.832 93.96 78.9653 93.4533 75.1253 92.44C71.2853 91.3733 68.032 89.88 65.3653 87.96L70.4053 78.04C72.5386 79.5867 75.0186 80.8133 77.8453 81.72C80.672 82.6267 83.5253 83.08 86.4053 83.08C89.6586 83.08 92.2186 82.44 94.0853 81.16C95.952 79.88 96.8853 78.12 96.8853 75.88C96.8853 73.7467 96.0586 72.0667 94.4053 70.84C92.752 69.6133 90.0853 69 86.4053 69H80.4853V60.44L96.0853 42.76L97.5253 47.4H68.1653V37H107.365V45.4L91.8453 63.08L85.2853 59.32H89.0453C95.9253 59.32 101.125 60.8667 104.645 63.96C108.165 67.0533 109.925 71.0267 109.925 75.88C109.925 79.0267 109.099 81.9867 107.445 84.76C105.792 87.48 103.259 89.6933 99.8453 91.4C96.432 93.1067 92.0586 93.96 86.7253 93.96Z";
const T3_MARK = `<svg class="t3-mark" viewBox="15.5309 37 94.3941 56.96" aria-label="T3"><path d="${T3_PATH}" fill="currentColor"/></svg>`;

// Night sky colours: T3's --stage-night-* tokens (default theme), converted from OKLCH.
const NIGHT = { top: "#32155b", mid: "#151443", bottom: "#07152f", highlight: "#4ea4ff", secondary: "#696fea", tertiary: "#a85bea", line: "#e4eaff", glowH: "#5165d8", glowS: "#283075", sparkle: "#c8d7ff" };
// Stars and sparkles of T3's NightlySkyArt (one 288 x 96 tile).
const STARS: [number, number, number, number][] = [[14, 10, .6, .85], [38, 22, .4, .55], [58, 8, .5, .7], [84, 16, .4, .5], [104, 7, .6, .8], [126, 20, .4, .55], [148, 11, .5, .7], [170, 24, .4, .5], [192, 9, .6, .8], [214, 18, .4, .55], [236, 8, .5, .7], [258, 20, .45, .6], [278, 11, .55, .75], [26, 34, .4, .45], [118, 34, .4, .45], [202, 32, .4, .5], [268, 34, .4, .45]];
const SPARKLES: [number, number][] = [[70, 28], [160, 36], [246, 26]];

/** The sidebar header artwork of T3 Code (Nightly): sky gradient, glow, stars and two soft clouds. */
function nightSky(id: string) {
  const s = STARS.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r * 1.6}" fill="${NIGHT.line}" fill-opacity="${o}"/>`).join("");
  const k = SPARKLES.map(([x, y]) => `<path d="M${x - 2.4} ${y}H${x + 2.4}M${x} ${y - 2.4}V${y + 2.4}"/>`).join("");
  return `<svg class="t3-sky" viewBox="0 0 288 96" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
<defs>
<linearGradient id="${id}-sky" x1="24" y1="0" x2="264" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="${NIGHT.bottom}"/><stop offset=".5" stop-color="${NIGHT.mid}"/><stop offset="1" stop-color="${NIGHT.top}"/></linearGradient>
<radialGradient id="${id}-glow" cx="0" cy="0" r="1" gradientTransform="translate(216 18) rotate(137) scale(120 84)" gradientUnits="userSpaceOnUse"><stop stop-color="${NIGHT.glowH}" stop-opacity=".4"/><stop offset=".5" stop-color="${NIGHT.glowS}" stop-opacity=".16"/><stop offset="1" stop-color="${NIGHT.bottom}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-cloud" x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="${NIGHT.highlight}" stop-opacity=".5"/><stop offset=".52" stop-color="${NIGHT.secondary}" stop-opacity=".62"/><stop offset="1" stop-color="${NIGHT.tertiary}" stop-opacity=".5"/></linearGradient>
</defs>
<rect width="288" height="96" fill="url(#${id}-sky)"/><rect width="288" height="96" fill="url(#${id}-glow)"/>
<g>${s}</g><g stroke="${NIGHT.sparkle}" stroke-linecap="round" stroke-opacity=".75" stroke-width=".9">${k}</g>
<path d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z" fill="url(#${id}-cloud)"/>
<path d="M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z" fill="url(#${id}-cloud)" fill-opacity=".8"/>
</svg>`;
}

/** Dock, Spotlight and title bar icon: the app icon of each build (white T3 on black, or on the night sky). */
export function t3Icon(channel: T3Channel) {
  const mark = `<svg x="4.2" y="7" width="15.6" height="9.4" viewBox="15.5309 37 94.3941 56.96"><path d="${T3_PATH}" fill="#fff"/></svg>`;
  if (channel === "stable") return `<svg class="ico" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.5" fill="#0b0b0c"/>${mark}</svg>`;
  return `<svg class="ico" viewBox="0 0 24 24" style="clip-path:inset(0 round 22.916667%)"><defs><linearGradient id="t3n-ico" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d1a3c"/><stop offset=".6" stop-color="#1b1650"/><stop offset="1" stop-color="#3a1a66"/></linearGradient></defs><rect width="24" height="24" rx="5.5" fill="url(#t3n-ico)"/><circle cx="5" cy="4.4" r=".45" fill="#e4eaff"/><circle cx="16.5" cy="3.6" r=".4" fill="#e4eaff"/><path d="M8.6 3.4v1.6M7.8 4.2h1.6" stroke="#c8d7ff" stroke-width=".45"/><path d="M14 24c.3-2.6 2-4.2 4-4.2.6-1.6 2-2.6 3.6-2.6 1 0 1.8.3 2.4.9V24Z" fill="#7a5fd6" fill-opacity=".75"/><path d="M0 24v-3.4c.8-.9 2-1.3 3.2-1 .8-1.5 2.4-2.3 4-2 1.5.3 2.6 1.4 2.9 2.9 1 .1 1.8.9 2 2.1.1.5.1 1 0 1.4Z" fill="#4f6fd8" fill-opacity=".8"/>${mark}</svg>`;
}
export const t3Title = (channel: T3Channel) => (channel === "nightly" ? "T3 Code (Nightly)" : "T3 Code");

// The build the user really runs, read by the backend from T3's own files. Stable until it answers
// (and in demos without the bridge), then the same for every robot.
let installed: T3Channel = "stable";
ICONS.t3code = t3Icon(installed);
void Promise.resolve((window as any).lucid?.t3Channel?.()).then((c) => {
  if (c !== "nightly" && c !== "stable") return;
  installed = c;
  ICONS.t3code = t3Icon(c);
}).catch(() => {});
export const installedT3Channel = () => installed;

// --- small icons, drawn to match the Lucide set T3 uses (stroked, round caps) ----------------
const I = (d: string, extra = "") => `<svg class="t3-i" viewBox="0 0 24 24" aria-hidden="true"${extra}>${d}</svg>`;
const IC = {
  panel: I(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 9l-3 3 3 3"/>`),
  search: I(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`),
  filter: I(`<path d="M3 6h18M7 12h10M10 18h4"/>`),
  folder: I(`<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6M9 13h6"/>`),
  compose: I(`<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>`),
  chev: I(`<path d="m9 18 6-6-6-6"/>`),
  clip: I(`<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5"/>`),
  up: I(`<path d="M12 19V5M5 12l7-7 7 7"/>`),
  check: I(`<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`),
  term: I(`<path d="m4 17 6-6-6-6M12 19h8"/>`),
  file: I(`<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>`),
  edit: I(`<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`),
  globe: I(`<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>`),
  brain: I(`<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 .5 5.6A3 3 0 0 0 8 19a3 3 0 0 0 4 1V5Z"/><path d="M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1-.5 5.6A3 3 0 0 1 16 19a3 3 0 0 1-4 1"/>`),
  tool: I(`<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>`),
  bot: I(`<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 14h.01M16 14h.01"/>`),
  alert: I(`<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>`),
  ask: I(`<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>`),
  side: I(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>`),
  bottom: I(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/>`),
  list: I(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>`),
};

/** A turning arc (T3's working icon). The element stays put; only text around it changes, so it never restarts. */
const SPIN = `<svg class="t3-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`;

// ---------------------------------------------------------------------------------------------
/** A file in the composer or in a sent message: its icon, a picture when the real file can be shown, its size. */
export type DraftFile = { name: string; icon: string; thumb?: string | null; size?: string };

export interface T3Host {
  epoch: number;
  /** A fixed build, for demo pages that show both side by side. */
  channel?: T3Channel;
  robotName?: string;
  robot: { setTyping(on: boolean): void; setPose(p: any): void };
  open(id: AppId, title?: string, clicked?: boolean): Promise<{ el: HTMLElement; body: HTMLElement; title: HTMLElement }>;
  pointAt?(el: HTMLElement, x?: number, y?: number): Promise<void>;
  click?(): Promise<void>;
  brandApp?(id: AppId, o: { title?: string; icon?: string }): void;
  sleep(ms: number, epoch?: number): Promise<void>;
  check?(epoch: number): void;
  waitForOperator?(epoch?: number): Promise<void>;
}

export interface T3Info { id?: string; title?: string; provider?: string; model?: string | null; effort?: string | null; projectTitle?: string; root?: string; run?: { status: string } | null }
type ListThread = { id: string; title: string; projectTitle?: string; updatedAt?: string; provider?: string; runStatus?: string | null };

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }
function md(text: string) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "<u>$1</u>")
    .replace(/^#{1,4} (.+)$/gm, "<strong>$1</strong>")
    .replace(/^[-*] (.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
function ago(iso?: string) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
/** Project badge as T3 draws it without a favicon: initials on a tint of a colour picked from the name. */
function avatar(name: string) {
  const n = (name || "?").trim();
  // a thread without a project gets T3's dashed square
  if (!name || n === "No project") return `<span class="t3-av t3-none"></span>`;
  const words = n.split(/[\s_-]+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : n.length > 2 ? n[0] + n[n.length - 1] : n).toUpperCase();
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="t3-av" style="--av:hsl(${h} 80% 66%)">${esc(ini)}</span>`;
}
function harnessLogo(provider?: string) {
  const kind = harnessKind(provider);
  const svg = logoSvg(kind);
  return svg ? `<span class="t3-hl" data-k="${kind}">${svg}</span>` : "";
}

// Other threads in the sidebar are your real ones (one shared fetch for every desk).
let listCache: { at: number; p: Promise<ListThread[]> } | null = null;
function threadList(): Promise<ListThread[]> {
  const api = (window as any).lucid;
  if (!api?.threads) return Promise.resolve([]);
  if (!listCache || Date.now() - listCache.at > 20000) listCache = { at: Date.now(), p: Promise.resolve(api.threads()).catch(() => []) };
  return listCache.p;
}

/** One work row: how T3 names a step ("Ran", "Read", "Edited", "Searched the web"...). */
interface Row { el: HTMLElement; type: string }

export class T3CodeApp {
  private root: HTMLElement;
  private side!: HTMLElement;
  private list!: HTMLElement;
  private crumbs!: HTMLElement;
  private feed!: HTMLElement;
  private scroller!: HTMLElement;
  private statusEl!: HTMLElement;
  private statusText!: HTMLElement;
  private comp!: HTMLElement;
  private compText!: HTMLElement;
  private chip!: HTMLElement;
  private send!: HTMLElement;
  private atts!: HTMLElement;
  private drafts: DraftFile[] = [];
  private draftRevision = 0;
  private channel: T3Channel | null = null;
  private info: T3Info = {};
  private group: { el: HTMLElement; rows: HTMLElement; head: HTMLElement; start: number } | null = null;
  private rows = new Map<string, Row>();
  private runStart = 0;
  private running = false;
  private stopClock: (() => void) | null = null;
  private others: ListThread[] = [];
  private uid = `t3-${Math.random().toString(36).slice(2, 8)}`;

  constructor(private wm: T3Host, private audience: "agents" | "user" = "agents") {
    this.root = document.createElement("div");
    this.root.className = audience === "user" ? "t3 lucid-chat" : "t3";
    this.build();
  }

  private chan(): T3Channel { return this.wm.channel ?? installed; }

  private build() {
    this.root.innerHTML = `
      <aside class="t3-side">
        <div class="t3-head"><span class="t3-art"></span>${IC.panel}<span class="t3-wm">${T3_MARK}<span class="t3-code">Code</span></span></div>
        <div class="t3-search">${IC.search}<span>Search</span><span class="t3-tools">${IC.filter}${IC.folder}${IC.compose}</span></div>
        <div class="t3-list"></div>
      </aside>
      <section class="t3-main">
        <header class="t3-top"><span class="t3-crumbs"></span><span class="t3-panes">${IC.list}${IC.bottom}${IC.side}</span></header>
        <div class="t3-scroll"><div class="t3-feed"></div></div>
        <div class="t3-foot">
          <div class="t3-status" hidden>${SPIN}<span class="t3-st"></span></div>
          <div class="t3-comp">
            <div class="t3-atts" hidden></div><div class="t3-field"><span class="t3-ph">Ask anything. @ files, $ skills, / commands</span><span class="t3-typed"></span><span class="t3-dots"><i></i><i></i><i></i></span></div>
            <div class="t3-row">${IC.clip}<span class="t3-chip"></span><span class="t3-send">${IC.up}<i class="t3-stop"></i></span></div>
          </div>
        </div>
      </section>`;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.side = q(".t3-side");
    this.list = q(".t3-list");
    this.crumbs = q(".t3-crumbs");
    this.feed = q(".t3-feed");
    this.scroller = q(".t3-scroll");
    this.statusEl = q(".t3-status");
    this.statusText = q(".t3-st");
    this.comp = q(".t3-comp");
    this.compText = q(".t3-typed");
    this.chip = q(".t3-chip");
    this.send = q(".t3-send");
    this.atts = q(".t3-atts");
    if (this.audience === "user") { q(".t3-ph").textContent = "Message you"; q(".t3-panes").textContent = CHAT_TITLE; }
  }

  /** Builds differ in branding only: the window name and icon, and Nightly's sky behind the sidebar header. */
  private brand() {
    if (this.audience === "user") return;
    const c = this.chan();
    if (c === this.channel) return;
    this.channel = c;
    this.root.dataset.channel = c;
    (this.root.querySelector(".t3-art") as HTMLElement).innerHTML = c === "nightly" ? nightSky(this.uid) : "";
    this.wm.brandApp?.("t3code", { title: t3Title(c), icon: t3Icon(c) });
  }

  private async ensure(clicked = false) {
    this.brand();
    const w = await this.wm.open(this.audience === "user" ? "chat" : "t3code", this.audience === "user" ? CHAT_TITLE : t3Title(this.chan()), clicked);
    if (this.root.parentElement !== w.body) w.body.replaceChildren(this.root);
    this.renderSide();
    return w;
  }

  /** Thread title, project, harness, model and run state from T3. */
  setInfo(info: T3Info) {
    this.brand();
    this.info = { ...this.info, ...info };
    const was = this.running;
    this.running = this.audience === "agents" && info.run?.status === "running";
    if (this.running && !was) this.runStart = Date.now();
    if (!this.running && was) this.endRun();
    this.renderTop();
    this.renderChip();
    this.renderStatus();
    if (this.audience === "agents") void threadList().then((l) => { this.others = l; this.renderSide(); });
    if (this.running && !this.stopClock) this.stopClock = watchClock(this.root, () => this.tick(), 1000);
    else if (!this.running) { this.stopClock?.(); this.stopClock = null; }
  }

  reset() {
    this.clearDrafts();
    this.holdDraft("");
    this.feed.replaceChildren();
    this.rows.clear();
    this.group = null;
    this.running = false;
    this.stopClock?.(); this.stopClock = null;
    this.renderStatus();
  }

  private tick() {
    if (!this.running) return;
    this.renderStatus();
    this.paintElapsed();
  }

  private paintElapsed() {
    const el = this.list.querySelector(".t3-th.own .t3-el") as HTMLElement | null;
    const text = `Working ${dur(Date.now() - this.runStart)}`;
    if (el && el.textContent !== text) el.textContent = text;
  }

  private renderTop() {
    const proj = this.info.projectTitle || (this.info.root ? base(this.info.root) : "");
    const signature = JSON.stringify([proj, this.info.title]);
    if (signature === this.topSig) return;
    this.topSig = signature;
    this.crumbs.innerHTML = `${proj ? `${avatar(proj)}<span class="t3-proj">${esc(proj)}</span><span class="t3-sep">/</span>` : ""}<span class="t3-tt"></span>`;
    const tt = this.crumbs.querySelector(".t3-tt") as HTMLElement;
    tt.textContent = this.info.title || "New thread";
    tt.title = tt.textContent;
  }

  private renderChip() {
    const model = prettyModel(this.info.model) || "";
    const eff = effortWord(this.info.effort || "", true);
    const signature = JSON.stringify([this.info.provider, model, eff]);
    if (signature !== this.chipSig) {
      this.chipSig = signature;
      this.chip.innerHTML = `${harnessLogo(this.info.provider)}<span></span>`;
      (this.chip.lastElementChild as HTMLElement).textContent = [this.info.provider || "Harness unavailable", model || "Model unavailable", eff || "Effort unavailable"].join(" / ");
    }
    this.send.classList.toggle("busy", this.running);
  }

  private renderStatus() {
    if (this.statusEl.hidden === this.running) this.statusEl.hidden = !this.running;
    if (this.running) {
      const text = `Working for ${dur(Date.now() - this.runStart)}`;
      if (this.statusText.textContent !== text) this.statusText.textContent = text;
    }
    this.send.classList.toggle("busy", this.running);
  }

  private topSig = "";
  private chipSig = "";

  // Sidebar: recent threads on top, then the Working section with this robot's own thread.
  private renderSide() {
    const ownId = this.info.id;
    const own: ListThread = { id: ownId || "own", title: this.info.title || "New thread", projectTitle: this.info.projectTitle, provider: this.info.provider, runStatus: this.running ? "running" : "completed", updatedAt: new Date().toISOString() };
    const rest = this.others.filter((t) => t.id !== ownId);
    const working = rest.filter((t) => t.runStatus === "running");
    const recent = rest.filter((t) => t.runStatus !== "running");
    const row = (t: ListThread, isOwn: boolean) => {
      const run = isOwn ? this.running : t.runStatus === "running";
      const when = run
        ? `<span class="t3-when t3-working">${SPIN}${isOwn ? `<span class="t3-el"></span>` : "<span>Working</span>"}</span>`
        : isOwn ? `<span class="t3-when t3-done">${IC.check}<span>Done</span></span>` : `<span class="t3-when">${ago(t.updatedAt)}</span>`;
      return `<div class="t3-th${isOwn ? " own" : ""}" data-id="${esc(t.id)}"><div class="t3-l1">${avatar(t.projectTitle || "")}<span class="t3-pn">${esc(t.projectTitle || "No project")}</span>${when}</div><div class="t3-l2"><span class="t3-tn" title="${esc(t.title || "")}">${esc(t.title || "Untitled")}</span>${harnessLogo(t.provider)}</div></div>`;
    };
    const top = (this.running ? recent : [own, ...recent]).slice(0, this.running ? 4 : 5);
    const work = this.running ? [own, ...working].slice(0, 3) : working.slice(0, 2);
    let html = top.map((t) => row(t, t === own)).join("");
    html += `<div class="t3-spacer"></div>`;
    if (work.length) html += `<div class="t3-sec"><span>Working</span><span class="t3-n">${work.length}</span>${IC.chev}</div>` + work.map((t) => row(t, t === own)).join("");
    // only rebuild when something changed, so spinners keep turning
    if (html !== this.sideSig) { this.sideSig = html; this.list.innerHTML = html; }
    this.paintElapsed();
  }
  private sideSig = "";

  // --- the conversation --------------------------------------------------------------------
  private stick() {
    const s = this.scroller;
    scheduleLayout(s, () => {
      const target = Math.max(0, s.scrollHeight - s.clientHeight);
      return Math.abs(target - s.scrollTop) < 0.5 ? null : () => { s.scrollTop = target; };
    });
  }

  private appear(el: HTMLElement, from: gsap.TweenVars = { opacity: 0, y: 8 }) {
    gsap.fromTo(el, from, { opacity: 1, y: 0, x: 0, duration: 0.35, ease: "power2.out", clearProps: "transform" });
  }

  /** Your message, on the right, the way T3 shows it. */
  async user(text: string, images: string[] = [], clicked = false) {
    await this.ensure(clicked);
    this.youTyping(false);
    this.closeGroup();
    const b = document.createElement("div");
    b.className = "t3-you";
    b.innerHTML = `${images.length ? `<div class="t3-imgs">${images.slice(0, 4).map((src) => `<img src="${esc(src)}" alt="">`).join("")}</div>` : ""}${text ? `<p>${md(text.slice(0, 1200))}</p>` : ""}`;
    this.feed.append(b);
    this.appear(b, { opacity: 0, y: 10 });
    this.stick();
    await this.wm.sleep(500);
  }

  /** Earlier messages of the thread, above what is being replayed (shown at once, oldest first). */
  history(list: { role: string; text: string; images: string[] }[]) {
    if (!list.length || this.feed.querySelector(".t3-past")) return;
    const box = document.createElement("div");
    box.className = "t3-past";
    for (const m of list) {
      const b = document.createElement("div");
      if (m.role === "user") {
        b.className = "t3-you";
        b.innerHTML = `${m.images.length ? `<div class="t3-imgs">${m.images.slice(0, 4).map((src) => `<img src="${esc(src)}" alt="">`).join("")}</div>` : ""}${m.text ? `<p>${md(m.text.slice(0, 1200))}</p>` : ""}`;
      } else {
        b.className = "t3-msg";
        b.innerHTML = md(m.text.slice(0, 2400));
      }
      box.append(b);
    }
    this.feed.prepend(box);
    this.stick();
  }

  /** The robot's reply streams into the thread while it types. */
  async assistant(getText: () => { text: string; done: boolean }, compose = this.audience === "user", files: DraftFile[] = []) {
    const wm = this.wm, e = wm.epoch;
    await this.ensure();
    this.closeGroup();
    const p = document.createElement("div");
    p.className = "t3-msg";
    if (compose) p.hidden = true;
    this.feed.append(p);
    let shown = 0;
    let painted = "";
    try {
      for (;;) {
        await wm.waitForOperator?.(e);
        const { text, done } = getText();
        wm.robot.setTyping(!done);
        // A delivered reply is already written. Do not replay it at typing speed
        // or let a finished run sit here waiting on stale streaming metadata.
        if (done) {
          shown = text.length;
          if (compose) this.compText.textContent = text;
          else p.innerHTML = md(text);
          this.stick();
          break;
        }
        if (shown < text.length) {
          shown = Math.min(text.length, shown + Math.max(3, Math.ceil((text.length - shown) / 30)));
          if (renderFps(compose ? this.root : p)) {
            painted = text.slice(0, shown);
            if (compose) { this.compText.textContent = painted; this.comp.classList.add("composing"); }
            else p.innerHTML = md(painted);
            this.stick();
          }
          await presentationFrame(compose ? this.root : p);
          if (wm.check) wm.check(e); else await wm.sleep(0, e);
        } else if (done) break;
        else {
          if (renderFps(compose ? this.root : p) && painted !== text) { painted = text; if (compose) this.compText.textContent = text; else p.innerHTML = md(text); this.stick(); }
          await wm.sleep(120, e);
        }
      }
      if (compose && (getText().text.trim() || files.length)) { this.send.classList.add("sending"); await wm.pointAt?.(this.send); await wm.click?.(); await wm.sleep(180, e); }
    } finally {
      this.send.classList.remove("sending"); this.comp.classList.remove("composing"); this.compText.textContent = ""; p.hidden = false;
      wm.robot.setTyping(false);
      const t = getText().text;
      if (t.trim()) p.innerHTML = md(t);
      const delivered = files.length > 0 && wm.epoch === e;
      if (delivered) { p.insertAdjacentHTML("beforeend", this.sentFiles(files)); this.clearDrafts(); }
      if (!t.trim() && !delivered) p.remove();
      this.stick();
    }
  }

  /** A reply that already exists, added without bringing the window up; a longer version of the latest one replaces it. */
  reply(text: string) {
    if (!text.trim()) return;
    const last = this.feed.lastElementChild as HTMLElement | null;
    if (last?.classList.contains("t3-msg") && last.dataset.reply === "1") { last.innerHTML = md(text); this.stick(); return; }
    this.closeGroup();
    const p = document.createElement("div");
    p.className = "t3-msg";
    p.dataset.reply = "1";
    p.innerHTML = md(text);
    this.feed.append(p);
    this.appear(p);
    this.stick();
  }

  // --- files in the composer ---------------------------------------------------------------------
  /** The window opened and in front, the way the robot gets there. */
  async show() { return this.ensure(); }
  get composer() { return this.comp; }
  get clipButton() { return this.root.querySelector(".t3-row > :first-child") as HTMLElement; }
  get draftCount() { return this.drafts.length; }
  dropHint(on: boolean) { this.comp.classList.toggle("drop", on); }

  private draftChip(f: DraftFile) {
    const art = f.thumb ? `<img alt="" src="${esc(f.thumb)}">` : f.icon;
    return `<span class="t3-att" title="${esc(f.name)}"><span class="t3-atti">${art}</span><span class="t3-attn">${esc(f.name)}</span>${f.size ? `<span class="t3-atts-size">${esc(f.size)}</span>` : ""}<span class="t3-attst"></span></span>`;
  }
  private sentFiles(files: DraftFile[]) {
    return `<div class="t3-sentfiles">${files.map((f) => f.thumb
      ? `<span class="t3-sf pic" title="${esc(f.name)}"><img alt="${esc(f.name)}" src="${esc(f.thumb)}"></span>`
      : `<span class="t3-sf" title="${esc(f.name)}"><span class="t3-atti">${f.icon}</span><span class="t3-attn">${esc(f.name)}</span>${f.size ? `<span class="t3-atts-size">${esc(f.size)}</span>` : ""}</span>`).join("")}</div>`;
  }
  /** Files dropped into the composer. They stay there, as a draft, until the message really goes. */
  addDrafts(files: DraftFile[]) {
    this.draftRevision++;
    const before = this.drafts.length;
    this.drafts.push(...files);
    this.atts.hidden = false;
    this.atts.insertAdjacentHTML("beforeend", files.map((f) => this.draftChip(f)).join(""));
    const added = Array.from(this.atts.children).slice(before);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(added, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.26, ease: "back.out(2)", clearProps: "transform" });
  }
  /** The send is under way, was refused, or is back to a plain draft. */
  setDraftState(state: "ready" | "sending" | "failed") {
    this.atts.dataset.state = state;
    for (const mark of Array.from(this.atts.querySelectorAll(".t3-attst"))) mark.innerHTML = state === "sending" ? SPIN : state === "failed" ? "Not sent" : "";
  }
  clearDrafts() { this.draftRevision++; this.drafts = []; this.atts.replaceChildren(); this.atts.hidden = true; delete this.atts.dataset.state; }
  /** A late recorded result updates only its original draft, without reopening a window or sending. */
  followDraft(outcome: () => "sent" | "failed" | "pending") {
    const revision = this.draftRevision, epoch = this.wm.epoch;
    const live = () => this.root.isConnected && this.wm.epoch === epoch && this.draftRevision === revision && this.drafts.length > 0;
    return { live, refresh: () => {
      if (!live()) return false;
      const state = outcome();
      if (state === "pending") return true;
      if (state === "failed") this.setDraftState("failed");
      else {
        this.closeGroup();
        const p = document.createElement("div"); p.className = "t3-msg";
        p.innerHTML = md(this.compText.textContent || "") + this.sentFiles(this.drafts);
        this.feed.append(p); this.clearDrafts(); this.holdDraft(""); this.stick();
      }
      return false;
    } };
  }
  /** A message that could not be sent stays in the composer, text and files, so nothing is lost. */
  holdDraft(text: string) {
    this.compText.textContent = text;
    this.comp.classList.toggle("composing", !!text.trim());
  }

  /** You are typing to this robot: dots in the thread's composer. */
  async youTyping(on: boolean) {
    this.comp.classList.toggle("you-typing", on);
  }

  /** A real tool result, kept separate from this worker's own conversation. */
  async inspection(title: string, body: string) {
    await this.ensure();
    const panel = document.createElement("details");
    panel.className = "t3-inspection";
    panel.open = true;
    const heading = document.createElement("summary"); heading.textContent = title;
    const content = document.createElement("pre"); content.textContent = body.slice(0, 12000) || "No readable content returned.";
    panel.append(heading, content); this.feed.append(panel); this.stick();
  }

  /** A question for you (T3's "Input" state) or an error in the run. */
  async note(text: string, kind: "ask" | "error" = "ask") {
    await this.ensure();
    const b = document.createElement("div");
    b.className = `t3-note t3-${kind}`;
    b.innerHTML = `<div class="t3-nh">${kind === "ask" ? IC.ask : IC.alert}<span>${kind === "ask" ? "Input needed" : "Error"}</span></div><p>${md(text)}</p>`;
    this.feed.append(b);
    this.appear(b);
    this.stick();
    if (kind === "ask") { const own = this.list.querySelector(".t3-th.own .t3-when"); if (own) { own.className = "t3-when t3-input"; own.innerHTML = `${IC.ask}<span>Input</span>`; this.sideSig = ""; } }
  }

  // --- work rows --------------------------------------------------------------------------------
  private openGroup() {
    if (this.group) return this.group;
    const el = document.createElement("div");
    el.className = "t3-work open";
    const head = document.createElement("div");
    head.className = "t3-wh";
    const rows = document.createElement("div");
    rows.className = "t3-rows";
    el.append(head, rows);
    this.feed.append(el);
    this.group = { el, rows, head, start: Date.now() };
    return this.group;
  }

  /** Work before a reply folds into "Worked for 20s", like T3 does once the reply follows. */
  private closeGroup() {
    const g = this.group;
    if (!g) return;
    this.group = null;
    g.head.innerHTML = `<span>Worked for ${dur(Date.now() - g.start)}</span>${IC.chev}`;
    g.el.classList.remove("open");
  }

  private endRun() {
    this.closeGroup();
    this.renderStatus();
  }

  /** A thread item as a work row, or an update to one already shown. */
  activity(it: { id: string; type: string; status?: string; data?: any }) {
    const r = this.describe(it);
    if (!r) return;
    let row = this.rows.get(it.id);
    if (!row) {
      if (it.type === "reasoning") {
        // T3 folds consecutive thoughts into one "Thought" row
        const last = this.group?.rows.lastElementChild as HTMLElement | null;
        if (last?.dataset.type === "reasoning") { this.rows.set(it.id, { el: last, type: it.type }); return; }
      }
      const g = this.openGroup();
      const el = document.createElement("div");
      el.className = "t3-wr";
      el.dataset.type = it.type;
      g.rows.append(el);
      while (g.rows.children.length > 40) g.rows.firstElementChild!.remove();
      row = { el, type: it.type };
      this.rows.set(it.id, row);
      this.paintRow(el, r);
      this.appear(el, { opacity: 0, y: 4 });
      this.stick();
      return;
    }
    this.paintRow(row.el, r);
  }

  /** New state of an item that already has a row; items without one are left alone. */
  update(it: { id: string; type: string; status?: string; data?: any }) {
    const row = this.rows.get(it.id);
    if (!row || it.type === "reasoning") return;
    const r = this.describe(it);
    if (r) this.paintRow(row.el, r);
  }

  private paintRow(el: HTMLElement, r: { icon: string; verb: string; target: string; add?: number; del?: number; fail?: boolean; live?: boolean }) {
    el.classList.toggle("fail", !!r.fail);
    el.classList.toggle("live", !!r.live);
    el.innerHTML = `${r.icon}<span class="t3-v">${esc(r.verb)}</span>${r.target ? `<span class="t3-tg"></span>` : ""}${r.add || r.del ? `<span class="t3-add">+${r.add || 0}</span><span class="t3-del">-${r.del || 0}</span>` : ""}`;
    const tg = el.querySelector(".t3-tg") as HTMLElement | null;
    if (tg) { tg.textContent = r.target; tg.title = r.target; }
  }

  private describe(it: { type: string; status?: string; data?: any }): { icon: string; verb: string; target: string; add?: number; del?: number; fail?: boolean; live?: boolean } | null {
    const d = it.data || {};
    const live = it.status === "running" || it.status === "pending";
    switch (it.type) {
      case "command_execution": {
        const cmd = String(d.input || d.command || "").replace(/\s+/g, " ").trim().slice(0, 160);
        const fail = !live && d.exitCode != null && d.exitCode !== 0;
        return { icon: IC.term, verb: live ? "Running" : fail ? "Failed" : "Ran", target: cmd || "command", fail, live };
      }
      case "file_change": {
        const ch = d.changes?.length ? d.changes : [{ path: d.fileName || d.path || "file", operation: "update" }];
        const diff = String(d.diffStr || d.diff || d.unifiedDiff || "");
        let add = 0, del = 0;
        for (const l of diff.split("\n")) { if (/^\+(?!\+\+)/.test(l)) add++; else if (/^-(?!--)/.test(l)) del++; }
        const op = ch[0]?.operation;
        const verb = op === "add" ? "Created" : op === "delete" ? "Deleted" : "Edited";
        const target = ch.length > 1 ? `${ch.length} files` : base(String(ch[0]?.path || "file"));
        return { icon: IC.edit, verb, target, add, del, live };
      }
      case "web_search": {
        const q = d.query || d.input?.query || (Array.isArray(d.queries) ? d.queries[0] : "") || "";
        return { icon: IC.globe, verb: "Searched the web", target: String(q).slice(0, 120), live };
      }
      case "reasoning":
        return { icon: IC.brain, verb: live ? "Thinking" : "Thought", target: "", live };
      case "subagent":
        return { icon: IC.bot, verb: "Subagent", target: String(d.title || d.prompt || "").slice(0, 120), live };
      case "dynamic_tool": {
        const name = String(d.toolName || "tool");
        const inp = d.input || {};
        const short = name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "").replace(/^.*__/, "");
        if (/t3_thread_send(?:_attachments)?$/.test(short)) return { icon: IC.list, verb: live ? "Sending a message" : "Sent a message", target: String(inp.message || 'Attachments').slice(0, 100), live };
        if (/t3_thread_read$/.test(short)) return { icon: IC.list, verb: live ? "Reading T3 thread" : "Read T3 thread", target: String(inp.title || inp.threadId || "Current thread"), live };
        if (/t3_thread_list$/.test(short)) return { icon: IC.list, verb: live ? "Finding T3 threads" : "Listed T3 threads", target: String(inp.projectId || "All projects"), live };
        if (/computer|cua|preview_/.test(short)) return { icon: IC.globe, verb: live ? "Using computer" : "Used computer", target: String(inp.url || inp.title || inp.action || short), live };
        if (/^(Read|read_file|view)$/i.test(short)) return { icon: IC.file, verb: live ? "Reading" : "Read", target: base(String(inp.file_path || inp.path || "")), live };
        if (/^(Grep|Glob|search)$/i.test(short)) return { icon: IC.search, verb: "Searched files", target: String(inp.pattern || inp.query || "").slice(0, 100), live };
        if (/^(Edit|Write|MultiEdit)$/i.test(short)) return { icon: IC.edit, verb: short === "Write" ? "Created" : "Edited", target: base(String(inp.file_path || inp.path || "")), live };
        if (/^(Agent|Task)$/.test(short)) return { icon: IC.bot, verb: "Subagent", target: String(inp.description || inp.subagent_type || "").slice(0, 100), live };
        if (/^(WebFetch|fetch)$/i.test(short)) return { icon: IC.globe, verb: "Fetched", target: String(inp.url || "").replace(/^https?:\/\//, "").slice(0, 100), live };
        if (/^(WebSearch)$/i.test(short)) return { icon: IC.globe, verb: "Searched the web", target: String(inp.query || "").slice(0, 100), live };
        const words = short.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
        return { icon: IC.tool, verb: words ? words[0].toUpperCase() + words.slice(1) : "Tool", target: "", live };
      }
      default:
        return null;
    }
  }
}
