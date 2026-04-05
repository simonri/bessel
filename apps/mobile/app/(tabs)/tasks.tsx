import { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { BottomSheet } from "@/components/sheet";
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listTasksV1TasksGetInfiniteOptions,
  listTasksV1TasksGetQueryKey,
  createTaskV1TasksPostMutation,
  completeTaskV1TasksTaskIdCompletePostMutation,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  deleteTaskV1TasksTaskIdDeleteMutation,
  updateTaskV1TasksTaskIdPatchMutation,
  listAreasV1TasksAreasGetOptions,
} from "@metron/client";
import type { TaskSchema } from "@metron/client";
import {
  Plus,
  Circle,
  CheckCircle2,
  Flag,
  Calendar,
  Repeat,
  ChevronRight,
  X,
  ListTodo,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { client } from "@/lib/client";

const PAGE_SIZE = 50;

const PRIORITY_COLORS: Record<number, string> = {
  0: "#71717a",
  1: "#3b82f6",
  2: "#eab308",
  3: "#f97316",
  4: "#ef4444",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

function formatDueDate(value: unknown): { label: string; color: string } {
  if (!value) return { label: "", color: "" };
  const d = value instanceof Date ? value : new Date(value as string);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diff < 0) return { label: diff === -1 ? "Yesterday" : `${-diff}d overdue`, color: "#ef4444" };
  if (diff === 0) return { label: "Today", color: "#f97316" };
  if (diff === 1) return { label: "Tomorrow", color: "#fafafa" };
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    color: "#a1a1aa",
  };
}

