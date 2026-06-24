import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  close: () => ipcRenderer.send("close-window"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),
  selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  git: {
    status: (path: string) => ipcRenderer.invoke("git:status", path),
    diff: (path: string, file: string, staged: boolean, untracked: boolean) =>
      ipcRenderer.invoke("git:diff", path, file, staged, untracked),
    stage: (path: string, files: string[]) => ipcRenderer.invoke("git:stage", path, files),
    unstage: (path: string, files: string[]) => ipcRenderer.invoke("git:unstage", path, files),
    commit: (path: string, message: string) => ipcRenderer.invoke("git:commit", path, message),
    push: (path: string) => ipcRenderer.invoke("git:push", path),
  },
  terminal: {
    spawn: (sessionId: string, cols: number, rows: number, config: { command: string; args: string[]; cwd?: string }) =>
      ipcRenderer.invoke("terminal:spawn", sessionId, cols, rows, config),
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
