import {
  GlassDialog,
  GlassDialogClose,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import {
  Cpu,
  Gauge,
  Info,
  Laptop,
  LayoutDashboard,
  Palette,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { AboutPage } from "@/components/settings-about-page";
import { AgentUsagePage } from "@/components/settings-agent-usage-page";
import { AppearancePage } from "@/components/settings-appearance-page";
import { DashboardPage } from "@/components/settings-dashboard-page";
import { DevicesPage } from "@/components/settings-devices-page";
import { MonitorPage } from "@/components/settings-monitor-page";
import { MyAiPage } from "@/components/settings-my-ai-page";
import { cn } from "@/lib/utils";

const isDesktop = typeof window !== "undefined" && !!window.electron;
// systemctl-based install/status only makes sense on Linux — unlike the
// other desktop-only pages, gate this one specifically instead of on
// isDesktop, so it doesn't show on mac/win builds where it can't work.
const isLinuxDesktop = isDesktop && window.electron?.platform === "linux";

type SidebarPage =
  | "appearance"
  | "dashboard"
  | "devices"
  | "monitor"
  | "agent-usage"
  | "my-ai"
  | "about";

const PAGE_DESCRIPTIONS: Record<SidebarPage, string> = {
  appearance: "Customize the look and feel of your dashboard.",
  dashboard: "Configure the top bar and widget display settings.",
  devices: "Manage the devices linked to your account.",
  monitor: "Manage the background activity tracker service.",
  "agent-usage": "Manage the Claude Code usage tracking timer.",
  "my-ai": "Personal context folder for AI assistants like Claude Code.",
  about: "Application version and update settings.",
};

const NAV_ITEMS: {
  key: SidebarPage;
  label: string;
  icon: React.ElementType;
}[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ...(isDesktop
    ? [
        { key: "devices" as const, label: "Devices", icon: Laptop },
        { key: "monitor" as const, label: "Monitor", icon: Cpu },
        ...(isLinuxDesktop
          ? [
              {
                key: "agent-usage" as const,
                label: "Agent Usage",
                icon: Gauge,
              },
            ]
          : []),
        { key: "my-ai" as const, label: "My AI", icon: Sparkles },
        { key: "about" as const, label: "About", icon: Info },
      ]
    : []),
];

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState<SidebarPage>("appearance");
  const activeItem = NAV_ITEMS.find((n) => n.key === page);
  const ActiveIcon = activeItem?.icon ?? Settings;

  return (
    <GlassDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <GlassDialogContent
        showCloseButton={false}
        className="flex h-[520px] w-full max-w-[680px] p-0"
      >
        <GlassDialogTitle className="sr-only">Settings</GlassDialogTitle>
        <GlassDialogDescription className="sr-only">
          {PAGE_DESCRIPTIONS[page]}
        </GlassDialogDescription>

        {/* Sidebar */}
        <aside className="flex w-48 shrink-0 flex-col bg-black/20">
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="flex size-6 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04]">
              <Settings className="size-3 text-white/40" />
            </div>
            <span className="text-11 font-medium tracking-wide text-white/40">
              Settings
            </span>
          </div>
          <nav className="flex-1 space-y-0.5 px-2.5 pb-2.5">
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
              const active = page === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPage(key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98]",
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-white/45 hover:bg-white/[0.04] hover:text-white/75",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active ? "text-primary-400" : "text-white/30",
                    )}
                  />
                  <span className="text-13 font-medium">{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.06]">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04]">
                <ActiveIcon className="size-4 text-white/70" />
              </div>
              <div className="min-w-0">
                <h1 className="text-15 font-semibold text-white/90">
                  {activeItem?.label}
                </h1>
                <p className="truncate text-12 text-white/45">
                  {PAGE_DESCRIPTIONS[page]}
                </p>
              </div>
            </div>
            <GlassDialogClose className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white/25 transition-colors duration-150 pointer-fine:hover:bg-white/5 pointer-fine:hover:text-white/60">
              <X className="size-3.5" />
            </GlassDialogClose>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {page === "appearance" && <AppearancePage />}
            {page === "dashboard" && <DashboardPage />}
            {page === "devices" && <DevicesPage />}
            {page === "monitor" && <MonitorPage />}
            {page === "agent-usage" && <AgentUsagePage />}
            {page === "my-ai" && <MyAiPage />}
            {page === "about" && <AboutPage />}
          </div>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  );
}
