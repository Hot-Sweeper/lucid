const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("lucid", {
  mobileAccessStatus: () => ipcRenderer.invoke('mobile:status'),
  mobileAccessSetup: () => ipcRenderer.invoke('mobile:setup'),
  mobileAccessDisable: () => ipcRenderer.invoke('mobile:disable'),
  localize: (input) => ipcRenderer.invoke('lucid:localize', input),
  projects: () => ipcRenderer.invoke("t3:projects"),
  threads: () => ipcRenderer.invoke("t3:threads"),
  watchSet: (ids) => ipcRenderer.invoke("t3:watch-set", ids),
  office: (projectId) => ipcRenderer.invoke("t3:office", projectId),
  offices: () => ipcRenderer.invoke("t3:offices"),
  world: () => ipcRenderer.invoke("t3:world"),
  environments: (fresh = false) => ipcRenderer.invoke("environment:list", fresh),
  buildingWorld: (id) => ipcRenderer.invoke("environment:world", id),
  selectEnvironment: (id) => ipcRenderer.invoke("environment:select", id),
  tasks: () => ipcRenderer.invoke("t3:tasks"),
  rosterLoad: () => ipcRenderer.sendSync("roster:load"),
  settingsLoad: () => ipcRenderer.sendSync("settings:load"),
  settingsSave: (json) => ipcRenderer.invoke("settings:save", json),
  addProject: (o) => ipcRenderer.invoke("project:add", o),
  orchInit: (o) => ipcRenderer.invoke("orch:init", o),
  approvalPapers: () => ipcRenderer.invoke("orch:approval-papers"),
  reportsList: () => ipcRenderer.invoke("reports:list"),
  reportsSubmit: (id, robot) => ipcRenderer.invoke("reports:submit", id, robot),
  reportsTick: (arrived) => ipcRenderer.invoke("reports:tick", arrived),
  reportsManual: (id, action, values) => ipcRenderer.invoke("reports:manual", id, action, values),
  orchMemory: () => ipcRenderer.invoke("orch:memory"),
  orchDialogs: () => ipcRenderer.invoke("orch:dialogs"),
  writerDaily: (input) => ipcRenderer.invoke("writer:daily", input),
  writerModel: () => ipcRenderer.invoke("writer:model"),
  orchAnswers: () => ipcRenderer.invoke("orch:answers"),
  orchRecord: (list) => ipcRenderer.invoke("orch:record", list),
  orchDecisions: () => ipcRenderer.invoke("orch:decisions"),
  orchLog: (d) => ipcRenderer.invoke("orch:log", d),
  requestContext: (id) => ipcRenderer.invoke("t3:request-context", id),
  repliesSince: (id, since) => ipcRenderer.invoke("t3:replies-since", id, since),
  resolvedSince: (since) => ipcRenderer.invoke("t3:resolved-since", since),
  userMessagesSince: (since, exclude) => ipcRenderer.invoke("t3:user-messages", since, exclude),
  removeProject: (o) => ipcRenderer.invoke("project:remove", o),
  host: () => ipcRenderer.invoke("app:host"),
  usage: () => ipcRenderer.invoke("usage:get"),
  coinUsage: () => ipcRenderer.invoke("coins:usage"),
  weather: () => ipcRenderer.invoke("weather:get"),
  saveAttachment: (name, data) => ipcRenderer.invoke("attach:save", { name, data }),
  rosterSave: (json) => ipcRenderer.invoke("roster:save", json),
  conversation: (id) => ipcRenderer.invoke("t3:conversation", id),
  conversationPage: (id, options) => ipcRenderer.invoke("t3:conversation-page", id, options),
  pendingRequests: (id) => ipcRenderer.invoke("t3:pending-requests", id),
  requestOutcome: (threadId, requestId) => ipcRenderer.invoke("t3:request-outcome", threadId, requestId),
  itemsSince: (id, since) => ipcRenderer.invoke("t3:items-since", id, since),
  threadInfo: (id) => ipcRenderer.invoke("t3:thread-info", id),
  attachDir: () => ipcRenderer.invoke("t3:attach-dir"),
  startThread: (opts) => ipcRenderer.invoke("t3:start", opts),
  sendMessage: (opts) => ipcRenderer.invoke("t3:send", opts),
  peek: (url) => ipcRenderer.invoke("web:peek", url),
  shot: (req) => ipcRenderer.invoke("web:shot", req),
  frontendFrame: (req) => ipcRenderer.invoke("frontend:frame", req),
  siteFetch: (url, as) => ipcRenderer.invoke("site:fetch", url, as),
  webSearch: (q) => ipcRenderer.invoke("web:search", q),
  gitInfo: (root) => ipcRenderer.invoke("git:info", root),
  image: (p) => ipcRenderer.invoke("fs:image", p),
  readText: (p) => ipcRenderer.invoke("fs:text", p),
  statFiles: (paths) => ipcRenderer.invoke("fs:stat", paths),
  revealFile: (p) => ipcRenderer.invoke("fs:reveal", p),
  onItems: on("t3:items"),
  onInfo: on("t3:info"),
  checkUpdate: () => ipcRenderer.invoke("app:check-update"),
  applyUpdate: () => ipcRenderer.invoke("app:apply-update"),
  onUpdateStep: on("app:update-step"),
  version: () => ipcRenderer.invoke("app:version"),
});

// T3 server actions that need Lucid's paired session. Each call resolves with the value or rejects with a readable message.
const t3s = (channel) => async (arg) => {
  const r = await ipcRenderer.invoke(channel, arg);
  if (!r?.ok) { const err = new Error(r?.error || "T3 did not answer."); err.code = r?.code; throw err; }
  return r.value;
};
contextBridge.exposeInMainWorld("lucidT3", {
  manager: t3s("t3s:manager"),
  managerSuggest: t3s("t3s:manager-suggest"),
  managerAvatar: t3s("t3s:manager-avatar"),
  managerAvatarHistory: t3s("t3s:manager-avatar-history"),
  managerAvatarAsk: t3s("t3s:manager-avatar-ask"),
  status: t3s("t3s:status"),
  providers: t3s("t3s:providers"),
  hireConfig: t3s("t3s:hire-config"),
  hireContexts: t3s("t3s:hire-contexts"),
  reorder: t3s("t3s:reorder"),
  moveThread: t3s("t3s:move-thread"),
  cancel: t3s("t3s:cancel"),
  settle: t3s("t3s:settle"),
  edit: t3s("t3s:edit"),
  steer: t3s("t3s:steer"),
  setModel: t3s("t3s:setModel"),
  respond: t3s("t3s:respond"),
});

// Office documents for the robots' Botword, Cellsheet and Slidedeck: { ok, doc } or { ok: false, error }.
// Real market data for Tradebot: { ok, value } or { ok: false, error }.
contextBridge.exposeInMainWorld("lucidMarket", {
  klines: (symbol, interval) => ipcRenderer.invoke("market:klines", symbol, interval),
  price: (symbol) => ipcRenderer.invoke("market:price", symbol),
});
contextBridge.exposeInMainWorld("lucidDocs", { read: (p) => ipcRenderer.invoke("doc:read", p) });

const dictationCall = (channel) => async (value) => {
  const result = await ipcRenderer.invoke(`dictation:${channel}`, value);
  if (!result?.ok) throw new Error(result?.error || 'Dictation did not answer. Try again.');
  return result.value;
};
contextBridge.exposeInMainWorld('lucidDictation', {
  load: dictationCall('load'),
  run: dictationCall('run'),
  cancel: dictationCall('cancel'),
});
