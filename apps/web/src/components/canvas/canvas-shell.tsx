import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Compactor,
  cloneLayout,
  GridLayout,
  verticalCompactor,
} from "react-grid-layout";
import { useSettings } from "@/hooks/use-settings";
import { CanvasDock } from "./canvas-dock";
import { setFocusedWindow } from "./canvas-focus";
import { CanvasTopBar } from "./canvas-topbar";
import { CanvasWindow } from "./canvas-window";
import { CommandPalette } from "./command-palette";
import { fitToViewport } from "./layout-engine";
import { MODULE_REGISTRY } from "./module-registry";
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
  type WindowEntry,
} from "./window-manager";
import "./canvas-grid.css";

const NO_WINDOWS: WindowEntry[] = [];

// Forward+reverse baked into one clip — browser loops it natively.
function VideoWallpaper() {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause while the window is hidden/minimized — otherwise the loop decodes
  // full-screen video on the GPU for the app's entire (always-running) life.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
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
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Coalesce to one commit per frame — a live OS-window resize fires the
      // observer continuously, and every commit re-lays-out every grid.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSize((prev) =>
          prev.width === width && prev.height === height
            ? prev
            : { width, height },
        );
        setMounted(true);
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
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

  const compactor = useMemo<Compactor>(
    () => ({
      type: "vertical",
      allowOverlap: false,
      compact(layout, cols) {
        const activeId = activeIdRef.current;
        if (!activeId) return cloneLayout(layout);
        const marked = layout.map((item) =>
          item.i === activeId ? { ...item, static: true } : item,
        );
        const compacted = verticalCompactor.compact(marked, cols);
        return compacted.map((item) =>
          item.i === activeId ? { ...item, static: false } : item,
        );
      },
    }),
    [],
  );

  const markActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
  }, []);

  return { compactor, markActive };
}

// Memoized so interactions in one workspace don't re-render the others: the
// window manager preserves each workspace's `windows` array identity when its
// contents didn't change, and every other prop is stable between commits.
const WorkspaceGrid = memo(function WorkspaceGrid({
  workspaceId,
  windows,
  isActive,
  width,
  height,
  maxRows,
  gap,
}: {
  workspaceId: string;
  windows: WindowEntry[];
  isActive: boolean;
  width: number;
  height: number;
  maxRows: number;
  gap: number;
}) {
  const { updateLayout } = useWindowActions();
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
        if (!(e.target as HTMLElement).closest("[data-is-window]"))
          setFocusedWindow(null);
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
        gridConfig={{
          cols: GRID_COLS,
          rowHeight: GRID_ROW_HEIGHT,
          margin: [gap, gap],
          containerPadding: [0, 0],
          maxRows,
        }}
        dragConfig={{
          enabled: true,
          handle: ".canvas-window-titlebar",
          threshold: 5,
          bounded: true,
        }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        compactor={compactor}
        onDragStart={(_layout, oldItem) => {
          markActive(oldItem?.i ?? null);
          document.body.classList.add("select-none");
        }}
        onDragStop={(next) => {
          markActive(null);
          document.body.classList.remove("select-none");
          updateLayout(workspaceId, next);
        }}
        onResizeStart={(_layout, oldItem) => {
          markActive(oldItem?.i ?? null);
          document.body.classList.add("select-none");
        }}
        onResizeStop={(next) => {
          markActive(null);
          document.body.classList.remove("select-none");
          updateLayout(workspaceId, next);
        }}
      >
        {windows.map((win) => (
          <div key={win.id}>
            <CanvasWindow entry={win} />
          </div>
        ))}
      </GridLayout>
    </div>
  );
});

export function CanvasShell() {
  const { windowsByWorkspace } = useWindowState();
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const { setViewportRows } = useWindowActions();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const { width, height, containerRef, mounted } = useContainerSize();
  const gap = settings.gridGap;
  const maxRows = Math.max(
    1,
    Math.floor((height + gap) / (GRID_ROW_HEIGHT + gap)),
  );

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
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Safety net for the select-none toggled in onDragStart/onResizeStart below:
  // if a drag ends in a way react-grid-layout's onStop doesn't observe (mouse
  // released outside the window, an error mid-callback), this guarantees text
  // selection isn't left permanently disabled app-wide.
  useEffect(() => {
    const clear = () => document.body.classList.remove("select-none");
    window.addEventListener("pointerup", clear);
    return () => window.removeEventListener("pointerup", clear);
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
      {settings.wallpaper === "image" && (
        <div className="absolute inset-0 bg-black/30" />
      )}

      <div className="relative flex h-full flex-col pt-12 pb-10">
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-hidden px-3.5"
        >
          {mounted &&
            workspaces.map((ws) => (
              <WorkspaceGrid
                key={ws.id}
                workspaceId={ws.id}
                windows={windowsByWorkspace.get(ws.id) ?? NO_WINDOWS}
                isActive={ws.id === activeWorkspaceId}
                width={width}
                height={height}
                maxRows={maxRows}
                gap={gap}
              />
            ))}
        </div>
      </div>

      <CanvasTopBar />
      <CanvasDock />

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
