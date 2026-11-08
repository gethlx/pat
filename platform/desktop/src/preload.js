const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pat", {
  getAppTitle: () => ipcRenderer.invoke("pat:getAppTitle"),
  getState: () => ipcRenderer.invoke("pat:getState"),
  saveConfig: (config) => ipcRenderer.invoke("pat:saveConfig", config),
  showSettings: () => ipcRenderer.invoke("pat:showSettings"),
  showWorkbench: () => ipcRenderer.invoke("pat:showWorkbench"),
  probeReady: () => ipcRenderer.invoke("pat:probeReady"),
});
