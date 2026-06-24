import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { MODULE_REGISTRY, MODULE_ORDER } from "./module-registry";
import { useWindowManager } from "./window-manager";
import { useSettings } from "@/hooks/use-settings";

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  action: () => void;
  isOpen?: boolean;
}

function useItems(onClose: () => void) {
  const { openWindow, toggleWindow, isOpen } = useWindowManager();
  const { settings } = useSettings();

  const items: PaletteItem[] = [];

  for (const key of MODULE_ORDER) {
    const config = MODULE_REGISTRY[key];
    const Icon = config.icon;

    if (config.multiInstance) {
      items.push({
        id: key,
        label: config.title,
        sublabel: "Open without project",
        icon: Icon,
        action: () => { openWindow(key); onClose(); },
        isOpen: isOpen(key),
      });
      for (const project of settings.claudeProjects) {
        items.push({
          id: `${key}-${project.id}`,
          label: `${config.title} — ${project.name}`,
          sublabel: project.path,
          icon: Icon,
          action: () => { openWindow(key, { projectPath: project.path, projectName: project.name }); onClose(); },
        });
      }
    } else {
      items.push({
        id: key,
        label: config.title,
        icon: Icon,
        action: () => { toggleWindow(key); onClose(); },
        isOpen: isOpen(key),
      });
    }
  }

  return items;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useItems(onClose);

  const filtered = query.trim()
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sublabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedIndex, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
      onPointerDown={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
          <Search className="size-4 shrink-0 text-white/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Open widget…"
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/25"
          />
          <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/25">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/25">No widgets match</p>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              const selected = i === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onPointerMove={() => setSelectedIndex(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selected ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <Icon
                    className={`size-4 shrink-0 ${item.isOpen ? "text-orange-400" : "text-white/40"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${item.isOpen ? "text-orange-300" : "text-white/80"}`}>
                      {item.label}
                    </p>
                    {item.sublabel && (
                      <p className="truncate text-[11px] text-white/30">{item.sublabel}</p>
                    )}
                  </div>
                  {item.isOpen && (
                    <span className="shrink-0 text-[10px] text-orange-400/50">open</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
          <span className="text-[11px] text-white/20">↑↓ navigate</span>
          <span className="text-[11px] text-white/20">↵ open</span>
          <span className="text-[11px] text-white/20">esc close</span>
        </div>
      </div>
    </div>
  );
}
