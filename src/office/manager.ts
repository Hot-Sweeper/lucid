// Project managers: robots whose thread is pinned in T3 Code. They keep their project's logo and
// colour, wear a crown and a badge (see managerSvg in world/look.ts) and sit at an executive desk:
// walnut top with a leather mat, a lamp and a trophy (drawn with the desk), two tall side screens
// and a gold name plate. The left screen shows the real plan, the right one its project's team.
import { esc } from "../os/typing";
import type { ManagerMark } from "./rig";
import "./manager.css";

export type TeamMate = { title: string; status: "working" | "waiting" | "idle" };
export type ManagerInfo = { title: string; icon: string | null; role: string | null; team: TeamMate[] };

// --- the project's colour ---------------------------------------------------------------
const colors = new Map<string, string>();
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** A stable colour from the project's name, for projects without a (coloured) logo. */
export function nameColor(title: string) {
  let h = 7;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (h % 360) / 360, s = 0.55, l = 0.52;
  const f = (n: number) => { const k = (n + hue * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** The strongest colour in the project's logo. Returns the best known colour now; `done` hears the real one once the logo is read. */
export function projectColor(title: string, icon: string | null, done?: (color: string) => void): string {
  const key = `${title}|${icon?.length ?? 0}`;
  const known = colors.get(key);
  if (known) return known;
  const fallback = nameColor(title);
  if (!icon || !done) return fallback;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, 32, 32);
      const px = x.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 140) continue;
        const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
        const sat = mx ? (mx - mn) / mx : 0, wt = sat * sat * (mx / 255);
        r += px[i] * wt; g += px[i + 1] * wt; b += px[i + 2] * wt; w += wt;
      }
      // a logo with no real colour (black or white): the name colour instead
      const out = w > 1.5 ? hex(r / w, g / w, b / w) : fallback;
      colors.set(key, out);
      done(out);
    } catch { colors.set(key, fallback); }
  };
  img.onerror = () => colors.set(key, fallback);
  img.src = icon;
  return fallback;
}

export const monogram = (title: string) => title.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "P";
export const markOf = (m: ManagerInfo, color: string): ManagerMark => ({ color, logo: m.icon, mono: monogram(m.title) });

// --- the desk decoration -------------------------------------------------------------------
const DOT: Record<TeamMate["status"], string> = { working: "#51a2ff", waiting: "#ffb347", idle: "#6f7a93" };

export class ManagerDecor {
  el: HTMLElement;
  private plan: { text: string; status: string }[] = [];
  private info: ManagerInfo | null = null;
  private rug: HTMLElement;

  constructor(desk: HTMLElement) {
    const el = document.createElement("div");
    el.className = "boss";
    el.hidden = true;
    el.innerHTML = `
      <div class="boss-mon l"><div class="bm-scr"><header>Plan</header><div class="bm-body"></div></div><i></i></div>
      <div class="boss-mon r"><div class="bm-scr"><header><img alt="" hidden><span class="bm-mono" hidden></span><b></b></header><div class="bm-body"></div></div><i></i></div>
      <div class="boss-sign"><b></b><span></span></div>`;
    // right after the desk drawing: above the table, behind the monitor and the robot
    const anchor = desk.querySelector(".desk-glow");
    desk.insertBefore(el, anchor);
    // a rug in the project's colour under the chair, below everything else on the desk
    const rug = document.createElement("div");
    rug.className = "boss-rug";
    rug.hidden = true;
    desk.insertBefore(rug, desk.firstChild);
    this.rug = rug;
    this.el = el;
  }

  setPlan(steps: { text: string; status: string }[]) {
    this.plan = steps;
    this.paintPlan();
  }

  private paintPlan() {
    const body = this.el.querySelector(".boss-mon.l .bm-body") as HTMLElement, m = this.info;
    if (!this.plan.length) {
      body.innerHTML = m?.icon ? `<img class="bm-logo" alt="" src="${esc(m.icon)}">` : `<div class="bm-bigmono">${esc(m ? monogram(m.title) : "")}</div>`;
      return;
    }
    body.innerHTML = `<ol>${this.plan.slice(0, 7).map((s) => `<li class="${s.status === "completed" ? "done" : s.status === "running" || s.status === "in_progress" ? "on" : ""}"><i></i><span>${esc(s.text)}</span></li>`).join("")}</ol>`;
  }

  update(m: ManagerInfo | null, color: string) {
    this.info = m;
    this.el.hidden = !m;
    this.rug.hidden = !m;
    if (!m) return;
    this.el.style.setProperty("--mgr", color);
    this.rug.style.setProperty("--mgr", color);
    const r = this.el.querySelector(".boss-mon.r") as HTMLElement;
    const img = r.querySelector("img") as HTMLImageElement, mono = r.querySelector(".bm-mono") as HTMLElement;
    img.hidden = !m.icon;
    if (m.icon) img.src = m.icon;
    mono.hidden = !!m.icon;
    mono.textContent = monogram(m.title);
    r.querySelector("header b")!.textContent = m.title;
    (r.querySelector(".bm-body") as HTMLElement).innerHTML = m.team.length
      ? `<ul>${m.team.map((t) => `<li><i style="background:${DOT[t.status]}"></i><span>${esc(t.title)}</span></li>`).join("")}</ul>`
      : `<p>No other threads in this project</p>`;
    const sign = this.el.querySelector(".boss-sign") as HTMLElement;
    sign.querySelector("b")!.textContent = m.role || "Project manager";
    sign.querySelector("span")!.textContent = m.title;
    sign.title = [m.role, m.title].filter(Boolean).join(", ");
    this.paintPlan();
  }
}
