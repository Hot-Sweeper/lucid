import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { transformWithOxc } from 'vite';

const source = file => fs.readFile(new URL(`../src/world/${file}`, import.meta.url), 'utf8');
let moduleSerial = 0;
async function moduleFrom(source, name) {
  const { code } = await transformWithOxc(source, name);
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64') + '#' + moduleSerial++);
}

// Use an independent angle-based triangle as the reference for the vector solver.
function referenceArm(s, t, upper, fore, out, stretch = 1.25, down = .35, memo) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || .001;
  const k = clamp(d / (upper + fore - .5), 1, stretch);
  let U = upper * k, F = fore * k;
  const M = U + F - .5;
  if (d > M) { t = { x: s.x + dx / d * M, y: s.y + dy / d * M }; dx = t.x - s.x; dy = t.y - s.y; d = M; }
  const minimum = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(40 * Math.PI / 180));
  if (d < minimum) { const f = Math.max(.35, d / minimum); U *= f; F *= f; }
  const angle = Math.atan2(dy, dx), elbow = Math.acos(clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1));
  const e1 = { x: s.x + U * Math.cos(angle + elbow), y: s.y + U * Math.sin(angle + elbow) };
  const e2 = { x: s.x + U * Math.cos(angle - elbow), y: s.y + U * Math.sin(angle - elbow) };
  const score = p => (p.x - s.x) * out + (p.y - s.y) * down, diff = score(e1) - score(e2);
  if (!memo) return { e: diff > 0 ? e1 : e2, t };
  const margin = (upper + fore) * .12;
  if (memo.side == null || (memo.side === 1 ? diff < -margin : diff > margin)) memo.side = diff > 0 ? 1 : -1;
  return { e: memo.side === 1 ? e1 : e2, t };
}
const armSource = await source('seated-parts.ts');
const armStart = armSource.indexOf('export type ArmMemo');
const { solveArm } = await moduleFrom('type Pt = { x:number; y:number }; const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));\n' + armSource.slice(armStart), 'arm.ts');
let maxError = 0;
const previous = {}, current = {};
for (let i = 0; i < 20000; i++) {
  const s = { x: 199.5, y: 210 }, angle = i * .127, distance = i % 199;
  const t = { x: s.x + Math.cos(angle) * distance, y: s.y + Math.sin(angle) * distance };
  const args = [s, t, 17.64 + i % 11, 67.2, i % 2 ? 1 : -1, 1.25, Math.sin(i * .025)];
  const expected = referenceArm(...args, previous), actual = solveArm(...args, current);
  const error = Math.hypot(actual.e.x - expected.e.x, actual.e.y - expected.e.y);
  maxError = Math.max(maxError, error);
  assert.ok(error < 1e-7, `elbow mismatch at pose ${i}: ${error}`);
  assert.deepEqual(actual.t, expected.t, 'hand contacts must be unchanged');
  assert.equal(current.side, previous.side, 'elbow hysteresis must be unchanged');
}

const { routeSuffixLengths } = await moduleFrom(await source('route-distance.ts'), 'route-distance.ts');
for (const count of [0, 1, 3, 50, 500]) {
  const points = Array.from({ length: count }, (_, i) => ({ x: Math.sin(i * .8) * 200, y: i * 17 }));
  const tails = routeSuffixLengths(points);
  assert.equal(tails.length, count);
  for (let i = 0; i < count; i++) {
    let expected = 0;
    for (let j = i + 1; j < count; j++) expected += Math.hypot(points[j].x - points[j - 1].x, points[j].y - points[j - 1].y);
    assert.ok(Math.abs(tails[i] - expected) < 1e-8, 'stop distance must survive every route corner');
  }
}

