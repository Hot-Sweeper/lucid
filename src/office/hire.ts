import gsap from "gsap";
import { HOBBY_LABEL, Roster, type RobotProfile } from "./roster";
import { brandFor, harnessName } from "./brand";
import type { RobotLook } from "./rig";
import { portraitSvg } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import { openCustomize, savedLevel } from "./customize";

// The hiring screen: pick who sits at a free desk (a free teammate or a new hire),
// which model it runs, and what it should do.

export type HireChoice = { robotId: string | null; provider: string; model: string | null; projectId: string; task: string; role: Role | null };
export type Role = { name: string; brief: string };
export const BUILTIN_ROLES: Role[] = [
  { name: "Reviewer", brief: "You are a careful code reviewer. Read the relevant code and changes, point out real bugs and risky spots with file and line, and suggest concrete fixes. Do not rewrite things that work." },
  { name: "Test writer", brief: "You write focused automated tests. Find the behavior that matters, cover the edge cases, run the tests, and fix only the tests unless a real bug shows up (then report it)." },
  { name: "UI designer", brief: "You care about polished, readable interfaces. Follow the existing visual language, check real content and states, avoid generic template styling, and verify the result visually." },
  { name: "Researcher", brief: "You research before building. Look things up, compare options, cite sources, and finish with a short recommendation instead of code unless asked." },
];
type Project = { id: string; title: string };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A small portrait: the robot's face with its hat, eyes, tint and colors.
export function avatar(provider: string, look: RobotLook = {}, size = 66) {
  return portraitSvg(look, PALETTES[brandFor(provider)], { size });
}

