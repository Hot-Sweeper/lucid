const assert = require('node:assert/strict');
const { parseInteractionOptions, cycleWheelWorkload, collectGraphicsStats, graphicsQuiet, inputAccounting, collectRecorderCounts, fixtureMessageStats, verifyPrivateBuild } = require('./profile-interaction-review.cjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const temporaryParent = path.resolve(os.tmpdir()), temporary = fs.mkdtempSync(path.join(temporaryParent, 'lucid-interaction-preflight-'));
try {
  fs.mkdirSync(path.join(temporary, 'electron')); fs.mkdirSync(path.join(temporary, 'src')); fs.mkdirSync(path.join(temporary, 'dist/assets'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../electron/build-state.cjs'), path.join(temporary, 'electron/build-state.cjs'));
  const value = path.join(temporary, 'src/value.ts'), index = path.join(temporary, 'dist/index.html');
  const entry = path.join(temporary, 'dist/assets/index-test.js');
  fs.writeFileSync(value, 'export const value = 1;'); fs.writeFileSync(index, '<script type="module" src="./assets/index-test.js"></script>'); fs.writeFileSync(entry, 'export {};');
  const files = require(path.join(temporary, 'electron/build-state.cjs')).snapshot(temporary);
  fs.writeFileSync(path.join(temporary, 'dist/lucid-build.json'), JSON.stringify({ files, builtAt: new Date().toISOString() }));
  assert.deepEqual(verifyPrivateBuild(temporary).files, files);
  fs.unlinkSync(entry); assert.throws(() => verifyPrivateBuild(temporary), /missing an emitted entry/); fs.writeFileSync(entry, 'export {};');
  fs.writeFileSync(value, 'export const value = 2;');
  assert.throws(() => verifyPrivateBuild(temporary), /source differs/);
  fs.writeFileSync(value, 'export const value = 1;');
  fs.writeFileSync(path.join(temporary, 'src/unlisted.ts'), 'export const added = true;');
  assert.throws(() => verifyPrivateBuild(temporary), /source differs/);
  fs.unlinkSync(path.join(temporary, 'src/unlisted.ts')); fs.unlinkSync(index);
  assert.throws(() => verifyPrivateBuild(temporary), /Build and validate/);
} finally {
  const relative = path.relative(temporaryParent, path.resolve(temporary));
  assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..') && /^lucid-interaction-preflight-[^\\/]+$/.test(relative));
  fs.rmSync(temporary, { recursive: true, force: true });
}

const defaults = parseInteractionOptions([]);
assert.equal(defaults.cycles, 3); assert.equal(defaults.pacedOnly, false); assert.equal(defaults.finalRecoveryMs, 30000);
assert.deepEqual(cycleWheelWorkload(0, defaults).map(phase => [phase.name, phase.mode, phase.count, phase.pace]), [
  ['normal-zoom-0', 'ack', 96, 50], ['normal-mixed-0', 'ack', 96, 50],
  ['flood-zoom-0', 'flood', 96, 8], ['wc-flood-zoom-0', 'wc-flood', 96, 8],
]);
const paced = parseInteractionOptions(['--cycles', '20', '--paced-only', '--recovery-seconds', '90']);
assert.equal(paced.cycles, 20); assert.equal(paced.finalRecoveryMs, 90000);
for (let cycle = 0; cycle < paced.cycles; cycle++) {
  const phases = cycleWheelWorkload(cycle, paced);
  assert.deepEqual(phases.map(phase => phase.name), [`normal-zoom-${cycle}`, `normal-mixed-${cycle}`]);
  assert.equal(phases.reduce((sum, phase) => sum + phase.count, 0), 192);
  assert.ok(phases.every(phase => phase.pace === 50 && phase.mode === 'ack'));
  assert.equal(phases[1].mixed, true);
}
const quick = parseInteractionOptions(['--quick']);
assert.equal(quick.finalRecoveryMs, 1500); assert.equal(cycleWheelWorkload(0, quick).length, 3);
for (const args of [['--cycles'], ['--cycles', '0'], ['--cycles', '2.5'], ['--recovery-seconds'], ['--recovery-seconds', '0'], ['--recovery-seconds', 'NaN']]) {
  assert.throws(() => parseInteractionOptions(args));
}

const tiles = [{ width: 512, height: 256 }, { width: 128, height: 256 }], others = [{ width: 100, height: 50 }];
const viewport = { dataset: { presentation: 'vector-canvas', missingTiles: '1', visibleTiles: '2', cachePixels: '163840', pixelBudget: '200000', paints: '9' },
  querySelectorAll: selector => selector.includes('outside-vector-canvas') ? tiles : [...tiles, ...others] };
const document = { querySelector: () => viewport, querySelectorAll: () => [...tiles, ...others] };
const graphics = collectGraphicsStats(document, { pending: 0, assets: 2 });
assert.equal(graphics.outside.tileCount, 2); assert.equal(graphics.all.canvasCount, 3);
assert.equal(graphics.all.backingPixels, 168840); assert.equal(graphics.all.estimatedRgbaBytes, 675360);
assert.equal(graphics.outside.maxWidth, 512); assert.equal(graphics.outside.missingTiles, 1);
assert.equal(graphics.outside.cachePixels, 163840); assert.equal(graphics.staticArt.assets, 2);
assert.equal(graphicsQuiet(document, { pending: 0 }), false, 'A partially presented tile crop cannot satisfy graphics quiet');
viewport.dataset.missingTiles = '0'; assert.equal(graphicsQuiet(document, { pending: 0 }), true);
assert.equal(graphicsQuiet(document, { pending: 1 }), false);
viewport.dataset.missingTiles = ''; assert.equal(graphicsQuiet(document, { pending: 0 }), false);
delete viewport.dataset.missingTiles;
assert.equal(graphicsQuiet(document, { pending: 0 }), true, 'Earlier validated native/settled paths have no tile counter');
viewport.dataset.pending = '1'; assert.equal(graphicsQuiet(document, { pending: 0 }), false, 'A pending tile encode must settle at a phase boundary');
viewport.dataset.pending = '0'; viewport.dataset.queuedTiles = '2'; assert.equal(graphicsQuiet(document, { pending: 0 }), true, 'Retained request plans include ready tiles and are not outstanding work');
viewport.querySelector = () => ({ shadowRoot: { querySelectorAll: () => [{}, {}, {}] } });
const svgGraphics = collectGraphicsStats(document, { pending: 0 });
assert.equal(svgGraphics.outside.svgImageTileCount, 3); assert.equal(svgGraphics.outside.tileCount, 5);
assert.equal(svgGraphics.outside.requestPlanCount, 2);
assert.equal(svgGraphics.all.backingPixels, graphics.all.backingPixels, 'Decoded SVG image tiles are not on-DOM canvas backings');
const absent = { querySelector: () => null, querySelectorAll: () => [] };
assert.equal(collectGraphicsStats(absent, null).outside.tileCount, 0);
assert.equal(graphicsQuiet(absent, { pending: 0 }), true);

const sent = [{ deltaY: -60 }, { deltaY: 60 }, { deltaY: 60 }];
const accounting = inputAccounting(sent, { wheelSignedDelta: 100, wheelMagnitude: 200 }, { wheelSignedDelta: 160, wheelMagnitude: 260 });
assert.equal(accounting.expectedSignedDelta, 60); assert.equal(accounting.deliveredSignedDelta, 60);
assert.equal(accounting.expectedWheelMagnitude, 180); assert.equal(accounting.deliveredWheelMagnitude, 60);
assert.equal(accounting.signedDeltaMatches, true, 'CDP coalescing may cancel magnitude while preserving the signed acknowledged delta');
assert.equal(inputAccounting(sent, { wheelSignedDelta: 100 }, { wheelSignedDelta: 100 }).signedDeltaMatches, false);
assert.equal(inputAccounting(sent, {}, {}).signedDeltaMatches, false, 'Missing native accounting cannot be reported as matching zero');
assert.equal(inputAccounting(sent, { allWheelSignedDelta: 0, allWheelMagnitude: 0 }, { allWheelSignedDelta: 60, allWheelMagnitude: 180 }, true).signedDeltaMatches, true);
const recorded={frames:[{},{}],inputs:[{}],commits:[],applies:[{},{},{}],mutations:[]};
assert.deepEqual(collectRecorderCounts(recorded),{frames:2,inputs:1,commits:0,applies:3,mutations:0});
assert.equal(recorded.frames.length,2,'Observation must not flush or modify retained recorder arrays');
assert.equal(collectRecorderCounts(null).frames,null);
const fixture=fixtureMessageStats([{text:'abc'},{text:'ä'},{text:'🤖'}]);
assert.equal(fixture.messageCount,3);assert.equal(fixture.messageTextCodeUnits,6);assert.equal(fixture.messageTextUtf8Bytes,9);
assert.ok(fixture.scope.includes('not V8 heap'));
console.log('Interaction harness passed: stale/missing build rejection, preserved default route, 20 deterministic paced cycles, recovery duration, bounded graphics counters, tile/native quiet and signed coalesced input accounting.');
