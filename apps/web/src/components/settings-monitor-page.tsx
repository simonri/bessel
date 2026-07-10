import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";

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
                    run(
                      status.active
                        ? () => window.electron!.monitor.stop()
                        : () => window.electron!.monitor.start(),
                    )
                  }
                  disabled={loading || status.failed}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white/90 disabled:opacity-40"
                >
                  {status.active ? "Stop" : "Start"}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white/75">
                  Start on login
                </span>
                <button
                  onClick={() =>
                    run(() =>
                      window.electron!.monitor.setEnabled(!status.enabled),
                    )
                  }
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
            Installs a systemd user service that tracks your active window and
            syncs to the API.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
