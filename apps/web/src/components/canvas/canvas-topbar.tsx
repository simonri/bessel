import { glassSurface } from "@bessel/ui/lib/glass";
import { ScrollText, Settings, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { AvatarMenu } from "@/components/canvas/avatar-menu";
import { CryptoPairTicker } from "@/components/canvas/crypto-pair-ticker";
import { NotificationBell } from "@/components/canvas/notification-bell";
import { ProjectsDropdown } from "@/components/canvas/projects-dropdown";
import { SpotifyWidget } from "@/components/canvas/spotify-widget";
import { TimeSinceDropdown } from "@/components/canvas/time-since-dropdown";
import { WorkspaceSwitcher } from "@/components/canvas/workspace-switcher";
import { LogsDialog } from "@/components/logs-dialog";
import { SettingsModal } from "@/components/settings-modal";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

// memo: takes no props, so canvas re-renders (live resize, workspace switches)
// never cascade into the ticker/spotify/notification subtrees.
export const CanvasTopBar = memo(function CanvasTopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    window.electron?.getVersion().then(setVersion);
  }, []);

  const pairs = settings.cryptoPairs
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (
    <div
      className={cn(
        glassSurface({ weight: "light" }),
        "fixed left-0 right-0 top-0 z-50 flex items-center border-b border-white/10 px-4 py-1",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tracking-wide text-white/90">
            Bessel
          </span>
          {version && (
            <span className="rounded bg-white/[0.06] px-1 py-px font-mono text-10 text-white/50">
              v{version}
            </span>
          )}
        </div>
        {pairs.length > 0 && <div className="h-3 w-px shrink-0 bg-white/10" />}
        {pairs.map((pair) => (
          <CryptoPairTicker key={pair} pair={pair} />
        ))}
        {window.electron && <SpotifyWidget />}
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <WorkspaceSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {window.electron && <ProjectsDropdown />}
        <TimeSinceDropdown />
        <NotificationBell />
        {window.electron && (
          <button
            onClick={() => setLogsOpen(true)}
            title="View logs"
            className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
          >
            <ScrollText className="size-4" />
          </button>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
        >
          <Settings className="size-4" />
        </button>
        <AvatarMenu />
        {window.electron && (
          <button
            onClick={() => window.electron!.close()}
            title="Close"
            className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-red-400"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      {window.electron && (
        <LogsDialog open={logsOpen} onClose={() => setLogsOpen(false)} />
      )}
    </div>
  );
});
