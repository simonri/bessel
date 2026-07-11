import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { MODULE_REGISTRY } from "@/components/canvas/module-registry";
import type { ModuleKey, WindowSpec } from "@/components/canvas/window-manager";
import { encodeCommands } from "@/lib/widget-commands";

export interface TemplateWidget {
  id: string;
  module: ModuleKey;
  projectId?: string;
  projectPath?: string;
  projectName?: string;
  projectSshHost?: string;
  commands: string[];
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  widgets: TemplateWidget[];
}

const STORAGE_KEY = "bessel:workspace-templates";

function newId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function loadTemplates(): WorkspaceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function widgetSummary(widgets: TemplateWidget[]): string {
  const counts = new Map<ModuleKey, number>();
  for (const w of widgets)
    counts.set(w.module, (counts.get(w.module) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([module, count]) => `${count} ${MODULE_REGISTRY[module].title}`)
    .join(" · ");
}

export function templateToWindowSpecs(
  template: WorkspaceTemplate,
): WindowSpec[] {
  return template.widgets.map((w) => {
    const data: Record<string, string> = {};
    if (w.projectPath) data.projectPath = w.projectPath;
    if (w.projectName) data.projectName = w.projectName;
    if (w.projectSshHost) data.projectSshHost = w.projectSshHost;
    const commands = encodeCommands(w.commands);
    if (commands) data.commands = commands;
    return {
      module: w.module,
      data: Object.keys(data).length > 0 ? data : undefined,
    };
  });
}

interface WorkspaceTemplatesContextValue {
  templates: WorkspaceTemplate[];
  upsertTemplate: (template: WorkspaceTemplate) => void;
  deleteTemplate: (id: string) => void;
}

const WorkspaceTemplatesContext =
  createContext<WorkspaceTemplatesContextValue | null>(null);

export function WorkspaceTemplatesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [templates, setTemplates] =
    useState<WorkspaceTemplate[]>(loadTemplates);

  // Functional updates keep the callbacks stable, so a template mutation only
  // re-renders consumers via the templates array — not by churning callback
  // identity everywhere the context is read.
  const persist = useCallback(
    (updater: (prev: WorkspaceTemplate[]) => WorkspaceTemplate[]) => {
      setTemplates((prev) => {
        const next = updater(prev);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const upsertTemplate = useCallback(
    (template: WorkspaceTemplate) => {
      persist((prev) =>
        prev.some((t) => t.id === template.id)
          ? prev.map((t) => (t.id === template.id ? template : t))
          : [...prev, template],
      );
    },
    [persist],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      persist((prev) => prev.filter((t) => t.id !== id));
    },
    [persist],
  );

  const value = useMemo(
    () => ({ templates, upsertTemplate, deleteTemplate }),
    [templates, upsertTemplate, deleteTemplate],
  );

  return (
    <WorkspaceTemplatesContext.Provider value={value}>
      {children}
    </WorkspaceTemplatesContext.Provider>
  );
}

export function useWorkspaceTemplates() {
  const ctx = useContext(WorkspaceTemplatesContext);
  if (!ctx)
    throw new Error(
      "useWorkspaceTemplates must be used within WorkspaceTemplatesProvider",
    );
  return ctx;
}

export function newTemplateWidget(module: ModuleKey): TemplateWidget {
  return { id: newId(), module, commands: [] };
}

export function newTemplateId() {
  return newId();
}
