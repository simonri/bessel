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

// The window whose grid position/size just changed because of a fullscreen
// toggle (either direction) — cleared after the browser has painted once
// with transitions off, so the jump to/from full canvas size is instant
// instead of sliding like a normal drag-triggered reflow. See
// canvas-page.tsx, which applies `transition-none` to this item only.
let instantWindowId: string | null = null;

export function toggleFullscreenWindow(id: string): void {
  instantWindowId = id;
  setFullscreenWindow(fullscreenWindowId === id ? null : id);
  // Two rAFs: the first fires before the browser's *next* paint (too early —
  // clearing here could still coalesce with the position change into one
  // painted frame with transitions back on). The second runs after that
  // paint has actually happened, so it's safe to re-enable transitions for
  // whatever comes next (a real drag, a sibling shifting during compaction).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (instantWindowId !== id) return;
      instantWindowId = null;
      for (const listener of listeners) listener();
    });
  });
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

export function useInstantWindowId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => instantWindowId,
    () => null,
  );
}
