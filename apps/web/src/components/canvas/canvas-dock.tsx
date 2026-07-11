import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { glassSurface } from "@bessel/ui/lib/glass";
import { useQuery } from "@tanstack/react-query";
import { memo, useState } from "react";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";
import { MODULE_ORDER, MODULE_REGISTRY } from "./module-registry";
import { useWindowActions, useWindowState } from "./window-manager";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

function ProjectPicker({
  moduleKey,
  active,
}: {
  moduleKey: "claudeCode" | "codex" | "grok" | "terminal";
  active: boolean;
}) {
  const { openWindow } = useWindowActions();
  const [open, setOpen] = useState(false);

  const { data } = useQuery(listProjectsV1ProjectsGetOptions({ client }));
  const projects = (data ?? []).filter(
    (p): p is ProjectWithPath => p.path != null,
  );

  const launch = (project?: ProjectWithPath) => {
    openWindow(
      moduleKey,
      project
        ? {
            projectPath: project.path,
            projectName: project.name,
            ...(project.ssh_host ? { projectSshHost: project.ssh_host } : {}),
          }
        : undefined,
    );
    setOpen(false);
  };

  const config = MODULE_REGISTRY[moduleKey];
  const Icon = config.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
            active
              ? "text-primary-400"
              : "text-white/50 pointer-fine:hover:bg-white/[0.08] pointer-fine:hover:text-white/70"
          }`}
          title={config.title}
        >
          <Icon className="size-3.5 shrink-0" />
          <span>{config.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className={cn(
          glassSurface({ weight: "heavy" }),
          "w-64 overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
        )}
      >
        <div className="border-b border-white/10 px-3 py-2.5">
          <p className="text-xs font-medium text-white/50">Select project</p>
        </div>

        <button
          onClick={() => launch()}
          className="w-full px-3 py-2.5 text-left text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
        >
          Open without project
        </button>

        {projects.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-white/[0.06]">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => launch(p)}
                className="flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span className="text-sm font-medium text-white/80">
                  {p.name}
                </span>
                <span className="truncate text-11 text-white/50">
                  {p.ssh_host ? `${p.ssh_host}:${p.path}` : p.path}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export const CanvasDock = memo(function CanvasDock() {
  const { toggleWindow, openWindow } = useWindowActions();
  const { isOpen } = useWindowState();

  return (
    <div
      className={cn(
        glassSurface({ weight: "light" }),
        "fixed bottom-0 left-0 right-0 z-50 flex items-center gap-1 border-t border-white/10 px-4 py-1",
      )}
    >
      {MODULE_ORDER.map((key) => {
        const config = MODULE_REGISTRY[key];
        const Icon = config.icon;
        const active = isOpen(key);

        if (key === "claudeCode" || key === "codex" || key === "grok" || key === "terminal") {
          return <ProjectPicker key={key} moduleKey={key} active={active} />;
        }

        return (
          <button
            key={key}
            onClick={() =>
              config.multiInstance ? openWindow(key) : toggleWindow(key)
            }
            className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
              active
                ? "text-primary-400"
                : "text-white/50 pointer-fine:hover:bg-white/[0.08] pointer-fine:hover:text-white/70"
            }`}
            title={config.title}
          >
            <Icon className="size-3.5 shrink-0" />
            <span>{config.title}</span>
          </button>
        );
      })}
    </div>
  );
});
