import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import { cn } from "@bessel/ui/lib/utils";
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Link2,
  Pencil,
  Pin,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildTree, filterTree, type TreeNode } from "./lib/tree";
import { basenameOf, stripMd } from "./lib/wikilinks";
import type { VaultEntry, VaultEntryKind } from "./vault-types";

export interface FileTreeProps {
  root: string;
  entries: readonly VaultEntry[];
  activeRel: string | null;
  expandedDirs: readonly string[];
  onToggleDir: (rel: string) => void;
  onOpen: (rel: string, opts: { newTab: boolean }) => void;
  onCreateNote: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onRename: (rel: string, newName: string) => void;
  onTrash: (rel: string) => void;
  onReveal: (rel: string) => void;
  onPinToCanvas: (rel: string) => void;
}

function vaultNameFromRoot(root: string): string {
  return root.split("/").filter(Boolean).pop() ?? root;
}

function iconFor(kind: VaultEntryKind) {
  switch (kind) {
    case "md":
      return FileText;
    case "image":
      return Image;
    default:
      return File;
  }
}

const ROW =
  "flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-13 outline-none transition-colors";

interface RenameState {
  rel: string;
  original: string;
  isDir: boolean;
}

function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: rename starts editing immediately, like the OS file explorer it mirrors
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit();
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={onCommit}
      className="min-w-0 flex-1 rounded border border-primary-500/50 bg-black/40 px-1 py-0 text-13 text-white/90 outline-none"
    />
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  root: string;
  activeRel: string | null;
  isExpanded: (rel: string) => boolean;
  renaming: RenameState | null;
  renameValue: string;
  onToggle: (rel: string) => void;
  onOpen: (rel: string, opts: { newTab: boolean }) => void;
  onStartRename: (node: TreeNode) => void;
  onRenameValueChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onCreateNote: (folder: string) => void;
  onCreateFolder: (folder: string) => void;
  onTrash: (rel: string) => void;
  onReveal: (rel: string) => void;
  onPinToCanvas: (rel: string) => void;
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  root,
  activeRel,
  isExpanded,
  renaming,
  renameValue,
  onToggle,
  onOpen,
  onStartRename,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onCreateNote,
  onCreateFolder,
  onTrash,
  onReveal,
  onPinToCanvas,
}: RowProps) {
  const isRenaming = renaming?.rel === node.rel;
  const indent = 6 + depth * 14;

  const copyLink = async () => {
    const url = `obsidian://open?vault=${encodeURIComponent(vaultNameFromRoot(root))}&file=${encodeURIComponent(stripMd(node.rel))}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Obsidian link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const trashWithConfirm = () => {
    if (
      window.confirm(`Move "${node.name || basenameOf(node.rel)}" to trash?`)
    ) {
      onTrash(node.rel);
    }
  };

  if (node.kind === "dir") {
    const expanded = isExpanded(node.rel);
    return (
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={() => onToggle(node.rel)}
              style={{ paddingLeft: indent }}
              className={cn(ROW, "text-white/60 hover:bg-white/[0.05]")}
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 text-white/30 transition-transform",
                  expanded && "rotate-90",
                )}
              />
              {expanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-white/35" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-white/35" />
              )}
              {isRenaming ? (
                <RenameInput
                  value={renameValue}
                  onChange={onRenameValueChange}
                  onCommit={onCommitRename}
                  onCancel={onCancelRename}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              )}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onCreateNote(node.rel)}>
              <FileText />
              New note
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreateFolder(node.rel)}>
              <FolderPlus />
              New folder
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onStartRename(node)}>
              <Pencil />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onReveal(node.rel)}>
              <SquareArrowOutUpRight />
              Reveal in file manager
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={trashWithConfirm}>
              <Trash2 />
              Trash
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {expanded &&
          node.children.map((child) => (
            <TreeRow
              key={child.rel}
              node={child}
              depth={depth + 1}
              root={root}
              activeRel={activeRel}
              isExpanded={isExpanded}
              renaming={renaming}
              renameValue={renameValue}
              onToggle={onToggle}
              onOpen={onOpen}
              onStartRename={onStartRename}
              onRenameValueChange={onRenameValueChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onTrash={onTrash}
              onReveal={onReveal}
              onPinToCanvas={onPinToCanvas}
            />
          ))}
      </div>
    );
  }

  const isMd = node.kind === "md";
  const isPreviewable = isMd || node.kind === "image";
  const isActive = node.rel === activeRel;
  const Icon = iconFor(node.kind);
  const label = isMd ? basenameOf(node.rel) : node.name;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          style={{ paddingLeft: indent + 18 }}
          onClick={(e) => {
            onOpen(node.rel, { newTab: e.metaKey || e.ctrlKey });
          }}
          className={cn(
            ROW,
            isActive
              ? "bg-primary/15 text-white/90"
              : "text-white/55 hover:bg-white/[0.05] hover:text-white/80",
          )}
        >
          <Icon className="size-3.5 shrink-0 text-white/30" />
          {isRenaming ? (
            <RenameInput
              value={renameValue}
              onChange={onRenameValueChange}
              onCommit={onCommitRename}
              onCancel={onCancelRename}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{label}</span>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isPreviewable && (
          <ContextMenuItem onSelect={() => onOpen(node.rel, { newTab: true })}>
            <SquareArrowOutUpRight />
            Open in new tab
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => onStartRename(node)}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onReveal(node.rel)}>
          <SquareArrowOutUpRight />
          Reveal in file manager
        </ContextMenuItem>
        {isMd && (
          <ContextMenuItem onSelect={() => onPinToCanvas(node.rel)}>
            <Pin />
            Pin to canvas
          </ContextMenuItem>
        )}
        {isMd && (
          <ContextMenuItem onSelect={copyLink}>
            <Link2 />
            Copy Obsidian link
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={trashWithConfirm}>
          <Trash2 />
          Trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

export function FileTree({
  root,
  entries,
  activeRel,
  expandedDirs,
  onToggleDir,
  onOpen,
  onCreateNote,
  onCreateFolder,
  onRename,
  onTrash,
  onReveal,
  onPinToCanvas,
}: FileTreeProps) {
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const tree = useMemo(() => buildTree(entries), [entries]);
  const displayTree = useMemo(() => filterTree(tree, filter), [tree, filter]);
  const filtering = filter.trim().length > 0;
  const expandedSet = useMemo(() => new Set(expandedDirs), [expandedDirs]);
  const isExpanded = (rel: string) => filtering || expandedSet.has(rel);

  const startRename = (node: TreeNode) => {
    const original = node.kind === "dir" ? node.name : basenameOf(node.rel);
    setRenaming({ rel: node.rel, original, isDir: node.kind === "dir" });
    setRenameValue(original);
  };
  const cancelRename = () => setRenaming(null);
  const commitRename = () => {
    const state = renaming;
    setRenaming(null);
    if (!state) return;
    const value = renameValue.trim();
    if (!value || value === state.original) return;
    onRename(state.rel, value);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.06] p-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter notes…"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-12 text-white/75 outline-none placeholder:text-white/25 focus:border-white/20"
        />
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {displayTree.length === 0 ? (
              <p className="px-2 py-4 text-center text-12 text-white/35">
                {filtering ? "No matches" : "Empty vault"}
              </p>
            ) : (
              displayTree.map((node) => (
                <TreeRow
                  key={node.rel}
                  node={node}
                  depth={0}
                  root={root}
                  activeRel={activeRel}
                  isExpanded={isExpanded}
                  renaming={renaming}
                  renameValue={renameValue}
                  onToggle={onToggleDir}
                  onOpen={onOpen}
                  onStartRename={startRename}
                  onRenameValueChange={setRenameValue}
                  onCommitRename={commitRename}
                  onCancelRename={cancelRename}
                  onCreateNote={onCreateNote}
                  onCreateFolder={onCreateFolder}
                  onTrash={onTrash}
                  onReveal={onReveal}
                  onPinToCanvas={onPinToCanvas}
                />
              ))
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onCreateNote("")}>
            <FileText />
            New note
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCreateFolder("")}>
            <FolderPlus />
            New folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
