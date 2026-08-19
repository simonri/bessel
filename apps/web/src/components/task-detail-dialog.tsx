import type { TaskSchema } from "@bessel/client";
import {
  completeTaskV1TasksTaskIdCompletePostMutation,
  deleteTaskAttachmentV1TasksTaskIdAttachmentsAttachmentIdDeleteMutation,
  deleteTaskV1TasksTaskIdDeleteMutation,
  getTaskV1TasksTaskIdGetOptions,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  updateTaskV1TasksTaskIdPatchMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Copy,
  Flag,
  Folder,
  Layers,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { TaskFormDialog } from "@/components/create-task-dialog";
import {
  DescriptionWithAttachments,
  removeMarker,
} from "@/components/task-attachments";
import { useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import {
  buildTaskPrompt,
  copyText,
  formatDueDate,
  formatRecurrence,
  getDueDateColor,
  isDoneStatus,
  PRIORITY_CONFIG,
  STATUS_CONFIG,
} from "@/lib/task-format";

export function TaskDetailDialog({
  task,
  onComplete,
  onReopen,
  onDelete,
  onEdit,
  onStatusChange,
  onPriorityChange,
  onDeleteAttachment,
  deletingAttachmentId,
  completePending,
  reopenPending,
}: {
  task: TaskSchema;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: number) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  deletingAttachmentId: string | null;
  completePending: boolean;
  reopenPending: boolean;
}) {
  const status = task.status ?? "todo";
  const priority = task.priority ?? 0;
  const isDone = isDoneStatus(status);
  const recurrence = formatRecurrence(task);

  return (
    <DialogContent className="max-w-md gap-0 p-0">
      <DialogHeader className="px-5 pt-5 pb-0">
        <DialogTitle
          className="text-base leading-snug pr-6 break-words"
          onCopy={(e) => {
            e.preventDefault();
            const text =
              window
                .getSelection()
                ?.toString()
                .replace(/[\n\r]+$/, "") ?? "";
            e.clipboardData.setData("text/plain", text);
          }}
        >
          {task.title}
        </DialogTitle>
        <DialogDescription className="sr-only">Task details</DialogDescription>
      </DialogHeader>

      <div className="px-5 py-4 space-y-5">
        {/* Properties grid */}
        <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-sm items-center">
          {/* Status */}
          <span className="text-muted-foreground text-xs">Status</span>
          <div className="flex gap-1">
            {(["todo", "in_progress"] as const).map((s) => {
              const sc = STATUS_CONFIG[s];
              const Icon = sc.icon;
              return (
                <Button
                  key={s}
                  type="button"
                  variant="ghost"
                  size="xs"
                  className={`h-auto rounded-md border px-2 py-1 font-medium ${
                    status === s
                      ? "border-foreground/20 bg-accent hover:bg-accent"
                      : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                  onClick={() => onStatusChange(s)}
                >
                  <Icon className={`size-3 ${sc.color}`} />
                  {sc.label}
                </Button>
              );
            })}
          </div>

          {/* Priority */}
          <span className="text-muted-foreground text-xs">Priority</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((p) => {
              const pc = PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG[0];
              return (
                <Button
                  key={p}
                  type="button"
                  variant="ghost"
                  size="xs"
                  className={`h-auto rounded-md border px-2 py-1 ${
                    priority === p
                      ? "border-foreground/20 bg-accent font-medium hover:bg-accent"
                      : "border-transparent font-normal text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                  onClick={() => onPriorityChange(p)}
                >
                  {p === 0 ? (
                    "–"
                  ) : (
                    <span className="flex items-center gap-1">
                      <Flag className={`size-3 ${pc.color}`} />
                      {pc.label}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Due date */}
          {task.due_date && (
            <>
              <span className="text-muted-foreground text-xs">Due</span>
              <div
                className={`flex items-center gap-1.5 text-sm ${getDueDateColor(task.due_date)}`}
              >
                <Calendar className="size-3.5" />
                {formatDueDate(task.due_date)}
              </div>
            </>
          )}

          {/* Recurrence */}
          {task.is_recurring && recurrence && (
            <>
              <span className="text-muted-foreground text-xs">Recurrence</span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Repeat className="size-3.5" />
                {recurrence}
              </div>
            </>
          )}

          {/* Project */}
          {task.project && (
            <>
              <span className="text-muted-foreground text-xs">Project</span>
              <div className="flex items-center gap-1.5 text-sm">
                <Folder className="size-3.5 text-muted-foreground" />
                {task.project}
              </div>
            </>
          )}

          {/* Area */}
          {task.area && (
            <>
              <span className="text-muted-foreground text-xs">Area</span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Layers className="size-3.5" />
                {task.area}
              </div>
            </>
          )}
        </div>

        {/* Description — pasted images render as inline thumbnails at the
            exact spot they were pasted, not collected in a separate list. */}
        {(task.description || (task.attachments?.length ?? 0) > 0) && (
          <div className="border-t pt-3">
            <DescriptionWithAttachments
              description={task.description ?? ""}
              attachments={task.attachments ?? []}
              onDeleteAttachment={onDeleteAttachment}
              deletingAttachmentId={deletingAttachmentId}
            />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t px-5 py-3 flex items-center gap-2">
        {!isDone ? (
          <Button
            size="sm"
            className="text-xs"
            onClick={onComplete}
            disabled={completePending}
          >
            <CheckCircle2 className="size-3.5 mr-1.5" />
            Complete
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={onReopen}
            disabled={reopenPending}
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Reopen
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-xs" onClick={onEdit}>
          <Pencil className="size-3.5 mr-1.5" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => {
            copyText(buildTaskPrompt(task))
              .then(() => toast.success("Copied to clipboard"))
              .catch(() => toast.error("Failed to copy"));
          }}
        >
          <Copy className="size-3.5 mr-1.5" />
          Copy to prompt
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:text-destructive ml-auto"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Self-contained controller — fetches the task by id and owns its own
// mutations, so it can be mounted anywhere (Tasks route, a Claude terminal
// widget's attach button, ...) with just a task id.
// ---------------------------------------------------------------------------

export function TaskDetailDialogController({
  taskId,
  onOpenChange,
}: {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [editingTask, setEditingTask] = useState<TaskSchema | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cache = useTaskCacheHelpers();

  const { data: task } = useQuery({
    ...getTaskV1TasksTaskIdGetOptions({
      client,
      path: { task_id: taskId ?? "" },
    }),
    enabled: taskId != null,
  });

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "done",
        completed_at: new Date(),
      }));
      onOpenChange(false);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "todo",
        completed_at: null,
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({ ...t, ...body }) as TaskSchema);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const deleteMutation = useMutation({
    ...deleteTaskV1TasksTaskIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.removeTask(path.task_id);
      setConfirmDelete(false);
      onOpenChange(false);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const deleteAttachmentMutation = useMutation({
    ...deleteTaskAttachmentV1TasksTaskIdAttachmentsAttachmentIdDeleteMutation({
      client,
    }),
    onMutate: async ({ path }) => {
      setDeletingAttachmentId(path.attachment_id);
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        attachments: (t.attachments ?? []).filter(
          (a) => a.id !== path.attachment_id,
        ),
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Failed to remove attachment");
    },
    onSettled: () => {
      setDeletingAttachmentId(null);
      cache.invalidateAll();
    },
  });

  return (
    <>
      <Dialog open={taskId != null && !!task} onOpenChange={onOpenChange}>
        {task && (
          <TaskDetailDialog
            task={task}
            onComplete={() =>
              completeMutation.mutate({ client, path: { task_id: task.id } })
            }
            onReopen={() =>
              reopenMutation.mutate({ client, path: { task_id: task.id } })
            }
            onDelete={() => setConfirmDelete(true)}
            onEdit={() => {
              setEditingTask(task);
              onOpenChange(false);
            }}
            onStatusChange={(s) =>
              updateMutation.mutate({
                client,
                path: { task_id: task.id },
                body: { status: s as "todo" },
              })
            }
            onPriorityChange={(p) =>
              updateMutation.mutate({
                client,
                path: { task_id: task.id },
                body: { priority: p },
              })
            }
            onDeleteAttachment={(attachmentId) => {
              deleteAttachmentMutation.mutate({
                client,
                path: { task_id: task.id, attachment_id: attachmentId },
              });
              // Strip the now-dangling marker out of the description too,
              // so a re-paste at the same spot doesn't read as a duplicate.
              const target = task.attachments?.find(
                (a) => a.id === attachmentId,
              );
              const cleaned = target
                ? removeMarker(
                    task.description ?? "",
                    attachmentId,
                    target.filename,
                  )
                : task.description;
              if (cleaned !== task.description) {
                updateMutation.mutate({
                  client,
                  path: { task_id: task.id },
                  body: { description: cleaned || null },
                });
              }
            }}
            deletingAttachmentId={deletingAttachmentId}
            completePending={completeMutation.isPending}
            reopenPending={reopenMutation.isPending}
          />
        )}
      </Dialog>

      <TaskFormDialog
        key={editingTask?.id}
        task={editingTask ?? undefined}
        open={editingTask != null}
        onOpenChange={(open) => !open && setEditingTask(null)}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task?"
        description={
          <>
            &ldquo;{task?.title}&rdquo; will be permanently removed. This
            can&rsquo;t be undone.
          </>
        }
        onConfirm={() =>
          task && deleteMutation.mutate({ client, path: { task_id: task.id } })
        }
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
