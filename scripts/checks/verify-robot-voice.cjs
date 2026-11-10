const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const synths = [], silenced = [];
const gameSound = {
  active: true, time: 5,
  placement: el => el.far ? undefined : { mix: { gain: .6, pan: .2, lowpass: 12000 }, key: 'object:1' },
  silence: key => silenced.push(key),
  synth: (mix, owner, sources, build) => { synths.push({ mix, owner, sources, build }); return true; },
};
const brandFor = provider => /claude/i.test(provider || '') ? 'claude' : /gemini/i.test(provider || '') ? 'gemini' : 'codex';
const context = { gameSound, brandFor };
const source = fs.readFileSync('src/office/robot-voice.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nObject.assign(globalThis, { voiceFor, speechPlan, robotSay, voiceInternals });', context);
const { voiceFor, speechPlan, robotSay, voiceInternals } = context;

// Each robot keeps one voice; names, families and head sizes make them distinct.
const ada = voiceFor('Ada', 'claude'), again = voiceFor('Ada', 'claude');
assert.equal(JSON.stringify(ada), JSON.stringify(again), 'the same robot always has the same voice');
assert.notEqual(voiceFor('Bolt', 'claude').pitch, ada.pitch, 'different robots of one family sound different');
assert.notEqual(voiceFor('Ada', 'codex').wave, ada.wave, 'harness families have their own timbre');
assert(voiceFor('Ada', 'claude', 1.15).pitch < voiceFor('Ada', 'claude', .9).pitch, 'a bigger head speaks lower');
for (const brand of Object.keys(voiceInternals.FAMILIES)) {
  const v = voiceFor('Probe', brand);
  assert(v.pitch > 60 && v.pitch < 420 && v.rate >= 9 && v.rate <= 15, brand + ' voice stays in a friendly range');
}

// Lines become timed syllables that follow the letters.
const hello = speechPlan('Hello there, sunshine! Tests pass.', ada);
assert(hello.syllables.length >= 4, 'each syllable sounds');
assert(hello.syllables.some(s => s.consonant && s.consonant.band > 6000), 'an s makes a bright hiss');
assert(hello.syllables.some(s => s.consonant && s.consonant.band === 1900), 'th is breathy, not a hard t');
assert(hello.syllables.some(s => s.coda && s.coda.band > 6000), 'word endings like "pass" keep their hiss');
// Each syllable's span runs from its opening consonant to the end of its closing one.
const spans = hello.syllables.map(s => [s.at - (s.consonant ? s.consonant.dur * .6 : 0), Math.max(s.at + s.dur, s.coda ? s.at + s.dur * .7 + s.coda.dur : 0)]);
for (let i = 1; i < spans.length; i++) assert(spans[i][0] >= spans[i - 1][1] - 1e-9, 'syllables and their consonants never overlap in time');
const vowelsA = speechPlan('ba', ada).syllables[0], vowelsI = speechPlan('bi', ada).syllables[0];
assert(vowelsI.f2 > vowelsA.f2 && vowelsI.f1 < vowelsA.f1, 'vowel letters set the formant color');
assert.equal(speechPlan('code code', ada).syllables[0].pitch.toFixed(3), speechPlan('code', ada).syllables[0].pitch.toFixed(3), 'a word always lands on the same note');
const statement = speechPlan('You are done', ada), question = speechPlan('You are done?', ada);
assert(question.syllables.at(-1).pitch > statement.syllables.at(-1).pitch * 1.25, 'questions rise at the end');
const shout = speechPlan('You are done!', ada);
assert(shout.syllables[0].gain > statement.syllables[0].gain, 'exclamations are louder');
assert.equal(speechPlan('', ada).syllables.length, 0); assert.equal(speechPlan('   ...  ', ada).syllables.length, 0, 'punctuation alone stays silent');
const long = speechPlan('This is a very long line that keeps going and going far beyond what a quick robot remark would ever need to say out loud in the office', ada);
assert(long.syllables.length <= 30 && long.length < 3.2, 'long lines are spoken as a short burst, never a monologue');
assert(speechPlan('こんにちは', ada).syllables.length === 5, 'non-Latin scripts still babble, one blip per character');
assert(speechPlan('hmm', ada).syllables[0].nasal, 'a consonant-only word is a hum');

