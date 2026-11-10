const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = {};
require('./audio-fixture.cjs').soundtrackFixture(context);
vm.runInNewContext('globalThis.api={SoundtrackQueue,soundtrackPeriod,SOUNDTRACK,SOUNDTRACK_CHAPTERS,GENRE_NEIGHBORS,MAX_ENERGY_STEP,transitionFits,genresConnect,songMatchesMode,songAffinity,harmonicDistance};', context);
const { SoundtrackQueue, soundtrackPeriod, SOUNDTRACK, SOUNDTRACK_CHAPTERS, GENRE_NEIGHBORS, MAX_ENERGY_STEP, transitionFits, genresConnect, songMatchesMode, songAffinity, harmonicDistance } = context.api;
const date = hour => new Date(2026, 10, 2, hour);
const seeded = initial => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32); };
const ids = songs => Array.from(songs, song => song.id);
const reload = (queue, songs, seed) => new SoundtrackQueue(songs, JSON.parse(JSON.stringify(queue.state)), seeded(seed));
const GENRES = Object.keys(GENRE_NEIGHBORS);
const fits = (a, b) => transitionFits(a, b);

for (const [hour, period] of [[0,'night'],[5,'night'],[6,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[21,'evening'],[22,'night'],[23,'night']]) assert.equal(soundtrackPeriod(date(hour)), period);

// ---- The real catalogue: valid authored metadata, connected for smooth flow.
assert(SOUNDTRACK.length >= 14);
assert.equal(new Set(ids(SOUNDTRACK)).size, SOUNDTRACK.length);
for (const song of SOUNDTRACK) {
  assert(GENRES.includes(song.genre), `${song.id}: genre ${song.genre} must be one of ${GENRES.join(', ')}`);
  assert(song.energy >= 0 && song.energy <= 1 && song.seconds >= 90 && song.bpm > 0 && song.meter >= 3, `${song.id}: energy, length, tempo and meter`);
  assert(Number.isInteger(song.key) && song.key >= 0 && song.key < 12 && song.textures.length && Number.isFinite(song.gainDb), `${song.id}: key, textures and measured trim`);
  assert(['morning','day','evening','night'].includes(song.period), `${song.id}: period`);
}
for (const id of ['little-lights','window-garden','first-coffee','paper-kites','peach-parade','apricot-hour','tram-home','moonlit-desks','sleepy-satellites','pocket-sunrise','cloud-arcade','velvet-elevator','lantern-carousel','the-last-constellation'])
  assert(SOUNDTRACK.some(song => song.id === id), `original song ${id} is kept`);
const reachable = songs => {
  const seen = new Set([songs[0].id]); let frontier = [songs[0]];
  while (frontier.length) { frontier = songs.filter(s => !seen.has(s.id) && frontier.some(f => fits(f, s))); frontier.forEach(s => seen.add(s.id)); }
  return seen;
};
const realReach = reachable(SOUNDTRACK);
assert.equal(realReach.size, SOUNDTRACK.length, `every song must be reachable through smooth transitions; isolated: ${ids(SOUNDTRACK).filter(id => !realReach.has(id)).join(', ')}`);

// ---- Genre graph: a DJ crate map. Symmetric, and the peak sits behind electronic genres.
for (const [genre, neighbors] of Object.entries(GENRE_NEIGHBORS)) for (const other of neighbors) {
  assert(GENRE_NEIGHBORS[other].includes(genre), `${genre} and ${other} must connect both ways`);
}
assert.deepEqual([...GENRE_NEIGHBORS.breakcore].sort(), ['phonk','synthwave']);
for (const calm of ['acoustic','ambient','lofi','jazz']) for (const loud of ['breakcore','synthwave']) assert(!genresConnect(calm, loud), `${calm} never jumps straight to ${loud}`);
for (const genre of GENRES) assert(genresConnect(genre, genre));
assert(MAX_ENERGY_STEP >= .15 && MAX_ENERGY_STEP <= .2);

// ---- Chapter arc: calm openings by time of day, a rise to the breakcore peak, a cool-down.
assert.equal(new Set(SOUNDTRACK_CHAPTERS.map(chapter => chapter.id)).size, SOUNDTRACK_CHAPTERS.length);
assert(SOUNDTRACK_CHAPTERS.every(chapter => chapter.genres.length && chapter.genres.every(g => GENRES.includes(g)) && chapter.seconds > 0));
const peak = SOUNDTRACK_CHAPTERS.reduce((best, chapter, index) => chapter.energy > SOUNDTRACK_CHAPTERS[best].energy ? index : best, 0);
assert.equal(SOUNDTRACK_CHAPTERS[peak].genres[0], 'breakcore');
for (let i = 1; i <= peak; i++) assert(SOUNDTRACK_CHAPTERS[i].energy >= SOUNDTRACK_CHAPTERS[i - 1].energy, 'energy rises toward the peak');
for (let i = peak + 1; i < SOUNDTRACK_CHAPTERS.length; i++) assert(SOUNDTRACK_CHAPTERS[i].energy <= SOUNDTRACK_CHAPTERS[i - 1].energy, 'energy cools after the peak');
for (let i = 0; i < SOUNDTRACK_CHAPTERS.length; i++) {
  const a = SOUNDTRACK_CHAPTERS[i], b = SOUNDTRACK_CHAPTERS[(i + 1) % SOUNDTRACK_CHAPTERS.length];
  assert(a.genres.some(x => b.genres.some(y => genresConnect(x, y))), `${a.id} leads into ${b.id}`);
  assert(Math.abs(a.energy - b.energy) <= .2001, `${a.id} to ${b.id} is a gradual step`);
}
for (const [hour, chapter] of [[2,'still-water'],[8,'morning-light'],[13,'warm-tape'],[19,'late-cafe']]) {
  const opening = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(hour)); opening.next(date(hour));
  assert.equal(opening.chapter.id, chapter, `${hour}:00 opens calmly with ${chapter}`);
}

