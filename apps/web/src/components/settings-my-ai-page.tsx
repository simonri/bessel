import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";

type MyAiStatus = { path: string; exists: boolean };

export function MyAiPage() {
  const [status, setStatus] = useState<MyAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Optional-chained on myAi too: a renderer hot-reloaded under an older
    // preload (dev) doesn't have the bridge yet.
    window.electron?.myAi
      ?.status()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      await window.electron!.myAi.create();
      setStatus(await window.electron!.myAi.status());
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

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Context folder</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-13 text-white/60">Status</span>
            <div className="flex items-center gap-2">
              <span
                className={`size-1.5 rounded-full ${status.exists ? "bg-emerald-400" : "bg-white/20"}`}
              />
              <span className="text-13 text-white/80">
                {status.exists ? "Created" : "Not created"}
              </span>
            </div>
          </div>
          <div className="border-t border-white/[0.06]" />
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-13 text-white/60">Path</span>
            <span
              className="truncate font-mono text-12 text-white/80"
              title={status.path}
            >
              {status.path}
            </span>
          </div>
          {status.exists && (
            <div className="flex items-center justify-between gap-4">
              <span className="shrink-0 text-13 text-white/60">Files</span>
              <button
                onClick={() => window.electron!.myAi.reveal()}
                className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-12 font-medium text-white/70 transition-colors hover:bg-white/15 hover:text-white/90"
              >
                Reveal info.md
              </button>
            </div>
          )}
        </div>
      </div>

      {!status.exists && (
        <div>
          <button
            onClick={create}
            disabled={loading}
            className="w-full rounded-xl bg-primary-500 py-2.5 text-13 font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
          >
            {loading ? "Creating…" : "Create Folder"}
          </button>
          <p className="mt-2 text-center text-11 text-white/50">
            Creates the My AI folder with an info.md you can point Claude Code
            at as personal context.
          </p>
        </div>
      )}

      {error && <p className="text-12 text-red-400">{error}</p>}
    </div>
  );
}
