const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = {};
require('./audio-fixture.cjs').soundtrackFixture(context);
vm.runInNewContext('globalThis.api={SoundtrackQueue,soundtrackPeriod,SOUNDTRACK,SOUNDTRACK_CHAPTERS};', context);
const { SoundtrackQueue, soundtrackPeriod, SOUNDTRACK, SOUNDTRACK_CHAPTERS } = context.api;
const date = hour => new Date(2026, 10, 2, hour);
const seeded = initial => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32); };
const ids = songs => Array.from(songs, song => song.id);
for (const [hour, period] of [[0,'night'],[5,'night'],[6,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[21,'evening'],[22,'night'],[23,'night']]) assert.equal(soundtrackPeriod(date(hour)), period);
assert.equal(SOUNDTRACK.length, 19);
assert.equal(new Set(ids(SOUNDTRACK)).size, SOUNDTRACK.length);
assert(SOUNDTRACK.every(song => song.energy >= 0 && song.energy <= 1 && song.seconds >= 90));
assert.equal(new Set(SOUNDTRACK.map(song => song.genre)).size, 6);

// Follow actual listening time over changing wall-clock hours. A genre may
// reprise, but every recording must be heard and adjacent energies stay close.
for (let seed = 1; seed <= 24; seed++) {
  let queue = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(seed));
  const seen = new Set(), chapters = new Set();
  let previous;
  for (let i = 0; i < 120; i++) {
    const song = queue.next(date((i * 7 + seed) % 24));
    if (previous) {
      assert.notEqual(song.id, previous.id, 'journey must avoid adjacent repeats');
      const delta = song.energy - previous.energy;
      assert(delta <= .30001 && delta >= -.35001, 'use a neighboring song between distant energy levels');
    }
    seen.add(song.id); chapters.add(queue.chapter.id);
    queue.listen(song.seconds);
    if (i % 4 === 2) queue = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(queue.state)), seeded(seed + i));
    previous = song;
    if (seen.size === SOUNDTRACK.length && chapters.size === SOUNDTRACK_CHAPTERS.length) break;
  }
  assert.equal(seen.size, SOUNDTRACK.length, 'all recordings remain reachable while rare genres reprise');
  assert.equal(chapters.size, SOUNDTRACK_CHAPTERS.length, 'the journey must build, peak and release');
}

// Waiting, skipping and crossing midnight do not move the musical clock.
const queue = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(10));
queue.next(date(14));
const opening = queue.chapter.id;
for (let i = 0; i < 10; i++) queue.next(date(i % 2 ? 1 : 19));
assert.equal(queue.chapter.id, opening);
queue.listen(NaN); queue.listen(-10); queue.listen(Infinity);
assert.equal(queue.chapterProgress, 0);
queue.listen(150);
assert.equal(queue.chapterProgress, .5);
const restored = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(queue.state)), seeded(11));
assert.equal(restored.chapterProgress, .5);
restored.listen(160);
assert.equal(restored.chapter.id, opening, 'a chapter never cuts the currently playing song');
restored.next(date(1));
assert.equal(restored.chapter.id, 'night-drive', 'the next boundary advances after listened duration');
assert.equal(restored.chapterProgress, 0);

// Locks stay in the chosen genre. Single-recording genres repeat intentionally.
for (const genre of new Set(SOUNDTRACK.map(song => song.genre))) {
  const locked = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(20));
  assert.equal(locked.setMode(genre), true);
  const pool = SOUNDTRACK.filter(song => song.genre === genre), heard = new Set();
  let previous;
  for (let i = 0; i < pool.length * 3; i++) {
    const song = locked.next(date(8));
    assert.equal(song.genre, genre);
    if (pool.length > 1 && previous) assert.notEqual(song.id, previous.id);
    heard.add(song.id); previous = song;
    locked.listen(song.seconds);
  }
  assert.equal(heard.size, pool.length, 'a genre lock cycles its whole pool');
  assert.equal(locked.chapterProgress, 0, 'a genre lock suspends the journey clock');
  const resumed = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(locked.state)), seeded(30));
  assert.equal(resumed.mode, genre);
  assert.equal(resumed.setMode('not-a-genre'), false);
  assert.equal(resumed.mode, genre);
  assert.equal(resumed.setMode('journey'), true);
  const next = resumed.next(date(19));
  assert.notEqual(next.id, previous.id, 'returning to the journey does not replay the active song');
  assert(Math.abs(next.energy - previous.energy) <= .35001, 'locks return through a nearby energy level');
}

