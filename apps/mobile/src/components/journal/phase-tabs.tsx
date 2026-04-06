import { View, Text, Pressable } from "react-native";

export type Phase = "morning" | "capture" | "audit";

export function PhaseTabs({
  active,
  onChange,
}: {
  active: Phase;
  onChange: (phase: Phase) => void;
}) {
  const tabs: { key: Phase; label: string }[] = [
    { key: "morning", label: "Plan" },
    { key: "capture", label: "Capture" },
    { key: "audit", label: "Reflect" },
  ];

  return (
    <View className="flex-row mx-4 mb-3 gap-2">
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          className={`rounded-full px-4 py-1.5 ${active === tab.key ? "bg-foreground" : "bg-zinc-800"}`}
        >
          <Text
            className={`font-medium ${active === tab.key ? "text-primary-foreground" : "text-muted-foreground"}`}
            style={{ fontSize: 14 }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
