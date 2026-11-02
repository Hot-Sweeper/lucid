// Coordinated native fixture. Reorder/fold persistence callbacks are restored without writing settings.
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const result = {};
  const save = () => fs.writeFileSync(path.join(out, 'room-arrangement-checks.json'), JSON.stringify(result, null, 2));
  const drag = async (from, to) => {
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...from });
    for (let i = 1; i <= 8; i++) { wc.sendInputEvent({ type: 'mouseMove', button: 'left', modifiers: ['leftbuttondown'], x: Math.round(from.x + (to.x - from.x) * i / 8), y: Math.round(from.y + (to.y - from.y) * i / 8) }); await wait(10); }
    await wait(40);
  };
  try {
    await js(`{
      const w=window.__world,f=window.__roomArrangement={w,saved:{order:[...w.roomOrder],expanded:[...w.expandedRooms],onOrder:w.onRoomOrder,onLayout:w.onLayoutChange,hold:w.setLayoutHeld,data:w.lastData,seats:JSON.stringify([...w.seats]),homes:JSON.stringify([...w.homes])},orders:[],holds:[]};
      f.ids=()=>w.orderRooms(w.rooms.filter(r=>r.id.startsWith('p:')||r.id==='freelance')).map(r=>r.id);
      if(f.ids().length<2)throw Error('Room arrangement fixture needs two offices');
      w.onRoomOrder=order=>{f.orders.push([...order]);w.onRooms(w.rooms)};w.onLayoutChange=()=>{};
      w.setLayoutHeld=function(active){f.holds.push(active);return f.saved.hold.call(this,active)};
      w.overview();void 0;
    }`);
    await wait(1100);
    const geometry = await js(`{
      const f=window.__roomArrangement,w=f.w,ids=f.ids(),source=w.rooms.find(r=>r.id===ids.at(-1)),target=w.rooms.find(r=>r.id===ids[0]),h=source.el.querySelector('.room-sign-hit'),a=h.getBoundingClientRect(),b=target.el.getBoundingClientRect();
      f.source=source.id;f.target=target.id;f.expected=[source.id,...ids.filter(id=>id!==source.id)];
      ({from:{x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2)},to:{x:Math.round(b.left+b.width*.2),y:Math.round(b.top+b.height*.2)}})
    }`);
    result.headerGeometry = geometry;
    await drag(geometry.from, geometry.to);
    result.preview = await js(`{const f=window.__roomArrangement;({shown:!!document.querySelector('.room-drop-preview:not([hidden])'),ghost:document.querySelector('.room-drag-ghost')?.textContent,held:f.holds.at(-1)===true,uncommitted:f.orders.length===0})}`);
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...geometry.to }); await wait(250);
    result.headerDrop = await js(`{const f=window.__roomArrangement;({actual:f.ids(),physical:f.w.rooms.filter(r=>r.id.startsWith('p:')||r.id==='freelance').map(r=>r.id),expected:f.expected,savedImmediately:JSON.stringify(f.orders.at(-1))===JSON.stringify(f.w.roomOrder),held:f.holds.at(-1),clean:!document.querySelector('.room-drag-ghost,.room-drop-preview')&&!document.body.classList.contains('room-dragging'),writes:f.orders.length})}`);
    const settleStart = Date.now();
    for (;;) {
      result.settled = await js(`{const f=window.__roomArrangement,physical=f.w.rooms.filter(r=>r.id.startsWith('p:')||r.id==='freelance').map(r=>r.id);({applied:JSON.stringify(physical)===JSON.stringify(f.expected),physical,transit:f.w.transit.size,exits:f.w.exits.size})}`);
      if (result.settled.applied || Date.now() - settleStart >= 30000) break;
      await wait(200);
    }
    result.settled.elapsedMs = Date.now() - settleStart;

    const cancel = await js(`{
      const f=window.__roomArrangement,w=f.w,source=w.rooms.find(r=>r.id===f.source),target=w.rooms.find(r=>r.id===f.target),h=document.querySelector('.room-grab[data-room-id="'+CSS.escape(source.id)+'"]');h.scrollIntoView({block:'nearest'});const a=h.getBoundingClientRect(),b=target.el.getBoundingClientRect();f.beforeCancel=f.ids();f.cancelWrites=f.orders.length;
      ({from:{x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2)},to:{x:Math.round(b.left+b.width*.8),y:Math.round(b.top+b.height*.5)}})
    }`);
    await drag(cancel.from, cancel.to);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...cancel.to }); await wait(150);
    result.cancel = await js(`{const f=window.__roomArrangement;({unchanged:JSON.stringify(f.ids())===JSON.stringify(f.beforeCancel),writes:f.orders.length===f.cancelWrites,held:f.holds.at(-1),clean:!document.querySelector('.room-drag-ghost,.room-drop-preview')&&!document.body.classList.contains('room-dragging')})}`);
    result.menu = await js(`{
      const f=window.__roomArrangement,before=f.ids();document.querySelector('.room-grab[data-room-id="'+CSS.escape(before[0])+'"]').click();
      const button=[...document.querySelectorAll('.pop-menu button[role="menuitem"]')].find(b=>b.textContent==='Move office later');if(!button)throw Error('Accessible office move menu missing');button.click();
      ({moved:f.ids()[1]===before[0],writes:f.orders.length})
    }`);
    result.fold = await js(`{
      const f=window.__roomArrangement,w=f.w,r=w.rooms.find(r=>r.collapsed&&(r.kind==='project'||r.kind==='freelance'))||w.rooms.find(r=>r.kind==='project'),quiet=!!r.collapsed;
      if(w.isRoomExpanded(r.id))w.setRoomExpanded(r.id,false);
      const button=()=>[...document.querySelectorAll('[data-fold-room]')].find(b=>b.dataset.foldRoom===r.id);button().click();
      const opened=w.isRoomExpanded(r.id)&&!w.rooms.find(q=>q.id===r.id).collapsed;button().click();
      ({quietAvailable:quiet,pinOpened:opened,autoRestored:!w.isRoomExpanded(r.id),quietFolded:!quiet||!!w.rooms.find(q=>q.id===r.id).collapsed,homesPreserved:JSON.stringify([...w.homes])===f.saved.homes,reservationsPreserved:JSON.parse(f.saved.seats).every(([id,seats])=>seats.every((thread,i)=>(w.seats.get(id)||[])[i]===thread))})
    }`);
    result.passed = result.preview.shown && result.preview.held && result.preview.uncommitted
      && JSON.stringify(result.headerDrop.actual) === JSON.stringify(result.headerDrop.expected) && result.headerDrop.savedImmediately && result.headerDrop.held === false && result.headerDrop.clean && result.headerDrop.writes === 1 && result.settled.applied
      && result.cancel.unchanged && result.cancel.writes && result.cancel.held === false && result.cancel.clean && result.menu.moved
      && result.fold.pinOpened && result.fold.autoRestored && result.fold.quietFolded && result.fold.homesPreserved && result.fold.reservationsPreserved;
    save();
    if (!result.passed) throw Error('Office header reorder, Escape, accessible move or keep-open/auto-size behavior failed');
  } finally {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 0, y: 0 });
    await js(`{const f=window.__roomArrangement;if(f){const w=f.w;w.setLayoutHeld(false);w.setLayoutHeld=f.saved.hold;w.roomOrder=f.saved.order;w.expandedRooms=new Set(f.saved.expanded);if(f.saved.data)w.update(f.saved.data);w.onRoomOrder=f.saved.onOrder;w.onLayoutChange=f.saved.onLayout;delete window.__roomArrangement}void 0}`);
  }
  return result;
};
