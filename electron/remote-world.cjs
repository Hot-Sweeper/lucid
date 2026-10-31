const { RemoteRpc } = require("./remote-rpc.cjs");
const crypto = require("node:crypto");
const active = (status) => ["running", "queued", "preparing", "starting", "waiting"].includes(status);
const terminal = (status) => ["resolved", "cancelled", "expired", "failed"].includes(status);
const normalize = (item, position) => ({ id: item.id, runId: item.runId, ordinal: position ?? item.ordinal, type: item.type, status: item.status, updatedAt: item.updatedAt, data: item });
const effort = (options) => (Array.isArray(options) ? options.find((o) => /effort|thinking|reasoning/i.test(o.id))?.value : options?.effort || options?.reasoningEffort) ?? null;

class RemoteWorld {
  constructor(connection) {
    this.connection = connection; this.rpc = new RemoteRpc(connection); this.shell = null; this.ready = null; this.projections = new Map(); this.assets = new Map(); this.uploads = new Map(); this.attachmentResources = new Map();
    this.rpc.onClose = () => { this.shell = null; this.ready = null; this.projections.clear(); };
  }
  async snapshot() {
    if (!this.ready) this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.rpc.close(); reject(new Error("The machine did not send its project list in time.")); }, 15000);
      this.rpc.call("orchestration.subscribeShell", { requestCompletionMarker: true }, (event) => {
        if (event.kind === "snapshot") {
          if (!event.resolvedRepositoryIdentityRoots) this.shell = event.snapshot;
          else if (this.shell) for (const project of event.snapshot.projects) this.upsert("projects", project);
        }
        else if (event.kind === "synchronized") { clearTimeout(timer); resolve(); }
        else if (this.shell && event.kind === "project.updated") this.upsert("projects", event.project);
        else if (this.shell && event.kind === "project.removed") this.shell.projects = this.shell.projects.filter((p) => p.id !== event.projectId);
        else if (this.shell && event.kind === "thread.updated") {
          this.shell.threads = this.shell.threads.filter((t) => t.id !== event.thread.id);
          if (event.location !== "archive") this.shell.threads.push(event.thread);
          this.projections.delete(event.thread.id);
        } else if (this.shell && event.kind === "thread.removed") { this.shell.threads = this.shell.threads.filter((t) => t.id !== event.threadId); this.projections.delete(event.threadId); }
      }).catch((error) => { clearTimeout(timer); reject(error); });
    });
    await this.ready;
    return this.shell;
  }
  upsert(key, value) { const at = this.shell[key].findIndex((v) => v.id === value.id); if (at < 0) this.shell[key].push(value); else this.shell[key][at] = value; }
  async projection(id) {
    const cached = this.projections.get(id);
    if (cached && Date.now() - cached.at < 1500) return cached.promise;
    const promise = this.rpc.call("orchestration.getThreadProjection", { threadId: id });
    this.projections.set(id, { at: Date.now(), promise });
    try { return await promise; } catch (error) { this.projections.delete(id); throw error; }
  }
  async world() {
    const shell = await this.snapshot();
    const projects = shell.projects.map((p) => ({ id: p.id, title: p.title, root: p.workspaceRoot, icon: null, scratch: /[\\/]\.t3[\\/]scratch$/i.test(p.workspaceRoot) }));
    const threads = [...shell.threads].filter((t) => !t.archivedAt && !t.deletedAt && !t.id.startsWith("thread:")).sort((a, b) => Number(active(b.status)) - Number(active(a.status)) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 60).map((t) => ({
      id: t.id, projectId: t.projectId, title: t.title, updatedAt: t.updatedAt, createdAt: t.createdAt, provider: t.providerInstanceId || t.modelSelection?.instanceId,
      runStatus: active(t.activityRunStatus || t.status) ? "running" : t.status, lastStatus: t.status, pinned: !!t.pinnedAt, settled: t.settledOverride === "settled" || (!!t.settledAt && !t.unsettledAt && t.settledOverride !== "active" && !t.activeRunId),
      question: t.pendingRuntimeRequest || t.pendingRuntimeRequestCount > 0 || t.status === "waiting" ? "Needs your answer" : null,
      model: t.modelSelection?.model || null, branch: t.branch, folder: t.worktreePath, runStartedAt: t.activityRunStartedAt || t.latestRunStartedAt,
      unseen: !t.lastVisitedAt || t.updatedAt > t.lastVisitedAt,
    }));
    const models = {};
    for (const t of shell.threads) if (t.modelSelection?.model) { const provider = t.providerInstanceId || t.modelSelection.instanceId; (models[provider] ??= []); if (!models[provider].includes(t.modelSelection.model)) models[provider].push(t.modelSelection.model); }
    return { projects, threads, models };
  }
  async threadInfo(id) {
    const p = await this.projection(id), t = p.thread, shell = await this.snapshot();
    const project = shell.projects.find((project) => project.id === t.projectId);
    const runs = [...p.runs].sort((a, b) => b.ordinal - a.ordinal);
    const queued = runs.filter((r) => r.status === "queued").sort((a, b) => (a.queuePosition ?? a.ordinal) - (b.queuePosition ?? b.ordinal)).map((r) => ({ id: r.id, text: p.messages.find((m) => m.id === r.userMessageId)?.text?.slice(0, 140) || "(attachment)" }));
    return { id, title: t.title, provider: t.providerInstanceId, model: t.modelSelection?.model, effort: effort(t.modelSelection?.options), root: project?.workspaceRoot, projectTitle: project?.title,
      queued, run: runs[0] ? { id: runs[0].id, status: runs[0].status } : null };
  }
  async items(id, since = "", count = 60) {
    const p = await this.projection(id);
    const items = (p.visibleTurnItems?.length ? p.visibleTurnItems.map((v) => normalize(v.item, v.position)) : p.turnItems.map((v) => normalize(v))).sort((a, b) => a.ordinal - b.ordinal);
    return since ? items.filter((i) => i.updatedAt > since) : items.slice(-count);
  }
  async conversation(id) {
    const p = await this.projection(id), runs = [...p.runs].sort((a, b) => b.ordinal - a.ordinal);
    const queued = runs.filter((r) => r.status === "queued").sort((a, b) => (a.queuePosition ?? a.ordinal) - (b.queuePosition ?? b.ordinal));
    const live = runs.find((r) => active(r.status) && r.status !== "queued");
    const started = new Map(runs.filter((r) => r.userMessageId && r.startedAt).map((r) => [r.userMessageId, r.startedAt]));
    const key = (m) => m.role === "user" && started.get(m.id) > m.createdAt ? started.get(m.id) : m.createdAt;
    const ordered = [...p.messages].map((m, i) => ({ m, i })).sort((a, b) => Date.parse(key(a.m)) - Date.parse(key(b.m)) || a.i - b.i);
    const tail = ordered.slice(-100), have = new Set(tail.map(({m}) => m.id));
    const waiting = ordered.filter(({m}) => queued.some((r) => r.userMessageId === m.id) && !have.has(m.id));
    return [...waiting, ...tail].map(({m}) => {
      const run = runs.find((r) => r.userMessageId === m.id), qi = queued.findIndex((r) => r.userMessageId === m.id);
      return { id: m.id, role: m.role, at: m.createdAt, text: m.text, streaming: m.streaming, run: run?.status || null, queue: qi < 0 ? null : qi + 1,
        ...(qi >= 0 ? { queueRunId: run.id, steerTarget: live?.id || null, queueFixed: !!(m.delegatedCompletion || m.notification), queueGuest: !!m.context?.guest } : {}),
        attachments: (m.attachments || []).map((a) => ({ type: a.type, name: a.name, mime: a.mimeType, size: a.sizeBytes, path: "t3-attachment:" + encodeURIComponent(JSON.stringify({ id: a.id, name: a.name, mime: a.mimeType })) })) };
    });
  }
  async pendingRequests(id) {
    const p = await this.projection(id);
    return p.runtimeRequests.filter((r) => !terminal(r.status)).map((r) => {
      const item = p.turnItems.find((i) => i.requestId === r.id) || {};
      const base = { id: r.id, kind: r.kind, at: r.createdAt, answerable: r.responseCapability?.type !== "not_resumable", reason: r.responseCapability?.reason || null };
      return r.kind === "user_input" ? { ...base, type: "input", questions: (item.questions || r.questions || []).map((q) => ({ ...q, options: q.options || [], multiSelect: !!q.multiSelect, allowCustomAnswer: q.allowCustomAnswer !== false })) }
        : { ...base, type: "approval", requestKind: item.requestKind || r.kind, prompt: item.prompt || "", detail: item.reason || "", options: item.options || [] };
    });
  }
  watchThread(id, onItems, onInfo) {
    let stopped = false, busy = false, first = true; const seen = new Map(); let lastInfo = "";
    const tick = async () => {
      if (stopped || busy) return; busy = true;
      try {
        const items = await this.items(id, "", first ? 14 : 100);
        const fresh = items.filter((i) => seen.get(i.id) !== i.updatedAt);
        const info = await this.threadInfo(id);
        if (stopped) return;
        for (const item of items) seen.set(item.id, item.updatedAt);
        if (first || fresh.length) onItems(fresh, first);
        first = false;
        const sig = JSON.stringify(info); if (sig !== lastInfo) { lastInfo = sig; onInfo(info); }
      } catch (error) { if (!stopped) onInfo({ error: error.message }); }
      finally { busy = false; }
    };
    void tick(); const timer = setInterval(tick, 1800);
    return () => { stopped = true; clearInterval(timer); };
  }
  async sendMessage({ threadId, message }) {
    const paths = String(message).split(/\r?\n/).map((line) => line.match(/^- (?:image|file): (.+)$/)?.[1]).filter(Boolean);
    const attachments = paths.map((file) => this.uploads.get(file)).filter(Boolean);
    const uploaded = new Set(paths.filter((file) => this.uploads.has(file)));
    const text = String(message).split(/\r?\n/).filter((line) => !uploaded.has(line.match(/^- (?:image|file): (.+)$/)?.[1])).join("\n").replace(/\n\nAttached:\s*$/, "");
    const p = await this.projection(threadId);
    await this.rpc.dispatch({ type: "message.dispatch", threadId, messageId: crypto.randomUUID(), text, attachments, createdBy: "user", creationSource: "web",
      dispatchMode: { type: p.runs.some((r) => active(r.status)) ? "queue_after_active" : "start_immediately" } });
    for (const file of paths) this.uploads.delete(file);
    this.projections.delete(threadId); return { ok: true };
  }
  async startThread({ project: projectId, message, provider, model }) {
    const shell = await this.snapshot(), project = shell.projects.find((p) => p.id === projectId);
    const previous = [...shell.threads].filter((t) => t.projectId === projectId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    const selection = project?.defaultModelSelection || previous?.modelSelection;
    if (!selection && (!provider || !model)) throw new Error("Choose a harness and model for the first thread on this machine.");
    const result = await this.rpc.call("orchestration.launchThread", { commandId: crypto.randomUUID(), projectId, title: String(message || "New thread").replace(/\s+/g, " ").slice(0, 80) || "New thread", generateTitle: true,
      modelSelection: { ...selection, ...(provider ? { instanceId: provider } : {}), ...(model ? { model } : {}) }, runtimeMode: previous?.runtimeMode || "approval-required", interactionMode: "default", workspaceStrategy: { type: "root" }, initialMessage: { text: String(message), attachments: [] }, creationSource: "web" });
    return { threadId: result.threadId };
  }
  async selection(id) { const { thread } = await this.projection(id); const ms = thread.modelSelection; return { providerInstanceId: thread.providerInstanceId || ms?.instanceId, model: ms?.model, options: Object.fromEntries((ms?.options || []).map((o) => [o.id, o.value])) }; }
  async readText(file) {
    const shell = await this.snapshot(), normalized = String(file).replace(/\\/g, "/");
    const roots = [...shell.projects.map((p) => p.workspaceRoot), ...shell.threads.map((t) => t.worktreePath).filter(Boolean)];
    const root = roots.filter((p) => normalized.toLowerCase().startsWith(p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() + "/")).sort((a, b) => b.length - a.length)[0];
    if (!root) {
      const resource = await this.resource(file); if (!resource || resource._tag !== "attachment") return null;
      const asset = await this.asset(resource), response = await fetch(asset.url, { signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!response.ok || Number(response.headers.get("content-length")) > 400 * 1024) return null;
      const bytes = Buffer.from(await response.arrayBuffer()); return bytes.length <= 400 * 1024 && !bytes.includes(0) ? bytes.toString("utf8") : null;
    }
    const result = await this.rpc.call("projects.readFile", { cwd: root, relativePath: normalized.slice(root.replace(/[\\/]+$/, "").length + 1) });
    return result.contents;
  }
  listProjects() { return this.world().then((d) => d.projects); }
  listThreads() { return this.world().then((d) => d.threads); }
  listProjectsWithCounts() { return this.world().then((d) => d.projects.map((p) => ({ ...p, count: d.threads.filter((t) => t.projectId === p.id).length }))); }
  office(id) { return this.world().then((d) => ({ project: d.projects.find((p) => p.id === id), threads: d.threads.filter((t) => t.projectId === id) })); }
  itemsSince(id, since) { return this.items(id, since); }
  recentItems(id, count) { return this.items(id, "", count); }
  async status({ threadId } = {}) { await this.snapshot(); return { paired: true, error: null, selection: threadId ? await this.selection(threadId) : null }; }
  async listProviders() {
    const config = await this.rpc.call("server.getConfig", {});
    return (config.providers || []).filter((p) => p.enabled !== false && p.availability !== "unavailable").map((p) => ({
      instanceId: p.instanceId, driver: p.driver, name: p.displayName || p.instanceId, ready: ["ready", "warning"].includes(p.status),
      models: (p.models || []).filter((m) => !m.isLegacy).map((m) => ({ slug: m.slug, name: m.name, shortName: m.shortName || null, isDefault: !!m.isDefault,
        options: (m.capabilities?.optionDescriptors || []).map((o) => ({ id: o.id, label: o.label, type: o.type, choices: o.type === "select" ? (o.options || []).map((c) => ({ id: c.id, label: c.label, isDefault: !!c.isDefault })) : undefined, current: o.currentValue })) })) }));
  }
  setModel(threadId, selection) { return this.rpc.dispatch({ type: "thread.model-selection.set", threadId, modelSelection: { instanceId: selection.providerInstanceId, model: selection.model, options: Object.entries(selection.options || {}).map(([id, value]) => ({ id, value })) } }); }
  respond(threadId, requestId, { answers, decision, feedback }) { return this.rpc.dispatch({ type: "runtime-request.respond", threadId, requestId, ...(decision !== undefined ? { decision, ...(feedback ? {feedback} : {}) } : { answers }) }); }
  addProject({ path, title }) { return this.rpc.call("projects.mutate", { type: "project.create", commandId: crypto.randomUUID(), projectId: crypto.randomUUID(), title: title || path.split(/[\\/]/).filter(Boolean).at(-1), workspaceRoot: path }); }
  removeProject({ id }) { return this.rpc.call("projects.mutate", { type: "project.delete", commandId: crypto.randomUUID(), projectId: id }); }
  async asset(resource) {
    const key = JSON.stringify(resource), cached = this.assets.get(key);
    if (cached && cached.expiresAt > Date.now() + 10000) return cached;
    const value = await this.rpc.call("assets.createUrl", { resource });
    const url = new URL(value.relativeUrl, this.connection.origin);
    if (url.origin !== this.connection.origin) throw new Error("The machine returned an unexpected file address.");
    const result = { ...value, url: url.href }; this.assets.set(key, result); if (resource._tag === "attachment" && value.sourcePath) this.attachmentResources.set(value.sourcePath, resource); return result;
  }
  async resource(file) {
    if (this.attachmentResources.has(file)) return this.attachmentResources.get(file);
    const attachment = String(file).match(/[\\/]\.t3[\\/]userdata[\\/]attachments[\\/]([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?$/);
    if (attachment) return { _tag: "attachment", attachmentId: attachment[1], disposition: "inline" };
    if (file.startsWith("t3-attachment:")) { const a = JSON.parse(decodeURIComponent(file.slice(14))); return { _tag: "attachment", attachmentId: a.id, fileName: a.name, mimeType: a.mime, disposition: "inline" }; }
    const normalized = String(file).replace(/\\/g, "/"), shell = await this.snapshot();
    const project = shell.projects.filter((p) => normalized.toLowerCase().startsWith(p.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() + "/")).sort((a, b) => b.workspaceRoot.length - a.workspaceRoot.length)[0];
    if (project) return { _tag: "draft-workspace-file", cwd: project.workspaceRoot, path: file };
    const t = shell.threads.find((t) => t.worktreePath && normalized.toLowerCase().startsWith(t.worktreePath.replace(/\\/g, "/").toLowerCase() + "/"));
    return t ? { _tag: "media-file", threadId: t.id, path: file } : null;
  }
  async mediaResponse(file) {
    const resource = await this.resource(file); if (!resource) return null;
    const asset = await this.asset(resource);
    return fetch(asset.url, { signal: AbortSignal.timeout(15000), redirect: "error" });
  }
  async readImage(file) {
    const response = await this.mediaResponse(file);
    if (!response?.ok || Number(response.headers.get("content-length")) > 12 * 1024 * 1024) return null;
    const mime = response.headers.get("content-type") || ""; if (!mime.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 12 * 1024 * 1024) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
  async saveAttachment(name, data) {
    const ext = require("node:path").extname(name).toLowerCase();
    const mimeType = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".txt": "text/plain", ".pdf": "application/pdf" })[ext] || "application/octet-stream";
    const bytes = Buffer.from(data), type = mimeType.startsWith("image/") ? "image" : "file";
    const upload = await this.rpc.call("attachments.createUploadUrl", { type, name, mimeType, sizeBytes: bytes.length });
    const url = new URL(upload.relativeUrl, this.connection.origin);
    if (url.origin !== this.connection.origin) throw new Error("The machine returned an unexpected upload address.");
    const response = await fetch(url, { method: "POST", body: bytes, headers: { "content-type": mimeType }, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("The file could not be uploaded to this machine. Retry the attachment.");
    const reference = "t3-attachment:" + encodeURIComponent(JSON.stringify({ id: upload.attachmentId, name, mime: mimeType }));
    this.uploads.set(reference, { type, id: upload.attachmentId, name, mimeType, sizeBytes: bytes.length });
    return reference;
  }
  async readDoc(file) {
    const response = await this.mediaResponse(file);
    if (!response?.ok || Number(response.headers.get("content-length")) > 25 * 1024 * 1024) return { ok: false, error: "The remote document could not be read." };
    const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 25 * 1024 * 1024) return { ok: false, error: "The document is too large to preview." };
    const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "lucid-remote-doc-"));
    const target = path.join(temp, "preview" + path.extname(file));
    try { await fs.writeFile(target, bytes); return await require("./office.cjs").readDoc(target); }
    finally { await fs.unlink(target).catch(() => {}); await fs.rmdir(temp).catch(() => {}); }
  }
  gitInfo() { return Promise.resolve({ ok: false }); }
  close() { this.rpc.close(); }

}

module.exports = { RemoteWorld };
