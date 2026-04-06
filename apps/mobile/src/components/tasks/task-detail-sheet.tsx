import { View, Text } from "react-native";
import { Circle, CheckCircle2, Flag, Calendar, Repeat, X, Pencil } from "lucide-react-native";
import { Button } from "@/components/shared/button";
import type { TaskSchema } from "@metron/client";
import { BottomSheet } from "@/components/shared/sheet";
import { formatDueDate, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "./lib";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();
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
                <Repeat size={15} color={theme.colors.subtext} />
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
          <Button flex variant="primary" onPress={() => { onEdit(task); onClose(); }} icon={<Pencil size={16} color={theme.colors.monochrome} />}>Edit</Button>
          {isDone ? (
            <Button flex variant="primary" onPress={() => { onReopen(task); onClose(); }} icon={<Circle size={16} color={theme.colors.monochrome} />}>Reopen</Button>
          ) : (
            <Button flex variant="primary" onPress={() => { onComplete(task); onClose(); }} icon={<CheckCircle2 size={16} color={theme.colors.monochrome} />}>Complete</Button>
          )}
          <Button flex variant="destructive" onPress={() => { onDelete(task); onClose(); }} icon={<X size={16} color={theme.colors.error} />}>Delete</Button>
        </View>
      </View>
    </BottomSheet>
  );
}
