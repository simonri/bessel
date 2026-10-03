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
import { projectWindowData, useActiveProject } from "./use-active-project";
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
  const activeProject = useActiveProject();

  const launch = (project?: ProjectWithPath) => {
    openWindow(moduleKey, projectWindowData(project));
    setOpen(false);
  };

  const config = MODULE_REGISTRY[moduleKey];
  const Icon = config.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Inside a project's session the project is already known: a click
          // opens right there, and right-click still offers the full list.
          onClick={(e) => {
            if (!activeProject) return;
            e.preventDefault();
            launch(activeProject);
          }}
          onContextMenu={(e) => {
            if (!activeProject) return;
            e.preventDefault();
            setOpen(true);
          }}
          className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 ${
            active
              ? "text-primary-400"
              : "text-white/50 pointer-fine:hover:bg-white/[0.08] pointer-fine:hover:text-white/70"
          }`}
          title={
            activeProject
              ? `${config.title} in ${activeProject.name} (right-click for another project)`
              : config.title
          }
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
          "bg-popover",
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
        "flex h-10 shrink-0 select-none items-center gap-1 overflow-x-auto border-t border-white/10 px-4",
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
            type="button"
            key={key}
            onClick={() =>
              config.multiInstance ? openWindow(key) : toggleWindow(key)
            }
            className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 ${
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
