import { Cpu, Info, LayoutDashboard, Palette, Settings, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { AboutPage } from "@/components/settings-about-page";
import { AppearancePage } from "@/components/settings-appearance-page";
import { DashboardPage } from "@/components/settings-dashboard-page";
import { MonitorPage } from "@/components/settings-monitor-page";

const isDesktop = typeof window !== "undefined" && !!window.electron;

type SidebarPage = "appearance" | "dashboard" | "monitor" | "about";

const PAGE_DESCRIPTIONS: Record<SidebarPage, string> = {
  appearance: "Customize the look and feel of your dashboard.",
  dashboard: "Configure the top bar and widget display settings.",
  monitor: "Manage the background activity tracker service.",
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
        { key: "monitor" as const, label: "Monitor", icon: Cpu },
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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[480px] w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">
            Settings
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {PAGE_DESCRIPTIONS[page]}
          </DialogPrimitive.Description>

          {/* Sidebar */}
          <aside className="flex w-44 shrink-0 flex-col bg-black/30">
            <div className="flex items-center gap-2 px-4 py-4">
              <Settings className="size-3.5 text-white/30" />
              <span className="text-[11px] font-semibold tracking-widest text-white/30">
                SETTINGS
              </span>
            </div>
            <nav className="flex-1 space-y-0.5 px-2 pb-2">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
                const active = page === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPage(key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all ${
                      active
                        ? "bg-primary-500 text-white shadow-lg shadow-primary-900/30"
                        : "text-white/40 hover:bg-white/5 hover:text-white/75"
                    }`}
                  >
                    <Icon
                      className={`size-3.5 shrink-0 ${active ? "text-white/90" : "text-white/30"}`}
                    />
                    <span className="text-[13px] font-medium">{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col border-l border-white/[0.06]">
            <div className="flex items-start justify-between px-6 pt-5 pb-0">
              <div>
                <h1 className="text-[15px] font-semibold text-white/90">
                  {NAV_ITEMS.find((n) => n.key === page)?.label}
                </h1>
                <p className="mt-0.5 text-xs text-white/35">
                  {PAGE_DESCRIPTIONS[page]}
                </p>
              </div>
              <DialogPrimitive.Close className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-white/5 hover:text-white/60">
                <X className="size-3.5" />
              </DialogPrimitive.Close>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
              {page === "appearance" && <AppearancePage />}
              {page === "dashboard" && <DashboardPage />}
              {page === "monitor" && <MonitorPage />}
              {page === "about" && <AboutPage />}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
