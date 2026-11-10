const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
class Element {
  classList = { toggle() {} }; children = [];
  append(...children) { this.children.push(...children); }
  addEventListener() {} removeEventListener() {} setAttribute() {} removeAttribute() {} remove() {}
}
const context = { document: { hidden: false, createElement: () => new Element(), addEventListener() {}, removeEventListener() {} }, window: { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} }, gameSound: { play() {} } };
const source = fs.readFileSync('src/office/coin-rewards.ts', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }) + '\nglobalThis.Controller=CoinRewards;', context);
context.Controller.prototype.render = () => {};
async function main() {
  let reads = 0, resolve, observed = 0, holds = [];
  const wallet = { rewards: [], observe() { observed++; }, observeSources() { this.rewards = [{ id: 'worker', amount: 2 }]; } };
  const world = { scene: new Element(), desks: new Map([['worker', {}]]), lastData: { threads: [] }, setCoinHolds(ids) { holds = [...ids]; return true; }, update() {} };
  const controller = new context.Controller(wallet, world, () => { reads++; return new Promise(r => { resolve = r; }); });
  const first = controller.refresh(); assert.equal(first, controller.refresh()); assert.equal(reads, 1, 'polls share one in-flight read');
  assert.equal(controller.prepare({ threads: [{ id: 'worker', runStatus: 'completed', updatedAt: 'now' }] }), undefined, 'usage reading never blocks agent supervision');
  assert(holds.includes('worker'), 'a just-completed physical desk stays while final usage is read');
  resolve({ usage: {}, sources: [{ threadId: 'worker', status: 'completed' }] }); await first;
  assert.equal(observed, 1); assert(holds.includes('worker'), 'earned coins replace the provisional hold');
  const late = controller.refresh(); controller.destroy();
  resolve({ usage: {}, sources: [] }); await late;
  assert.equal(observed, 1, 'a destroyed controller ignores late usage responses');
  console.log('PASS: non-overlapping usage reads, nonblocking completion holds, final earnings retention, and stale response teardown.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
