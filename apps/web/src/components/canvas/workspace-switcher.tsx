import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metron/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metron/ui/components/tooltip";
import { LayoutGrid, LayoutTemplate, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useFlashWorkspace,
  useWindowActions,
  useWorkspaceMeta,
} from "@/components/canvas/window-manager";
import { WorkspaceTemplatesDialog } from "@/components/canvas/workspace-template-dialog";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { cn } from "@/lib/utils";

function WorkspacePill({
  index,
  isActive,
  isFlashing,
  onSelect,
  onContextMenu,
}: {
  index: number;
  isActive: boolean;
  isFlashing: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "flex h-6 min-w-6 items-center justify-center rounded text-xs font-medium transition-colors duration-150",
        isActive
          ? "bg-white/15 text-white/90"
          : "text-white/55 hover:bg-white/[0.08] hover:text-white/70",
        isFlashing && "animate-workspace-flash",
      )}
    >
      {index + 1}
    </button>
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
          <button
            title="New workspace"
            className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"
          >
            <Plus className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
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
          className="flex h-6 w-6 items-center justify-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"
        >
          <LayoutGrid className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Align widgets</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceContextMenu({
  canClose,
  onClose,
  onDismiss,
}: {
  canClose: boolean;
  onClose: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handler = () => onDismiss();
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [onDismiss]);

  return (
    <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        disabled={!canClose}
        className="flex w-full items-center px-4 py-2.5 text-sm text-red-400/80 transition-colors hover:bg-white/[0.06] hover:text-red-400 disabled:cursor-default disabled:opacity-30"
      >
        Close
      </button>
    </div>
  );
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const { addWorkspace, removeWorkspace, switchWorkspace } = useWindowActions();
  const flashWorkspaceId = useFlashWorkspace();
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-0.5">
      {workspaces.map((ws, i) => {
        const isActive = ws.id === activeWorkspaceId;
        return (
          <div key={ws.id} className="relative">
            <WorkspacePill
              index={i}
              isActive={isActive}
              isFlashing={flashWorkspaceId === ws.id}
              onSelect={() => switchWorkspace(ws.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuId(ws.id);
              }}
            />
            {menuId === ws.id && (
              <WorkspaceContextMenu
                canClose={workspaces.length > 1}
                onClose={() => {
                  removeWorkspace(ws.id);
                  setMenuId(null);
                }}
                onDismiss={() => setMenuId(null)}
              />
            )}
          </div>
        );
      })}
      <NewWorkspaceMenu addWorkspace={addWorkspace} />
      <div className="mx-1 h-3 w-px shrink-0 bg-white/10" />
      <AlignButton />
    </div>
  );
}
