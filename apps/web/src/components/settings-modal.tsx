import {
  GlassDialog,
  GlassDialogClose,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import {
  Activity,
  Info,
  Laptop,
  LayoutDashboard,
  MessageSquare,
  PanelLeft,
  Plug,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { AboutPage } from "@/components/settings-about-page";
import { ClaudePage } from "@/components/settings-claude-page";
import { DashboardPage } from "@/components/settings-dashboard-page";
import { DevicesPage } from "@/components/settings-devices-page";
import {
  IntegrationsPage,
  type IntegrationsTab,
} from "@/components/settings-integrations-page";
import { MonitorPage } from "@/components/settings-monitor-page";
import { PagesPage } from "@/components/settings-pages-page";
import { SettingsPageHeader } from "@/components/settings-ui";
import { cn } from "@/lib/utils";

const isDesktop = typeof window !== "undefined" && !!window.electron;

export type SettingsPage =
  | "dashboard"
  | "pages"
  | "integrations"
  | "claude"
  | "devices"
  | "monitor"
  | "about";

interface NavItem {
  key: SettingsPage;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Other words people search for to find this page. */
  keywords: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Preferences",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        description: "Configure the top bar and widget display settings.",
        icon: LayoutDashboard,
        keywords: "top bar widgets grid gap",
      },
      {
        key: "pages",
        label: "Pages",
        description: "Choose which optional pages show in the sidebar.",
        icon: PanelLeft,
        keywords:
          "sidebar show hide trading hyperliquid investments sleep screen time",
      },
    ],
  },
  {
    label: "Connections",
    items: [
      {
        key: "integrations",
        label: "Integrations",
        description: "Everything Bessel gets data from, in one place.",
        icon: Plug,
        keywords:
          "accounts google icloud calendar contacts bank avanza montrose klarna hyperliquid claude obsidian timeline connect",
      },
      {
        key: "claude",
        label: "Claude",
        description: "Connect Claude to Bessel and see what it remembers.",
        icon: MessageSquare,
        keywords: "mcp connector assistant ai memory notes morning report",
      },
    ],
  },
  ...(isDesktop
    ? [
        {
          label: "Desktop app",
          items: [
            {
              key: "devices" as const,
              label: "Devices",
              description: "Manage the devices linked to your account.",
              icon: Laptop,
              keywords: "computers code folders projects",
            },
            {
              key: "monitor" as const,
              label: "Activity monitor",
              description: "Manage the background activity tracker service.",
              icon: Activity,
              keywords: "screen time tracker service",
            },
            {
              key: "about" as const,
              label: "About",
              description: "Application version and update settings.",
              icon: Info,
              keywords: "version updates release",
            },
          ],
        },
      ]
    : []),
];

const ITEMS = GROUPS.flatMap((group) => group.items);

/** The settings pages whose label or keywords contain every word of `query`. */
export function matchingGroups(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const text = `${item.label} ${item.keywords}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.items.length > 0);
}

export function SettingsModal({
  open,
  page,
  integrationsTab,
  onIntegrationsTabChange,
  onPageChange,
  onClose,
}: {
  open: boolean;
  page: SettingsPage;
  integrationsTab: IntegrationsTab;
  onIntegrationsTabChange: (tab: IntegrationsTab) => void;
  onPageChange: (page: SettingsPage) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const active = ITEMS.find((item) => item.key === page) ?? ITEMS[0];
  const groups = matchingGroups(query);

  return (
    <GlassDialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setQuery("");
        onClose();
      }}
    >
      <GlassDialogContent
        showCloseButton={false}
        className="flex h-[min(800px,calc(100vh-2rem))] w-[min(1040px,calc(100vw-2rem))] max-w-none flex-col p-0"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 pr-3 pl-5">
          <GlassDialogTitle className="text-15 font-semibold text-white/90">
            Settings
          </GlassDialogTitle>
          <GlassDialogDescription className="sr-only">
            {active.description}
          </GlassDialogDescription>
          <GlassDialogClose
            title="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/45 outline-none transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/85 focus-visible:ring-1 focus-visible:ring-white/25"
          >
            <X className="size-4" />
          </GlassDialogClose>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/10 bg-chrome p-3 pt-5">
            <label className="relative block">
              <span className="sr-only">Search settings</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/35" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  const matches = groups.flatMap((g) => g.items);
                  if (e.key === "Enter" && matches.length === 1)
                    onPageChange(matches[0].key);
                }}
                placeholder="Search"
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] pr-2.5 pl-8 text-13 text-white/85 outline-none transition-colors duration-150 placeholder:text-white/30 hover:border-white/15 focus:border-white/20 focus:bg-white/[0.06]"
              />
            </label>

            {groups.length === 0 && (
              <p className="px-2.5 text-12 text-white/40">
                No settings match &ldquo;{query.trim()}&rdquo;.
              </p>
            )}
            {groups.map((group) => (
              <nav key={group.label} aria-label={group.label}>
                <p className="mb-1 px-2.5 text-12 text-white/40">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(({ key, label, icon: Icon }) => {
                    const current = key === page;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          aria-current={current ? "page" : undefined}
                          onClick={() => onPageChange(key)}
                          className={cn(
                            "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-13 transition-colors duration-150",
                            current
                              ? "bg-white/10 text-white/90"
                              : "text-white/60 hover:bg-white/[0.05] hover:text-white/85",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              current ? "text-white/80" : "text-white/40",
                            )}
                          />
                          <span className="truncate">{label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
            {page === "integrations" ? (
              <IntegrationsPage
                tab={integrationsTab}
                onTabChange={onIntegrationsTabChange}
              />
            ) : (
              <>
                <SettingsPageHeader title={active.label} />
                <div className="mt-5">
                  {page === "dashboard" && <DashboardPage />}
                  {page === "pages" && <PagesPage />}
                  {page === "claude" && <ClaudePage />}
                  {page === "devices" && <DevicesPage />}
                  {page === "monitor" && <MonitorPage />}
                  {page === "about" && <AboutPage />}
                </div>
              </>
            )}
          </div>
        </div>
      </GlassDialogContent>
    </GlassDialog>
  );
}
