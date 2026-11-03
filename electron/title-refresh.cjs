// Thread titles follow the conversation. After each newly finished run, ask T3 Code to
// regenerate the title with its own text generation model (Settings, Text generation), the
// same command as T3's "Regenerate title" menu action. One request per finished run, never
// for pinned managers or settled work, and the handled run ids survive restarts.
const fs = require('node:fs');
const path = require('node:path');

function createTitleRefresh({ file, world, reportState, dispatch, now = () => Date.now(), limit = 3 }) {
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { seen = {}; }
  let primed = Object.keys(seen).length > 0, busy = false;
  const save = () => {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(seen)); }
    catch (error) { console.error('Title refresh state could not be saved:', error.message); }
  };
  async function tick() {
    if (busy) return [];
    busy = true;
    const asked = [];
    try {
      const data = await world();
      const alive = new Set();
      for (const thread of data?.threads ?? []) {
        alive.add(thread.id);
        if (thread.pinned || thread.settled || thread.runStatus !== 'completed' || thread.id.includes('::')) continue;
        let state;
        try { state = reportState(thread.id); } catch { continue; }
        const run = state?.run;
        if (!run?.id || run.status !== 'completed' || state.pendingRuns || state.pendingRequests || seen[thread.id] === run.id) continue;
        // On first use, record existing history without renaming every old thread at once.
        if (!primed) { seen[thread.id] = run.id; continue; }
        if (asked.length >= limit) continue;
        try {
          await dispatch({ type: 'thread.metadata.update', threadId: thread.id, regenerateTitle: true });
          seen[thread.id] = run.id; asked.push(thread.id);
        } catch (error) { console.error('Title regeneration request failed:', error.message); break; }
      }
      for (const id of Object.keys(seen)) if (!alive.has(id)) delete seen[id];
      primed = true;
      save();
      return asked;
    } finally { busy = false; }
  }
  return { tick, seen: () => ({ ...seen }) };
}

module.exports = { createTitleRefresh };
