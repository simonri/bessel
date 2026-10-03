import { glassSurface } from "@bessel/ui/lib/glass";
import { isDesktop } from "@/lib/environment";
import { cn } from "@/lib/utils";
import { MODULE_REGISTRY } from "./module-registry";
import { projectWindowData, useActiveProject } from "./use-active-project";
import {
  type ModuleKey,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
} from "./window-manager";

const AGENT_ACTIONS: ModuleKey[] = isDesktop
  ? ["claudeCode", "codex", "terminal"]
  : [];
const WIDGET_ACTIONS: ModuleKey[] = isDesktop
  ? ["tasks", "gitStatus"]
  : ["tasks"];

const ACTION =
  "inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-white/75 transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.1] hover:text-white/95 [&_svg]:size-3.5 [&_svg]:shrink-0";

/** What to do in a session with nothing open yet. */
export function CanvasEmptyState() {
  const { windowsByWorkspace } = useWindowState();
  const { activeWorkspaceId } = useWorkspaceMeta();
  const { openWindow, toggleWindow } = useWindowActions();
  const project = useActiveProject();
  if ((windowsByWorkspace.get(activeWorkspaceId)?.length ?? 0) > 0) return null;

  const open = (key: ModuleKey) => {
    if (AGENT_ACTIONS.includes(key))
      openWindow(key, projectWindowData(project));
    else if (MODULE_REGISTRY[key].multiInstance) openWindow(key);
    else toggleWindow(key);
  };

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <section
        aria-label="Empty session"
        className={cn(
          glassSurface({ weight: "medium" }),
          "pointer-events-auto flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-white/10 px-8 py-7 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-300",
        )}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-white/90">
            {project
              ? `Start something in ${project.name}`
              : "This session is empty"}
          </h2>
          <p className="text-xs text-white/50">
            Start an agent here, or add widgets from the dock below.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[...AGENT_ACTIONS, ...WIDGET_ACTIONS].map((key) => {
            const { title, icon: Icon } = MODULE_REGISTRY[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => open(key)}
                className={ACTION}
              >
                <Icon />
                {title}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
