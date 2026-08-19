import { Spinner } from "@bessel/ui/components/spinner";
import { glassSurface } from "@bessel/ui/lib/glass";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CanvasPage } from "@/components/canvas/canvas-page";
import { CanvasTopBar } from "@/components/canvas/canvas-topbar";
import { CommandPalette } from "@/components/canvas/command-palette";
import { NewSessionPage } from "@/components/new-session-page";
import { isPageKey, PAGE_REGISTRY, type PageKey } from "@/components/pages";
import {
  isWallpaperColor,
  useSettings,
  WALLPAPER_COLORS,
} from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

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

const ACTIVE_PAGE_KEY = "bessel:activePage";

function loadActivePage(): PageKey {
  try {
    const stored = localStorage.getItem(ACTIVE_PAGE_KEY);
    if (isPageKey(stored)) return stored;
  } catch {}
  return "canvas";
}

// One glass panel filling the page area, styled like a widget body so content
// reads the same whether it's docked or a full page.
function PageFrame({
  noPadding,
  children,
}: {
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full p-2 animate-in fade-in duration-200 ease-out">
      <div
        className={cn(
          glassSurface({ weight: "medium" }),
          "flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            !noPadding && "overflow-y-auto p-5",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// A non-canvas page. Mounted only while active — these are plain data views
// (TanStack Query caches what they fetch), so remounting is cheap and
// unmounting frees the map/list DOM the canvas would otherwise keep around
// forever.
function ContentPage({ page }: { page: PageKey }) {
  const { component: Component, noPadding } = PAGE_REGISTRY[page];
  if (!Component) return null;
  return (
    <PageFrame noPadding={noPadding}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5 text-white/60" />
          </div>
        }
      >
        <Component />
      </Suspense>
    </PageFrame>
  );
}

// The always-visible chrome: wallpaper, top bar, left sidebar, and the page
// area they frame. The canvas is hidden/shown rather than unmounted — it hosts
// live processes (terminals, agent sessions) that must outlive any navigation,
// so it is mounted for the app's whole life; other pages mount on demand.
export function AppShell() {
  const [activePage, setActivePage] = useState<PageKey>(loadActivePage);
  // The "New session" form is transient shell state rather than a page: it
  // sits over whatever page is active, isn't persisted, and any navigation
  // dismisses it.
  const [newSession, setNewSession] = useState<{
    projectId: string | null;
  } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeNewSession = useCallback(() => setNewSession(null), []);
  const selectPage = useCallback((page: PageKey) => {
    setNewSession(null);
    setActivePage(page);
  }, []);
  const openNewSession = useCallback(
    (projectId: string | null) => setNewSession({ projectId }),
    [],
  );
  const onSessionCreated = useCallback(
    () => selectPage("canvas"),
    [selectPage],
  );

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PAGE_KEY, activePage);
    } catch {}
  }, [activePage]);

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
          <AppSidebar
            activePage={newSession ? null : activePage}
            onSelectPage={selectPage}
            onNewSession={openNewSession}
          />
          <main className="relative min-w-0 flex-1">
            <div
              className="h-full"
              style={{
                display:
                  activePage === "canvas" && !newSession ? undefined : "none",
              }}
            >
              <CanvasPage />
            </div>
            {newSession ? (
              <PageFrame>
                <NewSessionPage
                  key={newSession.projectId ?? ""}
                  projectId={newSession.projectId}
                  onCancel={closeNewSession}
                  onCreated={onSessionCreated}
                />
              </PageFrame>
            ) : (
              activePage !== "canvas" && (
                <ContentPage key={activePage} page={activePage} />
              )
            )}
          </main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        onNavigate={selectPage}
      />
    </div>
  );
}
