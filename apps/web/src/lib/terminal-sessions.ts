/**
 * Renderer-side registry of PTY sessions, decoupled from the xterm views that
 * display them. A widget remounting (e.g. its window moved to another
 * workspace) only detaches and reattaches; the PTY is killed when its window
 * leaves the canvas state (see `pruneTerminalSessions`) or on logout.
 *
 * Each session keeps one IPC subscription for its whole life and buffers
 * recent output, so a reattached view can replay the screen it missed.
 */

const MAX_BUFFER_BYTES = 512 * 1024;

export interface SpawnConfig {
  command: string;
  args: string[];
  cwd?: string;
}

interface TerminalView {
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

interface Session {
  windowId: string | null;
  chunks: string[];
  bytes: number;
  /** Whether the PTY has produced any output yet. */
  started: boolean;
  exitCode: number | null;
  view: TerminalView | null;
  ready: Promise<void>;
  unsubscribe: () => void;
}

const sessions = new Map<string, Session>();

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stable per window and process identity: a remount of the same window
 * reattaches, while a different identity (e.g. attaching to another Claude
 * session) gets a fresh PTY. The identity defaults to the spawn config; pass
 * a string when the args legitimately differ between mounts of the same
 * process (`--session-id X` on first launch, `--resume X` afterwards).
 */
export function terminalSessionId(
  windowId: string,
  identity: SpawnConfig | string,
): string {
  const key =
    typeof identity === "string"
      ? identity
      : JSON.stringify([identity.command, identity.args, identity.cwd ?? null]);
  return `${windowId}:${fnv1a(key)}`;
}

function append(session: Session, data: string) {
  session.chunks.push(data);
  session.bytes += data.length;
  while (session.bytes > MAX_BUFFER_BYTES && session.chunks.length > 1) {
    session.bytes -= session.chunks.shift()!.length;
  }
}

function dispose(sessionId: string, kill: boolean) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  session.unsubscribe();
  if (kill) window.electron?.terminal.kill(sessionId);
}

export interface AttachedTerminal {
  /** True when this attach spawned the PTY (vs. reattaching to a live one). */
  spawned: boolean;
  /** Output produced before this attach, oldest first. */
  replay: string;
  /** Exit code if the PTY already exited while detached. */
  exitCode: number | null;
  started: () => boolean;
  /** Resolves once the PTY is running; rejects if it failed to spawn. */
  ready: Promise<void>;
  detach: () => void;
}

/**
 * Attaches `view` to the session, spawning the PTY on first use. A window
 * hosts one terminal at a time, so attaching a new session for a window kills
 * that window's previous one.
 */
export function attachTerminal(
  sessionId: string,
  windowId: string | null,
  size: { cols: number; rows: number },
  config: SpawnConfig,
  view: TerminalView,
): AttachedTerminal {
  const terminal = window.electron!.terminal;
  let session = sessions.get(sessionId);
  const spawned = !session;

  if (!session) {
    if (windowId !== null) {
      for (const [id, other] of sessions)
        if (other.windowId === windowId) dispose(id, true);
    }
    const created: Session = {
      windowId,
      chunks: [],
      bytes: 0,
      started: false,
      exitCode: null,
      view: null,
      ready: Promise.resolve(),
      unsubscribe: () => {},
    };
    const unsubData = terminal.onData(sessionId, (data) => {
      append(created, data);
      created.started = true;
      created.view?.onData(data);
    });
    const unsubExit = terminal.onExit(sessionId, (code) => {
      created.exitCode = code;
      created.view?.onExit(code);
    });
    created.unsubscribe = () => {
      unsubData();
      unsubExit();
    };
    // Ids are per window and spawn config, so the PTY generation isn't needed.
    created.ready = terminal
      .spawn(sessionId, size.cols, size.rows, config)
      .then(() => undefined);
    created.ready.catch(() => dispose(sessionId, false));
    sessions.set(sessionId, created);
    session = created;
  }

  const attached = session;
  const replay = spawned ? "" : attached.chunks.join("");
  attached.view = view;
  return {
    spawned,
    replay,
    exitCode: attached.exitCode,
    started: () => attached.started,
    ready: attached.ready,
    detach: () => {
      if (attached.view === view) attached.view = null;
    },
  };
}

/** Kills a session outright, e.g. a terminal rendered outside the canvas unmounting. */
export function killTerminalSession(sessionId: string) {
  dispose(sessionId, true);
}

/** Kills every session whose window is no longer in the canvas. */
export function pruneTerminalSessions(liveWindowIds: ReadonlySet<string>) {
  for (const [id, session] of sessions) {
    if (session.windowId !== null && !liveWindowIds.has(session.windowId))
      dispose(id, true);
  }
}

export function killAllTerminalSessions() {
  for (const id of [...sessions.keys()]) dispose(id, true);
}
