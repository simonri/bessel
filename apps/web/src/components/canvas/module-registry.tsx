import {
  Activity,
  ArrowLeftRight,
  CalendarDays,
  ChartCandlestick,
  ChartGantt,
  CheckSquare,
  ChefHat,
  GitBranch,
  Globe,
  Landmark,
  MapPin,
  Moon,
  Route,
  SquareTerminal,
  TrendingUp,
} from "lucide-react";
import { lazy } from "react";
import { isDesktop } from "@/lib/environment";
import { ClaudeIcon, CodexIcon, GrokIcon, ObsidianIcon } from "./brand-icons";
import type { ModuleKey } from "./window-manager";

export interface ModuleConfig {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.LazyExoticComponent<React.ComponentType>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  multiInstance?: boolean;
  noPadding?: boolean;
}

const COMPACT_SIZE = { defaultSize: { w: 8, h: 8 }, minSize: { w: 4, h: 4 } };
const SESSION_SIZE = { defaultSize: { w: 12, h: 14 }, minSize: { w: 6, h: 6 } };

export const MODULE_REGISTRY: Record<ModuleKey, ModuleConfig> = {
  transactions: {
    title: "Transactions",
    icon: ArrowLeftRight,
    component: lazy(() =>
      import("@/routes/_app/transactions").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  accounts: {
    title: "Accounts",
    icon: Landmark,
    component: lazy(() =>
      import("@/routes/_app/accounts").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  investments: {
    title: "Investments",
    icon: TrendingUp,
    component: lazy(() =>
      import("@/routes/_app/investments").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  tasks: {
    title: "Tasks",
    icon: CheckSquare,
    component: lazy(() =>
      import("@/routes/_app/tasks").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
    noPadding: true,
  },
  travel: {
    title: "Saved places",
    icon: MapPin,
    component: lazy(() =>
      import("@/routes/_app/travel").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  activity: {
    title: "Screen time",
    icon: Activity,
    component: lazy(() =>
      import("@/routes/_app/activity").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  sleep: {
    title: "Sleep",
    icon: Moon,
    component: lazy(() =>
      import("@/routes/_app/sleep").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  timeline: {
    title: "Timeline",
    icon: ChartGantt,
    component: lazy(() =>
      import("@/routes/_app/timeline").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  hyperliquid: {
    title: "Trading",
    icon: ChartCandlestick,
    component: lazy(() =>
      import("@/routes/_app/hyperliquid").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...SESSION_SIZE,
  },
  googleTimeline: {
    title: "Location history",
    icon: Route,
    component: lazy(() =>
      import("@/routes/_app/google-timeline").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...SESSION_SIZE,
  },
  calendar: {
    title: "Calendar",
    icon: CalendarDays,
    component: lazy(() =>
      import("@/components/calendar/calendar-page").then((m) => ({
        default: m.CalendarPage,
      })),
    ),
    ...SESSION_SIZE,
    noPadding: true,
  },
  recipes: {
    title: "Recipes",
    icon: ChefHat,
    component: lazy(() =>
      import("@/routes/_app/recipes").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  claudeCode: {
    title: "Claude",
    icon: ClaudeIcon,
    component: lazy(() =>
      import("@/routes/_app/-claude-code").then((m) => ({
        default: m.ClaudeCode,
      })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  codex: {
    title: "Codex",
    icon: CodexIcon,
    component: lazy(() =>
      import("@/routes/_app/-codex").then((m) => ({ default: m.Codex })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  grok: {
    title: "Grok",
    icon: GrokIcon,
    component: lazy(() =>
      import("@/routes/_app/-grok").then((m) => ({ default: m.Grok })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  terminal: {
    title: "Terminal",
    icon: SquareTerminal,
    component: lazy(() =>
      import("@/routes/_app/-terminal").then((m) => ({
        default: m.TerminalPage,
      })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  gitStatus: {
    title: "Git",
    icon: GitBranch,
    component: lazy(() =>
      import("@/routes/_app/-git-status").then((m) => ({
        default: m.GitStatus,
      })),
    ),
    ...SESSION_SIZE,
    noPadding: true,
  },
  browser: {
    title: "Browser",
    icon: Globe,
    component: lazy(() =>
      import("@/routes/_app/-browser").then((m) => ({
        default: m.BrowserPage,
      })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  obsidian: {
    title: "Notes",
    icon: ObsidianIcon,
    component: lazy(() =>
      import("@/components/obsidian/obsidian-page").then((m) => ({
        default: m.ObsidianPage,
      })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
};

/** Whether this module's window carries a project directory (`projectPath`/
 *  `projectSshHost` in its data) that a widget can be respawned into. */
export function moduleSupportsProject(module: ModuleKey): boolean {
  return (
    module === "claudeCode" ||
    module === "codex" ||
    module === "grok" ||
    module === "terminal"
  );
}

const DESKTOP_ONLY_MODULES: ReadonlySet<ModuleKey> = new Set([
  "claudeCode",
  "codex",
  "grok",
  "terminal",
  "browser",
  "obsidian",
]);

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && Object.hasOwn(MODULE_REGISTRY, value);
}

/** Whether a (possibly persisted, untrusted) module key can be opened here. */
export function isAvailableModule(value: unknown): value is ModuleKey {
  return isModuleKey(value) && (isDesktop || !DESKTOP_ONLY_MODULES.has(value));
}

const desktopModules: ModuleKey[] = isDesktop ? [...DESKTOP_ONLY_MODULES] : [];

// Modules also reachable as sidebar pages (see pages.ts) are left out here —
// the dock and command palette only offer opening a widget for modules that
// aren't already a page of their own.
export const MODULE_ORDER: ModuleKey[] = [
  "tasks",
  "gitStatus",
  ...desktopModules,
];
