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
