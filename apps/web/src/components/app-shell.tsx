import { useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CanvasPage } from "@/components/canvas/canvas-page";
import { CanvasTopBar } from "@/components/canvas/canvas-topbar";
import { CommandPalette } from "@/components/canvas/command-palette";
import type { PageKey } from "@/components/pages";
import {
  isWallpaperColor,
  useSettings,
  WALLPAPER_COLORS,
} from "@/hooks/use-settings";

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

function Wallpaper() {
  const { settings } = useSettings();
  return (
    <>
      {isWallpaperColor(settings.wallpaper) ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: WALLPAPER_COLORS[settings.wallpaper] }}
        />
      ) : settings.wallpaper === "video" ? (
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
    </>
  );
}

// The always-visible chrome: wallpaper, top bar, left sidebar, and the page
// area they frame. Pages are hidden/shown rather than unmounted — the canvas
// hosts live processes (terminals, agent sessions) that must outlive any
// navigation, so it is mounted for the app's whole life.
export function AppShell() {
  const [activePage, setActivePage] = useState<PageKey>("canvas");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

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

  return (
    <div className="fixed inset-0">
      <Wallpaper />

      <div className="relative flex h-full flex-col">
        <CanvasTopBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar activePage={activePage} onSelectPage={setActivePage} />
          <main className="relative min-w-0 flex-1">
            <div
              className="h-full"
              style={{ display: activePage === "canvas" ? undefined : "none" }}
            >
              <CanvasPage />
            </div>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
