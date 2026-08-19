import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@bessel/ui/components/tooltip";
import { glassSurface } from "@bessel/ui/lib/glass";
import { LayoutGrid, LayoutTemplate, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useFlashWorkspace,
  useWindowActions,
  useWorkspaceMeta,
  type WorkspaceMeta,
  workspaceLabel,
} from "@/components/canvas/window-manager";
import { WorkspaceTemplatesDialog } from "@/components/canvas/workspace-template-dialog";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded text-white/30 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.08] hover:text-white/60 active:scale-95 motion-reduce:active:scale-100";

function RenameInput({
  workspace,
  index,
  onDone,
}: {
  workspace: WorkspaceMeta;
  index: number;
  onDone: () => void;
}) {
  const { renameWorkspace } = useWindowActions();
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape must discard the draft, but it also blurs the input — this flag
  // keeps that blur from committing what was just cancelled.
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (value: string) => {
    if (!cancelledRef.current) renameWorkspace(workspace.id, value);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      defaultValue={workspace.name ?? ""}
      placeholder={workspaceLabel(workspace, index)}
      aria-label="Workspace name"
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelledRef.current = true;
          e.currentTarget.blur();
        }
      }}
      className="h-5 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-1 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-primary-500/50"
    />
  );
}

function WorkspaceTab({
  workspace,
  index,
  isActive,
  isFlashing,
  canClose,
}: {
  workspace: WorkspaceMeta;
  index: number;
  isActive: boolean;
  isFlashing: boolean;
  canClose: boolean;
}) {
  const { switchWorkspace, removeWorkspace } = useWindowActions();
  const [editing, setEditing] = useState(false);
  const pendingRenameRef = useRef(false);

  const indexBadge = (
    <span
      className={cn(
        "w-4 shrink-0 text-center font-mono text-10 tabular-nums",
        isActive ? "text-white/60" : "text-white/30",
      )}
    >
      {index + 1}
    </span>
  );
  const rowClass = cn(
    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium",
    isActive ? "bg-white/12 text-white/90" : "text-white/55",
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {editing ? (
          // A plain row while renaming — an <input> can't live inside a <button>.
          <div className={rowClass}>
            {indexBadge}
            <RenameInput
              workspace={workspace}
              index={index}
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => switchWorkspace(workspace.id)}
            onDoubleClick={() => setEditing(true)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              rowClass,
              "transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
              !isActive && "hover:bg-white/[0.06] hover:text-white/75",
              isFlashing && "animate-workspace-flash",
            )}
          >
            {indexBadge}
            <span className="min-w-0 flex-1 truncate">
              {workspaceLabel(workspace, index)}
            </span>
          </button>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent
        className={cn(
          glassSurface({ weight: "heavy" }),
          "min-w-36 border-white/10 text-white/80 shadow-2xl",
        )}
        // Start editing only once the menu has fully closed — otherwise its
        // close-time focus restore lands on the trigger and steals focus from
        // the freshly mounted rename input.
        onCloseAutoFocus={(e) => {
          if (!pendingRenameRef.current) return;
          pendingRenameRef.current = false;
          e.preventDefault();
          setEditing(true);
        }}
      >
        <ContextMenuItem
          className="text-white/70 focus:bg-white/10 focus:text-white/90"
          onSelect={() => {
            pendingRenameRef.current = true;
          }}
        >
          <Pencil className="size-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canClose}
          className="text-red-400/80 focus:bg-white/10 focus:text-red-400"
          onSelect={() => removeWorkspace(workspace.id)}
        >
          <X className="size-3.5 text-red-400/80" />
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NewWorkspaceMenu({ addWorkspace }: { addWorkspace: () => void }) {
  const { templates } = useWorkspaceTemplates();
  const { applyTemplate } = useWindowActions();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button title="New workspace" className={ICON_BUTTON}>
            <Plus className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-56 overflow-hidden rounded-xl border-white/10 bg-black/80 p-0 shadow-2xl backdrop-blur-xl"
        >
          <button
            onClick={() => {
              addWorkspace();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white/90"
          >
            <Plus className="size-3.5 shrink-0" />
            Blank workspace
          </button>

          {templates.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-t border-white/[0.06]">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    applyTemplate(templateToWindowSpecs(t), "new");
                    setOpen(false);
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span className="text-sm text-white/80">{t.name}</span>
                  <span className="truncate text-11 text-white/50">
                    {widgetSummary(t.widgets)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              setManageOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 text-left text-xs font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            <LayoutTemplate className="size-3.5 shrink-0" />
            Manage templates…
          </button>
        </PopoverContent>
      </Popover>
      <WorkspaceTemplatesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  );
}

function AlignButton() {
  const { alignWorkspace } = useWindowActions();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={alignWorkspace}
          title="Align widgets"
          className={ICON_BUTTON}
        >
          <LayoutGrid className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Align widgets</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const { addWorkspace } = useWindowActions();
  const flashWorkspace = useFlashWorkspace();

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5" role="tablist">
        {workspaces.map((ws, i) => (
          <WorkspaceTab
            // Remounting on each move restarts the flash animation even when
            // the same tab is the target twice in a row.
            key={
              flashWorkspace?.id === ws.id
                ? `${ws.id}-flash-${flashWorkspace.seq}`
                : ws.id
            }
            workspace={ws}
            index={i}
            isActive={ws.id === activeWorkspaceId}
            isFlashing={flashWorkspace?.id === ws.id}
            canClose={workspaces.length > 1}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center gap-0.5 px-1">
        <NewWorkspaceMenu addWorkspace={addWorkspace} />
        <AlignButton />
      </div>
    </div>
  );
}
