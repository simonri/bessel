import { lazy } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  TrendingUp,
  CheckSquare,
  MapPin,
  Activity,
} from "lucide-react";
import type { ModuleKey } from "./window-manager";

export interface ModuleConfig {
  title: string;
  icon: LucideIcon;
  component: React.LazyExoticComponent<React.ComponentType>;
  colSpan: 1;
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleConfig> = {
  dashboard: {
    title: "Dashboard",
    icon: LayoutDashboard,
    component: lazy(() =>
      import("@/routes/_app/index").then((m) => ({ default: m.Dashboard })),
    ),
    colSpan: 1,
  },
  transactions: {
    title: "Transactions",
    icon: ArrowLeftRight,
    component: lazy(() =>
      import("@/routes/_app/transactions").then((m) => ({ default: m.Transactions })),
    ),
    colSpan: 1,
  },
  accounts: {
    title: "Accounts",
    icon: Landmark,
    component: lazy(() =>
      import("@/routes/_app/accounts").then((m) => ({ default: m.Accounts })),
    ),
    colSpan: 1,
  },
  investments: {
    title: "Investments",
    icon: TrendingUp,
    component: lazy(() =>
      import("@/routes/_app/investments").then((m) => ({ default: m.Investments })),
    ),
    colSpan: 1,
  },
  tasks: {
    title: "Tasks",
    icon: CheckSquare,
    component: lazy(() =>
      import("@/routes/_app/tasks").then((m) => ({ default: m.Tasks })),
    ),
    colSpan: 1,
  },
  travel: {
    title: "Travel",
    icon: MapPin,
    component: lazy(() =>
      import("@/routes/_app/travel").then((m) => ({ default: m.Travel })),
    ),
    colSpan: 1,
  },
  activity: {
    title: "Activity",
    icon: Activity,
    component: lazy(() =>
      import("@/routes/_app/activity").then((m) => ({ default: m.ActivityPage })),
    ),
    colSpan: 1,
  },
};

export const MODULE_ORDER: ModuleKey[] = [
  "dashboard",
  "transactions",
  "accounts",
  "investments",
  "tasks",
  "travel",
  "activity",
];