// ---- A synthetic full library: the 14 originals plus the planned genre songs.
const keys = [0, 2, 4, 5, 7, 9, 11, 3, 8, 10, 1, 6];
let made = 0;
const synth = (genre, energy, bpm, textures, period = 'evening') => ({ id: `${genre}-${++made}`, title: `${genre} ${made}`, url: 'x.mp3', period, bpm, genre, energy,
  seconds: 150, key: keys[made % 12], mode: made % 3 ? 'minor' : 'major', meter: 4, textures, gainDb: 0 });
const LIBRARY = [...SOUNDTRACK.filter(song => song.genre === 'acoustic' || song.genre === 'ambient').slice(0, 14),
  ...[.27, .30, .33, .36].map((e, i) => synth('lofi', e, 74 + i * 4, ['piano', 'drums'], 'day')),
  ...[.30, .36, .40, .45].map((e, i) => synth('jazz', e, 90 + i * 12, ['piano', 'bass', 'drums'])),
  ...[.10, .13, .16, .20].map((e, i) => synth('ambient', e, 60 + i * 3, i % 2 ? ['pads', 'bells'] : ['pads', 'piano'], 'night')),
  ...[.50, .55, .62, .68].map((e, i) => synth('phonk', e, 70 + i * 4, ['bass', 'drums', 'cowbell'], 'night')),
  ...[.58, .64, .70, .75].map((e, i) => synth('synthwave', e, 98 + i * 6, ['synth', 'pads', 'drums'])),
  ...[.76, .80, .84, .88].map((e, i) => synth('breakcore', e, 160 + i * 4, ['breaks', 'pads', 'piano'], 'day'))];
assert.equal(reachable(LIBRARY).size, LIBRARY.length);

