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
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param();
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
  createBiquadFilter() { return this.node('filter'); }
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
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.sound=gameSound;globalThis.mix=spatialMix;', context);
const sound = context.sound, mix = context.mix;
sound.play('ready'); assert.equal(contexts.length, 0, 'startup never creates audio or autoplays');
listeners.get('pointerdown')({ isTrusted: false }); assert.equal(contexts.length, 0);
listeners.get('pointerdown')({ isTrusted: true }); assert.equal(contexts.length, 1);
const audio = contexts[0]; sound.play('collect');
const nodes = audio.nodes.length; assert(nodes > 10, 'collection schedules its layered chime');
assert.equal(sound.voices.size, 10);
sound.play('collect'); assert.equal(audio.nodes.length, nodes, 'rapid clicks are rate limited');
audio.currentTime = 2; sound.configure(false); sound.play('purchase');
assert.equal(audio.nodes.length, nodes, 'mute suppresses new nodes'); assert.equal(sound.voices.size, 0);
assert.equal(audio.state, 'suspended', 'muted audio graph stops processing');
sound.configure(true, .2); sound.play('purchase'); assert(audio.nodes.length > nodes);
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
for (let i = 0; i < 50; i++) sound.emit('keyboard', { gain: .6, pan: 0 }, 'desk:' + i, true);
assert(sound.ambient.size <= 30, 'ambient voice budget is enforced');
sound.emit('collect', { gain: 1, pan: 0 }, 'priority', false);
assert(sound.voices.size <= 48, 'foreground rewards retain a bounded polyphony budget');
audio.finish(); assert.equal(sound.voices.size, 0); assert.equal(sound.emitterBuses.size, 0); assert.equal(sound.emitterVoices.size, 0);
sound.destroy();
assert.equal(audio.state, 'closed'); assert.equal(listeners.size, 0, 'owners release audio and all listeners');
assert.equal(JSON.parse(saved.get('lucid:sound')).volume, .35);
console.log('PASS: gesture-only graph, layered rewards, positional gain/pan, real headphone lowpass, sustained-source camera tracking, source cancellation, bounded polyphony, mute/hidden silence and teardown.');
