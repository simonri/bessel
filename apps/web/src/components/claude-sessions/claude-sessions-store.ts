import { useSyncExternalStore } from "react";
import type { AgentStatus } from "@/components/canvas/window-manager";
import {
  type ClaudeSessionStatus,
  type ClaudeSessionsSnapshot,
  type ClaudeSessionView,
  UNTRUSTED_WORKSPACE_ERROR,
} from "./claude-sessions-types";

// Background Claude sessions live in the desktop main process (which talks to
// Claude's own background service); this mirrors its latest snapshot for the
// whole renderer in the same external-store shape as canvas-agent-status.ts.
const EMPTY: ClaudeSessionsSnapshot = {
  sessions: [],
  external: [],
  available: true,
};

let snapshot = EMPTY;
let loaded = false;
let started = false;
const listeners = new Set<() => void>();

function publish(next: ClaudeSessionsSnapshot) {
  snapshot = next;
  loaded = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (!started && typeof window !== "undefined" && window.electron) {
    started = true;
    window.electron.claudeSessions.onChanged(publish);
    void window.electron.claudeSessions.snapshot().then(publish);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClaudeSessionsSnapshot(): ClaudeSessionsSnapshot {
  return snapshot;
}

export function useClaudeSessions(): ClaudeSessionsSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

/** False until the first snapshot arrives from the main process. */
export function useClaudeSessionsLoaded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loaded,
    () => false,
  );
}

export function useClaudeSession(
  key: string | undefined,
): ClaudeSessionView | null {
  return useSyncExternalStore(
    subscribe,
    () => (key ? (snapshot.sessions.find((s) => s.key === key) ?? null) : null),
    () => null,
  );
}

export function claudeSessionsApi() {
  const api = window.electron?.claudeSessions;
  if (!api) throw new Error("Background sessions need the desktop app");
  return api;
}

export function isUntrustedWorkspaceError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(UNTRUSTED_WORKSPACE_ERROR)
  );
}

/** Up and attachable: Claude reports it running. */
export function isRunning(status: ClaudeSessionStatus): boolean {
  return status === "working" || status === "waiting" || status === "idle";
}

export function isLive(status: ClaudeSessionStatus): boolean {
  return (
    status === "working" ||
    status === "waiting" ||
    status === "idle" ||
    status === "starting"
  );
}

export function toAgentStatus(status: ClaudeSessionStatus): AgentStatus | null {
  switch (status) {
    case "working":
    case "starting":
      return "working";
    case "waiting":
      return "waiting";
    case "idle":
      return "free";
    default:
      return null;
  }
}

export const STATUS_LABEL: Record<ClaudeSessionStatus, string> = {
  working: "Working",
  waiting: "Needs you",
  idle: "Idle",
  starting: "Starting",
  stopped: "Stopped",
  missing: "Stopped",
  ended: "Ended",
};
