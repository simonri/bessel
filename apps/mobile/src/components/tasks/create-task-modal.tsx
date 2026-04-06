import { useState } from "react";
import { View, Text, Pressable, Modal, ActionSheetIOS, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createTaskV1TasksPostMutation, listTasksV1TasksGetQueryKey, listAreasV1TasksAreasGetOptions } from "@metron/client";
import { Flag, X, Check } from "lucide-react-native";
import { Input } from "@/components/shared/input";
import { client } from "@/lib/client";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "./lib";
import { useTheme } from "@/design-system";

export function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [area, setArea] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const queryClient = useQueryClient();

  const { data: areasData } = useQuery({ ...listAreasV1TasksAreasGetOptions({ client }) });
  const areas = (areasData as string[]) ?? [];

  const createMutation = useMutation({
    ...createTaskV1TasksPostMutation({ client }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: listTasksV1TasksGetQueryKey({ client }) }); onClose(); },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate({ client, body: { title: title.trim(), priority, area: area || undefined, project: project.trim() || undefined } });
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

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-[#171717]">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} className="flex-1">
          <SafeAreaView className="flex-1 px-5 pt-5">
            <View className="flex-row items-center justify-between mb-6">
              <Pressable onPress={onClose} className="w-9 h-9 items-center justify-center rounded-full bg-zinc-700">
                <X size={18} color={theme.colors.subtext} />
              </Pressable>
              <Text className="text-foreground text-lg font-bold">New Task</Text>
              <Pressable
                onPress={handleCreate}
                disabled={!title.trim() || createMutation.isPending}
                className={`w-9 h-9 items-center justify-center rounded-full ${title.trim() ? "bg-foreground" : "bg-zinc-700"}`}
              >
                <Check size={18} color={title.trim() ? theme.colors.monochrome : theme.colors.subtext} />
              </Pressable>
            </View>

            <Input placeholder="What needs to be done?" value={title} onChangeText={setTitle} autoFocus className="mb-6" style={{ fontSize: 20, fontWeight: "500" }} multiline returnKeyType="default" />

            <View className="rounded-xl bg-zinc-800 overflow-hidden">
              <Pressable onPress={handlePriorityPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
                <View className="flex-row items-center gap-2.5">
                  <Flag size={16} color={PRIORITY_COLORS[priority]} fill={priority >= 3 ? PRIORITY_COLORS[priority] : "transparent"} />
                  <Text className="text-foreground text-sm">Priority</Text>
                </View>
                <Text className="text-muted-foreground text-sm">{PRIORITY_LABELS[priority]}</Text>
              </Pressable>
              <Pressable onPress={handleAreaPress} className="flex-row items-center justify-between px-4 py-3.5 border-b border-zinc-700">
                <Text className="text-foreground text-sm">Area</Text>
                <Text className="text-muted-foreground text-sm">{area ?? "None"}</Text>
              </Pressable>
              <View className="flex-row items-center justify-between px-4 py-3.5">
                <Text className="text-foreground text-sm">Project</Text>
                <Input placeholder="None" value={project} onChangeText={setProject} style={{ color: theme.colors.subtext, fontSize: 14, minWidth: 80, textAlign: "right" }} />
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
