import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeftRight,
  Bot,
  CheckSquare,
  ChefHat,
  GitBranch,
  Globe,
  Landmark,
  LayoutDashboard,
  MapPin,
  Sparkles,
  SquareTerminal,
  Terminal,
  TrendingUp,
} from "lucide-react";
import { lazy } from "react";
import { isDesktop } from "@/lib/environment";
import type { ModuleKey } from "./window-manager";

export interface ModuleConfig {
  title: string;
  icon: LucideIcon;
  component: React.LazyExoticComponent<React.ComponentType>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  multiInstance?: boolean;
  noPadding?: boolean;
}

const COMPACT_SIZE = { defaultSize: { w: 8, h: 8 }, minSize: { w: 4, h: 4 } };
const SESSION_SIZE = { defaultSize: { w: 12, h: 14 }, minSize: { w: 6, h: 6 } };

export const MODULE_REGISTRY: Record<ModuleKey, ModuleConfig> = {
  dashboard: {
    title: "Dashboard",
    icon: LayoutDashboard,
    component: lazy(() =>
      import("@/routes/_app/index").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
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
    title: "Travel",
    icon: MapPin,
    component: lazy(() =>
      import("@/routes/_app/travel").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
  },
  activity: {
    title: "Activity",
    icon: Activity,
    component: lazy(() =>
      import("@/routes/_app/activity").then((m) => ({
        default: m.Route.options.component as React.ComponentType,
      })),
    ),
    ...COMPACT_SIZE,
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
    icon: Terminal,
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
    icon: Bot,
    component: lazy(() =>
      import("@/routes/_app/-codex").then((m) => ({ default: m.Codex })),
    ),
    ...SESSION_SIZE,
    multiInstance: true,
    noPadding: true,
  },
  grok: {
    title: "Grok",
    icon: Sparkles,
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
};

const desktopModules: ModuleKey[] = isDesktop
  ? ["claudeCode", "codex", "grok", "terminal", "browser"]
  : [];

export const MODULE_ORDER: ModuleKey[] = [
  "dashboard",
  "transactions",
  "accounts",
  "investments",
  "tasks",
  "travel",
  "activity",
  "recipes",
  "gitStatus",
  ...desktopModules,
];
