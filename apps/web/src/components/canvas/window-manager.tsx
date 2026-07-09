import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

export type WindowEntry = {
  id: string;
  module: ModuleKey;
  slot: number;
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
  placeWindow: (windowId: string, toSlot: number) => void;
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

function firstFreeSlot(windows: WindowEntry[]): number {
  const used = new Set(windows.map((w) => w.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

function nextFreeSlots(windows: WindowEntry[], count: number): number[] {
  const used = new Set(windows.map((w) => w.slot));
  const slots: number[] = [];
  let slot = 0;
  while (slots.length < count) {
    if (!used.has(slot)) {
      slots.push(slot);
      used.add(slot);
    }
    slot++;
  }
  return slots;
}

type StoredWindow = { module: string; slot: number; data?: Record<string, string> };

function parseWindows(raw: unknown[], workspaceId: string): WindowEntry[] {
  return (raw as StoredWindow[])
    .filter((e) => e && typeof e === "object" && ALL_MODULES.has(e.module) && typeof e.slot === "number")
    .map((e) => ({ id: newId(), module: e.module as ModuleKey, slot: e.slot, data: e.data, workspaceId }));
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
            .map((w) => ({
              module: w.module,
              slot: w.slot,
              ...(w.data ? { data: w.data } : {}),
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
        return [...prev, { id: newId(), module, slot: firstFreeSlot(prev), workspaceId: activeId }];
      });
    },
    [updateActiveWindows],
  );

  const openWindow = useCallback(
    (module: ModuleKey, data?: Record<string, string>) => {
      updateActiveWindows((prev, activeId) => [
        ...prev,
        { id: newId(), module, slot: firstFreeSlot(prev), data, workspaceId: activeId },
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

  const placeWindow = useCallback(
    (windowId: string, toSlot: number) => {
      updateActiveWindows((prev) => {
        const moving = prev.find((w) => w.id === windowId);
        if (!moving || moving.slot === toSlot) return prev;
        const occupant = prev.find((w) => w.slot === toSlot);
        return prev.map((w) => {
          if (w.id === windowId) return { ...w, slot: toSlot };
          if (occupant && w.id === occupant.id) return { ...w, slot: moving.slot };
          return w;
        });
      });
    },
    [updateActiveWindows],
  );

  const moveWindowToWorkspace = useCallback((windowId: string, targetWorkspaceId: string) => {
    setState((prev) => {
      const moving = prev.windows.find((w) => w.id === windowId);
      if (!moving || moving.workspaceId === targetWorkspaceId) return prev;
      if (!prev.workspaces.some((ws) => ws.id === targetWorkspaceId)) return prev;
      const targetWindows = prev.windows.filter((w) => w.workspaceId === targetWorkspaceId);
      const slot = firstFreeSlot(targetWindows);
      return {
        ...prev,
        windows: prev.windows.map((w) =>
          w.id === windowId ? { ...w, workspaceId: targetWorkspaceId, slot } : w,
        ),
      };
    });
    setFlashWorkspaceId(targetWorkspaceId);
  }, []);

  const applyTemplate = useCallback((specs: WindowSpec[], target: "current" | "new") => {
    setState((prev) => {
      if (target === "new") {
        const workspaceId = newId();
        const slots = nextFreeSlots([], specs.length);
        const newWindows = specs.map((spec, i) => ({
          id: newId(),
          module: spec.module,
          slot: slots[i],
          data: spec.data,
          workspaceId,
        }));
        return {
          workspaces: [...prev.workspaces, { id: workspaceId }],
          windows: [...prev.windows, ...newWindows],
          activeWorkspaceId: workspaceId,
        };
      }

      const activeId = prev.activeWorkspaceId;
      const activeWindows = prev.windows.filter((w) => w.workspaceId === activeId);
      const slots = nextFreeSlots(activeWindows, specs.length);
      const newWindows = specs.map((spec, i) => ({
        id: newId(),
        module: spec.module,
        slot: slots[i],
        data: spec.data,
        workspaceId: activeId,
      }));
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
    placeWindow,
    moveWindowToWorkspace,
    applyTemplate,
    isOpen,
    addWorkspace,
    removeWorkspace,
    switchWorkspace,
  }), [
    windows, allWindows, workspaces, activeWorkspaceId, flashWorkspaceId,
    toggleWindow, openWindow, closeWindow, updateWindowData, placeWindow, moveWindowToWorkspace, applyTemplate,
    isOpen, addWorkspace, removeWorkspace, switchWorkspace,
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
