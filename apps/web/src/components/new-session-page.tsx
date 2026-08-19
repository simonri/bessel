import { glassSurface } from "@bessel/ui/lib/glass";
import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { tileEvenly } from "@/components/canvas/layout-engine";
import { MODULE_REGISTRY } from "@/components/canvas/module-registry";
import {
  type ProjectWithPath,
  useProjectsWithPath,
} from "@/components/canvas/project-picker-menu";
import {
  GRID_COLS,
  type ModuleKey,
  useWindowActions,
  type WindowSpec,
} from "@/components/canvas/window-manager";
import { isDesktop } from "@/lib/environment";
import { cn } from "@/lib/utils";

type AgentModule = Extract<ModuleKey, "claudeCode" | "codex" | "grok">;
const AGENTS: AgentModule[] = ["claudeCode", "codex", "grok"];
const COUNTS = [1, 2, 3, 4] as const;
type Count = (typeof COUNTS)[number];

// Aspect of the little layout preview — roughly a widescreen canvas in grid
// cells, so the tiles look like what will actually open.
const PREVIEW_ROWS = 12;

// Options are real radio inputs (native arrow-key navigation, form semantics)
// visually hidden behind a styled label that reacts through the `peer` state.
const OPTION =
  "flex cursor-pointer select-none rounded-lg border border-white/10 bg-white/[0.03] text-white/65 transition-[background-color,border-color,color,transform] duration-150 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/85 active:scale-[0.98] motion-reduce:active:scale-100 peer-checked:border-primary-500/70 peer-checked:bg-primary-500/15 peer-checked:text-white/95 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60";

function RadioOption({
  name,
  value,
  checked,
  onSelect,
  className,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label htmlFor={id} className={cn(OPTION, className)}>
        {children}
      </label>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-white/60">{label}</span>
        {hint && <span className="text-11 text-white/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ProjectOption({
  name,
  value,
  label,
  sublabel,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-white/70 transition-colors hover:bg-white/5 peer-checked:bg-white/10 peer-checked:text-white/95 peer-focus-visible:bg-white/5 peer-checked:[&>svg]:opacity-100"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          {sublabel && (
            <span className="block truncate text-11 text-white/45">
              {sublabel}
            </span>
          )}
        </span>
        <Check className="size-3.5 shrink-0 text-primary-400 opacity-0 transition-opacity" />
      </label>
    </div>
  );
}

function LayoutPreview({ count, agent }: { count: Count; agent: AgentModule }) {
  const tiles = useMemo(
    () => tileEvenly(count, GRID_COLS, PREVIEW_ROWS),
    [count],
  );
  const Icon = MODULE_REGISTRY[agent].icon;
  return (
    <div
      aria-hidden
      className="relative aspect-2/1 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30"
    >
      {tiles.map((t) => (
        <div
          key={`${t.x},${t.y}`}
          className="absolute flex items-center justify-center rounded-md border border-white/15 bg-white/[0.07] transition-[inset] duration-300 ease-out"
          style={{
            left: `calc(${(t.x / GRID_COLS) * 100}% + 4px)`,
            top: `calc(${(t.y / PREVIEW_ROWS) * 100}% + 4px)`,
            width: `calc(${(t.w / GRID_COLS) * 100}% - 8px)`,
            height: `calc(${(t.h / PREVIEW_ROWS) * 100}% - 8px)`,
          }}
        >
          <Icon className="size-4 text-white/50" />
        </div>
      ))}
    </div>
  );
}

function specsFor(
  agent: AgentModule,
  count: Count,
  project: ProjectWithPath | null,
): WindowSpec[] {
  const data = project
    ? {
        projectPath: project.path,
        projectName: project.name,
        ...(project.ssh_host ? { projectSshHost: project.ssh_host } : {}),
      }
    : undefined;
  // Each window owns its data — they diverge as widgets save per-instance state.
  return Array.from({ length: count }, () => ({
    module: agent,
    data: data && { ...data },
  }));
}

