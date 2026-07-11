import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import type { CounterResetSchema, CounterSchema } from "@bessel/client";
import {
  createCounterV1CountersPostMutation,
  createResetV1CountersCounterIdResetsPostMutation,
  deleteCounterV1CountersCounterIdDeleteMutation,
  listCountersV1CountersGetOptions,
  listCountersV1CountersGetQueryKey,
  listResetsV1CountersCounterIdResetsGetOptions,
  listResetsV1CountersCounterIdResetsGetQueryKey,
  undoResetV1CountersCounterIdResetsResetIdDeleteMutation,
  updateCounterV1CountersCounterIdPatchMutation,
} from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { toast } from "sonner";
import { client } from "@/lib/client";

function formatTimeSince(date: Date | null | undefined): string {
  if (!date) return "Never";
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Counters() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingName, setAddingName] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const countersKey = listCountersV1CountersGetQueryKey({ client });

  const { data: counters = [] } = useQuery(
    listCountersV1CountersGetOptions({ client }),
  );

  const selected = counters.find((c) => c.id === selectedId) ?? null;

  const createMutation = useMutation({
    ...createCounterV1CountersPostMutation({ client }),
    onSuccess: (counter) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      setAddingName(null);
      setSelectedId(counter.id);
    },
    onError: () => toast.error("Failed to create counter"),
  });

  const updateMutation = useMutation({
    ...updateCounterV1CountersCounterIdPatchMutation({ client }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: countersKey }),
    onError: () => toast.error("Failed to rename counter"),
  });

  const deleteMutation = useMutation({
    ...deleteCounterV1CountersCounterIdDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete counter"),
  });

  const resetMutation = useMutation({
    ...createResetV1CountersCounterIdResetsPostMutation({ client }),
    onSuccess: (reset, variables) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      void queryClient.invalidateQueries({
        queryKey: listResetsV1CountersCounterIdResetsGetQueryKey({
          client,
          path: { counter_id: variables.path.counter_id },
        }),
      });
      toast.success("Done!", {
        action: {
          label: "Undo",
          onClick: () =>
            undoMutation.mutate({
              client,
              path: {
                counter_id: variables.path.counter_id,
                reset_id: reset.id,
              },
            }),
        },
      });
    },
    onError: () => toast.error("Failed to record reset"),
  });

  const undoMutation = useMutation({
    ...undoResetV1CountersCounterIdResetsResetIdDeleteMutation({ client }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      void queryClient.invalidateQueries({
        queryKey: listResetsV1CountersCounterIdResetsGetQueryKey({
          client,
          path: { counter_id: variables.path.counter_id },
        }),
      });
      toast.success("Reset undone");
    },
    onError: () => toast.error("Failed to undo reset"),
  });

  const handleAddSubmit = () => {
    const name = addingName?.trim();
    if (!name) {
      setAddingName(null);
      return;
    }
    createMutation.mutate({ client, body: { name } });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-11 font-medium uppercase tracking-wider text-white/50">
          Time since
        </span>
        <button
          type="button"
          title="New counter"
          className="text-white/35 transition-colors hover:text-white/70"
          onClick={() => {
            setAddingName("");
            setTimeout(() => addInputRef.current?.focus(), 0);
          }}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {/* Inline add row */}
        {addingName !== null && (
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
            <input
              ref={addInputRef}
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSubmit();
                if (e.key === "Escape") setAddingName(null);
              }}
              onBlur={handleAddSubmit}
              placeholder="Counter name…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white/80 outline-none placeholder:text-white/25"
            />
            <button
              type="button"
              className="shrink-0 text-white/25 transition-colors hover:text-white/60"
              onMouseDown={(e) => {
                e.preventDefault();
                setAddingName(null);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {counters.length === 0 && addingName === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <Timer className="size-8 text-white/10" />
            <p className="text-xs text-white/50">No counters yet</p>
            <button
              type="button"
              className="mt-1 text-xs text-white/50 underline-offset-2 hover:text-white/60 hover:underline"
              onClick={() => {
                setAddingName("");
                setTimeout(() => addInputRef.current?.focus(), 0);
              }}
            >
              Add one
            </button>
          </div>
        ) : (
          counters.map((counter) => (
            <CounterRow
              key={counter.id}
              counter={counter}
              onClick={() => setSelectedId(counter.id)}
              onReset={() =>
                resetMutation.mutate({
                  client,
                  path: { counter_id: counter.id },
                })
              }
            />
          ))
        )}
      </div>

      {/* Detail dialog */}
      {selected && (
        <CounterDetailDialog
          counter={selected}
          onClose={() => setSelectedId(null)}
          onRename={(name) =>
            updateMutation.mutate({
              client,
              path: { counter_id: selected.id },
              body: { name },
            })
          }
          onDelete={() =>
            deleteMutation.mutate({
              client,
              path: { counter_id: selected.id },
            })
          }
          onUndo={(resetId) =>
            undoMutation.mutate({
              client,
              path: { counter_id: selected.id, reset_id: resetId },
            })
          }
        />
      )}
    </div>
  );
}

