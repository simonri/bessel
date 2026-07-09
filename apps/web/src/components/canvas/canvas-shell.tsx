import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GridLayout,
  cloneLayout,
  verticalCompactor,
  type Compactor,
} from "react-grid-layout";
import { useWindowManager, GRID_COLS, GRID_ROW_HEIGHT, type WindowEntry } from "./window-manager";
import { fitToViewport } from "./layout-engine";
import { MODULE_REGISTRY } from "./module-registry";
import { CanvasWindow } from "./canvas-window";
import { CanvasDock } from "./canvas-dock";
import { CanvasTopBar } from "./canvas-topbar";
import { CommandPalette } from "./command-palette";
import { useSettings } from "@/hooks/use-settings";
import "./canvas-grid.css";

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

// The canvas must never scroll, so — unlike react-grid-layout's own width-only
// useContainerWidth — this measures both dimensions of the available area, so a
// row cap (maxRows) can be derived from real viewport height, not just column width.
function useContainerSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      setMounted(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ...size, containerRef, mounted };
}

// minW/minH are capped to the grid itself so RGL's interactive clamps never
// fight a widget the viewport forced below its natural minimum.
function windowsToLayout(windows: WindowEntry[], maxRows: number) {
  return windows.map((win) => {
    const { minSize } = MODULE_REGISTRY[win.module];
    return {
      i: win.id,
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
      minW: Math.min(minSize.w, GRID_COLS),
      minH: Math.min(minSize.h, maxRows),
    };
  });
}

// A no-op most of the time (positions stay exactly where the user left them — only
// the Align button runs a real compaction). While an item is actively being
// dragged/resized, that one item is temporarily treated as a fixed anchor and
// everything else is vertically compacted around it — this is what makes a widget
// pushed aside by a collision spring back once the overlap goes away, without
// fighting the user's own drag the way a fully continuous compactor would.
function useDragAwareCompactor() {
  const activeIdRef = useRef<string | null>(null);

  const compactor = useMemo<Compactor>(() => ({
    type: "vertical",
    allowOverlap: false,
    compact(layout, cols) {
      const activeId = activeIdRef.current;
      if (!activeId) return cloneLayout(layout);
      const marked = layout.map((item) => (item.i === activeId ? { ...item, static: true } : item));
      const compacted = verticalCompactor.compact(marked, cols);
      return compacted.map((item) => (item.i === activeId ? { ...item, static: false } : item));
    },
  }), []);

  const markActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
  }, []);

  return { compactor, markActive };
}

function WorkspaceGrid({
  workspaceId,
  windows,
  isActive,
  width,
  height,
  maxRows,
  gap,
  focusedWindowId,
  onFocusWindow,
  onDefocus,
}: {
  workspaceId: string;
  windows: WindowEntry[];
  isActive: boolean;
  width: number;
  height: number;
  maxRows: number;
  gap: number;
  focusedWindowId: string | null;
  onFocusWindow: (id: string) => void;
  onDefocus: () => void;
}) {
  const { updateLayout } = useWindowManager();
  // Display-only viewport fit: the saved layout is never rewritten by a window
  // resize — out-of-view widgets are just rendered pulled into view. Only a
  // drag/resize commits what's on screen (see the stop handlers below).
  const layout = useMemo(
    () => fitToViewport(windowsToLayout(windows, maxRows), GRID_COLS, maxRows),
    [windows, maxRows],
  );
  const { compactor, markActive } = useDragAwareCompactor();

  return (
    <div
      style={{ display: isActive ? undefined : "none" }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-is-window]")) onDefocus();
      }}
    >
      <GridLayout
        width={width}
        // Fixed to the full available height (not autoSize's shrink-to-content) —
        // otherwise dragConfig.bounded clamps against the CURRENT (often smaller)
        // content height, which can pin a bottom-most/solo widget at y=0 with no
        // room to drag into, since the container hasn't "grown" to make room yet.
        style={{ height }}
        layout={layout}
        gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: [gap, gap], containerPadding: [0, 0], maxRows }}
        dragConfig={{ enabled: true, handle: ".canvas-window-titlebar", threshold: 5, bounded: true }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        compactor={compactor}
        onDragStart={(_layout, oldItem) => markActive(oldItem?.i ?? null)}
        onDragStop={(next) => {
          markActive(null);
          updateLayout(workspaceId, next);
        }}
        onResizeStart={(_layout, oldItem) => markActive(oldItem?.i ?? null)}
        onResizeStop={(next) => {
          markActive(null);
          updateLayout(workspaceId, next);
        }}
      >
        {windows.map((win) => (
          <div key={win.id}>
            <CanvasWindow
              entry={win}
              isFocused={focusedWindowId === win.id}
              onFocus={() => onFocusWindow(win.id)}
            />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}

export function CanvasShell() {
  const { allWindows, workspaces, activeWorkspaceId, setViewportRows } = useWindowManager();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);
  const { width, height, containerRef, mounted } = useContainerSize();
  const gap = settings.gridGap;
  const maxRows = Math.max(1, Math.floor((height + gap) / (GRID_ROW_HEIGHT + gap)));

  // The `mounted` gate matters: before the first measurement height is 0 and
  // maxRows would be 1, which must never leak into placement decisions.
  useEffect(() => {
    if (mounted) setViewportRows(maxRows);
  }, [mounted, maxRows, setViewportRows]);

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
        <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-3.5">
          {mounted &&
            workspaces.map((ws) => (
              <WorkspaceGrid
                key={ws.id}
                workspaceId={ws.id}
                windows={allWindows.filter((w) => w.workspaceId === ws.id)}
                isActive={ws.id === activeWorkspaceId}
                width={width}
                height={height}
                maxRows={maxRows}
                gap={gap}
                focusedWindowId={focusedWindowId}
                onFocusWindow={setFocusedWindowId}
                onDefocus={() => setFocusedWindowId(null)}
              />
            ))}
        </div>
      </div>

      <CanvasTopBar />
      <CanvasDock />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
