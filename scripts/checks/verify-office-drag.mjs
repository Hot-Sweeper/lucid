import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { worldSource } from './world-source.mjs';

// Exercise the actual pointer handlers and placement policy without live T3 writes.
const source = await worldSource();
const policyCode = (await transformWithOxc(await readFile(new URL('../../src/office/room-policy.ts', import.meta.url), 'utf8'), 'room-policy.ts')).code;
const policy = await import('data:text/javascript;base64,' + Buffer.from(policyCode).toString('base64'));
const method = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const code = (await transformWithOxc(`class DragWorld {
${method('  wireDeskDrag(', '  threadDropZone(')}
${method('  /** The reservations of', '  previewThreadDrop(')}
${method('  previewThreadDrop(', '  placeThread(')}
${method('  placeThread(', '\n  select(')}
${method('  homeForThread(', '  reconcilePhysicalLayout(')}
}`, 'office-drag.ts')).code;
class Element {
  handlers = new Map(); children = []; dataset = {}; style = { setProperty(name, value) { this[name] = value; } }; hidden = false;
  append(...els) { this.children.push(...els); }
  get firstElementChild() { return this.children[0]; }
  get lastElementChild() { return this.children.at(-1); }
  setAttribute() {}
  classList = { add() {}, remove() {}, toggle() {} };
  addEventListener(name, cb) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(cb); }
  removeEventListener(name, cb) { this.handlers.get(name)?.delete(cb); }
  dispatch(name, extra = {}) {
    const e = { button: 0, pointerId: 1, clientX: 10, clientY: 10, target: { closest: () => null }, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra };
    for (const cb of [...this.handlers.get(name) ?? []]) cb(e);
  }
  setPointerCapture() {} releasePointerCapture() {} remove() {}
}
function harness(room = 'freelance') {
  const win = new Element(), doc = { body: new Element(), createElement: () => new Element() };
  win.getSelection = () => null;
  const timers = [], cues = [];
  const World = new Function('gsap', 'window', 'document', 'setTimeout', 'columnsForRoom', 'reserveRoomSeats', 'snakeSeat', 'reorderPhysicalSeats', 'UNIT_W', 'UNIT_H', 'WALL_FACE', 'SLOT_W', 'SLOT_H', 'gameSound', 'hasOfficeDesk', 'insertSeat', code + '; return DragWorld;')(
    { set(el, props) { Object.assign(el.style, props); }, killTweensOf() {} }, win, doc, cb => timers.push(cb), () => 2, policy.reserveRoomSeats, policy.snakeSeat, (_, __, after) => after,
    400, 350, 100, 440, 400, { play: cue => cues.push(cue) }, t => !t.settled, policy.insertSeat);
  const w = new World(), a = { el: new Element(), room, threadId: 'a' }, b = { el: new Element(), room, threadId: 'b' };
  Object.assign(w, {
    cam: { s: 1 }, slotDesks: new Map([[`${room}#0`, a], [`${room}#1`, b]]), seats: new Map([['main', []], [room, ['a', 'b']]]),
    rooms: [{ id: 'main', kind: 'main', title: 'Main office', x: 0, y: 0, w: 1000, h: 600 }, { id: 'freelance', kind: 'freelance', x: 1100, y: 0, w: 1000, h: 600 }],
    homes: new Map(), expandedRooms: new Set(), collapsedRooms: new Set(['main']), placed: new Map(), orchThread: 'boss',
    lastData: { projects: [{ id: 'project' }], threads: [{ id: 'a', runStatus: 'running' }, { id: 'b', question: 'Help?' }] },
    desks: new Map(), roomColumns: new Map(), transit: new Map(), deskLayer: { appendChild() {} }, deskPos: () => ({ x: 0, y: 140 }),
    roomById(id) { return this.rooms.find(r => r.id === id); }, stopFollow() {}, cancelCameraTween() {},
    slideDesk(desk, at) { Object.assign(desk.el.style, { left: at.x, top: at.y }); },
    threadDropZone(x) { return x < 0 ? null : x > 1000 ? 'freelance' : 'main'; },
    previewThreadDrop(id) { this.preview = id; },
    update() { this.updates = (this.updates ?? 0) + 1; this.forcedUpdates = (this.forcedUpdates ?? 0) + Number(!!this.forceLayout); this.forceLayout = false; }, onLayoutChange() { this.saves = (this.saves ?? 0) + 1; },
  });
  w.wireDeskDrag(a);
  const start = () => a.el.dispatch('pointerdown');
  let lastX = 10;
  const move = x => { lastX = x; a.el.dispatch('pointermove', { clientX: x, clientY: 20 }); };
  const up = () => a.el.dispatch('pointerup', { clientX: lastX, clientY: 20 });
  return { w, a, b, win, start, move, up, cues };
}
for (const [room, x, destination] of [['freelance', 200, 'main'], ['main', 1200, 'freelance']]) {
  const h = harness(room); h.start(); h.move(x);
  assert.equal(h.w.preview, destination);
  assert.equal(h.w.deskDragActive, true);
  h.up();
  assert.equal(h.w.homes.get('a'), destination);
  assert.deepEqual(h.w.pendingPlacement.origin, { x: 0, y: 140 }, 'walking starts at the physical source seat, not the carried preview');
  assert.deepEqual(h.w.seats.get(room), [null, 'b']);
  assert.equal(h.w.expandedRooms.has(destination), true);
  assert.equal(h.w.collapsedRooms.has(destination), false);
  assert.equal(h.w.saves, 1);
  assert.equal(h.w.preview, destination, 'feedback remains until the safe physical handoff');
  assert.equal(h.w.deskDragActive, false);
  assert.equal(h.w.homeForThread({ id: 'a', pinned: true, projectId: 'project' }, h.w.lastData.projects), destination, 'explicit placement survives pinning and refresh');
  assert.deepEqual(h.cues, ['switch']);
}
for (const end of ['escape', 'blur', 'pointercancel', 'lostpointercapture', 'hall']) {
  const h = harness(); h.start(); h.move(200);
  if (end === 'escape') h.win.dispatch('keydown', { key: 'Escape' });
  else if (end === 'blur') h.win.dispatch('blur');
  else if (end === 'hall') { h.move(-100); h.up(); }
  else h.a.el.dispatch(end);
  h.up();
  assert.equal(h.w.homes.size, 0, `${end} never transfers`);
  assert.equal(h.w.saves ?? 0, 0);
  assert.deepEqual(h.w.seats.get('freelance'), ['a', 'b']);
  assert.equal(h.w.preview, null);
}
{
  const h = harness('main'); h.start(); h.move(500); h.up();
  assert.deepEqual(h.w.seats.get('main'), ['b', 'a'], 'same-office reordering still works in Main office');
  assert.equal(h.w.homes.size, 0);
  assert.equal(h.w.saves, 1);
}
{
  const h = harness(); h.start(); h.a.el.dispatch('pointermove', { clientX: 12, clientY: 12 }); h.up();
  assert.equal(h.w.homes.size, 0, 'click jitter does not move a desk');
  assert.equal(h.w.saves ?? 0, 0);
  assert.equal(h.w.placeThread('boss', 'main'), false);
  assert.equal(h.w.placeThread('missing', 'main'), false);
  assert.equal(h.w.placeThread('a', 'missing'), false);
  assert.equal(h.w.placeThread('b', 'main'), true);
  assert.deepEqual(h.w.placed.get('b'), { room: 'queue' }, 'questions retain their queue while their home moves');
}
console.log('PASS: desk transfers to/from Main office, pinned homes, same-room reorder, threshold, cancel, invalid drops and question queue');

