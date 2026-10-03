import type {
  ClaudeConversation,
  ClaudeSessionsSnapshot,
  ClaudeSessionView,
  CreateClaudeSessionInput,
} from "../components/claude-sessions/claude-sessions-types";
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
} from "../components/obsidian/vault-types";

interface ElectronPortEntry {
  port: number;
  address: string;
  pid: number;
  processName: string;
  cmdline: string;
  cwd: string | null;
  ageSeconds: number | null;
}

interface ElectronSpotifyStatus {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  lengthMs?: number;
  positionMs?: number;
}

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      close: () => void;
      auth: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        remove: (key: string) => Promise<void>;
        allKeys: () => Promise<string[]>;
        startLogin: () => Promise<number>;
        onCallback: (callback: (url: string) => void) => () => void;
      };
      getVersion: () => Promise<string>;
      checkForUpdate: () => Promise<{
        status: "dev" | "available" | "up-to-date" | "error";
        version?: string;
        message?: string;
      }>;
      device: {
        getInfo: () => Promise<{ key: string; name: string }>;
      };
      /** Only a `"vault"` pick grants the folder vault access. */
      selectFolder: (purpose?: "vault") => Promise<string | null>;
      sshListDir: (
        host: string,
        dirPath: string,
      ) => Promise<{ cwd: string; dirs: string[] }>;
      git: {
        status: (path: string) => Promise<{
          branch: string;
          ahead: number;
          behind: number;
          mergeInProgress: boolean;
          staged: Array<{
            path: string;
            originalPath?: string;
            status: string;
          }>;
          unstaged: Array<{
            path: string;
            originalPath?: string;
            status: string;
          }>;
          untracked: Array<{ path: string; status: string }>;
          conflicted: Array<{ path: string; status: string }>;
        }>;
        diff: (
          path: string,
          file: string,
          staged: boolean,
          untracked: boolean,
        ) => Promise<
          | {
              kind: "text";
              diff: string;
              oldContent: string;
              newContent: string;
            }
          | { kind: "image"; oldImage: string | null; newImage: string | null }
        >;
        stage: (path: string, files: string[]) => Promise<void>;
        unstage: (path: string, files: string[]) => Promise<void>;
        commit: (path: string, message: string) => Promise<void>;
        push: (path: string) => Promise<void>;
        fetch: (path: string) => Promise<void>;
        pull: (path: string) => Promise<{ status: "ok" | "conflict" }>;
        mergeAbort: (path: string) => Promise<void>;
        discard: (
          path: string,
          trackedFiles: string[],
          untrackedFiles: string[],
        ) => Promise<void>;
        log: (
          path: string,
          limit?: number,
        ) => Promise<
          Array<{
            hash: string;
            shortHash: string;
            subject: string;
            author: string;
            date: string;
            refs: string;
          }>
        >;
      };
      terminal: {
        spawn: (
          sessionId: string,
          cols: number,
          rows: number,
          config: { command: string; args: string[]; cwd?: string },
        ) => Promise<number | undefined>;
        sendInput: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        kill: (sessionId: string) => void;
        /** `generation` is the value `spawn` resolved with for that PTY. */
        onData: (
          sessionId: string,
          callback: (data: string, generation?: number) => void,
        ) => () => void;
        onExit: (
          sessionId: string,
          callback: (code: number, generation?: number) => void,
        ) => () => void;
      };
      claudeSessions: {
        snapshot: () => Promise<ClaudeSessionsSnapshot>;
        create: (input: CreateClaudeSessionInput) => Promise<ClaudeSessionView>;
        resume: (key: string) => Promise<ClaudeSessionView>;
        end: (key: string) => Promise<void>;
        rename: (key: string, name: string) => Promise<ClaudeSessionView>;
        remove: (key: string) => Promise<void>;
        adopt: (bgId: string, projectId?: string) => Promise<ClaudeSessionView>;
        remoteUrl: (key: string) => Promise<string | null>;
        conversations: (cwd: string) => Promise<ClaudeConversation[]>;
        onChanged: (
          callback: (snapshot: ClaudeSessionsSnapshot) => void,
        ) => () => void;
        onOpenRequested: (callback: (key: string) => void) => () => void;
      };
      monitor: {
        status: () => Promise<{
          installed: boolean;
          active: boolean;
          enabled: boolean;
          failed: boolean;
          state: string;
          needsConfig: boolean;
          idleSource: string | null;
          idleWarning: string | null;
        }>;
        install: (ingestToken: string) => Promise<void>;
        start: () => Promise<void>;
        stop: () => Promise<void>;
        setEnabled: (enabled: boolean) => Promise<void>;
      };
      collector: {
        status: () => Promise<{
          installed: boolean;
          active: boolean;
          enabled: boolean;
          failed: boolean;
          state: string;
          needsConfig: boolean;
          envPath: string;
        }>;
        install: (ingestToken: string) => Promise<void>;
        runNow: () => Promise<void>;
        setEnabled: (enabled: boolean) => Promise<void>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      logs: {
        read: () => Promise<string>;
        reveal: () => Promise<void>;
      };
      spotify: {
        getStatus: () => Promise<ElectronSpotifyStatus>;
        playPause: () => Promise<void>;
        next: () => Promise<void>;
        /** Absent in desktop builds before 0.1.44. */
        getPositionMs?: () => Promise<number | null>;
        onStatusChange: (
          callback: (status: ElectronSpotifyStatus) => void,
        ) => () => void;
      };
      ports: {
        list: () => Promise<{
          supported: boolean;
          entries: ElectronPortEntry[];
        }>;
        kill: (pid: number) => Promise<void>;
      };
      vault: {
        defaultPath: () => Promise<VaultDefaultPath>;
        inspect: (root: string) => Promise<VaultInfo>;
        list: (root: string) => Promise<VaultEntry[]>;
        read: (root: string, rel: string) => Promise<VaultReadResult>;
        /** Throws an Error whose message contains VAULT_CONFLICT_ERROR when
         *  `expectedMtimeMs` is set and the file changed on disk. */
        write: (
          root: string,
          rel: string,
          content: string,
          expectedMtimeMs: number | null,
        ) => Promise<VaultWriteResult>;
        writeBinary: (
          root: string,
          rel: string,
          data: Uint8Array,
        ) => Promise<{ rel: string }>;
        /** Auto-suffixes ("Untitled 1.md") when `rel` exists; returns the rel actually created. */
        create: (
          root: string,
          rel: string,
          content?: string,
        ) => Promise<{ rel: string }>;
        mkdir: (root: string, rel: string) => Promise<void>;
        /** Renames a file/dir and rewrites `[[wikilinks]]` pointing at it.
         *  Rejects when `to` already exists. */
        rename: (
          root: string,
          from: string,
          to: string,
          options?: VaultRenameOptions,
        ) => Promise<VaultRenameResult>;
        trash: (root: string, rel: string) => Promise<void>;
        reveal: (root: string, rel: string) => Promise<void>;
        copyImage: (root: string, rel: string) => Promise<void>;
        watch: (root: string) => Promise<void>;
        unwatch: (root: string) => Promise<void>;
        onChanged: (callback: (event: VaultChangedEvent) => void) => () => void;
        index: (root: string) => Promise<VaultIndex>;
        search: (root: string, query: string) => Promise<VaultSearchHit[]>;
      };
    };
  }
}
