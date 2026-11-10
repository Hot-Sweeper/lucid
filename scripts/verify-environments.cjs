const assert = require("node:assert/strict");
const { createEnvironmentRegistry, createLinkedInventory } = require("../electron/environments.cjs");
(async () => {
  let calls = 0, time = 1000;
  const registry = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: "desk", label: "Desk PC" }), hostname: () => "Host", now: () => time,
    links: async () => { calls++; return [{ environmentId: "studio", label: "Studio", status: "reachable", urls: ["https://studio.example/api?secret=do-not-return", "https://name:password@unsafe.example"] }, { environmentId: "desk", label: "Duplicate local" }, { environmentId: "studio", label: "Duplicate remote" }]; } });
  const [a, b] = await Promise.all([registry.get(), registry.get()]);
  assert.deepEqual(a, b); assert.equal(calls, 1); assert.equal(a.buildings.length, 2);
  assert.deepEqual(a.buildings[1].origins, ["https://studio.example"]);
  assert.equal(a.buildings[1].canOpen, false); assert.equal(a.remoteWorldSupported, false);
  assert.equal(a.buildings[0].link, "local"); assert.equal(a.buildings[1].link, "linked", "a link T3 keeps to itself is not presented as connected");
  await registry.get(); assert.equal(calls, 1); time += 60000; await registry.get(); assert.equal(calls, 2);
  const none = createEnvironmentRegistry({ descriptor: async () => { throw Error(); }, links: async () => [], hostname: () => "Actual host", now: () => time });
  const n = await none.get(); assert.equal(n.connectionState, "no-linked-environments"); assert.equal(n.buildings.length, 1); assert.equal(n.buildings[0].label, "Actual host");
  const failed = createEnvironmentRegistry({ descriptor: async () => ({ environmentId: "desk", label: "Desk PC" }), links: async () => { throw Error("Never expose raw errors or credentials"); } });
  const f = await failed.get(); assert.equal(f.connectionState, "inventory-unavailable"); assert(!JSON.stringify(f).includes("credentials"));
  let broken = false, removed = false;
  const connected = createEnvironmentRegistry({
    descriptor: async () => { if (broken) throw Error('temporary'); return { environmentId: 'desk', label: 'Desk PC' }; },
    links: async () => {
      if (broken) throw Error('temporary');
      return removed ? [] : [
        { environmentId: 'studio', label: 'CLI label', status: 'reachable', urls: ['https://studio.example'] },
        { environmentId: 'studio', label: 'STUDIO', desktop: true, urls: ['http://studio.local:3773'] },
        { environmentId: 'laptop', label: 'Laptop', desktop: true },
        { environmentId: 'unlabelled', desktop: true },
        { environmentId: 'desk', label: 'Duplicate local', desktop: true },
      ];
    },
  });
  const c = await connected.get();
  assert.equal(c.buildings.length, 4, 'each real device has one building, including an unlabelled connection');
  assert.equal(c.buildings[1].label, 'STUDIO'); assert.equal(c.buildings[1].status, 'reachable'); assert(c.buildings[1].canOpen);
  assert.deepEqual(c.buildings[1].origins, ['https://studio.example', 'http://studio.local:3773']);
  assert.equal(c.connectionState, 'available');
  assert.equal(c.buildings[2].link, 'configured', 'a saved connection is only configured until a real read succeeds');
  connected.markLink('laptop', true);
  assert.equal((await connected.get()).buildings[2].link, 'authenticated');
  connected.markLink('laptop', false, 'Relay refused the session');
  const down = (await connected.get()).buildings[2];
  assert.equal(down.link, 'failed'); assert.equal(down.linkError, 'Relay refused the session');
  broken = true;
  const stale = await connected.get({ fresh: true });
  assert.deepEqual(stale.buildings.map(b => b.id), c.buildings.map(b => b.id), 'temporary discovery failure retains buildings and local identity');
  assert.equal(stale.connectionState, 'inventory-unavailable'); assert(stale.error);
  assert(stale.buildings.every(b => b.status === 'unknown'), 'cached reachability is not presented as current');
  broken = false; removed = true;
  const cleared = await connected.get({ fresh: true });
  assert.equal(cleared.buildings.length, 1, 'successful discovery removes disconnected buildings');
  assert.equal(cleared.error, null);
  let catalogBroken = false, cliBroken = false, catalogRows = [{ environmentId: 'studio', label: 'STUDIO', desktop: true, status: 'reachable' }];
  const sources = createLinkedInventory({
    connect: () => { if (catalogBroken) throw Error('private catalog error'); return catalogRows; },
    links: () => { if (cliBroken) throw Error('private CLI error'); return []; },
  });
  await sources(); catalogBroken = true;
  const partial = await sources();
  assert.equal(partial.rows[0].environmentId, 'studio', 'empty successful CLI list cannot hide a device when catalog read fails');
  assert.equal(partial.rows[0].status, 'unknown'); assert.equal(partial.error, true);
  assert(!JSON.stringify(partial).includes('private'));
  cliBroken = true; await assert.rejects(sources, /inventory unavailable/);
  catalogBroken = false; catalogRows = [];
  const removedFromCatalog = await sources();
  assert.equal(removedFromCatalog.rows.length, 0, 'a successful catalog read removes disconnected devices even if CLI is unavailable');
  console.log("PASS: all device buildings, merged CLI/Connect metadata, source errors, stable identity during discovery failure, disconnect removal, deduplication, cache and configured versus authenticated links");
})().catch(error => { console.error(error); process.exitCode = 1; });
