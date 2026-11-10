// The robots' line system (src/lines): authored English and German base lines, event lines
// that only state the facts they were given, real test-run parsing, T3 snapshot events, and
// a memory that keeps robots from repeating themselves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const load = (file) => fs.readFileSync(file, 'utf8')
  .replace(/^import[^;]+;$/gm, '').replace(/^export (type )?\{[^}]*\} from [^;]+;$/gm, '').replace(/^export /gm, '');
const code = ['src/lines/catalog.ts', 'src/lines/memory.ts', 'src/lines/events.ts', 'src/lines/index.ts', 'src/lines/thread-events.ts'].map(load).join('\n');
const store = new Map();
let locale = 'en', pack = null;
const ctx = {
  getLocale: () => locale, localizedFlavor: (x) => x, dailyPack: () => pack, dailyKey: (t) => t,
  CONVOS: [{ lines: ['Scene A', 'Reply A'] }, { lines: ['Scene B', 'Reply B'] }],
  THOUGHTS: [{ text: 'Window one', place: 'window' }, { text: 'Window two', place: 'window' }, { text: 'Anywhere one' }, { text: 'Anywhere two' }, { text: 'Anywhere three' }],
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  setTimeout: (fn) => { fn(); return 0; }, document: { hidden: false }, Date, Math, JSON, Map, Set, Number, String, Object, Array, RegExp,
};
vm.runInNewContext(stripTypeScriptTypes(code, { mode: 'transform' }) + '\nObject.assign(globalThis, { BASE, JOKES, SMALL_TALK, authoredLine, LineMemory, lineId, eventCandidates, testOutcome, duration, line, eventLine, joke, smallTalk, musing, conversation, setPersonaSource, threadFacts });', ctx);
const { BASE, JOKES, SMALL_TALK, authoredLine, LineMemory, lineId, eventCandidates, testOutcome, line, eventLine, joke, smallTalk, musing, setPersonaSource, threadFacts } = ctx;

// 1. Every base line is authored in both languages, with matching slots and no dash punctuation.
const dash = /[–—]/;
const slotsOf = (t) => (t.match(/\{\w+\}/g) || []).sort().join();
for (const [kind, pairs] of Object.entries(BASE)) {
  assert(pairs.length >= 1, `${kind} has lines`);
  if (pairs.filter((p) => !p[2]).length < 2) assert(['printing'].includes(kind), `${kind} offers variety`);
  for (const [en, de, hobbies] of pairs) {
    assert(en.trim() && de.trim(), `${kind}: both languages are written`);
    assert(!dash.test(en) && !dash.test(de), `${kind}: no em or en dashes`);
    assert.equal(slotsOf(en), slotsOf(de), `${kind}: German keeps the same slots`);
    if (hobbies) assert(hobbies.every((h) => ['gamer', 'musician', 'chatter', 'watcher', 'chiller'].includes(h)), `${kind}: known hobbies`);
  }
}
for (const [en, de] of [...JOKES, ...SMALL_TALK]) { assert.equal(en.length, 2); assert.equal(de.length, 2); assert(![...en, ...de].some((l) => dash.test(l))); }
assert.equal(authoredLine('Put me down!', 'de'), 'Lass mich runter!');
assert.equal(authoredLine('Lass mich runter!', 'en'), 'Put me down!');
assert.equal(authoredLine('Lass mich runter!', 'de'), 'Lass mich runter!');
assert.equal(authoredLine('Not authored', 'de'), null);
locale = 'de';
const deGrab = line('grab', 'Ada'); assert(BASE.grab.some((p) => p[1] === deGrab), 'German speakers get the authored German line');
const deJoke = joke(); assert(JOKES.some((j) => j[1][0] === deJoke[0] && j[1][1] === deJoke[1]), "German jokes keep their authored pairs");
locale = 'en';

