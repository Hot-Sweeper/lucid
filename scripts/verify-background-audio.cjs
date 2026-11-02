const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

async function main() {
  const listeners = new Map(), storage = new Map(), media = [], contexts = [];
  const surface = prefix => ({ addEventListener: (key, fn) => listeners.set(prefix + key, fn), removeEventListener: key => listeners.delete(prefix + key) });
  class Param { value = 0; cancelScheduledValues() {} setValueAtTime(n) { this.value = n; } setTargetAtTime(n) { this.value = n; } }
  class Node { gain = new Param(); connect(target) { this.target = target; } disconnect() { this.disconnected = true; } }
  class AudioContext {
    currentTime = 1; state = 'running'; destination = {}; nodes = [];
    constructor() { contexts.push(this); }
    addEventListener(_key, fn) { this.listener = fn; }
    removeEventListener() { this.listener = null; }
    createGain() { const node = new Node(); this.nodes.push(node); return node; }
    createMediaElementSource(audio) { const node = new Node(); node.audio = audio; this.nodes.push(node); return node; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  class Audio {
    paused = true; calls = 0; currentTime = 18;
    ended = false; duration = 130; listeners = new Map();
    constructor(url) { this.url = url; media.push(this); }
    set src(url) { this.url = url; this.ended = false; this.currentTime = 0; }
    addEventListener(key, callback) { this.listeners.set(key, callback); }
    removeEventListener(key) { this.listeners.delete(key); }
    finish() { this.paused = true; this.ended = true; this.listeners.get('ended')?.(); }
    play() { this.calls++; return new Promise((resolve, reject) => { this.resolve = () => { this.paused = false; resolve(); }; this.reject = reject; }); }
    pause() { this.paused = true; }
    removeAttribute(key) { if (key === 'src') this.url = ''; }
    load() { this.released = true; }
  }
  const document = { ...surface('d:'), hidden: false };
  const context = { window: surface('w:'), document, AudioContext, Audio, themeUrl: 'theme.mp3', ambienceUrl: 'air.mp3',
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  const source = fs.readFileSync('src/office/sound.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
  require('./audio-fixture.cjs').soundtrackFixture(context);
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.sound = gameSound; globalThis.Engine = GameSound;', context);
  const sound = context.sound;
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const gesture = () => listeners.get('w:pointerdown')({ isTrusted: true });
  sound.configureBackground('theme', .3);
  assert.equal(media.length, 0, 'no media construction, fetch or playback before a gesture');
  gesture(); gesture(); gesture();
  assert.equal(contexts.length, 1); assert.equal(media.length, 2);
  assert(media.every(m => m.calls === 1 && m.preload === 'none') && !media[0].loop && media[1].loop, 'only ambience loops; gestures never overlap pending plays');
  const audio = contexts[0];
  assert([...sound.background.values()].every(track => track.source.target === track.gain && track.gain.target === sound.master), 'both streams use the existing master');
  sound.configure(false);
  for (const m of media) m.resolve();
  await settle();
  assert(media.every(m => m.paused), 'late play success cannot undo mute');
  sound.configure(true); await settle();
  for (const m of media) m.resolve(); await settle();
  assert(media.every(m => !m.paused));
  sound.configureBackground('theme', 0);
  assert(media[0].paused && !media[1].paused, 'music can stop independently of ambience');
  sound.configureBackground('ambience', .12);
  assert.equal(sound.background.get('ambience').gain.gain.value, .48);
  assert.equal(media[1].calls, 2, 'changing volume does not restart playing audio');
  sound.configureBackground('theme', .5); media[0].resolve(); await settle();
  assert.equal(media[0].currentTime, 18, 'turning a layer back on preserves its playhead');
  document.hidden = true; listeners.get('d:visibilitychange')();
  assert(media.every(m => m.paused)); assert.equal(audio.state, 'suspended');
  const count = media.map(m => m.calls);
  document.hidden = false; listeners.get('d:visibilitychange')();
  assert.deepEqual(media.map(m => m.calls), count, 'visibility alone cannot start music');
  audio.state = 'running'; audio.listener();
  assert.equal(audio.state, 'suspended', 'a late context resume cannot revive audio after hide and return');
  assert.deepEqual(media.map(m => m.calls), count);
  gesture(); for (const m of media) m.resolve(); await settle();
  const firstSong = sound.currentTheme.id;
  media[0].currentTime = 129; media[0].listeners.get('timeupdate')();
  assert.equal(sound.background.get('theme').gain.gain.value, 0, 'outgoing music has a gentle tail fade');
  media[0].finish();
  assert.notEqual(sound.currentTheme.id, firstSong, 'an ended song advances automatically');
  assert.equal(media.length, 2, 'rotation reuses the existing two streams');
  media[0].resolve(); await settle();
  assert(!media[0].paused && !sound.background.get('theme').fading);
  const nextSong = sound.currentTheme.id;
  sound.configure(false); media[0].finish();
  assert.equal(sound.currentTheme.id, nextSong, 'a late ended event cannot restart muted music');
  sound.configure(true); media[0].resolve(); media[1].resolve(); await settle();
  assert.notEqual(sound.currentTheme.id, nextSong, 'deferred rotation resumes after unmute');
  sound.configure(true, 0); assert(media.every(m => m.paused));
  sound.configure(true, .45); await settle();
  media[0].reject(new Error('device unavailable')); media[1].resolve(); await settle();
  assert.equal(sound.background.get('theme').pending, false, 'failed play can be retried');
  const beforeRetry = media[0].calls; gesture(); assert.equal(media[0].calls, beforeRetry + 1);
  sound.destroy(); media[0].resolve(); await settle();
  assert(media.every(m => m.paused && m.released && !m.url));
  assert(media.every(m => m.listeners.size === 0), 'teardown removes song-boundary listeners');
  assert(audio.nodes.every(n => n.disconnected)); assert.equal(listeners.size, 0); assert.equal(audio.listener, null);
  const next = new context.Engine();
  assert.equal(next.themeVolume, .5); assert.equal(next.ambienceVolume, .12); next.destroy();
  console.log('PASS: lazy streaming, single graph, bounded sources, quiet independent persistent levels, no overlapping starts, late-play races, retry, mute, visibility, playhead continuity and teardown.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
