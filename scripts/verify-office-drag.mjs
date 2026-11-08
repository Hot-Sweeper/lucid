import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

// Exercise the actual pointer handlers and placement policy without live T3 writes.
const source = await readFile(new URL('../src/office/world.ts', import.meta.url), 'utf8');
const method = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const code = (await transformWithOxc(`class DragWorld {
${method('  private wireDeskDrag(', '  private threadDropPreview')}
${method('  placeThread(', '\n  select(')}
${method('  private homeForThread(', '  private reconcilePhysicalLayout(')}
}`, 'office-drag.ts')).code;
class Element {
  handlers = new Map(); style = {}; hidden = false;
  classList = { add() {}, remove() {} };
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
  const World = new Function('gsap', 'window', 'document', 'setTimeout', 'columnsForRoom', 'snakeSeat', 'reorderPhysicalSeats', 'UNIT_W', 'UNIT_H', 'WALL_FACE', 'SLOT_W', 'SLOT_H', 'gameSound', code + '; return DragWorld;')(
    { set(el, props) { Object.assign(el.style, props); }, killTweensOf() {} }, win, doc, cb => timers.push(cb), () => 2, i => ({ c: i, row: 0 }), (_, __, after) => after,
    400, 350, 100, 440, 400, { play: cue => cues.push(cue) });
  const w = new World(), a = { el: new Element(), room, threadId: 'a' }, b = { el: new Element(), room, threadId: 'b' };
  Object.assign(w, {
    cam: { s: 1 }, slotDesks: new Map([[`${room}#0`, a], [`${room}#1`, b]]), seats: new Map([['main', []], [room, ['a', 'b']]]),
    rooms: [{ id: 'main', kind: 'main', title: 'Main office', x: 0, y: 0, w: 1000, h: 600 }, { id: 'freelance', kind: 'freelance', x: 1100, y: 0, w: 1000, h: 600 }],
    homes: new Map(), expandedRooms: new Set(), collapsedRooms: new Set(['main']), placed: new Map(), orchThread: 'boss',
    lastData: { projects: [{ id: 'project' }], threads: [{ id: 'a', runStatus: 'running' }, { id: 'b', question: 'Help?' }] },
    transit: new Map(), deskLayer: { appendChild() {} }, deskPos: () => ({ x: 0, y: 140 }),
    roomById(id) { return this.rooms.find(r => r.id === id); }, stopFollow() {}, cancelCameraTween() {},
    slideDesk(desk, at) { Object.assign(desk.el.style, { left: at.x, top: at.y }); },
    threadDropZone(x) { return x < 0 ? null : x > 1000 ? 'freelance' : 'main'; },
    previewThreadDrop(id) { this.preview = id; },
    update() { this.updates = (this.updates ?? 0) + 1; }, onLayoutChange() { this.saves = (this.saves ?? 0) + 1; },
  });
  w.wireDeskDrag(a);
  const start = () => a.el.dispatch('pointerdown');
  const move = x => a.el.dispatch('pointermove', { clientX: x, clientY: 20 });
  const up = () => a.el.dispatch('pointerup');
  return { w, a, b, win, start, move, up, cues };
}
for (const [room, x, destination] of [['freelance', 200, 'main'], ['main', 1200, 'freelance']]) {
  const h = harness(room); h.start(); h.move(x);
  assert.equal(h.w.preview, destination);
  assert.equal(h.w.deskDragActive, true);
  h.up();
  assert.equal(h.w.homes.get('a'), destination);
  assert.deepEqual(h.w.seats.get(room), [null, 'b']);
  assert.equal(h.w.expandedRooms.has(destination), true);
  assert.equal(h.w.collapsedRooms.has(destination), false);
  assert.equal(h.w.saves, 1);
  assert.equal(h.w.preview, null);
  assert.equal(h.w.deskDragActive, false);
  assert.equal(h.w.homeForThread({ id: 'a', pinned: true, manager: { projectId: 'project' } }, h.w.lastData.projects), destination, 'explicit placement survives manager routing and refresh');
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
console.log('PASS: desk transfers to/from Main office, manager homes, same-room reorder, threshold, cancel, invalid drops and question queue');
