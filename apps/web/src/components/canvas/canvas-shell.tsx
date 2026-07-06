import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { useWindowManager, type WindowEntry } from "./window-manager";
import { MODULE_REGISTRY } from "./module-registry";
import { CanvasWindow } from "./canvas-window";
import { CanvasDock } from "./canvas-dock";
import { CanvasTopBar } from "./canvas-topbar";
import { CommandPalette } from "./command-palette";
import { useSettings } from "@/hooks/use-settings";

const EmptySlot = memo(function EmptySlot({ slotIndex }: { slotIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border border-dashed ${
        isOver ? "border-white/30 bg-white/5" : "border-white/[0.06]"
      }`}
    />
  );
});

function WindowDragOverlay({ entry }: { entry: WindowEntry }) {
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/80 shadow-2xl opacity-80">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <Icon className="size-3.5 text-white/50" />
        <span className="text-sm font-medium text-white/80">{config.title}</span>
      </div>
    </div>
  );
}

interface WorkspaceState {
  id: string;
  windows: WindowEntry[];
}

function WorkspaceGrid({ workspace, isActive }: { workspace: WorkspaceState; isActive: boolean }) {
  const { placeWindow } = useWindowManager();
  const { settings } = useSettings();
  const [activeWindow, setActiveWindow] = useState<WindowEntry | null>(null);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const wsWindows = workspace.windows;
  const maxSlot = wsWindows.reduce((max, w) => Math.max(max, w.slot), -1);
  const rowCount = wsWindows.length === 0 ? 0 : Math.floor(maxSlot / 2) + 1;
  const totalSlots = rowCount * 2;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWindow((wsWindows.find((w) => w.id === event.active.id)) ?? null);
    setFocusedWindowId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsWindows]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWindow(null);
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith("slot-")) {
      placeWindow(String(active.id), parseInt(overId.slice(5), 10));
    } else {
      const overWin = wsWindows.find((w) => w.id === overId);
      if (overWin) placeWindow(String(active.id), overWin.slot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsWindows, placeWindow]);

  return (
    <DndContext
      sensors={isActive ? sensors : []}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid flex-1 grid-cols-2 px-3.5 min-h-0"
        style={{
          display: isActive ? (rowCount > 0 ? "grid" : "block") : "none",
          gridTemplateRows: rowCount > 0 ? `repeat(${rowCount}, 1fr)` : undefined,
          gap: `${settings.gridGap}px`,
        }}
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("[data-is-window]")) {
            setFocusedWindowId(null);
          }
        }}
      >
        {Array.from({ length: totalSlots }, (_, i) => {
          const win = wsWindows.find((w) => w.slot === i);
          return win ? (
            <CanvasWindow
              key={win.id}
              entry={win}
              isFocused={focusedWindowId === win.id}
              onFocus={() => setFocusedWindowId(win.id)}
            />
          ) : (
            <EmptySlot key={`slot-${i}`} slotIndex={i} />
          );
        })}
      </div>
      {isActive && typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            {activeWindow ? <WindowDragOverlay entry={activeWindow} /> : null}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}

// Forward+reverse baked into one clip — browser loops it natively.
function VideoWallpaper() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <video
      ref={videoRef}
      src="/wallpaper-forest-loop.mp4"
      muted
      playsInline
      loop
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

export function CanvasShell() {
  const { workspaces, activeWorkspaceId } = useWindowManager();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  return (
    <div className="fixed inset-0">
      {settings.wallpaper === "video" ? (
        <VideoWallpaper />
      ) : (
        <img
          src="/image.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      {settings.wallpaper === "image" && <div className="absolute inset-0 bg-black/30" />}

      <div className="relative flex h-full flex-col pt-12 pb-10">
        {workspaces.map((workspace) => (
          <WorkspaceGrid
            key={workspace.id}
            workspace={workspace}
            isActive={workspace.id === activeWorkspaceId}
          />
        ))}
      </div>

      <CanvasTopBar />
      <CanvasDock />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
