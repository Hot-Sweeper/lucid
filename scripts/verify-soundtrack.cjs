const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = {};
require('./audio-fixture.cjs').soundtrackFixture(context);
vm.runInNewContext('globalThis.api={SoundtrackQueue,soundtrackPeriod,SOUNDTRACK,SOUNDTRACK_CHAPTERS,songMatchesMode,songAffinity,harmonicDistance};', context);
const { SoundtrackQueue, soundtrackPeriod, SOUNDTRACK, SOUNDTRACK_CHAPTERS, songMatchesMode, songAffinity, harmonicDistance } = context.api;
const date = hour => new Date(2026, 10, 2, hour);
const seeded = initial => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32); };
const ids = songs => Array.from(songs, song => song.id);
for (const [hour, period] of [[0,'night'],[5,'night'],[6,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[21,'evening'],[22,'night'],[23,'night']]) assert.equal(soundtrackPeriod(date(hour)), period);
assert.equal(SOUNDTRACK.length, 23);
assert.equal(new Set(ids(SOUNDTRACK)).size, SOUNDTRACK.length);
assert(SOUNDTRACK.every(song => song.energy >= 0 && song.energy <= 1 && song.seconds >= 90));
assert.equal(new Set(SOUNDTRACK.map(song => song.genre)).size, 10);
assert.equal(SOUNDTRACK_CHAPTERS.length, 11);
assert.equal(new Set(SOUNDTRACK_CHAPTERS.map(chapter => chapter.id)).size, SOUNDTRACK_CHAPTERS.length);
assert(SOUNDTRACK.every(song => song.textures.length && song.meter >= 3 && song.bpm > 0));

// Follow actual listening time over changing wall-clock hours. A genre may
// reprise, but every recording must be heard and adjacent energies stay close.
for (let seed = 1; seed <= 24; seed++) {
  let queue = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(seed));
  const seen = new Set(), chapters = new Set();
  let previous;
  for (let i = 0; i < 240; i++) {
    const beforeBoundary = queue.state;
    const song = queue.next(date((i * 7 + seed) % 24));
    if (previous && queue.chapter.id !== beforeBoundary.chapter) {
      const finishedChapter = SOUNDTRACK_CHAPTERS.find(chapter => chapter.id === beforeBoundary.chapter);
      assert(beforeBoundary.listened >= finishedChapter.seconds && beforeBoundary.chapterHeard, 'chapters require real listening time and their defining genre before advancing');
      assert.equal(queue.chapterProgress, 0, 'a new chapter starts at its real boundary');
    }
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
  assert.equal(seen.size, SOUNDTRACK.length, `seed ${seed}: all recordings remain reachable; missing ${ids(SOUNDTRACK).filter(id => !seen.has(id)).join(', ')}`);
  assert.equal(chapters.size, SOUNDTRACK_CHAPTERS.length, `seed ${seed}: the journey must reach every chapter; missing ${SOUNDTRACK_CHAPTERS.filter(chapter => !chapters.has(chapter.id)).map(chapter => chapter.id).join(', ')}`);
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
assert.equal(restored.chapter.id, 'copper-casebook', 'the next boundary advances after listened duration');
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
const additions = ['the-glass-observatory','briar-lanterns','the-copper-casebook','postcards-from-home'];
const heard = ids(SOUNDTRACK).filter(id => !additions.includes(id));
const migrated = new SoundtrackQueue(SOUNDTRACK, { played: heard, last: heard.at(-1) }, seeded(7));
assert.equal(migrated.mode, 'journey');
assert.equal(migrated.state.played.length, 19);
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

// Texture directions select real compatible recordings, never change their sound at runtime.
for (const mode of ['pads', 'bells']) {
  const textures = new SoundtrackQueue(SOUNDTRACK, undefined, seeded(123));
  assert.equal(textures.setMode(mode), true);
  const pool = SOUNDTRACK.filter(song => songMatchesMode(song, mode));
  assert(pool.length >= 3, 'texture directions have a real variety of recordings');
  const chosen = new Set();
  for (let i = 0; i < pool.length * 3; i++) {
    const song = textures.next(date(19));
    assert(songMatchesMode(song, mode));
    assert(song.textures.includes(mode), 'texture directions reflect authored instruments');
    chosen.add(song.id);
    assert(song.energy <= (mode === 'pads' ? .35 : .50), 'texture modes remain calm');
  }
  assert.equal(chosen.size, pool.length);
}
const byId = id => SOUNDTRACK.find(song => song.id === id);
// Isolate each continuity factor. Comparing different tempi and keys at once
// could falsely require a harmonic bonus to dominate a valid tempo preference.
const reference = { ...byId('cassette-clouds'), key: 0, mode: 'major', bpm: 82, textures: ['pads'] };
const variant = changes => ({ ...reference, ...changes });
for (const [aKey, aMode, bKey, bMode, expected] of [
  [0, 'major', 9, 'minor', 0], [9, 'minor', 0, 'major', 0],
  [0, 'major', 2, 'dorian', 0], [0, 'major', 5, 'lydian', 0],
  [0, 'minor', 3, 'major', 0], [0, 'major', 7, 'major', 1],
  [0, 'major', 5, 'major', 1], [0, 'major', 2, 'major', 2],
  [0, 'major', 3, 'minor', 6], [0, 'minor', 9, 'major', 6],
]) {
  const first = variant({key:aKey,mode:aMode}), second = variant({key:bKey,mode:bMode});
  assert.equal(harmonicDistance(first,second),expected,`${aKey} ${aMode} to ${bKey} ${bMode} uses its true relative-major center`);
  assert.equal(harmonicDistance(second,first),expected,'harmonic relationship must be symmetric');
}
assert(songAffinity(reference,variant({key:9,mode:'minor'})) > songAffinity(reference,variant({key:3,mode:'minor'})), 'C major prefers its actual relative A minor over unrelated E-flat minor');
assert.equal(songAffinity(reference,variant({bpm:164})),songAffinity(reference,variant({bpm:82})), 'double-time breakcore can retain the same underlying pulse');
assert(songAffinity(reference,variant({bpm:164})) > songAffinity(reference,variant({bpm:122})), 'half-time pulse continuity is preferred over an unrelated tempo');
assert(songAffinity(reference,variant({textures:['pads']})) > songAffinity(reference,variant({textures:['drums']})), 'a shared instrumental texture adds continuity');
// A primary mood in a distant key gets an audible neighboring bridge before
// its defining track. Reloading between them must not strand the new chapter.
const outgoingTone = variant({id:'outgoing-tone',genre:'acoustic',energy:.30,seconds:110});
const bridgeTone = variant({id:'bridge-tone',genre:'acoustic',key:2,energy:.29,seconds:110});
const destinationTone = variant({id:'destination-tone',genre:'mystical',key:3,mode:'minor',energy:.28,seconds:110});
const bridgeLibrary = [outgoingTone,bridgeTone,destinationTone];
assert.equal(harmonicDistance(outgoingTone,destinationTone),6);
let tonalJourney = new SoundtrackQueue(bridgeLibrary,{played:[outgoingTone.id],last:outgoingTone.id,mode:'journey',chapter:'observatory',listened:0,chapterHeard:false,started:true},seeded(83));
assert.equal(tonalJourney.next(date(19)).id,bridgeTone.id,'a related-key bridge avoids jumping directly to the distant primary key');
tonalJourney.listen(bridgeTone.seconds);
tonalJourney = new SoundtrackQueue(bridgeLibrary,JSON.parse(JSON.stringify(tonalJourney.state)),seeded(84));
assert.equal(tonalJourney.next(date(19)).id,destinationTone.id,'the bridge leads to the defining mood rather than looping indefinitely');
assert.equal(tonalJourney.state.chapterHeard,true);
const noBridge = new SoundtrackQueue([outgoingTone,destinationTone],{played:[outgoingTone.id],last:outgoingTone.id,mode:'journey',chapter:'observatory',listened:0,chapterHeard:false,started:true},seeded(85));
assert.equal(noBridge.next(date(19)).id,destinationTone.id,'a small catalogue without a compatible bridge must remain usable');

// A one-off library choice or a temporary calm lock may leave any chapter at
// any song. Every return must still reach its defining mood through safe steps.
for (const chapter of SOUNDTRACK_CHAPTERS) for (const outgoing of SOUNDTRACK) for (let seed=1;seed<=4;seed++) {
  let returning = new SoundtrackQueue(SOUNDTRACK,{played:[outgoing.id],last:outgoing.id,mode:'journey',chapter:chapter.id,listened:0,chapterHeard:false,started:true},seeded(seed*123));
  let previous = outgoing, reached = false;
  for (let step=0;step<SOUNDTRACK.length;step++) {
    const song = returning.next(date(19));
    assert.notEqual(song.id,previous.id,'returning to a chapter avoids adjacent repeats');
    assert(song.energy-previous.energy<=.30001 && previous.energy-song.energy<=.35001,'returning to every chapter preserves energy steps');
    if (returning.state.chapterHeard) { reached = true; break; }
    returning.listen(song.seconds);
    returning = new SoundtrackQueue(SOUNDTRACK,JSON.parse(JSON.stringify(returning.state)),seeded(seed*123+step));
    previous = song;
  }
  assert(reached,`${chapter.id} must reach its defining genre after a manual ${outgoing.id} choice or genre lock`);
}

assert(SOUNDTRACK.every(song => Number.isInteger(song.key) && song.key >= 0 && song.key < 12 && song.textures.length && Number.isFinite(song.gainDb)), 'every piece has authored musical identity and measured playback trim');

// Expanded arcs must preserve the original seven saved chapter identities,
// including elapsed listening that has not yet earned a song-boundary turn.
for (const id of ['still-water','warm-tape','night-drive','neon-rise','petal-rush','afterglow','soft-landing']) {
  const saved = {played:['little-lights'],last:'little-lights',mode:'journey',chapter:id,listened:80,chapterHeard:true,started:true};
  const old = new SoundtrackQueue(SOUNDTRACK,saved,seeded(8));
  assert.equal(old.chapter.id,id); assert.equal(old.state.listened,80);
  old.next(date(1)); assert.equal(old.chapter.id,id,'crossing a wall-clock period cannot skip a preserved chapter');
  assert.equal(old.state.listened,80,'selection itself never invents listening time');
}
const removedChapter = new SoundtrackQueue(SOUNDTRACK,{played:['little-lights','removed-song'],last:'little-lights',mode:'bells',chapter:'removed-chapter',listened:900,chapterHeard:true,started:true},seeded(9));
assert.equal(removedChapter.mode,'bells');
assert.deepEqual(Array.from(removedChapter.state.played),['little-lights']);
assert.equal(removedChapter.state.listened,0,'an unknown old chapter cannot manufacture progress in the replacement arc');

// Locks pause an in-progress arc, survive reload, and return through an energy
// neighbor. They must not silently spend its remaining listening budget.
for (const mode of [...new Set(SOUNDTRACK.map(song => song.genre)), 'pads', 'bells']) {
  let locked = new SoundtrackQueue(SOUNDTRACK,undefined,seeded(401));
  locked.select('cassette-clouds',date(8)); locked.listen(63);
  const chapter = locked.chapter.id;
  assert.equal(locked.setMode(mode),true);
  const last = locked.next(date(19));
  locked.listen(last.seconds * 6);
  locked = new SoundtrackQueue(SOUNDTRACK,JSON.parse(JSON.stringify(locked.state)),seeded(402));
  assert.equal(locked.mode,mode); assert.equal(locked.chapter.id,chapter);
  assert.equal(locked.state.listened,63,`${mode} lock preserves the suspended journey budget`);
  assert.equal(locked.setMode('journey'),true);
  const next = locked.next(date(1));
  assert.notEqual(next.id,last.id,'returning from a lock never immediately replays the active recording');
  const step = next.energy-last.energy;
  assert(step<=.30001&&step>=-.35001,`${mode} returns through an energy neighbor`);
  assert.equal(locked.state.listened,63,'returning to the journey does not credit time spent in a lock');
}

// Inspect actual packaged recordings, independently of selection policy.
const hashes = new Set();
const mastered = JSON.parse(fs.readFileSync('src/assets/audio/library-mastering.json'));
assert.equal(mastered.tracks.length,SOUNDTRACK.length,'every packaged song has an encoded-master measurement');
for (const song of SOUNDTRACK) {
  const file = 'src/assets/audio/' + song.id + '.mp3';
  assert(fs.statSync(file).size > 500000, `${song.title} is a full-length encoded asset`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  hashes.add(hash);
  const measurement = mastered.tracks.find(row => row.id === song.id);
  assert(measurement && measurement.sha256 === hash,`${song.title} measurements match this exact MP3`);
  assert(Math.abs(measurement.seconds-song.seconds)<.03 && Math.abs(measurement.gainDb-song.gainDb)<.05,`${song.title} uses its measured duration and playback trim`);
  assert(measurement.finite && measurement.truePeakDbTP<=-2.7 && measurement.dcOffset<.002 && measurement.stereoCorrelation>-.1,`${song.title} preserves encoded headroom and stereo integrity`);
  assert(Math.abs(measurement.effectiveLUFS+20)<=.25 && measurement.truePeakDbTP+song.gainDb<=-2.49,`${song.title} matches playback loudness without exhausting peak headroom`);
  assert(measurement.leadingQuietSeconds<=.5 && measurement.trailingQuietSeconds<=.65,`${song.title} has no unwanted start or end gap`);
}
assert.equal(hashes.size, SOUNDTRACK.length, 'every recording is distinct');
const metrics = [...JSON.parse(fs.readFileSync('src/assets/audio/soundtrack-metrics.json')), ...JSON.parse(fs.readFileSync('src/assets/audio/genre-metrics.json')), ...JSON.parse(fs.readFileSync('src/assets/audio/story-metrics.json'))];
// Stem/arrangement crest factors differ. Encoded LUFS and actual playback trims
// above establish listening-level consistency without flattening the ambient mix.
assert(metrics.every(track => track.seconds >= 90 && track.peakDbFS <= -2.8 && Number.isFinite(track.rmsDbFS)));
console.log('PASS: 23 distinct songs across 11 listening-time chapters, library fairness, energy and harmonic bridges, relative/modal keys, half-time continuity, persistent genre and calm texture locks, old-history migration, manual selection, packaged assets and measured headroom.');
