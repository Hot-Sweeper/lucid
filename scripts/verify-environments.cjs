const assert = require("node:assert/strict");
const { createEnvironmentRegistry } = require("../electron/environments.cjs");
(async () => {
  let calls = 0, time = 1000;
  const registry = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: "tim", label: "Tim PC" }), hostname: () => "Host", now: () => time,
    links: async () => { calls++; return [{ environmentId: "ares", label: "Ares", status: "reachable", urls: ["https://ares.example/api?secret=do-not-return", "https://name:password@unsafe.example"] }, { environmentId: "tim", label: "Duplicate local" }, { environmentId: "ares", label: "Duplicate remote" }]; } });
  const [a, b] = await Promise.all([registry.get(), registry.get()]);
  assert.strictEqual(a, b); assert.equal(calls, 1); assert.equal(a.buildings.length, 2);
  assert.deepEqual(a.buildings[1].origins, ["https://ares.example"]);
  assert.equal(a.buildings[1].canOpen, false); assert.equal(a.remoteWorldSupported, false);
  assert.equal(await registry.requireLocal("tim"), "tim");
  await assert.rejects(() => registry.requireLocal("ares"), { code: "remote-environment-unavailable" });
  await assert.rejects(() => registry.requireLocal("unknown"), { code: "remote-environment-unavailable" });
  await registry.get(); assert.equal(calls, 1); time += 60000; await registry.get(); assert.equal(calls, 2);
  const none = createEnvironmentRegistry({ descriptor: async () => { throw Error(); }, links: async () => [], hostname: () => "Actual host", now: () => time });
  const n = await none.get(); assert.equal(n.connectionState, "no-linked-environments"); assert.equal(n.buildings.length, 1); assert.equal(n.buildings[0].label, "Actual host");
  const failed = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: "tim", label: "Tim PC" }), links: async () => { throw Error("Never expose raw errors or credentials"); } });
  const f = await failed.get(); assert.equal(f.connectionState, "inventory-unavailable"); assert(!JSON.stringify(f).includes("credentials"));
  console.log("PASS: actual environment metadata, no invented remote world, source errors, deduplication, cache and cross-environment action guard");
})().catch(error => { console.error(error); process.exitCode = 1; });
