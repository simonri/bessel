import {
  completeTaskV1TasksTaskIdCompletePostMutation,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  type TaskSchema,
  undoCompleteTaskV1TasksTaskIdUndoCompletePostMutation,
  updateTaskV1TasksTaskIdPatchMutation,
} from "@bessel/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  STATUS_FIELDS,
  taskMutationOptions,
  useTaskCacheHelpers,
} from "@/hooks/use-task-cache";
import { client } from "@/lib/client";

/**
 * Completing, reopening and starting a task, applied to every cached list
 * at once so each view shows the change before the server confirms it.
 */
export function useTaskStatusActions() {
  const cache = useTaskCacheHelpers();

  const statusMutation = <TVars extends { path: { task_id: string } }>(
    patch: Partial<TaskSchema>,
    failure: string,
  ) => ({
    ...taskMutationOptions,
    onMutate: async ({ path }: TVars) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({ ...t, ...patch }));
      return { previous };
    },
    onError: (
      _err: unknown,
      { path }: TVars,
      context: { previous?: TaskSchema } | undefined,
    ) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error(failure);
    },
    onSettled: () => cache.settle(),
  });

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    ...statusMutation(
      { status: "done", completed_at: new Date() },
      "Action failed",
    ),
  });
  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    ...statusMutation({ status: "todo", completed_at: null }, "Action failed"),
  });
  // Unlike reopen, also removes the next occurrence completing a repeating
  // task spawned.
  const undoCompleteMutation = useMutation({
    ...undoCompleteTaskV1TasksTaskIdUndoCompletePostMutation({ client }),
    ...statusMutation({ status: "todo", completed_at: null }, "Couldn't undo"),
  });
  const startMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    ...statusMutation({ status: "in_progress" }, "Couldn't start the task"),
  });

  return {
    complete: (task: TaskSchema) =>
      completeMutation.mutate(
        { client, path: { task_id: task.id } },
        {
          onSuccess: () =>
            toast(`“${task.title}” done`, {
              action: {
                label: "Undo",
                onClick: () =>
                  undoCompleteMutation.mutate({
                    client,
                    path: { task_id: task.id },
                  }),
              },
            }),
        },
      ),
    reopen: (task: TaskSchema) =>
      reopenMutation.mutate({ client, path: { task_id: task.id } }),
    start: (task: TaskSchema) =>
      startMutation.mutate({
        client,
        path: { task_id: task.id },
        body: { status: "in_progress" },
      }),
  };
}