// Follow actual listening time across changing hours, with reloads. Every
// automatic transition must be smooth, every song heard and every chapter reached.
for (const library of [LIBRARY, SOUNDTRACK]) for (let seed = 1; seed <= 16; seed++) {
  let queue = new SoundtrackQueue(library, undefined, seeded(seed));
  const seen = new Set(), chapters = new Set();
  let previous;
  for (let i = 0; i < 400; i++) {
    const before = queue.state;
    const song = queue.next(date((i * 7 + seed) % 24));
    if (previous && queue.chapter.id !== before.chapter) {
      const finished = SOUNDTRACK_CHAPTERS.find(chapter => chapter.id === before.chapter);
      assert(before.listened >= finished.seconds && before.chapterHeard, 'chapters advance only after real listening and their defining genre');
      assert.equal(queue.chapterProgress, 0);
    }
    if (previous) {
      assert.notEqual(song.id, previous.id, 'no adjacent repeats');
      assert(fits(previous, song), `seed ${seed}: ${previous.genre} ${previous.energy} -> ${song.genre} ${song.energy} must be a smooth transition`);
    }
    seen.add(song.id); chapters.add(queue.chapter.id);
    queue.listen(song.seconds);
    if (i % 4 === 2) queue = reload(queue, library, seed + i);
    previous = song;
    if (seen.size === library.length && chapters.size === SOUNDTRACK_CHAPTERS.length) break;
  }
  assert.equal(seen.size, library.length, `seed ${seed}: every song is reachable`);
  if (library === LIBRARY) assert.equal(chapters.size, SOUNDTRACK_CHAPTERS.length, `seed ${seed}: the journey reaches every chapter`);
}

// The whole-library rotation completes without repeats, with smooth steps throughout.
for (const library of [LIBRARY, SOUNDTRACK]) for (let seed = 1; seed <= 12; seed++) {
  let rotation = new SoundtrackQueue(library, undefined, seeded(seed * 593));
  let previous, repeats = 0;
  for (let pass = 0; pass < 2; pass++) {
    const heard = new Set();
    for (let guard = 0; heard.size < library.length && guard < library.length * 2; guard++) {
      const song = rotation.next(date((seed + guard * 5) % 24));
      if (heard.has(song.id)) repeats++;
      if (previous) assert(fits(previous, song), 'rotation keeps smooth steps');
      heard.add(song.id); rotation.listen(song.seconds); previous = song;
      if (guard % 3 === 1) rotation = reload(rotation, library, seed * 997 + pass * 100 + guard);
    }
    assert.equal(heard.size, library.length);
  }
  assert.equal(repeats, 0, `seed ${seed}: the planner completes each rotation without replaying a song`);
}

// When only distant songs are unheard, the director walks there through fitting
// songs instead of jumping (a short reprise beats a jarring cut).
{
  const far = LIBRARY.filter(song => song.genre === 'breakcore');
  const calm = LIBRARY.find(song => song.genre === 'ambient' && song.energy <= .15);
  let queue = new SoundtrackQueue(LIBRARY, { played: ids(LIBRARY.filter(song => !far.includes(song))), last: calm.id, mode: 'journey', chapter: 'still-water', listened: 0, chapterHeard: true, started: true }, seeded(3));
  let previous = calm, reached = false;
  for (let step = 0; step < 20 && !reached; step++) {
    const song = queue.next(date(13));
    assert(fits(previous, song), `bridge step ${previous.genre} -> ${song.genre} fits`);
    reached = song.genre === 'breakcore'; previous = song; queue.listen(song.seconds);
  }
  assert(reached, 'bridging reaches the remaining distant songs');
}

// ---- Locks stay in their direction, cycle the whole pool and survive reloads.
for (const mode of [...new Set(LIBRARY.map(song => song.genre)), 'pads', 'bells']) {
  let locked = new SoundtrackQueue(LIBRARY, undefined, seeded(27));
  assert.equal(locked.setMode(mode), true);
  const pool = LIBRARY.filter(song => songMatchesMode(song, mode));
  let previous;
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Set();
    for (let index = 0; index < pool.length; index++) {
      const song = locked.next(date(8));
      assert(songMatchesMode(song, mode));
      assert(!seen.has(song.id), `${mode} pass ${pass} repeats before its pool is complete`);
      if (pool.length > 1 && previous) assert.notEqual(song.id, previous.id);
      seen.add(song.id); previous = song; locked.listen(song.seconds);
      locked = reload(locked, LIBRARY, index + pass * 100);
    }
    assert.equal(seen.size, pool.length);
  }
  assert.equal(locked.mode, mode);
  assert.equal(locked.chapterProgress, 0, 'a lock suspends the journey clock');
  assert.equal(locked.setMode('journey'), true);
  const next = locked.next(date(19));
  assert.notEqual(next.id, previous.id, 'returning to the journey does not replay the active song');
  assert(fits(previous, next) || !LIBRARY.some(song => song.id !== previous.id && fits(previous, song)), `${mode}: returning to the journey continues smoothly`);
}
for (const mode of ['pads', 'bells']) assert(LIBRARY.filter(song => songMatchesMode(song, mode)).every(song => song.energy <= (mode === 'pads' ? .35 : .5) && song.textures.includes(mode)));

