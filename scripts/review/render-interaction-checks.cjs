// Coordinated isolated Electron checks. All message/model/queue/answer writes are stubbed.
const fs = require("node:fs"), path = require("node:path");
module.exports = async ({ js, wc, wait, out }) => {
  const result = {}, save = () => fs.writeFileSync(path.join(out, "interaction-checks.json"), JSON.stringify(result, null, 2));
  let pointerEnd = null;
  const check = (ok, message) => { if (!ok) { save(); throw Error(message); } };
  const capture = async name => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  try {
    await js(`{
      const c=window.__chat,a=window.__answer,w=window.__world,d=w.desks.get('perf-t0')||w.desks.values().next().value;
      if(!a)throw Error('The isolated answer-card handle is missing');
      const f=window.__interaction={c,a,w,d,saved:{api:{...c.api},answerDeps:a.deps,providers:c.providers,weather:w.weather},messages:[],sent:[],actions:[],answers:[],requests:[]};
      f.selection={providerInstanceId:'fixture-codex',model:'fixture-a',options:{reasoningEffort:'low',fastMode:false}};
      const options=[{id:'reasoningEffort',label:'Reasoning effort',type:'select',choices:[{id:'low',label:'Low',isDefault:true},{id:'high',label:'High',isDefault:false}]},{id:'fastMode',label:'Fast',type:'boolean',current:false}];
      f.providers=[{instanceId:'fixture-codex',driver:'codex',name:'Fixture Codex',ready:true,models:[{slug:'fixture-a',name:'Fixture A',isDefault:true,options},{slug:'fixture-b',name:'Fixture B',isDefault:false,options}]},{instanceId:'fixture-claude',driver:'claudeAgent',name:'Fixture Claude',ready:true,models:[{slug:'fixture-c',name:'Fixture C',isDefault:true,options}]}];
      c.api.conversationPage=undefined;c.api.conversation=async()=>f.messages;c.api.sendMessage=async o=>{f.sent.push(o);return{ok:true}};c.api.saveAttachment=async()=>{throw Error('This fixture never saves attachments')};
      c.api.t3={status:async()=>({paired:true,error:null,selection:f.selection}),providers:async()=>f.providers,
        setModel:async o=>{f.actions.push({kind:'model',...o});f.selection=structuredClone(o.selection)},
        reorder:async o=>{f.actions.push({kind:'reorder',...o});const at=f.messages.findIndex(m=>m.queueRunId===o.runId),[item]=f.messages.splice(at,1),before=f.messages.findIndex(m=>m.queueRunId===o.beforeRunId);f.messages.splice(before<0?f.messages.length:before,0,item);f.messages.forEach((m,i)=>m.queue=i)},
        edit:async o=>{f.actions.push({kind:'edit',...o});f.messages.find(m=>m.queueRunId===o.runId).text=o.text},
        steer:async o=>{f.actions.push({kind:'steer',...o});f.messages=f.messages.filter(m=>m.queueRunId!==o.queuedRunId)},
        cancel:async o=>{f.actions.push({kind:'cancel',...o});f.messages=f.messages.filter(m=>m.queueRunId!==o.runId)}};
      a.deps={pending:async()=>f.requests,t3:{status:async()=>({paired:true,error:null}),respond:async o=>{f.answers.push(o);f.requests=f.requests.filter(r=>r.id!==o.requestId)}},advice:()=>null};
      c.providers=f.providers;c.open(d);c.setCollapsed(false);f.resetQueue=()=>{f.messages=[0,1,2].map(i=>({id:'fixture-queued-'+i,queueRunId:'fixture-run-'+i,steerTarget:'fixture-active',role:'user',at:new Date().toISOString(),streaming:false,text:'Queued fixture '+i,run:'queued',queue:i,attachments:[]}));c.renderQueue(f.messages)};void 0;
      f.pointerTrace=[];f.tracePointer=e=>{if(f.pointerTrace.length<80)f.pointerTrace.push({type:e.type,x:e.clientX,y:e.clientY,buttons:e.buttons,target:typeof e.target?.className==='string'?e.target.className:e.target?.nodeName,prevented:e.defaultPrevented})};f.traceTypes=['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','dragstart'];f.traceTypes.forEach(type=>window.addEventListener(type,f.tracePointer));void 0;
    }`); await wait(550);

    // Real pointer capture, drag preview and drop, with no real message send.
    const geometry = await js(`{const f=window.__interaction,row=[...document.querySelectorAll('.th-row[data-id]')].find(e=>e.dataset.id!==f.c.threadId);if(!row)throw Error('No other fixture thread to reference');row.scrollIntoView({block:'center'});const r=row.getBoundingClientRect(),b=f.c.el.querySelector('.cp-box').getBoundingClientRect();f.refId=row.dataset.id;({from:{x:Math.round(r.left+Math.min(45,r.width/2)),y:Math.round(r.top+r.height/2)},to:{x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})}`);
    result.dragGeometry = geometry;
    pointerEnd = geometry.to;
    wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...geometry.from });
    for (let i = 1; i <= 8; i++) { wc.sendInputEvent({ type: "mouseMove", button: "left", modifiers: ["leftbuttondown"], x: Math.round(geometry.from.x + (geometry.to.x - geometry.from.x) * i / 8), y: Math.round(geometry.from.y + (geometry.to.y - geometry.from.y) * i / 8) }); await wait(18); }
    result.dragPreview = await js(`!!document.querySelector('.cp-refchip.preview') && document.querySelector('.cp-box').classList.contains('ref-over') && document.body.classList.contains('th-dragging')`);
    result.dragTrace = await js(`window.__interaction.pointerTrace`);
    check(result.dragPreview, "Thread drag did not show its actual composer reference preview"); await capture("interaction-reference-preview");
    wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...geometry.to }); await wait(350);
    pointerEnd = null;
    result.reference = await js(`(async()=>{const f=window.__interaction,c=f.c,chip=c.el.querySelector('.cp-refchip:not(.preview)'),title=chip?.querySelector('.cpc-name')?.textContent,id=f.refId;const ta=c.el.querySelector('textarea');ta.value='Review this referenced thread';c.el.querySelector('.cp-form').requestSubmit();await new Promise(r=>setTimeout(r,100));return{chip:!!chip,title,clean:!document.body.classList.contains('th-dragging'),target:f.sent[0]?.threadId,expectedTarget:c.threadId,message:f.sent[0]?.message,refId:id}})()`);
    check(result.reference.chip && result.reference.title && result.reference.clean && result.reference.target === result.reference.expectedTarget && result.reference.message.includes("<referenced_thread ") && result.reference.message.includes(result.reference.refId), "Dropped reference was unreadable, lost on send or sent to the wrong fixture thread");

    result.controls = await js(`(async()=>{
      const f=window.__interaction,c=f.c,tick=()=>new Promise(r=>setTimeout(r,30));await c.loadT3(false);
      const choose=async(selector,value)=>{c.el.querySelector(selector).click();const option=c.el.querySelector('[role="option"][data-value="'+value+'"]');if(!option)throw Error('Missing option '+value);option.click();await tick()};
      await choose('.cm-modelname','fixture-b');await choose('.cm-effort','high');c.el.querySelector('.cm-fast').click();await tick();await choose('.cm-harness','fixture-claude');
      return {actions:f.actions.filter(a=>a.kind==='model'),thread:c.threadId,model:c.sel,menuClosed:!c.el.querySelector('[role="listbox"]')};
    })()`);
    check(result.controls.actions.length === 4 && result.controls.actions.every(a => a.threadId === result.controls.thread) && result.controls.actions[0].selection.model === "fixture-b" && result.controls.actions[1].selection.options.reasoningEffort === "high" && result.controls.actions[2].selection.options.fastMode === true && result.controls.model.providerInstanceId === "fixture-claude" && result.controls.menuClosed, "Harness/model/effort/speed controls did not route exact fixture selections");

    result.queue = await js(`(async()=>{
      const f=window.__interaction,c=f.c,tick=()=>new Promise(r=>setTimeout(r,60)),find=id=>[...c.el.querySelectorAll('.cp-queue li')].find(li=>li.dataset.run===id);f.resetQueue();
      find('fixture-run-0').querySelector('[data-act="down"]').click();await tick();
      find('fixture-run-1').querySelector('[data-act="edit"]').click();const ta=c.el.querySelector('.cq-edit textarea');ta.value='Edited queued fixture';c.el.querySelector('.cq-save').click();await tick();
      find('fixture-run-2').querySelector('[data-act="steer"]').click();await tick();
      find('fixture-run-0').querySelector('[data-act="cancel"]').click();const confirm=!!c.el.querySelector('.cq-confirm');c.el.querySelector('.cq-yes').click();await new Promise(r=>setTimeout(r,350));await c.refresh();
      return {actions:f.actions.filter(a=>a.kind!=='model'),thread:c.threadId,confirm,remaining:f.messages.map(m=>m.text),hold:c.queueHold};
    })()`);
    check(result.queue.confirm && result.queue.actions.map(a => a.kind).join() === "reorder,edit,steer,cancel" && result.queue.actions.every(a => a.threadId === result.queue.thread) && result.queue.actions[2].targetRunId === "fixture-active" && result.queue.remaining.join() === "Edited queued fixture" && result.queue.hold === 0, "Queue actions lost a fixture prompt, skipped confirmation or targeted another thread");

    await js(`(async()=>{
      const f=window.__interaction,q=(id,question,multiSelect,options)=>({id,header:id,question,multiSelect,allowCustomAnswer:true,initialAnswer:null,options:options.map(label=>({label,value:label,description:''}))});
      f.requests=[{id:'fixture-input-request',type:'input',at:new Date().toISOString(),answerable:true,reason:null,questions:[q('multi','Choose the fixture snacks',true,['Apples','Cookies']),q('free','Write a fixture note',false,[]),q('other','Choose a fixture name',false,['Pip','Nova'])]}];
      await f.a.tick(true);
      const form=f.a.el.querySelector('form'),multi=form.querySelector('[data-q="multi"]');multi.querySelectorAll('input[type="checkbox"]')[0].click();multi.querySelectorAll('input[type="checkbox"]')[1].click();
      const own=multi.querySelector('input[type="text"]');own.value='Carrots';own.dispatchEvent(new Event('input',{bubbles:true}));
      const free=form.querySelector('[data-q="free"] textarea');free.value='A local fixture answer';free.dispatchEvent(new Event('input',{bubbles:true}));
      const name=form.querySelector('[data-q="other"] input[type="text"]');name.value='Sprocket';name.dispatchEvent(new Event('input',{bubbles:true}));
    })()`); await capture("interaction-answer-form");
    result.answer = await js(`(async()=>{const f=window.__interaction;f.a.el.querySelector('.ca-send').click();await new Promise(r=>setTimeout(r,50));await f.a.tick(true);return {sent:f.answers,thread:f.c.threadId,cleared:!f.a.el.querySelector('.ca-req'),status:f.a.el.querySelector('.ca-done')?.textContent}})()`);
    check(result.answer.sent.length === 1 && result.answer.sent[0].threadId === result.answer.thread && result.answer.sent[0].requestId === "fixture-input-request" && result.answer.sent[0].answers.multi.join() === "Apples,Cookies,Carrots" && result.answer.sent[0].answers.free === "A local fixture answer" && result.answer.sent[0].answers.other === "Sprocket" && result.answer.cleared && result.answer.status.includes("Answer sent"), "Multi-select, free text or Other answer did not submit and clear through the isolated answer path");

    result.park = await js(`{const f=window.__interaction,w=f.w,park=w.park;park.setThreads([{id:'fixture-weather-visitor',provider:'codex',title:'Weather fixture',name:'Weather visitor'}]);const arrived=park.vis.has('fixture-weather-visitor');w.weather={...w.weather,kind:'rain',rainMm:3};w.update(w.lastData);({arrived,parkEmpty:park.vis.size===0,wet:park.wet,departing:[...park.leaving].some(w=>w.id==='fixture-weather-visitor'&&w.el.isConnected)})}`);
    check(result.park.arrived && result.park.parkEmpty && result.park.wet && result.park.departing, "Rain did not end park activity through a connected departure actor");
    result.passed = true; save(); console.log("interactionChecks", JSON.stringify(result));
  } catch (error) { result.error = String(error); await capture("interaction-failure").catch(() => {}); throw error; }
  finally {
    if (pointerEnd) {
      // Cancel the custom drag before releasing a held native button after a failed check.
      wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...pointerEnd });
    }
    await js(`{const f=window.__interaction;if(f){f.traceTypes?.forEach(type=>window.removeEventListener(type,f.tracePointer));for(const cleanup of [...f.c.queueCleanups])cleanup();f.c.closeMenu();Object.assign(f.c.api,f.saved.api);f.c.providers=f.saved.providers;f.c.refs=[];f.c.files=[];f.c.pending=f.c.pending.filter(p=>!p.text.includes('Review this referenced thread'));f.c.drafts.delete(f.c.threadId);f.c.close();f.a.deps=f.saved.answerDeps;f.a.threadId=null;f.a.requests=[];f.a.sent.clear();f.a.el.replaceChildren();f.a.el.hidden=true;f.w.weather=f.saved.weather;f.w.update(f.w.lastData);delete window.__interaction}}`).catch(() => {});
    save();
  }
};
