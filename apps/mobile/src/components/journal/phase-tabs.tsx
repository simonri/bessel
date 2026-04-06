import { View, Pressable } from "react-native";
import { Text } from "@/components/shared/text";
import { useTheme } from "@/design-system";

export type Phase = "morning" | "capture" | "audit";

export function PhaseTabs({
  active,
  onChange,
}: {
  active: Phase;
  onChange: (phase: Phase) => void;
}) {
  const theme = useTheme();

  const tabs: { key: Phase; label: string }[] = [
    { key: "morning", label: "Plan" },
    { key: "capture", label: "Capture" },
    { key: "audit", label: "Reflect" },
  ];

  return (
    <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={{
            borderRadius: 9999,
            paddingHorizontal: 16,
            paddingVertical: 6,
            backgroundColor: active === tab.key ? theme.colors.text : theme.colors.surfaceRaised,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter-Medium",
              fontSize: 14,
              color: active === tab.key ? theme.colors.background : theme.colors.textMuted,
            }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
