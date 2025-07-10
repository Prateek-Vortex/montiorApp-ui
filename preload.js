const { contextBridge, ipcRenderer } = require('electron');

console.log("🔧 Preload script loaded");

contextBridge.exposeInMainWorld('electronAPI', {
  storeToken: (token) => ipcRenderer.invoke('store-token', token),
  getToken: () => ipcRenderer.invoke('get-token'),
  closeSidebar: () => ipcRenderer.send('close-sidebar'),
  getClipboardHistory: () => ipcRenderer.invoke('get-clipboard-history'),
  copyClipboardItem: (content) => ipcRenderer.invoke('copy-clipboard-item', content),
  //pasteInPreviousApp: () => ipcRenderer.invoke('paste-in-previous-app')
});


console.log("🔧 electronAPI exposed to main world");
