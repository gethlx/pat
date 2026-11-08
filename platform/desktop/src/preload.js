const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pat", {
  getAppTitle: () => ipcRenderer.invoke("pat:getAppTitle"),
});
