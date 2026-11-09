const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const listeners = new Map(), timers = new Set(), emitted = [], music = [], silenced = [];
const document = { hidden: false, addEventListener: (name, callback) => listeners.set('d:' + name, callback), removeEventListener: name => listeners.delete('d:' + name) };
const window = { addEventListener: (name, callback) => listeners.set('w:' + name, callback), removeEventListener: name => listeners.delete('w:' + name), setInterval: (callback, ms) => { assert.equal(ms, 240); timers.add(callback); return callback; }, clearInterval: callback => timers.delete(callback) };
const phrases = [];
const gameSound = { active: false, time: 1, attachView: () => () => {}, position: () => {}, silence: key => silenced.push(key), emit: (cue, mix, key) => emitted.push({ cue, mix, key }), music: (...args) => music.push(args), phrase: (notes, mix, key) => phrases.push({ notes, mix, key }) };
const scene = { addEventListener: (name, callback) => listeners.set('s:' + name, callback), removeEventListener: name => listeners.delete('s:' + name), clientWidth: 1000, clientHeight: 700 };
let disconnected = false;
class ResizeObserver { constructor(callback) { this.callback = callback; } observe() {} disconnect() { disconnected = true; } }
const element = id => ({ isConnected: true, dataset: { id }, classList: { contains: () => false }, style: { left: '300px', top: '130px' }, getBoundingClientRect: () => { throw Error('scheduler must not read layout'); } });
let nowMs = 1000;
const desk = id => ({ el: element(id), wm: { operatorPresent: true, isFront: () => false, lastClickAt: 0 }, lastKeyAt: 950, robot: { currentPose: 'type' }, director: { music: { playing: null } }, activity: 'Writing files' });
let cam = { x: 0, y: 0, s: 1 };
const world = { scene, desks: new Map(Array.from({ length: 50 }, (_, i) => ['d' + i, desk('d' + i)])), rooms: [], ext: {}, park: { soundActors: () => [], soundZones: () => [] }, cameraState: () => cam };
const context = { document, window, ResizeObserver, gameSound, performance: { now: () => nowMs } };
const engine = fs.readFileSync('src/office/sound.ts', 'utf8');
const geometry = engine.slice(engine.indexOf('const clamp'), engine.indexOf('export class GameSound')).replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(geometry, { mode: 'transform' }), context);
const nature = fs.readFileSync('src/office/nature-sounds.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(nature, { mode: 'transform' }) + '\nglobalThis.daypart=daypart;globalThis.natureFor=natureFor;globalThis.naturePhrase=naturePhrase;', context);
const source = fs.readFileSync('src/office/soundscape.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.SceneAudio=OfficeSoundscape;globalThis.actorCue=actorCue;', context);
const audio = new context.SceneAudio(world);
assert.equal(timers.size, 1); audio.update(); assert.equal(emitted.length, 0, 'locked startup does not schedule any foley');
gameSound.active = true; audio.update(); gameSound.time += .2; audio.update();
assert.equal(audio.diagnostics.audible.length, 6, '50 nearby desks remain bounded to six audible sources');
assert(emitted.length > 0 && emitted.every(event => event.cue === 'keyboard'));
const beforeKey = emitted.length;
nowMs += 30; world.desks.get('d0').lastKeyAt = nowMs;
listeners.get('s:lucid:desk-key')();
assert.equal(emitted.length, beforeKey + 1, 'keypress produces audio immediately between scheduler ticks');
const samePulseCalls = emitted.length; audio.update(); assert.equal(emitted.length, samePulseCalls, 'an unchanged input timestamp never repeats keyboard noise');
nowMs = 2000; audio.update(); assert.equal(audio.diagnostics.audible.length, 0, 'held typing pose without new keys stays silent');
for (const robot of world.desks.values()) robot.lastKeyAt = 1950;
assert.equal(context.actorCue('idle'), null); assert.equal(context.actorCue('think'), null, 'silent states stay silent');
assert.equal(context.actorCue('hold-card').cue, 'paper'); assert.equal(context.actorCue('talk').cue, 'chatter');
cam = { x: 2000, y: 0, s: 1 }; audio.update(); assert.equal(audio.diagnostics.audible.length, 0); assert(silenced.length >= 6, 'panning away cancels the old sources');
cam = { x: 0, y: 0, s: 1 }; world.desks.clear();
for (let i = 0; i < 3; i++) { const robot = desk('music' + i); robot.lastKeyAt = 0; robot.robot.currentPose = 'rest'; robot.director.music.playing = { name: 'Lo-fi Beats to Compile To', bpm: 82 }; world.desks.set('music' + i, robot); }
audio.update(); assert.equal(music.length, 2, 'only two nearby headphones can play music simultaneously');
world.desks.clear(); const phone = desk('phone'); phone.lastKeyAt = 0; phone.robot.currentPose = 'phone'; phone.activity = 'Testing on its phone'; world.desks.set('phone', phone);
audio.update(); assert.equal(audio.diagnostics.audible.length, 0, 'testing a mobile site does not invent short-video audio');
phone.activity = 'Watching BotTube Shorts'; audio.update(); assert.equal(audio.diagnostics.audible.length, 1); assert(audio.diagnostics.audible[0].startsWith('phone:'));
world.desks.clear(); let powered = true;
world.rooms = [{ id: 'break', kind: 'break', x: 0, y: 0 }];
world.ext.break = { soundActors: () => [], soundMedia: () => [{ el: element('tv'), x: 500, y: 350, kind: 'tv', playing: powered, powered }] };
audio.update(); assert(audio.diagnostics.audible[0].startsWith('tv:'));
powered = false; audio.update(); assert.equal(audio.diagnostics.audible.length, 0, 'switching off TV immediately removes its soundtrack');
world.ext.break = { soundActors: () => [{ el: element('a'), x: 500, y: 350, activity: 'drink' }], soundMedia: () => [] };
audio.update(); assert(audio.diagnostics.audible[0].endsWith('coffee'));
world.park = { soundActors: () => [], soundZones: () => [{ kind: 'birds', x: 500, y: 350 }, { kind: 'water', x: 530, y: 360 }] };
audio.update(); assert(audio.diagnostics.audible.some(key => key.startsWith('park-zone:')));
// Moving robots tick like metal feet; laughing robots giggle; eating crunches.
assert.equal(context.actorCue('idle', true).cue, 'robostep'); assert.equal(context.actorCue('laugh').cue, 'giggle'); assert.equal(context.actorCue('eat').cue, 'munch');
// The TV soundtrack follows the game on screen.
world.park = { soundActors: () => [], soundZones: () => [] };
world.ext.break = { soundActors: () => [], soundMedia: () => [{ el: element('tv'), x: 500, y: 350, kind: 'tv', playing: true, powered: true, game: 'race' }] };
gameSound.time += 2; emitted.length = 0; audio.update(); gameSound.time += .2; audio.update(); assert(emitted.some(event => event.cue === 'kart'), 'a kart race sounds like engines');
// Time of day picks the park's singers from the visible sky.
assert.equal(context.daypart(6.5, 0.1), 'dawn'); assert.equal(context.daypart(13, 0), 'day'); assert.equal(context.daypart(19, 0.2), 'dusk'); assert.equal(context.daypart(13, 0.8), 'night', 'a midnight theme or storm-dark sky is night');
assert.equal(context.natureFor('birds', 'dawn', false).map(n => n.voice).join(), ['warble', 'trill'].join());
assert.equal(context.natureFor('birds', 'night', false).map(n => n.voice).join(), ['owl'].join());
assert.equal(context.natureFor('meadow', 'night', false).map(n => n.voice).join(), ['crickets'].join());
assert.equal(context.natureFor('birds', 'day', true).length, 0, 'birds keep quiet in the rain');
for (const voice of ['warble', 'trill', 'whistle', 'coo', 'fluty', 'crickets', 'owl', 'frogs', 'rain', 'wind', 'thunder', 'bees']) {
  const notes = context.naturePhrase(voice);
  assert(notes.length > 0 && notes.every(n => n.length >= 4 && n.every(v => v === undefined || typeof v === 'string' || Number.isFinite(v)) && n[2] > 0 && n[2] <= 3), voice + ' phrases are bounded transients');
}
world.ext = {};
world.root = { style: { getPropertyValue: () => '0.85' } };
world.park = { wet: false, soundActors: () => [], soundZones: () => [{ kind: 'water', x: 520, y: 350 }, { kind: 'birds', x: 480, y: 330 }, { kind: 'pond', x: 500, y: 360 }, { kind: 'meadow', x: 510, y: 340 }] };
for (let i = 0; i < 40; i++) { gameSound.time += .25; audio.update(); }
assert(audio.diagnostics.audible.some(key => key.endsWith(':owl')) && audio.diagnostics.audible.some(key => key.endsWith(':crickets')), 'a dark park has owls and crickets');
assert(phrases.length > 0 && !audio.diagnostics.audible.some(key => /warble|whistle/.test(key)), 'no daytime songbirds at night');
for (let i = 0; i < 50; i++) world.desks.set('busy' + i, desk('busy' + i));
for (const robot of world.desks.values()) robot.lastKeyAt = nowMs - 10;
audio.update();
assert(audio.diagnostics.audible.filter(key => key.startsWith('park-zone:') && key.split(':').length > 2).length > 0, 'a busy office nearby never mutes the park creatures');
assert(audio.diagnostics.audible.length <= 9, 'six foreground and three nature sources at most');
world.desks.clear();
world.weather = { kind: 'storm', windKmh: 40 };
audio.update(); assert(audio.diagnostics.audible.includes('weather:rain'), 'real rain is heard over the park');
assert(!audio.diagnostics.audible.some(key => key.endsWith(':owl')), 'creatures shelter in a storm');
delete world.weather; delete world.root;
// Robots crossing the hallway tick along; standing still is silent.
const hallBot = element('walker'); let hx = 500; world.park = { soundActors: () => [], soundZones: () => [] };
world.soundWalkers = () => [{ el: hallBot, x: hx, y: 360, activity: 'idle' }];
audio.update(); assert(!audio.diagnostics.audible.some(key => key.startsWith('hall:')), 'a robot standing in the hall makes no steps');
nowMs += 240; hx += 14; audio.update(); assert(audio.diagnostics.audible.includes('hall:walker'), 'a walking robot has footsteps');
delete world.soundWalkers;
const calls = emitted.length + music.length + phrases.length; document.hidden = true; gameSound.active = false; listeners.get('d:visibilitychange')(); audio.update(); assert.equal(emitted.length + music.length + phrases.length, calls, 'hidden windows schedule no sound');
assert.equal(audio.diagnostics.streams, 0);
audio.destroy(); assert.equal(timers.size, 0); assert(disconnected); assert.equal(listeners.size, 0);
console.log('PASS: single scheduler, geometry without layout reads, six-source/two-music budgets, actual activity routing, robot steps, TV game soundtracks, offscreen cancellation, TV power, time-of-day park creatures with their own budget, weather, hidden silence and ownership cleanup.');
