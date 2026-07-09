import { memo, Suspense, useCallback, useState } from "react";
import { X } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { MODULE_REGISTRY } from "./module-registry";
import { WindowEntryContext, WindowTitleContext, useWindowManager, type WindowEntry } from "./window-manager";

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  );
}

export const CanvasWindow = memo(function CanvasWindow({
  entry,
  isFocused = false,
  onFocus,
  isActiveWorkspace = true,
  style,
}: {
  entry: WindowEntry;
  isFocused?: boolean;
  onFocus?: () => void;
  isActiveWorkspace?: boolean;
  style?: React.CSSProperties;
}) {
  const { closeWindow } = useWindowManager();
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  const Component = config.component;
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);

  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: entry.id, disabled: !isActiveWorkspace });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: entry.id, disabled: !isActiveWorkspace });

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  return (
    <div
      ref={setRef}
      style={style}
      data-is-window="true"
      onPointerDown={onFocus}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-black/60 shadow-2xl backdrop-blur-xl transition-[border-color,box-shadow] duration-300 ${
        isDragging
          ? "opacity-0"
          : isFocused
          ? "border-primary-500"
          : isOver
          ? "border-white/30"
          : "border-white/10"
      }`}
    >
      {/* Title bar — drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1.5 cursor-grab active:cursor-grabbing"
      >
        <Icon className="size-3 text-white/50" />
        <span className="text-xs font-medium text-white/80">
          {config.title}
          {(dynamicTitle || entry.data?.projectName) && (
            <span className="ml-1.5 font-normal text-white/40">
              / {dynamicTitle || entry.data?.projectName}
            </span>
          )}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => closeWindow(entry.id)}
          className="ml-auto flex size-4 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-2.5" />
        </button>
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
