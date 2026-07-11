import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  getTaskV1TasksTaskIdGetQueryKey,
  listTasksV1TasksGetQueryKey,
  type TaskSchema,
} from "@bessel/client";
import { client } from "@/lib/client";

type TaskListPage = { items: TaskSchema[]; pagination: { total_count: number; [k: string]: unknown } };

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

  const detailKey = (taskId: string) => getTaskV1TasksTaskIdGetQueryKey({ client, path: { task_id: taskId } });

  return {
    async cancelAndSnapshot() {
      await queryClient.cancelQueries({ queryKey: listKey });
      return queryClient.getQueriesData({ queryKey: listKey });
    },
    rollback(previous?: [QueryKey, unknown][]) {
      if (!previous) return;
      for (const [key, data] of previous) queryClient.setQueryData(key, data);
    },
    patchTask(taskId: string, updater: (task: TaskSchema) => TaskSchema) {
      queryClient.setQueriesData({ queryKey: listKey }, (old: TaskListPage | undefined) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((t) => (t.id === taskId ? updater(t) : t)) };
      });
      queryClient.setQueryData(detailKey(taskId), (old: TaskSchema | undefined) => (old ? updater(old) : old));
    },
    removeTask(taskId: string) {
      queryClient.setQueriesData({ queryKey: listKey }, (old: TaskListPage | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((t) => t.id !== taskId),
          pagination: { ...old.pagination, total_count: old.pagination.total_count - 1 },
        };
      });
      queryClient.removeQueries({ queryKey: detailKey(taskId) });
    },
    invalidateAll() {
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: [detailKeyBroad] });
    },
  };
}
