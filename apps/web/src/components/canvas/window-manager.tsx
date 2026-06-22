import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ModuleKey =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "investments"
  | "tasks"
  | "travel"
  | "activity"
  | "recipes";

export type WindowEntry = { id: string; module: ModuleKey };

interface WindowManagerContextValue {
  windows: WindowEntry[];
  toggleWindow: (module: ModuleKey) => void;
  closeWindow: (id: string) => void;
  isOpen: (module: ModuleKey) => boolean;
}

const STORAGE_KEY = "metron:windows";

const ALL_MODULES = new Set<string>([
  "dashboard", "transactions", "accounts", "investments", "tasks", "travel", "activity", "recipes",
]);

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function loadWindows(): WindowEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const modules = JSON.parse(raw) as unknown[];
    return (modules as string[])
      .filter((m) => ALL_MODULES.has(m))
      .map((module) => ({ id: newId(), module: module as ModuleKey }));
  } catch {
    return [];
  }
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>(loadWindows);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(windows.map((w) => w.module)));
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
      return [...prev, { id: newId(), module }];
    });
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  return (
    <WindowManagerContext.Provider value={{ windows, toggleWindow, closeWindow, isOpen }}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be used within WindowManager");
  return ctx;
}
