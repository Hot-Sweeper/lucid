import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const file = '../src/office/outside-cull.ts';
const source = await readFile(new URL(file, import.meta.url), 'utf8');
const code = (await transformWithOxc(source, file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const inherited = new Set(['stroke', 'strokeWidth', 'fill', 'fillRule', 'markerStart', 'markerMid', 'markerEnd']);
const defaults = { filter: 'none', animationName: 'none', transform: 'none', transformOrigin: '0px 0px', stroke: 'none', strokeWidth: '1px', fill: 'black', fillRule: 'nonzero', markerStart: 'none', markerMid: 'none', markerEnd: 'none', vectorEffect: 'none' };
let styleReads = 0;
function computed(node) {
  styleReads++;
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    let current = node;
    while (current) {
      if (current.style[key] !== undefined) return [key, current.style[key]];
      if (!inherited.has(key)) break;
      current = current.parentElement;
    }
    return [key, fallback];
  }));
}
const api = new Function('getComputedStyle', code + ';return {prepareArcContours,prepareFadeHole,prepareHedgeHole,outsideTransform,mountNativeContourCull}')(computed);
const circle = (x, y, r) => `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`;
const first = circle(50, 50, 10), second = circle(1000, 1000, 50), original = first + second;
const rr = (x,y,w,h,r) => `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;

class Node {
  constructor(localName, attributes = {}, style = {}) { Object.assign(this, {localName, attributes, style, children: [], parentElement: null, writes: 0}); }
  append(child) { child.parentElement = this; this.children.push(child); return child; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; this.writes++; }
  querySelector() { return null; }
  querySelectorAll(name) { return this.children.flatMap(c => [...(c.localName === name ? [c] : []), ...c.querySelectorAll(name)]); }
  closest(selector) { const names = selector.split(','); for (let node = this; node; node = node.parentElement) if (names.includes(node.localName)) return node; return null; }
}
function fixture({d = original, pathStyle = {}, groupStyle = {}, rootStyle = {}, transform = '', pathTransform = ''} = {}) {
  const svg = new Node('svg', {}, rootStyle), group = svg.append(new Node('g', {transform}, groupStyle));
  const path = group.append(new Node('path', {d, transform: pathTransform}, pathStyle));
  const culler = api.mountNativeContourCull(svg);
  return {svg, group, path, culler};
}
const arcs = api.prepareArcContours(original);
assert.equal(arcs.contours.length, 2);
assert.equal(arcs.contours.map(c => c.source).join(''), original);
assert.equal(api.prepareArcContours('M0 0L20 20Z'), null);
assert.equal(api.prepareArcContours(first.replace(' 1 0 ', ' 0 0 ')), null);
assert.equal(api.prepareArcContours(first + 'M0 0L1 1Z'), null, 'unknown subpath leaves whole path untouched');
const corrected = api.prepareArcContours('M0 0a9.9 9.9 0 1 0 20 0a9.9 9.9 0 1 0 -20 0').contours[0].bounds;
assert.ok(corrected.x <= 0 && corrected.x + corrected.w >= 20 && corrected.y <= -10 && corrected.y + corrected.h >= 10, 'SVG radii correction is included');
const rotated = api.prepareArcContours('M0 0a20 8 45 1 0 28.3 28.3a20 8 45 1 0 -28.3 -28.3').contours[0].bounds;
assert.ok(rotated.x < 0 && rotated.y < 0 && rotated.w > 28.3 && rotated.h > 28.3, 'rotated ellipse bounds include non-endpoint extrema');

const mapped = fixture({transform: 'translate(100 200) scale(2)', groupStyle: {transform: 'matrix(2, 0, 0, 2, 100, 200)'}});
assert.equal(mapped.culler.stats.arcPaths, 1);
assert.deepEqual(mapped.culler.update({x:180,y:280,w:40,h:40}, 2), {changed:0,hidden:0,contours:2});
assert.equal(mapped.path.getAttribute('d'), original, 'one visible contour retains ALL original bytes and compound paint semantics');
assert.equal(mapped.culler.update({x:500,y:500,w:10,h:10}, 2).hidden, 1);
assert.equal(mapped.path.getAttribute('d'), '');
const reads = styleReads, writes = mapped.path.writes;
for (let i = 0; i < 100; i++) mapped.culler.update({x:500+i/10,y:500,w:10,h:10}, 2);
assert.equal(styleReads, reads, 'camera loop never reads layout/computed style');
assert.equal(mapped.path.writes, writes, 'unchanged culling does not rewrite path attributes');
mapped.culler.update({x:180,y:280,w:40,h:40}, 2);
assert.equal(mapped.path.getAttribute('d'), original, 'pan restores a newly exposed path immediately');
mapped.culler.update({x:500,y:500,w:10,h:10}, 2);
mapped.culler.update({x:NaN,y:0,w:1,h:1}, 2);
assert.equal(mapped.path.getAttribute('d'), original, 'invalid camera restores full artwork');
mapped.culler.update({x:500,y:500,w:10,h:10}, 2);
mapped.culler.update({x:500,y:500,w:10,h:10}, Infinity);
assert.equal(mapped.path.getAttribute('d'), original, 'invalid density cannot remove artwork');
mapped.culler.update({x:500,y:500,w:10,h:10}, 2);
mapped.culler.destroy();
assert.equal(mapped.path.getAttribute('d'), original, 'owner teardown restores canonical bytes');
const destroyedWrites = mapped.path.writes;
mapped.culler.update({x:500,y:500,w:10,h:10}, 2);
assert.equal(mapped.path.writes, destroyedWrites, 'destroyed owner cannot mutate artwork');

for (const density of [.042, .23, .5, 1, 2, 6]) {
  const near = fixture({d:first}), guard = 2 / density;
  near.culler.update({x:60+guard*.9,y:49,w:1,h:2}, density);
  assert.equal(near.path.getAttribute('d'), first, `two physical pixel guard retained at density ${density}`);
  near.culler.update({x:60+guard*1.1,y:49,w:1,h:2}, density);
  assert.equal(near.path.getAttribute('d'), '', 'wholly outside guarded geometry is culled');
}
const ring = 'M-2 -2h1004v804h-1004Z' + rr(100,100,800,600,100);
const fade = api.prepareFadeHole(ring, 'evenodd');
assert.ok(fade.hidden({x:300,y:300,w:100,h:100},2));
assert.ok(!fade.hidden({x:105,y:105,w:10,h:10},2), 'rounded-corner crescent remains');
assert.ok(!fade.hidden({x:105,y:300,w:10,h:10},10), 'inner edge guard remains');
assert.equal(api.prepareFadeHole(ring, 'nonzero'), null);
assert.equal(api.prepareFadeHole(ring.replace('A100 100', 'A100 80'), 'evenodd'), null);
const hedge = api.prepareHedgeHole(rr(100,100,800,600,100), 'none', 58);
assert.ok(hedge.hidden({x:300,y:300,w:50,h:50},2));
assert.ok(!hedge.hidden({x:228,y:300,w:50,h:50},2), 'stroke/corner inset remains');
assert.equal(api.prepareHedgeHole(rr(100,100,800,600,100), '#abc', 58), null);
const inheritedFade = fixture({d:ring, groupStyle:{fillRule:'evenodd'}});
assert.equal(inheritedFade.culler.update({x:300,y:300,w:100,h:100},1).hidden,1);
inheritedFade.culler.update({x:105,y:105,w:10,h:10},1);
assert.equal(inheritedFade.path.getAttribute('d'),ring);
const inheritedHedge = fixture({d:rr(100,100,800,600,100), groupStyle:{stroke:'#abc',strokeWidth:'58px',fill:'none'},transform:'translate(30 40)'});
assert.equal(inheritedHedge.culler.update({x:330,y:340,w:50,h:50},1).hidden,1);

// Unknown or expanding paint/coordinate effects fail closed. In particular a
// stroke inherited from a group must not be mistaken for an unstroked circle.
for (const options of [
  {groupStyle:{stroke:'#abc',strokeWidth:'500px'}},
  {rootStyle:{filter:'url(#root-blur)'}}, {groupStyle:{filter:'blur(20px)'}},
  {pathStyle:{markerEnd:'url(#arrow)'}}, {groupStyle:{animationName:'moving'}},
  {transform:'skewX(10)'}, {transform:'translate(100 200)',groupStyle:{transform:'matrix(1,0,0,1,900,200)'}},
  {transform:'scale(2)',groupStyle:{transform:'matrix(2,0,0,2,0,0)',transformOrigin:'10px 10px'}},
  {transform:'scale(0)'}, {transform:'matrix(1 0 0 1 1e309 0)'},
  {d:ring,pathStyle:{stroke:'#abc',fillRule:'evenodd'}},
  {d:rr(100,100,800,600,100),pathStyle:{stroke:'#abc',fill:'none',vectorEffect:'non-scaling-stroke'}},
]) {
  const f=fixture(options); assert.equal(f.culler.stats.paths,0,JSON.stringify(options));
  f.culler.update({x:9000,y:9000,w:1,h:1},1);
  assert.equal(f.path.getAttribute('d'),options.d??original);
}
const svg = new Node('svg'), defs = svg.append(new Node('defs')), definition = defs.append(new Node('path',{d:first}));
const nested = svg.append(new Node('svg',{viewBox:'0 0 10 10'})); nested.append(new Node('path',{d:first}));
assert.equal(api.mountNativeContourCull(svg).stats.paths,0, 'definitions and nested coordinate systems stay untouched');
assert.equal(definition.getAttribute('d'),first);
assert.equal(api.outsideTransform('translate(10 20) scale(2)').e,10, 'SVG transform list order');
assert.equal(api.outsideTransform('translate(10 20) scale(2)').a,2);
const rotation=api.outsideTransform('rotate(90 10 20)');
assert.ok(Math.abs(rotation.a*10+rotation.c*20+rotation.e-10)<1e-10);
assert.ok(Math.abs(rotation.b*10+rotation.d*20+rotation.f-20)<1e-10);
assert.equal(api.outsideTransform('translate(10)junk'),null);
assert.equal(api.outsideTransform('scale(1e200) scale(1e200)'),null);

console.log('PASS: whole-path outdoor culling, original-byte restoration, physical guard, transformed bounds, fade/hedge holes, inherited paint safety and owner cleanup');

// Raster preparation uses immutable canonical attribute spans. Its output must
// remain independent of the visible owner's currently culled paths.
const canonical='<svg><g transform="translate(100 200)"><path fill="#abc" d="'+original+'"/></g></svg>';
const srcFixture=fixture({transform:'translate(100 200)'}), plan=srcFixture.culler.prepareSource(canonical);
assert.equal(plan.stats.matched,true);assert.equal(plan.stats.paths,1);
const full=plan.sourceFor({x:130,y:230,w:40,h:40},1);
assert.equal(full.svg,canonical);assert.equal(full.hiddenPaths,0);
const empty=plan.sourceFor({x:500,y:500,w:10,h:10},1);
assert.equal(empty.svg,canonical.replace(original,''));assert.equal(empty.hiddenPaths,1);
assert.equal(empty.removedContours,2);assert.equal(empty.removedBytes,original.length);
assert.equal(srcFixture.path.writes,0,'raster serialization never mutates native DOM');
srcFixture.culler.update({x:500,y:500,w:10,h:10},1);
assert.equal(srcFixture.path.getAttribute('d'),'');
assert.equal(plan.sourceFor({x:130,y:230,w:40,h:40},1).svg,canonical,'visible raster uses canonical source even when its native path is culled');
srcFixture.culler.destroy();
assert.equal(plan.sourceFor({x:500,y:500,w:10,h:10},1).svg,empty.svg,'prepared source has no native owner dependency');
assert.equal(plan.sourceFor({x:NaN,y:0,w:1,h:1},1).svg,canonical);
assert.equal(plan.sourceFor({x:500,y:500,w:10,h:10},Infinity).svg,canonical);
const wrongMarkup=canonical.replace(original,'M0 0L1 1'),wrong=fixture().culler.prepareSource(wrongMarkup);
assert.equal(wrong.stats.matched,false);
assert.equal(wrong.sourceFor({x:9000,y:9000,w:1,h:1},1).svg,wrongMarkup,'ambiguous DOM/source mapping leaves canonical source unchanged');
const shortMarkup='<svg></svg>',short=fixture().culler.prepareSource(shortMarkup);
assert.equal(short.stats.matched,false);assert.equal(short.sourceFor({x:0,y:0,w:1,h:1},1).svg,shortMarkup);
plan.destroy();assert.throws(()=>plan.sourceFor({x:0,y:0,w:1,h:1},1),/destroyed/);

const spanSvg=new Node('svg'),spanGroup=spanSvg.append(new Node('g'));
spanGroup.append(new Node('path',{d:first}));spanGroup.append(new Node('path',{d:second}));
const spanMarkup=`<svg><g><path data-d='keep > marker' d = '${first}' fill="#abc"/><path d="${second}" opacity=".6"/></g></svg>`;
const spanPlan=api.mountNativeContourCull(spanSvg).prepareSource(spanMarkup);
assert.equal(spanPlan.stats.matched,true);
const spanResult=spanPlan.sourceFor({x:30,y:30,w:40,h:40},2);
assert.equal(spanResult.svg,spanMarkup.replace(`d="${second}"`,'d=""'),'multiple quoted attributes and all unrelated canonical bytes are preserved');
assert.equal(spanResult.hiddenPaths,1);
assert.equal(spanPlan.sourceFor({x:0,y:0,w:2000,h:2000},2).svg,spanMarkup,'subsequent complete view restores exact canonical source');
assert.ok(spanResult.svg.length<=spanMarkup.length,'each transient result is bounded by original source size');
console.log('PASS: raster source spans, complete visible-path bytes, canonical independence, fail-closed mapping and bounded owner cleanup');