// An older saved shuffle bag is migrated, preserving heard tracks. New genres
// receive chapters without resetting the user's history or requiring a new day.
const additions = ['cassette-clouds','neon-afterglow','tidal-memory','petal-breaks','midnight-drift'];
const heard = ids(SOUNDTRACK).filter(id => !additions.includes(id));
const migrated = new SoundtrackQueue(SOUNDTRACK, { played: heard, last: heard.at(-1) }, seeded(7));
assert.equal(migrated.mode, 'journey');
assert.equal(migrated.state.played.length, 14);
const newHeard = new Set();
for (let i = 0; i < 60; i++) {
  const song = migrated.next(date(14));
  if (additions.includes(song.id)) newHeard.add(song.id);
  migrated.listen(song.seconds);
}
assert.equal(newHeard.size, additions.length);
for (const saved of [null, {}, {played:['removed-song', null], last:'removed-song',mode:'invalid',chapter:'absent',listened:-3}, {mode:'journey',chapter:'petal-rush',listened:NaN,chapterHeard:'true',started:'true'}]) {
  const invalid = new SoundtrackQueue(SOUNDTRACK, saved, seeded(5));
  assert.equal(invalid.state.played.length, 0);
  assert.equal(invalid.chapterProgress, 0);
  assert(ids(SOUNDTRACK).includes(invalid.next().id));
}
assert.throws(() => new SoundtrackQueue([]).next(), /empty/);
const singleton = new SoundtrackQueue([SOUNDTRACK[0]], undefined, seeded(1));
for (let i = 0; i < 20; i++) { assert.equal(singleton.next().id, SOUNDTRACK[0].id); singleton.listen(1000); }
assert.notEqual(new SoundtrackQueue(SOUNDTRACK, undefined, seeded(2)).next(date(1)).genre, 'breakcore');
const evening = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(2));
evening.next(date(19)); assert.equal(evening.chapter.id, 'night-drive');

// Library picks are one-off choices. They must preserve the chosen direction
// and listening budget while informing the automatic director of the true last song.
const manual = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(91));
assert.equal(manual.select('cassette-clouds', date(8)).id, 'cassette-clouds');
assert.equal(manual.chapter.id, 'warm-tape', 'a first manual pick initializes the local-time opening');
manual.listen(42);
const beforeInvalid = JSON.stringify(manual.state);
assert.equal(manual.select('missing-recording', date(1)), null);
assert.equal(JSON.stringify(manual.state), beforeInvalid, 'unknown song IDs cannot mutate director state');
const progressBeforeChoice = manual.chapterProgress;
const rush = manual.select('petal-breaks', date(1));
assert.equal(manual.mode, 'journey');
assert.equal(manual.chapter.id, 'warm-tape', 'a manual selection does not jump chapters with wall time');
assert.equal(manual.chapterProgress, progressBeforeChoice, 'a manual selection does not invent listening time');
assert.equal(manual.state.last, rush.id);
assert(manual.state.played.includes(rush.id));
const afterManualReload = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(manual.state)), seeded(92));
assert.equal(afterManualReload.state.last, rush.id);
const bridge = afterManualReload.next(date(8));
assert.notEqual(bridge.id, rush.id, 'automatic playback does not immediately repeat a manually chosen song');
assert(bridge.energy < rush.energy && rush.energy - bridge.energy <= .35001, 'the director settles from a manually chosen high-energy song through a real bridge');
const manualLock = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(93));
manualLock.setMode('lofi');
assert.equal(manualLock.select('petal-breaks', date(14)).id, 'petal-breaks');
assert.equal(manualLock.mode, 'lofi', 'playing another genre once does not silently change the lock');
const afterLockedReload = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(manualLock.state)), seeded(94));
assert.equal(afterLockedReload.next(date(19)).genre, 'lofi', 'the configured genre resumes after a one-off manual selection');

// Inspect actual packaged recordings, independently of selection policy.
const hashes = new Set();
for (const song of SOUNDTRACK) {
  const file = 'src/assets/audio/' + song.id + '.mp3';
  assert(fs.statSync(file).size > 500000, `${song.title} is a full-length encoded asset`);
  hashes.add(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
}
assert.equal(hashes.size, SOUNDTRACK.length, 'every recording is distinct');
const metrics = [...JSON.parse(fs.readFileSync('src/assets/audio/soundtrack-metrics.json')), ...JSON.parse(fs.readFileSync('src/assets/audio/genre-metrics.json'))];
assert(metrics.every(track => track.seconds >= 90 && track.peakDbFS <= -2.8 && track.rmsDbFS >= -22 && track.rmsDbFS <= -19));
console.log('PASS: 19 distinct songs, listening-time chapters, coherent energy bridges, all-library fairness, persistent journey and genre locks, old-history migration, manual song selection and energy-aware return, day boundaries, encoded assets and headroom.');
