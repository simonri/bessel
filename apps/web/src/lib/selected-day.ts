import { useSyncExternalStore } from "react";

/**
 * The day and machine picked on Timeline, Screen time or Location history,
 * so moving between them stays on the same day. A day is "yyyy-MM-dd"; null
 * means today, which each page works out its own way (Timeline's day starts
 * at 6am). Kept in memory: a fresh visit starts on today.
 */
type Selection = { day: string | null; source: string | null };

let selection: Selection = { day: null, source: null };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<Selection>): void {
  selection = { ...selection, ...patch };
  for (const listener of listeners) listener();
}

export function setSelectedDay(day: string | null): void {
  update({ day });
}

export function setSelectedSource(source: string | null): void {
  update({ source });
}

export function useSelectedDay(): string | null {
  return useSyncExternalStore(subscribe, () => selection.day);
}

export function useSelectedSource(): string | null {
  return useSyncExternalStore(subscribe, () => selection.source);
}
