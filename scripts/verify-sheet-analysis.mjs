import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import assert from "node:assert/strict";
const source = stripTypeScriptTypes(readFileSync(new URL("../src/os/sheet-analysis.ts", import.meta.url), "utf8"));
const { analysisSize, sheetAnalysisBudget } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
for (const [width, height] of [[48, 750000], [750000, 48], [1200, 800], [64, 32], [8192, 4096]]) {
  const size = analysisSize(width, height);
  assert(size.w <= 960 && size.h <= 960 && size.w * size.h <= 960 * 960, "both dimensions and pixel memory must remain bounded");
}
assert.deepEqual(analysisSize(64, 32), { w: 64, h: 32 }, "small sprite art remains at its exact native analysis size");
assert.deepEqual(analysisSize(1920, 960), { w: 960, h: 480 }, "working bitmap retains aspect ratio");
let time = 0, yields = 0, valid = true;
const checkpoint = sheetAnalysisBudget(() => valid, () => time, async () => { yields++; });
await checkpoint();assert.equal(yields, 0);
time = 4;await checkpoint();assert.equal(yields, 1, "analysis yields after its short task budget");
time = 6;await checkpoint();assert.equal(yields, 1);
valid = false;await assert.rejects(checkpoint, /cancelled/, "obsolete work cancels before more scoring");
valid = true;time = 10;
const raced = sheetAnalysisBudget(() => valid, () => time, async () => { valid = false; });
time = 14;await assert.rejects(raced, /cancelled/, "cancellation during a yield cannot resume scoring");
console.log("PASS: bounded portrait/landscape memory, exact small sheets, cooperative scheduling and cancellation");
