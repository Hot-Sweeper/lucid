import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

// Exercise production presentation code without starting Electron or using the GPU.
const compile = async file => (await transformWithOxc(
  (await readFile(new URL(`../../src/${file}.ts`, import.meta.url), 'utf8')).replace(/^import\s[\s\S]*?;\r?\n/gm, ''), `${file}.ts`
)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let now = 0, nextId = 0, timelinePasses = 0;
const timers = new Map(), tweens = [], actions = [];
class Node {
  constructor(parent = null) { this.parentNode = parent; }
  contains(other) { for (let p = other; p; p = p.parentNode) if (p === this) return true; return false; }
}
const globalTimeline = { getChildren(nested, includeTweens, includeTimelines) {
  timelinePasses++;
  assert.deepEqual([nested, includeTweens, includeTimelines], [true, true, false]);
  return tweens.filter(t => { let p = t.parent; while (p && p !== globalTimeline) p = p.parent; return !!p; });
} };
const setTimeout = (fn, delay = 0) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
const advance = async ms => {
  now += ms;
  for (const [id, job] of [...timers]) if (job.at <= now) { timers.delete(id); job.fn(); }
  await flush();
};
const makeTween = (target, vars = {}, paused = false) => {
  let stopped = paused;
  const tween = { target, vars, parent: globalTimeline, resumeCalls: 0, targets: () => Array.isArray(target) ? target : [target],
    paused: () => stopped, pause() { stopped = true; }, resume() { stopped = false; this.resumeCalls++; },
    kill() { stopped = true; this.parent = null; vars.onInterrupt?.(); },
    step(t) { if (stopped) return; if ('t' in target) target.t = t; vars.onUpdate?.(); if (t === 1) vars.onComplete?.(); }
  };
  tweens.push(tween); return tween;
};
const tickerCallbacks = new Set();
const gsap = { globalTimeline, to: makeTween, ticker: { add: callback => tickerCallbacks.add(callback), remove: callback => tickerCallbacks.delete(callback) },
  fromTo(target, _from, to) { return makeTween(target, to); }, killTweensOf() {} };
const document = { createElement() { actions.push('element'); return { style: {}, remove() {} }; } };
const wmCode = await compile('os/wm');
const { WM, Cancelled } = new Function('gsap', 'Node', 'ICONS', 'setTimeout', 'document', 'performance', 'renderFps', 'CHAT_TITLE',
  `${wmCode};return {WM,Cancelled};`)(gsap, Node, {}, setTimeout, document, { now: () => now }, () => 60, 'Chat');
const classes = new Set();
const root = Object.assign(new Node(), { classList: { toggle(k, on) { if (on) classes.add(k); else classes.delete(k); } },
  querySelectorAll(selector) { assert.notEqual(selector, '*', 'visibility edges must not enumerate the computer DOM'); return []; },
  appendChild() { actions.push('append'); }, querySelector: () => ({ innerHTML: '' }) });
const owned = Object.assign(new Node(root), { remove() {} }), unrelated = new Node();
const robot = { setTyping: on => actions.push(['typing', on]), setPose: p => actions.push(['pose', p]),
  mouseTo: (...p) => actions.push(['mouse', ...p]), click: () => actions.push('click'), lookAt() {} };
const wm = Object.assign(Object.create(WM.prototype), { root, robot, wins: new Map(), opening: new Map(), contents: new Map(), modes: new Map(), unmax: new Map(), epoch: 0,
  speed: 1, operatorHere: true, operatorWaiters: new Set(), pausedByAbsence: new Set(), cursorMotion: null,
  absenceAt: null, absenceDuration: 0,
  cursor: { x: 0, y: 0 }, cursorEl: {}, cursorX() {}, cursorY() {}, renderDock() {} });

// No timer cutoff: an absent robot cannot open, click, or move, even after a minute.
wm.setOperatorPresent(false);
let opened = 0, clicked = false, waited = false;
wm.openNow = async () => { opened++; return {}; };
const open = wm.open('notes');
const click = wm.click().then(() => { clicked = true; });
const wait = wm.sleep(20).then(() => { waited = true; });
await advance(61000);
assert.equal(opened, 0); assert.equal(clicked, false); assert.equal(waited, false);
assert.equal(timers.size, 0, 'No polling timers while the chair is empty');
assert.ok(classes.has('unattended'));
wm.setOperatorPresent(true); await flush(); await advance(200); await Promise.all([open, click, wait]);
assert.equal(opened, 1); assert.equal(actions.filter(a => a === 'click').length, 1);

// A departure between letters holds the current scene and resumes without dropping text.
let text = '';
const typing = (async () => { for (const c of 'ABC') { await wm.sleep(10); text += c; } })();
await flush(); await advance(10); assert.equal(text, 'A');
wm.setOperatorPresent(false); await advance(120000); assert.equal(text, 'A');
wm.setOperatorPresent(true); await flush(); assert.equal(text, 'AB');
await advance(10); await typing; assert.equal(text, 'ABC');

// In-flight cursor/window animations freeze immediately, without pausing other desks.
const windowMotion = makeTween(owned), alreadyPaused = makeTween(owned, {}, true), otherMotion = makeTween(unrelated);
const move = wm.moveTo(500, 200); await flush();
const cursorMotion = wm.cursorMotion;
cursorMotion.step(.3); const atDeparture = { ...wm.cursor };
const mouseCount = actions.filter(a => Array.isArray(a) && a[0] === 'mouse').length;
wm.setOperatorPresent(false);
cursorMotion.step(.8);
assert.deepEqual(wm.cursor, atDeparture); assert.equal(windowMotion.paused(), true);
assert.equal(otherMotion.paused(), false);
assert.equal(actions.filter(a => Array.isArray(a) && a[0] === 'mouse').length, mouseCount);
wm.setOperatorPresent(true); assert.equal(alreadyPaused.paused(), true);
assert.equal(windowMotion.paused(), false); cursorMotion.step(1); await move;
assert.deepEqual(wm.cursor, { x: 500, y: 200 });

// The real window follower is a ticker callback, not a tween. No late position write while away.
const dragWm = Object.assign(Object.create(WM.prototype), { ...wm, movingWindows: new Map(),
  pointAt: async () => {}, frameOf: () => ({ x: 10, y: 20, w: 100, h: 80 }), beginWindowMove: () => () => {} });
let finishDrag;
dragWm.moveTo = () => new Promise(resolve => { finishDrag = resolve; });
const dragWindow = { el: { style: { left: '10px', top: '20px' }, classList: { add() {}, remove() {} }, querySelector: () => ({}) } };
dragWm.wins = new Map([['notes', dragWindow]]);
const drag = dragWm.dragTo('notes', { x: 40, y: 60, w: 100, h: 80 }); await flush();
assert.equal(tickerCallbacks.size, 1);
dragWm.cursor.x += 20; for (const tick of tickerCallbacks) tick();
const heldFrame = { ...dragWindow.el.style };
dragWm.setOperatorPresent(false); dragWm.cursor.x += 7;
for (const tick of tickerCallbacks) tick(); assert.deepEqual(dragWindow.el.style, heldFrame);
dragWm.setOperatorPresent(true); for (const tick of tickerCallbacks) tick();
assert.notDeepEqual(dragWindow.el.style, heldFrame);
finishDrag(); await drag; assert.equal(tickerCallbacks.size, 0, 'Follower released after drag');

// Nested timeline children and multi-target tweens are included without changing
// ownership of unrelated scenes, manually paused work, or disposed animations.
const nestedTimeline = { parent: globalTimeline, paused: () => true };
const nestedMotion = makeTween(owned); nestedMotion.parent = nestedTimeline;
const prePausedNested = makeTween(owned, {}, true); prePausedNested.parent = nestedTimeline;
const multiTarget = makeTween([unrelated, owned]);
const numericMotion = makeTween({ value: 0 });
const removedMotion = makeTween(owned), removedTimeline = { parent: globalTimeline };
const removedChild = makeTween(owned); removedChild.parent = removedTimeline;
const beforeEdge = timelinePasses;
wm.setPresentationVisible(false);
wm.setPresentationVisible(false);
assert.equal(timelinePasses - beforeEdge, 1, 'unchanged visibility does not scan the animation tree');
assert.equal(nestedMotion.paused(), true); assert.equal(multiTarget.paused(), true);
assert.equal(numericMotion.paused(), false, 'unowned numeric activity keeps running');
removedMotion.kill(); removedTimeline.parent = null;
wm.setPresentationVisible(true);
assert.equal(nestedMotion.paused(), false); assert.equal(nestedTimeline.paused(), true, 'an already paused parent timeline stays paused');
assert.equal(prePausedNested.paused(), true); assert.equal(multiTarget.paused(), false);
assert.equal(removedMotion.resumeCalls, 0, 'killed tweens are not revived');
assert.equal(removedChild.resumeCalls, 0, 'children of disposed timelines are not revived');

// Target geometry is measured after visibility resumes, so camera culling cannot
// force hidden layout or leave a stale pre-pan cursor position queued for reveal.
let geometryReads = 0, targetX = 10, pointed;
const savedPos = wm.pos, savedMoveTo = wm.moveTo;
wm.pos = () => { geometryReads++; return { x: targetX, y: 20 }; };
wm.moveTo = async (x, y) => { pointed = { x, y }; };
wm.setPresentationVisible(false);
const pointing = wm.pointAt(owned); await flush();
assert.equal(geometryReads, 0);
targetX = 75; wm.setPresentationVisible(true); await pointing;
assert.equal(geometryReads, 1); assert.deepEqual(pointed, { x: 75, y: 20 });
wm.setPresentationVisible(false);
const cancelledPoint = wm.pointAt(owned).then(() => null, err => err);
wm.reset(); await flush();
assert.ok(await cancelledPoint instanceof Cancelled); assert.equal(geometryReads, 1, 'reset cancels hidden targeting before any geometry read');
wm.setPresentationVisible(true); wm.pos = savedPos; wm.moveTo = savedMoveTo;

// Real typing helpers use occupied time, rather than catching up two minutes of text at once.
const typeInto = new Function('presentationFrame', 'renderFps', 'performance',
  `${await compile('os/typing')};return typeInto;`)(() => new Promise(resolve => setTimeout(resolve, 50)), () => 60, { now: () => now });
robot.pressKey = () => {};
const typed = { innerHTML: '' };
const typingApp = typeInto(wm, typed, 'abcdefghijklmnop', { cps: 10, budgetMs: 10000 });
await flush(); await advance(250);
const beforeLeaving = typed.innerHTML;
assert.ok(beforeLeaving.includes('a'));
const clock = wm.presentationTime;
wm.setOperatorPresent(false); await advance(120000);
assert.equal(wm.presentationTime, clock); assert.equal(typed.innerHTML, beforeLeaving);
wm.setOperatorPresent(true); await flush();
assert.equal(typed.innerHTML, beforeLeaving, 'Returning does not jump the typing clock');
for (let n = 0; n < 40; n++) await advance(100);
await typingApp; assert.equal(typed.innerHTML, 'abcdefghijklmnop');

// Notes have their own timer and paint loop, so check both cannot type or scroll while away.
const notePaints = new Set();
const NotePresentation = new Function('renderFps', 'renderLoop', 'scheduleLayout', 'setTimeout',
  `${await compile('harness/note-presentation')};return NotePresentation;`)(() => 60,
  (_owner, cb) => { notePaints.add(cb); return () => notePaints.delete(cb); }, () => {}, setTimeout);
const noteOwner = { isConnected: true, contains: () => true };
const paragraph = { isConnected: true, textContent: '' };
const notes = new NotePresentation(() => wm.epoch, () => {},
  { present: () => wm.operatorPresent, wait: epoch => wm.waitForOperator(epoch) });
const noteWrite = notes.write(noteOwner, paragraph, 'A sufficiently long live thought still being written by the seated robot', 1);
for (const paint of notePaints) paint(); const noteBefore = paragraph.textContent;
wm.setOperatorPresent(false); await advance(1000);
for (const paint of notePaints) paint(); assert.equal(paragraph.textContent, noteBefore);
wm.setOperatorPresent(true); await flush();
for (const paint of notePaints) paint(); assert.ok(paragraph.textContent.length > noteBefore.length);
notes.reset(); await advance(1000); await noteWrite;

// A covered or offscreen monitor pauses only its cosmetic computer scenes. Its
// robot remains physically seated, and revealing it cannot bypass a real absence.
const visibleWindows = wm.wins;
wm.setPresentationVisible(false);
assert.equal(wm.operatorPresent, true);
assert.equal(classes.has('unattended'), false, 'hidden presentation does not invent an empty chair');
let hiddenAction = false;
const hiddenWork = wm.sleep(10).then(() => { hiddenAction = true; });
const hiddenClock = wm.presentationTime;
await advance(120000);
assert.equal(hiddenAction, false); assert.equal(timers.size, 0, 'hidden computer scenes wait without polling');
assert.equal(wm.presentationTime, hiddenClock); assert.equal(wm.wins, visibleWindows);
wm.setOperatorPresent(false);
wm.setPresentationVisible(true); await flush();
assert.equal(hiddenAction, false, 'revealing an unoccupied monitor cannot resume input');
wm.setOperatorPresent(true); await flush(); await advance(10); await hiddenWork;
assert.equal(hiddenAction, true);

// Reassigning/destroying an empty desk releases stale suspended scenes as cancellations.
wm.setOperatorPresent(false);
const stale = wm.sleep(10).then(() => null, err => err);
wm.reset(); await flush(); assert.ok(await stale instanceof Cancelled);

const IdleLife = new Function('gsap', 'Cancelled', 'pickFresh', 'SEARCH_LINES',
  `${await compile('os/idle')};return IdleLife;`)(gsap, Cancelled, () => () => '', []);
let gameStopped = 0;
const idle = Object.assign(Object.create(IdleLife.prototype), { wm, active: true, halted: false, token: 4,
  stopGame: () => gameStopped++ });
idle.leaveDesk(); assert.equal(gameStopped, 1); assert.equal(idle.isActive, false); assert.equal(idle.token, 5);
idle.hold = () => true;
idle.begin(); assert.equal(idle.isActive, false); assert.equal(idle.pending, true, 'Completion cannot restart idle while away');

const Director = new Function('gsap', 'Cancelled', `${await compile('director')};return Director;`)(gsap, Cancelled);
let idles = 0, pumps = 0;
const director = Object.assign(Object.create(Director.prototype), { wm, idleLife: idle, busyToken: 0,
  pumpEpoch: -1, queue: [], info: { id: 'thread', run: { status: 'running' } },
  idle() { idles++; }, pump() { pumps++; } });
director.setPresent(true); assert.equal(idles, 1);
director.setPresent(false);
let ready = false;
const arrival = director.untilPresent().then(() => { ready = true; });
await advance(180000); assert.equal(ready, false);
director.queue.push('queued-work'); director.setPresent(true); await arrival;
assert.equal(pumps, 1); assert.equal(ready, true);

// Check attachment and nested-timeline behavior against the actual GSAP runtime,
// including the killed-parent case where a child still retains its parent pointer.
const { gsap: liveGsap } = await import('gsap');
const LiveWM = new Function('gsap', 'Node', 'performance', 'CHAT_TITLE', `${wmCode};return WM;`)(liveGsap, Node, { now: () => now }, 'Chat');
const liveRoot = new Node(), liveOwned = new Node(liveRoot), liveOther = new Node();
liveOwned.value = liveOther.value = 0;
const liveWM = Object.assign(Object.create(LiveWM.prototype), { root: liveRoot, robot: { setTyping() {} },
  operatorHere: true, presentationHere: true, operatorWaiters: new Set(), pausedByAbsence: new Set(),
  absenceAt: null, absenceDuration: 0, cursorMotion: null });
const liveTween = liveGsap.to(liveOwned, { value: 100, duration: 100 });
const liveOtherTween = liveGsap.to(liveOther, { value: 100, duration: 100 });
const livePaused = liveGsap.to(liveOwned, { value: 100, duration: 100, paused: true });
const liveTimeline = liveGsap.timeline({ paused: true }).to(liveOwned, { value: 100, duration: 100 });
const liveChild = liveTimeline.getChildren(true, true, false)[0];
const killedTimeline = liveGsap.timeline({ paused: true }).to(liveOwned, { value: 100, duration: 100 });
const killedChild = killedTimeline.getChildren(true, true, false)[0];
const liveKilled = liveGsap.to(liveOwned, { value: 100, duration: 100 });
const liveCursor = liveGsap.to({ t: 0 }, { t: 1, duration: 100 }); liveWM.cursorMotion = liveCursor;
liveGsap.ticker.sleep();
try {
  liveWM.setPresentationVisible(false);
  assert.equal(liveTween.paused(), true); assert.equal(liveChild.paused(), true); assert.equal(liveCursor.paused(), true);
  assert.equal(liveOtherTween.paused(), false);
  liveKilled.kill(); killedTimeline.kill();
  assert.equal(liveKilled.parent, null); assert.equal(killedChild.parent, killedTimeline);
  liveWM.setPresentationVisible(true);
  assert.equal(liveTween.paused(), false); assert.equal(liveCursor.paused(), false);
  assert.equal(livePaused.paused(), true); assert.equal(liveTimeline.paused(), true);
  assert.equal(liveChild.paused(), false, 'nested children retain their original local pause state');
  assert.equal(liveKilled.paused(), true); assert.equal(liveKilled.parent, null);
  assert.equal(killedChild.paused(), true); assert.equal(killedTimeline.parent, null);
} finally {
  for (const animation of [liveTween, liveOtherTween, livePaused, liveTimeline, killedTimeline, liveKilled, liveCursor]) animation.kill();
  liveGsap.ticker.sleep();
}

console.log('Desk presence: zero visibility-edge DOM scans, owned/nested GSAP pause and resume, killed-scene cleanup, hidden cursor geometry, cancellation, indefinite wait, real typing cadence, note paint, desk isolation, idle stop and queued arrival passed.');
