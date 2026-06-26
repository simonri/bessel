import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface ActivityMapping {
  from: string;
  to: string;
}

export type WallpaperKey = "image" | "video";
export type ThemeKey = "orange" | "green";

interface Settings {
  cryptoPairs: string;
  activityMappings: ActivityMapping[];
  wallpaper: WallpaperKey;
  theme: ThemeKey;
}

const STORAGE_KEY = "metron:settings";
const DEFAULT_SETTINGS: Settings = { cryptoPairs: "BTCUSDT", activityMappings: [], wallpaper: "image", theme: "orange" };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