let clock = 0;
const realPerformance = globalThis.performance;
globalThis.performance = { now: () => clock };
const listeners = new Map(), tickerRates = [];
globalThis.document = { hidden: false, addEventListener: (event, callback) => listeners.set(event, callback) };
globalThis.__actorGsap = { ticker: { frame: 1, fps: rate => tickerRates.push(rate), deltaRatio: () => 8 } };
try {
  const diagnosticSource = (await fs.readFile(new URL('../src/perf/diagnostics.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const budgetSource = (diagnosticSource + '\n' + (await source('budget.ts')).replace('import { diagnosticOff } from "../perf/diagnostics";', '')).replace('import gsap from "gsap";', 'const gsap = globalThis.__actorGsap;');
  const { drawNow, finishDraw, setZoom, unwatch } = await moduleFrom(budgetSource, 'budget.ts');
  setZoom(1);
  const actors = Array.from({ length: 40 }, () => ({ owner: {}, el: {}, draws: 0 }));
  let firstTick = 0;
  for (let tick = 1; tick <= 120; tick++) {
    globalThis.__actorGsap.ticker.frame = tick;
    for (const actor of actors) {
      if (!drawNow(actor.owner, actor.el, tick * 1000 / 60)) continue;
      actor.draws++; if (tick === 1) firstTick++;
      clock += .04; finishDraw();
    }
  }
  assert.equal(firstTick, 8, 'one slow tick must not impose a second of three-body animation');
  assert.ok(actors.every(actor => actor.draws >= 22), 'large visible crowds must all continue drawing');
  assert.ok(Math.max(...actors.map(actor => actor.draws)) <= Math.min(...actors.map(actor => actor.draws)) * 4 / 3,
    'callback order must not let early actors draw twice as often as the rest');
  actors.forEach(actor => unwatch(actor.el));
  globalThis.__actorGsap.ticker.frame++;
  const costly = Array.from({ length: 10 }, () => ({ owner: {}, el: {} }));
  let drawn = 0;
  for (const actor of costly) {
    if (!drawNow(actor.owner, actor.el, 2500)) continue;
    drawn++; clock += 1.05; finishDraw();
  }
  assert.equal(drawn, 2, 'expensive bodies must yield when the real 2 ms frame budget is consumed');
  costly.forEach(actor => unwatch(actor.el));
  globalThis.document.hidden = true;
  assert.equal(drawNow({}, {}, 3000), false, 'hidden documents must not draw');
  listeners.get('visibilitychange')();
  assert.equal(tickerRates.at(-1), 60, 'Hidden GSAP logic retains its existing 60 Hz ceiling');
  globalThis.document.hidden = false; listeners.get('visibilitychange')();
  assert.equal(tickerRates.at(-1), 240, 'Visible GSAP follows the display using its default 240 Hz ceiling');

  for (const refresh of [60, 120, 144, 240]) {
    for (const [scale, fps] of [[1, 60], [.65, 30], [.4, 20], [.2, 12]]) {
      const budget = await moduleFrom(budgetSource, 'budget.ts');
      budget.setZoom(scale);
      const solo = { owner: {}, el: {}, draws: 0 };
      for (let n = 0; n < refresh * 2; n++) {
        const now = n * 1000 / refresh;
        if (budget.drawNow(solo.owner, solo.el, now)) { solo.draws++; clock += .01; budget.finishDraw(); }
      }
      assert.ok(Math.abs(solo.draws - fps * 2) <= 1, `${refresh} Hz display must keep the ${fps} Hz body tier, got ${solo.draws} draws`);
      budget.unwatch(solo.el);

      const crowd = Array.from({ length: 40 }, () => ({ owner: {}, el: {}, draws: 0 })), epochs = new Map();
      for (let n = 0; n < refresh * 2; n++) {
        const now = 3000 + n * 1000 / refresh, epoch = Math.floor((now + .001) * 60 / 1000);
        for (const actor of crowd) {
          if (!budget.drawNow(actor.owner, actor.el, now)) continue;
          actor.draws++; epochs.set(epoch, (epochs.get(epoch) ?? 0) + 1); clock += .04; budget.finishDraw();
        }
      }
      assert.ok([...epochs.values()].every(draws => draws <= 8), `${refresh} Hz must retain at most eight body paints per 60 Hz interval`);
      const counts = crowd.map(actor => actor.draws), min = Math.min(...counts), max = Math.max(...counts);
      assert.ok(min >= 20, `${refresh} Hz crowd at ${fps} Hz must keep every actor live, min ${min}`);
      assert.ok(max <= min * 4 / 3, `${refresh} Hz callback ordering at ${fps} body Hz must remain fair, ${min}..${max}`);
      for (const actor of crowd) budget.unwatch(actor.el);

      const spring = {}, el = {};
      assert.equal(budget.sinceDraw(spring, 7000), 1 / 60);
      assert.equal(budget.drawNow(spring, el, 7000), true); budget.finishDraw();
      globalThis.document.hidden = true;
      for (let n = 1; n <= refresh; n++) assert.equal(budget.drawNow(spring, el, 7000 + n * 1000 / refresh), false);
      assert.equal(budget.sinceDraw(spring, 9000), .05, 'Hidden time cannot destabilize body springs');
      globalThis.document.hidden = false;
      assert.equal(budget.drawNow(spring, el, 9000), true, 'Returning actors resume without replaying hidden draws');
      budget.finishDraw(); budget.unwatch(el);
    }
    const expensiveBudget = await moduleFrom(budgetSource, 'budget.ts');
    expensiveBudget.setZoom(1);
    const expensive = Array.from({ length: 10 }, () => ({ owner: {}, el: {} })), measuredEpochs = new Map();
    for (let n = 0; n < refresh; n++) {
      const now = n * 1000 / refresh, epoch = Math.floor((now + .001) * 60 / 1000);
      for (const actor of expensive) {
        if (!expensiveBudget.drawNow(actor.owner, actor.el, now)) continue;
        measuredEpochs.set(epoch, (measuredEpochs.get(epoch) ?? 0) + 1);
        clock += 1.05; expensiveBudget.finishDraw();
      }
    }
    assert.ok([...measuredEpochs.values()].every(count => count <= 2), `${refresh} Hz display ticks must share the same measured 2 ms budget`);
    expensive.forEach(actor => expensiveBudget.unwatch(actor.el));
  }

  // Exercise the actual follow callback with a stationary actor and equal elapsed time.
  const world = await fs.readFile(new URL('../src/office/world.ts', import.meta.url), 'utf8');
  const followSource = 'const callback = ' + world.split('private followTick = ')[1].split('\n  follow(el:')[0];
  const followCode = (await transformWithOxc(followSource, 'follow.ts')).code;
  const makeFollow = new Function('document', `${followCode};return callback`);
  const runFollow = (refresh, zoom = 1, ticks = refresh) => {
    const camera = { x: 0, y: 0, s: zoom };
    let commits = 0, reads = 0;
    const state = {
      cam: camera, panelWidth: 0, sceneBox: { left: 0, top: 0 },
      scene: { clientWidth: 1200, clientHeight: 800 }, apply() { commits++; },
      followEl: { isConnected: true, getBoundingClientRect() { reads++; return { left: 1000 * camera.s + camera.x - 40, top: 800 * camera.s + camera.y - 40, width: 80, height: 80 }; } },
    };
    const follow = makeFollow.call(state, globalThis.document);
    for (let n = 0; n < ticks; n++) follow(n / refresh, 1000 / refresh);
    const before = { ...camera }, priorReads = reads;
    globalThis.document.hidden = true; follow(2, 1000); globalThis.document.hidden = false;
    assert.deepEqual(camera, before, 'Hidden following must leave cosmetic camera work suspended');
    assert.equal(reads, priorReads, 'Hidden following must not read geometry');
    assert.equal(commits, ticks, 'Visible following responds once per display tick');
    return camera;
  };
  const reference = runFollow(60);
  for (const refresh of [120, 144, 240]) {
    const camera = runFollow(refresh);
    assert.ok(Math.abs(camera.x - reference.x) < 1e-7 && Math.abs(camera.y - reference.y) < 1e-7,
      `${refresh} Hz following must preserve the original 60 Hz response over equal elapsed time`);
  }
  for (const refresh of [60, 120, 144, 240]) {
    const camera = runFollow(refresh, .6);
    assert.ok(camera.s > .88 && camera.s <= .9, 'Follow zoom converges without accelerating on high-refresh displays');
  }
  const delayed = runFollow(1, 1, 1), threeTicks = runFollow(60, 1, 3);
  assert.ok(Math.abs(delayed.x - threeTicks.x) < 1e-7 && Math.abs(delayed.y - threeTicks.y) < 1e-7,
    'A long visible frame catches up by at most three original follow steps');
} finally {
  globalThis.performance = realPerformance;
  delete globalThis.document;
  delete globalThis.__actorGsap;
}
console.log(`PASS: 20000 equivalent arm poses (max ${maxError.toExponential(2)} px error), route corners, 60/120/144/240 Hz body budgets and fairness, hidden spring safety, display-rate following with original response, and hidden-document suspension`);
