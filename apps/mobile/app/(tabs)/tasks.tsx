import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Input } from "@/components/input";
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
  Pencil,
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
          <CheckCircle2 size={24} color="#22c55e" fill="#22c55e" />
        ) : (
          <Circle
            size={24}
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
              <Text style={{ color: due.color }} className="text-sm">
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
                <Text style={{ color: PRIORITY_COLORS[priority] }} className="text-sm font-medium">
                  {PRIORITY_LABELS[priority]}
                </Text>
              )}
            </View>
          )}
          {task.project && (
            <View className="rounded-full bg-secondary px-1.5 py-0.5">
              <Text className="text-muted-foreground text-xs">{task.project}</Text>
            </View>
          )}
          {task.area && (
            <Text className="text-muted-foreground text-xs">{task.area}</Text>
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
  onEdit,
}: {
  task: TaskSchema;
  onClose: () => void;
  onComplete: (task: TaskSchema) => void;
  onReopen: (task: TaskSchema) => void;
  onDelete: (task: TaskSchema) => void;
  onEdit: (task: TaskSchema) => void;
}) {
  const isDone = task.status === "done" || task.status === "cancelled";
  const due = formatDueDate(task.due_date);
  const priority = task.priority ?? 0;

  const recurrenceLabel = task.is_recurring && task.rrule_frequency
    ? `Every ${(task.rrule_interval ?? 1) > 1 ? `${task.rrule_interval} ` : ""}${task.rrule_frequency}`
    : null;

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        {/* Title */}
        <Text className="text-foreground text-2xl font-bold mb-1">
          {task.title}
        </Text>

        {/* Subtitle metadata */}
        <View className="flex-row items-center gap-2 mb-5 flex-wrap">
          {/* Status dot + label */}
          <View className="flex-row items-center gap-1.5">
            <View className={`w-2.5 h-2.5 rounded-full ${
              task.status === "done" ? "bg-green-500" :
              task.status === "in_progress" ? "bg-blue-500" :
              task.status === "cancelled" ? "bg-red-500" : "bg-zinc-500"
            }`} />
            <Text className="text-muted-foreground" style={{ fontSize: 15 }}>
              {STATUS_LABELS[task.status ?? "todo"]}
            </Text>
          </View>
          {priority >= 1 && (
            <>
              <Text className="text-zinc-600">·</Text>
              <View className="flex-row items-center gap-1">
                <Flag size={13} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                <Text style={{ color: PRIORITY_COLORS[priority], fontSize: 15 }}>
                  {PRIORITY_LABELS[priority]}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Properties card */}
        <View className="rounded-xl bg-zinc-800/60 overflow-hidden mb-4">
          {due.label ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700/50">
              <Text className="text-muted-foreground" style={{ fontSize: 15 }}>Due</Text>
              <View className="flex-row items-center gap-1.5">
                <Calendar size={15} color={due.color} />
                <Text style={{ color: due.color, fontSize: 15 }}>{due.label}</Text>
              </View>
            </View>
          ) : null}

          {recurrenceLabel ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700/50">
              <Text className="text-muted-foreground" style={{ fontSize: 15 }}>Recurrence</Text>
              <View className="flex-row items-center gap-1.5">
                <Repeat size={15} color="#a1a1aa" />
                <Text className="text-foreground capitalize" style={{ fontSize: 15 }}>{recurrenceLabel}</Text>
              </View>
            </View>
          ) : null}

          {task.project ? (
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700/50">
              <Text className="text-muted-foreground" style={{ fontSize: 15 }}>Project</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{task.project}</Text>
            </View>
          ) : null}

          {task.area ? (
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <Text className="text-muted-foreground" style={{ fontSize: 15 }}>Area</Text>
              <Text className="text-foreground" style={{ fontSize: 15 }}>{task.area}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {task.description ? (
          <View className="mb-4 bg-zinc-800/60 rounded-xl px-4 py-3.5">
            <Text className="text-zinc-300 leading-relaxed" style={{ fontSize: 15 }}>
              {task.description}
            </Text>
          </View>
        ) : null}

        {/* Tags */}
        {task.tags && task.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {task.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-800 px-3 py-1.5">
                <Text className="text-zinc-300" style={{ fontSize: 13 }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Actions */}
        <View className="flex-row items-center gap-2 mt-1 mb-6">
          <Pressable
            onPress={() => { onEdit(task); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
          >
            <Pencil size={16} color="#fafafa" />
            <Text className="font-medium text-foreground" style={{ fontSize: 15 }}>Edit</Text>
          </Pressable>

          {isDone ? (
            <Pressable
              onPress={() => { onReopen(task); onClose(); }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
            >
              <Circle size={16} color="#fafafa" />
              <Text className="font-medium text-foreground" style={{ fontSize: 15 }}>Reopen</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { onComplete(task); onClose(); }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5"
            >
              <CheckCircle2 size={16} color="#fff" />
              <Text className="font-medium text-white" style={{ fontSize: 15 }}>Complete</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => { onDelete(task); onClose(); }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5"
          >
            <X size={16} color="#ef4444" />
            <Text className="font-medium text-red-500" style={{ fontSize: 15 }}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Edit Task Modal
// ---------------------------------------------------------------------------

function EditTaskModal({
  task,
  onClose,
}: {
  task: TaskSchema;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority ?? 0);
  const [area, setArea] = useState<string | null>(task.area ?? null);
  const [project, setProject] = useState(task.project ?? "");
  const [status, setStatus] = useState(task.status ?? "todo");
  const queryClient = useQueryClient();
  const queryKey = listTasksV1TasksGetQueryKey({ client });

  const { data: areasData } = useQuery({
    ...listAreasV1TasksAreasGetOptions({ client }),
  } as any);
  const areas = (areasData as string[]) ?? [];

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  const handleSave = () => {
    if (!title.trim()) return;
    updateMutation.mutate({
      client,
      path: { task_id: task.id },
      body: {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        area: area || null,
        project: project.trim() || null,
        status: status as any,
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

  const handleStatusPress = () => {
    const options = ["To Do", "In Progress", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 2, title: "Status" },
      (index) => {
        if (index === 0) setStatus("todo");
        else if (index === 1) setStatus("in_progress");
      }
    );
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 pt-5">
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 mb-6">
              <Pressable onPress={onClose}>
                <Text className="text-primary" style={{ fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Text className="text-foreground text-lg font-bold">Edit Task</Text>
              <Pressable onPress={handleSave} disabled={!title.trim() || updateMutation.isPending}>
                <Text
                  className={`font-semibold ${title.trim() ? "text-primary" : "text-muted-foreground"}`}
                  style={{ fontSize: 15 }}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Input
                value={title}
                onChangeText={setTitle}
                placeholder="Task title"
                autoFocus
                className="mb-6"
                style={{ fontSize: 20, fontWeight: "500" }}
                multiline
              />

              {/* Description */}
              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Description</Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Add details..."
                multiline
                className="bg-zinc-800 rounded-xl px-4 py-3 mb-5"
                style={{ fontSize: 15, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
              />

              {/* Properties */}
              <View className="rounded-xl bg-zinc-800 overflow-hidden mb-5">
                <Pressable
                  onPress={handleStatusPress}
                  className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700"
                >
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Status</Text>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>
                    {STATUS_LABELS[status] ?? "To Do"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handlePriorityPress}
                  className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700"
                >
                  <View className="flex-row items-center gap-2.5">
                    <Flag size={16} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                    <Text className="text-foreground" style={{ fontSize: 15 }}>Priority</Text>
                  </View>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{PRIORITY_LABELS[priority]}</Text>
                </Pressable>

                <Pressable
                  onPress={handleAreaPress}
                  className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700"
                >
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Area</Text>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{area ?? "None"}</Text>
                </Pressable>

                <View className="flex-row items-center justify-between px-4 py-3.5">
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Project</Text>
                  <Input
                    placeholder="None"
                        value={project}
                    onChangeText={setProject}
                    style={{ color: "#a1a1aa", fontSize: 15, minWidth: 80, textAlign: "right" }}
                  />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <SafeAreaView className="flex-1 px-5 pt-5">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <View className="w-9" />
              <Text className="text-foreground text-lg font-bold">New Task</Text>
              <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-zinc-700">
                <X size={16} color="#a1a1aa" />
              </Pressable>
            </View>

            {/* Title input */}
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChangeText={setTitle}
              autoFocus
              className="mb-6"
              style={{ fontSize: 20, fontWeight: "500" }}
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
                <Input
                  placeholder="None"
                    value={project}
                  onChangeText={setProject}
                  style={{ color: "#a1a1aa", fontSize: 14, minWidth: 80, textAlign: "right" }}
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
  const [editingTask, setEditingTask] = useState<TaskSchema | null>(null);
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
    onError: (_err: any, _vars: any, context: any) => {
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
          onEdit={setEditingTask}
        />
      )}

      {/* Edit task modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Create task sheet */}
      {showCreate && (
        <CreateTaskSheet onClose={() => setShowCreate(false)} />
      )}
    </View>
  );
}
