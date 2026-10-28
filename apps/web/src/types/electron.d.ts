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

export interface RemoteControlStatus {
  /** Only Linux keeps the server running outside Bessel, as a systemd user service. */
  supported: boolean;
  state: "off" | "running" | "starting" | "failed" | "untrusted";
}

export interface PhoneNotifications {
  /** Claude's "Push when actions required". */
  inputNeeded: boolean;
  /** Claude's "Push when Claude decides". */
  claudeDecides: boolean;
}

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

export interface AvanzaLogin {
  username: string;
  password: string;
  totpSecret: string;
}

/**
 * "rejected": Avanza turned down the login (new details are needed);
 * "unreachable": try again later; "not_signed_in": no login on this computer.
 */
export type AvanzaFailure = {
  ok: false;
  reason: "rejected" | "unreachable" | "not_signed_in";
  message: string;
};

export type AvanzaResult<T> = ({ ok: true } & T) | AvanzaFailure;

/** Avanza's raw JSON, as its web API returned it. */
export interface AvanzaSnapshot {
  username: string;
  overview: unknown;
  /** Null when `from` was null. */
  positions: unknown | null;
  /** The `transactions` rows of every page, from `fetchedFrom` to today. */
  transactions: unknown[];
  /** YYYY-MM-DD, or null when only the overview was read. */
  fetchedFrom: string | null;
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
      ssh: {
        hosts: () => Promise<{ hosts: string[]; configExists: boolean }>;
        openConfig: () => Promise<void>;
        mkdir: (host: string, parent: string, name: string) => Promise<string>;
      };
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
        /** Types `text` into an idle session as one message. */
        send: (key: string, text: string) => Promise<void>;
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
      /** A Claude Remote Control server per code folder, so the phone can start sessions here. */
      remoteControl: {
        status: (folder: string) => Promise<RemoteControlStatus>;
        enable: (folder: string, name: string) => Promise<RemoteControlStatus>;
        disable: (folder: string) => Promise<RemoteControlStatus>;
      };
      /** Claude's own push settings for the Claude app, in ~/.claude/settings.json. */
      claudeNotifications: {
        get: () => Promise<PhoneNotifications>;
        set: (
          patch: Partial<PhoneNotifications>,
        ) => Promise<PhoneNotifications>;
      };
      agentUsage: {
        /** This machine's Claude Code usage, ready for /v1/agent-usage/sync. */
        collect: () => Promise<{
          daily: {
            device: string;
            agent: string;
            /** Local day, YYYY-MM-DD. */
            date: string;
            models: {
              model: string;
              input_tokens: number;
              output_tokens: number;
              cache_read_tokens: number;
              cache_creation_tokens: number;
            }[];
          }[];
          rate_limits: {
            device: string;
            agent: string;
            window_label: string;
            utilization_pct: number;
            resets_at: string | null;
            tier: string | null;
          }[];
        }>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      logs: {
        read: () => Promise<string>;
        reveal: () => Promise<void>;
      };
      /** Absent in desktop builds before 0.1.53. */
      klarna?: {
        /** Opens Klarna's sign-in; resolves with the token its page uses, or null if closed. */
        signIn: () => Promise<{ authorization: string; cookie: string } | null>;
      };
      /** Absent in desktop builds before 0.1.58. The login never leaves this computer. */
      avanza?: {
        status: () => Promise<{ username: string | null }>;
        /** Logs in and reads the overview; the login is kept only if that worked.
         *  Rejects when the computer has no keychain to keep it in. */
        saveLogin: (
          login: AvanzaLogin,
        ) => Promise<AvanzaResult<{ username: string; overview: unknown }>>;
        /** `from` (YYYY-MM-DD) adds positions and transactions from that day to today. */
        fetch: (options: {
          from: string | null;
        }) => Promise<AvanzaResult<AvanzaSnapshot>>;
        forget: () => Promise<void>;
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
