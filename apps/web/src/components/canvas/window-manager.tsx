import { createContext, useCallback, useContext, useState } from "react";

export type ModuleKey =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "investments"
  | "tasks"
  | "travel"
  | "activity";

export type WindowEntry = { id: string; module: ModuleKey };

interface WindowManagerContextValue {
  windows: WindowEntry[];
  toggleWindow: (module: ModuleKey) => void;
  closeWindow: (id: string) => void;
  isOpen: (module: ModuleKey) => boolean;
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function WindowManager({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);

  const isOpen = useCallback(
    (module: ModuleKey) => windows.some((w) => w.module === module),
    [windows],
  );

  const toggleWindow = useCallback((module: ModuleKey) => {
    setWindows((prev) => {
      if (prev.some((w) => w.module === module)) {
        return prev.filter((w) => w.module !== module);
      }
      const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      return [...prev, { id, module }];
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
