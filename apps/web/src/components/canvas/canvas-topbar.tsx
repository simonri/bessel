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
import { TOPBAR_DIVIDER, TOPBAR_ICON_BUTTON } from "./topbar-styles";

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
        "relative z-50 flex h-10 shrink-0 items-center border-b border-white/10 bg-chrome pr-2 pl-4",
        isMac && [MAC_TRAFFIC_LIGHT_INSET, "[-webkit-app-region:drag]"],
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tracking-wide text-white/90">
            Bessel
          </span>
          {version && (
            <span className="rounded bg-white/[0.06] px-1.5 py-px font-mono text-10 text-white/45">
              v{version}
            </span>
          )}
        </div>
        {pairs.length > 0 && <div className={TOPBAR_DIVIDER} />}
        {pairs.map((pair) => (
          <CryptoPairTicker key={pair} pair={pair} />
        ))}
        {window.electron && (
          <div className={cn("flex items-center gap-5", noDrag)}>
            <SpotifyWidget />
          </div>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center gap-0.5", noDrag)}>
        {window.electron && <ProjectsDropdown />}
        <TimeSinceDropdown />
        <AgentUsageDropdown />
        <NotificationBell />
        <div className={cn(TOPBAR_DIVIDER, "mx-1.5")} />
        {window.electron && (
          <button
            type="button"
            onClick={() => setPortsOpen(true)}
            title="Ports"
            className={TOPBAR_ICON_BUTTON}
          >
            <Network />
          </button>
        )}
        {window.electron && (
          <button
            type="button"
            onClick={() => setLogsOpen(true)}
            title="View logs"
            className={TOPBAR_ICON_BUTTON}
          >
            <ScrollText />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className={TOPBAR_ICON_BUTTON}
        >
          <Settings />
        </button>
        <div className={cn(TOPBAR_DIVIDER, "mx-1.5")} />
        <AvatarMenu />
        {window.electron && !isMac && (
          <button
            type="button"
            onClick={() => window.electron!.close()}
            title="Close"
            className={cn(
              TOPBAR_ICON_BUTTON,
              "ml-1 hover:bg-red-500/15 hover:text-red-400",
            )}
          >
            <X />
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
      {window.electron && (
        <PortsDialog open={portsOpen} onClose={() => setPortsOpen(false)} />
      )}
    </div>
  );
});