export function openHire(opts: {
  room: string; roomTitle: string; seat: number;
  team: RobotProfile[];                       // free teammates
  providers: string[];                         // harnesses you can hire from
  models: Record<string, string[]>;
  prices?: Record<string, { input: number; output: number }>;
  roles: Role[];
  onNewRole: (r: Role) => void;
  projects: Project[] | null;                  // asked only when the office is not a project's own
  onHire: (c: HireChoice) => Promise<void>;
  level?: number;                              // company level, unlocks rare looks in the customize dialog
}) {
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap hire-wrap";
  const cands = [
    ...opts.team.map((r) => ({ key: r.id, robotId: r.id as string | null, provider: r.provider, name: r.name, note: `${r.prefs?.hobby ? `${HOBBY_LABEL[r.prefs.hobby]}, ` : ""}${r.jobs} ${r.jobs === 1 ? "job" : "jobs"} done`, look: r.look, custom: false, draftName: "" })),
    ...opts.providers.map((p) => ({ key: `new:${p}`, robotId: null, provider: p, name: `New ${harnessName(p)} robot`, note: "Fresh hire", look: { accent: "#ff9f5a" } as RobotLook, custom: false, draftName: "" })),
  ];
  const card = (c: (typeof cands)[number], on: boolean) =>
    `<button type="button" role="radio" aria-checked="${on}" class="cand" data-k="${esc(c.key)}">${avatar(c.provider, c.look)}<b>${esc(c.name)}</b><span>${esc(c.note)}</span></button>`;
  wrap.innerHTML = `
    <form class="dialog hire" role="dialog" aria-modal="true" aria-labelledby="hire-title">
      <h2 id="hire-title">Who works at this desk?</h2>
      <p class="hire-sub">${esc(opts.roomTitle)}, desk ${opts.seat + 1}</p>
      <div class="hire-cands" role="radiogroup" aria-label="Robot">
        ${cands.map((c, i) => `<div class="cand-cell">${card(c, i === 0)}<button type="button" class="cand-edit" data-edit="${esc(c.key)}" aria-label="Customize ${esc(c.name)}">Customize</button></div>`).join("")}
      </div>
      <div class="hire-row"><span class="hire-label">Model <i class="hire-hint">price per million tokens in and out</i></span><div class="chips" role="radiogroup" aria-label="Model"></div></div>
      <div class="hire-row"><span class="hire-label">Role</span><div class="chips roles" role="radiogroup" aria-label="Role"></div>
        <div class="role-new" hidden><input type="text" class="rn-name" placeholder="Role name, for example Grokbot"><textarea class="rn-brief" rows="2" placeholder="Standing instructions this robot always follows"></textarea><button type="button" class="ghost rn-save">Save role</button></div></div>
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
    const price = (m: string) => opts.prices?.[m];
    const cheapest = Math.min(...list.map((m) => price(m)?.output ?? Infinity));
    const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
    chips.innerHTML = list.length
      ? list.slice(0, 7).map((m, i) => {
          const p = price(m);
          const tag = p ? `<small>$${fmt(p.input)} / $${fmt(p.output)}${p.output === cheapest && list.length > 1 ? " · cheapest" : ""}</small>` : "";
          return `<button type="button" role="radio" aria-checked="${i === 0}" data-m="${esc(m)}"><span>${esc(m)}</span>${tag}</button>`;
        }).join("")
      : `<span class="hire-none">Its usual model</span>`;
  };
  renderModels();
  // Customize a candidate: teammates are saved right away, a fresh hire keeps its look until it is hired.
  const level = opts.level ?? savedLevel();
  form.querySelector(".hire-cands")!.addEventListener("click", (e) => {
    const ed = (e.target as HTMLElement).closest(".cand-edit") as HTMLElement | null;
    if (!ed) return;
    e.stopPropagation();
    const c = cands.find((x) => x.key === ed.dataset.edit)!;
    openCustomize({
      name: c.robotId || c.draftName ? c.draftName || c.name : "", provider: c.provider, look: c.look, level,
      namePlaceholder: c.robotId ? undefined : "A random name",
      onSave: (look, name) => {
        if (c.robotId) {
          const roster = Roster.current;
          if (!roster) throw new Error("the team list is not loaded yet");
          roster.setLook(c.robotId, look);
          roster.rename(c.robotId, name);
        } else { c.custom = true; c.draftName = name; }
        c.look = look;
        if (name) c.name = name;
        const cell = ed.parentElement!, old = cell.querySelector(".cand")!;
        old.outerHTML = card(c, old.getAttribute("aria-checked") === "true");
        ed.setAttribute("aria-label", `Customize ${c.name}`);
      },
    });
  }, true);
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
  // roles: none, built in ones, your own, or a new one
  let role: Role | null = null;
  const rolesEl = form.querySelector(".chips.roles") as HTMLElement;
  const renderRoles = () => {
    rolesEl.innerHTML = [`<button type="button" role="radio" aria-checked="${!role}" data-r="">No role</button>`,
      ...opts.roles.map((r) => `<button type="button" role="radio" aria-checked="${role?.name === r.name}" data-r="${esc(r.name)}" title="${esc(r.brief)}">${esc(r.name)}</button>`),
      `<button type="button" data-new="1">New role</button>`].join("");
  };
  renderRoles();
  rolesEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
    if (!b) return;
    if (b.dataset.new) { const box = form.querySelector(".role-new") as HTMLElement; box.hidden = !box.hidden; if (!box.hidden) (box.querySelector(".rn-name") as HTMLInputElement).focus(); return; }
    role = opts.roles.find((r) => r.name === b.dataset.r) ?? null;
    renderRoles();
  });
  form.querySelector(".rn-save")!.addEventListener("click", () => {
    const name = (form.querySelector(".rn-name") as HTMLInputElement).value.trim();
    const brief = (form.querySelector(".rn-brief") as HTMLTextAreaElement).value.trim();
    if (!name || !brief) return;
    const r = { name, brief };
    opts.roles.push(r);
    opts.onNewRole(r);
    role = r;
    (form.querySelector(".role-new") as HTMLElement).hidden = true;
    renderRoles();
  });
  let project = opts.projects?.[0]?.id ?? "";
  form.querySelector(".chips.proj")?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-p]") as HTMLElement | null;
    if (!b) return;
    project = b.dataset.p!;
    form.querySelectorAll(".chips.proj [data-p]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  });
  const close = () => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && [...document.querySelectorAll(".dialog-wrap")].pop() === wrap) { e.stopImmediatePropagation(); close(); } };
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
      if (!pick.robotId && pick.custom) Roster.current?.prepareHire(pick.provider, pick.look, pick.draftName);
      await opts.onHire({ robotId: pick.robotId, provider: pick.provider, model, projectId: project, task, role });
      close();
    } catch (err: any) {
      Roster.current?.prepareHire(null);
      msg.textContent = `Could not start: ${err?.message || err}. Your task text is still here.`;
      btn.disabled = false;
    }
  });
  gsap.fromTo(form, { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.6)" });
  gsap.from(form.querySelectorAll(".cand"), { opacity: 0, y: 10, duration: 0.3, stagger: 0.04, delay: 0.1 });
  (form.querySelector("textarea") as HTMLTextAreaElement).focus();
}
