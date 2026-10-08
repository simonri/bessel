import {
  createTaskV1TasksPostMutation,
  type ProjectSchema,
  searchV1SearchGetOptions,
} from "@bessel/client";
import { glassSurface } from "@bessel/ui/lib/glass";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarDays,
  CheckSquare,
  CookingPot,
  FileText,
  Keyboard,
  LayoutTemplate,
  MapPin,
  PanelsTopLeft,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MORE_PAGES,
  PAGE_REGISTRY,
  type PageKey,
  PRIMARY_PAGES,
} from "@/components/pages";
import { useProjects } from "@/hooks/use-projects";
import { useSettings } from "@/hooks/use-settings";
import { TASK_MUTATION_KEY, useTaskCacheHelpers } from "@/hooks/use-task-cache";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { setPageTarget } from "@/lib/page-target";
import { parseQuickTask } from "@/lib/task-quick-parse";
import { cn } from "@/lib/utils";
import { MODULE_ORDER, MODULE_REGISTRY } from "./module-registry";
import {
  HIT_PAGE,
  HIT_SECTIONS,
  type HitKind,
  hitsFromNotes,
  hitsFromSearch,
  loadRecents,
  type PaletteHit,
  rememberRecent,
} from "./palette-search";
import {
  sessionLabel,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
} from "./window-manager";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  action: () => void;
  isOpen?: boolean;
  group: "page" | "other";
}