// A drop is final: it lands on the snake place it was dropped on and the next layout pass is
// forced, so robots walking elsewhere can never hold the desk back in its old room.
{
  const h = harness();
  h.w.lastData.threads.push({ id: 'm1', runStatus: 'running' }, { id: 'm2', runStatus: 'running' });
  h.w.homes.set('m1', 'main'); h.w.homes.set('m2', 'main'); h.w.seats.set('main', ['m1', 'm2']);
  assert.equal(h.w.dropPlace('main', 'a', { x: 80, y: 150 }), 0, 'nearest place to the carried desk');
  assert.equal(h.w.dropPlace('main', 'a', { x: 520, y: 560 }), 2, 'the next free place after the last desk');
  assert.equal(h.w.dropPlace('main', 'a', { x: 5000, y: 5000 }), 2, 'never beyond the next free place');
  h.start(); h.move(90); h.up();
  assert.deepEqual(h.w.seats.get('main'), ['a', 'm1', 'm2'], 'the dropped desk takes the place it was dropped on');
  assert.equal(h.w.forcedUpdates, 1, 'the transfer forces its layout pass');
  assert.equal(h.w.forceLayout, false, 'the forced pass consumed the flag');
  assert.equal(h.w.threadDropPreview, undefined);
}
{
  const h = harness('main'); h.start(); h.move(500); h.up();
  assert.deepEqual(h.w.seats.get('main'), ['b', 'a']);
  assert.equal(h.w.forcedUpdates, 1, 'a same-room reorder forces its layout pass');
}
{
  const h = harness(); h.start(); h.move(200); h.win.dispatch('keydown', { key: 'Escape' }); h.up();
  assert.equal(h.w.forcedUpdates ?? 0, 0, 'a cancelled drag forces nothing');
  assert.equal(h.w.placeThread('a', 'main'), true);
  assert.equal(h.w.forcedUpdates, 1, 'menu and sidebar moves force their layout pass too');
}
console.log('PASS: drops land on the dropped-on place and force their layout pass (drag, reorder, menu)');

