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
    ended = false; seeking = false; duration = 130; listeners = new Map();
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
  assert.equal(sound.background.get('ambience').gain.gain.value, .36, 'default room tone is quiet without rewriting saved slider preferences');
  const assertTrim = (engine,label) => assert(Math.abs(engine.background.get('theme').gain.gain.value-engine.themeVolume*2.2*10**(engine.currentTheme.gainDb/20))<1e-9,label);
  assertTrim(sound,'the first fade applies the first recording measured playback trim');
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
  assert.equal(sound.background.get('ambience').gain.gain.value, .24, 'existing saved ambience levels use the quieter calibration');
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
  assertTrim(sound,'automatic rotation applies the incoming recording trim rather than the outgoing trim');
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
  // Exercise the real director integration through owned media events.
  storage.set('lucid:sound', JSON.stringify({enabled:true,volume:.45,themeVolume:.3,ambienceVolume:.1}));
  const director = new context.Engine();
  const beforeMedia = media.length;
  let notices = 0;
  const unsubscribe = director.subscribeMusic(() => { notices++; });
  const releaseBrokenObserver = director.subscribeMusic(() => { throw Error('closed control'); });
  assert.equal(director.musicState.status, 'locked');
  director.configureMusic('ambient'); director.nextTheme(); director.pauseTheme(true);
  assert.equal(media.length, beforeMedia, 'mode, next and pause cannot unlock or fetch media');
  assert.equal(director.currentTheme.genre, 'ambient');
  assert.equal(JSON.parse(storage.get('lucid:sound')).musicPaused, true);
  director.pauseTheme(false); assert.equal(media.length, beforeMedia);
  gesture();
  const theme = media.at(-2), air = media.at(-1), clock = contexts.at(-1);
  theme.resolve(); air.resolve(); await settle();
  assert.equal(director.musicState.status, 'playing');
  const selected = director.currentTheme.id;
  director.configureMusic('journey');
  assert.equal(director.currentTheme.id, selected, 'changing mode finishes the active composition');
  const tick = seconds => { clock.currentTime += seconds; theme.currentTime += seconds; theme.listeners.get('timeupdate')(); };
  tick(1);
  assert.equal(director.soundtrack.state.listened, 1, 'only a real positive playback delta advances the journey');
  const heard = director.soundtrack.state.listened;
  theme.seeking = true; theme.listeners.get('seeking')();
  clock.currentTime += .1; theme.currentTime += 55; theme.listeners.get('timeupdate')();
  theme.seeking = false; theme.listeners.get('seeked')();
  theme.listeners.get('timeupdate')();
  assert.equal(director.soundtrack.state.listened, heard, 'seeking does not spend chapter time');
  // A position jump without seeking events is also rejected by the audio clock.
  clock.currentTime += .1; theme.currentTime += 30; theme.listeners.get('timeupdate')();
  assert.equal(director.soundtrack.state.listened, heard);
  for (let i=0;i<16;i++) tick(1);
  assert(JSON.parse(storage.get('lucid:sound')).soundtrack.listened >= heard + 14, 'timeupdate checkpoints listening progress without a new timer');
  const position = theme.currentTime;
  director.pauseTheme(true);
  const pausedHeard = director.soundtrack.state.listened;
  tick(20);
  assert.equal(director.soundtrack.state.listened, pausedHeard, 'pause does not advance the journey');
  theme.currentTime = position;
  director.pauseTheme(false); theme.resolve(); await settle();
  assert.equal(theme.currentTime, position, 'music pause resumes the retained playhead');
  director.configureMusic('phonk');
  assert.equal(director.currentTheme.id, selected);
  const calls = theme.calls;
  director.nextTheme(); director.nextTheme(); director.nextTheme();
  assert.equal(director.currentTheme.genre, 'phonk', 'manual Next applies the selected genre');
  assert.equal(theme.calls, calls+1, 'pending Next presses cannot overlap playback attempts');
  theme.resolve(); await settle();
  assert.equal(theme.calls, calls+2, 'repeated pending requests collapse to one owned advance');
  director.pauseTheme(true); theme.resolve(); await settle();
  assert(theme.paused && director.musicState.paused, 'late playback resolution cannot undo music pause');
  director.pauseTheme(false); theme.reject(Error('device unavailable')); await settle();
  assert.equal(director.musicState.status, 'error');
  director.retryTheme(); theme.resolve(); await settle();
  assert.equal(director.musicState.status, 'playing', 'retry uses the retained song and existing stream');
  theme.listeners.get('waiting')(); assert.equal(director.musicState.status, 'loading');
  theme.listeners.get('playing')(); assert.equal(director.musicState.status, 'playing');
  const suspendNow = clock.suspend.bind(clock);
  let finishSuspension;
  clock.suspend = () => new Promise(resolve => { finishSuspension = () => { clock.state = 'suspended'; clock.listener(); resolve(); }; });
  director.configure(false); director.configure(true);
  finishSuspension(); await settle();
  theme.resolve(); air.resolve(); await settle();
  assert.equal(director.musicState.status, 'playing', 'late mute suspension must follow the newer unmute intent');
  clock.suspend = suspendNow;
  document.hidden = true; listeners.get('d:visibilitychange')();
  const hiddenHeard = director.soundtrack.state.listened;
  tick(40); assert.equal(director.soundtrack.state.listened, hiddenHeard, 'hidden time cannot spend chapters');
  assert.equal(director.musicState.status, 'hidden');
  document.hidden = false; listeners.get('d:visibilitychange')();
  assert.equal(director.musicState.status, 'locked');
  director.nextTheme(); assert(theme.paused, 'Next after hide cannot authorize playback');
  gesture(); theme.resolve(); air.resolve(); await settle();
  theme.currentTime = 37; director.pauseTheme(true);
  assert.equal(media.length, beforeMedia+2, 'all modes reuse one theme stream and one ambience stream');
  const persistedSong = director.currentTheme.id;
  const noticed = notices; unsubscribe(); releaseBrokenObserver();
  director.configureMusic('lofi'); assert.equal(notices, noticed, 'unsubscribed controls stop receiving state');
  director.destroy(); director.destroy();
  const restored = new context.Engine();
  assert.equal(restored.musicState.mode, 'lofi');
  assert.equal(restored.musicState.paused, true);
  assert.equal(restored.currentTheme.id, persistedSong, 'reopening keeps the active composition');
  gesture();
  assert.equal(media.length, beforeMedia+3, 'persistent music pause leaves only ambience loading');
  media.at(-1).resolve(); await settle();
  restored.pauseTheme(false);
  const resumed = media.at(-1); resumed.resolve(); await settle();
  assert.equal(resumed.currentTime, 37, 'reopening restores the saved song position');
  restored.destroy();
  assert.equal(restored.musicListeners.size, 0);
  assert.equal(listeners.size, 0, 'all owners release listeners');
  // Real song-library requests share the owned stream and retain the latest
  // user's choice while an older play promise is unresolved.
  storage.set('lucid:sound', JSON.stringify({enabled:true,volume:.45,themeVolume:.3,ambienceVolume:.1}));
  const library = new context.Engine(), libraryMediaStart = media.length;
  library.configureMusic('ambient');
  assert.equal(library.playTheme('cassette-clouds'), true);
  assert.equal(library.currentTheme.id, 'cassette-clouds');
  assert.equal(media.length, libraryMediaStart, 'picking a song cannot authorize playback or fetch before a gesture');
  assert.equal(library.musicState.mode, 'ambient', 'a single-song choice does not replace music direction');
  gesture();
  const libraryTheme = media.at(-2), libraryAir = media.at(-1);
  library.playTheme('neon-afterglow'); library.playTheme('petal-breaks');
  assert.equal(libraryTheme.calls, 1, 'pending song choices cannot overlap the active playback attempt');
  libraryTheme.resolve(); libraryAir.resolve(); await settle();
  assert.equal(library.currentTheme.id, 'petal-breaks', 'the latest song choice wins over an older queued choice');
  assert.equal(libraryTheme.calls, 2, 'only the winning queued recording starts');
  assert(!library.soundtrack.state.played.includes('neon-afterglow'), 'a superseded queued selection is not falsely recorded as played');
  libraryTheme.resolve(); await settle();
  assert.equal(library.musicState.status, 'playing');
  assert.equal(library.musicState.mode, 'ambient');
  const selectedHistory = JSON.parse(storage.get('lucid:sound'));
  assert.equal(selectedHistory.currentTheme.id, 'petal-breaks');
  assert.equal(selectedHistory.soundtrack.last, 'petal-breaks', 'manual playback is remembered as the most recent song');
  assert(selectedHistory.soundtrack.played.includes('petal-breaks'));
  const unchanged = JSON.stringify(library.soundtrack.state), unchangedCalls = libraryTheme.calls;
  assert.equal(library.playTheme('missing-recording'), false);
  assert.equal(library.currentTheme.id, 'petal-breaks');
  assert.equal(JSON.stringify(library.soundtrack.state), unchanged, 'invalid IDs leave history untouched');
  assert.equal(libraryTheme.calls, unchangedCalls);
  library.playTheme('neon-afterglow'); library.playTheme('cassette-clouds'); library.pauseTheme(true);
  const pendingCalls = libraryTheme.calls;
  libraryTheme.resolve(); await settle();
  assert.equal(library.currentTheme.id, 'cassette-clouds');
  assert.equal(library.musicState.paused, true, 'a pending selection preserves a later Pause request');
  assert(libraryTheme.paused);
  assert.equal(libraryTheme.calls, pendingCalls, 'a queued selection cannot restart music after Pause');
  libraryTheme.currentTime = 37;
  assert.equal(library.playTheme('cassette-clouds'), true);
  libraryTheme.resolve(); await settle();
  assert.equal(libraryTheme.currentTime, 37, 'playing the current song resumes its saved position rather than restarting');
  assert.equal(library.musicState.paused, false);
  library.configure(false);
  const mutedCalls = libraryTheme.calls;
  library.playTheme('neon-afterglow');
  assert(libraryTheme.paused && !library.enabled, 'a song choice cannot undo global mute');
  assert.equal(libraryTheme.calls, mutedCalls);
  library.configure(true, 0); library.playTheme('petal-breaks');
  assert(libraryTheme.paused);
  assert.equal(libraryTheme.calls, mutedCalls, 'a song choice respects zero master volume');
  library.configureBackground('theme', 0); library.configure(true, .45);
  libraryAir.resolve(); await settle();
  library.playTheme('cassette-clouds');
  assert(libraryTheme.paused);
  assert.equal(libraryTheme.calls, mutedCalls, 'a song choice respects zero music volume');
  library.configureBackground('theme', .3); libraryTheme.resolve(); await settle();
  document.hidden = true; listeners.get('d:visibilitychange')();
  const hiddenCalls = libraryTheme.calls;
  library.playTheme('neon-afterglow');
  assert(libraryTheme.paused);
  assert.equal(libraryTheme.calls, hiddenCalls, 'a hidden song selection cannot start audio');
  document.hidden = false; listeners.get('d:visibilitychange')();
  library.playTheme('petal-breaks');
  assert.equal(library.musicState.status, 'locked');
  assert.equal(libraryTheme.calls, hiddenCalls, 'choosing after visibility returns cannot replace a trusted gesture');
  gesture(); libraryTheme.resolve(); libraryAir.resolve(); await settle();
  assert.equal(library.currentTheme.id, 'petal-breaks');
  assert.equal(library.musicState.status, 'playing');
  assert.equal(media.length, libraryMediaStart + 2, 'song-library playback retains the bounded two-stream pool');
  library.destroy();
  assert.equal(listeners.size, 0, 'song-library playback releases its audio-owner listeners');
  context.AudioContext = class { constructor() { throw Error('no audio device'); } };
  const unavailable = new context.Engine();
  unavailable.pauseTheme(false); gesture();
  assert.equal(unavailable.musicState.status, 'error', 'device failures must not masquerade as a missing gesture');
  unavailable.destroy();
  console.log('PASS: song-library choice, latest-wins pending selection, invalid IDs, current-song resume, mute/volume/hidden safety and persisted history; evolving director controls, active-only listening time, seek filtering, deferred mode changes, pause/playhead persistence, pending Next races, truthful status and subscriptions; lazy streaming, single graph, bounded sources, quiet independent persistent levels, no overlapping starts, late-play races, retry, mute, visibility, playhead continuity and teardown.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
