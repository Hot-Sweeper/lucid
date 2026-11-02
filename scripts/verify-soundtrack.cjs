const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = {};
require('./audio-fixture.cjs').soundtrackFixture(context);
vm.runInNewContext('globalThis.api={SoundtrackQueue,soundtrackPeriod,SOUNDTRACK};', context);
const { SoundtrackQueue, soundtrackPeriod, SOUNDTRACK } = context.api;
const date = hour => new Date(2026, 10, 2, hour);
for (const [hour, period] of [[0,'night'],[5,'night'],[6,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[21,'evening'],[22,'night'],[23,'night']]) assert.equal(soundtrackPeriod(date(hour)), period);
let seed = 123456;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
let queue = new SoundtrackQueue(SOUNDTRACK, undefined, random);
let previous;
for (let cycle = 0; cycle < 20; cycle++) {
  const played = [];
  for (let i = 0; i < SOUNDTRACK.length; i++) {
    const song = queue.next(date((cycle*3+i)%24));
    assert.notEqual(song.id, previous, 'cycle boundaries do not immediately replay the last song');
    previous = song.id; played.push(song.id);
    // Reconstruct from persisted state midway through every playlist cycle.
    if (i === 3) queue = new SoundtrackQueue(SOUNDTRACK, JSON.parse(JSON.stringify(queue.state)), random);
  }
  assert.equal(new Set(played).size, SOUNDTRACK.length, 'hear the entire library before a repeat, even across reloads');
}
// Compare first-song frequency across new sessions, without shuffle-bag history.
for (const [hour, period] of [[8,'morning'],[14,'day'],[19,'evening'],[1,'night']]) {
  let matches = 0;
  for (let i = 0; i < 1000; i++) if (new SoundtrackQueue(SOUNDTRACK, undefined, random).next(date(hour)).period === period) matches++;
  assert(matches > 430, `${period} favorites must be preferred over a uniform 2/9 share`);
}
const invalid = new SoundtrackQueue(SOUNDTRACK, { played: ['removed-song', null], last: 'removed-song' }, random);
assert.equal(invalid.state.played.length, 0);
assert(SOUNDTRACK.some(song => song.id === invalid.next().id));
assert.equal(SOUNDTRACK.length, 9);
const hashes = new Set();
for (const song of SOUNDTRACK) {
  const file = 'src/assets/audio/' + song.id + '.mp3';
  assert(fs.statSync(file).size > 500000, `${song.title} is a real full-length encoded asset`);
  hashes.add(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
}
assert.equal(hashes.size, 9, 'nine distinct recordings are shipped');
const metrics = JSON.parse(fs.readFileSync('src/assets/audio/soundtrack-metrics.json'));
assert(metrics.every(track => track.seconds >= 90 && track.peakDbFS <= -2.8 && track.rmsDbFS >= -22 && track.rmsDbFS <= -19));
console.log('PASS: nine distinct songs, full-library shuffle, no adjacent repeats, persisted history, all day-period boundaries and preferences, packaged assets and digital headroom.');
