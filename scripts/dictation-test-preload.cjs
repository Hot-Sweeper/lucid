const { contextBridge, ipcRenderer } = require('electron');
const call = channel => async value => {
  const result = await ipcRenderer.invoke(`dictation:${channel}`, value);
  if (!result?.ok) throw new Error(result?.error || 'Dictation did not answer.');
  return result.value;
};
contextBridge.exposeInMainWorld('dictation', {
  load: call('load'),
  run: call('run'),
  copy: text => ipcRenderer.invoke('dictation:copy', text),
});
