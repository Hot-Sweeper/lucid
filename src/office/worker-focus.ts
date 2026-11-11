import gsap from "gsap";
import { Walker, PALETTES, brandFor, harnessName, personaLines, type RobotProfile } from "../robot";
import { gameSound } from "./sound";
import { icon } from "../ui/icons";
import { avatar, type HireRuntime } from "./hire";
import "./worker-focus.css";

// A worker up close. Clicking a robot twice lifts it out of the office: it floats in front
// of its own backdrop with its record, its written persona and what it is doing, and you
// can open its chat, change its look, retrain it to another harness or model, or retire it
// to the staff wall. Retraining and retiring wait until its job is collected.

export type WorkerFocusOptions = {
  robot: RobotProfile;
  anchor?: Element | null;
  /** The thread it works on now, if any (its desk and chat). */
  job?: { title: string; status: string } | null;
  free: boolean;
  loadRuntime: () => Promise<HireRuntime>;
  onOpenChat?: () => void;
  onCustomize: () => void;
  onRetrain: (provider: string, model: string) => void;
  onRetire: () => void;
  onStaffWall: () => void;
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const topLayer = (wrap: HTMLElement) => [...document.querySelectorAll(".dialog-wrap, .wf-wrap")].pop() === wrap;

export function openWorkerFocus(o: WorkerFocusOptions) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const r = o.robot, palette = PALETTES[brandFor(r.provider)];
  const wrap = document.createElement("div");
  wrap.className = "wf-wrap";
  wrap.style.setProperty("--wf-glow", palette.glow);
  wrap.style.setProperty("--wf-shell", palette.shell);
  wrap.innerHTML = `
    <div class="wf-backdrop"></div>
    <section class="wf" role="dialog" aria-modal="true" aria-labelledby="wf-name">
      <div class="wf-stage" aria-hidden="true"><div class="wf-shadow"></div><div class="wf-float"></div></div>
      <div class="wf-panel">
        <header class="wf-head"><div><h2 id="wf-name"></h2><p class="wf-setup"></p></div><button type="button" class="wf-close" aria-label="Back to the office" title="Back to the office (Esc)">${icon("close")}</button></header>
        <p class="wf-job"></p>
        <dl class="wf-record"></dl>
        <ul class="wf-persona" aria-label="Persona"></ul>
        <div class="wf-actions">
          <button type="button" class="primary wf-chat" hidden>Open chat</button>
          <button type="button" class="ghost wf-customize">Customize</button>
          <button type="button" class="ghost wf-retrain">Retrain</button>
          <button type="button" class="ghost danger wf-retire">Retire</button>
        </div>
        <div class="wf-retrain-box" hidden>
          <label class="hire-field"><span>Harness</span><select data-wf="provider"></select></label>
          <label class="hire-field"><span>Model</span><select data-wf="model"></select></label>
          <button type="button" class="primary compact wf-retrain-save">Retrain</button>
        </div>
        <div class="wf-retire-box" hidden>
          <p></p>
          <div><button type="button" class="primary compact danger wf-retire-yes">Retire</button><button type="button" class="ghost compact wf-retire-no">Keep working</button></div>
        </div>
        <p class="wf-note" role="status"></p>
        <button type="button" class="link-btn wf-wall">Staff wall</button>
      </div>
    </section>`;
  document.body.appendChild(wrap);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const note = q(".wf-note"), float = q(".wf-float"), stage = q(".wf-stage");
  const paint = () => {
    q("#wf-name").textContent = r.name;
    q(".wf-setup").textContent = `${harnessName(r.provider)}${r.lastModel ? `, ${r.lastModel}` : ""}`;
    q(".wf-job").textContent = o.job ? `${o.job.status}: ${o.job.title}` : r.retired ? "Retired, on the staff wall" : "Free, waiting for the next job";
    const hired = new Date(r.hiredAt);
    q(".wf-record").innerHTML = "";
    for (const [label, value] of [["Jobs", String(r.jobs)], ["Approved", String(r.approved ?? 0)], ["Hired", hired.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })]]) {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; q(".wf-record").append(dt, dd);
    }
    const list = q(".wf-persona"); list.replaceChildren();
    for (const line of personaLines(r)) { const li = document.createElement("li"); li.textContent = line; list.append(li); }
    const recent = (r.log ?? []).slice(-3).reverse();
    for (const e of recent) { const li = document.createElement("li"); li.className = "wf-log"; li.textContent = `Approved: ${e.title}`; list.append(li); }
    q(".wf-chat").hidden = !o.job || !o.onOpenChat;
    for (const b of [q<HTMLButtonElement>(".wf-retrain"), q<HTMLButtonElement>(".wf-retire")]) {
      b.disabled = !o.free || !!r.retired;
      b.title = r.retired ? "Rehire it from the staff wall first." : o.free ? "" : "Wait until its job is collected.";
    }
  };
  // The robot itself, floating.
  const actor = new Walker(float, { id: `focus-${r.id}`, provider: r.provider, name: r.name, model: r.lastModel ?? undefined, scale: 0.78, look: r.look });
  actor.el.classList.add("wf-actor");
  const place = () => actor.setPos(float.clientWidth / 2, float.clientHeight - 10);
  place(); actor.face("down");
  const resize = new ResizeObserver(place); resize.observe(float);
  const tweens: gsap.core.Animation[] = [];
  if (!reduced()) {
    tweens.push(gsap.to(float, { y: -16, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    tweens.push(gsap.to(q(".wf-shadow"), { scaleX: .78, opacity: .45, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    // Lift out of the office from where it was clicked.
    const from = o.anchor?.getBoundingClientRect(), to = stage.getBoundingClientRect();
    if (from && from.width) tweens.push(gsap.from(stage, { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2), scale: Math.max(.15, from.height / to.height), duration: .42, ease: "power3.out" }));
    tweens.push(gsap.from(q(".wf-backdrop"), { opacity: 0, duration: .3 }));
    tweens.push(gsap.from(q(".wf-panel"), { opacity: 0, x: 24, duration: .32, delay: .1, ease: "power2.out" }));
    gsap.delayedCall(.35, () => actor.do("wave"));
  }
  gameSound.play("open");
  paint();

  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    window.removeEventListener("keydown", onKey, true); resize.disconnect();
    for (const t of tweens) t.kill();
    gameSound.play("switch");
    const done = () => { actor.destroy(); wrap.remove(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
    if (reduced()) done(); else gsap.to(wrap, { opacity: 0, duration: .18, onComplete: done });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!topLayer(wrap)) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === "Tab") {
      const items = [...wrap.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)")].filter(n => n.getClientRects().length);
      if (!items.length) return;
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)!.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
    }
  };
  window.addEventListener("keydown", onKey, true);
  q(".wf-backdrop").addEventListener("click", close);
  q(".wf-close").addEventListener("click", close);
  q(".wf-chat").addEventListener("click", () => { close(); o.onOpenChat?.(); });
  q(".wf-customize").addEventListener("click", () => o.onCustomize());
  q(".wf-wall").addEventListener("click", () => { close(); o.onStaffWall(); });

  // Retrain: pick another harness and model from T3's real runtime list.
  let runtime: HireRuntime | null = null;
  const provSel = q<HTMLSelectElement>('[data-wf="provider"]'), modelSel = q<HTMLSelectElement>('[data-wf="model"]');
  const fillModels = () => {
    const p = runtime?.providers.find(p => p.instanceId === provSel.value);
    modelSel.replaceChildren(...(p?.models ?? []).map(m => new Option(m.name || m.slug, m.slug, false, m.slug === r.lastModel)));
  };
  q(".wf-retrain").addEventListener("click", async () => {
    const box = q(".wf-retrain-box"); q(".wf-retire-box").hidden = true;
    if (!box.hidden) { box.hidden = true; return; }
    note.textContent = "Loading harnesses and models...";
    try {
      runtime ??= await o.loadRuntime();
      if (closed) return;
      provSel.replaceChildren(...runtime.providers.filter(p => p.ready).map(p => new Option(p.name, p.instanceId, false, p.instanceId === r.provider)));
      fillModels(); box.hidden = false; note.textContent = ""; provSel.focus();
    } catch (error: any) { note.textContent = `Could not load T3 settings: ${error?.message || error}`; }
  });
  provSel.addEventListener("change", fillModels);
  q(".wf-retrain-save").addEventListener("click", () => {
    if (!provSel.value || !modelSel.value) return;
    try {
      o.onRetrain(provSel.value, modelSel.value);
      actor.setBrand(r.provider); actor.setModel(r.lastModel);
      wrap.style.setProperty("--wf-glow", PALETTES[brandFor(r.provider)].glow);
      q(".wf-retrain-box").hidden = true; paint();
      note.textContent = `${r.name} now runs ${modelSel.selectedOptions[0]?.textContent || modelSel.value}.`;
      gameSound.play("level"); if (!reduced()) actor.hop();
    } catch (error: any) { note.textContent = String(error?.message || error); }
  });
  // Retire: a proportionate confirmation; nothing is deleted.
  q(".wf-retire").addEventListener("click", () => {
    q(".wf-retrain-box").hidden = true;
    const box = q(".wf-retire-box");
    box.querySelector("p")!.textContent = `${r.name} moves to the staff wall with its history. You can rehire it there.`;
    box.hidden = !box.hidden; if (!box.hidden) q(".wf-retire-no").focus();
  });
  q(".wf-retire-no").addEventListener("click", () => { q(".wf-retire-box").hidden = true; q(".wf-retire").focus(); });
  q(".wf-retire-yes").addEventListener("click", () => {
    try { o.onRetire(); close(); }
    catch (error: any) { note.textContent = String(error?.message || error); }
  });
  q(".wf-close").focus({ preventScroll: true });
  return { close, refresh: paint };
}

/** Everyone who ever worked here. Retired workers can be rehired; the robot of the month leads. */
export function openStaffWall(o: { robots: RobotProfile[]; onFocus: (r: RobotProfile) => void; onRehire: (r: RobotProfile) => void }) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const month = new Date().toISOString().slice(0, 7);
  const monthly = (r: RobotProfile) => (r.log ?? []).filter(e => e.at.startsWith(month)).length;
  const star = [...o.robots].filter(r => !r.retired && monthly(r) > 0).sort((a, b) => monthly(b) - monthly(a) || b.jobs - a.jobs)[0] ?? null;
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap";
  wrap.innerHTML = `<div class="dialog staff-wall" role="dialog" aria-modal="true" aria-labelledby="sw-title">
    <header class="sw-head"><h2 id="sw-title">Staff wall</h2><button type="button" class="sw-close" aria-label="Close staff wall" title="Close (Esc)">${icon("close")}</button></header>
    <div class="sw-star"></div>
    <div class="sw-grid"></div>
  </div>`;
  document.body.appendChild(wrap);
  const grid = wrap.querySelector(".sw-grid")!, starEl = wrap.querySelector<HTMLElement>(".sw-star")!;
  if (star) {
    starEl.innerHTML = `${avatar(star.provider, star.look, 72)}<div><b>Robot of the month</b><span></span></div>`;
    starEl.querySelector("span")!.textContent = `${star.name}, ${monthly(star)} approved ${monthly(star) === 1 ? "report" : "reports"} this month`;
  } else starEl.hidden = true;
  const sorted = [...o.robots].sort((a, b) => Number(!!a.retired) - Number(!!b.retired) || b.jobs - a.jobs || a.name.localeCompare(b.name));
  for (const r of sorted) {
    const cell = document.createElement("div"); cell.className = `sw-cell${r.retired ? " retired" : ""}`;
    const open = document.createElement("button"); open.type = "button"; open.className = "sw-open";
    open.innerHTML = avatar(r.provider, r.look, 54);
    const name = document.createElement("b"); name.textContent = r.name;
    const meta = document.createElement("span"); meta.textContent = `${harnessName(r.provider)}${r.lastModel ? `, ${r.lastModel}` : ""}. ${r.jobs} ${r.jobs === 1 ? "job" : "jobs"}${r.retired ? ", retired" : ""}`;
    open.append(name, meta); open.setAttribute("aria-label", `${r.name}, ${meta.textContent}`);
    open.addEventListener("click", () => { close(); o.onFocus(r); });
    cell.append(open);
    if (r.retired) {
      const back = document.createElement("button"); back.type = "button"; back.className = "link-btn sw-rehire"; back.textContent = "Rehire";
      back.setAttribute("aria-label", `Rehire ${r.name}`);
      back.addEventListener("click", () => { o.onRehire(r); cell.classList.remove("retired"); back.remove(); meta.textContent = meta.textContent!.replace(", retired", ""); gameSound.play("ready"); });
      cell.append(back);
    }
    grid.append(cell);
  }
  const close = () => { window.removeEventListener("keydown", onKey, true); wrap.remove(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => { if (topLayer(wrap) && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", e => { if (e.target === wrap || (e.target as HTMLElement).closest(".sw-close")) close(); });
  wrap.querySelector<HTMLElement>(".sw-close")!.focus();
  gameSound.play("open");
  return { close };
}
