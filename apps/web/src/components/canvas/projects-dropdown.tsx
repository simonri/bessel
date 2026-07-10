import {
  createProjectV1ProjectsPostMutation,
  deleteProjectV1ProjectsProjectIdDeleteMutation,
  listProjectsV1ProjectsGetOptions,
  listProjectsV1ProjectsGetQueryKey,
  type ProjectSchema,
  updateProjectV1ProjectsProjectIdPatchMutation,
} from "@metron/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metron/ui/components/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { client } from "@/lib/client";

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "/";
  return p.slice(0, idx);
}

function joinDir(base: string, name: string): string {
  return base === "/" ? `/${name}` : `${base}/${name}`;
}

function SshFolderPicker({
  host,
  initialPath,
  onSelect,
  onCancel,
}: {
  host: string;
  initialPath: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const [cwd, setCwd] = useState<string | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        if (!window.electron)
          throw new Error("Desktop app required for SSH browsing.");
        const res = await window.electron.sshListDir(host, target);
        setCwd(res.cwd);
        setDirs(res.dirs);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setError(
          /permission denied|publickey|batch mode|host key|resolve|connect|timed out|refused/i.test(
            raw,
          )
            ? "Couldn't connect over SSH — the host must allow key-based (non-interactive) auth."
            : raw,
        );
      } finally {
        setLoading(false);
      }
    },
    [host],
  );

  useEffect(() => {
    load(initialPath);
  }, [load, initialPath]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black/90 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="truncate text-xs font-medium text-white/70">
          {host}
        </span>
        <button
          onClick={onCancel}
          className="shrink-0 text-white/30 transition-colors hover:text-white/70"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="truncate border-b border-white/5 px-3 py-1.5 text-11 text-white/50">
        {cwd ?? (initialPath || "~")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="px-3 py-4 text-center text-xs text-white/50">
            Loading…
          </div>
        )}
        {error && !loading && (
          <div className="space-y-2 px-3 py-4">
            <p className="text-xs leading-relaxed text-red-400/80">{error}</p>
            <button
              onClick={() => load("~")}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-11 text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              Go to home directory
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col">
            {cwd && cwd !== "/" && (
              <button
                onClick={() => cwd && load(parentDir(cwd))}
                className="px-3 py-1.5 text-left text-xs text-white/50 transition-colors hover:bg-white/5"
              >
                ../
              </button>
            )}
            {dirs.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-white/50">
                No subfolders
              </div>
            )}
            {dirs.map((d) => (
              <button
                key={d}
                onClick={() => cwd && load(joinDir(cwd, d))}
                className="truncate px-3 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/5"
              >
                {d}/
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1.5 border-t border-white/10 px-3 py-2">
        <button
          onClick={onCancel}
          className="rounded px-2.5 py-1 text-xs text-white/50 transition-colors hover:text-white/70"
        >
          Cancel
        </button>
        <button
          onClick={() => cwd && onSelect(cwd)}
          disabled={!cwd}
          className="rounded bg-primary-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
        >
          Select this folder
        </button>
      </div>
    </div>
  );
}

export function ProjectsDropdown() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editSshHost, setEditSshHost] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addSshHost, setAddSshHost] = useState("");
  const [sshBrowse, setSshBrowse] = useState<{
    host: string;
    initialPath: string;
    apply: (path: string) => void;
  } | null>(null);

  const { data: projects = [] } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: listProjectsV1ProjectsGetQueryKey({ client }),
    });

  const createMutation = useMutation({
    ...createProjectV1ProjectsPostMutation(),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    ...updateProjectV1ProjectsProjectIdPatchMutation(),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    ...deleteProjectV1ProjectsProjectIdDeleteMutation(),
    onSuccess: invalidate,
  });

  const reset = () => {
    setEditingId(null);
    setShowAdd(false);
    setAddName("");
    setAddPath("");
    setAddSshHost("");
    setSshBrowse(null);
  };

  const browsePath = (
    sshHost: string,
    currentPath: string,
    apply: (path: string, name: string) => void,
  ) => {
    const host = sshHost.trim();
    if (host) {
      setSshBrowse({
        host,
        initialPath: currentPath.trim(),
        apply: (p) => apply(p, basename(p)),
      });
    } else {
      browse((path, name) => apply(path, name), "");
    }
  };

  const startEdit = (p: ProjectSchema) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPath(p.path ?? "");
    setEditSshHost(p.ssh_host ?? "");
    setShowAdd(false);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim() || !editPath.trim()) return;
    updateMutation.mutate(
      {
        client,
        path: { project_id: editingId },
        body: {
          name: editName.trim(),
          path: editPath.trim(),
          ssh_host: editSshHost.trim() || null,
        },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const deleteProject = (id: string) => {
    deleteMutation.mutate({ client, path: { project_id: id } });
    if (editingId === id) setEditingId(null);
  };

  const saveAdd = () => {
    if (!addName.trim() || !addPath.trim()) return;
    createMutation.mutate(
      {
        client,
        body: {
          name: addName.trim(),
          path: addPath.trim(),
          ssh_host: addSshHost.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setAddName("");
          setAddPath("");
          setAddSshHost("");
          setShowAdd(false);
        },
      },
    );
  };

  const browse = async (
    onSelect: (path: string, name: string) => void,
    currentName: string,
  ) => {
    const selected = await window.electron?.selectFolder();
    if (!selected) return;
    const folderName = selected.split("/").pop() ?? selected;
    onSelect(selected, currentName || folderName);
  };

  return (
    <Popover onOpenChange={(open) => !open && reset()}>
      <PopoverTrigger asChild>
        <button
          title="Projects"
          className="flex items-center justify-center rounded p-1 text-white/40 transition-colors hover:text-white/70"
        >
          <FolderOpen className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="relative w-72 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="border-b border-white/10 px-4 py-2.5">
          <span className="text-sm font-medium text-white/80">Projects</span>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {projects.length === 0 && (
            <div className="py-6 text-center text-xs text-white/50">
              No projects yet
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className="border-b border-white/[0.06] last:border-0"
            >
              {editingId === p.id ? (
                <div className="space-y-2 p-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    autoFocus
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
                  />
                  <input
                    type="text"
                    value={editSshHost}
                    onChange={(e) => setEditSshHost(e.target.value)}
                    placeholder="SSH Host (optional, e.g. user@host)"
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editPath}
                      onChange={(e) => setEditPath(e.target.value)}
                      placeholder="Path"
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
                    />
                    <button
                      onClick={() =>
                        browsePath(editSshHost, editPath, (path, name) => {
                          setEditPath(path);
                          if (!editName) setEditName(name);
                        })
                      }
                      className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                    >
                      Browse
                    </button>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded px-2.5 py-1 text-xs text-white/50 transition-colors hover:text-white/70"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={!editName.trim() || !editPath.trim()}
                      className="rounded bg-primary-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white/80">
                      {p.name}
                    </p>
                    <p className="truncate text-11 text-white/50">
                      {p.ssh_host ? `${p.ssh_host}:${p.path}` : p.path}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(p)}
                    className="shrink-0 text-white/25 transition-colors hover:text-white/70"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="shrink-0 text-white/25 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-white/10">
          {showAdd ? (
            <div className="space-y-2 p-3">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Name"
                autoFocus
                className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
              />
              <input
                type="text"
                value={addSshHost}
                onChange={(e) => setAddSshHost(e.target.value)}
                placeholder="SSH Host (optional, e.g. user@host)"
                className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={addPath}
                  onChange={(e) => setAddPath(e.target.value)}
                  placeholder="Path"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 outline-none placeholder:text-white/20 focus:border-primary-500/40"
                />
                <button
                  onClick={() =>
                    browsePath(addSshHost, addPath, (path, name) => {
                      setAddPath(path);
                      if (!addName) setAddName(name);
                    })
                  }
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  Browse
                </button>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setAddName("");
                    setAddPath("");
                  }}
                  className="rounded px-2.5 py-1 text-xs text-white/50 transition-colors hover:text-white/70"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAdd}
                  disabled={!addName.trim() || !addPath.trim()}
                  className="rounded bg-primary-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-primary-400 transition-colors hover:bg-white/[0.04] hover:text-primary-300"
            >
              <Plus className="size-3.5" />
              Add project
            </button>
          )}
        </div>

        {sshBrowse && (
          <SshFolderPicker
            host={sshBrowse.host}
            initialPath={sshBrowse.initialPath}
            onCancel={() => setSshBrowse(null)}
            onSelect={(p) => {
              sshBrowse.apply(p);
              setSshBrowse(null);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
