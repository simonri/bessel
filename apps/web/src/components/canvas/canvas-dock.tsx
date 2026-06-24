import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@metron/ui/components/popover";
import { type ClaudeProject, useSettings } from "@/hooks/use-settings";
import { MODULE_REGISTRY, MODULE_ORDER } from "./module-registry";
import { useWindowManager } from "./window-manager";

function AddProjectModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (project: ClaudeProject) => void;
}) {
  const { settings, update } = useSettings();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");

  const browse = async () => {
    const selected = await window.electron?.selectFolder();
    if (!selected) return;
    setPath(selected);
    if (!name) setName(selected.split("/").pop() ?? selected);
  };

  const save = () => {
    const trimmedName = name.trim();
    const trimmedPath = path.trim();
    if (!trimmedName || !trimmedPath) return;
    const project: ClaudeProject = { id: crypto.randomUUID(), name: trimmedName, path: trimmedPath };
    update({ claudeProjects: [...settings.claudeProjects, project] });
    onAdd(project);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-xl outline-none">
          <DialogPrimitive.Title className="px-5 pt-5 text-base font-semibold text-white/90">
            Add project
          </DialogPrimitive.Title>
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/home/user/projects/myapp"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/20 focus:border-orange-500/40"
                />
                <button
                  onClick={browse}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  Browse
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3.5">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-white/40 transition-colors hover:text-white/70"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || !path.trim()}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-400 disabled:cursor-default disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ClaudeProjectPicker({ active }: { active: boolean }) {
  const { openWindow } = useWindowManager();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const launch = (project?: ClaudeProject) => {
    openWindow(
      "claudeCode",
      project ? { projectPath: project.path, projectName: project.name } : undefined,
    );
    setOpen(false);
  };

  const config = MODULE_REGISTRY["claudeCode"];
  const Icon = config.icon;

  return (
    <>
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

          <div className="border-t border-white/10 px-3 py-2">
            <button
              onClick={() => {
                setOpen(false);
                setShowModal(true);
              }}
              className="flex w-full items-center gap-2 text-sm text-orange-400 transition-colors hover:text-orange-300"
            >
              <Plus className="size-3.5" />
              Add project
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {showModal && (
        <AddProjectModal
          onClose={() => setShowModal(false)}
          onAdd={(project) => {
            setShowModal(false);
            launch(project);
          }}
        />
      )}
    </>
  );
}

export function CanvasDock() {
  const { toggleWindow, isOpen } = useWindowManager();

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-black/50 px-2 py-2 shadow-2xl backdrop-blur-xl">
        {MODULE_ORDER.map((key) => {
          const config = MODULE_REGISTRY[key];
          const Icon = config.icon;
          const active = isOpen(key);

          if (key === "claudeCode") {
            return <ClaudeProjectPicker key={key} active={active} />;
          }

          return (
            <button
              key={key}
              onClick={() => toggleWindow(key)}
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
