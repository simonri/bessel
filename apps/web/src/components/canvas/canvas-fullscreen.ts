import { useSyncExternalStore } from "react";

// Mirrors canvas-focus.ts's external-store pattern — only the (at most two)
// windows whose fullscreen state actually flips need to re-render.
let fullscreenWindowId: string | null = null;
const listeners = new Set<() => void>();

function setFullscreenWindow(id: string | null): void {
  if (id === fullscreenWindowId) return;
  fullscreenWindowId = id;
  for (const listener of listeners) listener();
}

export function toggleFullscreenWindow(id: string): void {
  setFullscreenWindow(fullscreenWindowId === id ? null : id);
}

/** No-op unless `id` is the currently fullscreened window — safe to call from closeWindow. */
export function clearFullscreenWindow(id: string): void {
  if (fullscreenWindowId === id) setFullscreenWindow(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsWindowFullscreen(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fullscreenWindowId === id,
    () => false,
  );
}

export function useFullscreenWindowId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => fullscreenWindowId,
    () => null,
  );
}
