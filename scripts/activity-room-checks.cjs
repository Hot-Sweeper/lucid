// For a dedicated isolated native harness. Replaces its world fixture and never
// starts Electron, writes settings, or touches a connected thread.
module.exports = async function activityChecks({ js, wait }) {
  const checks = [];
  const inspect = async (stage) => {
    const state = await js(`(() => {const w=window.__world;const count=id=>{let n=w.root.querySelectorAll('.world-walker[data-id="'+id+'"]').length;const d=w.desks.get(id);if(d&&!d.el.classList.contains('arriving'))n++;return n};return {rooms:w.rooms.map(r=>({id:r.id,collapsed:r.collapsed,w:r.w,h:r.h})),desks:[...w.desks.keys()],seats:JSON.stringify([...w.seats]),home:w.homes.get('history-main'),actors:['history-a','history-b','history-main'].map(id=>({id,n:count(id)})),transit:w.transit.size,exits:w.exits.size,held:w.physicalLayoutHeld}})()`);
    if (state.actors.some((x) => x.n > 1)) throw Error(stage + ': duplicate actor ' + JSON.stringify(state.actors));
    checks.push({ stage, ...state });
    return state;
  };
  await js(`{
    const w=window.__world, update=w.update.bind(w);
    w.onLayoutChange=()=>{};
    w.update=data=>{if(data.projects.some(p=>p.id==='__activity'))update(data)};
    for(const actor of w.transit.values())actor.destroy();w.transit.clear();w.trips.clear();w.exits.clear();
    w.ext.break?.setThreads([]);w.ext.queue?.setThreads([]);w.park.setThreads([]);
    w.homes.clear();w.homes.set('history-main','main');w.seats.clear();w.extra.clear();w.expandedRooms.clear();w.hidden.clear();
    w.physicalPlans=[];w.physicalLayoutHeld=false;w.hasLayout=false;w.placed.clear();w.roomOf.clear();w.revealedThread=null;
    window.__activityData={projects:[{id:'__activity',title:'Activity policy',root:'',icon:null,scratch:false}],threads:['history-a','history-b','history-main'].map(id=>({id,projectId:'__activity',title:id,updatedAt:new Date().toISOString(),provider:'codex',runStatus:null,pinned:true,settled:true,question:null,model:null}))};
    w.update(window.__activityData);
    window.__activitySeats=JSON.stringify([...w.seats]);
  }`);
  let state = await inspect('completed');
  if (state.desks.length || state.rooms.some((r) => ['main', 'p:__activity', 'freelance'].includes(r.id) && !r.collapsed)) throw Error('Completed history retained physical desks or full offices');
  if (state.home !== 'main') throw Error('Activity policy changed explicit main membership');
  await js(`{const w=window.__world;w.setLayoutHeld(true);window.__activityData.threads[0].runStatus='running';w.update(window.__activityData);if(w.desks.size)throw Error('held drag changed physical layout');w.setLayoutHeld(false)}`);
  state = await inspect('running');
  if (state.desks.length !== 1 || state.desks[0] !== 'history-a' || state.rooms.find((r) => r.id === 'p:__activity').collapsed) throw Error('Running work did not open exactly one physical desk');
  await js(`{window.__activityData.threads[0].runStatus=null;window.__world.update(window.__activityData)}`);
  await inspect('completed while arriving');
  for (let i = 0; i < 100; i++) {
    const folded = await js(`window.__world.rooms.find(r=>r.id==='p:__activity')?.collapsed&&window.__world.desks.size===0`);
    if (folded) break;
    await wait(500);
    if (i === 99) throw Error('Completed actor failed to clear and fold within 50 seconds');
  }
  state = await inspect('completed and folded');
  if (!(await js(`JSON.stringify([...window.__world.seats])===window.__activitySeats`))) throw Error('Completion discarded saved reservations');
  await js(`window.__world.revealThread('history-main')`);
  for (let i = 0; i < 100; i++) {
    if (await js(`window.__world.desks.has('history-main')&&!window.__world.rooms.find(r=>r.id==='main').collapsed`)) break;
    await wait(500);
    if (i === 99) throw Error('Selected history failed to open after old actors reached a safe layout point');
  }
  state = await inspect('one historical selection');
  if (state.desks.length !== 1 || state.desks[0] !== 'history-main' || state.rooms.find((r) => r.id === 'main').collapsed) throw Error('History selection did not reveal only its single reserved main-office desk');
  if (state.home !== 'main') throw Error('History selection changed explicit main membership');
  await js(`{const w=window.__world,t=window.__activityData.threads.find(t=>t.id==='history-main');t.runStatus='running';w.update(window.__activityData);t.runStatus=null;w.update(window.__activityData);if(!w.desks.has(t.id)||w.rooms.find(r=>r.id==='main').collapsed)throw Error('Currently read history desk folded when its work completed')}`);
  await js(`{const w=window.__world;w.setRoomExpanded('freelance',true);if(w.rooms.find(r=>r.id==='freelance').collapsed&&!w.physicalLayoutHeld)throw Error('Deliberate office expansion failed')}`);
  return { ok: true, checks };
};
