import { Suspense, useCallback } from "react";
import { X } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { MODULE_REGISTRY } from "./module-registry";
import { useWindowManager, type WindowEntry } from "./window-manager";

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  );
}

export function CanvasWindow({ entry }: { entry: WindowEntry }) {
  const { closeWindow } = useWindowManager();
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  const Component = config.component;

  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: entry.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: entry.id });

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
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-black/60 shadow-2xl backdrop-blur-xl transition-colors ${
        isDragging ? "opacity-0" : isOver ? "border-white/30" : "border-white/10"
      }`}
    >
      {/* Title bar — drag handle */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5 cursor-grab active:cursor-grabbing"
      >
        <Icon className="size-3.5 text-white/50" />
        <span className="text-sm font-medium text-white/80">{config.title}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => closeWindow(entry.id)}
          className="ml-auto flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className={`flex-1 ${config.noPadding ? "overflow-hidden" : "overflow-y-auto p-4"}`}>
        <Suspense fallback={<WindowSpinner />}>
          <Component />
        </Suspense>
      </div>
    </div>
  );
}
