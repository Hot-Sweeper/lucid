import type { Orchestrator, OrchState } from "./orchestrator";
import { costText } from "./orchestrator-panel";
import { confirmDialog } from "./menus";
import "./orchestrator-controls.css";

export function openOrchestratorControls(orch: Orchestrator, get: () => OrchState | null, reports: () => void, setup: () => void, chair: () => void = () => {}) {
  if(document.querySelector(".orch-controls")) return;
  const restore = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div"); wrap.className="dialog-wrap";
  wrap.innerHTML=`<section class="dialog orch-controls" role="dialog" aria-modal="true" aria-labelledby="orch-controls-title">
    <h2 id="orch-controls-title">Orchestrator</h2>
    <div data-controls><label class="switch"><input type="checkbox" data-enabled role="switch"><span class="track" aria-hidden="true"><i></i></span><span>Orchestrator on</span></label>
    <p class="hint">Off holds every new automatic review, answer and learning batch. You can still review reports yourself. A review already sent may still finish.</p>
    <label class="orch-control" data-rest>While off<select data-presence><option value="sleep">Sleeping</option><option value="away">Away, desk empty</option></select></label>
    <label class="orch-control">Report review<select data-review><option value="manual">I'll review reports</option><option value="auto">Orchestrator reviews reports</option></select></label>
    <label class="switch"><input type="checkbox" data-answers><span class="track" aria-hidden="true"><i></i></span><span>Handle questions and approvals for me</span></label>
    <p class="hint" data-explain></p>
    <p class="orch-health" data-health></p></div>
    <p data-missing hidden>The orchestrator is optional and not set up yet.</p>
    <div class="dialog-actions"><button type="button" class="primary" data-chair>Take the chair</button><button type="button" class="ghost" data-reports>Review reports</button><button type="button" class="primary" data-hire hidden>Set up</button><button type="button" class="ghost" data-dismiss>Stop using it</button><button type="button" class="ghost" data-close>Close</button></div>
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
    for (const key of ["chair","dismiss"]) (wrap.querySelector(`[data-${key}]`) as HTMLElement).hidden=!s;
    (wrap.querySelector("[data-hire]") as HTMLElement).hidden=!!s;
    if(!s)return;
    enabled.checked=!s.paused;
    (wrap.querySelector("[data-rest]") as HTMLElement).hidden=!s.paused;
    presence.value=s.presence==="away"?"away":"sleep";
    review.value=s.review?"auto":"manual";answers.checked=s.auto!==false;
    wrap.querySelector("[data-explain]")!.textContent=s.paused?"Reports stay available for you to review while the orchestrator rests.":s.review?"The orchestrator checks delivered reports and passes uncertain decisions to you.":"You decide whether each report is accepted or needs changes. Reports stay unsettled until reviewed.";
    // Where it lives and what it costs, from the main process (never estimated here).
    const st=orch.status, week=costText(st?.usage?.week);
    const health=wrap.querySelector<HTMLElement>("[data-health]")!;
    health.replaceChildren();
    const line=(text:string)=>{const p=document.createElement("span");p.textContent=text;health.append(p,document.createElement("br"));};
    if(st?.thread&&!st.thread.exists)line("Its thread in T3 is gone. Set it up again to continue with the same notes.");
    if(st?.dir)line(`Notes and reports: ${st.dir}`);
    line(week?`Its own cost in the last 7 days: ${week}.`:"Its own cost is not in the local logs yet.");
  };
  const close=()=>{window.removeEventListener("keydown",onKey,true);wrap.remove();restore?.focus({preventScroll:true});};
  const onKey=(e:KeyboardEvent)=>{
    if([...document.querySelectorAll(".dialog-wrap")].at(-1)!==wrap)return;
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
  wrap.querySelector("[data-hire]")!.addEventListener("click",()=>{close();setup();});
  wrap.querySelector("[data-dismiss]")!.addEventListener("click",async()=>{
    const ok=await confirmDialog("Stop using the orchestrator?","It stops reviewing, answering and learning. Its notes, answers and settlement papers stay in its folder, and its T3 thread stays in T3. Set it up again any time to continue with the same notes.","Stop using it");
    if(!ok||!wrap.isConnected)return;
    orch.dismiss();close();
  });
  wrap.addEventListener("click",e=>{if(e.target===wrap)close();});
  window.addEventListener("keydown",onKey,true);document.body.append(wrap);paint();
  void orch.refreshStatus().then(()=>{if(wrap.isConnected)paint();});
  (get()?enabled:wrap.querySelector<HTMLElement>("[data-hire]")!).focus();
}
