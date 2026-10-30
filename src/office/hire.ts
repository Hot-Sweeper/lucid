import gsap from "gsap";
import type { RobotProfile } from "./roster";
import { brandFor, logoFor, harnessName } from "./brand";

// The hiring screen: pick who sits at a free desk (a free teammate or a new hire),
// which model it runs, and what it should do.

export type HireChoice = { robotId: string | null; provider: string; model: string | null; projectId: string; task: string };
type Project = { id: string; title: string };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SHELL: Record<string, [string, string]> = { codex: ["#f2f4fa", "#c9cee3"], claude: ["#f6ecdc", "#e2cfb4"], grok: ["#2a2a2e", "#151517"], generic: ["#c9d3e6", "#9aa7c2"] };

// A small head portrait: the back of the robot's head with its logo, like at the desk.
export function avatar(provider: string, accent = "#ff9f5a", size = 56) {
  const b = brandFor(provider), [shell, shade] = SHELL[b] ?? SHELL.generic, logo = logoFor(provider);
  const mask = b === "codex";
  const id = Math.random().toString(36).slice(2, 8);
  return `<svg class="av" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="${shell}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
    ${logo && mask ? `<mask id="m${id}" maskContentUnits="userSpaceOnUse"><image href="${logo}" x="22" y="24" width="20" height="20"/></mask>` : ""}</defs>
    <rect x="30.5" y="4" width="3" height="10" rx="1.5" fill="${shade}"/><circle cx="32" cy="5" r="4" fill="${accent}"/>
    <circle cx="10" cy="34" r="6" fill="${shade}"/><circle cx="54" cy="34" r="6" fill="${shade}"/>
    <rect x="10" y="12" width="44" height="40" rx="15" fill="url(#g${id})"/>
    <path d="M18 18 Q30 13 42 15" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    ${logo ? (mask ? `<rect x="22" y="24" width="20" height="20" fill="${shade === "#151517" ? "#fff" : "#8f98bd"}" mask="url(#m${id})"/>` : `<image href="${logo}" x="23" y="25" width="18" height="18"/>`)
      : `<rect x="24" y="26" width="16" height="16" rx="4" fill="${shade}"/><rect x="28" y="30" width="8" height="8" rx="2" fill="${shell}"/>`}
  </svg>`;
}

export function openHire(opts: {
  room: string; roomTitle: string; seat: number;
  team: RobotProfile[];                       // free teammates
  providers: string[];                         // harnesses you can hire from
  models: Record<string, string[]>;
  projects: Project[] | null;                  // asked only when the office is not a project's own
  onHire: (c: HireChoice) => Promise<void>;
}) {
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap hire-wrap";
  const cands = [
    ...opts.team.map((r) => ({ key: r.id, robotId: r.id as string | null, provider: r.provider, name: r.name, note: `${r.jobs} ${r.jobs === 1 ? "job" : "jobs"} done`, accent: r.look.accent })),
    ...opts.providers.map((p) => ({ key: `new:${p}`, robotId: null, provider: p, name: `New ${harnessName(p)} robot`, note: "Fresh hire", accent: "#ff9f5a" })),
  ];
  wrap.innerHTML = `
    <form class="dialog hire" role="dialog" aria-modal="true" aria-labelledby="hire-title">
      <h2 id="hire-title">Who works at this desk?</h2>
      <p class="hire-sub">${esc(opts.roomTitle)}, desk ${opts.seat + 1}</p>
      <div class="hire-cands" role="radiogroup" aria-label="Robot">
        ${cands.map((c, i) => `<button type="button" role="radio" aria-checked="${i === 0}" class="cand" data-k="${esc(c.key)}">${avatar(c.provider, c.accent)}<b>${esc(c.name)}</b><span>${esc(c.note)}</span></button>`).join("")}
      </div>
      <div class="hire-row"><span class="hire-label">Model</span><div class="chips" role="radiogroup" aria-label="Model"></div></div>
      ${opts.projects ? `<div class="hire-row"><span class="hire-label">Project</span><div class="chips proj" role="radiogroup" aria-label="Project">${opts.projects.map((p, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-p="${esc(p.id)}">${esc(p.title)}</button>`).join("")}</div></div>` : ""}
      <label class="hire-task"><span class="hire-label">Task</span><textarea rows="3" placeholder="What should it build?"></textarea></label>
      <p class="hire-msg" role="status"></p>
      <div class="dialog-actions"><button type="button" class="ghost" data-a="cancel">Cancel</button><button type="submit" class="primary">Start working</button></div>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form") as HTMLFormElement;
  let pick = cands[0];
  let model: string | null = null;
  const chips = form.querySelector(".chips:not(.proj)") as HTMLElement;
  const renderModels = () => {
    const list = opts.models[pick.provider] ?? [];
    model = list[0] ?? null;
    chips.innerHTML = list.length
      ? list.slice(0, 6).map((m, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-m="${esc(m)}">${esc(m)}</button>`).join("")
      : `<span class="hire-none">Its usual model</span>`;
  };
  renderModels();
  form.querySelector(".hire-cands")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".cand") as HTMLElement | null;
    if (!b) return;
    pick = cands.find((c) => c.key === b.dataset.k)!;
    form.querySelectorAll(".cand").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    gsap.fromTo(b.querySelector(".av"), { y: 0 }, { y: -6, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.out" });
    renderModels();
  });
  chips.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-m]") as HTMLElement | null;
    if (!b) return;
    model = b.dataset.m!;
    chips.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  });
  let project = opts.projects?.[0]?.id ?? "";
  form.querySelector(".chips.proj")?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-p]") as HTMLElement | null;
    if (!b) return;
    project = b.dataset.p!;
    form.querySelectorAll(".chips.proj [data-p]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  });
  const close = () => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="cancel"]')) close(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = form.querySelector("textarea") as HTMLTextAreaElement;
    const msg = form.querySelector(".hire-msg") as HTMLElement;
    const task = ta.value.trim();
    if (!task) { msg.textContent = "Give it a task first."; ta.focus(); return; }
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    msg.textContent = `${pick.name} is walking over…`;
    try {
      await opts.onHire({ robotId: pick.robotId, provider: pick.provider, model, projectId: project, task });
      close();
    } catch (err: any) {
      msg.textContent = `Could not start: ${err?.message || err}. Your task text is still here.`;
      btn.disabled = false;
    }
  });
  gsap.fromTo(form, { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.6)" });
  gsap.from(form.querySelectorAll(".cand"), { opacity: 0, y: 10, duration: 0.3, stagger: 0.04, delay: 0.1 });
  (form.querySelector("textarea") as HTMLTextAreaElement).focus();
}
