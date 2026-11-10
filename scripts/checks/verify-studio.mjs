// Studio: a render diff becomes the right playback steps, saves are scheduled only while someone
// can watch, and the app releases its frame, listener, timers and session on teardown.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { Stage, matchChildren } from '../../electron/studio-page/stage-engine.mjs';

const compile = async (name) => {
  const source = (await readFile(new URL(`../../src/os/${name}.ts`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  return (await transformWithOxc(source, `${name}.ts`)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
};

// ---------- a small layout-aware DOM for the planner ----------
const DEFAULT_STYLE = { display: 'block', visibility: 'visible', opacity: '1', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', borderTopWidth: '0px', borderTopColor: 'rgb(0, 0, 0)', boxShadow: 'none', borderTopLeftRadius: '0px', borderRadius: '0px', color: 'rgb(20, 20, 20)', fontSize: '16px', fontWeight: '400' };
class Node0 { constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; } get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; } remove() { if (this.parentNode) { const list = this.parentNode.childNodes; list.splice(list.indexOf(this), 1); this.parentNode = null; } } }
class Text extends Node0 { constructor(doc, data) { super(doc); this.nodeType = 3; this.data = data; } get textContent() { return this.data; } }
class El extends Node0 {
  constructor(doc, tag, attrs = {}, rect = null, style = {}) { super(doc); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.rect = rect; this.cs = style; this.style = { setProperty() {}, removeProperty() {} }; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get id() { return this.attrs.id || ''; }
  get namespaceURI() { return 'http://www.w3.org/1999/xhtml'; }
  get classList() { return (this.attrs.class || '').split(/\s+/).filter(Boolean); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this.append(new Text(this.ownerDocument, value)); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.childNodes.push(n); } }
  insertBefore(node, ref) { if (!ref) return this.append(node); node.remove(); node.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, node); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  getBoundingClientRect() { const [x, y, w, h] = this.rect || [0, 0, 0, 0]; return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y }; }
  animate() { return { pause() {}, play() {}, cancel() { this.cancelled = true; }, currentTime: 0, finished: Promise.resolve() }; }
}
function page(build) {
  const doc = { createElement: (tag) => new El(doc, tag), importNode: (node) => clone(node, doc) };
  doc.documentElement = new El(doc, 'html', {}, [0, 0, 1200, 800]);
  doc.head = new El(doc, 'head'); doc.body = new El(doc, 'body', {}, [0, 0, 1200, 800]);
  doc.documentElement.append(doc.head, doc.body);
  const h = (tag, attrs, rect, style, ...kids) => { const el = new El(doc, tag, attrs, rect, style); el.append(...kids.map((k) => typeof k === 'string' ? new Text(doc, k) : k)); return el; };
  doc.body.append(...build(h));
  const win = { innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, getComputedStyle: (el) => ({ ...DEFAULT_STYLE, ...el.cs }) };
  return { doc, win };
}
function clone(node, doc) {
  if (node.nodeType === 3) return new Text(doc, node.data);
  const copy = new El(doc, node.tagName, node.attrs, node.rect, node.cs);
  copy.append(...node.childNodes.map((c) => clone(c, doc)));
  return copy;
}
const all = (el) => [el, ...el.children.flatMap(all)];
const navy = { backgroundColor: 'rgb(27, 32, 68)' }, peach = { backgroundColor: 'rgb(255, 159, 90)', borderTopLeftRadius: '12px' }, inline = { display: 'inline' };

// ---------- planning: what changed between two saves ----------
const before = page((h) => [
  h('header', { id: 'top' }, [0, 0, 1200, 60], navy),
  h('p', { class: 'intro' }, [0, 60, 1200, 40], {}, 'Hello'),
  h('img', { class: 'old', src: 'a.png' }, [0, 100, 300, 200]),
]);
const after = page((h) => [
  h('header', { id: 'top' }, [0, 0, 1200, 60], { backgroundColor: 'rgb(40, 40, 90)' }),
  h('p', { class: 'intro' }, [0, 60, 1200, 40], {}, 'Hello world'),
  h('section', { class: 'hero' }, [0, 200, 1200, 260], peach, h('h1', {}, [40, 240, 600, 60], {}, 'Welcome ', h('em', {}, [200, 240, 100, 60], inline, 'home'))),
  h('img', { class: 'photo', src: 'b.png' }, [0, 500, 600, 300]),
]);
const planner = Object.create(Stage.prototype);
const plan = planner.plan(before.doc, before.win, after.doc, after.win);
assert.deepEqual(plan.steps.map((s) => s.kind), ['delete', 'restyle', 'retype', 'rect', 'text', 'image'], 'Removed parts go first, then changes top to bottom');
assert.ok(plan.speed >= 1);
const [del, restyle, retype, rect, text, image] = plan.steps;
assert.equal(restyle.el.tagName, 'HEADER'); assert.ok(restyle.op.props.includes('fill')); assert.ok(restyle.morph, 'Restyles tween from the old look');
assert.equal(retype.oldText, 'Hello'); assert.equal(retype.el.textContent, 'Hello', 'Old wording stays until it is retyped');
assert.equal(rect.el.attrs.class, 'hero'); assert.equal(rect.look.radius, 12, 'Boxes are rounded after they are drawn');
assert.equal(text.el.tagName, 'H1'); assert.equal(text.el.textContent, '', 'New text is typed in from empty');
assert.equal(image.el.attrs.class, 'photo');
const ghost = after.doc.body.children.find((el) => el.hasAttribute('data-studio-ghost'));
assert.equal(ghost?.attrs.class, 'old', 'A deleted image stays as a copy until it is selected and removed');
assert.deepEqual(all(after.doc.body).filter((el) => el.hasAttribute('data-studio-pending')).map((el) => el.tagName), ['SECTION', 'H1', 'IMG'], 'New parts take no space until placed');
assert.ok(after.doc.head.children.some((el) => el.hasAttribute('data-studio')));
// Finishing at once (reduced motion, nobody watching, a newer save) restores the real render exactly.
planner.runRestores();
assert.equal(all(after.doc.body).filter((el) => el.hasAttribute('data-studio-pending') || el.hasAttribute('data-studio-ghost')).length, 0);
assert.equal(text.el.textContent, 'Welcome home'); assert.equal(retype.el.textContent, 'Hello world');
assert.equal(after.doc.head.children.length, 0, 'The playback stylesheet is removed');

// A new page is built from a blank canvas: everything is placed, nothing deleted or restyled.
const blank = page(() => []), fresh = page((h) => [h('nav', { class: 'bar' }, [0, 0, 1200, 64], navy, h('a', {}, [16, 20, 80, 24], inline, 'Home')), h('h2', {}, [0, 120, 800, 40], {}, 'Projects')]);
const build = Object.create(Stage.prototype).plan(blank.doc, null, fresh.doc, fresh.win);
assert.deepEqual(build.steps.map((s) => s.kind), ['rect', 'text', 'text']);
// Many small look-alike items are stamped in one sweep instead of one box at a time.
const grid = page((h) => [h('ul', { class: 'tags' }, [0, 0, 1200, 100], {}, ...Array.from({ length: 10 }, (_, i) => h('li', { class: 'tag' }, [i * 100, 0, 90, 30], navy, `Tag ${i}`)))]);
assert.ok(Object.create(Stage.prototype).plan(page(() => []).doc, null, grid.doc, grid.win).steps.some((s) => s.kind === 'stamp' && s.items.length === 10));
// Identity survives reordering; repeated unkeyed siblings are not guessed by index.
const ids = (list) => list.map(([tag, id]) => new El(null, tag, id ? { id } : {}));
assert.deepEqual(matchChildren(ids([['div', 'a'], ['div', 'b']]), ids([['div', 'b'], ['div', 'a']])), [[0, 1], [1, 0]]);
assert.deepEqual(matchChildren(ids([['li'], ['li']]), ids([['li'], ['li'], ['li']])).length, 2);

// ---------- scheduling ----------
const { StudioSchedule } = new Function(`${await compile('studio-schedule')};return {StudioSchedule}`)();
const watch = { seated: true, shown: true, sharp: true, still: false };
let schedule = new StudioSchedule();
schedule.save();
assert.deepEqual(schedule.next(watch), [{ type: 'motion', on: true }, { type: 'render', version: 1, animate: false }], 'An existing page appears first, without a made-up build');
assert.equal(schedule.playing, true); schedule.settle(1); assert.equal(schedule.idle, true);
schedule.save(); schedule.save();
assert.deepEqual(schedule.next({ ...watch, sharp: false }), [{ type: 'motion', on: false }], 'Far away: nothing renders and nothing animates');
assert.equal(schedule.done(3, { ...watch, sharp: false }), true, 'Nobody watching means nothing to wait for');
assert.deepEqual(schedule.next({ ...watch, seated: false }), [], 'No robot in the chair, no playback');
assert.deepEqual(schedule.next(watch), [{ type: 'motion', on: true }, { type: 'render', version: 3, animate: true }], 'The newest save replaces the ones still waiting');
assert.equal(schedule.done(3, watch), false);
schedule.save();
assert.deepEqual(schedule.next(watch), [{ type: 'render', version: 4, animate: true }], 'A save during playback continues from what is visible');
schedule.settle(3); assert.equal(schedule.playing, true); schedule.settle(4); assert.equal(schedule.done(4, watch), true);
schedule.save();
assert.deepEqual(schedule.next({ ...watch, still: true }), [{ type: 'motion', on: false }, { type: 'render', version: 5, animate: false }], 'Reduced motion shows the change directly');
schedule.frameLost(); schedule.save();
assert.deepEqual(schedule.next(watch), [{ type: 'motion', on: true }, { type: 'render', version: 6, animate: false }], 'A new frame has nothing to diff against');
schedule = new StudioSchedule(); schedule.save(true);
assert.equal(schedule.next(watch)[1].animate, true, 'A page the robot just created is built from a blank canvas');

// ---------- the app on the robot's desktop: frame, messages and teardown ----------
const timers = new Map(); let nextTimer = 0, now = 0;
const listeners = new Set(), scenes = [], cleared = [], closed = [], posts = [], placed = [];
let drawing = 60, wakes = new Set();
const classList = () => { const set = new Set(); return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c, on) => on ? set.add(c) : set.delete(c) }; };
class Elem {
  constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.attrs = {}; this.classList = classList(); this.dataset = {}; }
  get isConnected() { return !!this.parent && this.parent.isConnected; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...n) { for (const c of n) { c.parent = this; this.children.push(c); } }
  replaceChildren(...n) { for (const c of this.children) c.parent = null; this.children = []; this.append(...n); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  closest() { return screen; }
  getBoundingClientRect() { return { left: 100, top: 50, width: 740, height: 390 }; }
  get clientWidth() { return 740; }
}
const screen = new Elem('screen'); Object.defineProperty(screen, 'isConnected', { value: true });
const document = { createElement: (tag) => { const el = new Elem(tag); if (tag === 'iframe') el.contentWindow = { postMessage: (m) => posts.push(m) }; return el; } };
const window = {
  addEventListener: (type, fn) => type === 'message' && listeners.add(fn), removeEventListener: (type, fn) => listeners.delete(fn),
  setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id) => timers.delete(id),
};
const api = { opened: 0, async studioOpen(req) { this.opened++; return { ok: true, id: `s-${req.root}`, origin: `lucid-studio://s${this.opened}`, entry: '/index.html', kind: 'static', label: 'index.html' }; }, async studioClose(id) { closed.push(id); } };
window.lucid = api;
const robot = { poses: [], typing: false, clicks: 0, setPose(p) { this.poses.push(p); }, setTyping(on) { this.typing = on; }, click() { this.clicks++; } };
const wm = (body) => ({ epoch: 0, check() {}, open: async () => ({ body }), operatorPresent: true, presentationVisible: true, cursorPoint: { x: 410, y: 230 }, cursorEl: { classList: classList() }, robot, root: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 820, height: 461 }) }, width: 820, placeCursor: (x, y) => placed.push([x, y]) });
const deps = {
  renderFps: () => drawing, onRenderWake: (fn) => { wakes.add(fn); return () => wakes.delete(fn); },
  setDetailScene: (el, scene) => scenes.push(scene), clearDetailScene: (el) => cleared.push(el),
};
const { StudioApp } = new Function('document', 'window', 'performance', 'matchMedia', 'StudioSchedule', ...Object.keys(deps), `${await compile('studio')};return {StudioApp}`)(
  document, window, { now: () => now }, () => ({ matches: false }), StudioSchedule, ...Object.values(deps));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deliver = (frame, data) => { for (const fn of listeners) fn({ source: frame.contentWindow, data: { studio: true, ...data } }); };
