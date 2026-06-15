import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  TrendingUp,
  MapPin,
  CheckSquare,
  BookOpen,
  Dumbbell,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@metron/ui/lib/utils";

const pinnedItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/" },
  { title: "Travel", icon: MapPin, href: "/travel" },
  { title: "Tasks", icon: CheckSquare, href: "/tasks" },
];

const moreItems = [
  { title: "Transactions", icon: ArrowLeftRight, href: "/transactions" },
  { title: "Accounts", icon: Landmark, href: "/accounts" },
  { title: "Investments", icon: TrendingUp, href: "/investments" },
  { title: "Journal", icon: BookOpen, href: "/journal" },
  { title: "Workout", icon: Dumbbell, href: "/workout" },
  { title: "Settings", icon: Settings, href: "/settings" },
];

export function MobileNav() {
  const [expanded, setExpanded] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <div className="md:hidden">
      {/* Scrim */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0 duration-150"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Expanded menu — slides up from bottom */}
      {expanded && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-200">
          <div className="bg-background rounded-t-2xl border-t px-4 pt-4 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="text-sm font-semibold text-foreground">Navigation</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
            {moreItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setExpanded(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-colors",
                  currentPath === item.href && "bg-accent text-foreground",
                )}
              >
                <item.icon className="size-5" />
                <span className="text-sm font-medium">{item.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Floating bottom bar */}
      {!expanded && (
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <div className="bg-background/95 backdrop-blur-md border rounded-2xl shadow-lg px-3 py-2 flex items-center justify-around gap-1">
            {pinnedItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "rounded-xl p-2.5 text-muted-foreground transition-colors",
                  currentPath === item.href && "text-primary",
                )}
              >
                <item.icon className="size-5" />
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-xl p-2.5 text-muted-foreground transition-colors"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
