import { createContext, useCallback, useContext, useEffect, useState } from "react";

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
  | "gitStatus";

export type WindowEntry = { id: string; module: ModuleKey; slot: number; data?: Record<string, string> };

interface WindowManagerContextValue {
  windows: WindowEntry[];
  toggleWindow: (module: ModuleKey) => void;
  openWindow: (module: ModuleKey, data?: Record<string, string>) => void;
  closeWindow: (id: string) => void;
  placeWindow: (windowId: string, toSlot: number) => void;
  isOpen: (module: ModuleKey) => boolean;
}

export const WindowEntryContext = createContext<WindowEntry | null>(null);

export function useWindowEntry() {
  return useContext(WindowEntryContext);
}

const STORAGE_KEY = "metron:windows";

const isDesktop = typeof window !== "undefined" && !!window.electron;

const ALL_MODULES = new Set<string>([
  "dashboard", "transactions", "accounts", "investments", "tasks", "travel", "activity", "recipes",
  ...(isDesktop ? ["claudeCode"] : []),
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

function loadWindows(): WindowEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return (parsed as { module: string; slot: number; data?: Record<string, string> }[])
      .filter((e) => e && typeof e === "object" && ALL_MODULES.has(e.module) && typeof e.slot === "number")
      .map((e) => ({ id: newId(), module: e.module as ModuleKey, slot: e.slot, data: e.data }));
  } catch {
    return [];
  }
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>(loadWindows);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(windows.map((w) => ({ module: w.module, slot: w.slot, ...(w.data ? { data: w.data } : {}) }))),
    );
  }, [windows]);

  const isOpen = useCallback(
    (module: ModuleKey) => windows.some((w) => w.module === module),
    [windows],
  );

  const toggleWindow = useCallback((module: ModuleKey) => {
    setWindows((prev) => {
      if (prev.some((w) => w.module === module)) {
        return prev.filter((w) => w.module !== module);
      }
      return [...prev, { id: newId(), module, slot: firstFreeSlot(prev) }];
    });
  }, []);

  const openWindow = useCallback((module: ModuleKey, data?: Record<string, string>) => {
    setWindows((prev) => [...prev, { id: newId(), module, slot: firstFreeSlot(prev), data }]);
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const placeWindow = useCallback((windowId: string, toSlot: number) => {
    setWindows((prev) => {
      const moving = prev.find((w) => w.id === windowId);
      if (!moving || moving.slot === toSlot) return prev;
      const occupant = prev.find((w) => w.slot === toSlot);
      return prev.map((w) => {
        if (w.id === windowId) return { ...w, slot: toSlot };
        if (occupant && w.id === occupant.id) return { ...w, slot: moving.slot };
        return w;
      });
    });
  }, []);

  return (
    <WindowManagerContext.Provider value={{ windows, toggleWindow, openWindow, closeWindow, placeWindow, isOpen }}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be used within WindowManager");
  return ctx;
}
