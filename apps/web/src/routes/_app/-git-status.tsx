import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, GitBranch, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWindowVisible } from "@/components/canvas/window-manager";
import { WidgetErrorBoundary } from "@/components/widget-error-boundary";
import { client } from "@/lib/client";
import { CommitItem } from "./-commit-item";
import { DiffViewer } from "./-diff-viewer";
import { FileItem, SectionHeader } from "./-file-item";
import { ImageDiffViewer } from "./-image-diff-viewer";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GitFileEntry {
  path: string;
  originalPath?: string;
  status: string;
}

interface GitStatusData {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}

type GitDiffResult =
  | { kind: "text"; diff: string; oldContent: string; newContent: string }
  | { kind: "image"; oldImage: string | null; newImage: string | null };

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

interface SelectedFile {
  file: GitFileEntry;
  staged: boolean;
  untracked: boolean;
}

function fileKey(file: GitFileEntry, staged: boolean): string {
  return `${staged ? "s" : "u"}:${file.path}`;
}

// ── Error extraction ───────────────────────────────────────────────────────────

function extractErrorMessage(error: unknown): string {
  if (!error) return "An error occurred";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const obj = error as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (typeof obj.message === "string") return obj.message;
  return "Operation failed";
}

// ── GitStatus (main export) ────────────────────────────────────────────────────

