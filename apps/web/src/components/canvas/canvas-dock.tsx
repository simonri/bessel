import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { type ClaudeProject, useSettings } from "@/hooks/use-settings";
import { MODULE_REGISTRY, MODULE_ORDER } from "./module-registry";
import { useWindowManager } from "./window-manager";

function ProjectPicker({ moduleKey, active }: { moduleKey: "claudeCode" | "terminal"; active: boolean }) {
  const { openWindow } = useWindowManager();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  const launch = (project?: ClaudeProject) => {
    openWindow(
      moduleKey,
      project ? { projectPath: project.path, projectName: project.name } : undefined,
    );
    setOpen(false);
  };

  const config = MODULE_REGISTRY[moduleKey];
  const Icon = config.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-150 ${
            active
              ? "bg-orange-500/20 text-orange-300"
              : "text-white/50 hover:bg-white/10 hover:text-white/80"
          }`}
          title={config.title}
        >
          <Icon className="size-4 shrink-0" />
          <span className="text-[10px] leading-none tracking-wide">{config.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
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

        {settings.claudeProjects.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-white/[0.06]">
            {settings.claudeProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => launch(p)}
                className="flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span className="text-sm font-medium text-white/80">{p.name}</span>
                <span className="truncate text-[11px] text-white/35">{p.path}</span>
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
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-black/50 px-2 py-2 shadow-2xl backdrop-blur-xl">
        {MODULE_ORDER.map((key) => {
          const config = MODULE_REGISTRY[key];
          const Icon = config.icon;
          const active = isOpen(key);

          if (key === "claudeCode" || key === "terminal") {
            return <ProjectPicker key={key} moduleKey={key} active={active} />;
          }

          return (
            <button
              key={key}
              onClick={() => config.multiInstance ? openWindow(key) : toggleWindow(key)}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-150 ${
                active
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-white/50 hover:bg-white/10 hover:text-white/80"
              }`}
              title={config.title}
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-[10px] leading-none tracking-wide">{config.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
