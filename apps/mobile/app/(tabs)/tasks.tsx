import { useCallback, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasksV1TasksGetInfiniteOptions,
  listTasksV1TasksGetQueryKey,
  completeTaskV1TasksTaskIdCompletePostMutation,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  deleteTaskV1TasksTaskIdDeleteMutation,
} from "@metron/client";
import type { TaskSchema } from "@metron/client";
import { Plus, ListTodo } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import { client } from "@/lib/client";
import { useTheme } from "@/design-system";

import { TaskRow } from "@/components/tasks/task-row";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { EditTaskModal } from "@/components/tasks/edit-task-modal";
import { CreateTaskModal } from "@/components/tasks/create-task-modal";
import { FilterTabs, type FilterTab } from "@/components/tasks/filter-tabs";
import { PAGE_SIZE } from "@/components/tasks/lib";

export default function TasksScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queryKey = listTasksV1TasksGetQueryKey({ client });
  const [selectedTask, setSelectedTask] = useState<TaskSchema | null>(null);
  const [editingTask, setEditingTask] = useState<TaskSchema | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("active");
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;

  const pageParams = (lastPage: any, _all: any, lastParam: any) => {
    const page = typeof lastParam === "number" ? lastParam : 1;
    return page >= lastPage.pagination.max_page ? undefined : page + 1;
  };

  const { data: activeData, isLoading: activeLoading, fetchNextPage: fetchActiveNext, hasNextPage: hasActiveNext, isFetchingNextPage: isFetchingActiveNext } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({ client, query: { limit: PAGE_SIZE, sorting: ["-priority" as any, "due_date" as any], status: "todo" as any } }),
    initialPageParam: 1, getNextPageParam: pageParams,
  });

  const { data: inProgressData } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({ client, query: { limit: PAGE_SIZE, sorting: ["-priority" as any, "due_date" as any], status: "in_progress" as any } }),
    initialPageParam: 1, getNextPageParam: pageParams,
  });

  const { data: doneData, isLoading: doneLoading, fetchNextPage: fetchDoneNext, hasNextPage: hasDoneNext, isFetchingNextPage: isFetchingDoneNext } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({ client, query: { limit: PAGE_SIZE, sorting: ["-completed_at" as any], status: "done" as any } }),
    initialPageParam: 1, getNextPageParam: pageParams,
  });

  const inProgressTasks = inProgressData?.pages.flatMap((p) => p.items) ?? [];
  const todoTasks = activeData?.pages.flatMap((p) => p.items) ?? [];
  const activeTasks = [...inProgressTasks, ...todoTasks];
  const activeCount = (activeData?.pages[0]?.pagination.total_count ?? 0) + (inProgressData?.pages[0]?.pagination.total_count ?? 0);
  const doneTasks = doneData?.pages.flatMap((p) => p.items) ?? [];
  const doneCount = doneData?.pages[0]?.pagination.total_count ?? 0;

  const completeMutation = useMutation({ ...completeTaskV1TasksTaskIdCompletePostMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey }); } });
  const reopenMutation = useMutation({ ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }), onSettled: () => { void queryClient.invalidateQueries({ queryKey }); } });
  const deleteMutation = useMutation({
    ...deleteTaskV1TasksTaskIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((page: any) => ({ ...page, items: page.items.filter((t: any) => t.id !== path.task_id) })) };
      });
      return { previous };
    },
    onError: (_err: any, _vars: any, context: any) => {
      if (context?.previous) for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey }); },
  });

  const handleToggle = (task: TaskSchema) => {
    (task.status === "done" || task.status === "cancelled")
      ? reopenMutation.mutate({ client, path: { task_id: task.id } })
      : completeMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleDelete = (task: TaskSchema) => {
    Alert.alert("Delete task?", `"${task.title}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ client, path: { task_id: task.id } }) },
    ]);
  };

  const isLoading = filter === "active" ? activeLoading : doneLoading;
  const tasks = filter === "active" ? activeTasks : doneTasks;
  const fetchNext = filter === "active" ? fetchActiveNext : fetchDoneNext;
  const hasNext = filter === "active" ? hasActiveNext : hasDoneNext;
  const isFetchingNext = filter === "active" ? isFetchingActiveNext : isFetchingDoneNext;

  return (
    <View className="flex-1 bg-background">
      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={theme.colors.subtext} /></View>
      ) : (
        <FlashList
          data={tasks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View style={{ paddingTop: headerHeight + 8 }}><FilterTabs active={filter} onChange={setFilter} activeCount={activeCount} doneCount={doneCount} /></View>}
          renderItem={({ item }) => <TaskRow task={item} onPress={setSelectedTask} onToggle={handleToggle} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          onEndReached={() => { if (hasNext && !isFetchingNext) fetchNext(); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View className="items-center justify-center px-8 pt-20">
              <ListTodo size={40} color={theme.colors.border} />
              <Text className="text-foreground font-semibold text-lg mt-3">{filter === "active" ? "All clear" : "No completed tasks"}</Text>
              <Text className="text-muted-foreground text-sm text-center mt-1">{filter === "active" ? "You have no active tasks. Tap + to create one." : "Tasks you complete will appear here."}</Text>
            </View>
          }
          ListFooterComponent={isFetchingNext ? <View className="py-4 items-center"><ActivityIndicator color={theme.colors.subtext} /></View> : null}
        />
      )}

      <View pointerEvents="box-none" className="absolute top-0 left-0 right-0" style={{ height: headerHeight + 10 }}>
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient pointerEvents="none" colors={[theme.colors.monochrome, "transparent"]} style={{ height: 10 }} />
      </View>

      <View className="absolute top-0 left-0 right-0 px-4 flex-row items-start justify-between" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-3xl font-bold text-foreground">Tasks</Text>
        <Pressable onPress={() => setShowCreate(true)} className="items-center justify-center rounded-full w-9 h-9 bg-foreground mt-0.5">
          <Plus size={18} color={theme.colors.monochrome} />
        </Pressable>
      </View>

      {selectedTask && <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} onComplete={(t) => completeMutation.mutate({ client, path: { task_id: t.id } })} onReopen={(t) => reopenMutation.mutate({ client, path: { task_id: t.id } })} onDelete={handleDelete} onEdit={(t) => { setSelectedTask(null); setEditingTask(t); }} />}
      {editingTask && <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </View>
  );
}
