const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
let clock = 1000, reduced = false, lampLevel = '1';
const animations = new Set(), sounds = [], reactions = [];
class Animation {
  constructor(target, frames, options) { this.target = target; this.frames = frames; this.options = options; animations.add(this); }
  cancel() { this.cancelled = true; animations.delete(this); this.oncancel?.(); }
  finish() { animations.delete(this); this.onfinish?.(); }
}
class Element {
  constructor(name = 'el') {
    this.name = name; this.children = []; this.listeners = new Map(); this.dataset = {}; this.style = {}; this.attributes = {}; this.parent = null;
    const classes = new Set();
    this.classList = { contains: c => classes.has(c), toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); }, has: classes };
  }
  set className(v) { this._cls = v; }
  get className() { return this._cls ?? ''; }
  append(el) { el.parent = this; this.children.push(el); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(name, fn) { const list = this.listeners.get(name) ?? []; list.push(fn); this.listeners.set(name, list); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(f => f !== fn)); }
  fire(name, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener({ stopPropagation() {}, ...event }); }
  closest() { return world; }
  animate(frames, options) { return new Animation(this, frames, options); }
}
// The drawn park: one group per swayable plant and per lamp (outside.ts).
const sway = new Map(), lamps = new Map();
const world = {
  querySelector(sel) {
    let m = /data-sway="([^"]+)"/.exec(sel); if (m) { if (!sway.has(m[1])) sway.set(m[1], new Element(m[1])); return sway.get(m[1]); }
    m = /data-lamp="([^"]+)"/.exec(sel); if (m) { if (!lamps.has(m[1])) lamps.set(m[1], new Element('lamp' + m[1])); return lamps.get(m[1]); }
    return { getAttribute: () => 'outside outside-live season-autumn' };
  },
  querySelectorAll: () => [],
};
const document = new Element(); document.hidden = false; document.createElement = () => new Element('span');
// PARK_LAYOUT is read from the real drawing so the click geometry cannot drift from the art.
const outside = fs.readFileSync('src/office/outside.ts', 'utf8');
const layoutSource = outside.slice(outside.indexOf('export const PARK_LAYOUT'), outside.indexOf('\n};', outside.indexOf('export const PARK_LAYOUT')) + 3).replace('export ', '');
const context = { document, performance: { now: () => clock }, matchMedia: () => ({ matches: reduced }), PARK_K: 1.8,
  gameSound: { at: (...args) => sounds.push(args) }, getComputedStyle: () => ({ getPropertyValue: () => lampLevel }), Math, Date };
vm.runInNewContext(stripTypeScriptTypes(layoutSource, { mode: 'transform' }) + ';globalThis.PARK_LAYOUT=PARK_LAYOUT;', context);
const source = fs.readFileSync('src/office/park-toys.ts', 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.api={ParkToys,parkSpots,hitParkSpot};', context);
const { ParkToys, parkSpots, hitParkSpot } = context.api, L = context.PARK_LAYOUT;
const park = { x: 1000, y: 2000, w: 2340, h: 1872 }, cx = park.x + park.w / 2, cy = park.y + park.h / 2, at = (x, y) => [cx + x * 1.8, cy + y * 1.8];
const spots = parkSpots(park);
assert.equal(spots.filter(s => s.kind === 'lamp').length, L.lamps.length);
assert.equal(spots.filter(s => s.kind === 'tree').length, L.trees.length);
assert.equal(spots.filter(s => s.kind === 'flowers').length, L.beds.length);
assert.equal(hitParkSpot(spots, ...at(L.pond.x + 40, L.pond.y))?.kind, 'pond');
assert.equal(hitParkSpot(spots, ...at(L.fountain.x, L.fountain.y))?.kind, 'fountain');
assert.equal(hitParkSpot(spots, ...at(L.trees[2][0], L.trees[2][1]))?.key, 't2');
assert.equal(hitParkSpot(spots, ...at(L.lamps[0][0], L.lamps[0][1] - 40))?.kind, 'lamp');
assert.equal(hitParkSpot(spots, ...at(L.beds[0][0], L.beds[0][1]))?.key, 'f0');
assert.equal(hitParkSpot(spots, -100, -100), null);

const layer = new Element('layer'), toys = new ParkToys(layer, (...args) => reactions.push(args));
toys.setGeometry(park);
assert.equal(layer.children.length, 0, 'no buttons or hit zones are added to the page');
// a tree: its own drawn group sways, leaves fall from it, robots may react
assert(toys.hit(...at(L.trees[2][0], L.trees[2][1])));
assert.equal(sounds.at(-1)[0], 'rustle'); assert.equal(reactions.length, 1);
assert([...animations].some(a => a.target === sway.get('t2') && /rotate/.test(a.frames[1].transform)), 'the clicked tree sways');
assert(layer.children.some(e => e.className.includes('park-leaf')), 'leaves fall');
// water ripples exactly where it was clicked
clock += 200; const [px, py] = at(L.pond.x + 30, L.pond.y + 10); assert(toys.hit(px, py));
const ripple = layer.children.find(e => e.className.includes('park-ripple'));
assert(ripple && ripple.style.cssText.includes(`left:${px}px`) && ripple.style.cssText.includes(`top:${py}px`), 'ripples start at the click');
assert(sounds.some(s => s[0] === 'splash'));
// a lamp switches off when lit and back on
clock += 200; toys.hit(...at(L.lamps[1][0], L.lamps[1][1] - 40));
assert(lamps.get('1').classList.contains('off') && !lamps.get('1').classList.contains('on'), 'a lit lamp switches off');
clock += 200; toys.hit(...at(L.lamps[1][0], L.lamps[1][1] - 40));
assert(lamps.get('1').classList.contains('on'), 'and on again');
lampLevel = '0'; clock += 200; toys.hit(...at(L.lamps[2][0], L.lamps[2][1] - 40));
assert(lamps.get('2').classList.contains('on'), 'a lamp clicked in daylight switches on');
// flowers puff petals
clock += 200; toys.hit(...at(L.beds[0][0], L.beds[0][1]));
assert(layer.children.some(e => e.className.includes('park-petal')));
// bounded, cleaned up, quiet when hidden
for (let i = 0; i < 60; i++) { clock += 200; toys.hit(...at(L.trees[0][0], L.trees[0][1])); }
assert(toys.effects.size <= 48, 'click spam has bounded transient elements');
document.hidden = true; document.fire('visibilitychange'); assert.equal(toys.effects.size, 0); assert.equal(toys.shakes.size, 0); assert.equal(animations.size, 0);
const count = sounds.length; clock += 200; assert.equal(toys.hit(...at(L.trees[0][0], L.trees[0][1])), false); assert.equal(sounds.length, count, 'hidden worlds stay quiet');
document.hidden = false; reduced = true; clock += 200; toys.hit(...at(L.trees[0][0], L.trees[0][1]));
assert([...animations].every(a => a.options.duration === 250 && a.frames.every(f => !f.transform)), 'reduced motion keeps only a brief static acknowledgement');
for (const a of [...animations]) a.finish(); assert.equal(toys.effects.size, 0, 'one-shot completion removes effect nodes');
toys.destroy(); assert.equal(document.listeners.get('visibilitychange').length, 0);
clock += 200; assert.equal(toys.hit(...at(L.trees[0][0], L.trees[0][1])), false, 'destroyed owners cannot recreate their effects');
console.log('PASS: click the drawn park (no buttons): exact hit geometry from the art, swaying trees, ripples at the click, lamp switching, petals, bounded effects, reduced motion, visibility cleanup and destroy.');
