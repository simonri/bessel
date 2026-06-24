import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  close: () => ipcRenderer.send("close-window"),
  terminal: {
    spawn: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke("terminal:spawn", sessionId, cols, rows),
    sendInput: (sessionId: string, data: string) =>
      ipcRenderer.send("terminal:input", sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send("terminal:resize", sessionId, cols, rows),
    kill: (sessionId: string) =>
      ipcRenderer.send("terminal:kill", sessionId),
    onData: (sessionId: string, callback: (data: string) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        sid: string,
        data: string
      ) => {
        if (sid === sessionId) callback(data);
      };
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (sessionId: string, callback: (code: number) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        sid: string,
        code: number
      ) => {
        if (sid === sessionId) callback(code);
      };
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
  },
});
