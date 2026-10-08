import { Bot, CheckSquare, LayoutGrid, Sun } from "lucide-react";
import { lazy } from "react";
import { MODULE_REGISTRY } from "@/components/canvas/module-registry";
import type { ModuleKey } from "@/components/canvas/window-manager";
import { isDesktop } from "@/lib/environment";

// Top-level pages the sidebar navigates between. Pages are shell state rather
// than router routes: the canvas must stay mounted for the app's whole life
// (terminal PTYs, agent sessions), so switching pages hides/shows rather than
// unmounts — the same trick the canvas uses for inactive workspaces.
export type PageKey =
  | "today"
  | "canvas"
  | "travel"
  | "timeline"
  | "googleTimeline"
  | "hyperliquid"
  | "calendar"
  | "tasks"
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
  today: {
    title: "Today",
    icon: Sun,
    component: lazy(() =>
      import("@/components/today/today-page").then((m) => ({
        default: m.TodayPage,
      })),
    ),
  },
  canvas: { title: "Canvas", icon: LayoutGrid },
  travel: fromModule("travel", true),
  timeline: fromModule("timeline"),
  googleTimeline: fromModule("googleTimeline"),
  hyperliquid: fromModule("hyperliquid"),
  calendar: fromModule("calendar", true),
  tasks: {
    title: "Tasks",
    icon: CheckSquare,
    component: lazy(() =>
      import("@/components/tasks/tasks-page").then((m) => ({
        default: m.TasksPage,
      })),
    ),
  },
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
  "today",
  "canvas",
  "travel",
  "calendar",
  "tasks",
  "timeline",
  "googleTimeline",
  "activity",
  "hyperliquid",
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

/**
 * PRIMARY_PAGES in the user's saved order. Pages the order doesn't mention
 * (added since it was saved, or desktop-only) keep their default slot.
 */
export function orderPrimaryPages(order: readonly string[]): PageKey[] {
  const rank = new Map(
    order
      .filter((key) => PRIMARY_PAGES.includes(key as PageKey))
      .map((key, i) => [key, i]),
  );
  const ordered = PRIMARY_PAGES.filter((key) => rank.has(key)).sort(
    (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
  );
  for (const [i, key] of PRIMARY_PAGES.entries()) {
    if (!rank.has(key)) ordered.splice(Math.min(i, ordered.length), 0, key);
  }
  return ordered;
}

export function isPageKey(value: unknown): value is PageKey {
  return typeof value === "string" && ALL_PAGES.has(value);
}
