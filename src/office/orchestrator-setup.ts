import type { Orchestrator } from "./orchestrator";
import { gameSound } from "./sound";
import "./orchestrator-controls.css";

// Opt-in setup: says plainly what the orchestrator is, where its notes live and what it
// costs, lets you pick its harness and model from T3's own list, then hires it.

type Model = { slug: string; name: string; isDefault: boolean };
type Provider = { instanceId: string; name: string; ready: boolean; models: Model[] };
type Config = { providers: Provider[]; selection: { providerInstanceId: string; model: string } | null };

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function openOrchestratorSetup(orch: Orchestrator, onHired: (threadId: string) => void) {
  if (document.querySelector(".orch-setup")) return;
  const restore = document.activeElement as HTMLElement | null;
  const requestId = crypto.randomUUID(); // one per dialog: a retry can never start a second thread
  const wrap = document.createElement("div"); wrap.className = "dialog-wrap";
  wrap.innerHTML = `<form class="dialog orch-controls orch-setup" role="dialog" aria-modal="true" aria-labelledby="orch-setup-title">
    <h2 id="orch-setup-title">Set up the orchestrator</h2>
    <p>It is one pinned T3 thread that learns how you like things done from what you tell robots, and stands in for you on routine decisions.</p>
    <ul class="orch-facts">
      <li>Its notes live in <code data-dir>its own folder</code>.</li>
      <li>Every review, answer and learning batch is a turn on the model below, billed to that harness.</li>
      <li>Nothing is settled until you collect the work. Turning it off holds every new automatic decision.</li>
    </ul>
    <label class="orch-control">Harness<select data-provider disabled><option>Loading T3 harnesses...</option></select></label>
    <label class="orch-control">Model<select data-model disabled></select></label>
    <label class="switch"><input type="checkbox" data-review checked><span class="track" aria-hidden="true"><i></i></span><span>Review finished work for me</span></label>
    <label class="switch"><input type="checkbox" data-auto checked><span class="track" aria-hidden="true"><i></i></span><span>Answer routine questions for me</span></label>
    <p class="form-msg" data-msg role="status"></p>
    <div class="dialog-actions"><button type="button" class="ghost" data-retry hidden>Retry</button><button type="submit" class="primary" data-hire disabled>Hire orchestrator</button><button type="button" class="ghost" data-close>Cancel</button></div>
  </form>`;
  const form = wrap.querySelector<HTMLFormElement>("form")!;
  const provider = form.querySelector<HTMLSelectElement>("[data-provider]")!, model = form.querySelector<HTMLSelectElement>("[data-model]")!;
  const msg = form.querySelector<HTMLElement>("[data-msg]")!, hire = form.querySelector<HTMLButtonElement>("[data-hire]")!, retry = form.querySelector<HTMLButtonElement>("[data-retry]")!;
  let config: Config | null = null, busy = false;
  const fillModels = (prefer?: string) => {
    const p = config?.providers.find(p => p.instanceId === provider.value);
    model.innerHTML = (p?.models ?? []).map(m => `<option value="${esc(m.slug)}">${esc(m.name || m.slug)}</option>`).join("");
    model.value = prefer && p?.models.some(m => m.slug === prefer) ? prefer : p?.models.find(m => m.isDefault)?.slug ?? p?.models[0]?.slug ?? "";
    model.disabled = !p?.models.length;
    hire.disabled = busy || !model.value;
  };
  const load = async () => {
    retry.hidden = true; msg.textContent = "";
    try {
      const [c, status] = await Promise.all([(window as any).lucidT3.hireConfig({}) as Promise<Config>, orch.refreshStatus()]);
      if (!wrap.isConnected) return;
      if (status?.dir) form.querySelector("[data-dir]")!.textContent = status.dir;
      config = { ...c, providers: c.providers.filter(p => p.ready && p.models.length) };
      if (!config.providers.length) { provider.innerHTML = "<option>No ready harness</option>"; msg.textContent = "T3 has no ready harness. Sign in to one in T3 Code, then retry."; retry.hidden = false; return; }
      provider.innerHTML = config.providers.map(p => `<option value="${esc(p.instanceId)}">${esc(p.name)}</option>`).join("");
      const preferred = config.selection && config.providers.some(p => p.instanceId === config!.selection!.providerInstanceId) ? config.selection : null;
      provider.value = preferred?.providerInstanceId ?? config.providers[0].instanceId;
      provider.disabled = false; fillModels(preferred?.model);
    } catch (error: any) {
      if (!wrap.isConnected) return;
      provider.innerHTML = "<option>Unavailable</option>";
      msg.textContent = `Could not read T3's harnesses: ${error?.message || error}`; retry.hidden = false;
    }
  };
  const close = () => { if (busy) return; window.removeEventListener("keydown", onKey, true); wrap.remove(); restore?.focus({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => {
    if ([...document.querySelectorAll(".dialog-wrap")].at(-1) !== wrap) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === "Tab") {
      const nodes = [...form.querySelectorAll<HTMLElement>("button,select,input")].filter(el => !el.closest("[hidden]") && !(el as HTMLButtonElement).disabled);
      const first = nodes[0], last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  provider.addEventListener("change", () => fillModels());
  model.addEventListener("change", () => { hire.disabled = busy || !model.value; });
  retry.addEventListener("click", () => void load());
  form.querySelector("[data-close]")!.addEventListener("click", close);
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy || !model.value) return;
    busy = true; hire.disabled = true; msg.textContent = "Starting its thread in T3 and pinning it...";
    try {
      const id = await orch.hire({ provider: provider.value, model: model.value, requestId, review: form.querySelector<HTMLInputElement>("[data-review]")!.checked, auto: form.querySelector<HTMLInputElement>("[data-auto]")!.checked });
      gameSound.play("ready");
      busy = false; close(); onHired(id);
    } catch (error: any) {
      // Keep every choice for the retry; the same request id prevents a duplicate thread.
      busy = false; hire.disabled = !model.value;
      msg.textContent = `Could not set it up: ${error?.message || error}`;
    }
  });
  window.addEventListener("keydown", onKey, true);
  document.body.append(wrap);
  provider.focus();
  void load();
}
