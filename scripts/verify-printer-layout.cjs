const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const context = {};
for (const file of ['src/office/printer.ts', 'src/office/navigation.ts']) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'transform' }), context);
}
const station = context.printerStation(600);
const firstMonitor = { x: 124, y: 154, w: 292, h: 172 };
const firstDesk = { x: 104, y: 330, w: 332, h: 88 };
const chair = { x: 234, y: 435, w: 72, h: 64 };
const blocks = [station.footprint, firstMonitor, firstDesk, chair];
for (const from of [{ x: 494, y: 126 }, { x: 208, y: 450 }]) {
  const route = context.furniturePath(from, station.pickup, blocks, { x: 20, y: 120, w: 500, h: 500 });
  assert(route, 'printer pickup remains reachable around the first workstation');
  let previous = from;
  for (const point of route) { assert(!blocks.some(b => context.crosses(previous, point, b)), 'route avoids furniture'); previous = point; }
}
assert(station.footprint.x + station.footprint.w < firstMonitor.x, 'cabinet stays clear of the monitor');
const compact = context.printerStation(180);
assert(compact.y + 102 * compact.scale < 180, 'cabinet fits a collapsed office');
assert(!context.printerArt(600, '#ff9f5a').includes('translate(62 60)'), 'printer no longer sits over the room sign');
console.log('PASS: printer pickup routes, furniture clearance, compact office fit, and separate cabinet.');
