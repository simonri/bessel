import {
  getTaskV1TasksTaskIdGetQueryKey,
  listTasksV1TasksGetQueryKey,
  type TaskSchema,
} from "@bessel/client";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { mutationFamily, settleWhenIdle } from "@/lib/optimistic";

type TaskListPage = {
  items: TaskSchema[];
  pagination: { total_count: number; [k: string]: unknown };
};

export const taskMutationOptions = mutationFamily("tasks");
export const TASK_MUTATION_KEY = taskMutationOptions.mutationKey;

/** What completing, reopening or undoing a completion changes optimistically. */
export const STATUS_FIELDS: readonly (keyof TaskSchema)[] = [
  "status",
  "completed_at",
];

/** `previous`'s values for `fields`, to undo one mutation's optimistic change
 *  without clobbering what other in-flight mutations did to the same task. */
export function pickFields(
  previous: TaskSchema,
  fields: readonly (keyof TaskSchema)[],
): Partial<TaskSchema> {
  const picked: Partial<TaskSchema> = {};
  for (const field of fields)
    (picked as Record<string, unknown>)[field] = previous[field];
  return picked;
}

// Every task mutation (complete/reopen/update/delete) needs to keep two cache
// families in sync: the paginated/filtered list queries (tasks.tsx) and the
// single-task detail query (used by the attach-to-widget button). Centralized
// here so every call site invalidates both instead of silently drifting.
export function useTaskCacheHelpers() {
  const queryClient = useQueryClient();
  const listKey = listTasksV1TasksGetQueryKey({ client });
  // The detail query key includes `path.task_id`; stripping it gives a broad
  // key that partial-matches every cached task's detail query at once.
  const [{ path: _path, ...detailKeyBroad }] = getTaskV1TasksTaskIdGetQueryKey({
    client,
    path: { task_id: "" },
  });
  const detailFamilyKey = [detailKeyBroad];

  const detailKey = (taskId: string) =>
    getTaskV1TasksTaskIdGetQueryKey({ client, path: { task_id: taskId } });

  const patchTask = (
    taskId: string,
    updater: (task: TaskSchema) => TaskSchema,
  ) => {
    queryClient.setQueriesData(
      { queryKey: listKey },
      (old: TaskListPage | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t) => (t.id === taskId ? updater(t) : t)),
        };
      },
    );
    queryClient.setQueryData(
      detailKey(taskId),
      (old: TaskSchema | undefined) => (old ? updater(old) : old),
    );
  };

  /** Stops in-flight fetches of lists and details from overwriting an optimistic change. */
  const cancel = async () => {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: listKey }),
      queryClient.cancelQueries({ queryKey: detailFamilyKey }),
    ]);
  };

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: detailFamilyKey });
  };

  return {
    cancel,
    /** Cancels in-flight task fetches and returns the task as currently cached. */
    async cancelAndGet(taskId: string): Promise<TaskSchema | undefined> {
      await cancel();
      const detail = queryClient.getQueryData<TaskSchema>(detailKey(taskId));
      if (detail) return detail;
      for (const [, page] of queryClient.getQueriesData<TaskListPage>({
        queryKey: listKey,
      })) {
        const task = page?.items?.find((t) => t.id === taskId);
        if (task) return task;
      }
      return undefined;
    },
    /** Puts back `fields` of the task as it was before a failed mutation. */
    restoreFields(
      taskId: string,
      previous: TaskSchema | undefined,
      fields: readonly (keyof TaskSchema)[],
    ) {
      if (!previous) return;
      const restored = pickFields(previous, fields);
      patchTask(taskId, (t) => ({ ...t, ...restored }));
    },
    patchTask,
    removeTask(taskId: string) {
      queryClient.setQueriesData(
        { queryKey: listKey },
        (old: TaskListPage | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((t) => t.id !== taskId),
            pagination: {
              ...old.pagination,
              total_count: old.pagination.total_count - 1,
            },
          };
        },
      );
      queryClient.removeQueries({ queryKey: detailKey(taskId) });
    },
    invalidateAll,
    /** onSettled for task mutations; see settleWhenIdle. */
    settle() {
      settleWhenIdle(queryClient, TASK_MUTATION_KEY, invalidateAll);
    },
  };
}
