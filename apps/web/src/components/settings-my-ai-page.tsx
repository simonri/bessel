import { useEffect, useState } from "react";
import {
  SettingsError,
  SettingsInstallCta,
  SettingsLoading,
  StatusDot,
} from "@/components/settings-ui";
import { Panel, PanelRow, SectionLabel, SoftButton } from "@/components/ui-kit";

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

  // undefined = still checking, null = server not reachable (older preload,
  // or it hasn't finished starting yet — retried a few times below).
  const [localDataUrl, setLocalDataUrl] = useState<string | null | undefined>(
    undefined,
  );
  const [discoveryPath, setDiscoveryPath] = useState<string | null>(null);

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

  useEffect(() => {
    if (!window.electron?.localDataServer) {
      setLocalDataUrl(null);
      return;
    }
    let cancelled = false;
    let attempt = 0;
    window.electron.localDataServer
      .getDiscoveryPath?.()
      .then((p) => {
        if (!cancelled) setDiscoveryPath(p);
      })
      .catch(() => {});
    const poll = () => {
      window
        .electron!.localDataServer.getUrl()
        .then((url) => {
          if (cancelled) return;
          if (url || attempt >= 5) {
            setLocalDataUrl(url);
          } else {
            attempt += 1;
            setTimeout(poll, 1000);
          }
        })
        .catch(() => {
          if (!cancelled) setLocalDataUrl(null);
        });
    };
    poll();
    return () => {
      cancelled = true;
    };
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
        <Panel>
          <PanelRow label="Status">
            <StatusDot tone={status.exists ? "active" : "neutral"} />
            <span className="text-13 text-white/80">
              {status.exists ? "Created" : "Not created"}
            </span>
          </PanelRow>
          <PanelRow label="Path">
            <span
              className="truncate font-mono text-12 text-white/80"
              title={status.path}
            >
              {status.path}
            </span>
          </PanelRow>
          {status.exists && (
            <PanelRow label="Files">
              <SoftButton onClick={() => window.electron!.myAi.reveal()}>
                Reveal info.md
              </SoftButton>
            </PanelRow>
          )}
        </Panel>
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

      {localDataUrl !== null && (
        <div>
          <SectionLabel>Local data API</SectionLabel>
          <Panel>
            <PanelRow label="Status">
              <StatusDot tone={localDataUrl ? "active" : "neutral"} />
              <span className="text-13 text-white/80">
                {localDataUrl === undefined ? "Checking…" : "Running"}
              </span>
            </PanelRow>
            {localDataUrl && (
              <PanelRow label="Address">
                <span
                  className="truncate font-mono text-12 text-white/80"
                  title={localDataUrl}
                >
                  {localDataUrl}
                </span>
              </PanelRow>
            )}
          </Panel>
          {localDataUrl && (
            <p className="mt-2 text-12 text-white/40">
              Returns a JSON snapshot of your data (sleep, for now) for a local
              AI tool to read. Requests need the secret from the app&apos;s
              discovery file, e.g.{" "}
              <code className="break-all font-mono">
                curl -H &quot;X-Bessel-Data-Secret: $(jq -r .secret &apos;
                {discoveryPath ?? "local-data-server.json"}&apos;)&quot;{" "}
                {localDataUrl}
              </code>
              .
            </p>
          )}
        </div>
      )}

      {cliStatus && (
        <div>
          <SectionLabel>CLI</SectionLabel>
          <Panel>
            <PanelRow label="Status">
              <StatusDot tone={cliStatus.installed ? "active" : "neutral"} />
              <span className="text-13 text-white/80">
                {!cliStatus.supported
                  ? "Not supported on this OS"
                  : cliStatus.installed
                    ? "Installed"
                    : "Not installed"}
              </span>
            </PanelRow>
            {cliStatus.installed && (
              <PanelRow label="Path">
                <span
                  className="truncate font-mono text-12 text-white/80"
                  title={cliStatus.shimPath}
                >
                  {cliStatus.shimPath}
                </span>
              </PanelRow>
            )}
          </Panel>
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
