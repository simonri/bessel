import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";

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

  if (!status) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-13 text-white/50">Loading…</span>
      </div>
    );
  }

  const dotColor = status.failed
    ? "bg-red-400"
    : status.needsConfig
      ? "bg-amber-400"
      : status.active
        ? "bg-emerald-400"
        : "bg-white/20";

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
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-13 text-white/60">Status</span>
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${dotColor}`} />
              <span className="text-13 text-white/80">{stateLabel}</span>
            </div>
          </div>

          {status.installed && !status.needsConfig && (
            <>
              <div className="border-t border-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-13 text-white/60">Control</span>
                <button
                  type="button"
                  onClick={() => run(() => window.electron!.collector.runNow())}
                  disabled={loading || status.failed}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-12 font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white/90 disabled:opacity-40"
                >
                  Run now
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-13 text-white/75">Run on a timer</span>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      window.electron!.collector.setEnabled(!status.enabled),
                    )
                  }
                  disabled={loading}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-12 font-medium transition-colors disabled:opacity-40 ${
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

      {status.needsConfig && (
        <p className="text-12 text-amber-300/80">
          Add <code className="text-amber-200">BESSEL_INTERNAL_API_KEY</code> to{" "}
          <code className="text-amber-200">{status.envPath}</code>, then restart
          the timer.
        </p>
      )}

      {!status.installed && (
        <div>
          <button
            type="button"
            onClick={() => run(() => window.electron!.collector.install())}
            disabled={loading}
            className="w-full rounded-xl bg-primary-500 py-2.5 text-13 font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
          >
            {loading ? "Installing…" : "Install Agent Usage Tracking"}
          </button>
          <p className="mt-2 text-center text-11 text-white/50">
            Installs a systemd timer that periodically pushes Claude Code token
            usage and rate limits to Bessel.
          </p>
        </div>
      )}

      {status.installed && (
        <button
          type="button"
          onClick={() => run(() => window.electron!.collector.install())}
          disabled={loading}
          className="w-full text-center text-11 text-white/40 transition-colors hover:text-white/60 disabled:opacity-40"
        >
          {loading ? "Reinstalling…" : "Reinstall (updates bundled files)"}
        </button>
      )}

      {error && <p className="text-12 text-red-400">{error}</p>}
    </div>
  );
}
