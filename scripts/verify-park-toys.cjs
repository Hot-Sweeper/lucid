const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
let clock = 1000, reduced = false;
const animations = new Set(), sounds = [], reactions = [];
class Animation {
  constructor(target, frames, options) { this.target = target; this.frames = frames; this.options = options; animations.add(this); }
  cancel() { this.cancelled = true; animations.delete(this); this.oncancel?.(); }
  finish() { animations.delete(this); this.onfinish?.(); }
}
class Element {
  constructor() { this.children = []; this.listeners = new Map(); this.dataset = {}; this.style = {}; this.attributes = {}; this.parent = null; }
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
const trees = Array.from({ length: 7 }, () => new Element()), bushes = Array.from({ length: 4 }, () => new Element());
const flowers = Array.from({ length: 3 }, () => new Element()), ducks = Array.from({ length: 3 }, () => new Element());
const art = { getAttribute: () => 'outside outside-live season-autumn', querySelectorAll: s => s === '.amb-tree, .amb-bare' ? trees : s === '.amb-bush' ? bushes : s === '.amb-fl' ? flowers : ducks };
const world = { querySelector: () => art };
const document = new Element(); document.hidden = false; document.createElement = () => new Element();
const context = { document, performance: { now: () => clock }, matchMedia: () => ({ matches: reduced }), PARK_K: 1.8, gameSound: { at: (...args) => sounds.push(args) } };
const source = fs.readFileSync('src/office/park-toys.ts', 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.api={ParkToys,parkToySpots,hitParkToy};', context);
const { ParkToys, parkToySpots, hitParkToy } = context.api;
const park = { x: 1000, y: 2000, w: 2340, h: 1872 };
const spots = parkToySpots(park);
assert.equal(spots.length, 13);
assert.equal(spots.filter(s => s.kind === 'tree').length, 4);
assert.equal(spots.filter(s => s.kind === 'bush').length, 4);
assert.equal(spots.find(s => s.id === 'pond-0').x, park.x + park.w / 2 + 260 * 1.8);
assert.equal(spots.find(s => s.id === 'tree-0').x, park.x + 110 * 1.8);
for (const spot of spots) { assert.equal(hitParkToy(spots, spot.x, spot.y)?.id, spot.id); assert(spot.x - spot.rx >= park.x && spot.x + spot.rx <= park.x + park.w); assert(spot.y - spot.ry >= park.y && spot.y + spot.ry <= park.y + park.h); }
assert.equal(hitParkToy(spots, -100, -100), null);
const layer = new Element(), toys = new ParkToys(layer, (...args) => reactions.push(args));
toys.setGeometry(park); assert.equal(layer.children.length, 13);
toys.setGeometry(park); assert.equal(layer.children.length, 13, 'unchanged geometry does not rebuild controls');
const treeButton = layer.children.find(e => e.dataset.toy === 'tree-0');
assert.equal(treeButton.type, 'button'); assert.equal(treeButton.attributes['aria-label'], 'Shake the tree');
let stopped = false;
treeButton.fire('pointerdown', { button: 0, clientX: 10, clientY: 10, stopPropagation() { stopped = true; } });
assert.equal(stopped, false, 'tree hit targets leave pointerdown available to camera panning');
treeButton.fire('click', { detail: 1, clientX: 40, clientY: 10 }); assert.equal(sounds.length, 0, 'drag release does not activate toys');
treeButton.fire('pointerdown', { button: 0, clientX: 10, clientY: 10 });
treeButton.fire('pointermove', { clientX: 30, clientY: 10 });
treeButton.fire('pointermove', { clientX: 10, clientY: 10 });
treeButton.fire('click', { detail: 1, clientX: 10, clientY: 10 }); assert.equal(sounds.length, 0, 'out-and-back pan still suppresses activation');
treeButton.fire('click', { detail: 0 });
assert.equal(sounds[0][0], 'rustle'); assert.equal(reactions.length, 1);
assert(animations.size > 0); assert([...animations].some(a => a.target === trees[3] && a.frames[1].translate), 'shake targets existing park canopy and preserves its normal transform');
clock += 200; const pond = spots.find(s => s.kind === 'pond'); assert(toys.hit(pond.x, pond.y));
assert(sounds.some(s => s[0] === 'splash') && sounds.some(s => s[0] === 'quack'));
for (let i = 0; i < 40; i++) { clock += 200; treeButton.fire('click', { detail: 0 }); }
assert(toys.effects.size <= 36 && toys.shakes.size <= 12, 'click spam has bounded transient elements and shakes');
document.hidden = true; document.fire('visibilitychange'); assert.equal(toys.effects.size, 0); assert.equal(toys.shakes.size, 0); assert.equal(animations.size, 0);
const count = sounds.length; clock += 200; treeButton.fire('click', { detail: 0 }); assert.equal(sounds.length, count, 'hidden worlds produce no effects or interaction sounds');
document.hidden = false; reduced = true; clock += 200; treeButton.fire('click', { detail: 0 });
assert([...animations].every(a => a.options.duration === 250 && a.frames.every(f => !f.transform && !f.translate)), 'reduced motion keeps only a brief static acknowledgement');
for (const a of [...animations]) a.finish(); assert.equal(animations.size, 0); assert.equal(toys.effects.size, 0, 'one-shot completion removes effect nodes');
toys.setGeometry({ ...park, x: park.x + 100 }); assert.equal(layer.children.length, 13); assert.equal(toys.spots[0].x, spots[0].x + 100);
toys.destroy(); assert.equal(layer.children.length, 0); assert.equal(document.listeners.get('visibilitychange').length, 0);
clock += 200; treeButton.fire('click', { detail: 0 }); assert.equal(layer.children.length, 0, 'destroyed owners cannot recreate their effects');
console.log('PASS: exact park hit geometry, semantic controls, drag suppression, real-art shakes, water feedback, bounded effects, reduced motion, visibility cleanup and destroy.');
