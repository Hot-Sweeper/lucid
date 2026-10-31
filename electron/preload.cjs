const { contextBridge, ipcRenderer } = require("electron");

let environmentId = "local";
const scoped = (channel, ...args) => ipcRenderer.invoke(channel, environmentId, ...args);
const on = (channel) => (fn) => {
  const handler = (_e, payload) => { if (!payload?.environmentId || payload.environmentId === environmentId) fn(payload); };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("lucid", {
  environments: () => ipcRenderer.invoke("environments:list"),
  selectEnvironment: async (id) => { const result = await ipcRenderer.invoke("environments:select", id); environmentId = result.id; return result; },
  projects: () => scoped("t3:projects"),
  threads: () => scoped("t3:threads"),
  watchSet: (ids) => scoped("t3:watch-set", ids),
  office: (projectId) => scoped("t3:office", projectId),
  offices: () => scoped("t3:offices"),
  world: () => scoped("t3:world"),
  rosterLoad: () => ipcRenderer.sendSync("roster:load", environmentId),
  settingsLoad: () => ipcRenderer.sendSync("settings:load"),
  settingsSave: (json) => ipcRenderer.invoke("settings:save", json),
  addProject: (o) => scoped("project:add", o),
  orchInit: (o) => scoped("orch:init", o),
  orchMemory: () => ipcRenderer.invoke("orch:memory"),
  orchDialogs: () => ipcRenderer.invoke("orch:dialogs"),
  userMessagesSince: (since, exclude) => scoped("t3:user-messages", since, exclude),
  removeProject: (o) => scoped("project:remove", o),
  host: () => ipcRenderer.invoke("app:host"),
  usage: () => ipcRenderer.invoke("usage:get"),
  weather: () => ipcRenderer.invoke("weather:get"),
  saveAttachment: (name, data) => scoped("attach:save", { name, data }),
  rosterSave: (json) => scoped("roster:save", json),
  conversation: (id) => scoped("t3:conversation", id),
  pendingRequests: (id) => scoped("t3:pending-requests", id),
  itemsSince: (id, since) => scoped("t3:items-since", id, since),
  threadInfo: (id) => scoped("t3:thread-info", id),
  attachDir: () => scoped("t3:attach-dir"),
  startThread: (opts) => scoped("t3:start", opts),
  sendMessage: (opts) => scoped("t3:send", opts),
  peek: (url) => ipcRenderer.invoke("web:peek", url),
  siteFetch: (url, as) => ipcRenderer.invoke("site:fetch", url, as),
  webSearch: (q) => ipcRenderer.invoke("web:search", q),
  gitInfo: (root) => scoped("git:info", root),
  image: (p) => scoped("fs:image", p),
  readText: (p) => scoped("fs:text", p),
  onItems: on("t3:items"),
  onInfo: on("t3:info"),
  checkUpdate: () => ipcRenderer.invoke("app:check-update"),
  applyUpdate: () => ipcRenderer.invoke("app:apply-update"),
  onUpdateStep: on("app:update-step"),
  version: () => ipcRenderer.invoke("app:version"),
});

// T3 server actions that need Lucid's paired session. Each call resolves with the value or rejects with a readable message.
const t3s = (channel) => async (arg) => {
  const r = await scoped(channel, arg);
  if (!r?.ok) { const err = new Error(r?.error || "T3 did not answer."); err.code = r?.code; throw err; }
  return r.value;
};
contextBridge.exposeInMainWorld("lucidT3", {
  status: t3s("t3s:status"),
  providers: t3s("t3s:providers"),
  reorder: t3s("t3s:reorder"),
  cancel: t3s("t3s:cancel"),
  edit: t3s("t3s:edit"),
  steer: t3s("t3s:steer"),
  setModel: t3s("t3s:setModel"),
  respond: t3s("t3s:respond"),
});

// Office documents for the robots' Botword, Cellsheet and Slidedeck: { ok, doc } or { ok: false, error }.
contextBridge.exposeInMainWorld("lucidDocs", { read: (p) => scoped("doc:read", p) });
