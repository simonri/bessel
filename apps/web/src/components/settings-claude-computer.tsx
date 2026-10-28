import { Switch } from "@bessel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SettingsRow,
  SettingsSection,
  SettingsToggleRow,
} from "@/components/settings-ui";
import { useProjects } from "@/hooks/use-projects";
import type { PhoneNotifications, RemoteControlStatus } from "@/types/electron";

const STATE_TEXT: Record<RemoteControlStatus["state"], string> = {
  off: "Off",
  running: "Ready - start a session in the Claude app or on claude.ai",
  starting: "Starting…",
  failed:
    "Couldn't start. Check that you're signed in to Claude Code, then turn it off and on.",
  untrusted:
    "Run `claude` once in this folder and accept the trust prompt first.",
};

const statusKey = (folder: string) => ["remote-control", folder];

function FolderRow({ name, folder }: { name: string; folder: string }) {
  const queryClient = useQueryClient();
  const api = window.electron?.remoteControl;
  const { data } = useQuery({
    queryKey: statusKey(folder),
    queryFn: () => api?.status(folder) ?? null,
    refetchInterval: (query) =>
      query.state.data?.state === "starting" ? 2_000 : 30_000,
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean): Promise<RemoteControlStatus | null> => {
      if (!api) return null;
      return on ? api.enable(folder, name) : api.disable(folder);
    },
    onSuccess: (status) => {
      if (status) queryClient.setQueryData(statusKey(folder), status);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't change that",
      ),
  });
  const state = data?.state ?? "off";
  const on = state === "running" || state === "starting" || state === "failed";
  return (
    <SettingsRow
      label={name}
      description={
        <>
          <span className="font-mono">{folder}</span>
          {state !== "off" && (
            <span className="block">{STATE_TEXT[state]}</span>
          )}
        </>
      }
    >
      <Switch
        aria-label={`Start sessions in ${name} from your phone`}
        checked={toggle.isPending ? toggle.variables : on}
        disabled={toggle.isPending || state === "untrusted" || !data}
        onCheckedChange={(checked) => toggle.mutate(checked)}
      />
    </SettingsRow>
  );
}

/** Starting sessions on this computer from the phone, one switch per code folder. */
export function StartFromPhone() {
  const { data: projects = [] } = useProjects();
  const folders = projects.filter(
    (p): p is typeof p & { path: string } => !!p.path && !p.ssh_host,
  );
  if (!window.electron?.remoteControl) return null;
  return (
    <SettingsSection
      title="Start from your phone"
      description="Lets you start a new session in a folder from the Claude app or claude.ai. It runs here, with your files and tools, and keeps going after Bessel closes."
    >
      {window.electron.platform !== "linux" ? (
        <p className="py-3 text-13 text-white/45">
          This needs Linux for now. Sessions you start in Bessel can still be
          continued on your phone.
        </p>
      ) : folders.length === 0 ? (
        <p className="py-3 text-13 text-white/45">
          Add a code folder in the sidebar first.
        </p>
      ) : (
        folders.map((p) => (
          <FolderRow key={p.id} name={p.name} folder={p.path} />
        ))
      )}
    </SettingsSection>
  );
}

/** Claude's own push settings for the Claude app. */
export function PhoneNotificationsSection() {
  const queryClient = useQueryClient();
  const api = window.electron?.claudeNotifications;
  const { data } = useQuery({
    queryKey: ["claude-notifications"],
    queryFn: () => api?.get() ?? null,
  });
  const save = useMutation({
    mutationFn: (patch: Partial<PhoneNotifications>) =>
      api?.set(patch) ?? Promise.resolve(null),
    onSuccess: (next) =>
      queryClient.setQueryData(["claude-notifications"], next),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that",
      ),
  });
  if (!api || !data) return null;
  return (
    <SettingsSection
      title="Phone notifications"
      description="Sent by the Claude app, for every Claude Code session on this computer."
    >
      <SettingsToggleRow
        label="When a session needs you"
        description="It's waiting for a permission or an answer."
        checked={data.inputNeeded}
        disabled={save.isPending}
        onCheckedChange={(inputNeeded) => save.mutate({ inputNeeded })}
      />
      <SettingsToggleRow
        label="When Claude thinks you'd want to know"
        description="For example when a long task is done."
        checked={data.claudeDecides}
        disabled={save.isPending}
        onCheckedChange={(claudeDecides) => save.mutate({ claudeDecides })}
      />
    </SettingsSection>
  );
}
