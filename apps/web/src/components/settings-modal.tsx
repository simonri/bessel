import { useEffect, useState } from "react";
import { Plus, X, Palette, LayoutDashboard, Settings, Info, Cpu } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ActivityMapping, type ThemeKey, type WallpaperKey, useSettings } from "@/hooks/use-settings";

const isDesktop = typeof window !== "undefined" && !!window.electron;

type SidebarPage = "appearance" | "dashboard" | "monitor" | "about";

const PAGE_DESCRIPTIONS: Record<SidebarPage, string> = {
  appearance: "Customize the look and feel of your dashboard.",
  dashboard: "Configure the top bar and widget display settings.",
  monitor: "Manage the background activity tracker service.",
  about: "Application version and update settings.",
};

const NAV_ITEMS: { key: SidebarPage; label: string; icon: React.ElementType }[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ...(isDesktop ? [
    { key: "monitor" as const, label: "Monitor", icon: Cpu },
    { key: "about" as const, label: "About", icon: Info },
  ] : []),
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState<SidebarPage>("appearance");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[480px] w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">Settings</DialogPrimitive.Title>

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
                    <Icon className={`size-3.5 shrink-0 ${active ? "text-white/90" : "text-white/30"}`} />
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
                <p className="mt-0.5 text-xs text-white/35">{PAGE_DESCRIPTIONS[page]}</p>
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

function AppearancePage() {
  return (
    <div className="space-y-8">
      <ThemePage />
      <WallpaperPage />
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="space-y-8">
      <TopBarPage />
      <GridGapPage />
      <ActivityPage />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold tracking-widest text-white/30">
      {children}
    </p>
  );
}

const THEME_OPTIONS: { key: ThemeKey; label: string; hue: number }[] = [
  { key: "orange", label: "Orange", hue: 40 },
  { key: "green", label: "Green", hue: 145 },
];

function ThemePage() {
  const { settings, update } = useSettings();
  const selected = settings.theme;

  return (
    <div>
      <SectionLabel>Accent color</SectionLabel>
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ key, label, hue }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => update({ theme: key })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all ${
                isSelected
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/[0.07] text-white/40 hover:border-white/15 hover:text-white/70"
              }`}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: `oklch(0.70 0.18 ${hue})` }}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WALLPAPER_OPTIONS: { key: WallpaperKey; label: string; src: string; isVideo: boolean }[] = [
  { key: "image", label: "Static", src: "/image.png", isVideo: false },
  { key: "video", label: "Forest Night", src: "/wallpaper-forest-loop.mp4", isVideo: true },
];

function WallpaperPage() {
  const { settings, update } = useSettings();
  const selected = settings.wallpaper;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Background</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {WALLPAPER_OPTIONS.map(({ key, label, src, isVideo }) => (
            <button
              key={key}
              onClick={() => update({ wallpaper: key })}
              className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                selected === key
                  ? "border-primary-500 shadow-lg shadow-primary-900/30"
                  : "border-white/10 hover:border-white/25"
              }`}
              style={{ aspectRatio: "16/9" }}
            >
              {isVideo ? (
                <video
                  src={src}
                  muted
                  autoPlay
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <img src={src} alt={label} className="h-full w-full object-cover" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                <span className="text-[11px] font-medium text-white/80">{label}</span>
              </div>
              {selected === key && (
                <div className="absolute inset-0 bg-primary-500/10 ring-inset" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopBarPage() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.cryptoPairs);

  const save = () => update({ cryptoPairs: draft.trim() });

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Crypto ticker</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-white/75">Pairs</label>
            <p className="text-[11px] text-white/35">
              Comma-separated symbols shown in the top bar, e.g. BTCUSDT,ETHUSDT
            </p>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="BTCUSDT,ETHUSDT"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function GridGapPage() {
  const { settings, update } = useSettings();

  return (
    <div>
      <SectionLabel>Grid gap</SectionLabel>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={settings.gridGap}
            onChange={(e) => update({ gridGap: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer accent-primary-500"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[13px] text-white/70">
            {settings.gridGap}px
          </span>
        </div>
      </div>
    </div>
  );
}

function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "up-to-date" | "available" | "error">("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electron?.getVersion().then(setVersion);
  }, []);

  const checkForUpdate = async () => {
    setStatus("checking");
    setAvailableVersion(null);
    try {
      const result = await window.electron!.checkForUpdate();
      if (result.status === "available") {
        setStatus("available");
        setAvailableVersion(result.version ?? null);
      } else if (result.status === "up-to-date" || result.status === "dev") {
        setStatus("up-to-date");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Application</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-white/60">Version</span>
            <span className="font-mono text-[13px] text-white/80">{version ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12px]">
              {status === "idle" && <span className="text-white/30">—</span>}
              {status === "checking" && <span className="text-white/50">Checking…</span>}
              {status === "up-to-date" && <span className="text-emerald-400">Up to date</span>}
              {status === "available" && (
                <span className="text-primary-400">
                  Update available{availableVersion ? `: v${availableVersion}` : ""}
                </span>
              )}
              {status === "error" && <span className="text-red-400">Could not check for updates</span>}
            </span>
            <button
              onClick={checkForUpdate}
              disabled={status === "checking"}
              className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white/90 disabled:opacity-40"
            >
              {status === "checking" ? "Checking…" : "Check for updates"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityPage() {
  const { settings, update } = useSettings();
  const [mappings, setMappings] = useState<ActivityMapping[]>(settings.activityMappings);

  const save = (next: ActivityMapping[]) => {
    setMappings(next);
    update({ activityMappings: next });
  };

  const add = () => save([...mappings, { from: "", to: "" }]);
  const remove = (i: number) => save(mappings.filter((_, idx) => idx !== i));
  const change = (i: number, field: keyof ActivityMapping, value: string) =>
    save(mappings.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>App name mappings</SectionLabel>

        <div className="space-y-2">
          {mappings.length > 0 && (
            <div className="flex gap-2 pr-9">
              <span className="flex-1 text-[11px] text-white/35">Raw name</span>
              <span className="flex-1 text-[11px] text-white/35">Display label</span>
            </div>
          )}

          {mappings.map((m, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2">
              <input
                type="text"
                value={m.from}
                onChange={(e) => change(i, "from", e.target.value)}
                placeholder="com.google.Chrome"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
              />
              <input
                type="text"
                value={m.to}
                onChange={(e) => change(i, "to", e.target.value)}
                placeholder="Chrome"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 outline-none placeholder:text-white/20 transition-colors focus:border-primary-500/40 focus:bg-white/[0.07]"
              />
              <button
                onClick={() => remove(i)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {mappings.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
              <p className="text-xs text-white/25">No mappings yet</p>
            </div>
          )}

          <button
            onClick={add}
            className="flex items-center gap-1.5 pt-1 text-[12px] font-medium text-primary-500/70 transition-colors hover:text-primary-400"
          >
            <Plus className="size-3.5" />
            Add mapping
          </button>
        </div>
      </div>
    </div>
  );
}

type MonitorStatusResult = {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  failed: boolean;
  state: string;
};

function MonitorPage() {
  const [status, setStatus] = useState<MonitorStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await window.electron!.monitor.status();
        if (alive) setStatus(s);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      const s = await window.electron!.monitor.status();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-[13px] text-white/30">Loading…</span>
      </div>
    );
  }

  const dotColor = status.failed
    ? "bg-red-400"
    : status.active
    ? "bg-emerald-400"
    : "bg-white/20";

  const stateLabel = !status.installed
    ? "Not installed"
    : status.failed
    ? "Failed"
    : status.active
    ? "Running"
    : "Stopped";

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Background service</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-white/60">Status</span>
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${dotColor}`} />
              <span className="text-[13px] text-white/80">{stateLabel}</span>
            </div>
          </div>

          {status.installed && (
            <>
              <div className="border-t border-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white/60">Control</span>
                <button
                  onClick={() =>
                    run(status.active
                      ? () => window.electron!.monitor.stop()
                      : () => window.electron!.monitor.start())
                  }
                  disabled={loading || status.failed}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white/90 disabled:opacity-40"
                >
                  {status.active ? "Stop" : "Start"}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white/75">Start on login</span>
                <button
                  onClick={() => run(() => window.electron!.monitor.setEnabled(!status.enabled))}
                  disabled={loading}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                    status.enabled
                      ? "bg-primary-500 text-white hover:bg-primary-400"
                      : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white/90"
                  }`}
                >
                  {status.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!status.installed && (
        <div>
          <button
            onClick={() => run(() => window.electron!.monitor.install())}
            disabled={loading}
            className="w-full rounded-xl bg-primary-500 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
          >
            {loading ? "Installing…" : "Install Service"}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/30">
            Installs a systemd user service that tracks your active window and syncs to the API.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