// ---------------------------------------------------------------------------
// Task Row
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  onPress,
  onToggle,
}: {
  task: TaskSchema;
  onPress: (task: TaskSchema) => void;
  onToggle: (task: TaskSchema) => void;
}) {
  const isDone = task.status === "done" || task.status === "cancelled";
  const due = formatDueDate(task.due_date);
  const priority = task.priority ?? 0;

  return (
    <Pressable
      onPress={() => onPress(task)}
      className="mx-4 mb-1 flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-zinc-800"
    >
      {/* Completion circle */}
      <Pressable onPress={() => onToggle(task)} hitSlop={8}>
        {isDone ? (
          <CheckCircle2 size={22} color="#22c55e" fill="#22c55e" />
        ) : (
          <Circle
            size={22}
            color={priority >= 3 ? PRIORITY_COLORS[priority] : "#3f3f46"}
          />
        )}
      </Pressable>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text
          className={`text-base font-medium ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5 flex-wrap">
          {due.label ? (
            <View className="flex-row items-center gap-1">
              <Calendar size={11} color={due.color} />
              <Text style={{ color: due.color }} className="text-xs">
                {due.label}
              </Text>
            </View>
          ) : null}
          {task.is_recurring && (
            <Repeat size={11} color="#a1a1aa" />
          )}
          {priority >= 1 && !isDone && (
            <View className="flex-row items-center gap-0.5">
              <Flag size={11} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
              {priority >= 3 && (
                <Text style={{ color: PRIORITY_COLORS[priority] }} className="text-xs font-medium">
                  {PRIORITY_LABELS[priority]}
                </Text>
              )}
            </View>
          )}
          {task.project && (
            <View className="rounded-full bg-secondary px-1.5 py-0.5">
              <Text className="text-[10px] text-muted-foreground">{task.project}</Text>
            </View>
          )}
          {task.area && (
            <Text className="text-[10px] text-muted-foreground">{task.area}</Text>
          )}
        </View>
      </View>

      <ChevronRight size={16} color="#3f3f46" />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Task Detail Sheet
// ---------------------------------------------------------------------------

function TaskDetailSheet({
  task,
  onClose,
  onComplete,
  onReopen,
  onDelete,
  onUpdate,
}: {
  task: TaskSchema;
  onClose: () => void;
  onComplete: (task: TaskSchema) => void;
  onReopen: (task: TaskSchema) => void;
  onDelete: (task: TaskSchema) => void;
  onUpdate: (task: TaskSchema, body: Record<string, any>) => void;
}) {
  const isDone = task.status === "done" || task.status === "cancelled";
  const due = formatDueDate(task.due_date);
  const priority = task.priority ?? 0;

  const handleStatusPress = () => {
    if (isDone) return;
    const newStatus = task.status === "todo" ? "in_progress" : "todo";
    onUpdate(task, { status: newStatus });
  };

  const handlePriorityPress = () => {
    const options = ["None", "Low", "Medium", "High", "Urgent", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 5, title: "Priority" },
      (index) => {
        if (index < 5) onUpdate(task, { priority: index });
      }
    );
  };

  const recurrenceLabel = task.is_recurring && task.rrule_frequency
    ? `Every ${(task.rrule_interval ?? 1) > 1 ? `${task.rrule_interval} ` : ""}${task.rrule_frequency}`
    : null;

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        {/* Title */}
        <Text className="text-foreground text-xl font-bold mb-4">
          {task.title}
        </Text>

        {/* Properties */}
        <View className="rounded-xl bg-zinc-800 overflow-hidden mb-4">
          {/* Status */}
          <Pressable onPress={handleStatusPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
            <Text className="text-muted-foreground text-sm">Status</Text>
            <View className="flex-row items-center gap-1.5">
              <View className={`w-2 h-2 rounded-full ${
                task.status === "done" ? "bg-green-500" :
                task.status === "in_progress" ? "bg-blue-500" :
                task.status === "cancelled" ? "bg-red-500" : "bg-zinc-500"
              }`} />
              <Text className="text-foreground text-sm">
                {STATUS_LABELS[task.status ?? "todo"]}
              </Text>
            </View>
          </Pressable>

          {/* Priority */}
          <Pressable onPress={handlePriorityPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
            <Text className="text-muted-foreground text-sm">Priority</Text>
            <View className="flex-row items-center gap-1.5">
              <Flag size={14} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
              <Text className="text-foreground text-sm">{PRIORITY_LABELS[priority]}</Text>
            </View>
          </Pressable>

          {/* Due date */}
          {due.label && (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
              <Text className="text-muted-foreground text-sm">Due</Text>
              <View className="flex-row items-center gap-1.5">
                <Calendar size={14} color={due.color} />
                <Text style={{ color: due.color }} className="text-sm">{due.label}</Text>
              </View>
            </View>
          )}

          {/* Recurrence */}
          {recurrenceLabel && (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
              <Text className="text-muted-foreground text-sm">Recurrence</Text>
              <View className="flex-row items-center gap-1.5">
                <Repeat size={14} color="#a1a1aa" />
                <Text className="text-foreground text-sm capitalize">{recurrenceLabel}</Text>
              </View>
            </View>
          )}

          {/* Project */}
          {task.project && (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
              <Text className="text-muted-foreground text-sm">Project</Text>
              <Text className="text-foreground text-sm">{task.project}</Text>
            </View>
          )}

          {/* Area */}
          {task.area && (
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <Text className="text-muted-foreground text-sm">Area</Text>
              <Text className="text-foreground text-sm">{task.area}</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {task.description && (
            <View className="mt-2 pt-4 border-t border-zinc-700 mb-4">
              <Text className="text-muted-foreground text-sm leading-relaxed">
                {task.description}
              </Text>
            </View>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mb-4">
              {task.tags.map((tag) => (
                <View key={tag} className="rounded-full bg-zinc-700 px-2.5 py-1">
                  <Text className="text-xs text-zinc-300">{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          <View className="flex-row items-center gap-2 mt-2 mb-8">
            {isDone ? (
              <Pressable
                onPress={() => { onReopen(task); onClose(); }}
                className="flex-1 items-center rounded-xl bg-zinc-700 py-3"
              >
                <Text className="text-sm font-medium text-foreground">Reopen</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => { onComplete(task); onClose(); }}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-3"
              >
                <CheckCircle2 size={16} color="#fff" />
                <Text className="text-sm font-medium text-white">Complete</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => { onDelete(task); onClose(); }}
              className="items-center justify-center rounded-xl bg-zinc-700 w-12 h-12"
            >
              <X size={16} color="#ef4444" />
            </Pressable>
          </View>
        </View>
      </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Create Task Sheet
// ---------------------------------------------------------------------------

function CreateTaskSheet({
  onClose,
}: {
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [area, setArea] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const queryClient = useQueryClient();

  const { data: areasData } = useQuery({
    ...listAreasV1TasksAreasGetOptions({ client }),
  } as any);
  const areas = (areasData as string[]) ?? [];

  const createMutation = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
      onClose();
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate({
      client,
      body: {
        title: title.trim(),
        priority,
        area: area || undefined,
        project: project.trim() || undefined,
      },
    });
  };

  const handlePriorityPress = () => {
    const options = ["None", "Low", "Medium", "High", "Urgent", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 5, title: "Priority" },
      (index) => {
        if (index < 5) setPriority(index);
      }
    );
  };

  const handleAreaPress = () => {
    const presets = ["Personal", "Company", "Travel"];
    const allAreas = [...new Set([...presets, ...areas])];
    const options = ["None", ...allAreas, "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, title: "Area" },
      (index) => {
        if (index === 0) setArea(null);
        else if (index < options.length - 1) setArea(options[index]);
      }
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 px-5 pt-2">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="w-9" />
              <Text className="text-foreground text-lg font-bold">New Task</Text>
              <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-zinc-700">
                <X size={16} color="#a1a1aa" />
              </Pressable>
            </View>

            {/* Title input */}
            <TextInput
              placeholder="What needs to be done?"
              placeholderTextColor="#71717a"
              value={title}
              onChangeText={setTitle}
              autoFocus
              className="mb-6"
              style={{ color: "#fafafa", fontSize: 20, fontWeight: "500" }}
              multiline
              returnKeyType="default"
            />

            {/* Properties */}
            <View className="rounded-xl bg-zinc-800 overflow-hidden">
              <Pressable
                onPress={handlePriorityPress}
                className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700"
              >
                <View className="flex-row items-center gap-2.5">
                  <Flag size={16} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                  <Text className="text-foreground text-sm">Priority</Text>
                </View>
                <Text className="text-muted-foreground text-sm">{PRIORITY_LABELS[priority]}</Text>
              </Pressable>

              <Pressable
                onPress={handleAreaPress}
                className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700"
              >
                <Text className="text-foreground text-sm">Area</Text>
                <Text className="text-muted-foreground text-sm">{area ?? "None"}</Text>
              </Pressable>

              <View className="flex-row items-center justify-between px-4 py-3.5">
                <Text className="text-foreground text-sm">Project</Text>
                <TextInput
                  placeholder="None"
                  placeholderTextColor="#71717a"
                  value={project}
                  onChangeText={setProject}
                  style={{ color: "#a1a1aa", fontSize: 14, minWidth: 80, textAlign: "right", paddingVertical: 0 }}
                />
              </View>
            </View>

            <View className="flex-1" />

            {/* Create button */}
            <Pressable
              onPress={handleCreate}
              disabled={!title.trim() || createMutation.isPending}
              className={`rounded-xl py-3.5 items-center mb-4 ${
                title.trim() ? "bg-foreground" : "bg-zinc-800"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  title.trim() ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {createMutation.isPending ? "Creating..." : "Create Task"}
              </Text>
            </Pressable>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Filter Tabs
// ---------------------------------------------------------------------------

type FilterTab = "active" | "done";

function FilterTabs({
  active,
  onChange,
  activeCount,
  doneCount,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  activeCount: number;
  doneCount: number;
}) {
  return (
    <View className="flex-row mx-4 mb-2 gap-2">
      <Pressable
        onPress={() => onChange("active")}
        className={`rounded-full px-3.5 py-1.5 ${
          active === "active" ? "bg-foreground" : "bg-secondary"
        }`}
      >
        <Text
          className={`text-sm font-medium ${
            active === "active" ? "text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Active{activeCount > 0 ? ` · ${activeCount}` : ""}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("done")}
        className={`rounded-full px-3.5 py-1.5 ${
          active === "done" ? "bg-foreground" : "bg-secondary"
        }`}
      >
        <Text
          className={`text-sm font-medium ${
            active === "done" ? "text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Done{doneCount > 0 ? ` · ${doneCount}` : ""}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tasks Screen
// ---------------------------------------------------------------------------

export default function TasksScreen() {
  const queryClient = useQueryClient();
  const queryKey = listTasksV1TasksGetQueryKey({ client });
  const [selectedTask, setSelectedTask] = useState<TaskSchema | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("active");
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 70;

  // Active tasks
  const {
    data: activeData,
    isLoading: activeLoading,
    fetchNextPage: fetchActiveNext,
    hasNextPage: hasActiveNext,
    isFetchingNextPage: isFetchingActiveNext,
  } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["-priority" as any, "due_date" as any],
        status: "todo" as any,
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastParam) => {
      const page = typeof lastParam === "number" ? lastParam : 1;
      return page >= lastPage.pagination.max_page ? undefined : page + 1;
    },
  });

  // In-progress tasks
  const { data: inProgressData } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["-priority" as any, "due_date" as any],
        status: "in_progress" as any,
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastParam) => {
      const page = typeof lastParam === "number" ? lastParam : 1;
      return page >= lastPage.pagination.max_page ? undefined : page + 1;
    },
  });

  // Done tasks
  const {
    data: doneData,
    isLoading: doneLoading,
    fetchNextPage: fetchDoneNext,
    hasNextPage: hasDoneNext,
    isFetchingNextPage: isFetchingDoneNext,
  } = useInfiniteQuery({
    ...listTasksV1TasksGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["-completed_at" as any],
        status: "done" as any,
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _all, lastParam) => {
      const page = typeof lastParam === "number" ? lastParam : 1;
      return page >= lastPage.pagination.max_page ? undefined : page + 1;
    },
  });

  const inProgressTasks = inProgressData?.pages.flatMap((p) => p.items) ?? [];
  const todoTasks = activeData?.pages.flatMap((p) => p.items) ?? [];
  const activeTasks = [...inProgressTasks, ...todoTasks];
  const activeCount = (activeData?.pages[0]?.pagination.total_count ?? 0) +
    (inProgressData?.pages[0]?.pagination.total_count ?? 0);
  const doneTasks = doneData?.pages.flatMap((p) => p.items) ?? [];
  const doneCount = doneData?.pages[0]?.pagination.total_count ?? 0;

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    ...deleteTaskV1TasksTaskIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((t: any) => t.id !== path.task_id),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleToggle = (task: TaskSchema) => {
    const isDone = task.status === "done" || task.status === "cancelled";
    if (isDone) {
      reopenMutation.mutate({ client, path: { task_id: task.id } });
    } else {
      completeMutation.mutate({ client, path: { task_id: task.id } });
    }
  };

  const handleComplete = (task: TaskSchema) => {
    completeMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleReopen = (task: TaskSchema) => {
    reopenMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleDelete = (task: TaskSchema) => {
    Alert.alert("Delete task?", `"${task.title}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ client, path: { task_id: task.id } }),
      },
    ]);
  };

  const handleUpdate = (task: TaskSchema, body: Record<string, any>) => {
    updateMutation.mutate({ client, path: { task_id: task.id }, body });
  };

  const isLoading = filter === "active" ? activeLoading : doneLoading;
  const tasks = filter === "active" ? activeTasks : doneTasks;
  const fetchNext = filter === "active" ? fetchActiveNext : fetchDoneNext;
  const hasNext = filter === "active" ? hasActiveNext : hasDoneNext;
  const isFetchingNext = filter === "active" ? isFetchingActiveNext : isFetchingDoneNext;

  return (
    <View className="flex-1 bg-background">
      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#a1a1aa" />
        </View>
      ) : (
        <FlashList
          data={tasks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={{ paddingTop: headerHeight + 8 }}>
              <FilterTabs
                active={filter}
                onChange={setFilter}
                activeCount={activeCount}
                doneCount={doneCount}
              />
            </View>
          }
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              onPress={setSelectedTask}
              onToggle={handleToggle}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          onEndReached={() => {
            if (hasNext && !isFetchingNext) fetchNext();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View className="items-center justify-center px-8 pt-20">
              <ListTodo size={40} color="#27272a" />
              <Text className="text-foreground font-semibold text-lg mt-3">
                {filter === "active" ? "All clear" : "No completed tasks"}
              </Text>
              <Text className="text-muted-foreground text-sm text-center mt-1">
                {filter === "active"
                  ? "You have no active tasks. Tap + to create one."
                  : "Tasks you complete will appear here."}
              </Text>
            </View>
          }
          ListFooterComponent={
            isFetchingNext ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#a1a1aa" />
              </View>
            ) : null
          }
        />
      )}

      {/* Top header: solid bg + fade */}
      <View
        pointerEvents="box-none"
        className="absolute top-0 left-0 right-0"
        style={{ height: headerHeight + 10 }}
      >
        <View pointerEvents="none" className="bg-background" style={{ height: headerHeight }} />
        <LinearGradient
          pointerEvents="none"
          colors={["#09090b", "transparent"]}
          style={{ height: 10 }}
        />
      </View>

      {/* Header text + add button */}
      <View
        className="absolute top-0 left-0 right-0 px-4 flex-row items-start justify-between"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text className="text-3xl font-bold text-foreground">Tasks</Text>
        <Pressable
          onPress={() => setShowCreate(true)}
          className="items-center justify-center rounded-full w-9 h-9 bg-foreground mt-0.5"
        >
          <Plus size={18} color="#09090b" />
        </Pressable>
      </View>

      {/* Task detail sheet */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={handleComplete}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}


      {/* Create task sheet */}
      {showCreate && (
        <CreateTaskSheet onClose={() => setShowCreate(false)} />
      )}
    </View>
  );
}
