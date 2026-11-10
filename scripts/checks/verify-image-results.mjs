import assert from "node:assert/strict";
import { build } from "vite";

// Exercise production parsing with actual tool-output shapes, without launching Electron.
const bundle = await build({
  configFile: false,
  logLevel: "error",
  build: { write: false, minify: false, lib: { entry: "src/os/imagegen.ts", formats: ["es"] } },
});
const output = (Array.isArray(bundle) ? bundle[0] : bundle).output;
const chunk = output.find((x) => x.type === "chunk");
const { imageGenOf, imageResult } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
const local = (path) => `local:${path}`;
const item = (status, data, type = "dynamic_tool") => ({ id: "image-fixture", status, data, type });

const complete = item("completed", {
  toolName: "mcp__image_gen__imagegen",
  input: { prompt: "A blue robot", referenced_image_paths: ["C:\\refs\\input.png"] },
  output: { image_url: "https://images.example.test/output.png?signature=abc", savedPath: "C:\\art\\robot.png" },
});
assert.equal(imageGenOf(complete).prompt, "A blue robot");
assert.deepEqual(imageResult(complete, local), {
  sources: ["https://images.example.test/output.png?signature=abc", "local:C:\\art\\robot.png"], failed: undefined,
});
assert.equal(imageResult(item("interrupted", {}), local).failed, "Image generation was interrupted");
assert.equal(imageResult(item("completed", { result: { isError: true, content: [{ type: "text", text: "Image service unavailable" }] } }), local).failed, "Image service unavailable");
assert.equal(imageResult(item("completed", { output: JSON.stringify({ isError: true, error: { message: "Rate limited" } }) }), local).failed, "Rate limited");
assert.equal(imageResult(item("completed", { input: "image_gen.py generate --prompt robot", output: "Connection failed", exitCode: 1 }, "command_execution"), local).failed, "Connection failed");
assert.deepEqual(imageResult(item("completed", { input: { prompt: "Use C:\\refs\\input.png" }, output: "Finished, no picture returned" }), local).sources, []);
assert.equal(imageGenOf(item("completed", { input: "echo image_gen", output: "nothing" }, "command_execution")), null);
console.log("PASS: generated-image sources, interrupted tools, nested and serialized errors, failed commands, and input-image exclusion");
