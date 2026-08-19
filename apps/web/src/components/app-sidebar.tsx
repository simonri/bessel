import { glassSurface } from "@bessel/ui/lib/glass";
import { memo } from "react";
import { WorkspaceTabs } from "@/components/canvas/workspace-tabs";
import { PAGE_ORDER, PAGE_REGISTRY, type PageKey } from "@/components/pages";
import { cn } from "@/lib/utils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1.5 text-10 font-semibold tracking-widest text-white/35">
      {children}
    </div>
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
          {PAGE_ORDER.map((key) => {
            const { title, icon: Icon } = PAGE_REGISTRY[key];
            const isActive = key === activePage;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPage(key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
                  isActive
                    ? "bg-white/12 text-white/90"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/75",
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    isActive ? "text-white/70" : "text-white/35",
                  )}
                />
                <span className="truncate">{title}</span>
              </button>
            );
          })}
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
