import { useEffect, useState } from "react";
import {
  SettingsError,
  SettingsInstallCta,
  SettingsLoading,
  SettingsToggleRow,
  StatusDot,
} from "@/components/settings-ui";
import { Panel, PanelRow, SectionLabel, SoftButton } from "@/components/ui-kit";
import { createIngestToken } from "@/lib/ingest-token";

type MonitorStatusResult = {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  failed: boolean;
  state: string;
  needsConfig: boolean;
  idleSource: string | null;
  idleWarning: string | null;
};

export function MonitorPage() {
  const [status, setStatus] = useState<MonitorStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await window.electron!.monitor.status();
        // Keep the previous reference when nothing changed so the 3s poll
        // doesn't re-render the settings modal for identical status.
        if (alive) {
          setStatus((prev) =>
            prev &&
            prev.installed === s.installed &&
            prev.active === s.active &&
            prev.enabled === s.enabled &&
            prev.failed === s.failed &&
            prev.state === s.state &&
            prev.needsConfig === s.needsConfig &&
            prev.idleSource === s.idleSource &&
            prev.idleWarning === s.idleWarning
              ? prev
              : s,
          );
        }
      } catch {}
    };
    // Chained rather than an interval, so a slow status call can't stack up.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await poll();
      if (alive) timer = setTimeout(loop, 3000);
    };
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
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

  if (!status) return <SettingsLoading />;

  const dotTone = status.failed
    ? "error"
    : status.needsConfig
      ? "warning"
      : status.active
        ? "active"
        : "neutral";
  const stateLabel = !status.installed
    ? "Not installed"
    : status.needsConfig
      ? "Needs configuration"
      : status.failed
        ? "Failed"
        : status.active
          ? "Running"
          : "Stopped";

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Background service</SectionLabel>
        <Panel>
          <PanelRow label="Status">
            <StatusDot tone={dotTone} />
            <span className="text-13 text-white/80">{stateLabel}</span>
          </PanelRow>

          {status.active && (
            <PanelRow label="Idle detection">
              <StatusDot tone={status.idleSource ? "active" : "warning"} />
              <span className="text-13 text-white/80">
                {status.idleSource ?? "Not working"}
              </span>
            </PanelRow>
          )}

          {status.installed && (
            <>
              <PanelRow label="Control">
                <SoftButton
                  onClick={() =>
                    run(
                      status.active
                        ? () => window.electron!.monitor.stop()
                        : () => window.electron!.monitor.start(),
                    )
                  }
                  disabled={loading || status.failed}
                >
                  {status.active ? "Stop" : "Start"}
                </SoftButton>
              </PanelRow>
              <SettingsToggleRow
                label="Start on login"
                checked={status.enabled}
                disabled={loading}
                onCheckedChange={(enabled) =>
                  run(() => window.electron!.monitor.setEnabled(enabled))
                }
              />
            </>
          )}
        </Panel>
        {status.needsConfig && (
          <p className="mt-2.5 text-12 text-amber-300/80">
            This machine isn't connected to your account yet. Reinstall to
            connect it.
          </p>
        )}
        {status.active && status.idleWarning && (
          <p className="mt-2.5 text-12 text-amber-300/80">
            {status.idleWarning}
          </p>
        )}
      </div>

      {!status.installed && (
        <SettingsInstallCta
          loading={loading}
          onInstall={() =>
            run(async () =>
              window.electron!.monitor.install(
                await createIngestToken("monitor"),
              ),
            )
          }
          label="Install Service"
          loadingLabel="Installing…"
          hint="Installs a systemd user service that tracks your active window and syncs to the API."
        />
      )}

      {status.installed && (
        <button
          type="button"
          onClick={() =>
            run(async () =>
              window.electron!.monitor.install(
                await createIngestToken("monitor"),
              ),
            )
          }
          disabled={loading}
          className="w-full text-center text-11 text-white/40 transition-colors duration-150 hover:text-white/60 disabled:opacity-40"
        >
          {loading ? "Reinstalling…" : "Reinstall (updates bundled files)"}
        </button>
      )}

      <SettingsError>{error}</SettingsError>
    </div>
  );
}
