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

type CollectorStatusResult = {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  failed: boolean;
  state: string;
  needsConfig: boolean;
  envPath: string;
};

export function AgentUsagePage() {
  const [status, setStatus] = useState<CollectorStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await window.electron!.collector.status();
        if (alive) {
          setStatus((prev) =>
            prev &&
            prev.installed === s.installed &&
            prev.active === s.active &&
            prev.enabled === s.enabled &&
            prev.failed === s.failed &&
            prev.state === s.state &&
            prev.needsConfig === s.needsConfig
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
      const s = await window.electron!.collector.status();
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
          ? "Armed"
          : "Stopped";

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Background timer</SectionLabel>
        <SettingsCard>
          <SettingsRow label="Status">
            <StatusDot tone={dotTone} />
            <span className="text-13 text-white/80">{stateLabel}</span>
          </SettingsRow>

          {status.installed && !status.needsConfig && (
            <>
              <SettingsRow label="Control">
                <SettingsButton
                  onClick={() => run(() => window.electron!.collector.runNow())}
                  disabled={loading || status.failed}
                >
                  Run now
                </SettingsButton>
              </SettingsRow>
              <SettingsToggleRow
                label="Run on a timer"
                checked={status.enabled}
                disabled={loading}
                onCheckedChange={(enabled) =>
                  run(() => window.electron!.collector.setEnabled(enabled))
                }
              />
            </>
          )}
        </SettingsCard>
      </div>

      {status.needsConfig && (
        <p className="text-12 text-amber-300/80">
          Add <code className="text-amber-200">BESSEL_INTERNAL_API_KEY</code> to{" "}
          <code className="text-amber-200">{status.envPath}</code>, then restart
          the timer.
        </p>
      )}

      {!status.installed && (
        <SettingsInstallCta
          loading={loading}
          onInstall={() => run(() => window.electron!.collector.install())}
          label="Install Agent Usage Tracking"
          loadingLabel="Installing…"
          hint="Installs a systemd timer that periodically pushes Claude Code token usage and rate limits to Bessel."
        />
      )}

      {status.installed && (
        <button
          type="button"
          onClick={() => run(() => window.electron!.collector.install())}
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
