import { View, Text, Pressable } from "react-native";
import { Circle, CheckCircle2, Flag, Calendar, Repeat, ChevronRight } from "lucide-react-native";
import type { TaskSchema } from "@metron/client";
import { formatDueDate, PRIORITY_COLORS, PRIORITY_LABELS } from "./lib";

export function TaskRow({
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
      className="mb-1 flex-row items-center gap-3 rounded-xl px-4 py-3.5 active:bg-zinc-800"
    >
      <Pressable onPress={() => onToggle(task)} hitSlop={8}>
        {isDone ? (
          <CheckCircle2 size={24} color="#22c55e" fill="#22c55e" />
        ) : (
          <Circle size={24} color={priority >= 3 ? PRIORITY_COLORS[priority] : "#3f3f46"} />
        )}
      </Pressable>

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
              <Text style={{ color: due.color }} className="text-sm">{due.label}</Text>
            </View>
          ) : null}
          {task.is_recurring && <Repeat size={11} color="#a1a1aa" />}
          {priority >= 1 && !isDone && (
            <View className="flex-row items-center gap-0.5">
              <Flag size={11} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
              {priority >= 3 && (
                <Text style={{ color: PRIORITY_COLORS[priority] }} className="text-sm font-medium">{PRIORITY_LABELS[priority]}</Text>
              )}
            </View>
          )}
          {task.project && (
            <View className="rounded-full bg-secondary px-1.5 py-0.5">
              <Text className="text-muted-foreground text-xs">{task.project}</Text>
            </View>
          )}
          {task.area && <Text className="text-muted-foreground text-xs">{task.area}</Text>}
        </View>
      </View>

      <ChevronRight size={16} color="#3f3f46" />
    </Pressable>
  );
}
