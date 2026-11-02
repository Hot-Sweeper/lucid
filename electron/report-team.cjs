// Record actual participating run selections, including model/harness handoffs.
function reportTeam(threadId, rows, effortOf) {
  const groups = new Map();
  for (const row of rows) {
    const run = row.payload;
    if (!run || (!run.startedAt && row.status !== 'completed')) continue;
    const provider = run.providerInstanceId || null;
    const model = run.modelSelection?.model || null;
    const effort = effortOf(run.modelSelection?.options);
    const key = JSON.stringify([row.threadId, provider, model, effort]);
    let member = groups.get(key);
    if (!member) {
      member = { threadId: row.threadId, title: row.title, role: row.threadId === threadId ? 'Owner' : 'Subagent', provider, model, effort, runIds: [] };
      groups.set(key, member);
    }
    if (!member.runIds.includes(row.id)) member.runIds.push(row.id);
  }
  return [...groups.values()];
}
module.exports = { reportTeam };
