import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bottom, collides, verticalCompactor, type Layout as RglLayout } from "react-grid-layout";
import { MODULE_REGISTRY } from "./module-registry";

export type ModuleKey =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "investments"
  | "tasks"
  | "travel"
  | "activity"
  | "recipes"
  | "claudeCode"
  | "terminal"
  | "gitStatus"
  | "browser";

export const GRID_COLS = 24;
export const GRID_ROW_HEIGHT = 32;

export type WindowEntry = {
  id: string;
  module: ModuleKey;
  x: number;
  y: number;
  w: number;
  h: number;
  data?: Record<string, string>;
  workspaceId: string;
};

export type WindowSpec = { module: ModuleKey; data?: Record<string, string> };

interface WorkspaceMeta {
  id: string;
}

interface WindowManagerContextValue {
  /** Windows in the active workspace only. */
  windows: WindowEntry[];
  /** Every window across every workspace — stable identity, used for flat/always-mounted rendering. */
  allWindows: WindowEntry[];
  workspaces: WorkspaceMeta[];
  activeWorkspaceId: string;
  /** Workspace a window was just moved into, briefly set so the UI can flash it. */
  flashWorkspaceId: string | null;
  toggleWindow: (module: ModuleKey) => void;
  openWindow: (module: ModuleKey, data?: Record<string, string>) => void;
  closeWindow: (id: string) => void;
  /** Merges `patch` into a window's per-instance data — e.g. a browser widget saving its current URL. */
  updateWindowData: (windowId: string, patch: Record<string, string>) => void;
  /** Writes a react-grid-layout `Layout` (from onLayoutChange) back into the given workspace's windows. */
  updateLayout: (workspaceId: string, layout: RglLayout) => void;
  /** Vertically compacts the active workspace's windows, removing gaps. Sizes are untouched. */
  alignWorkspace: () => void;
  moveWindowToWorkspace: (windowId: string, targetWorkspaceId: string) => void;
  /** Opens a batch of windows at once, either into the active workspace or a newly created one. */
  applyTemplate: (specs: WindowSpec[], target: "current" | "new") => void;
  isOpen: (module: ModuleKey) => boolean;
  addWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  switchWorkspace: (id: string) => void;
}

export const WindowEntryContext = createContext<WindowEntry | null>(null);

export function useWindowEntry() {
  return useContext(WindowEntryContext);
}

export const WindowTitleContext = createContext<((title: string | null) => void) | null>(null);

export function useWindowTitle() {
  return useContext(WindowTitleContext);
}

const STORAGE_KEY = "metron:workspaces";
const LEGACY_KEY = "metron:windows";

const isDesktop = typeof window !== "undefined" && !!window.electron;

const ALL_MODULES = new Set<string>([
  "dashboard", "transactions", "accounts", "investments",
  "tasks", "travel", "activity", "recipes", "gitStatus",
  ...(isDesktop ? ["claudeCode", "terminal", "browser"] : []),
]);

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toRglLayout(windows: WindowEntry[]): RglLayout {
  return windows.map((win) => ({ i: win.id, x: win.x, y: win.y, w: win.w, h: win.h }));
}

// The canvas never scrolls, so new widgets can't just stack in one column forever —
// find the first open spot scanning left-to-right, then row by row (a "shelf" packer),
// so widgets fill the available grid instead of piling straight down.
function findFirstFit(existing: WindowEntry[], w: number, h: number): { x: number; y: number } {
  const layout = toRglLayout(existing);
  const maxY = bottom(layout) + h;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      const candidate = { i: "__probe__", x, y, w, h };
      if (!layout.some((item) => collides(item, candidate))) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: maxY };
}

function placeFirstFit(existing: WindowEntry[], size: { w: number; h: number }) {
  const { x, y } = findFirstFit(existing, size.w, size.h);
  return { x, y, w: size.w, h: size.h };
}

function placeNewWidget(existing: WindowEntry[], module: ModuleKey) {
  return placeFirstFit(existing, MODULE_REGISTRY[module].defaultSize);
}

// The old 2-column, fixed 1x1-cell layout: `col = slot % 2`, `row = floor(slot / 2)`.
// Replicated onto the finer grid so upgraded users see roughly the same left/right,
// top/bottom arrangement — lossy (old data had no size info), but order is preserved.
function migrateSlot(slot: number, module: ModuleKey): { x: number; y: number; w: number; h: number } {
  const { w, h } = MODULE_REGISTRY[module].defaultSize;
  const col = slot % 2;
  const row = Math.floor(slot / 2);
  return { x: col * (GRID_COLS / 2), y: row * h, w: Math.min(w, GRID_COLS / 2), h };
}

type StoredWindowNew = { module: string; x: number; y: number; w: number; h: number; data?: Record<string, string> };
type StoredWindowLegacy = { module: string; slot: number; data?: Record<string, string> };
type StoredWindow = StoredWindowNew | StoredWindowLegacy;

