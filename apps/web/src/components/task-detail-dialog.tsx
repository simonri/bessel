import type { TaskSchema, TaskUpdate } from "@bessel/client";
import {
  completeTaskMutation,
  deleteTaskAttachmentMutation,
  deleteTaskMutation,
  getTaskOptions,
  listProjectsOptions,
  reopenTaskMutation,
  updateTaskMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@bessel/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  DescriptionWithAttachments,
  removeMarker,
  useImagePaste,
} from "@/components/task-attachments";
import {
  DuePicker,
  PriorityPicker,
  ProjectPicker,
  PropertyRow,
  RepeatPicker,
  StatusPicker,
  TagsEditor,
  type TaskStatusValue,
} from "@/components/tasks/task-properties";
import {
  STATUS_FIELDS,
  taskMutationOptions,
  useTaskCacheHelpers,
} from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { buildTaskPrompt, copyText, isDoneStatus } from "@/lib/task-format";

const SAVE_KEYS =
  typeof window !== "undefined" && window.electron?.platform === "darwin"
    ? "⌘↵"
    : "Ctrl+Enter";

const EDITOR =
  "w-full resize-none rounded-md bg-transparent outline-none field-sizing-content placeholder:text-white/30";

/** The title, edited in place: Enter or leaving the field saves, Escape puts it back, an empty one is refused. */
function TitleField({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Read on unmount, which can take the field away (closing the modal) before it loses focus.
  const latest = useRef({ editing, draft, saved: title });
  latest.current.editing = editing;
  latest.current.draft = draft;

  useEffect(() => {
    if (!latest.current.editing) setDraft(title);
    latest.current.saved = title;
  }, [title]);

  const commit = () => {
    const next = latest.current.draft.trim();
    latest.current.editing = false;
    setEditing(false);
    if (next && next !== latest.current.saved) {
      latest.current.saved = next;
      onSave(next);
    } else {
      setDraft(latest.current.saved);
    }
  };
  useEffect(() => () => void (latest.current.editing && commit()), []);

  return (
    <DialogTitle className="pr-8 type-heading leading-snug break-words">
      {editing ? (
        <textarea
          // biome-ignore lint/a11y/noAutofocus: opened by the user's click on the title
          autoFocus
          aria-label="Title"
          rows={1}
          value={draft}
          onFocus={(e) =>
            e.currentTarget.setSelectionRange(draft.length, draft.length)
          }
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              latest.current.editing = false;
              setDraft(latest.current.saved);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className={`${EDITOR} -mx-1 px-1 focus:bg-white/[0.04]`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit title"
          className="-mx-1 w-[calc(100%+0.5rem)] cursor-text rounded-md px-1 text-left transition-colors hover:bg-white/[0.04]"
        >
          {title}
        </button>
      )}
    </DialogTitle>
  );
}

/** The description, read with clickable links and inline images, edited in place with images pasted straight in. */
function DescriptionField({
  task,
  onSave,
  onDeleteAttachment,
  deletingAttachmentId,
}: {
  task: TaskSchema;
  onSave: (description: string | null) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  deletingAttachmentId: string | null;
}) {
  const saved = task.description ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ editing, draft, saved });
  latest.current.editing = editing;

  useEffect(() => {
    if (!latest.current.editing) {
      setDraft(saved);
      latest.current.draft = saved;
    }
    latest.current.saved = saved;
  }, [saved]);

  const setText = (update: (text: string) => string) => {
    latest.current.draft = update(latest.current.draft);
    setDraft(latest.current.draft);
  };
  const paste = useImagePaste({
    taskId: task.id,
    textareaRef,
    getText: () => latest.current.draft,
    setText,
  });

  const commit = async () => {
    latest.current.editing = false;
    setEditing(false);
    await paste.settled();
    const next = latest.current.draft.trim();
    if (next !== latest.current.saved.trim()) {
      latest.current.saved = next;
      onSave(next || null);
    }
  };
  const cancel = () => {
    latest.current.editing = false;
    setText(() => latest.current.saved);
    setEditing(false);
  };
  useEffect(() => () => void (latest.current.editing && commit()), []);

  const hasContent = saved.trim() !== "" || (task.attachments?.length ?? 0) > 0;

  if (editing) {
    return (
      <div>
        <textarea
          ref={textareaRef}
          // biome-ignore lint/a11y/noAutofocus: opened by the user's click on the description
          autoFocus
          aria-label="Description"
          value={draft}
          onChange={(e) => setText(() => e.target.value)}
          onPaste={paste.onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          onBlur={() => void commit()}
          placeholder="Add details, links or paste an image…"
          className={`${EDITOR} min-h-32 -mx-2 px-2 py-1.5 text-13 leading-relaxed text-white/80 focus:bg-white/[0.04]`}
        />
        <p className="mt-1.5 text-11 text-white/35">
          {paste.uploading
            ? "Attaching image…"
            : `${SAVE_KEYS} to save, Esc to cancel`}
        </p>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-2 flex w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left text-13 text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/55"
      >
        Add a description…
      </button>
    );
  }

  return (
    <div className="group relative">
      <div
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a, button")) return;
          if (window.getSelection()?.toString()) return;
          setEditing(true);
        }}
        className="-mx-2 cursor-text rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.03] [&_p]:text-white/75"
      >
        <DescriptionWithAttachments
          description={saved}
          attachments={task.attachments ?? []}
          onDeleteAttachment={onDeleteAttachment}
          deletingAttachmentId={deletingAttachmentId}
        />
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Edit description"
        className="absolute -top-7 right-0 flex h-6 items-center gap-1 rounded-md px-1.5 text-11 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/75"
      >
        <Pencil className="size-3" />
        Edit
      </button>
    </div>
  );
}

