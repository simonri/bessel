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
  | "gitStatus";

export type WindowEntry = { id: string; module: ModuleKey; slot: number; data?: Record<string, string> };

interface WorkspaceState {
  id: string;
  windows: WindowEntry[];
}

interface WindowManagerContextValue {
  windows: WindowEntry[];
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  toggleWindow: (module: ModuleKey) => void;
  openWindow: (module: ModuleKey, data?: Record<string, string>) => void;
  closeWindow: (id: string) => void;
  placeWindow: (windowId: string, toSlot: number) => void;
  isOpen: (module: ModuleKey) => boolean;
  addWorkspace: () => void;
  removeWorkspace: (id: string) => void;
  switchWorkspace: (id: string) => void;
}

export const WindowEntryContext = createContext<WindowEntry | null>(null);

export function useWindowEntry() {
  return useContext(WindowEntryContext);
}

const STORAGE_KEY = "metron:workspaces";
const LEGACY_KEY = "metron:windows";

const isDesktop = typeof window !== "undefined" && !!window.electron;

const ALL_MODULES = new Set<string>([
  "dashboard", "transactions", "accounts", "investments",
  "tasks", "travel", "activity", "recipes", "gitStatus",
  ...(isDesktop ? ["claudeCode", "terminal"] : []),
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

type StoredWindow = { module: string; slot: number; data?: Record<string, string> };

function parseWindows(raw: unknown[]): WindowEntry[] {
  return (raw as StoredWindow[])
    .filter((e) => e && typeof e === "object" && ALL_MODULES.has(e.module) && typeof e.slot === "number")
    .map((e) => ({ id: newId(), module: e.module as ModuleKey, slot: e.slot, data: e.data }));
}

function loadState(): { workspaces: WorkspaceState[]; activeWorkspaceId: string } {
  // Try current workspaces format
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        workspaces: Array<{ id: string; windows: StoredWindow[] }>;
        activeWorkspaceId: string;
      };
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
        const workspaces = parsed.workspaces.map((ws) => ({
          id: ws.id,
          windows: parseWindows(ws.windows ?? []),
        }));
        const activeId =
          workspaces.find((ws) => ws.id === parsed.activeWorkspaceId)?.id ?? workspaces[0].id;
        return { workspaces, activeWorkspaceId: activeId };
      }
    }
  } catch {}

  // Migrate from legacy flat-windows format
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const windows = parseWindows(JSON.parse(legacyRaw) as unknown[]);
      const id = newId();
      return { workspaces: [{ id, windows }], activeWorkspaceId: id };
    }
  } catch {}

  // Default: one empty workspace
  const id = newId();
  return { workspaces: [{ id, windows: [] }], activeWorkspaceId: id };
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(loadState);
  const { workspaces, activeWorkspaceId } = state;

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId) ?? workspaces[0];
  const windows = activeWorkspace?.windows ?? [];

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          windows: ws.windows.map((w) => ({
            module: w.module,
            slot: w.slot,
            ...(w.data ? { data: w.data } : {}),
          })),
        })),
        activeWorkspaceId,
      }),
    );
  }, [workspaces, activeWorkspaceId]);

  const updateActiveWindows = useCallback(
    (updater: (wins: WindowEntry[]) => WindowEntry[]) => {
      setState((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((ws) =>
          ws.id === prev.activeWorkspaceId ? { ...ws, windows: updater(ws.windows) } : ws,
        ),
      }));
    },
    [],
  );

  const isOpen = useCallback(
    (module: ModuleKey) => windows.some((w) => w.module === module),
    [windows],
  );

  const toggleWindow = useCallback(
    (module: ModuleKey) => {
      updateActiveWindows((prev) => {
        if (prev.some((w) => w.module === module)) return prev.filter((w) => w.module !== module);
        return [...prev, { id: newId(), module, slot: firstFreeSlot(prev) }];
      });
    },
    [updateActiveWindows],
  );

  const openWindow = useCallback(
    (module: ModuleKey, data?: Record<string, string>) => {
      updateActiveWindows((prev) => [
        ...prev,
        { id: newId(), module, slot: firstFreeSlot(prev), data },
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

  const addWorkspace = useCallback(() => {
    const id = newId();
    setState((prev) => ({
      workspaces: [...prev.workspaces, { id, windows: [] }],
      activeWorkspaceId: id,
    }));
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
      return { workspaces: remaining, activeWorkspaceId: activeId };
    });
  }, []);

  const contextValue = useMemo(() => ({
    windows,
    workspaces,
    activeWorkspaceId,
    toggleWindow,
    openWindow,
    closeWindow,
    placeWindow,
    isOpen,
    addWorkspace,
    removeWorkspace,
    switchWorkspace,
  }), [windows, workspaces, activeWorkspaceId, toggleWindow, openWindow, closeWindow, placeWindow, isOpen, addWorkspace, removeWorkspace, switchWorkspace]);

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
