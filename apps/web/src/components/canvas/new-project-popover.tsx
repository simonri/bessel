import type { ProjectSchema } from "@bessel/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { FolderOpen } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { folderName, useProjectMutations } from "@/hooks/use-project-mutations";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { cn } from "@/lib/utils";

const INPUT =
  "h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-primary-500/50";

function NewProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (project: ProjectSchema) => void;
  onCancel: () => void;
}) {
  const { createProject } = useProjectMutations();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const nameId = useId();
  const pathId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isDesktop) nameRef.current?.focus();
  }, []);

  const chooseFolder = async () => {
    const selected = await window.electron?.selectFolder();
    if (!selected) return;
    setPath(selected);
    if (!name.trim()) setName(folderName(selected));
  };

  const canSave = name.trim() !== "" && path.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave || createProject.isPending) return;
        createProject.mutate(
          {
            client,
            body: { name: name.trim(), path: path.trim(), ssh_host: null },
          },
          {
            onSuccess: onCreated,
            onError: () => toast.error("Couldn't create the project"),
          },
        );
      }}
      className="flex flex-col gap-3 p-3"
    >
      <div>
        <p className="text-sm font-medium text-white/85">New project</p>
        <p className="mt-0.5 text-11 leading-relaxed text-white/45">
          A folder you work in. Claude, terminals and git open there.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pathId} className="text-11 text-white/45">
          Folder
        </label>
        {isDesktop ? (
          <button
            id={pathId}
            type="button"
            onClick={() => void chooseFolder()}
            className={cn(
              INPUT,
              "flex items-center gap-2 text-left",
              !path && "text-white/40",
            )}
          >
            <FolderOpen className="size-3.5 shrink-0 text-white/45" />
            <span className="min-w-0 flex-1 truncate">
              {path || "Choose a folder…"}
            </span>
          </button>
        ) : (
          <input
            id={pathId}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/you/code/project"
            className={INPUT}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-11 text-white/45">
          Name
        </label>
        <input
          id={nameId}
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={path ? folderName(path) : "My project"}
          className={INPUT}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:text-white/85"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave || createProject.isPending}
          className="rounded-lg bg-primary-500 px-3.5 py-1.5 text-xs font-medium text-white transition-[background-color] duration-150 hover:bg-primary-400 disabled:opacity-40"
        >
          Add project
        </button>
      </div>
    </form>
  );
}

/** Adds a project: pick its folder, name it after the folder. */
export function NewProjectPopover({
  open,
  onOpenChange,
  onCreated,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: ProjectSchema) => void;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className={cn(
          "bg-popover",
          "w-72 overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
        )}
      >
        <NewProjectForm
          onCancel={() => onOpenChange(false)}
          onCreated={(project) => {
            onOpenChange(false);
            onCreated(project);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
