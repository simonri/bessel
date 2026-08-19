import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import {
  SettingsButton,
  SettingsCard,
  SettingsRow,
} from "@/components/settings-ui";

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
        <SettingsCard>
          <SettingsRow label="Version">
            <span className="font-mono text-13 text-white/80">
              {version ?? "—"}
            </span>
          </SettingsRow>
          <SettingsRow
            label={
              status === "idle" ? (
                <span className="text-white/40">Not checked yet</span>
              ) : status === "checking" ? (
                <span className="text-white/50">Checking…</span>
              ) : status === "up-to-date" ? (
                <span className="text-emerald-400">Up to date</span>
              ) : status === "available" ? (
                <span className="text-primary-400">
                  Update available
                  {availableVersion ? `: v${availableVersion}` : ""}
                </span>
              ) : (
                <span className="text-red-400">
                  Could not check for updates
                </span>
              )
            }
          >
            <SettingsButton
              onClick={checkForUpdate}
              disabled={status === "checking"}
            >
              {status === "checking" ? "Checking…" : "Check for updates"}
            </SettingsButton>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  );
}
