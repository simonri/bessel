import { contextBridge, ipcRenderer } from "electron";
import type { PortEntry } from "./ports.js";
import type {
  VaultChangedEvent,
  VaultDefaultPath,
  VaultEntry,
  VaultIndex,
  VaultInfo,
  VaultReadResult,
  VaultSearchHit,
  VaultWriteResult,
} from "./vault-types.js";

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

function subscribe<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
  predicate?: (...args: Args) => boolean,
): () => void {
  const listener = (_: Electron.IpcRendererEvent, ...args: Args) => {
    if (!predicate || predicate(...args)) callback(...args);
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
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
    onCallback: (callback: (url: string) => void) =>
      subscribe<[string]>("auth:callback", callback),
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
    fetch: (path: string) => ipcRenderer.invoke("git:fetch", path),
    pull: (path: string) => ipcRenderer.invoke("git:pull", path),
    mergeAbort: (path: string) => ipcRenderer.invoke("git:merge-abort", path),
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
    onData: (sessionId: string, callback: (data: string) => void) =>
      subscribe<[string, string]>(
        "terminal:data",
        (_sid, data) => callback(data),
        (sid) => sid === sessionId,
      ),
    onExit: (sessionId: string, callback: (code: number) => void) =>
      subscribe<[string, number]>(
        "terminal:exit",
        (_sid, code) => callback(code),
        (sid) => sid === sessionId,
      ),
  },
  monitor: {
    status: () => ipcRenderer.invoke("monitor:status"),
    install: () => ipcRenderer.invoke("monitor:install"),
    start: () => ipcRenderer.invoke("monitor:start"),
    stop: () => ipcRenderer.invoke("monitor:stop"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("monitor:setEnabled", enabled),
  },
  collector: {
    status: () => ipcRenderer.invoke("collector:status"),
    install: () => ipcRenderer.invoke("collector:install"),
    runNow: () => ipcRenderer.invoke("collector:runNow"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("collector:setEnabled", enabled),
  },
  logs: {
    read: (): Promise<string> => ipcRenderer.invoke("logs:read"),
    reveal: (): Promise<void> => ipcRenderer.invoke("logs:reveal"),
  },
  myAi: {
    status: (): Promise<{ path: string; exists: boolean }> =>
      ipcRenderer.invoke("my-ai:status"),
    create: (): Promise<string> => ipcRenderer.invoke("my-ai:create"),
    reveal: (): Promise<void> => ipcRenderer.invoke("my-ai:reveal"),
  },
  cli: {
    onTokenRequested: (callback: (requestId: string) => void) =>
      subscribe<[string]>("cli:token-requested", callback),
    provideToken: (requestId: string, token: string | null): Promise<void> =>
      ipcRenderer.invoke("cli:provide-token", requestId, token),
    status: (): Promise<{
      installed: boolean;
      shimPath: string;
      onPath: boolean;
      supported: boolean;
    }> => ipcRenderer.invoke("axi-cli:status"),
    install: (): Promise<{ shimPath: string; onPath: boolean }> =>
      ipcRenderer.invoke("axi-cli:install"),
  },
  spotify: {
    getStatus: (): Promise<SpotifyStatus> =>
      ipcRenderer.invoke("spotify:status"),
    playPause: (): Promise<void> => ipcRenderer.invoke("spotify:playPause"),
    next: (): Promise<void> => ipcRenderer.invoke("spotify:next"),
    onStatusChange: (callback: (status: SpotifyStatus) => void) =>
      subscribe<[SpotifyStatus]>("spotify:status-changed", callback),
  },
  ports: {
    list: (): Promise<{ supported: boolean; entries: PortEntry[] }> =>
      ipcRenderer.invoke("ports:list"),
    kill: (pid: number): Promise<void> => ipcRenderer.invoke("ports:kill", pid),
  },
  vault: {
    defaultPath: (): Promise<VaultDefaultPath> =>
      ipcRenderer.invoke("vault:default-path"),
    inspect: (root: string): Promise<VaultInfo> =>
      ipcRenderer.invoke("vault:inspect", root),
    list: (root: string): Promise<VaultEntry[]> =>
      ipcRenderer.invoke("vault:list", root),
    read: (root: string, rel: string): Promise<VaultReadResult> =>
      ipcRenderer.invoke("vault:read", root, rel),
    write: (
      root: string,
      rel: string,
      content: string,
      expectedMtimeMs: number | null,
    ): Promise<VaultWriteResult> =>
      ipcRenderer.invoke("vault:write", root, rel, content, expectedMtimeMs),
    writeBinary: (
      root: string,
      rel: string,
      data: Uint8Array,
    ): Promise<{ rel: string }> =>
      ipcRenderer.invoke("vault:write-binary", root, rel, data),
    create: (
      root: string,
      rel: string,
      content?: string,
    ): Promise<{ rel: string }> =>
      ipcRenderer.invoke("vault:create", root, rel, content ?? ""),
    mkdir: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:mkdir", root, rel),
    rename: (
      root: string,
      from: string,
      to: string,
    ): Promise<{ updatedFiles: number }> =>
      ipcRenderer.invoke("vault:rename", root, from, to),
    trash: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:trash", root, rel),
    reveal: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:reveal", root, rel),
    watch: (root: string): Promise<void> =>
      ipcRenderer.invoke("vault:watch", root),
    unwatch: (root: string): Promise<void> =>
      ipcRenderer.invoke("vault:unwatch", root),
    onChanged: (callback: (event: VaultChangedEvent) => void) =>
      subscribe<[VaultChangedEvent]>("vault:changed", callback),
    index: (root: string): Promise<VaultIndex> =>
      ipcRenderer.invoke("vault:index", root),
    search: (root: string, query: string): Promise<VaultSearchHit[]> =>
      ipcRenderer.invoke("vault:search", root, query),
  },
});
