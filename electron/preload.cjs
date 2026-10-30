const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("lucid", {
  projects: () => ipcRenderer.invoke("t3:projects"),
  threads: () => ipcRenderer.invoke("t3:threads"),
  watch: (threadId) => ipcRenderer.invoke("t3:watch", threadId),
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
