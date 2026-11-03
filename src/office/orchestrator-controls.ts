import type { Orchestrator, OrchState } from "./orchestrator";
import "./orchestrator-controls.css";

export function openOrchestratorControls(orch: Orchestrator, get: () => OrchState | null, reports: () => void, hire: () => void, chair: () => void = () => {}) {
  if(document.querySelector(".orch-controls")) return;
  const restore = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div"); wrap.className="dialog-wrap";
  wrap.innerHTML=`<section class="dialog orch-controls" role="dialog" aria-modal="true" aria-labelledby="orch-controls-title">
    <h2 id="orch-controls-title">Orchestrator</h2>
    <div data-controls><label class="switch"><input type="checkbox" data-enabled role="switch"><span class="track" aria-hidden="true"><i></i></span><span>Orchestrator enabled</span></label>
    <p class="hint">One switch for the whole office.</p>
    <label class="orch-control" data-rest>While off<select data-presence><option value="sleep">Sleeping</option><option value="away">Away, desk empty</option></select></label>
    <label class="orch-control">Report review<select data-review><option value="manual">I'll review reports</option><option value="auto">Orchestrator reviews reports</option></select></label>
    <label class="switch"><input type="checkbox" data-answers><span class="track" aria-hidden="true"><i></i></span><span>Handle questions and approvals for me</span></label>
    <p class="hint" data-explain></p><p class="hint">Off pauses all automatic reviews, answers, and learning. You can still review reports manually. Work already running may finish.</p></div>
    <p data-missing hidden>No orchestrator has been hired.</p>
    <div class="dialog-actions"><button type="button" class="primary" data-chair>Take the chair</button><button type="button" class="ghost" data-reports>Review reports</button><button type="button" class="primary" data-hire hidden>Hire orchestrator</button><button type="button" class="ghost" data-close>Close</button></div>
  </section>`;
  const dialog=wrap.querySelector<HTMLElement>(".dialog")!;
  const presence=wrap.querySelector<HTMLSelectElement>("[data-presence]")!;
  const enabled=wrap.querySelector<HTMLInputElement>("[data-enabled]")!;
  const review=wrap.querySelector<HTMLSelectElement>("[data-review]")!;
  const answers=wrap.querySelector<HTMLInputElement>("[data-answers]")!;
  const paint=()=>{
    const s=get();
    (wrap.querySelector("[data-controls]") as HTMLElement).hidden=!s;
    (wrap.querySelector("[data-missing]") as HTMLElement).hidden=!!s;
    (wrap.querySelector("[data-hire]") as HTMLElement).hidden=!!s;
    (wrap.querySelector("[data-chair]") as HTMLElement).hidden=!s;
    if(!s)return;
    enabled.checked=!s.paused;
    (wrap.querySelector("[data-rest]") as HTMLElement).hidden=!s.paused;
    presence.value=s.presence==="away"?"away":"sleep";
    review.value=s.review?"auto":"manual";answers.checked=s.auto!==false;
    wrap.querySelector("[data-explain]")!.textContent=s.paused?"Reports stay available for you to review while the orchestrator rests.":s.review?"The orchestrator checks delivered reports and passes uncertain decisions to you.":"You decide whether each report is accepted or needs changes. Reports stay unsettled until reviewed.";
  };
  const close=()=>{window.removeEventListener("keydown",onKey,true);wrap.remove();restore?.focus({preventScroll:true});};
  const onKey=(e:KeyboardEvent)=>{
    if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close();}
    if(e.key==="Tab"){
      const nodes=[...dialog.querySelectorAll<HTMLElement>("button,select,input")].filter(el=>!el.closest("[hidden]")&&!el.hasAttribute("disabled"));
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  };
  enabled.addEventListener("change",()=>{orch.setPresence(enabled.checked?"awake":presence.value as "sleep"|"away");paint();});
  presence.addEventListener("change",()=>{if(!enabled.checked)orch.setPresence(presence.value as "sleep"|"away");paint();});
  review.addEventListener("change",()=>{orch.setReview(review.value==="auto");paint();});
  answers.addEventListener("change",()=>{orch.setAuto(answers.checked);paint();});
  wrap.querySelector("[data-close]")!.addEventListener("click",close);
  wrap.querySelector("[data-reports]")!.addEventListener("click",()=>{close();reports();});
  wrap.querySelector("[data-chair]")!.addEventListener("click",()=>{close();chair();});
  wrap.querySelector("[data-hire]")!.addEventListener("click",()=>{close();hire();});
  wrap.addEventListener("click",e=>{if(e.target===wrap)close();});
  window.addEventListener("keydown",onKey,true);document.body.append(wrap);paint();
  (get()?enabled:wrap.querySelector<HTMLElement>("[data-hire]")!).focus();
}
