import { Bot, LayoutGrid } from "lucide-react";
import { lazy } from "react";
import { MODULE_REGISTRY } from "@/components/canvas/module-registry";
import type { ModuleKey } from "@/components/canvas/window-manager";
import { isDesktop } from "@/lib/environment";

// Top-level pages the sidebar navigates between. Pages are shell state rather
// than router routes: the canvas must stay mounted for the app's whole life
// (terminal PTYs, agent sessions), so switching pages hides/shows rather than
// unmounts — the same trick the canvas uses for inactive workspaces.
export type PageKey =
  | "canvas"
  | "travel"
  | "timeline"
  | "googleTimeline"
  | "calendar"
  | "activity"
  | "sleep"
  | "recipes"
  | "transactions"
  | "accounts"
  | "investments"
  | "obsidian"
  | "sessions";

export interface PageConfig {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Absent for the canvas, which the shell renders itself (see AppShell). */
  component?: React.LazyExoticComponent<React.ComponentType>;
  /** The page paints its own header/edges — skip the default content padding. */
  noPadding?: boolean;
}

// The same components render as canvas widgets, so the module registry stays
// the single owner of their code-split imports, icons and padding rules.
function fromModule(key: ModuleKey, noPadding?: boolean): PageConfig {
  const { title, icon, component } = MODULE_REGISTRY[key];
  return { title, icon, component, noPadding };
}

export const PAGE_REGISTRY: Record<PageKey, PageConfig> = {
  canvas: { title: "Canvas", icon: LayoutGrid },
  travel: fromModule("travel", true),
  timeline: fromModule("timeline"),
  googleTimeline: fromModule("googleTimeline"),
  calendar: fromModule("calendar", true),
  activity: fromModule("activity"),
  sleep: fromModule("sleep"),
  recipes: fromModule("recipes"),
  transactions: fromModule("transactions"),
  accounts: fromModule("accounts"),
  investments: fromModule("investments"),
  obsidian: fromModule("obsidian", true),
  sessions: {
    title: "Sessions",
    icon: Bot,
    component: lazy(() =>
      import("@/components/claude-sessions/sessions-page").then((m) => ({
        default: m.SessionsPage,
      })),
    ),
  },
};

/** Shown as top-level sidebar items. */
export const PRIMARY_PAGES: PageKey[] = [
  "canvas",
  "travel",
  "calendar",
  "timeline",
  "googleTimeline",
  "activity",
  "sleep",
  "recipes",
  ...(isDesktop ? (["obsidian"] as PageKey[]) : []),
];

/** Tucked behind the sidebar's "More" menu. */
export const MORE_PAGES: PageKey[] = [
  "transactions",
  "accounts",
  "investments",
  ...(isDesktop ? (["sessions"] as PageKey[]) : []),
];

const ALL_PAGES = new Set<string>([...PRIMARY_PAGES, ...MORE_PAGES]);

export function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && ALL_PAGES.has(value);
}
