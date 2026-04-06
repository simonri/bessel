import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { useTheme } from "@/design-system";

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
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 8, gap: 8 }}>
      <Pressable
        onPress={() => onChange("active")}
        style={{
          borderRadius: 9999,
          paddingHorizontal: 14,
          paddingVertical: 6,
          backgroundColor: active === "active" ? theme.colors.text : theme.colors.surfaceRaised,
        }}
      >
        <Text variant="body" color={active === "active" ? "monochrome" : "subtext"}>
          Active{activeCount > 0 ? ` · ${activeCount}` : ""}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("done")}
        style={{
          borderRadius: 9999,
          paddingHorizontal: 14,
          paddingVertical: 6,
          backgroundColor: active === "done" ? theme.colors.text : theme.colors.surfaceRaised,
        }}
      >
        <Text variant="body" color={active === "done" ? "monochrome" : "subtext"}>
          Done{doneCount > 0 ? ` · ${doneCount}` : ""}
        </Text>
      </Pressable>
    </View>
  );
}
