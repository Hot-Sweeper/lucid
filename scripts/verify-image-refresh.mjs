import assert from "node:assert/strict";
import { build } from "vite";

const bundle = await build({ configFile: false, logLevel: "error", build: { write: false, minify: false, lib: { entry: "src/os/image-refresh.ts", formats: ["es"] } } });
const chunk = (Array.isArray(bundle) ? bundle[0] : bundle).output.find((x) => x.type === "chunk");
const { ImageRefreshGate } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
const gate = new ImageRefreshGate();
const pending = { done: false, sources: [] };
const final = { done: true, sources: ["local:robot.png"] };

// The presentation budget expired. The same played item later receives its real output.
gate.begin("long-image", pending);
assert.equal(gate.release("long-image", pending), null);
assert.equal(gate.observe("unrelated-tool", final), null);
const late = gate.observe("long-image", final);
assert.deepEqual(late.state, final);
assert.equal(gate.valid(late), true);
assert.equal(gate.observe("long-image", { ...final }), null, "a duplicate push must not dispatch another refresh");

// A newer image starts while the older refresh is still loading its file.
gate.begin("new-image", pending);
assert.equal(gate.valid(late), false);
assert.equal(gate.observe("long-image", { done: true, sources: ["local:old.png"] }), null);

// Completion races the last pending presentation sleep. Release must dispatch it once.
assert.equal(gate.observe("new-image", final), null);
const raced = gate.release("new-image", pending);
assert.equal(raced.id, "new-image");
assert.equal(gate.valid(raced), true);
assert.equal(gate.observe("new-image", final), null);

// Reset/thread change cancels an in-flight load, even if an item ID is reused.
gate.reset();
assert.equal(gate.valid(raced), false);
gate.begin("new-image", pending);
gate.release("new-image", pending);
assert.equal(gate.valid(raced), false);
const failure = gate.observe("new-image", { done: true, failed: "Interrupted", sources: [] });
assert.equal(failure.state.failed, "Interrupted");
assert.equal(gate.valid(failure), true);

// A tool first reports completion without output, then supplies the actual image.
const empty = gate.observe("new-image", { done: true, sources: [] });
assert.equal(gate.valid(failure), false);
const supplied = gate.observe("new-image", final);
assert.equal(gate.valid(empty), false);
assert.equal(gate.valid(supplied), true);

// Already-rendered normal completion does not replay when released or polled again.
gate.begin("finished-normally", final);
assert.equal(gate.release("finished-normally", final), null);
assert.equal(gate.observe("finished-normally", final), null);
console.log("PASS: late completion, duplicate pushes, completion race, newer image, reset, reused IDs, failure, and delayed image sources");