function CounterRow({
  counter,
  onClick,
  onReset,
}: {
  counter: CounterSchema;
  onClick: () => void;
  onReset: () => void;
}) {
  return (
    <div className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onClick}
      >
        <span className="block truncate text-sm text-white/80">
          {counter.name}
        </span>
      </button>
      <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">
        {formatTimeSince(counter.last_reset_at)}
      </span>
      <button
        type="button"
        title="Mark as done"
        className="shrink-0 text-white/20 transition-colors hover:text-emerald-400"
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
      >
        <CheckCircle2 className="size-4" />
      </button>
    </div>
  );
}

function CounterDetailDialog({
  counter,
  onClose,
  onRename,
  onDelete,
  onUndo,
}: {
  counter: CounterSchema;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUndo: (resetId: string) => void;
}) {
  const [name, setName] = useState(counter.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: resets = [] } = useQuery(
    listResetsV1CountersCounterIdResetsGetOptions({
      client,
      path: { counter_id: counter.id },
    }),
  );

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== counter.name) {
      onRename(trimmed);
    } else {
      setName(counter.name);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setName(counter.name);
                    e.currentTarget.blur();
                  }
                }}
                className="w-full bg-transparent outline-none"
              />
            </DialogTitle>
            <DialogDescription className="sr-only">Counter details</DialogDescription>
          </DialogHeader>

          {/* Stats */}
          <div className="flex gap-4 border-b border-white/10 pb-4 text-xs text-white/50">
            <span>
              <span className="text-white/60">Last: </span>
              {counter.last_reset_at
                ? formatTimeSince(counter.last_reset_at) + " ago"
                : "Never"}
            </span>
            <span>
              <span className="text-white/60">Total: </span>
              {counter.reset_count}
            </span>
          </div>

          {/* Reset history */}
          <div className="max-h-56 overflow-y-auto">
            {resets.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/50">
                No resets recorded yet
              </p>
            ) : (
              <div className="space-y-0.5">
                {resets.map((reset: CounterResetSchema) => (
                  <div
                    key={reset.id}
                    className="group flex items-center gap-2 rounded px-1 py-1.5"
                  >
                    <Clock className="size-3 shrink-0 text-white/20" />
                    <span className="flex-1 text-xs text-white/55">
                      {formatDateTime(reset.created_at)}
                    </span>
                    <button
                      type="button"
                      title="Undo this reset"
                      className="shrink-0 text-white/15 opacity-0 transition-[opacity,color] hover:text-amber-400 group-hover:opacity-100"
                      onClick={() => onUndo(reset.id)}
                    >
                      <RotateCcw className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-red-400"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3" />
              Delete counter
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete counter?</AlertDialogTitle>
            <AlertDialogDescription>
              "{counter.name}" and all its history will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                onDelete();
                onClose();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
