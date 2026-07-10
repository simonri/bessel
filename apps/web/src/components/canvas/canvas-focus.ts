import { useSyncExternalStore } from "react";

// Focus lives in a tiny external store instead of React state up in
// CanvasShell: with a boolean snapshot per window, a focus change re-renders
// exactly the two windows whose highlight flips — not the whole canvas tree.
let focusedWindowId: string | null = null;
const listeners = new Set<() => void>();

export function setFocusedWindow(id: string | null): void {
  if (id === focusedWindowId) return;
  focusedWindowId = id;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsWindowFocused(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => focusedWindowId === id,
    () => false,
  );
}