export function GitStatus() {
  const queryClient = useQueryClient();
  // Widgets in inactive workspaces stay mounted (display:none) — suspend the
  // polls there, or every hidden git widget spawns subprocesses forever.
  const visible = useWindowVisible();

  const { data: allProjects } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );
  // ssh-backed projects are a separate, pre-existing limitation (no remote git
  // support yet) — unrelated to whether this device has a local path set.
  const localProjects = (allProjects ?? []).filter((p) => !p.ssh_host);
  const projects = localProjects.filter(
    (p): p is ProjectWithPath => p.path != null,
  );
  const unconfiguredCount = localProjects.length - projects.length;

  const [selectedProject, setSelectedProject] =
    useState<ProjectWithPath | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);

  // Chromium under Wayland/ozone (this Electron build) delivers mouse events
  // with all keyboard-modifier flags stripped — e.shiftKey is always false on
  // click, silently breaking shift/ctrl selection. Keyboard events DO carry
  // modifier state, so track it from those and OR it with the event's own
  // flags at click time.
  const heldModifiers = useRef({ shift: false, ctrlOrMeta: false });
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      heldModifiers.current.shift = e.getModifierState("Shift");
      heldModifiers.current.ctrlOrMeta =
        e.getModifierState("Control") || e.getModifierState("Meta");
    };
    const reset = () => {
      heldModifiers.current = { shift: false, ctrlOrMeta: false };
    };
    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", sync, true);
      window.removeEventListener("keyup", sync, true);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const [commitMessage, setCommitMessage] = useState("");
  const commitTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(215);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) =>
      setSidebarWidth(
        Math.max(160, Math.min(420, startWidth + ev.clientX - startX)),
      );
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      setSelectedProject(projects[0] ?? null);
    }
  }, [projects, selectedProject]);

  // Runs on mousedown (not click), like a native file explorer — selection
  // responds on press, and a press that turns into a drag doesn't matter here
  // since rows aren't draggable.
  const handleFileClick = (
    list: GitFileEntry[],
    index: number,
    staged: boolean,
    e: React.MouseEvent,
  ) => {
    if (e.button !== 0) return;
    const file = list[index]!;
    const key = fileKey(file, staged);
    const untracked = !staged && file.status === "?";
    const shift = e.shiftKey || heldModifiers.current.shift;
    const toggle = e.metaKey || e.ctrlKey || heldModifiers.current.ctrlOrMeta;

    // TEMP: confirming the Wayland modifier workaround on-device; remove after.
    console.warn(
      `[git-select] evtShift=${e.shiftKey} heldShift=${heldModifiers.current.shift} evtCtrl=${e.ctrlKey || e.metaKey} heldCtrl=${heldModifiers.current.ctrlOrMeta} anchor=${anchorKey ?? "none"}`,
    );

    setSelectedFile({ file, staged, untracked });

    if (shift && anchorKey) {
      const anchorIndex = list.findIndex(
        (f) => fileKey(f, staged) === anchorKey,
      );
      if (anchorIndex !== -1) {
        const [lo, hi] =
          anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
        setSelectedKeys(
          new Set(list.slice(lo, hi + 1).map((f) => fileKey(f, staged))),
        );
        // Anchor stays put so a follow-up shift-click re-ranges from the
        // same origin, matching file-explorer behavior.
        return;
      }
    }

    if (toggle) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setAnchorKey(key);
      return;
    }

    setSelectedKeys(new Set([key]));
    setAnchorKey(key);
  };

  // Bulk actions apply to the whole selection when the acted-on file is part
  // of a multi-file selection, otherwise they apply to just that one file.
  const selectionTargets = (
    list: GitFileEntry[],
    staged: boolean,
    file: GitFileEntry,
  ): GitFileEntry[] => {
    const selected = list.filter((f) => selectedKeys.has(fileKey(f, staged)));
    return selected.some((f) => f.path === file.path) ? selected : [file];
  };

  useEffect(() => {
    const el = commitTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [commitMessage]);

  const statusQueryKey = ["git:status", selectedProject?.path];
  const logQueryKey = ["git:log", selectedProject?.path];
  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: statusQueryKey });
  const invalidateLog = () =>
    queryClient.invalidateQueries({ queryKey: logQueryKey });

  const statusQuery = useQuery<GitStatusData>({
    queryKey: statusQueryKey,
    queryFn: () => window.electron!.git.status(selectedProject!.path),
    enabled: !!selectedProject,
    refetchOnWindowFocus: visible,
    refetchInterval: visible ? 8000 : false,
  });

  const diffQuery = useQuery<GitDiffResult>({
    queryKey: [
      "git:diff",
      selectedProject?.path,
      selectedFile?.file.path,
      selectedFile?.staged,
      selectedFile?.untracked,
    ],
    queryFn: () =>
      window.electron!.git.diff(
        selectedProject!.path,
        selectedFile!.file.path,
        selectedFile!.staged,
        selectedFile!.untracked,
      ),
    enabled: !!selectedProject && !!selectedFile,
    // The payload holds both full file contents — don't let deselected files
    // pile up in the cache for the default 5 minutes.
    gcTime: 60_000,
  });

  const logQuery = useQuery<GitCommit[]>({
    queryKey: logQueryKey,
    queryFn: () => window.electron!.git.log(selectedProject!.path),
    enabled: !!selectedProject && historyOpen,
    refetchOnWindowFocus: visible,
    refetchInterval: visible ? 30000 : false,
  });

  const stageMutation = useMutation({
    mutationFn: (files: string[]) =>
      window.electron!.git.stage(selectedProject!.path, files),
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const unstageMutation = useMutation({
    mutationFn: (files: string[]) =>
      window.electron!.git.unstage(selectedProject!.path, files),
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const commitMutation = useMutation({
    mutationFn: (message: string) =>
      window.electron!.git.commit(selectedProject!.path, message),
    onSuccess: () => {
      setCommitMessage("");
      setError(null);
      setSelectedFile(null);
      invalidateStatus();
      invalidateLog();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const pushMutation = useMutation({
    mutationFn: () => window.electron!.git.push(selectedProject!.path),
    onSuccess: () => {
      setError(null);
      invalidateStatus();
      invalidateLog();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const discardMutation = useMutation({
    mutationFn: (files: GitFileEntry[]) => {
      const tracked = files.filter((f) => f.status !== "?").map((f) => f.path);
      const untracked = files
        .filter((f) => f.status === "?")
        .map((f) => f.path);
      return window.electron!.git.discard(
        selectedProject!.path,
        tracked,
        untracked,
      );
    },
    onSuccess: () => {
      setError(null);
      invalidateStatus();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const discardWithConfirm = (files: GitFileEntry[]) => {
    const label =
      files.length === 1 ? `"${files[0]!.path}"` : `${files.length} files`;
    if (window.confirm(`Discard changes to ${label}? This cannot be undone.`)) {
      discardMutation.mutate(files);
    }
  };

  const status = statusQuery.data;
  const changes = [...(status?.unstaged ?? []), ...(status?.untracked ?? [])];
  const staged = status?.staged ?? [];
  const isBusy =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    commitMutation.isPending ||
    pushMutation.isPending ||
    discardMutation.isPending;
  const canCommit =
    commitMessage.trim().length > 0 &&
    staged.length > 0 &&
    !commitMutation.isPending;
  const canPush = (status?.ahead ?? 0) > 0 && !pushMutation.isPending;
  const branch = status?.branch ?? "";

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <GitBranch className="size-8 text-white/15" />
        {unconfiguredCount > 0 ? (
          <>
            <p className="text-sm text-white/50">
              {unconfiguredCount === 1
                ? "1 project isn't set up on this device"
                : `${unconfiguredCount} projects aren't set up on this device`}
            </p>
            <p className="text-xs text-white/50">
              Set a local path via the folder icon in the top bar
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/50">No projects configured</p>
            <p className="text-xs text-white/50">
              Add a project via the folder icon in the top bar
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar: project + branch ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <select
          value={selectedProject?.id ?? ""}
          onChange={(e) => {
            const p = projects.find((p) => p.id === e.target.value) ?? null;
            setSelectedProject(p);
            setSelectedFile(null);
            setSelectedKeys(new Set());
            setAnchorKey(null);
            setError(null);
          }}
          className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-xs text-white/65 outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-neutral-900">
              {p.name}
            </option>
          ))}
        </select>

        {status && (
          <div className="flex shrink-0 items-center gap-1 text-11 text-white/50">
            <GitBranch className="size-3" />
            <span className="max-w-[72px] truncate">{branch}</span>
            {(status.ahead ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400/70">
                <ArrowUp className="size-2.5" />
                {status.ahead}
              </span>
            )}
            {(status.behind ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-sky-400/70">
                <ArrowDown className="size-2.5" />
                {status.behind}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching || isBusy}
          className="shrink-0 text-white/25 transition-colors hover:text-white/60 disabled:opacity-40"
        >
          <RefreshCw
            className={`size-3 ${statusQuery.isFetching ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {unconfiguredCount > 0 && (
        <div className="shrink-0 border-b border-white/[0.06] px-3 py-1 text-11 text-white/40">
          {unconfiguredCount === 1
            ? "1 more project isn't set up on this device"
            : `${unconfiguredCount} more projects aren't set up on this device`}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div
          className="flex shrink-0 flex-col overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          {/* Commit area — at top, like VS Code */}
          <div className="shrink-0 space-y-1.5 border-b border-white/[0.06] p-2">
            {error && (
              <p className="truncate text-10 text-red-400/80" title={error}>
                {error}
              </p>
            )}
            <textarea
              ref={commitTextareaRef}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Message"
              rows={1}
              className="w-full resize-none overflow-hidden rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/80 placeholder:text-white/20 outline-none transition-colors focus:border-white/20"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (canCommit) commitMutation.mutate(commitMessage);
                }
              }}
            />
            <div className="flex gap-1">
              <button
                onClick={() => commitMutation.mutate(commitMessage)}
                disabled={!canCommit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/[0.08] py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-default disabled:opacity-25"
              >
                <Check className="size-3" />
                {commitMutation.isPending ? "Committing…" : "Commit"}
              </button>
              <button
                onClick={() => pushMutation.mutate()}
                disabled={!canPush}
                title={`Push ${status?.ahead ?? 0} commit${(status?.ahead ?? 0) === 1 ? "" : "s"} to remote`}
                className="flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:cursor-default disabled:opacity-25"
              >
                {pushMutation.isPending ? (
                  <RefreshCw className="size-3 animate-spin" />
                ) : (
                  <ArrowUp className="size-3" />
                )}
              </button>
            </div>
          </div>

          {/* File list */}
          {/* select-none: shift-click is meant to range-select rows (like a
              file explorer), but without this the browser's default
              behavior kicks in first and shift-click just text-selects
              across rows instead. */}
          <div className="min-h-0 flex-1 select-none overflow-y-auto">
            {statusQuery.isLoading ? (
              <div className="flex h-12 items-center justify-center">
                <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
              </div>
            ) : (
              <>
                <SectionHeader
                  label="Staged Changes"
                  count={staged.length}
                  open={stagedOpen}
                  onToggle={() => setStagedOpen((o) => !o)}
                  onUnstageAll={
                    staged.length > 0
                      ? () => unstageMutation.mutate(staged.map((f) => f.path))
                      : undefined
                  }
                />
                {stagedOpen && (
                  <>
                    {staged.length === 0 && (
                      <p className="py-1 pl-8 text-xs text-white/50">
                        Nothing staged
                      </p>
                    )}
                    {staged.map((file, index) => (
                      <FileItem
                        key={`s:${file.path}`}
                        file={file}
                        isSelected={selectedKeys.has(fileKey(file, true))}
                        staged={true}
                        onSelect={(e) =>
                          handleFileClick(staged, index, true, e)
                        }
                        onUnstage={() =>
                          unstageMutation.mutate(
                            selectionTargets(staged, true, file).map(
                              (f) => f.path,
                            ),
                          )
                        }
                      />
                    ))}
                  </>
                )}

                <SectionHeader
                  label="Changes"
                  count={changes.length}
                  open={changesOpen}
                  onToggle={() => setChangesOpen((o) => !o)}
                  onStageAll={
                    changes.length > 0
                      ? () => stageMutation.mutate(changes.map((f) => f.path))
                      : undefined
                  }
                  onDiscardAll={
                    changes.length > 0
                      ? () => discardWithConfirm(changes)
                      : undefined
                  }
                />
                {changesOpen && (
                  <>
                    {changes.length === 0 && (
                      <p className="py-1 pl-8 text-xs text-white/50">
                        No changes
                      </p>
                    )}
                    {changes.map((file, index) => (
                      <FileItem
                        key={`u:${file.path}`}
                        file={file}
                        isSelected={selectedKeys.has(fileKey(file, false))}
                        staged={false}
                        onSelect={(e) =>
                          handleFileClick(changes, index, false, e)
                        }
                        onStage={() =>
                          stageMutation.mutate(
                            selectionTargets(changes, false, file).map(
                              (f) => f.path,
                            ),
                          )
                        }
                        onDiscard={() =>
                          discardWithConfirm(
                            selectionTargets(changes, false, file),
                          )
                        }
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* History — pinned to bottom */}
          <div className="shrink-0 border-t border-white/[0.06]">
            <SectionHeader
              label="History"
              count={0}
              open={historyOpen}
              onToggle={() => setHistoryOpen((o) => !o)}
            />
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto">
                {logQuery.isLoading ? (
                  <div className="flex h-12 items-center justify-center">
                    <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
                  </div>
                ) : (
                  logQuery.data?.map((commit) => (
                    <CommitItem key={commit.hash} commit={commit} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Resize handle ── */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-white/[0.05] transition-colors hover:bg-primary-500/40 active:bg-primary-500/60"
        />

        {/* ── Right panel: diff viewer ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-11 text-white/50">
                  {selectedFile.file.originalPath
                    ? `${selectedFile.file.originalPath} → ${selectedFile.file.path}`
                    : selectedFile.file.path}
                </span>
                <span className="shrink-0 text-10 text-white/50">
                  {selectedFile.staged
                    ? "staged"
                    : selectedFile.untracked
                      ? "untracked"
                      : "unstaged"}
                </span>
              </div>

              {diffQuery.isLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="size-3.5 animate-spin rounded-full border border-white/20 border-t-white/50" />
                </div>
              ) : (
                <WidgetErrorBoundary
                  key={`${selectedFile.file.path}:${selectedFile.staged}`}
                >
                  {diffQuery.data?.kind === "image" ? (
                    <ImageDiffViewer
                      oldImage={diffQuery.data.oldImage}
                      newImage={diffQuery.data.newImage}
                    />
                  ) : (
                    <DiffViewer
                      diff={diffQuery.data?.diff ?? ""}
                      filename={selectedFile.file.path}
                      oldContent={diffQuery.data?.oldContent ?? ""}
                      newContent={diffQuery.data?.newContent ?? ""}
                    />
                  )}
                </WidgetErrorBoundary>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-white/50">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