// Overlapping directions share actual listening credit.
const overlapSongs = [
  {...SOUNDTRACK[0],id:'bell-only',genre:'acoustic',textures:['bells']},
  {...SOUNDTRACK[0],id:'shared-bell',genre:'ambient',textures:['bells','pads']},
  {...SOUNDTRACK[0],id:'ambient-only',genre:'ambient',textures:['pads']},
];
let overlap = new SoundtrackQueue(overlapSongs,undefined,()=>0);
overlap.setMode('bells'); assert.equal(overlap.next(date(8)).id,'bell-only');
overlap.setMode('ambient'); assert.equal(overlap.next(date(8)).id,'shared-bell');
overlap = new SoundtrackQueue(overlapSongs,JSON.parse(JSON.stringify(overlap.state)),()=>0);
overlap.setMode('bells'); assert.equal(overlap.next(date(8)).id,'bell-only','overlap heard in another mode completes the earlier rotation');

// ---- Listening time, not wall time, moves the arc.
{
  const queue = new SoundtrackQueue(LIBRARY, undefined, seeded(10));
  queue.next(date(13));
  const opening = queue.chapter.id;
  for (let i = 0; i < 10; i++) queue.next(date(i % 2 ? 1 : 19));
  assert.equal(queue.chapter.id, opening);
  queue.listen(NaN); queue.listen(-10); queue.listen(Infinity);
  assert.equal(queue.chapterProgress, 0);
  const seconds = queue.chapter.seconds;
  queue.listen(seconds / 2); assert.equal(queue.chapterProgress, .5);
  const restored = reload(queue, LIBRARY, 11);
  assert.equal(restored.chapterProgress, .5);
  restored.listen(seconds);
  assert.equal(restored.chapter.id, opening, 'a chapter never cuts the current song');
}

// ---- Migration of older saved state.
{
  const old = new SoundtrackQueue(SOUNDTRACK, { played: ['little-lights', 'cassette-clouds', 'petal-breaks', null], last: 'petal-breaks', mode: 'mystical', chapter: 'copper-casebook', listened: 900, chapterHeard: true, started: true, modePlayed: { noir: ['the-velvet-alibi'], ambient: ['moonlit-desks', 'tidal-memory'] }, recent: ['petal-breaks', 'little-lights'] }, seeded(5));
  assert.equal(old.mode, 'journey', 'removed genre directions fall back to the journey');
  assert.deepEqual(Array.from(old.state.played), ['little-lights'], 'removed songs leave the history');
  assert.equal(old.state.last, null);
  assert.equal(old.state.listened, 0, 'a removed chapter cannot manufacture progress');
  assert.deepEqual(Array.from(old.state.modePlayed.ambient), ['moonlit-desks']);
  assert(!('noir' in old.state.modePlayed));
  assert(ids(SOUNDTRACK).includes(old.next(date(1)).id));
  for (const mode of ['medieval', 'nostalgic', 'noir']) assert.equal(new SoundtrackQueue(SOUNDTRACK, { mode }).mode, 'journey');
  for (const id of ['still-water','warm-tape','night-drive','neon-rise','petal-rush','afterglow','soft-landing']) {
    const kept = new SoundtrackQueue(LIBRARY, { played: [LIBRARY[0].id], last: LIBRARY[0].id, mode: 'journey', chapter: id, listened: 80, chapterHeard: true, started: true }, seeded(8));
    assert.equal(kept.chapter.id, id); assert.equal(kept.state.listened, 80, `${id}: surviving chapters keep their listening progress`);
  }
  // A saved genre without songs in this library falls back instead of failing.
  const missing = GENRES.find(genre => !SOUNDTRACK.some(song => song.genre === genre));
  if (missing) {
    assert.equal(new SoundtrackQueue(SOUNDTRACK, { mode: missing }).mode, 'journey');
    assert.equal(new SoundtrackQueue(SOUNDTRACK).setMode(missing), false, 'an empty genre cannot be selected');
  }
  for (const saved of [null, {}, {played:['removed-song', null], last:'removed-song',mode:'invalid',chapter:'absent',listened:-3}, {mode:'journey',chapter:'petal-rush',listened:NaN,chapterHeard:'true',started:'true'}]) {
    const invalid = new SoundtrackQueue(SOUNDTRACK, saved, seeded(5));
    assert.equal(invalid.state.played.length, 0); assert.equal(invalid.chapterProgress, 0);
    assert(ids(SOUNDTRACK).includes(invalid.next().id));
  }
  assert.throws(() => new SoundtrackQueue([]).next(), /empty/);
  const singleton = new SoundtrackQueue([SOUNDTRACK[0]], undefined, seeded(1));
  for (let i = 0; i < 20; i++) { assert.equal(singleton.next().id, SOUNDTRACK[0].id); singleton.listen(1000); }
  assert.notEqual(new SoundtrackQueue(LIBRARY, undefined, seeded(2)).next(date(1)).genre, 'breakcore', 'night opens calmly');
}

