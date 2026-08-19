import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import { glassSurface } from "@bessel/ui/lib/glass";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { memo } from "react";
import { WorkspaceTabs } from "@/components/canvas/workspace-tabs";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1.5 text-10 font-semibold tracking-widest text-white/35">
      {children}
    </div>
  );
}

function PageIcon({
  page,
  isActive,
}: {
  page: PageKey;
  isActive: boolean;
}) {
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
  activePage: PageKey;
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
}: {
  activePage: PageKey;
  onSelectPage: (page: PageKey) => void;
}) {
  return (
    <aside
      className={cn(
        glassSurface({ weight: "light" }),
        "flex w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/10 px-2 py-3",
      )}
    >
      <nav aria-label="Pages">
        <SectionLabel>PAGES</SectionLabel>
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
          <MorePagesMenu activePage={activePage} onSelectPage={onSelectPage} />
        </div>
      </nav>

      {activePage === "canvas" && (
        <nav aria-label="Workspaces">
          <SectionLabel>WORKSPACES</SectionLabel>
          <WorkspaceTabs />
        </nav>
      )}
    </aside>
  );
});
