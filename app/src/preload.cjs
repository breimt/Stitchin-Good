const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ecsLibrary", Object.freeze({
  getState: () => ipcRenderer.invoke("library:get-state"),
  chooseFolder: () => ipcRenderer.invoke("library:choose-folder"),
  search: (options) => ipcRenderer.invoke("library:search", options),
  thumbnail: (id) => ipcRenderer.invoke("library:thumbnail", id),
}));
