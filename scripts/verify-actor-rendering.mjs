import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { transformWithOxc } from 'vite';

const source = file => fs.readFile(new URL(`../src/world/${file}`, import.meta.url), 'utf8');
async function moduleFrom(source, name) {
  const { code } = await transformWithOxc(source, name);
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
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
globalThis.document = { hidden: false };
globalThis.__actorGsap = { ticker: { frame: 1, fps() {}, deltaRatio: () => 8 } };
try {
  const budgetSource = (await source('budget.ts')).replace('import gsap from "gsap";', 'const gsap = globalThis.__actorGsap;');
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
} finally {
  globalThis.performance = realPerformance;
  delete globalThis.document;
  delete globalThis.__actorGsap;
}
console.log(`PASS: 20000 equivalent arm poses (max ${maxError.toExponential(2)} px error), route corners, bounded measured actor work, crowd fairness and hidden-document suspension`);
