import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { listProjectsV1ProjectsGetOptions, type ProjectSchema } from "@metron/client";
import { client } from "@/lib/client";
import { MODULE_REGISTRY, MODULE_ORDER } from "./module-registry";
import { useWindowManager } from "./window-manager";

type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

function ProjectPicker({ moduleKey, active }: { moduleKey: "claudeCode" | "codex" | "terminal"; active: boolean }) {
  const { openWindow } = useWindowManager();
  const [open, setOpen] = useState(false);

  const { data } = useQuery(listProjectsV1ProjectsGetOptions({ client }));
  const projects = (data ?? []).filter((p): p is ProjectWithPath => p.path != null);

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
          className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
            active
              ? "text-primary-400"
              : "text-white/40 hover:bg-white/[0.08] hover:text-white/70"
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
        className="w-64 overflow-hidden rounded-xl border-white/10 bg-black/80 p-0 shadow-2xl backdrop-blur-xl"
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
                <span className="text-sm font-medium text-white/80">{p.name}</span>
                <span className="truncate text-[11px] text-white/35">
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

export function CanvasDock() {
  const { toggleWindow, openWindow, isOpen } = useWindowManager();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-1 border-t border-white/10 bg-black/40 px-4 py-1 backdrop-blur-xl">
      {MODULE_ORDER.map((key) => {
        const config = MODULE_REGISTRY[key];
        const Icon = config.icon;
        const active = isOpen(key);

        if (key === "claudeCode" || key === "codex" || key === "terminal") {
          return <ProjectPicker key={key} moduleKey={key} active={active} />;
        }

        return (
          <button
            key={key}
            onClick={() => config.multiInstance ? openWindow(key) : toggleWindow(key)}
            className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "text-primary-400"
                : "text-white/40 hover:bg-white/[0.08] hover:text-white/70"
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
}
