// Shared shapes for the Claude sessions IPC surface. Mirror of
// apps/desktop/src/claude-sessions-types.ts — keep both in sync.

/** One entry of `claude agents --json --all`. */
export interface ClaudeAgentEntry {
  /** Background sessions only — what `attach`/`stop`/`respawn` take. */
  id: string | null;
  /** Absent once a background session is stopped. */
  pid: number | null;
  cwd: string;
  kind: "background" | "interactive";
  startedAt: number;
  sessionId: string;
  name: string | null;
  status: string | null;
  state: string | null;
}

/** A background session Bessel started or adopted, persisted across restarts. */
export interface StoredClaudeSession {
  /** Bessel's own id — stable even when resuming gives Claude a new one. */
  key: string;
  bgId: string;
  sessionId: string;
  name: string;
  cwd: string;
  projectId?: string;
  createdAt: number;
  /** Set once the session was ended; it can still be resumed. */
  endedAt?: number;
  remoteUrl?: string;
  /** Earlier ids of this conversation: resuming continues it under a new one. */
  previousSessionIds?: string[];
}

/**
 * - working / waiting (for the user) / idle: running
 * - starting: Bessel just (re)started it
 * - stopped: Claude still knows it but it isn't running
 * - missing: Claude has no record of it
 * - ended: the user ended it
 */
export type ClaudeSessionStatus =
  | "working"
  | "waiting"
  | "idle"
  | "starting"
  | "stopped"
  | "missing"
  | "ended";

export interface ClaudeSessionView {
  key: string;
  bgId: string;
  sessionId: string;
  name: string;
  cwd: string;
  projectId: string | null;
  createdAt: number;
  endedAt: number | null;
  status: ClaudeSessionStatus;
  remoteUrl: string | null;
  /** Every id this conversation has had, current one first. */
  conversationIds: string[];
}

/** A session running on this machine that Bessel didn't start. */
export interface ExternalClaudeSession {
  /** Present for background sessions, which Bessel can open and adopt. */
  bgId: string | null;
  sessionId: string;
  name: string | null;
  cwd: string;
  kind: "background" | "interactive";
  status: ClaudeSessionStatus;
  startedAt: number;
}

export interface ClaudeSessionsSnapshot {
  sessions: ClaudeSessionView[];
  external: ExternalClaudeSession[];
  /** False when the `claude` CLI couldn't be run or its output read. */
  available: boolean;
}

export interface ClaudeConversation {
  sessionId: string;
  title: string;
  updatedAt: number;
}

export interface CreateClaudeSessionInput {
  /** Empty for the home directory. */
  cwd: string;
  name: string;
  projectId?: string;
  /** Continue this past conversation instead of starting a new one. */
  resumeSessionId?: string;
}

export const UNTRUSTED_WORKSPACE_ERROR = "CLAUDE_UNTRUSTED_WORKSPACE";
