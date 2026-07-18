import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { glassSurface } from "@bessel/ui/lib/glass";
import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { MODULE_ORDER, MODULE_REGISTRY } from "./module-registry";
import {
  ProjectPickerMenu,
  type ProjectWithPath,
  useProjectsWithPath,
} from "./project-picker-menu";
import { useWindowActions, useWindowState } from "./window-manager";

function ProjectPicker({
  moduleKey,
  active,
}: {
  moduleKey: "claudeCode" | "codex" | "grok" | "terminal";
  active: boolean;
}) {
  const { openWindow } = useWindowActions();
  const [open, setOpen] = useState(false);
  const projects = useProjectsWithPath();

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
          className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
            active
              ? "text-primary-400"
              : "text-white/50 pointer-fine:hover:bg-white/[0.08] pointer-fine:hover:text-white/70"
          }`}
          title={config.title}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="hidden lg:inline">{config.title}</span>
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
        <ProjectPickerMenu projects={projects} onSelect={launch} />
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
        "fixed bottom-0 left-0 right-0 z-50 flex items-center gap-1 overflow-x-auto border-t border-white/10 px-4 py-1",
      )}
    >
      {MODULE_ORDER.map((key) => {
        const config = MODULE_REGISTRY[key];
        const Icon = config.icon;
        const active = isOpen(key);

        if (
          key === "claudeCode" ||
          key === "codex" ||
          key === "grok" ||
          key === "terminal"
        ) {
          return <ProjectPicker key={key} moduleKey={key} active={active} />;
        }

        return (
          <button
            key={key}
            onClick={() =>
              config.multiInstance ? openWindow(key) : toggleWindow(key)
            }
            className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-95 motion-reduce:active:scale-100 ${
              active
                ? "text-primary-400"
                : "text-white/50 pointer-fine:hover:bg-white/[0.08] pointer-fine:hover:text-white/70"
            }`}
            title={config.title}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden lg:inline">{config.title}</span>
          </button>
        );
      })}
    </div>
  );
});
