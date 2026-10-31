import { useEffect, useState } from "react";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { SoftButton } from "@/components/ui-kit";

export function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "ready" | "error"
  >("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electron?.getVersion().then(setVersion);
    const update = window.electron?.update;
    if (!update) return;
    const showReady = (ready: string) => {
      setStatus("ready");
      setAvailableVersion(ready);
    };
    void update.ready().then((ready) => {
      if (ready) showReady(ready);
    });
    return update.onReady(showReady);
  }, []);

  const checkForUpdate = async () => {
    setStatus("checking");
    setAvailableVersion(null);
    try {
      const result = await window.electron!.checkForUpdate();
      if (result.status === "available" || result.status === "ready") {
        setStatus(result.status);
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
      <SettingsSection title="Application">
        <SettingsRow label="Version">
          <span className="font-mono text-13 text-white/80">
            {version ?? "—"}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Updates"
          description={
            status === "idle" ? (
              <span className="text-white/40">Not checked yet</span>
            ) : status === "checking" ? (
              <span className="text-white/50">Checking…</span>
            ) : status === "up-to-date" ? (
              <span className="text-emerald-400">Up to date</span>
            ) : status === "available" ? (
              <span className="text-primary-400">
                Downloading
                {availableVersion ? ` v${availableVersion}` : ""}…
              </span>
            ) : status === "ready" ? (
              <span className="text-primary-400">
                {availableVersion ? `v${availableVersion}` : "An update"} is
                ready - restart to use it
              </span>
            ) : (
              <span className="text-red-400">Could not check for updates</span>
            )
          }
        >
          {status === "ready" ? (
            <SoftButton onClick={() => void window.electron?.update.install()}>
              Restart
            </SoftButton>
          ) : (
            <SoftButton
              onClick={checkForUpdate}
              disabled={status === "checking"}
            >
              {status === "checking" ? "Checking…" : "Check for updates"}
            </SoftButton>
          )}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
