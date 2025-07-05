const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  storeToken: (token) => ipcRenderer.invoke('store-token', token)
});
