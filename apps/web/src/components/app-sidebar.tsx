import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { glassSurface } from "@bessel/ui/lib/glass";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ProjectSessions } from "@/components/canvas/project-sessions";
import {
  MORE_PAGES,
  PAGE_REGISTRY,
  type PageKey,
  PRIMARY_PAGES,
} from "@/components/pages";
import { cn } from "@/lib/utils";

const NAV_ITEM =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100";
const NAV_ACTIVE = "bg-white/12 text-white/90";
const NAV_IDLE = "text-white/55 hover:bg-white/[0.06] hover:text-white/75";

const SIDEBAR_WIDTH_KEY = "bessel:sidebarWidth";
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 420;
const DEFAULT_SIDEBAR_WIDTH = 208; // matches the old fixed w-52
const PERSIST_DEBOUNCE_MS = 300;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored))
      return clamp(stored, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  } catch {}
  return DEFAULT_SIDEBAR_WIDTH;
}

// Drag surface pinned over the aside's right border. Pointer capture (rather
// than window-level move/up listeners) keeps the drag attached to this
// element even if the cursor leaves the window mid-drag — important in the
// Electron shell, where a release outside the frame would otherwise never
// fire and leave the resize "stuck".
function SidebarResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [active, setActive] = useState(false);

  return (
    // biome-ignore lint/a11y/useSemanticElements: needs to be a focusable drag target (pointer capture, keydown resize) — <hr> can't do that
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startWidth: width,
        };
        setActive(true);
        document.body.classList.add("select-none");
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        onResize(
          clamp(
            drag.startWidth + (e.clientX - drag.startX),
            MIN_SIDEBAR_WIDTH,
            MAX_SIDEBAR_WIDTH,
          ),
        );
      }}
      onPointerUp={(e) => {
        if (dragRef.current?.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setActive(false);
        document.body.classList.remove("select-none");
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft")
          onResize(clamp(width - 16, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
        else if (e.key === "ArrowRight")
          onResize(clamp(width + 16, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
      }}
      className="group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150",
          "group-hover:bg-primary-500/50",
          active && "bg-primary-500",
        )}
      />
    </div>
  );
}

function PageIcon({ page, isActive }: { page: PageKey; isActive: boolean }) {
  const Icon = PAGE_REGISTRY[page].icon;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        isActive ? "text-white/70" : "text-white/35",
      )}
    />
  );
}

// Secondary pages behind one item. While one of them is open the item takes
// on that page's icon and title, so the sidebar always shows where you are.
function MorePagesMenu({
  activePage,
  onSelectPage,
}: {
  activePage: PageKey | null;
  onSelectPage: (page: PageKey) => void;
}) {
  const current = MORE_PAGES.find((key) => key === activePage);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-current={current ? "page" : undefined}
          className={cn(NAV_ITEM, current ? NAV_ACTIVE : NAV_IDLE)}
        >
          {current ? (
            <PageIcon page={current} isActive />
          ) : (
            <MoreHorizontal className="size-3.5 shrink-0 text-white/35" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {current ? PAGE_REGISTRY[current].title : "More"}
          </span>
          <ChevronRight className="size-3 shrink-0 text-white/30" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className={cn(
          glassSurface({ weight: "heavy" }),
          "min-w-40 border-white/10 text-white/80 shadow-2xl",
        )}
      >
        {MORE_PAGES.map((key) => {
          const { title, icon: Icon } = PAGE_REGISTRY[key];
          const isActive = key === activePage;
          return (
            <DropdownMenuItem
              key={key}
              onSelect={() => onSelectPage(key)}
              className={cn(
                "focus:bg-white/10 focus:text-white/90",
                isActive ? "text-white/90" : "text-white/70",
              )}
            >
              <Icon
                className={cn(
                  "size-3.5",
                  isActive ? "text-white/80" : "text-white/40",
                )}
              />
              {title}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const AppSidebar = memo(function AppSidebar({
  activePage,
  onSelectPage,
  onNewSession,
}: {
  /** Null while a transient view (the New session form) covers the page area. */
  activePage: PageKey | null;
  onSelectPage: (page: PageKey) => void;
  /** Opens the "New session" page, preselecting `projectId` when given. */
  onNewSession: (projectId: string | null) => void;
}) {
  const [width, setWidth] = useState(loadSidebarWidth);
  const openCanvas = useCallback(() => onSelectPage("canvas"), [onSelectPage]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
      } catch {}
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [width]);

  return (
    // Not itself scrollable — overflow-y-auto on this element would force
    // overflow-x non-visible too and clip the resize handle poking out past
    // the right edge, so the scrolling nav content lives in an inner div.
    <aside style={{ width }} className="relative flex shrink-0">
      <div
        className={cn(
          glassSurface({ weight: "light" }),
          "flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto border-r border-white/10 px-2 py-3",
        )}
      >
        <nav aria-label="Pages">
          <div className="flex flex-col gap-0.5">
            {PRIMARY_PAGES.map((key) => {
              const isActive = key === activePage;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectPage(key)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(NAV_ITEM, isActive ? NAV_ACTIVE : NAV_IDLE)}
                >
                  <PageIcon page={key} isActive={isActive} />
                  <span className="truncate">{PAGE_REGISTRY[key].title}</span>
                </button>
              );
            })}
            <MorePagesMenu
              activePage={activePage}
              onSelectPage={onSelectPage}
            />
          </div>
        </nav>

        <nav aria-label="Projects" className="border-t border-white/10 pt-4">
          <ProjectSessions
            isOnCanvasPage={activePage === "canvas"}
            onOpenCanvas={openCanvas}
            onNewSession={onNewSession}
          />
        </nav>
      </div>
      <SidebarResizeHandle width={width} onResize={setWidth} />
    </aside>
  );
});
