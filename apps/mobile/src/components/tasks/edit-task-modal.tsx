// @ts-nocheck — query-core version mismatch
import { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActionSheetIOS, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTaskV1TasksTaskIdPatchMutation, listTasksV1TasksGetQueryKey, listAreasV1TasksAreasGetOptions } from "@metron/client";
import type { TaskSchema } from "@metron/client";
import { Flag, X, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from "./lib";

export function EditTaskModal({ task, onClose }: { task: TaskSchema; onClose: () => void }) {
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
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} className="flex-1">
          <SafeAreaView className="flex-1 pt-5">
            <View className="flex-row items-center justify-between px-5 mb-6">
              <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-zinc-700">
                <X size={18} color="#a1a1aa" />
              </Pressable>
              <Text className="text-foreground text-lg font-bold">Edit Task</Text>
              <Pressable
                onPress={handleSave}
                disabled={!title.trim() || updateMutation.isPending}
                className={`w-9 h-9 items-center justify-center rounded-full ${title.trim() ? "bg-foreground" : "bg-zinc-700"}`}
              >
                <Check size={18} color={title.trim() ? "#09090b" : "#71717a"} />
              </Pressable>
            </View>

            <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
              <Input value={title} onChangeText={setTitle} placeholder="Task title" autoFocus className="mb-6" style={{ fontSize: 20, fontWeight: "500" }} multiline />

              <Text className="text-muted-foreground text-xs uppercase tracking-wider mb-2">Description</Text>
              <Input value={description} onChangeText={setDescription} placeholder="Add details..." multiline className="bg-zinc-800 rounded-xl px-4 py-3 mb-5" style={{ fontSize: 15, minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />

              <View className="rounded-xl bg-zinc-800 overflow-hidden mb-5">
                <Pressable onPress={handleStatusPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Status</Text>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{STATUS_LABELS[status] ?? "To Do"}</Text>
                </Pressable>
                <Pressable onPress={handlePriorityPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
                  <View className="flex-row items-center gap-2.5">
                    <Flag size={16} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                    <Text className="text-foreground" style={{ fontSize: 15 }}>Priority</Text>
                  </View>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{PRIORITY_LABELS[priority]}</Text>
                </Pressable>
                <Pressable onPress={handleAreaPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Area</Text>
                  <Text className="text-muted-foreground" style={{ fontSize: 15 }}>{area ?? "None"}</Text>
                </Pressable>
                <View className="flex-row items-center justify-between px-4 py-3.5">
                  <Text className="text-foreground" style={{ fontSize: 15 }}>Project</Text>
                  <Input placeholder="None" value={project} onChangeText={setProject} style={{ color: "#a1a1aa", fontSize: 15, minWidth: 80, textAlign: "right" }} />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
