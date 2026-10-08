import { Kbd } from "@bessel/ui/components/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@bessel/ui/components/resizable";
import { FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWindowActions } from "@/components/canvas/window-manager";
import { useSettings } from "@/hooks/use-settings";
import { clearPageTarget, usePageTarget } from "@/lib/page-target";
import { BacklinksPanel } from "./backlinks-panel";
import { FileTree } from "./file-tree";
import {
  useVaultFiles,
  useVaultIndex,
  useVaultInfo,
  useVaultMutations,
  useVaultTree,
  useVaultWatcher,
} from "./hooks/use-vault";
import { ImagePreview } from "./image-preview";
import { useVaultUiState } from "./lib/vault-state";
import { basenameOf, newNoteRel, parentOf, resolveLink } from "./lib/wikilinks";
import { NoteView, type NoteViewHandle } from "./note-view";
import { OutlinePanel } from "./outline-panel";
import { QuickSwitcher as VaultSearchDialog } from "./quick-switcher";
import { TabsBar } from "./tabs-bar";
import { VaultHeader } from "./vault-header";
import type { VaultRenameResult } from "./vault-types";

export interface VaultWorkspaceProps {
  root: string;
  /** Opens the picker; pass a specific vault path to switch straight to it. */
  onSwitchVault: (root?: string) => void;
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function noteList(rels: readonly string[]): string {
  const names = rels.slice(0, 3).map((rel) => `"${basenameOf(rel)}"`);
  const rest = rels.length - names.length;
  return rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
}

/** Tells the user about notes whose links to a renamed entry are now stale. */
function reportRenameResult(result: VaultRenameResult): void {
  const failed = result.failedFiles ?? [];
  const skipped = result.skippedFiles ?? [];
  if (failed.length > 0)
    toast.error(`Couldn't update links in ${noteList(failed)}`);
  if (skipped.length > 0)
    toast.warning(
      `Links in ${noteList(skipped)} weren't updated - ${
        skipped.length === 1 ? "it was" : "they were"
      } being edited`,
    );
}

/** Where an unresolved `[[target]]` should be created: `target` itself when
 *  it contains a folder, otherwise alongside the currently open note. */
function targetToRel(target: string, folderOfActive: string): string {
  const clean = target.replace(/^\.?\//, "");
  const withExt = /\.md$/i.test(clean) ? clean : `${clean}.md`;
  if (clean.includes("/")) return withExt;
  return folderOfActive ? `${folderOfActive}/${withExt}` : withExt;
}

function EmptyNoteState({ onNewNote }: { onNewNote: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <FileText className="size-8 text-white/15" />
      <p className="text-sm text-white/50">No note open</p>
      <p className="flex items-center gap-1 text-11 text-white/35">
        <span>Select a note in the sidebar or</span>
        <button
          type="button"
          onClick={onNewNote}
          className="flex items-center gap-1 text-white/35 underline-offset-2 hover:text-white/60 hover:underline"
        >
          <Kbd>Ctrl</Kbd>
          <Kbd>N</Kbd>
          <span>to create one</span>
        </button>
      </p>
    </div>
  );
}

export function VaultWorkspace({ root, onSwitchVault }: VaultWorkspaceProps) {
  const vaultInfoQuery = useVaultInfo(root);
  const treeQuery = useVaultTree(root);
  const files = useVaultFiles(root);
  const indexQuery = useVaultIndex(root);
  useVaultWatcher(root);
  const [uiState, updateUiState] = useVaultUiState(root);
  const { createNote, createFolder, renameEntry, trashEntry } =
    useVaultMutations(root);
  const { openWindow } = useWindowActions();
  const { settings } = useSettings();

  const noteViewRef = useRef<NoteViewHandle>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pendingScrollRef = useRef<number | null>(null);

  const activeRel = uiState.activeTab;
  const info = vaultInfoQuery.data;
  const entries = treeQuery.data ?? [];
  const activeEntry = activeRel
    ? entries.find((entry) => entry.rel === activeRel)
    : undefined;

  // A remembered vault path that no longer resolves (folder moved/deleted).
  useEffect(() => {
    if (!vaultInfoQuery.isError) return;
    toast.error("That vault folder is no longer available.");
    onSwitchVault();
  }, [vaultInfoQuery.isError, onSwitchVault]);

  useEffect(() => () => void noteViewRef.current?.flush(), []);

  const openNote = useCallback(
    async (rel: string, opts?: { newTab?: boolean; line?: number }) => {
      await noteViewRef.current?.flush();
      const newTab = opts?.newTab ?? false;
      updateUiState((prev) => {
        if (prev.tabs.includes(rel)) return { activeTab: rel };
        if (newTab || prev.activeTab === null)
          return { tabs: [...prev.tabs, rel], activeTab: rel };
        return {
          tabs: prev.tabs.map((t) => (t === prev.activeTab ? rel : t)),
          activeTab: rel,
        };
      });
      if (opts?.line !== undefined) {
        pendingScrollRef.current = opts.line;
        setTimeout(() => {
          if (pendingScrollRef.current === opts.line) {
            noteViewRef.current?.scrollToLine(opts.line!);
            pendingScrollRef.current = null;
          }
        }, 80);
      }
    },
    [updateUiState],
  );

  // Opened from search: show that note at the matching line.
  const target = usePageTarget("obsidian");
  useEffect(() => {
    if (!target) return;
    void openNote(target.id, {
      line: target.at !== undefined ? Number(target.at) : undefined,
    });
    clearPageTarget();
  }, [target, openNote]);

  const closeTab = useCallback(
    async (rel: string) => {
      if (rel === activeRel) await noteViewRef.current?.flush();
      updateUiState((prev) => {
        const idx = prev.tabs.indexOf(rel);
        if (idx === -1) return {};
        const tabs = prev.tabs.filter((t) => t !== rel);
        const activeTab =
          prev.activeTab === rel
            ? (tabs[idx] ?? tabs[idx - 1] ?? null)
            : prev.activeTab;
        return { tabs, activeTab };
      });
    },
    [activeRel, updateUiState],
  );

  const newNote = useCallback(async () => {
    const folder = activeRel ? parentOf(activeRel) : "";
    const rel = newNoteRel(files, folder);
    try {
      const created = await createNote.mutateAsync({ rel });
      void openNote(created.rel);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't create note"));
    }
  }, [activeRel, files, createNote, openNote]);

  const onOpenLink = useCallback(
    (target: string, opts: { newTab: boolean }) => {
      if (target.startsWith("#")) {
        setSearchQuery(target);
        setSearchOpen(true);
        return;
      }
      if (!activeRel) return;
      const resolved = resolveLink(files, activeRel, target);
      if (resolved) {
        void openNote(resolved, { newTab: opts.newTab });
        return;
      }
      const rel = targetToRel(target, parentOf(activeRel));
      // Only auto-create markdown notes — a broken image/PDF embed should
      // surface as unresolved, not spawn a stray "<name>.png.md" file.
      if (!/\.md$/i.test(rel)) return;
      void createNote
        .mutateAsync({ rel })
        .then((created) => openNote(created.rel, { newTab: opts.newTab }))
        .catch((e) => toast.error(errorMessage(e, "Couldn't create note")));
    },
    [activeRel, files, createNote, openNote],
  );

  // Saves the open note first so the rename (and the link rewrite in other
  // notes) sees its latest content; a note still dirty after that is skipped
  // by the rewrite rather than overwritten under the editor.
  const renamingRef = useRef(false);
  const rename = useCallback(
    async (from: string, to: string, onRenamed: () => void) => {
      if (renamingRef.current) return;
      renamingRef.current = true;
      try {
        await noteViewRef.current?.flush();
        const skip =
          activeRel && noteViewRef.current?.hasUnsavedChanges()
            ? [activeRel]
            : undefined;
        const result = await renameEntry.mutateAsync({ from, to, skip });
        onRenamed();
        reportRenameResult(result);
      } catch (e) {
        toast.error(errorMessage(e, "Rename failed"));
      } finally {
        renamingRef.current = false;
      }
    },
    [activeRel, renameEntry],
  );

  const handleRename = useCallback(
    (newBasename: string) => {
      if (!activeRel) return;
      const folder = parentOf(activeRel);
      const to = folder ? `${folder}/${newBasename}.md` : `${newBasename}.md`;
      const from = activeRel;
      void rename(from, to, () =>
        updateUiState((prev) => ({
          tabs: prev.tabs.map((t) => (t === from ? to : t)),
          activeTab: prev.activeTab === from ? to : prev.activeTab,
        })),
      );
    },
    [activeRel, rename, updateUiState],
  );

  const handleTreeRename = useCallback(
    (rel: string, newName: string) => {
      const isDir = entries.some((e) => e.kind === "dir" && e.rel === rel);
      const folder = parentOf(rel);
      const to = isDir
        ? folder
          ? `${folder}/${newName}`
          : newName
        : folder
          ? `${folder}/${newName}.md`
          : `${newName}.md`;
      void rename(rel, to, () =>
        updateUiState((prev) => {
          const remap = (t: string) =>
            t === rel
              ? to
              : t.startsWith(`${rel}/`)
                ? to + t.slice(rel.length)
                : t;
          return {
            tabs: prev.tabs.map(remap),
            activeTab: prev.activeTab ? remap(prev.activeTab) : prev.activeTab,
          };
        }),
      );
    },
    [entries, rename, updateUiState],
  );

  const handleCreateNote = useCallback(
    async (folder: string) => {
      const rel = newNoteRel(files, folder);
      try {
        const created = await createNote.mutateAsync({ rel });
        void openNote(created.rel);
        if (folder)
          updateUiState((prev) =>
            prev.expandedDirs.includes(folder)
              ? {}
              : { expandedDirs: [...prev.expandedDirs, folder] },
          );
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't create note"));
      }
    },
    [files, createNote, openNote, updateUiState],
  );

  const handleCreateFolder = useCallback(
    async (folder: string) => {
      const name = window.prompt("Folder name")?.trim();
      if (!name) return;
      const rel = folder ? `${folder}/${name}` : name;
      try {
        await createFolder.mutateAsync(rel);
        updateUiState((prev) =>
          prev.expandedDirs.includes(folder)
            ? {}
            : { expandedDirs: [...prev.expandedDirs, folder] },
        );
      } catch (e) {
        toast.error(errorMessage(e, "Couldn't create folder"));
      }
    },
    [createFolder, updateUiState],
  );

  const handleTrash = useCallback(
    (rel: string) => {
      trashEntry.mutate(rel, {
        onSuccess: () =>
          updateUiState((prev) => {
            if (!prev.tabs.includes(rel)) return {};
            const tabs = prev.tabs.filter((t) => t !== rel);
            return {
              tabs,
              activeTab:
                prev.activeTab === rel ? (tabs[0] ?? null) : prev.activeTab,
            };
          }),
        onError: (e) => toast.error(errorMessage(e, "Trash failed")),
      });
    },
    [trashEntry, updateUiState],
  );

  const handleReveal = useCallback(
    (rel: string) =>
      void window.electron?.vault.reveal(root, rel).catch(() => {}),
    [root],
  );

  const handleOpenFile = useCallback(
    (rel: string, opts: { newTab: boolean }) => {
      const entry = entries.find((candidate) => candidate.rel === rel);
      if (entry?.kind === "md" || entry?.kind === "image") {
        void openNote(rel, opts);
        return;
      }
      toast.info(`Preview isn't available for "${basenameOf(rel)}".`);
    },
    [entries, openNote],
  );

  const handlePin = useCallback(
    (rel: string) => {
      openWindow("obsidian", { vault: root, file: rel });
    },
    [openWindow, root],
  );

  const toggleSidePanel = (panel: "backlinks" | "outline") => {
    updateUiState((prev) => ({
      sidePanel: prev.sidePanel === panel ? null : panel,
    }));
  };

  // Ctrl+N / Ctrl+Shift+F work everywhere in the workspace; Ctrl+W
  // only when focus isn't in some other text field (rename box, filter…).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "f" && e.shiftKey) {
        e.preventDefault();
        setSearchQuery("");
        setSearchOpen(true);
        return;
      }
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        void newNote();
        return;
      }
      if (key === "w") {
        const target = e.target as HTMLElement | null;
        const inOtherEditable =
          !!target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable) &&
          !target.closest("[data-obsidian-note-root]");
        if (inOtherEditable) return;
        if (activeRel) {
          e.preventDefault();
          void closeTab(activeRel);
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [newNote, closeTab, activeRel]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <VaultHeader
        root={root}
        info={info}
        recentVaults={settings.obsidianRecentVaults}
        onSwitchVault={onSwitchVault}
        onOpenSearch={() => {
          setSearchQuery("");
          setSearchOpen(true);
        }}
        onNewNote={() => void newNote()}
        onToggleBacklinks={() => toggleSidePanel("backlinks")}
        onToggleOutline={() => toggleSidePanel("outline")}
        sidePanel={uiState.sidePanel}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          defaultSize="22%"
          minSize="14%"
          collapsible
          collapsedSize="0%"
        >
          <FileTree
            root={root}
            entries={entries}
            activeRel={activeRel}
            expandedDirs={uiState.expandedDirs}
            onToggleDir={(rel) =>
              updateUiState((prev) => ({
                expandedDirs: prev.expandedDirs.includes(rel)
                  ? prev.expandedDirs.filter((d) => d !== rel)
                  : [...prev.expandedDirs, rel],
              }))
            }
            onOpen={handleOpenFile}
            onCreateNote={handleCreateNote}
            onCreateFolder={handleCreateFolder}
            onRename={handleTreeRename}
            onTrash={handleTrash}
            onReveal={handleReveal}
            onPinToCanvas={handlePin}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="35%">
          <div data-obsidian-note-root className="flex h-full min-h-0 flex-col">
            <TabsBar
              tabs={uiState.tabs}
              activeTab={uiState.activeTab}
              onSelect={(rel) => void openNote(rel)}
              onClose={(rel) => void closeTab(rel)}
            />
            <div className="min-h-0 flex-1">
              {activeRel && activeEntry?.kind === "image" ? (
                <ImagePreview root={root} rel={activeRel} />
              ) : activeRel ? (
                <NoteView
                  ref={noteViewRef}
                  root={root}
                  rel={activeRel}
                  mode={uiState.mode}
                  files={files}
                  index={indexQuery.data}
                  attachmentFolder={info?.attachmentFolder ?? ""}
                  onOpenLink={onOpenLink}
                  onRename={handleRename}
                  onModeChange={(mode) => updateUiState({ mode })}
                />
              ) : (
                <EmptyNoteState onNewNote={() => void newNote()} />
              )}
            </div>
          </div>
        </ResizablePanel>
        {uiState.sidePanel && activeEntry?.kind === "md" && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="24%" minSize="15%">
              {uiState.sidePanel === "backlinks" ? (
                <BacklinksPanel
                  root={root}
                  rel={activeRel ?? ""}
                  files={files}
                  index={indexQuery.data}
                  onOpenNote={(rel, line) => void openNote(rel, { line })}
                />
              ) : (
                <OutlinePanel
                  rel={activeRel ?? ""}
                  index={indexQuery.data}
                  onJump={(line) => noteViewRef.current?.scrollToLine(line)}
                />
              )}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <VaultSearchDialog
        root={root}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        files={files}
        onSelect={() => {}}
        onCreate={() => {}}
        initialMode="search"
        initialQuery={searchQuery}
        searchOnly
        onSelectLine={(rel, line) => {
          setSearchOpen(false);
          void openNote(rel, { line });
        }}
      />
    </div>
  );
}
