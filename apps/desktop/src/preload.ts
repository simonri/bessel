import { contextBridge, ipcRenderer } from "electron";
import type {
  ClaudeConversation,
  ClaudeSessionsSnapshot,
  ClaudeSessionView,
  CreateClaudeSessionInput,
} from "./claude-sessions-types.js";
import type { PortEntry } from "./ports.js";
import type {
  VaultChangedEvent,
  VaultDefaultPath,
  VaultEntry,
  VaultIndex,
  VaultInfo,
  VaultReadResult,
  VaultRenameOptions,
  VaultRenameResult,
  VaultSearchHit,
  VaultWriteResult,
} from "./vault-types.js";

// Mirrors TRUSTED_ORIGINS in ipc.ts, which a sandboxed preload can't import.
// Main still rejects the dev origin in packaged builds; this only keeps the
// bridge off pages that should never see it (e.g. a login provider's page).
const BRIDGE_ORIGINS = new Set(["app://localhost", "http://localhost:3001"]);

function isTrustedLocation(): boolean {
  return BRIDGE_ORIGINS.has(`${location.protocol}//${location.host}`);
}

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

const bridge = {
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
  selectFolder: (purpose?: "vault"): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-folder", purpose),
  sshListDir: (
    host: string,
    dirPath: string,
  ): Promise<{ cwd: string; dirs: string[] }> =>
    ipcRenderer.invoke("ssh:list-dir", host, dirPath),
  ssh: {
    hosts: (): Promise<{ hosts: string[]; configExists: boolean }> =>
      ipcRenderer.invoke("ssh:hosts"),
    openConfig: (): Promise<void> => ipcRenderer.invoke("ssh:open-config"),
    mkdir: (host: string, parent: string, name: string): Promise<string> =>
      ipcRenderer.invoke("ssh:mkdir", host, parent, name),
  },
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
    ): Promise<number | undefined> =>
      ipcRenderer.invoke("terminal:spawn", sessionId, cols, rows, config),
    sendInput: (sessionId: string, data: string) =>
      ipcRenderer.send("terminal:input", sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send("terminal:resize", sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.send("terminal:kill", sessionId),
    onData: (
      sessionId: string,
      callback: (data: string, generation?: number) => void,
    ) =>
      subscribe<[string, string, number | undefined]>(
        "terminal:data",
        (_sid, data, generation) => callback(data, generation),
        (sid) => sid === sessionId,
      ),
    onExit: (
      sessionId: string,
      callback: (code: number, generation?: number) => void,
    ) =>
      subscribe<[string, number, number | undefined]>(
        "terminal:exit",
        (_sid, code, generation) => callback(code, generation),
        (sid) => sid === sessionId,
      ),
  },
  claudeSessions: {
    snapshot: (): Promise<ClaudeSessionsSnapshot> =>
      ipcRenderer.invoke("claudeSessions:snapshot"),
    create: (input: CreateClaudeSessionInput): Promise<ClaudeSessionView> =>
      ipcRenderer.invoke("claudeSessions:create", input),
    resume: (key: string): Promise<ClaudeSessionView> =>
      ipcRenderer.invoke("claudeSessions:resume", key),
    end: (key: string): Promise<void> =>
      ipcRenderer.invoke("claudeSessions:end", key),
    rename: (key: string, name: string): Promise<ClaudeSessionView> =>
      ipcRenderer.invoke("claudeSessions:rename", key, name),
    remove: (key: string): Promise<void> =>
      ipcRenderer.invoke("claudeSessions:remove", key),
    adopt: (bgId: string, projectId?: string): Promise<ClaudeSessionView> =>
      ipcRenderer.invoke("claudeSessions:adopt", bgId, projectId),
    remoteUrl: (key: string): Promise<string | null> =>
      ipcRenderer.invoke("claudeSessions:remoteUrl", key),
    conversations: (cwd: string): Promise<ClaudeConversation[]> =>
      ipcRenderer.invoke("claudeSessions:conversations", cwd),
    onChanged: (callback: (snapshot: ClaudeSessionsSnapshot) => void) =>
      subscribe<[ClaudeSessionsSnapshot]>("claudeSessions:changed", callback),
    onOpenRequested: (callback: (key: string) => void) =>
      subscribe<[string]>("claudeSessions:open", callback),
  },
  monitor: {
    status: () => ipcRenderer.invoke("monitor:status"),
    install: (ingestToken: string) =>
      ipcRenderer.invoke("monitor:install", ingestToken),
    start: () => ipcRenderer.invoke("monitor:start"),
    stop: () => ipcRenderer.invoke("monitor:stop"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("monitor:setEnabled", enabled),
  },
  collector: {
    status: () => ipcRenderer.invoke("collector:status"),
    install: (ingestToken: string) =>
      ipcRenderer.invoke("collector:install", ingestToken),
    runNow: () => ipcRenderer.invoke("collector:runNow"),
    setEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("collector:setEnabled", enabled),
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
    getPositionMs: (): Promise<number | null> =>
      ipcRenderer.invoke("spotify:position"),
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
      options?: VaultRenameOptions,
    ): Promise<VaultRenameResult> =>
      ipcRenderer.invoke("vault:rename", root, from, to, options),
    trash: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:trash", root, rel),
    reveal: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:reveal", root, rel),
    copyImage: (root: string, rel: string): Promise<void> =>
      ipcRenderer.invoke("vault:copy-image", root, rel),
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
};

if (isTrustedLocation()) contextBridge.exposeInMainWorld("electron", bridge);
