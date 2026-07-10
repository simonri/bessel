import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";

export function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "error"
  >("idle");
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
            <span className="font-mono text-[13px] text-white/80">
              {version ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[12px]">
              {status === "idle" && <span className="text-white/30">—</span>}
              {status === "checking" && (
                <span className="text-white/50">Checking…</span>
              )}
              {status === "up-to-date" && (
                <span className="text-emerald-400">Up to date</span>
              )}
              {status === "available" && (
                <span className="text-primary-400">
                  Update available
                  {availableVersion ? `: v${availableVersion}` : ""}
                </span>
              )}
              {status === "error" && (
                <span className="text-red-400">
                  Could not check for updates
                </span>
              )}
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
