import { ChevronDown, ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { FileTypeDot } from "./-diff-viewer";
import type { GitFileEntry } from "./-git-status";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  M: "text-amber-400",
  A: "text-emerald-400",
  D: "text-red-400",
  R: "text-blue-400",
  C: "text-purple-400",
  U: "text-yellow-400",
  "?": "text-emerald-400",
};

// ── FileItem ───────────────────────────────────────────────────────────────────

export function FileItem({
  file,
  isSelected,
  staged,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: GitFileEntry;
  isSelected: boolean;
  staged: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const parts = file.path.split("/");
  const name = parts.pop() ?? file.path;
  const dir = parts.join("/");
  const statusBadge = file.status === "?" ? "U" : file.status;

  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1.5 py-[3px] pl-4 pr-2 transition-colors ${
        isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
      }`}
    >
      <FileTypeDot filename={name} />

      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="text-white/80">{name}</span>
        {dir && <span className="ml-1.5 text-white/50">{dir}</span>}
      </span>

      {onDiscard && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
          title="Discard changes"
          className="flex size-4 shrink-0 items-center justify-center rounded text-white/25 opacity-0 transition-opacity hover:text-red-400/70 group-hover:opacity-100"
        >
          <Trash2 className="size-3" />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          staged ? onUnstage?.() : onStage?.();
        }}
        className="flex size-4 shrink-0 items-center justify-center rounded text-white/25 opacity-0 transition-opacity hover:text-white/70 group-hover:opacity-100"
      >
        {staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
      </button>

      <span
        className={`w-3 shrink-0 text-center text-10 font-semibold ${STATUS_COLOR[file.status] ?? "text-white/50"}`}
      >
        {statusBadge}
      </span>
    </div>
  );
}

// ── SectionHeader ──────────────────────────────────────────────────────────────

export function SectionHeader({
  label,
  count,
  open,
  onToggle,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div
      onClick={onToggle}
      className="group flex cursor-pointer items-center gap-1 px-2 py-[5px] hover:bg-white/[0.03]"
    >
      <Chevron className="size-3 shrink-0 text-white/40" />
      <span className="flex-1 text-10 font-semibold uppercase tracking-wider text-white/50">
        {label}
      </span>
      {count > 0 && (
        <span className="rounded px-1 text-10 text-white/50">{count}</span>
      )}
      <div
        className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {onStageAll && (
          <button
            onClick={onStageAll}
            title="Stage all"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-white/70"
          >
            <Plus className="size-3" />
          </button>
        )}
        {onUnstageAll && (
          <button
            onClick={onUnstageAll}
            title="Unstage all"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-white/70"
          >
            <Minus className="size-3" />
          </button>
        )}
        {onDiscardAll && (
          <button
            onClick={onDiscardAll}
            title="Discard all changes"
            className="flex size-4 items-center justify-center rounded text-white/30 hover:text-red-400/70"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
