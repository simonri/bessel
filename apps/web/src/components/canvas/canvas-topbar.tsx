import { Network, ScrollText, Settings, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { AgentUsageDropdown } from "@/components/canvas/agent-usage-dropdown";
import { AvatarMenu } from "@/components/canvas/avatar-menu";
import { CryptoPairTicker } from "@/components/canvas/crypto-pair-ticker";
import { NotificationBell } from "@/components/canvas/notification-bell";
import { ProjectsDropdown } from "@/components/canvas/projects-dropdown";
import { SpotifyWidget } from "@/components/canvas/spotify-widget";
import { TimeSinceDropdown } from "@/components/canvas/time-since-dropdown";
import { LogsDialog } from "@/components/logs-dialog";
import { PortsDialog } from "@/components/ports-dialog";
import { SettingsModal } from "@/components/settings-modal";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { BesselMark } from "./bessel-mark";
import { TOPBAR_GROUP, TOPBAR_ICON_BUTTON } from "./topbar-styles";
import { TopbarTooltip } from "./topbar-tooltip";

// memo: takes no props, so canvas re-renders (live resize, workspace switches)
// never cascade into the ticker/spotify/notification subtrees.
// Kept in sync with main.ts's trafficLightPosition: {x: 16, y: 12} — the
// traffic lights are ~16px tall, so this leaves enough left inset for them to
// clear the "Bessel" title.
const MAC_TRAFFIC_LIGHT_INSET = "pl-20";

export const CanvasTopBar = memo(function CanvasTopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [portsOpen, setPortsOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const { settings } = useSettings();
  const isMac = window.electron?.platform === "darwin";

  useEffect(() => {
    window.electron?.getVersion().then(setVersion);
  }, []);

  const pairs = settings.cryptoPairs
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Non-interactive stretches of the bar (padding, gaps, the title) stay
  // draggable via inheritance from the bar's own drag region below — only the
  // clusters of click targets need to opt back out with noDrag.
  const noDrag = isMac ? "[-webkit-app-region:no-drag]" : undefined;

  return (
    <div
      className={cn(
        "relative z-50 grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-white/[0.06] bg-chrome pr-2 pl-4",
        isMac && [MAC_TRAFFIC_LIGHT_INSET, "[-webkit-app-region:drag]"],
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="group flex shrink-0 items-center gap-2">
          <BesselMark className="group-hover:rotate-45" />
          <span className="text-sm font-semibold tracking-tight text-white/90">
            Bessel
          </span>
          {version && (
            <span className="rounded-full bg-white/[0.06] px-2 py-px text-10 font-medium tabular-nums text-white/45">
              v{version}
            </span>
          )}
        </div>
        {pairs.length > 0 && (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            {pairs.map((pair) => (
              <CryptoPairTicker key={pair} pair={pair} />
            ))}
          </div>
        )}
      </div>

      <div className={cn("flex min-w-0 justify-center", noDrag)}>
        {window.electron && <SpotifyWidget />}
      </div>

      <div
        className={cn("flex min-w-0 items-center justify-end gap-3", noDrag)}
      >
        <div className={TOPBAR_GROUP}>
          {window.electron && <ProjectsDropdown />}
          <TimeSinceDropdown />
          <AgentUsageDropdown />
        </div>
        <div className={TOPBAR_GROUP}>
          <NotificationBell />
        </div>
        <div className={TOPBAR_GROUP}>
          {window.electron && (
            <TopbarTooltip label="Ports">
              <button
                type="button"
                onClick={() => setPortsOpen(true)}
                aria-label="Ports"
                className={TOPBAR_ICON_BUTTON}
              >
                <Network />
              </button>
            </TopbarTooltip>
          )}
          {window.electron && (
            <TopbarTooltip label="Logs">
              <button
                type="button"
                onClick={() => setLogsOpen(true)}
                aria-label="Logs"
                className={TOPBAR_ICON_BUTTON}
              >
                <ScrollText />
              </button>
            </TopbarTooltip>
          )}
          <TopbarTooltip label="Settings">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className={TOPBAR_ICON_BUTTON}
            >
              <Settings />
            </button>
          </TopbarTooltip>
        </div>
        <div className={TOPBAR_GROUP}>
          <AvatarMenu />
          {window.electron && !isMac && (
            <TopbarTooltip label="Close Bessel">
              <button
                type="button"
                onClick={() => window.electron!.close()}
                aria-label="Close Bessel"
                className={cn(
                  TOPBAR_ICON_BUTTON,
                  "rounded-full text-white/30 hover:bg-red-500/15 hover:text-red-300",
                )}
              >
                <X />
              </button>
            </TopbarTooltip>
          )}
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      {window.electron && (
        <LogsDialog open={logsOpen} onClose={() => setLogsOpen(false)} />
      )}
      {window.electron && (
        <PortsDialog open={portsOpen} onClose={() => setPortsOpen(false)} />
      )}
    </div>
  );
});