const desk = () => { const body = new Elem('body'); screen.append(body); return { body, app: new StudioApp(wm(body)) }; };

const { body, app } = desk();
let finished = false;
const saving = app.save({ thread: 't1', root: '/site', file: 'index.html', created: true, working: true }).then((shown) => { finished = shown; });
await settle();
const frame = body.children[0].children[0];
assert.equal(frame.tag, 'iframe'); assert.equal(frame.attrs.sandbox, 'allow-scripts allow-same-origin', 'No forms, popups or top navigation');
assert.match(frame.src, /^lucid-studio:\/\/s1\/__studio\/host\.html\?entry=%2Findex\.html/);
assert.equal(listeners.size, 1); assert.equal(posts.length, 0, 'Nothing is sent before the frame is ready');
for (const fn of listeners) fn({ source: { postMessage() {} }, data: { studio: true, type: 'ready' } });
assert.equal(posts.length, 0, 'Messages from any other window are ignored');
deliver(frame, { type: 'ready' });
assert.deepEqual(posts.map((m) => m.type), ['working', 'motion', 'render']);
const render = posts.at(-1);
assert.equal(render.version, 1); assert.equal(render.animate, true);
assert.deepEqual(render.cursor, { x: 310, y: 180 }, 'Playback starts at the robot pointer');
deliver(frame, { type: 'playback', on: true });
assert.ok(app.wm.cursorEl.classList.contains('is-lent'), 'One visible pointer while the Studio cursor works');
deliver(frame, { type: 'pointer', x: 200, y: 100 }); deliver(frame, { type: 'press' }); deliver(frame, { type: 'typing', on: true });
assert.deepEqual(placed.at(-1), [300, 150]); assert.equal(robot.clicks, 1); assert.equal(robot.typing, true);
assert.equal(finished, false, 'The scene waits for its own render');
deliver(frame, { type: 'settled', version: 1 }); deliver(frame, { type: 'playback', on: false });
await saving;
assert.equal(finished, true); assert.equal(robot.typing, false); assert.equal(app.wm.cursorEl.classList.contains('is-lent'), false);
deliver(frame, { type: 'scene', scene: { width: 740, height: 390, background: '#1b2044', shapes: [{ x: 10, y: 'NaN', w: 20, h: 5, color: 'x'.repeat(99) }, ...Array.from({ length: 700 }, () => ({ x: 1, y: 1, w: 1, h: 1, color: '#fff' }))] } });
assert.equal(scenes.at(-1).shapes.length, 550, 'Scenes are bounded'); assert.equal(scenes.at(-1).shapes[0].y, 0); assert.equal(scenes.at(-1).shapes[0].color, '#ffffff');

