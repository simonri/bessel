import {
  listProjectsV1ProjectsGetOptions,
  type ProjectSchema,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";

export type ProjectWithPath = Omit<ProjectSchema, "path"> & { path: string };

export function useProjectsWithPath(): ProjectWithPath[] {
  const { data } = useQuery(listProjectsV1ProjectsGetOptions({ client }));
  return (data ?? []).filter((p): p is ProjectWithPath => p.path != null);
}

/** Popover/dropdown content listing projects — the caller supplies the
 *  positioned container (PopoverContent, ...) and reacts to the selection. */
export function ProjectPickerMenu({
  projects,
  onSelect,
  noProjectLabel = "Open without project",
}: {
  projects: ProjectWithPath[];
  onSelect: (project?: ProjectWithPath) => void;
  noProjectLabel?: string;
}) {
  return (
    <>
      <div className="border-b border-white/10 px-3 py-2.5">
        <p className="text-xs font-medium text-white/50">Select project</p>
      </div>

      <button
        type="button"
        onClick={() => onSelect()}
        className="w-full px-3 py-2.5 text-left text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        {noProjectLabel}
      </button>

      {projects.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-white/[0.06]">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
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
    </>
  );
}
