import { View, Text, Pressable } from "react-native";

export type FilterTab = "active" | "done";

export function FilterTabs({
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
        className={`rounded-full px-3.5 py-1.5 ${active === "active" ? "bg-foreground" : "bg-secondary"}`}
      >
        <Text className={`text-sm font-medium ${active === "active" ? "text-primary-foreground" : "text-muted-foreground"}`}>
          Active{activeCount > 0 ? ` · ${activeCount}` : ""}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("done")}
        className={`rounded-full px-3.5 py-1.5 ${active === "done" ? "bg-foreground" : "bg-secondary"}`}
      >
        <Text className={`text-sm font-medium ${active === "done" ? "text-primary-foreground" : "text-muted-foreground"}`}>
          Done{doneCount > 0 ? ` · ${doneCount}` : ""}
        </Text>
      </Pressable>
    </View>
  );
}
