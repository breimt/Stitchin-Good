const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ecsLibrary", Object.freeze({
  getState: () => ipcRenderer.invoke("library:get-state"),
  chooseFolder: () => ipcRenderer.invoke("library:choose-folder"),
  search: (options) => ipcRenderer.invoke("library:search", options),
  thumbnail: (id) => ipcRenderer.invoke("library:thumbnail", id),
  details: (id) => ipcRenderer.invoke("library:details", id),
}));

contextBridge.exposeInMainWorld("ecsSerial", Object.freeze({
  onPorts: (callback) => {
    const listener = (_event, ports) => callback(ports);
    ipcRenderer.on("serial:ports", listener);
    return () => ipcRenderer.removeListener("serial:ports", listener);
  },
  selectPort: (portId) => ipcRenderer.send("serial:select-port", portId),
}));

contextBridge.exposeInMainWorld("ecsCard", Object.freeze({
  inspect: (bytes) => ipcRenderer.invoke("card:inspect", bytes),
  thumbnail: (id) => ipcRenderer.invoke("card:thumbnail", id),
  details: (id) => ipcRenderer.invoke("card:details", id),
  saveBackup: () => ipcRenderer.invoke("card:save-backup"),
  exportDesign: (id) => ipcRenderer.invoke("card:export-design", id),
  exportAll: () => ipcRenderer.invoke("card:export-all"),
}));