function isNewFormat(e: StoredWindow): e is StoredWindowNew {
  return (
    typeof (e as StoredWindowNew).x === "number" &&
    typeof (e as StoredWindowNew).y === "number" &&
    typeof (e as StoredWindowNew).w === "number" &&
    typeof (e as StoredWindowNew).h === "number"
  );
}

function parseWindows(raw: unknown[], workspaceId: string): WindowEntry[] {
  const entries = (raw as StoredWindow[]).filter(
    (e) => e && typeof e === "object" && ALL_MODULES.has(e.module),
  );

  let migrated = false;
  const result: WindowEntry[] = [];
  for (const e of entries) {
    const module = e.module as ModuleKey;
    if (isNewFormat(e)) {
      result.push({ id: newId(), module, x: e.x, y: e.y, w: e.w, h: e.h, data: e.data, workspaceId });
    } else if (typeof (e as StoredWindowLegacy).slot === "number") {
      migrated = true;
      const { x, y, w, h } = migrateSlot((e as StoredWindowLegacy).slot, module);
      result.push({ id: newId(), module, x, y, w, h, data: e.data, workspaceId });
    }
  }

  // Clamping w down to fit the old 2-column layout onto this grid can introduce
  // overlap — clean it up, but only when a migration actually happened, so
  // already-current-format data is never silently rearranged on load.
  if (!migrated) return result;
  const compacted = verticalCompactor.compact(toRglLayout(result), GRID_COLS);
  return result.map((win) => {
    const item = compacted.find((l) => l.i === win.id)!;
    return { ...win, x: item.x, y: item.y };
  });
}

interface LoadedState {
  workspaces: WorkspaceMeta[];
  windows: WindowEntry[];
  activeWorkspaceId: string;
}

