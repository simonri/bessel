import { useEffect, useMemo, useRef, useState } from "react";
import { GridLayout, useContainerWidth, type Layout as RglLayout } from "react-grid-layout";
import { useWindowManager, GRID_COLS, GRID_ROW_HEIGHT, type WindowEntry } from "./window-manager";
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

function windowsToLayout(windows: WindowEntry[]): RglLayout {
  return windows.map((win) => {
    const { minSize } = MODULE_REGISTRY[win.module];
    return { i: win.id, x: win.x, y: win.y, w: win.w, h: win.h, minW: minSize.w, minH: minSize.h };
  });
}

function WorkspaceGrid({
  workspaceId,
  windows,
  isActive,
  width,
  gap,
  focusedWindowId,
  onFocusWindow,
  onDefocus,
}: {
  workspaceId: string;
  windows: WindowEntry[];
  isActive: boolean;
  width: number;
  gap: number;
  focusedWindowId: string | null;
  onFocusWindow: (id: string) => void;
  onDefocus: () => void;
}) {
  const { updateLayout } = useWindowManager();
  const layout = useMemo(() => windowsToLayout(windows), [windows]);

  return (
    <div
      style={{ display: isActive ? undefined : "none" }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-is-window]")) onDefocus();
      }}
    >
      <GridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: [gap, gap], containerPadding: null }}
        dragConfig={{ enabled: true, handle: ".canvas-window-titlebar", threshold: 5 }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        onLayoutChange={(next) => updateLayout(workspaceId, next)}
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
  const { allWindows, workspaces, activeWorkspaceId } = useWindowManager();
  const { settings } = useSettings();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null);
  const { width, containerRef, mounted } = useContainerWidth();

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
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5">
          <div ref={containerRef}>
            {mounted &&
              workspaces.map((ws) => (
                <WorkspaceGrid
                  key={ws.id}
                  workspaceId={ws.id}
                  windows={allWindows.filter((w) => w.workspaceId === ws.id)}
                  isActive={ws.id === activeWorkspaceId}
                  width={width}
                  gap={settings.gridGap}
                  focusedWindowId={focusedWindowId}
                  onFocusWindow={setFocusedWindowId}
                  onDefocus={() => setFocusedWindowId(null)}
                />
              ))}
          </div>
        </div>
      </div>

      <CanvasTopBar />
      <CanvasDock />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
