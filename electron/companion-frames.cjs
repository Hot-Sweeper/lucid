const { createHash } = require('node:crypto');
const revision = json => createHash('sha256').update(json).digest('hex');

// One coherent read for the phone. Unchanged office state never needs to be sent
// or reconciled again just because the refresh clock ticked.
function createCompanionFrames({ read, now = Date.now }) {
  const entries = new Map();
  async function frame(key, known = {}) {
    if (!known || typeof known !== 'object' || Array.isArray(known)) known = {};
    let entry = entries.get(key);
    if (!entry || now() - entry.at > 150 && !entry.pending) {
      entry = { at: now(), pending: null, value: null };
      entries.set(key, entry);
      // Retain only a bounded set of recently visited buildings.
      if (entries.size > 12) entries.delete(entries.keys().next().value);
      entry.pending = Promise.resolve().then(() => read(key)).then(value => {
        const revisions = {};
        const snapshot = {};
        for (const kind of ['state', 'world', 'tasks']) {
          const json = JSON.stringify(value[kind]);
          revisions[kind] = revision(json);
          snapshot[kind] = JSON.parse(json);
        }
        entry.value = { revisions, snapshot }; entry.at = now();
        return entry.value;
      }).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; }).finally(() => { entry.pending = null; });
    }
    const value = await (entry.pending || entry.value);
    const result = { revisions: value.revisions };
    for (const kind of ['state', 'world', 'tasks']) if (known[kind] !== value.revisions[kind]) result[kind] = value.snapshot[kind];
    return result;
  }
  return { frame, invalidate() { entries.clear(); } };
}
module.exports = { createCompanionFrames };
