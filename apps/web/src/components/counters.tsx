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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  TOPBAR_PANEL_ROW,
  TOPBAR_PANEL_ROW_ICON,
  TopbarPanelBody,
  TopbarPanelEmpty,
  TopbarPanelHeader,
} from "@/components/canvas/topbar-panel";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { client } from "@/lib/client";
import { cn } from "@/lib/utils";

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

  const creatingRef = useRef(false);
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
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: countersKey }),
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

  const startAdding = () => {
    setAddingName("");
    setTimeout(() => addInputRef.current?.focus(), 0);
  };

  const handleAddSubmit = () => {
    // Enter submits, then the input's blur submits again before a re-render
    // could show the mutation as pending.
    if (creatingRef.current) return;
    const name = addingName?.trim();
    if (!name) {
      setAddingName(null);
      return;
    }
    creatingRef.current = true;
    createMutation.mutate(
      { client, body: { name } },
      {
        onSettled: () => {
          creatingRef.current = false;
        },
      },
    );
  };

  return (
    <>
      <TopbarPanelHeader
        title="Time since"
        action={
          <button
            type="button"
            title="New counter"
            aria-label="New counter"
            className={cn(TOPBAR_PANEL_ROW_ICON, "opacity-100")}
            onClick={startAdding}
          >
            <Plus />
          </button>
        }
      />

      <TopbarPanelBody>
        {addingName !== null && (
          <div className={cn(TOPBAR_PANEL_ROW, "bg-white/[0.04]")}>
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
              aria-label="Counter name"
              className="min-w-0 flex-1 bg-transparent text-white/85 outline-none placeholder:text-white/30"
            />
          </div>
        )}

        {counters.length === 0 && addingName === null ? (
          <TopbarPanelEmpty>
            No counters yet.{" "}
            <button
              type="button"
              className="text-white/60 underline-offset-2 hover:text-white/85 hover:underline"
              onClick={startAdding}
            >
              Add one
            </button>
          </TopbarPanelEmpty>
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
      </TopbarPanelBody>

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
    </>
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
    <div className={TOPBAR_PANEL_ROW}>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-white/85"
        onClick={onClick}
      >
        {counter.name}
      </button>
      <span className="shrink-0 tabular-nums text-white/45">
        {formatTimeSince(counter.last_reset_at)}
      </span>
      <button
        type="button"
        title="Mark as done"
        aria-label={`Mark ${counter.name} as done`}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-white/25 transition-colors duration-150 hover:bg-white/[0.06] hover:text-emerald-400"
        onClick={onReset}
      >
        <CheckCircle2 className="size-3.5" />
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
            <DialogDescription className="sr-only">
              Counter details
            </DialogDescription>
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

      <ConfirmDeleteDialog
        variant="default"
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete counter?"
        description={`"${counter.name}" and all its history will be deleted.`}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
          onClose();
        }}
      />
    </>
  );
}
