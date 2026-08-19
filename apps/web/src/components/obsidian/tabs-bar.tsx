import { cn } from "@bessel/ui/lib/utils";
import { X } from "lucide-react";
import { basenameOf } from "./lib/wikilinks";

export interface TabsBarProps {
  tabs: readonly string[];
  activeTab: string | null;
  onSelect: (rel: string) => void;
  onClose: (rel: string) => void;
}

export function TabsBar({ tabs, activeTab, onSelect, onClose }: TabsBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-white/[0.06] px-1.5 pt-1.5">
      {tabs.map((rel) => {
        const active = rel === activeTab;
        return (
          <div
            key={rel}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(rel);
              }
            }}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded-t-md border-x border-t py-1.5 pr-1 pl-2.5 text-12 transition-colors",
              active
                ? "border-white/10 bg-white/[0.06] text-white/85"
                : "border-transparent text-white/45 hover:bg-white/[0.03] hover:text-white/70",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(rel)}
              title={rel}
              className="min-w-0 max-w-40 truncate bg-transparent text-left text-inherit outline-none"
            >
              {basenameOf(rel)}
            </button>
            <button
              type="button"
              onClick={() => onClose(rel)}
              title="Close"
              className="shrink-0 rounded p-0.5 text-white/20 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/70 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
