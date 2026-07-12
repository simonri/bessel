export {};

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
      selectFolder: () => Promise<string | null>;
      sshListDir: (
        host: string,
        dirPath: string,
      ) => Promise<{ cwd: string; dirs: string[] }>;
      git: {
        status: (path: string) => Promise<{
          branch: string;
          ahead: number;
          behind: number;
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
        }>;
        diff: (
          path: string,
          file: string,
          staged: boolean,
          untracked: boolean,
        ) => Promise<
          | { kind: "text"; diff: string; oldContent: string; newContent: string }
          | { kind: "image"; oldImage: string | null; newImage: string | null }
        >;
        stage: (path: string, files: string[]) => Promise<void>;
        unstage: (path: string, files: string[]) => Promise<void>;
        commit: (path: string, message: string) => Promise<void>;
        push: (path: string) => Promise<void>;
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
        ) => Promise<void>;
        sendInput: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        kill: (sessionId: string) => void;
        onData: (
          sessionId: string,
          callback: (data: string) => void,
        ) => () => void;
        onExit: (
          sessionId: string,
          callback: (code: number) => void,
        ) => () => void;
      };
      monitor: {
        status: () => Promise<{
          installed: boolean;
          active: boolean;
          enabled: boolean;
          failed: boolean;
          state: string;
        }>;
        install: () => Promise<void>;
        start: () => Promise<void>;
        stop: () => Promise<void>;
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
        onStatusChange: (
          callback: (status: ElectronSpotifyStatus) => void,
        ) => () => void;
      };
    };
  }
}
