import { useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useWindowManager, type WindowEntry } from "./window-manager";
import { MODULE_REGISTRY } from "./module-registry";
import { CanvasWindow } from "./canvas-window";
import { CanvasDock } from "./canvas-dock";
import { CanvasTopBar } from "./canvas-topbar";

function WindowDragOverlay({ entry }: { entry: WindowEntry }) {
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/60 shadow-2xl backdrop-blur-xl opacity-80">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <Icon className="size-3.5 text-white/50" />
        <span className="text-sm font-medium text-white/80">{config.title}</span>
      </div>
    </div>
  );
}

export function CanvasShell() {
  const { windows, reorderWindows } = useWindowManager();
  const [activeWindow, setActiveWindow] = useState<WindowEntry | null>(null);
  const rowCount = Math.max(1, Math.ceil(windows.length / 2));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const win = windows.find((w) => w.id === event.active.id);
    setActiveWindow(win ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWindow(null);
    if (over && active.id !== over.id) {
      reorderWindows(String(active.id), String(over.id));
    }
  };

  return (
    <div className="fixed inset-0">
      <img
        src="/image.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Content area: between top bar and dock, no scroll */}
      <div className="relative flex h-full flex-col pt-12 pb-3.5">
        {windows.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={windows.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div
                className="grid flex-1 grid-cols-2 gap-4 px-3.5 min-h-0"
                style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
              >
                {windows.map((w) => (
                  <CanvasWindow key={w.id} entry={w} />
                ))}
              </div>
            </SortableContext>
            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={null}>
                  {activeWindow ? <WindowDragOverlay entry={activeWindow} /> : null}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
        )}
      </div>

      <CanvasTopBar />
      <CanvasDock />
    </div>
  );
}
