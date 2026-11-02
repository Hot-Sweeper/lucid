// Deterministic media ownership and interaction checks, without launching Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const listeners = new Set(), animations = [], timelines = [], cues = [];
class Element {
  style = {}; dataset = {}; attributes = {}; children = []; selectors = new Map(); events = new Map();
  classes = new Set();
  classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) };
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  querySelector(selector) { if (!this.selectors.has(selector)) this.selectors.set(selector, new Element()); return this.selectors.get(selector); }
  querySelectorAll(selector) { return [this.querySelector(selector + ':1'), this.querySelector(selector + ':2')]; }
  addEventListener(key, fn) { this.events.set(key, fn); }
  remove() { this.removed = true; }
}
const document = { hidden: false, addEventListener: (key, fn) => { if (key === 'visibilitychange') listeners.add(fn); }, removeEventListener: (_key, fn) => listeners.delete(fn), createElement: () => new Element(), createElementNS: () => new Element() };
class Animation {
  p = 0; held = false; killed = false; repeats = 0; callbacks = {};
  paused(value) { if (value === undefined) return this.held; this.held = value; return this; }
  pause() { this.held = true; return this; }
  resume() { this.held = false; return this; }
  progress(value) { if (value === undefined) return this.p; this.p = value; return this; }
  totalProgress() { return this.p; }
  repeat() { return this.repeats; }
  isActive() { return !this.held && !this.killed && this.p < 1; }
  eventCallback(key, callback) { this.callbacks[key] = callback; return this; }
  kill() { this.killed = true; return this; }
  complete() { this.p = 1; this.callbacks.onComplete?.(); }
  to() { return this; } from() { return this; } fromTo() { return this; } set() { return this; } call() { return this; }
}
const gsap = {
  timeline: () => { const animation = new Animation(); timelines.push(animation); animations.push(animation); return animation; },
  to: (_target, vars) => { const animation = new Animation(); animation.repeats = vars.repeat || 0; animations.push(animation); return animation; },
  from: () => new Animation(), set: () => {}, killTweensOf: () => {},
};
const context = { console, document, gsap, uid: () => 'fixture', reducedMotion: () => false, gameSound: { at: (...args) => cues.push(args) } };
function load(file, suffix) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + suffix, context);
}
load('src/world/room-controls.ts', '\nglobalThis.MediaAnimationsApi=MediaAnimations;globalThis.RoomMediaControlApi=RoomMediaControl;');
const room = fs.readFileSync('src/world/room.ts', 'utf8');
vm.runInNewContext(stripTypeScriptTypes(room.slice(room.indexOf('export class Anims'), room.indexOf('export type Palette')).replace(/export /g, ''), { mode: 'transform' }), context);
load('src/world/arcade.ts', '\nglobalThis.ArcadeApi=Arcade;');
load('src/world/movie.ts', '\nglobalThis.MovieApi=MovieCorner;');
function stage() { return { layer: new Element(), prop() { const wrapper = new Element(), svg = new Element(); wrapper.appendChild(svg); return svg; } }; }

async function main() {
  const owner = new context.MediaAnimationsApi();
  const running = new Animation(), deliberatelyPaused = new Animation(); deliberatelyPaused.pause();
  owner.add(running); owner.add(deliberatelyPaused); running.p = .35;
  owner.setPaused(true); assert(running.paused());
  const addedWhileOff = owner.add(new Animation()); assert(addedWhileOff.paused());
  owner.setPaused(false); assert(!running.paused()); assert.equal(running.p, .35); assert(deliberatelyPaused.paused());
  document.hidden = true; for (const fn of listeners) fn(); assert(running.paused());
  owner.setPaused(true); document.hidden = false; for (const fn of listeners) fn(); assert(running.paused(), 'visibility cannot undo the player power switch');
  owner.destroy(); assert(running.killed && addedWhileOff.killed); assert.equal(listeners.size, 0);

  const arcade = new context.ArcadeApi(stage(), 1240, 110);
  let powerChanges = 0; arcade.onPowerChange = () => powerChanges++;
  const boot = arcade.boot(), bootTimeline = timelines.at(-1); bootTimeline.p = .42;
  arcade.setPowered(false, true);
  assert(bootTimeline.paused()); assert.equal(arcade.el.dataset.playing, 'false');
  assert.equal(arcade.el.dataset.powered, 'false'); assert.equal(arcade.powerControl.el.attributes['aria-label'], 'Turn TV on');
  arcade.setPowered(false, true); assert.equal(powerChanges, 1, 'same-state inputs do not repeat sound/reactions');
  arcade.setPowered(true, true); assert(!bootTimeline.paused()); assert.equal(bootTimeline.p, .42, 'TV restores the same game progress');
  bootTimeline.complete(); await boot;
  arcade.setPowered(false); arcade.standby(); assert(!arcade.powered, 'ending a round does not turn a player-disabled TV back on');
  arcade.destroy(); assert.equal(listeners.size, 0);

  const movie = new context.MovieApi(stage(), 1655, 1440);
  assert(movie.screenRaised); assert.equal(movie.el.dataset.screen, 'up');
  const opening = movie.start(), openingTimeline = timelines.at(-1);
  const film = movie.play(() => {}), reel = movie.reel; reel.p = .32;
  movie.setScreenRaised(true, true); assert(reel.paused()); assert.equal(movie.el.dataset.playing, 'false');
  assert(movie.dim.classes.has('room-media-hidden'), 'raising screen also hides beam and light spill');
  movie.setScreenRaised(false, true); assert(!reel.paused()); assert.equal(reel.p, .32);
  movie.setScreenRaised(true); movie.setScreenRaised(false); assert(!openingTimeline.killed, 'rapid rolls cannot cancel the movie startup promise');
  openingTimeline.complete(); await opening;
  document.hidden = true; for (const fn of listeners) fn(); assert(reel.paused());
  document.hidden = false; for (const fn of listeners) fn(); assert(!reel.paused());
  const popcorn = movie.popcorn(), popcornTimeline = timelines.at(-1);
  assert.equal(movie.popcorn(), popcorn, 'player and robot share the same popcorn machine operation');
  popcornTimeline.complete(); await popcorn; assert.equal(movie.popcornTask, null);
  reel.complete(); await film;
  movie.stop(); assert(movie.screenRaised); assert.equal(movie.el.dataset.playing, 'false');
  const controls = [movie.screenControl.el, movie.popcornControl.el]; movie.destroy();
  assert(controls.every(control => control.removed)); assert.equal(listeners.size, 0, 'all media visibility owners are released');
  assert(cues.some(([cue]) => cue === 'switch') && cues.some(([cue]) => cue === 'projector'));
  console.log('PASS: TV pause/resume, screen motor promise isolation, film continuity, state-driven audio, shared popcorn operation, visibility gates, and media teardown.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
