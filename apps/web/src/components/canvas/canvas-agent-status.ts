import { useSyncExternalStore } from "react";
import type { AgentStatus } from "./window-manager";

// Per-window agent busy/idle signal in the same external-store shape as
// canvas-focus.ts. Widgets report into it (via WindowStatusContext) and both
// the window title bar and the sidebar's per-session dot read from it, so a
// status flip re-renders exactly those subscribers — never the canvas tree.
const statuses = new Map<string, AgentStatus>();
const listeners = new Set<() => void>();

export function setWindowAgentStatus(
  id: string,
  status: AgentStatus | null,
): void {
  const current = statuses.get(id) ?? null;
  if (current === status) return;
  if (status) statuses.set(id, status);
  else statuses.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWindowAgentStatus(id: string): AgentStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => statuses.get(id) ?? null,
    () => null,
  );
}

/** Rolls a set of windows up to one status: any agent still working wins over
 *  all of them sitting free; null when none of them has reported. */
export function aggregateAgentStatus(
  windowIds: readonly string[],
): AgentStatus | null {
  let result: AgentStatus | null = null;
  for (const id of windowIds) {
    const status = statuses.get(id);
    if (status === "working") return "working";
    if (status === "free") result = "free";
  }
  return result;
}

export function useSessionAgentStatus(
  windowIds: readonly string[],
): AgentStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => aggregateAgentStatus(windowIds),
    () => null,
  );
}