function Timestamps({ task }: { task: TaskSchema }) {
  const rows: [string, string][] = [
    ["Created", format(new Date(task.created_at), "d MMM yyyy")],
  ];
  if (task.modified_at)
    rows.push([
      "Updated",
      Date.now() - new Date(task.modified_at).getTime() < 60_000
        ? "Just now"
        : formatDistanceToNow(new Date(task.modified_at), { addSuffix: true }),
    ]);
  if (task.completed_at && isDoneStatus(task.status))
    rows.push([
      "Completed",
      format(new Date(task.completed_at), "d MMM yyyy, HH:mm"),
    ]);
  return (
    <dl className="space-y-1 border-t border-white/[0.08] pt-3 text-12">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-white/35">{label}</dt>
          <dd className="truncate text-white/55">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TaskDetailDialog({
  task,
  projects,
  onUpdate,
  onStatusChange,
  onComplete,
  onReopen,
  onDelete,
  onDeleteAttachment,
  deletingAttachmentId,
  completePending,
  reopenPending,
}: {
  task: TaskSchema;
  projects: string[];
  onUpdate: (body: TaskUpdate) => void;
  onStatusChange: (status: TaskStatusValue) => void;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onDeleteAttachment: (attachmentId: string) => void;
  deletingAttachmentId: string | null;
  completePending: boolean;
  reopenPending: boolean;
}) {
  const status = task.status ?? "todo";
  const isDone = isDoneStatus(status);

  return (
    <DialogContent
      className="gap-0 p-0 sm:max-w-3xl"
      // Opening shows the task; editing starts only on a click.
      onOpenAutoFocus={(e) => e.preventDefault()}
      // Escape in a field leaves the field (its own handler puts the text back) instead of closing the task.
      onEscapeKeyDown={(e) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches("input, textarea"))
          e.preventDefault();
      }}
    >
      <DialogDescription className="sr-only">Task details</DialogDescription>
      <div className="flex flex-col md:min-h-[24rem] md:flex-row">
        <div className="min-w-0 flex-1 space-y-6 px-5 pt-5 pb-6 md:px-7 md:pt-6">
          <TitleField
            title={task.title}
            onSave={(title) => onUpdate({ title })}
          />
          <section className="relative">
            <h3 className="mb-1.5 text-12 text-white/40">Description</h3>
            <DescriptionField
              task={task}
              onSave={(description) => onUpdate({ description })}
              onDeleteAttachment={onDeleteAttachment}
              deletingAttachmentId={deletingAttachmentId}
            />
          </section>
        </div>

        <aside
          aria-label="Properties"
          className="space-y-3 border-t border-white/[0.08] bg-white/[0.015] px-5 py-4 md:w-64 md:shrink-0 md:border-t-0 md:border-l md:px-5 md:pt-14 md:pb-6"
        >
          <PropertyRow label="Status">
            <StatusPicker status={status} onChange={onStatusChange} />
          </PropertyRow>
          <PropertyRow label="Priority">
            <PriorityPicker
              priority={task.priority ?? 0}
              onChange={(priority) => onUpdate({ priority })}
            />
          </PropertyRow>
          <PropertyRow label="Due">
            <DuePicker
              due={task.due_date}
              onChange={(due_date) => onUpdate({ due_date })}
            />
          </PropertyRow>
          <PropertyRow label="Repeats">
            <RepeatPicker task={task} onChange={onUpdate} />
          </PropertyRow>
          <PropertyRow label="Project">
            <ProjectPicker
              project={task.project}
              projects={projects}
              onChange={(project) => onUpdate({ project })}
            />
          </PropertyRow>
          <PropertyRow label="Tags">
            <TagsEditor
              tags={task.tags ?? []}
              onChange={(tags) => onUpdate({ tags })}
            />
          </PropertyRow>
          <Timestamps task={task} />
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] px-5 py-3">
        {!isDone ? (
          <Button
            size="sm"
            className="text-12"
            onClick={onComplete}
            disabled={completePending}
          >
            <CheckCircle2 className="mr-1.5 size-3.5" />
            Complete
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-12"
            onClick={onReopen}
            disabled={reopenPending}
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            Reopen
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-12"
          onClick={() => {
            copyText(buildTaskPrompt(task))
              .then(() => toast.success("Copied to clipboard"))
              .catch(() => toast.error("Couldn't copy"));
          }}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy to prompt
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-12 text-white/50 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-1.5 size-3.5" />
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cache = useTaskCacheHelpers();

  const { data: task } = useQuery({
    ...getTaskOptions({
      client,
      path: { task_id: taskId ?? "" },
    }),
    enabled: taskId != null,
  });
  const { data: projectsData } = useQuery({
    ...listProjectsOptions({ client }),
    enabled: taskId != null,
  });
  const projects = (projectsData ?? []).map((p) => p.name);

  const completeMutation = useMutation({
    ...completeTaskMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "done",
        completed_at: new Date(),
      }));
      onOpenChange(false);
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error("Action failed");
    },
    onSettled: () => cache.settle(),
  });

  const reopenMutation = useMutation({
    ...reopenTaskMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "todo",
        completed_at: null,
      }));
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error("Action failed");
    },
    onSettled: () => cache.settle(),
  });

  const updateMutation = useMutation({
    ...updateTaskMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path, body }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({ ...t, ...body }) as TaskSchema);
      return { previous };
    },
    onError: (_err, { path, body }, context) => {
      cache.restoreFields(
        path.task_id,
        context?.previous,
        Object.keys(body) as (keyof TaskSchema)[],
      );
      toast.error("Couldn't save the change");
    },
    onSettled: () => cache.settle(),
  });

  // A failed delete brings the task back with the refetch in settle().
  const deleteMutation = useMutation({
    ...deleteTaskMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      await cache.cancel();
      cache.removeTask(path.task_id);
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: () => toast.error("Action failed"),
    onSettled: () => cache.settle(),
  });

  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const deleteAttachmentMutation = useMutation({
    ...deleteTaskAttachmentMutation({
      client,
    }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      setDeletingAttachmentId(path.attachment_id);
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        attachments: (t.attachments ?? []).filter(
          (a) => a.id !== path.attachment_id,
        ),
      }));
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, ["attachments"]);
      toast.error("Failed to remove attachment");
    },
    onSettled: () => {
      setDeletingAttachmentId(null);
      cache.settle();
    },
  });

  const update = (body: TaskUpdate) =>
    task && updateMutation.mutate({ client, path: { task_id: task.id }, body });
  const complete = () =>
    task && completeMutation.mutate({ client, path: { task_id: task.id } });
  const reopen = () =>
    task && reopenMutation.mutate({ client, path: { task_id: task.id } });

  // Done goes through complete, which also adds a routine's next occurrence; a done task is reopened before it
  // moves to another open status.
  const changeStatus = (next: TaskStatusValue) => {
    if (!task) return;
    if (next === "done") return complete();
    if (next === "cancelled") return update({ status: next });
    if (isDoneStatus(task.status)) {
      reopen();
      if (next !== "todo") update({ status: next });
      return;
    }
    update({ status: next });
  };

  return (
    <>
      <Dialog open={taskId != null && !!task} onOpenChange={onOpenChange}>
        {task && (
          <TaskDetailDialog
            task={task}
            projects={projects}
            onUpdate={update}
            onStatusChange={changeStatus}
            onComplete={complete}
            onReopen={reopen}
            onDelete={() => setConfirmDelete(true)}
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
                update({ description: cleaned || null });
              }
            }}
            deletingAttachmentId={deletingAttachmentId}
            completePending={completeMutation.isPending}
            reopenPending={reopenMutation.isPending}
          />
        )}
      </Dialog>

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