// 2. Memory: a robot never repeats its own recent lines; the office avoids its recent half.
const mem = new LineMemory(null, () => 0.5);
const pool = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, value: i }));
const adaSaid = Array.from({ length: 10 }, () => mem.pick(pool, 'Ada'));
assert.equal(new Set(adaSaid).size, 10, 'one robot goes through a whole pool before repeating');
const office = new LineMemory(null, Math.random);
for (let round = 0; round < 50; round++) {
  const said = [];
  for (const who of ['A', 'B', 'C', 'D']) said.push(office.pick(pool, who));
  const recentHalf = new Set(said);
  assert.equal(recentHalf.size, said.length, 'robots talking in turn never echo each other');
}
const small = new LineMemory(null, Math.random);
const two = [{ id: 'x', value: 'x' }, { id: 'y', value: 'y' }];
let last = null;
for (let i = 0; i < 20; i++) { const v = small.pick(two); assert.notEqual(v, last, 'even a two-line pool alternates'); last = v; }
const saved = new Map();
const persisted = new LineMemory({ getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) });
persisted.use('abc', 'Bolt');
setTimeout(() => {
  const restored = new LineMemory({ getItem: (k) => saved.get(k) ?? null, setItem() {} });
  assert.equal(restored.recent('Bolt').join(), 'abc', 'recent lines survive a restart');
  console.log('PASS: robot lines: authored EN/DE base set with matching slots, hobby lines, no repeats per robot or across the office, persisted memory, fact-only event lines, real test parsing, snapshot events, daily pack layer.');
}, 1600);
assert.equal(lineId('Hi'), lineId('Hi')); assert.notEqual(lineId('Hi'), lineId('Hello'));
// Through the public API too, with the shared memory.
const said = new Set(Array.from({ length: BASE.poke.length }, () => line('poke', 'Pip')));
assert.equal(said.size, BASE.poke.length, 'line() deals a robot fresh lines');

// 3. Personality: hobby lines only reach robots with that hobby.
setPersonaSource((name) => (name === 'Gamer' ? 'gamer' : name === 'Chill' ? 'chiller' : null));
const gamerLines = new Set(Array.from({ length: 40 }, () => line('coffee', 'Gamer')));
const tagged = (hobby) => BASE.coffee.filter((p) => p[2]?.includes(hobby)).map((p) => p[0]);
assert(tagged('gamer').some((l) => gamerLines.has(l)), 'a gamer says gamer lines');
assert(!tagged('chiller').some((l) => gamerLines.has(l)), 'a gamer never says another hobby\'s lines');
const plain = new Set(Array.from({ length: 30 }, () => line('coffee', 'Nobody')));
assert(![...plain].some((l) => BASE.coffee.find((p) => p[0] === l)?.[2]), 'robots without a hobby keep to the shared lines');

// 4. Event lines state only the facts they were given.
const digits = (s) => (s.match(/\d+/g) || []).join(',');
for (const language of ['en', 'de']) {
  const finished = eventCandidates({ kind: 'finished', title: 'Fix login' }, language);
  assert(finished.length && finished.every((c) => c.text.includes('Fix login') && !/\d/.test(c.text)), 'no duration is claimed without one');
  const timed = eventCandidates({ kind: 'finished', title: 'Fix login', minutes: 47 }, language);
  assert(timed.some((c) => /47/.test(c.text)) && timed.every((c) => !/\d/.test(c.text.replace('47', ''))), 'only the measured minutes appear');
  const pass = eventCandidates({ kind: 'tests', exit: 0, passed: 11, failed: 0 }, language);
  assert(pass.length && pass.every((c) => digits(c.text).split(',').every((d) => ['11', '0'].includes(d))), 'test lines quote the parsed counts');
  assert(pass.every((c) => !/fail|fehlgeschlagen/i.test(c.text) || /none failed|keiner fehlgeschlagen/.test(c.text)), 'a passing run never sounds failed');
  const fail = eventCandidates({ kind: 'tests', exit: 1, passed: 9, failed: 2 }, language);
  assert(fail.length && fail.every((c) => /2/.test(c.text) && !/All green|Alles grün|Tests pass|Tests grün/.test(c.text)), 'a failing run never sounds green');
  const bare = eventCandidates({ kind: 'tests', exit: 3 }, language);
  assert(bare.length && bare.every((c) => digits(c.text) === '3'), 'without counts, only the exit code is quoted');
  const barePass = eventCandidates({ kind: 'tests', exit: 0 }, language);
  assert(barePass.length && barePass.every((c) => !/\d/.test(c.text)), 'a bare pass invents no counts');
  assert.equal(eventCandidates({ kind: 'longRun', title: '' , minutes: 40 }, language).length, 0, 'no title, no line about it');
  const long = eventCandidates({ kind: 'longRun', title: 'Port', minutes: 75 }, language);
  assert(long.every((c) => /1 (hour|Stunde) 15/.test(c.text)), 'durations are formatted from the real minutes');
  assert(eventCandidates({ kind: 'answered', answer: 'Use the blue one' }, language).every((c) => c.text.includes('Use the blue one')));
  for (const c of [...finished, ...timed, ...pass, ...fail, ...bare, ...long]) assert(!dash.test(c.text));
}
locale = 'de';
assert(/„Fix login“/.test(eventLine({ kind: 'question', title: 'Fix login' }, 'Ada')), 'German event lines quote titles in German style');
assert.equal(authoredLine(eventLine({ kind: 'reviewed' }, 'Ada'), 'en'), 'Review complete.', 'generated event lines can switch language later');
locale = 'en';

