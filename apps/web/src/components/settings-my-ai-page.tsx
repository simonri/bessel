import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import {
  SettingsButton,
  SettingsCard,
  SettingsError,
  SettingsInstallCta,
  SettingsLoading,
  SettingsRow,
  StatusDot,
} from "@/components/settings-ui";

type MyAiStatus = { path: string; exists: boolean };
type CliStatus = {
  installed: boolean;
  shimPath: string;
  onPath: boolean;
  supported: boolean;
};

export function MyAiPage() {
  const [status, setStatus] = useState<MyAiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    // Optional-chained on myAi/cli too: a renderer hot-reloaded under an
    // older preload (dev) doesn't have the bridge yet.
    window.electron?.myAi
      ?.status()
      .then(setStatus)
      .catch(() => {});
    window.electron?.cli
      ?.status()
      .then(setCliStatus)
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

  const installCli = async () => {
    setCliLoading(true);
    setCliError(null);
    try {
      await window.electron!.cli.install();
      setCliStatus(await window.electron!.cli.status());
    } catch (e) {
      setCliError(e instanceof Error ? e.message : String(e));
    } finally {
      setCliLoading(false);
    }
  };

  if (!status) return <SettingsLoading />;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Context folder</SectionLabel>
        <SettingsCard>
          <SettingsRow label="Status">
            <StatusDot tone={status.exists ? "active" : "neutral"} />
            <span className="text-13 text-white/80">
              {status.exists ? "Created" : "Not created"}
            </span>
          </SettingsRow>
          <SettingsRow label="Path">
            <span
              className="truncate font-mono text-12 text-white/80"
              title={status.path}
            >
              {status.path}
            </span>
          </SettingsRow>
          {status.exists && (
            <SettingsRow label="Files">
              <SettingsButton onClick={() => window.electron!.myAi.reveal()}>
                Reveal info.md
              </SettingsButton>
            </SettingsRow>
          )}
        </SettingsCard>
      </div>

      {!status.exists && (
        <SettingsInstallCta
          loading={loading}
          onInstall={create}
          label="Create Folder"
          loadingLabel="Creating…"
          hint="Creates the My AI folder with an info.md you can point Claude Code at as personal context."
        />
      )}

      <SettingsError>{error}</SettingsError>

      {cliStatus && (
        <div>
          <SectionLabel>CLI</SectionLabel>
          <SettingsCard>
            <SettingsRow label="Status">
              <StatusDot tone={cliStatus.installed ? "active" : "neutral"} />
              <span className="text-13 text-white/80">
                {!cliStatus.supported
                  ? "Not supported on this OS"
                  : cliStatus.installed
                    ? "Installed"
                    : "Not installed"}
              </span>
            </SettingsRow>
            {cliStatus.installed && (
              <SettingsRow label="Path">
                <span
                  className="truncate font-mono text-12 text-white/80"
                  title={cliStatus.shimPath}
                >
                  {cliStatus.shimPath}
                </span>
              </SettingsRow>
            )}
          </SettingsCard>
        </div>
      )}

      {cliStatus?.supported && !cliStatus.installed && (
        <SettingsInstallCta
          loading={cliLoading}
          onInstall={installCli}
          label="Install CLI"
          loadingLabel="Installing…"
          hint="Installs the bessel-axi command so Claude Code (or any terminal) can query your live Bessel data — tasks today, more later."
        />
      )}

      {cliStatus?.installed && !cliStatus.onPath && (
        <p className="text-12 text-amber-400">
          {cliStatus.shimPath} isn't on your PATH — add its directory to your
          shell profile to run bessel-axi directly.
        </p>
      )}

      <SettingsError>{cliError}</SettingsError>
    </div>
  );
}
