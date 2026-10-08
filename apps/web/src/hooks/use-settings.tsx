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

function isThemeKey(value: unknown): value is ThemeKey {
  return (THEME_KEYS as readonly unknown[]).includes(value);
}

// Exact oklch values — kept as literal strings (not CSS variables) since the
// background color is a per-wallpaper choice, independent of the accent
// theme's own [data-theme] palette.
export const WALLPAPER_COLORS: Record<WallpaperColorKey, string> = {
  zinc: "oklch(14.1% 0.005 285.823)",
  neutral: "oklch(14.5% 0 none)",
  stone: "oklch(14.7% 0.004 49.25)",
  umber: "oklch(14.7% 0.004 49.3)",
};

function isWallpaperKey(value: unknown): value is WallpaperKey {
  return (
    value === "image" ||
    (typeof value === "string" && value in WALLPAPER_COLORS)
  );
}

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
const DEFAULT_SETTINGS: Settings = {
  cryptoPairs: "BTCUSDT",
  activityMappings: [],
  wallpaper: "image",
  theme: "orange",
  gridGap: 4,
  obsidianVaultPath: null,
  obsidianRecentVaults: [],
  calendarReminders: true,
  hyperliquidAddress: null,
  navOrder: [],
};

function withDefaults(stored: Partial<Settings>): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  // A theme that was removed (or a hand-edited value) would leave no accent.
  if (!isThemeKey(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme;
  // Moving wallpapers are gone; anyone who had one gets the still image.
  if (!isWallpaperKey(settings.wallpaper))
    settings.wallpaper = DEFAULT_SETTINGS.wallpaper;
  return settings;
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
    setSettings((prev) => ({ ...prev, ...patch }));
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
