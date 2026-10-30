import type { CounterResetSchema, CounterSchema } from "@bessel/client";
import {
  createCounterMutation,
  createResetMutation,
  deleteCounterMutation,
  listCountersOptions,
  listCountersQueryKey,
  listResetsOptions,
  listResetsQueryKey,
  undoResetMutation,
  updateCounterMutation,
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

const EARLIER_DAYS = [
  { days: 1, label: "Yesterday" },
  { days: 2, label: "2 days ago" },
  { days: 3, label: "3 days ago" },
  { days: 4, label: "4 days ago" },
  { days: 7, label: "A week ago" },
];

/** `days` before now, at the same time of day. */
export function daysAgo(days: number, now = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

/** A picked yyyy-mm-dd day at the current time of day, never later than now. */
export function onPickedDay(value: string, now = new Date()): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(now);
  date.setFullYear(year, month - 1, day);
  return date > now ? now : date;
}

function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  const countersKey = listCountersQueryKey({ client });

  const { data: counters = [] } = useQuery(listCountersOptions({ client }));

  const selected = counters.find((c) => c.id === selectedId) ?? null;

  const creatingRef = useRef(false);
  const createMutation = useMutation({
    ...createCounterMutation({ client }),
    onSuccess: (counter) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      setAddingName(null);
      setSelectedId(counter.id);
    },
    onError: () => toast.error("Failed to create counter"),
  });

  const updateMutation = useMutation({
    ...updateCounterMutation({ client }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: countersKey }),
    onError: () => toast.error("Failed to rename counter"),
  });

  const deleteMutation = useMutation({
    ...deleteCounterMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      setSelectedId(null);
    },
    onError: () => toast.error("Failed to delete counter"),
  });

  const resetMutation = useMutation({
    ...createResetMutation({ client }),
    onSuccess: (reset, variables) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      void queryClient.invalidateQueries({
        queryKey: listResetsQueryKey({
          client,
          path: { counter_id: variables.path.counter_id },
        }),
      });
      toast.success(variables.body?.occurred_at ? "Added" : "Done!", {
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
    ...undoResetMutation({ client }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: countersKey });
      void queryClient.invalidateQueries({
        queryKey: listResetsQueryKey({
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
          onDoneEarlier={(occurredAt) =>
            resetMutation.mutate({
              client,
              path: { counter_id: selected.id },
              body: { occurred_at: occurredAt },
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
  onDoneEarlier,
  onUndo,
}: {
  counter: CounterSchema;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDoneEarlier: (occurredAt: Date) => void;
  onUndo: (resetId: string) => void;
}) {
  const [name, setName] = useState(counter.name);
  const [pickedDay, setPickedDay] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: resets = [] } = useQuery(
    listResetsOptions({
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
          <div className="flex gap-4 border-b border-white/10 pb-4 text-12 text-white/50">
            <span>
              <span className="text-white/60">Last: </span>
              {counter.last_reset_at
                ? `${formatTimeSince(counter.last_reset_at)} ago`
                : "Never"}
            </span>
            <span>
              <span className="text-white/60">Total: </span>
              {counter.reset_count}
            </span>
          </div>

          {/* Done on an earlier day */}
          <div className="space-y-2 border-b border-white/10 pb-4">
            <p className="text-12 text-white/60">Done earlier</p>
            <div className="flex flex-wrap gap-1.5">
              {EARLIER_DAYS.map(({ days, label }) => (
                <button
                  key={days}
                  type="button"
                  className="rounded-md bg-white/[0.06] px-2 py-1 text-12 text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white/90"
                  onClick={() => onDoneEarlier(daysAgo(days))}
                >
                  {label}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const occurredAt = onPickedDay(pickedDay);
                if (!occurredAt) return;
                onDoneEarlier(occurredAt);
                setPickedDay("");
              }}
            >
              <input
                type="date"
                aria-label="Day it was done"
                value={pickedDay}
                max={toDateInputValue(new Date())}
                onChange={(e) => setPickedDay(e.target.value)}
                className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-12 text-white/80 outline-none [color-scheme:dark]"
              />
              <button
                type="submit"
                disabled={!pickedDay}
                className="h-7 rounded-md bg-white/[0.06] px-2 text-12 text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white/90 disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </div>

          {/* Reset history */}
          <div className="max-h-56 overflow-y-auto">
            {resets.length === 0 ? (
              <p className="py-4 text-center text-12 text-white/50">
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
                    <span className="flex-1 text-12 text-white/55">
                      {formatDateTime(reset.occurred_at)}
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
              className="flex items-center gap-1.5 text-12 text-white/50 transition-colors hover:text-red-400"
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
