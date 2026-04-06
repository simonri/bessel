import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { Circle, CheckCircle2, Flag, Calendar, Repeat, ChevronRight } from "lucide-react-native";
import type { TaskSchema } from "@metron/client";
import { formatDueDate, PRIORITY_COLORS, PRIORITY_LABELS } from "./lib";
import { useTheme } from "@/design-system";

export function TaskRow({
  task,
  onPress,
  onToggle,
}: {
  task: TaskSchema;
  onPress: (task: TaskSchema) => void;
  onToggle: (task: TaskSchema) => void;
}) {
  const theme = useTheme();
  const isDone = task.status === "done" || task.status === "cancelled";
  const due = formatDueDate(task.due_date);
  const priority = task.priority ?? 0;

  return (
    <Pressable
      onPress={() => onPress(task)}
      style={{ marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}
    >
      <Pressable onPress={() => onToggle(task)} hitSlop={8}>
        {isDone ? (
          <CheckCircle2 size={24} color={theme.colors.success} fill={theme.colors.success} />
        ) : (
          <Circle size={24} color={priority >= 3 ? PRIORITY_COLORS[priority] : theme.colors.surfaceHover} />
        )}
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="bodyEmphasis"
          color={isDone ? "subtext" : "text"}
          style={isDone ? { textDecorationLine: "line-through" } : undefined}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          {due.label ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Calendar size={11} color={due.color} />
              <Text variant="label" style={{ color: due.color }}>{due.label}</Text>
            </View>
          ) : null}
          {task.is_recurring && <Repeat size={11} color={theme.colors.textMuted} />}
          {priority >= 1 && !isDone && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Flag size={11} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
              {priority >= 3 && (
                <Text variant="body" style={{ color: PRIORITY_COLORS[priority] }}>{PRIORITY_LABELS[priority]}</Text>
              )}
            </View>
          )}
          {task.project && (
            <View style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text variant="caption" color="subtext">{task.project}</Text>
            </View>
          )}
          {task.area && <Text variant="caption" color="subtext">{task.area}</Text>}
        </View>
      </View>

      <ChevronRight size={16} color={theme.colors.surfaceHover} />
    </Pressable>
  );
}
