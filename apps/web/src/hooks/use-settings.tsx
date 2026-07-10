import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  gridGap: number;
}

const STORAGE_KEY = "metron:settings";
const DEFAULT_SETTINGS: Settings = {
  cryptoPairs: "BTCUSDT",
  activityMappings: [],
  wallpaper: "video",
  theme: "orange",
  gridGap: 16,
};

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

  // Memoized so parent re-renders (auth/query state in AppLayout) don't mint a
  // new context value and cascade into every settings consumer.
  const value = useMemo(() => ({ settings, update }), [settings, update]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