/**
 * Full-page form for starting a session: pick the project (preselected when
 * opened from a project's "+"), which agent, and how many — they open tiled
 * evenly across a fresh canvas.
 */
export function NewSessionPage({
  projectId,
  onCancel,
  onCreated,
}: {
  projectId: string | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const projects = useProjectsWithPath();
  const { createSession } = useWindowActions();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [agent, setAgent] = useState<AgentModule>("claudeCode");
  const [count, setCount] = useState<Count>(1);
  const [name, setName] = useState("");
  const formId = useId();

  const project = projects.find((p) => p.id === selectedProjectId) ?? null;
  const agentTitle = MODULE_REGISTRY[agent].title;
  const defaultName = count > 1 ? `${agentTitle} ×${count}` : agentTitle;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = () => {
    if (!isDesktop) return;
    createSession({
      projectId: project?.id,
      name,
      specs: specsFor(agent, count, project),
    });
    onCreated();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mx-auto flex w-full max-w-lg flex-col gap-6 py-4"
    >
      <header className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex w-fit items-center gap-1 text-xs text-white/45 transition-colors hover:text-white/75"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white/90">
            New session
          </h1>
          <p className="mt-0.5 text-xs text-white/50">
            Opens a fresh canvas with your agents laid out side by side.
          </p>
        </div>
      </header>

      <Field label="Project">
        <fieldset
          className={cn(
            glassSurface({ weight: "light" }),
            "max-h-56 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/10",
          )}
        >
          <legend className="sr-only">Project</legend>
          {projects.map((p) => (
            <ProjectOption
              key={p.id}
              name={`${formId}-project`}
              value={p.id}
              label={p.name}
              sublabel={p.ssh_host ? `${p.ssh_host}:${p.path}` : p.path}
              selected={p.id === selectedProjectId}
              onSelect={() => setSelectedProjectId(p.id)}
            />
          ))}
          <ProjectOption
            name={`${formId}-project`}
            value=""
            label="No project"
            sublabel="Start in the home directory"
            selected={project === null}
            onSelect={() => setSelectedProjectId(null)}
          />
        </fieldset>
      </Field>

      <Field label="Agent">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Agent</legend>
          {AGENTS.map((key) => {
            const { title, icon: Icon } = MODULE_REGISTRY[key];
            return (
              <RadioOption
                key={key}
                name={`${formId}-agent`}
                value={key}
                checked={key === agent}
                onSelect={() => setAgent(key)}
                className="flex-col items-center gap-2 px-3 py-4"
              >
                <Icon className="size-5" />
                <span className="text-xs font-medium">{title}</span>
              </RadioOption>
            );
          })}
        </fieldset>
      </Field>

      <Field label="How many" hint="Tiled evenly across the canvas">
        <div className="flex flex-col gap-3">
          <fieldset className="grid grid-cols-4 gap-2">
            <legend className="sr-only">How many</legend>
            {COUNTS.map((n) => (
              <RadioOption
                key={n}
                name={`${formId}-count`}
                value={String(n)}
                checked={n === count}
                onSelect={() => setCount(n)}
                className="justify-center py-2 font-mono text-sm tabular-nums"
              >
                {n}
              </RadioOption>
            ))}
          </fieldset>
          <LayoutPreview count={count} agent={agent} />
        </div>
      </Field>

      <Field label="Name" hint="Optional">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultName}
          aria-label="Session name"
          className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-primary-500/50"
        />
      </Field>

      {!isDesktop && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200/80">
          Agent sessions run in the desktop app.
        </p>
      )}

      <footer className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:text-white/85"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isDesktop}
          className="rounded-lg bg-primary-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-primary-500/20 transition-[background-color,transform] duration-150 hover:bg-primary-400 active:scale-[0.98] disabled:opacity-40 motion-reduce:active:scale-100"
        >
          Open {count > 1 ? `${count} × ${agentTitle}` : agentTitle}
          {project ? ` in ${project.name}` : ""}
        </button>
      </footer>
    </form>
  );
}
