const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("lucid", {
  projects: () => ipcRenderer.invoke("t3:projects"),
  threads: () => ipcRenderer.invoke("t3:threads"),
  watchSet: (ids) => ipcRenderer.invoke("t3:watch-set", ids),
  office: (projectId) => ipcRenderer.invoke("t3:office", projectId),
  offices: () => ipcRenderer.invoke("t3:offices"),
  world: () => ipcRenderer.invoke("t3:world"),
  rosterLoad: () => ipcRenderer.sendSync("roster:load"),
  settingsLoad: () => ipcRenderer.sendSync("settings:load"),
  settingsSave: (json) => ipcRenderer.invoke("settings:save", json),
  addProject: (o) => ipcRenderer.invoke("project:add", o),
  orchInit: (o) => ipcRenderer.invoke("orch:init", o),
  orchMemory: () => ipcRenderer.invoke("orch:memory"),
  userMessagesSince: (since, exclude) => ipcRenderer.invoke("t3:user-messages", since, exclude),
  removeProject: (o) => ipcRenderer.invoke("project:remove", o),
  host: () => ipcRenderer.invoke("app:host"),
  usage: () => ipcRenderer.invoke("usage:get"),
  weather: () => ipcRenderer.invoke("weather:get"),
  saveAttachment: (name, data) => ipcRenderer.invoke("attach:save", { name, data }),
  rosterSave: (json) => ipcRenderer.invoke("roster:save", json),
  conversation: (id) => ipcRenderer.invoke("t3:conversation", id),
  itemsSince: (id, since) => ipcRenderer.invoke("t3:items-since", id, since),
  attachDir: () => ipcRenderer.invoke("t3:attach-dir"),
  startThread: (opts) => ipcRenderer.invoke("t3:start", opts),
  sendMessage: (opts) => ipcRenderer.invoke("t3:send", opts),
  peek: (url) => ipcRenderer.invoke("web:peek", url),
  image: (p) => ipcRenderer.invoke("fs:image", p),
  readText: (p) => ipcRenderer.invoke("fs:text", p),
  onItems: on("t3:items"),
  onInfo: on("t3:info"),
  checkUpdate: () => ipcRenderer.invoke("app:check-update"),
  applyUpdate: () => ipcRenderer.invoke("app:apply-update"),
  onUpdateStep: on("app:update-step"),
  version: () => ipcRenderer.invoke("app:version"),
});