// The same preview node survives repeated motion and reconciles on world updates.
{
  const h = harness(); delete h.w.previewThreadDrop;
  h.w.previewThreadDrop('main', 'a');
  const preview = h.w.threadDropPreview;
  assert.equal(preview.firstElementChild.textContent, 'Move to Main office');
  assert.equal(preview.lastElementChild.textContent, 'Desk 1');
  h.w.previewThreadDrop('main', 'a');
  assert.equal(h.w.threadDropPreview, preview, 'pointer tracking never remounts the preview');
  h.w.pendingPlacement = { id: 'a', room: 'main' };
  h.w.syncPlacementPreview();
  assert.equal(preview.firstElementChild.textContent, 'Moving to Main office');
  h.w.desks.set('a', {room:'main'}); h.w.physicalLayoutHeld = true;
  h.w.syncPlacementPreview(); assert.equal(h.w.threadDropPreview, preview, 'keep feedback during safe floor handoff');
  h.w.physicalLayoutHeld = false; h.w.syncPlacementPreview();
  assert.equal(h.w.threadDropPreview, null, 'arrival clears feedback immediately');
  assert.equal(h.w.pendingPlacement, null);
  h.w.rooms[0].collapsed = true;
  h.w.previewThreadDrop('main', 'a');
  assert.equal(h.w.threadDropPreview.lastElementChild.hidden, true);
  assert(h.w.threadDropPreview.firstElementChild.textContent.includes('opens on drop'));
}
console.log('PASS: stable live landing preview, honest pending handoff, collapsed target and immediate arrival cleanup');

{
  const h = harness(); delete h.w.previewThreadDrop;
  h.w.homes.set('b', 'main'); h.w.seats.set('main', ['b', null]);
  h.w.previewThreadDrop('main', 'a');
  assert.equal(h.w.threadDropPreview.lastElementChild.textContent, 'Desk 2', 'landing uses the real seat reservation policy');
  h.w.pendingPlacement = { id: 'a', room: 'main' };
  h.w.lastData.threads = h.w.lastData.threads.filter(t => t.id !== 'a');
  h.w.syncPlacementPreview();
  assert.equal(h.w.pendingPlacement, null, 'removed sessions cannot leave a permanent pending marker');
}
{
  const h = harness(); h.start(); h.move(1200);
  h.a.el.dispatch('pointerup', {clientX:200,clientY:20});
  assert.equal(h.w.homes.get('a'),'main','release coordinates win over the previous move event');
}

{
  const menus = await readFile(new URL('../../src/app/menus.ts', import.meta.url), 'utf8');
  const handler = menus.slice(menus.indexOf('    app.world.onAddDesk ='), menus.indexOf('    app.world.onFreeDeskMenu ='));
  const compiled = (await transformWithOxc(handler, 'add-desk.ts')).code;
  const events = [], world = {lastData:{threads:[]},extra:new Map(),seats:new Map([['main',[]]]),setRoomExpanded(){},update(){events.push(['paint',this.extra.get('main'),this.seats.get('main').length]);}};
  new Function('app',compiled)({world,saveSettings:()=>events.push(['save']),refresh:()=>{events.push(['network']);return new Promise(()=>{});}});
  world.onAddDesk('main');
  assert.deepEqual(events[0],['paint',1,1],'a new desk appears locally before any network refresh can finish');
}
console.log('PASS: adding a desk paints the new capacity immediately, before saving or network refresh');
