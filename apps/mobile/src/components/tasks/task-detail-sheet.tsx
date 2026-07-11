import { View } from "react-native";
import { Text } from "@/components/shared/text";
import { Circle, CheckCircle2, Flag, Calendar, Repeat, X, Pencil } from "lucide-react-native";
import { Button } from "@/components/shared/button";
import type { TaskSchema } from "@bessel/client";
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

  const statusDotColor =
    task.status === "done" ? theme.colors.success :
    task.status === "in_progress" ? theme.colors.link :
    task.status === "cancelled" ? theme.colors.error : theme.colors.textFaint;

  return (
    <BottomSheet onDismiss={onClose}>
      <View>
        <Text variant="headingSmall" color="text" style={{ marginBottom: 4 }}>{task.title}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: statusDotColor }} />
            <Text variant="label" color="subtext">{STATUS_LABELS[task.status ?? "todo"]}</Text>
          </View>
          {priority >= 1 && (
            <>
              <Text variant="label" style={{ color: theme.colors.textMuted }}>·</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Flag size={13} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                <Text variant="label" style={{ color: PRIORITY_COLORS[priority] }}>{PRIORITY_LABELS[priority]}</Text>
              </View>
            </>
          )}
        </View>

        <View style={{ borderRadius: 12, backgroundColor: theme.colors.overlay12, overflow: "hidden", marginBottom: 16 }}>
          {due.label ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.surfaceHover }}>
              <Text variant="label" color="subtext">Due</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Calendar size={15} color={due.color} />
                <Text variant="label" style={{ color: due.color }}>{due.label}</Text>
              </View>
            </View>
          ) : null}
          {recurrenceLabel ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.surfaceHover }}>
              <Text variant="label" color="subtext">Recurrence</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Repeat size={15} color={theme.colors.subtext} />
                <Text variant="label" color="text" style={{ textTransform: "capitalize" }}>{recurrenceLabel}</Text>
              </View>
            </View>
          ) : null}
          {task.project ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.surfaceHover }}>
              <Text variant="label" color="subtext">Project</Text>
              <Text variant="label" color="text">{task.project}</Text>
            </View>
          ) : null}
          {task.area ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text variant="label" color="subtext">Area</Text>
              <Text variant="label" color="text">{task.area}</Text>
            </View>
          ) : null}
        </View>

        {task.description ? (
          <View style={{ marginBottom: 16, backgroundColor: theme.colors.overlay12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text variant="label" style={{ color: theme.colors.text, lineHeight: 22 }}>{task.description}</Text>
          </View>
        ) : null}

        {task.tags && task.tags.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {task.tags.map((tag) => (
              <View key={tag} style={{ borderRadius: 9999, backgroundColor: theme.colors.surfaceRaised, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text variant="caption" style={{ color: theme.colors.text }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Button flex variant="filled" onPress={() => { onEdit(task); onClose(); }} icon={<Pencil size={16} color={theme.colors.monochrome} />}>Edit</Button>
          {isDone ? (
            <Button flex variant="filled" onPress={() => { onReopen(task); onClose(); }} icon={<Circle size={16} color={theme.colors.monochrome} />}>Reopen</Button>
          ) : (
            <Button flex variant="filled" onPress={() => { onComplete(task); onClose(); }} icon={<CheckCircle2 size={16} color={theme.colors.monochrome} />}>Complete</Button>
          )}
          <Button flex variant="destructive" onPress={() => { onDelete(task); onClose(); }} icon={<X size={16} color={theme.colors.error} />}>Delete</Button>
        </View>
      </View>
    </BottomSheet>
  );
}
