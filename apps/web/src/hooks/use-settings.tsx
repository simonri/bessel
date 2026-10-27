import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { userStorage } from "@/lib/user-storage";

export interface ActivityMapping {
  from: string;
  to: string;
}

export type WallpaperColorKey = "zinc" | "neutral" | "stone" | "umber";
export type WallpaperKey = "image" | WallpaperColorKey;
export const THEME_KEYS = ["orange", "green", "rose", "lilac", "sky"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

// Exact oklch values — kept as literal strings (not CSS variables) since the
// background color is a per-wallpaper choice, independent of the accent
// theme's own [data-theme] palette.
export const WALLPAPER_COLORS: Record<WallpaperColorKey, string> = {
  zinc: "oklch(14.1% 0.005 285.823)",
  neutral: "oklch(14.5% 0 none)",
  stone: "oklch(14.7% 0.004 49.25)",
  umber: "oklch(14.7% 0.004 49.3)",
};

export function isWallpaperColor(key: WallpaperKey): key is WallpaperColorKey {
  return key in WALLPAPER_COLORS;
}

interface Settings {
  cryptoPairs: string;
  activityMappings: ActivityMapping[];
  wallpaper: WallpaperKey;
  theme: ThemeKey;
  gridGap: number;
  /** Last opened Obsidian vault's folder path, desktop-only. */
  obsidianVaultPath: string | null;
  /** Most recently opened vault paths, newest first, capped at 5. */
  obsidianRecentVaults: string[];
  /** Desktop notification shortly before calendar events start. */
  calendarReminders: boolean;
  /** Hyperliquid account shown on the Hyperliquid page; public, read-only. */
  hyperliquidAddress: string | null;
  /** Sidebar page order; pages missing from it keep their default slot. */
  navOrder: string[];
}

const STORAGE_KEY = "bessel:settings";
const LEGACY_KEY = "metron:settings";

/**
 * Bessel has one look for now: the peach accent on a stone background. The
 * theme and wallpaper settings stay so more looks can come back; until then
 * nothing saved can change these.
 */
const LOOK = { theme: "orange", wallpaper: "stone" } as const satisfies Pick<
  Settings,
  "theme" | "wallpaper"
>;

const DEFAULT_SETTINGS: Settings = {
  cryptoPairs: "",
  activityMappings: [],
  ...LOOK,
  gridGap: 4,
  obsidianVaultPath: null,
  obsidianRecentVaults: [],
  calendarReminders: true,
  hyperliquidAddress: null,
  navOrder: [],
};

/**
 * What a key missing from saved settings meant when those settings were saved.
 * New users get the leaner DEFAULT_SETTINGS; settings saved before a default
 * changed keep what their owner always saw. Every save writes every key, so a
 * key is only ever missing from settings saved before it existed.
 */
const SAVED_BEFORE: Partial<Settings> = {
  cryptoPairs: "BTCUSDT",
};

function withDefaults(stored: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...SAVED_BEFORE, ...stored, ...LOOK };
}

function loadSettings(): Settings {
  try {
    const raw = userStorage.getItem(STORAGE_KEY);
    if (raw) return withDefaults(JSON.parse(raw) as Partial<Settings>);
  } catch {}

  // Falls back to the pre-rebrand key name — see window-manager.tsx's
  // identical LEGACY_KEY handling for the same "metron:" -> "bessel:" rename.
  try {
    const legacyRaw = userStorage.getItem(LEGACY_KEY);
    if (legacyRaw)
      return withDefaults(JSON.parse(legacyRaw) as Partial<Settings>);
  } catch {}

  return DEFAULT_SETTINGS;
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

  const loadedRef = useRef(settings);
  useEffect(() => {
    if (settings === loadedRef.current) return;
    userStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch, ...LOOK }));
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
