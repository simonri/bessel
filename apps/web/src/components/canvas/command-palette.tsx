import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@metron/client";
import { glassSurface } from "@metron/ui/lib/glass";
import { useQuery } from "@tanstack/react-query";
import { LayoutTemplate, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import { MODULE_ORDER, MODULE_REGISTRY } from "./module-registry";
import { useWindowActions, useWindowState } from "./window-manager";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  action: () => void;
  isOpen?: boolean;
}

function useItems(onClose: () => void) {
  const { openWindow, toggleWindow, applyTemplate } = useWindowActions();
  const { isOpen } = useWindowState();
  const { templates } = useWorkspaceTemplates();
  const { data } = useQuery(listProjectsV1ProjectsGetOptions({ client }));

  return useMemo(() => {
    const projects = (data ?? []).filter(
      (p): p is ProjectWithPath => p.path != null,
    );
    const items: PaletteItem[] = [];

    for (const template of templates) {
      items.push({
        id: `template-${template.id}`,
        label: `New workspace from "${template.name}"`,
        sublabel: widgetSummary(template.widgets),
        icon: LayoutTemplate,
        action: () => {
          applyTemplate(templateToWindowSpecs(template), "new");
          onClose();
        },
      });
    }

    for (const key of MODULE_ORDER) {
      const config = MODULE_REGISTRY[key];
      const Icon = config.icon;

      if (config.multiInstance) {
        items.push({
          id: key,
          label: config.title,
          sublabel: "Open without project",
          icon: Icon,
          action: () => {
            openWindow(key);
            onClose();
          },
          isOpen: isOpen(key),
        });
        for (const project of projects) {
          items.push({
            id: `${key}-${project.id}`,
            label: `${config.title} — ${project.name}`,
            sublabel: project.ssh_host
              ? `${project.ssh_host}:${project.path}`
              : project.path,
            icon: Icon,
            action: () => {
              openWindow(key, {
                projectPath: project.path,
                projectName: project.name,
                ...(project.ssh_host
                  ? { projectSshHost: project.ssh_host }
                  : {}),
              });
              onClose();
            },
          });
        }
      } else {
        items.push({
          id: key,
          label: config.title,
          icon: Icon,
          action: () => {
            toggleWindow(key);
            onClose();
          },
          isOpen: isOpen(key),
        });
      }
    }

    return items;
  }, [
    data,
    templates,
    isOpen,
    openWindow,
    toggleWindow,
    applyTemplate,
    onClose,
  ]);
}

// The gate lives outside the component with the hooks, so a closed palette
// runs nothing at all — no projects query subscription, no item rebuilding.
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <CommandPaletteContent onClose={onClose} />;
}

function CommandPaletteContent({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useItems(onClose);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as
      | HTMLElement
      | undefined;
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
      onPointerDown={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={cn(
          glassSurface({ weight: "heavy" }),
          "relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-2xl",
        )}
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
          <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-10 text-white/50">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">
              No widgets match
            </p>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              const selected = i === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onPointerMove={() => {
                    if (i !== selectedIndex) setSelectedIndex(i);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selected ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <Icon
                    className={`size-4 shrink-0 ${item.isOpen ? "text-primary-400" : "text-white/40"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${item.isOpen ? "text-primary-300" : "text-white/80"}`}
                    >
                      {item.label}
                    </p>
                    {item.sublabel && (
                      <p className="truncate text-11 text-white/50">
                        {item.sublabel}
                      </p>
                    )}
                  </div>
                  {item.isOpen && (
                    <span className="shrink-0 text-10 text-primary-400/50">
                      open
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
          <span className="text-11 text-white/50">↑↓ navigate</span>
          <span className="text-11 text-white/50">↵ open</span>
          <span className="text-11 text-white/50">esc close</span>
        </div>
      </div>
    </div>
  );
}
