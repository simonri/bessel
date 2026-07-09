import { memo, Suspense, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metron/ui/components/dropdown-menu";
import { MODULE_REGISTRY } from "./module-registry";
import { WindowEntryContext, WindowTitleContext, useWindowManager, type WindowEntry } from "./window-manager";

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  );
}

function MoveToWorkspaceMenu({ entry }: { entry: WindowEntry }) {
  const { workspaces, moveWindowToWorkspace } = useWindowManager();
  const others = workspaces.filter((ws) => ws.id !== entry.workspaceId);
  if (others.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          title="Move to workspace"
          className="flex size-4 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <ChevronDown className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40 border-white/10 bg-black/80 text-white/80 shadow-2xl backdrop-blur-xl"
      >
        {workspaces.map((ws, i) =>
          ws.id === entry.workspaceId ? null : (
            <DropdownMenuItem
              key={ws.id}
              className="text-white/70 focus:bg-white/10 focus:text-white/90"
              onClick={() => moveWindowToWorkspace(entry.id, ws.id)}
            >
              Move to workspace {i + 1}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const CanvasWindow = memo(function CanvasWindow({
  entry,
  isFocused = false,
  onFocus,
}: {
  entry: WindowEntry;
  isFocused?: boolean;
  onFocus?: () => void;
}) {
  const { closeWindow } = useWindowManager();
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  const Component = config.component;
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);

  return (
    <div
      data-is-window="true"
      onPointerDown={onFocus}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-black/60 shadow-2xl backdrop-blur-xl transition-[border-color,box-shadow] duration-300 ${
        isFocused ? "border-primary-500" : "border-white/10"
      }`}
    >
      {/* Title bar — react-grid-layout drag handle (selector: .canvas-window-titlebar) */}
      <div className="canvas-window-titlebar flex shrink-0 cursor-grab items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1.5 active:cursor-grabbing">
        <Icon className="size-3 text-white/50" />
        <span className="text-xs font-medium text-white/80">
          {config.title}
          {(dynamicTitle || entry.data?.projectName) && (
            <span className="ml-1.5 font-normal text-white/40">
              / {dynamicTitle || entry.data?.projectName}
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <MoveToWorkspaceMenu entry={entry} />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => closeWindow(entry.id)}
            className="flex size-4 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-2.5" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={`flex-1 ${config.noPadding ? "overflow-hidden" : "overflow-y-auto p-4"}`}>
        <WindowTitleContext.Provider value={setDynamicTitle}>
          <WindowEntryContext.Provider value={entry}>
            <Suspense fallback={<WindowSpinner />}>
              <Component />
            </Suspense>
          </WindowEntryContext.Provider>
        </WindowTitleContext.Provider>
      </div>
    </div>
  );
});
