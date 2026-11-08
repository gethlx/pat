const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pat", {
  getAppTitle: () => ipcRenderer.invoke("pat:getAppTitle"),
  getState: () => ipcRenderer.invoke("pat:getState"),
  saveConfig: (config) => ipcRenderer.invoke("pat:saveConfig", config),
  showSettings: () => ipcRenderer.invoke("pat:showSettings"),
  showWorkbench: () => ipcRenderer.invoke("pat:showWorkbench"),
  probeReady: () => ipcRenderer.invoke("pat:probeReady"),
  dispatch: (payload) => ipcRenderer.invoke("pat:dispatch", payload),
  stopTask: () => ipcRenderer.invoke("pat:stop"),
  releaseTask: () => ipcRenderer.invoke("pat:release"),
  redispatch: () => ipcRenderer.invoke("pat:redispatch"),
  selectTask: (id) => ipcRenderer.invoke("pat:selectTask", id),
  newTask: () => ipcRenderer.invoke("pat:newTask"),
  confirmTask: () => ipcRenderer.invoke("pat:confirmTask"),
  continueSync: () => ipcRenderer.invoke("pat:continueSync"),
  onState: (callback) => {
    ipcRenderer.on("pat:state", (_event, state) => callback(state));
  },
});
