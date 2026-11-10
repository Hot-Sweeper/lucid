// No Electron or GPU required: exercise the real shared scheduler with a virtual clock.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const budgetSource = await readFile(new URL('../src/perf/screen-budget.ts', import.meta.url), 'utf8');
const budgetCode = (await transformWithOxc(budgetSource, 'screen-budget.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const { screenFrameRate } = new Function(`${budgetCode};return {screenFrameRate}`)();
for (const width of [0, 1, 12, 39, 40, 79, 80, 120, 199]) assert.equal(screenFrameRate(width), 20);
assert.equal(screenFrameRate(200), 30); assert.equal(screenFrameRate(449), 30); assert.equal(screenFrameRate(450), 60);

const source = await readFile(new URL('../src/perf/render.ts', import.meta.url), 'utf8');
const diagnostics = await readFile(new URL('../src/perf/diagnostics.ts', import.meta.url), 'utf8');
const beat = await readFile(new URL('../src/perf/beat.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc((diagnostics + '\n' + beat + '\nconst isAsleep = () => false, onCalmChange = () => () => {};\n' + source).replace(/^import .*;\r?\n/gm, ''), 'render.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let nextFrame = null, io, hierarchyChecks = 0, now = 0, timerId = 0, frameCallbacks = 0, detailUpdates = 0;
const timers = new Map(), listeners = new Map();
const setTimer = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; };
const clearTimer = id => timers.delete(id);
class Element {
  constructor(kind, parent = null) { this.kind = kind; this.parent = parent; this.isConnected = true; this.dataset = {}; this.classList = { toggle() {} }; }
  get parentElement() { return this.parent; }
  contains(other) { hierarchyChecks++; for (let p = other; p; p = p.parent) if (p === this) return true; return false; }
  closest(selector) { for (let p = this; p; p = p.parent) if (selector.includes(`.${p.kind}`) || selector === '#scene' && p.kind === 'scene') return p; return null; }
}
const document = { documentElement: { classList: { toggle() {} } }, hidden: false, addEventListener(event, callback) { listeners.set(event, callback); } };
const window = { devicePixelRatio: 1, setTimeout: setTimer, addEventListener(event, callback) { listeners.set(event, callback); } };
class Observer { constructor(callback) { io = callback; } observe() {} unobserve() {} }
const scheduler = new Function('document','window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','clearTimeout','beginSystem','endSystem','reportError','screenFrameRate','setScreenDetail','releaseScreenDetail',
  `${code};return {setRenderView,renderLoop,deferRender,renderFps,onRenderWake,setDiagnosticOff}`)(document, window, Observer, callback => { nextFrame = callback; return 1; }, () => { nextFrame = null; }, clearTimer, () => -1, () => {}, error => { throw error; }, screenFrameRate, () => { detailUpdates++; }, () => {});
const stableScreen = new Element('screen');
scheduler.setRenderView(stableScreen, true, 276, 820);
const initializedDetailUpdates = detailUpdates;
for (let i = 0; i < 120; i++) scheduler.setRenderView(stableScreen, true, 276, 820);
const redundantDetailUpdates = detailUpdates - initializedDetailUpdates;
console.log(JSON.stringify({stableCameraCalls:120,redundantDetailUpdates}));
assert.equal(redundantDetailUpdates, 0, 'Pure camera panning must not replay the screen-detail pipeline');
let expectedDetailUpdates = detailUpdates;
for (const args of [[true, 277, 820], [false, 277, 820], [true, 277, 820], [true, 277, 821]]) {
  scheduler.setRenderView(stableScreen, ...args);
  assert.equal(detailUpdates, ++expectedDetailUpdates, 'Width, visibility and logical size changes must reach the detail observer');
}
window.devicePixelRatio = 2;
scheduler.setRenderView(stableScreen, true, 277, 821);
assert.equal(detailUpdates, ++expectedDetailUpdates, 'A display density change must reach the detail controller even with stable CSS geometry');
window.devicePixelRatio = 1;
let visibilityWakes = 0;
const unwatch = scheduler.onRenderWake(() => visibilityWakes++);
const observed = new Element('phone-screen'); observed.clientWidth = 100;
const stopObserved = scheduler.renderLoop(observed, () => {});
const observe = visible => io([{ target: observed, isIntersecting: visible, boundingClientRect: { width: 100 } }]);
observe(true); assert.equal(visibilityWakes, 1, 'observed appearance wakes clocks');
observe(true); assert.equal(visibilityWakes, 1, 'geometry-only observer delivery does not refresh clocks');
observe(false); assert.equal(visibilityWakes, 2, 'observed disappearance releases clock timers');
const explicit = new Element('screen');
scheduler.setRenderView(explicit, true, 100);
scheduler.setRenderView(explicit, false, 100);
assert.equal(visibilityWakes, 4, 'camera visibility wakes clocks in both directions');
stopObserved(); unwatch();
const frame = (step = 1000 / 60) => {
  const target = now + step;
  while (timers.size) {
    const [id, job] = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
    if (job.due > target) break;
    timers.delete(id); now = job.due; job.callback();
  }
  now = target;
  const callback = nextFrame; nextFrame = null;
  if (callback) { frameCallbacks++; callback(now); }
};
const frames = (n) => { for (let i=0;i<n;i++) frame(); };

const screen = new Element('screen'), win = new Element('win', screen), canvas = new Element('canvas', win);
scheduler.setRenderView(screen, true, 12);
let draws = 0;
const stop = scheduler.renderLoop(canvas, () => draws++);
frames(60);
assert.ok(draws >= 19 && draws <= 22, `Tiny visible screen must stay live at 20 Hz, got ${draws}`);
assert.equal(screen.dataset.renderFps, '20');
scheduler.setRenderView(screen, false, 12); frames(10); const paused = draws; frames(30); assert.equal(draws, paused);
scheduler.setRenderView(screen, true, 12); frames(10); assert.ok(draws > paused, 'Panning back must resume the same surface');
const slow = draws; scheduler.setRenderView(screen, true, 600); frames(60); assert.ok(draws-slow >= 59, 'Close-ups must update at 60 Hz');
win.dataset.renderHidden = '1'; frames(10); const covered=draws; frames(20); assert.equal(draws,covered);
const screen2 = new Element('screen'), win2 = new Element('win', screen2); canvas.parent = win2;
scheduler.setRenderView(screen2, true, 300); frames(12);
assert.ok(draws > covered, 'Reparenting into a visible window must not retain the old covered-window cache');
stop(); frames(2);

// A connected standalone owner can later become a covered desktop child. A cached
// fallback host must not keep it rendering at 60 Hz outside that desktop's budget.
const moved = new Element('canvas');
assert.equal(scheduler.renderFps(moved), 60);
moved.parent = win2; win2.dataset.renderHidden = '1';
assert.equal(scheduler.renderFps(moved), 0);
win2.dataset.renderHidden = '0';
assert.equal(scheduler.renderFps(moved), 30);

// High refresh displays should not repeatedly traverse ancestors between 20 Hz draws.
const highRefreshScreen = new Element('screen'), highRefreshOwner = new Element('canvas', highRefreshScreen);
scheduler.setRenderView(highRefreshScreen, true, 50);
let highRefreshDraws = 0;
const highRefreshTimes = [];
const stopHighRefresh = scheduler.renderLoop(highRefreshOwner, time => {highRefreshDraws++;highRefreshTimes.push(time);});
hierarchyChecks = 0;
frameCallbacks = 0;
for (let i=0;i<144;i++) frame(1000/144);
const highRefreshChecks = hierarchyChecks;
const highRefreshCallbacks = frameCallbacks;
assert.ok(highRefreshDraws >= 19 && highRefreshDraws <= 22);
assert.ok(highRefreshTimes.slice(2).every((time,i)=>time-highRefreshTimes[i+1]>40), 'After initial phase alignment a slot tolerance must not schedule two app draws within one high refresh display tick');
assert.ok(highRefreshChecks < 60, `20 Hz apps should validate hierarchy near draw time, got ${highRefreshChecks} checks`);
assert.ok(highRefreshCallbacks < 85, `A single 20 Hz app must sleep between draw deadlines, got ${highRefreshCallbacks} display wakes`);
stopHighRefresh();frames(2);
assert.equal(timers.size, 0, 'The final owner releases a pending scheduler timer');
assert.equal(nextFrame, null, 'The final owner releases a pending animation frame');

const zoomScreen=new Element('screen'),zoomOwner=new Element('canvas',zoomScreen);
scheduler.setRenderView(zoomScreen,true,20);
let zoomDraws=0;
const stopZoom=scheduler.renderLoop(zoomOwner,()=>zoomDraws++);
frame();assert.equal(zoomDraws,1);
const fineFrame=()=>frame(.001);
scheduler.setRenderView(zoomScreen,true,38);fineFrame();
assert.equal(zoomDraws,2,'Zooming up must redraw on the next display frame even when the 20 Hz slot is not due');
scheduler.setRenderView(zoomScreen,true,37);fineFrame();
assert.equal(zoomDraws,2,'Zooming down reuses sharp pixels without forcing extra draws');
window.devicePixelRatio=2;listeners.get('resize')();fineFrame();
assert.equal(zoomDraws,3,'Moving to a denser display must immediately refresh the canvas');
stopZoom();window.devicePixelRatio=1;frames(2);

const sleepingScreen = new Element('screen'), sleepingOwner = new Element('canvas', sleepingScreen);
scheduler.setRenderView(sleepingScreen, true, 20);
let resumedDraws = 0;
const stopSleeping = scheduler.renderLoop(sleepingOwner, () => resumedDraws++);
frame();
assert.equal(timers.size, 1, 'A distant screen sleeps until its next draw deadline');
document.hidden = true; listeners.get('visibilitychange')();
assert.equal(timers.size, 0, 'Hiding the document cancels the cosmetic timer');
assert.equal(nextFrame, null, 'Hiding the document cancels its queued display frame');
frames(60); assert.equal(resumedDraws, 1, 'Hidden app screens never draw');
document.hidden = false; listeners.get('visibilitychange')(); frame();
assert.equal(resumedDraws, 2, 'Visibility resumes immediately using the same screen');
stopSleeping();

const thumbnail = new Element('canvas'); let constructed=0;
scheduler.deferRender(thumbnail, () => constructed++);
io([{ target:thumbnail,isIntersecting:true,boundingClientRect:{width:12} }]); frames(3);
assert.equal(constructed,1,'Visible tiny thumbnails must be built exactly once');

const stops=[],counts=[]; let count=0;
for(let i=0;i<20;i++) { const s=new Element('screen');scheduler.setRenderView(s,true,50);stops.push(scheduler.renderLoop(new Element('canvas',s),()=>count++)); }
for(let i=0;i<65;i++) { const before=count;frame();counts.push(count-before); }
assert.ok(Math.max(...counts.slice(2)) < 12, `Screen clocks should be staggered, peak ${Math.max(...counts.slice(2))}`);
for(const stop of stops)stop();
// At 144 Hz, screens draw only on ambient beat frames (every other frame), still spread out.
{ const beatStops=[]; const drawFrames=[]; let drawsNow=0;
  for(let i=0;i<6;i++){ const s=new Element('screen');scheduler.setRenderView(s,true,600);beatStops.push(scheduler.renderLoop(new Element('canvas',s),()=>drawsNow++)); }
  for(let i=0;i<4;i++)frame(1000/144);
  for(let i=0;i<144;i++){ const before=drawsNow;frame(1000/144);drawFrames.push(drawsNow-before); }
  const busy=drawFrames.filter(n=>n>0).length;
  assert.ok(busy<=74, `Ambient screen work must leave every other 144 Hz frame free, busy ${busy}/144`);
  assert.ok(drawsNow>=6*50, `Close screens keep about 60 Hz, drew ${drawsNow} in one second`);
  for(const stop of beatStops)stop(); }
console.log(JSON.stringify({tinyVisibleHz:20,closeHz:60,offscreenPaused:true,coveredPaused:true,reparentingResumed:true,tinyThumbnailBuilt:true,highRefreshDraws,highRefreshChecks,highRefreshCallbacks,staggeredPeak:Math.max(...counts.slice(2))}));
// LOD pauses expensive window drawing without changing logical frame budgets.
const lodScreen = new Element('screen'), lodWin = new Element('win', lodScreen), lodCanvas = new Element('canvas', lodWin);
scheduler.setRenderView(lodScreen, true, 600);
let lodDraws = 0;
const stopLod = scheduler.renderLoop(lodCanvas, () => lodDraws++);
frames(5); assert.ok(lodDraws > 0);
lodScreen.dataset.screenDetail = 'shapes'; frames(5);
const lodPaused = lodDraws; frames(20); assert.equal(lodDraws, lodPaused);
delete lodScreen.dataset.screenDetail;
scheduler.setRenderView(lodScreen, true, 610); frames(5);
assert.ok(lodDraws > lodPaused, 'Zooming in resumes the same canvas loop'); stopLod();

// Covering the phone office suspends its paints while unrelated UI previews continue.
const phoneScene = new Element('scene'), phoneScreen = new Element('screen',phoneScene), phoneCanvas = new Element('canvas',phoneScreen);
const dialogScreen = new Element('screen'), dialogCanvas = new Element('canvas',dialogScreen);
scheduler.setRenderView(phoneScreen,true,600);scheduler.setRenderView(dialogScreen,true,600);
let officePaints=0,dialogPaints=0;
const stopPhone=scheduler.renderLoop(phoneCanvas,()=>officePaints++),stopDialog=scheduler.renderLoop(dialogCanvas,()=>dialogPaints++);
frames(8);
listeners.get('lucid:mobile-view')({detail:{mobile:true,view:'chat'}});
frames(8);const coveredPaints=officePaints,visibleDialogPaints=dialogPaints;frames(20);
assert.equal(officePaints,coveredPaints,'Covered office screens stop drawing');
assert.ok(dialogPaints>visibleDialogPaints,'Uncovered dialog previews still draw');
assert.equal(scheduler.renderFps(phoneCanvas),0,'Screen clocks and media checks pause with the covered office');
listeners.get('lucid:mobile-view')({detail:{mobile:true,view:'office'}});frames(8);
assert.ok(officePaints>coveredPaints,'Returning to Office resumes the same surfaces');stopPhone();stopDialog();

// Diagnostic pausing leaves registered owners intact and wakes them on restore.
scheduler.setDiagnosticOff('screens', true);
assert.equal(scheduler.renderFps(stableScreen), 0);
scheduler.setDiagnosticOff('screens', false);
assert.ok(scheduler.renderFps(stableScreen) > 0);