// ---- Harmonic and tempo continuity preferences.
const reference = { ...SOUNDTRACK[0], key: 0, mode: 'major', bpm: 82, textures: ['pads'] };
const variant = changes => ({ ...reference, ...changes });
for (const [aKey, aMode, bKey, bMode, expected] of [
  [0, 'major', 9, 'minor', 0], [0, 'major', 2, 'dorian', 0], [0, 'major', 5, 'lydian', 0],
  [0, 'minor', 3, 'major', 0], [0, 'major', 7, 'major', 1], [0, 'major', 2, 'major', 2], [0, 'major', 3, 'minor', 6],
]) {
  const first = variant({key:aKey,mode:aMode}), second = variant({key:bKey,mode:bMode});
  assert.equal(harmonicDistance(first,second),expected); assert.equal(harmonicDistance(second,first),expected);
}
assert(songAffinity(reference,variant({key:9,mode:'minor'})) > songAffinity(reference,variant({key:3,mode:'minor'})));
assert.equal(songAffinity(reference,variant({bpm:164})),songAffinity(reference,variant({bpm:82})), 'double time keeps the pulse');
assert(songAffinity(reference,variant({bpm:164})) > songAffinity(reference,variant({bpm:122})));
assert(songAffinity(reference,variant({textures:['pads']})) > songAffinity(reference,variant({textures:['drums']})));

// ---- Packaged recordings match their measurements.
const hashes = new Set();
const mastered = JSON.parse(fs.readFileSync('src/assets/audio/library-mastering.json'));
for (const song of SOUNDTRACK) {
  const file = 'src/assets/audio/' + song.id + '.opus';
  assert(fs.statSync(file).size > 500000, `${song.title} is a full-length encoded asset`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  hashes.add(hash);
  const m = mastered.tracks.find(row => row.id === song.id);
  assert(m && m.sha256 === hash, `${song.title} measurements match this exact recording (run tools/music/verify-music-masters.py --write)`);
  assert(Math.abs(m.seconds-song.seconds)<.03 && Math.abs(m.gainDb-song.gainDb)<.05, `${song.title} uses its measured duration and trim`);
  assert(m.finite && m.truePeakDbTP<=-2.7 && m.dcOffset<.002 && m.stereoCorrelation>-.1, `${song.title} headroom and stereo integrity`);
  assert(Math.abs(m.effectiveLUFS+20)<=.25 && m.truePeakDbTP+song.gainDb<=-2.49, `${song.title} playback loudness`);
  assert(m.leadingQuietSeconds<=.5 && m.trailingQuietSeconds<=.65, `${song.title} has no start or end gap`);
}
assert.equal(hashes.size, SOUNDTRACK.length, 'every recording is distinct');
console.log(`PASS: ${SOUNDTRACK.length} catalogued songs, connected genre graph and ${MAX_ENERGY_STEP} energy cap, ${SOUNDTRACK_CHAPTERS.length}-chapter arc to a breakcore peak, smooth transitions on the real and a full synthetic library, complete rotations without repeats, bridging toward distant songs, genre/texture locks, listening-time arc, migration of removed songs, genres and chapters, packaged measurements.`);