// Saves while the monitor is hidden do not render, and the scene does not wait for them.
drawing = 0; posts.length = 0;
await app.save({ thread: 't1', root: '/site', file: 'style.css' });
assert.deepEqual(posts.map((m) => m.type), ['working', 'motion'], 'Hidden: playback stops, nothing renders');
drawing = 60;
for (const fn of wakes) fn();
assert.deepEqual(posts.slice(-2).map((m) => [m.type, m.on ?? m.version]), [['motion', true], ['render', 2]], 'Back in view: the waiting save plays');
deliver(frame, { type: 'settled', version: 2 });

// Teardown releases everything it owns.
app.reset();
assert.equal(frame.parent, null); assert.equal(listeners.size, 0); assert.equal(timers.size, 0); assert.equal(wakes.size, 0);
assert.deepEqual(closed, ['s-/site']); assert.equal(cleared.length >= 1, true);

// At most three Studio frames exist in the office; the one unseen longest gives way.
const desks = [desk(), desk(), desk(), desk()];
for (const [i, d] of desks.entries()) { now = i * 1000; void d.app.save({ thread: `t${i}`, root: `/p${i}`, file: 'index.html' }); await settle(); }
const frames = desks.map((d) => d.body.children[0]?.children.find((c) => c.tag === 'iframe'));
assert.equal(frames.filter(Boolean).length, 3); assert.equal(frames[0], undefined, 'The oldest frame was released');
// A closed window releases its frame at the next sweep.
desks[1].body.remove();
for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
assert.equal(desks[1].body.children[0].children.length, 0);
for (const d of desks) d.app.reset();
assert.equal(listeners.size, 0); assert.equal(timers.size, 0);

// The prototype hooks are gone.
const director = await readFile(new URL('../../src/director.ts', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../../src/os/frontend.ts', import.meta.url), 'utf8');
assert.ok(!/watchWebsiteCanvas|websiteCanvas|Ares/.test(director)); assert.ok(!frontend.includes('__lucid/studio'));
console.log('Studio: render diff to playback steps, watch-only scheduling, pointer handoff, bounded frames and teardown passed.');
