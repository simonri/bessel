import { Spinner } from "@bessel/ui/components/spinner";
import { SquarePlus } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AgentUsageReporter } from "@/components/agent-usage-reporter";
import { AppSidebar } from "@/components/app-sidebar";
import { CanvasPage } from "@/components/canvas/canvas-page";
import { CanvasTopBar } from "@/components/canvas/canvas-topbar";
import { CommandPalette } from "@/components/canvas/command-palette";
import { ClaudeSessionsBridge } from "@/components/claude-sessions/claude-sessions-bridge";
import { ShowCanvasContext } from "@/components/claude-sessions/show-canvas-context";
import { NewSessionPage } from "@/components/new-session-page";
import { OpenPageContext } from "@/components/open-page-context";
import { isPageKey, PAGE_REGISTRY, type PageKey } from "@/components/pages";
import { WINDOW_FRAME, WindowTitleBar } from "@/components/window-chrome";
import {
  isWallpaperColor,
  useSettings,
  WALLPAPER_COLORS,
} from "@/hooks/use-settings";
import { isDesktop } from "@/lib/environment";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";

function Wallpaper() {
  const { settings } = useSettings();
  return (
    <>
      {isWallpaperColor(settings.wallpaper) ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: WALLPAPER_COLORS[settings.wallpaper] }}
        />
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
  const stored = userStorage.getItem(ACTIVE_PAGE_KEY);
  return isPageKey(stored) ? stored : "today";
}

// Framed exactly like a canvas widget (title bar included) so a module reads
// the same whether it's docked or opened as a full page.
function PageFrame({
  icon,
  title,
  noPadding,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full p-2">
      <div className={WINDOW_FRAME}>
        <WindowTitleBar icon={icon} title={title} />
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            !noPadding && "overflow-y-auto p-4",
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
  const { component: Component, icon, title, noPadding } = PAGE_REGISTRY[page];
  if (!Component) return null;
  return (
    <PageFrame icon={icon} title={title} noPadding={noPadding}>
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
  const showCanvas = useCallback(() => selectPage("canvas"), [selectPage]);

  useEffect(() => {
    userStorage.setItem(ACTIVE_PAGE_KEY, activePage);
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
    <OpenPageContext.Provider value={selectPage}>
      <ShowCanvasContext.Provider value={showCanvas}>
        <div className="fixed inset-0">
          <Wallpaper />
          {isDesktop && <ClaudeSessionsBridge />}
          {isDesktop && <AgentUsageReporter />}

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
                      activePage === "canvas" && !newSession
                        ? undefined
                        : "none",
                  }}
                >
                  <CanvasPage />
                </div>
                {newSession ? (
                  <PageFrame icon={SquarePlus} title="New session">
                    <NewSessionPage
                      key={newSession.projectId ?? ""}
                      projectId={newSession.projectId}
                      onCancel={closeNewSession}
                      onCreated={showCanvas}
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
      </ShowCanvasContext.Provider>
    </OpenPageContext.Provider>
  );
}
