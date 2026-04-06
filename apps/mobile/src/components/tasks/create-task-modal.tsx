import { useState } from "react";
import { View, Pressable, Modal, ActionSheetIOS, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/shared/text";
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
      <View style={{ flex: 1, backgroundColor: theme.colors.card }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <Pressable onPress={onClose} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: theme.colors.surfaceHover }}>
                <X size={18} color={theme.colors.subtext} />
              </Pressable>
              <Text variant="title" color="text">New Task</Text>
              <Pressable
                onPress={handleCreate}
                disabled={!title.trim() || createMutation.isPending}
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

            <Input placeholder="What needs to be done?" value={title} onChangeText={setTitle} autoFocus style={{ marginBottom: 24, fontSize: 20, fontWeight: "500" }} multiline returnKeyType="default" />

            <View style={{ borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }}>
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
                <Input placeholder="None" value={project} onChangeText={setProject} style={{ color: theme.colors.subtext, fontSize: 14, minWidth: 80, textAlign: "right" }} />
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