function loadState(): LoadedState {
  // Try current workspaces format
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        workspaces: Array<{ id: string; windows: StoredWindow[] }>;
        activeWorkspaceId: string;
      };
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
        const workspaces = parsed.workspaces.map((ws) => ({ id: ws.id }));
        const windows = parsed.workspaces.flatMap((ws) => parseWindows(ws.windows ?? [], ws.id));
        const activeId =
          workspaces.find((ws) => ws.id === parsed.activeWorkspaceId)?.id ?? workspaces[0].id;
        return { workspaces, windows, activeWorkspaceId: activeId };
      }
    }
  } catch {}

  // Migrate from legacy flat-windows format
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const id = newId();
      const windows = parseWindows(JSON.parse(legacyRaw) as unknown[], id);
      return { workspaces: [{ id }], windows, activeWorkspaceId: id };
    }
  } catch {}

  // Default: one empty workspace
  const id = newId();
  return { workspaces: [{ id }], windows: [], activeWorkspaceId: id };
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadState);
  const { workspaces, windows: allWindows, activeWorkspaceId } = state;
  const [flashWorkspaceId, setFlashWorkspaceId] = useState<string | null>(null);

  const windows = useMemo(
    () => allWindows.filter((w) => w.workspaceId === activeWorkspaceId),
    [allWindows, activeWorkspaceId],
  );

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          windows: allWindows
            .filter((w) => w.workspaceId === ws.id)
            .map((win) => ({
              module: win.module,
              x: win.x,
              y: win.y,
              w: win.w,
              h: win.h,
              ...(win.data ? { data: win.data } : {}),
            })),
        })),
        activeWorkspaceId,
      }),
    );
  }, [workspaces, allWindows, activeWorkspaceId]);

  useEffect(() => {
    if (!flashWorkspaceId) return;
    const t = setTimeout(() => setFlashWorkspaceId(null), 900);
    return () => clearTimeout(t);
  }, [flashWorkspaceId]);

  const updateActiveWindows = useCallback(
    (updater: (wins: WindowEntry[], activeWorkspaceId: string) => WindowEntry[]) => {
      setState((prev) => {
        const activeId = prev.activeWorkspaceId;
        const active = prev.windows.filter((w) => w.workspaceId === activeId);
        const others = prev.windows.filter((w) => w.workspaceId !== activeId);
        return { ...prev, windows: [...others, ...updater(active, activeId)] };
      });
    },
    [],
  );

  const isOpen = useCallback(
    (module: ModuleKey) => windows.some((w) => w.module === module),
    [windows],
  );

  const toggleWindow = useCallback(
    (module: ModuleKey) => {
      updateActiveWindows((prev, activeId) => {
        if (prev.some((w) => w.module === module)) return prev.filter((w) => w.module !== module);
        return [...prev, { id: newId(), module, ...placeNewWidget(prev, module), workspaceId: activeId }];
      });
    },
    [updateActiveWindows],
  );

  const openWindow = useCallback(
    (module: ModuleKey, data?: Record<string, string>) => {
      updateActiveWindows((prev, activeId) => [
        ...prev,
        { id: newId(), module, ...placeNewWidget(prev, module), data, workspaceId: activeId },
      ]);
    },
    [updateActiveWindows],
  );

  const closeWindow = useCallback(
    (id: string) => {
      updateActiveWindows((prev) => prev.filter((w) => w.id !== id));
    },
    [updateActiveWindows],
  );

  // Windows in every workspace stay mounted (see CanvasShell), so this can't go
  // through updateActiveWindows — the window being updated may not be the active one.
  const updateWindowData = useCallback((windowId: string, patch: Record<string, string>) => {
    setState((prev) => ({
      ...prev,
      windows: prev.windows.map((w) => (w.id === windowId ? { ...w, data: { ...w.data, ...patch } } : w)),
    }));
  }, []);

  // Every workspace's grid stays mounted too, so a hidden grid's own onLayoutChange
  // (e.g. its initial bounds-correction) must be able to target a non-active workspace.
  const updateLayout = useCallback((workspaceId: string, layout: RglLayout) => {
    setState((prev) => ({
      ...prev,
      windows: prev.windows.map((win) => {
        if (win.workspaceId !== workspaceId) return win;
        const item = layout.find((l) => l.i === win.id);
        return item ? { ...win, x: item.x, y: item.y, w: item.w, h: item.h } : win;
      }),
    }));
  }, []);

  const alignWorkspace = useCallback(() => {
    updateActiveWindows((prev) => {
      const compacted = verticalCompactor.compact(toRglLayout(prev), GRID_COLS);
      return prev.map((win) => {
        const item = compacted.find((l) => l.i === win.id)!;
        return { ...win, x: item.x, y: item.y };
      });
    });
  }, [updateActiveWindows]);

  const moveWindowToWorkspace = useCallback((windowId: string, targetWorkspaceId: string) => {
    setState((prev) => {
      const moving = prev.windows.find((w) => w.id === windowId);
      if (!moving || moving.workspaceId === targetWorkspaceId) return prev;
      if (!prev.workspaces.some((ws) => ws.id === targetWorkspaceId)) return prev;
      const targetWindows = prev.windows.filter((w) => w.workspaceId === targetWorkspaceId);
      const placed = placeFirstFit(targetWindows, { w: moving.w, h: moving.h });
      return {
        ...prev,
        windows: prev.windows.map((w) =>
          w.id === windowId ? { ...w, workspaceId: targetWorkspaceId, ...placed } : w,
        ),
      };
    });
    setFlashWorkspaceId(targetWorkspaceId);
  }, []);

  const applyTemplate = useCallback((specs: WindowSpec[], target: "current" | "new") => {
    setState((prev) => {
      if (target === "new") {
        const workspaceId = newId();
        const newWindows: WindowEntry[] = [];
        for (const spec of specs) {
          const placed = placeNewWidget(newWindows, spec.module);
          newWindows.push({ id: newId(), module: spec.module, ...placed, data: spec.data, workspaceId });
        }
        return {
          workspaces: [...prev.workspaces, { id: workspaceId }],
          windows: [...prev.windows, ...newWindows],
          activeWorkspaceId: workspaceId,
        };
      }

      const activeId = prev.activeWorkspaceId;
      const activeWindows = prev.windows.filter((w) => w.workspaceId === activeId);
      const newWindows: WindowEntry[] = [];
      for (const spec of specs) {
        const placed = placeNewWidget([...activeWindows, ...newWindows], spec.module);
        newWindows.push({ id: newId(), module: spec.module, ...placed, data: spec.data, workspaceId: activeId });
      }
      return { ...prev, windows: [...prev.windows, ...newWindows] };
    });
  }, []);

  const addWorkspace = useCallback(() => {
    const id = newId();
    setState((prev) => ({ ...prev, workspaces: [...prev.workspaces, { id }], activeWorkspaceId: id }));
  }, []);

  const switchWorkspace = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeWorkspaceId: id }));
  }, []);

  const removeWorkspace = useCallback((id: string) => {
    setState((prev) => {
      if (prev.workspaces.length <= 1) return prev;
      const remaining = prev.workspaces.filter((ws) => ws.id !== id);
      const activeId =
        prev.activeWorkspaceId === id
          ? (remaining[remaining.length - 1]?.id ?? remaining[0].id)
          : prev.activeWorkspaceId;
      return {
        workspaces: remaining,
        windows: prev.windows.filter((w) => w.workspaceId !== id),
        activeWorkspaceId: activeId,
      };
    });
  }, []);

  const contextValue = useMemo(() => ({
    windows,
    allWindows,
    workspaces,
    activeWorkspaceId,
    flashWorkspaceId,
    toggleWindow,
    openWindow,
    closeWindow,
    updateWindowData,
    updateLayout,
    alignWorkspace,
    moveWindowToWorkspace,
    applyTemplate,
    isOpen,
    addWorkspace,
    removeWorkspace,
    switchWorkspace,
  }), [
    windows, allWindows, workspaces, activeWorkspaceId, flashWorkspaceId,
    toggleWindow, openWindow, closeWindow, updateWindowData, updateLayout, alignWorkspace,
    moveWindowToWorkspace, applyTemplate, isOpen, addWorkspace, removeWorkspace, switchWorkspace,
  ]);

  return (
    <WindowManagerContext.Provider value={contextValue}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be used within WindowManager");
  return ctx;
}