function useItems(onClose: () => void, onNavigate: (page: PageKey) => void) {
  const { openWindow, toggleWindow, applyTemplate, switchWorkspace } =
    useWindowActions();
  const { isOpen, windowsByWorkspace } = useWindowState();
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const { templates } = useWorkspaceTemplates();
  const { data } = useProjects();

  return useMemo(() => {
    const projects = (data ?? []).filter(
      (p): p is ProjectWithPath => p.path != null,
    );
    const items: PaletteItem[] = [];

    for (const key of [...PRIMARY_PAGES, ...MORE_PAGES]) {
      const page = PAGE_REGISTRY[key];
      items.push({
        id: `page-${key}`,
        label: `Go to ${page.title}`,
        icon: page.icon,
        group: "page",
        action: () => {
          onNavigate(key);
          onClose();
        },
      });
    }

    workspaces.forEach((ws) => {
      if (ws.id === activeWorkspaceId) return;
      const project = ws.projectId
        ? (data ?? []).find((p) => p.id === ws.projectId)
        : undefined;
      const label = sessionLabel(ws, windowsByWorkspace.get(ws.id) ?? []);
      items.push({
        id: `workspace-${ws.id}`,
        label: `Switch to ${project ? `${project.name} / ${label}` : label}`,
        icon: PanelsTopLeft,
        group: "other",
        action: () => {
          switchWorkspace(ws.id);
          onClose();
        },
      });
    });

    for (const template of templates) {
      items.push({
        id: `template-${template.id}`,
        label: `New session from "${template.name}"`,
        sublabel: widgetSummary(template.widgets),
        icon: LayoutTemplate,
        group: "other",
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
          group: "other",
          action: () => {
            openWindow(key);
            onClose();
          },
          isOpen: isOpen(key),
        });
        for (const project of projects) {
          items.push({
            id: `${key}-${project.id}`,
            label: `${config.title} in ${project.name}`,
            sublabel: project.ssh_host
              ? `${project.ssh_host}:${project.path}`
              : project.path,
            icon: Icon,
            group: "other",
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
          group: "other",
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
    workspaces,
    windowsByWorkspace,
    activeWorkspaceId,
    isOpen,
    openWindow,
    toggleWindow,
    applyTemplate,
    switchWorkspace,
    onClose,
    onNavigate,
  ]);
}

const HIT_ICONS: Record<HitKind, React.ElementType> = {
  task: CheckSquare,
  event: CalendarDays,
  recipe: CookingPot,
  place: MapPin,
  note: FileText,
};

const SEARCH_DELAY_MS = 200;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Tasks, events, recipes and places from the API; notes from the local vault. */
function useDataHits(query: string): PaletteHit[] {
  const q = useDebounced(query.trim(), SEARCH_DELAY_MS);
  const { settings } = useSettings();
  const vaultRoot = isDesktop ? settings.obsidianVaultPath : null;
  const { data } = useQuery({
    ...searchV1SearchGetOptions({ client, query: { q, limit: 5 } }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
  const { data: noteLines } = useQuery({
    queryKey: ["palette-notes", vaultRoot, q],
    queryFn: () => window.electron!.vault.search(vaultRoot!, q),
    enabled: !!vaultRoot && q.length >= 2,
    placeholderData: keepPreviousData,
  });
  if (q.length < 2) return [];
  return [...hitsFromSearch(data), ...hitsFromNotes(noteLines ?? [])];
}

type Row =
  | { type: "header"; key: string; title: string }
  | { type: "item"; key: string; item: PaletteItem };

// The gate lives outside the component with the hooks, so a closed palette
// runs nothing at all — no projects query subscription, no item rebuilding.
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onOpenTask,
  onShowShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: PageKey) => void;
  onOpenTask: (taskId: string) => void;
  onShowShortcuts: () => void;
}) {
  if (!open) return null;
  return (
    <CommandPaletteContent
      onClose={onClose}
      onNavigate={onNavigate}
      onOpenTask={onOpenTask}
      onShowShortcuts={onShowShortcuts}
    />
  );
}

function CommandPaletteContent({
  onClose,
  onNavigate,
  onOpenTask,
  onShowShortcuts,
}: {
  onClose: () => void;
  onNavigate: (page: PageKey) => void;
  onOpenTask: (taskId: string) => void;
  onShowShortcuts: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "add-task">("search");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useItems(onClose, onNavigate);
  const hits = useDataHits(mode === "search" ? query : "");
  const [recents] = useState(loadRecents);

  const openHit = useCallback(
    (hit: PaletteHit) => {
      rememberRecent({ type: "hit", hit });
      onClose();
      if (hit.kind === "task") {
        onOpenTask(hit.id);
        return;
      }
      const page = HIT_PAGE[hit.kind];
      setPageTarget({ page, id: hit.id, at: hit.at });
      onNavigate(page);
    },
    [onClose, onNavigate, onOpenTask],
  );

  const hitItem = useCallback(
    (hit: PaletteHit): PaletteItem => ({
      id: `${hit.kind}-${hit.id}`,
      label: hit.label,
      sublabel: hit.sublabel,
      icon: HIT_ICONS[hit.kind],
      group: "other",
      action: () => openHit(hit),
    }),
    [openHit],
  );

  const actions: PaletteItem[] = useMemo(
    () => [
      {
        id: "action-add-task",
        label: "Add task…",
        sublabel:
          "Type it the way you would in Tasks, e.g. “Call the bank fri”",
        icon: Plus,
        group: "other",
        action: () => {
          setMode("add-task");
          setQuery("");
          inputRef.current?.focus();
        },
      },
      {
        id: "action-shortcuts",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        group: "other",
        action: () => {
          onClose();
          onShowShortcuts();
        },
      },
    ],
    [onClose, onShowShortcuts],
  );

  const rows = useMemo((): Row[] => {
    const remembered = (item: PaletteItem): PaletteItem => ({
      ...item,
      action: () => {
        rememberRecent({ type: "command", id: item.id });
        item.action();
      },
    });
    const section = (
      key: string,
      title: string,
      items: PaletteItem[],
    ): Row[] =>
      items.length
        ? [
            { type: "header", key: `h-${key}`, title },
            ...items.map((item) => ({
              type: "item" as const,
              key: `${key}-${item.id}`,
              item,
            })),
          ]
        : [];
    const q = query.trim().toLowerCase();
    const allCommands = [...actions, ...commands];

    if (!q) {
      const recentItems = recents.flatMap((entry) => {
        if (entry.type === "hit") return [hitItem(entry.hit)];
        const command = allCommands.find((c) => c.id === entry.id);
        return command ? [remembered(command)] : [];
      });
      return [
        ...section("recent", "Recent", recentItems),
        ...section("actions", "Actions", actions.map(remembered)),
        ...section(
          "pages",
          "Pages",
          commands.filter((c) => c.group === "page").map(remembered),
        ),
        ...section(
          "more",
          "Workspaces and tools",
          commands.filter((c) => c.group === "other").map(remembered),
        ),
      ];
    }

    const matches = allCommands.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q),
    );
    return [
      ...section("commands", "Go to and do", matches.map(remembered)),
      ...HIT_SECTIONS.flatMap(({ kind, title }) =>
        section(kind, title, hits.filter((h) => h.kind === kind).map(hitItem)),
      ),
    ];
  }, [query, actions, commands, recents, hits, hitItem]);

  const selectable = useMemo(
    () => rows.flatMap((row, index) => (row.type === "item" ? [index] : [])),
    [rows],
  );

  const projectNames = useProjects().data?.map((p) => p.name) ?? [];
  const cache = useTaskCacheHelpers();
  const createTask = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    mutationKey: TASK_MUTATION_KEY,
    onError: () => toast.error("Couldn't add the task"),
    onSettled: () => cache.settle(),
  });
  const addTask = () => {
    const parsed = parseQuickTask(query, projectNames);
    if (!parsed.title) return;
    createTask.mutate(
      {
        client,
        body: {
          title: parsed.title,
          due_date: parsed.dueDate,
          project: parsed.project ?? null,
          priority: parsed.priority,
          status: "todo",
        },
      },
      { onSuccess: (task) => toast.success(`Added “${task.title}”`) },
    );
    onClose();
  };

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // A new query starts from the top; results arriving for it don't move the
  // selection the user may already have made.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  const selectedRow =
    selectable[Math.min(selectedIndex, selectable.length - 1)];

  useEffect(() => {
    if (selectedRow === undefined) return;
    const el = listRef.current?.querySelector(
      `[data-row="${selectedRow}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedRow]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (mode === "add-task") {
        setMode("search");
        setQuery("");
      } else onClose();
      return;
    }
    if (mode === "add-task") {
      if (e.key === "Enter") {
        e.preventDefault();
        addTask();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, selectable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = selectedRow === undefined ? undefined : rows[selectedRow];
      if (row?.type === "item") row.item.action();
    }
  };

  const parsed =
    mode === "add-task" ? parseQuickTask(query, projectNames) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
      onPointerDown={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={cn(
          glassSurface({ weight: "heavy" }),
          "relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 shadow-2xl",
        )}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
          {mode === "add-task" ? (
            <Plus className="size-4 shrink-0 text-primary-300" />
          ) : (
            <Search className="size-4 shrink-0 text-white/30" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={mode === "add-task" ? "New task" : "Search"}
            placeholder={
              mode === "add-task"
                ? "New task, e.g. Call the bank fri #Home !"
                : "Search tasks, events, recipes, places, notes - or jump to a page"
            }
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
          />
          <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-10 text-white/50">
            esc
          </kbd>
        </div>

        {mode === "add-task" ? (
          <div className="px-4 py-3 text-13 text-white/55">
            {parsed?.title ? (
              <>
                Adds <span className="text-white/85">“{parsed.title}”</span>
                {parsed.dueDate
                  ? `, due ${format(parsed.dueDate, "EEE d MMM")}`
                  : ""}
                {parsed.project ? `, in ${parsed.project}` : ""}
                {parsed.priority ? ", marked important" : ""}. Press Enter.
              </>
            ) : (
              "Type the task. A day like “fri”, #project and ! for priority are picked up."
            )}
          </div>
        ) : (
          <div ref={listRef} className="max-h-[22rem] overflow-y-auto py-1.5">
            {selectable.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/50">
                {query.trim().length >= 2
                  ? "Nothing matches"
                  : "Keep typing to search"}
              </p>
            ) : (
              rows.map((row, index) => {
                if (row.type === "header")
                  return (
                    <p
                      key={row.key}
                      className="px-4 pt-2.5 pb-1 text-11 font-medium text-white/40"
                    >
                      {row.title}
                    </p>
                  );
                const { item } = row;
                const Icon = item.icon;
                const selected = index === selectedRow;
                return (
                  <button
                    type="button"
                    key={row.key}
                    data-row={index}
                    onClick={item.action}
                    onPointerMove={() => {
                      const at = selectable.indexOf(index);
                      if (at !== selectedIndex) setSelectedIndex(at);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                      selected && "bg-white/[0.08]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        item.isOpen ? "text-primary-400" : "text-white/40",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          item.isOpen ? "text-primary-300" : "text-white/80",
                        )}
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
                      <span className="shrink-0 text-10 text-primary-400/60">
                        open
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
          {mode === "add-task" ? (
            <>
              <span className="text-11 text-white/50">↵ add</span>
              <span className="text-11 text-white/50">esc back</span>
            </>
          ) : (
            <>
              <span className="text-11 text-white/50">↑↓ move</span>
              <span className="text-11 text-white/50">↵ open</span>
              <span className="text-11 text-white/50">esc close</span>
              <span className="ml-auto text-11 text-white/50">
                ? all shortcuts
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
