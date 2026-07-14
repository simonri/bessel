import { contextBridge, ipcRenderer } from "electron";

interface SpotifyStatus {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  lengthMs?: number;
  positionMs?: number;
}

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  close: () => ipcRenderer.send("close-window"),
  auth: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke("auth:get", key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke("auth:set", key, value),
    remove: (key: string): Promise<void> =>
      ipcRenderer.invoke("auth:remove", key),
    allKeys: (): Promise<string[]> => ipcRenderer.invoke("auth:all-keys"),
    startLogin: (): Promise<number> => ipcRenderer.invoke("auth:start-login"),
    onCallback: (callback: (url: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, url: string) =>
        callback(url);
      ipcRenderer.on("auth:callback", listener);
      return () => ipcRenderer.removeListener("auth:callback", listener);
    },
  },
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdate: () => ipcRenderer.invoke("app:check-update"),
  device: {
    getInfo: (): Promise<{ key: string; name: string }> =>
      ipcRenderer.invoke("device:get-info"),
  },
  selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  sshListDir: (
    host: string,
    dirPath: string,
  ): Promise<{ cwd: string; dirs: string[] }> =>
    ipcRenderer.invoke("ssh:list-dir", host, dirPath),
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:open-external", url),
  },
  git: {
    status: (path: string) => ipcRenderer.invoke("git:status", path),
    diff: (path: string, file: string, staged: boolean, untracked: boolean) =>
      ipcRenderer.invoke("git:diff", path, file, staged, untracked),
    stage: (path: string, files: string[]) =>
      ipcRenderer.invoke("git:stage", path, files),
    unstage: (path: string, files: string[]) =>
      ipcRenderer.invoke("git:unstage", path, files),
    commit: (path: string, message: string) =>
      ipcRenderer.invoke("git:commit", path, message),
    push: (path: string) => ipcRenderer.invoke("git:push", path),
    log: (path: string, limit?: number) =>
      ipcRenderer.invoke("git:log", path, limit),
    discard: (path: string, trackedFiles: string[], untrackedFiles: string[]) =>
      ipcRenderer.invoke("git:discard", path, trackedFiles, untrackedFiles),
  },
  terminal: {
    spawn: (
      sessionId: string,
      cols: number,
      rows: number,
      config: { command: string; args: string[]; cwd?: string },
    ) => ipcRenderer.invoke("terminal:spawn", sessionId, cols, rows, config),
    sendInput: (sessionId: string, data: string) =>
      ipcRenderer.send("terminal:input", sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send("terminal:resize", sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.send("terminal:kill", sessionId),
    onData: (sessionId: string, callback: (data: string) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        sid: string,
        data: string,
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
        code: number,
      ) => {
        if (sid === sessionId) callback(code);
      };
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
  },
  monitor: {
    status: () => ipcRenderer.invoke("monitor:status"),
    install: () => ipcRenderer.invoke("monitor:install"),
    start: () => ipcRenderer.invoke("monitor:start"),
    stop: () => ipcRenderer.invoke("monitor:stop"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("monitor:setEnabled", enabled),
  },
  logs: {
    read: (): Promise<string> => ipcRenderer.invoke("logs:read"),
    reveal: (): Promise<void> => ipcRenderer.invoke("logs:reveal"),
  },
  spotify: {
    getStatus: (): Promise<SpotifyStatus> =>
      ipcRenderer.invoke("spotify:status"),
    playPause: (): Promise<void> => ipcRenderer.invoke("spotify:playPause"),
    next: (): Promise<void> => ipcRenderer.invoke("spotify:next"),
    onStatusChange: (callback: (status: SpotifyStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, status: SpotifyStatus) =>
        callback(status);
      ipcRenderer.on("spotify:status-changed", listener);
      return () =>
        ipcRenderer.removeListener("spotify:status-changed", listener);
    },
  },
});
