const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const listeners = new Map(), saved = new Map();
const surface = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
const document = { ...surface, hidden: false };
const contexts = [];
class Param {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.ramp = v; }
  exponentialRampToValueAtTime(v) { this.ramp = v; }
  setTargetAtTime(v) { this.value = v; }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param(); playbackRate = new Param();
  connect(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(at) { this.stopped = true; if (at === undefined) this.onended?.(); }
}
class AudioContext {
  state = 'running'; currentTime = 0; sampleRate = 22050; destination = {}; nodes = []; sources = [];
  constructor() { contexts.push(this); }
  addEventListener() {}
  removeEventListener() {}
  createMediaElementSource() { return this.node('media'); }
  node(kind) { const n = new Node(); n.kind = kind; this.nodes.push(n); return n; }
  createGain() { return this.node('gain'); }
  createBiquadFilter() { const n = this.node('filter'); n.type = 'lowpass'; return n; }
  createStereoPanner() { return this.node('pan'); }
  createOscillator() { const n = this.node('oscillator'); this.sources.push(n); return n; }
  createBufferSource() { const n = this.node('noise'); this.sources.push(n); return n; }
  createBuffer(_channels, length) { const samples = new Float32Array(length); return { getChannelData: () => samples }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  finish() { for (const source of this.sources) source.onended?.(); }
}
class Audio {
  paused = true;
  addEventListener() {}
  removeEventListener() {}
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
}
const context = { window: surface, document, AudioContext, Audio, themeUrl: 'theme.mp3', ambienceUrl: 'air.mp3', localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) } };
require('./audio-fixture.cjs').soundtrackFixture(context);
const source = fs.readFileSync('src/office/sound.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.sound=gameSound;globalThis.mix=spatialMix;globalThis.SCORES_CHECK=SCORES;', context);
const sound = context.sound, mix = context.mix, SCORES_CHECK = context.SCORES_CHECK;
sound.play('ready'); assert.equal(contexts.length, 0, 'startup never creates audio or autoplays');
listeners.get('pointerdown')({ isTrusted: false }); assert.equal(contexts.length, 0);
listeners.get('pointerdown')({ isTrusted: true }); assert.equal(contexts.length, 1);
const audio = contexts[0]; sound.play('collect');
const nodes = audio.nodes.length; assert(nodes > 10, 'collection schedules its layered chime');
assert.equal(sound.voices.size, 10);
sound.play('collect'); assert.equal(audio.nodes.length, nodes, 'rapid clicks are rate limited');
audio.currentTime = 2; sound.configure(false); sound.play('level');
assert.equal(audio.nodes.length, nodes, 'mute suppresses new nodes'); assert.equal(sound.voices.size, 0);
assert.equal(audio.state, 'suspended', 'muted audio graph stops processing');
sound.configure(true, .2); sound.play('level'); assert(audio.nodes.length > nodes);
const beforeHidden = audio.nodes.length; document.hidden = true; listeners.get('visibilitychange')();
assert.equal(audio.state, 'suspended'); assert.equal(sound.voices.size, 0); sound.play('ready'); assert.equal(audio.nodes.length, beforeHidden);
document.hidden = false; listeners.get('visibilitychange')(); assert.equal(audio.state, 'suspended', 'visibility alone does not replay background sounds');
listeners.get('keydown')({ isTrusted: true }); assert.equal(audio.state, 'running');
sound.configure(true, 0); audio.currentTime = 3; sound.play('collect'); assert.equal(audio.nodes.length, beforeHidden);
sound.configure(true, .35);
assert(mix(500, 350, 2, 1000, 700).gain > mix(500, 350, .2, 1000, 700).gain * 5, 'zooming in reveals much louder details');
assert(mix(100, 350, 1, 1000, 700).pan < 0 && mix(900, 350, 1, 1000, 700).pan > 0);
assert(mix(500, 350, 1, 1000, 700).gain > mix(100, 350, 1, 1000, 700).gain, 'camera center is the listening position');
assert.equal(mix(-200, 350, 1, 1000, 700).gain, 0); assert.equal(mix(NaN, 1, 1, 100, 100).gain, 0);
sound.music({ gain: .5, pan: .7 }, 'Lo-fi Beats to Compile To', 82, 4, 0, false, 0, 'music:robot');
assert(sound.emitterBuses.get('music:robot').size > 0);
const bus = [...sound.emitterBuses.get('music:robot')][0];
assert(bus.filter.frequency.value >= 900 && bus.filter.frequency.value < 1800, 'headphone leakage is genuinely low-pass filtered');
sound.position('music:robot', { gain: .1, pan: -.8, lowpass: 2000 });
assert.equal(bus.pan.pan.value, -.8); assert(Math.abs(bus.gain.gain.value - .072) < 1e-12, 'existing sustained notes follow the camera smoothly');
sound.silence('music:robot'); assert(!sound.emitterVoices.has('music:robot')); assert(!sound.emitterBuses.has('music:robot'));
audio.currentTime = 20;
const beforeBall = audio.nodes.length; sound.emit('pp-table', { gain: .8, pan: .2 }, 'ball');
assert(audio.nodes.slice(beforeBall).some(n => n.kind === 'filter' && n.type === 'bandpass'), 'a ping pong bounce colors its click with a band-pass');
for (const cue of ['robostep', 'pp-paddle', 'mw-ding', 'fridge-close', 'chess-take', 'kart', 'movie-scare']) assert(Array.isArray(SCORES_CHECK[cue]) && SCORES_CHECK[cue].length, cue + ' has a score');
sound.phrase([[0, 0, .02, .04, 'sine', undefined, 5000], [3000, .05, .06, .03, 'sine', 3600]], { gain: .5, pan: 0 }, 'park-zone:1:warble');
assert(sound.emitterBuses.has('park-zone:1:warble'), 'generated birdsong follows the camera like other emitters');
sound.silence('park-zone:1:warble'); assert(!sound.emitterBuses.has('park-zone:1:warble'));
let built = 0;
const voice = (ctx, input) => { built++; return [0, 1, 2].map(() => { const o = ctx.createOscillator(); o.connect(input); o.start(); o.stop(30); return o; }); };
assert.equal(sound.synth({ gain: .4, pan: -.3 }, 'voice:Ada', 3, voice), true);
assert.equal(sound.emitterVoices.get('voice:Ada').size, 3, 'a robot voice counts toward the shared polyphony budget');
sound.position('voice:Ada', { gain: .2, pan: .5 }); assert.equal([...sound.emitterBuses.get('voice:Ada')][0].pan.pan.value, .5, 'a speaking robot can be tracked by the camera');
sound.silence('voice:Ada'); assert(!sound.emitterVoices.has('voice:Ada') && !sound.emitterBuses.has('voice:Ada'), 'interrupting a robot releases its voice graph');
assert.equal(sound.synth({ gain: .4, pan: 0 }, 'voice:Huge', 31, voice), false); assert.equal(built, 1, 'an over-budget voice never builds nodes');
assert.equal(sound.synth({ gain: .001, pan: 0 }, 'voice:Far', 3, voice), false, 'a robot too far from the camera is not heard');
for (let i = 0; i < 50; i++) sound.emit('keyboard', { gain: .6, pan: 0 }, 'desk:' + i, true);
assert(sound.ambient.size <= 30, 'ambient voice budget is enforced');
sound.emit('collect', { gain: 1, pan: 0 }, 'priority', false);
assert(sound.voices.size <= 48, 'foreground rewards retain a bounded polyphony budget');
audio.finish(); assert.equal(sound.voices.size, 0); assert.equal(sound.emitterBuses.size, 0); assert.equal(sound.emitterVoices.size, 0);
sound.destroy();
assert.equal(audio.state, 'closed'); assert.equal(listeners.size, 0, 'owners release audio and all listeners');
assert.equal(JSON.parse(saved.get('lucid:sound')).volume, .35);
console.log('PASS: gesture-only graph, layered rewards, positional gain/pan, real headphone lowpass, sustained-source camera tracking, source cancellation, bounded polyphony, mute/hidden silence and teardown.');
