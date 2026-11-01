const assert = require("node:assert/strict");
const { createEnvironmentRegistry, createLinkedInventory } = require("../electron/environments.cjs");
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
  let broken = false, removed = false;
  const connected = createEnvironmentRegistry({
    descriptor: async () => { if (broken) throw Error('temporary'); return { environmentId: 'tim', label: 'Tim PC' }; },
    links: async () => {
      if (broken) throw Error('temporary');
      return removed ? [] : [
        { environmentId: 'ares', label: 'CLI label', status: 'reachable', urls: ['https://ares.example'] },
        { environmentId: 'ares', label: 'ARES', desktop: true, urls: ['http://ares.local:3773'] },
        { environmentId: 'laptop', label: 'Laptop', desktop: true },
        { environmentId: 'unlabelled', desktop: true },
        { environmentId: 'tim', label: 'Duplicate local', desktop: true },
      ];
    },
  });
  const c = await connected.get();
  assert.equal(c.buildings.length, 4, 'each real device has one building, including an unlabelled connection');
  assert.equal(c.buildings[1].label, 'ARES'); assert.equal(c.buildings[1].status, 'reachable'); assert(c.buildings[1].canOpen);
  assert.deepEqual(c.buildings[1].origins, ['https://ares.example', 'http://ares.local:3773']);
  assert.equal(c.connectionState, 'available');
  broken = true;
  const stale = await connected.get({ fresh: true });
  assert.deepEqual(stale.buildings.map(b => b.id), c.buildings.map(b => b.id), 'temporary discovery failure retains buildings and local identity');
  assert.equal(stale.connectionState, 'inventory-unavailable'); assert(stale.error);
  assert(stale.buildings.every(b => b.status === 'unknown'), 'cached reachability is not presented as current');
  broken = false; removed = true;
  const cleared = await connected.get({ fresh: true });
  assert.equal(cleared.buildings.length, 1, 'successful discovery removes disconnected buildings');
  assert.equal(cleared.error, null);
  let catalogBroken = false, cliBroken = false, catalogRows = [{ environmentId: 'ares', label: 'ARES', desktop: true, status: 'reachable' }];
  const sources = createLinkedInventory({
    connect: () => { if (catalogBroken) throw Error('private catalog error'); return catalogRows; },
    links: () => { if (cliBroken) throw Error('private CLI error'); return []; },
  });
  await sources(); catalogBroken = true;
  const partial = await sources();
  assert.equal(partial.rows[0].environmentId, 'ares', 'empty successful CLI list cannot hide a device when catalog read fails');
  assert.equal(partial.rows[0].status, 'unknown'); assert.equal(partial.error, true);
  assert(!JSON.stringify(partial).includes('private'));
  cliBroken = true; await assert.rejects(sources, /inventory unavailable/);
  catalogBroken = false; catalogRows = [];
  const removedFromCatalog = await sources();
  assert.equal(removedFromCatalog.rows.length, 0, 'a successful catalog read removes disconnected devices even if CLI is unavailable');
  console.log("PASS: all device buildings, merged CLI/Connect metadata, source errors, stable identity during discovery failure, disconnect removal, deduplication, cache and cross-environment action guard");
})().catch(error => { console.error(error); process.exitCode = 1; });
