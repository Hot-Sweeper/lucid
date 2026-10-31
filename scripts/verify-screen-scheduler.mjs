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
const code = (await transformWithOxc(source.replace(/^import .*;\r?\n/gm, ''), 'render.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let nextFrame = null, io, hierarchyChecks = 0;
class Element {
  constructor(kind, parent = null) { this.kind = kind; this.parent = parent; this.isConnected = true; this.dataset = {}; this.classList = { toggle() {} }; }
  get parentElement() { return this.parent; }
  contains(other) { hierarchyChecks++; for (let p = other; p; p = p.parent) if (p === this) return true; return false; }
  closest(selector) { for (let p = this; p; p = p.parent) if (selector.includes(`.${p.kind}`)) return p; return null; }
}
const document = { hidden: false, addEventListener() {} };
const window = { devicePixelRatio: 1 };
class Observer { constructor(callback) { io = callback; } observe() {} unobserve() {} }
const scheduler = new Function('document','window','IntersectionObserver','requestAnimationFrame','beginSystem','endSystem','reportError','screenFrameRate',
  `${code};return {setRenderView,renderLoop,deferRender,renderFps}`)(document, window, Observer, callback => { nextFrame = callback; return 1; }, () => -1, () => {}, error => { throw error; }, screenFrameRate);
let now = 0;
const frame = () => { now += 1000 / 60; const callback = nextFrame; nextFrame = null; callback?.(now); };
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
for (let i=0;i<144;i++) { now += 1000/144; const callback=nextFrame;nextFrame=null;callback?.(now); }
const highRefreshChecks = hierarchyChecks;
assert.ok(highRefreshDraws >= 19 && highRefreshDraws <= 22);
assert.ok(highRefreshTimes.slice(2).every((time,i)=>time-highRefreshTimes[i+1]>40), 'After initial phase alignment a slot tolerance must not schedule two app draws within one high refresh display tick');
assert.ok(highRefreshChecks < 60, `20 Hz apps should validate hierarchy near draw time, got ${highRefreshChecks} checks`);
stopHighRefresh();frames(2);

const zoomScreen=new Element('screen'),zoomOwner=new Element('canvas',zoomScreen);
scheduler.setRenderView(zoomScreen,true,20);
let zoomDraws=0;
const stopZoom=scheduler.renderLoop(zoomOwner,()=>zoomDraws++);
frame();assert.equal(zoomDraws,1);
const fineFrame=()=>{now+=.001;const callback=nextFrame;nextFrame=null;callback?.(now);};
scheduler.setRenderView(zoomScreen,true,38);fineFrame();
assert.equal(zoomDraws,2,'Zooming up must redraw on the next display frame even when the 20 Hz slot is not due');
scheduler.setRenderView(zoomScreen,true,37);fineFrame();
assert.equal(zoomDraws,2,'Zooming down reuses sharp pixels without forcing extra draws');
window.devicePixelRatio=2;fineFrame();
assert.equal(zoomDraws,3,'Moving to a denser display must immediately refresh the canvas');
stopZoom();window.devicePixelRatio=1;frames(2);

const thumbnail = new Element('canvas'); let constructed=0;
scheduler.deferRender(thumbnail, () => constructed++);
io([{ target:thumbnail,isIntersecting:true,boundingClientRect:{width:12} }]); frames(3);
assert.equal(constructed,1,'Visible tiny thumbnails must be built exactly once');

const stops=[],counts=[]; let count=0;
for(let i=0;i<20;i++) { const s=new Element('screen');scheduler.setRenderView(s,true,50);stops.push(scheduler.renderLoop(new Element('canvas',s),()=>count++)); }
for(let i=0;i<65;i++) { const before=count;frame();counts.push(count-before); }
assert.ok(Math.max(...counts.slice(2)) < 12, `Screen clocks should be staggered, peak ${Math.max(...counts.slice(2))}`);
for(const stop of stops)stop();
console.log(JSON.stringify({tinyVisibleHz:20,closeHz:60,offscreenPaused:true,coveredPaused:true,reparentingResumed:true,tinyThumbnailBuilt:true,highRefreshDraws,highRefreshChecks,staggeredPeak:Math.max(...counts.slice(2))}));