// 5. Real test output parsing: commands and runner summaries, never guesses.
assert.equal(testOutcome('ls -la', '3 passed', 0), null, 'not a test command');
assert.equal(testOutcome('npm test', '11 passed', null), null, 'no exit code, no claim');
assert.deepEqual({ ...testOutcome('npx vitest run', ' Test Files  1 passed (1)\n      Tests  11 passed (11)\n', 0) }, { kind: 'tests', exit: 0, passed: 11 });
assert.deepEqual({ ...testOutcome('npm test', 'Tests:       2 failed, 9 passed, 11 total', 1) }, { kind: 'tests', exit: 1, passed: 9, failed: 2 });
assert.deepEqual({ ...testOutcome('pytest -q', '=== 9 passed, 2 failed in 0.31s ===', 1) }, { kind: 'tests', exit: 1, passed: 9, failed: 2 });
assert.deepEqual({ ...testOutcome('cargo test', 'test result: ok. 14 passed; 0 failed; 0 ignored', 0) }, { kind: 'tests', exit: 0, passed: 14, failed: 0 });
assert.deepEqual({ ...testOutcome('node --test', '# pass 5\n# fail 0', 0) }, { kind: 'tests', exit: 0, passed: 5, failed: 0 });
assert.deepEqual({ ...testOutcome('go test ./...', 'ok  example.com/pkg 0.2s', 0) }, { kind: 'tests', exit: 0 });

// 6. T3 snapshots: only real transitions, nothing on first sight, long runs once per mark.
const marks = new Map(), now = Date.parse('2026-11-10T12:00:00Z');
const t = (o) => ({ id: 't1', title: 'Fix login', runStatus: 'running', question: null, settled: false, updatedAt: '2026-11-10T11:59:00Z', runStartedAt: '2026-11-10T11:10:00Z', ...o });
assert.equal(threadFacts(undefined, t({}), now, marks).length, 0, 'the first sighting of a long run is silent');
const prev = { run: 'running', question: false, settled: false, startedAt: '2026-11-10T11:10:00Z' };
assert.equal(threadFacts(prev, t({}), now, marks).length, 0, 'the same mark is not announced twice');
const later = threadFacts(prev, t({}), Date.parse('2026-11-10T12:11:00Z'), marks);
assert.equal(later[0]?.kind, 'longRun'); assert.equal(Math.round(later[0].minutes), 61);
const done = threadFacts(prev, t({ runStatus: 'completed', updatedAt: '2026-11-10T11:55:00Z' }), now, new Map());
assert.equal(done[0].kind, 'finished'); assert.equal(Math.round(done[0].minutes), 45, 'duration comes from the run start and completion time');
assert.equal(threadFacts(prev, t({ runStatus: 'interrupted' }), now, new Map())[0].kind, 'stopped');
assert.equal(threadFacts(prev, t({ question: 'Which file?' }), now, new Map()).some((f) => f.kind === 'question'), true);
assert.equal(threadFacts({ ...prev, run: 'completed' }, t({ runStatus: 'completed', settled: true }), now, new Map())[0].kind, 'settled');
assert.equal(threadFacts({ ...prev, run: 'completed' }, t({ runStatus: 'completed' }), now, new Map()).length, 0, 'an idle thread says nothing');

// 7. The daily pack layer: a robot's own lines and the office news, picked without repeats.
pack = { robots: { Ada: ['Ada one', 'Ada two'] }, ceo: ['CEO line'], gossip: [], event: { name: 'Robo Fair' }, trending: [] };
const daily = new Set();
for (let i = 0; i < 200; i++) { const m = musing('Ada'); if (m.spoken) daily.add(m.text); }
assert(daily.has('Ada one') && daily.has('Ada two'), 'a robot says its own daily lines');
assert([...daily].some((l) => l.includes('Robo Fair')), 'today\'s event reaches the office talk');
assert(!musing('Nobody').text.startsWith('Ada'), 'robots never borrow another robot\'s own lines');
pack = null;
assert.equal(musing('Ada').spoken, false, 'without a pack, robots fall back to thoughts');
assert.equal(smallTalk('Ada').length, 2);

// 8. The headless writer's pack never repeats a line between robots or sections.
const { parsePack } = require('../../electron/daily-writer.cjs');
const written = parsePack(JSON.stringify({ robots: { ada: ['Same line!', 'Own line'], bolt: ['same line', 'Bolt line'] }, ceo: ['Own line.', 'CEO line'], gossip: [] }), ['Ada', 'Bolt']);
assert.deepEqual(written.robots, { Ada: ['Same line!', 'Own line'], Bolt: ['Bolt line'] });
assert.deepEqual(written.ceo, ['CEO line']);
