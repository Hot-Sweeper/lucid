const crypto = require('node:crypto');
const SEP = '::';
const ref = (environmentId, id) => `${environmentId}${SEP}${id}`;
const split = id => typeof id === 'string' && id.includes(SEP) ? { environmentId: id.slice(0, id.indexOf(SEP)), id: id.slice(id.indexOf(SEP) + SEP.length) } : null;

function createRemoteBuilding(client, { now = Date.now, interval = setInterval, cancel = clearInterval, timeout = setTimeout, cancelTimeout = clearTimeout, maxDetailEntries = 16 } = {}) {
  const worlds = new Map(), detailCache = new Map(), pendingDetails = new Map();
  let cacheTimer = null;
  function trimDetails() {
    if (cacheTimer !== null) { cancelTimeout(cacheTimer); cacheTimer = null; }
    for (const [id, entry] of detailCache) if (now() - entry.at >= 1200) detailCache.delete(id);
    while (detailCache.size > maxDetailEntries) detailCache.delete(detailCache.keys().next().value);
    if (detailCache.size) {
      const oldest = detailCache.values().next().value;
      cacheTimer = timeout(() => { cacheTimer = null; trimDetails(); }, Math.max(1, oldest.at + 1200 - now()));
      cacheTimer.unref?.();
    }
  }
  async function detail(id, fresh = false) {
    const target = split(id); if (!target) throw Error('Choose a remote thread.');
    // All consumers share the in-flight read, including a watch's fresh poll.
    // A failed read must release its slot so the next request can retry.
    if (pendingDetails.has(id)) return pendingDetails.get(id);
    const cached = detailCache.get(id);
    if (!fresh && cached && now() - cached.at < 1200) return cached.value;
    const pending = (async () => {
      const value = (await client.fetch(target.environmentId, `/api/orchestration/threads/${encodeURIComponent(target.id)}`)).projection;
      // A command may invalidate a read that began before the action succeeded.
      if (pendingDetails.get(id) === pending) {
        detailCache.delete(id); detailCache.set(id, { at: now(), value }); trimDetails();
      }
      return value;
    })().finally(() => { if (pendingDetails.get(id) === pending) pendingDetails.delete(id); });
    pendingDetails.set(id, pending);
    return pending;
  }
  const infoFrom = (id, p) => {
    const t = p.thread, run = p.runs.at(-1);
    return { id, title: t.title, provider: t.providerInstanceId, projectTitle: worlds.get(split(id).environmentId)?.projects.find(p => p.id === ref(split(id).environmentId, t.projectId))?.title || '', root: '', model: t.modelSelection?.model || null, effort: t.modelSelection?.options?.find(o => /effort/i.test(o.id))?.value || null, queued: p.runs.filter(r => r.status === 'queued').map(r => ({ id: r.id, text: p.messages.find(m => m.id === r.userMessageId)?.text || '' })), run: run ? { id: run.id, status: run.status } : null };
  };
  const itemsFrom = p => p.turnItems.map(item => ({ id: item.id, runId: item.runId, ordinal: item.ordinal, type: item.type, status: item.status, title: item.title, updatedAt: item.updatedAt, data: item }));
  // Attachments stay on that computer: an attachment address lets lucid-file://remote fetch them.
  const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp' };
  const remoteAttachment = a => {
    const image = a.type === 'image' || /^image\//.test(a.mimeType || '');
    const ext = EXT[a.mimeType] || (String(a.name || '').match(/\.[a-z0-9]+$/i)?.[0] ?? '');
    return { type: image ? 'image' : 'file', id: a.id, name: a.name, mime: a.mimeType, size: a.sizeBytes, path: a.id && ext ? `/attachments/${a.id}${ext}` : '' };
  };
  const messagesFrom = p => p.messages.map(m => ({ id: m.id, role: m.role, at: m.createdAt, orderAt: m.createdAt, streaming: m.streaming, text: m.text, run: p.runs.find(r => r.id === m.runId)?.status || null, attachments: (m.attachments || []).map(remoteAttachment) }));
  return {
    split, ref,
    cached(id) { return worlds.get(id); },
    async world(environmentId) {
      const shell = await client.fetch(environmentId, '/api/orchestration/shell');
      const projects = shell.projects.map(p => ({ id: ref(environmentId, p.id), title: p.title, root: p.workspaceRoot, icon: null, scratch: /[\\/]\.t3[\\/]scratch$/i.test(p.workspaceRoot) }));
      const threads = shell.threads.filter(t => !t.deletedAt && !t.archivedAt && t.lineage?.relationshipToParent !== 'subagent').map(t => ({
        id: ref(environmentId, t.id), projectId: ref(environmentId, t.projectId), title: t.title, updatedAt: t.updatedAt, provider: t.providerInstanceId,
        runStatus: t.activityRunStatus || t.status || null, pinned: !!t.pinnedAt,
        settled: t.settledOverride === 'settled' || (!!t.settledAt && !t.unsettledAt && t.settledOverride !== 'unsettled'),
        question: t.pendingRuntimeRequest ? 'Needs your answer' : null, model: t.modelSelection?.model || null, branch: t.branch, folder: null,
        lastStatus: t.status, runStartedAt: t.latestRunStartedAt, unseen: t.updatedAt > (t.lastVisitedAt || ''), pinOrderKey: t.pinOrderKey, activeOrderKey: t.activeOrderKey,
      }));
      const data = { environmentId, projects, threads }; worlds.set(environmentId, data); return data;
    },
    async info(id) { return infoFrom(id, await detail(id)); },
    async items(id) { return itemsFrom(await detail(id)); },
    async conversation(id) { return messagesFrom(await detail(id)); },
    async conversationPage(id) { return { messages: messagesFrom(await detail(id)), hasMore: false, nextCursor: null }; },
    async pending(id) { return (await detail(id)).runtimeRequests.filter(r => !['resolved', 'cancelled', 'expired', 'failed'].includes(r.status)); },
    async selection(id) { const ms = (await detail(id)).thread.modelSelection; return { providerInstanceId: ms.instanceId, model: ms.model, options: Object.fromEntries((ms.options || []).map(o => [o.id, o.value])) }; },
    async providers(environmentId) {
      const config = await client.rpc(environmentId, 'server.getConfig', {});
      return (config.providers || []).filter(p => p.enabled !== false && p.availability !== 'unavailable').map(p => ({ instanceId: p.instanceId, driver: p.driver, name: p.displayName || p.instanceId, ready: ['ready', 'warning'].includes(p.status), models: (p.models || []).filter(m => !m.isLegacy).map(m => ({ slug: m.slug, name: m.name, shortName: m.shortName || null, isDefault: !!m.isDefault, options: (m.capabilities?.optionDescriptors || []).map(o => ({ id: o.id, label: o.label, type: o.type, choices: (o.options || []).map(c => ({ id: c.id, label: c.label, isDefault: !!c.isDefault })), current: o.currentValue })) })) }));
    },
    async send({ threadId, message }) {
      if (/\nAttached:\n/.test(String(message))) throw Error('Use T3 Code to send files to this building.');
      const p = await detail(threadId, true);
      const busy = p.runs.some(r => ['running', 'preparing', 'starting', 'queued', 'waiting'].includes(r.status));
      await this.dispatch({ type: 'message.dispatch', threadId, messageId: crypto.randomUUID(), text: String(message), attachments: [], dispatchMode: { type: busy ? 'queue_after_active' : 'start_immediately' } });
      return { ok: true };
    },
    async dispatch(command) {
      const targets = [command.threadId, command.projectId].map(split).filter(Boolean);
      if (!targets.length || targets.some(t => t.environmentId !== targets[0].environmentId)) throw Error('This action must stay within one building.');
      const clean = { ...command, commandId: crypto.randomUUID() };
      for (const key of ['threadId', 'projectId']) if (split(clean[key])) clean[key] = split(clean[key]).id;
      const result = await client.rpc(targets[0].environmentId, 'orchestration.dispatchCommand', clean);
      if (command.threadId) { detailCache.delete(command.threadId); pendingDetails.delete(command.threadId); trimDetails(); }
      return result;
    },
    watch(id, onItems, onInfo) {
      let stopped = false, busy = false, initial = true, infoKey = '';
      const seenItems = new Map();
      const tick = async () => {
        if (stopped || busy) return; busy = true;
        try { const p = await detail(id, true); if (stopped) return;
          const changed = [], present = new Set();
          for (const item of p.turnItems) {
            present.add(item.id);
            const key = crypto.createHash('sha256').update(JSON.stringify(item)).digest('base64');
            if (initial || seenItems.get(item.id) !== key) changed.push(item);
            seenItems.set(item.id, key);
          }
          for (const key of seenItems.keys()) if (!present.has(key)) seenItems.delete(key);
          // Stream only changed items through IPC, rather than replaying an
          // entire long conversation whenever its final item is revised.
          if (initial || changed.length) onItems(itemsFrom({ turnItems: changed }), initial);
          if (stopped) return;
          initial = false;
          const info = infoFrom(id, p), key = JSON.stringify(info);
          if (key !== infoKey) { infoKey = key; onInfo(info); }
        } catch {} finally { busy = false; }
      };
      const timer = interval(tick, 2500); void tick();
      return () => { if (stopped) return; stopped = true; cancel(timer); seenItems.clear(); detailCache.delete(id); pendingDetails.delete(id); trimDetails(); };
    },
  };
}
module.exports = { createRemoteBuilding, split, ref };