// Live speaking: gated by the camera, bounded, and robots interrupt themselves.
const el = (far = false, culled = false) => ({ isConnected: true, far, closest: sel => sel === '.culled' ? (culled ? {} : null) : {} });
assert.equal(robotSay({ el: el(true), seed: 'Far' }, 'Hello'), false, 'a robot outside the listening range stays quiet');
assert.equal(robotSay({ el: el(), seed: 'Ada', provider: 'claude' }, 'Hello there, sunshine!'), true);
assert.equal(synths.at(-1).owner, 'voice:Ada'); assert.equal(synths.at(-1).sources, 3, 'warm voices skip ring modulation');
assert.equal(robotSay({ el: el(true, false), seed: 'Far' }, 'x') || robotSay({ el: el(false, true), seed: 'Hidden' }, 'Hello'), false, 'robots in a culled room stay quiet');
assert.equal(robotSay({ el: el(), seed: 'Ada', provider: 'claude' }, 'Again'), false, 'a robot cannot restart its voice instantly');
gameSound.time += .4;
assert.equal(robotSay({ el: el(), seed: 'Ada', provider: 'claude' }, 'Wait, one more thing'), true);
assert(silenced.includes('voice:Ada'), 'a new line from the same robot cuts its previous one');
robotSay({ el: el(), seed: 'Bolt', provider: 'codex' }, 'Ping'); assert.equal(synths.at(-1).sources, 4, 'metallic voices add a ring modulator');
robotSay({ el: el(), seed: 'Cy', provider: 'gemini' }, 'Hi');
assert.equal(robotSay({ el: el(), seed: 'Dot' }, 'Me too'), false, 'only three robots talk at once');
gameSound.time += 10; assert.equal(robotSay({ el: el(), seed: 'Dot' }, 'Me too'), true, 'finished voices free their slot');
for (const seed of ['F1', 'F2', 'F3', 'F4', 'F5']) { gameSound.time += 3; robotSay({ el: el(), seed }, 'Hi'); }
const burst = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].map(seed => { gameSound.time += .45; return robotSay({ el: el(), seed }, 'Hi'); });
assert(burst.includes(false), 'the office starts only a few voices per window');
gameSound.active = false; assert.equal(robotSay({ el: el(), seed: 'Eve' }, 'Hello'), false, 'muted or locked audio schedules nothing');

// The voice graph schedules monotonic envelopes and starts and stops every source.
class Param {
  constructor() { this.events = []; this.value = 0; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); }
  setTargetAtTime(v, t) { this.events.push(['target', v, t]); }
}
class FakeNode {
  constructor(kind) { this.kind = kind; this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.out = []; }
  connect(n) { this.out.push(n); return n; }
  start(t) { this.started = t; } stop(t) { this.stopped = t; }
}
const ctx = { currentTime: 1, nodes: [], make(kind) { const n = new FakeNode(kind); this.nodes.push(n); return n; },
  createOscillator() { return this.make('osc'); }, createGain() { return this.make('gain'); }, createBiquadFilter() { return this.make('filter'); }, createBufferSource() { return this.make('noise'); } };
const input = new FakeNode('input');
const bolt = voiceFor('Bolt', 'codex');
const sources = voiceInternals.renderPlan(ctx, input, {}, speechPlan('Tests pass. Shipping it?', bolt), bolt);
assert.equal(sources.length, 4); assert(sources.every(s => s.started >= 1 && s.stopped > s.started), 'every voice source starts and stops');
const envelopes = ctx.nodes.filter(n => n.kind === 'gain' && n.gain.events.length > 4);
assert(envelopes.length >= 2, 'vowel and consonant envelopes are automated');
for (const env of envelopes) {
  const times = env.gain.events.map(e => e[2]);
  for (let i = 1; i < times.length; i++) assert(times[i] >= times[i - 1] - 1e-9, 'envelope automation stays in time order');
  assert(env.gain.events.every(e => e[1] >= 0 && e[1] <= .3), 'syllable levels stay modest');
}
console.log('PASS: stable per-robot voices by name, family and head size; letter-driven vowels, hiss and melody; rising questions, louder exclamations, short bursts for long lines, non-Latin babble; camera gating, self-interruption, three-voice limit, mute safety, culled rooms, per-robot and office rate limits; ordered envelopes and full source lifecycle.');
