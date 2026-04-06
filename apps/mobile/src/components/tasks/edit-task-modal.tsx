import { useState } from "react";
import { View, Pressable, Modal, ScrollView, ActionSheetIOS, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/shared/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTaskV1TasksTaskIdPatchMutation, listTasksV1TasksGetQueryKey, listAreasV1TasksAreasGetOptions } from "@metron/client";
import type { TaskSchema } from "@metron/client";
import { Flag, X, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "./lib";
import { useTheme } from "@/design-system";

export function EditTaskModal({ task, onClose }: { task: TaskSchema; onClose: () => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority ?? 0);
  const [area, setArea] = useState<string | null>(task.area ?? null);
  const [project, setProject] = useState(task.project ?? "");
  const [status, setStatus] = useState(task.status ?? "todo");
  const queryClient = useQueryClient();
  const queryKey = listTasksV1TasksGetQueryKey({ client });

  const { data: areasData } = useQuery({ ...listAreasV1TasksAreasGetOptions({ client }) });
  const areas = (areasData as string[]) ?? [];

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey }); onClose(); },
  });

  const handleSave = () => {
    if (!title.trim()) return;
    updateMutation.mutate({
      client,
      path: { task_id: task.id },
      body: { title: title.trim(), description: description.trim() || null, priority, area: area || null, project: project.trim() || null, status: status as any },
    });
  };

  const handlePriorityPress = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["None", "Low", "Medium", "High", "Urgent", "Cancel"], cancelButtonIndex: 5, title: "Priority" },
      (i) => { if (i < 5) setPriority(i); }
    );
  };

  const handleAreaPress = () => {
    const allAreas = [...new Set(["Personal", "Company", "Travel", ...areas])];
    const options = ["None", ...allAreas, "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, title: "Area" },
      (i) => { if (i === 0) setArea(null); else if (i < options.length - 1) setArea(options[i]); }
    );
  };

  const handleStatusPress = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["To Do", "In Progress", "Cancel"], cancelButtonIndex: 2, title: "Status" },
      (i) => { if (i === 0) setStatus("todo"); else if (i === 1) setStatus("in_progress"); }
    );
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.card }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, paddingTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 24 }}>
              <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: theme.colors.surfaceHover }}>
                <X size={18} color={theme.colors.subtext} />
              </Pressable>
              <Text variant="title" color="text">Edit Task</Text>
              <Pressable
                onPress={handleSave}
                disabled={!title.trim() || updateMutation.isPending}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: title.trim() ? theme.colors.text : theme.colors.surfaceHover,
                }}
              >
                <Check size={18} color={title.trim() ? theme.colors.monochrome : theme.colors.subtext} />
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
              <Input value={title} onChangeText={setTitle} placeholder="Task title" autoFocus style={{ marginBottom: 24, fontSize: 20, fontWeight: "500" }} multiline />

              <Text variant="caption" color="subtext" style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Description</Text>
              <Input value={description} onChangeText={setDescription} placeholder="Add details..." multiline style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, fontSize: 15, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />

              <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden", marginBottom: 20 }}>
                <Pressable onPress={handleStatusPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                  <Text variant="label" color="text">Status</Text>
                  <Text variant="label" color="subtext">{STATUS_LABELS[status] ?? "To Do"}</Text>
                </Pressable>
                <Pressable onPress={handlePriorityPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Flag size={16} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                    <Text variant="label" color="text">Priority</Text>
                  </View>
                  <Text variant="label" color="subtext">{PRIORITY_LABELS[priority]}</Text>
                </Pressable>
                <Pressable onPress={handleAreaPress} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                  <Text variant="label" color="text">Area</Text>
                  <Text variant="label" color="subtext">{area ?? "None"}</Text>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Text variant="label" color="text">Project</Text>
                  <Input placeholder="None" value={project} onChangeText={setProject} style={{ color: theme.colors.subtext, fontSize: 15, minWidth: 80, textAlign: "right" }} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
