import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = (await readFile(new URL('../src/office/office-width.ts', import.meta.url), 'utf8')).replace("import './office-width.css';", '');
const code = (await transformWithOxc(source, 'office-width.ts')).code;
const { officeDimensions, officeColumns, mountOfficeWidth, releaseOfficeWidth } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
for (const cols of [1, 2, 3, 4, 5, 6]) {
  const widths = new Set();
  for (const slots of [0, 1, 2, 3, 7, 19, 40]) {
    const size = officeDimensions(slots, cols, 420, 380);
    widths.add(size.w);
    assert.equal(size.h, 180 + Math.ceil(Math.max(1, slots) / cols) * 380);
    assert.equal(size.cols, cols);
  }
  assert.equal(widths.size, 1, 'jobs never change the selected horizontal width');
}
for (const value of [undefined, NaN, Infinity, -10, 0]) assert.equal(officeColumns(value), 1);
assert.equal(officeColumns(100), 6);
class Element {
  listeners = new Map(); children = []; style = {}; className = ''; offsetWidth = 540; capture = null;
  addEventListener(name, cb) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(cb); }
  removeEventListener(name, cb) { this.listeners.get(name)?.delete(cb); }
  emit(name, extra = {}) { const event = { button: 0, pointerId: 1, clientX: 20, preventDefault() {}, stopPropagation() {}, ...extra }; for (const cb of [...this.listeners.get(name) ?? []]) cb(event); }
  append(...els) { for (const el of els) { this.children.push(el); el.parent = this; } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(el => el !== this); }
  setAttribute() {}
  getBoundingClientRect() { return { width: this.offsetWidth * .5 }; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; this.emit('lostpointercapture'); }
}
globalThis.window = new Element(); globalThis.document = new Element();
document.createElement = () => new Element(); document.hidden = false;
function fixture(cols = 1) {
  const room = new Element(), held = [], changes = [];
  room.offsetWidth = 120 + cols * 420;
  mountOfficeWidth(room, 'Test', cols, 420, value => held.push(value), value => changes.push(value));
  const [controls, handle] = room.children;
  return { room, controls, handle, held, changes };
}
const h = fixture();
assert(h.controls.children[0].disabled);
h.handle.emit('pointerdown'); h.handle.emit('pointermove', { clientX: 440 });
assert.deepEqual(h.changes, [], 'drag previews without changing the live floor');
assert.equal(h.room.children[2].style.width, '1380px', 'drag respects scene zoom');
h.handle.emit('pointerup'); assert.deepEqual(h.changes, [3]); assert.deepEqual(h.held, [true, false]);
assert.equal(h.room.children.length, 2);
for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'escape', 'destroy']) {
  const f = fixture(3); f.handle.emit('pointerdown'); f.handle.emit('pointermove', { clientX: 440 });
  if (cancel === 'blur') window.emit('blur');
  else if (cancel === 'hidden') { document.hidden = true; document.emit('visibilitychange'); document.hidden = false; }
  else if (cancel === 'escape') window.emit('keydown', { key: 'Escape' });
  else if (cancel === 'destroy') releaseOfficeWidth(f.room);
  else f.handle.emit(cancel);
  assert.deepEqual(f.changes, [], cancel); assert.deepEqual(f.held, [true, false]);
  assert.equal(f.room.children.length, 2);
}
const k = fixture(3); k.handle.emit('keydown', { key: 'ArrowRight' }); k.controls.children[0].emit('click');
assert.deepEqual(k.changes, [4, 2]);
for (const target of [window, document]) for (const listeners of target.listeners.values()) assert.equal(listeners.size, 0, 'temporary listeners released');
console.log('PASS: fixed horizontal width, wrapping, zoom-aware resize, keyboard/buttons, cancellation, and listener cleanup');
