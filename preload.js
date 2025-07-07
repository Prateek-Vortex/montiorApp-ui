const { contextBridge, ipcRenderer } = require('electron');

console.log("🔧 Preload script loaded");

contextBridge.exposeInMainWorld('electronAPI', {
  storeToken: (token) => {
    console.log("🔑 Storing token...");
    return ipcRenderer.invoke('store-token', token);
  },
  
  getToken: () => {
    console.log("🔑 Getting token...");
    return ipcRenderer.invoke('get-token');
  }
});

console.log("🔧 electronAPI exposed to main world");