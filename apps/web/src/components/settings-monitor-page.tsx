import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import {
  SettingsButton,
  SettingsCard,
  SettingsError,
  SettingsInstallCta,
  SettingsLoading,
  SettingsRow,
  SettingsToggleRow,
  StatusDot,
} from "@/components/settings-ui";

type MonitorStatusResult = {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  failed: boolean;
  state: string;
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
            prev.state === s.state
              ? prev
              : s,
          );
        }
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

  if (!status) return <SettingsLoading />;

  const dotTone = status.failed
    ? "error"
    : status.active
      ? "active"
      : "neutral";
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
        <SettingsCard>
          <SettingsRow label="Status">
            <StatusDot tone={dotTone} />
            <span className="text-13 text-white/80">{stateLabel}</span>
          </SettingsRow>

          {status.installed && (
            <>
              <SettingsRow label="Control">
                <SettingsButton
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
                </SettingsButton>
              </SettingsRow>
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
        </SettingsCard>
      </div>

      {!status.installed && (
        <SettingsInstallCta
          loading={loading}
          onInstall={() => run(() => window.electron!.monitor.install())}
          label="Install Service"
          loadingLabel="Installing…"
          hint="Installs a systemd user service that tracks your active window and syncs to the API."
        />
      )}

      {status.installed && (
        <button
          type="button"
          onClick={() => run(() => window.electron!.monitor.install())}
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
