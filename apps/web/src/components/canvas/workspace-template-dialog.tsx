import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metron/ui/components/dialog";
import { Input } from "@metron/ui/components/input";
import { Label } from "@metron/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";
import { Textarea } from "@metron/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutTemplate,
  PanelsTopLeft,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  newTemplateId,
  newTemplateWidget,
  type TemplateWidget,
  templateToWindowSpecs,
  useWorkspaceTemplates,
  type WorkspaceTemplate,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { client } from "@/lib/client";
import { MODULE_ORDER, MODULE_REGISTRY } from "./module-registry";
import { type ModuleKey, useWindowManager } from "./window-manager";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

const NO_PROJECT = "__none__";

function supportsProject(module: ModuleKey) {
  return module === "terminal" || module === "claudeCode" || module === "codex";
}

function blankTemplate(): WorkspaceTemplate {
  return {
    id: newTemplateId(),
    name: "",
    widgets: [newTemplateWidget("terminal")],
  };
}

function WidgetRow({
  widget,
  projects,
  onChange,
  onRemove,
}: {
  widget: TemplateWidget;
  projects: ProjectWithPath[];
  onChange: (next: TemplateWidget) => void;
  onRemove: () => void;
}) {
  const config = MODULE_REGISTRY[widget.module];
  const Icon = config.icon;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <Select
          value={widget.module}
          onValueChange={(v) => {
            const module = v as ModuleKey;
            onChange({
              ...widget,
              module,
              projectId: undefined,
              projectPath: undefined,
              projectName: undefined,
              projectSshHost: undefined,
              commands: supportsProject(module) ? widget.commands : [],
            });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODULE_ORDER.map((key) => (
              <SelectItem key={key} value={key}>
                {MODULE_REGISTRY[key].title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
          <X className="size-4" />
        </Button>
      </div>

      {supportsProject(widget.module) && (
        <>
          <Select
            value={widget.projectId ?? NO_PROJECT}
            onValueChange={(v) => {
              if (v === NO_PROJECT) {
                onChange({
                  ...widget,
                  projectId: undefined,
                  projectPath: undefined,
                  projectName: undefined,
                  projectSshHost: undefined,
                });
                return;
              }
              const project = projects.find((p) => p.id === v);
              if (!project) return;
              onChange({
                ...widget,
                projectId: project.id,
                projectPath: project.path,
                projectName: project.name,
                projectSshHost: project.ssh_host ?? undefined,
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={widget.commands.join("\n")}
            onChange={(e) =>
              onChange({ ...widget, commands: e.target.value.split("\n") })
            }
            placeholder={
              "Commands to run, one per line (optional)\nnpm install\nnpm run dev"
            }
            rows={2}
            className="resize-none font-mono text-xs"
          />
        </>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: WorkspaceTemplate;
  onSave: (template: WorkspaceTemplate) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(template);
  const { data: projectsData = [] } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );
  const projects = projectsData.filter(
    (p): p is ProjectWithPath => p.path != null,
  );

  const updateWidget = (id: string, next: TemplateWidget) =>
    setDraft((d) => ({
      ...d,
      widgets: d.widgets.map((w) => (w.id === id ? next : w)),
    }));

  const removeWidget = (id: string) =>
    setDraft((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }));

  const addWidget = () =>
    setDraft((d) => ({
      ...d,
      widgets: [...d.widgets, newTemplateWidget("terminal")],
    }));

  const canSave = draft.name.trim().length > 0 && draft.widgets.length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="template-name">Name</Label>
        <Input
          id="template-name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Deep work — 4 terminals"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>Widgets</Label>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {draft.widgets.map((w) => (
            <WidgetRow
              key={w.id}
              widget={w}
              projects={projects}
              onChange={(next) => updateWidget(w.id, next)}
              onRemove={() => removeWidget(w.id)}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addWidget}>
          <Plus className="size-3.5" />
          Add widget
        </Button>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ ...draft, name: draft.name.trim() })}
        >
          Save template
        </Button>
      </DialogFooter>
    </div>
  );
}

function TemplateList({
  onEdit,
  onCreate,
}: {
  onEdit: (template: WorkspaceTemplate) => void;
  onCreate: () => void;
}) {
  const { templates, deleteTemplate } = useWorkspaceTemplates();
  const { applyTemplate } = useWindowManager();

  const apply = (template: WorkspaceTemplate, target: "current" | "new") => {
    applyTemplate(templateToWindowSpecs(template), target);
    toast.success(
      `Applied "${template.name}"${target === "new" ? " to a new workspace" : ""}`,
    );
  };

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center">
          <LayoutTemplate className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No templates yet</p>
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {widgetSummary(t.widgets)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                title="Apply to current workspace"
                onClick={() => apply(t, "current")}
              >
                <PanelsTopLeft className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                title="Apply to a new workspace"
                onClick={() => apply(t, "new")}
              >
                <Rocket className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                title="Edit"
                onClick={() => onEdit(t)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                title="Delete"
                onClick={() => {
                  deleteTemplate(t.id);
                  toast.success(`Deleted "${t.name}"`);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={onCreate}>
        <Plus className="size-4" />
        New template
      </Button>
    </div>
  );
}

export function WorkspaceTemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { upsertTemplate } = useWorkspaceTemplates();
  const [editing, setEditing] = useState<WorkspaceTemplate | null>(null);

  const close = (v: boolean) => {
    if (!v) setEditing(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? editing.name
                ? "Edit template"
                : "New template"
              : "Workspace templates"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Pick the widgets this template opens, and any commands each terminal should run in order."
              : "Apply a saved set of widgets to a new or current workspace."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <TemplateEditor
            template={editing}
            onCancel={() => setEditing(null)}
            onSave={(t) => {
              upsertTemplate(t);
              toast.success(`Saved "${t.name}"`);
              setEditing(null);
            }}
          />
        ) : (
          <TemplateList
            onEdit={setEditing}
            onCreate={() => setEditing(blankTemplate())}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
