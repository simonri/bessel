import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  close: () => ipcRenderer.send("close-window"),
});
