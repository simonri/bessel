import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useWindowActions,
  useWindowEntry,
} from "@/components/canvas/window-manager";
import { useSettings } from "@/hooks/use-settings";
import {
  useVaultFiles,
  useVaultIndex,
  useVaultInfo,
  useVaultWatcher,
} from "./hooks/use-vault";
import type { NoteMode } from "./lib/vault-state";
import { basenameOf, resolveLink, stripMd } from "./lib/wikilinks";
import { NoteView, type NoteViewHandle } from "./note-view";
import { VaultPicker } from "./vault-picker";
import { VaultWorkspace } from "./vault-workspace";

const MAX_RECENT_VAULTS = 5;

function ObsidianWidget({
  windowId,
  root,
  rel,
}: {
  windowId: string;
  root: string;
  rel: string;
}) {
  const files = useVaultFiles(root);
  const { data: index } = useVaultIndex(root);
  const { data: info } = useVaultInfo(root);
  useVaultWatcher(root);
  const { updateWindowData } = useWindowActions();
  const noteViewRef = useRef<NoteViewHandle>(null);
  const [mode, setMode] = useState<NoteMode>("live");

  useEffect(() => () => void noteViewRef.current?.flush(), []);

  // A pinned note follows wikilinks in place — the widget's `file` is the
  // persisted "current note", the same way the browser widget tracks its URL.
  const openLink = useCallback(
    async (target: string) => {
      if (target.startsWith("#")) return;
      const resolved = resolveLink(files, rel, target);
      if (!resolved) return;
      await noteViewRef.current?.flush();
      updateWindowData(windowId, { file: resolved });
    },
    [files, rel, updateWindowData, windowId],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/70">
          {basenameOf(rel)}
        </span>
        <button
          type="button"
          onClick={() =>
            void window.electron?.shell.openExternal(
              `obsidian://open?vault=${encodeURIComponent(info?.name ?? "")}&file=${encodeURIComponent(stripMd(rel))}`,
            )
          }
          title="Open in Obsidian"
          className="shrink-0 text-white/30 transition-colors hover:text-white/70"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <NoteView
          ref={noteViewRef}
          root={root}
          rel={rel}
          mode={mode}
          files={files}
          index={index}
          attachmentFolder={info?.attachmentFolder ?? ""}
          onOpenLink={(target) => void openLink(target)}
          onRename={() => {}}
          onModeChange={setMode}
        />
      </div>
    </div>
  );
}

export function ObsidianPage() {
  const entry = useWindowEntry();
  const { settings, update } = useSettings();
  const [switching, setSwitching] = useState(false);

  const widgetVault = entry?.data?.vault;
  const widgetFile = entry?.data?.file;

  const openVault = useCallback(
    (root: string) => {
      const others = settings.obsidianRecentVaults.filter((p) => p !== root);
      update({
        obsidianVaultPath: root,
        obsidianRecentVaults: [root, ...others].slice(0, MAX_RECENT_VAULTS),
      });
      setSwitching(false);
    },
    [settings.obsidianRecentVaults, update],
  );

  const removeRecent = useCallback(
    (root: string) => {
      update({
        obsidianRecentVaults: settings.obsidianRecentVaults.filter(
          (p) => p !== root,
        ),
      });
    },
    [settings.obsidianRecentVaults, update],
  );

  const handleSwitchVault = useCallback(
    (newRoot?: string) => {
      if (newRoot) openVault(newRoot);
      else setSwitching(true);
    },
    [openVault],
  );

  if (entry && widgetVault && widgetFile) {
    return (
      <ObsidianWidget windowId={entry.id} root={widgetVault} rel={widgetFile} />
    );
  }

  if (!settings.obsidianVaultPath || switching) {
    return (
      <VaultPicker
        recentVaults={settings.obsidianRecentVaults}
        onOpen={openVault}
        onRemoveRecent={removeRecent}
      />
    );
  }

  return (
    <VaultWorkspace
      root={settings.obsidianVaultPath}
      onSwitchVault={handleSwitchVault}
    />
  );
}

export default ObsidianPage;
