import { View, Text, Pressable } from "react-native";
import { Circle, CheckCircle2, Flag, Calendar, Repeat, X, Pencil } from "lucide-react-native";
import type { TaskSchema } from "@metron/client";
import { BottomSheet } from "@/components/shared/sheet";
import { formatDueDate, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "./lib";

export function TaskDetailSheet({
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
        <Text className="text-foreground text-2xl font-bold mb-1">{task.title}</Text>

        <View className="flex-row items-center gap-2 mb-5 flex-wrap">
          <View className="flex-row items-center gap-1.5">
            <View className={`w-2.5 h-2.5 rounded-full ${
              task.status === "done" ? "bg-green-500" :
              task.status === "in_progress" ? "bg-blue-500" :
              task.status === "cancelled" ? "bg-red-500" : "bg-zinc-500"
            }`} />
            <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{STATUS_LABELS[task.status ?? "todo"]}</Text>
          </View>
          {priority >= 1 && (
            <>
              <Text className="text-zinc-600">·</Text>
              <View className="flex-row items-center gap-1">
                <Flag size={13} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                <Text style={{ color: PRIORITY_COLORS[priority], fontSize: 15 }}>{PRIORITY_LABELS[priority]}</Text>
              </View>
            </>
          )}
        </View>

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

        {task.description ? (
          <View className="mb-4 bg-zinc-800/60 rounded-xl px-4 py-3.5">
            <Text className="text-zinc-300 leading-relaxed" style={{ fontSize: 15 }}>{task.description}</Text>
          </View>
        ) : null}

        {task.tags && task.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {task.tags.map((tag) => (
              <View key={tag} className="rounded-full bg-zinc-800 px-3 py-1.5">
                <Text className="text-zinc-300" style={{ fontSize: 13 }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center gap-2 mt-1">
          <Pressable onPress={() => { onEdit(task); onClose(); }} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5">
            <Pencil size={16} color="#fafafa" />
            <Text className="font-medium text-foreground" style={{ fontSize: 15 }}>Edit</Text>
          </Pressable>
          {isDone ? (
            <Pressable onPress={() => { onReopen(task); onClose(); }} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5">
              <Circle size={16} color="#fafafa" />
              <Text className="font-medium text-foreground" style={{ fontSize: 15 }}>Reopen</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => { onComplete(task); onClose(); }} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5">
              <CheckCircle2 size={16} color="#fff" />
              <Text className="font-medium text-white" style={{ fontSize: 15 }}>Complete</Text>
            </Pressable>
          )}
          <Pressable onPress={() => { onDelete(task); onClose(); }} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-zinc-800 py-3.5">
            <X size={16} color="#ef4444" />
            <Text className="font-medium text-red-500" style={{ fontSize: 15 }}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
