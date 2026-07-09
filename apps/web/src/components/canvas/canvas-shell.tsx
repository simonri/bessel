import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  pointerWithin,
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

function gridPos(slot: number): CSSProperties {
  return { gridColumn: (slot % 2) + 1, gridRow: Math.floor(slot / 2) + 1 };
}

// closestCenter compares the *dragged window's* rect center to each droppable's
// center — for a large window and a tiny, far-away workspace pill, a nearby grid
// slot's center almost always wins, so the pill can practically never be hit.
// Check the actual pointer position against the pills first (pointerWithin), and
// only fall back to closestCenter for in-grid slot/window reordering.
export const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args).filter((c) => String(c.id).startsWith("workspace-"));
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};

const EmptySlot = memo(function EmptySlot({ slotIndex }: { slotIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });
  return (
    <div
      ref={setNodeRef}
      style={gridPos(slotIndex)}
      className={`rounded-2xl border border-dashed ${
        isOver ? "border-white/30 bg-white/5" : "border-white/[0.06]"
      }`}
    />
  );
});

function WindowDragOverlay({ entry, headingToWorkspace }: { entry: WindowEntry; headingToWorkspace: boolean }) {
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/80 shadow-2xl transition-all duration-150 ${
        headingToWorkspace ? "scale-50 opacity-40" : "scale-100 opacity-80"
      }`}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1.5">
        <Icon className="size-3 text-white/50" />
        <span className="text-xs font-medium text-white/80">{config.title}</span>
      </div>
    </div>
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
  const { allWindows, activeWorkspaceId, placeWindow, moveWindowToWorkspace } = useWindowManager();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeWindow, setActiveWindow] = useState<WindowEntry | null>(null);
  const [overWorkspacePill, setOverWorkspacePill] = useState(false);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeWorkspaceWindows = useMemo(
    () => allWindows.filter((w) => w.workspaceId === activeWorkspaceId),
    [allWindows, activeWorkspaceId],
  );
  const maxSlot = activeWorkspaceWindows.reduce((max, w) => Math.max(max, w.slot), -1);
  const rowCount = activeWorkspaceWindows.length === 0 ? 0 : Math.floor(maxSlot / 2) + 1;
  const totalSlots = rowCount * 2;

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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWindow(allWindows.find((w) => w.id === event.active.id) ?? null);
    setFocusedWindowId(null);
  }, [allWindows]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverWorkspacePill(!!event.over && String(event.over.id).startsWith("workspace-"));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveWindow(null);
    setOverWorkspacePill(false);
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (overId.startsWith("workspace-")) {
      const targetWorkspaceId = overId.slice("workspace-".length);
      if (targetWorkspaceId !== activeWorkspaceId) {
        moveWindowToWorkspace(String(active.id), targetWorkspaceId);
      }
      return;
    }
    if (overId.startsWith("slot-")) {
      placeWindow(String(active.id), parseInt(overId.slice(5), 10));
    } else {
      const overWin = activeWorkspaceWindows.find((w) => w.id === overId);
      if (overWin) placeWindow(String(active.id), overWin.slot);
    }
  }, [activeWorkspaceWindows, activeWorkspaceId, placeWindow, moveWindowToWorkspace]);

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

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="relative flex h-full flex-col pt-12 pb-10">
          <div
            className="grid flex-1 grid-cols-2 px-3.5 min-h-0"
            style={{
              display: rowCount > 0 ? "grid" : "block",
              gridTemplateRows: rowCount > 0 ? `repeat(${rowCount}, 1fr)` : undefined,
              gap: `${settings.gridGap}px`,
            }}
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest("[data-is-window]")) {
                setFocusedWindowId(null);
              }
            }}
          >
            {Array.from({ length: totalSlots }, (_, i) =>
              activeWorkspaceWindows.some((w) => w.slot === i) ? null : (
                <EmptySlot key={`slot-${i}`} slotIndex={i} />
              ),
            )}
            {allWindows.map((win) => (
              <CanvasWindow
                key={win.id}
                entry={win}
                isActiveWorkspace={win.workspaceId === activeWorkspaceId}
                isFocused={focusedWindowId === win.id}
                onFocus={() => setFocusedWindowId(win.id)}
                style={{
                  ...gridPos(win.slot),
                  display: win.workspaceId === activeWorkspaceId ? undefined : "none",
                }}
              />
            ))}
          </div>
        </div>

        <CanvasTopBar />
        <CanvasDock />

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {activeWindow ? (
                <WindowDragOverlay entry={activeWindow} headingToWorkspace={overWorkspacePill} />
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
