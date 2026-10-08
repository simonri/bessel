import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isModuleKey,
  MODULE_REGISTRY,
} from "@/components/canvas/module-registry";
import type { ModuleKey, WindowSpec } from "@/components/canvas/window-manager";
import { userStorage } from "@/lib/user-storage";
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
const LEGACY_KEY = "metron:workspace-templates";

function sanitizeTemplates(value: unknown): WorkspaceTemplate[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((template) => !!template && typeof template === "object")
    .map((template) => ({
      ...template,
      widgets: Array.isArray(template?.widgets)
        ? template.widgets.filter(
            (widget: unknown): widget is TemplateWidget =>
              !!widget &&
              typeof widget === "object" &&
              isModuleKey((widget as { module?: unknown }).module),
          )
        : [],
    }));
}

function newId() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function loadTemplates(): WorkspaceTemplate[] {
  try {
    const raw = userStorage.getItem(STORAGE_KEY);
    if (raw) {
      const templates = sanitizeTemplates(JSON.parse(raw));
      if (templates) return templates;
    }
  } catch {}

  // Falls back to the pre-rebrand key name — see window-manager.tsx's
  // identical LEGACY_KEY handling for the same "metron:" -> "bessel:" rename.
  try {
    const legacyRaw = userStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const templates = sanitizeTemplates(JSON.parse(legacyRaw));
      if (templates) return templates;
    }
  } catch {}

  return [];
}

export function widgetSummary(widgets: TemplateWidget[]): string {
  const counts = new Map<ModuleKey, number>();
  for (const w of widgets)
    counts.set(w.module, (counts.get(w.module) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([module, count]) => `${count} ${MODULE_REGISTRY[module].title}`)
    .join(" - ");
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

  const loadedRef = useRef(templates);
  useEffect(() => {
    if (templates === loadedRef.current) return;
    userStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  // Functional updates keep the callbacks stable, so a template mutation only
  // re-renders consumers via the templates array — not by churning callback
  // identity everywhere the context is read.
  const upsertTemplate = useCallback((template: WorkspaceTemplate) => {
    setTemplates((prev) =>
      prev.some((t) => t.id === template.id)
        ? prev.map((t) => (t.id === template.id ? template : t))
        : [...prev, template],
    );
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
